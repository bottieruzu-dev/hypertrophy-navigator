import { db } from '../db';
import { requireCloudOwner } from './cloudAccess';
import { validateRequest, validProfile, type MealRequest, type TargetSnapshot } from '../../engine/nutrition';
import { canonical, decodeWorkJob, validateWorkJob, shouldApplyWorkJob, workRecordMayReplace, type NutritionWorkJob } from '../../engine/nutritionWork';
import { shiftDate } from '../../engine/dates';

async function applyJobs(jobs: NutritionWorkJob[]): Promise<void> {
  for (const job of jobs) validateWorkJob(job);
  await db.transaction('rw', [db.nutritionWorkJobs, db.mealRequests, db.meals], async () => {
    for (const job of jobs) {
      const previous = await db.nutritionWorkJobs.get(job.id);
      if (!shouldApplyWorkJob(previous,job)) continue;
      const request = await db.mealRequests.get(job.id);
      if (request && canonical(request) !== canonical(job.request)) throw new Error('保存済みの依頼とクラウドの内容が異なります。');
      if (job.record) {
        const existing = await db.meals.get(job.id);
        if (existing && !(await db.nutritionWorkJobs.get(job.id))?.cloudSaved && canonical(existing) !== canonical(job.record)) {
          throw new Error('同じIDの端末記録が存在するため取り込みを停止しました。');
        }
        if (workRecordMayReplace(existing, job.record)) await db.meals.put(job.record);
      }
      await db.mealRequests.put(job.request);
      await db.nutritionWorkJobs.put(job);
    }
  });
}
export async function enqueueNutritionWork(request: MealRequest, targets: TargetSnapshot): Promise<boolean> {
  validateRequest(request);
  if (!validProfile(targets.profile) || targets.date !== request.date) throw new Error('目標を設定してください。');
  const job: NutritionWorkJob = { id: request.id, request, targets, status: 'pending', response: null, responseRevision: 0, version: 0, record: null, cloudSaved: false };
  await db.transaction('rw', [db.mealRequests, db.nutritionWorkJobs], async () => {
    if (await db.mealRequests.get(job.id)) throw new Error('新しい依頼IDで保存してください。');
    await db.mealRequests.add(request);
    await db.nutritionWorkJobs.add(job);
  });
  try { await uploadJob(job); return true; } catch { return false; }
}
async function uploadJob(job: NutritionWorkJob): Promise<void> {
  const { client } = await requireCloudOwner();
  const result = await client.rpc('hypertrophy_nutrition_enqueue', { p_request: job.request, p_targets: job.targets });
  if (result.error) throw new Error('計算依頼を送信できませんでした。ログインと栄養連携SQLの適用を確認してください。端末の依頼は保持しています。');
  await applyJobs([decodeWorkJob(result.data)]);
}
let syncTask: Promise<void> | undefined;
export function syncNutritionWork(date: string): Promise<void> {
  if (syncTask) return syncTask.then(() => syncNutritionWork(date));
  syncTask = (async () => {
    const { client } = await requireCloudOwner();
    const jobs = await db.nutritionWorkJobs.toArray();
    for (const job of jobs.filter(j => !j.cloudSaved)) await uploadJob(job);
    const result = await client.rpc('hypertrophy_nutrition_list', { p_from: shiftDate(date, -6), p_to: date });
    if (result.error || !Array.isArray(result.data)) throw new Error('計算結果を取得できませんでした。端末の記録は保持しています。');
    await applyJobs(result.data.map(decodeWorkJob));
  })().finally(() => { syncTask = undefined; });
  return syncTask;
}
export async function confirmNutritionWork(id: string, responseRevision: number): Promise<void> {
  const local = await db.nutritionWorkJobs.get(id);
  if (!local || local.status !== 'review' || local.responseRevision !== responseRevision) throw new Error('最新の下書きを確認し直してください。');
  validateWorkJob(local);
  const { client } = await requireCloudOwner();
  const result = await client.rpc('hypertrophy_nutrition_confirm', { p_id: id, p_response_revision: responseRevision });
  if (result.error) throw new Error('下書きが更新・取消済み、または置き換え対象が変更されています。更新して確認し直してください。');
  // A successful cloud confirmation is recoverable by sync even if local storage fails here.
  await syncNutritionWork(local.request.date);
}
export async function cancelNutritionWork(id: string): Promise<void> {
  const local = await db.nutritionWorkJobs.get(id);
  if (!local) return;
  if (!local.cloudSaved) {
    // Require online cancellation too: an earlier upload may have succeeded before its reply was lost.
    await uploadJob(local);
  }
  const { client } = await requireCloudOwner();
  const result = await client.rpc('hypertrophy_nutrition_cancel', { p_id: id });
  if (result.error) throw new Error('取消できませんでした。接続を確認して再実行してください。');
  await syncNutritionWork(local.request.date);
}
export async function voidNutritionWork(id: string, revision: number, voided: boolean): Promise<void> {
  const job = await db.nutritionWorkJobs.get(id);
  if (!job) throw new Error('対象の食事がありません。');
  const { client } = await requireCloudOwner();
  const result = await client.rpc('hypertrophy_nutrition_void', { p_id: id, p_revision: revision, p_voided: voided });
  if (result.error) throw new Error('記録が別画面で更新されています。再取得して確認してください。');
  await syncNutritionWork(job.request.date);
}

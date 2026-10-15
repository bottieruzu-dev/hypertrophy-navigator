import { NUTRIENTS, parseNutritionResponse, validateRequest, validProfile, type MealRequest, type NutritionResponse, type TargetSnapshot, type MealRecord } from './nutrition';

export type WorkState = 'pending' | 'review' | 'confirmed' | 'cancelled';
export interface NutritionWorkJob {
  id: string;
  request: MealRequest;
  targets: TargetSnapshot;
  status: WorkState;
  response: NutritionResponse | null;
  responseRevision: number;
  version: number;
  record: MealRecord | null;
  cloudSaved: boolean;
}
export function validateWorkJob(job: NutritionWorkJob): void {
  validateRequest(job.request);
  if (job.id !== job.request.id || !job.targets || job.targets.date !== job.request.date || !validProfile(job.targets.profile)
    || !['pending', 'review', 'confirmed', 'cancelled'].includes(job.status)
    || typeof job.cloudSaved !== 'boolean' || !Number.isSafeInteger(job.responseRevision) || job.responseRevision < 0 || !Number.isSafeInteger(job.version) || job.version < 0
    || (job.cloudSaved && job.version < 1)
    || !Number.isFinite(job.targets.weightKg) || job.targets.weightKg < 30 || job.targets.weightKg > 250 || !Number.isFinite(job.targets.estimatedTdee)
    || !job.targets.values || NUTRIENTS.some(n => !Number.isFinite(job.targets.values[n.key]) || job.targets.values[n.key] < 0)) throw new Error('計算依頼の形式が不正です。');
  if (job.response) parseNutritionResponse(JSON.stringify(job.response), job.request);
  if (job.response && job.responseRevision < 1) throw new Error('下書きの版が不正です。');
  if (['review', 'confirmed'].includes(job.status) && !job.response) throw new Error('計算結果がありません。');
  if (job.status === 'confirmed' && (!job.record || job.record.id !== job.id || job.record.request.id !== job.id
    || !Number.isSafeInteger(job.record.revision) || job.record.revision < 1)) throw new Error('確定記録の形式が不正です。');
  if (job.record) {
    validateRequest(job.record.request);
    parseNutritionResponse(JSON.stringify(job.record.response), job.request);
    if (JSON.stringify(job.record.request) !== JSON.stringify(job.request)) {
      // JSONB changes property order; compare content canonically.
      if (canonical(job.record.request) !== canonical(job.request)) throw new Error('依頼と確定記録が一致しません。');
    }
    if (canonical(job.record.targets) !== canonical(job.targets) || typeof job.record.voided !== 'boolean'
      || !Number.isFinite(job.record.savedAt) || job.record.savedAt <= 0) throw new Error('確定記録の内容を確認してください。');
  }
}
export function shouldApplyWorkJob(previous: NutritionWorkJob | undefined, incoming: NutritionWorkJob): boolean {
  if (!previous?.cloudSaved) return true;
  if (previous.version > incoming.version) return false;
  if (previous.version === incoming.version) {
    if (canonical(previous) !== canonical(incoming)) throw new Error('同じ版の計算依頼が端末とクラウドで異なります。');
    return false;
  }
  return true;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => JSON.stringify(k) + ':' + canonical(v)).join(',')}}`;
  return JSON.stringify(value);
}
export function decodeWorkJob(value: unknown): NutritionWorkJob {
  const row = value as Record<string, unknown>;
  if (!row || typeof row !== 'object') throw new Error('計算依頼を読み込めませんでした。');
  const job: NutritionWorkJob = {
    id: row.id as string, request: row.request as MealRequest, targets: row.targets as TargetSnapshot,
    status: row.status as WorkState, response: row.response as NutritionResponse | null,
    responseRevision: row.response_revision as number, version: row.version as number, record: row.record as MealRecord | null, cloudSaved: true,
  };
  validateWorkJob(job);
  return job;
}
export function workRecordMayReplace(existing: MealRecord | undefined, incoming: MealRecord): boolean {
  if (!existing) return true;
  if (canonical(existing) === canonical(incoming)) return false;
  if (incoming.revision <= existing.revision) throw new Error('同じIDの食事記録が端末とクラウドで異なります。上書きせず停止しました。');
  return true;
}

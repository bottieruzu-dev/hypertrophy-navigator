import { liveQuery } from 'dexie';
import { db } from '../db';
import { requireCloudOwner } from './cloudAccess';
import { cloudProjectOrigin } from '../../lib/supabase';
import { shiftDate, todayInJapan } from '../../engine/dates';
import { validProfile, type NutritionProfile } from '../../engine/nutrition';
import { parseDinnerProposal, type DinnerSnapshot } from '../../engine/dinner';
import { projectArchive } from '../../engine/obsidianArchive';

const STATE = 'dinner:source:v1';
interface Published { owner: string; token: string }
export async function readDinnerSnapshot(): Promise<DinnerSnapshot> {
  const date = todayInJapan();
  const start = shiftDate(date, -29);
  return db.transaction('r', [db.settings, db.bodyMetrics, db.meals, db.nutritionWorkJobs, db.sessions, db.sets], async () => {
    const profile = (await db.settings.get('nutritionProfile'))?.value as NutritionProfile | undefined;
    const metrics = await db.bodyMetrics.where('date').between(start,date,true,true).toArray();
    const sessions = await db.sessions.where('date').between(start,date,true,true).toArray();
    const sets = await db.sets.where('date').between(start,date,true,true).toArray();
    const meals = (await db.meals.toArray()).filter(m => m.request.date >= start && m.request.date <= date);
    const jobs = await db.nutritionWorkJobs.toArray();
    // Explicit projection excludes unrelated settings, credentials, and private flags.
    const projectedProfile = profile && validProfile(profile) ? Object.fromEntries(['age','sex','menstruating','heightCm','initialWeightKg','activityFactor','deficitFraction','energyOverride'].map(key => [key,profile[key as keyof NutritionProfile]])) as unknown as NutritionProfile : null;
    return { date, profile: projectedProfile,
      metrics: metrics.filter(m => !(m as unknown as { private?: boolean }).private).map(m => projectArchive('body',m.date,m).data) as unknown as typeof metrics,
      sessions: sessions.filter(s => !(s as unknown as { private?: boolean }).private).map(s => projectArchive('session',s.id,s).data) as unknown as typeof sessions,
      sets: sets.filter(s => !(s as unknown as { private?: boolean }).private).map(s => projectArchive('set',s.id,s).data) as unknown as typeof sets,
      meals: meals.filter(m => !(m as unknown as { private?: boolean }).private).map(m => projectArchive('meal',m.id,m).data) as unknown as typeof meals,
      workIds: jobs.map(j => j.id).sort(),
    };
  });
}
let pending: Promise<void> | undefined;
export function publishDinnerSnapshot(takeOver = false): Promise<void> {
  if (pending) return pending;
  pending = publish(takeOver).finally(() => { pending = undefined; });
  return pending;
}
async function publish(takeOver: boolean) {
  const { client, userId } = await requireCloudOwner();
  const owner = cloudProjectOrigin + ':' + userId;
  const prior = (await db.settings.get(STATE))?.value as Published | undefined;
  if (prior && prior.owner !== owner) throw new Error('献立の送信元アカウントが異なります。');
  let expected = prior?.token ?? null;
  if (takeOver) {
    const state = await client.rpc('hypertrophy_dinner_source');
    if (state.error) throw new Error('献立連携の設定を確認してください。');
    expected = state.data?.token ?? null;
  }
  const snapshot = await readDinnerSnapshot();
  if (!snapshot.profile) throw new Error('栄養ページでプロフィールを設定してください。');
  const result = await client.rpc('hypertrophy_dinner_publish', { p_snapshot: snapshot, p_expected: expected });
  if (result.error || typeof result.data !== 'string') throw new Error('献立用の同期が未完了です。ログイン・接続設定を確認してください。別端末で更新した場合は、最新の記録がある端末で「この端末を送信元にする」を押してください。');
  await db.settings.put({ key: STATE, value: { owner, token: result.data } satisfies Published });
}
export async function fetchDinner(date: string) {
  const { client } = await requireCloudOwner();
  const result = await client.rpc('hypertrophy_dinner_get', { p_date: date });
  if (result.error) throw new Error('夕食提案を取得できませんでした。クラウドの接続・献立連携の設定を確認してください。');
  if (!result.data) return null;
  return { proposal: parseDinnerProposal(result.data.proposal, date), generatedAt: String(result.data.generatedAt) };
}
/** Runs on the bound owner's app, including while the workout/body tabs are open. */
export function watchDinnerSnapshot(status: (value: string) => void): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout>;
  const send = async () => {
    if (disposed || document.visibilityState !== 'visible' || !navigator.onLine) return;
    try { await publishDinnerSnapshot(); if (!disposed) status('献立用データを同期済み'); }
    catch (e) { if (!disposed) status(e instanceof Error ? e.message : '献立用データの送信待ち'); }
  };
  const subscription = liveQuery(readDinnerSnapshot).subscribe({ next: () => { clearTimeout(timer); timer = setTimeout(() => void send(), 1500); }, error: () => status('献立用データを読み込めませんでした。') });
  const interval = setInterval(() => void send(), 60000);
  const visible = () => void send();
  document.addEventListener('visibilitychange',visible);
  window.addEventListener('online',visible);
  return () => { disposed = true; clearTimeout(timer); clearInterval(interval); subscription.unsubscribe(); document.removeEventListener('visibilitychange',visible); window.removeEventListener('online',visible); };
}

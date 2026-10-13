import { db } from '../db';
import { supabase } from '../../lib/supabase';
import { CLOUD_SYNC_PAUSED_FOR_SECURITY, CLOUD_UNAVAILABLE_MESSAGE } from '../../lib/cloudPolicy';
import type { ExerciseBaseline, SessionRecord, SetRecord } from '../types';
import { validBaseline } from '../../engine/planner';
import { todayInJapan } from '../../engine/dates';
import { CALIBRATION_PLAN } from './calibration';
import { requireCloudOwner } from './cloudAccess';

let lastRecordId = 0;
export function newRecordId(): number {
  lastRecordId = Math.max(lastRecordId + 1, Date.now() * 1000 + crypto.getRandomValues(new Uint16Array(1))[0] % 1000);
  return lastRecordId;
}

export async function markPending(kind: 'baseline' | 'session', id: number): Promise<void> {
  await db.settings.put({ key: `sync:${kind}:${id}`, value: newRecordId() });
}

/** Explicit cloud refresh; never let older cloud data overwrite newer local Week0. */
export async function fetchBaselines(): Promise<ExerciseBaseline[]> {
  if (!supabase) throw new Error(CLOUD_SYNC_PAUSED_FOR_SECURITY ? CLOUD_UNAVAILABLE_MESSAGE : 'クラウド未設定です。この端末のWeek0はそのまま使えます。');
  const { client, userId } = await requireCloudOwner();
  const { data, error } = await client.from('baselines').select('exercise_id,weight_kg,reps,rir,est1rm,calibrated_at').eq('user_id', userId);
  if (error || !data) throw new Error('クラウドから読み込めませんでした。端末内の記録は保持しています。');
  await db.transaction('rw', [db.baselines, db.exercises, db.settings], async () => {
    for (const row of data) {
      const b: ExerciseBaseline = {
        exerciseId: Number(row.exercise_id), weightKg: Number(row.weight_kg), reps: Number(row.reps), rir: Number(row.rir),
        est1rm: Number(row.est1rm), calibratedAt: Number(row.calibrated_at),
      };
      const ex = await db.exercises.get(b.exerciseId);
      const existing = await db.baselines.get(b.exerciseId);
      if (ex && validBaseline(b, ex) && !(await db.settings.get(`sync:baseline:${b.exerciseId}`)) && (!existing || b.calibratedAt > existing.calibratedAt)) await db.baselines.put(b);
    }
  });
  return db.baselines.toArray();
}

async function syncBaselineOnce(id: number): Promise<boolean> {
  if (!supabase) return false;
  const pending = await db.settings.get(`sync:baseline:${id}`);
  const b = await db.baselines.get(id);
  if (!b) return false;
  try {
    const { client, userId } = await requireCloudOwner();
    const { error } = await client.from('baselines').upsert({ user_id: userId, exercise_id: b.exerciseId, weight_kg: b.weightKg, reps: b.reps, rir: b.rir, est1rm: b.est1rm, calibrated_at: b.calibratedAt }, { onConflict: 'exercise_id' });
    if (error) return false;
    await db.transaction('rw', db.settings, async () => {
      if ((await db.settings.get(`sync:baseline:${id}`))?.value === pending?.value) await db.settings.delete(`sync:baseline:${id}`);
    });
    return true;
  } catch { return false; }
}

export async function saveBaseline(baseline: ExerciseBaseline): Promise<boolean> {
  const exercise = await db.exercises.get(baseline.exerciseId);
  if (!exercise || !validBaseline(baseline, exercise)) throw new Error('重量・回数・RIRを確認してください。');
  await db.transaction('rw', [db.baselines, db.exercises, db.settings], async () => {
    await db.baselines.put(baseline);
    await markPending('baseline', baseline.exerciseId);
    const ids = [...new Set(Object.values(CALIBRATION_PLAN).flat())];
    const stored = await db.baselines.bulkGet(ids);
    const exercises = await db.exercises.bulkGet(ids);
    const complete = stored.every((b, index) => exercises[index] && validBaseline(b, exercises[index]!));
    await db.settings.put({ key: 'calibrationDone', value: complete });
    if (complete && !(await db.settings.get('programStartDate'))?.value) {
      await db.settings.put({ key: 'programStartDate', value: todayInJapan() });
      await db.settings.put({ key: 'currentMesocycleWeek', value: 1 });
    }
  });
  // Saving locally is complete before networking starts; the UI observes the pending marker.
  void syncBaseline(baseline.exerciseId);
  return true;
}

async function syncSessionOnce(id: number): Promise<boolean> {
  if (!supabase) return false;
  const pending = await db.settings.get(`sync:session:${id}`);
  const s = await db.sessions.get(id);
  if (!s) return false;
  const plan = await db.plans.get(id);
  try {
    const { client, userId } = await requireCloudOwner();
    const { error: sessionError } = await client.from('sessions').upsert({
      user_id: userId,
      id: s.id, date: s.date, started_at: s.startedAt, finished_at: s.finishedAt ?? null, split_type: s.splitType,
      prs_score: s.prsScore, sleep_hours: s.sleepHours, mesocycle_week: s.mesocycleWeek, is_deload: s.isDeload,
      est_minutes: s.estMinutes ?? null, note: plan ? JSON.stringify({ version: 2, plan }) : s.note ?? null,
    }, { onConflict: 'id' });
    if (sessionError) return false;
    const sets = await db.sets.where('sessionId').equals(id).toArray();
    if (sets.length) {
      const { error } = await client.from('sets').upsert(sets.map(r => ({
        user_id: userId,
        id: r.id, session_id: id, exercise_id: r.exerciseId, date: r.date, set_order: r.setOrder,
        target_weight: r.targetWeight, actual_weight: r.actualWeight, target_reps: r.targetReps, actual_reps: r.actualReps,
        target_rir: r.targetRir, actual_rir: r.actualRir, volume_load: r.volumeLoad, est1rm: r.est1rm, is_warmup: r.isWarmup, mode: r.mode,
      })), { onConflict: 'id' });
      if (error) return false;
    }
    await db.transaction('rw', db.settings, async () => {
      if ((await db.settings.get(`sync:session:${id}`))?.value === pending?.value) await db.settings.delete(`sync:session:${id}`);
    });
    return true;
  } catch { return false; }
}

// Serialize per entity so an older request cannot overwrite a newer cloud snapshot.
const entitySync = new Map<string, Promise<boolean>>();
function drainSync(key: string, send: () => Promise<boolean>): Promise<boolean> {
  const existing = entitySync.get(key);
  if (existing) return existing;
  const task = (async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!(await send())) return false;
      if (!(await db.settings.get(key))) return true;
    }
    return false;
  })().catch(() => false).finally(() => entitySync.delete(key));
  entitySync.set(key, task);
  return task;
}
export function syncBaseline(id: number): Promise<boolean> { return drainSync(`sync:baseline:${id}`, () => syncBaselineOnce(id)); }
export function syncSession(id: number): Promise<boolean> { return drainSync(`sync:session:${id}`, () => syncSessionOnce(id)); }

/** Atomic local write, retained even if the cloud is unavailable. */
export async function saveWorkoutSession(session: SessionRecord, sets: SetRecord[]): Promise<boolean> {
  const id = session.id ?? newRecordId();
  await db.transaction('rw', [db.sessions, db.sets, db.settings], async () => {
    await db.sessions.put({ ...session, id });
    for (const set of sets) await db.sets.put({ ...set, id: set.id ?? newRecordId(), sessionId: id });
    await markPending('session', id);
  });
  void syncSession(id);
  return true;
}

let retryInFlight: Promise<boolean> | undefined;
export function retryPendingSync(): Promise<boolean> {
  if (retryInFlight) return retryInFlight;
  retryInFlight = (async () => {
    if (!supabase) return false;
    const pending = await db.settings.where('key').startsWith('sync:').toArray();
    let ok = true;
    for (const item of pending) {
      const [, kind, id] = item.key.split(':');
      if (kind === 'baseline') ok = await syncBaseline(Number(id)) && ok;
      if (kind === 'session') ok = await syncSession(Number(id)) && ok;
    }
    return ok;
  })().finally(() => { retryInFlight = undefined; });
  return retryInFlight;
}

export async function fetchRecentSessions(limit = 20): Promise<SessionRecord[]> {
  // Local sets and plans are authoritative for recommendations; no partial cloud restore.
  return db.sessions.orderBy('date').reverse().limit(limit).toArray();
}

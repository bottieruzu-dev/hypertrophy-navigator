import { db } from '../db';
import type { TrainingBackup } from '../../engine/backup';
import { validBaseline } from '../../engine/planner';
import { markPending } from './workout';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}

export async function restoreTrainingBackup(backup: TrainingBackup): Promise<void> {
  await db.transaction('rw', [db.baselines,db.sessions,db.sets,db.plans,db.exercises,db.settings], async () => {
    const currentActive = await db.plans.where('status').equals('active').first();
    const restoredActive = backup.plans.find(p => p.status === 'active');
    if (currentActive && restoredActive && currentActive.sessionId !== restoredActive.sessionId) throw new Error('進行中のメニューが異なります。現在のメニューを終了してから復元してください。');
    for (const b of backup.baselines) {
      const ex = await db.exercises.get(b.exerciseId);
      if (!ex || !validBaseline(b,ex)) throw new Error('未対応の種目または不正なWeek0記録が含まれています。');
      const existing = await db.baselines.get(b.exerciseId);
      if (!existing || b.calibratedAt > existing.calibratedAt) { await db.baselines.put(b); await markPending('baseline',b.exerciseId); }
    }
    for (const session of backup.sessions) {
      const existing = await db.sessions.get(session.id!);
      if (existing && canonical(existing) !== canonical(session)) throw new Error('同じIDに異なる履歴があります。上書きせず復元を中止しました。');
      if (!existing) { await db.sessions.add(session); await markPending('session',session.id!); }
    }
    for (const set of backup.sets) {
      if (!(await db.exercises.get(set.exerciseId))) throw new Error('未対応の種目を含む記録です。');
      const existing = await db.sets.get(set.id!);
      if (existing && canonical(existing) !== canonical(set)) throw new Error('同じIDに異なるセットがあります。上書きせず復元を中止しました。');
      if (!existing) { await db.sets.add(set); await markPending('session',set.sessionId); }
    }
    for (const plan of backup.plans) {
      if (plan.exercises.some(item => !backup.baselines.some(b => b.exerciseId === item.exerciseId))) throw new Error('メニューに必要なWeek0記録がありません。');
      const existing = await db.plans.get(plan.sessionId);
      if (existing && canonical(existing) !== canonical(plan)) throw new Error('同じIDに異なるメニューがあります。上書きせず復元を中止しました。');
      if (!existing) { await db.plans.add(plan); await markPending('session',plan.sessionId); }
    }
  });
}

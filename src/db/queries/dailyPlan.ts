import { db } from '../db';
import type { DailyPlan, PlannedExercise, SetRecord } from '../types';
import { markPending, newRecordId, syncSession } from './workout';
import { todayInJapan } from '../../engine/dates';
import { epley1RM } from '../../engine/calibration';
import { estimateMinutes } from '../../engine/planner';

export async function startWorkout(draft: Omit<DailyPlan, 'sessionId'>): Promise<DailyPlan> {
  if (draft.date !== todayInJapan()) throw new Error('日付が変わりました。更新された今日のメニューを確認して開始してください。');
  if (!draft.exercises.length || draft.context.pain) throw new Error('実施できるメニューがありません。');
  const plan = { ...draft, sessionId: newRecordId(), date: todayInJapan(), createdAt: Date.now() };
  await db.transaction('rw', [db.plans, db.sessions, db.settings], async () => {
    if (await db.plans.where('status').equals('active').count()) throw new Error('進行中のメニューを先に終了してください。');
    const storedWeek = (await db.settings.get('currentMesocycleWeek'))?.value;
    const week = typeof storedWeek === 'number' && storedWeek > 0 ? storedWeek : 1;
    await db.plans.add(plan);
    await db.sessions.add({ id: plan.sessionId, date: plan.date, startedAt: plan.createdAt, splitType: plan.split,
      prsScore: null, sleepHours: null, mesocycleWeek: week, isDeload: 0, estMinutes: plan.estimatedMinutes });
    await db.settings.put({ key: 'currentMesocycleWeek', value: week });
    if (!(await db.settings.get('programStartDate'))?.value) await db.settings.put({ key: 'programStartDate', value: plan.date });
    await markPending('session', plan.sessionId);
  });
  void syncSession(plan.sessionId);
  return plan;
}

export async function logPlannedSet(sessionId: number, exerciseId: number, actual: { weight: number; reps: number; rir: number; isWarmup: boolean }): Promise<void> {
  if (!Number.isFinite(actual.weight) || actual.weight < 0 || !Number.isInteger(actual.reps) || actual.reps < 1 || actual.reps > 100 || !Number.isInteger(actual.rir) || actual.rir < 0 || actual.rir > 4) throw new Error('重量・回数・RIRを確認してください。');
  await db.transaction('rw', [db.plans, db.sets, db.exercises, db.settings], async () => {
    const plan = await db.plans.get(sessionId);
    const item = plan?.exercises.find(e => e.exerciseId === exerciseId);
    const ex = await db.exercises.get(exerciseId);
    if (!plan || plan.status !== 'active' || !item || !ex || plan.skippedExerciseIds.includes(exerciseId)) throw new Error('この種目は記録できません。');
    if (ex.increment > 0 && actual.weight <= 0) throw new Error('重量は0より大きい値を入力してください。');
    const existing = await db.sets.where('sessionId').equals(sessionId).toArray();
    if (!actual.isWarmup && existing.filter(s => s.exerciseId === exerciseId && !s.isWarmup).length >= item.sets) throw new Error('予定セットは完了しています。');
    const weight = ex.increment === 0 ? 0 : actual.weight;
    const record: SetRecord = { id: newRecordId(), sessionId, exerciseId, date: todayInJapan(), setOrder: existing.length + 1,
      targetWeight: item.targetWeight, targetReps: item.targetReps, targetRir: item.targetRir,
      actualWeight: weight, actualReps: actual.reps, actualRir: actual.rir, volumeLoad: Number((weight * actual.reps).toFixed(2)),
      est1rm: ex.increment === 0 ? 0 : Number(epley1RM(weight, actual.reps, actual.rir).toFixed(2)), isWarmup: actual.isWarmup ? 1 : 0, mode: ex.increment === 0 ? 'reps' : 'load' };
    await db.sets.add(record);
    await db.plans.update(sessionId, { restEndsAt: Date.now() + (item.restSec + (actual.rir <= 1 ? 30 : 0)) * 1000 });
    await markPending('session', sessionId);
  });
  void syncSession(sessionId);
}

export async function skipExercise(sessionId: number, exerciseId: number): Promise<void> {
  await db.transaction('rw', [db.plans, db.settings], async () => {
    const plan = await db.plans.get(sessionId);
    if (!plan || plan.status !== 'active') return;
    await db.plans.update(sessionId, { skippedExerciseIds: [...new Set([...plan.skippedExerciseIds, exerciseId])] });
    await markPending('session', sessionId);
  });
  void syncSession(sessionId);
}

export async function correctLoggedSet(id: number, actual: { weight: number; reps: number; rir: number }): Promise<void> {
  if (!Number.isFinite(actual.weight) || actual.weight < 0 || !Number.isInteger(actual.reps) || actual.reps < 1 || actual.reps > 100 || !Number.isInteger(actual.rir) || actual.rir < 0 || actual.rir > 4) throw new Error('重量・回数・RIRを確認してください。');
  let sessionId = 0;
  await db.transaction('rw', [db.plans, db.sets, db.exercises, db.settings], async () => {
    const set = await db.sets.get(id);
    const plan = set && await db.plans.get(set.sessionId);
    const exercise = set && await db.exercises.get(set.exerciseId);
    if (!set || !plan || plan.status !== 'active' || !exercise) throw new Error('進行中の記録だけ修正できます。');
    if (exercise.increment > 0 && actual.weight <= 0) throw new Error('重量は0より大きい値を入力してください。');
    const weight = exercise.increment === 0 ? 0 : actual.weight;
    await db.sets.update(id, { actualWeight: weight, actualReps: actual.reps, actualRir: actual.rir,
      volumeLoad: Number((weight * actual.reps).toFixed(2)), est1rm: exercise.increment === 0 ? 0 : Number(epley1RM(weight, actual.reps, actual.rir).toFixed(2)) });
    sessionId = set.sessionId;
    await markPending('session', sessionId);
  });
  void syncSession(sessionId);
}

export async function replaceExercise(sessionId: number, originalId: number, replacement: PlannedExercise): Promise<void> {
  const catalogue = await db.exercises.toArray();
  await db.transaction('rw', [db.plans, db.sets, db.settings], async () => {
    const plan = await db.plans.get(sessionId);
    if (!plan || plan.status !== 'active') throw new Error('進行中のメニューがありません。');
    if ((await db.sets.where('sessionId').equals(sessionId).toArray()).some(s => s.exerciseId === originalId)) throw new Error('記録後は交換できません。スキップを使ってください。');
    if (plan.exercises.some(e => e.exerciseId === replacement.exerciseId)) throw new Error('すでにメニューに含まれています。');
    const exercises = plan.exercises.map(e => e.exerciseId === originalId ? replacement : e);
    await db.plans.update(sessionId, { exercises, estimatedMinutes: estimateMinutes(exercises, catalogue) });
    await markPending('session', sessionId);
  });
  void syncSession(sessionId);
}

export async function finishWorkout(sessionId: number, status: 'completed' | 'stopped'): Promise<void> {
  await db.transaction('rw', [db.plans, db.sessions, db.sets, db.settings], async () => {
    const plan = await db.plans.get(sessionId);
    if (!plan || plan.status !== 'active') return;
    const sets = await db.sets.where('sessionId').equals(sessionId).toArray();
    if (status === 'completed' && !plan.exercises.every(e => plan.skippedExerciseIds.includes(e.exerciseId) || sets.filter(s => !s.isWarmup && s.exerciseId === e.exerciseId).length >= e.sets)) throw new Error('残りの種目を完了するかスキップしてください。途中終了でも記録は残ります。');
    if (status === 'completed' && !sets.some(s => !s.isWarmup)) status = 'stopped';
    await db.plans.update(sessionId, { status, restEndsAt: undefined });
    await db.sessions.update(sessionId, { finishedAt: Date.now() });
    await markPending('session', sessionId);
  });
  void syncSession(sessionId);
}

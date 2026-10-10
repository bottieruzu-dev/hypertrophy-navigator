import type { DailyPlan, ExerciseBaseline, SessionRecord, SetRecord } from '../db/types';

export interface TrainingBackup { app: 'HypertrophyNavigator'; version: 2; exportedAt: string; baselines: ExerciseBaseline[]; sessions: SessionRecord[]; sets: SetRecord[]; plans: DailyPlan[] }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const id = (v: unknown) => number(v) && Number.isSafeInteger(v) && Number(v) > 0;
const date = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0,10) === v;
const split = (v: unknown) => ['upper_A','lower','upper_B'].includes(String(v));
const validItem = (v: unknown) => object(v) && id(v.exerciseId) && number(v.targetWeight) && Number(v.targetWeight) >= 0 && Number.isInteger(v.targetReps) && Number(v.targetReps) >= 1 && Number(v.targetReps) <= 100 && Number.isInteger(v.targetRir) && Number(v.targetRir) >= 0 && Number(v.targetRir) <= 4 && Number.isInteger(v.sets) && Number(v.sets) >= 1 && Number(v.sets) <= 10 && number(v.restSec) && Number(v.restSec) > 0 && Number(v.restSec) <= 600 && typeof v.reason === 'string' && ['baseline','history','reference'].includes(String(v.source));

/** Validate the complete file before any database writes. No executable / arbitrary settings data. */
export function parseTrainingBackup(text: string): TrainingBackup {
  const invalid = () => { throw new Error('対応する筋トレバックアップではないか、記録の形式が不正です。既存の記録は変更していません。'); };
  let b: unknown;
  try { b = JSON.parse(text); } catch { return invalid(); }
  if (!object(b) || b.app !== 'HypertrophyNavigator' || b.version !== 2) return invalid();
  for (const key of ['baselines','sessions','sets','plans']) if (!Array.isArray(b[key]) || (b[key] as unknown[]).length > 100000) return invalid();
  const baselines = b.baselines as unknown[];
  const sessions = b.sessions as unknown[];
  const sets = b.sets as unknown[];
  const plans = b.plans as unknown[];
  if (baselines.some(v => !object(v) || !id(v.exerciseId) || !number(v.weightKg) || Number(v.weightKg)<0 || !Number.isInteger(v.reps) || Number(v.reps)<1 || Number(v.reps)>100 || !number(v.rir) || Number(v.rir)<0 || Number(v.rir)>5 || !number(v.est1rm) || !id(v.calibratedAt))) return invalid();
  if (sessions.some(v => !object(v) || !id(v.id) || !date(v.date) || !id(v.startedAt) || !split(v.splitType) || !number(v.mesocycleWeek) || ![0,1].includes(Number(v.isDeload)) || (v.finishedAt !== undefined && !id(v.finishedAt)))) return invalid();
  const sessionIds = new Set(sessions.map(v => (v as SessionRecord).id));
  if (sets.some(v => !object(v) || !id(v.id) || !sessionIds.has(Number(v.sessionId)) || !id(v.exerciseId) || !date(v.date) || !id(v.setOrder) || !number(v.actualWeight) || Number(v.actualWeight)<0 || !number(v.targetWeight) || !Number.isInteger(v.actualReps) || Number(v.actualReps)<1 || Number(v.actualReps)>100 || !number(v.targetReps) || !number(v.actualRir) || Number(v.actualRir)<0 || Number(v.actualRir)>5 || !number(v.targetRir) || !number(v.volumeLoad) || !number(v.est1rm) || ![0,1].includes(Number(v.isWarmup)) || !['load','reps','calibration'].includes(String(v.mode)))) return invalid();
  if (plans.some(v => {
    if (!object(v) || !sessionIds.has(Number(v.sessionId)) || !date(v.date) || !id(v.createdAt) || !split(v.split) || !['active','completed','stopped'].includes(String(v.status)) || !number(v.estimatedMinutes) || typeof v.reason !== 'string' || !Array.isArray(v.warnings) || !v.warnings.every(w => typeof w === 'string') || !Array.isArray(v.exercises) || v.exercises.length>20 || !v.exercises.every(validItem) || !Array.isArray(v.skippedExerciseIds) || !v.skippedExerciseIds.every(id) || (v.restEndsAt !== undefined && !id(v.restEndsAt))) return true;
    const c = v.context;
    return !object(c) || !number(c.minutes) || Number(c.minutes)<15 || Number(c.minutes)>120 || !['normal','tired'].includes(String(c.readiness)) || typeof c.pain !== 'boolean' || !Array.isArray(c.soreMuscles) || !c.soreMuscles.every(m => typeof m === 'string') || (c.split !== undefined && !split(c.split));
  })) return invalid();
  for (const [rows,key] of [[baselines,'exerciseId'],[sessions,'id'],[sets,'id'],[plans,'sessionId']] as const) if (new Set(rows.map(v => (v as Record<string,unknown>)[key])).size !== rows.length) return invalid();
  if (plans.filter(v => (v as DailyPlan).status === 'active').length>1) return invalid();
  for (const v of plans as DailyPlan[]) {
    const session = (sessions as SessionRecord[]).find(s => s.id === v.sessionId)!;
    const exerciseIds = new Set(v.exercises.map(e => e.exerciseId));
    if (!v.exercises.length || exerciseIds.size !== v.exercises.length || new Set(v.skippedExerciseIds).size !== v.skippedExerciseIds.length
      || v.skippedExerciseIds.some(id => !exerciseIds.has(id)) || session.date !== v.date || session.splitType !== v.split
      || (v.status === 'active' && session.finishedAt !== undefined)) return invalid();
  }
  return b as unknown as TrainingBackup;
}

import { db } from '../db';
import type { MuscleCode } from '../types';
import { shiftDate, todayInJapan } from '../../engine/dates';

export interface CreditSummary {
  towardMin: Record<string, number>;
  towardMax: Record<string, number>;
}

export async function getRollingWeeklyCredit(
  baseDate: Date = new Date()
): Promise<CreditSummary> {
  const end = toISODate(baseDate);
  const start = shiftDate(end, -6);

  const sets = await db.sets
    .where('date').between(start, end, true, true)
    .filter((s) => s.isWarmup === 0 && s.mode !== 'calibration')
    .toArray();

  if (sets.length === 0) return { towardMin: {}, towardMax: {} };

  const exerciseIds = [...new Set(sets.map((s) => s.exerciseId))];
  const credits = await db.muscleCredits
    .where('exerciseId').anyOf(exerciseIds)
    .toArray();

  const byExercise = new Map<number, { muscle: MuscleCode; credit: number }[]>();
  for (const c of credits) {
    const arr = byExercise.get(c.exerciseId) ?? [];
    arr.push({ muscle: c.muscle, credit: c.credit });
    byExercise.set(c.exerciseId, arr);
  }

  const towardMin: Record<string, number> = {};
  const towardMax: Record<string, number> = {};

  for (const s of sets) {
    for (const { muscle, credit } of byExercise.get(s.exerciseId) ?? []) {
      towardMax[muscle] = round1((towardMax[muscle] ?? 0) + credit);
      if (credit >= 0.5) {
        towardMin[muscle] = round1((towardMin[muscle] ?? 0) + credit);
      }
    }
  }

  return { towardMin, towardMax };
}

function toISODate(d: Date): string {
  return todayInJapan(d);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

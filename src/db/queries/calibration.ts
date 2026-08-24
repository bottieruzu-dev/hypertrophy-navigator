import { db } from '../db';
import type { SplitType, Exercise, ExerciseBaseline } from '../types';
import { finalizeBaseline } from '../../engine/calibration';

export const CALIBRATION_PLAN: Record<SplitType, number[]> = {
  upper_A: [1, 12, 14, 6, 8, 9, 11, 25],
  lower: [31, 32, 29, 33, 34, 27],
  upper_B: [2, 4, 18, 21, 23, 24, 10, 26],
};

export const CALIBRATION_TOTAL = Object.values(CALIBRATION_PLAN)
  .reduce((s, arr) => s + arr.length, 0);

export async function getCalibrationExercises(split: SplitType): Promise<Exercise[]> {
  const ids = CALIBRATION_PLAN[split];
  const list = await db.exercises.bulkGet(ids);
  return list.filter((e): e is Exercise => !!e && e.isAvailable === 1);
}

export async function getBaselineMap(): Promise<Map<number, ExerciseBaseline>> {
  const all = await db.baselines.toArray();
  return new Map(all.map((b) => [b.exerciseId, b]));
}

export async function getOrCreateCalibrationSession(split: SplitType): Promise<number> {
  const date = new Date().toISOString().slice(0, 10);
  const existing = await db.sessions
    .where('date').equals(date)
    .filter((s) => s.splitType === split && s.mesocycleWeek === 0)
    .first();
  if (existing?.id) return existing.id;

  return db.sessions.add({
    date,
    startedAt: Date.now(),
    splitType: split,
    prsScore: null,
    sleepHours: null,
    mesocycleWeek: 0,
    isDeload: 0,
    note: 'Week 0 calibration',
  });
}

export async function saveCalibrationResult(params: {
  sessionId: number;
  exercise: Exercise;
  attempts: { setNo: number; weight: number; reps: number; rir: number }[];
  suggestions: number[];
  baseline: ReturnType<typeof finalizeBaseline>;
}) {
  const { sessionId, exercise, attempts, suggestions, baseline } = params;
  const date = new Date().toISOString().slice(0, 10);

  await db.transaction('rw', [db.sets, db.baselines, db.events, db.settings], async () => {
    await db.sets.bulkAdd(
      attempts.map((a, i) => ({
        sessionId,
        exerciseId: exercise.id,
        date,
        setOrder: a.setNo,
        targetWeight: suggestions[i] ?? a.weight,
        actualWeight: a.weight,
        targetReps: baseline.reps,
        actualReps: a.reps,
        targetRir: 2,
        actualRir: a.rir,
        volumeLoad: Number((a.weight * a.reps).toFixed(1)),
        est1rm: Number(
          (a.weight * (1 + (a.reps + (a.rir >= 4 ? 5 : a.rir)) / 30)).toFixed(1)
        ),
        isWarmup: 0 as const,
        mode: 'calibration' as const,
      }))
    );

    await db.baselines.put({
      exerciseId: exercise.id,
      weightKg: baseline.weightKg,
      reps: baseline.reps,
      rir: baseline.rir,
      est1rm: baseline.est1rm,
      calibratedAt: baseline.calibratedAt,
    });

    await db.events.add({
      date,
      createdAt: Date.now(),
      eventType: 'calibration_done',
      triggerReason: `${exercise.name} baseline確定`,
      payload: { ...baseline },
      acknowledged: 0,
    });
  });

  const done = await db.baselines.count();
  if (done >= CALIBRATION_TOTAL) {
    await db.settings.bulkPut([
      { key: 'calibrationDone', value: true },
      { key: 'programStartDate', value: date },
      { key: 'currentMesocycleWeek', value: 1 },
    ]);
  }
}
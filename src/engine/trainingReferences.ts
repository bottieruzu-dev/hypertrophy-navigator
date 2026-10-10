import type { ExerciseBaseline } from '../db/types';

// User-requested starting prescription. This is not a measured Week0 result.
export const BENCH_START = { exerciseId: 37, weightKg: 50, reps: 10, sets: 3 } as const;

export function startingReference(exerciseId: number): ExerciseBaseline | undefined {
  if (exerciseId !== BENCH_START.exerciseId) return undefined;
  // RIR 2 is the planned effort, not an assertion about the user's actual reserve.
  return { exerciseId, weightKg: BENCH_START.weightKg, reps: BENCH_START.reps, rir: 2, est1rm: 0, calibratedAt: 1 };
}

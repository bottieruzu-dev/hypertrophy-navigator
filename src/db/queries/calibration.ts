import { db } from '../db';
import type { SplitType, Exercise, ExerciseBaseline } from '../types';
import { validBaseline } from '../../engine/planner';

/**
 * CALIBRATION_PLAN
 * 同一器具（ケーブル等）を連続して使用できるようID配置を整理
 * upper_B に 37(バーベルベンチプレス) を追加
 */
export const CALIBRATION_PLAN: Record<SplitType, number[]> = {
  upper_A: [12, 10, 2, 6, 1, 8, 9, 11, 25, 14],
  lower: [29, 30, 33, 34, 31, 32, 27],
  upper_B: [37, 18, 5, 4, 21, 23, 24, 26, 7],
};

export const CALIBRATION_TOTAL = Object.values(CALIBRATION_PLAN)
  .reduce((s, arr) => s + arr.length, 0);

/** Existing records are authoritative; a stale completion flag does not require new measurements. */
export async function reconcileCalibrationState(): Promise<void> {
  const ids = [...new Set(Object.values(CALIBRATION_PLAN).flat())];
  await db.transaction('rw', [db.baselines, db.exercises, db.settings], async () => {
    const baselines = await db.baselines.bulkGet(ids);
    const exercises = await db.exercises.bulkGet(ids);
    const complete = baselines.every((b, index) => exercises[index] && validBaseline(b, exercises[index]!));
    await db.settings.put({ key: 'calibrationDone', value: complete });
  });
}

/** 器具(equipment)順にソートして返却する */
export async function getCalibrationExercises(split: SplitType): Promise<Exercise[]> {
  const ids = CALIBRATION_PLAN[split];
  const list = await db.exercises.bulkGet(ids);
  const available = list.filter((e): e is Exercise => !!e && e.isAvailable === 1);

  // 器具の優先並び順マップ (cable -> dumbbell -> machine -> barbell -> plate -> bodyweight)
  const equipmentOrder: Record<string, number> = {
    cable: 1,
    dumbbell: 2,
    machine: 3,
    barbell: 4,
    plate: 5,
    smith: 6,
    bodyweight: 7,
  };

  return available.sort((a, b) =>
    (equipmentOrder[a.equipment] ?? 99) - (equipmentOrder[b.equipment] ?? 99)
  );
}

export async function getBaselineMap(): Promise<Map<number, ExerciseBaseline>> {
  const all = await db.baselines.toArray();
  return new Map(all.map((b) => [b.exerciseId, b]));
}

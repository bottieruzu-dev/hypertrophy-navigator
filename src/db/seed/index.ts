import { db } from '../db';
import { MUSCLES, TOTAL_MIN_SETS } from './muscles';
import { EXERCISES } from './exercises';
import { MUSCLE_CREDITS } from './muscleCredits';
import { FOODS } from './foods';
import type { MuscleCode } from '../types';

export const SEED_VERSION = '1.0.2';
export const WEEKLY_SET_BUDGET_MAX = 94;

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  stats: {
    muscles: number;
    exercises: number;
    exercisesAvailable: number;
    credits: number;
    foods: number;
    totalMinSets: number;
    budgetHeadroom: number;
  };
}

export function validateSeed(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const muscleCodes = new Set(MUSCLES.map((m) => m.code));
  const exerciseIds = new Set(EXERCISES.map((e) => e.id));

  for (const c of MUSCLE_CREDITS) {
    if (!exerciseIds.has(c.exerciseId)) {
      errors.push(`[credit] 未定義の exercise_id: ${c.exerciseId}`);
    }
    if (!muscleCodes.has(c.muscle)) {
      errors.push(`[credit] 未定義の muscle: ${c.muscle}`);
    }
  }

  for (const ex of EXERCISES) {
    const hasPrimary = MUSCLE_CREDITS.some(
      (c) => c.exerciseId === ex.id && c.credit === 1.0
    );
    if (!hasPrimary) errors.push(`[exercise] 主働筋未定義: #${ex.id} ${ex.name}`);
  }

  for (const m of MUSCLES) {
    if (m.weeklySetsMin <= 0) continue;
    const covered = MUSCLE_CREDITS.some((c) => {
      if (c.muscle !== m.code || c.credit < 0.5) return false;
      return EXERCISES.find((e) => e.id === c.exerciseId)?.isAvailable === 1;
    });
    if (!covered) {
      errors.push(`[coverage] 下限充足不能な部位: ${m.code} (${m.nameJa})`);
    }
  }

  const headroom = WEEKLY_SET_BUDGET_MAX - TOTAL_MIN_SETS;
  if (headroom < 0) {
    errors.push(`[budget] 下限合計 ${TOTAL_MIN_SETS} が予算上限を超過`);
  } else if (headroom < 5) {
    warnings.push(`[budget] 余裕が ${headroom} セットしかありません`);
  }

  const forbidden = new Set(
    MUSCLES.filter((m) => m.tag === 'forbidden').map((m) => m.code as MuscleCode)
  );
  for (const c of MUSCLE_CREDITS) {
    if (c.credit === 1.0 && forbidden.has(c.muscle)) {
      const ex = EXERCISES.find((e) => e.id === c.exerciseId);
      if (ex?.isAvailable === 1) {
        errors.push(`[forbidden] 禁止部位の主働種目が有効: #${ex.id} ${ex.name}`);
      }
    }
  }

  for (const m of MUSCLES) {
    if (m.weeklySetsMin > m.weeklySetsMax) {
      errors.push(`[range] min>max: ${m.code}`);
    }
  }

  return {
    errors,
    warnings,
    stats: {
      muscles: MUSCLES.length,
      exercises: EXERCISES.length,
      exercisesAvailable: EXERCISES.filter((e) => e.isAvailable === 1).length,
      credits: MUSCLE_CREDITS.length,
      foods: FOODS.length,
      totalMinSets: TOTAL_MIN_SETS,
      budgetHeadroom: headroom,
    },
  };
}

export async function seedDatabase(force = false): Promise<ValidationResult> {
  const result = validateSeed();
  if (result.errors.length > 0 && !force) {
    console.error('[seed] 整合性エラー:\n' + result.errors.join('\n'));
    throw new Error(`Seed validation failed (${result.errors.length} errors)`);
  }

  const current = await db.settings.get('seedVersion');
  if (!force && current?.value === SEED_VERSION) {
    console.info('[seed] 最新のためスキップ');
    return result;
  }

  await db.transaction(
    'rw',
    [db.muscles, db.exercises, db.muscleCredits, db.foods, db.settings],
    async () => {
      await db.muscles.bulkPut(MUSCLES);
      await db.exercises.bulkPut(EXERCISES);
      await db.muscleCredits.clear();
      await db.muscleCredits.bulkAdd(MUSCLE_CREDITS);
      await db.foods.bulkPut(FOODS);

      const existing = await db.settings.get('calibrationDone');
      await db.settings.bulkPut([
        { key: 'seedVersion', value: SEED_VERSION },
        { key: 'seededAt', value: Date.now() },
        { key: 'calibrationDone', value: existing?.value ?? false },
        { key: 'programStartDate', value: null },
        { key: 'currentMesocycleWeek', value: 0 },
        { key: 'nextSplitType', value: 'upper_A' },
        { key: 'lastExportAt', value: null },
      ]);
    }
  );

  console.info(
    `[seed] v${SEED_VERSION} 完了: muscles=${result.stats.muscles}, ` +
    `exercises=${result.stats.exercises}, credits=${result.stats.credits}`
  );
  return result;
}

export async function initializeApp(): Promise<ValidationResult> {
  if (navigator.storage?.persist) {
    const persisted = await navigator.storage.persisted();
    if (!persisted) {
      const granted = await navigator.storage.persist();
      console.info(`[storage] persistent: ${granted ? 'granted' : 'denied'}`);
    }
  }
  await db.open();
  return seedDatabase();
}

export async function nukeDatabase(): Promise<void> {
  await db.delete();
  await db.open();
  await seedDatabase(true);
}
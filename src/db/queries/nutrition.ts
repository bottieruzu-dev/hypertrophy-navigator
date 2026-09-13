import { db } from '../db';
import type { NutritionLog } from '../types';

/** 今日の日付文字列 (YYYY-MM-DD) を取得 */
export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 読み取り専用：今日の栄養ログを取得する（useLiveQuery用） */
export async function getTodayNutrition(): Promise<NutritionLog | undefined> {
  const date = getTodayDateString();
  return db.nutritionLogs.get(date);
}

/** 存在しない場合のみ、初期レコードを安全に新規作成する */
export async function ensureTodayNutrition(): Promise<void> {
  const date = getTodayDateString();
  const existing = await db.nutritionLogs.get(date);
  if (existing) return;

  const initialLog: NutritionLog = {
    date,
    estimatedTdee: 2437,
    targetKcal: 2151,
    targetP: 151,  // 2.6g / kg FFM
    targetF: 48,   // カロリーの20%
    targetC: 279,  // 残り全量
    proteinCoef: 2.6,
    isRefeed: 0,
    isDietBreak: 0,
    proteinCheckedG: 0,
  };

  await db.nutritionLogs.put(initialLog);
}

export async function addFoodProtein(g: number): Promise<void> {
  const date = getTodayDateString();
  const log = await db.nutritionLogs.get(date);
  if (!log) return;
  const nextP = Number((log.proteinCheckedG + g).toFixed(1));
  await db.nutritionLogs.update(date, { proteinCheckedG: nextP });
}

export async function resetTodayProtein(): Promise<void> {
  const date = getTodayDateString();
  await db.nutritionLogs.update(date, { proteinCheckedG: 0 });
}
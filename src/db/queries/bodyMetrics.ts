import { db } from '../db';
import type { BodyMetric } from '../types';

/** 今日の日付文字列 (YYYY-MM-DD) を取得 */
export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** 今日の体組成データ（未入力なら null 埋めオブジェクト）を取得 */
export async function getTodayBodyMetric(): Promise<BodyMetric> {
  const date = getTodayDateString();
  const existing = await db.bodyMetrics.get(date);
  if (existing) return existing;

  return {
    date,
    weightKg: null,
    bodyFatPct: null,
    ffmKg: null,
    weightMa7: null,
    ffmMa30: null,
    waistCm: null,
    shoulderCm: null,
    chestCm: null,
    armCm: null,
    thighCm: null,
    vTaperRatio: null,
    vTaperMa7: null,
    sleepHours: null,
    prsScore: null,
    isInterpolated: 0,
  };
}

/** 直近7日間の体重平均（MA7）を計算する */
export async function calculateWeightMa7(targetDate: string): Promise<number | null> {
  const startDate = new Date(targetDate);
  startDate.setDate(startDate.getDate() - 6);
  const startStr = startDate.toISOString().slice(0, 10);

  const records = await db.bodyMetrics
    .where('date')
    .between(startStr, targetDate, true, true)
    .toArray();

  const validWeights = records.map((r) => r.weightKg).filter((w): w is number => w !== null);
  if (validWeights.length === 0) return null;

  const sum = validWeights.reduce((acc, val) => acc + val, 0);
  return Number((sum / validWeights.length).toFixed(2));
}

/** 体組成データを保存・更新する */
export async function saveBodyMetric(input: {
  weightKg?: number | null;
  bodyFatPct?: number | null;
  waistCm?: number | null;
  shoulderCm?: number | null;
}): Promise<void> {
  const date = getTodayDateString();
  const current = await getTodayBodyMetric();

  const weightKg = input.weightKg !== undefined ? input.weightKg : current.weightKg;
  const bodyFatPct = input.bodyFatPct !== undefined ? input.bodyFatPct : current.bodyFatPct;
  const waistCm = input.waistCm !== undefined ? input.waistCm : current.waistCm;
  const shoulderCm = input.shoulderCm !== undefined ? input.shoulderCm : current.shoulderCm;

  // FFM（除脂肪体重）の計算（体脂肪率がある場合）
  let ffmKg: number | null = null;
  if (weightKg !== null && bodyFatPct !== null) {
    ffmKg = Number((weightKg * (1 - bodyFatPct / 100)).toFixed(2));
  }

  // V-Taper比率（肩囲 ÷ ウエスト周り）の計算
  let vTaperRatio: number | null = null;
  if (shoulderCm !== null && waistCm !== null && waistCm > 0) {
    vTaperRatio = Number((shoulderCm / waistCm).toFixed(3));
  }

  await db.bodyMetrics.put({
    ...current,
    date,
    weightKg,
    bodyFatPct,
    ffmKg,
    waistCm,
    shoulderCm,
    vTaperRatio,
  });

  // 7日移動平均を計算して再更新
  const weightMa7 = await calculateWeightMa7(date);
  await db.bodyMetrics.update(date, { weightMa7 });
}
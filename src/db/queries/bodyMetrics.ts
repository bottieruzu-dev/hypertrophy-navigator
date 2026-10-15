import { db } from '../db';
import type { BodyMetric } from '../types';
import { deriveBodyMetric, type BodyInput } from '../../engine/bodyMeasurements';
import { shiftDate, todayInJapan } from '../../engine/dates';

/** 今日の日付文字列 (YYYY-MM-DD) を取得 */
export function getTodayDateString(): string {
  return todayInJapan();
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
    navelCm: null,
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
  const startStr = shiftDate(targetDate, -6);

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
export async function saveBodyMetric(input: BodyInput): Promise<void> {
  await db.transaction('rw', db.bodyMetrics, async () => {
    const current = await getTodayBodyMetric();
    const history = await db.bodyMetrics.where('date').between(shiftDate(current.date,-29),current.date,true,true).toArray();
    await db.bodyMetrics.put(deriveBodyMetric(current,input,history));
  });
}
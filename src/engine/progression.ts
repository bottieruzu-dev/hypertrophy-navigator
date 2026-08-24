import type { Exercise } from '../db/types';
import { roundToIncrement, isRepProgressionOnly } from './units';

export interface LastSetPerformance {
  weight: number;
  reps: number;
  rir: number;
}

export interface ProgressionRules {
  repsExceededIncrement: number; // 例: 0.10 (+10%)
  repsShortDecrement: number;   // 例: 0.05 (-5%)
  rpeDeviationAdjust: number;   // 例: 0.02 (±2%)
}

export const DEFAULT_RULES: ProgressionRules = {
  repsExceededIncrement: 0.10,
  repsShortDecrement: 0.05,
  rpeDeviationAdjust: 0.02,
};

export interface Prescription {
  mode: 'load' | 'reps';
  targetWeight: number;
  targetReps: number;
  note?: string;
}

/**
 * 直近のセットパフォーマンスに基づき、次回（または次セット）の処方重量・目標レップを算出する
 */
export function prescribeNextLoad(
  last: LastSetPerformance,
  exercise: Exercise,
  rules: ProgressionRules = DEFAULT_RULES
): Prescription {
  const [repLow, repHigh] = exercise.repRange;

  // 1. 達成判定（上限レップ数を達成し、かつ余力RIRが2以下であること）
  const achieved = last.reps >= repHigh && last.rir <= 2;

  if (!achieved) {
    // 不足レップ数に応じた減量処理、または同重量でのレップ維持・微増
    const shortfall = Math.max(0, repLow - last.reps);
    if (shortfall > 0) {
      const newWeight = last.weight * (1 - rules.repsShortDecrement * shortfall);
      return {
        mode: 'load',
        targetWeight: roundToIncrement(newWeight, exercise),
        targetReps: repLow,
        note: `目標下限（${repLow}レップ）未達のため重量を微調整`,
      };
    }
    // レンジ内の場合は同重量でレップを1増やす（ダブルプログレッション）
    return {
      mode: 'reps',
      targetWeight: last.weight,
      targetReps: Math.min(last.reps + 1, repHigh),
      note: '同重量でレップ数を伸ばす二重漸進モード',
    };
  }

  // 2. 上限達成時：器具の刻みが大きすぎないか判定（重量比4%超ならレップ漸進へ）
  if (isRepProgressionOnly(last.weight, exercise)) {
    return {
      mode: 'reps',
      targetWeight: last.weight,
      targetReps: last.reps + 1,
      note: '刻みが粗いため同重量でレップ数を漸進',
    };
  }

  // 3. 重量アップ（+10%目標）
  const idealDelta = last.weight * rules.repsExceededIncrement;
  const inc = exercise.increment;
  const steps = Math.max(1, Math.round(idealDelta / (inc || 1)));
  const newWeight = last.weight + steps * inc;

  return {
    mode: 'load',
    targetWeight: roundToIncrement(newWeight, exercise),
    targetReps: repLow,
    note: `目標達成！ 重量アップ (${last.weight}kg → ${newWeight}kg)`,
  };
}
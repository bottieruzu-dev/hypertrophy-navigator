import type { Exercise } from '../db/types';
import { effectiveIncrement, roundToIncrement } from './units';

export interface LastSetPerformance { weight: number; reps: number; rir: number }
export interface Prescription { mode: 'load' | 'reps'; targetWeight: number; targetReps: number; note: string }

/** Conservative double progression using the weakest working set of a completed session. */
export function prescribeNextLoad(last: LastSetPerformance, exercise: Exercise): Prescription {
  const [low, high] = exercise.repRange;
  const step = effectiveIncrement(exercise, last.weight);
  if (exercise.increment === 0) {
    return { mode: 'reps', targetWeight: 0, targetReps: Math.max(low, Math.min(high, last.reps + (last.rir >= 2 ? 1 : 0))), note: '自重のまま、余力を残して回数を伸ばす' };
  }
  if (last.reps < low || last.rir === 0) {
    const target = Math.max(step, last.weight - step);
    return { mode: 'load', targetWeight: roundToIncrement(target, exercise), targetReps: low, note: '回数不足・限界到達のため1段階軽くする' };
  }
  if (last.reps >= high && last.rir >= 2 && step / last.weight <= 0.1) {
    return { mode: 'load', targetWeight: roundToIncrement(last.weight + step, exercise), targetReps: low, note: '上限回数と余力を確保。器具の1段階だけ増量' };
  }
  return { mode: 'reps', targetWeight: last.weight, targetReps: Math.max(low, Math.min(high, last.reps + (last.rir >= 2 ? 1 : 0))), note: last.reps >= high ? '重量の刻みが大きいため据え置き。無理に増量しない' : '同じ重量で回数とフォームを安定させる' };
}

import type { Exercise } from '../db/types';
import { roundToIncrement, isRepProgressionOnly } from './units';

export const CALIB = {
  setsPerExercise: 3,
  targetRir: 2,
  convergenceRir: [1, 3] as [number, number],
  rirTooEasy: 4,
  repsTooHard: 5,
  tooHardRatio: 0.80,
  maxChangeRatio: 0.25,
  rirPlusValue: 5,
} as const;

export interface Attempt {
  setNo: number;
  weight: number;
  reps: number;
  rir: number;
}

export type CalibVerdict = 'too_light' | 'too_heavy' | 'converged' | 'adjusting';

export interface Suggestion {
  weight: number;
  targetReps: number;
  targetRir: number;
  verdict: CalibVerdict;
  message: string;
  est1rm: number;
  repProgressionOnly: boolean;
}

export function epley1RM(weight: number, reps: number, rir = 0): number {
  const effectiveRir = rir >= CALIB.rirTooEasy ? CALIB.rirPlusValue : rir;
  return weight * (1 + (reps + effectiveRir) / 30);
}

export function targetRepsOf(ex: Exercise): number {
  const [lo, hi] = ex.repRange;
  return Math.floor((lo + hi) / 2);
}

export function suggestNext(ex: Exercise, last: Attempt): Suggestion {
  const targetReps = targetRepsOf(ex);
  const est1rm = epley1RM(last.weight, last.reps, last.rir);

  if (ex.increment === 0) {
    return {
      weight: 0,
      targetReps,
      targetRir: CALIB.targetRir,
      verdict: 'converged',
      message: '自重種目。到達レップ数をベースラインとして記録します',
      est1rm: 0,
      repProgressionOnly: true,
    };
  }

  let raw: number;
  let verdict: CalibVerdict;
  let message: string;

  if (last.reps < CALIB.repsTooHard) {
    raw = last.weight * CALIB.tooHardRatio;
    verdict = 'too_heavy';
    message = `${last.reps}回で限界のため重量過大。20%下げて再測定します`;
  } else {
    raw = est1rm / (1 + (targetReps + CALIB.targetRir) / 30);
    if (last.rir >= CALIB.rirTooEasy) {
      verdict = 'too_light';
      message = `RIR${last.rir}+（余力大）のため重量を引き上げます`;
    } else if (last.rir >= CALIB.convergenceRir[0] && last.rir <= CALIB.convergenceRir[1]) {
      verdict = 'converged';
      message = `RIR${last.rir} は目標域内。微調整して確定します`;
    } else {
      verdict = 'adjusting';
      message = `RIR${last.rir}（限界到達）のため強度を調整します`;
    }
  }

  const lo = last.weight * (1 - CALIB.maxChangeRatio);
  const hi = last.weight * (1 + CALIB.maxChangeRatio);
  raw = Math.min(hi, Math.max(lo, raw));

  const weight = roundToIncrement(raw, ex);
  return {
    weight,
    targetReps,
    targetRir: CALIB.targetRir,
    verdict,
    message,
    est1rm: Number(est1rm.toFixed(1)),
    repProgressionOnly: isRepProgressionOnly(weight, ex),
  };
}

export function finalizeBaseline(ex: Exercise, attempts: Attempt[]) {
  const valid = attempts.filter((a) => a.reps >= CALIB.repsTooHard);
  const source = valid.length > 0 ? valid : attempts;
  const recent = source.slice(-2);
  const est1rm =
    recent.reduce((s, a) => s + epley1RM(a.weight, a.reps, a.rir), 0) / recent.length;

  const last = attempts[attempts.length - 1];
  const targetReps = targetRepsOf(ex);
  const working = ex.increment === 0
    ? 0
    : roundToIncrement(est1rm / (1 + (targetReps + CALIB.targetRir) / 30), ex);

  return {
    exerciseId: ex.id,
    weightKg: working,
    reps: targetReps,
    rir: CALIB.targetRir,
    est1rm: Number(est1rm.toFixed(1)),
    calibratedAt: Date.now(),
    lastAttempt: last,
  };
}
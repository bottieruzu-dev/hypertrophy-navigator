import type { MuscleCredit, MuscleCode } from '../types';

type CreditSpec = Record<number, Partial<Record<MuscleCode, 1.0 | 0.5 | 0.3>>>;

const SPEC: CreditSpec = {
  1:  { delt_lateral: 1.0, delt_front: 0.3, traps_upper: 0.3 },
  2:  { delt_lateral: 1.0, traps_upper: 0.3 },
  3:  { delt_lateral: 1.0, traps_upper: 0.3 },
  4:  { delt_front: 1.0, delt_lateral: 0.5, triceps: 0.5, chest_upper: 0.3 },
  5:  { delt_front: 1.0, delt_lateral: 0.5, triceps: 0.5, traps_upper: 0.3 },
  6:  { delt_rear: 1.0, traps_mid: 0.5 },
  7:  { delt_rear: 1.0, traps_mid: 0.3 },
  8:  { biceps_long: 1.0, biceps_short: 0.5, brachialis: 0.3 },
  9:  { biceps_short: 1.0, biceps_long: 0.5, brachialis: 0.3 },
  10: { biceps_short: 1.0, biceps_long: 0.5, brachialis: 0.3 },
  11: { brachialis: 1.0, biceps_long: 0.5, biceps_short: 0.3 },
  12: { lat: 1.0, biceps_long: 0.5, traps_mid: 0.3, delt_rear: 0.3 },
  13: { lat: 1.0, biceps_long: 0.5, traps_mid: 0.3 },
  14: { lat: 1.0, traps_mid: 0.5, delt_rear: 0.3, biceps_long: 0.3, erector: 0.3 },
  15: { traps_mid: 1.0, lat: 0.5, delt_rear: 0.5, biceps_long: 0.3 },
  16: { traps_mid: 1.0, lat: 0.5, erector: 0.5, delt_rear: 0.3, biceps_long: 0.3 },
  17: { lat: 1.0, triceps: 0.3, abs_rectus: 0.3 },
  18: { chest_upper: 1.0, delt_front: 0.5, triceps: 0.5, chest_mid: 0.3 },
  19: { chest_upper: 1.0, delt_front: 0.5, triceps: 0.5, chest_mid: 0.3 },
  20: { chest_upper: 1.0, delt_front: 0.3 },
  21: { chest_mid: 1.0, chest_lower: 0.5, triceps: 0.5, delt_front: 0.3 },
  22: { chest_lower: 1.0, triceps: 1.0, chest_mid: 0.5, delt_front: 0.3 },
  23: { triceps: 1.0 },
  24: { triceps: 1.0 },
  25: { abs_rectus: 1.0, obliques: 0.3 },
  26: { abs_rectus: 1.0, obliques: 0.3 },
  27: { abs_rectus: 1.0, obliques: 0.3, quads: 0.3 },
  28: { obliques: 1.0 },
  29: { hams: 1.0, calves: 0.3 },
  30: { hams: 1.0, calves: 0.3 },
  31: { glutes: 1.0, hams: 0.5, quads: 0.3, erector: 0.3 },
  32: { glutes: 1.0, hams: 0.5, quads: 0.5, erector: 0.3 },
  33: { quads: 1.0 },
  34: { erector: 1.0, glutes: 0.3, hams: 0.3 },
  35: { abductor: 1.0, glutes: 0.3 },
  36: { calves: 1.0 },
};

export const MUSCLE_CREDITS: MuscleCredit[] = Object.entries(SPEC).flatMap(
  ([exerciseId, credits]) =>
    Object.entries(credits).map(([muscle, credit]) => ({
      exerciseId: Number(exerciseId),
      muscle: muscle as MuscleCode,
      credit: credit as 1.0 | 0.5 | 0.3,
    }))
);
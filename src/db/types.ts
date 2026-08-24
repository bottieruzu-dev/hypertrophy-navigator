export type MuscleCode =
  | 'delt_lateral' | 'delt_front' | 'delt_rear'
  | 'biceps_long' | 'biceps_short' | 'brachialis' | 'triceps'
  | 'lat' | 'traps_mid' | 'traps_upper' | 'erector'
  | 'chest_upper' | 'chest_mid' | 'chest_lower'
  | 'abs_rectus' | 'obliques'
  | 'quads' | 'hams' | 'glutes' | 'abductor' | 'calves';

export type SilhouetteTag = 'priority' | 'neutral' | 'suppress' | 'optional' | 'forbidden';
export type Equipment =
  | 'dumbbell' | 'cable' | 'machine' | 'plate' | 'barbell' | 'smith' | 'bodyweight';
export type ExerciseType = 'compound' | 'isolation' | 'core';
export type SplitType = 'upper_A' | 'lower' | 'upper_B';

export interface Muscle {
  code: MuscleCode;
  nameJa: string;
  weeklySetsMin: number;
  weeklySetsMax: number;
  priorityRank: number;
  tag: SilhouetteTag;
  note?: string;
}

export interface Exercise {
  id: number;
  name: string;
  equipment: Equipment;
  type: ExerciseType;
  increment: number;
  restSec: number;
  silhouetteTag: SilhouetteTag;
  repRange: [number, number];
  isAvailable: 0 | 1;
  note?: string;
}

export interface MuscleCredit {
  exerciseId: number;
  muscle: MuscleCode;
  credit: 1.0 | 0.5 | 0.3;
}

export interface SessionRecord {
  id?: number;
  date: string;
  startedAt: number;
  finishedAt?: number;
  splitType: SplitType;
  prsScore: number | null;
  sleepHours: number | null;
  mesocycleWeek: number;
  isDeload: 0 | 1;
  estMinutes?: number;
  note?: string;
}

export interface SetRecord {
  id?: number;
  sessionId: number;
  exerciseId: number;
  date: string;
  setOrder: number;
  targetWeight: number;
  actualWeight: number;
  targetReps: number;
  actualReps: number;
  targetRir: number;
  actualRir: number;
  volumeLoad: number;
  est1rm: number;
  isWarmup: 0 | 1;
  mode: 'load' | 'reps' | 'calibration';
}

export interface BodyMetric {
  date: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  ffmKg: number | null;
  weightMa7: number | null;
  ffmMa30: number | null;
  waistCm: number | null;
  shoulderCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  vTaperRatio: number | null;
  vTaperMa7: number | null;
  sleepHours: number | null;
  prsScore: number | null;
  isInterpolated: 0 | 1;
}

export interface NutritionLog {
  date: string;
  estimatedTdee: number;
  targetKcal: number;
  targetP: number;
  targetF: number;
  targetC: number;
  proteinCoef: number;
  isRefeed: 0 | 1;
  isDietBreak: 0 | 1;
  proteinCheckedG: number;
}

export interface CardioLog {
  id?: number;
  date: string;
  modality: string;
  durationMin: number;
  estKcal: number;
  triggerReason: string;
}

export interface EventLog {
  id?: number;
  date: string;
  createdAt: number;
  eventType:
    | 'stall' | 'global_stall' | 'deload' | 'diet_break' | 'refeed'
    | 'overreaching' | 'ffm_loss_warning' | 'sleep_guard'
    | 'calibration_done' | 'export' | 'carryover';
  triggerReason: string;
  payload: Record<string, unknown>;
  acknowledged: 0 | 1;
}

export interface ExerciseBaseline {
  exerciseId: number;
  weightKg: number;
  reps: number;
  rir: number;
  est1rm: number;
  calibratedAt: number;
}

export interface Food {
  id: number;
  name: string;
  unitLabel: string;
  unitG: number;
  kcal: number;
  p: number;
  f: number;
  c: number;
  tag: 'protein' | 'carb' | 'fat' | 'veg';
  note?: string;
}

export interface Setting {
  key: string;
  value: unknown;
}
import type { Exercise } from '../db/types';

export function effectiveIncrement(exercise: Exercise, weight: number): number {
  if (exercise.equipment === 'dumbbell') {
    return weight < 20 ? 1.0 : 2.5;
  }
  return exercise.increment;
}

export function roundToIncrement(weight: number, exercise: Exercise): number {
  const inc = effectiveIncrement(exercise, weight);
  if (inc <= 0) return 0;
  const w = Math.round(weight / inc) * inc;
  return Math.max(inc, Number(w.toFixed(2)));
}

export function incrementRatio(weight: number, exercise: Exercise): number {
  if (weight <= 0) return Infinity;
  return effectiveIncrement(exercise, weight) / weight;
}

export function isRepProgressionOnly(weight: number, exercise: Exercise): boolean {
  if (exercise.increment === 0) return true;
  return incrementRatio(weight, exercise) > 0.04;
}

export function formatWeight(w: number, exercise: Exercise): string {
  if (exercise.increment === 0) return '自重';
  return `${w % 1 === 0 ? w.toFixed(0) : w.toFixed(1)} kg`;
}
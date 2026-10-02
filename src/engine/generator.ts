import { db } from '../db/db';
import type { Exercise } from '../db/types';

export interface ExerciseRecommendation {
  exerciseId: number;
  recommendedSets: number;
  recoveryStatus: 'full' | 'moderate' | 'fatigued';
  reason: string;
}

/** 直近7日間の特定部位の完了セット数を集計 */
export async function get7DayVolumeByMuscle(muscleId: string): Promise<number> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const startStr = sevenDaysAgo.toISOString().slice(0, 10);

  const recentSets = await db.sets
    .where('date')
    .aboveOrEqual(startStr)
    .toArray();

  if (recentSets.length === 0) return 0;

  const credits = await db.muscleCredits
    .where('muscle')
    .equals(muscleId)
    .toArray();

  const targetExerciseIds = new Set(
    credits.filter((c) => c.credit >= 0.5).map((c) => c.exerciseId)
  );

  let count = 0;
  for (const s of recentSets) {
    if (targetExerciseIds.has(s.exerciseId)) {
      count++;
    }
  }
  return count;
}

/** 種目ごとの推奨セット数と疲労回復アドバイスを判定 */
export async function getExerciseRecommendation(exercise: Exercise): Promise<ExerciseRecommendation> {
  const credits = await db.muscleCredits
    .where('exerciseId')
    .equals(exercise.id)
    .toArray();

  const primaryCredit = credits.find((c) => c.credit === 1.0) ?? credits[0];
  const primaryMuscle = primaryCredit?.muscle;

  const volume7D = primaryMuscle ? await get7DayVolumeByMuscle(primaryMuscle) : 0;

  if (volume7D >= 12) {
    return {
      exerciseId: exercise.id,
      recommendedSets: 2,
      recoveryStatus: 'fatigued',
      reason: `直近7日で${volume7D}セット消化（疲労考慮のため上限2セット推奨）`,
    };
  } else if (volume7D >= 8) {
    return {
      exerciseId: exercise.id,
      recommendedSets: 3,
      recoveryStatus: 'moderate',
      reason: `直近7日で${volume7D}セット消化（良好なボリューム維持：3セット推奨）`,
    };
  } else {
    return {
      exerciseId: exercise.id,
      recommendedSets: 3,
      recoveryStatus: 'full',
      reason: `回復完了状態（筋肥大ターゲット刺激：3セット推奨）`,
    };
  }
}
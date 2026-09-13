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

  const exercises = await db.exercises.toArray();
  const exerciseMap = new Map(exercises.map((e) => [e.id, e]));

  let count = 0;
  for (const s of recentSets) {
    // any型でキャストして型チェックを回避しつつ安全にデータを取得
    const ex: any = exerciseMap.get(s.exerciseId);
    if (ex) {
      const muscles = ex.primaryMuscles || ex.targetMuscles || [];
      if (muscles.includes(muscleId)) {
        count++;
      }
    }
  }
  return count;
}

/** 種目ごとの推奨セット数と疲労回復アドバイスを判定 */
export async function getExerciseRecommendation(exercise: Exercise): Promise<ExerciseRecommendation> {
  // 型エラーを回避し、実際のDBに存在するプロパティ名から部位を取得
  const exAny: any = exercise;
  const muscles = exAny.primaryMuscles || exAny.targetMuscles || [];
  const primaryMuscle = muscles[0];

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
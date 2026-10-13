import { db } from '../db';
import { requireCloudOwner } from './cloudAccess';
import { markPending, retryPendingSync } from './workout';
import type {
  BodyMetric,
  NutritionLog,
} from '../types';

export async function migrateLocalDataToSupabase(): Promise<{ success: boolean; message: string }> {
  try {
    const { client, userId } = await requireCloudOwner();
    await db.transaction('rw', [db.settings, db.baselines, db.sessions], async () => {
      for (const b of await db.baselines.toArray()) await markPending('baseline', b.exerciseId);
      for (const s of await db.sessions.toArray()) if (s.id) await markPending('session', s.id);
    });
    if (!await retryPendingSync()) throw new Error('Training upload failed');
    // 4. 体組成記録の移行
    const bodyMetrics: BodyMetric[] = await db.bodyMetrics.toArray();
    if (bodyMetrics.length > 0) {
      const payload = bodyMetrics.map((b: BodyMetric) => ({
        user_id: userId,
        date: b.date,
        weight_kg: b.weightKg,
        body_fat_pct: b.bodyFatPct,
        ffm_kg: b.ffmKg,
        weight_ma7: b.weightMa7,
        ffm_ma30: b.ffmMa30,
        waist_cm: b.waistCm,
        shoulder_cm: b.shoulderCm,
        chest_cm: b.chestCm,
        arm_cm: b.armCm,
        thigh_cm: b.thighCm,
        v_taper_ratio: b.vTaperRatio,
        v_taper_ma7: b.vTaperMa7,
        sleep_hours: b.sleepHours,
        prs_score: b.prsScore,
        is_interpolated: b.isInterpolated,
      }));
      const { error } = await client.from('body_metrics').upsert(payload, { onConflict: 'date' });
      if (error) throw error;
    }

    // 5. 栄養ログの移行
    const nutritionLogs: NutritionLog[] = await db.nutritionLogs.toArray();
    if (nutritionLogs.length > 0) {
      const payload = nutritionLogs.map((n: NutritionLog) => ({
        user_id: userId,
        date: n.date,
        estimated_tdee: n.estimatedTdee,
        target_kcal: n.targetKcal,
        target_p: n.targetP,
        target_f: n.targetF,
        target_c: n.targetC,
        protein_coef: n.proteinCoef,
        is_refeed: n.isRefeed,
        is_diet_break: n.isDietBreak,
        protein_checked_g: n.proteinCheckedG,
      }));
      const { error } = await client.from('nutrition_logs').upsert(payload, { onConflict: 'date' });
      if (error) throw error;
    }

    return { success: true, message: '筋トレ・体組成・旧栄養ログを送信しました。新しい食事記録と栄養プロフィールは端末内保存です。' };
  } catch {
    return { success: false, message: 'クラウドへの送信に失敗しました。端末の記録は保持しています。' };
  }
}

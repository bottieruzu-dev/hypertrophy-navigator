import { db } from '../db';
import { supabase } from '../../lib/supabase';
import type {
  ExerciseBaseline,
  SessionRecord,
  SetRecord,
  BodyMetric,
  NutritionLog,
} from '../types';

export async function migrateLocalDataToSupabase(): Promise<{ success: boolean; message: string }> {
  try {
    // 1. ベースラインデータの移行
    const baselines: ExerciseBaseline[] = await db.baselines.toArray();
    if (baselines.length > 0) {
      const payload = baselines.map((b: ExerciseBaseline) => ({
        exercise_id: b.exerciseId,
        weight_kg: b.weightKg,
        reps: b.reps,
        rir: b.rir,
        est1rm: b.est1rm,
        calibrated_at: b.calibratedAt,
      }));
      const { error } = await supabase.from('baselines').upsert(payload, { onConflict: 'exercise_id' });
      if (error) throw error;
    }

    // 2. セッション記録の移行
    const sessions: SessionRecord[] = await db.sessions.toArray();
    if (sessions.length > 0) {
      const payload = sessions.map((s: SessionRecord) => ({
        id: s.id,
        date: s.date,
        started_at: s.startedAt,
        finished_at: s.finishedAt,
        split_type: s.splitType,
        prs_score: s.prsScore,
        sleep_hours: s.sleepHours,
        mesocycle_week: s.mesocycleWeek,
        is_deload: s.isDeload,
        est_minutes: s.estMinutes,
        note: s.note,
      }));
      const { error } = await supabase.from('sessions').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
    }

    // 3. セット記録の移行
    const sets: SetRecord[] = await db.sets.toArray();
    if (sets.length > 0) {
      const payload = sets.map((s: SetRecord) => ({
        id: s.id,
        session_id: s.sessionId,
        exercise_id: s.exerciseId,
        date: s.date,
        set_order: s.setOrder,
        target_weight: s.targetWeight,
        actual_weight: s.actualWeight,
        target_reps: s.targetReps,
        actual_reps: s.actualReps,
        target_rir: s.targetRir,
        actual_rir: s.actualRir,
        volume_load: s.volumeLoad,
        est1rm: s.est1rm,
        is_warmup: s.isWarmup,
        mode: s.mode,
      }));
      const { error } = await supabase.from('sets').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
    }

    // 4. 体組成記録の移行
    const bodyMetrics: BodyMetric[] = await db.bodyMetrics.toArray();
    if (bodyMetrics.length > 0) {
      const payload = bodyMetrics.map((b: BodyMetric) => ({
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
      const { error } = await supabase.from('body_metrics').upsert(payload, { onConflict: 'date' });
      if (error) throw error;
    }

    // 5. 栄養ログの移行
    const nutritionLogs: NutritionLog[] = await db.nutritionLogs.toArray();
    if (nutritionLogs.length > 0) {
      const payload = nutritionLogs.map((n: NutritionLog) => ({
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
      const { error } = await supabase.from('nutrition_logs').upsert(payload, { onConflict: 'date' });
      if (error) throw error;
    }

    return { success: true, message: 'ローカルデータをSupabaseへ無事移行しました！' };
  } catch (err: unknown) {
    console.error('Supabase移行エラー:', err);
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `移行失敗: ${msg}` };
  }
}
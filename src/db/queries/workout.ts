import { supabase } from '../../lib/supabase';
import type { ExerciseBaseline, SessionRecord, SetRecord } from '../types';

// ==========================================
// 1. ベースライン（キャリブレーション記録）
// ==========================================

/** Supabase から全ベースラインを取得 */
export async function fetchBaselines(): Promise<ExerciseBaseline[]> {
  const { data, error } = await supabase
    .from('baselines')
    .select('*');

  if (error) {
    console.error('ベースライン取得エラー:', error);
    return [];
  }

  return (data || []).map((row) => ({
    exerciseId: row.exercise_id,
    weightKg: Number(row.weight_kg),
    reps: Number(row.reps),
    rir: Number(row.rir),
    est1rm: Number(row.est1rm),
    calibratedAt: row.calibrated_at,
  }));
}

/** ベースラインを 1 件保存・更新 */
export async function saveBaseline(baseline: ExerciseBaseline): Promise<boolean> {
  const payload = {
    exercise_id: baseline.exerciseId,
    weight_kg: baseline.weightKg,
    reps: baseline.reps,
    rir: baseline.rir,
    est1rm: baseline.est1rm,
    calibrated_at: baseline.calibratedAt || new Date().toISOString(),
  };

  const { error } = await supabase
    .from('baselines')
    .upsert(payload, { onConflict: 'exercise_id' });

  if (error) {
    console.error('ベースライン保存エラー:', error);
    return false;
  }
  return true;
}

// ==========================================
// 2. ワークアウト（セッション & セット記録）
// ==========================================

/** ワークアウト（セッションと全セット）を自動保存 */
export async function saveWorkoutSession(
  session: SessionRecord,
  sets: SetRecord[]
): Promise<boolean> {
  // 1. セッション本体の保存
  const sessionPayload = {
    id: session.id,
    date: session.date,
    started_at: session.startedAt,
    finished_at: session.finishedAt,
    split_type: session.splitType,
    prs_score: session.prsScore,
    sleep_hours: session.sleepHours,
    mesocycle_week: session.mesocycleWeek,
    is_deload: session.isDeload,
    est_minutes: session.estMinutes,
    note: session.note,
  };

  const { error: sessionError } = await supabase
    .from('sessions')
    .upsert(sessionPayload, { onConflict: 'id' });

  if (sessionError) {
    console.error('セッション保存エラー:', sessionError);
    return false;
  }

  // 2. セット記録の保存
  if (sets.length > 0) {
    const setsPayload = sets.map((s) => ({
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

    const { error: setsError } = await supabase
      .from('sets')
      .upsert(setsPayload, { onConflict: 'id' });

    if (setsError) {
      console.error('セット保存エラー:', setsError);
      return false;
    }
  }

  return true;
}

/** 最近のセッション履歴を取得 */
export async function fetchRecentSessions(limit = 20): Promise<SessionRecord[]> {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('date', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('セッション取得エラー:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    date: row.date,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    splitType: row.split_type,
    prsScore: row.prs_score,
    sleepHours: row.sleep_hours,
    mesocycleWeek: row.mesocycle_week,
    isDeload: row.is_deload,
    estMinutes: row.est_minutes,
    note: row.note,
  }));
}
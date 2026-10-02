import { db } from '../db';
import { supabase } from '../../lib/supabase';
import type { ExerciseBaseline, SessionRecord, SetRecord } from '../types';

// ==========================================
// 1. ベースライン（キャリブレーション記録）
// ==========================================

/** Supabase から全ベースラインを取得（ローカル IndexedDB へも自動キャッシュ） */
export async function fetchBaselines(): Promise<ExerciseBaseline[]> {
  try {
    const { data, error } = await supabase
      .from('baselines')
      .select('*');

    if (error || !data) {
      console.warn('Supabase ベースライン取得スキップ/エラー:', error);
      return await db.baselines.toArray();
    }

    const list: ExerciseBaseline[] = data.map((row) => ({
      exerciseId: Number(row.exercise_id),
      weightKg: Number(row.weight_kg),
      reps: Number(row.reps),
      rir: Number(row.rir),
      est1rm: Number(row.est1rm),
      calibratedAt: typeof row.calibrated_at === 'number'
        ? row.calibrated_at
        : new Date(row.calibrated_at).getTime() || Date.now(),
    }));

    if (list.length > 0) {
      await db.baselines.bulkPut(list);
    }

    return list;
  } catch (e) {
    console.error('ベースライン取得エラー:', e);
    return await db.baselines.toArray();
  }
}

/** ベースラインを 1 件保存・更新（IndexedDB & Supabase 二重自動保存） */
export async function saveBaseline(baseline: ExerciseBaseline): Promise<boolean> {
  // 1. ローカル IndexedDB 保存
  await db.baselines.put(baseline);

  // 2. Supabase への同期
  try {
    const payload = {
      exercise_id: baseline.exerciseId,
      weight_kg: baseline.weightKg,
      reps: baseline.reps,
      rir: baseline.rir,
      est1rm: baseline.est1rm,
      calibrated_at: new Date(baseline.calibratedAt || Date.now()).toISOString(),
    };

    const { error } = await supabase
      .from('baselines')
      .upsert(payload, { onConflict: 'exercise_id' });

    if (error) {
      console.error('Supabase ベースライン保存エラー:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Supabase 接続エラー:', err);
    return false;
  }
}

// ==========================================
// 2. ワークアウト（セッション & セット記録）
// ==========================================

/** ワークアウト（セッションと全セット）を自動保存 */
export async function saveWorkoutSession(
  session: SessionRecord,
  sets: SetRecord[]
): Promise<boolean> {
  // 1. ローカル IndexedDB 保存
  let savedSessionId = session.id;
  if (!savedSessionId) {
    savedSessionId = await db.sessions.add(session);
  } else {
    await db.sessions.put({ ...session, id: savedSessionId });
  }

  const updatedSets = sets.map((s) => ({ ...s, sessionId: savedSessionId! }));
  for (const setItem of updatedSets) {
    if (setItem.id) {
      await db.sets.put(setItem);
    } else {
      const newSetId = await db.sets.add(setItem);
      setItem.id = Number(newSetId);
    }
  }

  // 2. Supabase へ自動同期
  try {
    const sessionPayload = {
      id: savedSessionId,
      date: session.date,
      started_at: session.startedAt,
      finished_at: session.finishedAt ?? null,
      split_type: session.splitType,
      prs_score: session.prsScore ?? null,
      sleep_hours: session.sleepHours ?? null,
      mesocycle_week: session.mesocycleWeek,
      is_deload: session.isDeload,
      est_minutes: session.estMinutes ?? null,
      note: session.note ?? null,
    };

    const { error: sessionError } = await supabase
      .from('sessions')
      .upsert(sessionPayload, { onConflict: 'id' });

    if (sessionError) {
      console.error('Supabase セッション保存エラー:', sessionError);
    }

    if (updatedSets.length > 0) {
      const setsPayload = updatedSets.map((s) => ({
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
        console.error('Supabase セット保存エラー:', setsError);
      }
    }
    return true;
  } catch (err) {
    console.error('Supabase 自動同期例外エラー:', err);
    return false;
  }
}

/** 最近のセッション履歴を取得 */
export async function fetchRecentSessions(limit = 20): Promise<SessionRecord[]> {
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .order('date', { ascending: false })
      .limit(limit);

    if (error || !data) {
      return await db.sessions.orderBy('date').reverse().limit(limit).toArray();
    }

    return data.map((row) => ({
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
  } catch {
    return await db.sessions.orderBy('date').reverse().limit(limit).toArray();
  }
}
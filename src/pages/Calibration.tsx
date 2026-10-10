import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { CALIBRATION_PLAN, CALIBRATION_TOTAL, getCalibrationExercises } from '../db/queries/calibration';
import { fetchBaselines, saveBaseline } from '../db/queries/workout';
import type { Exercise, SplitType, ExerciseBaseline } from '../db/types';
import { motion, AnimatePresence } from 'framer-motion';
import { validBaseline } from '../engine/planner';
import { formatWeight } from '../engine/units';
import { supabase } from '../lib/supabase';
import { BENCH_START } from '../engine/trainingReferences';

export default function Calibration() {
  const [split, setSplit] = useState<SplitType>('upper_A');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedEx, setSelectedEx] = useState<Exercise | null>(null);

  // 全ベースライン（保存済みデータ）をローカルDBからリアルタイム取得
  const baselines = useLiveQuery(() => db.baselines.toArray(), []) || [];
  const [cloudMessage, setCloudMessage] = useState('');
  const [loadingCloud, setLoadingCloud] = useState(false);
  const allExercises = useLiveQuery(() => db.exercises.toArray(), []) ?? [];
  const requiredIds = Object.values(CALIBRATION_PLAN).flat();
  const doneCount = allExercises.filter(ex => requiredIds.includes(ex.id) && validBaseline(baselines.find(b => b.exerciseId === ex.id), ex)).length;

  useEffect(() => {
    // 選択されたタブ（SplitType）に応じた種目リストを取得
    let isMounted = true;
    getCalibrationExercises(split).then((list) => {
      if (isMounted) setExercises(list);
    });
    return () => {
      isMounted = false;
    };
  }, [split]);

  // タブ下のサブタイトル用マッピング
  const splitLabels: Record<SplitType, string> = {
    upper_A: '上半身 A（背中・肩中部・二頭）',
    lower: '下半身（脚・尻・カーフ）',
    upper_B: '上半身 B（胸・肩前部・三頭）',
  };

  const getBaseline = (exId: number) => baselines.find((b) => b.exerciseId === exId);

  const progressPct = Math.min(100, Math.round((doneCount / CALIBRATION_TOTAL) * 100));

  return (
    <div className="page">
      <h1>Week0 · 基準の記録</h1>
      <p className="sub">保存済みの記録は今日のメニューに引き継ぎます。全種目のやり直しは不要です。変更したい種目だけ開いてください。</p>
      {supabase && <button className="btn" disabled={loadingCloud} onClick={async () => { setLoadingCloud(true); try { await fetchBaselines(); setCloudMessage('新しいクラウド記録を取り込みました。端末の新しい記録は保持しています。'); } catch (error) { setCloudMessage(error instanceof Error ? error.message : '読み込めませんでした。'); } finally { setLoadingCloud(false); } }}>{loadingCloud ? '読込中…' : 'クラウドのWeek0を読み込む'}</button>}
      {cloudMessage && <p role="status" className="notice">{cloudMessage}</p>}
      <header className="hdr" style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span className="sub" style={{ fontSize: '13px', fontWeight: 800, color: 'var(--sub)' }}>
            {doneCount} / {CALIBRATION_TOTAL} 種目 完了
          </span>
          <span className="mono" style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>
            {progressPct}%
          </span>
        </div>

        <div style={{ height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', overflow: 'hidden', marginBottom: '16px' }}>
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: 'var(--accent-grad)',
              boxShadow: '0 0 10px var(--accent-glow)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        {/* スプリット切り替えタブ */}
        <div className="tabs">
          {(['upper_A', 'lower', 'upper_B'] as SplitType[]).map((s) => (
            <button
              key={s}
              className={`tab ${s === split ? 'on' : ''}`}
              onClick={() => setSplit(s)}
            >
              {s === 'upper_A' ? 'Upper A' : s === 'lower' ? 'Lower' : 'Upper B'}
            </button>
          ))}
        </div>

        {/* サブタイトル */}
        <p className="sub" style={{ textAlign: 'left', marginTop: '12px', fontSize: '13px', color: 'var(--sub)' }}>
          {splitLabels[split]}
        </p>
      </header>

      {/* 種目リスト */}
      <ul className="list">
        {exercises.map((ex) => {
          const b = getBaseline(ex.id);
          const isDone = validBaseline(b, ex);
          return (
            <li key={ex.id} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <button
                className={`row ${isDone ? 'done' : ''}`}
                onClick={() => setSelectedEx(ex)}
              >
                <div className="name">{ex.name}</div>
                <div className="meta">
                  {isDone
                    ? `${formatWeight(b!.weightKg, ex)} × ${b!.reps}回 · RIR ${b!.rir}`
                    : `${ex.repRange[0]}-${ex.repRange[1]} reps`}
                </div>
                <div className="mark">{isDone ? '✓' : '›'}</div>
              </button>
            </li>
          );
        })}
      </ul>

      {/* 入力モーダル */}
      <AnimatePresence>
        {selectedEx && (
          <CalibrationModal
            exercise={selectedEx}
            existingBaseline={getBaseline(selectedEx.id)}
            onClose={() => setSelectedEx(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ----------------------------------------------------
// 個別種目の記録用モーダルコンポーネント
// ----------------------------------------------------
interface CalibrationModalProps {
  exercise: Exercise;
  existingBaseline?: ExerciseBaseline;
  onClose: () => void;
}

function CalibrationModal({ exercise, existingBaseline, onClose }: CalibrationModalProps) {
  const bench = exercise.id === BENCH_START.exerciseId;
  const bodyweight = exercise.increment === 0;
  const [weight, setWeight] = useState<number | ''>(bodyweight ? 0 : existingBaseline?.weightKg ?? (bench ? BENCH_START.weightKg : ''));
  const [reps, setReps] = useState<number | ''>(existingBaseline?.reps ?? (bench ? BENCH_START.reps : ''));
  const [rir, setRir] = useState<number | ''>(existingBaseline?.rir ?? (bench ? '' : 2));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Epleyの公式による推定1RM計算
  const numWeight = Number(weight) || 0;
  const numReps = Number(reps) || 0;
  const numRir = Number(rir) || 0;

  const est1rm = numWeight > 0 && numReps > 0
    ? Math.round(numWeight * (1 + (numReps + (numRir >= 4 ? 5 : numRir)) / 30))
    : 0;

  const handleSave = async () => {
    if (weight === '' || reps === '' || rir === '' || Number(weight) < 0 || (exercise.increment > 0 && Number(weight) <= 0) || !Number.isInteger(Number(reps)) || Number(reps) < 1 || Number(reps) > 100 || !Number.isInteger(Number(rir)) || Number(rir) < 0 || Number(rir) > 4) { setError('重量・回数（1〜100）・RIR（0〜4）を確認してください。自重は重量0で保存できます。'); return; }
    setSaving(true);

    const baseline: ExerciseBaseline = {
      exerciseId: exercise.id,
      weightKg: exercise.increment === 0 ? 0 : Number(weight),
      reps: Number(reps),
      rir: Number(rir),
      est1rm,
      calibratedAt: Date.now(),
    };

    // ローカル IndexedDB と Supabase へ自動同期・保存
    try { await saveBaseline(baseline); onClose(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : '端末に保存できませんでした。'); }
    finally { setSaving(false); }
  };

  return (
    <motion.div
      className="levelup-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={() => { if (!saving) onClose(); }}
    >
      <motion.div
        className="card"
        style={{
          width: '100%',
          maxWidth: '380px',
          margin: '20px',
          position: 'relative',
          zIndex: 1001,
          padding: '24px',
          background: 'linear-gradient(145deg, rgba(20, 24, 40, 0.98) 0%, rgba(12, 14, 24, 0.99) 100%)',
          border: '1px solid var(--accent-border)',
          borderRadius: '20px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.8), 0 0 30px var(--accent-glow)',
        }}
        initial={{ y: 50, scale: 0.95, opacity: 0 }}
        animate={{ y: 0, scale: 1, opacity: 1 }}
        exit={{ y: 20, scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '19px', fontWeight: 800 }}>{exercise.name}</h2>
          <button
            disabled={saving}
            aria-label="閉じる"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--sub)',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <p className="sub" style={{ marginBottom: '20px', fontSize: '13px' }}>
          {exercise.equipment === 'dumbbell' ? '重量は片手分。' : bodyweight ? '自重で実施。重量の入力は不要です。' : bench ? '重量はバーとプレートを合わせた合計です。' : '重量は前回と同じ数え方で入力。'} RIRはあと何回できそうかの目安です。
        </p>
        {bench && !existingBaseline && <p className="notice">開始基準は50kg・10回・3セットです。実際に確認した回数とRIRを入力して測定値として保存してください。</p>}
        {error && <p className="notice" role="alert">{error}</p>}

        {/* フォーム入力エリア */}
        <div
          className="form-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${bodyweight ? 2 : 3}, 1fr)`,
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          {!bodyweight && <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--sub)', marginBottom: '8px', letterSpacing: '0.5px' }}>
              重量 (kg)
            </label>
            <input
              type="number"
              className="btn"
              style={{ background: 'var(--bg)', textAlign: 'center', fontSize: '18px', fontWeight: 'bold', height: '48px' }}
              min="0" step="any"
              value={weight}
              placeholder="0"
              onChange={(e) => setWeight(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>}

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--sub)', marginBottom: '8px', letterSpacing: '0.5px' }}>
              回数 (reps)
            </label>
            <input
              type="number"
              className="btn"
              style={{ background: 'var(--bg)', textAlign: 'center', fontSize: '18px', fontWeight: 'bold', height: '48px' }}
              min="1" max="100" step="1"
              value={reps}
              placeholder="0"
              onChange={(e) => setReps(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--sub)', marginBottom: '8px', letterSpacing: '0.5px' }}>
              RIR (余力)
            </label>
            <input
              type="number"
              className="btn"
              style={{ background: 'var(--bg)', textAlign: 'center', fontSize: '18px', fontWeight: 'bold', height: '48px' }}
              min="0" max="4" step="1"
              value={rir}
              placeholder="2"
              onChange={(e) => setRir(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>

        {/* 推定 1RM カード */}
        {!bodyweight && <div
          style={{
            background: 'rgba(0, 242, 254, 0.05)',
            border: '1px solid rgba(0, 242, 254, 0.2)',
            padding: '12px 16px',
            borderRadius: '12px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span className="sub" style={{ fontSize: '12px', fontWeight: 700 }}>推定 1RM (最大挙上重量)</span>
          <span className="mono" style={{ fontSize: '18px', fontWeight: 900, color: 'var(--accent)' }}>
            {est1rm} <span style={{ fontSize: '12px' }}>kg</span>
          </span>
        </div>}

        {/* 操作ボタン */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn" style={{ flex: 1, height: '48px' }} onClick={onClose} disabled={saving}>
            キャンセル
          </button>
          <button className="btn primary" style={{ flex: 1.5, height: '48px' }} onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : bodyweight ? '基準回数を保存' : '測定した基準を保存'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

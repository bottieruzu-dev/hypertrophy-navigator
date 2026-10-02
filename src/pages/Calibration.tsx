import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { CALIBRATION_TOTAL, getCalibrationExercises } from '../db/queries/calibration';
import { fetchBaselines, saveBaseline } from '../db/queries/workout';
import type { Exercise, SplitType, ExerciseBaseline } from '../db/types';
import { motion, AnimatePresence } from 'framer-motion';

export default function Calibration() {
  const [split, setSplit] = useState<SplitType>('upper_A');
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedEx, setSelectedEx] = useState<Exercise | null>(null);

  // 全ベースライン（保存済みデータ）をローカルDBからリアルタイム取得
  const baselines = useLiveQuery(() => db.baselines.toArray(), []) || [];
  const doneCount = baselines.length;

  useEffect(() => {
    // 初回マウント時にSupabaseから最新データを取得・同期
    fetchBaselines();
  }, []);

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
      {/* Week 0 進捗バー & カウンター */}
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
          const isDone = !!b;
          return (
            <li key={ex.id} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              <button
                className={`row ${isDone ? 'done' : ''}`}
                onClick={() => setSelectedEx(ex)}
              >
                <div className="name">{ex.name}</div>
                <div className="meta">
                  {isDone
                    ? `${b.weightKg} kg × ${b.reps}`
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
  const [weight, setWeight] = useState<number | ''>(existingBaseline?.weightKg ?? '');
  const [reps, setReps] = useState<number | ''>(existingBaseline?.reps ?? '');
  const [rir, setRir] = useState<number | ''>(existingBaseline?.rir ?? 2);
  const [saving, setSaving] = useState(false);

  // Epleyの公式による推定1RM計算
  const numWeight = Number(weight) || 0;
  const numReps = Number(reps) || 0;
  const numRir = Number(rir) || 0;

  const est1rm = numWeight > 0 && numReps > 0
    ? Math.round(numWeight * (1 + (numReps + (numRir >= 4 ? 5 : numRir)) / 30))
    : 0;

  const handleSave = async () => {
    if (weight === '' || reps === '' || rir === '') return;
    setSaving(true);

    const baseline: ExerciseBaseline = {
      exerciseId: exercise.id,
      weightKg: Number(weight),
      reps: Number(reps),
      rir: Number(rir),
      est1rm,
      calibratedAt: Date.now(),
    };

    // ローカル IndexedDB と Supabase へ自動同期・保存
    await saveBaseline(baseline);

    setSaving(false);
    onClose();
  };

  return (
    <motion.div
      className="levelup-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
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
          Week 0 基準重量・RIR の設定
        </p>

        {/* フォーム入力エリア */}
        <div
          className="form-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            marginBottom: '20px',
          }}
        >
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--sub)', marginBottom: '8px', letterSpacing: '0.5px' }}>
              重量 (kg)
            </label>
            <input
              type="number"
              className="btn"
              style={{ background: 'var(--bg)', textAlign: 'center', fontSize: '18px', fontWeight: 'bold', height: '48px' }}
              value={weight}
              placeholder="0"
              onChange={(e) => setWeight(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--sub)', marginBottom: '8px', letterSpacing: '0.5px' }}>
              回数 (reps)
            </label>
            <input
              type="number"
              className="btn"
              style={{ background: 'var(--bg)', textAlign: 'center', fontSize: '18px', fontWeight: 'bold', height: '48px' }}
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
              value={rir}
              placeholder="2"
              onChange={(e) => setRir(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>

        {/* 推定 1RM カード */}
        <div
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
        </div>

        {/* 操作ボタン */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn" style={{ flex: 1, height: '48px' }} onClick={onClose} disabled={saving}>
            キャンセル
          </button>
          <button className="btn primary" style={{ flex: 1.5, height: '48px' }} onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '基準重量を確定'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
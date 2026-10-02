import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { fetchBaselines, saveBaseline } from '../db/queries/workout';
import type { ExerciseBaseline, Exercise } from '../db/types';

export default function Calibration() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [baselines, setBaselines] = useState<Record<string, ExerciseBaseline>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // 初回ロード：種目マスタと Supabase からのベースラインを取得
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const exList = await db.exercises.toArray();
        setExercises(exList);

        // Supabase から最新の基準重量を取得
        const remoteBaselines = await fetchBaselines();
        const map: Record<string, ExerciseBaseline> = {};
        
        remoteBaselines.forEach((b) => {
          map[b.exerciseId] = b;
        });

        setBaselines(map);
      } catch (err) {
        console.error('データ読み込みエラー:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // 重量・回数・RIR の入力変更
  const handleChange = (exerciseId: string, field: keyof ExerciseBaseline, value: number) => {
    setBaselines((prev) => {
      const current = prev[exerciseId] || {
        exerciseId,
        weightKg: 0,
        reps: 0,
        rir: 0,
        est1rm: 0,
        calibratedAt: new Date().toISOString(),
      };
      const updated = { ...current, [field]: value };
      // 簡易 1RM 計算 (Epleyの式)
      if (updated.weightKg > 0 && updated.reps > 0) {
        updated.est1rm = Math.round(updated.weightKg * (1 + updated.reps / 30));
      }
      return { ...prev, [exerciseId]: updated };
    });
  };

  // 1種目の保存（Supabase へ即時同期）
  const handleSave = async (exerciseId: string) => {
    const target = baselines[exerciseId];
    if (!target) return;

    setSavingId(exerciseId);
    target.calibratedAt = new Date().toISOString();

    const success = await saveBaseline(target);
    if (success) {
      // ローカルの IndexedDB にもキャッシュとして保存
      await db.baselines.put(target);
      alert('Supabase へ正常に保存されました！');
    } else {
      alert('保存に失敗しました。接続を確認してください。');
    }
    setSavingId(null);
  };

  if (loading) return <div className="page"><p>Supabase からデータを読み込み中…</p></div>;

  return (
    <div className="page">
      <h1>基準重量（キャリブレーション）</h1>
      <p className="sub">記録したデータは自動的に Supabase へ保存・復元されます。</p>

      <div className="card-list">
        {exercises.map((ex) => {
          const b = baselines[ex.id] || { exerciseId: ex.id, weightKg: 0, reps: 0, rir: 0, est1rm: 0 };
          const isSaving = savingId === ex.id;

          return (
            <div key={ex.id} className="card">
              <h3>{ex.nameJa}</h3>
              <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', margin: '12px 0' }}>
                <div>
                  <label>重量 (kg)</label>
                  <input
                    type="number"
                    value={b.weightKg || ''}
                    onChange={(e) => handleChange(ex.id, 'weightKg', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>回数</label>
                  <input
                    type="number"
                    value={b.reps || ''}
                    onChange={(e) => handleChange(ex.id, 'reps', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>RIR</label>
                  <input
                    type="number"
                    value={b.rir ?? ''}
                    onChange={(e) => handleChange(ex.id, 'rir', Number(e.target.value))}
                  />
                </div>
              </div>
              <p className="mono">推定 1RM: <strong>{b.est1rm || 0} kg</strong></p>
              <button
                className="btn primary"
                onClick={() => handleSave(ex.id)}
                disabled={isSaving}
                style={{ marginTop: '8px', width: '100%' }}
              >
                {isSaving ? '保存中…' : 'Supabase へ保存'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Exercise, SplitType } from '../db/types';
import { effectiveIncrement, formatWeight } from '../engine/units';
import { prescribeNextLoad } from '../engine/progression';
import { getExerciseRecommendation } from '../engine/generator';
import { BodyAnatomy } from '../components/BodyAnatomy';
import { TrainerGuide } from '../components/TrainerGuide';
import { CALIBRATION_PLAN } from '../db/queries/calibration';
import { fireNeonConfetti, ACHIEVEMENTS, type Achievement } from '../engine/achievements';
import { LevelUpModal } from '../components/LevelUpModal';

export default function Workout() {
  const [split, setSplit] = useState<SplitType>('upper_A');
  const [exerciseIndex, setExerciseIndex] = useState(0);

  const exercises = useLiveQuery(async () => {
    const ids = CALIBRATION_PLAN[split] ?? [];
    const list = await db.exercises.bulkGet(ids);
    return list.filter((e): e is Exercise => !!e && e.isAvailable === 1 && e.silhouetteTag !== 'forbidden');
  }, [split]);

  const currentEx = exercises?.[exerciseIndex] ?? null;
  const totalCount = exercises?.length ?? 0;

  return (
    <div className="page">
      <header className="hdr">
        <div className="tabs">
          {(['upper_A', 'lower', 'upper_B'] as SplitType[]).map((s) => (
            <button
              key={s}
              className={`tab ${s === split ? 'on' : ''}`}
              onClick={() => { setSplit(s); setExerciseIndex(0); }}
            >
              {s.replace('upper_', 'Upper ').replace('lower', 'Lower')}
            </button>
          ))}
        </div>
        {currentEx ? (
          <>
            <h2>{currentEx.name}</h2>
            <p className="sub">
              種目 {exerciseIndex + 1} / {totalCount} ・ 目標 {currentEx.repRange[0]}–{currentEx.repRange[1]} reps
            </p>
          </>
        ) : (
          <p className="sub">種目を読み込み中、または対象種目がありません。</p>
        )}
      </header>

      {currentEx && (
        <LoggerSection
          exercise={currentEx}
          onNextExercise={() => setExerciseIndex((i) => Math.min(i + 1, Math.max(0, totalCount - 1)))}
        />
      )}
    </div>
  );
}

function LoggerSection({ exercise, onNextExercise }: { exercise: Exercise; onNextExercise: () => void }) {
  const baseline = useLiveQuery(() => db.baselines.get(exercise.id), [exercise.id]);
  const historySets = useLiveQuery(
    () => db.sets.where('exerciseId').equals(exercise.id).reverse().toArray(),
    [exercise.id]
  );
  const recommendation = useLiveQuery(() => getExerciseRecommendation(exercise), [exercise.id]);
  const credits = useLiveQuery(() => db.muscleCredits.where('exerciseId').equals(exercise.id).toArray(), [exercise.id]);

  const primaryMuscles = credits?.filter((c) => c.credit >= 0.8).map((c) => c.muscle) ?? [];
  const secondaryMuscles = credits?.filter((c) => c.credit < 0.8).map((c) => c.muscle) ?? [];

  const lastSet = historySets?.[0];
  const defaultWeight = lastSet?.actualWeight ?? baseline?.weightKg ?? 10;
  const defaultReps = lastSet?.actualReps ?? baseline?.reps ?? 10;

  const [weight, setWeight] = useState(defaultWeight);
  const [reps, setReps] = useState(defaultReps);
  const [rir, setRir] = useState(2);
  const [timerSec, setTimerSec] = useState<number | null>(null);
  const [unlockedAchievement, setUnlockedAchievement] = useState<Achievement | null>(null);

  useEffect(() => {
    if (lastSet) {
      setWeight(lastSet.actualWeight);
      setReps(lastSet.actualReps);
    } else if (baseline) {
      setWeight(baseline.weightKg);
      setReps(baseline.reps);
    }
  }, [baseline, lastSet, exercise.id]);

  useEffect(() => {
    if (timerSec === null || timerSec <= 0) return;
    const timer = setInterval(() => setTimerSec((s) => (s && s > 1 ? s - 1 : null)), 1000);
    return () => clearInterval(timer);
  }, [timerSec]);

  const step = effectiveIncrement(exercise, weight);

  const handleLogSet = async () => {
    const date = new Date().toISOString().slice(0, 10);
    const setOrder = (historySets?.length ?? 0) + 1;
    const presc = prescribeNextLoad({ weight, reps, rir }, exercise);
    const addedVolume = Number((weight * reps).toFixed(1));

    await db.sets.add({
      sessionId: 1,
      exerciseId: exercise.id,
      date,
      setOrder,
      targetWeight: presc.targetWeight,
      actualWeight: weight,
      targetReps: presc.targetReps,
      actualReps: reps,
      targetRir: 2,
      actualRir: rir,
      volumeLoad: addedVolume,
      est1rm: Number((weight * (1 + (reps + rir) / 30)).toFixed(1)),
      isWarmup: 0,
      mode: presc.mode,
    });

    // 🌟 サプライズ演出1: ネオン・スパークの爆発
    fireNeonConfetti();

    // 🌟 サプライズ演出2: 累計ボリューム計算とレベルアップチェック
    const allSets = await db.sets.toArray();
    const totalVol = allSets.reduce((sum, s) => sum + (s.volumeLoad || 0), 0);
    
    // 直前までの累計ボリュームで未解放だった最大の称号を探す
    const prevVol = totalVol - addedVolume;
    const newUnlocked = ACHIEVEMENTS.find(
      (a) => prevVol < a.requiredVolumeKg && totalVol >= a.requiredVolumeKg
    );

    if (newUnlocked) {
      setUnlockedAchievement(newUnlocked);
    }

    setTimerSec(exercise.type === 'compound' ? 150 : 75);
  };

  return (
    <div className="card">
      {/* 🌟 サプライズ・レベルアップダイアログ */}
      <LevelUpModal
        achievement={unlockedAchievement}
        onClose={() => setUnlockedAchievement(null)}
      />

      {/* 🤖 AIトレーナー4ステップタップ解説 */}
      <TrainerGuide exercise={exercise} />

      {/* 筋肉発光ネオンアナトミーマップ */}
      <BodyAnatomy primaryMuscles={primaryMuscles} secondaryMuscles={secondaryMuscles} />

      {recommendation && (
        <div className="hint converged" style={{ marginBottom: '16px' }}>
          <strong>🤖 AI処方アドバイス:</strong> {recommendation.reason}
        </div>
      )}

      {timerSec !== null && (
        <div className="hint converged" style={{ textAlign: 'center', fontSize: '20px', fontWeight: 'bold' }}>
          ⏱ 休憩タイマー: {Math.floor(timerSec / 60)}分 {timerSec % 60}秒
        </div>
      )}

      <div className="log" style={{ marginBottom: '16px' }}>
        <h3>前回記録 / ベースライン</h3>
        <p className="mono">
          {lastSet
            ? `直近: ${formatWeight(lastSet.actualWeight, exercise)} × ${lastSet.actualReps} reps (RIR ${lastSet.actualRir})`
            : baseline
            ? `基準: ${formatWeight(baseline.weightKg, exercise)} × ${baseline.reps} reps`
            : '未測定（Week 0で確定してください）'}
        </p>
      </div>

      {exercise.increment > 0 && (
        <section className="field">
          <label>重量</label>
          <div className="stepper">
            <button onClick={() => setWeight((w) => Math.max(step, w - step))}>−</button>
            <span className="value">{formatWeight(weight, exercise)}</span>
            <button onClick={() => setWeight((w) => w + step)}>＋</button>
          </div>
        </section>
      )}

      <section className="field">
        <label>レップ数</label>
        <div className="stepper">
          <button onClick={() => setReps((r) => Math.max(1, r - 1))}>−</button>
          <span className="value">{reps} reps</span>
          <button onClick={() => setReps((r) => r + 1)}>＋</button>
        </div>
      </section>

      <section className="field">
        <label>RIR（余力）</label>
        <div className="rir">
          {[0, 1, 2, 3, 4].map((v) => (
            <button
              key={v}
              className={`rir-btn ${rir === v ? 'on' : ''}`}
              onClick={() => setRir(v)}
            >
              {v === 4 ? '4+' : v}
            </button>
          ))}
        </div>
      </section>

      <button className="btn primary big" onClick={handleLogSet} style={{ marginBottom: '12px' }}>
        1セット完了して休憩タイマー起動
      </button>

      <button className="btn" onClick={onNextExercise}>
        次の種目へ進む ›
      </button>
    </div>
  );
}
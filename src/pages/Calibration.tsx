import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Exercise, SplitType } from '../db/types';
import {
  CALIBRATION_PLAN, CALIBRATION_TOTAL, getCalibrationExercises,
  getBaselineMap, getOrCreateCalibrationSession, saveCalibrationResult,
} from '../db/queries/calibration';
import {
  CALIB, suggestNext, finalizeBaseline, targetRepsOf, type Attempt,
} from '../engine/calibration';
import { effectiveIncrement, formatWeight } from '../engine/units';

const SPLIT_LABEL: Record<SplitType, string> = {
  upper_A: '上半身 A（背中・肩中部・二頭）',
  lower: '下半身',
  upper_B: '上半身 B（胸上部・肩・三頭）',
};

export default function Calibration() {
  const [split, setSplit] = useState<SplitType>('upper_A');
  const [active, setActive] = useState<Exercise | null>(null);

  const exercises = useLiveQuery(() => getCalibrationExercises(split), [split]);
  const baselines = useLiveQuery(() => getBaselineMap(), []);
  const doneCount = baselines?.size ?? 0;

  if (active) {
    return (
      <Wizard
        exercise={active}
        split={split}
        onClose={() => setActive(null)}
      />
    );
  }

  return (
    <div className="page">
      <header className="hdr">
        <h1>Week 0 キャリブレーション</h1>
        <div className="progress">
          <div className="bar" style={{ width: `${(doneCount / CALIBRATION_TOTAL) * 100}%` }} />
        </div>
        <p className="sub">{doneCount} / {CALIBRATION_TOTAL} 種目 完了</p>
      </header>

      <div className="tabs">
        {(Object.keys(CALIBRATION_PLAN) as SplitType[]).map((s) => (
          <button
            key={s}
            className={`tab ${s === split ? 'on' : ''}`}
            onClick={() => setSplit(s)}
          >
            {s.replace('upper_', 'Upper ').replace('lower', 'Lower')}
          </button>
        ))}
      </div>
      <p className="sub">{SPLIT_LABEL[split]}</p>

      <ul className="list">
        {exercises?.map((ex) => {
          const b = baselines?.get(ex.id);
          return (
            <li key={ex.id}>
              <button className={`row ${b ? 'done' : ''}`} onClick={() => setActive(ex)}>
                <span className="name">{ex.name}</span>
                <span className="meta">
                  {b
                    ? `${formatWeight(b.weightKg, ex)} × ${b.reps}`
                    : `${ex.repRange[0]}–${ex.repRange[1]} reps`}
                </span>
                <span className="mark">{b ? '✓' : '›'}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="note">
        各種目3セット。1セット目は「これくらいかな」で構いません。
        RIRの入力から2・3セット目の重量を自動計算します。
      </p>
    </div>
  );
}

function Wizard({
  exercise, split, onClose,
}: { exercise: Exercise; split: SplitType; onClose: () => void }) {
  const inc = effectiveIncrement(exercise, 10);
  const [weight, setWeight] = useState<number>(
    exercise.increment === 0 ? 0 : guessInitial(exercise)
  );
  const [reps, setReps] = useState<number>(targetRepsOf(exercise));
  const [rir, setRir] = useState<number>(2);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [suggestions, setSuggestions] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  const setNo = attempts.length + 1;
  const isLast = setNo === CALIB.setsPerExercise;

  const lastSuggestion = useMemo(() => {
    if (attempts.length === 0) return null;
    return suggestNext(exercise, attempts[attempts.length - 1]);
  }, [attempts, exercise]);

  const step = exercise.increment === 0 ? 0 : effectiveIncrement(exercise, weight);

  const handleNext = async () => {
    const attempt: Attempt = { setNo, weight, reps, rir };
    const next = [...attempts, attempt];
    setAttempts(next);
    setSuggestions([...suggestions, weight]);

    if (next.length < CALIB.setsPerExercise) {
      const s = suggestNext(exercise, attempt);
      setWeight(s.weight);
      setReps(s.targetReps);
      setRir(2);
      return;
    }

    setSaving(true);
    const baseline = finalizeBaseline(exercise, next);
    const sessionId = await getOrCreateCalibrationSession(split);
    await saveCalibrationResult({
      sessionId,
      exercise,
      attempts: next,
      suggestions: [...suggestions, weight],
      baseline,
    });
    setSaving(false);
    onClose();
  };

  return (
    <div className="page wizard">
      <header className="hdr">
        <button className="back" onClick={onClose}>‹ 戻る</button>
        <h2>{exercise.name}</h2>
        <p className="sub">
          Set {setNo} / {CALIB.setsPerExercise} ・ 目標 {exercise.repRange[0]}–{exercise.repRange[1]} reps
        </p>
      </header>

      {lastSuggestion && (
        <div className={`hint ${lastSuggestion.verdict}`}>
          <p>{lastSuggestion.message}</p>
          <p className="mono">推定1RM {lastSuggestion.est1rm} kg</p>
          {lastSuggestion.repProgressionOnly && exercise.increment > 0 && (
            <p className="mono warn">
              ▲ 刻み {inc}kg が重量比4%超。以降はレップ漸進で管理します
            </p>
          )}
        </div>
      )}

      {exercise.increment > 0 && (
        <section className="field">
          <label>重量</label>
          <div className="stepper">
            <button onClick={() => setWeight((w) => Math.max(step, w - step))}>−</button>
            <span className="value">{formatWeight(weight, exercise)}</span>
            <button onClick={() => setWeight((w) => w + step)}>＋</button>
          </div>
          <p className="mono sub">刻み {step} kg</p>
        </section>
      )}

      <section className="field">
        <label>実施レップ数</label>
        <div className="stepper">
          <button onClick={() => setReps((r) => Math.max(1, r - 1))}>−</button>
          <span className="value">{reps} reps</span>
          <button onClick={() => setReps((r) => r + 1)}>＋</button>
        </div>
      </section>

      <section className="field">
        <label>RIR（あと何回挙がったか）</label>
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

      {attempts.length > 0 && (
        <section className="log">
          <h3>記録済み</h3>
          {attempts.map((a) => (
            <p key={a.setNo} className="mono">
              Set{a.setNo}: {a.weight}kg × {a.reps} (RIR {a.rir >= 4 ? '4+' : a.rir})
            </p>
          ))}
        </section>
      )}

      <button className="btn primary big" onClick={handleNext} disabled={saving}>
        {saving ? '保存中…' : isLast ? 'ベースラインを確定' : `Set ${setNo} を記録して次へ`}
      </button>
    </div>
  );
}

function guessInitial(ex: Exercise): number {
  switch (ex.equipment) {
    case 'dumbbell': return ex.type === 'isolation' ? 8 : 12;
    case 'cable': return ex.type === 'isolation' ? 10 : 30;
    case 'machine': return ex.type === 'isolation' ? 20 : 35;
    case 'plate': return 20;
    case 'barbell': return 40;
    case 'smith': return 20;
    default: return 0;
  }
}
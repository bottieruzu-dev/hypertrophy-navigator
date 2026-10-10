import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { DailyPlan, Exercise, PlannedExercise, SetRecord, SplitType, WorkoutContext } from '../db/types';
import { BodyAnatomy } from '../components/BodyAnatomy';
import { TrainerGuide } from '../components/TrainerGuide';
import { buildDailyPlan, proposeReplacement, SORE_GROUPS, SPLIT_LABELS, SPLIT_ORDER, validBaseline, WORKOUT_GROUPS } from '../engine/planner';
import { todayInJapan } from '../engine/dates';
import { effectiveIncrement, formatWeight } from '../engine/units';
import { correctLoggedSet, finishWorkout, logPlannedSet, replaceExercise, skipExercise, startWorkout } from '../db/queries/dailyPlan';
import { fetchBaselines, retryPendingSync } from '../db/queries/workout';
import { supabase } from '../lib/supabase';
import { CALIBRATION_PLAN } from '../db/queries/calibration';
import { BackupControls } from '../components/BackupControls';

export default function Workout({ onCalibration }: { onCalibration: () => void }) {
  const [now, setNow] = useState(Date.now);
  const date = todayInJapan(new Date(now));
  const [context, setContext] = useState<WorkoutContext>({ minutes: 60, readiness: 'normal', soreMuscles: [], pain: false });
  const [busy, setBusy] = useState(false);
  const actionPending = useRef(false);
  const [message, setMessage] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const data = useLiveQuery(async () => ({ exercises: await db.exercises.toArray(), baselines: await db.baselines.toArray(), sets: await db.sets.toArray(), sessions: await db.sessions.toArray(), plans: await db.plans.toArray(), muscles: await db.muscles.toArray(), credits: await db.muscleCredits.toArray(), pending: await db.settings.where('key').startsWith('sync:').count() }), []);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const timer = window.setInterval(update, 30000);
    document.addEventListener('visibilitychange', update);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, []);
  const active = data?.plans.find(p => p.status === 'active');
  const draft = useMemo(() => data ? buildDailyPlan({ ...data, date, now, context }) : null, [data, date, now, context]);
  const todayFinished = data?.plans.filter(p => p.date === date && p.status !== 'active').sort((a, b) => b.createdAt - a.createdAt)[0];
  const activeSets = data?.sets.filter(s => s.sessionId === active?.sessionId) ?? [];
  const complete = (item: PlannedExercise) => !!active?.skippedExerciseIds.includes(item.exerciseId) || activeSets.filter(s => !s.isWarmup && s.exerciseId === item.exerciseId).length >= item.sets;
  const currentItem = active?.exercises.find(e => e.exerciseId === selectedId && !active.skippedExerciseIds.includes(e.exerciseId)) ?? active?.exercises.find(e => !complete(e)) ?? active?.exercises.find(e => !active.skippedExerciseIds.includes(e.exerciseId));
  const currentExercise = data?.exercises.find(e => e.id === currentItem?.exerciseId);
  const doneSets = activeSets.filter(s => !s.isWarmup).length;
  const totalSets = active?.exercises.reduce((sum, e) => sum + e.sets, 0) ?? 0;
  const allDone = active?.exercises.every(complete);
  const baselineIds = [...new Set(Object.values(CALIBRATION_PLAN).flat())];
  const calibrated = data?.exercises.filter(e => baselineIds.includes(e.id) && validBaseline(data.baselines.find(b => b.exerciseId === e.id), e)).length ?? 0;

  const action = async (fn: () => Promise<unknown>, success = '') => {
    if (actionPending.current) return;
    actionPending.current = true;
    setBusy(true); setMessage('');
    try { await fn(); setMessage(success); return true; } catch (error) { setMessage(error instanceof Error ? error.message : '保存できませんでした。もう一度お試しください。'); return false; }
    finally { actionPending.current = false; setBusy(false); setNow(Date.now()); }
  };

  if (!data || !draft) return <div className="page"><p role="status">記録からメニューを準備しています…</p></div>;
  return <main className="page workout-page">
    <header className="workout-heading"><div><p className="eyebrow">YOUR TRAINING DAY</p><h1>今日のトレーニング</h1><p className="sub">{date.replaceAll('-', '/')} · Week0を引き継ぐパーソナルメニュー</p></div><span className="status-pill">{calibrated}/{baselineIds.length} 測定済み</span></header>
    <div className="save-status"><span>{supabase ? data.pending ? `端末保存済み · クラウド送信待ち ${data.pending}件` : '端末保存済み · 送信待ちなし' : 'この端末に保存 · クラウド未設定'}</span>{supabase && <button disabled={busy} onClick={() => action(async () => { if (!(await retryPendingSync())) throw new Error('同期できませんでした。端末の記録は保持しています。'); }, 'クラウドへの同期を確認しました。')}>再送</button>}</div>
    {message && <p className="notice" role="status">{message}</p>}
    {!active && <>
      {todayFinished && <section className="card completion-card"><p className="eyebrow">SAVED</p><h2>{todayFinished.status === 'completed' ? '今日のメニューは完了しました' : '途中終了の記録を保存しました'}</h2><p>{SPLIT_LABELS[todayFinished.split]} · {data.sets.filter(s => s.sessionId === todayFinished.sessionId && !s.isWarmup).length}セット</p><p className="sub">同じ日の追加トレーニングは、直近の刺激を考慮して提案します。</p></section>}
      <section className="card preparation-card"><h2>今日のコンディション</h2><p className="sub">時間と体調に合わせてメニューが変わります。</p>
        <label className="control-label" htmlFor="minutes">ジムで使える時間</label><select id="minutes" value={context.minutes} onChange={e => setContext({ ...context, minutes: Number(e.target.value) })}>{[30,45,60,75,90].map(n => <option key={n} value={n}>{n}分</option>)}</select>
        <div className="option-row" aria-label="疲労感">{(['normal','tired'] as const).map(v => <button key={v} aria-pressed={context.readiness === v} className={context.readiness === v ? 'selected' : ''} onClick={() => setContext({ ...context, readiness: v })}>{v === 'normal' ? 'いつも通り' : '疲れ気味・睡眠不足'}</button>)}</div>
        <p className="control-label">筋肉痛が強い部位（あれば選択）</p><div className="muscle-options">{SORE_GROUPS.map(g => { const on = g.muscles.every(m => context.soreMuscles.includes(m)); return <button key={g.label} aria-pressed={on} className={on ? 'selected' : ''} onClick={() => setContext({ ...context, soreMuscles: on ? context.soreMuscles.filter(m => !g.muscles.includes(m)) : [...new Set([...context.soreMuscles, ...g.muscles])] })}>{g.label}</button>; })}</div>
        <label className="check-line"><input type="checkbox" checked={context.pain} onChange={e => setContext({ ...context, pain: e.target.checked })}/>関節などに痛みがある</label>
        <label className="control-label" htmlFor="split">今日の部位</label><select id="split" value={context.split ?? 'auto'} onChange={e => setContext({ ...context, split: e.target.value === 'auto' ? undefined : e.target.value as SplitType })}><option value="auto">履歴から自動で選ぶ</option>{SPLIT_ORDER.map(s => <option key={s} value={s}>{SPLIT_LABELS[s]}</option>)}</select>
      </section>
      <section className="card plan-card"><p className="eyebrow">TODAY'S MENU</p><h2>{SPLIT_LABELS[draft.split]}</h2><p className="sub">{draft.reason}</p><div className="plan-stats"><span><strong>{draft.exercises.length}</strong> 種目</span><span><strong>{draft.exercises.reduce((s,e) => s + e.sets,0)}</strong> セット</span><span>約 <strong>{draft.estimatedMinutes}</strong> 分</span></div>
        <p className="sub">開始前に5分ほど体を温め、最初の重い種目は軽い重量で動きを確認。所要時間は準備・休憩を含む目安です。</p>
        <MenuList items={draft.exercises} exercises={data.exercises}/>
        {draft.warnings.map(w => <p className="notice" key={w}>{w}</p>)}
        <button className="btn primary big" disabled={busy || !draft.exercises.length || context.pain} onClick={() => action(async () => { await startWorkout(draft); setSelectedId(null); })}>{busy ? '保存中…' : 'このメニューで開始'}</button>
      </section>
      <section className="card"><h2>Week0の記録を使っています</h2><p className="sub">全種目のやり直しは不要です。未測定の種目は自動で省略し、必要なものだけ追加できます。ダンベルは片手分、プレート式はWeek0と同じ数え方で入力してください。</p><div className="two-actions"><button className="btn" onClick={onCalibration}>Week0を確認・追加</button>{supabase && <button className="btn" disabled={busy} onClick={() => action(() => fetchBaselines(), 'クラウドのWeek0を確認しました。新しい記録だけを取り込みました。')}>クラウドから読込</button>}</div></section>
    </>}
    {active && <>
      <section className="card session-summary"><p className="eyebrow">SESSION IN PROGRESS</p><h2>{SPLIT_LABELS[active.split]}</h2><p className="sub">{active.date} 開始 · 途中で閉じても続きから再開できます</p><div className="plan-stats"><span><strong>{doneSets}/{totalSets}</strong> セット</span><span>約 <strong>{active.estimatedMinutes}</strong> 分</span></div><progress value={Math.min(doneSets,totalSets)} max={totalSets} aria-label="セットの進捗"/>
        <MenuList items={active.exercises} exercises={data.exercises} sets={activeSets} skipped={active.skippedExerciseIds} onSelect={id => setSelectedId(id)} selectedId={currentItem?.exerciseId}/>
      </section>
      {currentExercise && currentItem && <ExerciseLogger key={`${active.sessionId}:${currentExercise.id}`} plan={active} item={currentItem} exercise={currentExercise} sets={activeSets.filter(s => s.exerciseId === currentExercise.id)} credits={data.credits.filter(c => c.exerciseId === currentExercise.id)} disabled={busy} onLog={actual => action(async () => { await logPlannedSet(active.sessionId,currentExercise.id,actual); if (!actual.isWarmup && activeSets.filter(s => !s.isWarmup && s.exerciseId === currentExercise.id).length + 1 >= currentItem.sets) setSelectedId(null); }, 'セットを端末に保存しました。')} onCorrect={(id,actual) => action(() => correctLoggedSet(id,actual), '実績を修正しました。')} onSkip={() => action(() => skipExercise(active.sessionId,currentExercise.id))} alternatives={(() => {
        const group = WORKOUT_GROUPS[active.split].find(g => g.includes(currentExercise.id)) ?? [];
        return group.filter(id => id !== currentExercise.id && !active.exercises.some(e => e.exerciseId === id)).flatMap(id => {
          const ex = data.exercises.find(e => e.id === id); const b = data.baselines.find(b => b.exerciseId === id);
          if (!ex || !validBaseline(b,ex) || ex.isAvailable !== 1 || ex.silhouetteTag === 'forbidden') return [];
          const replacement = proposeReplacement(active, currentExercise.id, id, { ...data, date, now, context: active.context });
          return replacement ? [{ exercise: ex, item: replacement }] : [];
        });
      })()} onReplace={item => action(() => replaceExercise(active.sessionId,currentExercise.id,item))}/>}
      {allDone && <section className="card completion-card"><h2>予定の種目が終わりました</h2><p>お疲れさまでした。「完了して保存」で次回の提案に反映します。</p></section>}
      <RestTimer plan={active}/>
      <div className="two-actions"><button className="btn" disabled={busy} onClick={() => action(() => finishWorkout(active.sessionId,'stopped'), '途中終了しました。実施したセットは保存されています。')}>途中終了して保存</button><button className="btn primary" disabled={busy || !allDone} onClick={() => action(() => finishWorkout(active.sessionId,'completed'), 'メニュー完了。次回は今回の実績から調整します。')}>完了して保存</button></div>
    </>}
    <details className="card history-panel"><summary>最近のトレーニング</summary>{data.plans.filter(p => p.status !== 'active').sort((a,b) => b.createdAt-a.createdAt).slice(0,10).map(p => <div className="history-row" key={p.sessionId}><strong>{p.date} · {SPLIT_LABELS[p.split]}</strong><span>{p.status === 'completed' ? '完了' : '途中終了'} · {data.sets.filter(s => s.sessionId === p.sessionId && !s.isWarmup).length} セット</span></div>)}{!data.plans.some(p => p.status !== 'active') && <p className="sub">ここに本番の履歴が残ります。旧版のセット記録も保持しています。</p>}</details>
    <BackupControls/>
  </main>;
}

function MenuList({ items, exercises, sets = [], skipped = [], onSelect, selectedId }: { items: PlannedExercise[]; exercises: Exercise[]; sets?: SetRecord[]; skipped?: number[]; onSelect?: (id: number) => void; selectedId?: number }) {
  return <ol className="daily-menu">{items.map((item,index) => { const ex = exercises.find(e => e.id === item.exerciseId); if (!ex) return null; const count = sets.filter(s => !s.isWarmup && s.exerciseId === ex.id).length; const done = count >= item.sets; const skip = skipped.includes(ex.id); return <li key={ex.id} className={`${done || skip ? 'menu-done' : ''} ${selectedId === ex.id ? 'menu-current' : ''}`}><button disabled={!onSelect || skip} onClick={() => onSelect?.(ex.id)}><span className="menu-number">{done ? '✓' : skip ? '–' : String(index+1).padStart(2,'0')}</span><span className="menu-content"><strong>{ex.name}</strong><span>{formatWeight(item.targetWeight,ex)} × {item.targetReps}回 × {item.sets}セット · RIR {item.targetRir}</span><small>{onSelect ? skip ? 'スキップ' : `${count}/${item.sets} 完了 · ` : ''}休憩 {item.restSec}秒 · {item.source === 'baseline' ? 'Week0基準' : '前回実績'}</small></span></button></li>; })}</ol>;
}

function ExerciseLogger({ plan, item, exercise, sets, credits, disabled, onLog, onCorrect, onSkip, alternatives, onReplace }: { plan: DailyPlan; item: PlannedExercise; exercise: Exercise; sets: SetRecord[]; credits: { muscle: string; credit: number }[]; disabled: boolean; onLog: (actual: { weight: number; reps: number; rir: number; isWarmup: boolean }) => Promise<boolean | undefined>; onCorrect: (id: number, actual: { weight: number; reps: number; rir: number }) => Promise<boolean | undefined>; onSkip: () => void; alternatives: { exercise: Exercise; item: PlannedExercise }[]; onReplace: (item: PlannedExercise) => void }) {
  const [weight,setWeight] = useState(String(item.targetWeight));
  const [reps,setReps] = useState(String(item.targetReps));
  const [rir,setRir] = useState(item.targetRir);
  const [warmup,setWarmup] = useState(false);
  const [editingId,setEditingId] = useState<number | null>(null);
  const count = sets.filter(s => !s.isWarmup).length;
  const step = effectiveIncrement(exercise, Number(weight));
  return <section className="card exercise-logger"><p className="eyebrow">{count >= item.sets ? 'SETS COMPLETED' : `SET ${count+1} / ${item.sets}`}</p><h2>{exercise.name}</h2><div className="prescription"><strong>{formatWeight(item.targetWeight,exercise)} × {item.targetReps}回</strong><span>{item.sets}セット · RIR {item.targetRir} · 休憩{item.restSec}秒</span></div><p className="sub">{item.reason}</p>
    <BodyAnatomy primaryMuscles={credits.filter(c => c.credit === 1).map(c => c.muscle)} secondaryMuscles={credits.filter(c => c.credit < 1).map(c => c.muscle)}/>
    <TrainerGuide exercise={exercise}/>
    <h3>{editingId ? '記録済みセットを修正中' : '実際にできた内容'}</h3>
    {exercise.increment > 0 && <div className="field"><label htmlFor="actual-weight">重量（kg）{exercise.equipment === 'dumbbell' ? ' · 片手分' : ''}</label><div className="stepper"><button disabled={disabled} aria-label="重量を減らす" onClick={() => setWeight(String(Math.max(step, Math.round((Number(weight)-step)*100)/100)))}>−</button><input id="actual-weight" inputMode="decimal" type="number" min="0" step="any" value={weight} onChange={e => setWeight(e.target.value)}/><button disabled={disabled} aria-label="重量を増やす" onClick={() => setWeight(String(Math.round((Number(weight)+step)*100)/100))}>＋</button></div></div>}
    <div className="field"><label htmlFor="actual-reps">できた回数</label><div className="stepper"><button disabled={disabled} aria-label="回数を減らす" onClick={() => setReps(String(Math.max(1,Number(reps)-1)))}>−</button><input id="actual-reps" inputMode="numeric" type="number" min="1" max="100" step="1" value={reps} onChange={e => setReps(e.target.value)}/><button disabled={disabled} aria-label="回数を増やす" onClick={() => setReps(String(Math.min(100,Number(reps)+1)))}>＋</button></div></div>
    <div className="field"><label>RIR · あと何回できそうでしたか？</label><p className="sub">0＝限界、2＝あと2回、4+＝4回以上。限界まで行う必要はありません。</p><div className="rir">{[0,1,2,3,4].map(v => <button key={v} aria-pressed={rir===v} disabled={disabled} className={`rir-btn ${rir===v?'on':''}`} onClick={() => setRir(v)}>{v===4?'4+':v}</button>)}</div></div>
    <label className="check-line"><input type="checkbox" checked={warmup} disabled={disabled || editingId!==null} onChange={e => setWarmup(e.target.checked)}/>ウォームアップとして記録（予定セットに数えない）</label>
    <button className="btn primary big" disabled={disabled || weight==='' || reps==='' || (!editingId && count >= item.sets)} onClick={async () => {
      const actual = { weight: Number(weight), reps: Number(reps), rir, isWarmup: warmup };
      const saved = editingId ? await onCorrect(editingId,actual) : await onLog(actual);
      if (saved && (warmup || editingId)) { setEditingId(null); setWarmup(false); setWeight(String(item.targetWeight)); setReps(String(item.targetReps)); setRir(item.targetRir); }
    }}>{disabled ? '保存中…' : editingId ? 'この記録を修正して保存' : count >= item.sets ? '予定セットは完了しました' : warmup ? 'ウォームアップを記録' : '1セット完了・保存して休憩'}</button>
    {editingId && <button className="btn" disabled={disabled} onClick={() => { setEditingId(null); setWarmup(false); setWeight(String(item.targetWeight)); setReps(String(item.targetReps)); setRir(item.targetRir); }}>修正をキャンセル</button>}
    {sets.length > 0 && <div className="set-history"><h3>今回の記録</h3>{sets.map(s => <div className="logged-set" key={s.id}><p>{s.isWarmup ? '準備' : '本番'} · {formatWeight(s.actualWeight,exercise)} × {s.actualReps}回 · RIR {s.actualRir >= 4 ? '4+' : s.actualRir}</p><button disabled={disabled} onClick={() => { setEditingId(s.id!); setWeight(String(s.actualWeight)); setReps(String(s.actualReps)); setRir(Math.min(4,s.actualRir)); setWarmup(!!s.isWarmup); }}>修正</button></div>)}</div>}
    {count < item.sets && <details className="exercise-options"><summary>器具が空いていない・今日は実施しない</summary><p className="sub">交換先は、その種目自身の測定済み記録を使います。記録後はスキップできます。</p>{!sets.length && alternatives.map(a => <button className="btn" key={a.exercise.id} disabled={disabled} onClick={() => onReplace(a.item)}>{a.exercise.name} に交換</button>)}<button className="btn" disabled={disabled} onClick={onSkip}>この種目をスキップ</button></details>}
    <p className="sub">開始日：{plan.date} · 痛みが出たら動作を止め、途中終了できます。</p>
  </section>;
}

function RestTimer({ plan }: { plan: DailyPlan }) {
  const [now,setNow] = useState(Date.now);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()),1000); return () => clearInterval(timer); }, []);
  const remaining = Math.max(0,Math.ceil(((plan.restEndsAt ?? 0)-now)/1000));
  if (!plan.restEndsAt) return null;
  return <div className="rest-timer" role="timer"><span>{remaining ? '次のセットまで休憩' : '休憩の目安が終わりました'}</span><strong>{Math.floor(remaining/60)}:{String(remaining%60).padStart(2,'0')}</strong><small>息が整ってから再開してください</small></div>;
}

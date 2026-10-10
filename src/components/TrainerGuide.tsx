import { useState } from 'react';
import type { Exercise } from '../db/types';
import { getExerciseSteps } from '../engine/exerciseGuides';

export function TrainerGuide({ exercise }: { exercise: Exercise }) {
  const [index, setIndex] = useState(0);
  const steps = getExerciseSteps(exercise);
  const current = steps[index];
  return <section className="trainer-guide" aria-label={`${exercise.name}のフォームガイド`}>
    <div className="guide-header"><img src={`${import.meta.env.BASE_URL}trainer.png`} alt="トレーナーキャラクター RIO"/><div><p className="eyebrow">FORM GUIDE · RIO</p><h3>落ち着いて、1回ずつ。</h3><p className="sub">器具に合わせた動作のポイント</p></div></div>
    <div className="guide-tabs" role="group" aria-label="説明のステップ">{steps.map((step,i) => <button key={step.stepNo} aria-pressed={index===i} className={index===i?'selected':''} onClick={() => setIndex(i)}>{step.stepNo}. {step.title}</button>)}</div>
    <div className="guide-text" aria-live="polite"><strong>{current.title}</strong><p>{current.text}</p></div>
    <div className="guide-navigation"><button disabled={index===0} onClick={() => setIndex(i => i-1)}>前へ</button><span>{index+1} / {steps.length}</span><button disabled={index===steps.length-1} onClick={() => setIndex(i => i+1)}>次へ</button></div>
    <details><summary>始める前の確認</summary><p className="sub">マシンの調整方法は機種ごとに違います。器具の使用表示を優先し、設定に迷ったらスタッフへ確認してください。筋肉の疲労感と関節の痛みを区別し、痛みが出た動作は中止します。</p><a href="https://www.mayoclinic.org/healthy-lifestyle/fitness/in-depth/weight-training/art-20045842" target="_blank" rel="noreferrer">フォームと安全の参考：Mayo Clinic</a></details>
  </section>;
}

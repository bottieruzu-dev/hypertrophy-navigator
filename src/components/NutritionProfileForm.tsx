import { useState } from 'react';
import { validProfile, type NutritionProfile } from '../engine/nutrition';
export function NutritionProfileForm({ initial, onSave, busy }: {
    initial?: NutritionProfile;
    onSave: (p: NutritionProfile) => Promise<boolean>;
    busy: boolean;
}) {
    const [age, setAge] = useState(initial ? String(initial.age) : '');
    const [height, setHeight] = useState(initial ? String(initial.heightCm) : '');
    const [weight, setWeight] = useState(initial ? String(initial.initialWeightKg) : '');
    const [sex, setSex] = useState<'male' | 'female'>(initial?.sex ?? 'male');
    const [menstruating, setMenstruating] = useState(initial?.menstruating ?? false);
    const [activity, setActivity] = useState(initial?.activityFactor ?? 1.55);
    const [deficit, setDeficit] = useState(initial?.deficitFraction ?? 0.15);
    const [override, setOverride] = useState(initial?.energyOverride ? String(initial.energyOverride) : '');
    const [error, setError] = useState('');
    return <form className="nutrition-form" onSubmit={async (e) => { e.preventDefault(); const p: NutritionProfile = { age: Number(age), heightCm: Number(height), initialWeightKg: Number(weight), sex, menstruating, activityFactor: activity, deficitFraction: deficit, energyOverride: override === '' ? null : Number(override) }; if (!validProfile(p)) {
        setError('年齢・身長・体重・カロリーの範囲を確認してください。');
        return;
    } if (await onSave(p))
        setError(''); }}>
    <p className="sub">筋肉を維持しながら減量するための開始設定。プロフィールは端末に保存します。一般成人18〜49歳に対応し、妊娠・授乳や医療上の食事制限の個別計算には対応していません。</p>
    <div className="nutrition-fields"><label>年齢<input required type="number" min="18" max="49" value={age} onChange={e => setAge(e.target.value)}/></label><label>身長（cm）<input required type="number" min="120" max="230" step="0.1" value={height} onChange={e => setHeight(e.target.value)}/></label><label>初期体重（kg）<input required type="number" min="30" max="250" step="0.01" value={weight} onChange={e => setWeight(e.target.value)}/></label></div>
    <label>食事摂取基準の区分<select value={sex} onChange={e => setSex(e.target.value as 'male' | 'female')}><option value="male">男性</option><option value="female">女性</option></select></label>
    {sex === 'female' && <label className="check-line"><input type="checkbox" checked={menstruating} onChange={e => setMenstruating(e.target.checked)}/>月経あり（鉄の基準に使用）</label>}
    <label>活動係数（消費カロリーの推定）<select value={activity} onChange={e => setActivity(Number(e.target.value))}><option value={1.2}>1.2 · 主に座って過ごす</option><option value={1.4}>1.4 · 軽い活動</option><option value={1.55}>1.55 · 歩行と定期的な筋トレ</option><option value={1.75}>1.75 · 活動が多い</option></select></label>
    <label>推定消費量からの減量幅<select value={deficit} onChange={e => setDeficit(Number(e.target.value))}>{[0, 0.1, 0.15, 0.2].map(n => <option value={n} key={n}>{Math.round(n * 100)}%</option>)}</select></label>
    <label>カロリーの手動設定（任意）<input type="number" min="1200" max="5000" step="1" placeholder="空欄なら自動計算" value={override} onChange={e => setOverride(e.target.value)}/></label>
    <p className="sub">タンパク質は最新の実測体重×2.0g、脂質は目標カロリーの25%、炭水化物は残りから計算。活動係数と減量幅は推定です。体重の短期変動だけでカロリーを大きく変えず、記録の推移を確認してください。</p>
    {error && <p role="alert" className="notice">{error}</p>}<button className="btn primary" disabled={busy}>プロフィールを保存</button>
  </form>;
}

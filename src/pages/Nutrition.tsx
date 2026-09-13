import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getTodayNutrition, ensureTodayNutrition, addFoodProtein, resetTodayProtein } from '../db/queries/nutrition';

export default function Nutrition() {
  useEffect(() => {
    ensureTodayNutrition();
  }, []);

  const nutrition = useLiveQuery(() => getTodayNutrition(), []);
  const foods = useLiveQuery(() => db.foods.toArray(), []);

  if (!nutrition) {
    return <div className="page"><p>読み込み中…</p></div>;
  }

  const pPct = Math.min(100, Math.round((nutrition.proteinCheckedG / nutrition.targetP) * 100));
  
  // 円形SVGゲージの計算
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pPct / 100) * circumference;

  return (
    <div className="page">
      <header className="hdr">
        <h1>本日の栄養管理</h1>
        <p className="sub">{nutrition.date} ・ 減量モード (−286 kcal)</p>
      </header>

      <section className="card">
        <h2>タンパク質 (P) 摂取達成度</h2>
        
        {/* ネオンSVG円形ゲージメーター */}
        <div style={{ position: 'relative', width: '140px', height: '140px', margin: '16px auto' }}>
          <svg width="140" height="140" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="#232a42"
              strokeWidth="10"
            />
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={pPct >= 100 ? '#00e676' : '#00f2fe'}
              strokeWidth="10"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1), stroke 0.4s' }}
            />
          </svg>
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '26px',
            fontWeight: '900',
            color: '#fff',
            textShadow: '0 0 10px rgba(0, 242, 254, 0.5)'
          }}>
            {pPct}%
          </div>
        </div>

        <p className="mono" style={{ fontSize: '18px', textAlign: 'center', fontWeight: 'bold' }}>
          {nutrition.proteinCheckedG} / {nutrition.targetP} g
        </p>

        <button className="btn" style={{ marginTop: '16px', minHeight: '44px', fontSize: '13px' }} onClick={() => resetTodayProtein()}>
          本日の記録をリセット
        </button>
      </section>

      <section className="card">
        <h2>目標マクロ栄養素 (PFC)</h2>
        <table className="kv">
          <tbody>
            <tr><th>目標カロリー</th><td>{nutrition.targetKcal} kcal</td></tr>
            <tr><th>タンパク質 (P)</th><td>{nutrition.targetP} g ({nutrition.proteinCoef}g/kg FFM)</td></tr>
            <tr><th>脂質 (F)</th><td>{nutrition.targetF} g</td></tr>
            <tr><th>炭水化物 (C)</th><td>{nutrition.targetC} g</td></tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>クイック食材タップ記録</h2>
        <p className="sub">タップするとタンパク質が加算されます</p>
        
        <div className="food-grid">
          {foods?.map((f) => (
            <div key={f.id} className="food-card" onClick={() => addFoodProtein(f.p)}>
              <div>
                <div className="food-name">{f.name}</div>
                <div className="food-sub">{f.unitLabel} ({f.kcal}kcal)</div>
              </div>
              <div className="food-protein">+{f.p}g P</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getTodayNutrition, ensureTodayNutrition, addFoodProtein, resetTodayProtein } from '../db/queries/nutrition';

export default function Nutrition() {
  // 画面が開いた時に初期データが存在するか確認・作成する
  useEffect(() => {
    ensureTodayNutrition();
  }, []);

  // 読み取り専用クエリで安全に監視する
  const nutrition = useLiveQuery(() => getTodayNutrition(), []);
  const foods = useLiveQuery(() => db.foods.toArray(), []);

  if (!nutrition) {
    return <div className="page"><p>読み込み中…</p></div>;
  }

  const pPct = Math.min(100, Math.round((nutrition.proteinCheckedG / nutrition.targetP) * 100));

  return (
    <div className="page">
      <header className="hdr">
        <h1>本日の栄養管理</h1>
        <p className="sub">{nutrition.date} ・ 減量モード (−286 kcal)</p>
      </header>

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
        <h2>タンパク質 (P) 摂取達成度</h2>
        <div className="progress" style={{ height: '12px', margin: '12px 0' }}>
          <div className="bar" style={{ width: `${pPct}%`, backgroundColor: pPct >= 100 ? 'var(--good)' : 'var(--accent)' }} />
        </div>
        <p className="mono" style={{ fontSize: '16px', textAlign: 'center' }}>
          {nutrition.proteinCheckedG} / {nutrition.targetP} g ({pPct}%)
        </p>
        <button className="btn" style={{ marginTop: '12px', minHeight: '40px', fontSize: '13px' }} onClick={() => resetTodayProtein()}>
          本日の記録をリセット
        </button>
      </section>

      <section className="card">
        <h2>クイック食材タップ記録</h2>
        <p className="sub">食べた食材をタップするとタンパク質が加算されます</p>
        <div className="list">
          {foods?.map((f) => (
            <button key={f.id} className="row" onClick={() => addFoodProtein(f.p)}>
              <div>
                <span className="name">{f.name}</span>
                <span className="sub" style={{ display: 'block' }}>{f.unitLabel} ({f.kcal} kcal)</span>
              </div>
              <span className="mono good">+{f.p}g P</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
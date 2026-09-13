import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getTodayNutrition, ensureTodayNutrition, addFoodProtein, resetTodayProtein } from '../db/queries/nutrition';
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar';
import 'react-circular-progressbar/dist/styles.css';
import CountUp from 'react-countup';
import { motion } from 'framer-motion';

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

  return (
    <motion.div 
      className="page"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <header className="hdr">
        <h1>本日の栄養管理</h1>
        <p className="sub">{nutrition.date} ・ 減量モード (−286 kcal)</p>
      </header>

      <section className="card">
        <h2>タンパク質 (P) 摂取達成度</h2>
        
        {/* 円形ゲージメーター */}
        <div className="circular-progress-wrap">
          <CircularProgressbar
            value={pPct}
            text={`${pPct}%`}
            styles={buildStyles({
              textColor: '#ffffff',
              pathColor: pPct >= 100 ? '#00e676' : '#00f2fe',
              trailColor: '#232a42',
              textSize: '22px',
            })}
          />
        </div>

        <p className="mono" style={{ fontSize: '18px', textAlign: 'center', fontWeight: 'bold' }}>
          <CountUp end={nutrition.proteinCheckedG} decimals={1} duration={0.8} /> / {nutrition.targetP} g
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
        <p className="sub">タップするとタンパク質がリアルタイム加算されます</p>
        
        {/* 整列されたサイバーネオングリッド */}
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
    </motion.div>
  );
}
import { fireNeonConfetti } from '../engine/achievements';
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getTodayBodyMetric, saveBodyMetric } from '../db/queries/bodyMetrics';

export default function BodyTracking() {
  const todayData = useLiveQuery(() => getTodayBodyMetric(), []);
  const historyList = useLiveQuery(() => db.bodyMetrics.orderBy('date').reverse().limit(14).toArray(), []);

  const [weight, setWeight] = useState<string>('');
  const [fat, setFat] = useState<string>('');
  const [waist, setWaist] = useState<string>('');
  const [shoulder, setShoulder] = useState<string>('');
  const [savedMessage, setSavedMessage] = useState<boolean>(false);

  useEffect(() => {
    if (todayData) {
      setWeight(todayData.weightKg !== null ? String(todayData.weightKg) : '');
      setFat(todayData.bodyFatPct !== null ? String(todayData.bodyFatPct) : '');
      setWaist(todayData.waistCm !== null ? String(todayData.waistCm) : '');
      setShoulder(todayData.shoulderCm !== null ? String(todayData.shoulderCm) : '');
    }
  }, [todayData]);

  const handleSave = async () => {
    await saveBodyMetric({
      weightKg: weight !== '' ? Number(weight) : null,
      bodyFatPct: fat !== '' ? Number(fat) : null,
      waistCm: waist !== '' ? Number(waist) : null,
      shoulderCm: shoulder !== '' ? Number(shoulder) : null,
    });
    fireNeonConfetti(); // 🌟 EXP加算＆スパーク演出
    setSavedMessage(true);
    setTimeout(() => setSavedMessage(false), 3000);
  };

  return (
    <div className="page">
      <header className="hdr">
        <h1>体組成・トレンド記録</h1>
        <p className="sub">毎朝のコンディションを入力してください</p>
      </header>

      {savedMessage && (
        <div className="hint converged" style={{ textAlign: 'center' }}>
          ✓ 本日のコンディションを保存しました！
        </div>
      )}

      <section className="card">
        <h2>本日 ({todayData?.date}) の入力</h2>

        <div className="field">
          <label>体重 (kg)</label>
          <input
            type="number"
            step="0.1"
            className="btn"
            style={{ textAlign: 'left', paddingLeft: '16px', background: 'var(--bg)' }}
            placeholder="例: 71.2"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>

        <div className="field">
          <label>体脂肪率 (%)</label>
          <input
            type="number"
            step="0.1"
            className="btn"
            style={{ textAlign: 'left', paddingLeft: '16px', background: 'var(--bg)' }}
            placeholder="例: 18.4"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
          />
        </div>

        <div className="field">
          <label>ウエストサイズ (cm)</label>
          <input
            type="number"
            step="0.5"
            className="btn"
            style={{ textAlign: 'left', paddingLeft: '16px', background: 'var(--bg)' }}
            placeholder="例: 80.0"
            value={waist}
            onChange={(e) => setWaist(e.target.value)}
          />
        </div>

        <div className="field">
          <label>肩囲 (cm)</label>
          <input
            type="number"
            step="0.5"
            className="btn"
            style={{ textAlign: 'left', paddingLeft: '16px', background: 'var(--bg)' }}
            placeholder="例: 115.0"
            value={shoulder}
            onChange={(e) => setShoulder(e.target.value)}
          />
        </div>

        <button className="btn primary big" onClick={handleSave}>
          記録を保存
        </button>
      </section>

      <section className="card">
        <h2>分析トレンド指標</h2>
        <table className="kv">
          <tbody>
            <tr>
              <th>体重 7日移動平均 (MA7)</th>
              <td className="mono good">
                {todayData?.weightMa7 ? `${todayData.weightMa7} kg` : '7日間のデータ蓄積中'}
              </td>
            </tr>
            <tr>
              <th>除脂肪体重 (FFM)</th>
              <td className="mono">
                {todayData?.ffmKg ? `${todayData.ffmKg} kg` : '未計算'}
              </td>
            </tr>
            <tr>
              <th>V-Taper比率 (肩囲 ÷ ウエスト)</th>
              <td className="mono good">
                {todayData?.vTaperRatio ? `${todayData.vTaperRatio}` : '未計算'}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>直近14日間の履歴</h2>
        <div className="list">
          {historyList?.map((h) => (
            <div key={h.date} className="row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <span className="mono">{h.date.slice(5)}</span>
              <span className="mono">{h.weightKg ? `${h.weightKg}kg` : '-'}</span>
              <span className="mono sub">{h.vTaperRatio ? `V:${h.vTaperRatio}` : '-'}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
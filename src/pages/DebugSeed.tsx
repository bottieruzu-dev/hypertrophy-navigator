import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { validateSeed, nukeDatabase, SEED_VERSION, WEEKLY_SET_BUDGET_MAX } from '../db/seed';

export default function DebugSeed() {
  const [report, setReport] = useState(() => validateSeed());
  const [busy, setBusy] = useState(false);

  const counts = useLiveQuery(async () => ({
    muscles: await db.muscles.count(),
    exercises: await db.exercises.count(),
    available: await db.exercises.where('isAvailable').equals(1).count(),
    credits: await db.muscleCredits.count(),
    foods: await db.foods.count(),
    baselines: await db.baselines.count(),
    sessions: await db.sessions.count(),
    sets: await db.sets.count(),
  }), []);

  const muscles = useLiveQuery(() => db.muscles.orderBy('priorityRank').toArray(), []);

  useEffect(() => { setReport(validateSeed()); }, []);

  const handleNuke = async () => {
    if (!confirm('全データを削除して再投入します。よろしいですか？')) return;
    setBusy(true);
    await nukeDatabase();
    setReport(validateSeed());
    setBusy(false);
  };

  const ok = report.errors.length === 0;

  return (
    <div className="page">
      <h1>Seed 動作確認</h1>

      <section className={`card ${ok ? 'ok' : 'ng'}`}>
        <h2>{ok ? '✓ 整合性チェック PASS' : `✗ エラー ${report.errors.length} 件`}</h2>
        <p className="mono">seedVersion: {SEED_VERSION}</p>
        {report.errors.map((e, i) => <p key={i} className="err">{e}</p>)}
        {report.warnings.map((w, i) => <p key={i} className="warn">{w}</p>)}
      </section>

      <section className="card">
        <h2>ボリューム予算</h2>
        <table className="kv">
          <tbody>
            <tr><th>部位別下限 合計</th><td>{report.stats.totalMinSets} セット</td></tr>
            <tr><th>週間予算 上限</th><td>{WEEKLY_SET_BUDGET_MAX} セット</td></tr>
            <tr>
              <th>余裕</th>
              <td className={report.stats.budgetHeadroom >= 5 ? 'good' : 'warn'}>
                {report.stats.budgetHeadroom} セット
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>DB レコード数</h2>
        <table className="kv">
          <tbody>
            {counts && Object.entries(counts).map(([k, v]) => (
              <tr key={k}><th>{k}</th><td>{v}</td></tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>部位マスタ（下限 / 上限）</h2>
        <table className="grid">
          <thead>
            <tr><th>部位</th><th>下限</th><th>上限</th><th>tag</th></tr>
          </thead>
          <tbody>
            {muscles?.map((m) => (
              <tr key={m.code} className={`tag-${m.tag}`}>
                <td>{m.nameJa}</td>
                <td>{m.weeklySetsMin}</td>
                <td>{m.weeklySetsMax}</td>
                <td className="mono">{m.tag}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <button className="btn danger" onClick={handleNuke} disabled={busy}>
        {busy ? '処理中…' : 'DB完全削除 → 再投入'}
      </button>
    </div>
  );
}
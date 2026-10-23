import { useEffect, useState } from 'react';
import { fetchDinner, publishDinnerSnapshot } from '../db/queries/dinner';
import { todayInJapan } from '../engine/dates';

export function DinnerSuggestions({ date }: { date: string }) {
  const [result,setResult] = useState<Awaited<ReturnType<typeof fetchDinner>>>(null);
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const [loaded,setLoaded] = useState(false);
  const [nonce,setNonce] = useState(0);
  useEffect(() => {
    let disposed = false, running = false;
    const update = async () => {
      if (disposed || running || document.visibilityState !== 'visible') return;
      running = true;
      try { const data = await fetchDinner(date); if (!disposed) { setResult(data); setMessage(''); setLoaded(true); } }
      catch (e) { if (!disposed) { setMessage(e instanceof Error ? e.message : '接続を確認してください。'); setLoaded(true); } }
      finally { running = false; }
    };
    void update();
    const timer = setInterval(() => void update(),30000);
    const visible = () => void update(); document.addEventListener('visibilitychange',visible);
    return () => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange',visible); };
  }, [date,nonce]);
  return <section className="card dinner-section" aria-labelledby="dinner-heading">
    <p className="eyebrow">DINNER · 22:00</p><h2 id="dinner-heading">今夜の調整ごはん</h2>
    <p className="sub">筋肉を維持しながら減量するための夕食を3案。電子レンジで30分以内・コンビニ食品も活用します。提案だけでは摂取量に加算しません。</p>
    <div className="two-actions"><button className="btn" onClick={() => setNonce(n=>n+1)}>提案を更新</button>
      <button className="btn" disabled={busy || date !== todayInJapan()} onClick={() => {
        setBusy(true); void publishDinnerSnapshot().then(()=>setMessage('今日の食事・プロフィール・直近30日の体組成と筋トレを献立用に同期しました。'))
          .catch(e=>setMessage(e instanceof Error?e.message:'同期できませんでした。')).finally(()=>setBusy(false));
      }}>{busy?'同期中…':'今日の情報を同期'}</button></div>
    {message && <p className="notice" role="status">{message}</p>}
    {!loaded && <p role="status">夕食提案を確認しています…</p>}
    {loaded && !result && !message && <p className="sub">{date}の提案はまだありません。毎日22時にPCとアプリが動いている場合に作成します。PC停止で実行できなかった日は、過去分を作成しません。</p>}
    {result && <DinnerProposalContent result={result}/>}
  </section>;
}

export function DinnerProposalContent({ result }: { result: NonNullable<Awaited<ReturnType<typeof fetchDinner>>> }) {
  return <>
      <p className="dinner-summary">{result.proposal.summary}</p>
      <p className="sub">作成：{new Date(result.generatedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間） · 作成時点の記録に基づく提案</p>
      <ul className="dinner-assumptions">{result.proposal.assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul>
      <div className="dinner-options">{result.proposal.options.map((o,i)=><article className="dinner-option" key={i}>
        <p className="eyebrow">PLAN {i+1} · {o.minutes}分 · {o.mode==='microwave'?'電子レンジ':'調理不要'}</p>
        <h3>{o.title}</h3>
        <p className="dinner-macros">約{o.nutrients.energy_kcal??'不明'} kcal · P {o.nutrients.protein_g??'不明'}g / F {o.nutrients.fat_g??'不明'}g / C {o.nutrients.carbs_g??'不明'}g</p>
        <p className="sub">食物繊維 {o.nutrients.fiber_g??'不明'}g · 食塩 {o.nutrients.salt_g??'不明'}g</p>
        <ul>{o.foods.map((food,n)=><li key={n}>{food}</li>)}</ul>
        <ol>{o.steps.map((step,n)=><li key={n}>{step}</li>)}</ol>
        <p>{o.reason}</p><details><summary>栄養の根拠・推定条件</summary><p className="sub">{o.evidence}</p></details>
      </article>)}</div>
      <p className="sub">食べた量は上の提案とは別に、いつもの食事入力から記録してください。</p>
  </>;
}

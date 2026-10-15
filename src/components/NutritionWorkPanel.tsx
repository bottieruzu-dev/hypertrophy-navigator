import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { supabase } from '../lib/supabase';
import { cancelNutritionWork, syncNutritionWork } from '../db/queries/nutritionWork';
import { MEALS } from '../engine/nutrition';
import { NutritionWorkConnections } from './NutritionWorkConnections';

export function NutritionWorkPanel({ date, onReview }: { date:string; onReview:(id:string)=>void }) {
  const jobs = useLiveQuery(() => db.nutritionWorkJobs.where('request.date').equals(date).toArray(),[date]) ?? [];
  const [message,setMessage] = useState(''); const [busy,setBusy]=useState(false);
  async function refresh() {
    setBusy(true);
    try { await syncNutritionWork(date); setMessage('クラウドの計算待ち・下書きを更新しました。'); }
    catch (e) { setMessage(e instanceof Error ? e.message : '接続を確認してください。'); }
    finally {setBusy(false);}
  }
  useEffect(() => {
    let disposed=false, active=false;
    const update=async()=>{
      if (disposed || active || document.visibilityState !== 'visible' || !supabase) return;
      active=true;
      try {
        const s=await supabase.auth.getSession();
        // Presence check only. sync verifies identity and owner binding on the server.
        if (s.data.session) await syncNutritionWork(date);
      } catch { /* The manual refresh displays connection errors. */ }
      finally {active=false;}
    };
    void update(); const timer=setInterval(()=>void update(),30000);
    const visible=()=>void update(); document.addEventListener('visibilitychange',visible);
    return ()=>{disposed=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
  },[date]);
  return <section className="card"><h2>Workの計算待ち・確認待ち</h2>
    <p className="sub">送信した食材と量をWorkが読み取り、結果を下書きで返します。確認して確定するまで合計には加算しません。アプリ表示中は30秒ごとに更新します。</p>
    <button className="btn" disabled={busy} onClick={()=>void refresh()}>{busy?'更新中…':'送信待ちを再送・結果を更新'}</button>
    {message && <p role="status">{message}</p>}
    {jobs.length===0?<p className="sub">この日の計算依頼はありません。</p>:jobs.map(job=><div className="nutrition-record" key={job.id}>
      <strong>{MEALS[job.request.meal]} · {!job.cloudSaved?'端末保存済み・送信待ち':({pending:'Workの計算待ち',review:'確認待ち',confirmed:'確定済み',cancelled:'取消済み'})[job.status]}</strong>
      <p>{job.request.items.map(i=>`${i.name} ${i.quantity}${i.unit==='g'?'g':'個'}`).join('、')}</p>
      {job.status==='review'&&<button className="btn primary" onClick={()=>onReview(job.id)}>結果を確認する</button>}
      {['pending','review'].includes(job.status)&&<button className="btn" disabled={busy} onClick={()=>{
        setBusy(true);void cancelNutritionWork(job.id).then(()=>setMessage('取消しました。内容を変更する場合は新しい依頼を作成してください。'))
          .catch(()=>setMessage('取消できませんでした。接続を確認してください。')).finally(()=>setBusy(false));
      }}>この計算依頼を取り消す</button>}
    </div>)}
    <NutritionWorkConnections/>
  </section>;
}

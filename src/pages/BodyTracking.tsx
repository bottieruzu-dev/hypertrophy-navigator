import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { getTodayBodyMetric, saveBodyMetric } from '../db/queries/bodyMetrics';
import { todayInJapan } from '../engine/dates';
import { BODY_FIELDS, type BodyInput, type BodyInputKey } from '../engine/bodyMeasurements';
import type { BodyMetric } from '../db/types';
import { BodyTrendChart } from '../components/BodyTrendChart';
export default function BodyTracking() {
  const [today,setToday]=useState(todayInJapan);
  useEffect(()=>{const timer=setInterval(()=>setToday(todayInJapan()),30000);return()=>clearInterval(timer);},[]);
  const data=useLiveQuery(async()=>({current:await getTodayBodyMetric(),history:await db.bodyMetrics.orderBy('date').toArray()}),[today]);
  if(!data)return <main className="page"><p role="status">体組成を読み込んでいます…</p></main>;
  return <main className="page body-page"><header className="hdr"><p className="eyebrow">BODY MEASUREMENTS</p><h1>体組成とサイズの推移</h1><p className="sub">測った項目だけ記録。体重も周囲のサイズも、日々の変化を確認できます。</p></header>
    <BodyTrendChart records={data.history} today={today}/>
    <BodyMeasurementForm key={today} current={data.current}/>
    <section className="card"><h2>計算したトレンド指標</h2><dl className="body-derived">{[
      ['体重の7日平均',data.current.weightMa7,'kg'],['除脂肪体重',data.current.ffmKg,'kg'],['除脂肪体重の30日平均',data.current.ffmMa30,'kg'],['肩周り ÷ ウエスト',data.current.vTaperRatio,'倍'],['肩／ウエスト比の7日平均',data.current.vTaperMa7,'倍'],
    ].map(([label,value,unit])=><div key={label}><dt>{label}</dt><dd>{value==null?'未計算':`${value} ${unit}`}</dd></div>)}</dl><p className="sub">平均は期間内の入力済み・実測の記録から計算します。未入力の日は0にしません。除脂肪体重は体重と体脂肪率からの計算値です。</p></section>
    <p className="sub">体組成はこの端末に保存されます。クラウドへは上部のクラウド設定から「端末の履歴を送信」を使います。</p>
  </main>;
}
function BodyMeasurementForm({current}:{current:BodyMetric}) {
  const [values,setValues]=useState(()=>Object.fromEntries(BODY_FIELDS.map(f=>[f.key,current[f.key]==null?'':String(current[f.key])])) as Record<BodyInputKey,string>);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');const lock=useRef(false);
  async function save(){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');try{
    if(current.date!==todayInJapan())throw new Error('日付が変わりました。ページを再読み込みしてから記録してください。');
    const input=Object.fromEntries(BODY_FIELDS.map(f=>[f.key,values[f.key].trim()===''?null:Number(values[f.key])])) as BodyInput;
    await saveBodyMetric(input);setMessage('本日の記録を端末に保存しました。グラフにも反映しています。');
  }catch(e){setMessage(e instanceof Error?e.message:'保存できませんでした。入力内容を保持しています。');}finally{lock.current=false;setBusy(false);}}
  return <section className="card"><h2>{current.date} の測定</h2><p className="sub">すべて任意です。ウエストはくびれの位置、おへそ周りはおへその高さで分けて記録。腕と脚は毎回同じ側・同じ位置で測ってください。過去のウエスト値は移動・変換しません。</p>
    <form onSubmit={e=>{e.preventDefault();void save();}}><div className="body-input-grid">{BODY_FIELDS.map(f=><label key={f.key}>{f.label}<span className="body-unit-input"><input type="number" inputMode="decimal" step="any" min={f.min} max={f.max} value={values[f.key]} disabled={busy} placeholder="未入力" onChange={e=>setValues(prev=>({...prev,[f.key]:e.target.value}))}/><span>{f.unit}</span></span></label>)}</div><p className="sub">回復度は0〜10の自己評価です。0は回復していない、10は十分に回復している状態として、毎回同じ基準で入力してください。</p><button className="btn primary big" disabled={busy} type="submit">{busy?'保存中…':'本日の測定を保存'}</button></form>
    {message&&<p className="notice" role="status">{message}</p>}
  </section>;
}

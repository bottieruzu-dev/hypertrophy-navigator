import { useState } from 'react';
import type { BodyMetric } from '../db/types';
import { BODY_CHART_FIELDS, type BodyChartKey } from '../engine/bodyMeasurements';
import { shiftDate } from '../engine/dates';
export function BodyTrendChart({records,today}:{records:BodyMetric[];today:string}) {
  const [metric,setMetric]=useState<BodyChartKey>('weightKg'),[range,setRange]=useState('30');
  const field=BODY_CHART_FIELDS.find(f=>f.key===metric)!;
  const from=range==='all'?'0000-01-01':shiftDate(today,1-Number(range));
  const rows=records.filter(r=>r.date>=from&&r.date<=today).sort((a,b)=>a.date.localeCompare(b.date));
  const points=rows.map(r=>({date:r.date,value:typeof r[metric]==='number'&&Number.isFinite(r[metric])?r[metric] as number:null,estimated:!!r.isInterpolated}));
  const known=points.filter((p):p is typeof p & {value:number}=>p.value!==null);
  const first=known[0],last=known.at(-1);
  const min=known.length?Math.min(...known.map(p=>p.value)):0,max=known.length?Math.max(...known.map(p=>p.value)):1;
  const minimumPadding=(metric==='vTaperRatio'||metric==='vTaperMa7') ? .01 : metric==='prsScore' ? .5 : 1;
  const padding=Math.max((max-min)*.15,minimumPadding);
  const low=Math.max(0,min-padding),high=max+padding;
  const start=Date.parse((points[0]?.date??today)+'T00:00:00Z'),end=Date.parse((points.at(-1)?.date??today)+'T00:00:00Z');
  const x=(date:string)=>end===start?195:44+(Date.parse(date+'T00:00:00Z')-start)/(end-start)*300;
  const y=(v:number)=>175-(v-low)/(high-low)*145;
  let path='';let pen=false;
  for(const p of points){if(p.value===null){pen=false;continue;}path+=`${pen?'L':'M'}${x(p.date).toFixed(2)},${y(p.value).toFixed(2)} `;pen=true;}
  const format=(v:number)=>Number(v.toFixed(3)).toLocaleString('ja-JP');
  return <section className="card body-trends"><h2>すべての測定値をグラフで確認</h2>
    <div className="body-chart-controls"><label>表示する項目<select value={metric} onChange={e=>setMetric(e.target.value as BodyChartKey)}>{BODY_CHART_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}（{f.unit}）</option>)}</select></label><label>期間<select value={range} onChange={e=>setRange(e.target.value)}><option value="30">直近30日</option><option value="90">直近90日</option><option value="all">全期間</option></select></label></div>
    <div className="body-chart-summary"><div><span>{field.label}の最新値</span><strong>{last?format(last.value):'—'} <small>{field.unit}</small></strong><small>{last?.date??'記録なし'}</small></div><div><span>期間の最初の記録との差</span><strong>{known.length<2?'—':`${last!.value-first!.value>0?'+':''}${format(last!.value-first!.value)}`} <small>{field.unit}</small></strong><small>{known.length}日分の値</small></div></div>
    {known.length?<svg viewBox="0 0 360 215" className="body-line-chart" role="img" aria-label={`${field.label}、${known.length}日分の推移。最新${format(last!.value)}${field.unit}`}>
      {[0,.5,1].map(t=>{const v=low+(high-low)*t;return <g key={t}><line x1="44" x2="344" y1={y(v)} y2={y(v)} className="chart-grid"/><text x="38" y={y(v)+4} textAnchor="end">{format(v)}</text></g>;})}
      <path d={path} className="chart-line"/>{known.map(p=><circle key={p.date} cx={x(p.date)} cy={y(p.value)} r="3.5" className={p.estimated?'chart-point estimated':'chart-point'}><title>{p.date}：{format(p.value)} {field.unit}{p.estimated?'（補間値）':''}</title></circle>)}
      <text x="44" y="203">{points[0].date.slice(2).replaceAll('-','/')}</text><text x="344" y="203" textAnchor="end">{points.at(-1)!.date.slice(2).replaceAll('-','/')}</text>
    </svg>:<p className="body-chart-empty">この期間の{field.label}はまだ記録がありません。入力するとここに表示されます。</p>}
    <p className="sub">縦軸は記録に合わせた拡大表示。未入力は0にせず、記録日の点を結んでいます。補間値は白抜きの点で表示します。</p>
    <details><summary>{field.label}の数値一覧</summary><div className="body-history-values">{points.length?points.map(p=><div key={p.date}><time>{p.date}</time><span>{p.value===null?'未入力':`${format(p.value)} ${field.unit}${p.estimated?'（補間）':''}`}</span></div>):<p className="sub">記録なし</p>}</div></details>
  </section>;
}

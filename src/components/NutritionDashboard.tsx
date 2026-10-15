import { useState } from 'react';
import { aggregateNutrition, NUTRIENTS, nutrientDifference, type MealRecord, type TargetSnapshot } from '../engine/nutrition';
import { nutritionGauge } from '../engine/nutritionGauge';
import { NutrientTable } from './NutrientTable';

export function NutritionDashboard({records,targets,pendingCount=0}:{records:MealRecord[];targets:TargetSnapshot;pendingCount?:number}) {
  const [group,setGroup]=useState('基本'),[view,setView]=useState('ゲージ');
  const totals=aggregateNutrition(records);
  const active=records.filter(r=>!r.voided);
  const energy=totals.energy_kcal;
  const amount=(key:string)=>{const a=totals[key];return !a.total?'—':a.missing===a.total?'不明':`${a.missing?'既知分 ':''}${a.known.toLocaleString('ja-JP')}`;};
  return <section className="card nutrition-dashboard" aria-labelledby="nutrition-balance-title">
    <div className="balance-heading"><div><p className="eyebrow">DAILY BALANCE</p><h2 id="nutrition-balance-title">一日の栄養バランス</h2></div><span className="balance-date">{targets.date.slice(5).replace('-','/')}</span></div>
    <div className="energy-summary"><span>記録済みのカロリー</span><div><strong>{amount('energy_kcal')}</strong><span> kcal</span></div><p>一日の目安 <b>{targets.values.energy_kcal.toLocaleString('ja-JP')}</b> kcal</p><small>{nutrientDifference(NUTRIENTS[0],energy,targets.values.energy_kcal)}</small></div>
    <div className="balance-macros">{[['protein_g','タンパク質','P'],['fat_g','脂質','F'],['carbs_g','炭水化物','C']].map(([key,label,initial])=><div key={key}><span className="macro-initial">{initial}</span><span>{label}</span><strong>{amount(key)}<small> g</small></strong><small>目安 {targets.values[key]} g</small></div>)}</div>
    <p className="balance-record-count">確定した食事 {active.length}件を集計{pendingCount>0?` · 計算・確認待ち ${pendingCount}件は未集計`:''}</p>
    <div className="balance-tabs" aria-label="栄養素の種類">{['基本','ビタミン','ミネラル','すべて'].map(g=><button key={g} aria-pressed={group===g} onClick={()=>setGroup(g)}>{g}</button>)}</div>
    <div className="balance-chart-tools"><span>縦線＝一日の目安（100%）</span><div className="balance-view" aria-label="表示方法">{['ゲージ','数値'].map(v=><button key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v}</button>)}</div></div>
    {view==='数値'?<NutrientTable records={records} targets={targets} group={group==='すべて'?undefined:group}/>:<div className="nutrient-gauges">{NUTRIENTS.filter(n=>group==='すべて'||n.group===group).map(n=>{
      const a=totals[n.key],g=nutritionGauge(n,a,targets.values[n.key]);
      return <div className={`nutrient-gauge tone-${g.tone}`} key={n.key}>
        <div className="gauge-row-heading"><strong>{n.name}</strong><span className="gauge-status">{g.label}</span></div>
        <div className="gauge-values"><span>{amount(n.key)} <small>{n.unit}</small></span><span>{n.kind==='上限方向'?'上限方向の目安':n.kind==='目標量'?'目標量':'目安'} {targets.values[n.key]} {n.unit}</span></div>
        <div className={`gauge-track ${a.missing?'has-unknown':''}`} role="img" aria-label={`${n.name}：${amount(n.key)}${n.unit}、目安${targets.values[n.key]}${n.unit}、${g.label}${a.missing?`、${a.missing}品不明`:''}`}>
          <span className="gauge-fill" style={{width:`${g.width}%`}}/><span className="gauge-target"/>
        </div>
        <div className="gauge-note"><span>{a.missing?`${a.missing}品の値が不明 · ${nutrientDifference(n,a,targets.values[n.key])}`:nutrientDifference(n,a,targets.values[n.key])}</span><span>{g.ratio===null?'—':`${a.missing?'既知分 ':''}${Math.round(g.ratio*100)}%`}</span></div>
      </div>;
    })}</div>}
    <p className="balance-footnote">記録済みの摂取量と目安の比較です。青は目安まで、緑は到達・範囲内、黄は目標以上、赤は上限方向の目安超過。斜線は不明値あり。ゲージは150%まで、割合は実際の値を表示します。未記録・不明は0と区別します。</p>
    <p className="balance-footnote">目安への到達は健康判定ではありません。ビタミン・ミネラルの目安以上を過剰とは判定せず、一日の差だけで欠乏症を判断しません。</p>
  </section>;
}

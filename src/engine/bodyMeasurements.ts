import type { BodyMetric } from '../db/types';
import { shiftDate } from './dates';
export const BODY_FIELDS = [
  {key:'weightKg',label:'体重',unit:'kg',min:10,max:500},
  {key:'bodyFatPct',label:'体脂肪率',unit:'%',min:0,max:75},
  {key:'waistCm',label:'ウエスト',unit:'cm',min:1,max:300},
  {key:'navelCm',label:'おへそ周り',unit:'cm',min:1,max:300},
  {key:'shoulderCm',label:'肩周り',unit:'cm',min:1,max:300},
  {key:'chestCm',label:'胸周り',unit:'cm',min:1,max:300},
  {key:'armCm',label:'腕周り（上腕）',unit:'cm',min:1,max:150},
  {key:'thighCm',label:'脚周り（太もも）',unit:'cm',min:1,max:200},
  {key:'sleepHours',label:'睡眠時間',unit:'時間',min:0,max:24},
  {key:'prsScore',label:'回復度（PRS）',unit:'/10',min:0,max:10},
] as const;
export type BodyInputKey = typeof BODY_FIELDS[number]['key'];
export type BodyInput = Partial<Record<BodyInputKey,number|null>>;
export const BODY_CHART_FIELDS = [...BODY_FIELDS,
  {key:'ffmKg',label:'除脂肪体重（計算値）',unit:'kg'},
  {key:'weightMa7',label:'体重の7日平均',unit:'kg'},
  {key:'ffmMa30',label:'除脂肪体重の30日平均',unit:'kg'},
  {key:'vTaperRatio',label:'肩周り ÷ ウエスト',unit:'倍'},
  {key:'vTaperMa7',label:'肩／ウエスト比の7日平均',unit:'倍'},
] as const;
export type BodyChartKey = typeof BODY_CHART_FIELDS[number]['key'];
export function deriveBodyMetric(current:BodyMetric,input:BodyInput,history:BodyMetric[]):BodyMetric {
  const next={...current,navelCm:current.navelCm??null,isInterpolated:0 as const};
  for(const f of BODY_FIELDS) {
    const v=input[f.key]; if(v===undefined)continue;
    if(v!==null&&(!Number.isFinite(v)||v<f.min||v>f.max))throw new Error(`${f.label}は${f.min}〜${f.max}${f.unit}で入力してください。`);
    next[f.key]=v;
  }
  next.ffmKg=next.weightKg!==null&&next.bodyFatPct!==null?Number((next.weightKg*(1-next.bodyFatPct/100)).toFixed(2)):null;
  next.vTaperRatio=next.shoulderCm!==null&&next.waistCm!==null&&next.waistCm>0?Number((next.shoulderCm/next.waistCm).toFixed(3)):null;
  const rows=[...history.filter(r=>r.date!==next.date),next].filter(r=>!r.isInterpolated&&r.date<=next.date);
  function average(key:'weightKg'|'ffmKg'|'vTaperRatio',days:number) {
    const values=rows.filter(r=>r.date>=shiftDate(next.date,-days+1)).map(r=>r[key]).filter((v):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0);
    return values.length?Number((values.reduce((s,v)=>s+v,0)/values.length).toFixed(key==='vTaperRatio'?3:2)):null;
  }
  next.weightMa7=average('weightKg',7);next.ffmMa30=average('ffmKg',30);next.vTaperMa7=average('vTaperRatio',7);
  return next;
}

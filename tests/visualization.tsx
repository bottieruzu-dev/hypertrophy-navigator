// Isolated visual fixture. No DB, cloud client, auth or personal records.
import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { NutritionDashboard } from '../src/components/NutritionDashboard';
import { BodyTrendChart } from '../src/components/BodyTrendChart';
import { nutritionTargets, NUTRIENTS, type MealRecord } from '../src/engine/nutrition';
import { deriveBodyMetric } from '../src/engine/bodyMeasurements';
import type { BodyMetric } from '../src/db/types';
import '../src/styles.css';
const date='2026-10-15';
const targets=nutritionTargets({age:30,sex:'male',menstruating:false,heightCm:170,initialWeightKg:70,activityFactor:1.55,deficitFraction:.15,energyOverride:null},[],date);
const base:BodyMetric={date,weightKg:null,bodyFatPct:null,ffmKg:null,weightMa7:null,ffmMa30:null,waistCm:null,shoulderCm:null,chestCm:null,armCm:null,thighCm:null,vTaperRatio:null,vTaperMa7:null,sleepHours:null,prsScore:null,isInterpolated:0};
const history:BodyMetric[]=[];
for(let i=0;i<12;i++)history.push(deriveBodyMetric({...base,date:`2026-10-${String(i+4).padStart(2,'0')}`},{weightKg:70-i*.1,bodyFatPct:20-i*.1,waistCm:80-i*.1,navelCm:85-i*.1,chestCm:95,armCm:30+i*.05,thighCm:52,sleepHours:i===3?null:7,prsScore:8,shoulderCm:110},history));
const record:MealRecord={id:'dummy',request:{id:'dummy',date,meal:'lunch',createdAt:1,items:[{id:'dummy-food',name:'ダミー食材',product:'',note:'',state:'不明',quantity:100,unit:'g'}]},response:{version:1,requestId:'dummy',date,meal:'lunch',basis:'consumed',items:[{id:'dummy-food',quantity:100,unit:'g',edibleGrams:100,nutrients:Object.fromEntries(NUTRIENTS.map((n,i)=>[n.key,i%5===0?null:Math.round(targets.values[n.key]*[.6,1,1.8][i%3]*100)/100])),source:'visual dummy',assumptions:'not a nutrition estimate'}]},targets,revision:1,savedAt:1,voided:false};
export function Preview(){const[empty,setEmpty]=useState(false);return <main className="page nutrition-page" style={{maxWidth:390}}><p>ダミーデータによる390px幅の表示確認</p><button className="btn" onClick={()=>setEmpty(!empty)}>記録あり／なしを切替</button><NutritionDashboard records={empty?[]:[record]} targets={targets} pendingCount={2}/><BodyTrendChart records={empty?[]:history} today={date}/></main>;}
if(import.meta.env.MODE==='test')createRoot(document.getElementById('root')!).render(<Preview/>);

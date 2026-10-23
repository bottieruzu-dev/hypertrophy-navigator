// Entirely synthetic: never read or seed the real database.
import type { DashboardData } from '../src/engine/dashboard';
import { deriveBodyMetric } from '../src/engine/bodyMeasurements';
import { nutritionTargets, NUTRIENTS, type MealRecord } from '../src/engine/nutrition';
import { shiftDate } from '../src/engine/dates';
import { EXERCISES } from '../src/db/seed/exercises';
import { MUSCLES } from '../src/db/seed/muscles';
import { MUSCLE_CREDITS } from '../src/db/seed/muscleCredits';
import type { BodyMetric } from '../src/db/types';
export function dashboardFixture(date='2026-10-23'):DashboardData {
  const profile={age:30,sex:'male' as const,menstruating:false,heightCm:173,initialWeightKg:72,activityFactor:1.55,deficitFraction:.15,energyOverride:null};
  const data:DashboardData={metrics:[],meals:[],sessions:[],sets:[],muscles:MUSCLES,credits:MUSCLE_CREDITS,exercises:EXERCISES,baselines:[],cardio:[],events:[],plans:[],jobs:[],profile,pendingSync:0};
  for(let i=0;i<30;i++){
    const d=shiftDate(date,i-29);
    const blank={date:d,weightKg:null,bodyFatPct:null,ffmKg:null,weightMa7:null,ffmMa30:null,waistCm:null,shoulderCm:null,chestCm:null,armCm:null,thighCm:null,vTaperRatio:null,vTaperMa7:null,sleepHours:null,prsScore:null,isInterpolated:0} as BodyMetric;
    data.metrics.push(deriveBodyMetric(blank,{weightKg:72-i*.038+Math.sin(i*.8)*.18,bodyFatPct:20-i*.025,waistCm:82-i*.033,navelCm:85-i*.026,shoulderCm:113,chestCm:98,armCm:33,thighCm:54,sleepHours:7+(i%3)*.25,prsScore:8},data.metrics));
    const targets=nutritionTargets(profile,data.metrics,d);
    for(let j=0;j<2;j++){
      const id=`demo-${i}-${j}`,item={id:'demo-food',name:j?'鶏肉とごはんの食事（架空）':'ヨーグルトと果物（架空）',product:'',note:'表示用の架空データ',state:'調理後',quantity:1,unit:'piece' as const};
      const request={id,date:d,meal:j?'lunch' as const:'breakfast' as const,createdAt:1,items:[item]};
      const row:MealRecord={id,request,response:{version:1,requestId:id,date:d,meal:request.meal,basis:'consumed',items:[{id:item.id,quantity:1,unit:'piece',edibleGrams:null,nutrients:Object.fromEntries(NUTRIENTS.map((n,k)=>[n.key,k===16&&i===29?null:Math.round(targets.values[n.key]*(.27+(i%4)*.02+j*.08)*10)/10])),source:'架空のテスト数値',assumptions:'実際の栄養評価ではありません'}]},targets,revision:1,savedAt:i+1,voided:false};data.meals.push(row);
    }
    if(i%7===1||i%7===3||i%7===5){
      const id=i+1;data.sessions.push({id,date:d,startedAt:1,finishedAt:2,splitType:i%3===0?'lower':i%3===1?'upper_A':'upper_B',prsScore:8,sleepHours:7,mesocycleWeek:1,isDeload:0});
      for(let n=0;n<15;n++)data.sets.push({id:id*100+n,sessionId:id,exerciseId:[1,2,10,12,37][Math.floor(n/3)],date:d,setOrder:n+1,targetWeight:40,actualWeight:40+(i%4)*2.5,targetReps:10,actualReps:10,targetRir:2,actualRir:2,volumeLoad:400,est1rm:55,isWarmup:0,mode:'load'});
    }
  }
  data.baselines=EXERCISES.slice(0,25).map(e=>({exerciseId:e.id,weightKg:40,reps:10,rir:2,est1rm:55,calibratedAt:Date.parse(shiftDate(date,-30)+'T12:00:00+09:00')}));
  data.cardio=[{id:1,date,durationMin:20,modality:'ウォーキング',estKcal:80,triggerReason:'sample'}];
  return data;
}

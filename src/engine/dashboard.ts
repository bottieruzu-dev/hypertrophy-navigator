import { aggregateNutrition, nutritionTargets, validProfile, validDate as validDashboardDate, type MealRecord, type NutritionProfile, type TargetSnapshot } from './nutrition';
import { shiftDate, todayInJapan } from './dates';
import type { BodyMetric, CardioLog, DailyPlan, EventLog, Exercise, ExerciseBaseline, Muscle, MuscleCredit, NutritionLog, SessionRecord, SetRecord } from '../db/types';
import type { NutritionWorkJob } from './nutritionWork';

export interface DashboardData {
  metrics: BodyMetric[]; meals: MealRecord[]; sessions: SessionRecord[]; sets: SetRecord[];
  muscles: Muscle[]; credits: MuscleCredit[]; exercises: Exercise[]; baselines: ExerciseBaseline[];
  cardio: CardioLog[]; events: EventLog[]; plans: DailyPlan[]; jobs: NutritionWorkJob[];
  profile: NutritionProfile | null; pendingSync: number;
  legacy?: NutritionLog[];
}
export function dashboardSummary(data: DashboardData, date: string, days: number) {
  if (!validDashboardDate(date) || ![7,30,90].includes(days)) throw new Error('Invalid dashboard period');
  const from=shiftDate(date,1-days);
  const inPeriod=(d:string)=>validDashboardDate(d)&&d>=from&&d<=date;
  const metrics=data.metrics.filter(m=>validDashboardDate(m.date)&&m.date<=date).sort((a,b)=>a.date.localeCompare(b.date));
  const measured=metrics.filter(m=>!m.isInterpolated);
  const meals=data.meals.filter(m=>!m.voided&&inPeriod(m.request.date));
  const dailyMeals=meals.filter(m=>m.request.date===date);
  const totals=aggregateNutrition(dailyMeals);
  let targets:TargetSnapshot|null=null;
  let targetError='';
  try { if(data.profile&&validProfile(data.profile)) targets=nutritionTargets(data.profile,metrics,date); }
  catch(e){targetError=e instanceof Error?e.message:'目標を計算できませんでした。';}
  if(!targets) targets=dailyMeals.toSorted((a,b)=>a.savedAt-b.savedAt)[0]?.targets??null;
  // A past day uses the goal saved with that day's meal, not today's edited profile.
  if(date<todayInJapan()) targets=dailyMeals.toSorted((a,b)=>a.savedAt-b.savedAt)[0]?.targets??targets;
  const sets=data.sets.filter(s=>inPeriod(s.date)&&!s.isWarmup&&s.mode!=='calibration');
  const sessions=data.sessions.filter(s=>inPeriod(s.date));
  const completed=sessions.filter(s=>typeof s.finishedAt==='number'&&s.finishedAt>0);
  const latest=(key:keyof BodyMetric)=>measured.toReversed().find(m=>typeof m[key]==='number'&&Number.isFinite(m[key]));
  const change=(key:keyof BodyMetric)=>{
    const rows=measured.filter(m=>inPeriod(m.date)&&typeof m[key]==='number'&&Number.isFinite(m[key]));
    return rows.length<2?null:Number((Number(rows.at(-1)![key])-Number(rows[0][key])).toFixed(2));
  };
  const trend=Array.from({length:days},(_,i)=>{
    const d=shiftDate(from,i),dayMeals=meals.filter(m=>m.request.date===d),daySets=sets.filter(s=>s.date===d);
    const sum=aggregateNutrition(dayMeals);
    return {date:d,energy:dayMeals.length?sum.energy_kcal:null,protein:dayMeals.length?sum.protein_g:null,
      volume:daySets.reduce((a,s)=>a+s.actualWeight*s.actualReps,0),sets:daySets.length,
      weight:measured.find(m=>m.date===d)?.weightKg??null};
  });
  const weeklySets=sets.filter(s=>s.date>=shiftDate(date,-6));
  const muscleLoad=data.muscles.filter(m=>m.weeklySetsMax>0).map(m=>({
    ...m,sets:Math.round(weeklySets.reduce((sum,s)=>sum+data.credits.filter(c=>c.exerciseId===s.exerciseId&&c.muscle===m.code).reduce((n,c)=>n+c.credit,0),0)*10)/10,
  })).sort((a,b)=>b.sets-a.sets||a.priorityRank-b.priorityRank);
  const macros=[['protein_g','タンパク質',4,'#38d8eb'],['fat_g','脂質',9,'#9a7dff'],['carbs_g','炭水化物',4,'#38e4b5']].map(([key,label,factor,color])=>{
    const amount=totals[String(key)];return {key:String(key),label:String(label),grams:amount.known,energy:amount.known*Number(factor),missing:amount.missing,total:amount.total,color:String(color)};
  });
  const recent=[...data.meals.filter(m=>!m.voided&&inPeriod(m.request.date)).map(m=>({id:'meal:'+m.id,date:m.request.date,kind:'食事',title:m.request.items.map(i=>i.name).join('・'),detail:m.request.meal==='breakfast'?'朝食':m.request.meal==='lunch'?'昼食':m.request.meal==='dinner'?'夕食':'間食',tab:'nutrition' as const})),
    ...sessions.map(s=>({id:'session:'+s.id,date:s.date,kind:'筋トレ',title:({upper_A:'上半身 A',upper_B:'上半身 B',lower:'下半身'})[s.splitType],detail:s.finishedAt?'完了':'途中',tab:'workout' as const})),
    ...measured.filter(m=>inPeriod(m.date)).map(m=>({id:'body:'+m.date,date:m.date,kind:'体組成',title:'体の測定',detail:m.weightKg==null?'サイズ等を記録':`${Number(m.weightKg.toFixed(2))} kg`,tab:'body' as const})),
    ...data.cardio.filter(c=>inPeriod(c.date)).map((c,i)=>({id:'cardio:'+i,date:c.date,kind:'有酸素',title:c.modality,detail:`${c.durationMin}分`,tab:'workout' as const})),
  ].sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).slice(0,8);
  return {from,date,days,metrics,meals,dailyMeals,totals,targets,targetError,sets,sessions,completed,latest,change,trend,muscleLoad,macros,recent,
    volume:Math.round(sets.reduce((s,r)=>s+r.actualWeight*r.actualReps,0)),
    trainingDays:new Set(sets.map(s=>s.date)).size,recordedMealDays:new Set(meals.map(m=>m.request.date)).size,
    pendingMeals:data.jobs.filter(j=>j.request.date===date&&['pending','review'].includes(j.status)).length,
    cardioMinutes:data.cardio.filter(c=>inPeriod(c.date)).reduce((n,c)=>n+c.durationMin,0),
    events:data.events.filter(e=>inPeriod(e.date)),plans:data.plans.filter(p=>inPeriod(p.date)),
    baselines:data.baselines.filter(b=>b.calibratedAt<=Date.parse(date+'T23:59:59.999+09:00')),
    legacy:(data.legacy??[]).filter(n=>inPeriod(n.date)),
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyPlan, proposeReplacement, validBaseline, weeklyCredits, WORKOUT_GROUPS, type PlannerInput } from '../src/engine/planner';
import { prescribeNextLoad } from '../src/engine/progression';
import { todayInJapan, shiftDate } from '../src/engine/dates';
import { parseTrainingBackup } from '../src/engine/backup';
import { EXERCISES } from '../src/db/seed/exercises';
import { MUSCLES } from '../src/db/seed/muscles';
import { MUSCLE_CREDITS } from '../src/db/seed/muscleCredits';
import { getExerciseSteps } from '../src/engine/exerciseGuides';
import type { DailyPlan, SetRecord, SplitType } from '../src/db/types';

const date = '2026-10-11';
const now = Date.parse(`${date}T12:00:00+09:00`);
function input(): PlannerInput {
  return { date,now,exercises: EXERCISES,baselines: EXERCISES.filter(e => e.isAvailable).map(e => ({ exerciseId:e.id,weightKg:e.increment===0?0:50,reps:e.repRange[0],rir:2,est1rm:60,calibratedAt:Date.parse('2026-10-01T12:00:00+09:00') })),sets:[],sessions:[],plans:[],muscles:MUSCLES,credits:MUSCLE_CREDITS,context:{ minutes:60,readiness:'normal',soreMuscles:[],pain:false,split:'upper_A' } };
}
function set(exerciseId=14,overrides:Partial<SetRecord>={}): SetRecord {
  return { id:1,sessionId:1,exerciseId,date:'2026-10-08',setOrder:1,targetWeight:50,actualWeight:50,targetReps:12,actualReps:12,targetRir:2,actualRir:2,volumeLoad:600,est1rm:70,isWarmup:0,mode:'load',...overrides };
}
function plan(overrides:Partial<DailyPlan>={}):DailyPlan { return { ...buildDailyPlan(input()),sessionId:1,status:'completed',...overrides }; }

test('Japan day switches at UTC 15:00, including leap dates',()=> { assert.equal(todayInJapan(new Date('2026-10-10T14:59:59Z')),'2026-10-10'); assert.equal(todayInJapan(new Date('2026-10-10T15:00:00Z')),'2026-10-11'); assert.equal(shiftDate('2024-03-01',-1),'2024-02-29'); });
test('Week0 accepts zero only for bodyweight and rejects impossible inputs',()=> { const b=input().baselines.find(b=>b.exerciseId===27)!; assert(validBaseline(b,EXERCISES.find(e=>e.id===27)!)); assert(!validBaseline({...b,weightKg:0},EXERCISES[0])); assert(!validBaseline({...b,reps:-1},EXERCISES[0])); assert(!validBaseline({...b,weightKg:NaN},EXERCISES[0])); });
test('First session preserves valid Week0, instead of resetting weights',()=> { const p=buildDailyPlan(input()); assert(p.exercises.length>0); for(const e of p.exercises) { assert.equal(e.targetWeight,50); assert.equal(e.source,'baseline'); assert.equal(e.targetRir,2); } });
test('Each split creates a time-bounded nonduplicated menu',()=> { for(const split of ['upper_A','lower','upper_B'] as SplitType[]) { const i=input(); i.context.split=split; for(const minutes of [30,45,60,75,90]) { i.context.minutes=minutes; const p=buildDailyPlan(i); assert(p.exercises.length>0); assert(p.estimatedMinutes<=minutes); assert.equal(new Set(p.exercises.map(e=>e.exerciseId)).size,p.exercises.length); for(const group of WORKOUT_GROUPS[split]) assert(p.exercises.filter(e=>group.includes(e.exerciseId)).length<=1); } } });
test('Pain does not produce a strength menu',()=> { const i=input(); i.context.pain=true; assert.equal(buildDailyPlan(i).exercises.length,0); });
test('Sore primary and secondary muscles are excluded',()=> { const i=input(); i.context.soreMuscles=['biceps_long']; const p=buildDailyPlan(i); assert(p.exercises.every(e=>!MUSCLE_CREDITS.some(c=>c.exerciseId===e.exerciseId && c.credit>=.5 && c.muscle==='biceps_long'))); });
test('Missing calibration is omitted without requiring Week0 restart',()=> { const i=input(); i.baselines=i.baselines.filter(b=>b.exerciseId!==8); const p=buildDailyPlan(i); assert(!p.exercises.some(e=>e.exerciseId===8)); assert(p.exercises.length>0); });
test('Fatigued sessions lower load, sets and intensity',()=> { const i=input(); i.context.readiness='tired'; const p=buildDailyPlan(i); assert(p.exercises.every(e=>e.sets<=2 && e.targetRir===3 && e.targetWeight<50)); });
test('Forbidden or unavailable exercises are never prescribed',()=> { const i=input(); i.exercises=i.exercises.map(e=>e.id===8?{...e,silhouetteTag:'forbidden'}:e); assert(!buildDailyPlan(i).exercises.some(e=>e.exerciseId===8 || e.exerciseId===28 || e.exerciseId===22)); });
test('Weekly workload excludes calibration, warmups, future dates and expired days',()=> { const sets=[set(),set(14,{mode:'calibration'}),set(14,{isWarmup:1}),set(14,{date:'2026-10-12'}),set(14,{date:'2026-10-04'})]; const totals=weeklyCredits(sets,MUSCLE_CREDITS,date); assert.equal(totals.lat,1); assert.equal(totals.traps_mid,.5); assert.equal(totals.erector,.3); });
test('Recent work prevents loading the same main muscle again',()=> { const i=input(); i.sets=[set(12,{date:'2026-10-10'})]; const p=buildDailyPlan(i); assert(!p.exercises.some(e=>e.exerciseId===12 || e.exerciseId===14)); });
test('Future records cannot suppress today or affect progression',()=> { const i=input(); i.sets=[set(14,{date:'2026-10-12',actualWeight:90})]; assert.equal(buildDailyPlan(i).exercises.find(e=>e.exerciseId===14)!.targetWeight,50); });
test('Weekly caps include planned overlapping exercises',()=> { const i=input(); i.sets=Array.from({length:13},(_,n)=>set(12,{id:n+1})); const p=buildDailyPlan(i); const added=p.exercises.reduce((s,e)=>s+e.sets*(MUSCLE_CREDITS.find(c=>c.exerciseId===e.exerciseId&&c.muscle==='lat')?.credit??0),0); assert(13+added<=14); });
test('Legacy session 1 is separated by date, using latest performance',()=> { const i=input(); i.sets=[set(14,{date:'2026-10-05',actualWeight:80}),set(14,{date:'2026-10-08',actualWeight:50})]; const e=buildDailyPlan(i).exercises.find(e=>e.exerciseId===14)!; assert.equal(e.targetWeight,51.25); });
test('Weakest completed set governs progression',()=> { const i=input(); i.sets=[set(),set(14,{id:2,setOrder:2,actualReps:8,actualRir:1}),set(14,{id:3,setOrder:3})]; i.plans=[plan({date:'2026-10-08'})]; const e=buildDailyPlan(i).exercises.find(e=>e.exerciseId===14)!; assert.equal(e.targetWeight,50); assert.equal(e.targetReps,8); });
test('Interrupted and partially skipped exercises do not justify an increase',()=> { for(const status of ['stopped','completed'] as const) { const i=input(); i.sets=[set()]; i.plans=[plan({status,date:'2026-10-08',skippedExerciseIds:status==='completed'?[14]:[]})]; assert.equal(buildDailyPlan(i).exercises.find(e=>e.exerciseId===14)!.source,'baseline'); } });
test('Mixed-weight sessions hold the lighter load',()=> { const i=input(); i.sets=[set(),set(14,{id:2,actualWeight:51.25}),set(14,{id:3})]; i.plans=[plan({date:'2026-10-08'})]; assert.equal(buildDailyPlan(i).exercises.find(e=>e.exerciseId===14)!.targetWeight,50); });
test('A freshly recalibrated baseline overrides older performance',()=> { const i=input(); i.sets=[set()]; i.baselines.find(b=>b.exerciseId===14)!.calibratedAt=Date.parse('2026-10-09T12:00:00+09:00'); assert.equal(buildDailyPlan(i).exercises.find(e=>e.exerciseId===14)!.source,'baseline'); });
test('Progression increases just one available increment with spare reps',()=> { const ex=EXERCISES.find(e=>e.id===14)!; assert.equal(prescribeNextLoad({weight:50,reps:12,rir:2},ex).targetWeight,51.25); assert.equal(prescribeNextLoad({weight:50,reps:12,rir:1},ex).targetWeight,50); });
test('Coarse increments stay put and failure lowers one step',()=> { const ex=EXERCISES.find(e=>e.id===4)!; assert.equal(prescribeNextLoad({weight:20,reps:10,rir:3},ex).targetWeight,20); assert.equal(prescribeNextLoad({weight:50,reps:6,rir:0},ex).targetWeight,45); });
test('Bodyweight uses zero weight and bounded reps',()=> { const ex=EXERCISES.find(e=>e.id===27)!; const p=prescribeNextLoad({weight:0,reps:20,rir:2},ex); assert.equal(p.targetWeight,0); assert.equal(p.targetReps,20); });
test('Every catalogue exercise has concrete four-step guidance',()=> { for(const ex of EXERCISES) { const steps=getExerciseSteps(ex); assert.equal(steps.length,4); assert(steps.every(s=>s.text.length>15)); assert(!steps.some(s=>s.text.includes('引きちぎられる')||s.text.includes('限界まで搾り'))); assert(!steps[0].text.includes('使用表示で確認し、軽い重量で姿勢')); } });
test('Backup roundtrips valid records and rejects malformed payloads before writes',()=> { const b={app:'HypertrophyNavigator',version:2,exportedAt:new Date(now).toISOString(),baselines:input().baselines,sessions:[],sets:[],plans:[]}; assert.deepEqual(parseTrainingBackup(JSON.stringify(b)),b); assert.throws(()=>parseTrainingBackup('{}')); assert.throws(()=>parseTrainingBackup(JSON.stringify({...b,baselines:[{...b.baselines[0],reps:-1}]}))); assert.throws(()=>parseTrainingBackup(JSON.stringify({...b,sets:[set()]}))); });
test('A short session retains a main lift and gives time to priority muscles',()=> { const i=input(); i.context.minutes=30; const p=buildDailyPlan(i); assert(p.exercises.some(e=>e.exerciseId===12)); assert(p.exercises.some(e=>e.exerciseId===1)); assert(p.exercises.some(e=>e.exerciseId===8||e.exerciseId===9)); });
test('A measured alternative uses its own weight, not the original machine weight',()=> { const i=input(); i.baselines.find(b=>b.exerciseId===13)!.weightKg=70; const p=plan({status:'active'}); const r=proposeReplacement(p,12,13,i); assert(r); assert.equal(r.targetWeight,70); assert.equal(r.exerciseId,13); });
test('Alternatives reject unmeasured, wrong-slot and already-logged candidates',()=> { const i=input(); const p=plan({status:'active'}); assert.equal(proposeReplacement(p,12,8,i),undefined); i.baselines=i.baselines.filter(b=>b.exerciseId!==13); assert.equal(proposeReplacement(p,12,13,i),undefined); const j=input(); j.sets=[set(12,{sessionId:p.sessionId})]; assert.equal(proposeReplacement(p,12,13,j),undefined); });
test('Replacement can follow own-session work without ignoring other-session recovery',()=> { const i=input(); const p=plan({status:'active'}); i.sets=[set(14,{date,sessionId:p.sessionId})]; assert(proposeReplacement(p,12,13,i)); i.sets=[set(14,{date,sessionId:999})]; assert.equal(proposeReplacement(p,12,13,i),undefined); });
test('Automatic split continues from the last completed workout',()=> { const i=input(); i.context.split=undefined; i.plans=[plan({date:'2026-10-05',createdAt:now-6*86400000,split:'upper_A'})]; i.sets=[set(12,{date:'2026-10-05'})]; assert.equal(buildDailyPlan(i).split,'lower'); });
test('A session across midnight uses all completed sets, and same-day recalibration resets progression',()=> {
  const i=input(); const ex=EXERCISES.find(e=>e.id===14)!;
  i.plans=[plan({date:'2026-10-07',createdAt:Date.parse('2026-10-07T23:00:00+09:00'),exercises:[{exerciseId:14,targetWeight:50,targetReps:ex.repRange[1],targetRir:2,sets:3,restSec:120,reason:'test',source:'baseline'}]})];
  i.sets=[set(14,{id:1,date:'2026-10-07',actualReps:ex.repRange[0],actualRir:1}),set(14,{id:2,setOrder:2,actualReps:ex.repRange[1],actualRir:3}),set(14,{id:3,setOrder:3,actualReps:ex.repRange[1],actualRir:3})];
  assert.equal(buildDailyPlan(i).exercises.find(e=>e.exerciseId===14)!.targetWeight,50);
  i.baselines.find(b=>b.exerciseId===14)!.calibratedAt=Date.parse('2026-10-08T18:00:00+09:00');
  i.baselines.find(b=>b.exerciseId===14)!.weightKg=40;
  assert.equal(buildDailyPlan(i).exercises.find(e=>e.exerciseId===14)!.targetWeight,40);
});
test('Backup rejects invalid dates, duplicates and incomplete active plan metadata',()=> { const b={app:'HypertrophyNavigator',version:2,exportedAt:'dummy',baselines:input().baselines,sessions:[],sets:[],plans:[]}; assert.throws(()=>parseTrainingBackup(JSON.stringify({...b,baselines:[b.baselines[0],b.baselines[0]]}))); assert.throws(()=>parseTrainingBackup(JSON.stringify({...b,sessions:[{id:1,date:'2026-99-99',startedAt:1,splitType:'upper_A',mesocycleWeek:1,isDeload:0}]}))); assert.throws(()=>parseTrainingBackup('{personal malformed content')); });

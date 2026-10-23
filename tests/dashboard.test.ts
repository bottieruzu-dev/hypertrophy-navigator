import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardSummary } from '../src/engine/dashboard';
import { dashboardFixture } from './dashboard-fixture';
test('dashboard separates missing days, unknown nutrients and voided meals from known intake',()=>{
  const d=dashboardFixture(),date='2026-10-23';d.meals=d.meals.filter(m=>m.request.date===date);d.meals[0].response.items[0].nutrients.protein_g=null;d.meals[1].voided=true;
  const s=dashboardSummary(d,date,7);assert.equal(s.dailyMeals.length,1);assert.equal(s.totals.protein_g.missing,1);assert.equal(s.trend[0].energy,null);assert.equal(s.recordedMealDays,1);
});
test('future measurements, sessions, sets and meals cannot leak into a historical dashboard',()=>{
  const d=dashboardFixture();const s=dashboardSummary(d,'2026-10-18',7);assert(s.metrics.every(m=>m.date<='2026-10-18'));assert(s.sessions.every(m=>m.date<='2026-10-18'));assert(s.sets.every(m=>m.date<='2026-10-18'));assert(s.meals.every(m=>m.request.date<='2026-10-18'));assert.equal(s.trend.length,7);
});
test('training volume excludes warmups and calibration, includes bodyweight sets without fake load',()=>{
  const d=dashboardFixture();const set={...d.sets.at(-1)!,date:'2026-10-23'};d.sets=[{...set,actualWeight:0,actualReps:10},{...set,isWarmup:1},{...set,mode:'calibration'}];
  const s=dashboardSummary(d,'2026-10-23',7);assert.equal(s.sets.length,1);assert.equal(s.trainingDays,1);assert.equal(s.volume,0);
});
test('empty dashboard has no fabricated weight, intake, or target',()=>{
  const d=dashboardFixture();Object.assign(d,{metrics:[],meals:[],sets:[],sessions:[],profile:null});const s=dashboardSummary(d,'2026-10-23',30);assert.equal(s.latest('weightKg'),undefined);assert.equal(s.targets,null);assert.equal(s.totals.energy_kcal.total,0);assert(s.trend.every(p=>p.energy===null));assert.equal(s.change('weightKg'),null);
});
test('muscle load always covers seven days and invalid date ranges are rejected',()=>{
  const d=dashboardFixture(),a=dashboardSummary(d,'2026-10-23',7),b=dashboardSummary(d,'2026-10-23',90);assert.deepEqual(a.muscleLoad,b.muscleLoad);assert.throws(()=>dashboardSummary(d,'2026-02-30',30));assert.throws(()=>dashboardSummary(d,'2026-10-23',0));
});
test('historical nutrition uses the saved target instead of a newly edited profile',()=>{
  const d=dashboardFixture();const prior=d.meals.find(m=>m.request.date==='2026-10-18')!.targets.values.energy_kcal;
  d.profile={...d.profile!,energyOverride:3000};assert.equal(dashboardSummary(d,'2026-10-18',7).targets!.values.energy_kcal,prior);
});

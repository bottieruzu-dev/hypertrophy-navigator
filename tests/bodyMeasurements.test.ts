import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_CHART_FIELDS, deriveBodyMetric } from '../src/engine/bodyMeasurements';
import type { BodyMetric } from '../src/db/types';
const empty:BodyMetric={date:'2026-10-15',weightKg:null,bodyFatPct:null,ffmKg:null,weightMa7:null,ffmMa30:null,waistCm:80,shoulderCm:112,chestCm:95,armCm:30,thighCm:50,vTaperRatio:null,vTaperMa7:null,sleepHours:null,prsScore:null,isInterpolated:0};
test('old records preserve waist/chest/limbs and navel is a separate optional measurement',()=>{
  const r=deriveBodyMetric(empty,{navelCm:85},[]);
  assert.equal(r.waistCm,80);assert.equal(r.navelCm,85);assert.equal(r.chestCm,95);assert.equal(r.armCm,30);assert.equal(r.thighCm,50);
  assert.equal(deriveBodyMetric(empty,{},[]).navelCm,null);
  assert.equal(empty.navelCm,undefined);
});
test('zero self-ratings are recorded; invalid measurements are rejected before saving',()=>{
  const r=deriveBodyMetric(empty,{sleepHours:0,prsScore:0},[]);
  assert.equal(r.sleepHours,0);assert.equal(r.prsScore,0);
  for(const input of [{navelCm:-1},{armCm:NaN},{thighCm:Infinity},{prsScore:11},{sleepHours:25},{weightKg:0}]) assert.throws(()=>deriveBodyMetric(empty,input,[]));
});
test('rolling averages exclude future, old, missing and interpolated values and replace same-day entry',()=>{
  const r=deriveBodyMetric(empty,{weightKg:70,bodyFatPct:20},[
    {...empty,date:'2026-10-14',weightKg:72,ffmKg:58},
    {...empty,date:'2026-10-15',weightKg:99,ffmKg:90},
    {...empty,date:'2026-10-16',weightKg:100,ffmKg:90},
    {...empty,date:'2026-09-01',weightKg:100,ffmKg:90},
    {...empty,date:'2026-10-13',weightKg:100,ffmKg:90,isInterpolated:1},
    {...empty,date:'2026-10-12',weightKg:0,ffmKg:0},
  ]);
  assert.equal(r.weightMa7,71);assert.equal(r.ffmKg,56);assert.equal(r.ffmMa30,57);assert.equal(r.vTaperRatio,1.4);
  assert.equal(deriveBodyMetric(r,{weightKg:null,waistCm:null},[]).ffmKg,null);
  assert.equal(deriveBodyMetric(r,{waistCm:null},[]).vTaperRatio,null);
});
test('every measurement and derived trend can be charted',()=>{
  assert.equal(new Set(BODY_CHART_FIELDS.map(f=>f.key)).size,15);
  for(const key of ['navelCm','chestCm','armCm','thighCm','sleepHours','prsScore','ffmKg','weightMa7','ffmMa30','vTaperRatio','vTaperMa7'])assert.ok(BODY_CHART_FIELDS.some(f=>f.key===key));
});

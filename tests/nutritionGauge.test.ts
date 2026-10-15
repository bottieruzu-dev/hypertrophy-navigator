import test from 'node:test';
import assert from 'node:assert/strict';
import { nutritionGauge } from '../src/engine/nutritionGauge';
import { NUTRIENTS } from '../src/engine/nutrition';
const protein=NUTRIENTS.find(n=>n.key==='protein_g')!,salt=NUTRIENTS.find(n=>n.key==='salt_g')!,vitamin=NUTRIENTS.find(n=>n.key==='vitamin_c_mg')!;
test('no meals and all unknown values are not zero intake',()=>{
  assert.equal(nutritionGauge(protein,{known:0,missing:0,total:0},140).label,'未記録');
  const unknown=nutritionGauge(protein,{known:0,missing:1,total:1},140);
  assert.equal(unknown.ratio,null);assert.equal(unknown.label,'不明');
  assert.equal(nutritionGauge(protein,{known:0,missing:0,total:1},140).label,'目安まで');
});
test('partial unknown intake cannot claim a goal is met',()=>{
  const g=nutritionGauge(protein,{known:150,missing:1,total:2},140);
  assert.equal(g.label,'一部不明');assert.equal(g.tone,'unknown');assert.ok(g.width>0);
});
test('known salt excess is identifiable even with missing foods',()=>{
  assert.equal(nutritionGauge(salt,{known:9,missing:1,total:2},7.5).tone,'high');
  assert.equal(nutritionGauge(salt,{known:1,missing:1,total:2},7.5).tone,'unknown');
  assert.equal(nutritionGauge(salt,{known:1,missing:0,total:1},7.5).label,'範囲内');
});
test('vitamin reference attainment is not diagnosed as excess; gauge caps but percentage does not',()=>{
  const g=nutritionGauge(vitamin,{known:300,missing:0,total:1},100);
  assert.equal(g.label,'目安に到達');assert.equal(g.ratio,3);assert.equal(g.width,100);
  assert.equal(nutritionGauge(protein,{known:160,missing:0,total:1},140).label,'目標以上');
  assert.equal(nutritionGauge(protein,{known:0,missing:0,total:1},0).ratio,null);
});

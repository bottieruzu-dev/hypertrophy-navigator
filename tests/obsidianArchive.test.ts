import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveChanges, archiveHash, canonical, projectArchive, type ArchiveRecord } from '../src/engine/obsidianArchive';
import { archiveCutoff, renderArchive, validateSnapshot } from '../tools/obsidian/render';
import { createArchiveHandler } from '../tools/obsidian/handler';
const snapshot=(records:ArchiveRecord[])=>({schemaVersion:1,complete:true,count:records.length,records});
const record=(kind:ArchiveRecord['kind'],id:string,data:Record<string,unknown>):ArchiveRecord=>({kind,id,data,deleted:false});
function meal(id:string,date:string,energy:number|null,voided=false):ArchiveRecord {
  return record('meal',id,{id,revision:1,savedAt:1,voided,
    request:{id,date,meal:'snack',createdAt:1,items:[{id:'food',name:'ダミーみかん',product:'ダミー商品',state:'生',note:'確認用',quantity:1,unit:'piece'}]},
    response:{version:1,requestId:id,date,meal:'snack',basis:'consumed',items:[{id:'food',quantity:1,unit:'piece',edibleGrams:80,nutrients:{energy_kcal:energy,fat_g:0},source:'ダミー成分表',assumptions:'ダミー仮定'}]},
    targets:{values:{energy_kcal:2000,fat_g:60}},
  });
}
test('projection excludes settings/profile/auth, preserves measured units, and hashes canonical keys',async()=>{
  const input=meal('m','2026-10-01',40).data;
  const projected=projectArchive('meal','m',{...input,auth:'must-not-export',targets:{values:{energy_kcal:2000},profile:{secret:'must-not-export'}}});
  assert(!JSON.stringify(projected).includes('must-not-export'));
  assert(JSON.stringify(projected).includes('piece'));
  assert.equal(await archiveHash({a:1,b:2}),await archiveHash({b:2,a:1}));
  assert.equal(canonical([1,2]),'[1,2]');
  assert.deepEqual(projectArchive('body','2026-10-01',{private:true,weightKg:70}).data,{});
});
test('JST daily cutoff catches up all closed days, including midnight and year boundary',()=>{
  assert.equal(archiveCutoff(new Date('2026-10-15T14:58:59Z')),'2026-10-14');
  assert.equal(archiveCutoff(new Date('2026-10-15T14:59:00Z')),'2026-10-15');
  assert.equal(archiveCutoff(new Date('2026-10-15T15:00:00Z')),'2026-10-15');
  assert.equal(archiveCutoff(new Date('2026-01-01T00:00:00Z')),'2025-12-31');
  assert.equal(archiveCutoff(new Date('2026-10-15T00:00:00Z'),true),'2026-10-15');
});
test('publication tracks only this device records, replays safely, retains tombstones and restores same IDs',async()=>{
  const r=record('event','dummy',{date:'2026-10-01',eventType:'dummy'});
  const first=await archiveChanges([r],{});assert.equal(first.changes.length,1);assert.equal(first.changes[0].expected,null);
  assert.equal((await archiveChanges([r],first.hashes)).changes.length,0);
  const edited={...r,data:{...r.data,date:'2026-10-02'}};
  const second=await archiveChanges([edited],first.hashes);assert.equal(second.changes[0].expected,first.hashes['event:dummy']);
  const deleted=await archiveChanges([],second.hashes);assert.equal(deleted.changes.length,1);assert(deleted.changes[0].deleted);
  assert.equal((await archiveChanges([],deleted.hashes)).changes.length,0);
  const restored=await archiveChanges([r],deleted.hashes);assert.equal(restored.changes[0].expected,deleted.hashes['event:dummy']);assert(!restored.changes[0].deleted);
  assert.deepEqual((await archiveChanges([],{})).changes,[]); // Missing another device's IDs never implies deletion.
});
test('full snapshot validates completeness/identity and fails closed on malformed data',()=>{
  const s=snapshot([record('body','d',{date:'2026-10-01',weightKg:70})]);
  assert.equal(validateSnapshot(s).count,1);
  for(const bad of [{...s,count:0},{...s,complete:false},{...s,records:[...s.records,...s.records],count:2}])assert.throws(()=>validateSnapshot(bad));
  assert.throws(()=>renderArchive(snapshot([record('body','d',{date:'2026-02-30'})]),'2026-10-15'));
  assert.throws(()=>renderArchive(snapshot([{...meal('m','2026-10-01',40),data:{}}]),'2026-10-15'));
});
test('daily/month/year retain all measured fields, distinguish unknown and zero, exclude voids from averages',()=>{
  const records=[meal('m','2026-10-01',40),meal('u','2026-10-03',null),meal('void','2026-10-01',999,true),
    record('body','2026-10-01',{date:'2026-10-01',weight_kg:70,navel_cm:83,arm_cm:30,thigh_cm:50,is_interpolated:0}),
    record('body','2026-10-03',{date:'2026-10-03',weightKg:69,isInterpolated:0}),
    record('exercise','10',{name:'ダミー種目'}),record('session','1',{date:'2026-10-01',splitType:'upper_A',finishedAt:1}),
    record('set','2',{date:'2026-10-01',sessionId:1,exerciseId:10,actualWeight:50,actualReps:10,actualRir:2}),
    meal('future','2026-11-01',123),
  ];
  const output=renderArchive(snapshot(records),'2026-10-15');
  const daily=output.get('日次/2026/10/2026-10-01.md')!;
  assert(daily.includes('おへそ周り | 83'));assert(daily.includes('腕周り（上腕） | 30'));
  assert(daily.includes('ダミー種目'));assert(daily.includes('50 × 10'));assert(daily.includes('ダミー仮定'));assert(daily.includes('1個'));
  assert(daily.includes('カロリー | 40 | kcal'));assert(daily.includes('脂質 | 0 | g'));
  const monthly=output.get('月次/2026/2026-10.md')!;
  assert(monthly.includes('カロリー | 40 | kcal | 1 | 1'));assert(monthly.includes('| -1 | kg'));
  assert(output.has('年次/2026.md'));assert(![...output.keys()].some(p=>p.includes('2026-11')));
});
test('stable IDs retain equal text, edits replace, explicit deletion/private origins disappear, markup cannot become markers',()=>{
  const a=record('event','a',{date:'2026-10-01',eventType:'same',triggerReason:'same'});
  const b=record('event','b',{date:'2026-10-01',eventType:'same',triggerReason:'same'});
  const c=record('event','c',{date:'2026-10-01',eventType:'private',triggerReason:'must-not-export',private:true});
  const d=record('event','d',{date:'2026-10-01',originKey:'event:c',triggerReason:'must-not-export'});
  const out=renderArchive(snapshot([a,b,c,d]),'2026-10-15');
  const body=out.get('日次/2026/10/2026-10-01.md')!;
  assert(body.includes('| a |'));assert(body.includes('| b |'));assert(!body.includes('must-not-export'));
  a.data.triggerReason='<!-- hypertrophy-archive:end --> | [link](x)';
  const next=renderArchive(snapshot([a,{...b,deleted:true}]),'2026-10-15').get('日次/2026/10/2026-10-01.md')!;
  assert(!next.includes('| b |'));assert(!next.includes('<!--'));assert(next.includes('&lt;!--'));
});
test('export handler never invokes RPC without header auth, rejects query/body, and hides backend errors',async()=>{
  let calls=0;
  const handler=createArchiveHandler(async token=>{calls++;assert.equal(token,'a'.repeat(64));return snapshot([]);});
  assert.equal((await handler(new Request('https://example.test',{method:'POST'}))).status,401);assert.equal(calls,0);
  const headers={'X-Workout-Archive-Token':'a'.repeat(64)};
  assert.equal((await handler(new Request('https://example.test?token=dummy',{method:'POST',headers}))).status,405);
  assert.equal((await handler(new Request('https://example.test',{method:'POST',headers,body:'no'}))).status,400);
  const response=await handler(new Request('https://example.test',{method:'POST',headers}));assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');
  const failure=createArchiveHandler(async()=>{throw new Error('DUMMY_SECRET');});
  assert(!(await (await failure(new Request('https://example.test',{method:'POST',headers}))).text()).includes('DUMMY_SECRET'));
});

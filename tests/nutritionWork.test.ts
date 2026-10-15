import test from 'node:test';
import assert from 'node:assert/strict';
import { createNutritionHandler, type VerifiedWorker } from '../tools/nutrition-work/handler';
import { canonical, decodeWorkJob, validateWorkJob, shouldApplyWorkJob, workRecordMayReplace, type NutritionWorkJob } from '../src/engine/nutritionWork';
import { nutritionTargets, type MealRequest, type NutritionProfile, type NutritionResponse } from '../src/engine/nutrition';
import { parseNutritionBackup } from '../src/engine/nutritionBackup';
const request:MealRequest={id:'dummy-work-request',date:'2026-10-15',meal:'lunch',createdAt:1,items:[{id:'dummy-food',name:'架空食材',product:'',note:'',state:'生',quantity:100,unit:'g'}]};
const profile:NutritionProfile={age:25,sex:'male',menstruating:false,heightCm:170,initialWeightKg:60,activityFactor:1.55,deficitFraction:.15,energyOverride:null};
const response=():NutritionResponse=>({version:1,requestId:request.id,date:request.date,meal:request.meal,basis:'consumed',items:[{id:'dummy-food',quantity:100,unit:'g',edibleGrams:100,nutrients:{protein_g:10},source:'架空の試験値',assumptions:'本番の栄養推定ではない'}]});
const targets=nutritionTargets(profile,[],request.date);
const job=():NutritionWorkJob=>({id:request.id,request,targets,status:'review',response:response(),responseRevision:1,version:2,record:null,cloudSaved:true});
const issuer='https://dummy.supabase.co/auth/v1',resource='https://dummy.supabase.co/functions/v1/nutrition-work-mcp';
const claims=():VerifiedWorker=>({subject:'dummy-owner',issuer,audience:resource,expires:Date.now()/1000+600,clientId:'dummy-client',scope:'openid'});
function fixture(change:Partial<VerifiedWorker>={},deny=false) {
  let saved:unknown=null,calls=0;
  const handler=createNutritionHandler({issuer,resource,verify:async()=>({...claims(),...change}),rpc:async(_token,name,args)=>{
    calls++;if(deny)throw new Error('Denied');
    if(name==='hypertrophy_nutrition_pending')return [{request,responseRevision:0}];
    if(name==='hypertrophy_nutrition_get')return {request,responseRevision:0};
    if(name==='hypertrophy_nutrition_save_draft'){if(args.p_response_revision!==0)throw new Error('Stale');saved=args.p_response;return {saved:true,responseRevision:1};}
    throw new Error('Unexpected RPC');
  }});
  const call=async(name:string,args:unknown={})=>handler(new Request(resource,{method:'POST',headers:{Authorization:'Bearer dummy-test-token'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));
  return {handler,call,saved:()=>saved,calls:()=>calls};
}
test('missing credentials and invalid issuer/audience/expiry/scope/client are rejected before any queue RPC',async()=>{
  const f=fixture();const r=await f.handler(new Request(resource,{method:'POST',body:'{}'}));assert.equal(r.status,401);assert.equal(f.calls(),0);
  for(const change of [{issuer:'https://other.example/auth'}, {audience:'authenticated'}, {expires:1}, {scope:''}, {clientId:''}]){
    const x=fixture(change);assert.equal((await x.call('list_pending_meals')).status,401);assert.equal(x.calls(),0);
  }
});
test('valid JWT without owner client approval still cannot reach meals',async()=>{
  const f=fixture({},true);assert.equal((await f.call('list_pending_meals')).status,401);assert.equal(f.saved(),null);
});
test('metadata is public and contains no owner identity or meal data',async()=>{
  const f=fixture();const r=await f.handler(new Request(resource+'/.well-known/oauth-protected-resource'));
  assert.equal(r.status,200);assert.deepEqual((await r.json()).authorization_servers,[issuer]);assert.equal(f.calls(),0);
});
test('pending output only contains request, revision and calculation instructions',async()=>{
  const f=fixture();const r=await(await f.call('list_pending_meals')).json();
  assert.deepEqual(Object.keys(r.result.structuredContent.meals[0]).sort(),['instructions','request','responseRevision']);
  assert.equal(JSON.stringify(r).includes('initialWeightKg'),false);assert.equal(JSON.stringify(r).includes('targets'),false);
});
test('worker saves a normalized draft; unknown nutrients become null',async()=>{
  const f=fixture();const r=await(await f.call('save_nutrition_draft',{requestId:request.id,responseRevision:0,response:response()})).json();
  assert.equal(r.result.structuredContent.saved,true);assert.equal((f.saved() as NutritionResponse).items[0].nutrients.vitamin_c_mg,null);
});
test('changed quantity, wrong request, invalid source and stale draft do not save',async()=>{
  const wrongQuantity=response();wrongQuantity.items[0].quantity=50;
  const noSource=response();noSource.items[0].source='';
  for(const value of [wrongQuantity,noSource,{...response(),requestId:'other'}]){
    const f=fixture();const r=await(await f.call('save_nutrition_draft',{requestId:request.id,responseRevision:0,response:value})).json();
    assert.equal(r.result.isError,true);assert.equal(f.saved(),null);
  }
  const f=fixture();const r=await(await f.call('save_nutrition_draft',{requestId:request.id,responseRevision:9,response:response()})).json();
  assert.equal(r.result.isError,true);assert.equal(f.saved(),null);
});
test('unknown tools and extra arguments cannot confirm or delete meals',async()=>{
  const f=fixture();for(const name of ['confirm_meal','delete_record','arbitrary_sql'])assert.equal((await(await f.call(name)).json()).error.code,-32601);
  assert.equal((await(await f.call('list_pending_meals',{date:'all'})).json()).error.code,-32602);
});
test('oversized and malformed requests are rejected without saving',async()=>{
  const f=fixture();for(const [body,status]of [['x'.repeat(600001),413],['not json',200]]as const){
    const r=await f.handler(new Request(resource,{method:'POST',headers:{Authorization:'Bearer dummy-test-token'},body}));assert.equal(r.status,status);
  }assert.equal(f.saved(),null);
});
test('queue validates targets, immutable request, confirmed record and job version',()=>{
  validateWorkJob(job());assert.throws(()=>validateWorkJob({...job(),version:-1}));assert.throws(()=>validateWorkJob({...job(),status:'confirmed'}));
  assert.throws(()=>validateWorkJob({...job(),request:{...request,id:'different'}}));
  assert.throws(()=>validateWorkJob({...job(),targets:{...targets,values:{}}}));
  const decoded=decodeWorkJob({...job(),response_revision:1,version:2,record:null});assert.equal(decoded.cloudSaved,true);
});
test('same revision conflict cannot overwrite local record; newer void is accepted',()=>{
  const record={id:request.id,request,response:response(),targets,revision:1,savedAt:1,voided:false};
  assert.equal(workRecordMayReplace(record,structuredClone(record)),false);
  assert.throws(()=>workRecordMayReplace(record,{...record,voided:true}));
  assert.equal(workRecordMayReplace(record,{...record,revision:2,voided:true}),true);
});
test('late queue responses cannot reopen a cancelled job and same-version conflicts are rejected',()=>{
  const closed={...job(),status:'cancelled' as const,version:3};
  assert.equal(shouldApplyWorkJob(closed,job()),false);
  assert.equal(shouldApplyWorkJob(job(),structuredClone(job())),false);
  assert.throws(()=>shouldApplyWorkJob(job(),{...job(),status:'cancelled'}));
  assert.equal(shouldApplyWorkJob(job(),closed),true);
});
test('Work outbox backup roundtrips and rejects broken request association',()=>{
  const backup={app:'HypertrophyNutrition',version:1,profile,ingredients:[],requests:[request],records:[],legacy:[],workJobs:[job()]};
  assert.equal(parseNutritionBackup(JSON.stringify(backup)).workJobs?.length,1);
  assert.throws(()=>parseNutritionBackup(JSON.stringify({...backup,requests:[]})));
  assert.equal(canonical({a:1,b:2}),canonical({b:2,a:1}));
});

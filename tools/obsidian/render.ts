import { NUTRIENTS, MEALS, validDate, parseNutritionResponse, type MealRequest } from '../../src/engine/nutrition';
import { BODY_CHART_FIELDS } from '../../src/engine/bodyMeasurements';
import { ARCHIVE_FIELDS, type ArchiveKind, type ArchiveRecord } from '../../src/engine/obsidianArchive';
type Row = Record<string, unknown>;
export interface ArchiveSnapshot { schemaVersion: 1; complete: true; count: number; records: ArchiveRecord[] }
const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const text = (v: unknown): string => v === null || v === undefined ? '—' : String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\|/g,'&#124;').replace(/[\r\n]+/g,' / ').replace(/([\\`*_[\]#])/g,'\\$1');
const number = (v: unknown): string => finite(v) ? String(Math.round(v*1000)/1000) : '—';
const rows = (v: unknown): Row[] => Array.isArray(v) && v.every(object) ? v : [];
const table = (headers: string[], values: string[][]): string => `| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${values.map(r=>'| '+r.join(' | ')+' |').join('\n')}\n`;
function normalized(input: Row): Row {
  return Object.fromEntries(Object.entries(input).map(([key,value]) => [key.replace(/_([a-z])/g,(_m,c:string)=>c.toUpperCase()),value]));
}
export function japanDate(now: Date): string { return new Date(now.getTime()+9*3600000).toISOString().slice(0,10); }
export function archiveCutoff(now: Date, includeToday = false): string {
  const jst = new Date(now.getTime()+9*3600000);
  if (!includeToday && jst.toISOString().slice(11,16) < '23:59') jst.setUTCDate(jst.getUTCDate()-1);
  return jst.toISOString().slice(0,10);
}
export function validateSnapshot(value: unknown): ArchiveSnapshot {
  if (!object(value) || value.schemaVersion !== 1 || value.complete !== true || !Array.isArray(value.records) || !Number.isSafeInteger(value.count) || value.count !== value.records.length || value.records.length>100000) throw new Error('SNAPSHOT_INCOMPLETE');
  const ids = new Set<string>();
  for (const r of value.records) {
    if (!object(r) || typeof r.kind !== 'string' || !Object.hasOwn(ARCHIVE_FIELDS,r.kind) || typeof r.id !== 'string' || !r.id || r.id.length>100 || !object(r.data) || typeof r.deleted !== 'boolean') throw new Error('SNAPSHOT_RECORD');
    const key=r.kind+':'+r.id;
    if (ids.has(key)) throw new Error('SNAPSHOT_DUPLICATE');
    ids.add(key);
  }
  return value as unknown as ArchiveSnapshot;
}
interface Day { date: string; records: ArchiveRecord[]; nutrient: Map<string,{sum:number;known:number;missing:number}>; activeMeals: number }
function planBody(p: Row,ex: (v: unknown)=>string): string {
  let out=`\n計画：${text(p.reason)} / ${text(p.status)} / 予定${number(p.estimatedMinutes)}分\n\n`;
  out+=table(['種目','重量 kg','回数','セット','RIR','休憩 秒','参照元','理由'],rows(p.exercises).map(e=>[ex(e.exerciseId),number(e.targetWeight),number(e.targetReps),number(e.sets),number(e.targetRir),number(e.restSec),text(e.source),text(e.reason)]));
  out+=`\n注意：${text(Array.isArray(p.warnings)?p.warnings.join(' / '):null)}\n\n省略した種目：${Array.isArray(p.skippedExerciseIds)?p.skippedExerciseIds.map(ex).join(' / '):'—'}\n`;
  if(object(p.context))out+=`\n計画時の状況：予定${number(p.context.minutes)}分 / ${text(p.context.readiness)} / 痛み：${p.context.pain===true?'あり':p.context.pain===false?'なし':'—'} / 筋肉痛：${text(Array.isArray(p.context.soreMuscles)?p.context.soreMuscles.join(' / '):null)}\n`;
  return out;
}
function mealData(record: ArchiveRecord): { request: MealRequest; response: Row; targets: Row; voided: boolean; revision: unknown } {
  const d=record.data;
  if (!object(d.request) || !object(d.response) || !object(d.targets) || typeof d.voided !== 'boolean') throw new Error('MEAL_INVALID');
  const request=d.request as unknown as MealRequest;
  const parsed=parseNutritionResponse(JSON.stringify(d.response),request);
  if (request.id!==record.id || d.id!==record.id || !object(d.targets.values)) throw new Error('MEAL_INVALID');
  for (const v of Object.values(d.targets.values)) if (!finite(v) || v<0) throw new Error('MEAL_TARGET');
  return {request,response:parsed.response as unknown as Row,targets:d.targets,voided:d.voided,revision:d.revision};
}
function recordDate(r: ArchiveRecord): string | null {
  if (r.kind==='exercise') return null;
  const d=normalized(r.data);
  const date=r.kind==='meal' ? mealData(r).request.date : r.kind==='baseline' ? finite(d.calibratedAt) ? japanDate(new Date(d.calibratedAt)) : undefined : d.date;
  if (typeof date!=='string' || !validDate(date)) throw new Error('RECORD_DATE');
  return date;
}
function gather(snapshot: ArchiveSnapshot,cutoff: string): Day[] {
  const days=new Map<string,Day>();
  // Explicit flags and origin links are honored if introduced by a future producer.
  const excluded=new Set(snapshot.records.filter(r=>r.deleted || r.data.private===true).map(r=>r.kind+':'+r.id));
  let changed=true;
  while(changed) { changed=false; for(const r of snapshot.records) if(typeof r.data.originKey==='string' && excluded.has(r.data.originKey) && !excluded.has(r.kind+':'+r.id)) { excluded.add(r.kind+':'+r.id);changed=true; } }
  for (const r of snapshot.records) {
    if (excluded.has(r.kind+':'+r.id)) continue;
    const date=recordDate(r);
    if(!date || date>cutoff) continue;
    let day=days.get(date);
    if(!day) { day={date,records:[],nutrient:new Map(),activeMeals:0};days.set(date,day); }
    day.records.push({...r,data:normalized(r.data)});
    if(r.kind==='meal') {
      const m=mealData(r);
      if(m.voided) continue;
      day.activeMeals++;
      for(const n of NUTRIENTS) {
        const item=day.nutrient.get(n.key)??{sum:0,known:0,missing:0};
        for(const f of rows(m.response.items)) {
          const value=object(f.nutrients)?f.nutrients[n.key]:null;
          if(finite(value)) {item.sum+=value;item.known++;} else item.missing++;
        }
        day.nutrient.set(n.key,item);
      }
    }
  }
  return [...days.values()].sort((a,b)=>a.date.localeCompare(b.date));
}
function dayBody(day: Day,exerciseNames: Map<string,string>): string {
  const of=(kind: ArchiveKind)=>day.records.filter(r=>r.kind===kind);
  const ex=(v: unknown)=>text(exerciseNames.get(String(v))??`種目ID ${v}`);
  let out=`# ${day.date} 運動・栄養・体の記録\n\n日付：日本時間。原本はアプリ。未記録・不明は「—」で表示します。\n\n`;
  out+='## 運動\n\n';
  for(const session of of('session')) {
    const s=session.data;
    const sets=of('set').filter(r=>String(r.data.sessionId)===session.id).sort((a,b)=>Number(a.data.setOrder)-Number(b.data.setOrder));
    out+=`### ${text(s.splitType)} · ${finite(s.finishedAt)?'完了':'途中・未完了'}\n\n`;
    out+=`記録ID：${text(session.id)} / 第${number(s.mesocycleWeek)}週 / デロード：${s.isDeload?'あり':'なし'} / 睡眠：${number(s.sleepHours)}時間 / 回復度：${number(s.prsScore)}\n\n`;
    if(finite(s.startedAt)) out+=`開始：${new Date(s.startedAt+9*3600000).toISOString().replace('T',' ').replace('Z',' JST')}\n\n`;
    if(finite(s.finishedAt)) out+=`終了：${new Date(s.finishedAt+9*3600000).toISOString().replace('T',' ').replace('Z',' JST')}\n\n`;
    out+=table(['種目','順','区分','実績 kg × 回','RIR','目標 kg × 回 / RIR','負荷量 kg','推定1RM kg','記録ID'],sets.map(r=>{const s=r.data;return[ex(s.exerciseId),number(s.setOrder),s.isWarmup?'準備':'本セット',`${number(s.actualWeight)} × ${number(s.actualReps)}`,number(s.actualRir),`${number(s.targetWeight)} × ${number(s.targetReps)} / ${number(s.targetRir)}`,number(s.volumeLoad),number(s.est1rm),text(r.id)];}));
    if(s.note) {
      let note: unknown=s.note;
      try {const parsed=JSON.parse(String(note));if(parsed?.version===2&&object(parsed.plan))note=undefined;} catch { /* Ordinary note. */ }
      if(note)out+=`\nメモ：${text(note)}\n`;
    }
    const plan=of('plan').find(p=>p.id===session.id)?.data;
    let embedded: Row | undefined;
    if(!plan&&typeof s.note==='string')try{const p=JSON.parse(s.note);if(p.version===2&&object(p.plan))embedded=p.plan;}catch{ /* Not a plan. */ }
    const p=plan??embedded;
    if(p) out+=planBody(p,ex);
    out+='\n';
  }
  if(!of('session').length)out+='筋トレのセッション記録なし。\n\n';
  const orphan=of('set').filter(s=>!of('session').some(r=>r.id===String(s.data.sessionId)));
  if(orphan.length)out+='### 別日のセッション、またはセッション情報のないセット\n\n'+table(['種目','kg','回数','RIR','セッションID','記録ID'],orphan.map(r=>[ex(r.data.exerciseId),number(r.data.actualWeight),number(r.data.actualReps),number(r.data.actualRir),text(r.data.sessionId),text(r.id)]))+'\n';
  for(const p of of('plan').filter(r=>!of('session').some(s=>s.id===r.id)))out+=`### 別日のセッション、またはセッション情報のない計画（${text(p.id)}）\n`+planBody(p.data,ex)+'\n';
  if(of('baseline').length)out+='### Week0 測定\n\n'+table(['種目','kg','回数','RIR','推定1RM kg'],of('baseline').map(r=>[ex(r.data.exerciseId),number(r.data.weightKg),number(r.data.reps),number(r.data.rir),number(r.data.est1rm)]))+'\n';
  if(of('cardio').length)out+='### 有酸素運動\n\n'+table(['種別','時間 分','推定 kcal','理由','記録ID'],of('cardio').map(r=>[text(r.data.modality),number(r.data.durationMin),number(r.data.estKcal),text(r.data.triggerReason),text(r.id)]))+'\n';
  out+='## 栄養\n\n';
  if(!day.activeMeals)out+='有効な確定済みの食事記録なし。摂取量は未記録です。\n\n';
  else {
    out+=`確定済み ${day.activeMeals}食。取り消した食事は合計に含めません。不明な成分がある合計は既知分のみです。\n\n`;
    const targets=of('meal').filter(r=>!mealData(r).voided).map(r=>mealData(r).targets.values as Row);
    out+=table(['栄養素','摂取量（既知分）','単位','保存時の一日の目安','不明な食材数'],NUTRIENTS.map(n=>{
      const a=day.nutrient.get(n.key)!;
      const values=[...new Set(targets.map(t=>finite(t[n.key])?number(t[n.key]):'—'))];
      return [n.name,a.known?number(a.sum):'—',n.unit,values.join(' / '),String(a.missing)];
    }))+'\n保存時の目安が食事間で異なる場合は併記します。目安や摂取量だけで健康状態を判定しません。\n\n';
  }
  for(const record of of('meal')) {
    const m=mealData(record);
    out+=`### ${MEALS[m.request.meal]}${m.voided?'（取り消し済み・合計対象外）':''}\n\n記録ID：${text(record.id)} / 改訂：${number(m.revision)}\n\n`;
    out+=`保存時のTDEE：${number(m.targets.estimatedTdee)}kcal / 参照体重：${number(m.targets.weightKg)}kg（測定日 ${text(m.targets.weightDate)}）/ 体重7日平均：${number(m.targets.weightAverage7)}kg\n\n`;
    out+=table(['食材','商品名','数量','状態・メモ','可食部 g','根拠','仮定'],m.request.items.map(f=>{
      const v=rows(m.response.items).find(i=>i.id===f.id)!;
      return[text(f.name),text(f.product),`${f.quantity}${f.unit==='piece'?'個':'g'}`,text([f.state,f.note].filter(Boolean).join(' / ')),number(v.edibleGrams),text(v.source),text(v.assumptions)];
    }))+'\n';
    out+='<details>\n<summary>食材ごとの全栄養素と保存時の目安</summary>\n\n';
    const foods=rows(m.response.items);
    out+=table(['栄養素','単位',...m.request.items.map(f=>text(f.name)), '一日の目安'],NUTRIENTS.map(n=>[n.name,n.unit,...foods.map(f=>number(object(f.nutrients)?f.nutrients[n.key]:null)),number((m.targets.values as Row)[n.key])]))+'\n</details>\n\n';
  }
  if(of('legacy').length)out+='### 旧方式の栄養ログ（食事合計とは別記録）\n\n'+table(['TDEE kcal','目標 kcal','P g','F g','C g','P係数','確認したP g','リフィード','ダイエット休止'],of('legacy').map(r=>{const n=r.data;return[number(n.estimatedTdee),number(n.targetKcal),number(n.targetP),number(n.targetF),number(n.targetC),number(n.proteinCoef),number(n.proteinCheckedG),n.isRefeed?'あり':'なし',n.isDietBreak?'あり':'なし'];}))+'\n';
  out+='## 体重・体のサイズ・回復\n\n';
  for(const r of of('body'))out+=`区分：${r.data.isInterpolated?'補間値':'測定記録'}\n\n`+table(['項目','値','単位'],BODY_CHART_FIELDS.map(f=>[f.label,number(r.data[f.key]),f.unit]))+'\n';
  if(!of('body').length)out+='測定記録なし。\n\n';
  if(of('event').length)out+='## アプリの判定・イベント\n\n'+table(['種別','理由','確認済み','記録ID'],of('event').map(r=>[text(r.data.eventType),text(r.data.triggerReason),r.data.acknowledged?'はい':'いいえ',text(r.id)]))+'\n';
  return out;
}
function summaryBody(label: string,days: Day[],dayPaths: Map<string,string>,from: string): string {
  const records=days.flatMap(d=>d.records);
  const sessions=records.filter(r=>r.kind==='session');
  const meals=days.filter(d=>d.activeMeals>0);
  let out=`# ${label} の振り返り\n\n記録のある日：${days.length}日 / 食事記録日：${meals.length}日 / 完了した筋トレ：${sessions.filter(s=>finite(s.data.finishedAt)).length}回 / 途中・未完了：${sessions.filter(s=>!finite(s.data.finishedAt)).length}回\n\n`;
  out+='## 栄養の平均\n\n未記録の日を0として扱いません。不明な成分は加算せず、既知分がある日だけで平均を計算します。\n\n';
  out+=table(['栄養素','一日の既知分平均','単位','平均の対象日数','不明な食材がある日数'],NUTRIENTS.map(n=>{
    const known=meals.map(d=>d.nutrient.get(n.key)!).filter(a=>a.known);
    return[n.name,known.length?number(known.reduce((s,a)=>s+a.sum,0)/known.length):'—',n.unit,String(known.length),String(meals.filter(d=>d.nutrient.get(n.key)!.missing>0).length)];
  }))+'\n## 体の変化\n\n補間値を除く最初・最後の測定を比較します。差は原因や健康状態の判定ではありません。\n\n';
  const body=records.filter(r=>r.kind==='body'&&!r.data.isInterpolated);
  out+=table(['項目','最初の測定','最後の測定','変化','単位'],BODY_CHART_FIELDS.map(f=>{
    const measured=body.filter(r=>finite(r.data[f.key]));const first=measured[0],last=measured.at(-1);
    return[f.label,first?`${text(first.data.date)}: ${number(first.data[f.key])}`:'—',last?`${text(last.data.date)}: ${number(last.data[f.key])}`:'—',first&&last&&measured.length>1?number(Number(last.data[f.key])-Number(first.data[f.key])):'—',f.unit];
  }))+'\n## 日別記録\n\n';
  for(const day of days) {
    // Paths contain only fixed date characters; no food names or user input become links.
    const target=dayPaths.get(day.date)!;
    const depth=from.split('/').length-1;
    out+=`- [${day.date}](${'../'.repeat(depth)}${target}) — 確定した食事 ${day.activeMeals}食 / 測定 ${day.records.some(r=>r.kind==='body')?'あり':'なし'}\n`;
  }
  return out;
}
export function renderArchive(value: unknown,cutoff: string): Map<string,string> {
  if(!validDate(cutoff))throw new Error('CUTOFF');
  const snapshot=validateSnapshot(value);
  const days=gather(snapshot,cutoff);
  const names=new Map(snapshot.records.filter(r=>r.kind==='exercise'&&!r.deleted&&r.data.private!==true).map(r=>[r.id,String(r.data.name??r.id)]));
  const result=new Map<string,string>();const dayPaths=new Map<string,string>();
  for(const day of days) {
    const path=`日次/${day.date.slice(0,4)}/${day.date.slice(5,7)}/${day.date}.md`;
    dayPaths.set(day.date,path);result.set(path,dayBody(day,names));
  }
  for(const month of [...new Set(days.map(d=>d.date.slice(0,7)))]) {
    const path=`月次/${month.slice(0,4)}/${month}.md`;
    result.set(path,summaryBody(month,days.filter(d=>d.date.startsWith(month)),dayPaths,path));
  }
  for(const year of [...new Set(days.map(d=>d.date.slice(0,4)))]) {
    const path=`年次/${year}.md`;
    result.set(path,summaryBody(year,days.filter(d=>d.date.startsWith(year)),dayPaths,path));
  }
  let index='# 運動・栄養・体の記録\n\n日別の原記録と、月・年ごとの振り返りです。原本で修正した内容は次回受信で反映します。\n\n## 年別\n\n';
  for(const path of result.keys())if(path.startsWith('年次/'))index+=`- [${path.slice(3,-3)}](${path})\n`;
  index+='\n## 月別\n\n';
  for(const path of result.keys())if(path.startsWith('月次/'))index+=`- [${path.slice(-10,-3)}](${path})\n`;
  index+='\n未記録と0は区別します。取り消し済み食事・補間値の扱いは各ページに明記しています。生成欄の外の「自分の追記」は自由に編集できます。\n';
  result.set('00_記録の索引.md',index);
  return result;
}

import { useId, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Activity, ArrowRight, ArrowUpRight, CalendarDays, Check, ChevronRight, Dumbbell, Flame, HeartPulse, Scale, Utensils, RefreshCw } from 'lucide-react';
import { db } from '../db/db';
import { dashboardSummary, type DashboardData } from '../engine/dashboard';
import { BODY_CHART_FIELDS, BODY_FIELDS, type BodyChartKey } from '../engine/bodyMeasurements';
import { NUTRIENTS, type NutritionProfile } from '../engine/nutrition';
import { todayInJapan } from '../engine/dates';
import { syncNutritionWork } from '../db/queries/nutritionWork';
import { DinnerSuggestions } from '../components/DinnerSuggestions';
import './dashboard.css';

export type DashboardDestination='workout'|'nutrition'|'body'|'calibration';
const num=(v:number|null|undefined,digits=1)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('ja-JP',{maximumFractionDigits:digits});
async function readDashboard():Promise<DashboardData> {
  return db.transaction('r',[db.bodyMetrics,db.meals,db.sessions,db.sets,db.muscles,db.muscleCredits,db.exercises,db.baselines,db.cardioLogs,db.events,db.plans,db.nutritionWorkJobs,db.settings,db.nutritionLogs],async()=>{
  const [metrics,meals,sessions,sets,muscles,credits,exercises,baselines,cardio,events,plans,jobs,profile,pending,legacy]=await Promise.all([
    db.bodyMetrics.toArray(),db.meals.toArray(),db.sessions.toArray(),db.sets.toArray(),db.muscles.toArray(),db.muscleCredits.toArray(),db.exercises.toArray(),db.baselines.toArray(),db.cardioLogs.toArray(),db.events.toArray(),db.plans.toArray(),db.nutritionWorkJobs.toArray(),db.settings.get('nutritionProfile'),db.settings.where('key').startsWith('sync:').count(),db.nutritionLogs.toArray(),
  ]);
  return {metrics,meals,sessions,sets,muscles,credits,exercises,baselines,cardio,events,plans,jobs,profile:(profile?.value as NutritionProfile)??null,pendingSync:pending,legacy};
  });
}
export default function Dashboard({onNavigate}:{onNavigate:(tab:DashboardDestination)=>void}) {
  const data=useLiveQuery(readDashboard,[]);
  return data?<DashboardView data={data} onNavigate={onNavigate}/>:<main className="dashboard"><p role="status">ダッシュボードを読み込んでいます…</p></main>;
}
function Panel({title,label,children,action,className=''}:{title:string;label?:string;children:ReactNode;action?:ReactNode;className?:string}) {
  return <section className={`dash-panel ${className}`}><header className="dash-panel-heading"><div>{label&&<p className="dash-overline">{label}</p>}<h2>{title}</h2></div>{action}</header>{children}</section>;
}
function Empty({children}:{children:ReactNode}) {return <div className="dash-empty"><Activity size={24}/><p>{children}</p></div>;}
function Spark({values,color}:{values:(number|null)[];color:string}) {
  const known=values.filter((v):v is number=>v!=null&&Number.isFinite(v));
  if(!known.length)return <span className="dash-spark-empty">記録すると推移を表示</span>;
  const low=Math.min(...known),high=Math.max(...known),span=high-low||1;
  let path='',pen=false;
  values.forEach((v,i)=>{if(v==null){pen=false;return;}path+=`${pen?'L':'M'}${(i/Math.max(1,values.length-1)*140).toFixed(1)},${(34-(v-low)/span*28).toFixed(1)} `;pen=true;});
  return <svg className="dash-spark" viewBox="0 0 142 40" aria-hidden="true"><path d={path} fill="none" stroke={color} strokeWidth="2"/></svg>;
}
function LineChart({points,label,unit,color='#36d8ed'}:{points:{date:string;value:number|null}[];label:string;unit:string;color?:string}) {
  const id=useId().replaceAll(':','');
  const known=points.filter((p):p is {date:string;value:number}=>p.value!=null&&Number.isFinite(p.value));
  if(!known.length)return <Empty>この期間の{label}はまだ記録がありません。</Empty>;
  const min=Math.min(...known.map(p=>p.value)),max=Math.max(...known.map(p=>p.value)),pad=Math.max((max-min)*.18,.5),low=Math.max(0,min-pad),high=max+pad;
  const start=Date.parse(points[0].date+'T00:00:00Z'),end=Date.parse(points.at(-1)!.date+'T00:00:00Z');
  const x=(i:number)=>end===start?318:48+(Date.parse(points[i].date+'T00:00:00Z')-start)/(end-start)*540,y=(v:number)=>186-(v-low)/(high-low)*145;
  let path='',pen=false;
  const areas:{path:string;start:number;end:number}[]=[];
  points.forEach((p,i)=>{if(p.value==null){pen=false;return;}const point=`${x(i)},${y(p.value)} `;path+=`${pen?'L':'M'}${point}`;if(!pen)areas.push({path:`M${point}`,start:x(i),end:x(i)});else {areas.at(-1)!.path+=`L${point}`;areas.at(-1)!.end=x(i);}pen=true;});
  return <div className="dash-chart"><svg viewBox="0 0 620 222" role="img" aria-label={`${label}の推移。${known.length}日分、最新${num(known.at(-1)!.value)}${unit}`}>
    <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity=".2"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
    {[0,.5,1].map(t=><g key={t}><line x1="48" x2="588" y1={y(low+(high-low)*t)} y2={y(low+(high-low)*t)} className="dash-grid-line"/><text x="38" y={y(low+(high-low)*t)+4} textAnchor="end">{num(low+(high-low)*t)}</text></g>)}
    {areas.map((a,i)=><path key={i} d={`${a.path} L${a.end},186 L${a.start},186 Z`} fill={`url(#${id})`}/>)}
    <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round"/>
    {points.map((p,i)=>p.value==null?null:<circle key={p.date} cx={x(i)} cy={y(p.value)} r="3" fill={color}><title>{p.date} · {num(p.value)} {unit}</title></circle>)}
    <text x="48" y="214">{points[0]?.date.slice(5).replace('-','/')}</text><text x="588" y="214" textAnchor="end">{points.at(-1)?.date.slice(5).replace('-','/')}</text>
  </svg><p className="dash-chart-note">{unit} · 縦軸は拡大表示。未入力は0にせず、記録のある日を表示。</p></div>;
}
export function DashboardView({data,onNavigate,initialDate=todayInJapan(),sample=false,dinner}:{data:DashboardData;onNavigate:(tab:DashboardDestination)=>void;initialDate?:string;sample?:boolean;dinner?:ReactNode}) {
  const [date,setDate]=useState(initialDate),[days,setDays]=useState(30),[bodyKey,setBodyKey]=useState<BodyChartKey>('weightKg'),[exerciseId,setExerciseId]=useState(37),[strengthKey,setStrengthKey]=useState<'actualWeight'|'actualReps'|'est1rm'>('actualWeight'),[nutrientGroup,setNutrientGroup]=useState('基本');
  const [message,setMessage]=useState(''),[refreshing,setRefreshing]=useState(false);
  const s=useMemo(()=>dashboardSummary(data,date,days),[data,date,days]);
  const weight=s.latest('weightKg'),fat=s.latest('bodyFatPct'),waist=s.latest('waistCm');
  const bodyField=BODY_CHART_FIELDS.find(f=>f.key===bodyKey)!;
  const bodyPoints=s.metrics.filter(m=>m.date>=s.from&&!m.isInterpolated).map(m=>({date:m.date,value:typeof m[bodyKey]==='number'&&Number.isFinite(m[bodyKey])?m[bodyKey] as number:null}));
  const amount=(key:string)=>{const a=s.totals[key];return !a.total?'—':a.missing===a.total?'不明':`${a.missing?'既知分 ':''}${num(a.known)}`;};
  const nav=(tab:DashboardDestination)=>()=>onNavigate(tab);
  const change=(v:number|null)=>v==null?'比較できる記録がまだありません':`${v>0?'+':''}${num(v)} · 選択期間の最初の実測との差`;
  const macroEnergy=s.macros.reduce((v,m)=>v+m.energy,0);
  let angle=0;
  const donut=s.macros.map(m=>{const start=angle;angle+=macroEnergy?m.energy/macroEnergy*100:0;return `${m.color} ${start}% ${angle}%`;}).join(',');
  const maxVolume=Math.max(1,...s.trend.map(t=>t.volume));
  const strengthPoints=s.trend.map(t=>{const rows=s.sets.filter(r=>r.date===t.date&&r.exerciseId===exerciseId);return {date:t.date,value:rows.length?Math.max(...rows.map(r=>r[strengthKey])):null};});
  const baseline=s.baselines.find(b=>b.exerciseId===exerciseId);
  return <main className="dashboard">
    <div className="dash-toolbar"><div className="dash-status"><span/>{sample?'架空データのプレビュー':'この端末の記録をリアルタイム表示'}</div><button className="dash-tool-button" disabled={refreshing||sample} onClick={()=>{
      setRefreshing(true);void syncNutritionWork(date).then(()=>setMessage('選択日とその前6日のクラウド食事を更新しました。')).catch(()=>setMessage('クラウド食事を更新できませんでした。ログイン・接続設定を確認してください。端末の記録は表示できます。')).finally(()=>setRefreshing(false));
    }}><RefreshCw size={14}/>{refreshing?'更新中…':'クラウド食事を更新'}</button></div>
    <header className="dash-heading"><div><p className="dash-overline">YOUR HEALTH, IN FOCUS</p><h1>からだのダッシュボード<span>今日の積み重ねを、ひと目で。</span></h1><p>筋肉を守りながら、理想のからだへ。</p></div><div className="dash-period"><label><CalendarDays size={15}/><input aria-label="ダッシュボードの基準日" type="date" max={todayInJapan()} value={date} onChange={e=>{if(e.target.value&&e.target.value<=todayInJapan())setDate(e.target.value);}}/></label><select aria-label="ダッシュボードの集計期間" value={days} onChange={e=>setDays(Number(e.target.value))}><option value="7">直近7日</option><option value="30">直近30日</option><option value="90">直近90日</option></select></div></header>
    {message&&<p role="status" className="dash-notice">{message}</p>}
    {sample&&<p className="dash-notice">表示確認用の架空データです。あなたの実際の記録・栄養の評価ではありません。</p>}
    <div className="dash-kpis">
      {[
        {label:'最新の体重',icon:Scale,value:num(weight?.weightKg),unit:'kg',note:weight?`${weight.date}の実測`:'体組成を記録すると表示',detail:change(s.change('weightKg')),values:s.trend.map(t=>t.weight),color:'#38d8eb',tab:'body' as const},
        {label:'タンパク質',icon:Utensils,value:amount('protein_g'),unit:'g',note:s.targets?`選択日の目標 ${num(s.targets.values.protein_g)} g`:'プロフィールで目標を設定',detail:`${date.slice(5)} · 確定した食事 ${s.dailyMeals.length}件`,values:s.trend.map(t=>t.protein?.missing===0?t.protein.known:null),color:'#36e0b6',tab:'nutrition' as const},
        {label:'摂取カロリー',icon:Flame,value:amount('energy_kcal'),unit:'kcal',note:s.targets?`選択日の目標 ${num(s.targets.values.energy_kcal,0)} kcal`:'未記録は摂取ゼロと区別',detail:s.pendingMeals?`計算・確認待ち ${s.pendingMeals}件は未集計`:'確定済みの食事のみ集計',values:s.trend.map(t=>t.energy?.missing===0?t.energy.known:null),color:'#aa8aff',tab:'nutrition' as const},
        {label:'トレーニング',icon:Dumbbell,value:num(s.trainingDays,0),unit:'日',note:`${days}日間で ${s.sets.length} 本番セット`,detail:`完了セッション ${s.completed.length}件`,values:s.trend.map(t=>t.sets),color:'#38c8ff',tab:'workout' as const},
      ].map(k=><button className="dash-kpi" key={k.label} style={{'--kpi-color':k.color} as React.CSSProperties} onClick={nav(k.tab)}><span className="dash-kpi-label"><i><k.icon size={18}/></i>{k.label}<ArrowUpRight size={14}/></span><strong>{k.value}<small>{k.unit}</small></strong><span className="dash-kpi-note">{k.note}</span><div className="dash-kpi-bottom"><span>{k.detail}</span><Spark values={k.values} color={k.color}/></div></button>)}
    </div>
    <div className="dash-grid">
      <Panel title="からだの変化" label="BODY TRENDS" className="dash-span-7" action={<select aria-label="体組成グラフの項目" value={bodyKey} onChange={e=>setBodyKey(e.target.value as BodyChartKey)}>{BODY_CHART_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}</select>}>
        <div className="dash-body-stats">{[{label:'体重',value:weight?.weightKg,unit:'kg'},{label:'体脂肪率',value:fat?.bodyFatPct,unit:'%'},{label:'ウエスト',value:waist?.waistCm,unit:'cm'}].map(x=><div key={x.label}><span>{x.label}</span><strong>{num(x.value)}<small>{x.unit}</small></strong></div>)}</div>
        <LineChart points={bodyPoints} label={bodyField.label} unit={bodyField.unit}/>
      </Panel>
      <Panel title={date===todayInJapan()?'今日の栄養バランス':'選択日の栄養バランス'} label="DAILY NUTRITION" className="dash-span-5" action={<button onClick={nav('nutrition')} className="dash-text-button">記録する <ArrowRight size={14}/></button>}>
        <div className="dash-nutrition-date">{date} · 確定済み {s.dailyMeals.length}件</div>
        {s.targets?<div className="dash-progress-list">{NUTRIENTS.slice(0,6).map(n=>{const a=s.totals[n.key],ratio=a.total&&a.missing<a.total?a.known/s.targets!.values[n.key]:null;return <div key={n.key}><div><span>{n.name}</span><strong>{amount(n.key)} <small>{n.unit}</small><em>/ {num(s.targets!.values[n.key])}</em></strong></div><div className={`dash-progress-track ${a.missing?'is-unknown':''}`}><span style={{width:`${Math.min(100,(ratio??0)*100)}%`,background:n.kind==='上限方向'&&ratio!=null&&ratio>1?'#ff9c91':n.key==='fat_g'?'#a587ff':'#37d9ce'}}/></div></div>;})}</div>:<Empty>栄養プロフィールを設定すると、目標との比較が表示されます。</Empty>}
        <p className="dash-footnote">斜線は不明値あり。未記録は0摂取ではありません。{s.targetError}</p>
      </Panel>
      <Panel title="食事のエネルギー構成" label="MACRO BREAKDOWN" className="dash-span-5">
        <div className="dash-macro-layout"><div className="dash-donut" style={{background:macroEnergy?`conic-gradient(${donut})`:'#172b43'}} role="img" aria-label="記録済みのPFCから換算したエネルギー構成"><div><strong>{macroEnergy?num(macroEnergy,0):'—'}</strong><small>PFC換算 kcal</small></div></div><ul className="dash-macro-legend">{s.macros.map(m=><li key={m.key}><i style={{background:m.color}}/><span>{m.label}<small>{!m.total?'記録なし':m.missing===m.total?'不明':`${m.missing?'既知分 ':''}${num(m.grams)}g`}</small></span><strong>{macroEnergy?`${Math.round(m.energy/macroEnergy*100)}%`:'—'}</strong></li>)}</ul></div><p className="dash-footnote">P/Cは4、Fは9 kcal/gで換算。不明値・食物繊維等により、記録済みカロリーとは一致しない場合があります。</p>
      </Panel>
      <Panel title="トレーニングの推移" label="TRAINING VOLUME" className="dash-span-7" action={<button onClick={nav('workout')} className="dash-text-button">メニューへ <ChevronRight size={14}/></button>}>
        <div className="dash-volume-summary"><strong>{num(s.volume,0)}<small>kg × 回</small></strong><span>{s.sets.length} 本番セット · {s.trainingDays}日</span></div>
        {s.sets.length?<div className="dash-bar-chart" role="img" aria-label={`${days}日間のトレーニング量、${num(s.volume,0)}kg回`}><div className="dash-bars">{s.trend.map(t=><div key={t.date}><span style={{height:`${t.volume/maxVolume*100}%`,minHeight:t.sets?4:0}}><title>{t.date} · {num(t.volume,0)}kg回 · {t.sets}セット</title></span></div>)}</div><div className="dash-axis"><span>{s.from.slice(5)}</span><span>{date.slice(5)}</span></div></div>:<Empty>筋トレを記録すると、日ごとのトレーニング量を表示します。</Empty>}
        <p className="dash-footnote">準備セット・Week 0は除外。自重種目はセット数に含め、重量の合計は0です。</p>
      </Panel>
      <Panel title="部位別の週間負荷" label="MUSCLE BALANCE · LAST 7 DAYS" className="dash-span-7">
        <div className="dash-muscle-grid">{s.muscleLoad.map(m=><div key={m.code}><div><span>{m.nameJa}</span><strong>{num(m.sets)}<small> / 上限目安 {m.weeklySetsMax}</small></strong></div><div className="dash-progress-track"><span style={{width:`${Math.min(100,m.sets/m.weeklySetsMax*100)}%`,background:m.sets>m.weeklySetsMax?'#ff9c91':m.tag==='priority'?'#42ddc8':'#7398ff'}}/></div></div>)}</div><p className="dash-footnote">基準日までの7日間。主働筋・補助筋のクレジットを加算したセット相当数です。</p>
      </Panel>
      <Panel title="すべての測定値" label="BODY MEASUREMENTS" className="dash-span-5" action={<button onClick={nav('body')} className="dash-text-button">測定する <ArrowRight size={14}/></button>}>
        <dl className="dash-measurements">{BODY_FIELDS.map(f=>{const row=s.latest(f.key);return <div key={f.key}><dt>{f.label}<small>{row?.date??'未記録'}</small></dt><dd>{num(row?.[f.key] as number|null)}<small>{f.unit}</small></dd></div>;})}</dl>
      </Panel>
      <Panel title="ビタミン・ミネラルまで確認" label="34 NUTRIENTS" className="dash-span-12" action={<div className="dash-segments">{['基本','ビタミン','ミネラル'].map(g=><button key={g} aria-pressed={g===nutrientGroup} onClick={()=>setNutrientGroup(g)}>{g}</button>)}</div>}>
        <div className="dash-nutrient-grid">{NUTRIENTS.filter(n=>n.group===nutrientGroup).map(n=>{const a=s.totals[n.key];return <div key={n.key}><span>{n.name}</span><strong>{amount(n.key)}<small>{n.unit}</small></strong><p>{a.missing?`${a.missing}品不明 · `:''}{s.targets?`${n.kind} ${num(s.targets.values[n.key])}${n.unit}`:'目標未設定'}</p></div>;})}</div>
      </Panel>
      <Panel title="種目ごとの成長" label="STRENGTH PROGRESS" className="dash-span-7" action={<select aria-label="実績を表示する種目" value={exerciseId} onChange={e=>setExerciseId(Number(e.target.value))}>{data.exercises.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select>}>
        <div className="dash-segments dash-strength-controls">{([['actualWeight','重量'],['actualReps','回数'],['est1rm','推定1RM']] as const).map(([key,label])=><button key={key} aria-pressed={strengthKey===key} onClick={()=>setStrengthKey(key)}>{label}</button>)}</div>
        <LineChart points={strengthPoints.filter(p=>p.value!==null)} label={data.exercises.find(e=>e.id===exerciseId)?.name??'種目の実績'} unit={strengthKey==='actualReps'?'回':'kg'} color="#9c8aff"/>
        <p className="dash-footnote">1日ごとの本番セットの最大値。{baseline?`Week 0：${num(baseline.weightKg)}kg × ${baseline.reps}回（${new Date(baseline.calibratedAt).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'})}）`:'この種目のWeek 0は未記録です。'} 推定1RMは計算値です。</p>
      </Panel>
      <Panel title="記録した日のカレンダー" label="CONSISTENCY" className="dash-span-5">
        <p className="dash-calendar-caption">日付を押すと、その日を基準に表示します。</p><div className="dash-calendar">{s.trend.map(t=>{const kinds=[t.sets>0,t.energy!==null,t.weight!==null].filter(Boolean).length;return <button key={t.date} data-level={kinds} aria-label={`${t.date}、筋トレ${t.sets?'あり':'なし'}、食事${t.energy?'あり':'なし'}、体重${t.weight!==null?'あり':'なし'}`} onClick={()=>setDate(t.date)}><span>{Number(t.date.slice(-2))}</span></button>;})}</div><div className="dash-calendar-legend"><span>記録なし</span>{[0,1,2,3].map(i=><i key={i} data-level={i}/>)}<span>筋トレ・食事・体重</span></div>
      </Panel>
      <Panel title="最近のアクティビティ" label="RECENT ACTIVITY" className="dash-span-7">
        {s.recent.length?<div className="dash-activity">{s.recent.map(r=><button key={r.id} onClick={nav(r.tab)}><i>{r.kind==='食事'?<Utensils size={17}/>:r.kind==='体組成'?<HeartPulse size={17}/>:<Dumbbell size={17}/>}</i><span><strong>{r.title}</strong><small>{r.date} · {r.kind} · {r.detail}</small></span><ChevronRight size={16}/></button>)}</div>:<Empty>記録が増えると、ここに最近のアクティビティが並びます。</Empty>}
      </Panel>
      <Panel title="記録のサマリー" label="YOUR PROGRESS" className="dash-span-5">
        <div className="dash-record-summary">{[['食事を記録した日',`${s.recordedMealDays} / ${days}日`],['体組成を測定した日',`${s.metrics.filter(m=>m.date>=s.from&&!m.isInterpolated).length}日`],['Week 0 の測定',`${s.baselines.length}種目`],['保存済み日別メニュー',`${s.plans.length}件`],['有酸素運動',`${num(s.cardioMinutes,0)}分`],['コンディション等のイベント',`${s.events.length}件`],['旧版の栄養ログ（新集計には含めない）',`${s.legacy.length}件`],['筋トレの送信待ち',`${data.pendingSync}件`]].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        <button className="dash-primary" onClick={nav('workout')}><Dumbbell size={16}/>今日のメニューへ<ArrowRight size={16}/></button>
      </Panel>
      <div className="dash-span-12 dash-dinner">{dinner===undefined?<DinnerSuggestions key={date} date={date}/>:dinner}</div>
    </div>
    <footer className="dash-footer"><Check size={13}/>未記録・不明値はそのまま表示しています。グラフは選択日の記録までを集計。</footer>
  </main>;
}

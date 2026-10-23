import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, LayoutDashboard, Dumbbell, Utensils, HeartPulse, ClipboardList } from 'lucide-react';
import { DashboardView } from '../src/pages/Dashboard';
import { dashboardFixture } from './dashboard-fixture';
import '../src/styles.css';
const fixture=dashboardFixture();
export function Preview(){
  const [empty,setEmpty]=useState(false),[message,setMessage]=useState('');
  return <div className="app has-dashboard-shell"><aside className="app-sidebar"><div className="app-brand"><Activity size={27}/><span>Hypertrophy<small>YOUR DAILY NAVIGATOR</small></span></div><nav>{[{name:'ダッシュボード',icon:LayoutDashboard},{name:'今日のメニュー',icon:Dumbbell},{name:'食事と栄養',icon:Utensils},{name:'体組成とサイズ',icon:HeartPulse},{name:'Week 0・初回測定',icon:ClipboardList}].map((x,i)=><button className={i===0?'on':''} key={x.name} onClick={()=>setMessage('この画面は表示確認用です。実際のアプリでは各ページへ移動します。')}><x.icon size={17}/>{x.name}</button>)}</nav><div className="app-sidebar-footer"><strong>架空データのプレビュー</strong>実際の個人記録は使用していません。</div></aside><div style={{padding:'12px 30px',color:'#8ca4c4',fontSize:12}}><button className="btn" onClick={()=>setEmpty(v=>!v)}>データあり／未記録を切り替え</button><span role="status">{message}</span></div><DashboardView initialDate="2026-10-23" sample data={empty?{...fixture,metrics:[],meals:[],sessions:[],sets:[],cardio:[],baselines:[],profile:null}:fixture} onNavigate={()=>setMessage('表示確認用です。実際のアプリでは対応する記録ページを開きます。')} dinner={<section className="dash-panel"><p className="dash-overline">DINNER · 22:00</p><h2>今夜の調整ごはん</h2><p className="sub">夕食提案は栄養ページと共通です。ここには架空の献立を自動作成しません。</p></section>}/></div>;
}
if(import.meta.env.MODE==='test')createRoot(document.getElementById('root')!).render(<Preview/>);

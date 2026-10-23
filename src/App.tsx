import { lazy, Suspense, useEffect, useState } from 'react';
import { initializeApp } from './db/seed';
import Workout from './pages/Workout';
import { HeaderLevelBadge } from './components/HeaderLevelBadge';
import { CloudAccount } from './components/CloudAccount';
import { Activity, LayoutDashboard, Dumbbell, Utensils, HeartPulse, ClipboardList } from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard'));

const Calibration = lazy(() => import('./pages/Calibration'));
const Nutrition = lazy(() => import('./pages/Nutrition'));
const NutritionOAuthConsent = lazy(() => import('./components/NutritionOAuthConsent').then(m=>({default:m.NutritionOAuthConsent})));
const BodyTracking = lazy(() => import('./pages/BodyTracking'));
const DebugSeed = import.meta.env.DEV ? lazy(() => import('./pages/DebugSeed')) : null;

type Tab = 'dashboard' | 'workout' | 'nutrition' | 'body' | 'calibration' | 'debug';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('dashboard');

  useEffect(() => {
    initializeApp()
      .then(() => setReady(true))
      .catch(() => setError('端末の保存領域を開けませんでした。ページを再読込してください。記録を保持するため、ブラウザーのデータは削除しないでください。'));
  }, []);

  if (error) return <div className="page"><h1>初期化エラー</h1><pre>{error}</pre></div>;
  if (!ready) return <div className="page"><p>初期化中…</p></div>;
  const authorizationId = new URLSearchParams(window.location.search).get('authorization_id');
  if (authorizationId) return <><CloudAccount/><Suspense fallback={<p>接続内容を準備しています…</p>}><NutritionOAuthConsent authorizationId={authorizationId}/></Suspense></>;

  return (
    <div className="app has-dashboard-shell">
      <aside className="app-sidebar"><div className="app-brand"><Activity size={27}/><span>Hypertrophy<small>YOUR DAILY NAVIGATOR</small></span></div><nav aria-label="メインナビゲーション">
        {([{id:'dashboard',label:'ダッシュボード',icon:LayoutDashboard},{id:'workout',label:'今日のメニュー',icon:Dumbbell},{id:'nutrition',label:'食事と栄養',icon:Utensils},{id:'body',label:'体組成とサイズ',icon:HeartPulse},{id:'calibration',label:'Week 0・初回測定',icon:ClipboardList}] as const).map(item=><button key={item.id} className={tab===item.id?'on':''} aria-current={tab===item.id?'page':undefined} onClick={()=>setTab(item.id)}><item.icon size={17}/>{item.label}</button>)}
      </nav><div className="app-sidebar-footer"><strong>小さな積み重ねを、力に。</strong>筋肉を守りながら、<br/>毎日の変化を見つめよう。</div></aside>
      {/* 画面右上常駐のソシャゲ風レベル＆称号バッジ */}
      <div className="app-header-bar">
        <HeaderLevelBadge />
      </div>
      <CloudAccount />

      <Suspense fallback={<div className="page"><p role="status">画面を準備しています…</p></div>}>
      {tab === 'dashboard' && <Dashboard onNavigate={setTab} />}
      {tab === 'workout' && <Workout onCalibration={() => setTab('calibration')} />}
      {tab === 'nutrition' && <Nutrition />}
      {tab === 'body' && <BodyTracking />}
      {tab === 'calibration' && <Calibration />}
      {tab === 'debug' && DebugSeed && <DebugSeed />}
      </Suspense>

      <nav className="tabbar">
        <button className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>ホーム</button>
        <button className={tab === 'workout' ? 'on' : ''} onClick={() => setTab('workout')}>
          今日のメニュー
        </button>
        <button className={tab === 'nutrition' ? 'on' : ''} onClick={() => setTab('nutrition')}>
          栄養
        </button>
        <button className={tab === 'body' ? 'on' : ''} onClick={() => setTab('body')}>
          体組成
        </button>
        <button className={tab === 'calibration' ? 'on' : ''} onClick={() => setTab('calibration')}>
          Week 0
        </button>
        {import.meta.env.DEV && <button className={tab === 'debug' ? 'on' : ''} onClick={() => setTab('debug')}>
          開発確認
        </button>}
      </nav>
    </div>
  );
}

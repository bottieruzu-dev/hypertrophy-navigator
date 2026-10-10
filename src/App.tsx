import { lazy, Suspense, useEffect, useState } from 'react';
import { initializeApp } from './db/seed';
import Workout from './pages/Workout';
import { HeaderLevelBadge } from './components/HeaderLevelBadge';

const Calibration = lazy(() => import('./pages/Calibration'));
const Nutrition = lazy(() => import('./pages/Nutrition'));
const BodyTracking = lazy(() => import('./pages/BodyTracking'));
const DebugSeed = import.meta.env.DEV ? lazy(() => import('./pages/DebugSeed')) : null;

type Tab = 'workout' | 'nutrition' | 'body' | 'calibration' | 'debug';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('workout');

  useEffect(() => {
    initializeApp()
      .then(() => setReady(true))
      .catch(() => setError('端末の保存領域を開けませんでした。ページを再読込してください。記録を保持するため、ブラウザーのデータは削除しないでください。'));
  }, []);

  if (error) return <div className="page"><h1>初期化エラー</h1><pre>{error}</pre></div>;
  if (!ready) return <div className="page"><p>初期化中…</p></div>;

  return (
    <div className="app">
      {/* 画面右上常駐のソシャゲ風レベル＆称号バッジ */}
      <div className="app-header-bar">
        <HeaderLevelBadge />
      </div>

      <Suspense fallback={<div className="page"><p role="status">画面を準備しています…</p></div>}>
      {tab === 'workout' && <Workout onCalibration={() => setTab('calibration')} />}
      {tab === 'nutrition' && <Nutrition />}
      {tab === 'body' && <BodyTracking />}
      {tab === 'calibration' && <Calibration />}
      {tab === 'debug' && DebugSeed && <DebugSeed />}
      </Suspense>

      <nav className="tabbar">
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

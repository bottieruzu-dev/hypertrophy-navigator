import { useEffect, useState } from 'react';
import { initializeApp } from './db/seed';
import DebugSeed from './pages/DebugSeed';
import Calibration from './pages/Calibration';
import Workout from './pages/Workout';
import Nutrition from './pages/Nutrition';
import BodyTracking from './pages/BodyTracking';

type Tab = 'workout' | 'nutrition' | 'body' | 'calibration' | 'debug';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('workout');

  useEffect(() => {
    initializeApp()
      .then(() => setReady(true))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="page"><h1>初期化エラー</h1><pre>{error}</pre></div>;
  if (!ready) return <div className="page"><p>初期化中…</p></div>;

  return (
    <div className="app">
      {tab === 'workout' && <Workout />}
      {tab === 'nutrition' && <Nutrition />}
      {tab === 'body' && <BodyTracking />}
      {tab === 'calibration' && <Calibration />}
      {tab === 'debug' && <DebugSeed />}

      <nav className="tabbar">
        <button className={tab === 'workout' ? 'on' : ''} onClick={() => setTab('workout')}>
          本番記録
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
        <button className={tab === 'debug' ? 'on' : ''} onClick={() => setTab('debug')}>
          Debug
        </button>
      </nav>
    </div>
  );
}
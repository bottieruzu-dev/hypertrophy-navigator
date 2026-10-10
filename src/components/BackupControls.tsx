import { useRef, useState } from 'react';
import { db } from '../db/db';
import { todayInJapan } from '../engine/dates';
import { parseTrainingBackup, type TrainingBackup } from '../engine/backup';
import { restoreTrainingBackup } from '../db/queries/backup';


export function BackupControls() {
  const [message,setMessage] = useState('');
  const [busy,setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const exportBackup = async () => {
    setBusy(true);
    try {
      const backup: TrainingBackup = await db.transaction('r',[db.baselines,db.sessions,db.sets,db.plans],async () => ({ app: 'HypertrophyNavigator',version: 2,exportedAt: new Date().toISOString(),baselines: await db.baselines.toArray(),sessions: await db.sessions.toArray(),sets: await db.sets.toArray(),plans: await db.plans.toArray() }));
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{ type: 'application/json' }));
      const a = document.createElement('a'); a.href=url; a.download=`hypertrophy-training-${todayInJapan()}.json`; a.click();
      window.setTimeout(() => URL.revokeObjectURL(url),10000);
      setMessage('Week0と筋トレ記録のバックアップを作成しました。保存したファイルを保管してください。');
    } catch { setMessage('バックアップを作成できませんでした。端末の記録は保持しています。'); }
    finally { setBusy(false); }
  };
  return <details className="card backup-panel"><summary>Week0・筋トレ記録のバックアップ</summary><p className="sub">機種変更やブラウザーのデータ消去に備え、ファイルを保存できます。復元では既存の新しいWeek0を保持し、履歴の衝突は上書きしません。体組成・栄養はこのファイルには含まれません。</p><div className="two-actions"><button className="btn" disabled={busy} onClick={exportBackup}>ファイルに保存</button><button className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>ファイルから復元</button></div><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={async e => {
    const file=e.target.files?.[0]; e.target.value=''; if(!file) return;
    setBusy(true); setMessage('');
    try { if(file.size>20*1024*1024) throw new Error('ファイルが大き過ぎます（上限20MB）。'); const backup=parseTrainingBackup(await file.text()); await restoreTrainingBackup(backup); setMessage('記録を端末へ復元しました。クラウド送信は「再送」で行えます。'); }
    catch(error) { setMessage(error instanceof Error ? error.message : '復元できませんでした。既存の記録は変更していません。'); }
    finally { setBusy(false); }
  }}/>{message && <p className="notice" role="status">{message}</p>}</details>;
}

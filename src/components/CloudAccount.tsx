import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { bindLocalRecords, requireCloudOwner } from '../db/queries/cloudAccess';
import { migrateLocalDataToSupabase } from '../db/queries/supabaseMigration';
import { fetchBaselines } from '../db/queries/workout';
import { ObsidianArchive } from './ObsidianArchive';

export function CloudAccount() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState('ログイン・所有者登録後に同期できます。');
  useEffect(() => {
    let live = true;
    let generation = 0;
    const refresh = async () => {
      const current = ++generation;
      let valid = false;
      try { await requireCloudOwner(); valid = true; } catch { /* Keep local data available. */ }
      if (live && current === generation) setConnected(valid);
    };
    void refresh();
    // Auth callbacks must return before another auth request starts.
    const listener = supabase?.auth.onAuthStateChange(() => { setTimeout(() => { if (live) void refresh(); }, 0); });
    return () => { live = false; listener?.data.subscription.unsubscribe(); };
  }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); }
    catch { setMessage('接続できませんでした。ログイン、所有者UID、移行SQLの適用を確認してください。端末内の記録は保持しています。'); }
    finally { setBusy(false); }
  }
  return <details className="card cloud-account"><summary>クラウド設定 · {connected ? '本人確認済み' : '端末内保存'}</summary>
    <p className="sub">SupabaseのAuthenticationで作成した、このアプリ専用のアカウントでログインしてください。管理画面へのログインとは別です。</p>
    {!supabase ? <p>公開用の接続設定がありません。端末内で記録できます。</p> : <>
      <form onSubmit={event => { event.preventDefault(); void run(async () => {
        const client = supabase;
        if (!client) throw new Error('Not configured');
        const credentials = { email, password };
        setPassword('');
        const result = await client.auth.signInWithPassword(credentials);
        if (result.error) throw new Error('Login failed');
        setMessage('ログインしました。初回は下の所有者登録を行ってください。');
      }); }}>
        <label>メールアドレス<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>パスワード<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
        <button className="btn" disabled={busy}>ログイン</button>
      </form>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />この端末の記録は私のもので、このアカウントに保存します。</label>
      <div className="two-actions">
        <button className="btn" disabled={busy || !confirmed} onClick={() => void run(async () => {
          await bindLocalRecords(); setConnected(true); setMessage('所有者を登録しました。記録の送信・Week0の読込ができます。');
        })}>この端末の所有者を登録</button>
        <button className="btn" disabled={busy || !connected} onClick={() => void run(async () => {
          const result = await migrateLocalDataToSupabase(); setMessage(result.message);
          if (!result.success) setConnected(false);
        })}>端末の履歴を送信</button>
        <button className="btn" disabled={busy || !connected} onClick={() => void run(async () => {
          await fetchBaselines(); setMessage('Week0を読み込みました。端末の新しい記録は保持しています。');
        })}>クラウドのWeek0を読込</button>
        <button className="btn" disabled={busy} onClick={() => void run(async () => {
          const client = supabase;
          if (!client) throw new Error('Not configured');
          const result = await client.auth.signOut({ scope: 'local' });
          if (result.error) throw new Error('Sign out failed');
          setConnected(false); setPassword(''); setMessage('ログアウトしました。端末内の記録は保持しています。');
        })}>ログアウト</button>
      </div>
    </>}
    <p role="status">{busy ? '処理中…' : message}</p>
    <ObsidianArchive key={connected ? 'connected' : 'disconnected'} connected={connected} />
    <p className="sub">栄養ページでWorkへ送信した食事はクラウドにも保存します。手動の栄養記録・食材一覧・プロフィール設定は端末内保存です。栄養ページからバックアップできます。</p>
  </details>;
}

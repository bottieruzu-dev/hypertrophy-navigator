import { useEffect, useState } from 'react';
import { pairObsidian, publishArchive, revokeObsidian, watchArchive } from '../db/queries/obsidianArchive';

export function ObsidianArchive({ connected }: { connected: boolean }) {
  const [message,setMessage] = useState('過去分を含む運動・確定した食事・体組成を、Obsidian用に一方向で送信します。');
  const [pairing,setPairing] = useState('');
  const [busy,setBusy] = useState(false);
  useEffect(() => connected ? watchArchive(setMessage) : undefined, [connected]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    try { await action(); }
    catch { setMessage('処理できませんでした。専用SQL・ログイン・端末の更新競合を確認してください。端末の記録は保持しています。'); }
    finally { setBusy(false); }
  }
  return <section aria-label="Obsidian自動記録">
    <h3>Obsidian自動記録</h3>
    <p>この端末で有効にすると、アプリを開いている間に記録を自動送信します。PCは毎日23:59とログオン時に受信し、既存のObsidian同期で共有します。</p>
    <div className="two-actions">
      <button className="btn" disabled={!connected || busy} onClick={() => void run(async () => { const count = await publishArchive(); setMessage(`過去分を含む${count}件を送信しました。以後はこの端末で自動送信します。PCの受信設定も必要です。`); })}>全履歴を送信・自動送信を有効化</button>
      <button className="btn" disabled={!connected || busy} onClick={() => void run(async () => { setPairing(await pairObsidian()); setMessage('接続情報をPCの設定画面に貼り付けてください。以前の接続情報は無効になりました。'); })}>PCの接続情報を発行</button>
      <button className="btn" disabled={!connected || busy} onClick={() => void run(async () => { await revokeObsidian(); setPairing(''); setMessage('PCの読み取り接続を解除しました。保存済みのノートは残ります。'); })}>PCの接続を解除</button>
    </div>
    {pairing && <><label>PC設定用の接続情報（秘密・この画面を閉じると再表示しません）<input type="password" readOnly value={pairing} autoComplete="off" /></label><button className="btn" onClick={() => void run(async () => { await navigator.clipboard.writeText(pairing); setMessage('PC設定用の接続情報をコピーしました。AIやチャットには送らないでください。'); })}>接続情報をコピー</button><button className="btn" onClick={() => setPairing('')}>接続情報を閉じる</button></>}
    <p role="status">{busy ? '処理中…' : message}</p>
    <p className="sub">PCへの保存・Gitの同期完了は、この送信状況とは別です。食材一覧・認証情報・プロフィール設定は書き出しません。生成欄以外には自由に追記できます。</p>
  </section>;
}

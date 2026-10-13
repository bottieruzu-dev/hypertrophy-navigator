import { useRef, useState } from 'react';
import { exportNutritionBackup, restoreNutritionBackup } from '../db/queries/nutritionBackup';
import { todayInJapan } from '../engine/dates';
export function NutritionBackup({ onMessage }: {
    onMessage: (text: string) => void;
}) {
    const [busy, setBusy] = useState(false), file = useRef<HTMLInputElement>(null), pending = useRef(false);
    const run = async (fn: () => Promise<void>) => { if (pending.current)
        return; pending.current = true; setBusy(true); try {
        await fn();
    }
    catch (e) {
        onMessage(e instanceof Error ? e.message : 'バックアップを保存できませんでした。');
    }
    finally {
        pending.current = false;
        setBusy(false);
    } };
    return <details className="card"><summary>栄養記録のバックアップ</summary><p className="sub">食材・依頼・食事記録・栄養プロフィール・旧栄養記録を保存します。体組成と筋トレ記録は含みません。復元は既存のプロフィールを保持し、競合した記録は上書きしません。</p><div className="two-actions"><button className="btn" disabled={busy} onClick={() => run(async () => { const b = await exportNutritionBackup(); const url = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `nutrition-${todayInJapan()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); onMessage('栄養バックアップを作成しました。ダウンロードされたファイルを保管してください。'); })}>ファイルに保存</button><button className="btn" disabled={busy} onClick={() => file.current?.click()}>ファイルから復元</button></div><input ref={file} hidden type="file" accept=".json,application/json" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f)
        return; void run(async () => { if (f.size > 20 * 1024 * 1024)
        throw new Error('ファイルは20MB以下にしてください。'); await restoreNutritionBackup(await f.text()); onMessage('栄養記録を端末に復元しました。'); }); }}/></details>;
}

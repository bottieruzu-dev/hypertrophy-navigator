import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { NutritionProfileForm } from '../components/NutritionProfileForm';
import { NutritionDashboard } from '../components/NutritionDashboard';
import { NutritionBackup } from '../components/NutritionBackup';
import { NutritionAverages } from '../components/NutritionAverages';
import { advicePrompt, calculationPrompt, DRI_SOURCE, MEALS, NUTRIENTS, nutritionTargets, parseNutritionResponse, validDate, validProfile, type FoodInput, type Ingredient, type MealKind, type NutritionProfile, type MealRequest, type NutritionDraft } from '../engine/nutrition';
import { saveIngredient, saveMealRequest, saveNutritionMeal, saveNutritionProfile, setMealVoided } from '../db/queries/nutritionMeals';
import { todayInJapan } from '../engine/dates';
import { NutritionWorkPanel } from '../components/NutritionWorkPanel';
import { enqueueNutritionWork, confirmNutritionWork, voidNutritionWork } from '../db/queries/nutritionWork';
async function readNutritionData() { return { profile: (await db.settings.get('nutritionProfile'))?.value as NutritionProfile | undefined, metrics: await db.bodyMetrics.toArray(), ingredients: await db.ingredients.toArray(), requests: await db.mealRequests.toArray(), records: await db.meals.toArray(), jobs: await db.nutritionWorkJobs.toArray(), legacy: await db.nutritionLogs.toArray(), drafts: (await db.settings.where('key').startsWith('nutritionDraft:').toArray()).map(s => s.value as NutritionDraft) }; }
export default function Nutrition() { const data = useLiveQuery(readNutritionData, []); return data ? <NutritionPage data={data}/> : <main className="page"><p role="status">栄養記録を読み込んでいます…</p></main>; }
function NutritionPage({ data }: {
    data: Awaited<ReturnType<typeof readNutritionData>>;
}) {
    const initialDraft = data.drafts.find(d => d.date === todayInJapan());
    const [date, setDate] = useState(todayInJapan), [meal, setMeal] = useState<MealKind>(initialDraft?.meal ?? 'dinner');
    const [items, setItems] = useState<FoodInput[]>(initialDraft?.items ?? []);
    const [picker, setPicker] = useState(false), [newFood, setNewFood] = useState(false);
    const [name, setName] = useState(''), [product, setProduct] = useState(''), [note, setNote] = useState(''), [state, setState] = useState('生・調理前');
    const [weightGrams, setWeightGrams] = useState(''), [pieceCount, setPieceCount] = useState(''), [register, setRegister] = useState(true);
    const quantity = weightGrams || pieceCount;
    const unit: FoodInput['unit'] = weightGrams ? 'g' : 'piece';
    const [selectedRequest, setSelectedRequest] = useState<string | null>(null), [replacement, setReplacement] = useState<MealRequest['replaces']>(initialDraft?.replaces);
    const [editingRevision, setEditingRevision] = useState<number | undefined>();
    const [json, setJson] = useState(''), [confirmed, setConfirmed] = useState(false), [copyText, setCopyText] = useState('');
    const [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [profileOpen, setProfileOpen] = useState(false);
    const lock = useRef(false);
    const [today, setToday] = useState(todayInJapan);
    useEffect(() => { const update = () => setToday(todayInJapan()); const timer = setInterval(update, 30000); document.addEventListener('visibilitychange', update); return () => { clearInterval(timer); document.removeEventListener('visibilitychange', update); }; }, []);
    useEffect(() => { const draft: NutritionDraft = { date, meal, items, ...(replacement ? { replaces: replacement } : {}) }; void db.settings.put({ key: 'nutritionDraft:' + date, value: draft }).catch(() => setMessage('入力途中の一覧を保存できませんでした。画面を離れる前に依頼を保存してください。')); }, [date, meal, items, replacement]);
    const changeDate = (next: string) => { if (!validDate(next) || next > today)
        return; const draft = data.drafts.find(d => d.date === next); setDate(next); setItems(draft?.items ?? []); setMeal(draft?.meal ?? 'dinner'); setReplacement(draft?.replaces); setSelectedRequest(null); setJson(''); setConfirmed(false); setCopyText(''); };
    const profile = data?.profile && validProfile(data.profile) ? data.profile : undefined;
    const dayRecords = data?.records.filter(r => r.request.date === date) ?? [];
    const targetResult = useMemo(() => { if (!data || !profile || !validDate(date))
        return { targets: null, error: '' }; try {
        return { targets: nutritionTargets(profile, data.metrics, date), error: '' };
    }
    catch (e) {
        return { targets: null, error: e instanceof Error ? e.message : '目標を計算できませんでした。' };
    } }, [data, profile, date]);
    const historical = dayRecords.filter(r => !r.voided).sort((a, b) => a.savedAt - b.savedAt)[0]?.targets;
    const targets = data.jobs.find(j => j.id === selectedRequest)?.targets ?? (date < todayInJapan() && historical ? historical : targetResult.targets);
    const request = data?.requests.find(r => r.id === selectedRequest && r.date === date);
    const preview = useMemo(() => { if (!request || !json.trim())
        return null; try {
        return { ...parseNutritionResponse(json, request), error: '' };
    }
    catch (e) {
        return { response: null, warnings: [], error: e instanceof Error ? e.message : 'JSONを確認してください。' };
    } }, [json, request]);
    const action = async (fn: () => Promise<void>, success = '') => { if (lock.current)
        return false; lock.current = true; setBusy(true); setMessage(''); try {
        await fn();
        if (success)
            setMessage(success);
        return true;
    }
    catch (e) {
        setMessage(e instanceof Error ? e.message : '保存できませんでした。端末の記録を保持しています。');
        return false;
    }
    finally {
        lock.current = false;
        setBusy(false);
    } };
    const copy = async (text: string) => { setCopyText(text); try {
        await navigator.clipboard.writeText(text);
        setMessage('プロンプトをコピーしました。ChatAIに貼り付けてください。');
    }
    catch {
        setMessage('自動コピーできませんでした。下のテキストを選択してコピーしてください。');
    } };
    const choose = (f: Ingredient) => { setName(f.name); setProduct(f.product); setNote(f.note); setState(f.state); setPicker(false); setNewFood(false); };
    const loadRequest = (id: string) => { const saved = data?.records.find(r => r.id === id); setSelectedRequest(id); setJson(data.jobs.find(j => j.id === id)?.response ? JSON.stringify(data.jobs.find(j => j.id === id)!.response, null, 2) : saved ? JSON.stringify(saved.response, null, 2) : ''); setEditingRevision(saved?.revision); setConfirmed(false); setReplacement(undefined); };
    if (!data)
        return <main className="page"><p role="status">栄養記録を読み込んでいます…</p></main>;
    return <main className="page nutrition-page">
    <header className="workout-heading"><div><p className="eyebrow">DAILY NUTRITION</p><h1>食事と栄養</h1><p className="sub">食材をまとめる → AIで計算 → 確認して保存</p></div><label>記録日<input aria-label="食事の記録日" disabled={busy} type="date" max={todayInJapan()} value={date} onChange={e => changeDate(e.target.value)}/></label></header>
    <p className="save-status">手動記録は端末保存 · Workへ送信した依頼は本人のクラウドに保存</p>{date !== today && <p className="notice">現在は{date}の記録を編集中です。<button className="btn" onClick={() => changeDate(today)}>今日に移動</button></p>}{message && <p className="notice" role="status">{message}</p>}
    {targets && <NutritionDashboard records={dayRecords} targets={targets} pendingCount={data.jobs.filter(j => j.request.date === date && ['pending','review'].includes(j.status)).length}/>}
    {!profile ? <section className="card"><h2>目標を設定する</h2><p>最初に年齢・身長・初期体重を入力してください。以後は体組成ページの最新体重と連動します。</p><NutritionProfileForm busy={busy} onSave={p => action(() => saveNutritionProfile(p), 'プロフィールを保存しました。')}/></section> : <section className="card"><h2>今日の目標</h2>{targets && <><p className="sub">参照体重 {targets.weightKg}kg · {targets.weightDate ?? '初期設定'}{targets.weightAverage7 !== null ? ` · 7日平均 ${targets.weightAverage7}kg` : ''}{date < todayInJapan() && historical ? ' · 保存時の目標' : ''}</p><p className="sub">タンパク質＝体重×2.0g。推定消費量 {targets.estimatedTdee}kcalから設定。目標は開始時の目安です。</p></>}{targetResult.error && <p className="notice">{targetResult.error}</p>}<button className="btn" aria-expanded={profileOpen} onClick={() => setProfileOpen(!profileOpen)}>プロフィール・目標を変更</button>{profileOpen && <NutritionProfileForm key={JSON.stringify(profile)} initial={profile} busy={busy} onSave={p => action(async () => { await saveNutritionProfile(p); setProfileOpen(false); }, 'プロフィールを更新しました。')}/>}</section>}
    <section className="card"><p className="eyebrow">01 · INGREDIENTS</p><h2>食べたものを入力</h2><div className="option-row">{Object.entries(MEALS).map(([key, label]) => <button key={key} aria-pressed={meal === key} className={meal === key ? 'selected' : ''} onClick={() => setMeal(key as MealKind)}>{label}</button>)}</div>{replacement && <p className="notice">履歴の置き換えを準備中です。新しいJSONを保存するまで元の記録を保持します。</p>}
      <label>食材<button className="ingredient-select" aria-expanded={picker} onClick={() => setPicker(!picker)}>{name || '登録済みから選ぶ／新規に入力'} <span>⌄</span></button></label>
      {picker && <div className="ingredient-picker"><div className="two-actions"><button className="btn" onClick={() => setNewFood(false)}>登録済みから選ぶ</button><button className="btn" onClick={() => { setNewFood(true); setPicker(false); setName(''); setProduct(''); setNote(''); setState('生・調理前'); }}>新規に入力</button></div>{!newFood && <div className="ingredient-options">{data.ingredients.length ? data.ingredients.map(f => <button key={f.id} onClick={() => choose(f)}><strong>{f.name}</strong><small>{[f.product, f.state, f.note].filter(Boolean).join(' · ')}</small></button>) : <p className="sub">まだ登録がありません。「新規に入力」から追加できます。</p>}</div>}<button className="btn" onClick={() => setPicker(false)}>選択を閉じる</button></div>}
      {(newFood || !!name) && <div className="nutrition-fields"><label>食材名<input maxLength={500} value={name} onChange={e => setName(e.target.value)}/></label><label>商品名（任意）<input maxLength={500} value={product} onChange={e => setProduct(e.target.value)}/></label><label>補足（任意）<input maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="卵のサイズ、脂身、調理油など"/></label><label>重量を量った状態<select value={state} onChange={e => setState(e.target.value)}>{['生・調理前', '調理後', '包装の表示量', '不明'].map(s => <option key={s}>{s}</option>)}</select></label></div>}
      <div className="nutrition-fields">
        <label>重量（g）<input type="number" inputMode="decimal" min="0.01" max="10000" step="any" disabled={busy} value={weightGrams} placeholder="例：100" onChange={e => { setWeightGrams(e.target.value); if (e.target.value !== '') setPieceCount(''); }}/></label>
        <label>個数（個）<input type="number" inputMode="decimal" min="0.01" max="10000" step="any" disabled={busy} value={pieceCount} placeholder="例：1" onChange={e => { setPieceCount(e.target.value); if (e.target.value !== '') setWeightGrams(''); }}/></label>
      </div>
      <p className="sub">重量か個数のどちらか一方を入力してください。重量が分からないみかん・卵などは「個数」に入力すれば、グラムは不要です。片方を入力すると、もう片方は空になります。</p>
      {Number.isFinite(Number(quantity)) && Number(quantity) > 0 && Number(quantity) <= 10000 && <p className="sub">追加する量：{quantity}{unit === 'g' ? 'g' : '個'}</p>}
      <label className="check-line"><input type="checkbox" checked={register} onChange={e => setRegister(e.target.checked)}/>食材名・商品名・補足を登録して次回も使う</label>
      <button className="btn" disabled={busy || !name.trim() || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0 || Number(quantity) > 10000 || items.length >= 100} onClick={() => action(async () => { const food: FoodInput = { id: crypto.randomUUID(), name: name.trim(), product: product.trim(), note: note.trim(), state, quantity: Number(quantity), unit }; if (register && !data.ingredients.some(f => f.name === food.name && f.product === food.product && f.note === food.note && f.state === food.state))
        await saveIngredient({ id: crypto.randomUUID(), name: food.name, product: food.product, note: food.note, state: food.state }); setItems(prev => [...prev, food]); setWeightGrams(''); setPieceCount(''); }, '食材一覧に追加しました。まだ栄養は加算していません。')}>一覧に追加</button>
      <ul className="nutrition-input-list">{items.map((i, index) => <li key={i.id}><div><strong>{i.name}</strong><small>{[i.product, i.state, i.note].filter(Boolean).join(' · ')}</small></div><label>数量<input aria-label={`${i.name}の数量`} type="number" min="0.01" step="any" value={i.quantity} onChange={e => setItems(prev => prev.map((v, n) => n === index ? { ...v, quantity: Number(e.target.value) } : v))}/></label><select aria-label={`${i.name}の単位`} value={i.unit} onChange={e => setItems(prev => prev.map((v, n) => n === index ? { ...v, unit: e.target.value as 'g' | 'piece' } : v))}><option value="g">g</option><option value="piece">個</option></select><button aria-label={`${i.name}を一覧から外す`} onClick={() => setItems(prev => prev.filter(v => v.id !== i.id))}>外す</button></li>)}</ul>
      <button className="btn primary big" disabled={busy || !items.length || !targets} onClick={() => action(async () => {
        if (replacement && !data.jobs.some(j => j.id === replacement.id)) throw new Error('端末だけの既存記録の修正は、従来のプロンプト方式を使ってください。');
        const r: MealRequest = { id: crypto.randomUUID(), date, meal, items, createdAt: Date.now(), ...(replacement ? { replaces: replacement } : {}) };
        const queueTargets = replacement ? data.jobs.find(j => j.id === replacement.id)!.targets : (targetResult.targets ?? targets!);
        const sent = await enqueueNutritionWork(r, queueTargets);
        setItems(current => JSON.stringify(current) === JSON.stringify(r.items) ? [] : current); setReplacement(undefined); setSelectedRequest(null); setJson(''); setConfirmed(false);
        setMessage(sent ? 'Workの計算待ちに送信しました。結果が届いたら確認して確定してください。' : '依頼を端末に保存しました。接続後に「送信待ちを再送」を押してください。');
      })}>Workの計算待ちに保存</button>
      <p className="sub">この操作で、食材名・商品名・補足・量をクラウドへ送り、許可したWork連携から参照できるようにします。</p>
      <button className="btn primary big" disabled={busy || !items.length} onClick={() => action(async () => { const r: MealRequest = { id: crypto.randomUUID(), date, meal, items, createdAt: Date.now(), ...(replacement ? { replaces: replacement } : {}) }; const prompt = calculationPrompt(r); await saveMealRequest(r); setSelectedRequest(r.id); setEditingRevision(undefined); setJson(''); setConfirmed(false); setReplacement(undefined); setItems([]); await copy(prompt); })}>栄養計算用プロンプトをコピー</button><p className="sub">コピーした依頼は端末に残ります。入力途中の一覧も端末に保存し、この日付を選ぶと再開できます。</p>
    </section>
    <NutritionWorkPanel date={date} onReview={loadRequest}/>
    <section className="card"><p className="eyebrow">02 · IMPORT</p><h2>AIのJSONを確認・保存</h2><label>計算依頼<select value={request?.id ?? ''} onChange={e => loadRequest(e.target.value)}><option value="">保存した依頼を選択</option>{data.requests.filter(r => r.date === date).sort((a, b) => b.createdAt - a.createdAt).map(r => <option key={r.id} value={r.id}>{MEALS[r.meal]} · {r.items.map(i => `${i.name} ${i.quantity}${i.unit === 'g' ? 'g' : '個'}`).join('、')} · {data.records.some(m => m.id === r.id) ? '保存済み' : '未保存'}</option>)}</select></label>
      {request ? <><p className="sub">{request.date} · {MEALS[request.meal]} · {request.items.length}品{editingRevision !== undefined ? ' · 保存済みの栄養値を修正中' : ''}</p><button className="btn" onClick={() => copy(calculationPrompt(request))}>この依頼のプロンプトを再コピー</button><label>JSONを貼り付け<textarea rows={8} readOnly={data.jobs.some(j => j.id === request.id)} value={json} onChange={e => { setJson(e.target.value); setConfirmed(false); }} placeholder="AIが返したJSON部分" spellCheck={false}/></label>{preview?.error && <p className="notice" role="alert">{preview.error}</p>}{preview?.response && <><h3>保存前の確認</h3>{preview.response.items.map(i => { const f = request.items.find(f => f.id === i.id)!; return <div className="nutrition-preview-item" key={i.id}><strong>{f.name} · {i.quantity}{i.unit === 'g' ? 'g' : '個'}</strong><p>可食部 {i.edibleGrams === null ? '不明' : `${i.edibleGrams}g`} · {i.nutrients.energy_kcal ?? '不明'}kcal · P {i.nutrients.protein_g ?? '不明'}g / F {i.nutrients.fat_g ?? '不明'}g / C {i.nutrients.carbs_g ?? '不明'}g</p><p className="sub">根拠：{i.source || '不明'}<br />仮定：{i.assumptions || 'なし'}</p><details><summary>ビタミン・ミネラルを含む全栄養値</summary><dl className="nutrition-values">{NUTRIENTS.map(n => <div key={n.key}><dt>{n.name}</dt><dd>{i.nutrients[n.key] === null ? '不明' : `${i.nutrients[n.key]} ${n.unit}`}</dd></div>)}</dl></details></div>; })}{preview.warnings.map((w, i) => <p key={i} className="notice">{w}</p>)}<label className="check-line"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}/>数量・根拠・仮定と不明値を確認しました</label></>}<button className="btn primary big" disabled={busy || !targets || !preview?.response || !confirmed || data.jobs.some(j => j.id === request.id && j.status !== 'review')} onClick={() => action(async () => { const work = data.jobs.find(j => j.id === request.id); if (work) { if (work.status !== 'review' || JSON.stringify(preview?.response) !== JSON.stringify(parseNutritionResponse(JSON.stringify(work.response), request).response)) throw new Error('最新のWork下書きを選んで確認してください。'); await confirmNutritionWork(work.id, work.responseRevision); } else await saveNutritionMeal(request.id, json, targets!, editingRevision); setJson(''); setConfirmed(false); setSelectedRequest(null); setEditingRevision(undefined); setCopyText(''); }, editingRevision === undefined ? '今回の食事分を端末に保存しました。' : '栄養値を置き換えました。二重加算していません。')}>{editingRevision === undefined ? 'この食事分を追加' : '栄養値を置き換えて保存'}</button></> : <p className="sub">食材一覧からプロンプトをコピーするか、未保存の依頼を選択してください。</p>}
    </section>
    {targets && <section className="card"><h2>食事を振り返る</h2><p className="sub">食塩は上限方向、飽和脂肪酸はエネルギー比7%以下をg換算。耐容上限量を摂取目標にはしていません。<a href={DRI_SOURCE} target="_blank" rel="noreferrer">食事摂取基準2025年版</a></p><p className="sub">改善プロンプトにはプロフィール・参照体重・直近の体重と腹囲・当日の食材が含まれます。内容を確認してAIへ貼り付けてください。</p><button className="btn primary big" disabled={!dayRecords.some(r => !r.voided)} onClick={() => copy(advicePrompt(date, targets, dayRecords, data.metrics))}>食事改善プロンプトをコピー</button></section>}
    {copyText && <section className="card"><h2>AIに渡すプロンプト</h2><p className="sub">内容を確認してChatAIに貼り付けてください。アプリから外部へ自動送信はしません。</p><textarea aria-label="AI用プロンプト" rows={9} value={copyText} readOnly/><button className="btn" onClick={() => copy(copyText)}>表示中のプロンプトをコピー</button></section>}
    <section className="card"><h2>食事の記録</h2><NutritionAverages records={data.records} date={date}/>{dayRecords.length ? dayRecords.sort((a, b) => a.savedAt - b.savedAt).map(r => <div key={r.id} className={`nutrition-record ${r.voided ? 'voided' : ''}`}><strong>{MEALS[r.request.meal]} · {r.voided ? '取り消し済み' : '保存済み'}</strong><p>{r.request.items.map(i => `${i.name} ${i.quantity}${i.unit === 'g' ? 'g' : '個'}`).join('、')}</p><p className="sub">保存時の目標：{r.targets.values.energy_kcal}kcal / P {r.targets.values.protein_g}g</p><div className="two-actions"><button className="btn" disabled={busy || r.voided || data.jobs.some(j => j.id === r.id)} onClick={() => loadRequest(r.id)}>栄養JSONを修正</button><button className="btn" disabled={busy || r.voided} onClick={() => { setItems(r.request.items.map(i => ({ ...i, id: crypto.randomUUID() }))); setMeal(r.request.meal); setReplacement({ id: r.id, revision: r.revision }); setSelectedRequest(null); setJson(''); setMessage('上の食材一覧で数量等を修正して、計算プロンプトをコピーしてください。新しいJSONの保存時に元の食事分と置き換えます。'); }}>食材・数量を修正</button><button className="btn" disabled={busy} onClick={() => action(() => data.jobs.some(j => j.id === r.id) ? voidNutritionWork(r.id, r.revision, !r.voided) : setMealVoided(r.id, !r.voided), r.voided ? '元の記録を復元しました。' : '取り消しました。履歴から復元できます。')}>{r.voided ? '取り消しを戻す' : 'この記録を取り消す'}</button></div></div>) : <p className="sub">この日の新しい食事記録はまだありません。</p>}{data.legacy.filter(n => n.date === date).map(n => <p className="notice" key={n.date}>旧版の記録：タンパク質 {n.proteinCheckedG}g（内訳不明）。保持していますが、新しい食材集計には加算していません。</p>)}</section>
    <NutritionBackup onMessage={setMessage}/>
  </main>;
}

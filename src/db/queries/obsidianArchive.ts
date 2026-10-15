import { liveQuery } from 'dexie';
import { db } from '../db';
import { requireCloudOwner } from './cloudAccess';
import { cloudProjectOrigin } from '../../lib/supabase';
import { archiveChanges, projectArchive, type ArchiveRecord } from '../../engine/obsidianArchive';

const KEY = 'obsidian:published:v1';
const ENABLED = 'obsidian:enabled:v1';
const sources = [
  ['exercise', db.exercises, 'id'], ['baseline', db.baselines, 'exerciseId'],
  ['session', db.sessions, 'id'], ['set', db.sets, 'id'], ['body', db.bodyMetrics, 'date'],
  ['legacy', db.nutritionLogs, 'date'], ['cardio', db.cardioLogs, 'id'],
  ['event', db.events, 'id'], ['plan', db.plans, 'sessionId'], ['meal', db.meals, 'id'],
] as const;
export async function readArchiveProjection(): Promise<ArchiveRecord[]> {
  return db.transaction('r', [...sources.map(([,table]) => table), db.nutritionWorkJobs], async () => {
    const workIds = new Set((await db.nutritionWorkJobs.toArray()).map(j => j.id));
    const rows: ArchiveRecord[] = [];
    for (const [kind, table, key] of sources) {
      for (const row of await table.toArray()) {
        const value = row as unknown as Record<string, unknown>;
        // Work meals are exported directly from the server's confirmed record.
        if (kind === 'meal' && workIds.has(String(value.id))) continue;
        rows.push(projectArchive(kind, value[key], value));
      }
    }
    return rows;
  });
}
interface Published { owner: string; hashes: Record<string, string> }
let pending: Promise<number> | undefined;
export function publishArchive(): Promise<number> {
  if (pending) return pending;
  pending = publish().finally(() => { pending = undefined; });
  return pending;
}
async function publish(): Promise<number> {
  const { client, userId } = await requireCloudOwner();
  const owner = cloudProjectOrigin + ':' + userId;
  const prior = (await db.settings.get(KEY))?.value as Published | undefined;
  if (prior && prior.owner !== owner) throw new Error('ARCHIVE_OWNER');
  const previous = prior?.hashes ?? {};
  const records = await readArchiveProjection();
  const {hashes:next,changes}=await archiveChanges(records,previous);
  if (changes.length) {
    const payload = JSON.stringify(changes);
    if (new TextEncoder().encode(payload).length > 10_000_000) throw new Error('ARCHIVE_SIZE');
    const result = await client.rpc('hypertrophy_archive_publish', { p_records: changes });
    if (result.error) throw new Error('ARCHIVE_PUBLISH');
    await db.settings.put({ key: KEY, value: { owner, hashes: next } satisfies Published });
  }
  await db.settings.put({ key: ENABLED, value: true });
  return records.length;
}
export function watchArchive(status: (message: string) => void): () => void {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout>;
  const send = async () => {
    if (disposed || !(await db.settings.get(ENABLED))?.value) return;
    try { const count = await publishArchive(); if (!disposed) status(`クラウドの記録保存用データを更新（${count}件）。PCへの保存は受信時です。`); }
    catch { if (!disposed) status('記録保存用の送信待ちです。ログイン・専用SQL・端末間の更新競合を確認してください。記録は保持しています。'); }
  };
  const subscription = liveQuery(readArchiveProjection).subscribe({ next: () => { clearTimeout(timer); timer = setTimeout(() => void send(), 2000); }, error: () => status('記録保存用データを読めませんでした。') });
  const retry = setInterval(() => void send(), 60_000);
  const online = () => void send();
  window.addEventListener('online', online);
  return () => { disposed = true; clearTimeout(timer); clearInterval(retry); subscription.unsubscribe(); window.removeEventListener('online',online); };
}
export async function pairObsidian(): Promise<string> {
  const { client } = await requireCloudOwner();
  const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join('');
  // Hash the token's UTF-8 bytes, matching PostgreSQL sha256(convert_to(...)).
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
  const result = await client.rpc('hypertrophy_archive_pair', { p_hash: hash });
  if (result.error) throw new Error('ARCHIVE_PAIR');
  return JSON.stringify({ version: 1, endpoint: cloudProjectOrigin + '/functions/v1/workout-obsidian-export', token });
}
export async function revokeObsidian(): Promise<void> {
  const { client } = await requireCloudOwner();
  const result = await client.rpc('hypertrophy_archive_pair', { p_hash: null });
  if (result.error) throw new Error('ARCHIVE_REVOKE');
}

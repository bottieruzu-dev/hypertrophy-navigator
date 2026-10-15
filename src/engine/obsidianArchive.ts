// Only these records may leave the app for the personal archive. Never export settings/auth.
export const ARCHIVE_FIELDS = {
  exercise: ['id','name','equipment','type','note'],
  baseline: ['exerciseId','weightKg','reps','rir','est1rm','calibratedAt'],
  session: ['id','date','startedAt','finishedAt','splitType','prsScore','sleepHours','mesocycleWeek','isDeload','estMinutes','note'],
  set: ['id','sessionId','exerciseId','date','setOrder','targetWeight','actualWeight','targetReps','actualReps','targetRir','actualRir','volumeLoad','est1rm','isWarmup','mode'],
  body: ['date','weightKg','bodyFatPct','ffmKg','weightMa7','ffmMa30','waistCm','navelCm','shoulderCm','chestCm','armCm','thighCm','vTaperRatio','vTaperMa7','sleepHours','prsScore','isInterpolated'],
  legacy: ['date','estimatedTdee','targetKcal','targetP','targetF','targetC','proteinCoef','isRefeed','isDietBreak','proteinCheckedG'],
  cardio: ['id','date','modality','durationMin','estKcal','triggerReason'],
  event: ['id','date','createdAt','eventType','triggerReason','acknowledged'],
  plan: ['sessionId','date','split','context','exercises','skippedExerciseIds','estimatedMinutes','reason','warnings','status'],
  meal: ['id','request','response','targets','revision','savedAt','voided'],
} as const;
export type ArchiveKind = keyof typeof ARCHIVE_FIELDS;
export interface ArchiveRecord { kind: ArchiveKind; id: string; data: Record<string, unknown>; deleted: boolean }
export function projectArchive(kind: ArchiveKind, id: unknown, input: object): ArchiveRecord {
  if (!['string','number'].includes(typeof id) || !String(id) || String(id).length > 100) throw new Error('ARCHIVE_ID');
  const source = input as Record<string, unknown>;
  const data = Object.fromEntries(ARCHIVE_FIELDS[kind].filter(k => source[k] !== undefined).map(k => [k, source[k]]));
  if (kind === 'meal' && data.targets) {
    const targets = data.targets as Record<string, unknown>;
    data.targets = Object.fromEntries(['date','values','estimatedTdee','weightKg','weightDate','weightAverage7'].filter(k => targets[k] !== undefined).map(k => [k, targets[k]]));
  }
  if (typeof source.originKey === 'string' && source.originKey.length <= 120) data.originKey = source.originKey;
  // No private flags currently exist in the app. Respect them if imported data has them.
  return { kind, id: String(id), data: source.private === true ? {} : data, deleted: source.private === true };
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export async function archiveHash(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2,'0')).join('');
}
export async function archiveChanges(records: ArchiveRecord[], previous: Record<string,string>) {
  const hashes: Record<string,string> = {};
  const changes: (ArchiveRecord & { hash: string; expected: string | null })[] = [];
  const all=[...records];
  const present=new Set(records.map(r=>r.kind+':'+r.id));
  for(const key of Object.keys(previous))if(!present.has(key)) {
    const colon=key.indexOf(':');
    const kind=key.slice(0,colon);
    if(!Object.hasOwn(ARCHIVE_FIELDS,kind)||colon<1)throw new Error('ARCHIVE_STATE');
    all.push({kind:kind as ArchiveKind,id:key.slice(colon+1),deleted:true,data:{}});
  }
  for(const record of all) {
    const key=record.kind+':'+record.id;
    if(Object.hasOwn(hashes,key))throw new Error('ARCHIVE_DUPLICATE');
    const hash=await archiveHash(record);
    hashes[key]=hash;
    if(hash!==previous[key])changes.push({...record,hash,expected:previous[key]??null});
  }
  return {hashes,changes};
}

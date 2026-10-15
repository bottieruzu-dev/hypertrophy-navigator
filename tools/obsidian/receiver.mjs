import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { archiveCutoff, renderArchive, validateSnapshot } from './render.mjs';
import { atomic, noLinks, withLock, writeArchive } from './files.mjs';
import { protect, validateConnection } from './credentials.mjs';

export function localStateDir() {
  if(!process.env.LOCALAPPDATA||process.platform!=='win32')throw new Error('WINDOWS_LOCALAPPDATA_REQUIRED');
  return path.join(process.env.LOCALAPPDATA,'HypertrophyNavigatorObsidian');
}
export async function fetchSnapshot(connection,fetcher=fetch) {
  validateConnection(connection);
  const response=await fetcher(connection.endpoint,{method:'POST',headers:{'X-Workout-Archive-Token':connection.token},redirect:'error',signal:AbortSignal.timeout(120000),cache:'no-store'});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||!response.body)throw new Error('FETCH_FAILED');
  if(Number(response.headers.get('content-length'))>20_000_000)throw new Error('SNAPSHOT_SIZE');
  const reader=response.body.getReader();const decoder=new TextDecoder('utf-8',{fatal:true});
  let size=0,body='';
  try {while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>20_000_000){await reader.cancel();throw new Error('SNAPSHOT_SIZE');}body+=decoder.decode(part.value,{stream:true});}body+=decoder.decode();}
  finally {reader.releaseLock();}
  return validateSnapshot(JSON.parse(body));
}
export async function receiveOnce({stateDir=localStateDir(),includeToday=false,fetcher=fetch,now=new Date()}={}) {
  return withLock(stateDir,async()=>{
    await noLinks(path.join(stateDir,'connection.json'));
    if((await fs.stat(path.join(stateDir,'connection.json'))).size>32768)throw new Error('CONFIG_SIZE');
    const saved=JSON.parse(await fs.readFile(path.join(stateDir,'connection.json'),'utf8'));
    if(saved.version!==1||typeof saved.protectedToken!=='string'||saved.protectedToken.length>16000)throw new Error('CONFIG_INVALID');
    const connection=validateConnection({version:1,endpoint:saved.endpoint,token:await protect(saved.protectedToken,true)});
    if(typeof saved.root!=='string'||!path.isAbsolute(saved.root))throw new Error('TARGET_INVALID');
    const cutoff=archiveCutoff(now,includeToday);
    const snapshot=await fetchSnapshot(connection,fetcher);
    const documents=renderArchive(snapshot,cutoff);
    const result=await writeArchive({root:saved.root,stateDir,documents,cutoff});
    const status={version:1,lastSuccess:new Date().toISOString(),cutoff,records:snapshot.count,...result};
    await atomic(path.join(stateDir,'status.json'),JSON.stringify(status));
    return status;
  });
}
export async function main(args=process.argv.slice(2)) {
  if(args.some(a=>!['--once','--include-today','--status'].includes(a)))throw new Error('ARGUMENTS');
  if(args.includes('--status')) {
    const dir=localStateDir();await noLinks(path.join(dir,'status.json'));
    const s=JSON.parse(await fs.readFile(path.join(dir,'status.json'),'utf8'));
    // Print only fixed status fields; never print arbitrary config/file contents.
    console.log(JSON.stringify({lastSuccess:s.lastSuccess,cutoff:s.cutoff,records:s.records,files:s.files,changed:s.changed}));return;
  }
  const s=await receiveOnce({includeToday:args.includes('--include-today')});
  console.log(`Obsidian: records=${s.records}, files=${s.files}, changed=${s.changed}, cutoff=${s.cutoff}`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error=>{
    const known=new Set(['FETCH_FAILED','SNAPSHOT_SIZE','SNAPSHOT_INCOMPLETE','SNAPSHOT_RECORD','SNAPSHOT_DUPLICATE','MEAL_INVALID','MEAL_TARGET','RECORD_DATE','PATH_LINK','GIT_BUSY','GIT_INDIRECT','GIT_CONFLICT','GENERATED_EDITED','UNMANAGED_NOTE','NOTE_CHANGED','ALREADY_RUNNING_OR_STALE_LOCK','STATE_INVALID','STATE_PATH','CONFIG_SIZE','CONFIG_INVALID','CONNECTION_INVALID','CREDENTIAL_OS','CREDENTIAL_SPAWN_DENIED','CREDENTIAL_TIMEOUT']);
    const code=known.has(error.message)?error.message:'RECEIVER_FAILED';
    console.error(`Obsidian: ${code} — 受信を完了できませんでした。手順書の確認・復旧へ進んでください。秘密情報や本文はログに出力していません。`);process.exitCode=1;
  });
}

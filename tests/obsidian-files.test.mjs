import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { noLinks, withLock, writeArchive } from '../tools/obsidian/files.mjs';
import { fetchSnapshot } from '../tools/obsidian/receiver.mjs';
import { protect, validateConnection } from '../tools/obsidian/credentials.mjs';
await fs.mkdir('node_modules/.tmp',{recursive:true});
const fixture=await fs.mkdtemp(path.resolve('node_modules/.tmp/obsidian-dummy-'));
let n=0;
async function sandbox(action) {
  const dir=path.join(fixture,String(++n));await fs.mkdir(dir);
  const root=path.join(dir,'vault'),stateDir=path.join(dir,'state');await fs.mkdir(root);
  await action({root,stateDir,cutoff:'2026-10-15'});
}
const day='日次/2026/10/2026-10-01.md';
test('scoped writes are idempotent, preserve handwriting, update moves and retire only managed generated content',async()=>sandbox(async options=>{
  const file=path.join(options.root,day);
  const docs=new Map([[day,'dummy first\n']]);
  assert.equal((await writeArchive({...options,documents:docs})).changed,1);
  const initial=await fs.readFile(file,'utf8');
  await fs.writeFile(file,initial+'heading\n==========\nhandwritten\n');
  assert.equal((await writeArchive({...options,documents:docs})).changed,0);
  assert.equal((await writeArchive({...options,documents:new Map([[day,'dummy edit\n']])})).changed,1);
  assert((await fs.readFile(file,'utf8')).endsWith('handwritten\n'));
  await writeArchive({...options,documents:new Map([['日次/2026/10/2026-10-02.md','dummy moved\n']])});
  const retired=await fs.readFile(file,'utf8');assert(!retired.includes('dummy edit'));assert(retired.includes('handwritten'));assert(retired.includes('有効な記録はありません'));
}));
test('preflights every note before writing, stops on generated hand edits and unmanaged files',async()=>sandbox(async options=>{
  const docs=new Map([[day,'first\n'],['年次/2026.md','year\n']]);await writeArchive({...options,documents:docs});
  const file=path.join(options.root,'年次/2026.md');await fs.writeFile(file,(await fs.readFile(file,'utf8')).replace('year\n','hand edited\n'));
  await assert.rejects(writeArchive({...options,documents:new Map([[day,'must not write\n'],['年次/2026.md','changed\n']])}),/GENERATED_EDITED/);
  assert((await fs.readFile(path.join(options.root,day),'utf8')).includes('first\n'));
  const unmanaged=path.join(options.root,'00_記録の索引.md');await fs.writeFile(unmanaged,'my unrelated note');
  await assert.rejects(writeArchive({...options,documents:new Map([['00_記録の索引.md','no\n']])}),/UNMANAGED_NOTE/);
}));
test('rejects path traversal, Git operations, links and state in vault',async()=>sandbox(async options=>{
  await assert.rejects(writeArchive({...options,documents:new Map([['../escape.md','no']])}),/OUTPUT_INVALID/);
  await assert.rejects(writeArchive({...options,stateDir:path.join(options.root,'state'),documents:new Map()}),/STATE_INSIDE_VAULT/);
  await fs.mkdir(path.join(options.root,'.git'));await fs.writeFile(path.join(options.root,'.git','index.lock'),'');
  await assert.rejects(writeArchive({...options,documents:new Map([[day,'no']])}),/GIT_BUSY/);
  await fs.unlink(path.join(options.root,'.git','index.lock'));
  const outside=path.join(path.dirname(options.root),'outside');await fs.mkdir(outside);
  await fs.symlink(outside,path.join(options.root,'linked'),process.platform==='win32'?'junction':'dir');
  await assert.rejects(noLinks(path.join(options.root,'linked','file.md')),/PATH_LINK/);
}));
test('rechecks concurrent changes and converges after a partial interrupted write',async()=>sandbox(async options=>{
  let calls=0;
  const docs=new Map([[day,'first\n'],['年次/2026.md','year\n']]);
  await assert.rejects(writeArchive({...options,documents:docs,beforeWrite:async()=>{if(++calls===2)throw new Error('DUMMY_CRASH');}}),/DUMMY_CRASH/);
  assert.equal((await writeArchive({...options,documents:docs})).changed,1);
  const file=path.join(options.root,day);
  await assert.rejects(writeArchive({...options,documents:new Map([[day,'edited\n']]),beforeWrite:async()=>{await fs.appendFile(file,'concurrent handwriting\n');}}),/NOTE_CHANGED/);
  assert((await fs.readFile(file,'utf8')).includes('concurrent handwriting'));
}));
test('two instances cannot write together; failures release only this receiver lock',async()=>sandbox(async({stateDir})=>{
  await withLock(stateDir,async()=>{await assert.rejects(withLock(stateDir,async()=>{}),/ALREADY_RUNNING/);});
  await assert.rejects(withLock(stateDir,async()=>{throw new Error('DUMMY_FAILURE');}),/DUMMY_FAILURE/);
  await withLock(stateDir,async()=>{});
}));
test('network/schema failures cannot masquerade as an empty snapshot and credentials only go in headers',async()=>{
  const connection={version:1,endpoint:'https://dummy.supabase.co/functions/v1/workout-obsidian-export',token:'a'.repeat(64)};
  for(const endpoint of ['http://dummy.supabase.co/functions/v1/workout-obsidian-export',connection.endpoint+'?token=x','https://example.test'])assert.throws(()=>validateConnection({...connection,endpoint}));
  const fetcher=async(url,init)=>{assert(!url.includes(connection.token));assert.equal(init.headers['X-Workout-Archive-Token'],connection.token);assert.equal(init.redirect,'error');return new Response(JSON.stringify({schemaVersion:1,complete:true,count:0,records:[]}),{headers:{'Content-Type':'application/json'}});};
  assert.equal((await fetchSnapshot(connection,fetcher)).count,0);
  await assert.rejects(fetchSnapshot(connection,async()=>new Response('failed',{status:403})),/FETCH_FAILED/);
  await assert.rejects(fetchSnapshot(connection,async()=>new Response('{"complete":false}',{headers:{'Content-Type':'application/json'}})),/SNAPSHOT_INCOMPLETE/);
  const incomplete=new ReadableStream({start(c){c.enqueue(new TextEncoder().encode('{"records":['));c.error(new Error('DUMMY_STREAM_FAILURE'));}});
  await assert.rejects(fetchSnapshot(connection,async()=>new Response(incomplete,{headers:{'Content-Type':'application/json'}})));
});
test('Windows current-user encryption roundtrips only a dummy credential without plaintext storage',{skip:process.platform!=='win32'||process.argv.includes('--skip-windows-crypto')},async context=>{
  const dummy='dummy-only-no-real-credential';
  let protectedValue;
  try {protectedValue=await protect(dummy);} catch(error){if(error.message==='CREDENTIAL_SPAWN_DENIED'){context.skip('Sandbox denied Windows encryption subprocess; no escalation or alternate interpreter attempted.');return;}throw error;}
  assert(!protectedValue.includes(dummy));
  assert.equal(await protect(protectedValue,true),dummy);
});
// Dummy fixture contents stay in node_modules/.tmp, outside Git; no real vault touched.

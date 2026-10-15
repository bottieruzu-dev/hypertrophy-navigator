import * as fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const hash = value => createHash('sha256').update(value,'utf8').digest('hex');
const START = '<!-- hypertrophy-archive:start sha256=';
const END = '<!-- hypertrophy-archive:end -->';
const allowed = /^(?:00_記録の索引\.md|日次\/\d{4}\/\d{2}\/\d{4}-\d{2}-\d{2}\.md|月次\/\d{4}\/\d{4}-\d{2}\.md|年次\/\d{4}\.md)$/;
export async function noLinks(absolute) {
  if (!path.isAbsolute(absolute)) throw new Error('PATH_ABSOLUTE');
  const parsed=path.parse(absolute);
  let current=parsed.root;
  for(const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    try { if((await fs.lstat(current)).isSymbolicLink()) throw new Error('PATH_LINK'); }
    catch(error) { if(error.code!=='ENOENT') throw error; }
  }
}
async function read(file) {
  try { const s=await fs.lstat(file);if(!s.isFile()||s.size>12_000_000)throw new Error('FILE_TYPE');return await fs.readFile(file,'utf8'); }
  catch(error) {if(error.code==='ENOENT')return null;throw error;}
}
function splitGenerated(content) {
  if(/^(?:<{7}(?: |$)|>{7}(?: |$)|={7}$)/m.test(content))throw new Error('GIT_CONFLICT');
  const start=content.indexOf(START),end=content.indexOf(END);
  if(start<0||end<start||content.indexOf(START,start+1)>=0||content.indexOf(END,end+1)>=0)throw new Error('UNMANAGED_NOTE');
  const header=content.slice(start).match(/^<!-- hypertrophy-archive:start sha256=([a-f0-9]{64}) -->\n/);
  if(!header)throw new Error('GENERATED_HEADER');
  const body=content.slice(start+header[0].length,end);
  if(hash(body)!==header[1])throw new Error('GENERATED_EDITED');
  return {prefix:content.slice(0,start),suffix:content.slice(end+END.length),body};
}
function replaced(content,body) {
  const parts=content===null?{prefix:'',suffix:'\n\n## 自分の追記\n\n'}:splitGenerated(content);
  return parts.prefix+START+hash(body)+' -->\n'+body+END+parts.suffix;
}
export async function checkGitIdle(root) {
  let dir=path.resolve(root);
  while(true) {
    const git=path.join(dir,'.git');
    try {
      const stat=await fs.lstat(git);
      // Worktree .git indirection is not followed automatically.
      if(!stat.isDirectory()||stat.isSymbolicLink())throw new Error('GIT_INDIRECT');
      for(const marker of ['index.lock','MERGE_HEAD','rebase-apply','rebase-merge','CHERRY_PICK_HEAD','REVERT_HEAD']) {
        try {await fs.lstat(path.join(git,marker));throw new Error('GIT_BUSY');} catch(e){if(e.code!=='ENOENT')throw e;}
      }
    } catch(e){if(e.code!=='ENOENT')throw e;}
    const parent=path.dirname(dir);if(parent===dir)break;dir=parent;
  }
}
export async function withLock(stateDir,action) {
  await noLinks(path.resolve(stateDir));
  await fs.mkdir(stateDir,{recursive:true});
  const lockPath=path.join(stateDir,'receiver.lock');
  let file;
  try {file=await fs.open(lockPath,'wx',0o600);} catch(e){if(e.code==='EEXIST')throw new Error('ALREADY_RUNNING_OR_STALE_LOCK');throw e;}
  try {await file.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));return await action();}
  finally {await file.close();await fs.unlink(lockPath);}
}
export async function atomic(file,content) {
  await noLinks(file);
  const temp=file+'.'+randomUUID()+'.tmp';
  try {await fs.writeFile(temp,content,{encoding:'utf8',flag:'wx',mode:0o600});await fs.rename(temp,file);}
  finally {await fs.unlink(temp).catch(()=>{});}
}
export async function writeArchive({root,stateDir,documents,cutoff, beforeWrite}) {
  root=path.resolve(root);stateDir=path.resolve(stateDir);
  if(root===path.parse(root).root || stateDir===root || stateDir.startsWith(root+path.sep))throw new Error('STATE_INSIDE_VAULT');
  await noLinks(root);await noLinks(stateDir);await checkGitIdle(root);
  const statePath=path.join(stateDir,'managed.json');
  const old=await read(statePath);
  const state=old?JSON.parse(old):{version:1,root,paths:[]};
  if(state.version!==1||state.root!==root||!Array.isArray(state.paths)||state.paths.length>100000)throw new Error('STATE_INVALID');
  const desired=new Map(documents);
  for(const relative of state.paths) {
    if(typeof relative!=='string'||!allowed.test(relative))throw new Error('STATE_PATH');
    // Keep a provisional today's note intact before the daily cutoff.
    if(relative.startsWith('日次/')&&relative.slice(-13,-3)>cutoff)continue;
    if(!desired.has(relative))desired.set(relative,'対象の有効な記録はありません。原本での削除・日付変更を反映しました。\n');
  }
  const edits=[];
  // Preflight every path/hash before creating any directories or touching any note.
  for(const [relative,body] of desired) {
    if(!allowed.test(relative)||typeof body!=='string'||body.includes(START)||body.includes(END))throw new Error('OUTPUT_INVALID');
    if(Buffer.byteLength(body,'utf8')>10_000_000)throw new Error('OUTPUT_SIZE');
    const file=path.resolve(root,...relative.split('/'));
    if(!file.startsWith(root+path.sep))throw new Error('OUTPUT_ESCAPE');
    await noLinks(file);
    const previous=await read(file);
    const next=replaced(previous,body);
    if(next!==previous)edits.push({file,previous,next});
  }
  await fs.mkdir(stateDir,{recursive:true});
  // Persist the union before writes: a crash cannot forget a newly written path.
  const managed=[...new Set([...state.paths,...desired.keys()])].sort();
  await atomic(statePath,JSON.stringify({version:1,root,paths:managed}));
  for(const edit of edits) {
    if(beforeWrite)await beforeWrite(edit.file); // Fault injection for dummy tests only.
    await noLinks(edit.file);await checkGitIdle(root);
    if(await read(edit.file)!==edit.previous)throw new Error('NOTE_CHANGED');
    await fs.mkdir(path.dirname(edit.file),{recursive:true});
    await noLinks(edit.file);
    await atomic(edit.file,edit.next);
  }
  return {files:documents.size,changed:edits.length};
}

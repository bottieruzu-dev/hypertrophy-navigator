// Recover only our own stale lock after verifying that its process no longer exists.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { localStateDir } from './receiver.mjs';
import { noLinks } from './files.mjs';
const file=path.join(localStateDir(),'receiver.lock');
try {
  await noLinks(file);
  const before=await fs.readFile(file,'utf8');const lock=JSON.parse(before);
  if(!Number.isSafeInteger(lock.pid)||lock.pid<=0)throw new Error('LOCK_INVALID');
  try {process.kill(lock.pid,0);throw new Error('PROCESS_EXISTS');} catch(e){if(e.code!=='ESRCH')throw e;}
  if(await fs.readFile(file,'utf8')!==before)throw new Error('LOCK_CHANGED');
  await fs.unlink(file);console.log('自分の受信処理の古いロックを解除しました。');
} catch {console.error('ロックを解除していません。実行中または確認できない状態です。');process.exitCode=1;}

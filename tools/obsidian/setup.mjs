// Interactive local setup. The user, not the coding agent, supplies the credential.
import http from 'node:http';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { localStateDir, fetchSnapshot } from './receiver.mjs';
import { atomic, noLinks, checkGitIdle, withLock } from './files.mjs';
import { protect, validateConnection } from './credentials.mjs';

const csrf=randomBytes(32).toString('hex');
const dir=localStateDir();
let origin='',saving=false;
const server=http.createServer(async(req,res)=>{
  const reply=(code,text,type='text/plain; charset=utf-8')=>{res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"});res.end(text);};
  if(req.headers.host!==new URL(origin).host)return reply(403,'拒否しました。');
  if(req.method==='GET'&&req.url==='/')return reply(200,`<!doctype html><html lang="ja"><meta charset="utf-8"><title>Obsidianの接続設定</title><style>body{font:16px system-ui;max-width:720px;margin:40px auto;padding:20px}label{display:block;margin:24px 0}input{display:block;width:100%;padding:10px;box-sizing:border-box}button{padding:12px}</style><h1>運動・栄養記録 → Obsidian</h1><p>アプリの「PCの接続情報を発行」でコピーした内容を貼り付けてください。接続情報はWindowsの本人アカウントで暗号化し、保管庫の外へ保存します。</p><form method="post" action="/save"><input type="hidden" name="csrf" value="${csrf}"><label>接続情報（秘密）<input type="password" name="connection" autocomplete="off" required maxlength="2000"></label><label>記録専用フォルダーの絶対パス<input name="root" required placeholder="保管庫内の専用フォルダー"></label><button>接続を確認して保存</button></form><p>認証情報をAIへ渡す必要はありません。このプログラムはGit操作や同期設定の変更を行いません。</p></html>`,'text/html; charset=utf-8');
  if(req.method!=='POST'||req.url!=='/save'||req.headers.origin!==origin||!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')||saving)return reply(403,'拒否しました。');
  let size=0,body='';
  try {
    for await(const part of req){size+=part.length;if(size>8192)throw new Error('SIZE');body+=part.toString('utf8');}
    const form=new URLSearchParams(body);
    if(form.get('csrf')!==csrf)throw new Error('CSRF');
    const connection=validateConnection(JSON.parse(form.get('connection')??''));
    const root=form.get('root')??'';
    if(!path.isAbsolute(root)||path.resolve(root)===path.parse(path.resolve(root)).root)throw new Error('PATH');
    await noLinks(root);await checkGitIdle(root);await noLinks(dir);
    // No vault write until the user runs the receiver; reject a silent destination change.
    try {const previous=JSON.parse(await fs.readFile(path.join(dir,'connection.json'),'utf8'));if(previous.root!==path.resolve(root))throw new Error('TARGET_CHANGE');}
    catch(e){if(e.code!=='ENOENT')throw e;}
    saving=true;
    await fetchSnapshot(connection); // Auth + complete-snapshot validation, no record logging.
    const protectedToken=await protect(connection.token);
    await withLock(dir,async()=>{
      const file=path.join(dir,'connection.json');await noLinks(file);
      await atomic(file,JSON.stringify({version:1,root:path.resolve(root),endpoint:connection.endpoint,protectedToken}));
    });
    reply(200,'接続設定を保存しました。このタブを閉じ、手順書の手動受信と自動実行の登録へ進んでください。');
    server.close();
  }catch{saving=false;reply(400,'設定できませんでした。接続情報・フォルダー・Windowsの暗号化・既存設定を確認してください。入力内容はログに保存していません。');}
});
server.listen(0,'127.0.0.1',()=>{
  origin=`http://127.0.0.1:${server.address().port}`;
  console.log(`PCのブラウザーで開いてください：${origin}/`);
});
server.on('error',()=>{console.error('ローカル設定画面を起動できませんでした。');process.exitCode=1;});
const timer=setTimeout(()=>{server.close();},15*60*1000);timer.unref();

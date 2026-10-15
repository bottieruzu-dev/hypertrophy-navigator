import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createDemo } from './core.mjs';

export const MAX_MESSAGE_BYTES = 32 * 1024;
export async function runDemo({ input = process.stdin, output = process.stdout, viewer = true, port = 8790 } = {}) {
  const demo = createDemo();
  const send = value => { if (value !== undefined) output.write(`${JSON.stringify(value)}\n`); };
  const buffer = Buffer.alloc(MAX_MESSAGE_BYTES);
  let length = 0;
  let discarding = false;
  const parseError = () => send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Invalid or oversized JSON message' } });
  const onData = chunk => {
    for (const byte of Buffer.from(chunk)) {
      if (byte === 10) {
        if (!discarding && length) {
          try { send(demo.handle(JSON.parse(buffer.toString('utf8', 0, length)))); } catch { parseError(); }
        }
        length = 0; discarding = false;
      } else if (!discarding) {
        if (length >= MAX_MESSAGE_BYTES) { parseError(); length = 0; discarding = true; }
        else buffer[length++] = byte;
      }
    }
  };
  // Optional PC-only display. No HTTP writes, CORS access, remote bind or real records.
  const http = viewer ? createServer((req, res) => {
    const hostname = (req.headers.host ?? '').split(':')[0];
    if (!['127.0.0.1', 'localhost'].includes(hostname)) { res.writeHead(403); res.end(); return; }
    if (req.method !== 'GET' || !['/', '/state'].includes(req.url)) { res.writeHead(404); res.end(); return; }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
    if (req.url === '/state') { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(demo.snapshot())); }
    else {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>栄養連携テスト</title><h1>栄養連携テスト（架空データ）</h1><p>Workから下書きを保存した後、このページを更新してください。</p><p>本番アプリ・Supabaseには接続していません。サーバー停止時に下書きは消えます。</p><pre>' + JSON.stringify(demo.snapshot(), null, 2) + '</pre></html>');
    }
  }) : undefined;
  if (http) await new Promise((resolve, reject) => { http.once('error', reject); http.listen(port, '127.0.0.1', resolve); });
  input.on('data', onData);
  const close = () => { input.off('data', onData); http?.close(); };
  input.once('end', close);
  return { demo, close, address: http?.address() };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDemo({ viewer: !process.argv.includes('--no-viewer') }).catch(() => {
    process.stderr.write('Demo startup failed. Port 8790 may already be in use; no records were changed.\n');
    process.exitCode = 1;
  });
}

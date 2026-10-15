import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createDemo, DEMO_ID } from '../tools/nutrition-mcp-demo/core.mjs';
import { runDemo } from '../tools/nutrition-mcp-demo/server.mjs';

const rpc = (method, params, id = 1) => ({ jsonrpc: '2.0', id, method, params });
function initialized() { const demo = createDemo(); demo.handle(rpc('initialize', { protocolVersion: '2025-06-18' })); return demo; }
const save = (demo, args) => demo.handle(rpc('tools/call', { name: 'save_demo_draft', arguments: args })).result;
test('demo handshake and tools expose only the three fixed demo operations', () => {
  const demo = createDemo();
  assert.equal(demo.handle(rpc('tools/list')).error.code, -32000);
  assert.equal(demo.handle(rpc('initialize', { protocolVersion: '2025-06-18' })).result.protocolVersion, '2025-06-18');
  assert.equal(demo.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), undefined);
  assert.deepEqual(demo.handle(rpc('tools/list')).result.tools.map(t => t.name), ['get_demo_meal', 'save_demo_draft', 'get_demo_draft']);
  assert.equal(demo.handle(rpc('arbitrary_sql')).error.code, -32601);
});
test('only matching dummy request and null nutrients are accepted; duplicate retries do not accumulate', () => {
  const demo = initialized();
  for (const args of [ { requestId: 'other', revision: 1, nutrients: null },
    { requestId: DEMO_ID, revision: 2, nutrients: null }, { requestId: DEMO_ID, revision: 1, nutrients: { kcal: 10 } },
    { requestId: DEMO_ID, revision: 1, nutrients: null, extra: 'not accepted' } ]) {
    assert.equal(save(demo, args).isError, true);
    assert.equal(demo.snapshot().draft, null);
  }
  const args = { requestId: DEMO_ID, revision: 1, nutrients: null };
  const first = save(demo, args);
  assert.deepEqual(save(demo, args), first);
  assert.equal(demo.snapshot().draft.status, 'awaiting_confirmation');
  assert.equal(createDemo().snapshot().draft, null);
});
test('caller cannot change stored meal through returned objects', () => {
  const demo = initialized();
  const meal = demo.handle(rpc('tools/call', { name: 'get_demo_meal' })).result.structuredContent;
  meal.foods[0].quantity = 999;
  assert.equal(demo.snapshot().meal.foods[0].quantity, 100);
});
test('stdio streams handle split Japanese UTF8 and recover after malformed or oversized messages', async () => {
  const input = new PassThrough(); const outputStream = new PassThrough();
  let output = '';
  outputStream.on('data', chunk => { output += chunk; });
  const server = await runDemo({ input, output: outputStream, viewer: false });
  const messages = [rpc('initialize', { protocolVersion: '2025-06-18' }, 1), rpc('tools/call', { name: 'get_demo_meal' }, 2),
    rpc('tools/call', { name: 'save_demo_draft', arguments: { requestId: DEMO_ID, revision: 1, nutrients: null } }, 3),
    rpc('tools/call', { name: 'get_demo_draft' }, 4), rpc('unknown日本語', {}, 5)];
  const bytes = Buffer.from(messages.map(JSON.stringify).join('\n') + '\n');
  const japanese = bytes.indexOf(Buffer.from('日'));
  input.write(bytes.subarray(0, japanese + 1)); input.write(bytes.subarray(japanese + 1));
  input.write('invalid json\n' + 'x'.repeat(33000) + '\n');
  input.end(JSON.stringify(rpc('ping', {}, 6)) + '\n');
  server.close();
  const rows = output.trim().split('\n').map(JSON.parse);
  assert.equal(rows.find(r => r.id === 4).result.structuredContent.draft.status, 'awaiting_confirmation');
  assert.equal(rows.filter(r => r.error?.code === -32700).length, 2);
  assert.deepEqual(rows.find(r => r.id === 6).result, {});
});

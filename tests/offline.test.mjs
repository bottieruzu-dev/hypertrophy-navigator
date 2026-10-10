import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('dist/sw.js', 'utf8');
function harness() {
  const listeners = {}, deleted = [], cached = [];
  const shell = { marker: 'offline index' };
  const cache = { addAll: async urls => cached.push(...urls), match: async () => shell };
  const context = {
    URL, Promise,
    self: { location: { href: 'https://dummy.invalid/sw.js' }, clients: { claim: async () => {} }, addEventListener: (name, fn) => { listeners[name] = fn; } },
    caches: { open: async () => cache, keys: async () => ['unrelated-cache', 'hypertrophy-shell-old'], delete: async key => deleted.push(key) },
    fetch: async () => { throw new Error('offline'); },
  };
  vm.runInNewContext(source, context);
  return { listeners, deleted, cached, shell };
}
test('offline install contains only existing public shell files', async () => {
  const h = harness(); let wait;
  h.listeners.install({ waitUntil: promise => { wait = promise; } });
  await wait;
  assert.ok(h.cached.length >= 8);
  for (const url of h.cached) {
    assert.equal(new URL(url).origin, 'https://dummy.invalid');
    assert.ok(existsSync(`dist${new URL(url).pathname}`), url);
  }
  assert.ok(h.cached.some(url => url.endsWith('/muscle-anatomy.png')));
});
test('offline activation preserves unrelated caches', async () => {
  const h = harness(); let wait;
  h.listeners.activate({ waitUntil: promise => { wait = promise; } }); await wait;
  assert.deepEqual(h.deleted, ['hypertrophy-shell-old']);
});
test('offline navigation uses the cached shell', async () => {
  const h = harness(); let response;
  h.listeners.fetch({ request: { method: 'GET', url: 'https://dummy.invalid/', mode: 'navigate' }, respondWith: promise => { response = promise; } });
  assert.equal(await response, h.shell);
});
test('worker never intercepts cloud requests, records, or writes', () => {
  const h = harness();
  for (const request of [
    { method: 'GET', url: 'https://cloud.invalid/rest/v1/sets' },
    { method: 'GET', url: 'https://dummy.invalid/private-records' },
    { method: 'POST', url: 'https://dummy.invalid/index.html' },
  ]) h.listeners.fetch({ request, respondWith: () => assert.fail('private request intercepted') });
});

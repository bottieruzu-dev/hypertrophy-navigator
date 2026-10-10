import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';

/** Cache only this app's public shell; never intercept Supabase or user records. */
export function offlinePlugin(): Plugin {
  return {
    name: 'hypertrophy-offline-shell',
    apply: 'build',
    generateBundle(_options, bundle) {
      const staticFiles = ['index.html', 'trainer.png', 'muscle-anatomy.png', 'favicon.svg', 'apple-touch-icon.png', 'manifest.webmanifest'];
      const assets = Object.keys(bundle).filter(name => name.endsWith('.js') || name.endsWith('.css'));
      const hash = createHash('sha256').update([...staticFiles, ...assets].join('|')).update(readFileSync('public/muscle-anatomy.png')).digest('hex').slice(0, 12);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: `
const CACHE = 'hypertrophy-shell-${hash}';
const FILES = ${JSON.stringify([...staticFiles, ...assets])};
const base = new URL('./', self.location.href);
const urls = FILES.map(path => new URL(path, base).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('hypertrophy-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== base.origin) return;
  if (request.mode === 'navigate' && (url.pathname === base.pathname || url.pathname === base.pathname + 'index.html')) {
    event.respondWith(fetch(request).catch(() => caches.open(CACHE).then(cache => cache.match(new URL('index.html', base).href))));
  } else if (urls.includes(url.href)) {
    event.respondWith(caches.open(CACHE).then(cache => cache.match(request).then(response => response || fetch(request))));
  }
});
` });
    },
  };
}

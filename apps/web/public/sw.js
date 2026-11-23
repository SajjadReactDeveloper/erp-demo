/* Service worker for the logistics PWA: app-shell caching so scanning screens open with no network. API data is cached by the app itself (IndexedDB). */
const CACHE = 'aq-shell-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/m', '/icon.svg']).catch(() => null))); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request; const url = new URL(req.url);
  if (req.method !== 'GET' || url.pathname.startsWith('/api/') || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/m') || url.pathname.startsWith('/_next/static') || url.pathname === '/icon.svg') {
    e.respondWith(fetch(req).then((res) => { const copy = res.clone(); if (res.ok) caches.open(CACHE).then((c) => c.put(req, copy)); return res; }).catch(() => caches.match(req).then((r) => r || caches.match('/m'))));
  }
});

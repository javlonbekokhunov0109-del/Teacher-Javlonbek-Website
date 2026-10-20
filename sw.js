/* Teacher Javlonbek service worker: makes the site installable and lets it open offline.
   It NEVER shows old data when the network works: everything is fetched fresh first (network-first, 4 s),
   and the saved copy is only used when the network is slow or down. API calls and other sites are never touched. */
const CACHE = 'tj-v1';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/.netlify/') || url.pathname === '/sw.js') return;
  const fallback = () => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match('/') : undefined)).then((r) => r || new Response('You appear to be offline.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
  e.respondWith(new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) caches.match(req).then((r) => { if (r && !done) { done = true; resolve(r); } }); }, 4000);
    fetch(req).then((res) => {
      clearTimeout(timer);
      if (res && res.ok && res.type === 'basic') { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/' : req, copy)); }
      if (!done) { done = true; resolve(res); }
    }).catch(() => { clearTimeout(timer); if (!done) { done = true; fallback().then(resolve); } });
  }));
});

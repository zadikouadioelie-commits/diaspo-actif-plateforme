/* ============================================================
   DIASPO'ACTIF — Service Worker v3
   HTML  → toujours depuis le réseau (jamais le cache)
   API   → toujours depuis le réseau
   Assets (CSS/JS/img) → cache pour la performance
   ============================================================ */
const CACHE_NAME = 'da-assets-v3';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Ignorer les origines externes */
  if (url.origin !== self.location.origin) return;

  /* ── API : réseau pur ── */
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'Hors ligne' }), {
          status: 503, headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  /* ── HTML / navigation : TOUJOURS réseau, JAMAIS cache ── */
  if (e.request.mode === 'navigate' ||
      url.pathname.endsWith('.html') ||
      url.pathname === '/') {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  /* ── Assets CSS / JS / images : cache-first ── */
  e.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(e.request).then(cached => {
        const networkFetch = fetch(e.request).then(resp => {
          if (resp && resp.status === 200) cache.put(e.request, resp.clone());
          return resp;
        });
        return cached || networkFetch;
      })
    )
  );
});

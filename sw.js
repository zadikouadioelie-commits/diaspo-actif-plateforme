/* ============================================================
   DIASPO'ACTIF — Service Worker v4
   TOUT → toujours depuis le réseau, jamais de cache local.
   Vercel CDN gère la performance. Le SW garantit la fraîcheur.
   ============================================================ */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', e => {
  /* Supprimer TOUS les caches existants */
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Ignorer les origines externes */
  if (url.origin !== self.location.origin) return;

  /* Tout depuis le réseau, sans cache */
  e.respondWith(fetch(e.request, { cache: 'no-store' }));
});

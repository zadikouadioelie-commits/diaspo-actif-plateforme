/* Diaspo'Actif — Service Worker PWA */
const CACHE = 'diaspoactif-v75';
const STATIC = [
  '/',
  '/index.html',
  '/annuaire.html',
  '/fil-actualite.html',
  '/formations.html',
  '/evenements.html',
  '/messagerie.html',
  '/recherche.html',
  '/login.html',
  '/inscription.html',
  '/assets/styles.css',
  '/assets/responsive.css',
  '/assets/ds.css',
  '/assets/ds.js',
  '/assets/demo.js',
  '/tutoriels.html',
  '/assets/app.js',
  '/assets/data.js',
  '/assets/geo.js',
  '/assets/logo.svg',
  '/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  /* Les requêtes API ne sont jamais mises en cache */
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request).catch(() =>
      new Response(JSON.stringify({ error: 'Hors ligne' }), {
        status: 503, headers: { 'Content-Type': 'application/json' }
      })
    ));
    return;
  }

  /* Stratégie : Cache d'abord, réseau en fallback */
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        /* Page offline de secours pour la navigation */
        if (e.request.destination === 'document') {
          return caches.match('/index.html');
        }
      });
    })
  );
});

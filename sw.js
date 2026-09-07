/* ============================================================
   DIASPO'ACTIF — Service Worker v5
   TOUT → toujours depuis le réseau, jamais de cache local.
   Vercel CDN gère la performance. Le SW garantit la fraîcheur.
   v5 (2026-09-07) : ajout des notifications push téléphone.
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

/* ============================================================
   Notifications push (2026-09-07) — voir server/push.js pour l'envoi.
   Payload JSON : { titre, contenu, data }, même forme que la table
   notifications côté serveur.
   ============================================================ */
self.addEventListener('push', e => {
  let payload = {};
  try { payload = e.data ? e.data.json() : {}; } catch (_) {}
  const titre = payload.titre || "Diaspo'Actif";
  e.waitUntil(self.registration.showNotification(titre, {
    body: payload.contenu || '',
    icon: '/assets/logo.png',
    badge: '/assets/logo.png',
    data: payload.data || {},
  }));
});

/* Même priorité de routage que notifUrl() dans assets/app.js — gardez les deux synchronisées. */
function pushClickUrl(d) {
  d = d || {};
  if (d.lien)             return d.lien;
  if (d.demande_id)       return `messagerie.html?demande=${d.demande_id}`;
  if (d.post_id)          return `fil-actualite.html#fp-${d.post_id}`;
  if (d.conversation_id)  return `messagerie.html?conv=${d.conversation_id}`;
  if (d.evenement_id)     return `evenements.html#evt-${d.evenement_id}`;
  if (d.event_id)         return `evenements.html#evt-${d.event_id}`;
  if (d.reunion_id)       return `reunions.html?reunion=${d.reunion_id}`;
  if (d.with_user_id)     return `messagerie.html?with=${d.with_user_id}`;
  if (d.follower_id)      return `profil.html?id=${d.follower_id}`;
  if (d.initiative_id)    return `initiative.html?id=${d.initiative_id}`;
  return '/index.html';
}

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const path = pushClickUrl(e.notification.data);
  const target = new URL(path, self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientsArr => {
      for (const c of clientsArr) {
        if (c.url === target && 'focus' in c) return c.focus();
      }
      if (clientsArr.length && 'focus' in clientsArr[0]) {
        clientsArr[0].navigate(target);
        return clientsArr[0].focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

/* ── Notifications push téléphone (Web Push) — Diaspo'Actif, 2026-09-07 ──
   Norme standard (pas d'app native) : un abonnement par appareil/navigateur est stocké
   dans push_subscriptions (voir server/db.js), puis chaque nouvelle notification in-app
   (creerNotif(), server/index.js) déclenche AUSSI un envoi ici — un seul point de
   branchement, jamais besoin de toucher aux 200+ appels existants à creerNotif().

   Rappel plateforme (pas une limite de ce code) : sur iPhone, Apple exige que le site
   soit installé sur l'écran d'accueil avant que les notifications push fonctionnent —
   voir assets/pwa-install.js pour le bandeau d'installation déjà existant. */
const webpush = require("web-push");
const db = require("./db");

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails("mailto:contact@diaspoactif.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.log("[push] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY absentes — notifications push désactivées.");
}

/* Best-effort, ne fait jamais échouer l'appelant (même convention que sendEmail côté
   mailer.js) : une notification in-app ne doit jamais se perdre parce que le push a
   échoué. Purge automatiquement les abonnements morts (410/404 — l'utilisateur a
   désinstallé l'app ou désactivé les notifications côté navigateur/OS). */
async function envoyerPush(userId, { titre, contenu, data = {} }) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return;
  try {
    const subs = await db.prepare("SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id=?").all(userId);
    if (!subs.length) return;
    const payload = JSON.stringify({ titre, contenu, data });
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) {
          try { await db.prepare("DELETE FROM push_subscriptions WHERE id=?").run(s.id); } catch (_) {}
        } else {
          console.error("[push] envoi échoué", s.id, e.statusCode, e.message);
        }
      }
    }));
  } catch (e) {
    console.error("[push] envoyerPush", e.message);
  }
}

module.exports = { envoyerPush, VAPID_PUBLIC_KEY };

/* ============================================================
   Diaspo'Actif — Version téléphone : invitation à activer les notifications (2026-10-13, demande explicite)
   Carte affichée en haut de l'accueil pour un compte connecté dont le téléphone n'a encore jamais répondu à la question
   (autorisation « default »). Le bouton déclenche la demande d'autorisation du navigateur puis l'abonnement push, exactement
   comme l'interrupteur de « Confidentialité » (qui reste le lieu pour les désactiver).

   Discrétion : « Plus tard » repousse l'invitation de 7 jours, 3 reports au maximum, puis on ne la montre plus.
   Rien n'est affiché si le navigateur ne sait pas faire de push, si l'autorisation est déjà accordée ou refusée,
   ou si le serveur n'a pas de clé d'envoi (pas de demande d'autorisation « pour rien »).

   API : GET /api/push/vapid-public-key · POST /api/push/subscribe
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, toast } = A;
  window.MMods = window.MMods || {};
  const REPORT_MS = 7 * 24 * 3600 * 1000, REPORTS_MAX = 3;
  const cle = () => 'da_notif_invite_' + (S.me ? S.me.id : '');
  const lire = () => { try { return JSON.parse(localStorage.getItem(cle()) || '{}') || {}; } catch (e) { return {}; } };
  const ecrire = o => { try { localStorage.setItem(cle(), JSON.stringify(o)); } catch (e) { /* stockage indisponible : l'invitation reviendra, sans conséquence */ } };
  const pushPossible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const u8 = b64 => { const pad = '='.repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
  const delai = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));

  async function abonner(publicKey) {
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
    reg = await Promise.race([navigator.serviceWorker.ready, delai(10000, 'Le service de notifications met trop de temps à démarrer.')]);
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(publicKey) });
    await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
  }

  window.MMods.notifInvite = async function () {
    const el = document.getElementById('home-notif');
    if (!el || !S.me || !pushPossible() || Notification.permission !== 'default') return;
    const etat = lire();
    if (Number(etat.n || 0) >= REPORTS_MAX + 1) return;
    if (Number(etat.n || 0) > 0 && Date.now() - Number(etat.t || 0) < REPORT_MS) return;
    let publicKey;
    try { publicKey = (await api('/api/push/vapid-public-key')).publicKey; } catch (e) { return; }
    if (!publicKey || !document.getElementById('home-notif')) return;

    el.innerHTML = `<div class="card pad" id="ni-carte" style="background:var(--navy);color:#fff;border:0;display:flex;flex-direction:column;gap:10px">
      <div style="font-weight:800;font-size:16px;line-height:1.3">🔔 Soyez prévenu sans ouvrir l’appli</div>
      <div class="small" style="color:rgba(255,255,255,.85);line-height:1.45">Messages, réponses, invitations : recevez une notification sur ce téléphone dès qu’il se passe quelque chose sur votre compte. Vous pourrez les couper à tout moment dans Confidentialité.</div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="btn sm" id="ni-oui" style="background:#F5D061;border-color:#F5D061;color:var(--navy)">Activer les notifications</button>
        <button type="button" class="btn sm out" id="ni-plus" style="background:transparent;border-color:rgba(255,255,255,.45);color:#fff">Plus tard</button>
      </div></div>`;
    const retirer = () => { const c = document.getElementById('ni-carte'); if (c) c.remove(); };
    document.getElementById('ni-plus').onclick = () => { ecrire({ n: Number(etat.n || 0) + 1, t: Date.now() }); retirer(); };
    document.getElementById('ni-oui').onclick = async ev => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') { ecrire({ n: 99, t: Date.now() }); retirer(); return toast('Autorisation non accordée. Vous pourrez l’activer plus tard dans Confidentialité.', true); }
        await abonner(publicKey);
        ecrire({ n: 99, t: Date.now() }); retirer(); toast('Notifications activées sur ce téléphone ✓');
      } catch (e) { b.disabled = false; toast('Impossible d’activer les notifications. ' + (e.message || ''), true); }
    };
  };
})();

/* ============================================================
   Diaspo'Actif — Invitation à activer les notifications (2026-10-13, demande explicite)
   Commun au site (assets/app.js) et à la version téléphone (assets/m.js).

   À la connexion d'un compte, une fenêtre propose : « Activer les notifications afin de ne pas rater toutes les
   opportunités créées par la diaspora. » Un appui sur « Activer » déclenche la demande d'autorisation du navigateur puis
   l'abonnement push de CET appareil — exactement comme l'interrupteur de Confidentialité (qui reste le lieu pour les couper).

   Règles :
   - affichée une seule fois par session (onglet / ouverture du raccourci), donc de nouveau à la connexion suivante tant que
     les notifications ne sont pas activées sur cet appareil ; « Plus tard » ferme pour la session ;
   - jamais si l'appareil est déjà abonné, si le navigateur ne sait pas faire de push, si l'autorisation est « bloquée »,
     si la personne a désactivé elle-même les notifications dans Confidentialité (da_notif_off), si le serveur n'a pas de
     clé d'envoi, ni sur les pages d'inscription, de connexion, de paiement ou de vérification ;
   - l'activation vient toujours d'un appui de la personne (consentement explicite), jamais d'une case cochée à sa place.

   API : GET /api/push/vapid-public-key · POST /api/push/subscribe
   ============================================================ */
(function () {
  'use strict';
  if (window.DaNotifInvite) return;

  const VU = 'da_notif_invite_vue', OFF = 'da_notif_off';
  const PAGES_EXCLUES = ['inscription', 'login', 'connexion', 'paiement', 'panier', 'checkout', 'premium', 'verif', 'mot-de-passe', 'reset'];
  const pushPossible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const lire = (st, k) => { try { return window[st].getItem(k); } catch (e) { return null; } };
  const ecrire = (st, k, v) => { try { window[st].setItem(k, v); } catch (e) { /* stockage indisponible : sans conséquence */ } };
  const u8 = b64 => { const pad = '='.repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
  const delai = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));
  const json = async (url, opts) => {
    const r = await fetch(url, Object.assign({ credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } }, opts || {}));
    let j = null; try { j = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok) throw new Error((j && (j.error || j.message)) || 'Une erreur est survenue.');
    return j || {};
  };

  const CSS = `
.dni-fond{position:fixed;inset:0;z-index:100000;background:rgba(6,18,36,.72);display:flex;align-items:center;justify-content:center;padding:18px;font-family:inherit}
.dni-carte{width:100%;max-width:400px;background:#0D2B4E;color:#fff;border-radius:20px;padding:26px 22px 20px;box-shadow:0 24px 60px -12px rgba(0,0,0,.6),0 0 0 2px rgba(245,208,97,.55);text-align:center}
.dni-cloche{width:60px;height:60px;margin:0 auto 14px;border-radius:50%;background:linear-gradient(135deg,#F7E08A,#D9A81E);display:flex;align-items:center;justify-content:center;font-size:30px;box-shadow:0 8px 20px -6px rgba(217,168,30,.7)}
.dni-titre{margin:0 0 10px;font-size:19px;line-height:1.35;font-weight:800}
.dni-texte{margin:0 0 18px;font-size:14px;line-height:1.5;color:rgba(255,255,255,.82)}
.dni-btn{display:block;width:100%;min-height:48px;border-radius:30px;font:inherit;font-size:16px;font-weight:800;cursor:pointer;border:2px solid transparent;-webkit-tap-highlight-color:transparent}
.dni-oui{background:linear-gradient(135deg,#F7E08A,#E0AE24);color:#0D2B4E;margin-bottom:10px}
.dni-plus{background:transparent;color:#fff;border-color:rgba(255,255,255,.4);font-weight:700}
.dni-btn:disabled{opacity:.6;cursor:default}
.dni-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}
.dni-msg{margin:12px 0 0;font-size:13px;line-height:1.4;min-height:1em}
.dni-msg.err{color:#FFB4A8}
@media (prefers-reduced-motion:no-preference){.dni-carte{animation:dniEntree .25s ease-out}@keyframes dniEntree{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}}
`;

  function afficher(publicKey) {
    if (document.getElementById('dni-fond')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const fond = document.createElement('div');
    fond.className = 'dni-fond'; fond.id = 'dni-fond'; fond.setAttribute('role', 'dialog'); fond.setAttribute('aria-modal', 'true'); fond.setAttribute('aria-labelledby', 'dni-titre');
    fond.innerHTML = `<div class="dni-carte">
      <div class="dni-cloche" aria-hidden="true">🔔</div>
      <h2 class="dni-titre" id="dni-titre">Activer les notifications afin de ne pas rater toutes les opportunités créées par la diaspora.</h2>
      <p class="dni-texte">Un seul appui, puis « Autoriser ». Vous pourrez les couper à tout moment dans Confidentialité.</p>
      <button type="button" class="dni-btn dni-oui" id="dni-oui">Activer les notifications</button>
      <button type="button" class="dni-btn dni-plus" id="dni-plus">Plus tard</button>
      <p class="dni-msg" id="dni-msg" role="status" aria-live="polite"></p></div>`;
    document.body.appendChild(fond);
    const msg = document.getElementById('dni-msg'), oui = document.getElementById('dni-oui'), plus = document.getElementById('dni-plus');
    const fermer = () => { document.removeEventListener('keydown', echap); fond.remove(); };
    const echap = ev => { if (ev.key === 'Escape') fermer(); };
    document.addEventListener('keydown', echap);
    plus.onclick = fermer;
    oui.onclick = async () => {
      oui.disabled = plus.disabled = true; msg.className = 'dni-msg'; msg.textContent = '';
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          msg.textContent = permission === 'denied' ? 'Autorisation refusée. Vous pourrez les activer plus tard dans Confidentialité.' : 'Autorisation non accordée. Vous pourrez réessayer dans Confidentialité.';
          plus.disabled = false; plus.textContent = 'Fermer'; return;
        }
        let reg = await navigator.serviceWorker.getRegistration();
        if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
        reg = await Promise.race([navigator.serviceWorker.ready, delai(10000, 'Le service de notifications met trop de temps à démarrer.')]);
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(publicKey) });
        await json('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
        try { localStorage.removeItem(OFF); } catch (e) { /* sans conséquence */ }
        msg.textContent = '✓ Notifications activées sur cet appareil.';
        setTimeout(fermer, 1600);
      } catch (e) {
        msg.className = 'dni-msg err';
        msg.textContent = 'Impossible d’activer les notifications pour le moment. ' + (e.message || '');
        oui.disabled = plus.disabled = false; oui.textContent = 'Réessayer';
      }
    };
    setTimeout(() => { try { oui.focus(); } catch (e) { /* sans conséquence */ } }, 50);
  }

  async function proposer(user) {
    try {
      if (!user || !user.id || !pushPossible()) return;
      if (Notification.permission === 'denied') return;
      if (lire('sessionStorage', VU) === '1' || lire('localStorage', OFF) === '1') return;
      if (user.profil_obligatoire && user.profil_obligatoire.actif) return;
      const chemin = (location.pathname || '').toLowerCase();
      if (PAGES_EXCLUES.some(p => chemin.includes(p))) return;
      const reg = await navigator.serviceWorker.getRegistration();
      const deja = reg ? await reg.pushManager.getSubscription() : null;
      if (deja) return;
      const publicKey = (await json('/api/push/vapid-public-key')).publicKey;
      if (!publicKey) return;
      /* Laisse la page se poser (bandeaux, écrans obligatoires) avant d'ouvrir la fenêtre. */
      setTimeout(() => {
        if (lire('sessionStorage', VU) === '1') return;
        ecrire('sessionStorage', VU, '1'); afficher(publicKey);
      }, 1500);
    } catch (e) { /* silencieux : une invitation ne doit jamais gêner la page */ }
  }

  window.DaNotifInvite = { proposer: proposer, marquerDesactive: () => ecrire('localStorage', OFF, '1'), marquerActive: () => { try { localStorage.removeItem(OFF); } catch (e) { /* sans conséquence */ } } };
})();

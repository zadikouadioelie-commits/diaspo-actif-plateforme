/* ============================================================
   Diaspo'Actif — Invitation à activer les notifications (2026-10-13, demande explicite)
   Commun au site (assets/app.js) et à la version téléphone (assets/m.js).

   À la connexion d'un compte, une fenêtre propose : « Activer les notifications afin de ne pas rater toutes les
   opportunités créées par la diaspora. » Un appui sur « Activer » déclenche la demande d'autorisation du navigateur puis
   l'abonnement push de CET appareil — exactement comme l'interrupteur de Confidentialité (qui reste le lieu pour les couper).

   Règles (invitation douce) :
   - affichée une seule fois par session (onglet / ouverture du raccourci), donc de nouveau à la connexion suivante tant que
     les notifications ne sont pas activées sur cet appareil ; « Plus tard » ferme pour la session ;
   - après 3 « Plus tard », elle ne revient plus qu'une fois par semaine ;
   - à un moment où l'intérêt est évident (juste après l'envoi d'un message), une variante propose d'être prévenu de la réponse,
     au plus une fois tous les 3 jours ;
   - jamais si l'appareil est déjà abonné, si le navigateur ne sait pas faire de push, si l'autorisation est « bloquée »,
     si la personne a désactivé elle-même les notifications dans Confidentialité (da_notif_off), si le serveur n'a pas de
     clé d'envoi, ni sur les pages d'inscription, de connexion, de paiement ou de vérification ;
   - l'activation vient toujours d'un appui de la personne (consentement explicite), jamais d'une case cochée à sa place.

   API : GET /api/push/vapid-public-key · POST /api/push/subscribe
   ============================================================ */
(function () {
  'use strict';
  if (window.DaNotifInvite) return;

  const VU = 'da_notif_invite_vue', OFF = 'da_notif_off', REP = 'da_notif_report', CTX = 'da_notif_ctx_t';
  const SEMAINE = 7 * 24 * 3600 * 1000, TROIS_JOURS = 3 * 24 * 3600 * 1000, REPORTS_AVANT_RALENTI = 3;
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
  const rapport = () => { try { return JSON.parse(lire('localStorage', REP) || '{}') || {}; } catch (e) { return {}; } };

  /* Demande l'autorisation puis abonne cet appareil. À appeler DEPUIS un appui de la personne. */
  async function abonner(publicKey) {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { ok: false, permission: permission };
    let reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
    reg = await Promise.race([navigator.serviceWorker.ready, delai(10000, 'Le service de notifications met trop de temps à démarrer.')]);
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(publicKey) });
    await json('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }) });
    try { localStorage.removeItem(OFF); } catch (e) { /* sans conséquence */ }
    return { ok: true };
  }

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

  function afficher(publicKey, contexte) {
    if (document.getElementById('dni-fond')) return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const titre = contexte === 'message' ? 'Être prévenu dès que votre message reçoit une réponse, et ne pas rater les opportunités créées par la diaspora.' : 'Activer les notifications afin de ne pas rater toutes les opportunités créées par la diaspora.';
    const fond = document.createElement('div');
    fond.className = 'dni-fond'; fond.id = 'dni-fond'; fond.setAttribute('role', 'dialog'); fond.setAttribute('aria-modal', 'true'); fond.setAttribute('aria-labelledby', 'dni-titre');
    fond.innerHTML = `<div class="dni-carte">
      <div class="dni-cloche" aria-hidden="true">🔔</div>
      <h2 class="dni-titre" id="dni-titre">${titre}</h2>
      <p class="dni-texte">Un seul appui, puis « Autoriser ». Vous pourrez les couper à tout moment dans Confidentialité.</p>
      <button type="button" class="dni-btn dni-oui" id="dni-oui">Activer les notifications</button>
      <button type="button" class="dni-btn dni-plus" id="dni-plus">Plus tard</button>
      <p class="dni-msg" id="dni-msg" role="status" aria-live="polite"></p></div>`;
    document.body.appendChild(fond);
    const msg = document.getElementById('dni-msg'), oui = document.getElementById('dni-oui'), plus = document.getElementById('dni-plus');
    const echap = ev => { if (ev.key === 'Escape') reporter(); };
    const fermer = () => { document.removeEventListener('keydown', echap); fond.remove(); };
    const reporter = () => { const r = rapport(); ecrire('localStorage', REP, JSON.stringify({ n: Number(r.n || 0) + 1, t: Date.now() })); fermer(); };
    document.addEventListener('keydown', echap);
    plus.onclick = reporter;
    oui.onclick = async () => {
      oui.disabled = plus.disabled = true; msg.className = 'dni-msg'; msg.textContent = '';
      try {
        const r = await abonner(publicKey);
        if (!r.ok) {
          msg.textContent = r.permission === 'denied' ? 'Autorisation refusée. Vous pourrez les activer plus tard dans Confidentialité.' : 'Autorisation non accordée. Vous pourrez réessayer dans Confidentialité.';
          plus.disabled = false; plus.textContent = 'Fermer'; plus.onclick = fermer; return;
        }
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

  /* Vrai si cet appareil peut encore recevoir l'invitation (support, autorisation, choix de la personne, abonnement existant). */
  async function eligible(user) {
    if (!user || !user.id || !pushPossible()) return false;
    if (Notification.permission === 'denied') return false;
    if (lire('localStorage', OFF) === '1') return false;
    if (user.profil_obligatoire && user.profil_obligatoire.actif) return false;
    const chemin = (location.pathname || '').toLowerCase();
    if (PAGES_EXCLUES.some(p => chemin.includes(p))) return false;
    const reg = await navigator.serviceWorker.getRegistration();
    const deja = reg ? await reg.pushManager.getSubscription() : null;
    return !deja;
  }

  async function proposer(user, options) {
    try {
      const contexte = options && options.contexte;
      if (lire('sessionStorage', VU) === '1') return;
      if (contexte) { if (Date.now() - Number(lire('localStorage', CTX) || 0) < TROIS_JOURS) return; }
      else { const r = rapport(); if (Number(r.n || 0) >= REPORTS_AVANT_RALENTI && Date.now() - Number(r.t || 0) < SEMAINE) return; }
      if (!(await eligible(user))) return;
      const publicKey = (await json('/api/push/vapid-public-key')).publicKey;
      if (!publicKey) return;
      /* Laisse la page se poser (bandeaux, écrans obligatoires) avant d'ouvrir la fenêtre. */
      setTimeout(() => {
        if (lire('sessionStorage', VU) === '1') return;
        ecrire('sessionStorage', VU, '1'); if (contexte) ecrire('localStorage', CTX, String(Date.now()));
        afficher(publicKey, contexte);
      }, contexte ? 700 : 1500);
    } catch (e) { /* silencieux : une invitation ne doit jamais gêner la page */ }
  }

  /* Pour un bandeau « Activer » placé dans une page : vrai si on peut le montrer, et la fonction qui active. */
  async function proposable(user) { try { return await eligible(user); } catch (e) { return false; } }
  async function activerMaintenant() {
    const publicKey = (await json('/api/push/vapid-public-key')).publicKey;
    if (!publicKey) throw new Error('Notifications indisponibles pour le moment.');
    return abonner(publicKey);
  }

  window.DaNotifInvite = { proposer: proposer, proposable: proposable, activerMaintenant: activerMaintenant, marquerDesactive: () => ecrire('localStorage', OFF, '1'), marquerActive: () => { try { localStorage.removeItem(OFF); } catch (e) { /* sans conséquence */ } } };
})();

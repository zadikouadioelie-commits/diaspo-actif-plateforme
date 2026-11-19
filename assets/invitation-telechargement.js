/* ═══════════════════════════════════════════════════════
   assets/invitation-telechargement.js — « Télécharger Diaspo'Actif », proposé avant la connexion et à la fin de la création de compte
   (2026-11-19, demande explicite : « sur le téléphone comme sur l'ordinateur, avant même de se connecter, que la proposition de télécharger
   Diaspo'Actif soit faite et bien visible ; et quand une personne finit de créer son compte, lui proposer de télécharger directement D'A »).

   Deux présentations, un seul bouton :
   · bandeau flottant en bas de l'écran (visiteurs non connectés) : page d'accueil, connexion, création de compte, version téléphone ;
   · carte posée dans l'écran « Compte créé » (DAInvitation.carte(conteneur)).
   Le bouton lance l'installation native du navigateur en un geste quand il l'offre (Chrome, Edge, Android) ; sinon il ouvre le guide par appareil
   de assets/telecharger-app.js (iPhone Safari, Android, ordinateur, + raccourci à télécharger), chargé seulement à ce moment-là.
   Jamais affiché si l'application est déjà installée (mode standalone) ni à une personne déjà connectée. Fermeture mémorisée pour la session seulement :
   l'invitation revient à la prochaine visite. Pour tout retirer : enlever la balise <script> des pages.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.DAInvitation) return;

  const CLE_FERME = 'da_inv_ferme';
  const SVG_TELECHARGER = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/></svg>';
  const SVG_FERMER = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  /* L'événement « beforeinstallprompt » arrive très tôt : on le garde (les pages qui chargent app.js ou m.js le gardent aussi de leur côté). */
  let invite = window.__daInvite || null;
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); invite = e; window.__daInvite = e; });
  window.addEventListener('appinstalled', () => { invite = null; window.__daInvite = null; installee(); });

  const estInstallee = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  const lireFerme = () => { try { return sessionStorage.getItem(CLE_FERME) === '1'; } catch (e) { return false; } };
  const ecrireFerme = () => { try { sessionStorage.setItem(CLE_FERME, '1'); } catch (e) { /* stockage indisponible */ } };

  function inviteDisponible() {
    if (invite) return invite;
    if (window.__daInvite) return window.__daInvite;
    try { if (typeof _pwaDeferredPrompt !== 'undefined' && _pwaDeferredPrompt) return _pwaDeferredPrompt; } catch (e) { /* variable absente */ }
    return null;
  }
  function oublierInvite() {
    invite = null; window.__daInvite = null;
    try { if (typeof _pwaDeferredPrompt !== 'undefined') _pwaDeferredPrompt = null; } catch (e) { /* lecture seule */ }
  }

  function css() {
    if (document.getElementById('dai-inv-css')) return;
    const s = document.createElement('style'); s.id = 'dai-inv-css';
    s.textContent = `
.dai-inv{position:fixed;left:50%;bottom:calc(12px + env(safe-area-inset-bottom));z-index:1500;width:min(540px,calc(100% - 24px));transform:translate(-50%,0);box-sizing:border-box;
  display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;padding:12px 12px 12px 14px;border-radius:20px;color:#F4F1E8;font-family:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;
  background:radial-gradient(320px 160px at 100% 0%,rgba(227,192,110,.16),transparent 70%),#0B1226;border:1px solid rgba(227,192,110,.5);box-shadow:0 22px 50px -18px #000,0 0 0 1px rgba(255,255,255,.04) inset;
  animation:dai-inv-entree .35s ease-out both}
@keyframes dai-inv-entree{from{opacity:0;transform:translate(-50%,18px)}to{opacity:1;transform:translate(-50%,0)}}
.dai-inv *{box-sizing:border-box}
.dai-inv-logo{width:44px;height:44px;border-radius:12px;background:#fff;object-fit:contain;padding:4px;flex:none}
.dai-inv-t{flex:1 1 180px;min-width:0;display:flex;flex-direction:column;gap:2px;line-height:1.3}
.dai-inv-t strong{font-size:15px;font-weight:700;color:#fff}
.dai-inv-t span{font-size:13px;color:#C3CCE0}
.dai-inv-go{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 18px;border:0;border-radius:14px;cursor:pointer;font:700 14.5px/1 'Manrope',system-ui,sans-serif;
  color:#1a1202;background:linear-gradient(135deg,#F3DC9B 0%,#E3C06E 38%,#B9893A 100%);box-shadow:0 12px 26px -14px rgba(227,192,110,.85);touch-action:manipulation;transition:transform .15s ease,box-shadow .15s ease}
.dai-inv-go:hover{transform:translateY(-1px);box-shadow:0 16px 30px -14px rgba(227,192,110,.95)}
.dai-inv-go:focus-visible,.dai-inv-x:focus-visible{outline:3px solid #fff;outline-offset:2px}
.dai-inv-x{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;margin:-6px -2px -6px 0;border:0;border-radius:50%;background:transparent;color:#C3CCE0;cursor:pointer;touch-action:manipulation;flex:none}
.dai-inv-x:hover{background:rgba(255,255,255,.08);color:#fff}
@media (max-width:480px){.dai-inv-go{flex:1 1 100%;order:3}.dai-inv-x{order:2;margin-left:auto}.dai-inv-t{order:1}.dai-inv-logo{order:0}}
.dai-carte{margin:6px auto 22px;max-width:420px;padding:22px 20px 18px;border-radius:22px;text-align:center;color:#F4F1E8;font-family:'Manrope',system-ui,-apple-system,'Segoe UI',sans-serif;
  background:radial-gradient(340px 180px at 50% 0%,rgba(227,192,110,.18),transparent 72%),#0B1226;border:1px solid rgba(227,192,110,.5);box-shadow:0 26px 54px -30px #000}
.dai-carte .dai-inv-logo{display:block;width:60px;height:60px;margin:0 auto 12px;border-radius:16px}
.dai-carte h4{margin:0 0 6px;font-family:'Bodoni Moda','Playfair Display',Georgia,serif;font-weight:600;font-size:22px;line-height:1.2;color:#fff}
.dai-carte p{margin:0 auto 16px;max-width:340px;font-size:14px;line-height:1.5;color:#C3CCE0}
.dai-carte .dai-inv-go{width:100%;min-height:50px;font-size:15.5px}
.dai-carte .dai-note{display:block;margin-top:10px;font-size:12.5px;line-height:1.45;color:#C3CCE0;min-height:1em}
.dai-carte .dai-ok{display:block;padding:12px 14px;border-radius:14px;background:rgba(80,200,140,.14);border:1px solid rgba(80,200,140,.5);color:#C9F2DC;font-size:14px;font-weight:600}
@media (prefers-reduced-motion:reduce){.dai-inv{animation:none}.dai-inv-go{transition:none}}
`;
    document.head.appendChild(s);
  }

  /* Guide par appareil (installation à la main, raccourci ordinateur…) : chargé seulement quand il sert. */
  function guide() {
    return (window.DAInstall ? Promise.resolve() : new Promise((ok, ko) => {
      const sc = document.createElement('script'); sc.src = '/assets/telecharger-app.js?v=2'; sc.onload = ok; sc.onerror = () => ko(new Error('chargement')); document.head.appendChild(sc);
    })).then(() => window.DAInstall.ouvrir());
  }

  function dire(texte) {
    document.querySelectorAll('.dai-note').forEach(n => { n.textContent = texte; });
    const b = document.querySelector('#dai-inv .dai-inv-t span'); if (b) b.textContent = texte;
  }

  /* Le bouton : installation native en un geste si le navigateur l'offre, sinon le guide. */
  async function telecharger() {
    if (estInstallee()) { installee(); return; }
    const e = inviteDisponible();
    if (e) {
      oublierInvite();   // une invite ne sert qu'une fois
      try {
        await e.prompt();
        const c = await e.userChoice;
        if (c && c.outcome === 'accepted') { installee(); return; }
        dire('Installation annulée : touchez « Télécharger » pour voir comment faire à la main.');
        return;
      } catch (err) { /* l'installation en un geste n'est pas possible ici : on passe au guide */ }
    }
    try { await guide(); } catch (err) { dire('Impossible d\'ouvrir le guide pour le moment. Vérifiez votre connexion et réessayez.'); }
  }

  /* Installation lancée ou déjà faite : plus aucune invitation. */
  function installee() {
    retirerBandeau();
    document.querySelectorAll('[data-dai-carte]').forEach(c => { c.innerHTML = '<span class="dai-ok">Installation lancée : l\'icône Diaspo\'Actif arrive sur votre écran d\'accueil dans un instant.</span>'; });
  }

  function retirerBandeau() { const b = document.getElementById('dai-inv'); if (b) b.remove(); window.removeEventListener('resize', replacer); }

  function replacer() {
    const b = document.getElementById('dai-inv'); if (!b) return;
    /* Version téléphone : la barre d'onglets est fixée en bas, le bandeau se pose juste au-dessus. */
    let bas = 12;
    /* Autres éléments fixés en bas de l'écran : le bandeau se pose juste au-dessus (barre d'onglets du téléphone ; bandeau des cookies à la première visite).
       (#tabs est « fixed » : offsetParent serait toujours null, d'où le test sur le style.) */
    ['tabs', 'da-cookie-banner'].forEach(id => {
      const e = document.getElementById(id);
      if (!e || getComputedStyle(e).display === 'none') return;
      const r = e.getBoundingClientRect();
      if (r.height && r.bottom > window.innerHeight / 2) bas = Math.max(bas, Math.round(window.innerHeight - r.top) + 10);
    });
    b.style.bottom = bas > 12 ? bas + 'px' : '';
  }

  async function estConnecte() {
    try {
      const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!r.ok) return false;
      const d = await r.json();
      return !!(d && d.user);
    } catch (e) { return false; }
  }

  async function bandeau() {
    if (document.getElementById('dai-inv') || estInstallee() || lireFerme()) return;
    if (await estConnecte()) return;
    if (document.getElementById('dai-inv') || window.__daInvSansBandeau) return;   // la page peut s'en passer (écran « Compte créé »)
    css();
    const b = document.createElement('div');
    b.id = 'dai-inv'; b.className = 'dai-inv'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Télécharger Diaspo\'Actif');
    b.innerHTML = `<img class="dai-inv-logo" src="/assets/logo.png" alt="" width="44" height="44">
      <div class="dai-inv-t"><strong>Téléchargez Diaspo'Actif</strong><span>Gratuit, en un geste.</span></div>
      <button type="button" class="dai-inv-go">${SVG_TELECHARGER}Télécharger</button>
      <button type="button" class="dai-inv-x" aria-label="Masquer cette invitation">${SVG_FERMER}</button>`;
    document.body.appendChild(b);
    b.querySelector('.dai-inv-go').onclick = telecharger;
    b.querySelector('.dai-inv-x').onclick = () => { ecrireFerme(); retirerBandeau(); };
    window.addEventListener('resize', replacer);
    /* Le bandeau des cookies disparaît quand on l'accepte : le nôtre redescend aussitôt. */
    new MutationObserver(replacer).observe(document.body, { childList: true });
    replacer(); setTimeout(replacer, 600);
  }

  /* Carte « Compte créé » : posée par la page dans le conteneur indiqué. */
  function carte(conteneur) {
    if (!conteneur) return;
    if (estInstallee()) { conteneur.innerHTML = ''; return; }
    css();
    retirerBandeau();
    conteneur.innerHTML = `<div class="dai-carte" data-dai-carte>
      <img class="dai-inv-logo" src="/assets/logo.png" alt="" width="60" height="60">
      <h4>Emportez Diaspo'Actif avec vous</h4>
      <p>Ajoutez l'application à l'écran d'accueil de votre téléphone ou au bureau de votre ordinateur : un geste, et vous y êtes.</p>
      <button type="button" class="dai-inv-go">${SVG_TELECHARGER}Télécharger Diaspo'Actif</button>
      <span class="dai-note" role="status" aria-live="polite"></span>
    </div>`;
    conteneur.querySelector('.dai-inv-go').onclick = telecharger;
  }

  window.DAInvitation = { telecharger, carte, retirerBandeau, bandeau };

  /* Départ : un instant après le chargement, pour ne pas gêner l'affichage de la page. */
  const lancer = () => setTimeout(() => { bandeau().catch(() => {}); }, 1200);
  if (document.readyState === 'complete') lancer(); else window.addEventListener('load', lancer);
})();

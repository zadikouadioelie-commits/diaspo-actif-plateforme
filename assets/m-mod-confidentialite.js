/* ============================================================
   Diaspo'Actif — Version téléphone : module « Confidentialité »
   Équivalent de confidentialite.html (+ le panneau « Confidentialité du profil » de
   profil-app.html, qui porte les vrais réglages de visibilité), pensé pour le téléphone.

   Routes :  #/confidentialite            réglages (visibilité du profil, notifications, accès rapides)
             #/confidentialite/infos      mes informations déclarées (nom, naissance, e-mail, origines)
             #/confidentialite/origine    origine officielle de l'institution (collectivité, institution)
             #/confidentialite/niveaux    qui voit quoi (Public / Réseau / Confidentiel)

   Routes API (les mêmes que le site) :
     GET  /api/profil/:id                         → profil.privacy (visibilité par rubrique)
     PUT  /api/profil  { privacy }                enregistre la visibilité (une rubrique à la fois)
     GET  /api/profil/informations-declarees      → informations
     PUT  /api/profil/informations-declarees      (uniquement les champs modifiés)
     PUT  /api/profil/origine-institution
     GET  /api/identity/status                    badge d'identité (lecture seule)
     GET  /api/dashboard/initiative               → initiative.da_id / .id (identifiant public)
     PATCH /api/auth/pwa-prompt-preference { dismiss }
     GET  /api/push/vapid-public-key · POST /api/push/subscribe · POST /api/push/unsubscribe

   Laissé à la page du site (explications + lien) : changement de
   gestionnaire du compte, masquage du compte, lancement de la vérification d'identité Stripe.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast, openSheet } = A;
  window.MMods = window.MMods || {};

  /* ---------- styles (injectés une seule fois) ---------- */
  if (!document.getElementById('m-mod-confidentialite-css')) {
    const st = document.createElement('style');
    st.id = 'm-mod-confidentialite-css';
    st.textContent = `
      .cf-intro{background:var(--sky-l);border-radius:var(--r);padding:12px 14px;margin-bottom:6px;font-size:14px;line-height:1.5;color:var(--navy)}
      .cf-card{background:var(--card);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow);overflow:hidden;margin-bottom:12px}
      .cf-box{padding:14px}
      .cf-sel-row{padding:12px 14px;border-bottom:1px solid var(--border)}
      .cf-sel-row:last-child{border-bottom:none}
      .cf-sel-row .t{font-weight:600;display:block}
      .cf-sel-row .d{font-size:12.5px;color:var(--muted);display:block;margin-bottom:8px}
      .cf-sel,.cf-in{width:100%;min-height:46px;border:1px solid var(--border);border-radius:12px;padding:0 12px;font-size:16px;background:#fff;color:var(--text);font-family:inherit}
      .cf-in{padding:0 14px}
      .cf-sel:disabled{opacity:.6}
      .cf-lbl{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}
      .cf-lbl:first-child{margin-top:0}
      .cf-hint{font-size:12.5px;color:var(--muted);margin:5px 2px 0;line-height:1.4}
      .cf-row{display:flex;align-items:center;gap:12px;width:100%;min-height:62px;padding:10px 14px;border-bottom:1px solid var(--border);text-align:left;background:none}
      .cf-row:last-child{border-bottom:none}
      .cf-row:active{background:rgba(13,43,78,.05)}
      .cf-row .t{font-weight:600;display:block}
      .cf-row .d{font-size:12.5px;color:var(--muted);display:block;line-height:1.3}
      .cf-row[disabled]{opacity:.6}
      .cf-ds-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:30px;font-weight:800;letter-spacing:.12em;text-align:center;padding:18px 10px;margin:10px 0 6px;border-radius:14px;background:var(--sky-l);color:var(--navy);user-select:all;-webkit-user-select:all;word-break:break-all}
      .cf-pwd{position:relative}
      .cf-pwd .cf-in{padding-right:48px}
      .cf-pwd button{position:absolute;right:4px;top:50%;transform:translateY(-50%);width:42px;height:42px;font-size:18px;line-height:1}
      .cf-sw{position:relative;flex:none;width:52px;height:32px;border-radius:16px;background:#B8C4D6;transition:background .18s}
      .cf-sw::after{content:'';position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .18s}
      .cf-row[aria-checked=true] .cf-sw{background:var(--green)}
      .cf-row[aria-checked=true] .cf-sw::after{transform:translateX(20px)}
      .cf-legend{font-size:13px;line-height:1.5;color:var(--muted);padding:12px 14px;border-top:1px solid var(--border);background:var(--ivory)}
      .cf-legend b{color:var(--text)}
      .cf-alert{border-radius:12px;padding:10px 12px;font-size:13.5px;line-height:1.45;margin-bottom:12px}
      .cf-alert.o{background:var(--orange-l);color:#78350f;border:1px solid #fed7aa}
      .cf-alert.g{background:var(--green-l);color:var(--green);border:1px solid #bbf7d0}
      .cf-err{color:var(--red);font-size:13.5px;min-height:20px;margin:10px 2px 0}
      .cf-lvl{border-radius:var(--r);padding:14px;margin-bottom:12px;border:1px solid var(--border);background:var(--card)}
      .cf-lvl h3{margin:0 0 4px;font-size:16px}
      .cf-lvl p{margin:0 0 8px;font-size:13.5px;color:var(--muted);line-height:1.45}
      .cf-lvl ul{margin:0;padding-left:20px}
      .cf-lvl li{margin:2px 0}
      .cf-mono{font-family:ui-monospace,Consolas,monospace;font-size:20px;font-weight:800;letter-spacing:2px;text-align:center;background:var(--orange-l);border:1.5px solid var(--orange);border-radius:12px;padding:12px;margin:10px 0;word-break:break-all}
      .cf-sheet-t{margin:4px 0 8px;font-size:19px}
      .cf-sheet-p{margin:0 0 10px;line-height:1.5}
    `;
    document.head.appendChild(st);
  }

  /* ---------- règles du site, recopiées telles quelles ---------- */
  /* Rubriques et niveaux de profil-app.html (buildPrivacyPanel) ; le serveur applique ces 4 valeurs. */
  const RUBRIQUES = [
    ['publications', 'Publications', 'Vos posts, articles, annonces'],
    ['activite', 'Fil d’activité', 'Votre activité globale sur la plateforme'],
    ['commentaires', 'Commentaires', 'Vos commentaires sur les publications'],
    ['evenements', 'Événements', 'Vos participations et créations d’événements'],
    ['accreditations', 'Accréditations', 'Vos accréditations et badges'],
    ['contacts', 'Relations', 'Vos abonnés et abonnements']
  ];
  const NIVEAUX = [['public', '🌍 Public'], ['membres', '👤 Membres'], ['relations', '🤝 Relations'], ['prive', '🔒 Privé']];
  /* assets/data.js, CONFIDENTIALITE_NIVEAUX (affiché sur confidentialite.html) */
  const NIVEAUX_DONNEES = [
    { icone: '🌍', niveau: 'Public', desc: 'Visible par l’ensemble des membres de Diaspo’Actif, y compris les visiteurs non connectés à certains contenus.', champs: ['Nom et prénom (ou pseudonyme)', 'Photo', 'Ville (optionnel)', 'Profession', 'Compétences', 'Projets', 'Publications'] },
    { icone: '🔒', niveau: 'Réseau uniquement', desc: 'Visible uniquement par les membres de votre réseau (connexions acceptées, initiatives suivies, groupes communs).', champs: ['Téléphone', 'Email', 'Documents partagés', 'Certaines informations professionnelles'] },
    { icone: '🔐', niveau: 'Confidentiel', desc: 'Accès réservé à Diaspo’Actif et aux institutions habilitées, dans un cadre strictement encadré.', champs: ['Nationalités', 'Pièces d’identité', 'Documents de vérification', 'Coordonnées administratives', 'Informations de paiement'] }
  ];
  const ROLES_INSTITUTION = ['collectivite', 'institutionnel', 'officiel'];

  /* ---------- utilitaires ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const ici = () => /^#\/confidentialite(\/|$)/.test(location.hash);
  let jeton = 0;
  const role = () => (S.me && S.me.role) || '';
  const estInitiative = () => role() === 'initiative';
  const SITE = 'confidentialite.html';

  function fmtDate(v) {
    if (!v) return '';
    const s = String(v).trim(), j = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    const d = j ? new Date(+j[1], +j[2] - 1, +j[3]) : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : s.replace(' ', 'T') + 'Z');
    return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  const norm = v => (v == null ? '' : String(v).trim());
  const normDate = v => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(norm(v)); return m ? m[1] : ''; };

  function skeleton(titre) { setPane(titre, '<div class="sk skc" style="height:80px"></div><div class="sk skc" style="height:260px"></div><div class="sk skc" style="height:120px"></div>'); }
  function erreur(titre, e, retry) {
    setPane(titre, `<div class="empty"><div class="ei">${ic('clock', 'l')}</div><b>Impossible de charger cette page</b>${esc(e && e.message ? e.message : 'Une erreur est survenue.')}<br><br><button class="btn" id="cf-retry">Réessayer</button></div>`);
    const b = $('#cf-retry'); if (b) b.onclick = retry;
  }
  async function connecte(raison) {
    if (S.me) return true;
    const ok = await A.needLogin(raison);
    if (!ok) { location.hash = '#/moi'; return false; }
    return true;
  }
  /* Session expirée en cours de route : on rouvre la connexion ; après reconnexion m.js rejoue la route. */
  async function sessionExpiree() { S.me = null; await connecte('Votre session a expiré. Reconnectez-vous.'); }

  /* Feuille de confirmation à deux boutons, renvoie une promesse (true = confirmé). */
  function confirmer(o) {
    return new Promise(resolve => {
      const close = openSheet(`<h2 class="cf-sheet-t">${esc(o.titre)}</h2><div class="cf-sheet-p">${o.texteHtml}</div>
        <button class="btn block" id="cf-cok">${esc(o.ok)}</button>
        <button class="btn out block" id="cf-cno" style="margin-top:10px">${esc(o.annuler || 'Annuler')}</button>`);
      const fin = v => { close(); resolve(v); };
      $('#cf-cok').onclick = () => fin(true);
      $('#cf-cno').onclick = () => fin(false);
      /* Fermeture par le fond de la feuille : sans cela la promesse resterait en suspens. */
      const sh = $('#sheet'); if (sh) sh.onclick = e => { if (e.target === sh) fin(false); };
    });
  }
  /* Feuille d'explication pour ce qui se fait sur la page du site. */
  function feuilleSite(titre, texteHtml, bouton) {
    const close = openSheet(`<h2 class="cf-sheet-t">${esc(titre)}</h2><div class="cf-sheet-p">${texteHtml}</div>
      <div class="cf-alert o" style="margin-bottom:12px">À finir sur la page du site : cette étape demande plus de place et de sécurité qu’un écran de téléphone.</div>
      <a class="btn block" href="${SITE}">${esc(bouton || 'Ouvrir la page sur le site')} ${ic('out', 's')}</a>
      <button class="btn out block" id="cf-sno" style="margin-top:10px">Plus tard</button>`);
    $('#cf-sno').onclick = close;
  }

  /* ---------- Code de sécurité (DS-ID) : mêmes règles que confidentialite.html (2026-10-08, demande explicite) ----------
     Mot de passe requis à chaque consultation, affichage 30 secondes puis masquage automatique, une seule consultation par heure (le délai
     est appliqué par le serveur AVANT le mot de passe : routes /api/profil/ds-id/status et /reveal). Le code n'est jamais gardé ailleurs que
     dans cette feuille et il en est effacé à la fermeture. */
  function feuilleDsId() {
    let minuteur = null;
    const close0 = openSheet('<div id="ds-zone"><div class="sk" style="height:80px"></div></div>');
    const close = () => { clearInterval(minuteur); const z = $('#ds-zone'); if (z) z.textContent = ''; close0(); };
    const sh = $('#sheet'); if (sh) sh.onclick = e => { if (e.target === sh) close(); };   /* fermeture par le fond : on efface aussi le code */
    const zone = () => $('#ds-zone');
    const entete = '<h2 class="cf-sheet-t">Code de sécurité (DS-ID)</h2>';
    const duree = s => { const tot = Math.max(1, Math.ceil(s / 60)), h = Math.floor(tot / 60), m = tot % 60; return (h > 0 ? h + ' h' : '') + (h > 0 && m > 0 ? ' ' : '') + (m > 0 || !h ? m + ' min' : ''); };
    const attente = secondes => {
      clearInterval(minuteur);
      if (!zone()) return;
      zone().innerHTML = `${entete}<div class="cf-alert o" style="margin-bottom:12px">🔒 Nouvelle consultation possible dans ${esc(duree(secondes))}.</div><p class="cf-sheet-p">Pour protéger votre signature numérique, le DS-ID ne peut être consulté qu’une seule fois par heure, même avec le mot de passe.</p><button class="btn out block" id="ds-fermer">Fermer</button>`;
      $('#ds-fermer').onclick = close;
    };
    const afficher = code => {
      clearInterval(minuteur);
      zone().innerHTML = `${entete}<div class="cf-ds-code" id="ds-code" aria-live="polite">${esc(code)}</div><p class="cf-hint" style="text-align:center">Masquage automatique dans <b id="ds-sec">30</b> s. Notez-le ou gardez cet écran ouvert : il ne s’affichera plus avant 1 heure.</p><button class="btn out block" id="ds-fermer" style="margin-top:12px">Masquer maintenant</button>`;
      $('#ds-fermer').onclick = close;
      let reste = 30;
      minuteur = setInterval(() => {
        reste--;
        if (reste <= 0) { attente(3600); return; }
        const c = $('#ds-sec'); if (c) c.textContent = reste; else clearInterval(minuteur);
      }, 1000);
    };
    const formulaire = () => {
      zone().innerHTML = `${entete}<p class="cf-sheet-p">Votre DS-ID est votre signature numérique personnelle : permanente, non modifiable, jamais visible par un administrateur. Elle sert à signer des partenariats et des <b>votes sécurisés</b>, et à autoriser un nouvel appareil.</p>
        <label class="cf-lbl" for="ds-pwd">Votre mot de passe</label>
        <div class="cf-pwd"><input class="cf-in" id="ds-pwd" type="password" autocomplete="current-password" placeholder="Mot de passe"><button type="button" id="ds-oeil" aria-label="Afficher le mot de passe">👁</button></div>
        <p class="cf-hint">Le code s’affiche 30 secondes, une seule fois par heure.</p>
        <p id="ds-err" class="small" style="color:var(--red);min-height:20px;margin:6px 2px" role="alert"></p>
        <button class="btn block" id="ds-ok">Afficher mon DS-ID</button><button class="btn out block" id="ds-non" style="margin-top:10px">Annuler</button>`;
      $('#ds-non').onclick = close;
      $('#ds-oeil').onclick = () => { const i = $('#ds-pwd'); const clair = i.type === 'password'; i.type = clair ? 'text' : 'password'; $('#ds-oeil').setAttribute('aria-label', clair ? 'Masquer le mot de passe' : 'Afficher le mot de passe'); i.focus(); };
      const valider = async () => {
        const pwd = $('#ds-pwd').value, err = $('#ds-err');
        if (!pwd) { err.textContent = 'Saisissez votre mot de passe.'; return; }
        err.textContent = ''; const b = $('#ds-ok'); b.disabled = true; b.textContent = 'Vérification…';
        try {
          const r = await api('/api/profil/ds-id/reveal', { method: 'POST', body: { password: pwd } });
          afficher(r.ds_id);
        } catch (e) {
          if (e.status === 401) { close(); await sessionExpiree(); return; }
          if (e.data && e.data.minutes_restantes !== undefined) { attente(e.data.minutes_restantes * 60); return; }   /* le délai d'1 h est écoulé ailleurs : on l'affiche comme un délai */
          err.textContent = e.message || 'Erreur de validation.'; b.disabled = false; b.textContent = 'Afficher mon DS-ID';
        }
      };
      $('#ds-ok').onclick = valider;
      $('#ds-pwd').addEventListener('keydown', e => { if (e.key === 'Enter') valider(); });
      setTimeout(() => { const i = $('#ds-pwd'); if (i) i.focus(); }, 60);
    };
    api('/api/profil/ds-id/status').then(s => { if (!zone()) return; if (s.secondes_restantes > 0) attente(s.secondes_restantes); else formulaire(); })
      .catch(e => { if (!zone()) return; if (e.status === 401) { close(); sessionExpiree(); } else formulaire(); });
  }

  /* ============================================================
     ÉCRAN PRINCIPAL
     ============================================================ */
  let priv = {};            // visibilité actuelle (objet complet du serveur, clés inconnues conservées)
  let pushEtat = 'chargement';

  async function ecranPrincipal() {
    const mon = ++jeton;
    skeleton('Confidentialité');
    if (!(await connecte('Connectez-vous pour gérer votre confidentialité.'))) return;
    let privErr = null, idStatut = null;
    const besoinIdentite = role() === 'utilisateur' || role() === 'initiative';
    const [p, id, moi] = await Promise.allSettled([
      api('/api/profil/' + encodeURIComponent(S.me.id)),
      besoinIdentite ? api('/api/identity/status') : Promise.resolve(null),
      api('/api/auth/me') // relit le réglage « raccourci », peut avoir changé depuis un autre appareil
    ]);
    if (mon !== jeton || !ici()) return;
    if (p.status === 'fulfilled') priv = Object.assign({}, (p.value.profil && p.value.profil.privacy) || {});
    else { if (p.reason && p.reason.status === 401) return sessionExpiree(); privErr = p.reason; }
    if (id.status === 'fulfilled') idStatut = id.value;
    if (moi.status === 'fulfilled' && moi.value.user && S.me) S.me.pwa_prompt_dismiss = !!moi.value.user.pwa_prompt_dismiss;

    const rub = privErr
      ? `<div class="cf-card"><div class="cf-box"><p style="margin:0 0 10px">Impossible de lire vos réglages de visibilité : ${esc(privErr.message)}</p><button class="btn out sm" data-cf="recharger">Réessayer</button></div></div>`
      : `<div class="cf-card">${RUBRIQUES.map(([k, t, d]) => `<div class="cf-sel-row"><label class="t" for="cf-p-${k}">${esc(t)}</label><span class="d" id="cf-d-${k}">${esc(d)}</span>
          <select class="cf-sel" id="cf-p-${k}" data-cf-priv="${k}" aria-describedby="cf-d-${k}">${NIVEAUX.map(([v, l]) => `<option value="${v}"${(priv[k] || 'public') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>`).join('')}
        <div class="cf-legend"><b>Public</b> : tout le monde. <b>Membres</b> : les membres connectés. <b>Relations</b> : les membres qui vous suivent. <b>Privé</b> : vous seul. Chaque changement est enregistré tout de suite.</div></div>`;

    /* Ligne « identité » : état lu sur le serveur, lancement de la vérification laissé au site. */
    const idLigne = !besoinIdentite ? '' : `<button class="cf-row" data-cf="identite"><span class="ic" style="width:38px;height:38px;border-radius:11px;background:var(--sky-l);color:var(--navy2);display:flex;align-items:center;justify-content:center;flex:none">${ic('check')}</span><span class="sp"><span class="t">${estInitiative() ? 'Identité du responsable' : 'Vérification d’identité'}</span><span class="d">${idStatut ? (idStatut.verifie ? 'Vérifiée' + (idStatut.expire_le ? ' · valable jusqu’au ' + esc(fmtDate(idStatut.expire_le)) : '') : idStatut.session_en_cours ? 'Vérification en cours de traitement' : 'Pas encore vérifiée') : 'État indisponible pour le moment'}</span></span>${idStatut && idStatut.verifie ? '<span class="badge g">Vérifiée</span>' : ''}<span class="ch" style="color:#94a3b8">${ic('chev', 's')}</span></button>`;
    const ligne = (act, icone, t, d) => `<button class="cf-row" data-cf="${act}"><span class="ic" style="width:38px;height:38px;border-radius:11px;background:var(--sky-l);color:var(--navy2);display:flex;align-items:center;justify-content:center;flex:none">${ic(icone)}</span><span class="sp"><span class="t">${esc(t)}</span><span class="d">${esc(d)}</span></span><span class="ch" style="color:#94a3b8">${ic('chev', 's')}</span></button>`;
    const pwaActive = !(S.me && S.me.pwa_prompt_dismiss);

    const html = `<div id="cf-root">
      <div class="cf-intro">Vous gardez la main sur vos données : choisissez ce que les autres voient de votre profil et gérez vos informations personnelles.</div>
      <div class="h2">QUI VOIT MON PROFIL</div>${rub}
      <div class="h2">MES INFORMATIONS</div>
      <div class="cf-card">
        ${ligne('infos', 'file', 'Informations déclarées', 'Nom, naissance, e-mail, nationalités, origines')}
        ${ROLES_INSTITUTION.includes(role()) ? ligne('origine', 'home', 'Origine officielle de l’institution', 'Pays, région, ministère de tutelle') : ''}
        ${idLigne}
        ${ligne('ds', 'lock', 'Code de sécurité (DS-ID)', 'Afficher mon code, protégé par mot de passe')}
        ${estInitiative() ? ligne('daid', 'doc', 'Identifiant public (DA-ID)', 'À imprimer ou partager : mène à votre fiche') : ''}
        ${ligne('niveaux', 'lock', 'Qui voit quoi ?', 'Public, réseau, confidentiel : les 3 niveaux')}
      </div>
      <div class="h2">NOTIFICATIONS ET RACCOURCI</div>
      <div class="cf-card">
        <button class="cf-row" role="switch" aria-checked="false" id="cf-push" data-cf="push" disabled><span class="sp"><span class="t">Notifications sur ce téléphone</span><span class="d" id="cf-push-d">Vérification en cours…</span></span><span class="cf-sw" aria-hidden="true"></span></button>
        <button class="cf-row" role="switch" aria-checked="${pwaActive}" id="cf-pwa" data-cf="pwa"><span class="sp"><span class="t">Proposer le raccourci sur l’écran d’accueil</span><span class="d">Diaspo’Actif peut vous proposer, de temps en temps, d’ajouter un raccourci. Réglage lié à votre compte, valable sur tous vos appareils.</span></span><span class="cf-sw" aria-hidden="true"></span></button>
      </div>
      <div class="h2">À FINIR SUR LE SITE</div>
      <div class="cf-card">
        ${estInitiative() || role() === 'collectivite' ? ligne('gestionnaire', 'swap', 'Changer de gestionnaire du compte', 'Transférer la gestion à une autre personne') : ''}
        ${ligne('masquer', 'close', 'Masquer mon compte', 'Rendre votre profil invisible')}
      </div>
      <div class="cf-card"><a class="cf-row" href="politique-confidentialite.html"><span class="sp"><span class="t">Politique de confidentialité</span><span class="d">Comment vos données sont traitées</span></span><span class="ch" style="color:#94a3b8">${ic('out', 's')}</span></a></div>
    </div>`;
    setPane('Confidentialité', html);
    brancherPrincipal();
    detecterPush();
  }

  function brancherPrincipal() {
    const root = $('#cf-root'); if (!root) return;
    root.addEventListener('change', ev => {
      const sel = ev.target.closest && ev.target.closest('[data-cf-priv]');
      if (sel) enregistrerVisibilite(sel);
    });
    root.addEventListener('click', ev => {
      const b = ev.target.closest && ev.target.closest('[data-cf]'); if (!b || b.disabled) return;
      switch (b.dataset.cf) {
        case 'recharger': ecranPrincipal(); break;
        case 'infos': location.hash = '#/confidentialite/infos'; break;
        case 'origine': location.hash = '#/confidentialite/origine'; break;
        case 'niveaux': location.hash = '#/confidentialite/niveaux'; break;
        case 'identite': feuilleIdentite(); break;
        case 'daid': feuilleDaId(); break;
        case 'push': basculerPush(b); break;
        case 'pwa': basculerPwa(b); break;
        case 'ds': feuilleDsId(); break;
        case 'gestionnaire': feuilleSite('Changer de gestionnaire du compte', `<p class="cf-sheet-p">Cette procédure transfère <b>définitivement</b> la gestion du compte à une autre personne : l’ancien gestionnaire est révoqué et un nouveau code confidentiel est généré.</p><p class="cf-sheet-p">Elle se déroule en plusieurs étapes verrouillées (codes reçus par e-mail, vérification d’identité, validation finale) avec un nombre de tentatives limité chaque mois.</p>`, 'Démarrer la procédure sur le site'); break;
        case 'masquer': feuilleSite('Masquer mon compte', `<p class="cf-sheet-p">Masquer votre compte rend votre profil public invisible aux autres utilisateurs. Vos données restent intactes : reconnectez-vous à tout moment pour le réafficher.</p><p class="cf-sheet-p">Par sécurité, cette action demande de confirmer avec votre mot de passe.</p>`, 'Masquer mon compte sur le site'); break;
      }
    });
  }

  /* ---------- visibilité du profil : enregistrement immédiat ---------- */
  async function enregistrerVisibilite(sel) {
    const cle = sel.dataset.cfPriv, avant = priv[cle] || 'public', valeur = sel.value;
    if (valeur === avant) return;
    sel.disabled = true;
    /* On renvoie l'objet complet du serveur + la seule rubrique modifiée : les autres clés restent intactes. */
    const nouveau = Object.assign({}, priv, { [cle]: valeur });
    try {
      const r = await api('/api/profil', { method: 'PUT', body: { privacy: nouveau } });
      priv = Object.assign({}, (r.profil && r.profil.privacy) || nouveau);
      const nom = (RUBRIQUES.find(x => x[0] === cle) || [])[1] || 'Rubrique';
      const lib = (NIVEAUX.find(x => x[0] === valeur) || [])[1] || valeur;
      toast(nom + ' : ' + lib.replace(/^\S+\s/, '') + ' ✓');
    } catch (e) {
      sel.value = avant; // l'affichage doit refléter ce qui est réellement enregistré
      if (e.status === 401) await sessionExpiree(); else toast('Réglage non enregistré. ' + e.message, true);
    }
    sel.disabled = false;
  }

  /* ---------- raccourci sur l'écran d'accueil (réglage de compte) ---------- */
  async function basculerPwa(b) {
    const actif = b.getAttribute('aria-checked') === 'true';
    b.disabled = true;
    try {
      /* actif = la proposition est faite = dismiss:false. */
      await api('/api/auth/pwa-prompt-preference', { method: 'PATCH', body: { dismiss: actif } });
      if (S.me) S.me.pwa_prompt_dismiss = actif;
      b.setAttribute('aria-checked', String(!actif));
      toast(actif ? 'Le raccourci ne vous sera plus proposé ✓' : 'Le raccourci pourra vous être proposé ✓');
    } catch (e) { toast('Réglage non enregistré. ' + e.message, true); }
    b.disabled = false;
  }

  /* ---------- notifications push (liées à CET appareil, contrairement au raccourci) ---------- */
  const pushPossible = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const delai = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));
  const u8 = b64 => { const pad = '='.repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
  function peindrePush(etat, detail) {
    pushEtat = etat;
    const b = $('#cf-push'), d = $('#cf-push-d'); if (!b || !d) return;
    const textes = {
      actif: 'Activées : vous serez prévenu d’un message, d’une réponse ou d’une invitation.',
      inactif: 'Désactivées sur ce téléphone. Activez-les pour être prévenu dès qu’il se passe quelque chose sur votre compte.',
      refuse: 'Bloquées pour ce site dans les réglages de votre navigateur. Autorisez-les là-bas pour les activer ici.',
      indispo: 'Ce navigateur ne les propose pas. Sur iPhone, ajoutez d’abord Diaspo’Actif à votre écran d’accueil : Apple l’exige avant d’autoriser les notifications.',
      chargement: 'Vérification en cours…'
    };
    d.textContent = detail || textes[etat] || '';
    b.setAttribute('aria-checked', String(etat === 'actif'));
    b.disabled = !(etat === 'actif' || etat === 'inactif');
  }
  async function detecterPush() {
    if (!pushPossible()) return peindrePush('indispo');
    if (Notification.permission === 'denied') return peindrePush('refuse');
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (ici()) peindrePush(sub ? 'actif' : 'inactif');
    } catch (e) { if (ici()) peindrePush('indispo', 'Notifications indisponibles sur cet appareil.'); }
  }
  async function basculerPush(b) {
    if (pushEtat === 'actif') {
      b.disabled = true;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) { await api('/api/push/unsubscribe', { method: 'POST', body: { endpoint: sub.endpoint } }); await sub.unsubscribe(); }
        peindrePush('inactif'); toast('Notifications désactivées sur ce téléphone ✓');
      } catch (e) { peindrePush('actif'); toast('Impossible de désactiver. ' + e.message, true); }
      return;
    }
    b.disabled = true;
    try {
      if (Notification.permission === 'denied') return peindrePush('refuse');
      /* La clé d'abord : si les notifications ne sont pas configurées côté serveur, on ne demande pas l'autorisation pour rien. */
      const { publicKey } = await api('/api/push/vapid-public-key');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { peindrePush(permission === 'denied' ? 'refuse' : 'inactif'); toast('Autorisation refusée : vous pourrez réessayer plus tard.', true); return; }
      /* La page téléphone n'enregistre pas le service worker du site toute seule : on le fait ici, à la demande. */
      let reg = await navigator.serviceWorker.getRegistration();
      if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
      reg = await Promise.race([navigator.serviceWorker.ready, delai(10000, 'Le service de notifications met trop de temps à démarrer.')]);
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(publicKey) });
      await api('/api/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
      peindrePush('actif'); toast('Notifications activées sur ce téléphone ✓');
    } catch (e) { peindrePush('inactif'); toast('Impossible d’activer les notifications. ' + e.message, true); }
  }

  /* ---------- identité (lecture seule) et identifiant public ---------- */
  async function feuilleIdentite() {
    const ini = estInitiative();
    let r;
    try { r = await api('/api/identity/status'); } catch (e) { return toast('État de la vérification indisponible. ' + e.message, true); }
    if (r.verifie) {
      const close = openSheet(`<h2 class="cf-sheet-t">${ini ? 'Responsable identifié' : 'Identité vérifiée'}</h2>
        <div class="cf-alert g">${ini ? 'Identité du responsable vérifiée' : 'Identité vérifiée'}${r.verifie_le ? ' le ' + esc(fmtDate(r.verifie_le)) : ''}${r.expire_le ? ', valable jusqu’au ' + esc(fmtDate(r.expire_le)) : ''}.</div>
        <p class="cf-sheet-p">Aucun document personnel n’est affiché publiquement : seul ce badge est visible des autres utilisateurs.${ini ? ' Il ne remplace pas « Organisation testée avec Stripe », qui porte sur la structure elle-même.' : ''}</p>
        ${r.mismatch ? '<div class="cf-alert o"><b>Origine à confirmer.</b> Le pays associé à votre pièce d’identité ne correspond pas à la nationalité déclarée sur votre profil. Vérifiez vos informations déclarées.</div>' : ''}
        <p class="cf-sheet-p muted small">Modifier une information déclarée (nom, naissance, nationalité, origine) retire ce badge.</p>
        <button class="btn out block" id="cf-ino">Fermer</button>`);
      $('#cf-ino').onclick = close; return;
    }
    feuilleSite(ini ? 'Vérifier l’identité du responsable' : 'Vérifier mon identité',
      r.session_en_cours
        ? `<p class="cf-sheet-p">Une vérification est en cours de traitement chez Stripe. Cela peut prendre quelques minutes après l’envoi de vos documents. Vous pouvez aussi la reprendre ou la recommencer sur la page du site.</p>`
        : `<p class="cf-sheet-p">Pièce d’identité et selfie permettent d’obtenir le badge <b>${ini ? 'Responsable identifié' : 'Identité vérifiée'}</b>, valable 24 mois. Aucun document n’est conservé par Diaspo’Actif : la vérification est effectuée et hébergée par Stripe Identity.${ini ? ' Elle porte sur vous, pas sur votre organisation.' : ''}</p>`,
      r.session_en_cours ? 'Reprendre sur le site' : 'Lancer la vérification sur le site');
  }

  async function feuilleDaId() {
    let ini;
    try { ini = (await api('/api/dashboard/initiative')).initiative; } catch (e) { return toast('Identifiant indisponible. ' + e.message, true); }
    if (!ini || !ini.da_id) {
      const close = openSheet(`<h2 class="cf-sheet-t">Identifiant public</h2><p class="cf-sheet-p">Votre identifiant public n’est pas encore disponible. Réessayez plus tard.</p><button class="btn out block" id="cf-dno">Fermer</button>`);
      $('#cf-dno').onclick = close; return;
    }
    const close = openSheet(`<h2 class="cf-sheet-t">Identifiant public (DA-ID)</h2>
      <p class="cf-sheet-p">Votre identifiant numérique officiel. Imprimez-le sur vos cartes, affiches ou supports : il mène à votre fiche publique.</p>
      <div class="cf-mono" id="cf-daid">${esc(ini.da_id)}</div>
      <div class="row" style="gap:10px"><button class="btn out sp" id="cf-dcopy">Copier</button><button class="btn out sp" id="cf-dshare">Partager</button></div>
      <a class="btn block" style="margin-top:10px" href="#/profil/i/${encodeURIComponent(ini.id)}">Voir mon profil public</a>
      <button class="btn out block" id="cf-dno" style="margin-top:10px">Fermer</button>`);
    const url = location.origin + '/initiative.html?id=' + encodeURIComponent(ini.id);
    $('#cf-dno').onclick = close;
    $('#cf-dcopy').onclick = async () => { try { await navigator.clipboard.writeText(ini.da_id); toast('Identifiant copié ✓'); } catch (e) { toast('Copie impossible : recopiez l’identifiant à la main.', true); } };
    $('#cf-dshare').onclick = async () => {
      try {
        if (navigator.share) await navigator.share({ title: 'Mon identifiant Diaspo’Actif', text: 'Retrouvez-moi sur Diaspo’Actif avec l’identifiant ' + ini.da_id, url });
        else { await navigator.clipboard.writeText(ini.da_id); toast('Identifiant copié ✓'); }
      } catch (e) { /* partage annulé */ }
    };
  }

  /* ============================================================
     INFORMATIONS DÉCLARÉES
     ============================================================ */
  let infOrig = null;
  const CHAMPS = [
    // [clé API, id du champ, libellé, type, autocomplete]
    ['nom', 'cf-nom', 'Nom', 'text', 'family-name'],
    ['prenom', 'cf-prenom', 'Prénom', 'text', 'given-name'],
    ['date_naissance', 'cf-naissance', 'Date de naissance', 'date', 'bday'],
    ['email', 'cf-email', 'Adresse e-mail', 'email', 'email'],
    ['nationalite1', 'cf-nat1', 'Nationalité 1', 'text', 'off'],
    ['nationalite2', 'cf-nat2', 'Nationalité 2 (facultatif)', 'text', 'off'],
    ['origine1', 'cf-orig1', 'Origine 1', 'text', 'off'],
    ['origine2', 'cf-orig2', 'Origine 2 (facultatif)', 'text', 'off']
  ];

  async function ecranInfos() {
    const mon = ++jeton;
    skeleton('Informations déclarées');
    if (!(await connecte('Connectez-vous pour gérer vos informations.'))) return;
    let inf;
    try { inf = (await api('/api/profil/informations-declarees')).informations || {}; }
    catch (e) { if (mon !== jeton || !ici()) return; if (e.status === 401) return sessionExpiree(); return erreur('Informations déclarées', e, ecranInfos); }
    if (mon !== jeton || !ici()) return;
    infOrig = inf;
    const verifiee = !!inf.identite_verifiee;
    const html = `<div id="cf-root">
      <p class="muted" style="margin:2px 4px 12px;line-height:1.5">Ces informations servent à vérifier votre identité.${role() !== 'utilisateur' ? ' Elles concernent la personne responsable du compte, pas la structure.' : ''}</p>
      ${verifiee ? '<div class="cf-alert o"><b>Votre identité est actuellement vérifiée.</b> Modifier une information ci-dessous retirera ce badge : une nouvelle vérification sera nécessaire.</div>' : '<div class="cf-alert o">Toute modification invalidera un badge d’identité déjà vérifié et nécessitera une nouvelle vérification.</div>'}
      <form id="cf-form" novalidate class="cf-card cf-box" autocomplete="on">
        ${CHAMPS.map(([k, id, lib, type, ac]) => `<label class="cf-lbl" for="${id}">${esc(lib)}</label><input class="cf-in" id="${id}" name="${k}" type="${type}" autocomplete="${ac}" maxlength="${type === 'date' ? 10 : 120}"${type === 'email' ? ' inputmode="email" autocapitalize="off"' : ''} value="${esc(k === 'date_naissance' ? normDate(inf[k]) : norm(inf[k]))}">`).join('')}
        <p class="cf-err" id="cf-err" role="alert"></p>
      </form></div>`;
    setPane('Informations déclarées', html, `<button class="btn block" id="cf-save">Enregistrer</button>`);
    $('#cf-save').onclick = enregistrerInfos;
    const f = $('#cf-form'); if (f) f.onsubmit = ev => { ev.preventDefault(); enregistrerInfos(); };
  }

  async function enregistrerInfos() {
    const btn = $('#cf-save'), err = $('#cf-err'); if (!btn || !err || !infOrig) return;
    err.textContent = '';
    const corps = {}, vals = {};
    CHAMPS.forEach(([k, id]) => {
      const v = norm(($('#' + id) || {}).value);
      vals[k] = v;
      const avant = k === 'date_naissance' ? normDate(infOrig[k]) : norm(infOrig[k]);
      if (v !== avant) corps[k] = (k === 'date_naissance' && !v) ? null : v; // le site envoie null pour une date vidée
    });
    if (!Object.keys(corps).length) { toast('Aucune modification à enregistrer.'); return; }
    if ('nom' in corps && !corps.nom) { err.textContent = 'Le nom ne peut pas être vide.'; return; }
    if ('email' in corps && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corps.email)) { err.textContent = 'Cette adresse e-mail n’est pas valide. Vérifiez-la (exemple : nom@exemple.com).'; return; }
    /* Les deux conséquences du serveur, annoncées avant d'écrire. */
    const prevenirIdentite = !!infOrig.identite_verifiee, prevenirEmail = 'email' in corps;
    if (prevenirIdentite || prevenirEmail) {
      const txt = (prevenirIdentite ? '<p class="cf-sheet-p">Votre badge d’identité vérifiée sera <b>retiré</b> : vous devrez refaire la vérification.</p>' : '')
        + (prevenirEmail ? '<p class="cf-sheet-p">Un e-mail de confirmation sera envoyé à la nouvelle adresse, qui devra être revérifiée.</p>' : '');
      const ok = await confirmer({ titre: 'Enregistrer ces modifications ?', texteHtml: txt, ok: 'Enregistrer', annuler: 'Revenir au formulaire' });
      if (!ok) return;
    }
    btn.disabled = true; btn.textContent = 'Enregistrement…';
    try {
      const r = await api('/api/profil/informations-declarees', { method: 'PUT', body: corps });
      let msg = 'Informations enregistrées ✓';
      if (r.identite_a_revalider) msg += ' Badge d’identité retiré : à refaire.';
      if (r.email_a_reverifier) { msg += ' E-mail de confirmation envoyé.'; if (S.me) S.me.email = corps.email; }
      toast(msg);
      ecranInfos(); // relit l'état réel (badge, e-mail vérifié)
    } catch (e) {
      if (e.status === 401) { btn.disabled = false; btn.textContent = 'Enregistrer'; return sessionExpiree(); }
      err.textContent = (e.message || 'Enregistrement impossible.') + ' Vos modifications sont encore à l’écran : corrigez puis réessayez.';
      btn.disabled = false; btn.textContent = 'Enregistrer';
    }
  }

  /* ============================================================
     ORIGINE OFFICIELLE DE L'INSTITUTION (collectivité, institution, officiel)
     ============================================================ */
  async function ecranOrigine() {
    const mon = ++jeton;
    skeleton('Origine de l’institution');
    if (!(await connecte('Connectez-vous pour gérer votre institution.'))) return;
    if (!ROLES_INSTITUTION.includes(role())) {
      return setPane('Origine de l’institution', `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Réservé aux institutions</b>Ce réglage concerne les comptes collectivité, institution et officiel.<br><br><a class="btn" href="#/confidentialite">Retour</a></div>`);
    }
    let inf;
    try { inf = (await api('/api/profil/informations-declarees')).informations || {}; }
    catch (e) { if (mon !== jeton || !ici()) return; if (e.status === 401) return sessionExpiree(); return erreur('Origine de l’institution', e, ecranOrigine); }
    if (mon !== jeton || !ici()) return;
    const champs = [
      ['pays', 'cf-oi-pays', 'Pays d’origine *', inf.pays_origine_institution, 'Côte d’Ivoire'],
      ['region', 'cf-oi-region', 'Région d’origine', inf.region_origine, 'Facultatif'],
      ['min', 'cf-oi-min', 'Ministère de tutelle', inf.ministere_tutelle, 'Facultatif'],
      ['adm', 'cf-oi-adm', 'Administration de rattachement', inf.administration_rattachement, 'Facultatif']
    ];
    const html = `<div id="cf-root"><p class="muted" style="margin:2px 4px 12px;line-height:1.5">Le pays auquel votre institution est rattachée. Il apparaît dans l’annuaire et sert aux statistiques territoriales ; sans lien avec la vérification d’identité.</p>
      <form id="cf-form" novalidate class="cf-card cf-box">
        ${champs.map(([k, id, lib, v, ph]) => `<label class="cf-lbl" for="${id}">${esc(lib)}</label><input class="cf-in" id="${id}" type="text" maxlength="120" placeholder="${esc(ph)}" value="${esc(norm(v))}">`).join('')}
        <p class="cf-err" id="cf-err" role="alert"></p></form></div>`;
    setPane('Origine de l’institution', html, `<button class="btn block" id="cf-save">Enregistrer</button>`);
    const sauver = async () => {
      const btn = $('#cf-save'), err = $('#cf-err'); err.textContent = '';
      const pays = norm($('#cf-oi-pays').value);
      if (!pays) { err.textContent = 'Le pays d’origine est obligatoire.'; return; }
      btn.disabled = true; btn.textContent = 'Enregistrement…';
      try {
        await api('/api/profil/origine-institution', { method: 'PUT', body: {
          pays_origine_institution: pays, region_origine: norm($('#cf-oi-region').value),
          ministere_tutelle: norm($('#cf-oi-min').value), administration_rattachement: norm($('#cf-oi-adm').value) } });
        toast('Origine enregistrée ✓');
      } catch (e) {
        if (e.status === 401) { btn.disabled = false; btn.textContent = 'Enregistrer'; return sessionExpiree(); }
        err.textContent = (e.message || 'Enregistrement impossible.') + ' Réessayez.';
      }
      btn.disabled = false; btn.textContent = 'Enregistrer';
    };
    $('#cf-save').onclick = sauver;
    const f = $('#cf-form'); if (f) f.onsubmit = ev => { ev.preventDefault(); sauver(); };
  }

  /* ============================================================
     QUI VOIT QUOI (texte de référence, aucune donnée personnelle)
     ============================================================ */
  function ecranNiveaux() {
    jeton++;
    setPane('Qui voit quoi ?', `<p class="muted" style="margin:2px 4px 12px;line-height:1.5">Dans Diaspo’Actif, les informations que vous partagez sont classées en trois niveaux de visibilité.</p>
      ${NIVEAUX_DONNEES.map(n => `<div class="cf-lvl"><h3><span aria-hidden="true">${n.icone}</span> ${esc(n.niveau)}</h3><p>${esc(n.desc)}</p><ul>${n.champs.map(c => `<li>${esc(c)}</li>`).join('')}</ul></div>`).join('')}
      <div class="cf-alert g">Les données « Confidentiel » (nationalités, pièces d’identité, documents de vérification, coordonnées administratives, informations de paiement) ne sont accessibles qu’à Diaspo’Actif et aux institutions habilitées, dans un cadre strictement encadré.</div>
      <a class="btn out block" href="#/confidentialite">Retour aux réglages</a>`);
  }

  window.MMods.confidentialite = function (b) {
    if (b === 'infos') return ecranInfos();
    if (b === 'origine') return ecranOrigine();
    if (b === 'niveaux') return ecranNiveaux();
    return ecranPrincipal();
  };
})();

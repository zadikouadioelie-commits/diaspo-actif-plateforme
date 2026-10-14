/* ============================================================
   Diaspo'Actif — La cloche des événements (2026-10-13, demande explicite)
   « Dans le bouton Événements, une cloche : on choisit les événements pour lesquels on veut être informé — par exemple tous les
   événements économiques de ma région — et dès qu'ils sont publiés, une notification arrive, même téléphone verrouillé. »

   Fenêtre autonome (site ET téléphone : feuille qui monte du bas sur petit écran), au design « Nuit dorée ».
   API : window.AlertesEvt = { ouvrir({ connexion }), compter(cb) }
     ouvrir()   — ouvre la fenêtre ; si le compte n'est pas connecté, appelle options.connexion() (téléphone) ou propose le lien de connexion.
     compter(cb) — rappelle cb(nombre d'alertes actives) ; sert au petit badge de la cloche.
   Serveur : GET/POST /api/evenement-alertes · PATCH/DELETE /api/evenement-alertes/:id (voir server/index.js)
             GET /api/push/vapid-public-key · POST /api/push/subscribe (activation des notifications sur l'appareil)
   ============================================================ */
(function () {
  'use strict';
  if (window.AlertesEvt) return;

  var DOMAINES = [['Entrepreneuriat', 'Entrepreneuriat'], ['Formation', 'Formation'], ['Culture', 'Culture'], ['Sante', 'Santé'], ['Agriculture', 'Agriculture'], ['Technologie', 'Technologie'], ['Sport', 'Sport'], ['Action Sociale', 'Action sociale'], ['Business', 'Business'], ['Diaspora', 'Diaspora'], ['Gastronomie', 'Gastronomie'], ['Economique', 'Économique'], ['Politique', 'Politique'], ['Panafricanisme', 'Panafricanisme'], ['Autre', 'Autre']];
  var FORMES = [['evenement', 'Événement'], ['forum', 'Forum'], ['atelier', 'Atelier'], ['webinaire', 'Webinaire'], ['conference', 'Conférence'], ['gala', 'Gala'], ['marche', 'Marché / Foire'], ['networking', 'Networking'], ['debat', 'Débat'], ['concours', 'Concours'], ['trophee_diaspora', 'Trophée diaspora'], ['autre', 'Autre']];
  var PARTS = [['1', 'Gratuits'], ['partiel', 'Partiellement payants'], ['0', 'Payants']];
  var ETAT = { alertes: [], profil: {}, max: 10, connecte: false };

  var BELL = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2.2 2.2 0 0 0 4 0"/></svg>';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var lib = function (liste, v) { for (var i = 0; i < liste.length; i++) if (liste[i][0] === v) return liste[i][1]; return v; };

  async function api(methode, chemin, corps) {
    var init = { method: methode, credentials: 'same-origin', headers: {} };
    if (corps !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(corps); }
    var r = await fetch(chemin, init), j = null;
    try { j = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok) { var er = new Error((j && (j.error || j.message)) || 'Une erreur est survenue.'); er.status = r.status; er.data = j; throw er; }
    return j || {};
  }

  function css() {
    if (document.getElementById('alertes-evt-css')) return;
    var s = document.createElement('style'); s.id = 'alertes-evt-css';
    s.textContent = [
      '.ae-fond{position:fixed;inset:0;z-index:100000;background:rgba(3,6,14,.72);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;animation:aeFond .25s ease}',
      '@keyframes aeFond{from{opacity:0}to{opacity:1}}',
      '@keyframes aeMonte{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}',
      '.ae-fen{position:relative;width:min(560px,100%);max-height:calc(100vh - 40px);overflow:auto;border-radius:26px;border:1px solid rgba(227,192,110,.4);color:#E8ECF6;font-family:inherit;box-shadow:0 40px 80px -30px #000;animation:aeMonte .3s ease;',
      'background:radial-gradient(420px 220px at 100% 0%,rgba(227,192,110,.18),transparent 66%),linear-gradient(160deg,#14234a 0%,#0B1226 62%);scrollbar-width:thin;scrollbar-color:rgba(227,192,110,.4) transparent}',
      '.ae-tete{display:flex;align-items:center;gap:14px;padding:22px 22px 6px}',
      '.ae-ic{flex:none;width:50px;height:50px;border-radius:16px;display:grid;place-items:center;color:#E3C06E;background:rgba(227,192,110,.12);border:1px solid rgba(227,192,110,.45)}',
      '.ae-ic svg{width:26px;height:26px}',
      '.ae-tete h2{margin:0;flex:1;font-family:"Bodoni Moda","Didot",Georgia,serif;font-weight:500;font-size:25px;line-height:1.15;color:#fff}',
      '.ae-x{flex:none;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;font-size:18px;cursor:pointer}',
      '.ae-corps{padding:6px 22px 24px;display:flex;flex-direction:column;gap:16px}',
      '.ae-intro{margin:0;font-size:14.5px;line-height:1.55;color:#C7D4E8}',
      '.ae-push{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);font-size:13.5px;line-height:1.45;color:#C7D4E8}',
      '.ae-push b{color:#fff}',
      '.ae-push.ok{border-color:rgba(123,232,123,.4)}',
      '.ae-push button{margin-left:auto}',
      '.ae-bout{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 20px;border-radius:999px;border:0;font:inherit;font-size:14.5px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#F3DC9A,#B9893A);color:#1a1202}',
      '.ae-bout:disabled{opacity:.6;cursor:default}',
      '.ae-bout.sec{background:transparent;border:1px solid rgba(227,192,110,.6);color:#E3C06E}',
      '.ae-titre-sec{margin:4px 0 0;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#E3C06E}',
      '.ae-liste{display:flex;flex-direction:column;gap:10px}',
      '.ae-carte{display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:18px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}',
      '.ae-carte.off{opacity:.55}',
      '.ae-carte .tx{flex:1;min-width:0;font-size:14.5px;font-weight:700;line-height:1.35;color:#fff}',
      '.ae-carte .tx small{display:block;margin-top:2px;font-size:12.5px;font-weight:500;color:#A9B4CC}',
      '.ae-inter{flex:none;position:relative;width:50px;height:30px;border-radius:999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);cursor:pointer;padding:0;transition:background .2s}',
      '.ae-inter:after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s}',
      '.ae-inter[aria-checked="true"]{background:#E3C06E;border-color:#E3C06E}',
      '.ae-inter[aria-checked="true"]:after{transform:translateX(20px);background:#1a1202}',
      '.ae-sup{flex:none;width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:transparent;color:#A9B4CC;cursor:pointer;display:grid;place-items:center}',
      '.ae-sup svg{width:18px;height:18px}',
      '.ae-vide{padding:16px;border-radius:18px;border:1px dashed rgba(227,192,110,.4);font-size:14px;line-height:1.5;color:#C7D4E8;text-align:center}',
      '.ae-form{display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:20px;background:rgba(255,255,255,.045);border:1px solid rgba(227,192,110,.28)}',
      '.ae-fen .ae-form label{display:flex;flex-direction:column;gap:6px;font-size:12.5px;font-weight:700;letter-spacing:.04em;color:#A9B4CC!important;margin:0}',
      '.ae-fen .ae-form select{height:48px;width:100%;box-sizing:border-box;border-radius:14px;border:1px solid rgba(255,255,255,.16)!important;background:#0f1a38!important;color:#fff!important;font:inherit;font-size:15px;padding:0 12px;color-scheme:dark}',
      '.ae-fen .ae-form select option{background:#0f1a38;color:#fff}',
      '.ae-form select:focus-visible,.ae-bout:focus-visible,.ae-x:focus-visible,.ae-sup:focus-visible,.ae-inter:focus-visible{outline:3px solid #E3C06E;outline-offset:2px}',
      '.ae-fen .ae-form label.ae-case{flex-direction:row;align-items:center;gap:10px;font-size:14px;font-weight:600;letter-spacing:0;color:#E8ECF6!important}',
      '.ae-fen .ae-case input{width:22px;height:22px;accent-color:#E3C06E;margin:0}',
      '.ae-err{padding:12px 14px;border-radius:14px;background:rgba(255,120,120,.12);border:1px solid rgba(255,120,120,.4);font-size:13.5px;line-height:1.45;color:#FFD3D3}',
      '.ae-err a{color:#E3C06E;font-weight:800}',
      '.ae-cloche{position:relative;flex:none;width:48px;height:48px;border-radius:50%;display:inline-grid;place-items:center;padding:0;cursor:pointer;color:#E3C06E;border:1px solid rgba(227,192,110,.6);background:linear-gradient(145deg,#14234a,#0B1226);box-shadow:0 10px 22px -12px rgba(11,18,38,.9);transition:transform .2s}',
      '.ae-cloche:hover{transform:translateY(-2px)}.ae-cloche:active{transform:scale(.96)}',
      '.ae-cloche:focus-visible{outline:3px solid #E3C06E;outline-offset:2px}',
      '.ae-cloche svg{width:24px;height:24px}',
      '.ae-cloche .ae-badge{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#E3C06E;color:#1a1202;font:800 11.5px/20px inherit;text-align:center;box-shadow:0 0 0 2px #0B1226}',
      '.ae-cloche .ae-badge[hidden]{display:none}',
      '@media (max-width:640px){.ae-fond{align-items:flex-end;padding:0}.ae-fen{width:100%;max-height:92vh;border-radius:26px 26px 0 0}.ae-tete h2{font-size:23px}}',
      '@media (prefers-reduced-motion:reduce){.ae-fond,.ae-fen{animation:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  function resume(a) {
    var parts = [];
    parts.push(a.domaine ? lib(DOMAINES, a.domaine) : 'Tous les domaines');
    if (a.type_evt) parts.push(lib(FORMES, a.type_evt));
    if (a.part) parts.push(lib(PARTS, a.part).toLowerCase());
    var z = a.zone === 'ville' ? 'dans ma ville' : a.zone === 'region' ? 'dans ma région' : a.zone === 'pays' ? 'dans mon pays' : 'partout dans le monde';
    return { titre: parts.join(' · '), zone: z + (a.zone !== 'monde' && a.en_ligne ? ' · en ligne inclus' : '') };
  }

  function etatPush() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { k: 'non', html: '<span>Sur iPhone, ajoutez d’abord Diaspo’Actif à l’écran d’accueil pour recevoir les notifications sur l’écran verrouillé.</span>' };
    }
    if (Notification.permission === 'granted') return { k: 'ok', html: '<span><b>Notifications activées</b> sur cet appareil : vous serez prévenu même téléphone verrouillé.</span>' };
    if (Notification.permission === 'denied') return { k: 'non', html: '<span><b>Notifications bloquées</b> par ce navigateur. Autorisez-les dans ses réglages pour recevoir les alertes sur l’écran verrouillé ; elles restent visibles dans la cloche de l’application.</span>' };
    return { k: 'a', html: '<span><b>Pour être prévenu sur l’écran du téléphone</b>, activez les notifications sur cet appareil.</span><button type="button" class="ae-bout" data-a="push">Activer</button>' };
  }
  function u8(b64) { var p = '='.repeat((4 - b64.length % 4) % 4), b = (b64 + p).replace(/-/g, '+').replace(/_/g, '/'), r = atob(b), o = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) o[i] = r.charCodeAt(i); return o; }
  async function activerPush() {
    var cle = await api('GET', '/api/push/vapid-public-key');
    var perm = await Notification.requestPermission();
    if (perm !== 'granted') return perm;
    var reg = await navigator.serviceWorker.getRegistration();
    if (!reg) reg = await navigator.serviceWorker.register('/sw.js');
    reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: u8(cle.publicKey) });
    await api('POST', '/api/push/subscribe', { subscription: sub.toJSON() });
    try { localStorage.removeItem('da_notif_off'); } catch (e) { /* sans conséquence */ }
    return perm;
  }

  async function charger() {
    var r = await api('GET', '/api/evenement-alertes');
    ETAT.alertes = r.alertes || []; ETAT.profil = r.profil || {}; ETAT.max = r.max || 10; ETAT.connecte = true;
    signaler();
  }
  var ecouteurs = [];
  function signaler() { var n = ETAT.alertes.filter(function (a) { return a.actif; }).length; ecouteurs.forEach(function (f) { try { f(n); } catch (e) { /* ignoré */ } }); }
  function compter(cb) {
    ecouteurs.push(cb);
    api('GET', '/api/evenement-alertes').then(function (r) { ETAT.alertes = r.alertes || []; ETAT.connecte = true; signaler(); }).catch(function () { cb(0); });
  }

  var racine = null, precedent = null;
  function fermer() {
    if (!racine) return;
    racine.remove(); racine = null;
    document.removeEventListener('keydown', touche, true);
    document.body.style.overflow = document.body.dataset.aeOv || '';
    if (precedent && precedent.focus) precedent.focus();
  }
  function touche(e) { if (e.key === 'Escape') { e.stopPropagation(); fermer(); } }

  function optionsZone() {
    var p = ETAT.profil || {};
    return [['monde', 'Partout dans le monde'], ['pays', 'Mon pays' + (p.pays ? ' (' + p.pays + ')' : '')], ['region', 'Ma région' + (p.region ? ' (' + p.region + ')' : '')], ['ville', 'Ma ville' + (p.ville ? ' (' + p.ville + ')' : '')]];
  }
  function peindre(msg) {
    if (!racine) return;
    var push = etatPush();
    var liste = ETAT.alertes.length
      ? ETAT.alertes.map(function (a) {
        var r = resume(a);
        return '<div class="ae-carte' + (a.actif ? '' : ' off') + '" data-id="' + a.id + '"><div class="tx">' + esc(r.titre) + '<small>' + esc(r.zone) + '</small></div>'
          + '<button type="button" class="ae-inter" role="switch" aria-checked="' + (a.actif ? 'true' : 'false') + '" aria-label="' + (a.actif ? 'Mettre cette alerte en pause' : 'Réactiver cette alerte') + '" data-a="bascule" data-id="' + a.id + '"></button>'
          + '<button type="button" class="ae-sup" aria-label="Supprimer cette alerte" data-a="supprime" data-id="' + a.id + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6"/></svg></button></div>';
      }).join('')
      : '<div class="ae-vide">Aucune alerte pour le moment. Créez-en une ci-dessous : par exemple « Économique, dans ma région ».</div>';
    var plein = ETAT.alertes.length >= ETAT.max;
    racine.querySelector('.ae-corps').innerHTML =
      '<p class="ae-intro">Dites-nous ce qui vous intéresse. Dès qu’un événement correspondant est publié, vous êtes prévenu tout de suite — sur l’écran de votre téléphone, même verrouillé, et dans la cloche de l’application.</p>'
      + '<div class="ae-push ' + push.k + '">' + push.html + '</div>'
      + (msg ? '<div class="ae-err" role="alert">' + msg + '</div>' : '')
      + '<h3 class="ae-titre-sec">Mes alertes</h3><div class="ae-liste">' + liste + '</div>'
      + (plein ? '<div class="ae-vide">Vous avez atteint ' + ETAT.max + ' alertes. Supprimez-en une pour en créer une autre.</div>'
        : '<h3 class="ae-titre-sec">Nouvelle alerte</h3><form class="ae-form" id="ae-form" novalidate>'
        + '<label>Domaine<select name="domaine"><option value="">Tous les domaines</option>' + DOMAINES.map(function (d) { return '<option value="' + esc(d[0]) + '">' + esc(d[1]) + '</option>'; }).join('') + '</select></label>'
        + '<label>Forme<select name="type_evt"><option value="">Toutes les formes</option>' + FORMES.map(function (d) { return '<option value="' + esc(d[0]) + '">' + esc(d[1]) + '</option>'; }).join('') + '</select></label>'
        + '<label>Zone<select name="zone">' + optionsZone().map(function (d) { return '<option value="' + d[0] + '">' + esc(d[1]) + '</option>'; }).join('') + '</select></label>'
        + '<label>Participation<select name="part"><option value="">Gratuits ou payants</option>' + PARTS.map(function (d) { return '<option value="' + d[0] + '">' + esc(d[1]) + '</option>'; }).join('') + '</select></label>'
        + '<label class="ae-case"><input type="checkbox" name="en_ligne" checked> Inclure aussi les événements en ligne</label>'
        + '<button type="submit" class="ae-bout">' + BELL + ' Créer l’alerte</button></form>');
  }

  async function ouvrir(options) {
    options = options || {};
    css();
    precedent = document.activeElement;
    try { await charger(); }
    catch (e) {
      if (e.status === 401) {
        if (typeof options.connexion === 'function') { options.connexion(); return; }
        ETAT.connecte = false;
      } else { ETAT.connecte = false; }
    }
    if (racine) racine.remove();
    racine = document.createElement('div'); racine.className = 'ae-fond';
    racine.innerHTML = '<div class="ae-fen" role="dialog" aria-modal="true" aria-labelledby="ae-t"><div class="ae-tete"><span class="ae-ic">' + BELL + '</span><h2 id="ae-t">Être informé des événements</h2><button type="button" class="ae-x" aria-label="Fermer" data-a="ferme">✕</button></div><div class="ae-corps"></div></div>';
    document.body.appendChild(racine);
    document.body.dataset.aeOv = document.body.style.overflow || ''; document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', touche, true);
    if (!ETAT.connecte) {
      racine.querySelector('.ae-corps').innerHTML = '<p class="ae-intro">Connectez-vous pour créer vos alertes : vous serez prévenu dès que paraît un événement qui vous intéresse.</p><a class="ae-bout" href="login.html" style="text-decoration:none">Me connecter</a>';
    } else peindre();
    racine.addEventListener('click', async function (ev) {
      if (ev.target === racine) return fermer();
      var b = ev.target.closest('[data-a]'); if (!b) return;
      var a = b.dataset.a;
      if (a === 'ferme') return fermer();
      try {
        if (a === 'push') { b.disabled = true; await activerPush(); peindre(); }
        else if (a === 'bascule') { var id = Number(b.dataset.id), al = ETAT.alertes.filter(function (x) { return x.id === id; })[0]; await api('PATCH', '/api/evenement-alertes/' + id, { actif: !al.actif }); await charger(); peindre(); }
        else if (a === 'supprime') { await api('DELETE', '/api/evenement-alertes/' + Number(b.dataset.id)); await charger(); peindre(); }
      } catch (e) { peindre(esc(e.message)); }
    });
    racine.addEventListener('submit', async function (ev) {
      ev.preventDefault();
      var f = ev.target, d = {}; new FormData(f).forEach(function (v, k) { d[k] = v; });
      d.en_ligne = !!f.elements.en_ligne.checked;
      var btn = f.querySelector('button[type=submit]'); btn.disabled = true;
      try {
        await api('POST', '/api/evenement-alertes', d); await charger(); peindre();
        var l = racine && racine.querySelector('.ae-liste'); if (l && l.scrollIntoView) l.scrollIntoView({ block: 'nearest' });
        /* Première alerte : on propose tout de suite d'activer les notifications de l'appareil (déjà visible en haut de la fenêtre). */
      } catch (e) {
        var lien = e.data && e.data.profil_incomplet ? ' <a href="profil.html">Compléter mon profil</a>' : '';
        peindre(esc(e.message) + lien);
      }
    });
    var fermeture = racine.querySelector('.ae-x'); if (fermeture) fermeture.focus();
  }

  /* Pose une cloche (icône + petit badge du nombre d'alertes actives) dans le bouton donné ; un clic ouvre la fenêtre. */
  function poser(bouton, options) {
    if (!bouton) return;
    css();
    bouton.classList.add('ae-cloche');
    bouton.innerHTML = BELL + '<span class="ae-badge" hidden></span>';
    bouton.onclick = function () { ouvrir(options); };
    var badge = bouton.querySelector('.ae-badge');
    compter(function (n) { badge.textContent = n; badge.hidden = !n; });
  }

  window.AlertesEvt = { ouvrir: ouvrir, compter: compter, poser: poser, iconeCloche: function () { return BELL; } };
})();

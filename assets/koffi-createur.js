/* ═════════════════════════════════════════════════
   assets/koffi-createur.js — KOFFI, assistant de création de formations : fenêtre de discussion (2026-10-31)
   ═════════════════════════════════════════════════
   Autonome (CSS injecté, préfixe .kc-). KoffiCreateur.monter({ formationId: () => id, visible: () => bool, apresMission: action => {} }).
   - Ne gêne jamais : volet rangé à droite (grand écran) ou feuille en bas (petit écran) ; la PAGE se décale pour rester entièrement visible et utilisable pendant qu'on discute.
     Ni fond grisé, ni blocage du clavier : on continue de créer sa formation. La croix réduit Koffi en pastille ; la discussion est conservée.
   - Dossiers de discussion : un dossier (« Module 3 ») contient plusieurs discussions ; chacune a son propre fil.
   - Toutes les règles (formateur de la formation, majorité, pays, messages gratuits, forfait, budget) sont décidées par le SERVEUR (/api/kofi/createur/*) ;
     ici on n'affiche que ce qu'il renvoie. Une mission proposée par Koffi n'écrit RIEN tant que le formateur n'a pas cliqué « Appliquer ».
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiCreateur) return;

  var T = {
    titre: 'Koffi · assistant de création', ouvrir: '🤖 Koffi', fermer: 'Réduire Koffi', discussions: 'Discussions', retour: 'Retour à la discussion',
    confirmSuppr: 'Supprimer cette discussion et ses missions ? Cette action est définitive. (Ce qui a déjà été créé dans votre formation reste en place.)',
    confirmDossier: function (n) { return 'Supprimer ce dossier et ses ' + n + ' discussion' + (n > 1 ? 's' : '') + ' ? Cette action est définitive. (Ce qui a déjà été créé dans votre formation reste en place.)'; },
    accueil: 'Bonjour ! Je suis Koffi. Dites-moi ce que vous voulez faire : je vous indique l\'outil à utiliser, et je prépare de petites missions que vous validez d\'un clic (renseigner les infos générales, créer un module, une leçon, une carte mentale, organiser un texte que vous collez…). Vous pouvez continuer à travailler pendant que nous discutons.',
    accueilDossier: function (n) { return 'Nouvelle discussion dans le dossier « ' + n + ' ». Tout ce que vous direz ici concernera ce sujet.'; },
    placeholder: 'Écrivez votre demande, ou collez un texte à organiser…', envoyer: 'Envoyer', reflechit: 'Koffi réfléchit…',
    gratuits: function (n, j) { return n + ' message' + (n > 1 ? 's' : '') + ' offert' + (n > 1 ? 's' : '') + ' aujourd\'hui (sur ' + j + ')'; },
    achetes: function (n) { return n + ' message' + (n > 1 ? 's' : '') + ' acheté' + (n > 1 ? 's' : ''); },
    info: [
      'Koffi ne modifie jamais votre formation tout seul : il vous propose une mission, et rien n\'est écrit tant que vous n\'avez pas cliqué « Appliquer ».',
      'Quand vous importez un texte, il est repris tel quel : Koffi ne fait que l\'organiser (chapitres, leçons).',
      'Koffi peut se tromper : relisez toujours ce qu\'il propose. Vous restez responsable de vos contenus et de leurs droits.',
      'Vos messages, les textes que vous collez et le plan de votre formation sont envoyés à notre prestataire d\'intelligence artificielle, Anthropic Ireland (transferts possibles hors de l\'Union européenne), sans votre nom ni votre e-mail. Ne collez aucune donnée sensible ni donnée personnelle d\'apprenants.',
      'Vos conversations sont conservées 60 jours au maximum, puis supprimées. Vous pouvez les supprimer à tout moment.'
    ],
    infoLien: 'En savoir plus : politique de confidentialité', compris: 'J\'ai compris',
    suggestions: ['Comment ajouter un quiz et un examen final ?', 'Comment fixer le prix et créer un coupon ?', 'Quels sont les types de certificat ?', 'Crée une carte mentale du module 1'],
    appliquer: 'Appliquer', ignorer: 'Ignorer', appliquee: '✅ Appliquée', annulee: 'Ignorée', echec: '⚠️ Échec', enCours: 'Application…',
    majTitre: 'Koffi est réservé aux personnes majeures', majTexte: 'Pour utiliser Koffi, confirmez que vous avez 18 ans ou plus. Tous vos outils de création restent disponibles sans lui.', majCase: 'Je confirme avoir 18 ans ou plus', majBtn: 'Confirmer',
    mineur: 'Koffi est réservé aux personnes de 18 ans ou plus. Vos outils de création restent disponibles sans lui.',
    pays: 'Koffi n\'est pas disponible dans votre pays pour le moment. Vos outils de création restent accessibles.',
    desactive: 'Koffi est désactivé pour le moment.', indisponible: 'Koffi est momentanément indisponible. Réessayez plus tard.',
    rechargeTitre: 'Vos messages offerts du jour sont épuisés',
    rechargeTexte: function (f) { return 'Reprenez demain (' + f.gratuits + ' messages offerts par jour), ou achetez un forfait de ' + f.messages + ' messages pour ' + String(f.prix_eur).replace('.', ',') + ' € (valable ' + f.validite_mois + ' mois).'; },
    acheter: 'Acheter le forfait', erreur: 'Une erreur est survenue. Réessayez.', trop: 'Message trop long.',
    nouvelleDisc: '＋ Nouvelle discussion', nouveauDossier: '📁 Nouveau dossier', nomDossier: 'Nom du dossier (ex. : Module 3)', renommer: 'Renommer', supprimer: 'Supprimer', deplacer: 'Ranger dans…', horsDossier: 'Hors dossier', sansDossier: 'Discussions hors dossier',
    aucune: 'Aucune discussion pour le moment.', plein: 'Agrandir', reduire: 'Réduire la hauteur', nomDisc: 'Nouveau titre'
  };

  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var LARGEUR = 380;
  var opts = null, E = {}, etat = null, conversationId = null, dossierId = null, titreCourant = '', vue = 'chat', occupe = false, derniereFormation = null, ouverts = {};

  function dateCourte(s) {
    if (!s) return '';
    var t = String(s).replace(' ', 'T'), d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z'); if (isNaN(d)) return '';
    return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function style() {
    if (document.getElementById('kc-style')) return;
    var s = document.createElement('style'); s.id = 'kc-style';
    s.textContent = [
      'html body button.kc-btn{position:fixed !important;right:88px !important;bottom:22px !important;left:auto !important;top:auto !important;z-index:1090 !important;margin:0 !important;display:none;align-items:center;gap:8px;padding:10px 16px;border:2px solid #E6B84A;border-radius:99px;background:#0F2342;color:#F3D27A;font:700 14px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.28);cursor:pointer}',
      'html body button.kc-btn:hover{background:#17335f}',
      /* Volet à droite (grand écran) : la page se décale de sa largeur ; feuille en bas (petit écran) : la page remonte au-dessus. */
      '.kc-panel{position:fixed;top:var(--kc-haut,0px);right:0;bottom:0;z-index:502;width:' + LARGEUR + 'px;display:none;flex-direction:column;background:#fff;color:#1e293b;border-radius:14px 0 0 14px;box-shadow:-4px 0 24px rgba(0,0,0,.22);overflow:hidden;font:14px/1.45 system-ui,sans-serif}',
      '@media(max-width:999px){.kc-panel{top:auto;left:0;right:0;bottom:0;width:100%;height:46vh;height:46dvh;min-height:250px;border-radius:14px 14px 0 0;box-shadow:0 -4px 24px rgba(0,0,0,.22)}.kc-panel.plein{top:0;height:auto}}',
      'html.kc-r-d body{padding-right:var(--kc-r,0px) !important}html.kc-r-b body{padding-bottom:var(--kc-r,0px) !important}',
      '.kc-head{background:#0F2342;color:#fff;padding:8px 10px;display:flex;align-items:center;gap:8px;flex:0 0 auto}',
      '.kc-head img{width:32px;height:32px;border-radius:50%;border:2px solid #E6B84A;object-fit:cover;background:#fff;flex:0 0 auto}',
      '.kc-head .kc-sp{flex:1;min-width:0}.kc-head b{display:block;font-size:13.5px;white-space:nowrap}',
      '.kc-ou{display:block;width:100%;background:none;border:0;padding:0;color:#F3D27A;font-size:11.5px;text-align:left;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kc-ou:hover{text-decoration:underline}',
      '.kc-ib{background:transparent;border:0;color:#fff;cursor:pointer;font-size:16px;padding:4px 7px;border-radius:8px;flex:0 0 auto}.kc-ib:hover{background:rgba(255,255,255,.16)}',
      '.kc-plein-btn{display:none}@media(max-width:999px){.kc-plein-btn{display:inline-block}}',
      '.kc-body{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:10px;background:#f8fafc;min-height:0}',
      '.kc-m{max-width:94%;padding:9px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word}',
      '.kc-m.bot{align-self:flex-start;background:#fff;border:1px solid #e2e8f0}.kc-m.user{align-self:flex-end;background:#0F2342;color:#fff}.kc-m.user.long{max-height:120px;overflow:hidden}',
      '.kc-sug{display:flex;flex-wrap:wrap;gap:6px}.kc-sug button{background:#fff;border:1px solid #cbd5e1;border-radius:99px;padding:6px 11px;font-size:12.5px;cursor:pointer;color:#0F2342;text-align:left}.kc-sug button:hover{background:#fff7e0;border-color:#E6B84A}',
      '.kc-mission{align-self:stretch;background:#fffbea;border:1px solid #E6B84A;border-radius:12px;padding:10px 12px}',
      '.kc-mission h4{margin:0 0 6px;font-size:13.5px;color:#0F2342}',
      '.kc-mission ul{margin:0 0 8px;padding:0 0 0 16px;font-size:12.5px;color:#334155;max-height:170px;overflow:auto}',
      '.kc-mission .kc-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
      '.kc-ok{background:#0F2342;color:#F3D27A;border:0;border-radius:8px;padding:7px 14px;font-weight:700;cursor:pointer}.kc-ok:disabled{opacity:.5;cursor:default}',
      '.kc-ko{background:transparent;border:1px solid #cbd5e1;border-radius:8px;padding:6px 11px;cursor:pointer;color:#475569;font-size:13px}',
      '.kc-st{font-size:12.5px;font-weight:700}.kc-st.ok{color:#15803d}.kc-st.ko{color:#b45309}.kc-st a{color:#0F2342;text-decoration:underline}',
      '.kc-foot{border-top:1px solid #e2e8f0;padding:8px 76px 8px 10px;background:#fff;flex:0 0 auto}', /* 76 px à droite : le bouton d'assistance du site (coin bas-droit) ne doit jamais masquer « Envoyer » */
      '.kc-cred{font-size:11.5px;color:#64748b;margin:0 0 6px;min-height:15px}',
      '.kc-compo{display:flex;gap:6px;align-items:flex-end}',
      '.kc-compo textarea{flex:1;min-width:0;resize:none;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font:14px/1.4 system-ui,sans-serif;min-height:40px;max-height:140px}',
      '.kc-mic{background:#fff;border:1px solid #cbd5e1;border-radius:10px;width:40px;height:40px;cursor:pointer;font-size:17px;flex:0 0 auto}.kc-mic.rec{background:#dc2626;border-color:#dc2626;animation:kcPulse 1.2s infinite}@keyframes kcPulse{50%{opacity:.6}}',
      '.kc-send{background:#E6B84A;color:#0F2342;border:0;border-radius:10px;padding:0 12px;height:40px;font-weight:800;cursor:pointer;flex:0 0 auto}.kc-send:disabled{opacity:.5;cursor:default}',
      '.kc-carte{align-self:stretch;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px}',
      '.kc-carte h4{margin:0 0 6px;font-size:14px}.kc-carte p{margin:0 0 8px;font-size:13px;color:#475569}',
      '.kc-carte label{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;margin:6px 0}',
      '.kc-info{background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:10px 12px;font-size:12.5px;color:#1e3a8a}.kc-info ul{margin:6px 0 8px;padding-left:16px}.kc-info a{color:#1d4ed8}',
      /* liste des discussions */
      '.kc-bar{display:flex;gap:6px;flex-wrap:wrap}',
      '.kc-doss{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}',
      '.kc-dh{display:flex;align-items:center;gap:4px;padding:8px 10px;background:#f1f5f9}.kc-dh button.kc-tog{flex:1;min-width:0;text-align:left;background:none;border:0;font:700 13.5px system-ui,sans-serif;color:#0F2342;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.kc-mini{background:none;border:0;cursor:pointer;font-size:14px;padding:3px 5px;border-radius:6px;color:#475569}.kc-mini:hover{background:#e2e8f0}',
      '.kc-disc{display:flex;align-items:center;gap:4px;padding:7px 10px;border-top:1px solid #eef2f7}.kc-disc.actuelle{background:#fff7e0}',
      '.kc-disc button.kc-ouvrir{flex:1;min-width:0;text-align:left;background:none;border:0;cursor:pointer;color:#1e293b;font:13px system-ui,sans-serif}.kc-disc .t{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.kc-disc small{display:block;color:#64748b;font-size:11px}',
      '.kc-vide{font-size:12.5px;color:#64748b;padding:8px 10px}',
      '.kc-h5{font:700 12px system-ui,sans-serif;text-transform:uppercase;letter-spacing:.4px;color:#64748b;margin:4px 2px 0}',
      '.kc-sel{font-size:12px;max-width:150px}'
    ].join('\n');
    document.head.appendChild(s);
  }

  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) { var e = new Error(d.error || T.erreur); e.data = d; e.status = r.status; throw e; } return d; });
    });
  }
  var fid = function () { return opts && opts.formationId ? opts.formationId() : null; };
  var ouvert = function () { return !!(E.panel && E.panel.style.display === 'flex'); };

  /* ── Place : le panneau ne recouvre jamais le travail ── */
  function petitEcran() { return (window.innerWidth || document.documentElement.clientWidth) < 1000; }
  function reserver() {
    var h = document.documentElement;
    h.classList.remove('kc-r-d', 'kc-r-b'); h.style.removeProperty('--kc-r');
    if (!ouvert()) return;
    if (petitEcran()) { var hp = E.panel.classList.contains('plein') ? 0 : Math.round(E.panel.getBoundingClientRect().height); if (hp) { h.style.setProperty('--kc-r', hp + 'px'); h.classList.add('kc-r-b'); } }
    else { h.style.setProperty('--kc-r', LARGEUR + 'px'); h.classList.add('kc-r-d'); }
  }
  function majHaut() {
    var haut = 0, en = document.querySelector('.topbar');
    if (en && !petitEcran()) { var b = en.getBoundingClientRect(); if (b.bottom > 0 && b.bottom < 200) haut = Math.round(b.bottom); }
    E.panel.style.setProperty('--kc-haut', haut + 'px');
  }

  function monterDom() {
    if (E.panel) return;
    style();
    E.btn = document.createElement('button'); E.btn.type = 'button'; E.btn.className = 'kc-btn'; E.btn.textContent = T.ouvrir; E.btn.setAttribute('aria-label', T.titre);
    E.panel = document.createElement('div'); E.panel.className = 'kc-panel'; E.panel.setAttribute('role', 'complementary'); E.panel.setAttribute('aria-label', T.titre);
    E.panel.innerHTML = '<div class="kc-head"><img src="/assets/koffi-avatar-96.webp" alt="" onerror="this.style.display=\'none\'"><div class="kc-sp"><b>' + esc(T.titre) + '</b><button type="button" class="kc-ou" id="kc-ou" title="' + esc(T.discussions) + '"></button></div>' +
      '<button type="button" class="kc-ib" data-a="liste" title="' + esc(T.discussions) + '" aria-label="' + esc(T.discussions) + '">☰</button>' +
      '<button type="button" class="kc-ib" data-a="info" title="À savoir" aria-label="À savoir">ⓘ</button>' +
      '<button type="button" class="kc-ib kc-plein-btn" data-a="plein" title="' + esc(T.plein) + '" aria-label="' + esc(T.plein) + '">⤢</button>' +
      '<button type="button" class="kc-ib" data-a="fermer" title="' + esc(T.fermer) + '" aria-label="' + esc(T.fermer) + '">—</button></div>' +
      '<div class="kc-body" id="kc-body" aria-live="polite"></div>' +
      '<div class="kc-foot"><p class="kc-cred" id="kc-cred"></p><div class="kc-compo"><textarea id="kc-input" rows="1" placeholder="' + esc(T.placeholder) + '" aria-label="' + esc(T.placeholder) + '"></textarea><button type="button" class="kc-mic" id="kc-mic" title="Dicter votre message" aria-label="Dicter votre message">🎤</button><button type="button" class="kc-send" id="kc-send">' + esc(T.envoyer) + '</button></div></div>';
    document.body.appendChild(E.btn); document.body.appendChild(E.panel);
    E.body = E.panel.querySelector('#kc-body'); E.input = E.panel.querySelector('#kc-input'); E.send = E.panel.querySelector('#kc-send'); E.cred = E.panel.querySelector('#kc-cred'); E.ou = E.panel.querySelector('#kc-ou'); E.foot = E.panel.querySelector('.kc-foot');
    E.btn.addEventListener('click', function () { ouvrir(); });
    E.ou.addEventListener('click', function () { basculerVue(); });
    E.panel.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('[data-a]'); if (!a) return;
      var k = a.dataset.a;
      if (k === 'fermer') fermer(); else if (k === 'info') { vue = 'chat'; rendreVue(); afficherInfo(true); } else if (k === 'liste') basculerVue();
      else if (k === 'plein') { E.panel.classList.toggle('plein'); a.textContent = E.panel.classList.contains('plein') ? '⤡' : '⤢'; reserver(); }
    });
    E.send.addEventListener('click', envoyer);
    initMicro();
    E.input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); envoyer(); } });
    E.input.addEventListener('input', function () { E.input.style.height = 'auto'; E.input.style.height = Math.min(140, E.input.scrollHeight) + 'px'; });
    window.addEventListener('resize', function () { if (ouvert()) { majHaut(); reserver(); } });
    window.addEventListener('scroll', function () { if (ouvert() && !petitEcran()) majHaut(); }, { passive: true });
    /* La pastille n'apparaît que lorsque l'éditeur de formation est ouvert ; quand il se ferme, Koffi se réduit. */
    var maj = function () { var v = opts && opts.visible ? !!opts.visible() : true; E.btn.style.display = v && !ouvert() ? 'inline-flex' : 'none'; if (!v && ouvert()) fermer(); };
    setInterval(maj, 700); maj();
  }

  /* Dictée vocale : reconnaissance native du navigateur (gratuite, aucune clé) ; le bouton disparaît si le navigateur ne la propose pas. */
  function initMicro() {
    var btn = E.panel.querySelector('#kc-mic'), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { btn.style.display = 'none'; return; }
    var rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true;
    var ecoute = false, arret = false, base = '', final = '';
    rec.addEventListener('result', function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) final += e.results[i][0].transcript; else interim += e.results[i][0].transcript; }
      E.input.value = (base + ' ' + final + ' ' + interim).replace(/\s+/g, ' ').trim(); E.input.dispatchEvent(new Event('input'));
    });
    rec.addEventListener('end', function () { if (!arret) { try { rec.start(); return; } catch (e) { /* on termine */ } } ecoute = false; btn.classList.remove('rec'); });
    rec.addEventListener('error', function (e) { if (e.error === 'no-speech' || e.error === 'aborted') return; ecoute = false; arret = true; btn.classList.remove('rec'); });
    btn.addEventListener('click', function () {
      if (ecoute) { arret = true; rec.stop(); return; }
      ecoute = true; arret = false; final = ''; base = E.input.value.trim(); btn.classList.add('rec');
      try { rec.start(); } catch (e) { ecoute = false; btn.classList.remove('rec'); }
    });
    E.arreterMicro = function () { final = ''; if (ecoute) { arret = true; rec.stop(); } };
  }

  function bulle(role, texte, extra) { var d = document.createElement('div'); d.className = 'kc-m ' + role + (extra || ''); d.textContent = texte; E.body.appendChild(d); return d; }
  function defiler() { E.body.scrollTop = E.body.scrollHeight; }
  function carteEtat(titre, texte) { var d = document.createElement('div'); d.className = 'kc-carte'; d.innerHTML = '<h4>' + esc(titre) + '</h4><p>' + esc(texte) + '</p>'; E.body.appendChild(d); return d; }
  function bloquer(oui) { E.input.disabled = oui; E.send.disabled = oui; }

  function afficherInfo(force) {
    var vu = false; try { vu = localStorage.getItem('kc_info_v1') === '1'; } catch (e) { /* sans stockage : on réaffiche */ }
    if (vu && !force) return;
    var d = document.createElement('div'); d.className = 'kc-info';
    d.innerHTML = '<b>À savoir avant de commencer</b><ul>' + T.info.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><a href="politique-confidentialite.html" target="_blank" rel="noopener">' + esc(T.infoLien) + '</a> · <button type="button" class="kc-ko" style="margin-left:6px">' + esc(T.compris) + '</button>';
    d.querySelector('button').addEventListener('click', function () { try { localStorage.setItem('kc_info_v1', '1'); } catch (e) { /* sans importance */ } d.remove(); });
    E.body.insertBefore(d, E.body.firstChild);
  }
  function pastilleCredits() {
    var c = etat && etat.credits; if (!c) { E.cred.textContent = ''; return; }
    var t = T.gratuits(c.gratuits_restants, c.gratuits_jour); if (c.achetes_restants > 0) t += ' · ' + T.achetes(c.achetes_restants);
    E.cred.textContent = t;
  }
  function nomDossier(id) { var d = etat && (etat.dossiers || []).filter(function (x) { return x.id === id; })[0]; return d ? d.nom : ''; }
  function majOu() {
    var t = (dossierId && nomDossier(dossierId) ? '📁 ' + nomDossier(dossierId) + ' › ' : '') + (titreCourant || 'Nouvelle discussion');
    E.ou.textContent = t; E.ou.title = T.discussions + ' — ' + t;
  }

  /* ── Vues : discussion / liste des discussions ── */
  function basculerVue() { vue = vue === 'liste' ? 'chat' : 'liste'; rendreVue(); }
  function rendreVue() { if (!etat || (etat.etat !== 'utilisable' && etat.etat !== 'recharge')) { rendreEtat(); return; } if (vue === 'liste') rendreListe(); else rendreChat(); }

  function rendreEtat() {
    E.body.innerHTML = ''; bloquer(false); pastilleCredits(); E.foot.style.display = '';
    if (!etat) { E.ou.textContent = ''; carteEtat('Koffi', T.erreur); bloquer(true); return; }
    var e = etat.etat;
    if (e === 'majorite') {
      var c = carteEtat(T.majTitre, T.majTexte); var l = document.createElement('label'); l.innerHTML = '<input type="checkbox"> ' + esc(T.majCase); c.appendChild(l);
      var b = document.createElement('button'); b.type = 'button'; b.className = 'kc-ok'; b.textContent = T.majBtn; b.disabled = true; c.appendChild(b);
      l.querySelector('input').addEventListener('change', function (ev) { b.disabled = !ev.target.checked; });
      b.addEventListener('click', function () { b.disabled = true; api('POST', '/api/kofi/majorite', { confirme: true }).then(charger).catch(function (er) { b.disabled = false; alert(er.message); }); });
      bloquer(true); return;
    }
    if (e === 'mineur' || e === 'pays' || e === 'desactive' || e === 'indisponible') { carteEtat('Koffi', T[e]); bloquer(true); return; }
    rendreVue();
  }

  function rendreChat(messages) {
    E.body.innerHTML = ''; E.foot.style.display = ''; bloquer(false); pastilleCredits(); majOu();
    afficherInfo(false);
    var ms = messages || [];
    if (!ms.length) {
      bulle('bot', dossierId && nomDossier(dossierId) ? T.accueilDossier(nomDossier(dossierId)) : T.accueil);
      var s = document.createElement('div'); s.className = 'kc-sug';
      T.suggestions.forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.textContent = x; b.addEventListener('click', function () { E.input.value = x; envoyer(); }); s.appendChild(b); });
      E.body.appendChild(s);
    } else ms.forEach(rendreMessage);
    if (etat && etat.etat === 'recharge') rendreRecharge();
    defiler();
  }
  function rendreMessage(m) {
    if (m.role === 'user') { bulle('user', m.contenu, m.contenu.length > 600 ? ' long' : ''); return; }
    bulle('bot', m.contenu); (m.actions || []).forEach(rendreMission);
  }

  /* Liste : dossiers (dépliables) et discussions hors dossier. */
  function rendreListe() {
    E.body.innerHTML = ''; E.foot.style.display = 'none'; majOu();
    var barre = document.createElement('div'); barre.className = 'kc-bar';
    var bn = document.createElement('button'); bn.type = 'button'; bn.className = 'kc-ok'; bn.textContent = T.nouvelleDisc; bn.addEventListener('click', function () { nouvelleDiscussion(null); });
    var bd = document.createElement('button'); bd.type = 'button'; bd.className = 'kc-ko'; bd.textContent = T.nouveauDossier;
    bd.addEventListener('click', function () {
      var nom = prompt(T.nomDossier); if (!nom || !nom.trim()) return;
      api('POST', '/api/kofi/createur/dossiers', { formation_id: fid(), nom: nom.trim() }).then(function (r) { ouverts[r.id] = true; return rafraichir(); }).then(rendreListe).catch(function (er) { alert(er.message); });
    });
    barre.appendChild(bn); barre.appendChild(bd); E.body.appendChild(barre);
    var dossiers = etat.dossiers || [], disc = etat.discussions || [];
    dossiers.forEach(function (d) {
      var contenu = disc.filter(function (c) { return c.dossier_id === d.id; });
      var bloc = document.createElement('div'); bloc.className = 'kc-doss';
      var h = document.createElement('div'); h.className = 'kc-dh';
      var tog = document.createElement('button'); tog.type = 'button'; tog.className = 'kc-tog'; tog.textContent = (ouverts[d.id] ? '▾ 📁 ' : '▸ 📁 ') + d.nom + ' (' + contenu.length + ')';
      tog.addEventListener('click', function () { ouverts[d.id] = !ouverts[d.id]; rendreListe(); });
      h.appendChild(tog);
      h.appendChild(mini('＋', 'Nouvelle discussion dans ce dossier', function () { nouvelleDiscussion(d.id); }));
      h.appendChild(mini('✏️', T.renommer, function () { var n = prompt(T.nomDossier, d.nom); if (!n || !n.trim()) return; api('PATCH', '/api/kofi/createur/dossiers/' + d.id, { nom: n.trim() }).then(rafraichir).then(rendreListe).catch(function (er) { alert(er.message); }); }));
      h.appendChild(mini('🗑️', T.supprimer, function () { if (!confirm(T.confirmDossier(contenu.length))) return; api('DELETE', '/api/kofi/createur/dossiers/' + d.id).then(function () { if (contenu.some(function (c) { return c.id === conversationId; })) { conversationId = null; dossierId = null; titreCourant = ''; } return rafraichir(); }).then(rendreListe).catch(function (er) { alert(er.message); }); }));
      bloc.appendChild(h);
      if (ouverts[d.id]) { if (!contenu.length) { var v = document.createElement('div'); v.className = 'kc-vide'; v.textContent = T.aucune; bloc.appendChild(v); } contenu.forEach(function (c) { bloc.appendChild(ligneDisc(c, dossiers)); }); }
      E.body.appendChild(bloc);
    });
    var libres = disc.filter(function (c) { return !c.dossier_id; });
    var t = document.createElement('div'); t.className = 'kc-h5'; t.textContent = T.sansDossier; E.body.appendChild(t);
    if (!libres.length) { var v2 = document.createElement('div'); v2.className = 'kc-vide'; v2.textContent = T.aucune; E.body.appendChild(v2); }
    else { var bl = document.createElement('div'); bl.className = 'kc-doss'; libres.forEach(function (c) { bl.appendChild(ligneDisc(c, dossiers)); }); E.body.appendChild(bl); }
  }
  function mini(txt, titre, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'kc-mini'; b.textContent = txt; b.title = titre; b.setAttribute('aria-label', titre); b.addEventListener('click', function (e) { e.stopPropagation(); fn(); }); return b; }
  function ligneDisc(c, dossiers) {
    var l = document.createElement('div'); l.className = 'kc-disc' + (c.id === conversationId ? ' actuelle' : '');
    var o = document.createElement('button'); o.type = 'button'; o.className = 'kc-ouvrir'; o.innerHTML = '<span class="t"></span><small></small>'; o.querySelector('.t').textContent = c.titre; o.querySelector('small').textContent = dateCourte(c.derniere_activite);
    o.addEventListener('click', function () { ouvrirDiscussion(c.id); });
    l.appendChild(o);
    var sel = document.createElement('select'); sel.className = 'kc-sel'; sel.title = T.deplacer; sel.setAttribute('aria-label', T.deplacer);
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = T.deplacer; sel.appendChild(o0);
    var oh = document.createElement('option'); oh.value = '0'; oh.textContent = '— ' + T.horsDossier; sel.appendChild(oh);
    dossiers.forEach(function (d) { var op = document.createElement('option'); op.value = String(d.id); op.textContent = '📁 ' + d.nom; sel.appendChild(op); });
    sel.addEventListener('change', function () { if (sel.value === '') return; var cible = sel.value === '0' ? null : Number(sel.value); api('PATCH', '/api/kofi/createur/conversations/' + c.id, { dossier_id: cible }).then(function () { if (c.id === conversationId) dossierId = cible; if (cible) ouverts[cible] = true; return rafraichir(); }).then(rendreListe).catch(function (er) { alert(er.message); }); });
    l.appendChild(sel);
    l.appendChild(mini('✏️', T.renommer, function () { var n = prompt(T.nomDisc, c.titre); if (!n || !n.trim()) return; api('PATCH', '/api/kofi/createur/conversations/' + c.id, { titre: n.trim() }).then(function () { if (c.id === conversationId) titreCourant = n.trim(); return rafraichir(); }).then(rendreListe).catch(function (er) { alert(er.message); }); }));
    l.appendChild(mini('🗑️', T.supprimer, function () { if (!confirm(T.confirmSuppr)) return; api('DELETE', '/api/kofi/createur/conversations/' + c.id).then(function () { if (c.id === conversationId) { conversationId = null; titreCourant = ''; } return rafraichir(); }).then(rendreListe).catch(function (er) { alert(er.message); }); }));
    return l;
  }
  /* Nouvelle discussion : rien n'est créé côté serveur avant le premier message (pas de discussion vide qui traîne). */
  function nouvelleDiscussion(dossier) { conversationId = null; dossierId = dossier || null; titreCourant = ''; vue = 'chat'; rendreChat([]); E.input.focus(); }
  function ouvrirDiscussion(id) {
    api('GET', '/api/kofi/createur/conversations/' + id).then(function (c) {
      conversationId = c.id; dossierId = c.dossier_id; titreCourant = c.titre; vue = 'chat'; rendreChat(c.messages); E.input.focus();
    }).catch(function (er) { alert(er.message); });
  }
  function rafraichir() {
    return api('GET', '/api/kofi/createur/etat?formation_id=' + encodeURIComponent(fid())).then(function (d) { if (etat) { etat.dossiers = d.dossiers; etat.discussions = d.discussions; etat.credits = d.credits; etat.etat = d.etat; } });
  }

  function lienResultat(a) {
    var r = a.resultat || {}; var out = [];
    if (a.type === 'creer_carte_mentale' && r.carte_id) {
      out.push('<a href="carte-mentale.html?id=' + encodeURIComponent(r.carte_id) + '" target="_blank" rel="noopener">Ouvrir la carte</a>');
      if (r.lecon_id) out.push(r.studio_publie ? 'leçon ajoutée au chapitre' : 'leçon ajoutée au chapitre (formation déjà en ligne : à publier depuis le Studio)');
      if (r.lecon_id && r.image === false) out.push('image non envoyée : lien seulement');
    } else if (a.type === 'importer_texte') out.push((r.chapitres || 0) + ' chapitre(s), ' + (r.lecons || 0) + ' leçon(s) créé(s)');
    else if (a.type === 'renseigner_infos') out.push((r.champs || []).length + ' champ(s) mis à jour dans « Infos générales »');
    return out.join(' · ');
  }
  function rendreMission(a) {
    var d = document.createElement('div'); d.className = 'kc-mission'; d.dataset.id = a.id;
    d.innerHTML = '<h4>' + esc(a.titre) + '</h4><ul>' + (a.resume || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><div class="kc-row"></div>'; E.body.appendChild(d);
    var row = d.querySelector('.kc-row');
    function fin(a2) {
      row.innerHTML = '';
      var st = document.createElement('span'); st.className = 'kc-st ' + (a2.statut === 'appliquee' ? 'ok' : 'ko');
      if (a2.statut === 'appliquee') st.innerHTML = esc(T.appliquee) + (lienResultat(a2) ? ' — ' + lienResultat(a2) : '');
      else if (a2.statut === 'annulee') st.textContent = T.annulee;
      else st.textContent = T.echec + (a2.resultat && a2.resultat.erreur ? ' : ' + a2.resultat.erreur : '');
      row.appendChild(st);
    }
    if (a.statut !== 'proposee') { fin(a); return; }
    var ok = document.createElement('button'); ok.type = 'button'; ok.className = 'kc-ok'; ok.textContent = T.appliquer;
    var ko = document.createElement('button'); ko.type = 'button'; ko.className = 'kc-ko'; ko.textContent = T.ignorer;
    row.appendChild(ok); row.appendChild(ko);
    ok.addEventListener('click', function () {
      ok.disabled = true; ko.disabled = true; ok.textContent = T.enCours;
      api('POST', '/api/kofi/createur/actions/' + a.id + '/appliquer', {}).then(function (r) { fin(r.action); if (opts && opts.apresMission) opts.apresMission(r.action); })
        .catch(function (er) { ok.disabled = false; ko.disabled = false; ok.textContent = T.appliquer; var m = document.createElement('div'); m.className = 'kc-st ko'; m.textContent = er.message; row.appendChild(m); });
    });
    ko.addEventListener('click', function () { ko.disabled = true; api('POST', '/api/kofi/createur/actions/' + a.id + '/annuler', {}).then(function () { fin({ statut: 'annulee' }); }).catch(function (er) { ko.disabled = false; alert(er.message); }); });
  }

  function rendreRecharge() {
    var f = etat.forfait, c = etat.credits || {};
    var d = carteEtat(T.rechargeTitre, T.rechargeTexte({ gratuits: c.gratuits_jour, messages: f.messages, prix_eur: f.prix_eur, validite_mois: f.validite_mois }));
    var l1 = document.createElement('label'); l1.innerHTML = '<input type="checkbox" class="a"> ' + esc(f.texte);
    var l2 = document.createElement('label'); l2.innerHTML = '<input type="checkbox" class="b"> ' + esc(f.retractation);
    var b = document.createElement('button'); b.type = 'button'; b.className = 'kc-ok'; b.textContent = T.acheter + ' — ' + String(f.prix_eur).replace('.', ',') + ' €'; b.disabled = true;
    d.appendChild(l1); d.appendChild(l2); d.appendChild(b);
    var maj = function () { b.disabled = !(l1.querySelector('input').checked && l2.querySelector('input').checked); };
    l1.addEventListener('change', maj); l2.addEventListener('change', maj);
    b.addEventListener('click', function () {
      b.disabled = true;
      api('POST', '/api/kofi/createur/forfait/acheter', { formation_id: fid(), accepte_non_remboursable: true }).then(function (r) { if (r.checkout_url) window.location.href = r.checkout_url; })
        .catch(function (er) { b.disabled = false; alert(er.message); });
    });
    bloquer(true);
  }

  function charger() {
    var id = fid(); if (!id) return Promise.resolve();
    derniereFormation = id; conversationId = null; dossierId = null; titreCourant = ''; vue = 'chat';
    return api('GET', '/api/kofi/createur/etat?formation_id=' + encodeURIComponent(id)).then(function (d) {
      etat = d;
      if (d.conversation) { conversationId = d.conversation.id; dossierId = d.conversation.dossier_id; titreCourant = d.conversation.titre; }
    }).catch(function () { etat = null; }).then(function () {
      if (etat && (etat.etat === 'utilisable' || etat.etat === 'recharge')) rendreChat(etat.conversation ? etat.conversation.messages : []); else rendreEtat();
    });
  }

  function envoyer() {
    if (occupe) return;
    var texte = E.input.value.trim(); if (!texte) return;
    if (etat && texte.length > etat.max_message) { alert(T.trop + ' (' + etat.max_message + ' caractères au maximum)'); return; }
    if (E.arreterMicro) E.arreterMicro();
    occupe = true; E.send.disabled = true; E.input.value = ''; E.input.style.height = 'auto';
    var sug = E.body.querySelector('.kc-sug'); if (sug) sug.remove();
    bulle('user', texte, texte.length > 600 ? ' long' : ''); var att = bulle('bot', T.reflechit); defiler();
    var corps = { formation_id: fid(), texte: texte }; if (conversationId) corps.conversation_id = conversationId; else if (dossierId) corps.dossier_id = dossierId;
    api('POST', '/api/kofi/createur/messages', corps).then(function (r) {
      att.remove(); var nouvelle = !conversationId; conversationId = r.conversation_id; if (!titreCourant) titreCourant = texte.slice(0, 60);
      if (etat) { etat.credits = r.credits; pastilleCredits(); }
      bulle('bot', r.message.contenu); (r.message.actions || []).forEach(rendreMission);
      if (r.message.missions_rejetees) bulle('bot', 'Une proposition n\'a pas pu être retenue (référence invalide) : reformulez ou précisez le module / chapitre concerné.');
      majOu(); defiler(); if (nouvelle) rafraichir();
    }).catch(function (er) {
      att.remove();
      if (er.data && er.data.code === 'credits_epuises') { if (etat) { etat.etat = 'recharge'; if (er.data.forfait) etat.forfait = Object.assign({}, etat.forfait, er.data.forfait); } rendreRecharge(); }
      else bulle('bot', '⚠️ ' + er.message);
      defiler();
    }).then(function () { occupe = false; if (!(etat && etat.etat === 'recharge')) E.send.disabled = false; });
  }

  function ouvrir(prefill) {
    E.panel.style.display = 'flex'; E.btn.style.display = 'none'; majHaut(); reserver();
    var apres = function () { reserver(); if (typeof prefill === 'string' && prefill && E.input && !E.input.disabled && !E.input.value) E.input.value = prefill; /* pas de focus forcé en petit écran : le clavier masquerait la page */ if (!petitEcran() && E.input && !E.input.disabled && vue === 'chat') E.input.focus(); };
    if (derniereFormation !== fid() || !etat) charger().then(apres); else apres();
  }
  function fermer() { E.panel.style.display = 'none'; reserver(); E.btn.style.display = 'inline-flex'; }

  /* Retour du paiement Stripe : message clair, puis l'adresse est nettoyée. */
  function retourPaiement() {
    try {
      var p = new URLSearchParams(window.location.search), r = p.get('kofi_createur'); if (!r) return;
      var msg = r === 'succes' ? 'Merci ! Vos messages Koffi seront crédités dans quelques instants, dès que le paiement est confirmé.' : 'Paiement annulé : aucun message n\'a été acheté.';
      if (typeof window.showMsg === 'function') window.showMsg(msg, r === 'succes' ? 'success' : 'warning'); else alert(msg);
      p.delete('kofi_createur'); p.delete('formation');
      window.history.replaceState({}, '', window.location.pathname + (p.toString() ? '?' + p.toString() : ''));
    } catch (e) { /* sans importance */ }
  }

  window.KoffiCreateur = {
    monter: function (o) { opts = o || {}; monterDom(); retourPaiement(); },
    ouvrir: function (prefill) { if (E.panel) ouvrir(prefill); },
    recharger: function () { etat = null; if (ouvert()) charger(); }
  };
})();

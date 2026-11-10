/* ═════════════════════════════════════════════════
   assets/koffi-inscriptions.js — KOFFI, GUIDE DES FICHES D'INSCRIPTION : fenêtre de discussion (2026-11-04)
   ═════════════════════════════════════════════════
   Autonome (CSS injecté, préfixe .ki-) : KoffiInscriptions.monter({ telephone, apresCreation })
   Dans le module « Formulaires de réponse et d'inscription », Koffi explique à quoi sert chaque partie d'une fiche (types d'inscription, champs, validation, QR…)
   et, pour les comptes Initiative, Collectivité et Administrateur, prépare une fiche en BROUILLON : aperçu écrit par le serveur, création seulement après le clic
   « Créer la fiche » (ou un « oui »). Toutes les règles (majorité, pays, crédit, droits) sont décidées par le serveur (/api/kofi/inscriptions/*) : ici on n'affiche
   que ce qu'il renvoie. Le crédit (pastille, recharge) vient de assets/koffi-credit.js : un seul portefeuille pour tout Koffi.
   États serveur : utilisable | recharge | majorite | mineur | pays | desactive | indisponible.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiInscriptions) return;

  var T = {
    nom: 'Koffi', sous: 'Guide des fiches d\'inscription', ouvrir: 'Demander à Koffi de m\'aider avec les fiches d\'inscription', fermer: 'Fermer', nouvelle: 'Nouvelle conversation',
    supprimer: 'Supprimer cette conversation', confirmSuppr: 'Supprimer cette conversation ? Cette action est définitive.',
    placeholder: 'Écrivez avec vos mots…', envoyer: 'Envoyer', reflechit: 'Koffi réfléchit…',
    accueil: 'Bonjour ! Je suis Koffi. Demandez-moi à quoi sert une partie de la fiche (types d\'inscription, formulaire, validation, QR code…), ou, si votre compte peut créer une fiche, je la prépare avec vous : je vous pose les questions qui manquent et je ne crée rien sans votre accord.',
    suggestions: ['Que sais-tu faire ?', 'Explique-moi les types d\'inscription', 'Comment demander le nom d\'un accompagnant ?', 'À quoi sert la liste d\'attente ?'],
    suggestionCreer: 'Prépare-moi une fiche d\'inscription',
    gratuitNote: '✓ Question sur Koffi : gratuite, elle ne compte pas dans votre crédit.',
    info1: 'Koffi ne voit aucune de vos fiches ni aucun inscrit : il explique le module et prépare une nouvelle fiche avec vous. Il ne publie rien, ne relie aucun événement et ne touche à aucune inscription.',
    info2: 'Une fiche préparée avec Koffi est créée en brouillon, seulement après votre clic sur « Créer la fiche ». Vous pouvez tout modifier ensuite, comme n\'importe quelle fiche.',
    info3: 'Votre message et l\'historique récent de la conversation sont envoyés à notre prestataire d\'intelligence artificielle, Anthropic Ireland (transferts possibles hors de l\'Union européenne), sans votre nom ni votre e-mail. Ne saisissez aucune donnée sensible (santé, religion, opinions…) ni aucune information sur des inscrits.',
    info4: 'Vos conversations sont conservées 60 jours au maximum, puis supprimées. Vous pouvez les supprimer à tout moment.',
    infoLien: 'En savoir plus : politique de confidentialité', compris: 'J\'ai compris',
    majTitre: 'Koffi est réservé aux personnes majeures', majTexte: 'Pour utiliser Koffi, confirmez que vous avez 18 ans ou plus. Le module reste entièrement utilisable sans lui.', majCase: 'Je confirme avoir 18 ans ou plus', majBtn: 'Confirmer',
    mineur: 'Koffi est réservé aux personnes de 18 ans ou plus. Le module reste entièrement utilisable sans lui.',
    pays: 'Koffi n\'est pas disponible dans votre pays pour le moment. Le module reste utilisable sans lui.',
    desactive: 'Koffi est désactivé pour le moment.', indisponible: 'Koffi est momentanément indisponible. Réessayez un peu plus tard.',
    rechargeTitre: 'Votre crédit Koffi est épuisé', rechargeTexte: 'Rechargez votre crédit pour continuer : le même crédit sert à tout Koffi (cours, création de formation, Annuaire, événements, fiches d\'inscription). Poser une question sur ce que sait faire Koffi reste gratuit.',
    rechargeTextePremium: 'Votre crédit du mois est utilisé : il est renouvelé le mois prochain. Vous pouvez aussi recharger dès maintenant ; le même crédit sert à tout Koffi.', recharger: 'Recharger mon crédit',
    erreur: 'Une erreur est survenue. Réessayez.', trop: 'Doucement : patientez quelques secondes avant le message suivant.',
    apercu: 'Aperçu de votre fiche', manque: 'Il manque encore :', creer: 'Créer la fiche', abandonner: 'Abandonner ce brouillon', creation: 'Création en cours…',
    typesTitre: 'Types d\'inscription', formTitre: 'Questions du formulaire', ouvrirFiche: 'Ouvrir la fiche'
  };

  var CSS = [
    '.ki-root,.ki-root *{box-sizing:border-box}',
    '.ki-root{position:fixed;right:88px;bottom:22px;z-index:9000;font-family:inherit;color:#0f172a;line-height:1.45}',
    '.ki-btn{display:flex;align-items:center;gap:10px;border:0;cursor:pointer;background:#0D2B4E;color:#fff;border-radius:999px;padding:5px 18px 5px 5px;box-shadow:0 8px 26px rgba(13,43,78,.38),0 0 0 2px #F26422;font:700 14px/1.2 inherit;font-family:inherit}',
    '.ki-btn:hover{transform:translateY(-1px)}.ki-btn:focus-visible{outline:3px solid #F26422;outline-offset:3px}',
    '.ki-btn img{width:46px;height:46px;border-radius:50%;display:block;background:#fff}',
    '.ki-panel{position:fixed;right:18px;bottom:18px;width:400px;max-width:calc(100vw - 24px);height:min(660px,calc(100vh - 36px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(2,12,27,.45),0 0 0 1px rgba(13,43,78,.15);display:none;flex-direction:column;overflow:hidden;color:#0f172a;text-align:left}',
    '.ki-root.open .ki-panel{display:flex}.ki-root.open .ki-btn{display:none}',
    '.ki-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0D2B4E;flex:none}',
    '.ki-head img{width:42px;height:42px;border-radius:50%;background:#fff;flex:none}',
    '.ki-t{flex:1;min-width:0}.ki-t b{display:block;font-size:16px;color:#fff}.ki-t span{display:block;font-size:11.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ki-t .ki-credit{margin-top:3px;max-width:100%;overflow:hidden;text-overflow:ellipsis}',
    '.ki-ic{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:9px;min-width:34px;height:34px;cursor:pointer;font:700 14px inherit;font-family:inherit;padding:0 8px}',
    '.ki-ic:hover{background:rgba(255,255,255,.24)}.ki-ic:focus-visible{outline:2px solid #F26422}',
    '.ki-body{flex:1;overflow-y:auto;padding:14px;background:#f1f5f9;display:flex;flex-direction:column;gap:10px}',
    '.ki-msg{max-width:92%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.ki-msg.u{align-self:flex-end;background:#0D2B4E;color:#fff;border-bottom-right-radius:4px}',
    '.ki-msg.a{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
    '.ki-note{margin-top:6px;font-size:11.5px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:5px 8px;white-space:normal;font-weight:700}',
    '.ki-typing{align-self:flex-start;color:#475569;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:8px 12px}',
    '.ki-sug{display:flex;flex-wrap:wrap;gap:6px}.ki-sug button{background:#fff;border:1px solid #cbd5e1;border-radius:99px;padding:6px 11px;font-size:12.5px;cursor:pointer;color:#0D2B4E;text-align:left;font-family:inherit}',
    '.ki-sug button:hover{background:#fff7ed;border-color:#F26422}',
    '.ki-foot{flex:none;background:#fff;border-top:1px solid #e2e8f0;padding:8px 10px 10px}',
    '.ki-av{margin:0 0 6px;font-size:11px;color:#64748b;line-height:1.35}',
    '.ki-form{display:flex;gap:8px;align-items:flex-end}',
    '.ki-form textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font:14px/1.4 inherit;font-family:inherit;max-height:110px;min-height:42px;background:#fff;color:#0f172a}',
    '.ki-form textarea:focus{outline:2px solid #F26422;border-color:#F26422}',
    '.ki-send{border:0;background:#F26422;color:#fff;border-radius:12px;height:42px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.ki-send:disabled{opacity:.5;cursor:not-allowed}',
    '.ki-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;font-size:13.5px;line-height:1.55;color:#0f172a}',
    '.ki-card h4{margin:0 0 6px;font-size:15px;color:#0D2B4E}.ki-card p{margin:0 0 8px;color:#0f172a}',
    '.ki-card ul{margin:8px 0 12px;padding-left:18px}.ki-card li{margin:4px 0}',
    '.ki-card a.ki-l{color:#b84c1a;font-weight:700}',
    '.ki-cta{display:inline-block;border:0;background:#F26422;color:#fff;font-weight:800;padding:10px 18px;border-radius:10px;text-decoration:none;cursor:pointer;font-family:inherit;font-size:14px;margin:4px 8px 0 0}',
    '.ki-cta.sec{background:#fff;color:#0D2B4E;border:1.5px solid #0D2B4E}.ki-cta[disabled]{opacity:.55;cursor:not-allowed}',
    '.ki-cta:focus-visible{outline:3px solid #0D2B4E;outline-offset:2px}',
    /* Aperçu de la fiche en préparation */
    '.ki-bro{align-self:stretch;background:#fff;border:2px solid #F26422;border-radius:14px;padding:12px;font-size:13.5px;line-height:1.5;color:#0f172a}',
    '.ki-bro h4{margin:0 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#b84c1a}',
    '.ki-bro b{display:block;font-size:15px;color:#0D2B4E;overflow-wrap:anywhere}',
    '.ki-bro h5{margin:10px 0 3px;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:.03em}',
    '.ki-bro p{margin:4px 0;overflow-wrap:anywhere}.ki-bro .ki-q{color:#9a3412;font-weight:700}',
    '.ki-bro ul{margin:2px 0 4px;padding-left:18px}.ki-bro li{margin:2px 0;overflow-wrap:anywhere}',
    '.ki-bro .ki-man{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:#fff7ed;color:#9a3412;font-weight:700}',
    '.ki-bro .ki-info{margin:8px 0 0;font-size:12px;color:#475569}',
    '.ki-bro .ki-act{margin-top:10px}',
    '@media (max-width:560px){.ki-root{right:10px;bottom:calc(10px + env(safe-area-inset-bottom))}.ki-btn span{display:none}.ki-btn{padding:4px}.ki-panel{right:0;bottom:0;left:0;width:100%;max-width:none;height:80vh;height:80dvh;border-radius:16px 16px 0 0}.ki-form textarea{font-size:16px}}',
    /* Appli téléphone (m.html) : bouton compact au-dessus du pied de page, feuille dans la largeur de l'appli. */
    '.ki-tel{right:max(10px,calc((100vw - 560px)/2 + 10px));bottom:calc(78px + env(safe-area-inset-bottom))}.ki-tel .ki-btn span{display:none}.ki-tel .ki-btn{padding:4px}',
    '.ki-tel .ki-panel{right:0;bottom:0;left:0;width:100%;max-width:560px;margin:0 auto;height:80vh;height:80dvh;border-radius:16px 16px 0 0}.ki-tel .ki-form textarea{font-size:16px}',
    '@media (prefers-reduced-motion:no-preference){.ki-btn{transition:transform .15s}}'
  ].join('\n');

  var S = { opts: null, etat: null, conv: null, msgs: [], root: null, occupe: false };
  var ecouteEchap = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (sel) { return S.root.querySelector(sel); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sans importance */ } }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); });
  }
  /* L'adresse vient du serveur, mais on ne suit qu'un lien relatif vers une page du site, ou la fiche dans l'appli téléphone (#/inscriptions/ID). */
  function lienSur(l) {
    if (!l) return '#';
    if (S.opts && S.opts.telephone) return /^#\/inscriptions\/\d+$/.test(String(l.tel || '')) ? l.tel : '#';
    return /^[\w\-\/]+\.html(\?[\w=&%\-]*)?$/.test(String(l.url || '')) ? l.url : '#';
  }

  function chargerScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); });
  }
  var chargerCredit = function () { return chargerScript('/assets/koffi-credit.js?v=3', function () { return !!window.KoffiCredit; }); };

  /* ── Le crédit : pastille cliquable dans l'en-tête ── */
  function majMeta() {
    var p = $('.ki-credit'), e = S.etat, pf = e && e.portefeuille;
    if (!p) return;
    p.style.display = pf && window.KoffiCredit ? '' : 'none';
    if (pf && window.KoffiCredit) window.KoffiCredit.appliquer(p, pf, 'fr');
  }
  function ouvrirCredit() { if (window.KoffiCredit) window.KoffiCredit.ouvrir({ lg: 'fr', page: S.opts && S.opts.telephone ? 'telephone' : 'inscriptions' }); }

  function liste(titre, lignes) {
    if (!lignes || !lignes.length) return '';
    return '<h5>' + esc(titre) + '</h5><ul>' + lignes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }
  /* Aperçu de la fiche en préparation : les boutons ne figurent que sur le DERNIER aperçu, et seulement quand rien ne manque. */
  function carteBrouillon(b, messageId, actif) {
    var d = document.createElement('div'); d.className = 'ki-bro';
    d.innerHTML = '<h4>' + esc(T.apercu) + '</h4><b>' + esc(b.nom || '…') + '</b>' +
      (b.organisateur ? '<p>Organisé par ' + esc(b.organisateur) + '</p>' : '') + (b.description ? '<p>' + esc(b.description) + '</p>' : '') +
      (b.quand ? '<p class="ki-q">' + esc(b.quand) + '</p>' : '') + (b.visibilite ? '<p>' + esc(b.visibilite) + '</p>' : '') +
      liste(T.typesTitre, b.types) + liste(T.formTitre, b.formulaire) +
      (b.rappel ? '<p class="ki-info">' + esc(b.rappel) + '</p>' : '') + (b.statut ? '<p class="ki-info">' + esc(b.statut) + '</p>' : '');
    if (!actif) return d;
    if (b.pret) {
      var a = document.createElement('div'); a.className = 'ki-act';
      var c = bouton(T.creer, 'creer'); c.setAttribute('data-id', String(messageId));
      var x = bouton(T.abandonner, 'abandonner', true); x.setAttribute('data-id', String(messageId));
      a.appendChild(c); a.appendChild(x); d.appendChild(a);
    } else if (b.manquants && b.manquants.length) {
      var m = document.createElement('div'); m.className = 'ki-man'; m.textContent = T.manque + ' ' + b.manquants.join(', ') + '.'; d.appendChild(m);
    }
    return d;
  }
  function ajouterMessage(m, actif) {
    var el = document.createElement('div');
    el.className = 'ki-msg ' + (m.role === 'user' ? 'u' : 'a');
    el.textContent = m.contenu;
    if (m.role !== 'user' && m.gratuit) { var n = document.createElement('div'); n.className = 'ki-note'; n.textContent = T.gratuitNote; el.appendChild(n); }
    var corps = $('.ki-body'); corps.appendChild(el);
    if (m.role !== 'user' && m.brouillon) corps.appendChild(carteBrouillon(m.brouillon, m.id, !!actif));
    if (m.role !== 'user' && m.lien) {
      var href = lienSur(m.lien);
      if (href !== '#') {
        var lk = document.createElement('a'); lk.className = 'ki-cta'; lk.href = href; lk.textContent = m.lien.texte || T.ouvrirFiche;
        lk.addEventListener('click', function () { if (S.opts && S.opts.telephone) fermerPanneau(); });
        corps.appendChild(lk);
      }
    }
    corps.scrollTop = corps.scrollHeight;
    return el;
  }

  /* ── Cartes d'état ── */
  function carte(titre, texte, boutons) {
    var d = document.createElement('div'); d.className = 'ki-card';
    d.innerHTML = '<h4>' + esc(titre) + '</h4><p>' + esc(texte) + '</p>';
    (boutons || []).forEach(function (b) { d.appendChild(b); });
    return d;
  }
  function bouton(texte, act, sec) { var b = document.createElement('button'); b.type = 'button'; b.className = 'ki-cta' + (sec ? ' sec' : ''); b.setAttribute('data-a', act); b.textContent = texte; return b; }
  function carteInfo() {
    var d = document.createElement('div'); d.className = 'ki-card';
    d.innerHTML = '<h4>Koffi, guide des fiches d\'inscription</h4><ul><li>' + esc(T.info1) + '</li><li>' + esc(T.info2) + '</li><li>' + esc(T.info3) + '</li><li>' + esc(T.info4) + '</li></ul>' +
      '<p><a class="ki-l" href="/politique-confidentialite.html#koffi" target="_blank" rel="noopener">' + esc(T.infoLien) + '</a></p>';
    d.appendChild(bouton(T.compris, 'compris'));
    return d;
  }
  function carteMajorite() {
    var d = carte(T.majTitre, T.majTexte);
    var l = document.createElement('label'); l.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;cursor:pointer';
    l.innerHTML = '<input type="checkbox" data-maj="case" style="margin-top:3px"><span>' + esc(T.majCase) + '</span>';
    var b = bouton(T.majBtn, 'majorite'); b.disabled = true; b.style.marginTop = '12px';
    l.querySelector('input').addEventListener('change', function (ev) { b.disabled = !ev.target.checked; });
    d.appendChild(l); d.appendChild(b); return d;
  }

  function construireCorps() {
    var body = $('.ki-body'); body.innerHTML = '';
    var foot = $('.ki-foot'), e = S.etat, ta = $('.ki-form textarea'), env = $('.ki-send');
    foot.style.display = ''; ta.disabled = false; env.disabled = false; majMeta();
    $('.ki-av').textContent = (e && e.avertissement) || T.info1;
    S.root.querySelectorAll('[data-a="nouvelle"],[data-a="supprimer"]').forEach(function (b) { b.style.display = e && (e.etat === 'utilisable' || e.etat === 'recharge') ? '' : 'none'; });
    if (!e) { body.appendChild(carte('Koffi', T.indisponible)); foot.style.display = 'none'; return; }
    var st = e.etat;
    if (st === 'majorite') { body.appendChild(carteMajorite()); foot.style.display = 'none'; return; }
    if (st === 'mineur' || st === 'pays' || st === 'desactive' || st === 'indisponible') { body.appendChild(carte('Koffi', T[st] || T.indisponible)); foot.style.display = 'none'; return; }
    if (!lsGet('koffi_inscriptions_info_v1')) { body.appendChild(carteInfo()); foot.style.display = 'none'; return; }
    S.msgs.forEach(function (m, i) { ajouterMessage(m, i === S.msgs.length - 1); });
    if (!S.msgs.length) {
      ajouterMessage({ role: 'assistant', contenu: T.accueil });
      var s = document.createElement('div'); s.className = 'ki-sug';
      (e.creation && e.creation.disponible ? [T.suggestionCreer] : []).concat(T.suggestions).forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.textContent = x; b.addEventListener('click', function () { ta.value = x; envoyer(); }); s.appendChild(b); });
      body.appendChild(s);
    }
    if (st === 'recharge') {
      var pf = e.portefeuille;
      body.appendChild(carte(T.rechargeTitre, pf && pf.premium ? T.rechargeTextePremium : T.rechargeTexte, [bouton(T.recharger, 'credit')]));
      /* La saisie reste ouverte : « Que sais-tu faire ? » est toujours gratuit, même à zéro ; le serveur répond 402 à toute autre demande. */
    }
    body.scrollTop = body.scrollHeight;
  }

  function traduireUI() {
    $('.ki-t b').textContent = T.nom; $('.ki-t span').textContent = T.sous;
    $('.ki-btn span').textContent = T.nom; $('.ki-btn').setAttribute('aria-label', T.ouvrir); $('.ki-btn').title = T.ouvrir;
    $('[data-a="fermer"]').setAttribute('aria-label', T.fermer); $('[data-a="fermer"]').title = T.fermer;
    $('[data-a="nouvelle"]').title = T.nouvelle; $('[data-a="nouvelle"]').setAttribute('aria-label', T.nouvelle);
    $('[data-a="supprimer"]').title = T.supprimer; $('[data-a="supprimer"]').setAttribute('aria-label', T.supprimer);
    $('.ki-form textarea').placeholder = T.placeholder; $('.ki-send').textContent = T.envoyer;
  }

  function chargerEtat() {
    return api('GET', '/api/kofi/inscriptions/etat').then(function (r) {
      if (r.ok) { S.etat = r.data; S.conv = r.data.conversation ? r.data.conversation.id : null; S.msgs = r.data.conversation ? r.data.conversation.messages : []; }
      return r;
    });
  }
  function ouvrirPanneau() {
    S.root.classList.add('open');
    chargerEtat().then(function () { construireCorps(); var ta = $('.ki-form textarea'); if (ta && !ta.disabled && $('.ki-foot').style.display !== 'none' && window.innerWidth > 560) ta.focus(); });
  }
  function fermerPanneau() { S.root.classList.remove('open'); var b = $('.ki-btn'); if (b && !(S.opts && S.opts.telephone)) b.focus(); }

  function retirerActions() { S.root.querySelectorAll('.ki-bro .ki-act, .ki-bro .ki-man').forEach(function (n) { n.remove(); }); }
  function apresCreation() { try { if (S.opts && typeof S.opts.apresCreation === 'function') S.opts.apresCreation(); } catch (e) { /* sans importance */ } }

  function envoyer() {
    if (S.occupe) return;
    var ta = $('.ki-form textarea'); var texte = ta.value.trim(); if (!texte || ta.disabled) return;
    var max = S.etat && S.etat.max_message; if (max && texte.length > max) { ajouterMessage({ role: 'assistant', contenu: 'Message trop long (' + max + ' caractères au maximum).' }); return; }
    S.occupe = true; $('.ki-send').disabled = true;
    var corps = $('.ki-body');
    if (!S.msgs.length) corps.innerHTML = '';
    var mu = { role: 'user', contenu: texte }; S.msgs.push(mu); ajouterMessage(mu);
    ta.value = ''; ta.style.height = 'auto';
    var att = document.createElement('div'); att.className = 'ki-typing'; att.setAttribute('role', 'status'); att.textContent = T.reflechit; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/inscriptions/messages', { texte: texte, conversation_id: S.conv || undefined }).then(function (r) {
      att.remove();
      if (r.ok) {
        S.conv = r.data.conversation_id; S.msgs.push(r.data.message); retirerActions(); ajouterMessage(r.data.message, true);
        if (r.data.message.cree) apresCreation();
        if (S.etat && r.data.portefeuille) S.etat.portefeuille = r.data.portefeuille;
        majMeta();
        if (S.etat && S.etat.etat === 'recharge') construireCorps();   /* la carte de recharge reste sous les derniers messages */
      } else {
        S.msgs.pop();
        var code = r.data && r.data.code;
        if (code === 'credits_epuises') { if (S.etat) { S.etat.etat = 'recharge'; if (r.data.portefeuille) S.etat.portefeuille = r.data.portefeuille; } construireCorps(); }
        else if (code === 'majorite_requise' || code === 'mineur' || code === 'pays_non_pris_en_charge') { chargerEtat().then(construireCorps); }
        else ajouterMessage({ role: 'assistant', contenu: (r.data && r.data.error) || (r.status === 429 ? T.trop : T.erreur) });
      }
    }).catch(function () { att.remove(); S.msgs.pop(); ajouterMessage({ role: 'assistant', contenu: T.erreur }); })
      .then(function () { S.occupe = false; var ok = S.etat && (S.etat.etat === 'utilisable' || S.etat.etat === 'recharge'); $('.ki-send').disabled = !ok; if (ok) ta.focus(); });
  }

  /* Boutons de l'aperçu : « Créer la fiche » et « Abandonner » (sans IA, gratuits). */
  function actionBrouillon(act, id) {
    if (S.occupe || !id) return;
    S.occupe = true;
    var att = document.createElement('div'); att.className = 'ki-typing'; att.setAttribute('role', 'status'); att.textContent = act === 'creer' ? T.creation : '…';
    var corps = $('.ki-body'); retirerActions(); corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/inscriptions/fiche/' + (act === 'creer' ? 'creer' : 'abandonner'), { message_id: id }).then(function (r) {
      att.remove();
      if (r.ok && r.data && r.data.message) { S.msgs.push(r.data.message); ajouterMessage(r.data.message, true); if (act === 'creer') apresCreation(); }
      else { ajouterMessage({ role: 'assistant', contenu: (r.data && r.data.error) || (r.status === 429 ? T.trop : T.erreur) }); chargerEtat().then(construireCorps); }
    }).catch(function () { att.remove(); ajouterMessage({ role: 'assistant', contenu: T.erreur }); })
      .then(function () { S.occupe = false; });
  }

  function confirmerMajorite() {
    var c = S.root.querySelector('[data-maj="case"]'); if (!c || !c.checked || S.occupe) return;
    S.occupe = true;
    api('POST', '/api/kofi/majorite', { confirme: true }).then(function () { S.occupe = false; return chargerEtat().then(construireCorps); }).catch(function () { S.occupe = false; });
  }

  /* Retour de Stripe (?kofi=succes|annule) : le crédit arrive par le webhook, quelques secondes plus tard. */
  function retourPaiement() {
    if (!window.KoffiCredit) return;
    window.KoffiCredit.retourPaiement({ lg: 'fr', onFin: function (statut, msg) {
      S.root.classList.add('open');
      var corps = $('.ki-body');
      if (statut === 'attente') { corps.innerHTML = ''; corps.appendChild(carte('Koffi', msg)); $('.ki-foot').style.display = 'none'; return; }
      chargerEtat().then(function () { construireCorps(); ajouterMessage({ role: 'assistant', contenu: msg }); });
    } });
  }

  function construire() {
    if (!document.getElementById('ki-style')) { var st = document.createElement('style'); st.id = 'ki-style'; st.textContent = CSS; document.head.appendChild(st); }
    var root = document.createElement('div'); root.className = 'ki-root' + (S.opts && S.opts.telephone ? ' ki-tel' : ''); root.setAttribute('data-koffi-inscriptions', '1');
    root.innerHTML =
      '<button type="button" class="ki-btn" data-a="ouvrir"><img src="/assets/koffi-avatar-96.webp" width="46" height="46" alt=""><span></span></button>' +
      '<section class="ki-panel" role="dialog" aria-label="Koffi, guide des fiches d\'inscription" aria-modal="false">' +
        '<div class="ki-head"><img src="/assets/koffi-avatar-96.webp" width="42" height="42" alt=""><div class="ki-t"><b></b><span></span><button type="button" class="ki-credit" data-a="credit" style="display:none"></button></div>' +
          '<button type="button" class="ki-ic" data-a="nouvelle">＋</button><button type="button" class="ki-ic" data-a="supprimer">🗑</button><button type="button" class="ki-ic" data-a="fermer">✕</button></div>' +
        '<div class="ki-body" aria-live="polite"></div>' +
        '<div class="ki-foot"><p class="ki-av"></p><form class="ki-form"><textarea rows="1" maxlength="1500" aria-label="Votre question sur les fiches d\'inscription"></textarea><button type="submit" class="ki-send"></button></form></div>' +
      '</section>';
    document.body.appendChild(root); S.root = root;
    root.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-a]') : null; if (!t) return;
      var act = t.getAttribute('data-a');
      if (act === 'ouvrir') return ouvrirPanneau();
      if (act === 'fermer') return fermerPanneau();
      if (act === 'credit') return ouvrirCredit();
      if (act === 'compris') { lsSet('koffi_inscriptions_info_v1', '1'); return construireCorps(); }
      if (act === 'majorite') return confirmerMajorite();
      if (act === 'creer') return actionBrouillon('creer', Number(t.getAttribute('data-id')));
      if (act === 'abandonner') return actionBrouillon('abandonner', Number(t.getAttribute('data-id')));
      if (act === 'nouvelle') { S.conv = null; S.msgs = []; if (S.etat && S.etat.etat !== 'recharge') construireCorps(); return; }
      if (act === 'supprimer') {
        if (!S.conv) return; if (!window.confirm(T.confirmSuppr)) return;
        return api('DELETE', '/api/kofi/inscriptions/conversations/' + S.conv).then(function () { S.conv = null; S.msgs = []; construireCorps(); });
      }
    });
    root.querySelector('.ki-form').addEventListener('submit', function (ev) { ev.preventDefault(); envoyer(); });
    var ta = root.querySelector('.ki-form textarea');
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; });
    if (!ecouteEchap) { ecouteEchap = true; document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.root && S.root.classList.contains('open') && !document.querySelector('.kcr-fond')) fermerPanneau(); }); }
  }

  window.KoffiInscriptions = {
    /* Monte le bouton SEULEMENT pour une personne connectée (le serveur répond 401 aux autres : rien n'apparaît). */
    monter: function (opts) {
      if (S.root) return;
      S.opts = opts || {};
      return Promise.all([chargerEtat(), chargerCredit()]).then(function (rs) {
        if (!rs[0].ok || S.root) return;
        construire(); traduireUI(); majMeta(); retourPaiement();
      });
    },
    demonter: function () {
      if (S.root && S.root.parentNode) S.root.parentNode.removeChild(S.root);
      S.root = null; S.etat = null; S.conv = null; S.msgs = []; S.occupe = false; S.opts = null;
    },
    estMonte: function () { return !!S.root; }
  };
})();

/* Commande vocale (2026-11-10) : bouton micro commun à tous les Koffi, voir assets/koffi-voix.js */
(function () { if (window.KoffiVoix) return; var s = document.createElement("script"); s.src = "/assets/koffi-voix.js?v=1"; s.async = true; (document.head || document.documentElement).appendChild(s); })();

/* ═════════════════════════════════════════════════
   assets/koffi-sondages.js — KOFFI DES SONDAGES : fenêtre de discussion, PDF / photos joints (2026-11-10)
   ═════════════════════════════════════════════════
   Autonome (CSS injecté, préfixe .ks-) : KoffiSondages.monter({ telephone, apresCreation })
   Dans l'onglet Sondages, la personne joint un PDF ou une photo (JPEG, PNG) : Koffi le LIT et prépare un sondage (titre, questions, types de réponses), demande l'image de
   couverture, propose les lieux d'affichage et les événements à lier. Aperçu écrit par le serveur ; création seulement après le clic « Créer le sondage » (ou un « oui »).
   Toutes les règles (majorité, pays, crédit, droits, formats, poids) sont décidées par le serveur (/api/kofi/sondages/*) : ici on n'affiche que ce qu'il renvoie.
   Un sondage entier = un crédit. Le crédit (pastille, recharge) vient de assets/koffi-credit.js : un seul portefeuille pour tout Koffi.
   États serveur : utilisable | recharge | majorite | mineur | pays | desactive | indisponible.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiSondages) return;

  var T = {
    nom: 'Koffi', sous: 'Assistant des sondages', ouvrir: 'Demander à Koffi de créer un sondage', fermer: 'Fermer', nouvelle: 'Nouvelle conversation',
    supprimer: 'Supprimer cette conversation', confirmSuppr: 'Supprimer cette conversation ? Cette action est définitive.',
    placeholder: 'Écrivez avec vos mots…', envoyer: 'Envoyer', reflechit: 'Koffi réfléchit…', lit: 'Koffi lit le document…',
    accueil: 'Bonjour ! Je suis Koffi. Joignez-moi un document (PDF, photo JPEG ou PNG) et dites-moi « fais-en un sondage » : je repère le titre, les questions et la forme des réponses, je vous demande l\'image de couverture, puis je vous propose où afficher le sondage. Vous pouvez aussi me poser une question sur les sondages.',
    suggestions: ['Que sais-tu faire ?', 'Combien de temps dure un sondage ?', 'Où peut-on afficher un sondage ?'],
    suggestionCreer: 'Joindre un document pour créer un sondage',
    gratuitNote: '✓ Question sur Koffi : gratuite, elle ne compte pas dans votre crédit.',
    info1: 'Joignez un PDF ou une photo : Koffi le lit pour préparer le sondage (titre, questions, choix de réponses). Le fichier n\'est envoyé qu\'une fois, pour ce message, et n\'est pas conservé.',
    info2: 'Koffi voit les titres de vos événements pour pouvoir y lier le sondage, jamais leurs inscrits ni les réponses. Un sondage préparé avec Koffi n\'est créé qu\'après votre clic sur « Créer le sondage ». Si Koffi ne peut pas répondre, votre question (sans votre nom) est transmise à l\'équipe pour améliorer le service.',
    info3: 'Un sondage complet, de la préparation à sa publication, compte pour UN crédit Koffi. Le message, le fichier joint et l\'historique récent sont envoyés à notre prestataire d\'intelligence artificielle, Anthropic Ireland (transferts possibles hors de l\'Union européenne), sans votre nom ni votre e-mail. N\'envoyez aucun document contenant des données personnelles ou confidentielles.',
    info4: 'Vos conversations sont conservées 60 jours au maximum, puis supprimées. Vous pouvez les supprimer à tout moment.',
    infoLien: 'En savoir plus : politique de confidentialité', compris: 'J\'ai compris',
    majTitre: 'Koffi est réservé aux personnes majeures', majTexte: 'Pour utiliser Koffi, confirmez que vous avez 18 ans ou plus. Les sondages restent entièrement utilisables sans lui.', majCase: 'Je confirme avoir 18 ans ou plus', majBtn: 'Confirmer',
    mineur: 'Koffi est réservé aux personnes de 18 ans ou plus. Les sondages restent entièrement utilisables sans lui.',
    pays: 'Koffi n\'est pas disponible dans votre pays pour le moment. Les sondages restent utilisables sans lui.',
    desactive: 'Koffi est désactivé pour le moment.', indisponible: 'Koffi est épuisé pour le moment : l\'équipe le recharge. Réessayez un peu plus tard.',
    rechargeTitre: 'Votre crédit Koffi est épuisé', rechargeTexte: 'Rechargez votre crédit pour continuer : le même crédit sert à tout Koffi (cours, création de formation, Annuaire, événements, fiches d\'inscription, sondages). Un sondage complet compte pour un crédit. Poser une question sur ce que sait faire Koffi reste gratuit.',
    rechargeTextePremium: 'Votre crédit du mois est utilisé : il est renouvelé le mois prochain. Vous pouvez aussi recharger dès maintenant ; le même crédit sert à tout Koffi.', recharger: 'Recharger Koffi',
    erreur: 'Une erreur est survenue. Réessayez.', trop: 'Doucement : patientez quelques secondes avant le message suivant.',
    apercu: 'Aperçu de votre sondage', manque: 'Il manque encore :', creer: 'Créer le sondage', abandonner: 'Abandonner ce brouillon', creation: 'Création en cours…',
    questionsTitre: 'Questions', lieuxTitre: 'Où il sera affiché', ouvrirSondage: 'Voir le sondage',
    joindre: 'Joindre un document', joindreTitre: 'Joindre un PDF ou une photo (JPEG, PNG) que Koffi va lire', couv: 'Image de couverture', couvTitre: 'Joindre l\'image de couverture du sondage',
    retirer: 'Retirer ce fichier', fichierLourd: 'Ce fichier est trop lourd (3 Mo au maximum pour l\'ensemble des fichiers). Réduisez le PDF ou choisissez une photo plus légère.',
    fichierFormat: 'Je ne sais lire que les PDF et les photos JPEG ou PNG.', fichierTrop: 'Trois fichiers au plus à la fois.', fichierLecture: 'Impossible de lire ce fichier.',
    couvAttendue: 'Koffi attend votre image de couverture : joignez-la avec « Image de couverture », ou répondez « sans image ».'
  };

  var CSS = [
    '.ks-root,.ks-root *{box-sizing:border-box}',
    '.ks-root{position:fixed;right:88px;bottom:22px;z-index:9000;font-family:inherit;color:#0f172a;line-height:1.45}',
    '.ks-btn{display:flex;align-items:center;gap:10px;border:0;cursor:pointer;background:#0D2B4E;color:#fff;border-radius:999px;padding:5px 18px 5px 5px;box-shadow:0 8px 26px rgba(13,43,78,.38),0 0 0 2px #F26422;font:700 14px/1.2 inherit;font-family:inherit}',
    '.ks-btn:hover{transform:translateY(-1px)}.ks-btn:focus-visible{outline:3px solid #F26422;outline-offset:3px}',
    '.ks-btn img{width:46px;height:46px;border-radius:50%;display:block;background:#fff}',
    '.ks-panel{position:fixed;right:18px;bottom:18px;width:400px;max-width:calc(100vw - 24px);height:min(660px,calc(100vh - 36px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(2,12,27,.45),0 0 0 1px rgba(13,43,78,.15);display:none;flex-direction:column;overflow:hidden;color:#0f172a;text-align:left}',
    '.ks-root.open .ks-panel{display:flex}.ks-root.open .ks-btn{display:none}',
    '.ks-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0D2B4E;flex:none}',
    '.ks-head img{width:42px;height:42px;border-radius:50%;background:#fff;flex:none}',
    '.ks-t{flex:1;min-width:0}.ks-t b{display:block;font-size:16px;color:#fff}.ks-t span{display:block;font-size:11.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ks-t .ks-credit{margin-top:3px;max-width:100%;overflow:hidden;text-overflow:ellipsis}',
    '.ks-ic{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:9px;min-width:34px;height:34px;cursor:pointer;font:700 14px inherit;font-family:inherit;padding:0 8px}',
    '.ks-ic:hover{background:rgba(255,255,255,.24)}.ks-ic:focus-visible{outline:2px solid #F26422}',
    '.ks-body{flex:1;overflow-y:auto;padding:14px;background:#f1f5f9;display:flex;flex-direction:column;gap:10px}',
    '.ks-msg{max-width:92%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.ks-msg.u{align-self:flex-end;background:#0D2B4E;color:#fff;border-bottom-right-radius:4px}',
    '.ks-msg.a{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
    '.ks-note{margin-top:6px;font-size:11.5px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:5px 8px;white-space:normal;font-weight:700}',
    '.ks-typing{align-self:flex-start;color:#475569;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:8px 12px}',
    '.ks-sug{display:flex;flex-wrap:wrap;gap:6px}.ks-sug button{background:#fff;border:1px solid #cbd5e1;border-radius:99px;padding:6px 11px;font-size:12.5px;cursor:pointer;color:#0D2B4E;text-align:left;font-family:inherit}',
    '.ks-sug button:hover{background:#fff7ed;border-color:#F26422}',
    '.ks-foot{flex:none;background:#fff;border-top:1px solid #e2e8f0;padding:8px 10px 10px}',
    '.ks-av{margin:0 0 6px;font-size:11px;color:#64748b;line-height:1.35}',
    '.ks-form{display:flex;gap:8px;align-items:flex-end}',
    '.ks-form textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font:14px/1.4 inherit;font-family:inherit;max-height:110px;min-height:42px;background:#fff;color:#0f172a}',
    '.ks-form textarea:focus{outline:2px solid #F26422;border-color:#F26422}',
    '.ks-send{border:0;background:#F26422;color:#fff;border-radius:12px;height:42px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.ks-send:disabled{opacity:.5;cursor:not-allowed}',
    '.ks-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;font-size:13.5px;line-height:1.55;color:#0f172a}',
    '.ks-card h4{margin:0 0 6px;font-size:15px;color:#0D2B4E}.ks-card p{margin:0 0 8px;color:#0f172a}',
    '.ks-card ul{margin:8px 0 12px;padding-left:18px}.ks-card li{margin:4px 0}',
    '.ks-card a.ks-l{color:#b84c1a;font-weight:700}',
    '.ks-cta{display:inline-block;border:0;background:#F26422;color:#fff;font-weight:800;padding:10px 18px;border-radius:10px;text-decoration:none;cursor:pointer;font-family:inherit;font-size:14px;margin:4px 8px 0 0}',
    '.ks-cta.sec{background:#fff;color:#0D2B4E;border:1.5px solid #0D2B4E}.ks-cta[disabled]{opacity:.55;cursor:not-allowed}',
    '.ks-cta:focus-visible{outline:3px solid #0D2B4E;outline-offset:2px}',
    /* Aperçu de la fiche en préparation */
    '.ks-bro{align-self:stretch;background:#fff;border:2px solid #F26422;border-radius:14px;padding:12px;font-size:13.5px;line-height:1.5;color:#0f172a}',
    '.ks-bro h4{margin:0 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#b84c1a}',
    '.ks-bro b{display:block;font-size:15px;color:#0D2B4E;overflow-wrap:anywhere}',
    '.ks-bro h5{margin:10px 0 3px;font-size:12px;color:#475569;text-transform:uppercase;letter-spacing:.03em}',
    '.ks-bro p{margin:4px 0;overflow-wrap:anywhere}.ks-bro .ks-q{color:#9a3412;font-weight:700}',
    '.ks-bro ul{margin:2px 0 4px;padding-left:18px}.ks-bro li{margin:2px 0;overflow-wrap:anywhere}',
    '.ks-bro .ks-man{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:#fff7ed;color:#9a3412;font-weight:700}',
    '.ks-bro .ks-info{margin:8px 0 0;font-size:12px;color:#475569}',
    '.ks-bro .ks-act{margin-top:10px}',
    '@media (max-width:560px){.ks-root{right:10px;bottom:calc(10px + env(safe-area-inset-bottom))}.ks-btn span{display:none}.ks-btn{padding:4px}.ks-panel{right:0;bottom:0;left:0;width:100%;max-width:none;height:80vh;height:80dvh;border-radius:16px 16px 0 0}.ks-form textarea{font-size:16px}}',
    /* Appli téléphone (m.html) : bouton compact au-dessus du pied de page, feuille dans la largeur de l'appli. */
    '.ks-tel{right:max(10px,calc((100vw - 560px)/2 + 10px));bottom:calc(78px + env(safe-area-inset-bottom))}.ks-tel .ks-btn span{display:none}.ks-tel .ks-btn{padding:4px}',
    '.ks-tel .ks-panel{right:0;bottom:0;left:0;width:100%;max-width:560px;margin:0 auto;height:80vh;height:80dvh;border-radius:16px 16px 0 0}.ks-tel .ks-form textarea{font-size:16px}',
    '.ks-bro .ks-couv{display:block;width:100%;max-height:150px;object-fit:cover;border-radius:10px;margin:0 0 8px;background:#e2e8f0}',
    '.ks-bro ol{margin:2px 0 4px;padding-left:20px}.ks-bro ol li{margin:3px 0;overflow-wrap:anywhere}',
    '.ks-fich{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 6px}.ks-fich:empty{display:none}',
    '.ks-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;background:#eff6ff;border:1px solid #bfdbfe;color:#0D2B4E;border-radius:99px;padding:3px 4px 3px 10px;font-size:12px}',
    '.ks-chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px}.ks-chip button{border:0;background:#dbeafe;color:#0D2B4E;border-radius:50%;width:22px;height:22px;cursor:pointer;font:700 13px/1 inherit;font-family:inherit}',
    '.ks-chip.couv{background:#fff7ed;border-color:#fdba74;color:#9a3412}.ks-chip.couv button{background:#ffedd5;color:#9a3412}',
    '.ks-joindre{display:flex;gap:6px;margin:0 0 6px}',
    '.ks-j{border:1px solid #cbd5e1;background:#fff;color:#0D2B4E;border-radius:10px;padding:6px 10px;font:700 12.5px inherit;font-family:inherit;cursor:pointer;min-height:36px}',
    '.ks-j:hover{background:#f8fafc;border-color:#0D2B4E}.ks-j:focus-visible{outline:2px solid #F26422}.ks-j.attend{border-color:#F26422;background:#fff7ed;color:#9a3412;box-shadow:0 0 0 2px rgba(242,100,34,.25)}',
    '.ks-j:disabled{opacity:.5;cursor:not-allowed}',
    '@media (prefers-reduced-motion:no-preference){.ks-btn{transition:transform .15s}}'
  ].join('\n');

  var S = { opts: null, etat: null, conv: null, msgs: [], root: null, occupe: false, fichiers: [], attend: false };
  var MAX_FICHIERS = 3, MAX_OCTETS = 3 * 1000 * 1000;
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
    if (S.opts && S.opts.telephone) return /^#\/sondages$/.test(String(l.tel || '')) ? l.tel : '#';
    return /^[\w\-\/]+\.html(\?[\w=&%\-]*)?$/.test(String(l.url || '')) ? l.url : '#';
  }

  function chargerScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); });
  }
  var chargerCredit = function () { return chargerScript('/assets/koffi-credit.js?v=3', function () { return !!window.KoffiCredit; }); };

  /* ── Le crédit : pastille cliquable dans l'en-tête ── */
  function majMeta() {
    var p = $('.ks-credit'), e = S.etat, pf = e && e.portefeuille;
    if (!p) return;
    p.style.display = pf && window.KoffiCredit ? '' : 'none';
    if (pf && window.KoffiCredit) window.KoffiCredit.appliquer(p, pf, 'fr');
  }
  function ouvrirCredit() { if (window.KoffiCredit) window.KoffiCredit.ouvrir({ lg: 'fr', page: S.opts && S.opts.telephone ? 'telephone' : 'sondages' }); }

  function liste(titre, lignes) {
    if (!lignes || !lignes.length) return '';
    return '<h5>' + esc(titre) + '</h5><ul>' + lignes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }
  /* Aperçu du sondage en préparation : écrit par le serveur ; les boutons ne figurent que sur le DERNIER aperçu, et seulement quand rien ne manque. */
  function listeNum(titre, lignes) {
    if (!lignes || !lignes.length) return '';
    return '<h5>' + esc(titre) + '</h5><ol>' + lignes.map(function (x) { return '<li>' + esc(String(x).replace(/^\d+\.\s*/, '')) + '</li>'; }).join('') + '</ol>';
  }
  function carteBrouillon(b, messageId, actif) {
    var d = document.createElement('div'); d.className = 'ks-bro';
    var couv = b.couverture && /^(https:\/\/|\/(?!\/))/.test(String(b.couverture)) ? '<img class="ks-couv" alt="" src="' + esc(b.couverture) + '">' : '';
    d.innerHTML = '<h4>' + esc(T.apercu) + '</h4>' + couv + '<b>' + esc(b.titre || '…') + '</b>' +
      (b.categorie ? '<p>' + esc(b.categorie) + '</p>' : '') + (b.description ? '<p>' + esc(b.description) + '</p>' : '') +
      (b.quand ? '<p class="ks-q">' + esc(b.quand) + '</p>' : '') +
      listeNum(T.questionsTitre, b.questions) +
      (b.repondants ? '<p>' + esc(b.repondants) + '</p>' : '') + (b.resultats ? '<p>' + esc(b.resultats) + '</p>' : '') +
      (b.couverture_texte ? '<p>' + esc(b.couverture_texte) + '</p>' : '') +
      liste(T.lieuxTitre, b.lieux && b.lieux.length ? b.lieux : ['Aucun lieu choisi']) +
      (b.statut ? '<p class="ks-info">' + esc(b.statut) + '</p>' : '');
    if (!actif) return d;
    if (b.pret) {
      var a = document.createElement('div'); a.className = 'ks-act';
      var c = bouton(T.creer, 'creer'); c.setAttribute('data-id', String(messageId));
      var x = bouton(T.abandonner, 'abandonner', true); x.setAttribute('data-id', String(messageId));
      a.appendChild(c); a.appendChild(x); d.appendChild(a);
    } else if (b.manquants && b.manquants.length) {
      var m = document.createElement('div'); m.className = 'ks-man'; m.textContent = T.manque + ' ' + b.manquants.join(', ') + '.'; d.appendChild(m);
    }
    return d;
  }
  function ajouterMessage(m, actif) {
    var el = document.createElement('div');
    el.className = 'ks-msg ' + (m.role === 'user' ? 'u' : 'a');
    el.textContent = m.contenu;
    if (m.role !== 'user' && m.gratuit) { var n = document.createElement('div'); n.className = 'ks-note'; n.textContent = T.gratuitNote; el.appendChild(n); }
    var corps = $('.ks-body'); corps.appendChild(el);
    if (m.role !== 'user' && m.brouillon) corps.appendChild(carteBrouillon(m.brouillon, m.id, !!actif));
    if (m.role !== 'user' && m.lien) {
      var href = lienSur(m.lien);
      if (href !== '#') {
        var lk = document.createElement('a'); lk.className = 'ks-cta'; lk.href = href; lk.textContent = m.lien.texte || T.ouvrirSondage;
        lk.addEventListener('click', function () { if (S.opts && S.opts.telephone) fermerPanneau(); });
        corps.appendChild(lk);
      }
    }
    corps.scrollTop = corps.scrollHeight;
    return el;
  }

  /* ── Cartes d'état ── */
  function carte(titre, texte, boutons) {
    var d = document.createElement('div'); d.className = 'ks-card';
    d.innerHTML = '<h4>' + esc(titre) + '</h4><p>' + esc(texte) + '</p>';
    (boutons || []).forEach(function (b) { d.appendChild(b); });
    return d;
  }
  function bouton(texte, act, sec) { var b = document.createElement('button'); b.type = 'button'; b.className = 'ks-cta' + (sec ? ' sec' : ''); b.setAttribute('data-a', act); b.textContent = texte; return b; }
  function carteInfo() {
    var d = document.createElement('div'); d.className = 'ks-card';
    d.innerHTML = '<h4>Koffi, assistant des sondages</h4><ul><li>' + esc(T.info1) + '</li><li>' + esc(T.info2) + '</li><li>' + esc(T.info3) + '</li><li>' + esc(T.info4) + '</li></ul>' +
      '<p><a class="ks-l" href="/politique-confidentialite.html#koffi" target="_blank" rel="noopener">' + esc(T.infoLien) + '</a></p>';
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
    var body = $('.ks-body'); body.innerHTML = '';
    var foot = $('.ks-foot'), e = S.etat, ta = $('.ks-form textarea'), env = $('.ks-send');
    foot.style.display = ''; ta.disabled = false; env.disabled = false; majMeta();
    $('.ks-av').textContent = (e && e.avertissement) || T.info1;
    S.root.querySelectorAll('[data-a="nouvelle"],[data-a="supprimer"]').forEach(function (b) { b.style.display = e && (e.etat === 'utilisable' || e.etat === 'recharge') ? '' : 'none'; });
    if (!e) { body.appendChild(carte('Koffi', T.indisponible)); foot.style.display = 'none'; return; }
    var st = e.etat;
    if (st === 'majorite') { body.appendChild(carteMajorite()); foot.style.display = 'none'; return; }
    if (st === 'mineur' || st === 'pays' || st === 'desactive' || st === 'indisponible') { body.appendChild(carte('Koffi', T[st] || T.indisponible)); foot.style.display = 'none'; return; }
    if (!lsGet('koffi_sondages_info_v1')) { body.appendChild(carteInfo()); foot.style.display = 'none'; return; }
    S.msgs.forEach(function (m, i) { ajouterMessage(m, i === S.msgs.length - 1); });
    var dm = S.msgs[S.msgs.length - 1]; S.attend = !!(dm && dm.role !== 'user' && dm.attend === 'couverture'); majPuces();
    if (!S.msgs.length) {
      ajouterMessage({ role: 'assistant', contenu: T.accueil });
      var s = document.createElement('div'); s.className = 'ks-sug';
      (e.creation && e.creation.disponible ? [T.suggestionCreer] : []).concat(T.suggestions).forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.textContent = x; b.addEventListener('click', function () { if (x === T.suggestionCreer) { var inp = S.root.querySelector('.ks-in[data-r="lire"]'); if (inp) inp.click(); return; } ta.value = x; envoyer(); }); s.appendChild(b); });
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
    $('.ks-t b').textContent = T.nom; $('.ks-t span').textContent = T.sous;
    $('.ks-btn span').textContent = T.nom; $('.ks-btn').setAttribute('aria-label', T.ouvrir); $('.ks-btn').title = T.ouvrir;
    $('[data-a="fermer"]').setAttribute('aria-label', T.fermer); $('[data-a="fermer"]').title = T.fermer;
    $('[data-a="nouvelle"]').title = T.nouvelle; $('[data-a="nouvelle"]').setAttribute('aria-label', T.nouvelle);
    $('[data-a="supprimer"]').title = T.supprimer; $('[data-a="supprimer"]').setAttribute('aria-label', T.supprimer);
    $('.ks-form textarea').placeholder = T.placeholder; $('.ks-send').textContent = T.envoyer;
    var bj = $('[data-a="joindre"]'), bc = $('[data-a="couv"]');
    bj.textContent = T.joindre; bj.title = T.joindreTitre; bc.textContent = T.couv; bc.title = T.couvTitre;
  }

  function chargerEtat() {
    return api('GET', '/api/kofi/sondages/etat').then(function (r) {
      if (r.ok) { S.etat = r.data; S.conv = r.data.conversation ? r.data.conversation.id : null; S.msgs = r.data.conversation ? r.data.conversation.messages : []; }
      return r;
    });
  }
  function ouvrirPanneau() {
    S.root.classList.add('open');
    chargerEtat().then(function () { construireCorps(); var ta = $('.ks-form textarea'); if (ta && !ta.disabled && $('.ks-foot').style.display !== 'none' && window.innerWidth > 560) ta.focus(); });
  }
  function fermerPanneau() { S.root.classList.remove('open'); var b = $('.ks-btn'); if (b && !(S.opts && S.opts.telephone)) b.focus(); }


  /* ── Fichiers joints : lus ici, envoyés avec le message (le serveur contrôle le contenu réel) ── */
  function majPuces() {
    var c = $('.ks-fich'); c.innerHTML = '';
    S.fichiers.forEach(function (f, i) {
      var p = document.createElement('div'); p.className = 'ks-chip' + (f.role === 'couverture' ? ' couv' : '');
      p.innerHTML = '<span>' + esc((f.role === 'couverture' ? T.couv + ' : ' : '') + f.nom) + '</span><button type="button" aria-label="' + esc(T.retirer) + '" title="' + esc(T.retirer) + '" data-retirer="' + i + '">×</button>';
      c.appendChild(p);
    });
    var bc = $('[data-a="couv"]'); if (bc) bc.classList.toggle('attend', !!S.attend);
  }
  function lireDataUrl(file) {
    return new Promise(function (ok, ko) { var r = new FileReader(); r.onload = function () { ok(String(r.result)); }; r.onerror = ko; r.readAsDataURL(file); });
  }
  /* Une photo est réduite (1600 px au plus, JPEG) pour tenir dans la limite de poids ; un PDF est envoyé tel quel. */
  function reduirePhoto(dataUrl) {
    return new Promise(function (ok) {
      var img = new Image();
      img.onload = function () {
        try {
          var max = 1600, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
          if (k >= 1 && dataUrl.length < 900000) return ok(dataUrl);
          var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
          var cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(img, 0, 0, cv.width, cv.height);
          ok(cv.toDataURL('image/jpeg', 0.85));
        } catch (e) { ok(dataUrl); }
      };
      img.onerror = function () { ok(dataUrl); };
      img.src = dataUrl;
    });
  }
  function octets(dataUrl) { var b = String(dataUrl).split(',')[1] || ''; return Math.floor(b.length * 3 / 4); }
  function ajouterFichiers(liste, role) {
    var files = Array.prototype.slice.call(liste || []);
    if (role === 'couverture') S.fichiers = S.fichiers.filter(function (f) { return f.role !== 'couverture'; });
    var suite = Promise.resolve();
    files.forEach(function (file) {
      suite = suite.then(function () {
        if (S.fichiers.length >= MAX_FICHIERS) { ajouterMessage({ role: 'assistant', contenu: T.fichierTrop }); return; }
        var type = String(file.type || '').toLowerCase();
        var okType = /^application\/pdf$/.test(type) || /^image\/(jpeg|png)$/.test(type) || /\.(pdf|jpe?g|png)$/i.test(file.name || '');
        if (!okType || (role === 'couverture' && /pdf/i.test(type + file.name))) { ajouterMessage({ role: 'assistant', contenu: T.fichierFormat }); return; }
        return lireDataUrl(file).then(function (d) {
          var estPdf = /^data:application\/pdf/i.test(d) || /\.pdf$/i.test(file.name || '');
          return (estPdf ? Promise.resolve(d) : reduirePhoto(d)).then(function (dd) {
            var total = octets(dd); S.fichiers.forEach(function (f) { total += octets(f.data); });
            if (total > MAX_OCTETS) { ajouterMessage({ role: 'assistant', contenu: T.fichierLourd }); return; }
            S.fichiers.push({ nom: String(file.name || 'fichier').slice(0, 80), data: dd, role: role === 'couverture' ? 'couverture' : 'lire' });
          });
        }).catch(function () { ajouterMessage({ role: 'assistant', contenu: T.fichierLecture }); });
      });
    });
    return suite.then(majPuces);
  }

  function retirerActions() { S.root.querySelectorAll('.ks-bro .ks-act, .ks-bro .ks-man').forEach(function (n) { n.remove(); }); }
  function apresCreation() { try { if (S.opts && typeof S.opts.apresCreation === 'function') S.opts.apresCreation(); } catch (e) { /* sans importance */ } }

  function envoyer() {
    if (S.occupe) return;
    var ta = $('.ks-form textarea'); var texte = ta.value.trim(); if (ta.disabled) return;
    var fichiers = S.fichiers.slice(); if (!texte && !fichiers.length) return;
    var max = S.etat && S.etat.max_message; if (max && texte.length > max) { ajouterMessage({ role: 'assistant', contenu: 'Message trop long (' + max + ' caractères au maximum).' }); return; }
    S.occupe = true; $('.ks-send').disabled = true;
    var corps = $('.ks-body');
    if (!S.msgs.length) corps.innerHTML = '';
    var mu = { role: 'user', contenu: (texte || 'Voici le document joint.') + (fichiers.length ? '\n[Fichier joint : ' + fichiers.map(function (f) { return f.nom; }).join(', ') + ']' : '') }; S.msgs.push(mu); ajouterMessage(mu);
    S.fichiers = []; majPuces();
    ta.value = ''; ta.style.height = 'auto';
    var att = document.createElement('div'); att.className = 'ks-typing'; att.setAttribute('role', 'status'); att.textContent = fichiers.some(function (f) { return f.role !== 'couverture'; }) ? T.lit : T.reflechit; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/sondages/messages', { texte: texte, conversation_id: S.conv || undefined, fichiers: fichiers.length ? fichiers : undefined }).then(function (r) {
      att.remove();
      if (r.ok) {
        S.conv = r.data.conversation_id; S.msgs.push(r.data.message); retirerActions(); ajouterMessage(r.data.message, true);
        S.attend = r.data.message.attend === 'couverture'; majPuces();
        if (r.data.message.cree) apresCreation();
        if (S.etat && r.data.portefeuille) S.etat.portefeuille = r.data.portefeuille;
        majMeta();
        if (S.etat && S.etat.etat === 'recharge') construireCorps();   /* la carte de recharge reste sous les derniers messages */
      } else {
        S.msgs.pop(); S.fichiers = fichiers.concat(S.fichiers); majPuces();
        var code = r.data && r.data.code;
        if (code === 'credits_epuises') { if (S.etat) { S.etat.etat = 'recharge'; if (r.data.portefeuille) S.etat.portefeuille = r.data.portefeuille; } construireCorps(); }
        else if (code === 'majorite_requise' || code === 'mineur' || code === 'pays_non_pris_en_charge') { chargerEtat().then(construireCorps); }
        else ajouterMessage({ role: 'assistant', contenu: (r.data && r.data.error) || (r.status === 429 ? T.trop : T.erreur) });
      }
    }).catch(function () { att.remove(); S.msgs.pop(); S.fichiers = fichiers.concat(S.fichiers); majPuces(); ajouterMessage({ role: 'assistant', contenu: T.erreur }); })
      .then(function () { S.occupe = false; var ok = S.etat && (S.etat.etat === 'utilisable' || S.etat.etat === 'recharge'); $('.ks-send').disabled = !ok; if (ok) ta.focus(); });
  }

  /* Boutons de l'aperçu : « Créer la fiche » et « Abandonner » (sans IA, gratuits). */
  function actionBrouillon(act, id) {
    if (S.occupe || !id) return;
    S.occupe = true;
    var att = document.createElement('div'); att.className = 'ks-typing'; att.setAttribute('role', 'status'); att.textContent = act === 'creer' ? T.creation : '…';
    var corps = $('.ks-body'); retirerActions(); corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/sondages/sondage/' + (act === 'creer' ? 'creer' : 'abandonner'), { message_id: id }).then(function (r) {
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
      var corps = $('.ks-body');
      if (statut === 'attente') { corps.innerHTML = ''; corps.appendChild(carte('Koffi', msg)); $('.ks-foot').style.display = 'none'; return; }
      chargerEtat().then(function () { construireCorps(); ajouterMessage({ role: 'assistant', contenu: msg }); });
    } });
  }

  function construire() {
    if (!document.getElementById('ks-style')) { var st = document.createElement('style'); st.id = 'ks-style'; st.textContent = CSS; document.head.appendChild(st); }
    var root = document.createElement('div'); root.className = 'ks-root' + (S.opts && S.opts.telephone ? ' ks-tel' : ''); root.setAttribute('data-koffi-sondages', '1');
    root.innerHTML =
      '<button type="button" class="ks-btn" data-a="ouvrir"><img src="/assets/koffi-avatar-96.webp" width="46" height="46" alt=""><span></span></button>' +
      '<section class="ks-panel" role="dialog" aria-label="Koffi, assistant des sondages" aria-modal="false">' +
        '<div class="ks-head"><img src="/assets/koffi-avatar-96.webp" width="42" height="42" alt=""><div class="ks-t"><b></b><span></span><button type="button" class="ks-credit" data-a="credit" style="display:none"></button></div>' +
          '<button type="button" class="ks-ic" data-a="nouvelle">＋</button><button type="button" class="ks-ic" data-a="supprimer">🗑</button><button type="button" class="ks-ic" data-a="fermer">✕</button></div>' +
        '<div class="ks-body" aria-live="polite"></div>' +
        '<div class="ks-foot"><p class="ks-av"></p><div class="ks-fich"></div><div class="ks-joindre"><button type="button" class="ks-j" data-a="joindre"></button><button type="button" class="ks-j" data-a="couv"></button><input type="file" class="ks-in" data-r="lire" accept="application/pdf,image/jpeg,image/png" multiple hidden><input type="file" class="ks-in" data-r="couverture" accept="image/jpeg,image/png" hidden></div><form class="ks-form"><textarea rows="1" maxlength="1500" aria-label="Votre message à Koffi, assistant des sondages"></textarea><button type="submit" class="ks-send"></button></form></div>' +
      '</section>';
    document.body.appendChild(root); S.root = root;
    root.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-a]') : null; if (!t) return;
      var act = t.getAttribute('data-a');
      if (act === 'ouvrir') return ouvrirPanneau();
      if (act === 'fermer') return fermerPanneau();
      if (act === 'credit') return ouvrirCredit();
      if (act === 'joindre') { var i1 = S.root.querySelector('.ks-in[data-r="lire"]'); if (i1) i1.click(); return; }
      if (act === 'couv') { var i2 = S.root.querySelector('.ks-in[data-r="couverture"]'); if (i2) i2.click(); return; }
      if (act === 'compris') { lsSet('koffi_sondages_info_v1', '1'); return construireCorps(); }
      if (act === 'majorite') return confirmerMajorite();
      if (act === 'creer') return actionBrouillon('creer', Number(t.getAttribute('data-id')));
      if (act === 'abandonner') return actionBrouillon('abandonner', Number(t.getAttribute('data-id')));
      if (act === 'nouvelle') { S.conv = null; S.msgs = []; S.fichiers = []; S.attend = false; majPuces(); if (S.etat && S.etat.etat !== 'recharge') construireCorps(); return; }
      if (act === 'supprimer') {
        if (!S.conv) return; if (!window.confirm(T.confirmSuppr)) return;
        return api('DELETE', '/api/kofi/sondages/conversations/' + S.conv).then(function () { S.conv = null; S.msgs = []; construireCorps(); });
      }
    });
    root.addEventListener('click', function (ev) { var r = ev.target.closest ? ev.target.closest('[data-retirer]') : null; if (!r) return; S.fichiers.splice(Number(r.getAttribute('data-retirer')), 1); majPuces(); });
    root.querySelectorAll('.ks-in').forEach(function (inp) { inp.addEventListener('change', function () { var role = inp.getAttribute('data-r'); var l = inp.files; ajouterFichiers(l, role).then(function () { inp.value = ''; }); }); });
    root.querySelector('.ks-form').addEventListener('submit', function (ev) { ev.preventDefault(); envoyer(); });
    var ta = root.querySelector('.ks-form textarea');
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; });
    if (!ecouteEchap) { ecouteEchap = true; document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.root && S.root.classList.contains('open') && !document.querySelector('.kcr-fond')) fermerPanneau(); }); }
  }

  window.KoffiSondages = {
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

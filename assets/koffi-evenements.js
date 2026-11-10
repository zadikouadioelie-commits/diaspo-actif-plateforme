/* ═════════════════════════════════════════════════
   assets/koffi-evenements.js — KOFFI, GUIDE DES ÉVÉNEMENTS : fenêtre de discussion (2026-11-01)
   ═════════════════════════════════════════════════
   Autonome (CSS injecté, préfixe .ke-) : KoffiEvenements.monter({ telephone })
   Une personne demande, en langage courant, les événements qui l'intéressent (« quels sont les événements de ma ville cette semaine ? ») ;
   Koffi les traduit en critères, le SERVEUR cherche parmi les événements PUBLICS à venir et renvoie au plus 8 cartes (date, lieu, gratuit / payant).
   Un clic ouvre la fiche de l'événement. Toutes les règles (majorité, pays, crédit, ville du profil) sont décidées par le serveur (/api/kofi/evenements/*) :
   ici on n'affiche que ce qu'il renvoie. Le crédit (pastille, recharge) vient de assets/koffi-credit.js : un seul portefeuille pour tout Koffi.
   Sur le téléphone (m.html) les cartes ouvrent la fiche dans l'appli (#/evenement/ID) au lieu d'un nouvel onglet.
   États serveur : utilisable | recharge | majorite | mineur | pays | desactive | indisponible.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiEvenements) return;

  var T = {
    nom: 'Koffi', sous: 'Guide des événements', ouvrir: 'Demander à Koffi de trouver un événement', fermer: 'Fermer', nouvelle: 'Nouvelle recherche',
    supprimer: 'Supprimer cette conversation', confirmSuppr: 'Supprimer cette conversation ? Cette action est définitive.',
    placeholder: 'Écrivez avec vos mots…', envoyer: 'Envoyer', reflechit: 'Koffi cherche parmi les événements…',
    accueil: 'Bonjour ! Je suis Koffi. Parlez-moi avec vos mots : je trouve les événements qui vous intéressent (une ville, un jour, un thème, gratuit ou payant, en ligne), je vous explique comment ils fonctionnent et, si votre compte peut en publier, je prépare avec vous un événement flash.',
    suggestions: ['Que sais-tu faire ?', 'Quels sont les événements de ma ville cette semaine ?', 'Des événements gratuits ce week-end', 'Une conférence en ligne le mois prochain'],
    gratuitNote: '✓ Question sur Koffi : gratuite, elle ne compte pas dans votre crédit.',
    info1: 'Koffi ne propose que les événements publics à venir. Les événements privés, réservés aux abonnés ou en brouillon ne sont jamais montrés. Les filtres de la page permettent de tout parcourir.',
    info2: 'Koffi ne voit aucun événement : il transforme votre demande en critères de recherche. C\'est le serveur de Diaspo\'Actif qui cherche et affiche les événements.',
    info3: 'Votre message et l\'historique récent de la conversation sont envoyés à notre prestataire d\'intelligence artificielle, Anthropic Ireland (transferts possibles hors de l\'Union européenne), sans votre nom ni votre e-mail. Votre ville n\'est lue par la plateforme que pour répondre à « ma ville » ; elle n\'est jamais transmise à Koffi. Ne saisissez aucune donnée sensible (santé, religion, opinions…).',
    info4: 'Vos conversations sont conservées 60 jours au maximum, puis supprimées. Vous pouvez les supprimer à tout moment.',
    infoLien: 'En savoir plus : politique de confidentialité', compris: 'J\'ai compris',
    voir: 'Voir l\'événement', manuel: 'Utiliser les filtres de la page', enLigne: 'En ligne',
    partic: { gratuit: 'Gratuit', payant: 'Payant', partiel: 'Partiellement payant' },
    majTitre: 'Koffi est réservé aux personnes majeures', majTexte: 'Pour utiliser Koffi, confirmez que vous avez 18 ans ou plus. La liste des événements reste entièrement utilisable sans lui.', majCase: 'Je confirme avoir 18 ans ou plus', majBtn: 'Confirmer',
    mineur: 'Koffi est réservé aux personnes de 18 ans ou plus. La liste des événements reste entièrement utilisable sans lui.',
    pays: 'Koffi n\'est pas disponible dans votre pays pour le moment. Les filtres de la page restent disponibles.',
    desactive: 'Koffi est désactivé pour le moment.', indisponible: 'Koffi est momentanément indisponible. Réessayez un peu plus tard.',
    rechargeTitre: 'Votre crédit Koffi est épuisé', rechargeTexte: 'Rechargez votre crédit pour continuer : le même crédit sert à tout Koffi (cours, création de formation, Annuaire, événements). Poser une question sur ce que sait faire Koffi reste gratuit.',
    rechargeTextePremium: 'Votre crédit du mois est utilisé : il est renouvelé le mois prochain. Vous pouvez aussi recharger dès maintenant ; le même crédit sert à tout Koffi.', recharger: 'Recharger mon crédit',
    erreur: 'Une erreur est survenue. Réessayez.', trop: 'Doucement : patientez quelques secondes avant le message suivant.',
    paiementRecu: 'Paiement reçu : votre crédit est en cours d\'ajout…',
    /* Création d'un événement flash (comptes Initiative, Collectivité et Administrateur avec Premium) */
    info5: 'Si vous créez un événement flash avec moi et joignez une image, elle est enregistrée sur nos serveurs pour illustrer l\'événement ; elle n\'est jamais envoyée à l\'intelligence artificielle. Rien n\'est publié sans votre confirmation.',
    suggestionFlash: 'Crée-moi un événement flash',
    joindre: 'Joindre une image', retirerImage: 'Retirer l\'image', imageIllisible: 'Cette image n\'a pas pu être lue. Essayez une image JPG ou PNG.',
    apercu: 'Aperçu de votre événement flash', manque: 'Il manque encore :', publier: 'Publier', abandonner: 'Abandonner ce brouillon', publication: 'Publication en cours…',
    imageJointe: 'J\'ai joint l\'image.', photoApercu: 'Image de l\'événement',
    /* Écrire et publier (ou programmer) une publication du fil : ouvert à tout compte */
    suggestionPub: 'Écris une publication pour mon fil', apercuPub: 'Aperçu de votre publication', programmer: 'Programmer', quandPub: 'Quand :',
    photoPub: 'Image de la publication'
  };

  var CSS = [
    '.ke-root,.ke-root *{box-sizing:border-box}',
    '.ke-root{position:fixed;right:88px;bottom:22px;z-index:9000;font-family:inherit;color:#0f172a;line-height:1.45}',
    '.ke-btn{display:flex;align-items:center;gap:10px;border:0;cursor:pointer;background:#0D2B4E;color:#fff;border-radius:999px;padding:5px 18px 5px 5px;box-shadow:0 8px 26px rgba(13,43,78,.38),0 0 0 2px #F26422;font:700 14px/1.2 inherit;font-family:inherit}',
    '.ke-btn:hover{transform:translateY(-1px)}.ke-btn:focus-visible{outline:3px solid #F26422;outline-offset:3px}',
    '.ke-btn img{width:46px;height:46px;border-radius:50%;display:block;background:#fff}',
    '.ke-panel{position:fixed;right:18px;bottom:18px;width:400px;max-width:calc(100vw - 24px);height:min(660px,calc(100vh - 36px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(2,12,27,.45),0 0 0 1px rgba(13,43,78,.15);display:none;flex-direction:column;overflow:hidden;color:#0f172a;text-align:left}',
    '.ke-root.open .ke-panel{display:flex}.ke-root.open .ke-btn{display:none}',
    '.ke-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0D2B4E;flex:none}',
    '.ke-head img{width:42px;height:42px;border-radius:50%;background:#fff;flex:none}',
    '.ke-t{flex:1;min-width:0}.ke-t b{display:block;font-size:16px;color:#fff}.ke-t span{display:block;font-size:11.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ke-t .ke-credit{margin-top:3px;max-width:100%;overflow:hidden;text-overflow:ellipsis}',
    '.ke-ic{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:9px;min-width:34px;height:34px;cursor:pointer;font:700 14px inherit;font-family:inherit;padding:0 8px}',
    '.ke-ic:hover{background:rgba(255,255,255,.24)}.ke-ic:focus-visible{outline:2px solid #F26422}',
    '.ke-body{flex:1;overflow-y:auto;padding:14px;background:#f1f5f9;display:flex;flex-direction:column;gap:10px}',
    '.ke-msg{max-width:92%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.ke-msg.u{align-self:flex-end;background:#0D2B4E;color:#fff;border-bottom-right-radius:4px}',
    '.ke-msg.a{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
    '.ke-note{margin-top:6px;font-size:11.5px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:5px 8px;white-space:normal;font-weight:700}',
    '.ke-typing{align-self:flex-start;color:#475569;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:8px 12px}',
    '.ke-evts{align-self:stretch;display:flex;flex-direction:column;gap:8px}',
    '.ke-evt{display:flex;gap:10px;align-items:flex-start;text-decoration:none;color:#0f172a;background:#fff;border:1.5px solid #e2e8f0;border-radius:14px;padding:10px}',
    '.ke-evt:hover{border-color:#F26422;box-shadow:0 4px 14px rgba(242,100,34,.18)}.ke-evt:focus-visible{outline:3px solid #F26422;outline-offset:2px}',
    '.ke-ph{flex:none;width:48px;height:48px;border-radius:12px;object-fit:cover;background:#fff3e6;display:flex;align-items:center;justify-content:center;font-size:22px}',
    '.ke-pi{flex:1;min-width:0}.ke-pi b{display:block;font-size:14px;color:#0D2B4E;overflow-wrap:anywhere}.ke-pi small{display:block;font-size:12px;color:#475569;overflow-wrap:anywhere}',
    '.ke-quand{color:#9a3412 !important;font-weight:700}',
    '.ke-tags{display:flex;flex-wrap:wrap;gap:4px;margin-top:5px}',
    '.ke-tag{display:inline-block;font-size:10.5px;font-weight:800;color:#475569;background:#e2e8f0;border-radius:99px;padding:1px 8px}',
    '.ke-tag.gratuit{color:#166534;background:#dcfce7}.ke-tag.payant{color:#9a3412;background:#ffedd5}.ke-tag.partiel{color:#854d0e;background:#fef9c3}.ke-tag.ligne{color:#1e40af;background:#dbeafe}',
    '.ke-voir{display:inline-block;margin-top:6px;font-size:12.5px;font-weight:800;color:#b84c1a;text-decoration:underline}',
    '.ke-sug{display:flex;flex-wrap:wrap;gap:6px}.ke-sug button{background:#fff;border:1px solid #cbd5e1;border-radius:99px;padding:6px 11px;font-size:12.5px;cursor:pointer;color:#0D2B4E;text-align:left;font-family:inherit}',
    '.ke-sug button:hover{background:#fff7ed;border-color:#F26422}',
    '.ke-foot{flex:none;background:#fff;border-top:1px solid #e2e8f0;padding:8px 10px 10px}',
    '.ke-av{margin:0 0 6px;font-size:11px;color:#64748b;line-height:1.35}',
    '.ke-form{display:flex;gap:8px;align-items:flex-end}',
    '.ke-form textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font:14px/1.4 inherit;font-family:inherit;max-height:110px;min-height:42px;background:#fff;color:#0f172a}',
    '.ke-form textarea:focus{outline:2px solid #F26422;border-color:#F26422}',
    '.ke-send{border:0;background:#F26422;color:#fff;border-radius:12px;height:42px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.ke-send:disabled{opacity:.5;cursor:not-allowed}',
    '.ke-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;font-size:13.5px;line-height:1.55;color:#0f172a}',
    '.ke-card h4{margin:0 0 6px;font-size:15px;color:#0D2B4E}.ke-card p{margin:0 0 8px;color:#0f172a}',
    '.ke-card ul{margin:8px 0 12px;padding-left:18px}.ke-card li{margin:4px 0}',
    '.ke-card a.ke-l{color:#b84c1a;font-weight:700}',
    '.ke-cta{display:inline-block;border:0;background:#F26422;color:#fff;font-weight:800;padding:10px 18px;border-radius:10px;text-decoration:none;cursor:pointer;font-family:inherit;font-size:14px;margin:4px 8px 0 0}',
    '.ke-cta.sec{background:#fff;color:#0D2B4E;border:1.5px solid #0D2B4E}.ke-cta[disabled]{opacity:.55;cursor:not-allowed}',
    '.ke-cta:focus-visible{outline:3px solid #0D2B4E;outline-offset:2px}',
    /* Brouillon d'événement flash et pièce jointe */
    '.ke-bro{align-self:stretch;background:#fff;border:2px solid #F26422;border-radius:14px;padding:12px;font-size:13.5px;line-height:1.5;color:#0f172a}',
    '.ke-bro h4{margin:0 0 8px;font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#b84c1a}',
    '.ke-bro img{display:block;width:100%;max-height:150px;object-fit:cover;border-radius:10px;margin:0 0 8px;background:#fff3e6}',
    '.ke-bro b{display:block;font-size:15px;color:#0D2B4E;overflow-wrap:anywhere}',
    '.ke-bro p{margin:4px 0;overflow-wrap:anywhere}.ke-bro .ke-q{color:#9a3412;font-weight:700}',
    '.ke-bro .ke-man{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:#fff7ed;color:#9a3412;font-weight:700}',
    '.ke-bro .ke-act{margin-top:10px}',
    '.ke-bro .ke-txt{white-space:pre-wrap;color:#1e293b}',
    '.ke-bro .ke-warn{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:#fff7ed;border:1px solid #fdba74;color:#9a3412;font-weight:600}',
    '.ke-clip{border:1px solid #cbd5e1;background:#fff;color:#0D2B4E;border-radius:12px;height:42px;min-width:42px;font-size:18px;cursor:pointer;flex:none}.ke-clip:hover{border-color:#F26422;background:#fff7ed}.ke-clip:focus-visible{outline:2px solid #F26422}',
    '.ke-pj{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:12px;color:#0D2B4E}.ke-pj img{width:40px;height:40px;border-radius:8px;object-fit:cover}.ke-pj button{border:0;background:#e2e8f0;border-radius:99px;width:24px;height:24px;cursor:pointer;color:#0f172a}',
    '@media (max-width:560px){.ke-root{right:10px;bottom:calc(10px + env(safe-area-inset-bottom))}.ke-btn span{display:none}.ke-btn{padding:4px}.ke-panel{right:0;bottom:0;left:0;width:100%;max-width:none;height:80vh;height:80dvh;border-radius:16px 16px 0 0}.ke-form textarea{font-size:16px}}',
    /* Appli téléphone (m.html) : bouton compact au-dessus du pied de page, feuille dans la largeur de l'appli. */
    '.ke-tel{right:max(10px,calc((100vw - 560px)/2 + 10px));bottom:calc(78px + env(safe-area-inset-bottom))}.ke-tel .ke-btn span{display:none}.ke-tel .ke-btn{padding:4px}',
    '.ke-tel .ke-panel{right:0;bottom:0;left:0;width:100%;max-width:560px;margin:0 auto;height:80vh;height:80dvh;border-radius:16px 16px 0 0}.ke-tel .ke-form textarea{font-size:16px}',
    '@media (prefers-reduced-motion:no-preference){.ke-btn{transition:transform .15s}}'
  ].join('\n');

  var S = { opts: null, etat: null, conv: null, msgs: [], root: null, occupe: false, image: '' };
  var ecouteEchap = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (sel) { return S.root.querySelector(sel); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sans importance */ } }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); });
  }
  /* Les adresses viennent du serveur, mais on ne suit qu'un lien relatif vers une page du site (ou la fiche dans l'appli téléphone) et on n'affiche qu'une photo https ou du site. */
  function lienSur(u) { u = String(u || ''); return /^[\w\-\/]+\.html(\?[\w=&%\-]*)?$/.test(u) ? u : '#'; }
  function lienEvenement(e) {
    var id = Number(e.id);
    if (S.opts && S.opts.telephone) return id > 0 ? '#/evenement/' + id : '#';
    return lienSur(e.url);
  }
  function photoSure(u) { u = String(u || ''); return /^(https:\/\/|\/(?!\/))/.test(u) ? u : ''; }

  function chargerScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); });
  }
  var chargerCredit = function () { return chargerScript('/assets/koffi-credit.js?v=3', function () { return !!window.KoffiCredit; }); };

  /* ── Le crédit : pastille cliquable dans l'en-tête ── */
  function majMeta() {
    var p = $('.ke-credit'), e = S.etat, pf = e && e.portefeuille;
    if (!p) return;
    p.style.display = pf && window.KoffiCredit ? '' : 'none';
    if (pf && window.KoffiCredit) window.KoffiCredit.appliquer(p, pf, 'fr');
  }
  function ouvrirCredit() { if (window.KoffiCredit) window.KoffiCredit.ouvrir({ lg: 'fr', page: S.opts && S.opts.telephone ? 'telephone' : 'evenements' }); }

  /* ── Messages et cartes d'événements ── */
  function carteEvt(e) {
    var a = document.createElement('a'); a.className = 'ke-evt'; a.href = lienEvenement(e);
    if (!(S.opts && S.opts.telephone)) { a.target = '_blank'; a.rel = 'noopener'; }
    var photo = photoSure(e.photo_url);
    var ph = photo ? '<img class="ke-ph" src="' + esc(photo) + '" alt="" loading="lazy" width="48" height="48">' : '<span class="ke-ph" aria-hidden="true">📅</span>';
    var tags = (e.forme ? '<span class="ke-tag">' + esc(e.forme) + '</span>' : '') +
      (T.partic[e.participation] ? '<span class="ke-tag ' + esc(e.participation) + '">' + esc(T.partic[e.participation]) + '</span>' : '') +
      (e.en_ligne ? '<span class="ke-tag ligne">' + T.enLigne + '</span>' : '');
    a.innerHTML = ph + '<span class="ke-pi"><b>' + esc(e.titre) + '</b><small class="ke-quand">' + esc(e.quand) + '</small>' +
      (e.lieu ? '<small>📍 ' + esc(e.lieu) + '</small>' : '') + (e.organisateur ? '<small>Par ' + esc(e.organisateur) + '</small>' : '') +
      (tags ? '<span class="ke-tags">' + tags + '</span>' : '') + '<span class="ke-voir">' + T.voir + ' →</span></span>';
    /* Sur le téléphone la fiche s'ouvre dans l'appli : on referme la fenêtre pour qu'elle ne la masque pas. */
    if (S.opts && S.opts.telephone) a.addEventListener('click', function () { fermerPanneau(); });
    return a;
  }
  /* Aperçu de l'événement flash en préparation : les boutons ne figurent que sur le DERNIER aperçu, et seulement quand rien ne manque. */
  function carteBrouillon(b, messageId, actif) {
    var d = document.createElement('div'); d.className = 'ke-bro';
    var photo = photoSure(b.image_url);
    if (b.type === 'publication') {
      /* Publication du fil : le texte, le moment, et (si programmée) l'avertissement sur l'heure approximative, toujours visible avant le bouton. */
      d.innerHTML = '<h4>' + esc(T.apercuPub) + '</h4>' + (photo ? '<img src="' + esc(photo) + '" alt="' + esc(T.photoPub) + '">' : '') +
        (b.titre ? '<b>' + esc(b.titre) + '</b>' : '') + (b.texte ? '<p class="ke-txt">' + esc(b.texte) + '</p>' : '') +
        (b.quand ? '<p class="ke-q">' + esc(T.quandPub) + ' ' + esc(b.quand) + '</p>' : '') +
        '<p>' + esc([b.categorie, b.visibilite].filter(Boolean).join(' · ')) + '</p>' +
        (b.avertissement ? '<p class="ke-warn">' + esc(b.avertissement) + '</p>' : '');
      if (!actif) return d;
      if (b.pret) {
        var ap = document.createElement('div'); ap.className = 'ke-act';
        var pb = bouton(b.bouton === 'Programmer' ? T.programmer : T.publier, 'flash-publier'); pb.setAttribute('data-id', String(messageId));
        var xb = bouton(T.abandonner, 'flash-abandonner', true); xb.setAttribute('data-id', String(messageId));
        ap.appendChild(pb); ap.appendChild(xb); d.appendChild(ap);
      } else if (b.manquants && b.manquants.length) {
        var mp = document.createElement('div'); mp.className = 'ke-man'; mp.textContent = T.manque + ' ' + b.manquants.join(', ') + '.'; d.appendChild(mp);
      }
      return d;
    }
    d.innerHTML = '<h4>' + esc(T.apercu) + '</h4>' + (photo ? '<img src="' + esc(photo) + '" alt="' + esc(T.photoApercu) + '">' : '') +
      '<b>' + esc(b.titre || '…') + '</b>' + (b.quand ? '<p class="ke-q">' + esc(b.quand) + '</p>' : '') + (b.lieu ? '<p>📍 ' + esc(b.lieu) + '</p>' : '') +
      (b.type || b.domaine ? '<p>' + esc([b.type, b.domaine].filter(Boolean).join(' · ')) + '</p>' : '') + (b.description ? '<p>' + esc(b.description) + '</p>' : '') +
      (b.inscription ? '<p>' + esc(b.inscription) + '</p>' : '') + (b.visibilite ? '<p>' + esc(b.visibilite) + '</p>' : '');
    if (!actif) return d;
    if (b.pret) {
      var a = document.createElement('div'); a.className = 'ke-act';
      var p = bouton(T.publier, 'flash-publier'); p.setAttribute('data-id', String(messageId));
      var x = bouton(T.abandonner, 'flash-abandonner', true); x.setAttribute('data-id', String(messageId));
      a.appendChild(p); a.appendChild(x); d.appendChild(a);
    } else if (b.manquants && b.manquants.length) {
      var m = document.createElement('div'); m.className = 'ke-man'; m.textContent = T.manque + ' ' + b.manquants.join(', ') + '.'; d.appendChild(m);
    }
    return d;
  }
  function ajouterMessage(m, actif) {
    var el = document.createElement('div');
    el.className = 'ke-msg ' + (m.role === 'user' ? 'u' : 'a');
    el.textContent = m.contenu;
    if (m.role !== 'user' && m.gratuit) { var n = document.createElement('div'); n.className = 'ke-note'; n.textContent = T.gratuitNote; el.appendChild(n); }
    var corps = $('.ke-body'); corps.appendChild(el);
    if (m.role !== 'user' && m.brouillon) corps.appendChild(carteBrouillon(m.brouillon, m.id, !!actif));
    if (m.role !== 'user' && m.lien && m.lien.url) {
      var lk = document.createElement('a'); lk.className = 'ke-cta'; lk.href = m.lien.url; lk.textContent = m.lien.texte || ''; lk.style.display = 'inline-block'; lk.style.marginTop = '6px'; lk.style.textDecoration = 'none';
      if (S.opts && S.opts.telephone) lk.addEventListener('click', function () { fermerPanneau(); });
      corps.appendChild(lk);
    }
    if (m.role !== 'user' && m.evenements && m.evenements.length) {
      var l = document.createElement('div'); l.className = 'ke-evts'; m.evenements.forEach(function (e) { l.appendChild(carteEvt(e)); }); corps.appendChild(l);
    }
    corps.scrollTop = corps.scrollHeight;
    return el;
  }

  /* ── Cartes d'état ── */
  function carte(titre, texte, boutons) {
    var d = document.createElement('div'); d.className = 'ke-card';
    d.innerHTML = '<h4>' + esc(titre) + '</h4><p>' + esc(texte) + '</p>';
    (boutons || []).forEach(function (b) { d.appendChild(b); });
    return d;
  }
  function bouton(texte, act, sec) { var b = document.createElement('button'); b.type = 'button'; b.className = 'ke-cta' + (sec ? ' sec' : ''); b.setAttribute('data-a', act); b.textContent = texte; return b; }
  function carteInfo() {
    var d = document.createElement('div'); d.className = 'ke-card';
    d.innerHTML = '<h4>Koffi, guide des événements</h4><ul><li>' + esc(T.info1) + '</li><li>' + esc(T.info2) + '</li><li>' + esc(T.info3) + '</li><li>' + esc(T.info4) + '</li>' + (S.etat && S.etat.flash && S.etat.flash.disponible ? '<li>' + esc(T.info5) + '</li>' : '') + '</ul>' +
      '<p><a class="ke-l" href="/politique-confidentialite.html#koffi" target="_blank" rel="noopener">' + esc(T.infoLien) + '</a></p>';
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
  function fermerEtFiltrer() {
    fermerPanneau();
    var champ = document.querySelector('input[type="search"], #search-input, #searchInput, #search, input[name="q"], input[placeholder*="echerch" i]');
    if (champ) { try { champ.scrollIntoView({ block: 'center' }); champ.focus(); } catch (e) { /* sans importance */ } }
  }

  function construireCorps() {
    var body = $('.ke-body'); body.innerHTML = '';
    var foot = $('.ke-foot'), e = S.etat, ta = $('.ke-form textarea'), env = $('.ke-send');
    foot.style.display = ''; ta.disabled = false; env.disabled = false; majMeta();
    var clip = S.root.querySelector('.ke-clip'); if (clip) clip.style.display = e && ((e.flash && e.flash.disponible) || (e.publication && e.publication.disponible)) ? '' : 'none';
    afficherPJ();
    $('.ke-av').textContent = (e && e.avertissement) || T.info1;
    S.root.querySelectorAll('[data-a="nouvelle"],[data-a="supprimer"]').forEach(function (b) { b.style.display = e && (e.etat === 'utilisable' || e.etat === 'recharge') ? '' : 'none'; });
    if (!e) { body.appendChild(carte('Koffi', T.indisponible)); foot.style.display = 'none'; return; }
    var st = e.etat;
    if (st === 'majorite') { body.appendChild(carteMajorite()); foot.style.display = 'none'; return; }
    if (st === 'mineur' || st === 'pays' || st === 'desactive' || st === 'indisponible') { body.appendChild(carte('Koffi', T[st] || T.indisponible, [bouton(T.manuel, 'manuel', true)])); foot.style.display = 'none'; return; }
    if (!lsGet('koffi_evenements_info_v2')) { body.appendChild(carteInfo()); foot.style.display = 'none'; return; }
    S.msgs.forEach(function (m, i) { ajouterMessage(m, i === S.msgs.length - 1); });
    if (!S.msgs.length) {
      ajouterMessage({ role: 'assistant', contenu: T.accueil });
      var s = document.createElement('div'); s.className = 'ke-sug';
      T.suggestions.concat(e.flash && e.flash.disponible ? [T.suggestionFlash] : []).concat(e.publication && e.publication.disponible ? [T.suggestionPub] : []).forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.textContent = x; b.addEventListener('click', function () { ta.value = x; envoyer(); }); s.appendChild(b); });
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
    $('.ke-t b').textContent = T.nom; $('.ke-t span').textContent = T.sous;
    $('.ke-btn span').textContent = T.nom; $('.ke-btn').setAttribute('aria-label', T.ouvrir); $('.ke-btn').title = T.ouvrir;
    $('[data-a="fermer"]').setAttribute('aria-label', T.fermer); $('[data-a="fermer"]').title = T.fermer;
    $('[data-a="nouvelle"]').title = T.nouvelle; $('[data-a="nouvelle"]').setAttribute('aria-label', T.nouvelle);
    $('[data-a="supprimer"]').title = T.supprimer; $('[data-a="supprimer"]').setAttribute('aria-label', T.supprimer);
    $('.ke-form textarea').placeholder = T.placeholder; $('.ke-send').textContent = T.envoyer;
    var clip = $('.ke-clip'); clip.title = T.joindre; clip.setAttribute('aria-label', T.joindre);
  }

  function chargerEtat() {
    return api('GET', '/api/kofi/evenements/etat').then(function (r) {
      if (r.ok) { S.etat = r.data; S.conv = r.data.conversation ? r.data.conversation.id : null; S.msgs = r.data.conversation ? r.data.conversation.messages : []; }
      return r;
    });
  }
  function ouvrirPanneau() {
    S.root.classList.add('open');
    chargerEtat().then(function () { construireCorps(); var ta = $('.ke-form textarea'); if (ta && !ta.disabled && $('.ke-foot').style.display !== 'none' && window.innerWidth > 560) ta.focus(); });
  }
  function fermerPanneau() { S.root.classList.remove('open'); var b = $('.ke-btn'); if (b && !(S.opts && S.opts.telephone)) b.focus(); }

  function envoyer() {
    if (S.occupe) return;
    var ta = $('.ke-form textarea'); var texte = ta.value.trim(); if ((!texte && !S.image) || ta.disabled) return;
    var image = S.image; if (!texte) texte = T.imageJointe;
    var max = S.etat && S.etat.max_message; if (max && texte.length > max) { ajouterMessage({ role: 'assistant', contenu: 'Message trop long (' + max + ' caractères au maximum).' }); return; }
    S.occupe = true; $('.ke-send').disabled = true;
    var corps = $('.ke-body');
    if (!S.msgs.length) corps.innerHTML = '';
    var mu = { role: 'user', contenu: image ? texte + '\n📎 ' + T.photoApercu : texte }; S.msgs.push(mu); ajouterMessage(mu);
    S.image = ''; afficherPJ();
    ta.value = ''; ta.style.height = 'auto';
    var att = document.createElement('div'); att.className = 'ke-typing'; att.setAttribute('role', 'status'); att.textContent = T.reflechit; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/evenements/messages', { texte: texte, conversation_id: S.conv || undefined, image: image || undefined }).then(function (r) {
      att.remove();
      if (r.ok) {
        S.conv = r.data.conversation_id; S.msgs.push(r.data.message); retirerActions(); ajouterMessage(r.data.message, true);
        if (r.data.message.publie) apresPublication();
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
      .then(function () { S.occupe = false; var ok = S.etat && (S.etat.etat === 'utilisable' || S.etat.etat === 'recharge'); $('.ke-send').disabled = !ok; if (ok) ta.focus(); });
  }

  /* ── Image jointe : réduite dans le navigateur (le serveur lit au plus 1 Mo par envoi) ── */
  function afficherPJ() {
    var z = S.root && S.root.querySelector('.ke-pj'); if (!z) return;
    z.innerHTML = ''; z.style.display = S.image ? 'flex' : 'none';
    if (!S.image) return;
    var i = document.createElement('img'); i.src = S.image; i.alt = '';
    var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-a', 'pj-retirer'); b.setAttribute('aria-label', T.retirerImage); b.title = T.retirerImage; b.textContent = '✕';
    var t = document.createElement('span'); t.textContent = T.photoApercu;
    z.appendChild(i); z.appendChild(t); z.appendChild(b);
  }
  function reduireImage(fichier, fini) {
    if (!fichier || !/^image\/(jpeg|png|webp)$/i.test(fichier.type)) return fini('');
    var lecteur = new FileReader();
    lecteur.onerror = function () { fini(''); };
    lecteur.onload = function () {
      var img = new Image();
      img.onerror = function () { fini(''); };
      img.onload = function () {
        var largeur = 1280, qualite = 0.82, essai = 0, sortie = '';
        while (essai < 6) {
          var k = Math.min(1, largeur / Math.max(img.width, img.height));
          var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          sortie = c.toDataURL('image/jpeg', qualite);
          if (sortie.length < 780000) return fini(sortie);
          largeur = Math.round(largeur * 0.75); qualite = Math.max(0.55, qualite - 0.08); essai++;
        }
        fini('');
      };
      img.src = lecteur.result;
    };
    lecteur.readAsDataURL(fichier);
  }
  function retirerActions() { S.root.querySelectorAll('.ke-bro .ke-act, .ke-bro .ke-man').forEach(function (n) { n.remove(); }); }
  function apresPublication() { try { if (S.opts && typeof S.opts.apresPublication === 'function') S.opts.apresPublication(); } catch (e) { /* sans importance */ } }
  function actionBrouillon(act, id) {
    if (S.occupe || !id) return;
    S.occupe = true;
    var att = document.createElement('div'); att.className = 'ke-typing'; att.setAttribute('role', 'status'); att.textContent = act === 'publier' ? T.publication : '…';
    var corps = $('.ke-body'); retirerActions(); corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/evenements/flash/' + (act === 'publier' ? 'publier' : 'abandonner'), { message_id: id }).then(function (r) {
      att.remove();
      if (r.ok && r.data && r.data.message) { S.msgs.push(r.data.message); ajouterMessage(r.data.message, true); if (act === 'publier' && !r.data.publication_id) apresPublication(); }
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
      var corps = $('.ke-body');
      if (statut === 'attente') { corps.innerHTML = ''; corps.appendChild(carte('Koffi', msg)); $('.ke-foot').style.display = 'none'; return; }
      chargerEtat().then(function () { construireCorps(); ajouterMessage({ role: 'assistant', contenu: msg }); });
    } });
  }

  function construire() {
    if (!document.getElementById('ke-style')) { var st = document.createElement('style'); st.id = 'ke-style'; st.textContent = CSS; document.head.appendChild(st); }
    var root = document.createElement('div'); root.className = 'ke-root' + (S.opts && S.opts.telephone ? ' ke-tel' : ''); root.setAttribute('data-koffi-evenements', '1');
    root.innerHTML =
      '<button type="button" class="ke-btn" data-a="ouvrir"><img src="/assets/koffi-avatar-96.webp" width="46" height="46" alt=""><span></span></button>' +
      '<section class="ke-panel" role="dialog" aria-label="Koffi, guide des événements" aria-modal="false">' +
        '<div class="ke-head"><img src="/assets/koffi-avatar-96.webp" width="42" height="42" alt=""><div class="ke-t"><b></b><span></span><button type="button" class="ke-credit" data-a="credit" style="display:none"></button></div>' +
          '<button type="button" class="ke-ic" data-a="nouvelle">＋</button><button type="button" class="ke-ic" data-a="supprimer">🗑</button><button type="button" class="ke-ic" data-a="fermer">✕</button></div>' +
        '<div class="ke-body" aria-live="polite"></div>' +
        '<div class="ke-foot"><p class="ke-av"></p><div class="ke-pj" style="display:none"></div><form class="ke-form"><button type="button" class="ke-clip" data-a="pj" style="display:none">📎</button><input type="file" class="ke-file" accept="image/jpeg,image/png,image/webp" hidden><textarea rows="1" maxlength="1500" aria-label="Votre recherche d\'événements"></textarea><button type="submit" class="ke-send"></button></form></div>' +
      '</section>';
    document.body.appendChild(root); S.root = root;
    root.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-a]') : null; if (!t) return;
      var act = t.getAttribute('data-a');
      if (act === 'ouvrir') return ouvrirPanneau();
      if (act === 'fermer') return fermerPanneau();
      if (act === 'credit') return ouvrirCredit();
      if (act === 'compris') { lsSet('koffi_evenements_info_v2', '1'); return construireCorps(); }
      if (act === 'majorite') return confirmerMajorite();
      if (act === 'flash-publier') return actionBrouillon('publier', Number(t.getAttribute('data-id')));
      if (act === 'flash-abandonner') return actionBrouillon('abandonner', Number(t.getAttribute('data-id')));
      if (act === 'pj-retirer') { S.image = ''; return afficherPJ(); }
      if (act === 'pj') { var fi = S.root.querySelector('.ke-file'); if (fi) { fi.value = ''; fi.click(); } return; }
      if (act === 'manuel') return fermerEtFiltrer();
      if (act === 'nouvelle') { S.conv = null; S.msgs = []; S.image = ''; if (S.etat && S.etat.etat !== 'recharge') construireCorps(); return; }
      if (act === 'supprimer') {
        if (!S.conv) return; if (!window.confirm(T.confirmSuppr)) return;
        return api('DELETE', '/api/kofi/evenements/conversations/' + S.conv).then(function () { S.conv = null; S.msgs = []; construireCorps(); });
      }
    });
    root.querySelector('.ke-form').addEventListener('submit', function (ev) { ev.preventDefault(); envoyer(); });
    var ta = root.querySelector('.ke-form textarea');
    root.querySelector('.ke-file').addEventListener('change', function (ev) {
      var fi = ev.target.files && ev.target.files[0]; if (!fi) return;
      reduireImage(fi, function (d) { if (d) { S.image = d; afficherPJ(); } else ajouterMessage({ role: 'assistant', contenu: T.imageIllisible }); });
    });
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; });
    if (!ecouteEchap) { ecouteEchap = true; document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.root && S.root.classList.contains('open') && !document.querySelector('.kcr-fond')) fermerPanneau(); }); }
  }

  window.KoffiEvenements = {
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
      S.root = null; S.etat = null; S.conv = null; S.msgs = []; S.occupe = false; S.opts = null; S.image = '';
    },
    estMonte: function () { return !!S.root; }
  };
})();

/* Commande vocale (2026-11-10) : bouton micro commun à tous les Koffi, voir assets/koffi-voix.js */
(function () { if (window.KoffiVoix) return; var s = document.createElement("script"); s.src = "/assets/koffi-voix.js?v=1"; s.async = true; (document.head || document.documentElement).appendChild(s); })();

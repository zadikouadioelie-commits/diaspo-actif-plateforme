/* ═════════════════════════════════════════════════
   assets/koffi-annuaire.js — KOFFI, CONSEILLER D'ORIENTATION DE L'ANNUAIRE : fenêtre de discussion (2026-11-01)
   ═════════════════════════════════════════════════
   Autonome (CSS injecté, préfixe .ka-) : KoffiAnnuaire.monter({ premiumUrl, telephone })
   Une personne décrit ce qu'elle cherche ; Koffi précise puis propose au moins trois profils, chacun avec un POURCENTAGE de correspondance (calculé par le serveur) ;
   un clic ouvre le profil public. Toutes les règles (Premium, réciprocité, majorité, pays, crédit) sont décidées par le SERVEUR (/api/kofi/annuaire/*) : ici on n'affiche
   que ce qu'il renvoie. Aucun profil n'est jamais lu côté navigateur en dehors des propositions déjà filtrées.
   Le crédit (pastille de l'en-tête, recharge) vient de assets/koffi-credit.js : un seul portefeuille pour tout Koffi.
   États serveur : utilisable | recharge | premium_requis | reciprocite | majorite | mineur | pays | desactive | indisponible.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiAnnuaire) return;

  var T = {
    nom: 'Koffi', sous: 'Conseiller de l\'Annuaire', ouvrir: 'Demander à Koffi de trouver un profil', fermer: 'Fermer', nouvelle: 'Nouvelle recherche',
    supprimer: 'Supprimer cette conversation', confirmSuppr: 'Supprimer cette conversation ? Cette action est définitive.',
    placeholder: 'Que cherchez-vous ? (un métier, un domaine, une ville…)', envoyer: 'Envoyer', reflechit: 'Koffi cherche dans l\'Annuaire…',
    accueil: 'Bonjour ! Je suis Koffi. Dites-moi ce que vous cherchez (un métier, un domaine, une ville ou un pays) : je vous propose au moins trois profils de l\'Annuaire, avec leur pourcentage de correspondance.',
    suggestions: ['Que sais-tu faire ?', 'Je cherche un avocat à Abidjan', 'Une association d\'aide aux étudiants en France', 'Un expert en agriculture au Sénégal'],
    gratuitNote: '✓ Question sur Koffi : gratuite, elle ne compte pas dans votre crédit.',
    info1: 'Koffi ne propose que les comptes Premium qui ont une photo de profil et un descriptif rempli, et qui acceptent d\'être proposés. Pour tous les autres comptes, utilisez la recherche et les filtres de l\'Annuaire.',
    info2: 'Koffi ne voit aucun profil : il transforme votre demande en critères de recherche. C\'est le serveur de Diaspo\'Actif qui cherche, calcule le pourcentage et affiche les profils.',
    info3: 'Votre message et l\'historique récent de la conversation sont envoyés à notre prestataire d\'intelligence artificielle, Anthropic Ireland (transferts possibles hors de l\'Union européenne), sans votre nom ni votre e-mail. Ne saisissez aucune donnée sensible (santé, religion, opinions…).',
    info4: 'Vos conversations sont conservées 60 jours au maximum, puis supprimées. Vous pouvez les supprimer à tout moment. Vous pouvez aussi refuser d\'être proposé par Koffi dans Confidentialité (vous ne pourrez alors plus utiliser ce conseiller : réciprocité).',
    infoLien: 'En savoir plus : politique de confidentialité', compris: 'J\'ai compris',
    voir: 'Voir le profil', correspondance: 'Correspondance', types: { personne: 'Personne', initiative: 'Initiative', collectivite: 'Collectivité' },
    premiumTitre: 'Réservé aux comptes Premium', premium: 'Passer Premium', manuel: 'Utiliser la recherche manuelle',
    majTitre: 'Koffi est réservé aux personnes majeures', majTexte: 'Pour utiliser Koffi, confirmez que vous avez 18 ans ou plus. L\'Annuaire reste entièrement utilisable sans lui.', majCase: 'Je confirme avoir 18 ans ou plus', majBtn: 'Confirmer',
    mineur: 'Koffi est réservé aux personnes de 18 ans ou plus. L\'Annuaire reste entièrement utilisable sans lui.',
    pays: 'Koffi n\'est pas disponible dans votre pays pour le moment. La recherche manuelle reste disponible.',
    desactive: 'Koffi est désactivé pour le moment.', indisponible: 'Koffi est momentanément indisponible. Réessayez un peu plus tard.',
    reciproTitre: 'Vous avez choisi de ne pas être proposé', confidentialite: 'Ouvrir Confidentialité',
    rechargeTitre: 'Votre crédit Koffi est épuisé', rechargeTexte: 'Rechargez votre crédit pour continuer : le même crédit sert à tout Koffi (cours, création de formation, Annuaire). Poser une question sur ce que sait faire Koffi reste gratuit.',
    rechargeTextePremium: 'Votre crédit du mois est utilisé : il est renouvelé le mois prochain. Vous pouvez aussi recharger dès maintenant ; le même crédit sert à tout Koffi.', recharger: 'Recharger mon crédit',
    erreur: 'Une erreur est survenue. Réessayez.', trop: 'Doucement : patientez quelques secondes avant le message suivant.', retention: 'Conversations conservées 60 jours',
    paiementRecu: 'Paiement reçu : votre crédit est en cours d\'ajout…',
    liste: 'Mes discussions et dossiers', retourChat: 'Revenir à la discussion',
    nouvelleDisc: '＋ Nouvelle discussion', nouveauDossier: '📁 Nouveau dossier', nomDossier: 'Nom du dossier (ex. : Avocats, Recrutement…)', nomDisc: 'Nouveau titre',
    renommer: 'Renommer', supprimerIt: 'Supprimer', deplacer: 'Ranger dans…', horsDossier: 'Hors dossier', sansDossier: 'Discussions hors dossier', aucune: 'Aucune discussion pour le moment.',
    nouvelleDansDossier: 'Nouvelle discussion dans ce dossier', untitled: 'Nouvelle discussion',
    confirmDossier: function (n) { return n ? 'Supprimer ce dossier et les ' + n + ' discussion' + (n > 1 ? 's' : '') + ' qu\'il contient ? Cette action est définitive.' : 'Supprimer ce dossier vide ?'; },
    accueilDossier: function (n) { return 'Nouvelle discussion dans le dossier « ' + n + ' ». Dites-moi ce que vous cherchez : la discussion sera rangée ici.'; },
    micro: 'Dicter votre message', microArret: 'Arrêter la dictée', microEcoute: 'Je vous écoute… parlez, puis touchez à nouveau le micro.',
    microRefus: 'Le micro est bloqué. Autorisez-le dans votre navigateur pour dicter votre message.', microErreur: 'La dictée vocale n\'a pas pu démarrer. Vous pouvez écrire votre message.'
  };

  var CSS = [
    '.ka-root,.ka-root *{box-sizing:border-box}',
    '.ka-root{position:fixed;right:88px;bottom:22px;z-index:9000;font-family:inherit;color:#0f172a;line-height:1.45}',
    '.ka-btn{display:flex;align-items:center;gap:10px;border:0;cursor:pointer;background:#0D2B4E;color:#fff;border-radius:999px;padding:5px 18px 5px 5px;box-shadow:0 8px 26px rgba(13,43,78,.38),0 0 0 2px #F26422;font:700 14px/1.2 inherit;font-family:inherit}',
    '.ka-btn:hover{transform:translateY(-1px)}.ka-btn:focus-visible{outline:3px solid #F26422;outline-offset:3px}',
    '.ka-btn img{width:46px;height:46px;border-radius:50%;display:block;background:#fff}',
    '.ka-panel{position:fixed;right:18px;bottom:18px;width:400px;max-width:calc(100vw - 24px);height:min(660px,calc(100vh - 36px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(2,12,27,.45),0 0 0 1px rgba(13,43,78,.15);display:none;flex-direction:column;overflow:hidden;color:#0f172a;text-align:left}',
    '.ka-root.open .ka-panel{display:flex}.ka-root.open .ka-btn{display:none}',
    '.ka-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0D2B4E;flex:none}',
    '.ka-head img{width:42px;height:42px;border-radius:50%;background:#fff;flex:none}',
    '.ka-t{flex:1;min-width:0}.ka-t b{display:block;font-size:16px;color:#fff}.ka-t span{display:block;font-size:11.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ka-t .ka-credit{margin-top:3px;max-width:100%;overflow:hidden;text-overflow:ellipsis}',
    '.ka-ic{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:9px;min-width:34px;height:34px;cursor:pointer;font:700 14px inherit;font-family:inherit;padding:0 8px}',
    '.ka-ic:hover{background:rgba(255,255,255,.24)}.ka-ic:focus-visible{outline:2px solid #F26422}',
    '.ka-body{flex:1;overflow-y:auto;padding:14px;background:#f1f5f9;display:flex;flex-direction:column;gap:10px}',
    '.ka-msg{max-width:92%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.ka-msg.u{align-self:flex-end;background:#0D2B4E;color:#fff;border-bottom-right-radius:4px}',
    '.ka-msg.a{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
    '.ka-note{margin-top:6px;font-size:11.5px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:5px 8px;white-space:normal;font-weight:700}',
    '.ka-typing{align-self:flex-start;color:#475569;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:8px 12px}',
    '.ka-props{align-self:stretch;display:flex;flex-direction:column;gap:8px}',
    '.ka-prop{display:flex;gap:10px;align-items:flex-start;text-decoration:none;color:#0f172a;background:#fff;border:1.5px solid #e2e8f0;border-radius:14px;padding:10px}',
    '.ka-prop:hover{border-color:#F26422;box-shadow:0 4px 14px rgba(242,100,34,.18)}.ka-prop:focus-visible{outline:3px solid #F26422;outline-offset:2px}',
    '.ka-ph{flex:none;width:48px;height:48px;border-radius:50%;object-fit:cover;background:#e2e8f0;display:flex;align-items:center;justify-content:center;font-weight:800;color:#0D2B4E;font-size:18px}',
    '.ka-pi{flex:1;min-width:0}.ka-pi b{display:block;font-size:14px;color:#0D2B4E;overflow-wrap:anywhere}.ka-pi small{display:block;font-size:12px;color:#475569;overflow-wrap:anywhere}',
    '.ka-pi ul{margin:6px 0 0;padding-left:16px;font-size:12px;color:#334155}.ka-pi li{margin:1px 0}',
    '.ka-voir{display:inline-block;margin-top:6px;font-size:12.5px;font-weight:800;color:#b84c1a;text-decoration:underline}',
    '.ka-pct{flex:none;align-self:flex-start;min-width:54px;text-align:center;font-weight:900;font-size:15px;color:#9a3412;background:#fff3e6;border:1.5px solid #fdba74;border-radius:99px;padding:3px 8px}',
    '.ka-type{display:inline-block;font-size:10.5px;font-weight:800;color:#475569;background:#e2e8f0;border-radius:99px;padding:0 7px;margin-bottom:3px}',
    '.ka-props.liste{gap:5px}.ka-props.liste .ka-prop{align-items:center;gap:8px;padding:6px 9px;border-radius:11px}.ka-props.liste .ka-ph{width:34px;height:34px;font-size:14px}',
    '.ka-props.liste .ka-pi b{font-size:13px}.ka-props.liste .ka-pi small{font-size:11.5px}.ka-props.liste .ka-pct{min-width:46px;font-size:13px;padding:2px 6px;align-self:center}.ka-props.liste .ka-voir{display:none}',
    '.ka-sug{display:flex;flex-wrap:wrap;gap:6px}.ka-sug button{background:#fff;border:1px solid #cbd5e1;border-radius:99px;padding:6px 11px;font-size:12.5px;cursor:pointer;color:#0D2B4E;text-align:left;font-family:inherit}',
    '.ka-sug button:hover{background:#fff7ed;border-color:#F26422}',
    '.ka-foot{flex:none;background:#fff;border-top:1px solid #e2e8f0;padding:8px 10px 10px}',
    '.ka-av{margin:0 0 6px;font-size:11px;color:#64748b;line-height:1.35}',
    '.ka-form{display:flex;gap:8px;align-items:stretch}',
    /* Zone d'écriture : trois lignes d'emblée (on voit ce qu'on écrit), elle grandit jusqu'à 200 px puis défile. */
    '.ka-form textarea{flex:1;min-width:0;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:10px 12px;font:15px/1.45 inherit;font-family:inherit;max-height:200px;min-height:92px;background:#fff;color:#0f172a}',
    '.ka-form textarea:focus{outline:2px solid #F26422;border-color:#F26422}',
    '.ka-side{display:flex;flex-direction:column;gap:6px;justify-content:flex-end}',
    '.ka-send{border:0;background:#F26422;color:#fff;border-radius:12px;height:42px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.ka-send:disabled{opacity:.5;cursor:not-allowed}',
    '.ka-mic{border:1.5px solid #cbd5e1;background:#fff;color:#0D2B4E;border-radius:12px;height:42px;font-size:19px;cursor:pointer;line-height:1}.ka-mic:hover{background:#fff7ed;border-color:#F26422}.ka-mic:focus-visible{outline:3px solid #F26422;outline-offset:2px}',
    '.ka-mic.rec{background:#dc2626;border-color:#dc2626;color:#fff;animation:kaPulse 1.2s infinite}@keyframes kaPulse{50%{opacity:.65}}',
    '.ka-micst{margin:0 0 6px;font-size:12px;font-weight:700;color:#b91c1c}.ka-micst:empty{display:none}',
    /* Fil d'Ariane : dossier › discussion en cours ; un clic ouvre la liste. */
    '.ka-ou{flex:none;display:none;width:100%;text-align:left;border:0;border-bottom:1px solid #e2e8f0;background:#fff;color:#0D2B4E;font:700 12.5px inherit;font-family:inherit;padding:7px 12px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ka-ou:hover{background:#fff7ed}.ka-ou.on{display:block}',
    /* Liste des discussions et des dossiers */
    '.ka-bar{display:flex;gap:6px;flex-wrap:wrap}',
    '.ka-doss{background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden}',
    '.ka-dh{display:flex;align-items:center;gap:4px;padding:8px 10px;background:#eef2f7}.ka-dh button.ka-tog{flex:1;min-width:0;text-align:left;background:none;border:0;font:800 13.5px inherit;font-family:inherit;color:#0D2B4E;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.ka-mini{background:none;border:0;cursor:pointer;font-size:14px;padding:4px 6px;border-radius:6px;color:#475569}.ka-mini:hover{background:#e2e8f0}',
    '.ka-disc{display:flex;align-items:center;gap:4px;padding:7px 10px;border-top:1px solid #eef2f7}.ka-disc.actuelle{background:#fff7ed}',
    '.ka-disc button.ka-ouvrir{flex:1;min-width:0;text-align:left;background:none;border:0;cursor:pointer;color:#0f172a;font:13px inherit;font-family:inherit}.ka-disc .t{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.ka-disc small{display:block;color:#64748b;font-size:11px}',
    '.ka-vide{font-size:12.5px;color:#64748b;padding:8px 10px}',
    '.ka-h5{font:800 12px inherit;font-family:inherit;text-transform:uppercase;letter-spacing:.4px;color:#64748b;margin:4px 2px 0}',
    '.ka-root .ka-sel{font-size:12px;width:78px;max-width:78px;height:30px;padding:2px 4px;margin:0;flex:none;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a}',
    '.ka-dlg{position:absolute;inset:0;z-index:5;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px}.ka-dlg-c{background:#fff;border-radius:12px;padding:16px;width:100%;max-width:340px;box-shadow:0 10px 30px rgba(0,0,0,.3);color:#1e293b;font:14px inherit;font-family:inherit}.ka-dlg-c p{margin:0 0 10px;line-height:1.4}.ka-dlg-c input{width:100%;padding:9px 10px;border:1.5px solid #cbd5e1;border-radius:8px;font:16px inherit;font-family:inherit;margin-bottom:10px}.ka-dlg-b{display:flex;gap:8px;justify-content:flex-end}',
    '.ka-ok{background:#F26422;color:#fff;border:0;border-radius:8px;padding:8px 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.ka-ko{background:#fff;border:1px solid #cbd5e1;border-radius:8px;padding:7px 13px;cursor:pointer;color:#475569;font:14px inherit;font-family:inherit}',
    '.ka-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;font-size:13.5px;line-height:1.55;color:#0f172a}',
    '.ka-card h4{margin:0 0 6px;font-size:15px;color:#0D2B4E}.ka-card p{margin:0 0 8px;color:#0f172a}',
    '.ka-card ul{margin:8px 0 12px;padding-left:18px}.ka-card li{margin:4px 0}',
    '.ka-card a.ka-l{color:#b84c1a;font-weight:700}',
    '.ka-cta{display:inline-block;border:0;background:#F26422;color:#fff;font-weight:800;padding:10px 18px;border-radius:10px;text-decoration:none;cursor:pointer;font-family:inherit;font-size:14px;margin:4px 8px 0 0}',
    '.ka-cta.sec{background:#fff;color:#0D2B4E;border:1.5px solid #0D2B4E}.ka-cta[disabled]{opacity:.55;cursor:not-allowed}',
    '.ka-cta:focus-visible{outline:3px solid #0D2B4E;outline-offset:2px}',
    '@media (max-width:560px){.ka-root{right:10px;bottom:calc(10px + env(safe-area-inset-bottom))}.ka-btn span{display:none}.ka-btn{padding:4px}.ka-panel{right:0;bottom:0;left:0;width:100%;max-width:none;height:80vh;height:80dvh;border-radius:16px 16px 0 0}.ka-form textarea{font-size:16px}}',
    /* Appli téléphone (m.html) : bouton compact au-dessus du pied de page, feuille dans la largeur de l'appli. */
    '.ka-tel{right:max(10px,calc((100vw - 560px)/2 + 10px));bottom:calc(78px + env(safe-area-inset-bottom))}.ka-tel .ka-btn span{display:none}.ka-tel .ka-btn{padding:4px}',
    '.ka-tel .ka-panel{right:0;bottom:0;left:0;width:100%;max-width:560px;margin:0 auto;height:80vh;height:80dvh;border-radius:16px 16px 0 0}.ka-tel .ka-form textarea{font-size:16px}',
    '@media (prefers-reduced-motion:no-preference){.ka-btn{transition:transform .15s}}'
  ].join('\n');

  var S = { opts: null, etat: null, conv: null, msgs: [], root: null, occupe: false, presEnCours: false, vue: 'chat', titre: '', dossier: null, ouverts: {}, arreterMicro: null };
  var ecouteEchap = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (sel) { return S.root.querySelector(sel); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sans importance */ } }
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); });
  }
  /* Les adresses viennent du serveur, mais on ne suit qu'un lien relatif vers une page du site et on n'affiche qu'une photo http(s) ou du site. */
  function lienSur(u) { u = String(u || ''); return /^[\w\-\/]+\.html(\?[\w=&%\-]*)?$/.test(u) ? u : '#'; }
  function photoSure(u) { u = String(u || ''); return /^(https:\/\/|\/(?!\/))/.test(u) ? u : ''; }

  function chargerScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); });
  }
  var chargerCredit = function () { return chargerScript('/assets/koffi-credit.js?v=2', function () { return !!window.KoffiCredit; }); };

  /* ── Le crédit : pastille cliquable dans l'en-tête ── */
  function majMeta() {
    var p = $('.ka-credit'), e = S.etat, pf = e && e.portefeuille;
    if (!p) return;
    p.style.display = pf && window.KoffiCredit ? '' : 'none';
    if (pf && window.KoffiCredit) window.KoffiCredit.appliquer(p, pf, 'fr');
  }
  function ouvrirCredit() { if (window.KoffiCredit) window.KoffiCredit.ouvrir({ lg: 'fr', page: S.opts && S.opts.telephone ? 'telephone' : 'annuaire' }); }

  /* ── Messages et propositions ── */
  function carteProp(p, compact) {
    var a = document.createElement('a'); a.className = 'ka-prop'; a.href = lienSur(p.url); a.target = '_blank'; a.rel = 'noopener';
    var photo = photoSure(p.photo_url), px = compact ? 34 : 48;
    var ph = photo ? '<img class="ka-ph" src="' + esc(photo) + '" alt="" loading="lazy" width="' + px + '" height="' + px + '">' : '<span class="ka-ph" aria-hidden="true">' + esc(String(p.nom || '?').charAt(0).toUpperCase()) + '</span>';
    var raisons = compact ? '' : (p.raisons || []).slice(0, 3).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('');
    a.innerHTML = ph + '<span class="ka-pi"><span class="ka-type">' + esc(T.types[p.type] || '') + '</span><b>' + esc(p.nom) + '</b><small>' + esc(p.sous_titre) + '</small>' + (raisons ? '<ul>' + raisons + '</ul>' : '') + '<span class="ka-voir">' + T.voir + ' →</span></span>' +
      '<span class="ka-pct" aria-label="' + T.correspondance + ' ' + esc(p.pourcentage) + ' %">' + esc(p.pourcentage) + ' %</span>';
    return a;
  }
  function ajouterMessage(m) {
    var el = document.createElement('div');
    el.className = 'ka-msg ' + (m.role === 'user' ? 'u' : 'a');
    if (m.role === 'user') el.textContent = m.contenu;
    else {
      el.textContent = m.contenu;
      if (m.gratuit) { var n = document.createElement('div'); n.className = 'ka-note'; n.textContent = T.gratuitNote; el.appendChild(n); }
    }
    var corps = $('.ka-body'); corps.appendChild(el);
    if (m.role !== 'user' && m.propositions && m.propositions.length) {
      var l = document.createElement('div'); l.className = 'ka-props' + (m.liste ? ' liste' : ''); m.propositions.forEach(function (p) { l.appendChild(carteProp(p, !!m.liste)); }); corps.appendChild(l);
    }
    corps.scrollTop = corps.scrollHeight;
    return el;
  }

  /* ── Cartes d'état ── */
  function carte(titre, texte, boutons) {
    var d = document.createElement('div'); d.className = 'ka-card';
    d.innerHTML = '<h4>' + esc(titre) + '</h4><p>' + esc(texte) + '</p>';
    (boutons || []).forEach(function (b) { d.appendChild(b); });
    return d;
  }
  function bouton(texte, act, sec) { var b = document.createElement('button'); b.type = 'button'; b.className = 'ka-cta' + (sec ? ' sec' : ''); b.setAttribute('data-a', act); b.textContent = texte; return b; }
  function lienBouton(texte, href, sec) { var a = document.createElement('a'); a.className = 'ka-cta' + (sec ? ' sec' : ''); a.href = href; a.textContent = texte; return a; }
  function carteInfo() {
    var d = document.createElement('div'); d.className = 'ka-card';
    d.innerHTML = '<h4>Koffi, conseiller de l\'Annuaire</h4><ul><li>' + esc(T.info1) + '</li><li>' + esc(T.info2) + '</li><li>' + esc(T.info3) + '</li><li>' + esc(T.info4) + '</li></ul>' +
      '<p><a class="ka-l" href="/politique-confidentialite.html#koffi" target="_blank" rel="noopener">' + esc(T.infoLien) + '</a></p>';
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
  function fermerEtChercher() {
    fermerPanneau();
    var champ = document.querySelector('input[type="search"], #search-input, #searchInput, #search, input[name="q"], input[placeholder*="echerch" i]');
    if (champ) { try { champ.scrollIntoView({ block: 'center' }); champ.focus(); } catch (e) { /* sans importance */ } }
  }

  /* Présentation de Koffi à la première connexion (assets/koffi-presentation.js, chargé au besoin) : une scène jouée, puis la fenêtre habituelle. */
  function jouerPresentation(body) {
    if (S.presEnCours) return;
    S.presEnCours = true;
    var fin = function (ok) {
      if (!ok || !window.KoffiPresentation) { S.presEnCours = false; if (S.etat) S.etat.presentation_vue = true; construireCorps(); return; }
      body.innerHTML = '';
      window.KoffiPresentation.monter(body, { role: 'annuaire', lg: 'fr', onFin: function () {
        S.presEnCours = false; if (S.etat) S.etat.presentation_vue = true;
        api('POST', '/api/kofi/presentation', { portee: 'annuaire' });
        construireCorps(); var ta = $('.ka-form textarea'); if (ta && !ta.disabled) ta.focus();
      } });
    };
    chargerScript('/assets/koffi-presentation.js?v=2', function () { return !!window.KoffiPresentation; }).then(function () { fin(true); });
  }

  /* ── Dossiers et discussions : la liste, pour ranger et retrouver ── */
  function dateCourte(s) {
    if (!s) return '';
    var t = String(s).replace(' ', 'T'), d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z'); if (isNaN(d)) return '';
    return d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  /* Fenêtres intégrées à la fenêtre de Koffi : prompt()/confirm() du navigateur sont parfois bloqués sans bruit (appli installée, navigateur intégré). */
  function dialogue(msg, o) {
    return new Promise(function (ok) {
      var fond = document.createElement('div'); fond.className = 'ka-dlg';
      var cart = document.createElement('div'); cart.className = 'ka-dlg-c'; cart.setAttribute('role', 'dialog'); cart.setAttribute('aria-modal', 'true');
      var t = document.createElement('p'); t.textContent = msg; cart.appendChild(t);
      var champ = null;
      if (o.champ) { champ = document.createElement('input'); champ.type = 'text'; champ.maxLength = 60; champ.value = o.valeur || ''; cart.appendChild(champ); }
      var bar = document.createElement('div'); bar.className = 'ka-dlg-b';
      var fini = false, rien = o.champ ? null : false;
      function fermerDlg(v) { if (fini) return; fini = true; document.removeEventListener('keydown', clav, true); fond.remove(); ok(v); }
      if (!o.sansAnnuler) { var an = document.createElement('button'); an.type = 'button'; an.className = 'ka-ko'; an.textContent = 'Annuler'; an.addEventListener('click', function () { fermerDlg(rien); }); bar.appendChild(an); }
      var bo = document.createElement('button'); bo.type = 'button'; bo.className = 'ka-ok'; bo.textContent = 'OK';
      bo.addEventListener('click', function () { fermerDlg(o.champ ? champ.value : true); }); bar.appendChild(bo);
      cart.appendChild(bar); fond.appendChild(cart);
      function clav(e) {
        if (e.key === 'Escape') { e.stopPropagation(); fermerDlg(o.sansAnnuler ? true : rien); }
        else if (e.key === 'Enter' && (champ || e.target === bo)) { e.preventDefault(); e.stopPropagation(); fermerDlg(o.champ ? champ.value : true); }
      }
      document.addEventListener('keydown', clav, true);
      S.root.querySelector('.ka-panel').appendChild(fond);
      setTimeout(function () { if (champ) { champ.focus(); champ.select(); } else bo.focus(); }, 0);
    });
  }
  var demander = function (msg, valeur) { return dialogue(msg, { champ: true, valeur: valeur }); };
  var confirmer = function (msg) { return dialogue(msg, {}); };
  var avertir = function (msg) { return dialogue(String(msg), { sansAnnuler: true }); };
  function mini(txt, titre, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = 'ka-mini'; b.textContent = txt; b.title = titre; b.setAttribute('aria-label', titre); b.addEventListener('click', function (e) { e.stopPropagation(); fn(); }); return b; }
  function rafraichirListe() {
    return api('GET', '/api/kofi/annuaire/discussions').then(function (r) { if (r.ok && S.etat) { S.etat.dossiers = r.data.dossiers || []; S.etat.discussions = r.data.discussions || []; } });
  }
  function nomDossier(id) { var d = S.etat && (S.etat.dossiers || []).filter(function (x) { return x.id === id; })[0]; return d ? d.nom : ''; }
  /* Fil d'Ariane au-dessus de la discussion : « 📁 Dossier › titre » ; un clic ouvre la liste. */
  function majFil() {
    var b = $('.ka-ou'); if (!b) return;
    var ok = S.vue === 'chat' && S.etat && (S.etat.etat === 'utilisable' || S.etat.etat === 'recharge') && !S.presEnCours && (S.conv || S.dossier);
    if (!ok) { b.classList.remove('on'); return; }
    var d = S.dossier ? nomDossier(S.dossier) : '';
    b.textContent = (d ? '📁 ' + d + (S.titre ? ' › ' : '') : '') + (S.titre || (d ? '' : T.untitled));
    b.title = T.liste; b.classList.add('on');
  }
  function aller(vue) { if (S.arreterMicro) S.arreterMicro(); S.vue = vue; construireCorps(); }
  function ouvrirDiscussion(id) {
    return api('GET', '/api/kofi/annuaire/conversations/' + id).then(function (r) {
      if (!r.ok) { avertir((r.data && r.data.error) || T.erreur); return; }
      S.conv = r.data.id; S.msgs = r.data.messages || []; S.titre = r.data.titre || ''; S.dossier = r.data.dossier_id || null;
      aller('chat');
    });
  }
  function nouvelleDiscussion(dossierId) { S.conv = null; S.msgs = []; S.titre = ''; S.dossier = dossierId || null; aller('chat'); }
  function ligneDisc(c, dossiers) {
    var l = document.createElement('div'); l.className = 'ka-disc' + (c.id === S.conv ? ' actuelle' : '');
    var o = document.createElement('button'); o.type = 'button'; o.className = 'ka-ouvrir'; o.innerHTML = '<span class="t"></span><small></small>';
    o.querySelector('.t').textContent = c.titre; o.querySelector('small').textContent = dateCourte(c.derniere_activite);
    o.addEventListener('click', function () { ouvrirDiscussion(c.id); });
    l.appendChild(o);
    var sel = document.createElement('select'); sel.className = 'ka-sel'; sel.title = T.deplacer; sel.setAttribute('aria-label', T.deplacer);
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Ranger…'; sel.appendChild(o0);
    var oh = document.createElement('option'); oh.value = '0'; oh.textContent = '— ' + T.horsDossier; sel.appendChild(oh);
    dossiers.forEach(function (d) { var op = document.createElement('option'); op.value = String(d.id); op.textContent = '📁 ' + d.nom; sel.appendChild(op); });
    sel.addEventListener('change', function () {
      if (sel.value === '') return;
      var cible = sel.value === '0' ? null : Number(sel.value);
      api('PATCH', '/api/kofi/annuaire/conversations/' + c.id, { dossier_id: cible }).then(function (r) {
        if (!r.ok) throw new Error((r.data && r.data.error) || T.erreur);
        if (c.id === S.conv) S.dossier = cible; if (cible) S.ouverts[cible] = true; return rafraichirListe();
      }).then(construireCorps).catch(function (er) { avertir(er.message); });
    });
    l.appendChild(sel);
    l.appendChild(mini('✏️', T.renommer, function () {
      demander(T.nomDisc, c.titre).then(function (n) {
        if (!n || !n.trim()) return;
        return api('PATCH', '/api/kofi/annuaire/conversations/' + c.id, { titre: n.trim() }).then(function (r) { if (!r.ok) throw new Error((r.data && r.data.error) || T.erreur); if (c.id === S.conv) S.titre = n.trim(); return rafraichirListe(); }).then(construireCorps);
      }).catch(function (er) { avertir(er.message); });
    }));
    l.appendChild(mini('🗑️', T.supprimerIt, function () {
      confirmer(T.confirmSuppr).then(function (oui) {
        if (!oui) return;
        return api('DELETE', '/api/kofi/annuaire/conversations/' + c.id).then(function () { if (c.id === S.conv) { S.conv = null; S.msgs = []; S.titre = ''; S.dossier = null; } return rafraichirListe(); }).then(construireCorps);
      }).catch(function (er) { avertir(er.message); });
    }));
    return l;
  }
  function rendreListe() {
    var body = $('.ka-body'); body.innerHTML = ''; $('.ka-foot').style.display = 'none'; majFil();
    var barre = document.createElement('div'); barre.className = 'ka-bar';
    var bn = document.createElement('button'); bn.type = 'button'; bn.className = 'ka-ok'; bn.textContent = T.nouvelleDisc; bn.addEventListener('click', function () { nouvelleDiscussion(null); });
    var bd = document.createElement('button'); bd.type = 'button'; bd.className = 'ka-ko'; bd.textContent = T.nouveauDossier;
    bd.addEventListener('click', function () {
      demander(T.nomDossier, '').then(function (nom) {
        if (!nom || !nom.trim()) return;
        return api('POST', '/api/kofi/annuaire/dossiers', { nom: nom.trim() }).then(function (r) { if (!r.ok) throw new Error((r.data && r.data.error) || T.erreur); S.ouverts[r.data.id] = true; return rafraichirListe(); }).then(construireCorps);
      }).catch(function (er) { avertir(er.message); });
    });
    barre.appendChild(bn); barre.appendChild(bd); body.appendChild(barre);
    var dossiers = (S.etat && S.etat.dossiers) || [], disc = (S.etat && S.etat.discussions) || [];
    dossiers.forEach(function (d) {
      var contenu = disc.filter(function (c) { return c.dossier_id === d.id; });
      var bloc = document.createElement('div'); bloc.className = 'ka-doss';
      var h = document.createElement('div'); h.className = 'ka-dh';
      var tog = document.createElement('button'); tog.type = 'button'; tog.className = 'ka-tog'; tog.textContent = (S.ouverts[d.id] ? '▾ 📁 ' : '▸ 📁 ') + d.nom + ' (' + contenu.length + ')';
      tog.addEventListener('click', function () { S.ouverts[d.id] = !S.ouverts[d.id]; rendreListe(); });
      h.appendChild(tog);
      h.appendChild(mini('＋', T.nouvelleDansDossier, function () { nouvelleDiscussion(d.id); }));
      h.appendChild(mini('✏️', T.renommer, function () {
        demander(T.nomDossier, d.nom).then(function (n) {
          if (!n || !n.trim()) return;
          return api('PATCH', '/api/kofi/annuaire/dossiers/' + d.id, { nom: n.trim() }).then(function (r) { if (!r.ok) throw new Error((r.data && r.data.error) || T.erreur); return rafraichirListe(); }).then(construireCorps);
        }).catch(function (er) { avertir(er.message); });
      }));
      h.appendChild(mini('🗑️', T.supprimerIt, function () {
        confirmer(T.confirmDossier(contenu.length)).then(function (oui) {
          if (!oui) return;
          return api('DELETE', '/api/kofi/annuaire/dossiers/' + d.id).then(function () {
            if (contenu.some(function (c) { return c.id === S.conv; })) { S.conv = null; S.msgs = []; S.titre = ''; }
            if (S.dossier === d.id) S.dossier = null;
            return rafraichirListe();
          }).then(construireCorps);
        }).catch(function (er) { avertir(er.message); });
      }));
      bloc.appendChild(h);
      if (S.ouverts[d.id]) {
        if (!contenu.length) { var v = document.createElement('div'); v.className = 'ka-vide'; v.textContent = T.aucune; bloc.appendChild(v); }
        contenu.forEach(function (c) { bloc.appendChild(ligneDisc(c, dossiers)); });
      }
      body.appendChild(bloc);
    });
    var libres = disc.filter(function (c) { return !c.dossier_id; });
    var t = document.createElement('div'); t.className = 'ka-h5'; t.textContent = T.sansDossier; body.appendChild(t);
    if (!libres.length) { var v2 = document.createElement('div'); v2.className = 'ka-vide'; v2.textContent = T.aucune; body.appendChild(v2); }
    else { var bl = document.createElement('div'); bl.className = 'ka-doss'; libres.forEach(function (c) { bl.appendChild(ligneDisc(c, dossiers)); }); body.appendChild(bl); }
  }

  /* ── Dictée vocale : reconnaissance native du navigateur (gratuite, aucune clé) ; le bouton disparaît si le navigateur ne la propose pas ── */
  function initMicro() {
    var btn = $('.ka-mic'), ta = $('.ka-form textarea'), st = $('.ka-micst'), SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { btn.style.display = 'none'; return; }
    var rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = true;
    var ecoute = false, arret = false, base = '', final = '';
    function fin() { ecoute = false; btn.classList.remove('rec'); btn.setAttribute('aria-label', T.micro); btn.title = T.micro; if (st.textContent === T.microEcoute) st.textContent = ''; }
    rec.addEventListener('result', function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) { if (e.results[i].isFinal) final += e.results[i][0].transcript; else interim += e.results[i][0].transcript; }
      ta.value = (base + ' ' + final + ' ' + interim).replace(/\s+/g, ' ').trim(); ta.dispatchEvent(new Event('input'));
    });
    rec.addEventListener('end', function () { if (!arret) { try { rec.start(); return; } catch (e) { /* on termine */ } } fin(); });
    rec.addEventListener('error', function (e) {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      arret = true; fin(); st.textContent = (e.error === 'not-allowed' || e.error === 'service-not-allowed') ? T.microRefus : T.microErreur;
    });
    btn.addEventListener('click', function () {
      if (ecoute) { arret = true; try { rec.stop(); } catch (e) { /* déjà arrêté */ } return; }
      ecoute = true; arret = false; final = ''; base = ta.value.trim(); st.textContent = T.microEcoute; btn.classList.add('rec'); btn.setAttribute('aria-label', T.microArret); btn.title = T.microArret;
      try { rec.start(); } catch (e) { arret = true; fin(); st.textContent = T.microErreur; }
    });
    S.arreterMicro = function () { final = ''; if (ecoute) { arret = true; try { rec.stop(); } catch (e) { /* déjà arrêté */ } } };
  }

  function construireCorps() {
    if (S.presEnCours) return;
    var body = $('.ka-body'); body.innerHTML = '';
    var foot = $('.ka-foot'), e = S.etat, ta = $('.ka-form textarea'), env = $('.ka-send');
    foot.style.display = ''; ta.disabled = false; env.disabled = false; majMeta(); majFil();
    $('.ka-av').textContent = (e && e.avertissement) || T.info1;
    S.root.querySelectorAll('[data-a="nouvelle"],[data-a="supprimer"],[data-a="liste"]').forEach(function (b) { b.style.display = e && (e.etat === 'utilisable' || e.etat === 'recharge') ? '' : 'none'; });
    if (!e) { body.appendChild(carte('Koffi', T.indisponible)); foot.style.display = 'none'; return; }
    var st = e.etat;
    if (st === 'premium_requis') { body.appendChild(carte(T.premiumTitre, e.message_etat || '', [lienBouton('⭐ ' + T.premium, (S.opts && S.opts.premiumUrl) || 'premium.html'), bouton(T.manuel, 'manuel', true)])); foot.style.display = 'none'; return; }
    if (st === 'reciprocite') { body.appendChild(carte(T.reciproTitre, e.message_etat || '', [lienBouton(T.confidentialite, 'confidentialite.html'), bouton(T.manuel, 'manuel', true)])); foot.style.display = 'none'; return; }
    if (st === 'majorite') { body.appendChild(carteMajorite()); foot.style.display = 'none'; return; }
    if (st === 'mineur' || st === 'pays' || st === 'desactive' || st === 'indisponible') { body.appendChild(carte('Koffi', T[st], [bouton(T.manuel, 'manuel', true)])); foot.style.display = 'none'; return; }
    if (e.presentation_vue === false && !S.msgs.length) { foot.style.display = 'none'; jouerPresentation(body); return; }
    if (!lsGet('koffi_annuaire_info_v1')) { body.appendChild(carteInfo()); foot.style.display = 'none'; return; }
    if (S.vue === 'liste') { rendreListe(); return; }
    S.msgs.forEach(ajouterMessage);
    if (!S.msgs.length) {
      ajouterMessage({ role: 'assistant', contenu: S.dossier && nomDossier(S.dossier) ? T.accueilDossier(nomDossier(S.dossier)) : T.accueil });
      var s = document.createElement('div'); s.className = 'ka-sug';
      T.suggestions.forEach(function (x) { var b = document.createElement('button'); b.type = 'button'; b.textContent = x; b.addEventListener('click', function () { ta.value = x; envoyer(); }); s.appendChild(b); });
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
    $('.ka-t b').textContent = T.nom; $('.ka-t span').textContent = T.sous;
    $('.ka-btn span').textContent = T.nom; $('.ka-btn').setAttribute('aria-label', T.ouvrir); $('.ka-btn').title = T.ouvrir;
    $('[data-a="fermer"]').setAttribute('aria-label', T.fermer); $('[data-a="fermer"]').title = T.fermer;
    $('[data-a="nouvelle"]').title = T.nouvelle; $('[data-a="nouvelle"]').setAttribute('aria-label', T.nouvelle);
    $('[data-a="supprimer"]').title = T.supprimer; $('[data-a="supprimer"]').setAttribute('aria-label', T.supprimer);
    $('.ka-form textarea').placeholder = T.placeholder; $('.ka-send').textContent = T.envoyer;
    $('[data-a="liste"]').title = T.liste; $('[data-a="liste"]').setAttribute('aria-label', T.liste);
    $('.ka-mic').title = T.micro; $('.ka-mic').setAttribute('aria-label', T.micro);
  }

  function chargerEtat() {
    return api('GET', '/api/kofi/annuaire/etat').then(function (r) {
      if (r.ok) {
        var c = r.data.conversation;
        S.etat = r.data; S.conv = c ? c.id : null; S.msgs = c ? c.messages : []; S.titre = c ? (c.titre || '') : ''; S.dossier = c ? (c.dossier_id || null) : null;
      }
      return r;
    });
  }
  function ouvrirPanneau() {
    S.root.classList.add('open'); S.vue = 'chat';
    chargerEtat().then(function () { construireCorps(); var ta = $('.ka-form textarea'); if (ta && !ta.disabled && $('.ka-foot').style.display !== 'none' && window.innerWidth > 560) ta.focus(); });
  }
  function fermerPanneau() { if (S.arreterMicro) S.arreterMicro(); S.root.classList.remove('open'); var b = $('.ka-btn'); if (b) b.focus(); }

  function envoyer() {
    if (S.occupe) return;
    var ta = $('.ka-form textarea'); var texte = ta.value.trim(); if (!texte || ta.disabled) return;
    var max = S.etat && S.etat.max_message; if (max && texte.length > max) { ajouterMessage({ role: 'assistant', contenu: 'Message trop long (' + max + ' caractères au maximum).' }); return; }
    S.occupe = true; $('.ka-send').disabled = true; if (S.arreterMicro) S.arreterMicro(); $('.ka-micst').textContent = '';
    var corps = $('.ka-body');
    if (!S.msgs.length) corps.innerHTML = '';
    var mu = { role: 'user', contenu: texte }; S.msgs.push(mu); ajouterMessage(mu);
    ta.value = ''; ta.style.height = 'auto';
    var att = document.createElement('div'); att.className = 'ka-typing'; att.setAttribute('role', 'status'); att.textContent = T.reflechit; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/annuaire/messages', { texte: texte, conversation_id: S.conv || undefined, dossier_id: (!S.conv && S.dossier) ? S.dossier : undefined }).then(function (r) {
      att.remove();
      if (r.ok) {
        if (!S.conv) { S.titre = texte.replace(/\s+/g, ' ').slice(0, 60); rafraichirListe().then(majFil); }
        S.conv = r.data.conversation_id; S.msgs.push(r.data.message); ajouterMessage(r.data.message); majFil();
        if (S.etat && r.data.portefeuille) S.etat.portefeuille = r.data.portefeuille;
        majMeta();
        if (S.etat && S.etat.etat === 'recharge') construireCorps();   /* la carte de recharge reste sous les derniers messages */
      } else {
        S.msgs.pop();
        var code = r.data && r.data.code;
        if (code === 'credits_epuises') { if (S.etat) { S.etat.etat = 'recharge'; if (r.data.portefeuille) S.etat.portefeuille = r.data.portefeuille; } construireCorps(); }
        else if (code === 'premium_requis' || code === 'reciprocite' || code === 'majorite_requise' || code === 'mineur' || code === 'pays_non_pris_en_charge') { chargerEtat().then(construireCorps); }
        else ajouterMessage({ role: 'assistant', contenu: (r.data && r.data.error) || (r.status === 429 ? T.trop : T.erreur) });
      }
    }).catch(function () { att.remove(); S.msgs.pop(); ajouterMessage({ role: 'assistant', contenu: T.erreur }); })
      .then(function () { S.occupe = false; var ok = S.etat && (S.etat.etat === 'utilisable' || S.etat.etat === 'recharge'); $('.ka-send').disabled = !ok; if (ok) ta.focus(); });
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
      var corps = $('.ka-body');
      if (statut === 'attente') { corps.innerHTML = ''; corps.appendChild(carte('Koffi', msg)); $('.ka-foot').style.display = 'none'; return; }
      chargerEtat().then(function () { construireCorps(); ajouterMessage({ role: 'assistant', contenu: msg }); });
    } });
  }

  function construire() {
    if (!document.getElementById('ka-style')) { var st = document.createElement('style'); st.id = 'ka-style'; st.textContent = CSS; document.head.appendChild(st); }
    var root = document.createElement('div'); root.className = 'ka-root' + (S.opts && S.opts.telephone ? ' ka-tel' : ''); root.setAttribute('data-koffi-annuaire', '1');
    root.innerHTML =
      '<button type="button" class="ka-btn" data-a="ouvrir"><img src="/assets/koffi-avatar-96.webp" width="46" height="46" alt=""><span></span></button>' +
      '<section class="ka-panel" role="dialog" aria-label="Koffi, conseiller de l\'Annuaire" aria-modal="false">' +
        '<div class="ka-head"><img src="/assets/koffi-avatar-96.webp" width="42" height="42" alt=""><div class="ka-t"><b></b><span></span><button type="button" class="ka-credit" data-a="credit" style="display:none"></button></div>' +
          '<button type="button" class="ka-ic" data-a="liste">📁</button><button type="button" class="ka-ic" data-a="nouvelle">＋</button><button type="button" class="ka-ic" data-a="supprimer">🗑</button><button type="button" class="ka-ic" data-a="fermer">✕</button></div>' +
        '<button type="button" class="ka-ou" data-a="liste"></button>' +
        '<div class="ka-body" aria-live="polite"></div>' +
        '<div class="ka-foot"><p class="ka-av"></p><p class="ka-micst" role="status"></p><form class="ka-form"><textarea rows="3" maxlength="1500" aria-label="Votre recherche"></textarea><div class="ka-side"><button type="button" class="ka-mic" aria-label="Dicter votre message">🎤</button><button type="submit" class="ka-send"></button></div></form></div>' +
      '</section>';
    document.body.appendChild(root); S.root = root;
    root.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target.closest('[data-a]') : null; if (!t) return;
      var act = t.getAttribute('data-a');
      if (act === 'ouvrir') return ouvrirPanneau();
      if (act === 'fermer') return fermerPanneau();
      if (act === 'credit') return ouvrirCredit();
      if (act === 'compris') { lsSet('koffi_annuaire_info_v1', '1'); return construireCorps(); }
      if (act === 'majorite') return confirmerMajorite();
      if (act === 'manuel') return fermerEtChercher();
      if (act === 'liste') {
        if (S.vue === 'liste') return aller('chat');
        return rafraichirListe().then(function () { aller('liste'); });
      }
      if (act === 'nouvelle') { S.conv = null; S.msgs = []; S.titre = ''; S.dossier = null; S.vue = 'chat'; if (S.arreterMicro) S.arreterMicro(); construireCorps(); return; }
      if (act === 'supprimer') {
        if (!S.conv) return;
        var cible = S.conv;
        return confirmer(T.confirmSuppr).then(function (oui) {
          if (!oui) return;
          return api('DELETE', '/api/kofi/annuaire/conversations/' + cible).then(function () { S.conv = null; S.msgs = []; S.titre = ''; S.dossier = null; return rafraichirListe(); }).then(construireCorps);
        }).catch(function (er) { avertir(er.message); });
      }
    });
    root.querySelector('.ka-form').addEventListener('submit', function (ev) { ev.preventDefault(); envoyer(); });
    var ta = root.querySelector('.ka-form textarea');
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 200) + 'px'; });
    initMicro();
    if (!ecouteEchap) { ecouteEchap = true; document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.root && S.root.classList.contains('open') && !document.querySelector('.kcr-fond')) fermerPanneau(); }); }
  }

  window.KoffiAnnuaire = {
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
      if (S.arreterMicro) S.arreterMicro();
      S.root = null; S.etat = null; S.conv = null; S.msgs = []; S.occupe = false; S.opts = null; S.vue = 'chat'; S.titre = ''; S.dossier = null; S.arreterMicro = null;
    },
    estMonte: function () { return !!S.root; }
  };
})();

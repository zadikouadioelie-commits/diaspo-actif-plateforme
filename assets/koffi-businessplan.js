/* ═════════════════════════════════════════════════
   assets/koffi-businessplan.js — KOFFI JOUE L'INVESTISSEUR, LE BANQUIER OU LE CLIENT : fenêtre de discussion du Business Plan (2026-11-01)
   ═════════════════════════════════════════════════
   Autonome (CSS injecté, préfixe .kb-) : KoffiBusinessPlan.monter({ planId, ouvrirRubrique(cle), telephone })  ·  .ouvrir()  ·  .demonter()
   Sans planId : monter({ choixProjet: true }) — Koffi demande d'abord le rôle, puis POUR QUEL PROJET, et pose ses questions tout seul (sur le projet entier).
   Dans un dossier ouvert (planId connu) : le projet est déjà choisi, Koffi enchaîne directement avec les questions et reprend le fil de la séance en cours.
   Le bilan peut être téléchargé (document Word) ou imprimé / enregistré en PDF : points forts, points faibles, points à améliorer, déroulé de l'entretien.
   Le propriétaire du plan choisit un rôle ; Koffi lit un RÉSUMÉ du plan (après consentement), pose une question à la fois, réagit aux réponses, conseille sur demande
   (« Comment répondre ? ») puis fait un bilan (forces, faiblesses avec la rubrique à retravailler, pistes). Toutes les règles (propriétaire, consentement, majorité, pays,
   crédit, résumé du plan) sont décidées par le SERVEUR (/api/kofi/business-plan/:id/*) : ici on n'affiche que ce qu'il renvoie.
   Le crédit (pastille, recharge) vient de assets/koffi-credit.js : un seul portefeuille pour tout Koffi.
   États serveur : utilisable | recharge | majorite | mineur | pays | desactive | indisponible.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiBusinessPlan) return;

  var T = {
    nom: 'Koffi', sous: 'Grand oral du business plan', ouvrir: 'Tester mon business plan avec Koffi', fermer: 'Fermer', nouvelle: 'Nouvelle séance',
    supprimer: 'Supprimer cette séance', confirmSuppr: 'Supprimer cette séance ? Cette action est définitive.',
    placeholder: 'Votre réponse…', envoyer: 'Répondre', reflechit: 'Koffi réfléchit…',
    conseil: '💡 Comment répondre ?', bilan: '🏁 Terminer et voir le bilan', conseilEnCours: 'Koffi prépare un conseil…', bilanEnCours: 'Koffi prépare le bilan…',
    accueilTitre: 'Qui voulez-vous convaincre ?',
    accueil: 'Je joue un rôle et je vous pose des questions sur votre plan, une à la fois, comme en situation réelle. Vous répondez, je réagis ; si vous hésitez, demandez « Comment répondre ? ». À la fin, je fais le bilan : forces, points faibles, pistes.',
    planVide: 'Votre plan est encore trop peu rempli pour être testé. Complétez au moins le résumé exécutif, le problème, la solution et le marché, puis revenez.',
    reprendre: 'Reprendre la dernière séance', voirBilan: 'Revoir le bilan de la dernière séance',
    questionN: function (n, max) { return 'Question ' + n + ' sur ' + max; },
    gratuitNote: '✓ Question sur Koffi : gratuite, elle ne compte pas dans votre crédit.',
    info: 'Koffi joue un rôle pour vous faire répéter : ce n\'est ni un avis d\'expert, ni un conseil financier ou juridique, et un vrai investisseur ou banquier peut réagir autrement.',
    consTitre: 'Koffi va lire un résumé de votre business plan', consBtn: 'Autoriser et continuer',
    infoLien: 'En savoir plus : politique de confidentialité',
    forces: '✅ Vos points forts', faiblesses: '🟠 Vos points faibles', pistes: '💡 Points à améliorer',
    telecharger: '⬇ Télécharger mon bilan', imprimer: '🖨 Imprimer / PDF', docIntro: 'Document de préparation : Koffi joue un rôle pour vous faire répéter, ce n\'est ni un avis d\'expert ni un conseil financier ou juridique.',
    choixRoleTitre: 'Qui voulez-vous convaincre ?', choixProjetTitre: 'Pour quel projet ?', choixProjetTexte: 'Choisissez le business plan que Koffi doit vous faire défendre. Il vous posera ensuite ses questions tout seul, sur le projet entier.',
    changerRole: '← Changer de rôle', aucunProjet: 'Vous n\'avez pas encore de business plan. Créez-en un, puis revenez : Koffi pourra alors vous faire passer le grand oral.', creerProjet: 'Créer un business plan', chargementProjets: 'Je cherche vos projets…', projetSansNom: 'Projet sans titre', ouvrirRubrique: 'Ouvrir la rubrique', recommencer: 'Recommencer avec un autre rôle',
    majTitre: 'Koffi est réservé aux personnes majeures', majTexte: 'Pour utiliser Koffi, confirmez que vous avez 18 ans ou plus. Votre business plan reste entièrement utilisable sans lui.', majCase: 'Je confirme avoir 18 ans ou plus', majBtn: 'Confirmer',
    mineur: 'Koffi est réservé aux personnes de 18 ans ou plus. Votre business plan reste entièrement utilisable sans lui.',
    pays: 'Koffi n\'est pas disponible dans votre pays pour le moment.', desactive: 'Koffi est désactivé pour le moment.', indisponible: 'Koffi est épuisé pour le moment : l\'équipe le recharge. Réessayez un peu plus tard.',
    rechargeTitre: 'Votre crédit Koffi est épuisé', rechargeTexte: 'Rechargez votre crédit pour continuer : le même crédit sert à tout Koffi (cours, création de formation, Annuaire, événements, business plan). Poser une question sur ce que sait faire Koffi reste gratuit.',
    rechargeTextePremium: 'Votre crédit du mois est utilisé : il est renouvelé le mois prochain. Vous pouvez aussi recharger dès maintenant ; le même crédit sert à tout Koffi.', recharger: 'Recharger Koffi',
    erreur: 'Une erreur est survenue. Réessayez.', trop: 'Doucement : patientez quelques secondes avant le message suivant.', compris: 'J\'ai compris'
  };

  var CSS = [
    '.kb-root,.kb-root *{box-sizing:border-box}',
    '.kb-root{position:fixed;right:22px;bottom:22px;z-index:9000;font-family:inherit;color:#0f172a;line-height:1.45}',
    '.kb-btn{display:flex;align-items:center;gap:10px;border:0;cursor:pointer;background:#0D2B4E;color:#fff;border-radius:999px;padding:5px 18px 5px 5px;box-shadow:0 8px 26px rgba(13,43,78,.38),0 0 0 2px #F26422;font:700 14px/1.2 inherit;font-family:inherit}',
    '.kb-btn:hover{transform:translateY(-1px)}.kb-btn:focus-visible{outline:3px solid #F26422;outline-offset:3px}',
    '.kb-btn img{width:46px;height:46px;border-radius:50%;display:block;background:#fff}',
    '.kb-panel{position:fixed;right:18px;bottom:18px;width:420px;max-width:calc(100vw - 24px);height:min(700px,calc(100vh - 36px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(2,12,27,.45),0 0 0 1px rgba(13,43,78,.15);display:none;flex-direction:column;overflow:hidden;color:#0f172a;text-align:left}',
    '.kb-root.open .kb-panel{display:flex}.kb-root.open .kb-btn,.kb-root.kb-sansbtn .kb-btn{display:none}',
    '.kb-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0D2B4E;flex:none}',
    '.kb-head img{width:42px;height:42px;border-radius:50%;background:#fff;flex:none}',
    '.kb-t{flex:1;min-width:0}.kb-t b{display:block;font-size:16px;color:#fff}.kb-t span{display:block;font-size:11.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.kb-t .kb-credit{margin-top:3px;max-width:100%;overflow:hidden;text-overflow:ellipsis}',
    '.kb-ic{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:9px;min-width:34px;height:34px;cursor:pointer;font:700 14px inherit;font-family:inherit;padding:0 8px}',
    '.kb-ic:hover{background:rgba(255,255,255,.24)}.kb-ic:focus-visible{outline:2px solid #F26422}',
    '.kb-prog{flex:none;background:#fff7ed;border-bottom:1px solid #fed7aa;color:#9a3412;font-size:12px;font-weight:800;padding:5px 12px;display:none}',
    '.kb-body{flex:1;overflow-y:auto;padding:14px;background:#f1f5f9;display:flex;flex-direction:column;gap:10px}',
    '.kb-msg{max-width:92%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.kb-msg.u{align-self:flex-end;background:#0D2B4E;color:#fff;border-bottom-right-radius:4px}',
    '.kb-msg.a{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
    '.kb-msg.react{color:#475569;font-style:italic;background:#f8fafc}',
    '.kb-msg.q{border:1.5px solid #F26422;font-weight:700;color:#0D2B4E}',
    '.kb-msg.cons{background:#fffbeb;border-color:#fde68a}',
    '.kb-note{margin-top:6px;font-size:11.5px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:5px 8px;white-space:normal;font-weight:700}',
    '.kb-typing{align-self:flex-start;color:#475569;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:8px 12px}',
    '.kb-roles{display:flex;flex-direction:column;gap:8px}',
    '.kb-role{display:flex;gap:12px;align-items:flex-start;text-align:left;border:1.5px solid #e2e8f0;background:#fff;border-radius:14px;padding:12px;cursor:pointer;font:inherit;color:#0f172a}',
    '.kb-role:hover:not([disabled]){border-color:#F26422;box-shadow:0 4px 14px rgba(242,100,34,.18)}.kb-role:focus-visible{outline:3px solid #F26422;outline-offset:2px}.kb-role[disabled]{opacity:.55;cursor:not-allowed}',
    '.kb-role .ic{font-size:26px;flex:none}.kb-role b{display:block;font-size:15px;color:#0D2B4E}.kb-role small{display:block;font-size:12.5px;color:#475569}.kb-role em{display:block;font-style:normal;font-size:12px;font-weight:700;color:#b84c1a;margin-bottom:2px}',
    '.kb-plans{display:flex;flex-direction:column;gap:8px;margin-top:10px}',
    '.kb-retour{border:0;background:none;color:#b84c1a;font-weight:800;text-decoration:underline;cursor:pointer;font:inherit;font-size:12.5px;padding:0;margin:8px 0 0}',
    '.kb-dl{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 2px}',
    '.kb-foot{flex:none;background:#fff;border-top:1px solid #e2e8f0;padding:8px 10px 10px}',
    '.kb-av{margin:0 0 6px;font-size:11px;color:#64748b;line-height:1.35}',
    '.kb-acts{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}.kb-acts button{background:#fff;border:1px solid #cbd5e1;border-radius:99px;padding:5px 11px;font-size:12.5px;cursor:pointer;color:#0D2B4E;font-family:inherit}.kb-acts button:hover:not([disabled]){background:#fff7ed;border-color:#F26422}.kb-acts button[disabled]{opacity:.5;cursor:not-allowed}',
    '.kb-form{display:flex;gap:8px;align-items:flex-end}',
    '.kb-form textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font:14px/1.4 inherit;font-family:inherit;max-height:130px;min-height:42px;background:#fff;color:#0f172a}',
    '.kb-form textarea:focus{outline:2px solid #F26422;border-color:#F26422}',
    '.kb-send{border:0;background:#F26422;color:#fff;border-radius:12px;height:42px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.kb-send:disabled{opacity:.5;cursor:not-allowed}',
    '.kb-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;font-size:13.5px;line-height:1.55;color:#0f172a}',
    '.kb-card h4{margin:0 0 6px;font-size:15px;color:#0D2B4E}.kb-card h5{margin:12px 0 4px;font-size:13.5px;color:#0D2B4E}.kb-card p{margin:0 0 8px;color:#0f172a}',
    '.kb-card ul{margin:4px 0 8px;padding-left:18px}.kb-card li{margin:4px 0}',
    '.kb-card a.kb-l{color:#b84c1a;font-weight:700}',
    '.kb-lien{border:0;background:none;color:#b84c1a;font-weight:800;text-decoration:underline;cursor:pointer;font:inherit;font-size:12.5px;padding:0 0 0 4px}',
    '.kb-cta{display:inline-block;border:0;background:#F26422;color:#fff;font-weight:800;padding:10px 18px;border-radius:10px;text-decoration:none;cursor:pointer;font-family:inherit;font-size:14px;margin:4px 8px 0 0}',
    '.kb-cta.sec{background:#fff;color:#0D2B4E;border:1.5px solid #0D2B4E}.kb-cta[disabled]{opacity:.55;cursor:not-allowed}',
    '.kb-cta:focus-visible{outline:3px solid #0D2B4E;outline-offset:2px}',
    '@media (max-width:560px){.kb-root{right:10px;bottom:calc(10px + env(safe-area-inset-bottom))}.kb-btn span{display:none}.kb-btn{padding:4px}.kb-panel{right:0;bottom:0;left:0;width:100%;max-width:none;height:85vh;height:85dvh;border-radius:16px 16px 0 0}.kb-form textarea{font-size:16px}}',
    '@media (prefers-reduced-motion:no-preference){.kb-btn{transition:transform .15s}}'
  ].join('\n');

  var S = { opts: null, etat: null, conv: null, role: '', msgs: [], nb: 0, terminee: false, nouvelle: false, root: null, occupe: false, choixRole: '', roleEnAttente: '', plans: null, bilanMsg: null };
  /* Rôles proposés AVANT le choix du projet (l'état serveur, propre à un plan, n'est pas encore chargé). */
  var ROLES_CHOIX = [
    { cle: 'investisseur', icone: '💼', titre: 'Investisseur', court: 'Il décide de financer ou non', description: 'Un investisseur lit votre plan et vous challenge sur le marché, le modèle économique, l\'équipe et les chiffres.' },
    { cle: 'banquier', icone: '🏦', titre: 'Banquier', court: 'Il décide de prêter ou non', description: 'Un banquier vérifie votre capacité à rembourser : chiffres, garanties, trésorerie, risques.' },
    { cle: 'client', icone: '🛍️', titre: 'Client', court: 'Il décide d\'acheter ou non', description: 'Un client se demande pourquoi il achèterait chez vous plutôt qu\'ailleurs, et à quel prix.' }
  ];
  var ecouteEchap = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (sel) { return S.root.querySelector(sel); };
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); });
  }
  var base = function () { return '/api/kofi/business-plan/' + encodeURIComponent(S.opts.planId); };

  function chargerScript(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(function (ok) { var sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); });
  }
  var chargerCredit = function () { return chargerScript('/assets/koffi-credit.js?v=4', function () { return !!window.KoffiCredit; }); };

  /* ── Le crédit : pastille cliquable dans l'en-tête ── */
  function majMeta() {
    var p = $('.kb-credit'), e = S.etat, pf = e && e.portefeuille;
    if (!p) return;
    p.style.display = pf && window.KoffiCredit ? '' : 'none';
    if (pf && window.KoffiCredit) window.KoffiCredit.appliquer(p, pf, 'fr');
  }
  function ouvrirCredit() { if (window.KoffiCredit) window.KoffiCredit.ouvrir({ lg: 'fr', page: 'businessplan', planId: S.opts && S.opts.planId }); }
  function majProgression() {
    var b = $('.kb-prog'), max = S.etat && S.etat.nb_questions;
    if (!b) return;
    var enSeance = S.conv && !S.terminee && S.nb > 0;
    b.style.display = enSeance ? '' : 'none';
    if (enSeance) b.textContent = (libRole(S.role) ? libRole(S.role) + ' · ' : '') + T.questionN(Math.min(S.nb, max || S.nb), max || S.nb);
  }
  function libRole(cle) { var r = ((S.etat && S.etat.roles) || []).filter(function (x) { return x.cle === cle; })[0]; return r ? r.titre : ''; }

  /* ── Messages ── */
  function bulle(cls, texte) { var el = document.createElement('div'); el.className = 'kb-msg ' + cls; el.textContent = texte; return el; }
  function carteBilan(b) {
    var d = document.createElement('div'); d.className = 'kb-card';
    var html = '';
    if (b.forces && b.forces.length) html += '<h5>' + T.forces + '</h5><ul>' + b.forces.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (b.faiblesses && b.faiblesses.length) html += '<h5>' + T.faiblesses + '</h5><ul>' + b.faiblesses.map(function (f) {
      return '<li>' + esc(f.texte) + (f.rubrique && S.opts && S.opts.ouvrirRubrique ? ' <button type="button" class="kb-lien" data-rub="' + esc(f.rubrique) + '">' + T.ouvrirRubrique + ' « ' + esc(f.rubrique_label || f.rubrique) + ' »</button>' : (f.rubrique_label ? ' <em>(' + esc(f.rubrique_label) + ')</em>' : '')) + '</li>';
    }).join('') + '</ul>';
    if (b.pistes && b.pistes.length) html += '<h5>' + T.pistes + '</h5><ul>' + b.pistes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    d.innerHTML = html; return d;
  }
  /* ── Document du bilan : points forts, points faibles, points à améliorer, déroulé de l'entretien ── */
  function boutonsDocument() {
    var d = document.createElement('div'); d.className = 'kb-dl';
    d.appendChild(bouton(T.telecharger, 'dl-doc')); d.appendChild(bouton(T.imprimer, 'dl-print', true));
    return d;
  }
  function htmlBilan() {
    var m = S.bilanMsg; if (!m) return '';
    var b = m.bilan || {}, e = S.etat || {}, nom = (e.plan && e.plan.nom) || T.projetSansNom;
    var date = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    var liste = function (titre, items) { return items && items.length ? '<h2>' + titre + '</h2><ul>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>' : ''; };
    var deroule = S.msgs.map(function (x) {
      if (x.role === 'user') return '<p class="r"><b>Votre réponse :</b> ' + esc(x.contenu) + '</p>';
      if (x.type === 'question') return '<p class="q"><b>Question :</b> ' + esc(x.question || x.contenu) + '</p>';
      if (x.type === 'conseil') return '<p class="c"><b>Conseil de Koffi :</b> ' + esc(x.contenu) + '</p>';
      return '';
    }).join('');
    return '<!DOCTYPE html><html lang="fr" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>Bilan de l\'entretien — ' + esc(nom) + '</title>' +
      '<style>body{font-family:Calibri,Arial,sans-serif;color:#0f172a;line-height:1.5;max-width:780px;margin:0 auto;padding:24px}h1{color:#0D2B4E;font-size:24px;margin:0 0 4px}h2{color:#0D2B4E;font-size:17px;border-bottom:2px solid #F26422;padding-bottom:3px;margin:22px 0 8px}' +
      '.meta{color:#475569;font-size:13px;margin:0 0 14px}li{margin:5px 0}p.q{margin:12px 0 2px;color:#0D2B4E}p.r{margin:2px 0 8px 14px}p.c{margin:2px 0 8px 14px;color:#475569;font-style:italic}.note{margin-top:26px;font-size:11.5px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:8px}</style></head><body>' +
      '<h1>Bilan de l\'entretien — ' + esc(nom) + '</h1><p class="meta">Entretien avec Koffi dans le rôle de : ' + esc(libRole(S.role) || S.role) + ' · ' + esc(date) + '</p>' +
      '<h2>Synthèse</h2><p>' + esc(m.contenu) + '</p>' +
      liste(esc(T.forces.replace(/^\S+\s/, '')), (b.forces || []).map(esc)) +
      liste(esc(T.faiblesses.replace(/^\S+\s/, '')), (b.faiblesses || []).map(function (f) { return esc(f.texte) + (f.rubrique_label ? ' <i>(rubrique : ' + esc(f.rubrique_label) + ')</i>' : ''); })) +
      liste(esc(T.pistes.replace(/^\S+\s/, '')), (b.pistes || []).map(esc)) +
      (deroule ? '<h2>Déroulé de l\'entretien</h2>' + deroule : '') +
      '<p class="note">' + esc(T.docIntro) + '</p></body></html>';
  }
  function telechargerBilan() {
    var html = htmlBilan(); if (!html) return;
    var nom = (((S.etat && S.etat.plan && S.etat.plan.nom) || 'projet') + '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'projet';
    var blob = new Blob(['\ufeff' + html], { type: 'application/msword;charset=utf-8' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'Bilan-Koffi-' + nom + '.doc';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function imprimerBilan() {
    var html = htmlBilan(); if (!html) return;
    var f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
    f.onload = function () { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { /* impression bloquée : le téléchargement reste possible */ } setTimeout(function () { f.remove(); }, 60000); };
    f.srcdoc = html; document.body.appendChild(f);
  }

  function ajouterMessage(m) {
    var corps = $('.kb-body'), el;
    if (m.role === 'user') corps.appendChild(bulle('u', m.contenu));
    else if (m.type === 'question') {
      if (m.reaction) corps.appendChild(bulle('a react', m.reaction));
      corps.appendChild(bulle('a q', m.question || m.contenu));
    } else if (m.type === 'conseil') corps.appendChild(bulle('a cons', '💡 ' + m.contenu));
    else if (m.type === 'bilan') { S.bilanMsg = m; corps.appendChild(bulle('a', '🏁 ' + m.contenu)); if (m.bilan) { corps.appendChild(carteBilan(m.bilan)); corps.appendChild(boutonsDocument()); } }
    else {
      el = bulle('a', m.contenu);
      if (m.gratuit) { var n = document.createElement('div'); n.className = 'kb-note'; n.textContent = T.gratuitNote; el.appendChild(n); }
      corps.appendChild(el);
    }
    corps.scrollTop = corps.scrollHeight;
  }

  /* ── Cartes d'état ── */
  function carte(titre, texte, boutons) {
    var d = document.createElement('div'); d.className = 'kb-card';
    d.innerHTML = '<h4>' + esc(titre) + '</h4><p>' + esc(texte) + '</p>';
    (boutons || []).forEach(function (b) { d.appendChild(b); });
    return d;
  }
  function bouton(texte, act, sec) { var b = document.createElement('button'); b.type = 'button'; b.className = 'kb-cta' + (sec ? ' sec' : ''); b.setAttribute('data-a', act); b.textContent = texte; return b; }
  function carteMajorite() {
    var d = carte(T.majTitre, T.majTexte);
    var l = document.createElement('label'); l.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;cursor:pointer';
    l.innerHTML = '<input type="checkbox" data-maj="case" style="margin-top:3px"><span>' + esc(T.majCase) + '</span>';
    var b = bouton(T.majBtn, 'majorite'); b.disabled = true; b.style.marginTop = '12px';
    l.querySelector('input').addEventListener('change', function (ev) { b.disabled = !ev.target.checked; });
    d.appendChild(l); d.appendChild(b); return d;
  }
  function carteConsentement() {
    var c = (S.etat && S.etat.consentement) || {};
    var d = document.createElement('div'); d.className = 'kb-card';
    d.innerHTML = '<h4>' + esc(c.titre || T.consTitre) + '</h4><p>' + esc(c.texte || '') + '</p>' +
      '<p><a class="kb-l" href="/politique-confidentialite.html#koffi" target="_blank" rel="noopener">' + esc(T.infoLien) + '</a></p>';
    var l = document.createElement('label'); l.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;cursor:pointer';
    l.innerHTML = '<input type="checkbox" data-cons="case" style="margin-top:3px"><span>' + esc(c.case || '') + '</span>';
    var b = bouton(T.consBtn, 'consentir'); b.disabled = true; b.style.marginTop = '12px';
    l.querySelector('input').addEventListener('change', function (ev) { b.disabled = !ev.target.checked; });
    d.appendChild(l); d.appendChild(b); return d;
  }
  function carteRoles() {
    var e = S.etat, body = $('.kb-body');
    var d = document.createElement('div'); d.className = 'kb-card';
    d.innerHTML = '<h4>' + T.accueilTitre + '</h4><p>' + esc(T.accueil) + '</p>' + (e.plan && !e.plan.assez_rempli ? '<p><b>' + esc(T.planVide) + '</b></p>' : '');
    body.appendChild(d);
    var l = document.createElement('div'); l.className = 'kb-roles';
    (e.roles || []).forEach(function (r) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'kb-role'; b.setAttribute('data-role', r.cle); b.disabled = !!(e.plan && !e.plan.assez_rempli);
      b.innerHTML = '<span class="ic" aria-hidden="true">' + esc(r.icone) + '</span><span><b>' + esc(r.titre) + '</b><em>' + esc(r.court) + '</em><small>' + esc(r.description) + '</small></span>';
      l.appendChild(b);
    });
    body.appendChild(l);
    if (S.msgs.length && S.conv && !S.nouvelle === false) {
      var rep = bouton(S.terminee ? T.voirBilan : T.reprendre, 'reprendre', true); body.appendChild(rep);
    }
  }

  /* ── Sans projet encore choisi : d'abord le rôle, puis POUR QUEL PROJET ── */
  function carteChoix() {
    var body = $('.kb-body');
    var d = document.createElement('div'); d.className = 'kb-card';
    if (!S.choixRole) {
      d.innerHTML = '<h4>' + esc(T.choixRoleTitre) + '</h4><p>' + esc(T.accueil) + '</p>'; body.appendChild(d);
      var l = document.createElement('div'); l.className = 'kb-roles';
      ROLES_CHOIX.forEach(function (r) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'kb-role'; b.setAttribute('data-choixrole', r.cle);
        b.innerHTML = '<span class="ic" aria-hidden="true">' + esc(r.icone) + '</span><span><b>' + esc(r.titre) + '</b><em>' + esc(r.court) + '</em><small>' + esc(r.description) + '</small></span>';
        l.appendChild(b);
      });
      body.appendChild(l); return;
    }
    d.innerHTML = '<h4>' + esc(T.choixProjetTitre) + '</h4><p>' + esc(T.choixProjetTexte) + '</p>'; body.appendChild(d);
    var liste = document.createElement('div'); liste.className = 'kb-plans'; body.appendChild(liste);
    var retour = document.createElement('button'); retour.type = 'button'; retour.className = 'kb-retour'; retour.setAttribute('data-a', 'choixretour'); retour.textContent = T.changerRole; body.appendChild(retour);
    var dessiner = function () {
      liste.innerHTML = '';
      if (!S.plans.length) { var v = document.createElement('div'); v.className = 'kb-card'; v.innerHTML = '<p>' + esc(T.aucunProjet) + '</p><a class="kb-cta" href="/business-plan.html">' + esc(T.creerProjet) + '</a>'; liste.appendChild(v); return; }
      S.plans.forEach(function (p) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'kb-role'; b.setAttribute('data-plan', p.id);
        b.innerHTML = '<span class="ic" aria-hidden="true">📋</span><span><b>' + esc(p.nom_projet || T.projetSansNom) + '</b>' + (p.secteur ? '<small>' + esc(p.secteur) + '</small>' : '') + '</span>';
        liste.appendChild(b);
      });
    };
    if (S.plans) return dessiner();
    liste.innerHTML = '<div class="kb-typing" role="status">' + esc(T.chargementProjets) + '</div>';
    api('GET', '/api/business-plans').then(function (r) {
      S.plans = r.ok && r.data && Array.isArray(r.data.mes_plans) ? r.data.mes_plans : [];
      if (S.root && S.choixRole && !(S.opts && S.opts.planId)) dessiner();
    }).catch(function () { S.plans = []; dessiner(); });
  }
  /* Le projet est choisi : on charge son état, puis Koffi enchaîne (consentement et crédit d'abord si besoin). */
  function choisirProjet(id) {
    if (S.occupe) return;
    S.opts.planId = id; S.plans = null;
    S.roleEnAttente = S.choixRole; S.choixRole = '';
    S.occupe = true;
    return chargerEtat().then(function (r) { S.occupe = false; if (!r.ok) { S.opts.planId = null; S.roleEnAttente = ''; S.etat = null; } return apresEtat(); });
  }
  /* Après chargement de l'état (choix du projet, consentement, majorité) : reprend le fil du même rôle, ou lance l'entretien tout seul. */
  function apresEtat() {
    var role = S.roleEnAttente, e = S.etat;
    if (!role || !e) return construireCorps();
    if (e.etat !== 'utilisable' || !(e.consentement && e.consentement.accorde) || (e.plan && !e.plan.assez_rempli)) return construireCorps();
    S.roleEnAttente = '';
    if (S.conv && !S.terminee && S.role === role) { S.nouvelle = false; return construireCorps(); }
    return commencer(role);
  }

  function construireCorps() {
    var body = $('.kb-body'); body.innerHTML = '';
    if (S.opts && !S.opts.planId && S.opts.choixProjet) {
      $('.kb-foot').style.display = 'none'; $('.kb-prog').style.display = 'none'; majMeta();
      S.root.querySelectorAll('[data-a="nouvelle"],[data-a="supprimer"]').forEach(function (b) { b.style.display = 'none'; });
      carteChoix(); body.scrollTop = 0; return;
    }
    var foot = $('.kb-foot'), e = S.etat, ta = $('.kb-form textarea'), env = $('.kb-send');
    foot.style.display = ''; ta.disabled = false; env.disabled = false; majMeta(); majProgression();
    $('.kb-av').textContent = (e && e.avertissement) || T.info;
    var ok = e && (e.etat === 'utilisable' || e.etat === 'recharge');
    S.root.querySelectorAll('[data-a="nouvelle"],[data-a="supprimer"]').forEach(function (b) { b.style.display = ok && S.conv && !S.nouvelle ? '' : 'none'; });
    var acts = $('.kb-acts'), form = $('.kb-form'); acts.style.display = 'none'; form.style.display = '';
    if (!e) { body.appendChild(carte('Koffi', T.indisponible)); foot.style.display = 'none'; return; }
    var st = e.etat;
    if (st === 'majorite') { body.appendChild(carteMajorite()); foot.style.display = 'none'; return; }
    if (st === 'mineur' || st === 'pays' || st === 'desactive' || st === 'indisponible') { body.appendChild(carte('Koffi', T[st] || T.indisponible)); foot.style.display = 'none'; return; }
    if (!(e.consentement && e.consentement.accorde)) { body.appendChild(carteConsentement()); foot.style.display = 'none'; return; }
    var accueil = !S.conv || S.nouvelle;
    if (accueil) {
      carteRoles();
      if (st === 'recharge') body.appendChild(carte(T.rechargeTitre, e.portefeuille && e.portefeuille.premium ? T.rechargeTextePremium : T.rechargeTexte, [bouton(T.recharger, 'credit')]));
      foot.style.display = 'none'; body.scrollTop = 0; return;
    }
    S.msgs.forEach(ajouterMessage);
    if (S.terminee) {
      body.appendChild(carte('', T.recommencer, [])); body.lastChild.innerHTML = ''; body.lastChild.appendChild(bouton(T.recommencer, 'nouvelle'));
      form.style.display = 'none'; acts.style.display = 'none';
    } else {
      acts.style.display = '';
      acts.querySelector('[data-a="conseil"]').disabled = false;
      acts.querySelector('[data-a="bilan"]').disabled = !S.msgs.some(function (m) { return m.role === 'user'; });
    }
    if (st === 'recharge') body.appendChild(carte(T.rechargeTitre, e.portefeuille && e.portefeuille.premium ? T.rechargeTextePremium : T.rechargeTexte, [bouton(T.recharger, 'credit')]));
    body.scrollTop = body.scrollHeight;
  }

  function traduireUI() {
    $('.kb-t b').textContent = T.nom; $('.kb-t span').textContent = T.sous;
    $('.kb-btn span').textContent = T.nom; $('.kb-btn').setAttribute('aria-label', T.ouvrir); $('.kb-btn').title = T.ouvrir;
    $('[data-a="fermer"]').setAttribute('aria-label', T.fermer); $('[data-a="fermer"]').title = T.fermer;
    $('[data-a="nouvelle"]').title = T.nouvelle; $('[data-a="nouvelle"]').setAttribute('aria-label', T.nouvelle);
    $('[data-a="supprimer"]').title = T.supprimer; $('[data-a="supprimer"]').setAttribute('aria-label', T.supprimer);
    $('.kb-form textarea').placeholder = T.placeholder; $('.kb-send').textContent = T.envoyer;
    $('[data-a="conseil"]').textContent = T.conseil; $('[data-a="bilan"]').textContent = T.bilan;
  }

  function appliquerSeance(sc) {
    S.conv = sc ? sc.id : null; S.role = sc ? sc.role : ''; S.msgs = sc ? sc.messages : []; S.nb = sc ? sc.nb_questions : 0; S.terminee = !!(sc && sc.terminee);
  }
  function chargerEtat() {
    return api('GET', base() + '/etat').then(function (r) {
      if (r.ok) { S.etat = r.data; appliquerSeance(r.data.seance && r.data.seance.role ? r.data.seance : null); S.nouvelle = false; }
      return r;
    });
  }
  function ouvrirPanneau() {
    S.root.classList.add('open');
    if (!(S.opts && S.opts.planId)) { construireCorps(); return; }
    chargerEtat().then(function () { construireCorps(); var ta = $('.kb-form textarea'); if (ta && !ta.disabled && $('.kb-foot').style.display !== 'none' && window.innerWidth > 560) ta.focus(); });
  }
  function fermerPanneau() {
    S.root.classList.remove('open');
    var b = S.opts && S.opts.boutonHote ? document.getElementById(S.opts.boutonHote) : $('.kb-btn');
    if (b && b.offsetParent !== null) b.focus();
  }

  /* Un échange avec le serveur : affiche l'attente, puis le message reçu ou l'erreur. attente = texte affiché pendant la réflexion. */
  function echange(corpsRequete, attente, messageUtilisateur) {
    if (S.occupe) return;
    S.occupe = true; $('.kb-send').disabled = true; S.root.querySelectorAll('.kb-acts button').forEach(function (b) { b.disabled = true; });
    var corps = $('.kb-body');
    if (messageUtilisateur) { var mu = { role: 'user', contenu: messageUtilisateur }; S.msgs.push(mu); ajouterMessage(mu); }
    var att = document.createElement('div'); att.className = 'kb-typing'; att.setAttribute('role', 'status'); att.textContent = attente; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    return api('POST', base() + '/messages', corpsRequete).then(function (r) {
      att.remove();
      if (r.ok) {
        var d = r.data;
        if (d.conversation_id) { S.conv = d.conversation_id; if (d.role) S.role = d.role; }
        S.nouvelle = false; S.msgs.push(d.message); ajouterMessage(d.message);
        if (typeof d.nb_questions === 'number') S.nb = d.nb_questions;
        if (d.terminee) S.terminee = true;
        if (S.etat && d.portefeuille) S.etat.portefeuille = d.portefeuille;
        S.etat && (S.etat.seance = S.conv ? { id: S.conv, role: S.role, messages: S.msgs, nb_questions: S.nb, terminee: S.terminee } : null);
      } else {
        if (messageUtilisateur) S.msgs.pop();
        var code = r.data && r.data.code;
        if (code === 'credits_epuises') { if (S.etat) { S.etat.etat = 'recharge'; if (r.data.portefeuille) S.etat.portefeuille = r.data.portefeuille; } }
        else if (code === 'consentement_requis' || code === 'majorite_requise' || code === 'mineur' || code === 'pays_non_pris_en_charge' || code === 'seance_terminee' || code === 'seance_introuvable') { return chargerEtat(); }
        else if (code === 'plan_vide') { if (S.etat && S.etat.plan) S.etat.plan.assez_rempli = false; }
        else { construireCorps(); ajouterMessage({ role: 'assistant', contenu: (r.data && r.data.error) || (r.status === 429 ? T.trop : T.erreur) }); return; }
      }
    }).catch(function () { att.remove(); if (messageUtilisateur) S.msgs.pop(); ajouterMessage({ role: 'assistant', contenu: T.erreur }); })
      .then(function () { S.occupe = false; var ta = $('.kb-form textarea'); construireCorps(); if (ta && !ta.disabled && S.conv && !S.terminee && window.innerWidth > 560) ta.focus(); });
  }
  /* Koffi lit le plan ENREGISTRÉ : la page hôte enregistre d'abord la rubrique en cours (avantSeance), pour qu'il voie ce que la personne vient d'écrire. */
  function commencer(role) {
    S.msgs = []; S.nb = 0; S.terminee = false; S.conv = null; S.nouvelle = false; $('.kb-body').innerHTML = '';
    var avant; try { avant = S.opts && S.opts.avantSeance ? S.opts.avantSeance() : null; } catch (e) { avant = null; }
    return Promise.resolve(avant).catch(function () { /* un échec d'enregistrement ne doit pas bloquer la séance */ }).then(function () { return echange({ action: 'commencer', role: role }, T.reflechit); });
  }
  function repondre() {
    var ta = $('.kb-form textarea'); var texte = ta.value.trim(); if (!texte || ta.disabled || !S.conv) return;
    var max = S.etat && S.etat.max_message; if (max && texte.length > max) { ajouterMessage({ role: 'assistant', contenu: 'Votre réponse est trop longue (' + max + ' caractères au maximum).' }); return; }
    ta.value = ''; ta.style.height = 'auto';
    return echange({ action: 'repondre', conversation_id: S.conv, texte: texte }, T.reflechit, texte);
  }

  function consentir() {
    var c = S.root.querySelector('[data-cons="case"]'); if (!c || !c.checked || S.occupe) return;
    S.occupe = true;
    api('POST', base() + '/consentement', { accepte: true }).then(function () { S.occupe = false; return chargerEtat().then(apresEtat); }).catch(function () { S.occupe = false; });
  }
  function confirmerMajorite() {
    var c = S.root.querySelector('[data-maj="case"]'); if (!c || !c.checked || S.occupe) return;
    S.occupe = true;
    api('POST', '/api/kofi/majorite', { confirme: true }).then(function () { S.occupe = false; return chargerEtat().then(apresEtat); }).catch(function () { S.occupe = false; });
  }

  /* Retour de Stripe (?kofi=succes|annule) : le crédit arrive par le webhook, quelques secondes plus tard. */
  function retourPaiement() {
    if (!window.KoffiCredit) return;
    window.KoffiCredit.retourPaiement({ lg: 'fr', onFin: function (statut, msg) {
      S.root.classList.add('open');
      var corps = $('.kb-body');
      if (statut === 'attente') { corps.innerHTML = ''; corps.appendChild(carte('Koffi', msg)); $('.kb-foot').style.display = 'none'; return; }
      chargerEtat().then(function () { construireCorps(); ajouterMessage({ role: 'assistant', contenu: msg }); });
    } });
  }

  function construire() {
    if (!document.getElementById('kb-style')) { var st = document.createElement('style'); st.id = 'kb-style'; st.textContent = CSS; document.head.appendChild(st); }
    var root = document.createElement('div'); root.className = 'kb-root'; root.setAttribute('data-koffi-businessplan', '1');
    root.innerHTML =
      '<button type="button" class="kb-btn" data-a="ouvrir"><img src="/assets/koffi-avatar-96.webp" width="46" height="46" alt=""><span></span></button>' +
      '<section class="kb-panel" role="dialog" aria-label="Koffi, grand oral du business plan" aria-modal="false">' +
        '<div class="kb-head"><img src="/assets/koffi-avatar-96.webp" width="42" height="42" alt=""><div class="kb-t"><b></b><span></span><button type="button" class="kb-credit" data-a="credit" style="display:none"></button></div>' +
          '<button type="button" class="kb-ic" data-a="nouvelle">＋</button><button type="button" class="kb-ic" data-a="supprimer">🗑</button><button type="button" class="kb-ic" data-a="fermer">✕</button></div>' +
        '<div class="kb-prog" role="status"></div>' +
        '<div class="kb-body" aria-live="polite"></div>' +
        '<div class="kb-foot"><p class="kb-av"></p><div class="kb-acts"><button type="button" data-a="conseil"></button><button type="button" data-a="bilan"></button></div>' +
          '<form class="kb-form"><textarea rows="1" maxlength="4000" aria-label="Votre réponse à Koffi"></textarea><button type="submit" class="kb-send"></button></form></div>' +
      '</section>';
    if (S.opts && S.opts.sansBouton) root.classList.add('kb-sansbtn');
    document.body.appendChild(root); S.root = root;
    root.addEventListener('click', function (ev) {
      var rub = ev.target.closest ? ev.target.closest('[data-rub]') : null;
      if (rub) { if (S.opts && S.opts.ouvrirRubrique) { S.opts.ouvrirRubrique(rub.getAttribute('data-rub'), S.opts.planId); if (window.innerWidth <= 560) fermerPanneau(); } return; }
      var cr = ev.target.closest ? ev.target.closest('[data-choixrole]') : null;
      if (cr) { S.choixRole = cr.getAttribute('data-choixrole'); return construireCorps(); }
      var pl = ev.target.closest ? ev.target.closest('[data-plan]') : null;
      if (pl) return choisirProjet(pl.getAttribute('data-plan'));
      var role = ev.target.closest ? ev.target.closest('[data-role]') : null;
      if (role) { if (!role.disabled) commencer(role.getAttribute('data-role')); return; }
      var t = ev.target.closest ? ev.target.closest('[data-a]') : null; if (!t) return;
      var act = t.getAttribute('data-a');
      if (act === 'ouvrir') return ouvrirPanneau();
      if (act === 'fermer') return fermerPanneau();
      if (act === 'choixretour') { S.choixRole = ''; return construireCorps(); }
      if (act === 'dl-doc') return telechargerBilan();
      if (act === 'dl-print') return imprimerBilan();
      if (act === 'credit') return ouvrirCredit();
      if (act === 'consentir') return consentir();
      if (act === 'majorite') return confirmerMajorite();
      if (act === 'conseil') return echange({ action: 'conseil', conversation_id: S.conv }, T.conseilEnCours);
      if (act === 'bilan') return echange({ action: 'bilan', conversation_id: S.conv }, T.bilanEnCours);
      if (act === 'reprendre') { S.nouvelle = false; return construireCorps(); }
      if (act === 'nouvelle') { S.nouvelle = true; return construireCorps(); }
      if (act === 'supprimer') {
        if (!S.conv) return; if (!window.confirm(T.confirmSuppr)) return;
        return api('DELETE', '/api/kofi/business-plan/conversations/' + S.conv).then(function () { S.conv = null; S.msgs = []; S.nb = 0; S.terminee = false; if (S.etat) S.etat.seance = null; construireCorps(); });
      }
    });
    root.querySelector('.kb-form').addEventListener('submit', function (ev) { ev.preventDefault(); repondre(); });
    var ta = root.querySelector('.kb-form textarea');
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); repondre(); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 130) + 'px'; });
    if (!ecouteEchap) { ecouteEchap = true; document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.root && S.root.classList.contains('open') && !document.querySelector('.kcr-fond')) fermerPanneau(); }); }
  }

  window.KoffiBusinessPlan = {
    /* Monte le bouton SEULEMENT si le serveur l'autorise (propriétaire du plan, connecté) : sinon rien n'apparaît. */
    monter: function (opts) {
      if (S.root) return Promise.resolve();
      S.opts = opts || {};
      if (!S.opts.planId) {
        if (!S.opts.choixProjet) return Promise.resolve();
        return chargerCredit().then(function () { if (S.root) return; construire(); traduireUI(); if (S.opts.ouvrirDirect) ouvrirPanneau(); });
      }
      return Promise.all([chargerEtat(), chargerCredit()]).then(function (rs) {
        if (!rs[0].ok || S.root) return;
        construire(); traduireUI(); majMeta();
        if (S.opts.ouvrirDirect) ouvrirPanneau();
        retourPaiement();
      });
    },
    ouvrir: function () { if (S.root) ouvrirPanneau(); },
    demonter: function () {
      if (S.root && S.root.parentNode) S.root.parentNode.removeChild(S.root);
      S.root = null; S.etat = null; S.conv = null; S.msgs = []; S.nb = 0; S.terminee = false; S.nouvelle = false; S.occupe = false; S.opts = null; S.choixRole = ''; S.roleEnAttente = ''; S.plans = null; S.bilanMsg = null;
    },
    estMonte: function () { return !!S.root; }
  };
})();

/* Commande vocale (2026-11-10) : bouton micro commun à tous les Koffi, voir assets/koffi-voix.js */
(function () { if (window.KoffiVoix) return; var s = document.createElement("script"); s.src = "/assets/koffi-voix.js?v=1"; s.async = true; (document.head || document.documentElement).appendChild(s); })();

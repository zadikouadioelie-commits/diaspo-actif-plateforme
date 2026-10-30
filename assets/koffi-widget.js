/* ═════════════════════════════════════════════════
   assets/koffi-widget.js — KOFFI, tuteur IA des formations : fenêtre de discussion (2026-10-30)
   ═════════════════════════════════════════════════
   Autonome (CSS injecté, préfixe .kf-) : KoffiWidget.monter({ formationId, leconId: () => id, ouvrirLecon: id => {}, premiumUrl })
   Toutes les règles (Premium, portée, questions, budget, évaluation) sont décidées par le SERVEUR (/api/kofi/*) : ici on ne fait qu'afficher
   l'état qu'il renvoie. Rien du contenu des cours n'est jamais lu côté navigateur : seules les réponses de Koffi (déjà filtrées) arrivent.
   États serveur : utilisable | vitrine (compte non Premium) | recharge (questions épuisées) | desactive | indisponible | evaluation.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiWidget) return;

  var TXT = {
    fr: {
      nom: 'Koffi', sous: 'Tuteur de la formation', ouvrir: 'Poser une question à Koffi', fermer: 'Fermer', nouvelle: 'Nouvelle conversation',
      supprimer: 'Supprimer cette conversation', confirmSuppr: 'Supprimer cette conversation ? Cette action est définitive.', placeholder: 'Posez votre question…', envoyer: 'Envoyer',
      reflechit: 'Koffi cherche dans le cours…', accueil: 'Bonjour ! Je suis Koffi. Posez-moi une question sur ce cours : je réponds uniquement à partir des supports auxquels vous avez accès, et je cite la source.',
      info1: 'Koffi répond uniquement à partir des supports de cette formation auxquels vous avez accès. Il n\'utilise aucune autre source.',
      info2: 'Vos conversations sont conservées 60 jours au maximum, puis supprimées automatiquement. Vous pouvez les supprimer à tout moment.',
      info3: 'Koffi peut se tromper : vérifiez toujours dans le cours, grâce aux sources indiquées. Il ne modifie jamais vos notes ni vos validations.',
      info4: 'Votre question, l\'historique récent de la conversation et les extraits du cours utilisés pour répondre sont envoyés à notre prestataire d\'intelligence artificielle, Anthropic (États-Unis), sans votre nom ni votre e-mail. Ne saisissez aucune donnée sensible (santé, religion, opinions…).', infoLien: 'En savoir plus : politique de confidentialité',
      compris: 'J\'ai compris', restantes: function (n) { return n + ' question' + (n > 1 ? 's' : '') + ' restante' + (n > 1 ? 's' : ''); }, apercu: 'Aperçu formateur : aucune question décomptée',
      gratuites: function (n) { return n + ' question' + (n > 1 ? 's' : '') + ' offerte' + (n > 1 ? 's' : ''); }, sources: 'Sources', utile: 'Utile', pasUtile: 'Pas utile', merci: 'Merci !',
      sansRef: 'Aucune source n\'est citée pour cette réponse : vérifiez-la dans le cours.', hors: 'Cette information ne figure pas dans vos supports.',
      vitrineTitre: 'Koffi, votre tuteur personnel', vitrineTexte: 'Posez vos questions sur le cours à tout moment et obtenez une réponse claire, avec la source dans votre formation. Réservé aux comptes Premium.',
      exemple: 'Exemple fictif', exQ: 'Quelle est la différence entre un prêt et une subvention ?', exR: 'Un prêt doit être remboursé, avec ou sans intérêts, alors qu\'une subvention est une aide qui n\'est pas à rembourser [1].', exSrc: 'Module 2 › Financer son projet › Les sources de financement',
      premium: 'Passer Premium', rechargeTitre: 'Vos questions sont épuisées', rechargeTexte: function (f) { return 'Rechargez ' + f.questions + ' questions pour ' + Number(f.prix_eur).toFixed(2).replace('.', ',') + ' € : valables ' + f.validite_mois + ' mois, utilisables dans toutes vos formations. Les questions achetées ne sont pas remboursables.'; },
      recharger: function (f) { return 'Recharger ' + f.questions + ' questions — ' + Number(f.prix_eur).toFixed(2).replace('.', ',') + ' €'; }, rechargerCourt: 'Recharger', paiementOuvre: 'Ouverture du paiement sécurisé…', paiementRecu: 'Paiement reçu : vos questions sont en cours de crédit…', paiementOk: 'Vos questions sont créditées. Bonne étude !', paiementAttente: 'Le crédit peut prendre quelques instants : rouvrez Koffi dans une minute.', paiementAnnule: 'Paiement annulé : rien n\'a été débité.', stockGarde: function (n) { return 'Vos ' + n + ' questions achetées sont conservées : elles servent de nouveau dès que votre Premium est actif.'; }, desactive: 'Koffi est désactivé sur cette formation.', indispo: 'Koffi est momentanément indisponible. Réessayez un peu plus tard.',
      evaluation: 'Koffi est coupé pendant une évaluation. Il sera de nouveau disponible ensuite.', erreur: 'Une erreur est survenue. Réessayez.', trop: 'Doucement : patientez quelques secondes avant la question suivante.',
      lueDans: 'Voir dans le cours', langue: 'Langue', retention: 'Conversations conservées 60 jours', hist: 'Conversation'
    },
    en: {
      nom: 'Koffi', sous: 'Course tutor', ouvrir: 'Ask Koffi a question', fermer: 'Close', nouvelle: 'New conversation',
      supprimer: 'Delete this conversation', confirmSuppr: 'Delete this conversation? This cannot be undone.', placeholder: 'Ask your question…', envoyer: 'Send',
      reflechit: 'Koffi is searching the course…', accueil: 'Hello! I\'m Koffi. Ask me a question about this course: I only answer from the materials you have access to, and I cite my sources.',
      info1: 'Koffi answers only from the materials of this course that you have access to. It uses no other source.',
      info2: 'Your conversations are kept for 60 days at most, then deleted automatically. You can delete them at any time.',
      info3: 'Koffi can make mistakes: always check in the course using the sources shown. It never changes your grades or validations.',
      info4: 'Your question, the recent conversation history and the course excerpts used to answer are sent to our artificial-intelligence provider, Anthropic (United States), without your name or e-mail. Do not enter any sensitive data (health, religion, opinions…).', infoLien: 'Learn more: privacy policy',
      compris: 'Got it', restantes: function (n) { return n + ' question' + (n > 1 ? 's' : '') + ' left'; }, apercu: 'Trainer preview: no question counted',
      gratuites: function (n) { return n + ' free question' + (n > 1 ? 's' : ''); }, sources: 'Sources', utile: 'Helpful', pasUtile: 'Not helpful', merci: 'Thanks!',
      sansRef: 'No source is cited for this answer: please check it in the course.', hors: 'This information is not in your materials.',
      vitrineTitre: 'Koffi, your personal tutor', vitrineTexte: 'Ask your questions about the course at any time and get a clear answer with the source in your course. For Premium accounts only.',
      exemple: 'Fictional example', exQ: 'What is the difference between a loan and a grant?', exR: 'A loan must be repaid, with or without interest, whereas a grant is aid that does not have to be repaid [1].', exSrc: 'Module 2 › Financing your project › Funding sources',
      premium: 'Go Premium', rechargeTitre: 'You have run out of questions', rechargeTexte: function (f) { return 'Top up ' + f.questions + ' questions for ' + Number(f.prix_eur).toFixed(2).replace('.', ',') + ' €: valid for ' + f.validite_mois + ' months, usable in all your courses. Purchased questions are non-refundable.'; },
      recharger: function (f) { return 'Top up ' + f.questions + ' questions — ' + Number(f.prix_eur).toFixed(2).replace('.', ',') + ' €'; }, rechargerCourt: 'Top up', paiementOuvre: 'Opening secure payment…', paiementRecu: 'Payment received: your questions are being credited…', paiementOk: 'Your questions are credited. Happy studying!', paiementAttente: 'Crediting can take a moment: reopen Koffi in a minute.', paiementAnnule: 'Payment cancelled: nothing was charged.', stockGarde: function (n) { return 'Your ' + n + ' purchased questions are kept: they work again as soon as your Premium is active.'; }, desactive: 'Koffi is turned off for this course.', indispo: 'Koffi is temporarily unavailable. Please try again later.',
      evaluation: 'Koffi is turned off during an assessment. It will be available again afterwards.', erreur: 'Something went wrong. Please try again.', trop: 'Slow down: please wait a few seconds before the next question.',
      lueDans: 'See in the course', langue: 'Language', retention: 'Conversations kept for 60 days', hist: 'Conversation'
    }
  };

  var CSS = [
    '.kf-root,.kf-root *{box-sizing:border-box}',
    '.kf-root{position:fixed;right:18px;bottom:18px;z-index:9000;font-family:inherit;color:#0f172a}',
    '.kf-btn{display:flex;align-items:center;gap:10px;border:0;cursor:pointer;background:#0D2B4E;color:#fff;border-radius:999px;padding:5px 18px 5px 5px;box-shadow:0 8px 26px rgba(13,43,78,.38),0 0 0 2px #F26422;font:700 14px/1.2 inherit;font-family:inherit}',
    '.kf-btn:hover{transform:translateY(-1px)}.kf-btn:focus-visible{outline:3px solid #F26422;outline-offset:3px}',
    '.kf-btn img{width:52px;height:52px;border-radius:50%;display:block;background:#fff}',
    '.kf-panel{position:absolute;right:0;bottom:0;width:392px;max-width:calc(100vw - 24px);height:min(640px,calc(100vh - 36px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(2,12,27,.45),0 0 0 1px rgba(13,43,78,.15);display:none;flex-direction:column;overflow:hidden;color:#0f172a}',
    '.kf-root.open .kf-panel{display:flex}.kf-root.open .kf-btn{display:none}',
    '.kf-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0D2B4E;color:#fff;flex:none}',
    '.kf-head img{width:44px;height:44px;border-radius:50%;background:#fff;flex:none}',
    '.kf-head .t{flex:1;min-width:0}.kf-head .t b{display:block;font-size:16px;color:#fff}.kf-head .t span{display:block;font-size:11.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.kf-ic{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:9px;min-width:34px;height:34px;cursor:pointer;font:700 13px inherit;font-family:inherit;padding:0 8px}',
    '.kf-ic:hover{background:rgba(255,255,255,.24)}.kf-ic:focus-visible{outline:2px solid #F26422}',
    '.kf-ic.on{background:#F26422;color:#fff}',
    '.kf-body{flex:1;overflow-y:auto;padding:14px;background:#f1f5f9;display:flex;flex-direction:column;gap:10px}',
    '.kf-msg{max-width:92%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.kf-msg.u{align-self:flex-end;background:#0D2B4E;color:#fff;border-bottom-right-radius:4px}',
    '.kf-msg.a{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
    '.kf-ref{display:inline-block;min-width:18px;padding:0 5px;margin:0 1px;border-radius:6px;background:#fff3e6;color:#c2410c;font-weight:800;font-size:12px;text-align:center;border:1px solid #fdba74;cursor:pointer}',
    '.kf-src{margin-top:8px;padding-top:8px;border-top:1px dashed #cbd5e1;font-size:12px;color:#475569;white-space:normal}',
    '.kf-src div{margin-top:3px}.kf-src button{border:0;background:none;color:#0D2B4E;text-decoration:underline;cursor:pointer;font:inherit;padding:0;text-align:left}',
    '.kf-note{margin-top:6px;font-size:11.5px;color:#92400e;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:5px 8px;white-space:normal}',
    '.kf-fb{margin-top:6px;display:flex;gap:6px;white-space:normal}.kf-fb button{border:1px solid #cbd5e1;background:#fff;border-radius:99px;font-size:11.5px;padding:2px 10px;cursor:pointer;color:#334155}',
    '.kf-fb button:hover{background:#f1f5f9}.kf-fb span{font-size:11.5px;color:#166534}',
    '.kf-typing{align-self:flex-start;color:#475569;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:8px 12px}',
    '.kf-foot{flex:none;background:#fff;border-top:1px solid #e2e8f0;padding:8px 10px 10px}',
    '.kf-meta{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11.5px;color:#475569;margin-bottom:6px}',
    '.kf-meta .kf-link{border:0;background:none;color:#b84c1a;text-decoration:underline;cursor:pointer;font:inherit;font-weight:700;padding:0 0 0 6px}',
    '.kf-form{display:flex;gap:8px;align-items:flex-end}',
    '.kf-form textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font:14px/1.4 inherit;font-family:inherit;max-height:110px;min-height:42px;background:#fff;color:#0f172a}',
    '.kf-form textarea:focus{outline:2px solid #F26422;border-color:#F26422}',
    '.kf-send{border:0;background:#F26422;color:#fff;border-radius:12px;height:42px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}',
    '.kf-send:disabled{opacity:.5;cursor:not-allowed}',
    '.kf-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;font-size:13.5px;line-height:1.55;color:#0f172a}',
    '.kf-card h4{margin:0 0 6px;font-size:15px;color:#0D2B4E}',
    '.kf-card ul{margin:8px 0 12px;padding-left:18px}.kf-card li{margin:4px 0}',
    '.kf-cta{display:inline-block;border:0;background:linear-gradient(135deg,#c8960c,#f2c94c);color:#2a1e00;font-weight:800;padding:10px 18px;border-radius:10px;text-decoration:none;cursor:pointer;font-family:inherit;font-size:14px}',
    '.kf-cta.sec{background:#F26422;color:#fff}.kf-cta[disabled]{opacity:.55;cursor:not-allowed}',
    '.kf-ex{margin-top:10px;border:1px dashed #94a3b8;border-radius:12px;padding:10px;background:#f8fafc;position:relative}',
    '.kf-ex .tag{position:absolute;top:-9px;left:10px;background:#e2e8f0;color:#475569;font-size:10.5px;font-weight:800;padding:1px 8px;border-radius:99px}',
    '.kf-ex .q{font-weight:700;margin:4px 0 6px}',
    '@media (max-width:560px){.kf-form textarea{font-size:16px}.kf-root{right:10px;bottom:calc(10px + env(safe-area-inset-bottom))}.kf-btn span{display:none}.kf-btn{padding:4px}.kf-panel{position:fixed;inset:0;width:auto;max-width:none;height:auto;border-radius:0}.kf-root.open{right:0;bottom:0}}',
    /* Appli téléphone (m.html) : bouton compact au-dessus du pied de page des panneaux (précédent/suivant), panneau plein écran dans la largeur de l'appli. */
    '.kf-tel{right:max(10px,calc((100vw - 560px)/2 + 10px));bottom:calc(78px + env(safe-area-inset-bottom))}.kf-tel .kf-btn span{display:none}.kf-tel .kf-btn{padding:4px}',
    '.kf-tel .kf-form textarea{font-size:16px}', /* 16 px : en dessous, iPhone zoome sur la page à la saisie */
    '.kf-tel .kf-panel{position:fixed;top:0;bottom:0;left:0;right:0;margin:0 auto;width:100%;max-width:560px;height:auto;border-radius:0}.kf-tel.open{right:0;bottom:0}',
    '@media (prefers-reduced-motion:no-preference){.kf-btn{transition:transform .15s}}'
  ].join('\n');

  var S = { opts: null, etat: null, conv: null, lg: 'fr', occupe: false, root: null, msgs: [] };
  var jeton = 0, ecouteEchap = false;
  var T = function () { return TXT[S.lg] || TXT.fr; };
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (sel) { return S.root.querySelector(sel); };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sans importance */ } }

  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); });
  }

  /* Texte d'une réponse : échappé, puis les repères [n] deviennent des liens vers la source. */
  function formaterTexte(texte, citations) {
    var h = esc(texte);
    var connues = {}; (citations || []).forEach(function (c) { connues[c.n] = true; });
    return h.replace(/\[(\d{1,2})\]/g, function (m, n) { return connues[n] ? '<button type="button" class="kf-ref" data-ref="' + n + '" aria-label="Source ' + n + '">' + n + '</button>' : ''; });
  }

  function ajouterMessage(m, avecAvis) {
    var el = document.createElement('div');
    el.className = 'kf-msg ' + (m.role === 'user' ? 'u' : 'a');
    if (m.role === 'user') { el.textContent = m.contenu; }
    else {
      var cit = m.citations || [];
      var html = formaterTexte(m.contenu, cit);
      if (cit.length) {
        html += '<div class="kf-src"><b>' + T().sources + '</b>' + cit.map(function (c) { return '<div>[' + c.n + '] <button type="button" data-n="' + c.n + '" data-lecon="' + esc(c.lecon_id) + '" data-url="' + esc(c.url) + '">' + esc(c.chemin) + '</button></div>'; }).join('') + '</div>';
      }
      var fl = m.flags || [];
      if (fl.indexOf('sans_reference') >= 0) html += '<div class="kf-note">' + esc(T().sansRef) + '</div>';
      if (avecAvis && m.id && fl.indexOf('accueil') < 0) html += '<div class="kf-fb" data-mid="' + m.id + '"><button type="button" data-note="1">👍 ' + T().utile + '</button><button type="button" data-note="-1">👎 ' + T().pasUtile + '</button></div>';
      el.innerHTML = html;
    }
    $('.kf-body').appendChild(el);
    $('.kf-body').scrollTop = $('.kf-body').scrollHeight;
    return el;
  }

  function compteur() {
    var e = S.etat; if (!e) return '';
    if (e.apercu) return T().apercu;
    var c = e.credits || {};
    return T().restantes(Number(c.restants) || 0);
  }
  function majMeta() {
    var m = $('.kf-count'); if (m) m.textContent = compteur();
    var lien = $('.kf-recharge-lien'); if (lien) { var ok = S.etat && S.etat.forfait && S.etat.forfait.achetable && S.etat.etat === 'utilisable'; lien.style.display = ok ? '' : 'none'; lien.textContent = T().rechargerCourt; }
  }

  function carteInfo() {
    var d = document.createElement('div'); d.className = 'kf-card';
    d.innerHTML = '<h4>Koffi</h4><ul><li>' + T().info1 + '</li><li>' + T().info2 + '</li><li>' + T().info3 + '</li><li>' + T().info4 + '</li></ul><p style="margin:0 0 10px;font-size:12.5px"><a href="/politique-confidentialite.html#koffi" target="_blank" rel="noopener" style="color:#b84c1a;font-weight:700">' + T().infoLien + '</a></p><button type="button" class="kf-cta sec" data-act="compris">' + T().compris + '</button>';
    return d;
  }
  function carteVitrine() {
    var d = document.createElement('div'); d.className = 'kf-card';
    d.innerHTML = '<h4>' + T().vitrineTitre + '</h4><div>' + T().vitrineTexte + '</div>' +
      '<div class="kf-ex"><span class="tag">' + T().exemple + '</span><div class="q">' + esc(T().exQ) + '</div><div>' + formaterTexte(T().exR, [{ n: 1 }]) + '</div><div class="kf-src">[1] ' + esc(T().exSrc) + '</div></div>' +
      ((S.etat && S.etat.credits && Number(S.etat.credits.restants) > 0 && S.etat.premium && !S.etat.premium.actif) ? '<div class="kf-note" style="margin-top:10px">' + esc(T().stockGarde(Number(S.etat.credits.restants))) + '</div>' : '') +
      '<p style="margin:12px 0 0"><a class="kf-cta" href="' + esc(S.opts.premiumUrl || 'premium.html') + '">⭐ ' + T().premium + '</a></p>';
    return d;
  }
  function carteRecharge() {
    var f = (S.etat && S.etat.forfait) || { questions: 1000, prix_eur: 2.5, validite_mois: 12 };
    var d = document.createElement('div'); d.className = 'kf-card';
    d.innerHTML = '<h4>' + T().rechargeTitre + '</h4><div>' + esc(T().rechargeTexte(f)) + '</div>' + (f.achetable === false ? '' : '<p style="margin:12px 0 0"><button type="button" class="kf-cta sec" data-act="acheter">' + esc(T().recharger(f)) + '</button></p>') + '<div class="kf-note" role="status" id="kf-achat-msg" style="display:none"></div>';
    return d;
  }
  function carteMessage(titre, texte) {
    var d = document.createElement('div'); d.className = 'kf-card'; d.innerHTML = '<h4>' + esc(titre) + '</h4><div>' + esc(texte) + '</div>'; return d;
  }

  function construireCorps() {
    var body = $('.kf-body'); body.innerHTML = '';
    var foot = $('.kf-foot'); var e = S.etat;
    foot.style.display = '';
    $('.kf-meta').style.display = '';
    var gerer = !!e && (e.etat === 'utilisable' || e.etat === 'recharge');
    S.root.querySelectorAll('[data-act="nouvelle"],[data-act="supprimer"]').forEach(function (b) { b.style.display = gerer ? '' : 'none'; });
    if (!e) { body.appendChild(carteMessage('Koffi', T().indispo)); foot.style.display = 'none'; return; }
    if (e.etat === 'vitrine') { body.appendChild(carteVitrine()); foot.style.display = 'none'; return; }
    if (e.etat === 'desactive') { body.appendChild(carteMessage('Koffi', T().desactive)); foot.style.display = 'none'; return; }
    if (e.etat === 'indisponible') { body.appendChild(carteMessage('Koffi', T().indispo)); foot.style.display = 'none'; return; }
    if (e.etat === 'evaluation') { body.appendChild(carteMessage('Koffi', T().evaluation)); foot.style.display = 'none'; return; }
    if (!lsGet('koffi_info_vue_v2') && !e.apercu) { body.appendChild(carteInfo()); foot.style.display = 'none'; return; }
    S.msgs.forEach(function (m) { ajouterMessage(m, true); });
    if (!S.msgs.length) ajouterMessage({ role: 'assistant', contenu: T().accueil, flags: ['accueil'] }, false);
    if (e.etat === 'recharge') { body.appendChild(carteRecharge()); }
    var ta = $('.kf-form textarea'), env = $('.kf-send');
    var bloque = e.etat === 'recharge';
    ta.disabled = bloque; env.disabled = bloque;
    majMeta();
  }

  function traduireUI() {
    var t = T();
    $('.kf-head .t b').textContent = t.nom; $('.kf-head .t span').textContent = t.sous;
    $('.kf-btn span').textContent = t.nom; $('.kf-btn').setAttribute('aria-label', t.ouvrir);
    $('[data-act="fermer"]').setAttribute('aria-label', t.fermer); $('[data-act="fermer"]').title = t.fermer;
    $('[data-act="nouvelle"]').title = t.nouvelle; $('[data-act="supprimer"]').title = t.supprimer;
    $('.kf-form textarea').placeholder = t.placeholder; $('.kf-send').textContent = t.envoyer;
    $('.kf-ret').textContent = t.retention;
    S.root.querySelectorAll('[data-lg]').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-lg') === S.lg); b.setAttribute('aria-pressed', b.getAttribute('data-lg') === S.lg ? 'true' : 'false'); });
  }

  function chargerEtat() {
    return api('GET', '/api/kofi/etat?formation_id=' + encodeURIComponent(S.opts.formationId)).then(function (r) { S.etat = r.ok ? r.data : null; return r; });
  }
  function chargerConversation() {
    S.conv = null; S.msgs = [];
    if (!S.etat || ['utilisable', 'recharge'].indexOf(S.etat.etat) < 0) return Promise.resolve();
    return api('GET', '/api/kofi/conversations?formation_id=' + encodeURIComponent(S.opts.formationId)).then(function (r) {
      var c = r.ok && r.data.conversations && r.data.conversations[0]; if (!c) return;
      return api('GET', '/api/kofi/conversations/' + c.id).then(function (rr) { if (rr.ok) { S.conv = c.id; S.msgs = rr.data.messages || []; } });
    });
  }

  function ouvrirPanneau() {
    S.root.classList.add('open');
    chargerEtat().then(chargerConversation).then(function () { traduireUI(); construireCorps(); var ta = $('.kf-form textarea'); if (ta && !ta.disabled && $('.kf-foot').style.display !== 'none') ta.focus(); });
  }
  function fermerPanneau() { S.root.classList.remove('open'); var b = $('.kf-btn'); if (b) b.focus(); }

  function demarrerConversation() {
    if (S.conv) return Promise.resolve(S.conv);
    return api('POST', '/api/kofi/conversations', { formation_id: S.opts.formationId, langue: S.lg }).then(function (r) { if (r.ok) { S.conv = r.data.id; return S.conv; } throw r; });
  }

  function envoyer() {
    if (S.occupe) return;
    var ta = $('.kf-form textarea'); var texte = ta.value.trim(); if (!texte) return;
    S.occupe = true; $('.kf-send').disabled = true;
    var corps = $('.kf-body');
    if (!S.msgs.length) corps.innerHTML = '';
    var mu = { role: 'user', contenu: texte }; S.msgs.push(mu); ajouterMessage(mu);
    ta.value = ''; ta.style.height = 'auto';
    var att = document.createElement('div'); att.className = 'kf-typing'; att.setAttribute('role', 'status'); att.textContent = T().reflechit; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    demarrerConversation().then(function (id) {
      var lecon = typeof S.opts.leconId === 'function' ? S.opts.leconId() : null;
      return api('POST', '/api/kofi/conversations/' + id + '/messages', { texte: texte, langue: S.lg, lecon_id: lecon || undefined });
    }).then(function (r) {
      att.remove();
      if (r.ok) {
        S.msgs.push(r.data.message); ajouterMessage(r.data.message, true);
        if (S.etat) { S.etat.credits = r.data.credits; S.etat.etat = r.data.etat; }
        majMeta(); if (r.data.etat === 'recharge') { construireCorps(); }
      } else {
        S.msgs.pop();
        var code = r.data && r.data.code;
        if (code === 'credits_epuises') { if (S.etat) { S.etat.etat = 'recharge'; if (r.data.forfait) S.etat.forfait = Object.assign({}, S.etat.forfait, r.data.forfait); } construireCorps(); }
        else if (code === 'premium_requis') { if (S.etat) S.etat.etat = 'vitrine'; construireCorps(); }
        else if (code === 'evaluation') { if (S.etat) S.etat.etat = 'evaluation'; construireCorps(); }
        else if (code === 'desactive') { if (S.etat) S.etat.etat = 'desactive'; construireCorps(); }
        else { ajouterMessage({ role: 'assistant', contenu: (r.data && r.data.error) || (r.status === 429 ? T().trop : T().erreur) }, false); }
      }
    }).catch(function () {
      att.remove(); S.msgs.pop();
      ajouterMessage({ role: 'assistant', contenu: T().erreur }, false);
    }).then(function () { S.occupe = false; var e = S.etat && S.etat.etat !== 'recharge'; $('.kf-send').disabled = !e; if (e) ta.focus(); });
  }

  /* Message d'achat : dans la carte de recharge si elle est affichée, sinon en bulle dans la conversation. */
  function messageAchat(texte) {
    var z = S.root.querySelector('#kf-achat-msg');
    if (z) { z.style.display = ''; z.textContent = texte; return; }
    ajouterMessage({ role: 'assistant', contenu: texte }, false);
  }
  function chargerConsentement() {
    if (window.FormationConsent) return Promise.resolve();
    return new Promise(function (ok) {
      var sc = document.createElement('script'); sc.src = '/assets/formation-achat-consent.js?v=2'; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc);
    });
  }
  /* Le consentement « achat non remboursable » est demandé À L'ÉCRAN, mais c'est le serveur qui l'exige (409 sans lui). */
  function acheterForfait() {
    if (S.occupe || !S.etat || !S.etat.forfait) return;
    var f = S.etat.forfait; S.occupe = true;
    chargerConsentement().then(function () {
      if (!window.FormationConsent) return false;
      return window.FormationConsent.demander({ titre: 'Koffi — ' + f.questions + ' questions', prix: f.prix_eur, texte: f.texte, retractation: f.retractation });
    }).then(function (accepte) {
      if (!accepte) { S.occupe = false; return; }
      messageAchat(T().paiementOuvre);
      return api('POST', '/api/kofi/forfait/acheter', { formation_id: S.opts.formationId, accepte_non_remboursable: true, retour: S.opts.telephone ? 'telephone' : undefined }).then(function (r) {
        if (r.ok && r.data.checkout_url) { location.href = r.data.checkout_url; return; }
        S.occupe = false; messageAchat((r.data && r.data.error) || T().erreur);
      });
    }).catch(function () { S.occupe = false; messageAchat(T().erreur); });
  }
  /* Retour de Stripe (?kofi=succes) : le crédit arrive par le webhook, quelques secondes plus tard — on interroge jusqu'à voir les questions. */
  function retourPaiement() {
    var p = new URLSearchParams(location.search), k = p.get('kofi'); if (!k) return;
    try { p.delete('kofi'); var q = p.toString(); history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) { /* sans importance */ }
    S.root.classList.add('open'); traduireUI();
    var corps = $('.kf-body'); corps.innerHTML = '';
    if (k === 'annule') { chargerEtat().then(chargerConversation).then(function () { construireCorps(); messageAchat(T().paiementAnnule); }); return; }
    corps.appendChild(carteMessage('Koffi', T().paiementRecu)); $('.kf-foot').style.display = 'none';
    /* On interroge l'état du DERNIER ACHAT (et non le solde) : le webhook peut avoir crédité avant ou après le retour sur cette page. */
    var essais = 0;
    (function boucle() {
      chargerEtat().then(function () {
        var st = S.etat && S.etat.achat && S.etat.achat.statut;
        if (st === 'payee' || st === 'expiree' || ++essais >= 12) {
          chargerConversation().then(function () { construireCorps(); messageAchat(st === 'payee' ? T().paiementOk : T().paiementAttente); });
        } else setTimeout(boucle, 2500);
      });
    })();
  }

  function construire() {
    if (!document.getElementById('kf-style')) { var st = document.createElement('style'); st.id = 'kf-style'; st.textContent = CSS; document.head.appendChild(st); }
    var root = document.createElement('div'); root.className = 'kf-root' + (S.opts && S.opts.telephone ? ' kf-tel' : ''); root.setAttribute('data-koffi', '1');
    root.innerHTML =
      '<button type="button" class="kf-btn" data-act="ouvrir"><img src="/assets/koffi-avatar-96.webp" width="52" height="52" alt=""><span></span></button>' +
      '<section class="kf-panel" role="dialog" aria-label="Koffi" aria-modal="false">' +
        '<div class="kf-head"><img src="/assets/koffi-avatar-96.webp" width="44" height="44" alt=""><div class="t"><b></b><span></span></div>' +
          '<button type="button" class="kf-ic" data-lg="fr" title="Français">FR</button><button type="button" class="kf-ic" data-lg="en" title="English">EN</button>' +
          '<button type="button" class="kf-ic" data-act="nouvelle">＋</button><button type="button" class="kf-ic" data-act="supprimer">🗑</button><button type="button" class="kf-ic" data-act="fermer">✕</button></div>' +
        '<div class="kf-body" aria-live="polite"></div>' +
        '<div class="kf-foot"><div class="kf-meta"><span><span class="kf-count"></span> <button type="button" class="kf-link kf-recharge-lien" data-act="acheter" style="display:none"></button></span><span class="kf-ret"></span></div>' +
          '<form class="kf-form"><textarea rows="1" maxlength="1500" aria-label="Question"></textarea><button type="submit" class="kf-send"></button></form></div>' +
      '</section>';
    document.body.appendChild(root); S.root = root;

    root.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-act],[data-lg],[data-ref],[data-lecon],[data-note]'); if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'ouvrir') return ouvrirPanneau();
      if (act === 'fermer') return fermerPanneau();
      if (act === 'compris') { lsSet('koffi_info_vue_v2', '1'); return construireCorps(); }
      if (act === 'acheter') return acheterForfait();
      if (act === 'nouvelle') { S.conv = null; S.msgs = []; if (S.etat && S.etat.etat !== 'recharge') { construireCorps(); } return; }
      if (act === 'supprimer') {
        if (!S.conv) return; if (!window.confirm(T().confirmSuppr)) return;
        return api('DELETE', '/api/kofi/conversations/' + S.conv).then(function () { S.conv = null; S.msgs = []; construireCorps(); });
      }
      var lg = t.getAttribute('data-lg');
      if (lg) { S.lg = lg; lsSet('koffi_langue', lg); traduireUI(); construireCorps(); return; }
      var ref = t.getAttribute('data-ref');
      if (ref) { var bloc = t.closest('.kf-msg'); var l = bloc && bloc.querySelector('.kf-src button[data-n="' + ref + '"]'); if (l) l.click(); return; }
      if (t.hasAttribute('data-lecon')) {
        var id = t.getAttribute('data-lecon');
        if (typeof S.opts.ouvrirLecon === 'function') { S.opts.ouvrirLecon(id); if (S.opts.telephone || window.matchMedia('(max-width:560px)').matches) fermerPanneau(); }
        else location.href = t.getAttribute('data-url');
        return;
      }
      var note = t.getAttribute('data-note');
      if (note) {
        var fb = t.closest('.kf-fb'); var mid = fb && fb.getAttribute('data-mid');
        return api('POST', '/api/kofi/feedback', { message_id: Number(mid), note: Number(note) }).then(function (r) { if (r.ok) fb.innerHTML = '<span>' + T().merci + '</span>'; });
      }
    });
    root.querySelector('.kf-form').addEventListener('submit', function (ev) { ev.preventDefault(); envoyer(); });
    var ta = root.querySelector('.kf-form textarea');
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; });
    if (!ecouteEchap) { ecouteEchap = true; document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.root && S.root.classList.contains('open')) fermerPanneau(); }); }
  }

  window.KoffiWidget = {
    /* Monte le bouton SEULEMENT si le serveur reconnaît l'élève (inscrit, ou formateur en aperçu) : sinon rien n'apparaît. */
    monter: function (opts) {
      if (S.root) return;
      S.opts = opts || {};
      S.lg = lsGet('koffi_langue') === 'en' ? 'en' : 'fr';
      var mien = ++jeton;
      return chargerEtat().then(function (r) {
        if (!r.ok || mien !== jeton || S.root) return; /* démonté ou remonté entre-temps : réponse périmée */
        construire(); traduireUI(); retourPaiement();
      });
    },
    /* Appli téléphone : l'écran change sans recharger la page — on retire le bouton et on oublie l'état de la formation quittée. */
    demonter: function () {
      jeton++;
      if (S.root && S.root.parentNode) S.root.parentNode.removeChild(S.root);
      S.root = null; S.etat = null; S.conv = null; S.msgs = []; S.occupe = false; S.opts = null;
    },
    estMonte: function (formationId) { return !!S.root && (formationId == null || (S.opts && String(S.opts.formationId) === String(formationId))); }
  };
})();

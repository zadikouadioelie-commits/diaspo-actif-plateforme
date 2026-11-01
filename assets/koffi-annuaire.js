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
    paiementRecu: 'Paiement reçu : votre crédit est en cours d\'ajout…'
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
    '.ka-form{display:flex;gap:8px;align-items:flex-end}',
    '.ka-form textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font:14px/1.4 inherit;font-family:inherit;max-height:110px;min-height:42px;background:#fff;color:#0f172a}',
    '.ka-form textarea:focus{outline:2px solid #F26422;border-color:#F26422}',
    '.ka-send{border:0;background:#F26422;color:#fff;border-radius:12px;height:42px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.ka-send:disabled{opacity:.5;cursor:not-allowed}',
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

  var S = { opts: null, etat: null, conv: null, msgs: [], root: null, occupe: false, presEnCours: false };
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

  function construireCorps() {
    if (S.presEnCours) return;
    var body = $('.ka-body'); body.innerHTML = '';
    var foot = $('.ka-foot'), e = S.etat, ta = $('.ka-form textarea'), env = $('.ka-send');
    foot.style.display = ''; ta.disabled = false; env.disabled = false; majMeta();
    $('.ka-av').textContent = (e && e.avertissement) || T.info1;
    S.root.querySelectorAll('[data-a="nouvelle"],[data-a="supprimer"]').forEach(function (b) { b.style.display = e && (e.etat === 'utilisable' || e.etat === 'recharge') ? '' : 'none'; });
    if (!e) { body.appendChild(carte('Koffi', T.indisponible)); foot.style.display = 'none'; return; }
    var st = e.etat;
    if (st === 'premium_requis') { body.appendChild(carte(T.premiumTitre, e.message_etat || '', [lienBouton('⭐ ' + T.premium, (S.opts && S.opts.premiumUrl) || 'premium.html'), bouton(T.manuel, 'manuel', true)])); foot.style.display = 'none'; return; }
    if (st === 'reciprocite') { body.appendChild(carte(T.reciproTitre, e.message_etat || '', [lienBouton(T.confidentialite, 'confidentialite.html'), bouton(T.manuel, 'manuel', true)])); foot.style.display = 'none'; return; }
    if (st === 'majorite') { body.appendChild(carteMajorite()); foot.style.display = 'none'; return; }
    if (st === 'mineur' || st === 'pays' || st === 'desactive' || st === 'indisponible') { body.appendChild(carte('Koffi', T[st], [bouton(T.manuel, 'manuel', true)])); foot.style.display = 'none'; return; }
    if (e.presentation_vue === false && !S.msgs.length) { foot.style.display = 'none'; jouerPresentation(body); return; }
    if (!lsGet('koffi_annuaire_info_v1')) { body.appendChild(carteInfo()); foot.style.display = 'none'; return; }
    S.msgs.forEach(ajouterMessage);
    if (!S.msgs.length) {
      ajouterMessage({ role: 'assistant', contenu: T.accueil });
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
  }

  function chargerEtat() {
    return api('GET', '/api/kofi/annuaire/etat').then(function (r) {
      if (r.ok) { S.etat = r.data; S.conv = r.data.conversation ? r.data.conversation.id : null; S.msgs = r.data.conversation ? r.data.conversation.messages : []; }
      return r;
    });
  }
  function ouvrirPanneau() {
    S.root.classList.add('open');
    chargerEtat().then(function () { construireCorps(); var ta = $('.ka-form textarea'); if (ta && !ta.disabled && $('.ka-foot').style.display !== 'none' && window.innerWidth > 560) ta.focus(); });
  }
  function fermerPanneau() { S.root.classList.remove('open'); var b = $('.ka-btn'); if (b) b.focus(); }

  function envoyer() {
    if (S.occupe) return;
    var ta = $('.ka-form textarea'); var texte = ta.value.trim(); if (!texte || ta.disabled) return;
    var max = S.etat && S.etat.max_message; if (max && texte.length > max) { ajouterMessage({ role: 'assistant', contenu: 'Message trop long (' + max + ' caractères au maximum).' }); return; }
    S.occupe = true; $('.ka-send').disabled = true;
    var corps = $('.ka-body');
    if (!S.msgs.length) corps.innerHTML = '';
    var mu = { role: 'user', contenu: texte }; S.msgs.push(mu); ajouterMessage(mu);
    ta.value = ''; ta.style.height = 'auto';
    var att = document.createElement('div'); att.className = 'ka-typing'; att.setAttribute('role', 'status'); att.textContent = T.reflechit; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/annuaire/messages', { texte: texte, conversation_id: S.conv || undefined }).then(function (r) {
      att.remove();
      if (r.ok) {
        S.conv = r.data.conversation_id; S.msgs.push(r.data.message); ajouterMessage(r.data.message);
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
          '<button type="button" class="ka-ic" data-a="nouvelle">＋</button><button type="button" class="ka-ic" data-a="supprimer">🗑</button><button type="button" class="ka-ic" data-a="fermer">✕</button></div>' +
        '<div class="ka-body" aria-live="polite"></div>' +
        '<div class="ka-foot"><p class="ka-av"></p><form class="ka-form"><textarea rows="1" maxlength="1500" aria-label="Votre recherche"></textarea><button type="submit" class="ka-send"></button></form></div>' +
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
      if (act === 'nouvelle') { S.conv = null; S.msgs = []; if (S.etat && S.etat.etat !== 'recharge') construireCorps(); return; }
      if (act === 'supprimer') {
        if (!S.conv) return; if (!window.confirm(T.confirmSuppr)) return;
        return api('DELETE', '/api/kofi/annuaire/conversations/' + S.conv).then(function () { S.conv = null; S.msgs = []; construireCorps(); });
      }
    });
    root.querySelector('.ka-form').addEventListener('submit', function (ev) { ev.preventDefault(); envoyer(); });
    var ta = root.querySelector('.ka-form textarea');
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); envoyer(); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 110) + 'px'; });
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
      S.root = null; S.etat = null; S.conv = null; S.msgs = []; S.occupe = false; S.opts = null;
    },
    estMonte: function () { return !!S.root; }
  };
})();

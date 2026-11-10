/* ═════════════════════════════════════════════════
   assets/koffi-navigation.js — KOFFI, GUIDE DE NAVIGATION (toutes les pages, 2026-11-01)
   ═════════════════════════════════════════════════
   Autonome (CSS injecté, préfixe .kn-) : KoffiNavigation.ouvrir({ telephone })  ·  .fermer()  ·  .estOuvert()
   Ouvert depuis le bouton d'assistance de la plateforme (assets/app.js) : « Koffi — où aller ? ». La personne pose une question (« où publier un événement ? »), Koffi
   répond en quelques phrases et montre des BOUTONS vers les pages. Les boutons viennent du serveur (catalogue fermé : server/kofi-navigation-pages.js) : ici on n'affiche
   que ce qu'il renvoie. GRATUIT : aucune pastille de crédit. États serveur : utilisable | majorite | mineur | pays | desactive | indisponible.
   ═════════════════════════════════════════════════ */
(function () {
  'use strict';
  if (window.KoffiNavigation) return;

  var T = {
    nom: 'Koffi', sous: 'Où aller ? Je vous guide dans Diaspo\'Actif', fermer: 'Fermer', nouvelle: 'Nouvelle conversation', supprimer: 'Supprimer cette conversation',
    confirmSuppr: 'Supprimer cette conversation ? Cette action est définitive.', placeholder: 'Que cherchez-vous ?', envoyer: 'Envoyer', reflechit: 'Koffi cherche…',
    accueilTitre: 'Où voulez-vous aller ?', accueil: 'Dites-moi ce que vous cherchez ou ce que vous voulez faire : je vous montre la bonne page, d\'un clic. Mes réponses de navigation sont gratuites.',
    info: 'Koffi vous guide dans Diaspo\'Actif et ne connaît ni votre compte ni vos messages. Les questions de navigation sont gratuites.',
    oui: 'Oui, ajouter', non: 'Annuler', actionEnCours: 'Ajout en cours…',
    statuts: { appliquee: '✅ Adhérent ajouté', annulee: 'Annulé : rien n\'a été ajouté', echec: 'Non ajouté', expiree: 'Proposition non confirmée : rien n\'a été ajouté', en_cours: 'Ajout en cours…' },
    majTitre: 'Koffi est réservé aux personnes majeures', majTexte: 'Pour utiliser Koffi, confirmez que vous avez 18 ans ou plus. Le site reste entièrement utilisable sans lui.', majCase: 'Je confirme avoir 18 ans ou plus', majBtn: 'Confirmer',
    mineur: 'Koffi est réservé aux personnes de 18 ans ou plus. Le site reste entièrement utilisable sans lui : le menu et la recherche vous mènent partout.',
    pays: 'Koffi n\'est pas disponible dans votre pays pour le moment.', desactive: 'Koffi est désactivé pour le moment.', indisponible: 'Koffi est momentanément indisponible. Réessayez un peu plus tard.',
    erreur: 'Une erreur est survenue. Réessayez.', trop: 'Doucement : patientez quelques secondes avant le message suivant.', y: 'Aller à'
  };

  var CSS = [
    '.kn-root,.kn-root *{box-sizing:border-box}',
    '.kn-root{position:fixed;right:22px;bottom:22px;z-index:9100;font-family:inherit;color:#0f172a;line-height:1.45}',
    '.kn-panel{position:fixed;right:18px;bottom:18px;width:400px;max-width:calc(100vw - 24px);height:min(640px,calc(100vh - 36px));background:#fff;border-radius:18px;box-shadow:0 20px 60px rgba(2,12,27,.45),0 0 0 1px rgba(13,43,78,.15);display:none;flex-direction:column;overflow:hidden;color:#0f172a;text-align:left}',
    '.kn-root.open .kn-panel{display:flex}',
    '.kn-head{display:flex;align-items:center;gap:10px;padding:10px 12px;background:#0D2B4E;flex:none}',
    '.kn-head img{width:42px;height:42px;border-radius:50%;background:#fff;flex:none}',
    '.kn-t{flex:1;min-width:0}.kn-t b{display:block;font-size:16px;color:#fff}.kn-t span{display:block;font-size:11.5px;color:#cbd5e1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.kn-ic{border:0;background:rgba(255,255,255,.12);color:#fff;border-radius:9px;min-width:34px;height:34px;cursor:pointer;font:700 14px inherit;font-family:inherit;padding:0 8px}',
    '.kn-ic:hover{background:rgba(255,255,255,.24)}.kn-ic:focus-visible{outline:2px solid #F26422}',
    '.kn-body{flex:1;overflow-y:auto;padding:14px;background:#f1f5f9;display:flex;flex-direction:column;gap:10px}',
    '.kn-msg{max-width:92%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}',
    '.kn-msg.u{align-self:flex-end;background:#0D2B4E;color:#fff;border-bottom-right-radius:4px}',
    '.kn-msg.a{align-self:flex-start;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-bottom-left-radius:4px}',
    '.kn-dests{align-self:flex-start;display:flex;flex-direction:column;gap:6px;max-width:92%;width:100%}',
    '.kn-dest{display:flex;align-items:center;gap:10px;text-decoration:none;background:#fff;border:1.5px solid #F26422;border-radius:12px;padding:9px 12px;color:#0D2B4E;font-weight:700;font-size:13.5px}',
    '.kn-dest:hover{background:#fff7ed}.kn-dest:focus-visible{outline:3px solid #F26422;outline-offset:2px}.kn-dest .ic{font-size:20px;flex:none}.kn-dest .go{margin-left:auto;color:#b84c1a;font-size:12px;font-weight:800;white-space:nowrap}',
    '.kn-act{align-self:flex-start;max-width:92%;width:100%;display:flex;flex-wrap:wrap;gap:8px;align-items:center}',
    '.kn-act .kn-ok{border:0;background:#F26422;color:#fff;border-radius:10px;padding:10px 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.kn-act .kn-ok:hover{background:#d9541a}',
    '.kn-act .kn-no{border:1.5px solid #cbd5e1;background:#fff;color:#0D2B4E;border-radius:10px;padding:9px 16px;font:700 14px inherit;font-family:inherit;cursor:pointer}.kn-act .kn-no:hover{background:#f8fafc}',
    '.kn-act button:disabled{opacity:.55;cursor:not-allowed}.kn-act button:focus-visible{outline:3px solid #F26422;outline-offset:2px}',
    '.kn-act .kn-st{font-size:13px;font-weight:700;color:#475569}.kn-act .kn-st.ok{color:#15803d}',
    '.kn-typing{align-self:flex-start;color:#475569;font-size:13px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:8px 12px}',
    '.kn-chips{display:flex;flex-direction:column;gap:6px}.kn-chips button{text-align:left;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:9px 12px;font:inherit;font-size:13.5px;color:#0D2B4E;cursor:pointer}',
    '.kn-chips button:hover{background:#fff7ed;border-color:#F26422}.kn-chips button:focus-visible{outline:3px solid #F26422;outline-offset:2px}',
    '.kn-foot{flex:none;background:#fff;border-top:1px solid #e2e8f0;padding:8px 10px 10px}',
    '.kn-av{margin:0 0 6px;font-size:11px;color:#64748b;line-height:1.35}',
    '.kn-form{display:flex;gap:8px;align-items:flex-end}',
    '.kn-form textarea{flex:1;resize:none;border:1px solid #cbd5e1;border-radius:12px;padding:9px 11px;font:14px/1.4 inherit;font-family:inherit;max-height:120px;min-height:42px;background:#fff;color:#0f172a}',
    '.kn-form textarea:focus{outline:2px solid #F26422;border-color:#F26422}',
    '.kn-send{border:0;background:#F26422;color:#fff;border-radius:12px;height:42px;padding:0 16px;font:800 14px inherit;font-family:inherit;cursor:pointer}.kn-send:disabled{opacity:.5;cursor:not-allowed}',
    '.kn-card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;font-size:13.5px;line-height:1.55;color:#0f172a}',
    '.kn-card h4{margin:0 0 6px;font-size:15px;color:#0D2B4E}.kn-card p{margin:0 0 8px;color:#0f172a}',
    '.kn-cta{display:inline-block;border:0;background:#F26422;color:#fff;font-weight:800;padding:10px 18px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:14px;margin-top:10px}.kn-cta[disabled]{opacity:.55;cursor:not-allowed}',
    '@media (max-width:560px){.kn-root{right:0;bottom:0}.kn-panel{right:0;bottom:0;left:0;width:100%;max-width:none;height:85vh;height:85dvh;border-radius:16px 16px 0 0}.kn-form textarea{font-size:16px}}'
  ].join('\n');

  var S = { opts: {}, etat: null, conv: null, msgs: [], root: null, occupe: false };
  var ecouteEchap = false;
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var $ = function (sel) { return S.root.querySelector(sel); };
  function api(method, url, body) {
    return fetch(url, { method: method, credentials: 'same-origin', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { status: r.status, ok: r.ok, data: d }; }); });
  }
  var lien = function (d) { return S.opts.telephone && d.tel ? 'm.html' + d.tel : d.url; };

  /* Carte d'action : boutons tant que la proposition attend le « oui » ; ensuite une simple ligne d'état. */
  function remplirCarteAction(el, a) {
    el.setAttribute('data-id', String(a.id)); el.setAttribute('data-statut', a.statut);
    if (a.statut === 'proposee') {
      el.innerHTML = '<button type="button" class="kn-ok" data-a="action-confirmer" data-id="' + esc(a.id) + '">' + esc(T.oui) + '</button><button type="button" class="kn-no" data-a="action-annuler" data-id="' + esc(a.id) + '">' + esc(T.non) + '</button>';
    } else {
      el.innerHTML = '<span class="kn-st' + (a.statut === 'appliquee' ? ' ok' : '') + '">' + esc(T.statuts[a.statut] || '') + '</span>';
    }
  }
  /* Une nouvelle réponse de Koffi referme les propositions restées en attente (le serveur fait de même). */
  function expirerCartes(sauf) {
    S.root.querySelectorAll('.kn-act[data-statut="proposee"]').forEach(function (el) {
      if (String(sauf) === el.getAttribute('data-id')) return;
      remplirCarteAction(el, { id: el.getAttribute('data-id'), statut: 'expiree' });
    });
    S.msgs.forEach(function (m) { if (m.action && m.action.statut === 'proposee' && String(sauf) !== String(m.action.id)) m.action.statut = 'expiree'; });
  }
  function majActions(liste) {
    (liste || []).forEach(function (u) {
      S.msgs.forEach(function (m) { if (m.action && Number(m.action.id) === Number(u.id)) m.action.statut = u.statut; });
      var el = S.root.querySelector('.kn-act[data-id="' + u.id + '"]'); if (el) remplirCarteAction(el, { id: u.id, statut: u.statut });
    });
  }

  function bulle(cls, texte) { var el = document.createElement('div'); el.className = 'kn-msg ' + cls; el.textContent = texte; return el; }
  function ajouterMessage(m) {
    var corps = $('.kn-body');
    if (m.role === 'user') corps.appendChild(bulle('u', m.contenu));
    else {
      corps.appendChild(bulle('a', m.contenu));
      if (m.destinations && m.destinations.length) {
        var l = document.createElement('div'); l.className = 'kn-dests';
        l.innerHTML = m.destinations.map(function (d) {
          return '<a class="kn-dest" href="' + esc(lien(d)) + '"><span class="ic" aria-hidden="true">' + esc(d.icone) + '</span><span>' + esc(d.titre) + '</span><span class="go">' + T.y + ' →</span></a>';
        }).join('');
        corps.appendChild(l);
      }
      if (m.action) { var ca = document.createElement('div'); ca.className = 'kn-act'; remplirCarteAction(ca, m.action); corps.appendChild(ca); }
    }
    corps.scrollTop = corps.scrollHeight;
  }
  function carte(titre, texte, bouton) {
    var d = document.createElement('div'); d.className = 'kn-card';
    d.innerHTML = '<h4>' + esc(titre) + '</h4><p>' + esc(texte) + '</p>';
    if (bouton) d.appendChild(bouton);
    return d;
  }
  function carteMajorite() {
    var d = carte(T.majTitre, T.majTexte);
    var l = document.createElement('label'); l.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:12px 0 0;cursor:pointer';
    l.innerHTML = '<input type="checkbox" data-maj="case" style="margin-top:3px"><span>' + esc(T.majCase) + '</span>';
    var b = document.createElement('button'); b.type = 'button'; b.className = 'kn-cta'; b.setAttribute('data-a', 'majorite'); b.textContent = T.majBtn; b.disabled = true;
    l.querySelector('input').addEventListener('change', function (ev) { b.disabled = !ev.target.checked; });
    d.appendChild(l); d.appendChild(b); return d;
  }

  function construireCorps() {
    var body = $('.kn-body'); body.innerHTML = '';
    var foot = $('.kn-foot'), e = S.etat;
    foot.style.display = ''; $('.kn-av').textContent = (e && e.avertissement) || T.info;
    var ok = e && e.etat === 'utilisable';
    S.root.querySelectorAll('[data-a="nouvelle"],[data-a="supprimer"]').forEach(function (b) { b.style.display = ok && S.conv ? '' : 'none'; });
    if (!e) { body.appendChild(carte('Koffi', T.indisponible)); foot.style.display = 'none'; return; }
    if (e.etat === 'majorite') { body.appendChild(carteMajorite()); foot.style.display = 'none'; return; }
    if (e.etat !== 'utilisable') { body.appendChild(carte('Koffi', T[e.etat] || T.indisponible)); foot.style.display = 'none'; return; }
    if (!S.msgs.length) {
      var d = carte(T.accueilTitre, T.accueil); body.appendChild(d);
      var ch = document.createElement('div'); ch.className = 'kn-chips';
      (e.suggestions || []).forEach(function (s) { var b = document.createElement('button'); b.type = 'button'; b.setAttribute('data-sugg', s); b.textContent = s; ch.appendChild(b); });
      body.appendChild(ch);
    } else S.msgs.forEach(ajouterMessage);
    body.scrollTop = body.scrollHeight;
  }

  function traduireUI() {
    $('.kn-t b').textContent = T.nom; $('.kn-t span').textContent = T.sous;
    $('[data-a="fermer"]').setAttribute('aria-label', T.fermer); $('[data-a="fermer"]').title = T.fermer;
    $('[data-a="nouvelle"]').title = T.nouvelle; $('[data-a="nouvelle"]').setAttribute('aria-label', T.nouvelle);
    $('[data-a="supprimer"]').title = T.supprimer; $('[data-a="supprimer"]').setAttribute('aria-label', T.supprimer);
    $('.kn-form textarea').placeholder = T.placeholder; $('.kn-send').textContent = T.envoyer;
  }

  function chargerEtat() {
    return api('GET', '/api/kofi/navigation/etat').then(function (r) {
      if (r.ok) { S.etat = r.data; S.conv = r.data.conversation ? r.data.conversation.id : null; S.msgs = r.data.conversation ? r.data.conversation.messages : []; }
      return r;
    });
  }
  function ouvrirPanneau() {
    S.root.classList.add('open');
    chargerEtat().then(function () { construireCorps(); var ta = $('.kn-form textarea'); if (ta && $('.kn-foot').style.display !== 'none' && window.innerWidth > 560) ta.focus(); });
  }
  function fermerPanneau() { if (S.root) S.root.classList.remove('open'); }

  function envoyer(texte) {
    texte = String(texte || '').trim();
    if (!texte || S.occupe || !S.etat || S.etat.etat !== 'utilisable') return;
    var max = S.etat.max_message; if (max && texte.length > max) { ajouterMessage({ role: 'assistant', contenu: 'Votre message est trop long (' + max + ' caractères au maximum).' }); return; }
    S.occupe = true; $('.kn-send').disabled = true;
    var corps = $('.kn-body');
    if (!S.msgs.length) corps.innerHTML = '';
    var mu = { role: 'user', contenu: texte }; S.msgs.push(mu); ajouterMessage(mu);
    var att = document.createElement('div'); att.className = 'kn-typing'; att.setAttribute('role', 'status'); att.textContent = T.reflechit; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    var page = (location.pathname || '').split('/').pop();
    api('POST', '/api/kofi/navigation/messages', { texte: texte, conversation_id: S.conv || undefined, page: page }).then(function (r) {
      att.remove();
      if (r.ok) { S.conv = r.data.conversation_id; expirerCartes(r.data.message.action ? r.data.message.action.id : ''); majActions(r.data.maj_actions); S.msgs.push(r.data.message); ajouterMessage(r.data.message); return; }
      S.msgs.pop();
      var code = r.data && r.data.code;
      if (code === 'majorite_requise' || code === 'mineur' || code === 'pays_non_pris_en_charge' || code === 'desactive') return chargerEtat().then(construireCorps);
      construireCorps(); ajouterMessage({ role: 'assistant', contenu: (r.data && r.data.error) || (r.status === 429 ? T.trop : T.erreur) });
    }).catch(function () { att.remove(); S.msgs.pop(); construireCorps(); ajouterMessage({ role: 'assistant', contenu: T.erreur }); })
      .then(function () { S.occupe = false; $('.kn-send').disabled = false; var ta = $('.kn-form textarea'); if (ta && window.innerWidth > 560) ta.focus(); });
  }

  function repondreAction(bouton, verbe) {
    if (S.occupe) return;
    var id = bouton.getAttribute('data-id'), carte = bouton.closest('.kn-act');
    S.occupe = true; $('.kn-send').disabled = true;
    if (carte) carte.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
    var corps = $('.kn-body');
    var att = document.createElement('div'); att.className = 'kn-typing'; att.setAttribute('role', 'status'); att.textContent = verbe === 'confirmer' ? T.actionEnCours : '…'; corps.appendChild(att); corps.scrollTop = corps.scrollHeight;
    api('POST', '/api/kofi/navigation/actions/' + encodeURIComponent(id) + '/' + verbe).then(function (r) {
      att.remove();
      if (r.ok) { majActions(r.data.maj_actions); S.msgs.push(r.data.message); ajouterMessage(r.data.message); return; }
      majActions(r.data && r.data.maj_actions);
      if (carte && carte.getAttribute('data-statut') === 'proposee') carte.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
      ajouterMessage({ role: 'assistant', contenu: (r.data && r.data.error) || (r.status === 429 ? T.trop : T.erreur) });
    }).catch(function () { att.remove(); if (carte) carte.querySelectorAll('button').forEach(function (b) { b.disabled = false; }); ajouterMessage({ role: 'assistant', contenu: T.erreur }); })
      .then(function () { S.occupe = false; $('.kn-send').disabled = false; });
  }

  function confirmerMajorite() {
    var c = S.root.querySelector('[data-maj="case"]'); if (!c || !c.checked || S.occupe) return;
    S.occupe = true;
    api('POST', '/api/kofi/majorite', { confirme: true }).then(function () { S.occupe = false; return chargerEtat().then(construireCorps); }).catch(function () { S.occupe = false; });
  }

  function construire() {
    if (!document.getElementById('kn-style')) { var st = document.createElement('style'); st.id = 'kn-style'; st.textContent = CSS; document.head.appendChild(st); }
    var root = document.createElement('div'); root.className = 'kn-root'; root.setAttribute('data-koffi-navigation', '1');
    root.innerHTML =
      '<section class="kn-panel" role="dialog" aria-label="Koffi, guide de navigation" aria-modal="false">' +
        '<div class="kn-head"><img src="/assets/koffi-avatar-96.webp" width="42" height="42" alt=""><div class="kn-t"><b></b><span></span></div>' +
          '<button type="button" class="kn-ic" data-a="nouvelle">＋</button><button type="button" class="kn-ic" data-a="supprimer">🗑</button><button type="button" class="kn-ic" data-a="fermer">✕</button></div>' +
        '<div class="kn-body" aria-live="polite"></div>' +
        '<div class="kn-foot"><p class="kn-av"></p><form class="kn-form"><textarea rows="1" maxlength="1000" aria-label="Votre question à Koffi"></textarea><button type="submit" class="kn-send"></button></form></div>' +
      '</section>';
    document.body.appendChild(root); S.root = root;
    root.addEventListener('click', function (ev) {
      var sg = ev.target.closest ? ev.target.closest('[data-sugg]') : null;
      if (sg) return envoyer(sg.getAttribute('data-sugg'));
      /* Version téléphone : on reste dans la même page (changement de #/écran), la fenêtre doit donc se refermer d'elle-même. */
      if (S.opts.telephone && ev.target.closest && ev.target.closest('.kn-dest')) { fermerPanneau(); return; }
      var t = ev.target.closest ? ev.target.closest('[data-a]') : null; if (!t) return;
      var act = t.getAttribute('data-a');
      if (act === 'fermer') return fermerPanneau();
      if (act === 'majorite') return confirmerMajorite();
      if (act === 'action-confirmer') return repondreAction(t, 'confirmer');
      if (act === 'action-annuler') return repondreAction(t, 'annuler');
      if (act === 'nouvelle') { S.conv = null; S.msgs = []; return construireCorps(); }
      if (act === 'supprimer') {
        if (!S.conv || !window.confirm(T.confirmSuppr)) return;
        return api('DELETE', '/api/kofi/navigation/conversations/' + S.conv).then(function () { S.conv = null; S.msgs = []; construireCorps(); });
      }
    });
    root.querySelector('.kn-form').addEventListener('submit', function (ev) { ev.preventDefault(); var ta = root.querySelector('textarea'); var v = ta.value; ta.value = ''; ta.style.height = 'auto'; envoyer(v); });
    var ta = root.querySelector('textarea');
    ta.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); root.querySelector('.kn-form').dispatchEvent(new Event('submit', { cancelable: true })); } });
    ta.addEventListener('input', function () { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; });
    if (!ecouteEchap) { ecouteEchap = true; document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && S.root && S.root.classList.contains('open')) fermerPanneau(); }); }
    traduireUI();
  }

  window.KoffiNavigation = {
    ouvrir: function (opts) {
      if (opts) S.opts = opts;
      if (!S.root) construire();
      if (S.root.classList.contains('open')) return fermerPanneau();   /* un second clic sur le bouton d'assistance referme la fenêtre */
      ouvrirPanneau();
    },
    fermer: fermerPanneau,
    estOuvert: function () { return !!(S.root && S.root.classList.contains('open')); }
  };
})();

/* Commande vocale (2026-11-10) : bouton micro commun à tous les Koffi, voir assets/koffi-voix.js */
(function () { if (window.KoffiVoix) return; var s = document.createElement("script"); s.src = "/assets/koffi-voix.js?v=1"; s.async = true; (document.head || document.documentElement).appendChild(s); })();

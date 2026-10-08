/* ============================================================
   Diaspo'Actif — Version téléphone (m.html)
   Application à page unique : 5 onglets (Fil · Événements · Messages · Boutiques · Moi),
   toutes les données viennent de la vraie API de la plateforme (mêmes routes que le site).
   ============================================================ */
(function () {
  'use strict';

  /* ---------- utilitaires ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const strip = v => String(v == null ? '' : v).replace(/<[^>]*>/g, ' ').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
  const md = v => String(v == null ? '' : v).replace(/\*\*([^*]+)\*\*/g, '$1');
  const linkify = t => esc(t).replace(/((?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|fr|org|net|io|app)(?:\/[^\s<]*)?)/gi, u => { const h = /^https?:/i.test(u) ? u : 'https://' + u; return '<a href="' + h + '" target="_blank" rel="noopener" style="color:var(--navy2);text-decoration:underline;word-break:break-all">' + u + '</a>'; });
  const initials = n => (String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('') || '?').toUpperCase();
  const safeUrl = u => /^(https?:|data:image\/|\/|blob:)/i.test(String(u || '')) ? String(u) : '';
  const attrUrl = u => esc(safeUrl(u));

  const ICONS = {
    fil: '<path d="M4 4h13v16H6a2 2 0 0 1-2-2V4z"/><path d="M17 9h3v9a2 2 0 0 1-2 2"/><path d="M8 8h5M8 12h5M8 16h3"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/>',
    shop: '<path d="M4 9l1.5-5h13L20 9"/><path d="M4 9v11h16V9"/><path d="M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"/><path d="M10 20v-6h4v6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    bell: '<path d="M6 10a6 6 0 0 1 12 0c0 5 2 6 2 7H4c0-1 2-2 2-7z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    comment: '<path d="M4 5h16v11H9l-5 4z"/>',
    share: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11l7.6-4M8.2 13l7.6 4"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    send: '<path d="M4 12l16-8-6 16-3-7z"/>',
    ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="2 2"/>',
    pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chev: '<path d="M9 5l7 7-7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
    brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M3 13h18"/>',
    card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
    file: '<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    gift: '<rect x="3" y="9" width="18" height="12" rx="1"/><path d="M3 13h18M12 9v12M12 9c-2-4-6-3-5 0 .5 1.3 5 0 5 0zm0 0c2-4 6-3 5 0-.5 1.3-5 0-5 0z"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    logout: '<path d="M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M16 8l4 4-4 4M20 12H9"/>',
    desk: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.6"/><path d="M17 14a5 5 0 0 1 4.5 5"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
    dir: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20a6.2 6.2 0 0 1 12.4 0"/><path d="M17 5h4M17 9h4M17 13h4"/>',
    doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>'
  };
  const ic = (n, cls) => `<svg class="i ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;

  function ago(d) {
    if (!d) return '';
    const t = new Date(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z'));
    if (isNaN(t)) return '';
    const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
    if (s < 60) return "à l'instant";
    if (s < 3600) return Math.floor(s / 60) + ' min';
    if (s < 86400) return Math.floor(s / 3600) + ' h';
    if (s < 7 * 86400) return Math.floor(s / 86400) + ' j';
    return t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  }
  function hhmm(d) {
    const t = new Date(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z'));
    return isNaN(t) ? '' : t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function dayLabel(d) {
    const t = new Date(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z'));
    if (isNaN(t)) return '';
    const n = new Date(), y = new Date(Date.now() - 864e5);
    if (t.toDateString() === n.toDateString()) return "Aujourd'hui";
    if (t.toDateString() === y.toDateString()) return 'Hier';
    return t.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  function parseDay(s) { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; }
  function dateLong(s) {
    const p = parseDay(s); if (!p) return '';
    return new Date(p.y, p.m - 1, p.d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  async function api(path, opts) {
    opts = opts || {};
    const init = { credentials: 'same-origin', method: opts.method || 'GET', headers: {} };
    if (opts.body !== undefined) { init.headers['Content-Type'] = 'application/json'; init.body = JSON.stringify(opts.body); }
    let r;
    try { r = await fetch(path, init); } catch (e) { const er = new Error('Connexion impossible. Vérifiez votre réseau.'); er.network = true; throw er; }
    let j = null; try { j = await r.json(); } catch (e) { /* réponse vide */ }
    if (!r.ok) { const er = new Error((j && (j.error || j.message)) || 'Une erreur est survenue.'); er.status = r.status; er.data = j; throw er; }
    return j || {};
  }

  let toastT;
  function toast(msg, err) {
    const t = $('#toast'); t.textContent = msg; t.className = 'show' + (err ? ' err' : '');
    clearTimeout(toastT); toastT = setTimeout(() => { t.className = ''; }, 2600);
  }

  /* ---------- média avec fond flou de sa propre image ---------- */
  function mediaBlock(url, extra) {
    const u = attrUrl(url); if (!u) return '';
    return `<div class="media"><img class="bg" src="${u}" alt="" aria-hidden="true"><img class="fg" loading="lazy" src="${u}" alt="${esc((extra && extra.alt) || '')}" data-zoom="${u}">${extra && extra.more ? `<span class="more">+${extra.more}</span>` : ''}</div>`;
  }
  function videoBlock(url, poster) {
    const u = attrUrl(url); if (!u) return '';
    const p = poster ? attrUrl(poster) : '';
    return `<div class="media"><video controls playsinline preload="metadata" ${p ? `poster="${p}"` : ''} src="${u}"></video></div>`;
  }
  function zoom(src) {
    const v = document.createElement('div'); v.className = 'viewer';
    v.innerHTML = `<img src="${esc(src)}" alt=""><button aria-label="Fermer">${ic('close', 'l')}</button>`;
    v.onclick = () => v.remove(); document.body.appendChild(v);
  }

  /* ---------- état ---------- */
  const S = {
    me: null, tab: null, unreadMsg: 0, unreadNotif: 0,
    fil: { mode: 'tous', page: 1, pages: 1, posts: [], loaded: false },
    ev: { items: [], filtre: 'avenir', q: '', loaded: false },
    boutiques: { items: [], q: '', loaded: false },
    ann: { type: '', q: '', pays: '', ville: '', domaine: '', origine: '', items: [], shown: 30, loaded: false, opts: null, open: {} },
    myInsc: new Set(), pane: null, chatTimer: null, convNames: {}
  };
  const TABS = ['accueil', 'evenements', 'annuaire', 'messages', 'boutiques', 'moi'];
  const TITLES = { accueil: 'Accueil', evenements: 'Événements', annuaire: 'Annuaire', messages: 'Messages', boutiques: 'Boutiques', moi: 'Mon espace' };
  const scrollMem = {};

  /* ---------- connexion ---------- */
  async function loadMe() {
    try { const r = await api('/api/auth/me'); S.me = r.user || null; } catch (e) { S.me = null; }
    if (S.me) { refreshBadges(); loadMyInsc(); loadPremium(); }
    renderTop();
  }
  async function loadMyInsc() {
    try {
      const r = await api('/api/evenements/participants/mine');
      S.myInsc = new Set((r.inscriptions || []).map(i => Number(i.evenement_id)));
    } catch (e) { /* facultatif */ }
  }
  async function refreshBadges() {
    if (!S.me) { S.unreadMsg = 0; S.unreadNotif = 0; paintBadges(); return; }
    try { const r = await api('/api/messages/non-lus'); S.unreadMsg = Number(r.total != null ? r.total : r.non_lus) || 0; } catch (e) { }
    try { const r = await api('/api/notifications?limit=1'); S.unreadNotif = Number(r.non_lues) || 0; } catch (e) { }
    paintBadges();
  }
  function paintBadges() {
    const b = $('#tab-badge-messages'); if (b) { b.hidden = !S.unreadMsg; b.textContent = S.unreadMsg > 99 ? '99+' : S.unreadMsg; }
    const n = $('#notif-badge'); if (n) { n.hidden = !S.unreadNotif; n.textContent = S.unreadNotif > 99 ? '99+' : S.unreadNotif; }
  }

  /* Environnement de test privé (tout sauf diaspoactif.com) : deux comptes de démonstration accessibles en un appui, sans saisie ni code. */
  const isTestEnv = () => /^(localhost|127\.|\[::1\]|192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)|\.local$/i.test(location.hostname);
  /* Comptes de démonstration : définis dans assets/m-test.js (fichier privé, absent du site public) ; sans lui, aucun bouton de test. */
  const testCfg = () => window.MTEST || { mdp: '', comptes: [] };
  function testComptesHtml() {
    if (!testCfg().comptes.length) return '';
    return `<div class="h2" style="margin-top:0">COMPTES DE TEST · SANS CODE</div><div class="lst" style="margin-bottom:10px">${testCfg().comptes.map(c => {
      const actif = S.me && String(S.me.email).toLowerCase() === c.email;
      return `<button type="button" class="li" data-testacc="${esc(c.email)}"><span class="ic">${ic(c.i)}</span><span class="sp"><span class="t">${esc(c.t)}</span><br><span class="d">${esc(c.d)}</span></span>${actif ? '<span class="badge g">Actif</span>' : '<span class="ch">' + ic('chev', 's') + '</span>'}</button>`;
    }).join('')}</div>`;
  }
  function bindTestComptes(root, done) {
    $$('[data-testacc]', root).forEach(b => b.onclick = async () => {
      b.disabled = true; const old = b.innerHTML; b.querySelector('.d').textContent = 'Connexion…';
      try {
        try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (e) { /* pas de session à fermer */ }
        const r = await api('/api/auth/login', { method: 'POST', body: { email: b.dataset.testacc, password: testCfg().mdp } });
        if (!r.user) throw new Error('Connexion de test impossible.');
        S.me = r.user; S.premium = null; if (done) done(true);
        toast('Connecté : ' + (testCfg().comptes.find(c => c.email === b.dataset.testacc) || {}).t); await afterAuthChange(); location.hash = '#/accueil';
      } catch (e) { toast(e.message, true); b.disabled = false; b.innerHTML = old; }
    });
  }
  /* Confirmation d'un nouvel appareil (même règle et mêmes routes que assets/confirmation-appareil.js sur le site) :
     le compte est déjà ouvert ailleurs → Code de Sécurité (DS-ID) du compte ou d'un compte lié, ou code à 6 chiffres envoyé par e-mail.
     Affichée dans la fenêtre de connexion, avec l'habillage de l'appli. Renvoie true si l'appareil est autorisé, false si la personne annule. */
  function confirmerAppareil(rep, sh) {
    return new Promise(resolve => {
      sh.hidden = false;
      const ouvert = (rep.deja_ouvert_sur || []).map(a => esc(a.libelle) + (a.il_y_a_min != null ? ' (actif ' + (a.il_y_a_min < 2 ? 'à l’instant' : a.il_y_a_min < 90 ? 'il y a ' + a.il_y_a_min + ' min' : a.il_y_a_min < 2880 ? 'il y a ' + Math.round(a.il_y_a_min / 60) + ' h' : 'il y a plus de 2 jours') + ')' : '')).join(' · ');
      sh.innerHTML = `<div class="sh" role="dialog" aria-modal="true" aria-label="Confirmer la connexion"><div class="grip"></div><div class="sb">
        <h2 style="margin:4px 0 2px;font-size:20px">Confirmez que c’est bien vous</h2>
        <p class="muted small" style="margin:0 0 ${ouvert ? 6 : 14}px">Ce compte est déjà utilisé sur un autre appareil du même type (téléphone ou ordinateur). Pour votre sécurité, prouvez que vous en êtes le titulaire : une seule fois, cet appareil sera ensuite reconnu pendant 30 jours.</p>
        ${ouvert ? `<p class="small" style="margin:0 0 14px;padding:8px 10px;background:var(--sky-l);border-radius:10px"><b>Déjà connecté sur :</b> ${ouvert}</p>` : ''}
        <div id="ca-notif-box">
          <label class="small muted" for="ca-cn">Code à 3 chiffres affiché sur votre appareil déjà connecté</label>
          <div class="search" style="border-radius:12px;margin:4px 0 8px"><input id="ca-cn" type="text" inputmode="numeric" maxlength="3" autocomplete="one-time-code" placeholder="000" style="letter-spacing:.3em;font-size:20px"></div>
          <p class="muted small" style="margin:0 0 8px">Ouvrez les <b>notifications</b> (la cloche) de ce compte sur l’appareil déjà connecté : un code à 3 chiffres y est affiché, valable 10 minutes. Vous avez 3 essais.</p>
          <button type="button" class="btn out block" id="ca-n-dsid" style="margin-top:4px">Utiliser mon DS-ID à la place</button>
          <button type="button" class="btn out block" id="ca-n-email" style="margin-top:8px">Recevoir un code par e-mail</button>
        </div>
        <div id="ca-dsid-box" hidden>
          <label class="small muted" for="ca-dsid">Votre Code de Sécurité (DS-ID)</label>
          <div class="search" style="border-radius:12px;margin:4px 0 8px"><input id="ca-dsid" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DS-ID de ce compte ou d’un compte lié"></div>
          <p class="muted small" style="margin:0 0 8px">Vous le trouvez dans votre profil, section Confidentialité, sur l’appareil déjà connecté. Vous pouvez aussi saisir celui d’un de vos comptes liés.</p>
          <button type="button" class="btn out block" id="ca-vers-email" style="margin-top:4px">Je n’ai pas mon DS-ID : recevoir un code par e-mail</button>
          <button type="button" class="btn out block" id="ca-d-notif" style="margin-top:8px">Utiliser le code affiché sur mon appareil connecté</button>
        </div>
        <div id="ca-email-box" hidden>
          <label class="small muted" for="ca-code">Code à 6 chiffres reçu par e-mail</label>
          <div class="search" style="border-radius:12px;margin:4px 0 8px"><input id="ca-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"></div>
          <p id="ca-info" class="small" style="color:var(--green);margin:0 0 8px"></p>
          <button type="button" class="btn out block" id="ca-renvoyer" style="margin-top:4px">Renvoyer le code</button>
          <button type="button" class="btn out block" id="ca-vers-dsid" style="margin-top:8px">Utiliser mon DS-ID à la place</button>
          <button type="button" class="btn out block" id="ca-e-notif" style="margin-top:8px">Utiliser le code affiché sur mon appareil connecté</button>
        </div>
        <p id="ca-err" class="small" style="color:var(--red);min-height:20px;margin:8px 2px" role="alert"></p>
        <button type="button" class="btn block" id="ca-ok">Confirmer</button>
        <button type="button" class="btn out block" id="ca-non" style="margin-top:10px">Annuler</button>
      </div></div>`;
      let mode = 'notif';
      const CHAMP = { notif: '#ca-cn', dsid: '#ca-dsid', email: '#ca-code' };
      const err = m => { $('#ca-err').textContent = m || ''; };
      const basculer = m => { mode = m; err(''); $('#ca-notif-box').hidden = m !== 'notif'; $('#ca-dsid-box').hidden = m !== 'dsid'; $('#ca-email-box').hidden = m !== 'email'; const f = $(CHAMP[m]); if (f) f.focus(); };
      const envoyer = async () => {
        err(''); const b1 = $('#ca-vers-email'), b2 = $('#ca-renvoyer'), b3 = $('#ca-n-email'); b1.disabled = true; b2.disabled = true; b3.disabled = true;
        try {
          const r = await api('/api/auth/confirmer-appareil/envoyer-code', { method: 'POST', body: { defi: rep.defi } });
          basculer('email'); $('#ca-info').textContent = 'Un code vient d’être envoyé à ' + (r.email_masque || rep.email_masque || 'votre adresse e-mail') + ' (valable 10 minutes).';
        } catch (e) { err(e.message || 'Envoi impossible.'); }
        finally { b1.disabled = false; b3.disabled = false; setTimeout(() => { b2.disabled = false; }, 20000); }
      };
      $('#ca-vers-email').onclick = envoyer; $('#ca-n-email').onclick = envoyer; $('#ca-renvoyer').onclick = envoyer;
      $('#ca-vers-dsid').onclick = () => basculer('dsid'); $('#ca-n-dsid').onclick = () => basculer('dsid');
      $('#ca-d-notif').onclick = () => basculer('notif'); $('#ca-e-notif').onclick = () => basculer('notif');
      $('#ca-non').onclick = () => resolve(false);
      sh.onclick = e => { if (e.target === sh) resolve(false); };
      $('#ca-ok').onclick = async () => {
        err(''); const saisie = ($(CHAMP[mode]).value || '').trim();
        if (!saisie) { err(mode === 'notif' ? 'Saisissez le code à 3 chiffres affiché sur votre appareil connecté.' : mode === 'dsid' ? 'Saisissez votre Code de Sécurité.' : 'Saisissez le code reçu par e-mail.'); return; }
        const btn = $('#ca-ok'); btn.disabled = true; btn.textContent = 'Vérification…';
        try {
          await api('/api/auth/confirmer-appareil', { method: 'POST', body: { defi: rep.defi, ...(mode === 'notif' ? { code_notif: saisie } : mode === 'dsid' ? { ds_id: saisie } : { code: saisie }) } });
          resolve(true);
        } catch (e) {
          const d = e.data || {};
          err(e.message + (typeof d.essais_restants === 'number' ? ` (${d.essais_restants} essai${d.essais_restants > 1 ? 's' : ''} restant${d.essais_restants > 1 ? 's' : ''})` : ''));
          if (d.bloque || e.status === 429 || e.status === 403 || e.status === 410) { btn.textContent = 'Bloqué'; return; }
          btn.disabled = false; btn.textContent = 'Confirmer';
        }
      };
      setTimeout(() => { const f = $('#ca-cn'); if (f) f.focus(); }, 60);
    });
  }
  function openLogin(reason) {
    return new Promise(resolve => {
      const sh = $('#sheet'); sh.hidden = false;
      sh.innerHTML = `<div class="sh" role="dialog" aria-modal="true" aria-label="Connexion"><div class="grip"></div><div class="sb">
        <h2 style="margin:4px 0 2px;font-size:20px">Connexion</h2>
        <p class="muted small" style="margin:0 0 14px">${esc(reason || 'Connectez-vous avec votre compte Diaspo’Actif.')}</p>
        <form id="lf" novalidate>
          <label class="small muted" for="le">Adresse e-mail</label>
          <div class="search" style="border-radius:12px;margin:4px 0 10px"><input id="le" type="email" autocomplete="username" inputmode="email" autocapitalize="off" placeholder="vous@exemple.com"></div>
          <label class="small muted" for="lp">Mot de passe</label>
          <div class="search" style="border-radius:12px;margin:4px 0 6px"><input id="lp" type="password" autocomplete="current-password" placeholder="••••••••"></div>
          <p id="lerr" class="small" style="color:var(--red);min-height:20px;margin:4px 2px 8px" role="alert"></p>
          <button class="btn block" type="submit" id="lgo">Se connecter</button>
          <button class="btn out block" type="button" id="lno" style="margin-top:10px">Plus tard</button>
        </form></div></div>`;
      const close = ok => { sh.hidden = true; sh.innerHTML = ''; resolve(ok); };
      if (isTestEnv()) { const box = document.createElement('div'); box.innerHTML = testComptesHtml(); sh.querySelector('.sb').insertBefore(box, sh.querySelector('#lf')); bindTestComptes(box, close); }
      sh.onclick = e => { if (e.target === sh) close(false); };
      $('#lno').onclick = () => close(false);
      $('#lf').onsubmit = async ev => {
        ev.preventDefault();
        const email = $('#le').value.trim(), password = $('#lp').value;
        const err = $('#lerr'); err.textContent = '';
        if (!email || !password) { err.textContent = 'Saisissez votre e-mail et votre mot de passe.'; return; }
        const go = $('#lgo'); go.disabled = true; go.textContent = 'Connexion…';
        try {
          let r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
          if (r.confirmation_requise) {
            /* nouvel appareil : confirmation dans l'appli (DS-ID ou code e-mail), puis la connexion est rejouée automatiquement */
            if (!(await confirmerAppareil(r, sh))) { close(false); return; }
            r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
          }
          if (r.user) {
            S.me = r.user; toast('Bienvenue' + (r.user.role === 'utilisateur' && r.user.prenom ? ' ' + r.user.prenom : '') + ' !'); close(true);
            await afterAuthChange();
          } else {
            err.innerHTML = esc(r.message || r.error || 'Connexion impossible.') + ` <a href="login.html?redirect=${encodeURIComponent('/m.html')}" style="color:var(--navy2);font-weight:700;text-decoration:underline">Continuer sur la page de connexion</a>`;
            go.disabled = false; go.textContent = 'Se connecter';
          }
        } catch (e) {
          if (!document.body.contains(err)) { toast(e.message, true); close(false); return; } /* la fenêtre affichait la confirmation d'appareil */
          err.textContent = e.message; go.disabled = false; go.textContent = 'Se connecter';
        }
      };
      setTimeout(() => { const f = $('#le'); if (f) f.focus(); }, 60);
    });
  }
  async function needLogin(reason) { if (S.me) return true; return openLogin(reason); }
  async function afterAuthChange() {
    S.fil = { mode: 'tous', page: 1, pages: 1, posts: [], loaded: false }; S.home.loaded = false;
    S.ev.loaded = false; S.boutiques.loaded = false; S.ann.loaded = false;
    await loadMe(); route(true);
  }
  async function logout() {
    try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (e) { }
    S.me = null; S.unreadMsg = 0; S.unreadNotif = 0; S.myInsc = new Set(); paintBadges();
    toast('Vous êtes déconnecté.'); await afterAuthChange(); location.hash = '#/fil';
  }

  /* ---------- barre du haut + onglets ---------- */
  function renderTop() {
    const top = $('#top');
    const right = S.me
      ? `<button class="ibtn" id="top-switch" aria-label="Changer de compte">${ic('swap')}</button><a class="ibtn" href="#/notifs" aria-label="Notifications">${ic('bell')}<span class="dot" id="notif-badge" hidden></span></a>`
      /* Bouton « Créer un compte » restauré dans le bandeau (2026-10-08, demande explicite) : avait
         disparu de la nouvelle interface téléphone, seule « Connexion » y figurait — à la différence
         du bandeau du site (assets/app.js) qui a toujours les deux côte à côte. */
      : `<div class="top-auth"><a class="pill-cta ghost" href="inscription.html">Créer un compte</a><button class="pill-cta" id="top-login">Connexion</button></div>`;
    const left = S.me ? `<button class="menu-btn" id="top-menu" aria-label="Menu des modules">${ic('menu')}<span>Menu</span></button>` : '';
    top.innerHTML = `${left}<img class="logo" src="assets/logo.svg" alt="" onerror="this.style.display='none'">
      <h1><span class="brand-s">Diaspo’Actif</span><span id="top-title">${esc(TITLES[S.tab] || '')}</span></h1>${right}`;
    const l = $('#top-login'); if (l) l.onclick = () => openLogin();
    const sw = $('#top-switch'); if (sw) sw.onclick = openSwitcher;
    const mn = $('#top-menu'); if (mn) mn.onclick = openMenu;
    paintBadges();
  }
  function renderTabs() {
    const items = [['accueil', 'Accueil', 'home'], ['evenements', 'Événements', 'cal'], ['annuaire', 'Annuaire', 'dir'], ['messages', 'Messages', 'chat'], ['boutiques', 'Boutiques', 'shop'], ['moi', 'Moi', 'user']];
    $('#tabs').innerHTML = items.map(([k, l, i]) => `<button data-tab="${k}" aria-label="${l}" ${S.tab === k ? 'aria-current="page"' : ''} class="${S.tab === k ? 'on' : ''}">${ic(i)}<span>${l}</span>${k === 'messages' ? '<span class="dot" id="tab-badge-messages" hidden></span>' : ''}</button>`).join('');
    $$('#tabs button').forEach(b => b.onclick = () => {
      if (S.tab === b.dataset.tab && !S.pane) { window.scrollTo({ top: 0, behavior: 'smooth' }); refreshTab(b.dataset.tab); }
      else location.hash = '#/' + b.dataset.tab;
    });
    paintBadges();
  }

  /* ---------- routage ---------- */
  function route(force) {
    const h = location.hash.replace(/^#\/?/, '') || 'accueil';
    let [a, b, c] = h.split('/');
    if (a === 'fil') a = 'accueil';
    if (TABS.includes(a)) {
      closePane(true);
      if (S.tab && S.tab !== a) scrollMem[S.tab] = window.scrollY;
      const changed = S.tab !== a || force;
      S.tab = a;
      $$('#view > section').forEach(s => s.hidden = s.id !== 't-' + a);
      renderTop(); renderTabs();
      if (changed) renderTab(a);
      window.scrollTo(0, scrollMem[a] || 0);
    } else {
      openPane(a, b, c);
    }
  }
  function renderTab(t) {
    ({ accueil: viewAccueil, evenements: viewEvents, annuaire: viewAnnuaire, messages: viewMessages, boutiques: viewBoutiques, moi: viewMoi })[t]();
  }
  function refreshTab(t) {
    if (t === 'accueil') { S.fil = { mode: S.fil.mode, page: 1, pages: 1, posts: [], loaded: false }; S.home.loaded = false; }
    if (t === 'evenements') S.ev.loaded = false;
    if (t === 'boutiques') S.boutiques.loaded = false;
    if (t === 'annuaire') S.ann.loaded = false;
    renderTab(t);
  }

  /* ============================================================
     FIL
     ============================================================ */
  const FIL_MODES = [['tous', 'Pour vous'], ['suivis', 'Mes abonnements'], ['populaires', 'Populaires'], ['organisations', 'Organisations']];
  function viewFil() {
    const el = $('#home-feed');
    el.innerHTML = `<div class="chips" role="tablist">${FIL_MODES.map(([k, l]) => `<button class="chip ${S.fil.mode === k ? 'on' : ''}" data-mode="${k}" role="tab" aria-selected="${S.fil.mode === k}">${l}</button>`).join('')}</div><div id="fil-list"></div><div id="fil-more"></div>`;
    $$('.chip', el).forEach(c => c.onclick = async () => {
      if (c.dataset.mode === 'suivis' && !(await needLogin('Connectez-vous pour voir les publications de vos abonnements.'))) return;
      S.fil = { mode: c.dataset.mode, page: 1, pages: 1, posts: [], loaded: false }; viewFil();
    });
    if (!S.fil.loaded) loadFil(true); else paintFil();
  }
  async function loadFil(first) {
    const list = $('#fil-list');
    if (first && list) list.innerHTML = '<div class="sk skc"></div><div class="sk skc"></div>';
    try {
      const r = await api(`/api/fil?mode=${S.fil.mode}&page=${S.fil.page}&limit=10`);
      S.fil.posts = S.fil.posts.concat(r.posts || []); S.fil.pages = r.pages || 1; S.fil.loaded = true; S.fil.conseil = r.conseil;
      paintFil();
    } catch (e) {
      if (list) list.innerHTML = `<div class="empty"><b>Impossible de charger le fil</b>${esc(e.message)}<br><br><button class="btn sm" id="retry">Réessayer</button></div>`;
      const b = $('#retry'); if (b) b.onclick = () => loadFil(true);
    }
  }
  function postHtml(p) {
    if (p.sous_type === 'vitrine' || p.type === 'carte_vitrine') {
      return `<a class="card pad row" href="profil.html?id=${encodeURIComponent(p.owner_user_id)}&vitrine=1" style="gap:12px"><div class="shop"><div class="lg" style="width:48px;height:48px">${esc(initials(p.initiative_nom || p.titre))}</div></div><div class="sp"><div class="small muted">Boutique à découvrir</div><div class="nm" style="font-weight:700">${esc(p.initiative_nom || p.titre)}</div><div class="small muted">${esc([p.ville, p.pays].filter(Boolean).join(', '))}</div></div>${ic('chev')}</a>`;
    }
    if (p.sous_type && !p.auteur_nom && !p.corps) return '';
    const orig = p.original_post;
    const src = orig || p;
    const name = p.auteur_nom || 'Diaspo’Actif';
    const photo = p.auteur_profil && p.auteur_profil.photo_url;
    const titre = md(strip(src.titre || src.article_titre || ''));
    let corps = md(strip(src.corps != null ? src.corps : (src.contenu || '')));
    if (titre && corps.indexOf(titre) === 0) corps = corps.slice(titre.length).trim();
    let items = [];
    try { items = JSON.parse(src.medias || '[]'); } catch (e) { items = []; }
    if (src.media_url) items.unshift({ type: src.media_type || 'image', url: src.media_url });
    const imgs = items.filter(m => m.type === 'image' || (!m.type && /\.(jpe?g|png|gif|webp)/i.test(m.url || '')));
    const vid = items.find(m => m.type === 'video' || /\.(mp4|webm)/i.test(m.url || ''));
    let media = '';
    if (vid) media = videoBlock(vid.url);
    else if (imgs.length) media = mediaBlock(imgs[0].url, { more: imgs.length > 1 ? imgs.length - 1 : 0 });
    const promo = p.evenement_promo || null;
    const cr = src.compte_rendu || p.compte_rendu;
    let extra = '';
    if (promo && promo.id) extra = `<a class="promo row" href="#/evenement/${promo.id}"><div class="sp"><div class="small muted">Événement</div><b>${esc(promo.titre || '')}</b><div class="small muted">${esc(dateLong(promo.date_evt) || '')}</div></div>${ic('chev')}</a>`;
    else if (cr && cr.titre && cr.evenement_id) {
      /* Compte-rendu publié dans le fil (2026-10-08) : l'affiche de l'événement en tête (si la publication n'a pas de média) et une carte
         qui ouvre le compte-rendu complet — avant, simple titre sans lien : impossible de le lire depuis le fil sur téléphone. */
      if (!media && cr.image) media = mediaBlock(cr.image, { alt: cr.evenement_titre || cr.titre });
      extra = `<a class="promo row" href="#/cr/${esc(cr.evenement_id)}"><div class="sp"><div class="small muted">Compte-rendu${cr.evenement_titre ? ' · ' + esc(cr.evenement_titre) : ''}</div><b>${esc(cr.titre)}</b><div class="small muted">Lire le compte-rendu complet</div></div>${ic('chev')}</a>`;
    }
    else if (cr && cr.titre) extra = `<div class="promo"><div class="small muted">Compte-rendu</div><b>${esc(cr.titre)}</b></div>`;
    const liked = !!p.user_a_aime, nLike = (p.reactions && p.reactions.like) || 0;
    return `<article class="card post" data-id="${p.id}">
      <div class="head" ${p.auteur_id ? `data-prof="${esc(p.auteur_id)}" role="link" tabindex="0"` : ''}><div class="av">${photo ? `<img src="${attrUrl(photo)}" alt="" loading="lazy" onerror="this.remove()">` : esc(initials(name))}</div>
        <div class="sp"><div class="who ell">${esc(name)}</div><div class="when">${esc(ago(p.created_at))}${p.categorie ? ' · ' + esc(p.categorie) : ''}</div></div></div>
      ${orig ? `<div class="txt small muted" style="padding-bottom:0">${ic('share', 's')} A republié ${esc(orig.auteur_nom || '')}</div>` : ''}
      ${p.repost_commentaire ? `<div class="txt">${esc(strip(p.repost_commentaire))}</div>` : ''}
      <div class="txt">${titre ? `<p class="ttl">${esc(titre)}</p>` : ''}${corps ? `<div class="clamp" data-clamp>${linkify(corps)}</div><button class="lnk" data-more hidden>Voir la suite</button>` : ''}</div>
      ${media}${extra}
      <div class="acts">
        <button data-act="like" class="${liked ? 'liked' : ''}" aria-pressed="${liked}" aria-label="J’aime">${ic('heart')}<span>${nLike || ''}</span></button>
        <button data-act="comment" aria-label="Commentaires">${ic('comment')}<span>${p.nb_commentaires || ''}</span></button>
        <button data-act="share" aria-label="Partager">${ic('share')}</button>
      </div></article>`;
  }
  function paintFil() {
    const list = $('#fil-list'), more = $('#fil-more'); if (!list) return;
    const html = S.fil.posts.filter(p => p.type !== 'compte_rendu' && !p.compte_rendu).map(p => actuVerte(postHtml(p))).join('');
    if (!html) {
      list.innerHTML = `<div class="empty"><div class="ei">${ic('fil', 'l')}</div><b>${S.fil.mode === 'suivis' ? 'Rien à afficher pour l’instant' : 'Aucune publication'}</b>${esc(S.fil.conseil || 'Revenez bientôt : la communauté publie chaque jour.')}</div>`;
      more.innerHTML = ''; return;
    }
    list.innerHTML = html;
    more.innerHTML = S.fil.page < S.fil.pages ? `<button class="btn out block" id="fil-next">Voir plus de publications</button>` : '';
    const n = $('#fil-next'); if (n) n.onclick = async () => { n.disabled = true; n.textContent = 'Chargement…'; S.fil.page++; await loadFil(false); };
    $$('[data-clamp]', list).forEach(c => { if (c.scrollHeight > c.clientHeight + 2) { const b = c.parentNode.querySelector('[data-more]'); if (b) b.hidden = false; } });
  }
  document.addEventListener('click', async e => {
    const more = e.target.closest('[data-more]');
    if (more) {
      /* « Voir la suite » ⇄ « Replier » (2026-10-08, demande explicite) : une fois dépliée, l'actualité se replie d'un appui et la page remonte en haut de la carte,
         pour ne pas avoir à faire défiler pour redescendre. */
      const c = more.parentNode.querySelector('[data-clamp]'), carte = more.closest('.post');
      if (c.dataset.ouvert !== '1') { c.dataset.ouvert = '1'; c.style.webkitLineClamp = 'unset'; c.style.display = 'block'; more.textContent = 'Replier ▲'; more.setAttribute('aria-expanded', 'true'); }
      else {
        c.dataset.ouvert = ''; c.style.webkitLineClamp = ''; c.style.display = ''; more.textContent = 'Voir la suite'; more.setAttribute('aria-expanded', 'false');
        if (carte && carte.getBoundingClientRect().top < 64) carte.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      return;
    }
    const z = e.target.closest('[data-zoom]'); if (z) { zoom(z.dataset.zoom); return; }
    const a = e.target.closest('.post [data-act]'); if (!a) return;
    const card = a.closest('.post'), id = card.dataset.id, post = S.fil.posts.find(p => String(p.id) === String(id)) || postCache[id];
    if (a.dataset.act === 'like') {
      if (!(await needLogin('Connectez-vous pour aimer une publication.'))) return;
      if (a.classList.contains('liked')) return; // l'API ne propose que l'ajout
      try {
        const r = await api(`/api/fil/${id}/react`, { method: 'POST', body: { type: 'like' } });
        a.classList.add('liked'); a.setAttribute('aria-pressed', 'true');
        const n = (r.reactions && r.reactions.like) || 1; a.querySelector('span').textContent = n;
        if (post) { post.user_a_aime = true; post.reactions = r.reactions; }
      } catch (er) { toast(er.message, true); }
    } else if (a.dataset.act === 'comment') {
      openComments(id, post, a);
    } else if (a.dataset.act === 'share') {
      if (post && post.visibilite && post.visibilite !== 'public') return toast('Cette publication n’est pas publique : elle ne peut pas être partagée.', true);
      partagerLien(location.origin + '/fil-actualite.html?post=' + encodeURIComponent(id) + '&r=' + jetonPartage(), strip((post && (post.titre || post.corps)) || 'Publication sur Diaspo’Actif').slice(0, 80));
    }
  });

  async function openComments(id, post, btn) {
    const sh = $('#sheet'); sh.hidden = false;
    sh.innerHTML = `<div class="sh" role="dialog" aria-modal="true" aria-label="Commentaires"><div class="grip"></div>
      <h2 style="margin:0 0 6px;font-size:17px">Commentaires</h2><div class="sb" id="cmlist"><div class="sk" style="height:60px"></div></div>
      <form class="composer" id="cmf" style="padding:10px 0 0;border:none;background:none"><textarea id="cmt" rows="1" placeholder="Écrire un commentaire…" aria-label="Votre commentaire"></textarea><button class="send" aria-label="Envoyer" disabled>${ic('send')}</button></form></div>`;
    const close = () => { sh.hidden = true; sh.innerHTML = ''; };
    sh.onclick = e => { if (e.target === sh) close(); };
    const load = async (mine) => {
      try {
        const r = await api(`/api/fil/${id}/commentaires`);
        const l = r.commentaires || [];
        /* Les comptes de démonstration sont masqués des listes publiques par la plateforme : on affiche quand même le commentaire qu'on vient d'écrire. */
        if (mine && !l.some(c => c.contenu === mine)) l.push({ auteur_nom: S.me.nom_affichage || [S.me.prenom, S.me.nom].filter(Boolean).join(' '), photo_url: S.me.photo_url, contenu: mine, created_at: new Date().toISOString() });
        $('#cmlist').innerHTML = l.length ? l.map(c => `<div class="cm"><div class="av">${c.photo_url ? `<img src="${attrUrl(c.photo_url)}" alt="" onerror="this.remove()">` : esc(initials(c.auteur_nom))}</div><div class="sp"><div class="nm">${esc(c.auteur_nom)} <span class="muted small" style="font-weight:400">· ${esc(ago(c.created_at))}</span></div><p>${esc(c.contenu)}</p></div></div>`).join('')
          : '<div class="empty" style="padding:22px"><b>Aucun commentaire</b>Soyez le premier à réagir.</div>';
        if (btn) btn.querySelector('span').textContent = l.length || '';
        if (post) post.nb_commentaires = l.length;
      } catch (e) { $('#cmlist').innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
    };
    load();
    const ta = $('#cmt'), send = $('#cmf .send');
    ta.oninput = () => { send.disabled = !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
    $('#cmf').onsubmit = async ev => {
      ev.preventDefault(); const txt = ta.value.trim(); if (!txt) return;
      if (!S.me) { close(); if (await needLogin('Connectez-vous pour commenter.')) openComments(id, post, btn); return; }
      send.disabled = true;
      try { await api(`/api/fil/${id}/commentaires`, { method: 'POST', body: { contenu: txt } }); ta.value = ''; ta.style.height = 'auto'; await load(txt); const l = $('#cmlist'); l.scrollTop = l.scrollHeight; }
      catch (e) { toast(e.message, true); send.disabled = false; }
    };
  }

  /* ============================================================
     ÉVÉNEMENTS
     ============================================================ */
  function isTermine(e) {
    if (!e) return false; if (e.est_termine != null) return !!e.est_termine;
    const d = String(e.date_fin || e.date_evt || '').slice(0, 10); return !!d && d < new Date().toISOString().slice(0, 10);
  }
  function evtCover(e) { return e.image_couverture || e.image_url || ''; }
  /* ---------- filtres communs (événements, boutiques) : même fenêtre « Filtres » que l'annuaire ---------- */
  const uniqCap = arr => { const m = new Map(); arr.forEach(v => { const k = normTxt(v); if (k && !m.has(k)) { const s = String(v).trim(); m.set(k, s.charAt(0).toUpperCase() + s.slice(1)); } }); return [...m.values()].sort((a, b) => a.localeCompare(b, 'fr')); };
  const selOpts = arr => uniqCap(arr).map(v => [v, v]);
  function filterPills(defs, st) {
    return defs.filter(d => st[d.k]).map(d => { const lab = d.fmt ? d.fmt(st[d.k]) : st[d.k]; return `<button class="chip on" data-fclear="${d.k}" aria-label="Retirer le filtre ${esc(d.label)}">${esc(d.court || d.label)} : ${esc(lab)} ✕</button>`; }).join('');
  }
  function filterBar(defs, st, id) {
    const n = defs.filter(d => st[d.k]).length;
    return `<div class="ann-bar"><button class="btn out sm" id="${id}-fl">${ic('search', 's')} Filtres${n ? ' (' + n + ')' : ''}</button><div class="chips">${filterPills(defs, st)}</div></div>`;
  }
  function bindFilterBar(root, defs, st, id, redraw) {
    $('#' + id + '-fl', root).onclick = () => openFilterSheet(defs, st, redraw);
    $$('[data-fclear]', root).forEach(c => c.onclick = () => { st[c.dataset.fclear] = ''; redraw(); });
  }
  function openFilterSheet(defs, st, redraw) {
    const close = openSheet('<div class="sk" style="height:60px"></div>'); const sh = $('#sheet');
    const field = d => d.type === 'text'
      ? `<label class="fl" for="fx-${d.k}">${esc(d.label)}</label><input class="fi" id="fx-${d.k}" placeholder="${esc(d.ph || '')}" value="${esc(st[d.k] || '')}" ${d.list ? `list="fxl-${d.k}"` : ''} autocomplete="off">${d.list ? `<datalist id="fxl-${d.k}">${d.list.slice(0, 400).map(v => `<option value="${esc(v)}">`).join('')}</datalist>` : ''}`
      : d.type === 'date'
        ? `<label class="fl" for="fx-${d.k}">${esc(d.label)}</label><input class="fi" type="date" id="fx-${d.k}" value="${esc(st[d.k] || '')}">`
        : `<label class="fl" for="fx-${d.k}">${esc(d.label)}</label><select class="fi" id="fx-${d.k}"><option value="">${esc(d.tous || 'Tous')}</option>${d.opts.map(([v, t]) => `<option value="${esc(v)}" ${normTxt(v) === normTxt(st[d.k]) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    sh.querySelector('.sb').innerHTML = `<h2 style="margin:2px 0 4px;font-size:19px">Filtres</h2><form id="fx-form" novalidate>${defs.map(field).join('')}<div class="row" style="gap:10px;margin-top:16px"><button type="button" class="btn out sp" id="fx-reset">Réinitialiser</button><button type="submit" class="btn sp">Appliquer</button></div></form>`;
    $('#fx-reset').onclick = () => { defs.forEach(d => { st[d.k] = ''; }); close(); redraw(); };
    $('#fx-form').onsubmit = ev => { ev.preventDefault(); defs.forEach(d => { st[d.k] = ($('#fx-' + d.k).value || '').trim(); }); close(); redraw(); };
  }

  /* ---------- filtres des événements (ceux de la page Événements du site) ---------- */
  const EV_FORMES = [['evenement', 'Événement'], ['forum', 'Forum'], ['atelier', 'Atelier'], ['webinaire', 'Webinaire'], ['conference', 'Conférence'], ['gala', 'Gala'], ['marche', 'Marché / Foire'], ['networking', 'Networking'], ['debat', 'Débat'], ['concours', 'Concours'], ['trophee_diaspora', 'Trophée diaspora'], ['autre', 'Autre']];
  const EV_DOMAINES = [['Entrepreneuriat', 'Entrepreneuriat'], ['Formation', 'Formation'], ['Culture', 'Culture'], ['Sante', 'Santé'], ['Agriculture', 'Agriculture'], ['Technologie', 'Technologie'], ['Sport', 'Sport'], ['Action Sociale', 'Action sociale'], ['Business', 'Business'], ['Diaspora', 'Diaspora'], ['Gastronomie', 'Gastronomie'], ['Economique', 'Économique'], ['Politique', 'Politique'], ['Panafricanisme', 'Panafricanisme'], ['Autre', 'Autre']];
  const EV_PART = [['1', 'Gratuit'], ['partiel', 'Partiellement payant'], ['0', 'Payant']];
  const evPart = e => e.type_participation === 'partiellement_payant' ? 'partiel' : ((e.prix_min > 0 || e.type_participation === 'payant') ? '0' : '1');
  function evFilterDefs() {
    const it = S.ev.items, lab = (liste, v) => (liste.find(x => normTxt(x[0]) === normTxt(v)) || [0, v])[1];
    const extra = (liste, vals) => [...liste, ...uniqCap(vals).filter(v => !liste.some(x => normTxt(x[0]) === normTxt(v))).map(v => [v, v])];
    const origines = selOpts(it.flatMap(e => [e.origine, e.origine2]));
    const defs = [
      { k: 'pays', label: 'Pays', type: 'select', tous: 'Tous les pays', opts: selOpts(it.flatMap(e => [e.pays, e.origine, e.origine2])) },
      { k: 'ville', label: 'Ville', type: 'text', ph: 'Ex : Paris, Abidjan…', list: uniqCap(it.map(e => e.ville)) },
      { k: 'date', label: 'À partir du', court: 'Dès le', type: 'date', fmt: v => { const p = parseDay(v); return p ? p.d + ' ' + MOIS[p.m - 1] : v; } },
      { k: 'domaine', label: 'Domaine de l’événement', court: 'Domaine', type: 'select', tous: 'Tous les domaines', opts: extra(EV_DOMAINES, it.map(e => e.domaine)), fmt: v => lab(EV_DOMAINES, v) },
      { k: 'type', label: 'Forme de l’événement', court: 'Forme', type: 'select', tous: 'Toutes les formes', opts: extra(EV_FORMES, it.map(e => e.type_evt)), fmt: v => lab(EV_FORMES, v) },
      { k: 'part', label: 'Gratuit ou payant', court: 'Participation', type: 'select', tous: 'Gratuit ou payant', opts: EV_PART, fmt: v => lab(EV_PART, v) }
    ];
    if (origines.length) defs.push({ k: 'origine', label: 'Origine (diaspora ciblée)', court: 'Origine', type: 'select', tous: 'Toutes les origines', opts: origines });
    return defs;
  }
  function evMatch(e) {
    const F = S.ev.f, same = (a, b) => a && normTxt(a) === normTxt(b);
    if (F.pays && ![e.pays, e.origine, e.origine2].some(v => same(v, F.pays))) return false;
    if (F.ville && !normTxt(e.ville).includes(normTxt(F.ville))) return false;
    if (F.date && !(e.date_evt && String(e.date_fin || e.date_evt).slice(0, 10) >= F.date)) return false;
    if (F.domaine && !same(e.domaine, F.domaine)) return false;
    if (F.type && !same(e.type_evt, F.type)) return false;
    if (F.part && evPart(e) !== F.part) return false;
    if (F.origine && ![e.origine, e.origine2].some(v => same(v, F.origine))) return false;
    return true;
  }

  /* ---------- filtres des boutiques (mêmes critères que l'annuaire) ---------- */
  function btFilterDefs() {
    const it = S.boutiques.items, orig = selOpts(it.flatMap(v => [v.origine1, v.origine2]));
    const defs = [
      { k: 'pays', label: 'Pays', type: 'select', tous: 'Tous les pays', opts: selOpts(it.flatMap(v => [v.pays, v.vitrine_pays])) },
      { k: 'ville', label: 'Ville', type: 'text', ph: 'Ex : Lyon, Dakar…', list: uniqCap(it.flatMap(v => [v.ville, v.vitrine_ville])) },
      { k: 'type', label: 'Type d’initiative', court: 'Type', type: 'select', tous: 'Tous les types', opts: selOpts(it.map(v => v.type)) },
      { k: 'domaine', label: 'Domaine d’activité', court: 'Domaine', type: 'select', tous: 'Tous les domaines', opts: selOpts(it.map(v => v.domaine)) }
    ];
    if (orig.length) defs.push({ k: 'origine', label: 'Pays d’origine', court: 'Origine', type: 'select', tous: 'Tous les pays d’origine', opts: orig });
    return defs;
  }
  function btMatch(v) {
    const F = S.boutiques.f, same = (a, b) => a && normTxt(a) === normTxt(b);
    if (F.pays && ![v.pays, v.vitrine_pays].some(x => same(x, F.pays))) return false;
    if (F.ville && ![v.ville, v.vitrine_ville].some(x => normTxt(x).includes(normTxt(F.ville)))) return false;
    if (F.type && !same(v.type, F.type)) return false;
    if (F.domaine && !same(v.domaine, F.domaine)) return false;
    if (F.origine && ![v.origine1, v.origine2].some(x => same(x, F.origine))) return false;
    return true;
  }

  function viewEvents() {
    const el = $('#t-evenements');
    el.innerHTML = `<div class="search">${ic('search', 's')}<input id="evq" type="search" placeholder="Rechercher un événement…" aria-label="Rechercher un événement" value="${esc(S.ev.q)}"></div>
      <div class="chips">${[['avenir', 'À venir'], ['passes', 'Terminés'], ['gratuit', 'Gratuits'], ['mes', 'Mes inscriptions']].map(([k, l]) => `<button class="chip ${S.ev.filtre === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <div id="ev-bar"></div><div class="small muted" id="ev-count" style="margin:0 4px 10px"></div><div id="ev-list"></div>`;
    $$('.chip[data-f]', el).forEach(c => c.onclick = async () => {
      if (c.dataset.f === 'mes' && !(await needLogin('Connectez-vous pour retrouver vos inscriptions.'))) return;
      S.ev.filtre = c.dataset.f; viewEvents();
    });
    let t; $('#evq').oninput = e => { clearTimeout(t); t = setTimeout(() => { S.ev.q = e.target.value.trim(); paintEvents(); }, 200); };
    if (!S.ev.loaded) loadEvents(); else paintEvents();
  }
  function drawEvBar() {
    const bar = $('#ev-bar'); if (!bar) return; S.ev.f = S.ev.f || {}; const defs = evFilterDefs();
    bar.innerHTML = filterBar(defs, S.ev.f, 'ev'); bindFilterBar(bar, defs, S.ev.f, 'ev', () => { drawEvBar(); paintEvents(); });
  }
  async function loadEvents() {
    const l = $('#ev-list'); l.innerHTML = '<div class="sk skc"></div><div class="sk skc"></div>';
    try {
      const r = await api('/api/evenements'); S.ev.items = r.evenements || []; S.ev.loaded = true;
      if (S.me) await loadMyInsc();
      paintEvents();
    } catch (e) { l.innerHTML = `<div class="empty"><b>Impossible de charger les événements</b>${esc(e.message)}<br><br><button class="btn sm" id="retry">Réessayer</button></div>`; $('#retry').onclick = loadEvents; }
  }
  function paintEvents() {
    const l = $('#ev-list'); if (!l) return;
    S.ev.f = S.ev.f || {}; drawEvBar();
    const q = S.ev.q.toLowerCase();
    let a = S.ev.items.filter(e => evMatch(e) && (!q || [e.titre, e.ville, e.pays, e.lieu, e.organisateur_nom].join(' ').toLowerCase().includes(q)));
    const f = S.ev.filtre;
    if (f === 'avenir') a = a.filter(e => !e.est_termine);
    else if (f === 'passes') a = a.filter(e => e.est_termine).reverse();
    else if (f === 'gratuit') a = a.filter(e => !e.est_termine && (e.type_participation || 'gratuit') === 'gratuit' && !(e.prix_min > 0));
    else if (f === 'mes') a = a.filter(e => S.myInsc.has(Number(e.id)));
    $('#ev-count').textContent = a.length ? `${a.length} événement${a.length > 1 ? 's' : ''}` : '';
    if (!a.length) { l.innerHTML = `<div class="empty"><div class="ei">${ic('cal', 'l')}</div><b>Aucun événement</b>${f === 'mes' ? 'Vous n’êtes inscrit à aucun événement pour le moment.' : 'Essayez un autre filtre ou une autre recherche.'}</div>`; return; }
    l.innerHTML = a.map(evtCard).join('');
  }
  function evtCard(e) {
    const p = parseDay(e.date_evt); const cov = evtCover(e);
    const paid = e.prix_min > 0 || e.type_participation === 'payant';
    const part = e.type_participation === 'partiellement_payant' ? 'Partiellement payant' : paid ? 'Payant' : 'Gratuit';
    const inscrit = S.myInsc.has(Number(e.id));
    return `<a class="card ev" href="#/evenement/${e.id}" style="display:block">
      <div class="cov">${(e.visibilite || 'public') === 'public' ? `<button type="button" class="ev-share" data-share-ev="${e.id}" data-share-titre="${esc(e.titre)}" aria-label="Partager cet événement">${ic('share', 's')}</button>` : ''}${p ? `<div class="dt"><b>${p.d}</b><span>${MOIS[p.m - 1]}</span></div>` : ''}${cov ? mediaBlock(cov, { alt: e.titre }) : `<div class="media" style="min-height:78px;background:linear-gradient(135deg,var(--navy),var(--navy2))"></div>`}</div>
      <div class="bd"><h3 class="tt">${esc(e.titre)}</h3>
        <div class="meta">${ic('clock', 's')}<span>${esc(dateLong(e.date_evt))}${e.heure_debut ? ' · ' + esc(String(e.heure_debut).slice(0, 5)) : ''}</span></div>
        <div class="meta">${ic('pin', 's')}<span class="ell">${esc([e.ville, e.pays].filter(Boolean).join(', ') || e.lieu || 'En ligne')}</span></div>
        <div class="tags"><span class="badge ${paid ? 'o' : 'g'}">${part}</span>${e.est_termine ? '<span class="badge">Terminé</span>' : ''}${e.cr_statut === 'publie' ? `<span class="badge o">${ic('doc', 's')} Compte-rendu</span>` : ''}${inscrit ? `<span class="badge g">${ic('check', 's')} Inscrit</span>` : ''}${e.nb_participants ? `<span class="badge">${e.nb_participants} inscrit${e.nb_participants > 1 ? 's' : ''}</span>` : ''}</div></div></a>`;
  }

  async function paneEvent(id) {
    setPane('Événement', '<div class="sk skc"></div>');
    let r;
    try { r = await api('/api/evenements/' + encodeURIComponent(id)); } catch (e) { return setPane('Événement', `<div class="empty"><b>Événement introuvable</b>${esc(e.message)}</div>`); }
    const e = r.evenement || r;
    const cov = evtCover(e);
    const ev = S.ev.items.find(x => String(x.id) === String(id)) || e;
    const closed = ev.est_termine || !e.inscription_ouverte;
    const inscrit = S.myInsc.has(Number(e.id));
    const paid = ev.prix_min > 0 || e.type_participation === 'payant';
    const desc = strip(e.description || '');
    const hasFiche = ev.fiche_id && ev.fiche_slug;
    const termine = isTermine(ev) || isTermine(e);
    let crDispo = ev.cr_statut === 'publie';
    if (termine && !crDispo) { try { const c = await api(`/api/evenements/${encodeURIComponent(id)}/compte-rendu`); crDispo = !!c.a_compte_rendu; } catch (er) { /* pas de compte-rendu */ } }
    let cta;
    if (termine) cta = crDispo ? `<a class="btn block" href="#/cr/${esc(id)}">${ic('doc', 's')} Lire le compte-rendu</a>` : `<button class="btn block" disabled>Événement terminé · pas de compte-rendu</button>`;
    else if (hasFiche) cta = `<a class="btn block" href="inscription-publique.html?slug=${encodeURIComponent(ev.fiche_slug)}">S’inscrire à l’événement</a>`;
    else if (e.lien_inscription && !inscrit) cta = `<a class="btn block" href="${attrUrl(e.lien_inscription)}" target="_blank" rel="noopener">S’inscrire ${ic('out', 's')}</a>`;
    else if (inscrit) cta = `<button class="btn out block" id="ev-quit">${ic('check', 's')} Je suis inscrit · Annuler</button>`;
    else if (!e.inscription_ouverte) cta = `<button class="btn block" disabled>Inscriptions fermées</button>`;
    else cta = `<button class="btn block" id="ev-join">Je m’inscris</button>`;
    const html = `${cov ? mediaBlock(cov, { alt: e.titre }) : ''}
      <div class="card" style="margin-top:12px"><div class="pad"><h2 style="margin:0 0 8px;font-size:21px;line-height:1.25">${esc(e.titre)}</h2>
        <div class="meta">${ic('cal', 's')}<span>${esc(dateLong(e.date_evt))}${e.date_fin && e.date_fin !== e.date_evt ? ' → ' + esc(dateLong(e.date_fin)) : ''}</span></div>
        ${e.heure_debut ? `<div class="meta">${ic('clock', 's')}<span>${esc(String(e.heure_debut).slice(0, 5))}${e.heure_fin ? ' – ' + esc(String(e.heure_fin).slice(0, 5)) : ''}</span></div>` : ''}
        <div class="meta">${ic('pin', 's')}<span>${esc([e.lieu, e.ville, e.pays].filter(Boolean).join(', ') || 'En ligne')}</span></div>
        <div class="tags"><span class="badge ${paid ? 'o' : 'g'}">${paid ? (ev.prix_min > 0 ? 'Dès ' + esc(ev.prix_min) + ' €' : 'Payant') : 'Gratuit'}</span>${e.type_evt ? `<span class="badge">${esc(e.type_evt)}</span>` : ''}${e.domaine ? `<span class="badge">${esc(e.domaine)}</span>` : ''}${r.nb_participants ? `<span class="badge">${r.nb_participants} inscrit${r.nb_participants > 1 ? 's' : ''}</span>` : ''}</div>
        ${e.organisateur_nom || ev.organisateur_nom ? `<p class="small muted" style="margin:12px 0 0">Organisé par <b style="color:var(--text)" ${e.owner_user_id ? `data-prof="${esc(e.owner_user_id)}" role="link"` : ''}>${esc(ev.organisateur_nom || e.organisateur_nom)}</b></p>` : ''}</div></div>
      ${desc ? `<div class="card"><div class="pad rich" style="white-space:pre-line">${esc(desc)}</div></div>` : ''}
      ${e.lien_visio ? `<a class="btn out block" style="margin-bottom:12px" href="${attrUrl(e.lien_visio)}" target="_blank" rel="noopener">Rejoindre en visio ${ic('out', 's')}</a>` : ''}`;
    setPane(e.titre, html, cta);
    /* Lien public (lisible sans compte) : seulement pour un événement public ; &via = qui partage (aperçu « X vous invite »). */
    if ((e.visibilite || 'public') === 'public') paneShare(location.origin + '/evenements.html?evt=' + encodeURIComponent(id) + (S.me ? '&via=' + S.me.id : '') + '&r=' + jetonPartage(), e.titre);
    const j = $('#ev-join'); if (j) j.onclick = async () => {
      if (!(await needLogin('Connectez-vous pour vous inscrire à cet événement.'))) return paneEvent(id);
      j.disabled = true; j.textContent = 'Inscription…';
      try { await api(`/api/evenements/${id}/rejoindre`, { method: 'POST', body: { nb_personnes: 1 } }); S.myInsc.add(Number(id)); toast('Inscription confirmée ✓'); S.ev.loaded = false; paneEvent(id); }
      catch (er) { toast(er.message, true); j.disabled = false; j.textContent = 'Je m’inscris'; }
    };
    const q = $('#ev-quit'); if (q) q.onclick = async () => {
      if (!confirm('Annuler votre inscription à cet événement ?')) return;
      try { await api(`/api/evenements/${id}/quitter`, { method: 'DELETE' }); S.myInsc.delete(Number(id)); toast('Inscription annulée'); S.ev.loaded = false; paneEvent(id); }
      catch (er) { toast(er.message, true); }
    };
  }

  /* ============================================================
     ANNUAIRE — initiatives, membres, collectivités (route /api/annuaire/recherche)
     ============================================================ */
  const ANN_TYPES = [['', 'Tous'], ['Initiative', 'Initiatives'], ['Utilisateurs', 'Membres'], ['Collectivité', 'Collectivités']];
  /* Mêmes types que le filtre « Type d'organisme » de l'annuaire du site. */
  const ANN_TYPE_OPTS = [['', 'Tous les types'], ['Utilisateurs', 'Membres'], ['Initiative', 'Initiatives (tous types)'], ['Association', 'Association'], ['Entreprise', 'Entreprise'], ['Institution', 'Institution'], ['Collectivité', 'Collectivité'], ['ONG', 'ONG'], ['Coopérative', 'Coopérative'], ['Média', 'Média'], ['Fondation', 'Fondation'], ['Particulier', 'Particulier'], ['Autre', 'Autre']];
  const normTxt = s => String(s == null ? '' : s).toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const annAll = r => [
    ...(r.initiatives || []).map(x => ({ k: 'i', rang: x._rang || 0, x })),
    ...(r.utilisateurs || []).map(x => ({ k: 'u', rang: x._rang || 0, x })),
    ...(r.organismes || []).map(x => ({ k: 'o', rang: x._rang || 0, x }))
  ].sort((a, b) => a.rang - b.rang);
  const domLabel = cle => { const d = (window.DOMAINES_ACTIVITE || []).find(z => z[0] === cle); return d ? d[2] : String(cle || '').replace(/_/g, ' '); };
  const annOrigines = x => [x.origine1, x.origine2, x.pays_origine, x.owner_origine1, x.owner_origine2, x.nationalite1, x.nationalite2, x.pays_origine_institution].filter(Boolean);
  /* Pays, ville, domaine et origine se filtrent ici (insensibles à la casse et aux accents) : le serveur compare à l'identique, « France » ≠ « france ». */
  function annMatch(it) {
    const x = it.x, A = S.ann;
    if (A.pays && normTxt(x.pays) !== normTxt(A.pays)) return false;
    if (A.ville && !normTxt(x.ville).includes(normTxt(A.ville))) return false;
    if (A.domaine && x.domaine_principal !== A.domaine) return false;
    if (A.origine && !annOrigines(x).some(v => normTxt(v).includes(normTxt(A.origine)))) return false;
    return true;
  }
  const annNbFiltres = () => ['pays', 'ville', 'domaine', 'origine'].filter(k => S.ann[k]).length + (S.ann.type && !ANN_TYPES.some(t => t[0] === S.ann.type) ? 1 : 0);
  function annPills() {
    const A = S.ann, p = [];
    if (A.type && !ANN_TYPES.some(t => t[0] === A.type)) p.push(['type', 'Type : ' + ((ANN_TYPE_OPTS.find(o => o[0] === A.type) || [])[1] || A.type)]);
    if (A.pays) p.push(['pays', 'Pays : ' + A.pays]);
    if (A.ville) p.push(['ville', 'Ville : ' + A.ville]);
    if (A.domaine) p.push(['domaine', domLabel(A.domaine)]);
    if (A.origine) p.push(['origine', 'Origine : ' + A.origine]);
    return p.map(([k, l]) => `<button class="chip on" data-clear="${k}" aria-label="Retirer le filtre ${esc(l)}">${esc(l)} ✕</button>`).join('');
  }
  function viewAnnuaire() {
    const el = $('#t-annuaire');
    el.innerHTML = `<div class="search">${ic('search', 's')}<input id="aq" type="search" placeholder="Nom, métier, ville, mot-clé…" aria-label="Rechercher dans l’annuaire" value="${esc(S.ann.q)}"></div>
      <div class="chips">${ANN_TYPES.map(([k, l]) => `<button class="chip ${S.ann.type === k ? 'on' : ''}" data-t="${esc(k)}">${l}</button>`).join('')}</div>
      <div class="ann-bar"><button class="btn out sm" id="ann-fl">${ic('search', 's')} Filtres${annNbFiltres() ? ' (' + annNbFiltres() + ')' : ''}</button><div class="chips" id="ann-pills">${annPills()}</div></div>
      <div class="small muted" id="ann-count" style="margin:0 4px 10px"></div><div id="ann-list"></div><div id="ann-more"></div>`;
    $$('.chip[data-t]', el).forEach(c => c.onclick = () => { S.ann.type = c.dataset.t; S.ann.loaded = false; viewAnnuaire(); });
    $$('[data-clear]', el).forEach(c => c.onclick = () => { S.ann[c.dataset.clear] = ''; if (c.dataset.clear === 'type') S.ann.loaded = false; viewAnnuaire(); });
    $('#ann-fl').onclick = openAnnFilters;
    let t; $('#aq').oninput = e => { clearTimeout(t); t = setTimeout(() => { S.ann.q = e.target.value.trim(); S.ann.loaded = false; loadAnnuaire(); }, 350); };
    if (!S.ann.loaded) loadAnnuaire(); else paintAnnuaire();
  }
  async function annFetch(q, type) {
    const key = q + '|' + type; S.ann.cache = S.ann.cache || {};
    if (S.ann.cache[key]) return S.ann.cache[key];
    const p = new URLSearchParams({ q }); if (type) p.set('type', type);
    const r = await api('/api/annuaire/recherche?' + p); S.ann.cache[key] = annAll(r); return S.ann.cache[key];
  }
  /* Options des filtres (pays, domaines, origines, villes) tirées de l'annuaire complet, chargé une seule fois. */
  async function annOptions() {
    if (S.ann.opts) return S.ann.opts;
    const all = await annFetch('', ''); const uniq = (arr, f) => { const m = new Map(); arr.forEach(v => { const k = normTxt(v); if (k && !m.has(k)) m.set(k, f ? f(v) : v); }); return [...m.values()].sort((a, b) => String(a).localeCompare(String(b), 'fr')); };
    const cap = s => { s = String(s).trim(); return s.charAt(0).toUpperCase() + s.slice(1); };
    S.ann.opts = {
      pays: uniq(all.map(i => i.x.pays), cap), villes: uniq(all.map(i => i.x.ville), cap),
      origines: uniq(all.flatMap(i => annOrigines(i.x)), cap),
      domaines: [...new Set(all.map(i => i.x.domaine_principal).filter(Boolean))].map(k => [k, domLabel(k)]).sort((a, b) => a[1].localeCompare(b[1], 'fr'))
    };
    return S.ann.opts;
  }
  async function loadAnnuaire() {
    const l = $('#ann-list'); if (!l) return; l.innerHTML = '<div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div>';
    try { S.ann.items = await annFetch(S.ann.q, S.ann.type); S.ann.shown = 30; S.ann.loaded = true; paintAnnuaire(); }
    catch (e) { l.innerHTML = `<div class="empty"><b>Annuaire indisponible</b>${esc(e.message)}<br><br><button class="btn sm" id="retry">Réessayer</button></div>`; $('#retry').onclick = loadAnnuaire; }
  }
  async function openAnnFilters() {
    const close = openSheet('<div class="sk" style="height:120px"></div>'); const sh = $('#sheet');
    let o; try { o = await annOptions(); } catch (e) { close(); toast(e.message, true); return; }
    const A = S.ann, sel = (id, lab, opts, val) => `<label class="fl" for="${id}">${lab}</label><select class="fi" id="${id}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${(v === '' ? !val : normTxt(v) === normTxt(val)) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
    sh.querySelector('.sb').innerHTML = `<h2 style="margin:2px 0 4px;font-size:19px">Filtres de l’annuaire</h2>
      <form id="ann-ff" novalidate>
        ${sel('ff-type', 'Type d’initiative / d’organisme', ANN_TYPE_OPTS, A.type)}
        ${sel('ff-pays', 'Pays de résidence', [['', 'Tous les pays'], ...o.pays.map(p => [p, p])], A.pays)}
        <label class="fl" for="ff-ville">Ville</label><input class="fi" id="ff-ville" list="ff-villes" placeholder="Ex : Paris, Abidjan…" value="${esc(A.ville)}" autocomplete="off"><datalist id="ff-villes">${o.villes.slice(0, 400).map(v => `<option value="${esc(v)}">`).join('')}</datalist>
        ${sel('ff-dom', 'Domaine d’activité', [['', 'Tous les domaines'], ...o.domaines], A.domaine)}
        ${sel('ff-orig', 'Pays d’origine', [['', 'Tous les pays d’origine'], ...o.origines.map(p => [p, p])], A.origine)}
        <div class="row" style="gap:10px;margin-top:16px"><button type="button" class="btn out sp" id="ff-reset">Réinitialiser</button><button type="submit" class="btn sp">Appliquer</button></div>
      </form>`;
    $('#ff-reset').onclick = () => { ['pays', 'ville', 'domaine', 'origine'].forEach(k => { A[k] = ''; }); const had = A.type && !ANN_TYPES.some(t => t[0] === A.type); if (had) { A.type = ''; A.loaded = false; } close(); viewAnnuaire(); };
    $('#ann-ff').onsubmit = ev => {
      ev.preventDefault(); const nt = $('#ff-type').value; if (nt !== A.type) { A.type = nt; A.loaded = false; }
      A.pays = $('#ff-pays').value; A.ville = $('#ff-ville').value.trim(); A.domaine = $('#ff-dom').value; A.origine = $('#ff-orig').value;
      close(); viewAnnuaire();
    };
  }
  const descPlain = v => strip(v).replace(/\n{3,}/g, '\n\n');
  function annCard(it) {
    const x = it.x; let nm, desc, badge, href, photo, uid, loc, kind, fid, key = it.k + x.id;
    loc = [x.ville, x.pays].filter(Boolean).join(', ');
    if (it.k === 'i') {
      nm = x.nom; badge = x.type || 'Initiative'; photo = x.logo_url; uid = x.owner_user_id; kind = 'initiative'; fid = x.id;
      desc = descPlain(x.description || x.mission || x.slogan || ''); href = '#/profil/i/' + encodeURIComponent(x.slug || x.id);
    } else if (it.k === 'u') {
      nm = [x.prenom, x.nom].filter(Boolean).join(' ') || x.nom; badge = 'Membre'; photo = x.photo_url; uid = x.id; kind = 'user'; fid = x.id;
      desc = descPlain(x.bio || x.titre_pro || ''); href = '#/profil/' + encodeURIComponent(x.id);
    } else {
      nm = x.nom_institution || x.nom; badge = x.role === 'administrateur' ? 'Diaspo’Actif' : (x.role === 'collectivite' ? 'Collectivité' : 'Institution'); photo = x.photo_url; uid = x.id;
      kind = x.role === 'collectivite' ? 'collectivite' : 'user'; fid = x.id; desc = descPlain(x.bio || ''); href = '#/profil/' + encodeURIComponent(x.id);
    }
    S.annNames = S.annNames || {}; if (uid) S.annNames[uid] = nm;
    /* Partage (2026-10-07) : adresse PUBLIQUE du profil, lisible sans compte (même adresse que le bouton « Partager » du site : le profil du compte, ou la fiche de l'initiative sans propriétaire). */
    S.annShare = S.annShare || {};
    S.annShare[key] = { nm, path: it.k === 'i' && !uid ? '/initiative.html?id=' + encodeURIComponent(x.slug || x.id) : '/profil.html?id=' + encodeURIComponent(it.k === 'i' ? uid : x.id) };
    const dom = it.k === 'i' && x.domaine ? `<span class="badge">${esc(x.domaine)}</span>` : '';
    const note = x.avis_total ? `<span class="badge o">★ ${esc(Number(x.avis_moyenne || 0).toFixed(1))} (${x.avis_total})</span>` : '';
    const open = !!(S.ann.open && S.ann.open[key]);
    const peutAdherer = it.k === 'i' && ['Association', 'ONG'].includes(x.type) && x.adhesions_ouvertes !== false && x.adhesions_ouvertes !== 0 && !(S.me && uid && Number(S.me.id) === Number(uid));
    return `<article class="card ann" data-key="${esc(key)}"><a class="ann-top" href="${href}"><div class="av big" style="border-radius:${it.k === 'u' ? '50%' : '16px'}">${photo ? `<img src="${attrUrl(photo)}" alt="" loading="lazy" onerror="this.remove()">` : esc(initials(nm))}</div>
      <div class="sp"><div class="nm" style="font-weight:700;font-size:16px;line-height:1.2">${esc(nm)}</div>
      <div class="meta" style="margin:2px 0">${loc ? ic('pin', 's') + '<span class="ell">' + esc(loc) + '</span>' : ''}</div>
      <div class="tags" style="margin:4px 0 0"><span class="badge ${it.k === 'u' ? '' : 'g'}">${esc(badge)}</span>${dom}${note}</div></div></a>
      ${desc ? `<div class="ann-desc${open ? ' open' : ''}" data-desc>${esc(desc)}</div>` : ''}
      ${desc ? `<div class="ann-links"><button type="button" class="lnk" data-more hidden aria-expanded="${open}">${open ? 'Voir moins ▴' : 'Voir plus ▾'}</button></div>` : ''}
      <div class="ann-act2"><a class="btn sm out" href="${href}">${ic('user', 's')} Profil public</a><button type="button" class="btn sm out" data-share-ann="${esc(key)}" aria-label="Partager ce profil">${ic('share', 's')} Partager</button>${peutAdherer ? `<button type="button" class="btn sm navy" data-adh="${x.id}" data-nom="${esc(nm)}">${ic('people', 's')} Adhérer</button>` : ''}</div>
      <div class="ann-act3">${uid ? `<button type="button" class="btn sm" data-sup="${uid}">${ic('heart', 's')} Soutenir</button><button type="button" class="btn sm out" data-write="${uid}">${ic('chat', 's')} Contacter</button>` : ''}<button type="button" class="btn sm out" data-follow="${fid}" data-kind="${kind}" data-on="0">${ic('bell', 's')} S’abonner</button></div></article>`;
  }
  function paintAnnuaire() {
    const l = $('#ann-list'); if (!l) return;
    const a = S.ann.items.filter(annMatch);
    $('#ann-count').textContent = a.length ? `${a.length} résultat${a.length > 1 ? 's' : ''}` : '';
    if (!a.length) { l.innerHTML = `<div class="empty"><div class="ei">${ic('dir', 'l')}</div><b>Aucun résultat</b>Essayez un autre mot-clé ou retirez un filtre.</div>`; $('#ann-more').innerHTML = ''; return; }
    l.innerHTML = a.slice(0, S.ann.shown).map(annCard).join('');
    $('#ann-more').innerHTML = a.length > S.ann.shown ? `<button class="btn out block" id="ann-next">Voir plus de résultats (${a.length - S.ann.shown})</button>` : '';
    const n = $('#ann-next'); if (n) n.onclick = () => { S.ann.shown += 30; paintAnnuaire(); };
    /* « Voir plus » n'apparaît que si la description dépasse 3 lignes. */
    $$('[data-desc]', l).forEach(d => { const b = d.parentNode.querySelector('[data-more]'); if (b && (d.classList.contains('open') || d.scrollHeight > d.clientHeight + 2)) b.hidden = false; });
  }
  /* Adhérer : comme le site — formules de cotisation configurées => choix de la formule puis page d'adhésion (paiement) ; sinon simple demande à la structure. */
  const PERIODE = { cotisation_mensuelle: 'par mois', cotisation_trimestrielle: 'par trimestre', cotisation_semestrielle: 'par semestre', cotisation_annuelle: 'par an' };
  /* Prix affiché d'une formule : montant fixe, libre ou minimum (champs réels de la formule d'adhésion). */
  function prixFormule(f) {
    const per = PERIODE[f.type_contribution] ? ' ' + PERIODE[f.type_contribution] : '', dev = f.devise || 'EUR';
    if (f.montant_type === 'libre') return 'Montant libre';
    if (f.montant_type === 'minimum' || f.montant_type === 'min') return f.montant_min > 0 ? 'Dès ' + money(f.montant_min, dev) + per : 'Montant libre';
    return Number(f.montant_fixe) > 0 ? money(f.montant_fixe, dev) + per : 'Gratuit';
  }
  function feuilleFormules(id, nom, liste) {
    const close = openSheet(`<h2 style="margin:2px 0 4px;font-size:19px">Adhérer à ${esc(nom)}</h2><p class="muted small" style="margin:0 0 12px">Choisissez votre formule. Le paiement et la carte de membre se font sur la page d’adhésion sécurisée.</p>
      ${liste.map(f => `<div class="card" style="margin-bottom:10px"><div class="pad"><div class="row"><b class="sp" style="font-size:16px">${esc(f.nom || 'Adhésion')}</b><span class="badge o">${esc(prixFormule(f))}</span></div>${f.description ? `<p class="small muted" style="margin:6px 0 10px">${esc(strip(f.description))}</p>` : ''}<a class="btn block sm" href="adhesions.html?initiative=${encodeURIComponent(id)}&formule=${encodeURIComponent(f.id)}">Continuer l’adhésion</a></div></div>`).join('')}
      <button type="button" class="btn out block" id="adh-x" style="margin-top:4px">Plus tard</button>`);
    $('#adh-x').onclick = close;
  }
  async function adherer(id, nom, btn) {
    if (!(await needLogin('Connectez-vous pour adhérer à cette structure.'))) return;
    if (btn) btn.disabled = true;
    try {
      let formules = []; try { formules = (await api(`/api/initiatives/${encodeURIComponent(id)}/adhesion-formules`)).formules || []; } catch (e) { /* pas de formules : demande simple */ }
      if (formules.length) { if (btn) btn.disabled = false; return feuilleFormules(id, nom, formules.find(f => f.est_officielle) ? [formules.find(f => f.est_officielle)] : formules); }
      const r = await api(`/api/initiatives/${encodeURIComponent(id)}/demande-adhesion`, { method: 'POST' });
      const membre = r.statut === 'acceptee';
      if (btn) { btn.innerHTML = membre ? `${ic('check', 's')} Membre` : `${ic('clock', 's')} Demande envoyée`; btn.classList.add('sub'); }
      toast(membre ? 'Vous êtes déjà membre.' : (r.deja_existante ? 'Votre demande est déjà en cours.' : 'Demande d’adhésion envoyée ✓'));
    } catch (er) { toast(er.message, true); if (btn) btn.disabled = false; }
  }
  document.addEventListener('click', async e => {
    /* Partager un profil de l'annuaire ou un événement de la liste : le lien s'ouvre sans compte, un jeton rend chaque envoi unique (aperçu WhatsApp). */
    const shA = e.target.closest('[data-share-ann]');
    if (shA) { e.preventDefault(); const s = (S.annShare || {})[shA.dataset.shareAnn]; if (s) partagerLien(location.origin + s.path + '&r=' + jetonPartage(), s.nm); return; }
    const shE = e.target.closest('[data-share-ev]');
    if (shE) { e.preventDefault(); e.stopPropagation(); partagerLien(location.origin + '/evenements.html?evt=' + encodeURIComponent(shE.dataset.shareEv) + (S.me ? '&via=' + S.me.id : '') + '&r=' + jetonPartage(), shE.dataset.shareTitre || 'Événement Diaspo’Actif'); return; }
    const ad = e.target.closest('[data-adh]');
    if (ad) { adherer(ad.dataset.adh, ad.dataset.nom || 'cette structure', ad); return; }
    const more = e.target.closest('.ann [data-more]');
    if (more) {
      const card = more.closest('.ann'), d = card.querySelector('[data-desc]'), on = d.classList.toggle('open');
      S.ann.open = S.ann.open || {}; S.ann.open[card.dataset.key] = on; more.textContent = on ? 'Voir moins ▴' : 'Voir plus ▾'; more.setAttribute('aria-expanded', String(on)); return;
    }
    const sup = e.target.closest('[data-sup]');
    if (sup) { location.hash = '#/cagnottes/' + sup.dataset.sup; return; }
    const fo = e.target.closest('[data-follow]');
    if (fo) {
      if (!(await needLogin('Connectez-vous pour vous abonner.'))) return;
      const kind = fo.dataset.kind, id = fo.dataset.follow, on = fo.dataset.on === '1'; fo.disabled = true;
      try {
        let abonne;
        if (kind === 'initiative') {
          try { await api(`/api/initiatives/${id}/suivre`, { method: on ? 'DELETE' : 'POST' }); abonne = !on; }
          catch (er) { if (er.status === 409) abonne = true; else throw er; }
        } else if (kind === 'collectivite') { abonne = !!(await api(`/api/collectivites/${id}/abonnement`, { method: 'POST' })).abonne; }
        else { await api(`/api/users/${id}/suivre`, { method: on ? 'DELETE' : 'POST' }); abonne = !on; }
        fo.dataset.on = abonne ? '1' : '0'; fo.classList.toggle('sub', abonne);
        fo.innerHTML = abonne ? `${ic('check', 's')} Abonné` : `${ic('bell', 's')} S’abonner`; toast(abonne ? 'Abonnement enregistré ✓' : 'Abonnement retiré');
      } catch (er) { toast(er.message, true); }
      fo.disabled = false; return;
    }
    const pf = e.target.closest('[data-prof]'); if (pf && !e.target.closest('a,button')) { location.hash = '#/profil/' + pf.dataset.prof; return; }
    const w = e.target.closest('[data-write]'); if (!w) return;
    if (w.tagName === 'A') e.preventDefault();
    if (!(await needLogin('Connectez-vous pour écrire à ce compte.'))) return;
    w.disabled = true;
    try { const r = await api('/api/conversations', { method: 'POST', body: { user_id: Number(w.dataset.write) } }); location.hash = '#/conv/' + r.conversation_id; }
    catch (er) { if (er.status === 403 && er.data && er.data.code === 'contact_requis') demandeContact(er.data, w); else toast(er.message, true); }
    w.disabled = false;
  });
  /* Le site n'autorise une conversation qu'entre comptes en contact : on propose d'envoyer la demande de contact, puis la discussion s'ouvre dès qu'elle est acceptée. */
  function demandeContact(d, btn) {
    const nom = (S.annNames && S.annNames[d.destinataire_id]) || d.destinataire_nom || 'ce compte';
    const close = openSheet(`<h2 style="margin:2px 0 6px;font-size:19px">Établir le contact</h2>
      <p style="margin:0 0 10px">Pour écrire à <b>${esc(nom)}</b>, vous devez d’abord être en contact. Votre demande lui sera envoyée ; vous pourrez échanger dès qu’elle sera acceptée.</p>
      <div class="card" style="margin-bottom:12px"><div class="pad small muted" style="font-style:italic">${esc(d.message_predefini || 'Bonjour, j’aimerais vous ajouter à mes contacts afin de pouvoir échanger avec vous sur Diaspo’Actif.')}</div></div>
      <button type="button" class="btn block" id="dc-go">Envoyer la demande de contact</button><button type="button" class="btn out block" id="dc-x" style="margin-top:10px">Plus tard</button>`);
    $('#dc-x').onclick = close;
    $('#dc-go').onclick = async () => {
      const go = $('#dc-go'); go.disabled = true; go.textContent = 'Envoi…';
      try { await api('/api/demandes-contact', { method: 'POST', body: { destinataire_id: Number(d.destinataire_id) } }); close(); toast('Demande de contact envoyée ✓'); if (btn) { btn.innerHTML = `${ic('clock', 's')} Demande envoyée`; btn.disabled = true; } }
      catch (er) {
        if (er.status === 409 && er.data && er.data.code === 'deja_en_attente') { close(); toast('Votre demande est déjà en attente de réponse.'); }
        else if (er.status === 409 && er.data && er.data.code === 'deja_contacts') { close(); toast('Vous êtes déjà en contact : ouvrez la discussion.'); if (btn) btn.click(); }
        else { toast(er.message, true); go.disabled = false; go.textContent = 'Envoyer la demande de contact'; }
      }
    };
  }

  /* ============================================================
     COMPTE-RENDU D'ÉVÉNEMENT
     ============================================================ */
  const CR_OK = { P: 1, BR: 1, STRONG: 1, B: 1, EM: 1, I: 1, U: 1, UL: 1, OL: 1, LI: 1, A: 1, H1: 1, H2: 1, H3: 1, H4: 1, BLOCKQUOTE: 1 };
  function richHtml(s) {
    s = String(s == null ? '' : s).replace(/@\[([^\]]+)\]\([uic]:\d+\)/g, '@$1');
    if (!/<(p|h[1-6]|ul|ol|li|blockquote|br|strong|em|b|i|u|a)[\s>\/]/i.test(s)) return linkify(md(s)).replace(/\n/g, '<br>');
    const doc = new DOMParser().parseFromString('<div>' + s + '</div>', 'text/html');
    (function walk(n) {
      Array.from(n.childNodes).forEach(c => {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1 || !CR_OK[c.tagName]) { if (c.nodeType === 1 && /^(SCRIPT|STYLE|IFRAME|OBJECT)$/.test(c.tagName)) c.remove(); else { walk(c); while (c.firstChild) n.insertBefore(c.firstChild, c); c.remove(); } return; }
        Array.from(c.attributes).forEach(a => { if (!(c.tagName === 'A' && a.name === 'href')) c.removeAttribute(a.name); });
        if (c.tagName === 'A') { const h = c.getAttribute('href') || ''; if (!/^https?:/i.test(h)) c.removeAttribute('href'); else { c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); } }
        walk(c);
      });
    })(doc.body.firstChild);
    return doc.body.firstChild.innerHTML;
  }
  /* Actualité autre qu'un compte-rendu : même publication, habillée VERT scintillant (le compte-rendu est BLEU scintillant) pour que les deux ne se confondent
     jamais dans le bloc « Actualités ». Seules les publications (article) reçoivent le bandeau ; les cartes spéciales restent telles quelles. */
  function actuVerte(html) {
    if (!html || html.indexOf('<article class="card post"') !== 0) return html;
    return html.replace('<article class="card post"', '<article class="card post actu"').replace(/^(<article[^>]*>)/, '$1<div class="actu-band"><span aria-hidden="true">📰</span><b>ACTUALITÉ</b><small>de la communauté</small></div>');
  }
  /* Cartouche d'un compte-rendu dans les actualités : affiche, titre, date, ville, organisateur, aperçu du résumé, « Voir plus » et « Compte-rendu ». */
  function crCarte(c) {
    const lien = '#/cr/' + encodeURIComponent(c.evenement_id);
    const ap = strip(c.resume || '').replace(/\s+/g, ' ');
    const coupe = ap.length > 260 ? (ap.lastIndexOf(' ', 260) > 180 ? ap.lastIndexOf(' ', 260) : 260) : -1;
    const court = coupe > 0 ? ap.slice(0, coupe) + '…' : ap;
    const meta = [dateLong(c.date_evt), c.ville].filter(Boolean).map(esc).join(' · ');
    return `<article class="card crn">
      <div class="crn-band"><span aria-hidden="true">📝</span><b>COMPTE-RENDU</b><small>de l’événement</small></div>
      ${c.image ? `<a class="crn-img" href="${lien}" aria-label="Ouvrir le compte-rendu"><img src="${attrUrl(c.image)}" alt="${esc(c.evenement_titre || c.titre)}" loading="lazy" onerror="this.parentNode.remove()"></a>` : ''}
      <div class="pad">
        <h3 class="crn-t"><a href="${lien}">${esc(c.titre)}</a></h3>
        ${c.evenement_titre && c.evenement_titre !== c.titre ? `<div class="small muted">Événement : ${esc(c.evenement_titre)}</div>` : ''}
        ${meta ? `<div class="meta">${ic('cal', 's')}<span>${meta}</span></div>` : ''}
        ${c.organisateur ? `<div class="meta">${ic('user', 's')}<span>Par <b style="color:var(--text)">${esc(c.organisateur)}</b></span></div>` : ''}
        ${court ? `<p class="crn-ap">${esc(court)}</p><a class="crn-plus" href="${lien}">Voir plus ›</a>` : ''}
        <div class="crn-btns"><a class="cr-bleu" href="${lien}">📝<span>Lire le compte-rendu</span><i aria-hidden="true">→</i></a><a class="cr-synth" href="${lien}/synthese"><span aria-hidden="true">📋</span> Synthèse</a></div></div></article>`;
  }
  /* « Toutes les actualités » : tous les comptes-rendus publiés (même ceux sans publication dans le fil), puis le fil complet. */
  async function paneActus() {
    setPane('Actualités', `<div id="actu-crs"></div><div class="sec"><h2 class="sec-t"><span class="sic">${ic('fil')}</span><span>Publications</span></h2></div><div id="home-feed"></div>`);
    api('/api/comptes-rendus/publies?limit=30').then(r => {
      const l = r.comptes_rendus || [], el = $('#actu-crs'); if (!l.length || !el) return;
      el.innerHTML = secHead('Comptes-rendus', 'doc') + l.map(crCarte).join('');
    }).catch(() => { });
    viewFil();
  }
  /* ---------- Compte-rendu : bloc d'action, barre « Synthèse / Agir » et synthèse (2026-10-07) ----------
     Mêmes règles que compte-rendu.html : actions choisies par l'auteur (liens http/https) + « Laisser un message à l'organisateur » toujours
     proposé en dernier ; la synthèse est composée automatiquement de ce que l'auteur a déjà saisi. */
  const CR_TYPES = { eco: 'Économique', fes: 'Festif', pol: 'Politique', forum: 'Forum', edu: 'Éducatif', spi: 'Spirituel', san: 'Santé', ing: 'Ingénierie', blanc: 'Page blanche' };
  const CR_SOUS = { fiche: 'Quelques secondes, sans créer de compte.', don: 'Chaque geste compte.', message: 'Nom, prénom, e-mail et un petit mot : l’organisateur vous répond.', lien: '' };
  function crActions(c) {
    const l = Array.isArray(c.actions) && c.actions.length ? c.actions : (c.etape_bouton && c.etape_lien ? [{ bouton: c.etape_bouton, lien: c.etape_lien }] : []);
    return [...l.filter(a => a && a.bouton && /^https?:\/\//i.test(a.lien || '')), { bouton: 'Laisser un message à l’organisateur', message: true }];
  }
  const crKind = a => a.message ? 'message' : /inscription-publique\.html\?slug=/.test(a.lien) ? 'fiche' : /cagnotte\.html\?slug=/.test(a.lien) ? 'don' : 'lien';
  const crIcon = a => ic(crKind(a) === 'message' ? 'chat' : crKind(a) === 'don' ? 'heart' : 'star');
  function crBtnBleu(a) {
    const s = CR_SOUS[crKind(a)];
    return (a.message ? '<button type="button" class="cr-bleu" data-cr-msg>' : `<a class="cr-bleu" href="${attrUrl(a.lien)}" target="_blank" rel="noopener">`)
      + `${crIcon(a)}<span>${esc(a.bouton)}</span><i aria-hidden="true">→</i>` + (a.message ? '</button>' : '</a>') + (s ? `<small>${esc(s)}</small>` : '');
  }
  /* Bloc d'action : l'élément clé du compte-rendu (décider et agir), juste sous l'affiche, nettement séparé du récit. */
  function crAgirBloc(c) {
    return `<section class="cr-agir" aria-labelledby="cr-agir-t"><div class="cr-agir-t" id="cr-agir-t">★ Passez à l’action</div><p class="cr-agir-d">Vous avez lu : à vous de décider. Choisissez comment vous engager.</p>${crActions(c).map(crBtnBleu).join('')}</section>`;
  }
  function crBarHtml(c) {
    const solo = crActions(c).length === 1;
    return `<button type="button" class="cr-synth" id="cr-synth"><span aria-hidden="true">📋</span> Synthèse</button><button type="button" class="cr-qm" id="cr-qm" aria-label="À quoi sert la synthèse ?" aria-expanded="false">?</button><button type="button" class="cr-agir-btn" id="cr-agir">★ ${solo ? 'Laisser un message' : 'Agir'}</button>
      <div class="cr-bulle" id="cr-bulle" hidden role="tooltip"><b>La synthèse</b> met l’essentiel du compte-rendu sur un seul écran : résumé, chiffres clés, temps forts, personnes à l’honneur, partenaires et étape suivante. Vous pouvez la partager.</div>`;
  }
  function crMessage(id, ev) {
    const u = S.me || {};
    const fld = (i, ph, v, t) => `<div class="search" style="border-radius:12px;margin:0 0 8px"><input id="${i}" ${t ? `type="${t}" ` : ''}maxlength="160" placeholder="${ph}" value="${esc(v || '')}"></div>`;
    const close = openSheet(`<h2 style="margin:4px 0 2px;font-size:20px">💬 Laisser un message</h2><p class="muted small" style="margin:0 0 12px">Votre message est transmis à ${esc(ev.organisateur_nom || 'l’organisateur')}, qui pourra vous répondre par e-mail. Aucun compte n’est nécessaire.</p>
      <div class="row" style="gap:8px"><div class="sp">${fld('crm-p', 'Prénom', u.prenom)}</div><div class="sp">${fld('crm-n', 'Nom', u.nom)}</div></div>${fld('crm-e', 'Adresse e-mail', u.email, 'email')}
      <textarea id="crm-m" maxlength="1500" rows="5" placeholder="Votre message (ex. Je suis très intéressé(e), pouvez-vous me recontacter ?)" style="width:100%;border:1px solid var(--border);border-radius:12px;padding:10px 12px;font-size:16px;background:var(--card)"></textarea>
      <input id="crm-x" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">
      <p id="crm-err" class="small" style="color:var(--red);min-height:20px;margin:6px 2px" role="alert"></p>
      <button type="button" class="btn block" id="crm-ok">Envoyer</button><button type="button" class="btn out block" id="crm-non" style="margin-top:10px">Annuler</button>`);
    $('#crm-non').onclick = close;
    $('#crm-ok').onclick = async () => {
      const prenom = $('#crm-p').value.trim(), nom = $('#crm-n').value.trim(), email = $('#crm-e').value.trim(), message = $('#crm-m').value.trim(), err = $('#crm-err');
      if (!prenom || !nom) { err.textContent = 'Indiquez votre prénom et votre nom.'; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { err.textContent = 'Indiquez une adresse e-mail valide.'; return; }
      if (message.length < 3) { err.textContent = 'Écrivez un petit message.'; return; }
      err.textContent = ''; const b = $('#crm-ok'); b.disabled = true; b.textContent = 'Envoi…';
      try {
        await api(`/api/evenements/${encodeURIComponent(id)}/compte-rendu/messages`, { method: 'POST', body: { prenom, nom, email, message, site_perso: $('#crm-x').value } });
        $('#sheet .sb').innerHTML = `<div class="empty"><div class="ei">${ic('chat', 'l')}</div><b>Message envoyé ✓</b>Merci ! ${esc(ev.organisateur_nom || 'L’organisateur')} a bien reçu votre message et pourra vous répondre à l’adresse indiquée.<br><br><button class="btn" id="crm-fin">Fermer</button></div>`;
        $('#crm-fin').onclick = close;
      } catch (e) { err.textContent = e.message || 'Envoi impossible, réessayez.'; b.disabled = false; b.textContent = 'Envoyer'; }
    };
  }
  function crAgir(r, id) {
    const c = r.compte_rendu, ev = r.evenement || {}, l = crActions(c);
    if (l.length === 1) { crMessage(id, ev); return; }
    const close = openSheet(`<h2 style="margin:4px 0 10px;font-size:20px">★ Choisissez comment agir</h2><div class="cr-choix">${l.map(crBtnBleu).join('')}</div><button type="button" class="btn out block" id="cra-non" style="margin-top:12px">Fermer</button>`);
    $('#cra-non').onclick = close;
    $$('#sheet [data-cr-msg]').forEach(b => b.onclick = () => { close(); crMessage(id, ev); });
  }
  function crSyntheseHtml(r) {
    const c = r.compte_rendu, ev = r.evenement || {};
    const parties = (c.details || []).filter(d => d.texte), profils = c.profils || [], forts = c.forts || [], parts = c.partenaires || [];
    const comms = [...new Set(profils.map(p => (p.communaute || '').trim()).filter(Boolean))];
    const kpis = [[parties.length, parties.length > 1 ? 'parties détaillées' : 'partie détaillée']];
    if (profils.length) kpis.push([profils.length, profils.length > 1 ? 'personnes et organisations à l’honneur' : 'personne ou organisation à l’honneur']);
    if (comms.length) kpis.push([comms.length, comms.length > 1 ? 'communautés représentées' : 'communauté représentée']);
    if (forts.length) kpis.push([forts.length, forts.length > 1 ? 'temps forts' : 'temps fort']);
    const cats = new Map(); profils.forEach(p => { const k = (p.categorie || '').trim() || 'Autres'; if (!cats.has(k)) cats.set(k, []); cats.get(k).push(p); });
    const nomP = p => /^https?:\/\//i.test(p.lien || '') ? `<a href="${attrUrl(p.lien)}" target="_blank" rel="noopener">${esc(p.nom)}</a>` : esc(p.nom);
    const type = c.type_cr === 'autre' && c.type_libre ? c.type_libre : (CR_TYPES[c.type_cr] || '');
    const logo = c.logo_url || (ev.organisateur_officiel ? 'assets/logo.png' : '');
    const etape = (c.etape_texte || c.etape_date) ? `<div class="cr-s-etape"><b>➡️ L’étape suivante</b>${c.etape_date ? `<div class="small">📅 ${esc(dateLong(c.etape_date))}</div>` : ''}${c.etape_texte ? `<p style="margin:4px 0 0">${esc(c.etape_texte)}</p>` : ''}</div>` : '';
    return `<div class="cr-s-head">${logo ? `<img src="${attrUrl(logo)}" alt="" onerror="this.remove()">` : ''}<div><div class="small muted">Synthèse du compte-rendu</div><h2>${esc(c.titre || ev.titre)}</h2>
        <div class="tags" style="margin:4px 0 0"><span class="badge">${esc(dateLong(ev.date_evt))}</span>${ev.ville ? `<span class="badge">${esc(ev.ville)}</span>` : ''}${type ? `<span class="badge">${esc(type)}</span>` : ''}</div></div></div>
      ${c.resume ? `<div class="cr-s-resume"><b>RÉSUMÉ</b><div class="rich">${richHtml(c.resume)}</div></div>` : ''}
      <div class="cr-s-kpis">${kpis.map(k => `<div><span>${esc(k[0])}</span>${esc(k[1])}</div>`).join('')}</div>
      ${forts.length ? `<h3 class="cr-s-h">Les temps forts</h3><ul class="cr-s-forts">${forts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : ''}
      ${cats.size ? `<h3 class="cr-s-h">Personnes et organisations à l’honneur</h3>${[...cats.entries()].map(([k, l]) => `<div class="cr-s-cat"><b>${esc(k)}</b><span>${l.map(nomP).join(' · ')}</span></div>`).join('')}` : ''}
      ${parts.length ? `<h3 class="cr-s-h">Partenaires</h3><div class="cr-s-parts">${parts.map(p => `<div>${p.logo_url ? `<img src="${attrUrl(p.logo_url)}" alt="" onerror="this.remove()">` : `<span class="ini">${esc(initials(p.nom))}</span>`}<span>${p.lien && /^https?:\/\//i.test(p.lien) ? `<a href="${attrUrl(p.lien)}" target="_blank" rel="noopener">${esc(p.nom)}</a>` : esc(p.nom)}</span></div>`).join('')}</div>` : ''}
      <h3 class="cr-s-h">Et maintenant ?</h3>${etape}<div class="cr-choix">${crActions(c).map(crBtnBleu).join('')}</div>`;
  }
  function crSynthese(r, id) {
    const ev = r.evenement || {}, lien = `${location.origin}/compte-rendu.html?evt=${encodeURIComponent(id)}&synthese=1`;
    const close = openSheet(`<div class="cr-s">${crSyntheseHtml(r)}</div><div class="cr-s-pied"><button type="button" class="btn out" id="crs-copie">Copier le lien</button><button type="button" class="btn out" id="crs-part">Partager</button></div><button type="button" class="btn block" id="crs-plein" style="margin-top:10px">📖 Lire le compte-rendu complet</button>`);
    $('#crs-plein').onclick = close;
    $('#crs-copie').onclick = async () => { try { await navigator.clipboard.writeText(lien); toast('Lien copié'); } catch (e) { window.prompt('Copiez ce lien :', lien); } };
    $('#crs-part').onclick = async () => { try { if (navigator.share) await navigator.share({ title: (r.compte_rendu && r.compte_rendu.titre) || ev.titre, url: lien }); else { await navigator.clipboard.writeText(lien); toast('Lien copié'); } } catch (e) { /* partage annulé */ } };
    $$('#sheet [data-cr-msg]').forEach(b => b.onclick = () => { close(); crMessage(id, ev); });
  }
  async function paneCR(id, sous) {
    setPane('Compte-rendu', '<div class="sk skc"></div><div class="sk skc" style="height:120px"></div>');
    let r; try { r = await api(`/api/evenements/${encodeURIComponent(id)}/compte-rendu`); } catch (e) { return setPane('Compte-rendu', `<div class="empty"><b>Compte-rendu indisponible</b>${esc(e.message)}</div>`); }
    const ev = r.evenement || {}, c = r.compte_rendu;
    if (!c) return setPane('Compte-rendu', `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>Pas encore de compte-rendu</b>L’organisateur ne l’a pas encore publié.<br><br><a class="btn" href="#/evenement/${esc(id)}">Voir l’événement</a></div>`);
    const medias = (c.medias || []).map(m => typeof m === 'string' ? m : (m && m.url)).filter(Boolean);
    const html = `${ev.image ? mediaBlock(ev.image, { alt: ev.titre }) : ''}
      ${crAgirBloc(c)}
      <div class="card" style="margin-top:12px"><div class="pad"><div class="small muted" style="margin-bottom:4px">${ic('doc', 's')} Compte-rendu${c.published_at ? ' · ' + esc(ago(c.published_at)) : ''}</div>
        <h2 style="margin:0 0 8px;font-size:21px;line-height:1.25">${esc(c.titre || ev.titre)}</h2>
        <div class="meta">${ic('cal', 's')}<span>${esc(ev.titre || '')} · ${esc(dateLong(ev.date_evt))}</span></div>
        ${ev.ville || ev.lieu ? `<div class="meta">${ic('pin', 's')}<span>${esc([ev.lieu, ev.ville, ev.pays].filter(Boolean).join(', '))}</span></div>` : ''}
        ${ev.organisateur_nom ? `<div class="meta">${ic('user', 's')}<span>Par <b style="color:var(--text)">${esc(ev.organisateur_nom)}</b></span></div>` : ''}</div></div>
      ${c.resume ? `<div class="card"><div class="pad rich">${richHtml(c.resume)}</div></div>` : ''}
      ${(c.forts || []).length ? `<div class="h2">POINTS FORTS</div><div class="card"><div class="pad"><div class="tags" style="margin:0">${c.forts.map(f => `<span class="badge g">${esc(f)}</span>`).join('')}</div></div></div>` : ''}
      ${(c.details || []).map(d => `<div class="card"><div class="pad">${d.titre ? `<h3 style="margin:0 0 6px;font-size:17px">${esc(d.titre)}</h3>` : ''}<div class="rich">${richHtml(d.texte)}</div></div></div>`).join('')}
      ${c.video_url ? (/\.(mp4|webm)(\?|$)/i.test(c.video_url) ? videoBlock(c.video_url) : `<a class="btn out block" style="margin-bottom:12px" href="${attrUrl(c.video_url)}" target="_blank" rel="noopener">▶ Voir la vidéo ${ic('out', 's')}</a>`) : ''}
      ${medias.length ? `<div class="h2">PHOTOS</div>${medias.map(u => `<div style="margin-bottom:10px;border-radius:14px;overflow:hidden">${mediaBlock(u)}</div>`).join('')}` : ''}
      ${(c.partenaires || []).length ? `<div class="h2">PARTENAIRES</div><div class="lst">${c.partenaires.map(p => `<a class="li" ${p.lien ? `href="${attrUrl(p.lien)}" target="_blank" rel="noopener"` : ''}><span class="ic">${p.logo_url ? `<img src="${attrUrl(p.logo_url)}" alt="" style="width:100%;height:100%;object-fit:contain;border-radius:10px">` : ic('people')}</span><span class="sp"><span class="t">${esc(p.nom)}</span>${p.description ? `<br><span class="d">${esc(p.description)}</span>` : ''}</span></a>`).join('')}</div>` : ''}
      ${(r.identifies || []).length ? `<div class="h2">IDENTIFIÉS</div><div class="card"><div class="pad"><div class="tags" style="margin:0">${r.identifies.map(p => `<a class="badge" href="profil.html?id=${esc(p.user_id)}">${esc(p.nom)}</a>`).join('')}</div></div></div>` : ''}
      ${c.etape_texte ? `<div class="card"><div class="pad"><div class="small muted">Prochaine étape${c.etape_date ? ' · ' + esc(dateLong(c.etape_date)) : ''}</div><p style="margin:4px 0 0">${esc(c.etape_texte)}</p></div></div>` : ''}
      <button type="button" class="btn block" id="crmsg" style="margin-bottom:10px">💬 Laisser un message à l’organisateur</button>
      ${r.peut_editer ? '<button type="button" class="btn out block" id="crrecus" style="margin-bottom:10px">📨 Messages reçus</button>' : ''}
      <a class="btn out block" href="compte-rendu.html?evt=${esc(id)}">Ouvrir la version complète ${ic('out', 's')}</a>`;
    setPane(c.titre || 'Compte-rendu', html, crBarHtml(c));
    if (c.statut === 'publie') paneShare(location.origin + '/compte-rendu.html?evt=' + encodeURIComponent(id) + '&r=' + jetonPartage(), c.titre || ev.titre);
    /* barre du bas, toujours visible : « Synthèse » (+ « ? » qui l'explique) et « Agir » ; bloc d'action du haut : message à l'organisateur */
    const bulle = $('#cr-bulle'), qm = $('#cr-qm');
    $('#cr-synth').onclick = () => { bulle.hidden = true; qm.setAttribute('aria-expanded', 'false'); crSynthese(r, id); };
    qm.onclick = () => { bulle.hidden = !bulle.hidden; qm.setAttribute('aria-expanded', String(!bulle.hidden)); };
    $('#cr-agir').onclick = () => { bulle.hidden = true; crAgir(r, id); };
    $$('#pane-body [data-cr-msg]').forEach(b => b.onclick = () => crMessage(id, ev));
    if (sous === 'synthese') crSynthese(r, id);
    const bm = $('#crmsg'); if (bm) bm.onclick = () => crMessageSheet(id, ev);
    const br = $('#crrecus'); if (br) br.onclick = () => crMessagesRecus(id, c.titre || ev.titre);
  }
  /* Une publication ouverte par son lien de partage (#/post/ID), lisible sans compte si elle est publique (2026-10-07). */
  const postCache = {};
  async function panePost(id) {
    setPane('Publication', '<div class="sk skc"></div><div class="sk skc" style="height:120px"></div>');
    let r;
    try { r = await api('/api/fil/' + encodeURIComponent(id)); }
    catch (e) { return setPane('Publication', `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>Publication introuvable</b>Elle a peut-être été supprimée, ou elle n’est plus publique.<br><br><a class="btn" href="#/accueil">Voir le fil d’actualité</a></div>`); }
    const p = r.post; if (!p) return setPane('Publication', '<div class="empty"><b>Publication introuvable</b></div>');
    postCache[p.id] = p;
    const invite = S.me ? '' : '<div class="card" style="margin-top:12px"><div class="pad"><b>Rejoignez Diaspo’Actif</b><p class="small muted" style="margin:4px 0 10px">La plateforme de la diaspora engagée : réagissez, commentez et suivez vos organisations.</p><a class="btn sm" href="inscription.html">Créer un compte gratuit</a></div></div>';
    setPane('Publication', '<div style="padding-top:12px">' + postHtml(p) + '</div>' + invite);
    $$('#pane-body [data-clamp]').forEach(c => { if (c.scrollHeight > c.clientHeight + 2) { const b = c.parentNode.querySelector('[data-more]'); if (b) b.hidden = false; } });
    if ((p.visibilite || 'public') === 'public') paneShare(location.origin + '/fil-actualite.html?post=' + encodeURIComponent(p.id) + '&r=' + jetonPartage(), strip(p.titre || p.corps || 'Publication sur Diaspo’Actif').slice(0, 80));
  }
  /* Action par défaut de tous les comptes-rendus (2026-10-07) : nom, prénom, e-mail, petit message — sans compte. */
  function crMessageSheet(id, ev) {
    const me = S.me || {};
    const close = openSheet('<h3 style="margin:0 0 4px">💬 Laisser un message</h3><p class="small muted" style="margin:0 0 10px">Transmis à ' + esc(ev.organisateur_nom || 'l’organisateur') + ', qui pourra vous répondre par e-mail. Aucun compte nécessaire.</p>'
      + '<label class="fl" for="crm-p">Prénom</label><input class="fi" id="crm-p" maxlength="80" autocomplete="given-name" value="' + esc(me.prenom || '') + '">'
      + '<label class="fl" for="crm-n">Nom</label><input class="fi" id="crm-n" maxlength="80" autocomplete="family-name" value="' + esc(me.nom || '') + '">'
      + '<label class="fl" for="crm-e">Adresse e-mail</label><input class="fi" id="crm-e" type="email" maxlength="160" autocomplete="email" value="' + esc(me.email || '') + '">'
      + '<label class="fl" for="crm-m">Votre message</label><textarea class="fi" id="crm-m" rows="4" maxlength="1500" placeholder="Ex. Je suis très intéressé(e), pouvez-vous me recontacter ?"></textarea>'
      + '<input id="crm-t" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;opacity:0">'
      + '<button type="button" class="btn block" id="crm-ok" style="margin-top:12px">Envoyer</button>');
    $('#crm-ok').onclick = async () => {
      const prenom = $('#crm-p').value.trim(), nom = $('#crm-n').value.trim(), email = $('#crm-e').value.trim(), message = $('#crm-m').value.trim();
      if (!prenom || !nom) return toast('Indiquez votre prénom et votre nom.', true);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return toast('Indiquez une adresse e-mail valide.', true);
      if (message.length < 3) return toast('Écrivez un petit message.', true);
      const b = $('#crm-ok'); b.disabled = true;
      try { await api('/api/evenements/' + encodeURIComponent(id) + '/compte-rendu/messages', { method: 'POST', body: { prenom, nom, email, message, site_perso: $('#crm-t').value } }); close(); toast('Message envoyé ✅'); }
      catch (e) { toast(e.message || 'Envoi impossible.', true); b.disabled = false; }
    };
  }
  async function crMessagesRecus(id, titre) {
    let r; try { r = await api('/api/evenements/' + encodeURIComponent(id) + '/compte-rendu/messages'); } catch (e) { return toast(e.message || 'Erreur', true); }
    const l = r.messages || [];
    openSheet('<h3 style="margin:0 0 10px">📨 Messages reçus (' + l.length + ')</h3>' + (l.length ? l.map(m => '<div class="card" style="margin-bottom:8px"><div class="pad"><b>' + esc(m.prenom) + ' ' + esc(m.nom) + '</b> <span class="small muted">· ' + esc(ago(m.created_at)) + '</span><div style="margin:4px 0;white-space:pre-wrap">' + esc(m.message) + '</div><a href="mailto:' + esc(m.email) + '?subject=' + encodeURIComponent('Votre message sur « ' + titre + ' »') + '">✉️ ' + esc(m.email) + '</a></div></div>').join('') : '<p class="small muted">Aucun message pour le moment.</p>'));
    if (r.non_lus) { try { await api('/api/evenements/' + encodeURIComponent(id) + '/compte-rendu/messages/lus', { method: 'POST', body: {} }); } catch (_) {} }
  }

  /* ============================================================
     MESSAGES
     ============================================================ */
  function loginCard(txt) {
    return `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Connexion requise</b>${esc(txt)}<br><br><button class="btn" id="go-login">Se connecter</button></div>`;
  }
  async function viewMessages() {
    const el = $('#t-messages');
    if (!S.me) { el.innerHTML = loginCard('Connectez-vous pour lire et envoyer vos messages.'); $('#go-login').onclick = () => openLogin(); return; }
    el.innerHTML = '<div class="sk skc" style="height:70px"></div><div class="sk skc" style="height:70px"></div>';
    try {
      const r = await api('/api/conversations'); const c = r.conversations || []; c.forEach(x => { S.convNames[x.id] = x.avec_nom; });
      S.unreadMsg = c.reduce((n, x) => n + (Number(x.non_lus) || 0), 0); paintBadges();
      el.innerHTML = c.length ? `<div class="lst">${c.map(x => `<a class="conv ${x.non_lus > 0 ? 'unread' : ''}" href="#/conv/${x.id}"><div class="av">${x.avec_photo ? `<img src="${attrUrl(x.avec_photo)}" alt="" onerror="this.remove()">` : esc(initials(x.avec_nom))}</div>
        <div class="sp"><div class="row"><span class="nm ell sp">${esc(x.avec_nom)}</span><span class="tm">${esc(ago(x.derniere_date))}</span></div><div class="pv ell">${esc(x.derniere_type && x.derniere_type !== 'text' ? '📎 Pièce jointe' : strip(x.derniere || x.sujet || 'Nouvelle conversation'))}</div></div>${x.non_lus > 0 ? `<span class="unr">${x.non_lus}</span>` : ''}</a>`).join('')}</div>`
        : `<div class="empty"><div class="ei">${ic('chat', 'l')}</div><b>Aucune conversation</b>Contactez une boutique ou un membre depuis son profil pour démarrer un échange.</div>`;
    } catch (e) { el.innerHTML = `<div class="empty"><b>Messagerie indisponible</b>${esc(e.message)}</div>`; }
  }
  async function paneConv(id) {
    if (!S.me) { location.hash = '#/messages'; return; }
    setPane('Conversation', '<div class="sk skc" style="height:80px"></div>');
    const render = async (scroll) => {
      let r; try { r = await api(`/api/conversations/${encodeURIComponent(id)}/messages`); } catch (e) { return setPane('Conversation', `<div class="empty"><b>Conversation inaccessible</b>${esc(e.message)}</div>`); }
      const autre = r.autre || {}; const msgs = r.messages || [];
      let last = '', html = '';
      msgs.forEach(m => {
        const d = dayLabel(m.created_at); if (d !== last) { html += `<div class="day">${esc(d)}</div>`; last = d; }
        const mine = Number(m.sender_id) === Number(S.me.id);
        const body = m.deleted ? '<i style="opacity:.75">Message supprimé</i>' : m.type && m.type !== 'text' ? `📎 ${esc(m.fichier_nom || m.type)}` : esc(m.contenu || '');
        html += `<div class="b ${mine ? 'out' : 'in'}">${body}<time>${esc(hhmm(m.created_at))}</time></div>`;
      });
      const list = $('#chat'); const atBottom = !list || (list.parentNode.scrollHeight - list.parentNode.scrollTop - list.parentNode.clientHeight < 120);
      if (!list) {
        setPane(S.convNames[id] || autre.nom || 'Conversation', `<div class="chat" id="chat">${html || '<div class="empty"><b>Aucun message</b>Écrivez le premier message.</div>'}</div>`, null, true);
        mountComposer(id, render);
      } else { list.innerHTML = html; }
      const body = $('.pbody'); if (body && (scroll || atBottom)) body.scrollTop = body.scrollHeight;
    };
    await render(true);
    clearInterval(S.chatTimer); S.chatTimer = setInterval(() => { if (S.pane && S.pane.k === 'conv') render(false); else clearInterval(S.chatTimer); }, 8000);
  }
  function mountComposer(id, rerender) {
    const f = $('#pane-foot'); f.innerHTML = `<form class="composer" style="width:100%;border:none;background:none"><textarea id="msg" rows="1" placeholder="Votre message…" aria-label="Votre message"></textarea><button class="send" aria-label="Envoyer" disabled>${ic('send')}</button></form>`;
    const ta = $('#msg'), btn = $('.send', f);
    ta.oninput = () => { btn.disabled = !ta.value.trim(); ta.style.height = 'auto'; ta.style.height = Math.min(120, ta.scrollHeight) + 'px'; };
    $('form', f).onsubmit = async ev => {
      ev.preventDefault(); const t = ta.value.trim(); if (!t) return; btn.disabled = true;
      try { await api(`/api/conversations/${encodeURIComponent(id)}/messages`, { method: 'POST', body: { contenu: t } }); ta.value = ''; ta.style.height = 'auto'; await rerender(true); }
      catch (e) { toast(e.message, true); btn.disabled = false; }
    };
  }

  /* ============================================================
     BOUTIQUES
     ============================================================ */
  function viewBoutiques() {
    const el = $('#t-boutiques');
    el.innerHTML = `<div class="search">${ic('search', 's')}<input id="bq" type="search" placeholder="Rechercher une boutique…" aria-label="Rechercher une boutique" value="${esc(S.boutiques.q)}"></div><div id="bt-bar"></div><div class="small muted" id="bt-count" style="margin:0 4px 10px"></div><div id="bt-list"></div>`;
    let t; $('#bq').oninput = e => { clearTimeout(t); t = setTimeout(() => { S.boutiques.q = e.target.value.trim(); paintBoutiques(); }, 200); };
    if (!S.boutiques.loaded) loadBoutiques(); else paintBoutiques();
  }
  function drawBtBar() {
    const bar = $('#bt-bar'); if (!bar) return; S.boutiques.f = S.boutiques.f || {}; const defs = btFilterDefs();
    bar.innerHTML = filterBar(defs, S.boutiques.f, 'bt'); bindFilterBar(bar, defs, S.boutiques.f, 'bt', () => { drawBtBar(); paintBoutiques(); });
  }
  async function loadBoutiques() {
    const l = $('#bt-list'); l.innerHTML = '<div class="sk skc"></div><div class="sk skc"></div>';
    try { const r = await api('/api/vitrines'); S.boutiques.items = r.vitrines || []; S.boutiques.loaded = true; paintBoutiques(); }
    catch (e) { l.innerHTML = `<div class="empty"><b>Impossible de charger les boutiques</b>${esc(e.message)}<br><br><button class="btn sm" id="retry">Réessayer</button></div>`; $('#retry').onclick = loadBoutiques; }
  }
  function paintBoutiques() {
    const l = $('#bt-list'); if (!l) return;
    S.boutiques.f = S.boutiques.f || {}; drawBtBar();
    const q = S.boutiques.q.toLowerCase();
    const a = S.boutiques.items.filter(v => btMatch(v) && (!q || [v.boutique_nom, v.nom, v.domaine, v.ville, v.pays, v.slogan].join(' ').toLowerCase().includes(q)));
    $('#bt-count').textContent = a.length ? `${a.length} boutique${a.length > 1 ? 's' : ''}` : '';
    if (!a.length) { l.innerHTML = `<div class="empty"><div class="ei">${ic('shop', 'l')}</div><b>Aucune boutique</b>Modifiez votre recherche ou retirez un filtre.</div>`; return; }
    l.innerHTML = a.map(v => {
      const nm = v.boutique_nom || v.nom; const prods = (v.produits_vedettes || []).slice(0, 3);
      const desc = strip(v.boutique_description || v.description || v.slogan || '');
      return `<article class="card shop"><div class="top"><div class="lg">${v.logo_url ? `<img src="${attrUrl(v.logo_url)}" alt="" onerror="this.remove()">` : esc(initials(nm))}</div>
        <div class="sp"><div class="nm">${esc(nm)}</div><div class="small muted ell">${esc([v.domaine, [v.ville, v.pays].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</div>${v.certif || v.organisation_verifiee ? `<span class="badge g" style="margin-top:4px">${ic('check', 's')} Vérifiée</span>` : ''}</div></div>
        ${desc ? `<div class="txt small" style="padding:0 14px 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(desc)}</div>` : ''}
        ${prods.length ? `<div class="prods">${prods.map(p => `<div class="p"><div class="ph">${p.photo ? `<img src="${attrUrl(p.photo)}" alt="" loading="lazy" onerror="this.remove()">` : ic('shop')}</div><div class="pn ell">${esc(p.nom)}</div><div class="pp">${p.prix != null ? esc(p.prix) + ' ' + esc(p.devise === 'EUR' || !p.devise ? '€' : p.devise) : ''}</div></div>`).join('')}</div>` : ''}
        <div class="ft"><a class="btn block sm" href="#/profil/i/${encodeURIComponent(v.id)}">Voir la boutique et le profil</a></div></article>`;
    }).join('');
  }

  /* ============================================================
     MOI — menu réduit pour téléphone
     ============================================================ */
  /* ============================================================
     ACCUEIL — reprend l'accueil général du site, version téléphone
     ============================================================ */
  S.home = { loaded: false };
  const ytId = u => { const m = /(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/.exec(String(u || '')); return m ? m[1] : null; };
  const fmtDuree = s => { s = Number(s) || 0; if (!s) return ''; return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  function money(n, dev) {
    try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: dev || 'EUR', maximumFractionDigits: 0 }).format(Number(n) || 0); }
    catch (e) { return (Number(n) || 0) + ' ' + (dev || '€'); }
  }
  function videoThumb(v) {
    if (v.miniature_url) return `<img src="${attrUrl(v.miniature_url)}" alt="" loading="lazy">`;
    const y = v.type_source === 'youtube' ? ytId(v.url) : null;
    if (y) return `<img src="https://img.youtube.com/vi/${y}/mqdefault.jpg" alt="" loading="lazy">`;
    if (v.type_source === 'bientot') return '<img src="assets/videos-bientot-disponible.jpg" alt="Bientôt disponible" loading="lazy" style="object-fit:contain;background:#EEF2F8">';
    return `<span style="font-size:34px">${esc(v.icone || '🎬')}</span>`;
  }
  function videoCard(v, wide) {
    const bientot = v.type_source === 'bientot';
    return `<a class="vcard${wide ? ' wide' : ''}" href="#/video/${v.id}"><div class="vth">${videoThumb(v)}${bientot ? '<span class="vd" style="background:var(--orange-d)">Bientôt</span>' : (v.duree_secondes ? `<span class="vd">${fmtDuree(v.duree_secondes)}</span>` : '')}${bientot ? '' : '<span class="vp">▶</span>'}</div><div class="vt">${esc(v.titre)}</div>${v.categorie ? `<div class="small muted">${esc(v.categorie)}</div>` : ''}</a>`;
  }
  const miniCard = (href, photo, nom, sub, round) => `<a class="mc" href="${href}"><div class="av big" style="border-radius:${round ? '50%' : '16px'};margin:0 auto 8px">${photo ? `<img src="${attrUrl(photo)}" alt="" loading="lazy" onerror="this.remove()">` : esc(initials(nom))}</div><div class="mn">${esc(nom)}</div>${sub ? `<div class="small muted ell">${esc(sub)}</div>` : ''}</a>`;
  const SEC_ICONS = { 'home-actus': 'fil', 'home-honneur': 'star', 'home-videos': 'play', 'home-init': 'heart', 'home-shops': 'shop', 'home-temo': 'comment', 'home-part': 'people' };
  const secHead = (titre, icone, more) => `<div class="sec"><h2 class="sec-t"><span class="sic">${ic(icone || 'star')}</span><span>${esc(titre)}</span></h2>${more || ''}</div>`;
  const homeBlock = (id, titre, html, more, sub) => { const el = $('#' + id); if (!el || !html) return; el.innerHTML = secHead(titre, SEC_ICONS[id], more) + (sub ? `<p class="sec-sub">${esc(sub)}</p>` : '') + html; };

  function viewAccueil() {
    const el = $('#t-accueil');
    if (S.home.loaded && $('#home-actus', el)) return;
    S.home.loaded = true;
    el.innerHTML = `<div id="home-annonce"></div><div id="home-honneur"></div><div id="home-videos"></div>
      <div class="card hero"><div class="pad"><div class="small" style="font-weight:700;color:var(--orange-d)">🌍 Réseau diaspora mondial</div>
        <h2 style="margin:6px 0 8px;font-size:20px;line-height:1.25">Connecter les diasporas, valoriser les talents, accélérer le développement des territoires.</h2>
        <p class="muted small" style="margin:0 0 12px">Des passerelles entre pays d’origine et pays d’accueil, grâce aux compétences, projets, organisations et initiatives portés par les diasporas du monde entier.</p>
        <div class="row" style="flex-wrap:wrap;gap:8px">${S.me ? '' : '<a class="btn sm" href="inscription.html">Créer un compte</a>'}<a class="btn sm out" href="#/annuaire">Explorer l’annuaire</a></div></div></div>
      <div class="mapcard"><canvas id="home-map" role="img" aria-label="Carte animée des déplacements des diasporas dans le monde"></canvas><div class="maplegend"><span><i style="background:#F59E0B;box-shadow:0 0 6px #F59E0B"></i>Pays d’origine</span><span><i style="background:#4A90D9;box-shadow:0 0 6px #4A90D9"></i>Pays de résidence</span></div></div>
      <div class="card"><div class="pad"><h2 class="sec-t sec-in"><span class="sic">${ic('star')}</span><span>Pourquoi Diaspo’Actif ?</span></h2>
        <p style="margin:0 0 10px">La diaspora africaine est un levier de développement majeur, mais ses initiatives restent dispersées, invisibles, sans réseau. Diaspo’Actif change ça.</p>
        <div class="tags" style="margin:0"><span class="badge">👥 Rassembler les talents</span><span class="badge">🗂️ Organiser les initiatives</span><span class="badge">🚀 Mobiliser pour un impact durable</span></div></div></div>
      <div id="home-actus"></div><div id="home-init"></div><div id="home-shops"></div><div id="home-temo"></div><div id="home-part"></div>`;
    loadHome();
    if (window.MMap) { if (S.home.stopMap) S.home.stopMap(); S.home.stopMap = window.MMap.mount($('#home-map')); }
  }
  function loadHome() {
    const safe = fn => fn().catch(() => { });
    safe(async () => {
      /* Actualités (2026-10-08, demande explicite) : les comptes-rendus publiés passent en premier, en cartouches d'événement avec aperçu ; les
         publications du fil complètent. Sans compte-rendu ni publication, le bloc n'apparaît pas. */
      const [fr, cr] = await Promise.all([api('/api/fil?mode=tous&page=1&limit=10').catch(() => ({ posts: [] })), api('/api/comptes-rendus/publies?limit=10').catch(() => ({ comptes_rendus: [] }))]);
      const crs = (cr.comptes_rendus || []).slice().sort((a, b) => String(b.publie_le || '').localeCompare(String(a.publie_le || ''))).slice(0, 3);
      const autres = (fr.posts || []).filter(p => p.type !== 'compte_rendu' && !p.compte_rendu && postHtml(p));
      const reste = autres.slice(0, Math.max(0, 5 - crs.length));
      reste.forEach(p => { postCache[p.id] = p; });
      if (!crs.length && !reste.length) return;
      homeBlock('home-actus', 'Actualités', crs.map(crCarte).join('') + reste.map(p => actuVerte(postHtml(p))).join(''), '<a href="#/actualites" class="sec-more">Toutes les actualités ›</a>', 'Les derniers comptes-rendus et publications de la communauté.');
      $$('#home-actus [data-clamp]').forEach(c => { if (c.scrollHeight > c.clientHeight + 2) { const b = c.parentNode.querySelector('[data-more]'); if (b) b.hidden = false; } });
    });
    safe(async () => {
      const a = ((await api('/api/annonces-officielles/actives')).annonces || [])[0]; if (!a) return;
      $('#home-annonce').innerHTML = `<div class="card">${a.image_url ? mediaBlock(a.image_url, { alt: a.titre }) : ''}<div class="pad"><span class="badge o">Annonce officielle</span><h3 style="margin:8px 0 4px;font-size:18px">${esc(a.titre)}</h3>${a.accroche ? `<p class="muted" style="margin:0 0 8px">${esc(strip(a.accroche))}</p>` : ''}${a.evenement_id ? `<a class="btn sm" href="#/evenement/${a.evenement_id}">Voir l’événement</a>` : ''}</div></div>`;
    });
    safe(async () => {
      const l = (await api('/api/honneur/laureats')).laureats || []; if (!l.length) return;
      homeBlock('home-honneur', 'Comptes à l’honneur', `<div class="hs">${l.map(x => miniCard(esc(/initiative\.html\?id=/.test(x.profil_url || '') ? '#/profil/i/' + String(x.profil_url).replace(/^.*id=/, '') : '#/profil/' + x.user_id), x.photo_url, x.nom, [x.ville, x.pays].filter(Boolean).join(', '), x.categorie !== 'initiative')).join('')}</div>`);
    });
    safe(async () => {
      const v = (await api('/api/videos-tutoriels?limit=8')).videos || []; if (!v.length) return;
      homeBlock('home-videos', 'Tutoriels vidéo', `<div class="hs">${v.map(x => videoCard(x)).join('')}</div>`, '<a href="#/videos" class="sec-more">Tout voir ›</a>', 'Apprenez à utiliser Diaspo’Actif en quelques minutes.');
    });
    safe(async () => {
      const r = await api('/api/annuaire/recherche?type=Initiative&q='); const l = (r.initiatives || []).slice(0, 10); if (!l.length) return;
      homeBlock('home-init', 'Initiatives à découvrir', `<div class="hs">${l.map(x => miniCard('#/profil/i/' + encodeURIComponent(x.slug || x.id), x.logo_url, x.nom, [x.ville, x.pays].filter(Boolean).join(', '))).join('')}</div>`, '<a href="#/annuaire" class="sec-more">Annuaire ›</a>');
    });
    safe(async () => {
      const l = ((await api('/api/vitrines')).vitrines || []).slice(0, 10); if (!l.length) return;
      homeBlock('home-shops', 'Boutiques de la diaspora', `<div class="hs">${l.map(v => miniCard('#/profil/i/' + encodeURIComponent(v.id), v.logo_url, v.boutique_nom || v.nom, [v.ville, v.pays].filter(Boolean).join(', '))).join('')}</div>`, '<a href="#/boutiques" class="sec-more">Toutes ›</a>');
    });
    safe(async () => {
      const l = (await api('/api/temoignages/public?limit=8')).temoignages || []; if (!l.length) return;
      homeBlock('home-temo', 'Ils ont rejoint Diaspo’Actif', `<div class="hs">${l.map(t => `<div class="card tm"><div class="pad">${t.note ? `<div style="color:#f59e0b;letter-spacing:2px">${'★'.repeat(t.note)}${'☆'.repeat(5 - t.note)}</div>` : ''}<p style="margin:6px 0 8px">« ${esc(String(t.description || '').slice(0, 200))}${String(t.description || '').length > 200 ? '…' : ''} »</p><div class="small"><b>${esc(t.nom_affichage || 'Membre Diaspo’Actif')}</b>${t.pays_utilisateur ? ' · ' + esc(t.pays_utilisateur) : ''}</div></div></div>`).join('')}</div>`);
    });
    safe(async () => {
      const l = (await api('/api/partenaires/carousel?limit=12')).partenaires || []; if (!l.length) return;
      homeBlock('home-part', 'Partenaires officiels', `<div class="hs">${l.map(p => miniCard('#/profil/' + encodeURIComponent(p.user_id), p.photo_url, [p.prenom, p.nom].filter(Boolean).join(' ') || p.nom, (p.domaines_expertise || []).slice(0, 2).join(' · '), true)).join('')}</div>`);
    });
  }

  /* ---------- tutoriels vidéo ---------- */
  async function paneVideos() {
    setPane('Tutoriels vidéo', '<div class="sk skc"></div>');
    let r; try { r = await api('/api/videos-tutoriels'); } catch (e) { return setPane('Tutoriels vidéo', `<div class="empty"><b>Indisponible</b>${esc(e.message)}</div>`); }
    const vids = r.videos || [], cats = [...new Set(vids.map(v => v.categorie).filter(Boolean))]; let cat = '';
    const draw = () => {
      const l = vids.filter(v => !cat || v.categorie === cat);
      setPane('Tutoriels vidéo', `${cats.length ? `<div class="chips"><button class="chip ${cat ? '' : 'on'}" data-c="">Toutes</button>${cats.map(c => `<button class="chip ${cat === c ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
        ${l.length ? `<div class="vgrid">${l.map(v => videoCard(v, true)).join('')}</div>` : `<div class="empty"><div class="ei">${ic('fil', 'l')}</div><b>Aucune vidéo</b>Les tutoriels arrivent bientôt.</div>`}`);
      $$('#pane-body .chip').forEach(b => b.onclick = () => { cat = b.dataset.c; draw(); });
    };
    draw();
  }
  async function paneVideo(id) {
    setPane('Tutoriel vidéo', '<div class="sk skc"></div>');
    let v, autres = [];
    try { v = (await api('/api/videos-tutoriels/' + encodeURIComponent(id))).video; } catch (e) { return setPane('Tutoriel vidéo', `<div class="empty"><b>Vidéo introuvable</b>${esc(e.message)}</div>`); }
    try { autres = ((await api('/api/videos-tutoriels')).videos || []).filter(x => String(x.id) !== String(v.id)); } catch (e) { /* la suite est facultative */ }
    const y = v.type_source === 'youtube' ? ytId(v.url) : null;
    const player = y ? `<div class="vwrap"><iframe src="https://www.youtube-nocookie.com/embed/${y}?rel=0&playsinline=1" title="${esc(v.titre)}" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`
      : v.type_source === 'mp4' ? videoBlock(v.url, v.miniature_url)
        : `<div class="vsoon"><div class="vth">${videoThumb(v)}</div><div class="vsoon-b"><span class="badge o">${ic('clock', 's')} Bientôt disponible</span><span class="small">Cette vidéo sera publiée prochainement.</span></div></div>`;
    const suite = autres.length ? `<div class="sec" style="margin-top:22px"><h2 class="sec-t"><span class="sic">${ic('play')}</span><span>À suivre</span></h2></div>
      <div class="lst">${autres.slice(0, 8).map(x => `<a class="vrow" href="#/video/${x.id}"><div class="vth">${videoThumb(x)}${x.type_source === 'bientot' ? '<span class="vd" style="background:var(--orange-d)">Bientôt</span>' : (x.duree_secondes ? `<span class="vd">${fmtDuree(x.duree_secondes)}</span>` : '')}</div><div class="sp"><div class="vt" style="margin-top:0">${esc(x.titre)}</div>${x.categorie ? `<div class="small muted">${esc(x.categorie)}</div>` : ''}</div></a>`).join('')}</div>` : '';
    setPane(v.titre, `${player}<div class="card" style="margin-top:12px"><div class="pad"><h2 style="margin:0 0 6px;font-size:19px">${esc(v.titre)}</h2><div class="tags" style="margin:0 0 8px">${v.categorie ? `<span class="badge">${esc(v.categorie)}</span>` : ''}${v.duree_secondes ? `<span class="badge">${fmtDuree(v.duree_secondes)}</span>` : ''}${v.vues ? `<span class="badge">${v.vues} vues</span>` : ''}</div>${v.description ? `<div class="rich" style="white-space:pre-line">${esc(strip(v.description))}</div>` : ''}</div></div>
      ${suite}<a class="btn out block" style="margin-top:14px" href="#/videos">Toutes les vidéos</a>`);
  }

  /* ---------- cagnottes et dons ---------- */
  function cagnotteCard(c) {
    const obj = Number(c.objectif_montant) || 0, got = Number(c.montant_collecte) || 0, pct = obj ? Math.min(100, Math.round(got * 100 / obj)) : null;
    const montants = c.afficher_montants !== 0;
    return `<article class="card cg">${c.image_url ? mediaBlock(c.image_url, { alt: c.titre }) : ''}<div class="pad">
      <div class="tags" style="margin:0 0 6px">${c.categorie ? `<span class="badge">${esc(c.categorie)}</span>` : ''}${c.type_don === 'recurrent' ? '<span class="badge o">Don récurrent</span>' : ''}</div>
      <h3 style="margin:0 0 4px;font-size:17px;line-height:1.25">${esc(md(strip(c.titre)))}</h3>
      ${c.description ? `<p class="muted small" style="margin:0 0 10px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(strip(c.description))}</p>` : ''}
      ${pct !== null && montants ? `<div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>` : ''}
      <div class="row small" style="margin:6px 0 12px">${montants ? `<span><b>${esc(money(got, c.devise))}</b>${obj ? ' sur ' + esc(money(obj, c.devise)) : ' collectés'}</span>` : '<span></span>'}<span class="sp"></span>${c.nb_contributeurs ? `<span class="muted">${c.nb_contributeurs} donateur${c.nb_contributeurs > 1 ? 's' : ''}</span>` : ''}</div>
      <a class="btn block sm" href="cagnotte.html?slug=${encodeURIComponent(c.slug)}">${ic('heart', 's')} Donner</a></div></article>`;
  }
  async function paneCagnottes(owner) {
    const nomOwner = owner && S.annNames && S.annNames[owner];
    setPane(owner ? 'Soutenir' : 'Cagnottes et dons', '<div class="sk skc"></div><div class="sk skc"></div>');
    let pub = [], mes = null;
    try { pub = (await api('/api/cagnottes/publiques' + (owner ? '?owner_user_id=' + encodeURIComponent(owner) : ''))).cagnottes || []; } catch (e) { return setPane('Cagnottes et dons', `<div class="empty"><b>Indisponible</b>${esc(e.message)}</div>`); }
    if (!owner && S.me && S.me.role === 'initiative') { try { mes = (await api('/api/cagnottes/mes')).cagnottes || []; } catch (e) { mes = []; } }
    let html = '';
    if (mes) {
      const total = mes.reduce((n, c) => n + (Number(c.montant_collecte) || 0), 0);
      const lock = premiumLocked(2);
      html += `<div class="h2" style="margin-top:2px">MES CAGNOTTES</div><div class="card"><div class="pad">
        <div class="row"><div class="sp"><b style="font-size:20px">${mes.length}</b> <span class="muted small">cagnotte${mes.length > 1 ? 's' : ''}</span></div><div><b>${esc(money(total))}</b> <span class="muted small">collectés</span></div></div>
        ${mes.slice(0, 5).map(c => `<div class="kv"><span class="ell" style="max-width:62%">${esc(md(strip(c.titre)))}</span><span>${esc(money(c.montant_collecte, c.devise))}</span></div>`).join('')}
        <a class="btn block sm ${lock ? 'out' : ''}" style="margin-top:12px" ${lock ? 'data-lock="1" href="#"' : 'href="dashboard-initiative.html#cagnottes"'}>${lock ? ic('lock', 's') + ' ' : ''}Gérer mes cagnottes ${lock ? '👑' : ''}</a></div></div>`;
    }
    html += `<div class="h2" ${mes ? '' : 'style="margin-top:2px"'}>${owner ? 'CAGNOTTES DE ' + esc(String(nomOwner || 'CE COMPTE').toUpperCase()) : 'CAGNOTTES OUVERTES'}</div>` + (pub.length ? pub.map(cagnotteCard).join('') : (owner ? `<div class="empty"><div class="ei">${ic('heart', 'l')}</div><b>Aucune cagnotte ouverte pour ${esc(nomOwner || 'ce compte')}</b>Ce compte n’a pas de cagnotte en cours pour le moment.<br><br><a class="btn out" href="#/cagnottes">Voir toutes les cagnottes</a></div>` : `<div class="empty"><div class="ei">${ic('heart', 'l')}</div><b>Aucune cagnotte ouverte</b>Revenez bientôt.</div>`));
    setPane(owner ? 'Soutenir' + (nomOwner ? ' · ' + nomOwner : '') : 'Cagnottes et dons', html);
  }

  /* ---------- changement de compte (Liaison de comptes) ---------- */
  const ROLE_LABEL = { utilisateur: 'Utilisateur', initiative: 'Initiative', collectivite: 'Collectivité', administrateur: 'Administrateur', institutionnel: 'Institution', officiel: 'Officiel' };
  async function openSwitcher() {
    if (!(await needLogin('Connectez-vous pour gérer vos comptes.'))) return;
    const sh = $('#sheet'); sh.hidden = false;
    const close = () => { sh.hidden = true; sh.innerHTML = ''; };
    sh.onclick = e => { if (e.target === sh) close(); };
    sh.innerHTML = '<div class="sh" role="dialog" aria-modal="true" aria-label="Changer de compte"><div class="grip"></div><div class="sb"><div class="sk" style="height:70px"></div></div></div>';
    let list = [];
    try { list = (await api('/api/comptes-lies')).comptes || []; } catch (e) { toast(e.message, true); }
    const body = list.length ? list.map(c => {
      const resp = [c.prenom, c.nom].filter(Boolean).join(' ') || c.nom; const nm = c.nom_affichage || resp; const actif = Number(c.id) === Number(S.me.id);
      return `<div class="li" style="cursor:default"><div class="av">${c.photo_url ? `<img src="${attrUrl(c.photo_url)}" alt="" onerror="this.remove()">` : esc(initials(nm))}</div><span class="sp"><span class="t">${esc(nm)}</span><br><span class="d">${esc(ROLE_LABEL[c.role] || c.role)}${c.statut === 'suspendu' ? ' · suspendu' : ''}</span>${c.role !== 'utilisateur' && resp && resp !== nm ? `<br><span class="d" style="font-size:10.5px;opacity:.75">resp. ${esc(resp)}</span>` : ''}</span>${actif ? '<span class="badge g">Actif</span>' : (c.statut === 'suspendu' ? '' : `<button class="btn sm" data-sw="${c.id}">Basculer</button>`)}</div>`;
    }).join('') : `<div class="empty" style="padding:22px"><div class="ei">${ic('people', 'l')}</div><b>Aucun compte lié</b>Reliez vos comptes (personnel, initiative…) pour passer de l’un à l’autre sans vous reconnecter.</div>`;
    sh.innerHTML = `<div class="sh" role="dialog" aria-modal="true" aria-label="Changer de compte"><div class="grip"></div><h2 style="margin:0 0 8px;font-size:18px">Changer de compte</h2><div class="sb"><div class="lst">${list.length ? body : ''}</div>${list.length ? '' : body}</div>
      <a class="btn out block" style="margin-top:12px" href="comptes-lies.html">${ic('plus', 's')} ${list.length ? 'Gérer / lier un compte' : 'Lier un compte'}</a></div>`;
    if (isTestEnv()) { const box = document.createElement('div'); box.innerHTML = testComptesHtml(); sh.querySelector('.sb').prepend(box); bindTestComptes(box, close); }
    $$('[data-sw]', sh).forEach(b => b.onclick = async () => {
      b.disabled = true; b.textContent = '…';
      try { const r = await api('/api/comptes-lies/basculer', { method: 'POST', body: { user_id: Number(b.dataset.sw) } }); S.me = r.user || S.me; close(); toast('Compte changé ✓'); S.premium = null; await afterAuthChange(); location.hash = '#/accueil'; }
      catch (e) { toast(e.message, true); b.disabled = false; b.textContent = 'Basculer'; }
    });
  }
  function premiumSheet(nom) {
    const sh = $('#sheet'); sh.hidden = false; const close = () => { sh.hidden = true; sh.innerHTML = ''; };
    sh.onclick = e => { if (e.target === sh) close(); };
    sh.innerHTML = `<div class="sh" role="dialog" aria-modal="true" aria-label="Module Premium"><div class="grip"></div><div class="sb" style="text-align:center;padding:6px 4px 12px"><div class="ei" style="width:64px;height:64px;border-radius:50%;background:var(--orange-l);color:var(--orange-d);display:flex;align-items:center;justify-content:center;margin:4px auto 10px">${ic('lock', 'l')}</div>
      <h2 style="margin:0 0 6px;font-size:19px">Module Premium 👑</h2><p class="muted" style="margin:0 0 14px">${esc(nom || 'Ce module')} fait partie de l’abonnement Premium. Votre abonnement est arrivé à expiration : renouvelez-le pour retrouver l’accès.</p>
      <a class="btn block" href="mon-abonnement.html">Voir mon abonnement</a><button class="btn out block" id="ps-close" style="margin-top:10px">Plus tard</button></div></div>`;
    $('#ps-close').onclick = close;
  }
  document.addEventListener('click', e => {
    const lk = e.target.closest('[data-lock]'); if (lk) { e.preventDefault(); premiumSheet(lk.dataset.name || ''); return; }
    if (e.target.closest('[data-act=switch]')) { e.preventDefault(); openSwitcher(); }
  });

  /* ============================================================
     MOI — menu des modules selon le type de compte et le Premium
     r[rôle] : 0 absent · 1 libre · 2 Premium (verrouillé si expiré) · 3 libre, une partie est Premium
     ============================================================ */
  const MODS = [
    { t: 'Mes événements', i: 'cal', h: '#/mesevenements', d: 'Créer et gérer vos événements', r: { initiative: 2 } },
    { t: 'Cotisations et adhésions', i: 'people', h: '#/cotisations', d: 'Formules, adhérents, paiements', r: { initiative: 2 } },
    { t: 'Messages de la boutique', i: 'shop', h: '#/msgboutique', d: 'Demandes reçues via votre boutique', r: { initiative: 2 } },
    { t: 'Messagerie', i: 'chat', h: '#/messages', d: 'Vos conversations', r: { utilisateur: 1, initiative: 1 } },
    { t: 'Mes billets', i: 'ticket', h: '#/billets', d: 'Inscriptions et QR codes d’entrée', r: { utilisateur: 1, initiative: 1 } },
    { t: 'Cagnottes et dons', i: 'heart', h: '#/cagnottes', d: { utilisateur: 'Soutenir les cagnottes ouvertes', initiative: 'Vos cagnottes et les dons reçus' }, r: { initiative: 2 } },
    { t: 'Mon Associé', i: 'people', h: '#/associe', d: { utilisateur: 'Consulter les annonces, candidater', initiative: 'Annonces d’associés · publier = Premium' }, r: { utilisateur: 1, initiative: 3 } },
    { t: 'Mon Réseau Pro', i: 'brief', h: '#/reseaupro', d: 'Contacts et réseau professionnel', r: { utilisateur: 2, initiative: 1 } },
    { t: 'Business Plans', i: 'file', h: '#/businessplan', d: 'Construire et défendre vos projets', r: { utilisateur: 2, initiative: 2 } },
    { t: 'Formations', i: 'book', h: '#/formations', d: 'Catalogue et formations suivies', r: { utilisateur: 1, initiative: 1 } },
    { t: 'CV, lettres, candidatures', i: 'doc', h: '#/cvlettres', d: 'Vos documents de candidature', r: { utilisateur: 1 } },
    { t: 'Parrainage', i: 'gift', h: '#/parrainage', d: 'Invitez vos proches', r: { utilisateur: 1, initiative: 1 } }
  ];
  const MODS_COMPTE = [
    { t: 'Confidentialité', i: 'lock', h: '#/confidentialite', d: 'Vos données et votre visibilité', r: { utilisateur: 1, initiative: 1 } },
    { t: 'Mon abonnement', i: 'star', h: '#/abonnement', d: 'Premium et échéances', r: { utilisateur: 1, initiative: 1 } },
    { t: 'Liaison de comptes', i: 'people', h: '#', act: 'switch', d: 'Passer d’un compte à un autre', r: { utilisateur: 1, initiative: 1 } }
  ];
  const MENU_DESK = ['Soumettre à Diaspo’Actif', 'Mes projets', 'Évaluation de projet', 'CRM partagé', 'Emploi et stages', 'Paiements', 'Mes demandes de devis', 'Ma localisation', 'Programmation', 'Support pilote', 'Apparence', 'Mes statistiques'];
  async function loadPremium() {
    try { S.premium = await api('/api/premium/statut'); } catch (e) { S.premium = null; }
    if (S.tab === 'moi') viewMoi();
  }
  function premiumLocked(level) { return level === 2 && !!S.premium && S.premium.concerne && !S.premium.actif; }
  /* Lignes des modules visibles pour ce compte (type de compte + Premium) — partagées par l'onglet « Moi » et le menu rapide du haut. */
  function modulesHtml(m) {
    const role = (m.role === 'utilisateur' || m.role === 'initiative') ? m.role : null;
    const lvl = x => role ? (x.r[role] || 0) : (x.r.utilisateur === 1 && x.r.initiative === 1 ? 1 : 0);
    const li = x => {
      const l = lvl(x); if (!l) return '';
      const locked = premiumLocked(l), d = typeof x.d === 'object' ? (x.d[role] || x.d.utilisateur) : x.d;
      const tag = l === 2 ? `<span class="prem">${locked ? '🔒' : '👑'} Premium</span>` : (l === 3 && S.premium && S.premium.concerne && !S.premium.actif ? '<span class="prem">👑 publier</span>' : '');
      const inner = `<span class="ic">${ic(locked ? 'lock' : x.i)}</span><span class="sp"><span class="t">${esc(x.t)}</span> ${tag}<br><span class="d">${esc(d)}</span></span><span class="ch">${ic('chev', 's')}</span>`;
      if (locked) return `<a class="li gold locked" href="#" data-lock="1" data-name="${esc(x.t)}">${inner}</a>`;
      return `<a class="li${l === 2 ? ' gold' : ''}" href="${esc(x.h)}" ${x.act ? `data-act="${x.act}"` : ''}>${inner}</a>`;
    };
    /* Comme le menu du site : les modules Premium (dorés) d'abord, puis les autres (blancs). */
    return { role, premium: MODS.filter(x => lvl(x) === 2).map(li).join(''), mods: MODS.filter(x => lvl(x) !== 2).map(li).join(''), compte: MODS_COMPTE.map(li).join('') };
  }
  function openMenu() {
    if (!S.me) { openLogin(); return; }
    const m = S.me, resp = [m.prenom, m.nom].filter(Boolean).join(' ') || m.email, nm = m.nom_affichage || resp;
    const prem = S.premium && S.premium.concerne ? (S.premium.actif ? '👑 Premium actif' : '🔒 Premium expiré') : '';
    const { premium: modsPrem, mods, compte } = modulesHtml(m);
    const close = openSheet(`<div class="row" style="margin:0 0 6px"><div class="av big" style="width:48px;height:48px">${m.photo_url ? `<img src="${attrUrl(m.photo_url)}" alt="" onerror="this.remove()">` : esc(initials(nm))}</div><div class="sp"><div style="font-weight:700;font-size:17px;line-height:1.2">${esc(nm)}</div><div class="small muted">${esc(ROLE_LABEL[m.role] || m.role)}${prem ? ' · ' + prem : ''}</div></div></div>
      <div class="h2" style="margin-top:12px">MENU DES MODULES</div>
      <div class="lst"><a class="li" href="#/accueil"><span class="ic">${ic('home')}</span><span class="sp"><span class="t">Accueil</span><br><span class="d">Tutoriels vidéo, actualités, initiatives</span></span><span class="ch">${ic('chev', 's')}</span></a></div>
      ${modsPrem ? `<div class="h2">⭐ MODULES PREMIUM</div><div class="lst">${modsPrem}</div>` : ''}
      <div class="h2">OUTILS</div><div class="lst">${mods}</div>
      <div class="h2">MON COMPTE</div><div class="lst">${compte}<a class="li" href="#/moi"><span class="ic">${ic('user')}</span><span class="sp"><span class="t">Mon espace</span><br><span class="d">Profil, tout le menu et les outils sur ordinateur</span></span><span class="ch">${ic('chev', 's')}</span></a></div>
      <button class="btn out block" id="menu-switch" style="margin-top:14px">${ic('people', 's')} Changer de compte</button>
      <button class="btn out block" id="menu-logout" style="margin-top:10px">${ic('logout', 's')} Se déconnecter</button>`);
    const sh = $('#sheet'); sh.querySelector('.sh').classList.add('dark');
    /* un lien du menu referme la feuille ; les verrous Premium et le changement de compte ouvrent leur propre feuille */
    $$('a.li', sh).forEach(a => a.addEventListener('click', () => { if (!a.dataset.lock && !a.dataset.act) close(); }));
    $('#menu-switch').onclick = () => { close(); openSwitcher(); };
    $('#menu-logout').onclick = () => { close(); logout(); };
  }
  function viewMoi() {
    const el = $('#t-moi');
    if (!S.me) {
      el.innerHTML = `${loginCard('Connectez-vous pour accéder à vos modules, vos billets et vos paramètres.')}<div class="lst" style="margin-top:6px"><a class="li" href="index.html?version=ordinateur"><span class="ic">${ic('desk')}</span><span class="sp"><span class="t">Découvrir Diaspo’Actif</span><br><span class="d">Présentation de la plateforme</span></span><span class="ch">${ic('chev', 's')}</span></a></div>`;
      $('#go-login').onclick = () => openLogin(); return;
    }
    const m = S.me, role = (m.role === 'utilisateur' || m.role === 'initiative') ? m.role : null;
    const resp = [m.prenom, m.nom].filter(Boolean).join(' ') || m.email; const nm = m.nom_affichage || resp;
    const prem = S.premium && S.premium.concerne ? (S.premium.actif ? '👑 Premium actif' : '🔒 Premium expiré') : '';
    const { premium: modsPrem, mods, compte } = modulesHtml(m);
    el.innerHTML = `<a class="me" href="profil-app.html?id=${encodeURIComponent(m.id)}"><div class="av big">${m.photo_url ? `<img src="${attrUrl(m.photo_url)}" alt="" onerror="this.remove()">` : esc(initials(nm))}</div><div class="sp"><div class="nm ell">${esc(nm)}</div><div class="sub">${esc(ROLE_LABEL[m.role] || m.role)}${prem ? ' · ' + prem : ''}</div><div class="sub" style="margin-top:2px">Voir mon profil ›</div>${m.role !== 'utilisateur' && resp && resp !== nm ? `<div class="sub" style="font-size:10.5px;opacity:.7;margin-top:2px">Responsable : ${esc(resp)}</div>` : ''}</div></a>
      <button class="btn out block" id="me-switch" style="margin:10px 0 0">${ic('people', 's')} Changer de compte</button>
      <div class="mdark"><div class="h2" style="margin-top:0">MENU DES MODULES</div>
        ${modsPrem ? `<div class="h2">⭐ MODULES PREMIUM</div><div class="lst">${modsPrem}</div>` : ''}
        <div class="h2">OUTILS</div><div class="lst">${mods}</div>
        <div class="h2">MON COMPTE</div><div class="lst">${compte}</div></div>
      ${role ? '' : '<p class="small muted" style="margin:12px 4px 0">Ce type de compte retrouve ses outils complets sur le site : <a href="dashboard-' + esc(m.role === 'administrateur' ? 'administrateur' : 'collectivite') + '.html" style="text-decoration:underline">ouvrir mon tableau de bord</a>.</p>'}
      <button class="toggle" id="desk-toggle" aria-expanded="false">${ic('desk', 's')} Disponible sur ordinateur (${MENU_DESK.length})</button>
      <div id="desk-list" hidden><p class="small muted" style="margin:10px 4px">Ces outils sont plus confortables sur grand écran. Ouvrez Diaspo’Actif depuis votre ordinateur pour les utiliser.</p><div class="lst">${MENU_DESK.map(t => `<div class="li dim"><span class="ic">${ic('desk')}</span><span class="sp"><span class="t">${esc(t)}</span></span></div>`).join('')}</div></div>
      <button class="btn out block" id="logout" style="margin-top:18px">${ic('logout', 's')} Se déconnecter</button>
      <p class="small muted" style="text-align:center;margin:14px 0 0">Version téléphone · <a href="index.html?version=ordinateur" style="text-decoration:underline">Version ordinateur</a> · <a href="dashboard-${esc(m.role === 'initiative' ? 'initiative' : (m.role === 'utilisateur' ? 'utilisateur' : 'collectivite'))}.html?version=ordinateur" style="text-decoration:underline">Ouvrir le site complet</a></p>`;
    $('#desk-toggle').onclick = e => { const l = $('#desk-list'); l.hidden = !l.hidden; e.currentTarget.setAttribute('aria-expanded', String(!l.hidden)); };
    $('#logout').onclick = logout; $('#me-switch').onclick = openSwitcher;
  }

  /* ---------- billets ---------- */
  async function paneBillets() {
    if (!(await needLogin('Connectez-vous pour voir vos billets.'))) { location.hash = '#/moi'; return; }
    setPane('Mes billets', '<div class="sk skc" style="height:90px"></div><div class="sk skc" style="height:90px"></div>');
    let paid = [], free = [];
    try { paid = (await api('/api/tickets/mes')).tickets || []; } catch (e) { }
    try { free = (await api('/api/evenements/participants/mine')).inscriptions || []; } catch (e) { }
    const items = [
      ...paid.map(t => ({ k: 't', id: t.id, titre: t.event_titre, date: t.date_debut, lieu: [t.ville, t.pays].filter(Boolean).join(', '), lib: t.type_nom || 'Billet', col: t.type_couleur || '#1E4F8A', statut: t.statut })),
      ...free.map(i => ({ k: 'p', id: i.id, titre: i.event_titre, date: i.date_evt, lieu: [i.ville, i.pays].filter(Boolean).join(', '), lib: 'Inscription gratuite', col: '#1A7A52', statut: 'valide' }))
    ];
    const html = items.length ? items.map(i => `<a class="tk" href="#/billet/${i.k}/${i.id}"><div class="h" style="background:${esc(/^#[0-9a-f]{3,8}$/i.test(i.col) ? i.col : '#1E4F8A')}"><b>${esc(i.titre)}</b><span>${esc(i.lib)}</span></div><div class="b2"><span>${esc(dateLong(i.date) || '')}</span><span class="ell">${esc(i.lieu)}</span></div></a>`).join('')
      : `<div class="empty"><div class="ei">${ic('ticket', 'l')}</div><b>Aucun billet pour le moment</b>Inscrivez-vous à un événement : votre billet et son QR code apparaîtront ici.<br><br><a class="btn" href="#/evenements">Voir les événements</a></div>`;
    setPane('Mes billets', html);
  }
  async function paneBillet(kind, id) {
    if (!S.me) { location.hash = '#/billets'; return; }
    setPane('Mon billet', '<div class="sk skc"></div>');
    try {
      const r = await api(kind === 't' ? `/api/tickets/${encodeURIComponent(id)}` : `/api/evenements/participants/${encodeURIComponent(id)}`);
      const t = r.ticket || r.inscription; const titre = t.event_titre;
      const date = t.date_debut || t.date_evt; const lieu = [t.adresse, t.ville, t.pays].filter(Boolean).join(', ');
      const rows = [['Événement', titre], ['Date', dateLong(date)], ['Lieu', lieu], ['Titulaire', t.user_nom || t.nom_complet || [S.me.prenom, S.me.nom].join(' ')], ['Catégorie', t.type_nom || 'Inscription gratuite'], t.nb_personnes > 1 ? ['Personnes', t.nb_personnes] : null, ['Organisateur', t.organisateur_nom]].filter(x => x && x[1]);
      setPane('Mon billet', `<div class="card"><div class="pad"><div class="qr" id="qr" role="img" aria-label="QR code d’entrée"></div><p class="small muted" style="text-align:center;margin:0 0 6px">Présentez ce code à l’entrée</p>${rows.map(([k, v]) => `<div class="kv"><span>${esc(k)}</span><span>${esc(v)}</span></div>`).join('')}</div></div>`);
      const draw = () => { const q = $('#qr'); if (q && r.qr_payload && window.QRCode) { q.innerHTML = ''; new QRCode(q, { text: r.qr_payload, width: 220, height: 220, colorDark: '#0D2B4E', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); } else if (q && !window.QRCode) setTimeout(draw, 300); };
      draw();
    } catch (e) { setPane('Mon billet', `<div class="empty"><b>Billet inaccessible</b>${esc(e.message)}</div>`); }
  }

  /* ---------- notifications ---------- */
  async function paneNotifs() {
    if (!(await needLogin('Connectez-vous pour voir vos notifications.'))) { location.hash = '#/fil'; return; }
    setPane('Notifications', '<div class="sk skc" style="height:80px"></div>');
    try {
      const r = await api('/api/notifications?limit=30'); const l = r.notifications || [];
      const href = n => {
        const d = n.data || {};
        if (d.lien) {
          const L = String(d.lien), ev = /evenements-app\.html\?gerer_evenement=(\d+)/.exec(L), cr = /compte-rendu\.html\?evt=(\d+)/.exec(L);
          return ev ? '#/mesevenements/' + ev[1] + '/inscrits' : cr ? '#/cr/' + cr[1] : L;
        }
        if (d.demande_id) return '#/reseaupro/contacts';
        if (d.conversation_id) return '#/conv/' + d.conversation_id;
        if (d.evenement_id || d.event_id) return '#/evenement/' + (d.evenement_id || d.event_id);
        if (d.follower_id) return '#/profil/' + d.follower_id;
        if (d.initiative_id) return '#/profil/i/' + d.initiative_id;
        if (d.formation_id) return '#/formations/' + d.formation_id;
        if (d.cta === 'passer_premium') return '#/abonnement';
        return '#/accueil';
      };
      const html = l.length ? `<div class="lst">${l.map(n => `<a class="li" ${n.data && n.data.with_user_id ? `href="#" data-write="${esc(n.data.with_user_id)}"` : `href="${esc(href(n))}"`} style="${n.lue ? '' : 'background:var(--orange-l)'}"><span class="ic">${ic('bell')}</span><span class="sp"><span class="t">${esc(n.titre)}</span><br><span class="d">${esc(strip(n.contenu || '').slice(0, 110))} · ${esc(ago(n.created_at))}</span></span></a>`).join('')}</div>` : `<div class="empty"><div class="ei">${ic('bell', 'l')}</div><b>Aucune notification</b>Vous êtes à jour.</div>`;
      setPane('Notifications', html);
      if (r.non_lues) { api('/api/notifications/lire-tout', { method: 'POST', body: {} }).then(() => { S.unreadNotif = 0; paintBadges(); }).catch(() => { }); }
    } catch (e) { setPane('Notifications', `<div class="empty"><b>Indisponible</b>${esc(e.message)}</div>`); }
  }

  /* ---------- panneau plein écran ---------- */
  /* Partage d'un lien public (2026-10-07, demande explicite) : événements, publications, comptes-rendus. Le destinataire ouvre le
     lien SANS compte Diaspo'Actif (pages publiques, voir m-redirect.js pour l'arrivée sur téléphone). Pas de « text » : WhatsApp
     collerait ce texte avant le lien au lieu de déplier l'aperçu (même constat que le partage d'événement du site). */
  async function partagerLien(url, titre) {
    try { if (navigator.share) { await navigator.share({ title: titre || 'Diaspo’Actif', url }); return; } }
    catch (er) { if (er && er.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Lien copié ✓'); return; } catch (er) { /* presse-papiers refusé */ }
    openSheet('<h3 style="margin:0 0 8px">Partager</h3><p class="small muted" style="margin:0 0 8px">Copiez ce lien : il s’ouvre sans compte.</p><input class="fi" id="sh-url" readonly value="' + esc(url) + '">');
    const i = $('#sh-url'); if (i) { i.focus(); i.select(); }
  }
  /* Lien unique à chaque partage (&r=) : WhatsApp garde un aperçu raté pour toujours par adresse exacte (voir partagerEvenement du site). */
  const jetonPartage = () => Date.now().toString(36);
  function paneShare(url, titre) {
    const b = $('#pane-share'); if (!b) return;
    b.hidden = false; b.onclick = () => partagerLien(url, titre);
  }
  function setPane(title, html, foot, keepFoot) {
    const p = $('#pane'); p.hidden = false; document.body.style.overflow = 'hidden';
    if (!p.dataset.built) {
      p.innerHTML = `<div class="phead"><button class="ibtn" id="pane-back" aria-label="Retour">${ic('back')}</button><h2 id="pane-title"></h2><button class="ibtn" id="pane-share" aria-label="Partager" hidden>${ic('share')}</button></div><div class="pbody" id="pane-body"></div><div class="pfoot" id="pane-foot" hidden></div>`;
      p.dataset.built = '1'; $('#pane-back').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/' + (S.tab || 'fil'); };
    }
    $('#pane-title').textContent = title || '';
    const psh = $('#pane-share'); if (psh) { psh.hidden = true; psh.onclick = null; }
    const b = $('#pane-body'); b.innerHTML = html; if (!keepFoot || true) b.scrollTop = 0;
    const f = $('#pane-foot');
    if (keepFoot) { f.hidden = false; f.style.padding = '0'; }
    else { f.style.padding = ''; f.hidden = !foot; f.innerHTML = foot || ''; }
  }
  function closePane() {
    const p = $('#pane'); if (!p || p.hidden) { S.pane = null; return; }
    p.hidden = true; document.body.style.overflow = ''; clearInterval(S.chatTimer); S.pane = null;
    const f = $('#pane-foot'); if (f) { f.innerHTML = ''; f.hidden = true; }
  }
  const SITE_PAGES = { mesevenements: 'dashboard-initiative.html#evenements', cotisations: 'dashboard-initiative.html#adhesions-init', msgboutique: 'dashboard-initiative.html#messages-vitrine', associe: 'mon-associe.html', reseaupro: 'reseau.html', businessplan: 'business-plan.html', formations: 'formations.html', cvlettres: 'dashboard-utilisateur.html', parrainage: 'parrainage.html', confidentialite: 'confidentialite.html', abonnement: 'mon-abonnement.html' };
  function openSheet(inner) {
    const sh = $('#sheet'); sh.hidden = false; const close = () => { sh.hidden = true; sh.innerHTML = ''; };
    sh.innerHTML = '<div class="sh" role="dialog" aria-modal="true"><div class="grip"></div><div class="sb">' + inner + '</div></div>';
    sh.onclick = e => { if (e.target === sh) close(); }; return close;
  }
  function openPane(a, b, c) {
    S.pane = { k: a === 'conv' ? 'conv' : a };
    const done = () => { renderTop(); };
    if (a === 'evenement') paneEvent(b);
    else if (a === 'conv') paneConv(b);
    else if (a === 'billets') paneBillets();
    else if (a === 'billet') paneBillet(b, c);
    else if (a === 'notifs') paneNotifs();
    else if (a === 'post') panePost(b);
    else if (a === 'cr') paneCR(b, c);
    else if (a === 'actualites') paneActus();
    else if (a === 'cagnottes') paneCagnottes(b);
    else if (a === 'videos') paneVideos();
    else if (a === 'video') paneVideo(b);
    else if (window.MMods && typeof window.MMods[a] === 'function') window.MMods[a](b, c);
    else if (SITE_PAGES[a]) { attendreModule(a, b, c); return; }
    else { location.hash = '#/accueil'; return; }
    done();
  }
  /* Un écran « m-mod-*.js » pas encore chargé (réseau mobile lent, fichier en échec) ne renvoie JAMAIS vers l'ancienne page du site
     (2026-10-08, signalé : le compte initiative « revenait par moment à l'ancienne interface » — Mes événements, Cotisations et Messages boutique
     pointaient vers l'ancien tableau de bord dès que leur fichier n'était pas encore arrivé). On attend la fin du chargement ; si l'écran manque
     vraiment, un message propose de réessayer. L'ancienne page n'est proposée que sur demande explicite, en petit. */
  function attendreModule(a, b, c) {
    setPane('Chargement…', '<div class="sk skc"></div><div class="sk skc" style="height:120px"></div>');
    const verifie = () => {
      if (window.MMods && typeof window.MMods[a] === 'function') { window.MMods[a](b, c); renderTop(); return; }
      setPane('Chargement impossible', `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>Cet écran n’a pas pu se charger</b>Vérifiez votre connexion puis réessayez.<br><br><button class="btn" id="mod-retry">Réessayer</button><br><br><a class="small" style="text-decoration:underline" href="${attrUrl(SITE_PAGES[a])}">Ouvrir la page de l’ancien site</a></div>`);
      $('#mod-retry').onclick = () => location.reload();
    };
    if (document.readyState === 'complete') verifie(); else window.addEventListener('load', verifie, { once: true });
  }

  /* ---------- démarrage ---------- */
  /* Un téléphone dont le navigateur est réglé sur « Version pour ordinateur » (réglage mémorisé par site) affiche la page sur ~980 px de large :
     tout paraît minuscule. On le détecte (écran tactile étroit, mais zone d'affichage large) et on explique comment corriger. */
  function checkDesktopMode() {
    try {
      const touch = window.matchMedia && matchMedia('(any-pointer:coarse)').matches;
      const sw = Math.min(screen.width, screen.height);
      if (!touch || sw > 600 || window.innerWidth < 700) return;
      if (sessionStorage.getItem('m-desk-off')) return;
    } catch (e) { return; }
    const b = document.createElement('div'); b.id = 'desk-banner'; b.setAttribute('role', 'alert');
    b.innerHTML = '<b>Affichage réduit :</b> votre navigateur est en « version pour ordinateur ». Ouvrez le menu ⋮ du navigateur puis décochez <b>Version pour ordinateur</b> pour un affichage adapté au téléphone. <button type="button" aria-label="Fermer">OK</button>';
    b.querySelector('button').onclick = () => { b.remove(); try { sessionStorage.setItem('m-desk-off', '1'); } catch (e) { } };
    document.body.insertBefore(b, document.body.firstChild);
  }
  /* Bandeau « TEST PRIVÉ » : visible partout hors du vrai site, pour ne jamais confondre la version de test et la version publique. */
  function marquerTestPrive() {
    if (!isTestEnv()) return;
    const t = document.createElement('div'); t.id = 'test-ribbon'; t.setAttribute('aria-hidden', 'true'); t.textContent = 'TEST PRIVÉ · données fictives';
    document.body.appendChild(t); document.title = 'TEST · ' + document.title;
  }
  /* Une page restée ouverte pendant une mise à jour garde l'ancien code en mémoire : on compare sa version à celle de m.html et on propose d'actualiser. */
  function versionPage() { const s = Array.from(document.scripts).find(x => /assets\/m\.js/.test(x.src)); const m = s && /[?&]v=([^&]+)/.exec(s.src); return m ? m[1] : ''; }
  async function verifierVersion() {
    if (document.getElementById('maj-banner')) return;
    try {
      const t = await (await fetch('m.html', { cache: 'no-store' })).text(); const m = /assets\/m\.js\?v=([A-Za-z0-9._-]+)/.exec(t); const cur = versionPage();
      if (m && cur && m[1] !== cur) {
        const b = document.createElement('div'); b.id = 'maj-banner'; b.setAttribute('role', 'alert');
        b.innerHTML = 'Une nouvelle version est disponible. <button type="button">Actualiser</button>';
        b.querySelector('button').onclick = () => { location.reload(); };
        document.body.appendChild(b);
      }
    } catch (e) { /* hors connexion : on réessaiera plus tard */ }
  }
  async function init() {
    marquerTestPrive();
    if (isTestEnv()) await new Promise(r => { const s = document.createElement('script'); s.src = 'assets/m-test.js'; s.onload = s.onerror = r; document.head.appendChild(s); });
    checkDesktopMode();
    $('#view').innerHTML = TABS.map(t => `<section id="t-${t}" hidden></section>`).join('');
    window.addEventListener('hashchange', () => route());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const v = $('.viewer'); if (v) v.remove(); } });
    /* Les modules « m-mod-*.js » sont chargés en différé après ce fichier : on attend qu'ils soient tous exécutés (DOMContentLoaded) avant de router, sinon une route de module arrivait avant son enregistrement et renvoyait vers la page du site. */
    /* readyState vaut déjà « interactive » pendant l'exécution des scripts différés : on attend l'événement, avec un délai de secours si jamais il est déjà passé. */
    if (document.readyState !== 'complete') await Promise.race([new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true })), new Promise(r => setTimeout(r, 1500))]);
    await loadMe();
    route(true);
    setInterval(() => { if (!document.hidden) { refreshBadges(); verifierVersion(); } }, 45000); setTimeout(verifierVersion, 4000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { refreshBadges(); verifierVersion(); } });
    if ('serviceWorker' in navigator) { /* le site est « réseau uniquement » : rien à enregistrer */ }
  }
  window.MMods = window.MMods || {};
  window.MApp = { S, api, esc, strip, md, linkify, richHtml, ic, ICONS, setPane, paneShare, partagerLien, jetonPartage, closePane, openSheet, toast, needLogin, openLogin, loginCard, mediaBlock, videoBlock, money, dateLong, parseDay, ago, hhmm, dayLabel, initials, attrUrl, safeUrl, premiumLocked, premiumSheet, loadPremium, afterAuthChange, ROLE_LABEL };
  init();
})();

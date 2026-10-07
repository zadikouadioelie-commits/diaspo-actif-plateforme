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
  function videoBlock(url) {
    const u = attrUrl(url); if (!u) return '';
    return `<div class="media"><video controls playsinline preload="metadata" src="${u}"></video></div>`;
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
    ann: { type: '', q: '', items: [], total: 0, shown: 30, loaded: false },
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
      sh.onclick = e => { if (e.target === sh) close(false); };
      $('#lno').onclick = () => close(false);
      $('#lf').onsubmit = async ev => {
        ev.preventDefault();
        const email = $('#le').value.trim(), password = $('#lp').value;
        const err = $('#lerr'); err.textContent = '';
        if (!email || !password) { err.textContent = 'Saisissez votre e-mail et votre mot de passe.'; return; }
        const go = $('#lgo'); go.disabled = true; go.textContent = 'Connexion…';
        try {
          const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
          if (r.user) {
            S.me = r.user; toast('Bienvenue' + (r.user.role === 'utilisateur' && r.user.prenom ? ' ' + r.user.prenom : '') + ' !'); close(true);
            await afterAuthChange();
          } else {
            err.innerHTML = esc(r.message || r.error || 'Une confirmation est nécessaire.') + ` <a href="login.html?redirect=${encodeURIComponent('/m.html')}" style="color:var(--navy2);font-weight:700;text-decoration:underline">Continuer sur la page de connexion</a>`;
            go.disabled = false; go.textContent = 'Se connecter';
          }
        } catch (e) {
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
      : `<button class="pill-cta" id="top-login">Connexion</button>`;
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
    else if (cr && cr.titre) extra = `<div class="promo"><div class="small muted">Compte-rendu</div><b>${esc(cr.titre)}</b></div>`;
    const liked = !!p.user_a_aime, nLike = (p.reactions && p.reactions.like) || 0;
    return `<article class="card post" data-id="${p.id}">
      <div class="head"><div class="av">${photo ? `<img src="${attrUrl(photo)}" alt="" loading="lazy" onerror="this.remove()">` : esc(initials(name))}</div>
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
    const html = S.fil.posts.map(postHtml).join('');
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
    if (more) { const c = more.parentNode.querySelector('[data-clamp]'); c.style.webkitLineClamp = 'unset'; c.style.display = 'block'; more.remove(); return; }
    const z = e.target.closest('[data-zoom]'); if (z) { zoom(z.dataset.zoom); return; }
    const a = e.target.closest('.post [data-act]'); if (!a) return;
    const card = a.closest('.post'), id = card.dataset.id, post = S.fil.posts.find(p => String(p.id) === String(id));
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
      const url = location.origin + '/index.html';
      const txt = strip((post && (post.titre || post.corps)) || 'Publication sur Diaspo’Actif');
      try { if (navigator.share) await navigator.share({ title: 'Diaspo’Actif', text: txt, url }); else { await navigator.clipboard.writeText(url); toast('Lien copié'); } } catch (er) { /* annulé */ }
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
  function viewEvents() {
    const el = $('#t-evenements');
    el.innerHTML = `<div class="search">${ic('search', 's')}<input id="evq" type="search" placeholder="Rechercher un événement…" aria-label="Rechercher un événement" value="${esc(S.ev.q)}"></div>
      <div class="chips">${[['avenir', 'À venir'], ['passes', 'Terminés'], ['gratuit', 'Gratuits'], ['mes', 'Mes inscriptions']].map(([k, l]) => `<button class="chip ${S.ev.filtre === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
      <div id="ev-list"></div>`;
    $$('.chip', el).forEach(c => c.onclick = async () => {
      if (c.dataset.f === 'mes' && !(await needLogin('Connectez-vous pour retrouver vos inscriptions.'))) return;
      S.ev.filtre = c.dataset.f; viewEvents();
    });
    let t; $('#evq').oninput = e => { clearTimeout(t); t = setTimeout(() => { S.ev.q = e.target.value.trim(); paintEvents(); }, 200); };
    if (!S.ev.loaded) loadEvents(); else paintEvents();
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
    const q = S.ev.q.toLowerCase();
    let a = S.ev.items.filter(e => !q || [e.titre, e.ville, e.pays, e.lieu, e.organisateur_nom].join(' ').toLowerCase().includes(q));
    const f = S.ev.filtre;
    if (f === 'avenir') a = a.filter(e => !e.est_termine);
    else if (f === 'passes') a = a.filter(e => e.est_termine).reverse();
    else if (f === 'gratuit') a = a.filter(e => !e.est_termine && (e.type_participation || 'gratuit') === 'gratuit' && !(e.prix_min > 0));
    else if (f === 'mes') a = a.filter(e => S.myInsc.has(Number(e.id)));
    if (!a.length) { l.innerHTML = `<div class="empty"><div class="ei">${ic('cal', 'l')}</div><b>Aucun événement</b>${f === 'mes' ? 'Vous n’êtes inscrit à aucun événement pour le moment.' : 'Essayez un autre filtre ou une autre recherche.'}</div>`; return; }
    l.innerHTML = a.map(evtCard).join('');
  }
  function evtCard(e) {
    const p = parseDay(e.date_evt); const cov = evtCover(e);
    const paid = e.prix_min > 0 || e.type_participation === 'payant';
    const part = e.type_participation === 'partiellement_payant' ? 'Partiellement payant' : paid ? 'Payant' : 'Gratuit';
    const inscrit = S.myInsc.has(Number(e.id));
    return `<a class="card ev" href="#/evenement/${e.id}" style="display:block">
      <div class="cov">${p ? `<div class="dt"><b>${p.d}</b><span>${MOIS[p.m - 1]}</span></div>` : ''}${cov ? mediaBlock(cov, { alt: e.titre }) : `<div class="media" style="min-height:78px;background:linear-gradient(135deg,var(--navy),var(--navy2))"></div>`}</div>
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
        ${e.organisateur_nom || ev.organisateur_nom ? `<p class="small muted" style="margin:12px 0 0">Organisé par <b style="color:var(--text)">${esc(ev.organisateur_nom || e.organisateur_nom)}</b></p>` : ''}</div></div>
      ${desc ? `<div class="card"><div class="pad rich" style="white-space:pre-line">${esc(desc)}</div></div>` : ''}
      ${e.lien_visio ? `<a class="btn out block" style="margin-bottom:12px" href="${attrUrl(e.lien_visio)}" target="_blank" rel="noopener">Rejoindre en visio ${ic('out', 's')}</a>` : ''}`;
    setPane(e.titre, html, cta);
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
  function viewAnnuaire() {
    const el = $('#t-annuaire');
    el.innerHTML = `<div class="search">${ic('search', 's')}<input id="aq" type="search" placeholder="Nom, métier, ville, mot-clé…" aria-label="Rechercher dans l’annuaire" value="${esc(S.ann.q)}"></div>
      <div class="chips">${ANN_TYPES.map(([k, l]) => `<button class="chip ${S.ann.type === k ? 'on' : ''}" data-t="${esc(k)}">${l}</button>`).join('')}</div>
      <div class="small muted" id="ann-count" style="margin:-2px 4px 10px"></div><div id="ann-list"></div><div id="ann-more"></div>`;
    $$('.chip', el).forEach(c => c.onclick = () => { S.ann.type = c.dataset.t; S.ann.loaded = false; viewAnnuaire(); });
    let t; $('#aq').oninput = e => { clearTimeout(t); t = setTimeout(() => { S.ann.q = e.target.value.trim(); S.ann.loaded = false; loadAnnuaire(); }, 350); };
    if (!S.ann.loaded) loadAnnuaire(); else paintAnnuaire();
  }
  async function loadAnnuaire() {
    const l = $('#ann-list'); if (!l) return; l.innerHTML = '<div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div><div class="sk skc" style="height:96px"></div>';
    const p = new URLSearchParams({ q: S.ann.q }); if (S.ann.type) p.set('type', S.ann.type);
    try {
      const r = await api('/api/annuaire/recherche?' + p);
      const all = [
        ...(r.initiatives || []).map(x => ({ k: 'i', rang: x._rang || 0, x })),
        ...(r.utilisateurs || []).map(x => ({ k: 'u', rang: x._rang || 0, x })),
        ...(r.organismes || []).map(x => ({ k: 'o', rang: x._rang || 0, x }))
      ].sort((a, b) => a.rang - b.rang);
      S.ann.items = all; S.ann.total = r.total || all.length; S.ann.shown = 30; S.ann.loaded = true; paintAnnuaire();
    } catch (e) { l.innerHTML = `<div class="empty"><b>Annuaire indisponible</b>${esc(e.message)}<br><br><button class="btn sm" id="retry">Réessayer</button></div>`; $('#retry').onclick = loadAnnuaire; }
  }
  function annCard(it) {
    const x = it.x; let nm, sub, badge, href, photo, uid, loc;
    loc = [x.ville, x.pays].filter(Boolean).join(', ');
    if (it.k === 'i') {
      nm = x.nom; badge = x.type || 'Initiative'; photo = x.logo_url; uid = x.owner_user_id;
      sub = strip(x.slogan || x.description || ''); href = 'initiative.html?id=' + encodeURIComponent(x.slug || x.id);
    } else if (it.k === 'u') {
      nm = [x.prenom, x.nom].filter(Boolean).join(' ') || x.nom; badge = 'Membre'; photo = x.photo_url; uid = x.id;
      sub = strip(x.titre_pro || ''); href = 'profil.html?id=' + encodeURIComponent(x.id);
    } else {
      nm = x.nom_institution || x.nom; badge = x.role === 'administrateur' ? 'Diaspo’Actif' : (x.role === 'collectivite' ? 'Collectivité' : 'Institution'); photo = x.photo_url; uid = x.id;
      sub = strip(x.bio || ''); href = 'profil.html?id=' + encodeURIComponent(x.id);
    }
    const dom = it.k === 'i' && x.domaine ? `<span class="badge">${esc(x.domaine)}</span>` : '';
    const note = x.avis_total ? `<span class="badge o">★ ${esc(Number(x.avis_moyenne || 0).toFixed(1))} (${x.avis_total})</span>` : '';
    return `<article class="card ann"><a class="ann-top" href="${href}"><div class="av big" style="border-radius:${it.k === 'u' ? '50%' : '16px'}">${photo ? `<img src="${attrUrl(photo)}" alt="" loading="lazy" onerror="this.remove()">` : esc(initials(nm))}</div>
      <div class="sp"><div class="nm" style="font-weight:700;font-size:16px;line-height:1.2">${esc(nm)}</div>
      <div class="meta" style="margin:2px 0">${loc ? ic('pin', 's') + '<span class="ell">' + esc(loc) + '</span>' : ''}</div>
      <div class="tags" style="margin:4px 0 0"><span class="badge ${it.k === 'u' ? '' : 'g'}">${esc(badge)}</span>${dom}${note}</div></div></a>
      ${sub ? `<div class="small muted" style="padding:0 14px 10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(sub)}</div>` : ''}
      <div class="ann-act"><a class="btn sm out" href="${href}">Voir la fiche</a>${uid ? `<button class="btn sm" data-write="${uid}">${ic('chat', 's')} Écrire</button>` : ''}</div></article>`;
  }
  function paintAnnuaire() {
    const l = $('#ann-list'); if (!l) return;
    const a = S.ann.items;
    $('#ann-count').textContent = a.length ? `${S.ann.total} résultat${S.ann.total > 1 ? 's' : ''}` : '';
    if (!a.length) { l.innerHTML = `<div class="empty"><div class="ei">${ic('dir', 'l')}</div><b>Aucun résultat</b>Essayez un autre mot-clé ou un autre filtre.</div>`; $('#ann-more').innerHTML = ''; return; }
    l.innerHTML = a.slice(0, S.ann.shown).map(annCard).join('');
    $('#ann-more').innerHTML = a.length > S.ann.shown ? `<button class="btn out block" id="ann-next">Voir plus (${a.length - S.ann.shown})</button>` : '';
    const n = $('#ann-next'); if (n) n.onclick = () => { S.ann.shown += 30; paintAnnuaire(); };
  }
  document.addEventListener('click', async e => {
    const w = e.target.closest('[data-write]'); if (!w) return;
    if (!(await needLogin('Connectez-vous pour écrire à ce compte.'))) return;
    w.disabled = true;
    try { const r = await api('/api/conversations', { method: 'POST', body: { user_id: Number(w.dataset.write) } }); location.hash = '#/conv/' + r.conversation_id; }
    catch (er) { toast(er.message, true); }
    w.disabled = false;
  });

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
  async function paneCR(id) {
    setPane('Compte-rendu', '<div class="sk skc"></div><div class="sk skc" style="height:120px"></div>');
    let r; try { r = await api(`/api/evenements/${encodeURIComponent(id)}/compte-rendu`); } catch (e) { return setPane('Compte-rendu', `<div class="empty"><b>Compte-rendu indisponible</b>${esc(e.message)}</div>`); }
    const ev = r.evenement || {}, c = r.compte_rendu;
    if (!c) return setPane('Compte-rendu', `<div class="empty"><div class="ei">${ic('doc', 'l')}</div><b>Pas encore de compte-rendu</b>L’organisateur ne l’a pas encore publié.<br><br><a class="btn" href="#/evenement/${esc(id)}">Voir l’événement</a></div>`);
    const medias = (c.medias || []).map(m => typeof m === 'string' ? m : (m && m.url)).filter(Boolean);
    const html = `${ev.image ? mediaBlock(ev.image, { alt: ev.titre }) : ''}
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
      ${(c.actions || []).length ? c.actions.map(a => `<a class="btn block" style="margin-bottom:10px" href="${attrUrl(a.lien)}" target="_blank" rel="noopener">${esc(a.bouton)} ${ic('out', 's')}</a>`).join('') : (c.etape_bouton && c.etape_lien ? `<a class="btn block" style="margin-bottom:10px" href="${attrUrl(c.etape_lien)}" target="_blank" rel="noopener">${esc(c.etape_bouton)} ${ic('out', 's')}</a>` : '')}
      <a class="btn out block" href="compte-rendu.html?evt=${esc(id)}">Ouvrir la version complète ${ic('out', 's')}</a>`;
    setPane(c.titre || 'Compte-rendu', html);
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
    el.innerHTML = `<div class="search">${ic('search', 's')}<input id="bq" type="search" placeholder="Rechercher une boutique…" aria-label="Rechercher une boutique" value="${esc(S.boutiques.q)}"></div><div id="bt-list"></div>`;
    let t; $('#bq').oninput = e => { clearTimeout(t); t = setTimeout(() => { S.boutiques.q = e.target.value.trim(); paintBoutiques(); }, 200); };
    if (!S.boutiques.loaded) loadBoutiques(); else paintBoutiques();
  }
  async function loadBoutiques() {
    const l = $('#bt-list'); l.innerHTML = '<div class="sk skc"></div><div class="sk skc"></div>';
    try { const r = await api('/api/vitrines'); S.boutiques.items = r.vitrines || []; S.boutiques.loaded = true; paintBoutiques(); }
    catch (e) { l.innerHTML = `<div class="empty"><b>Impossible de charger les boutiques</b>${esc(e.message)}<br><br><button class="btn sm" id="retry">Réessayer</button></div>`; $('#retry').onclick = loadBoutiques; }
  }
  function paintBoutiques() {
    const l = $('#bt-list'); if (!l) return;
    const q = S.boutiques.q.toLowerCase();
    const a = S.boutiques.items.filter(v => !q || [v.boutique_nom, v.nom, v.domaine, v.ville, v.pays, v.slogan].join(' ').toLowerCase().includes(q));
    if (!a.length) { l.innerHTML = `<div class="empty"><div class="ei">${ic('shop', 'l')}</div><b>Aucune boutique</b>Modifiez votre recherche.</div>`; return; }
    l.innerHTML = a.map(v => {
      const nm = v.boutique_nom || v.nom; const prods = (v.produits_vedettes || []).slice(0, 3);
      const desc = strip(v.boutique_description || v.description || v.slogan || '');
      return `<article class="card shop"><div class="top"><div class="lg">${v.logo_url ? `<img src="${attrUrl(v.logo_url)}" alt="" onerror="this.remove()">` : esc(initials(nm))}</div>
        <div class="sp"><div class="nm">${esc(nm)}</div><div class="small muted ell">${esc([v.domaine, [v.ville, v.pays].filter(Boolean).join(', ')].filter(Boolean).join(' · '))}</div>${v.certif || v.organisation_verifiee ? `<span class="badge g" style="margin-top:4px">${ic('check', 's')} Vérifiée</span>` : ''}</div></div>
        ${desc ? `<div class="txt small" style="padding:0 14px 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${esc(desc)}</div>` : ''}
        ${prods.length ? `<div class="prods">${prods.map(p => `<div class="p"><div class="ph">${p.photo ? `<img src="${attrUrl(p.photo)}" alt="" loading="lazy" onerror="this.remove()">` : ic('shop')}</div><div class="pn ell">${esc(p.nom)}</div><div class="pp">${p.prix != null ? esc(p.prix) + ' ' + esc(p.devise === 'EUR' || !p.devise ? '€' : p.devise) : ''}</div></div>`).join('')}</div>` : ''}
        <div class="ft"><a class="btn block sm" href="profil.html?id=${encodeURIComponent(v.owner_user_id)}&vitrine=1">Visiter la boutique</a></div></article>`;
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
    return `<span style="font-size:34px">${esc(v.icone || '🎬')}</span>`;
  }
  function videoCard(v, wide) {
    const bientot = v.type_source === 'bientot';
    return `<a class="vcard${wide ? ' wide' : ''}" href="#/video/${v.id}"><div class="vth">${videoThumb(v)}${bientot ? '<span class="vd" style="background:var(--orange-d)">Bientôt</span>' : (v.duree_secondes ? `<span class="vd">${fmtDuree(v.duree_secondes)}</span>` : '')}${bientot ? '' : '<span class="vp">▶</span>'}</div><div class="vt">${esc(v.titre)}</div>${v.categorie ? `<div class="small muted">${esc(v.categorie)}</div>` : ''}</a>`;
  }
  const miniCard = (href, photo, nom, sub, round) => `<a class="mc" href="${href}"><div class="av big" style="border-radius:${round ? '50%' : '16px'};margin:0 auto 8px">${photo ? `<img src="${attrUrl(photo)}" alt="" loading="lazy" onerror="this.remove()">` : esc(initials(nom))}</div><div class="mn">${esc(nom)}</div>${sub ? `<div class="small muted ell">${esc(sub)}</div>` : ''}</a>`;
  const homeBlock = (id, titre, html, more) => { const el = $('#' + id); if (!el || !html) return; el.innerHTML = `<div class="h2 row"><span class="sp">${esc(titre)}</span>${more || ''}</div>${html}`; };

  function viewAccueil() {
    const el = $('#t-accueil');
    if (S.home.loaded && $('#home-feed', el)) return;
    S.home.loaded = true;
    el.innerHTML = `<div id="home-annonce"></div><div id="home-honneur"></div><div id="home-videos"></div>
      <div class="card hero"><div class="pad"><div class="small" style="font-weight:700;color:var(--orange-d)">🌍 Réseau diaspora mondial</div>
        <h2 style="margin:6px 0 8px;font-size:20px;line-height:1.25">Connecter les diasporas, valoriser les talents, accélérer le développement des territoires.</h2>
        <p class="muted small" style="margin:0 0 12px">Des passerelles entre pays d’origine et pays d’accueil, grâce aux compétences, projets, organisations et initiatives portés par les diasporas du monde entier.</p>
        <div class="row" style="flex-wrap:wrap;gap:8px">${S.me ? '' : '<a class="btn sm" href="inscription.html">Rejoindre la communauté</a>'}<a class="btn sm out" href="#/annuaire">Explorer l’annuaire</a></div></div></div>
      <div class="card"><div class="pad"><div class="small muted" style="font-weight:700;margin-bottom:6px">POURQUOI DIASPO’ACTIF ?</div>
        <p style="margin:0 0 10px">La diaspora africaine est un levier de développement majeur, mais ses initiatives restent dispersées, invisibles, sans réseau. Diaspo’Actif change ça.</p>
        <div class="tags" style="margin:0"><span class="badge">👥 Rassembler les talents</span><span class="badge">🗂️ Organiser les initiatives</span><span class="badge">🚀 Mobiliser pour un impact durable</span></div></div></div>
      <div id="home-init"></div><div id="home-shops"></div><div id="home-temo"></div><div id="home-part"></div>
      <div class="h2">CE QUI SE PASSE EN CE MOMENT</div><div id="home-feed"></div>`;
    loadHome();
    viewFil();
  }
  function loadHome() {
    const safe = fn => fn().catch(() => { });
    safe(async () => {
      const a = ((await api('/api/annonces-officielles/actives')).annonces || [])[0]; if (!a) return;
      $('#home-annonce').innerHTML = `<div class="card">${a.image_url ? mediaBlock(a.image_url, { alt: a.titre }) : ''}<div class="pad"><span class="badge o">Annonce officielle</span><h3 style="margin:8px 0 4px;font-size:18px">${esc(a.titre)}</h3>${a.accroche ? `<p class="muted" style="margin:0 0 8px">${esc(strip(a.accroche))}</p>` : ''}${a.evenement_id ? `<a class="btn sm" href="#/evenement/${a.evenement_id}">Voir l’événement</a>` : ''}</div></div>`;
    });
    safe(async () => {
      const l = (await api('/api/honneur/laureats')).laureats || []; if (!l.length) return;
      homeBlock('home-honneur', 'COMPTES À L’HONNEUR', `<div class="hs">${l.map(x => miniCard(esc(x.profil_url), x.photo_url, x.nom, [x.ville, x.pays].filter(Boolean).join(', '), x.categorie !== 'initiative')).join('')}</div>`);
    });
    safe(async () => {
      const v = (await api('/api/videos-tutoriels?limit=8')).videos || []; if (!v.length) return;
      homeBlock('home-videos', 'TUTORIELS VIDÉO', `<div class="hs">${v.map(x => videoCard(x)).join('')}</div>`, '<a href="#/videos" class="small" style="color:var(--navy2);font-weight:700;text-transform:none;letter-spacing:0">Tout voir ›</a>');
    });
    safe(async () => {
      const r = await api('/api/annuaire/recherche?type=Initiative&q='); const l = (r.initiatives || []).slice(0, 10); if (!l.length) return;
      homeBlock('home-init', 'INITIATIVES À DÉCOUVRIR', `<div class="hs">${l.map(x => miniCard('initiative.html?id=' + encodeURIComponent(x.slug || x.id), x.logo_url, x.nom, [x.ville, x.pays].filter(Boolean).join(', '))).join('')}</div>`, '<a href="#/annuaire" class="small" style="color:var(--navy2);font-weight:700;text-transform:none;letter-spacing:0">Annuaire ›</a>');
    });
    safe(async () => {
      const l = ((await api('/api/vitrines')).vitrines || []).slice(0, 10); if (!l.length) return;
      homeBlock('home-shops', 'BOUTIQUES DE LA DIASPORA', `<div class="hs">${l.map(v => miniCard('profil.html?id=' + encodeURIComponent(v.owner_user_id) + '&vitrine=1', v.logo_url, v.boutique_nom || v.nom, [v.ville, v.pays].filter(Boolean).join(', '))).join('')}</div>`, '<a href="#/boutiques" class="small" style="color:var(--navy2);font-weight:700;text-transform:none;letter-spacing:0">Toutes ›</a>');
    });
    safe(async () => {
      const l = (await api('/api/temoignages/public?limit=8')).temoignages || []; if (!l.length) return;
      homeBlock('home-temo', 'ILS ONT REJOINT DIASPO’ACTIF', `<div class="hs">${l.map(t => `<div class="card tm"><div class="pad">${t.note ? `<div style="color:#E0A100;letter-spacing:2px">${'★'.repeat(t.note)}${'☆'.repeat(5 - t.note)}</div>` : ''}<p style="margin:6px 0 8px">« ${esc(String(t.description || '').slice(0, 200))}${String(t.description || '').length > 200 ? '…' : ''} »</p><div class="small"><b>${esc(t.nom_affichage || 'Membre Diaspo’Actif')}</b>${t.pays_utilisateur ? ' · ' + esc(t.pays_utilisateur) : ''}</div></div></div>`).join('')}</div>`);
    });
    safe(async () => {
      const l = (await api('/api/partenaires/carousel?limit=12')).partenaires || []; if (!l.length) return;
      homeBlock('home-part', 'PARTENAIRES OFFICIELS', `<div class="hs">${l.map(p => miniCard('profil.html?id=' + encodeURIComponent(p.user_id), p.photo_url, [p.prenom, p.nom].filter(Boolean).join(' ') || p.nom, (p.domaines_expertise || []).slice(0, 2).join(' · '), true)).join('')}</div>`);
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
    let v; try { v = (await api('/api/videos-tutoriels/' + encodeURIComponent(id))).video; } catch (e) { return setPane('Tutoriel vidéo', `<div class="empty"><b>Vidéo introuvable</b>${esc(e.message)}</div>`); }
    const y = v.type_source === 'youtube' ? ytId(v.url) : null;
    const player = y ? `<div class="vwrap"><iframe src="https://www.youtube-nocookie.com/embed/${y}?rel=0&playsinline=1" title="${esc(v.titre)}" allow="accelerometer; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`
      : v.type_source === 'mp4' ? videoBlock(v.url)
        : `<div class="empty"><div class="ei">${ic('clock', 'l')}</div><b>Bientôt disponible</b>Cette vidéo sera publiée prochainement.</div>`;
    setPane(v.titre, `${player}<div class="card" style="margin-top:12px"><div class="pad"><h2 style="margin:0 0 6px;font-size:19px">${esc(v.titre)}</h2><div class="tags" style="margin:0 0 8px">${v.categorie ? `<span class="badge">${esc(v.categorie)}</span>` : ''}${v.duree_secondes ? `<span class="badge">${fmtDuree(v.duree_secondes)}</span>` : ''}${v.vues ? `<span class="badge">${v.vues} vues</span>` : ''}</div>${v.description ? `<div class="rich" style="white-space:pre-line">${esc(strip(v.description))}</div>` : ''}</div></div>
      <a class="btn out block" href="#/videos">Toutes les vidéos</a>`);
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
  async function paneCagnottes() {
    setPane('Cagnottes et dons', '<div class="sk skc"></div><div class="sk skc"></div>');
    let pub = [], mes = null;
    try { pub = (await api('/api/cagnottes/publiques')).cagnottes || []; } catch (e) { return setPane('Cagnottes et dons', `<div class="empty"><b>Indisponible</b>${esc(e.message)}</div>`); }
    if (S.me && S.me.role === 'initiative') { try { mes = (await api('/api/cagnottes/mes')).cagnottes || []; } catch (e) { mes = []; } }
    let html = '';
    if (mes) {
      const total = mes.reduce((n, c) => n + (Number(c.montant_collecte) || 0), 0);
      const lock = premiumLocked(2);
      html += `<div class="h2" style="margin-top:2px">MES CAGNOTTES</div><div class="card"><div class="pad">
        <div class="row"><div class="sp"><b style="font-size:20px">${mes.length}</b> <span class="muted small">cagnotte${mes.length > 1 ? 's' : ''}</span></div><div><b>${esc(money(total))}</b> <span class="muted small">collectés</span></div></div>
        ${mes.slice(0, 5).map(c => `<div class="kv"><span class="ell" style="max-width:62%">${esc(md(strip(c.titre)))}</span><span>${esc(money(c.montant_collecte, c.devise))}</span></div>`).join('')}
        <a class="btn block sm ${lock ? 'out' : ''}" style="margin-top:12px" ${lock ? 'data-lock="1" href="#"' : 'href="dashboard-initiative.html#cagnottes"'}>${lock ? ic('lock', 's') + ' ' : ''}Gérer mes cagnottes ${lock ? '👑' : ''}</a></div></div>`;
    }
    html += `<div class="h2" ${mes ? '' : 'style="margin-top:2px"'}>CAGNOTTES OUVERTES</div>` + (pub.length ? pub.map(cagnotteCard).join('') : `<div class="empty"><div class="ei">${ic('heart', 'l')}</div><b>Aucune cagnotte ouverte</b>Revenez bientôt.</div>`);
    setPane('Cagnottes et dons', html);
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
    { t: 'Cagnottes et dons', i: 'heart', h: '#/cagnottes', d: { utilisateur: 'Soutenir les cagnottes ouvertes', initiative: 'Vos cagnottes et les dons reçus' }, r: { utilisateur: 1, initiative: 1 } },
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
      if (locked) return `<a class="li dim" href="#" data-lock="1" data-name="${esc(x.t)}">${inner}</a>`;
      return `<a class="li" href="${esc(x.h)}" ${x.act ? `data-act="${x.act}"` : ''}>${inner}</a>`;
    };
    return { role, mods: MODS.map(li).join(''), compte: MODS_COMPTE.map(li).join('') };
  }
  function openMenu() {
    if (!S.me) { openLogin(); return; }
    const m = S.me, resp = [m.prenom, m.nom].filter(Boolean).join(' ') || m.email, nm = m.nom_affichage || resp;
    const prem = S.premium && S.premium.concerne ? (S.premium.actif ? '👑 Premium actif' : '🔒 Premium expiré') : '';
    const { mods, compte } = modulesHtml(m);
    const close = openSheet(`<div class="row" style="margin:0 0 6px"><div class="av big" style="width:48px;height:48px">${m.photo_url ? `<img src="${attrUrl(m.photo_url)}" alt="" onerror="this.remove()">` : esc(initials(nm))}</div><div class="sp"><div style="font-weight:700;font-size:17px;line-height:1.2">${esc(nm)}</div><div class="small muted">${esc(ROLE_LABEL[m.role] || m.role)}${prem ? ' · ' + prem : ''}</div></div></div>
      <div class="h2" style="margin-top:12px">MENU DES MODULES</div>
      <div class="lst"><a class="li" href="#/accueil"><span class="ic">${ic('home')}</span><span class="sp"><span class="t">Accueil</span><br><span class="d">Tutoriels vidéo, actualités, initiatives</span></span><span class="ch">${ic('chev', 's')}</span></a>${mods}</div>
      <div class="h2">MON COMPTE</div><div class="lst">${compte}<a class="li" href="#/moi"><span class="ic">${ic('user')}</span><span class="sp"><span class="t">Mon espace</span><br><span class="d">Profil, tout le menu et les outils sur ordinateur</span></span><span class="ch">${ic('chev', 's')}</span></a></div>
      <button class="btn out block" id="menu-switch" style="margin-top:14px">${ic('people', 's')} Changer de compte</button>
      <button class="btn out block" id="menu-logout" style="margin-top:10px">${ic('logout', 's')} Se déconnecter</button>`);
    const sh = $('#sheet');
    /* un lien du menu referme la feuille ; les verrous Premium et le changement de compte ouvrent leur propre feuille */
    $$('a.li', sh).forEach(a => a.addEventListener('click', () => { if (!a.dataset.lock && !a.dataset.act) close(); }));
    $('#menu-switch').onclick = () => { close(); openSwitcher(); };
    $('#menu-logout').onclick = () => { close(); logout(); };
  }
  function viewMoi() {
    const el = $('#t-moi');
    if (!S.me) {
      el.innerHTML = `${loginCard('Connectez-vous pour accéder à vos modules, vos billets et vos paramètres.')}<div class="lst" style="margin-top:6px"><a class="li" href="index.html"><span class="ic">${ic('desk')}</span><span class="sp"><span class="t">Découvrir Diaspo’Actif</span><br><span class="d">Présentation de la plateforme</span></span><span class="ch">${ic('chev', 's')}</span></a></div>`;
      $('#go-login').onclick = () => openLogin(); return;
    }
    const m = S.me, role = (m.role === 'utilisateur' || m.role === 'initiative') ? m.role : null;
    const resp = [m.prenom, m.nom].filter(Boolean).join(' ') || m.email; const nm = m.nom_affichage || resp;
    const prem = S.premium && S.premium.concerne ? (S.premium.actif ? '👑 Premium actif' : '🔒 Premium expiré') : '';
    const { mods, compte } = modulesHtml(m);
    el.innerHTML = `<a class="me" href="profil-app.html?id=${encodeURIComponent(m.id)}"><div class="av big">${m.photo_url ? `<img src="${attrUrl(m.photo_url)}" alt="" onerror="this.remove()">` : esc(initials(nm))}</div><div class="sp"><div class="nm ell">${esc(nm)}</div><div class="sub">${esc(ROLE_LABEL[m.role] || m.role)}${prem ? ' · ' + prem : ''}</div><div class="sub" style="margin-top:2px">Voir mon profil ›</div>${m.role !== 'utilisateur' && resp && resp !== nm ? `<div class="sub" style="font-size:10.5px;opacity:.7;margin-top:2px">Responsable : ${esc(resp)}</div>` : ''}</div></a>
      <button class="btn out block" id="me-switch" style="margin:10px 0 0">${ic('people', 's')} Changer de compte</button>
      <div class="h2">MES MODULES</div><div class="lst">${mods}</div>
      <div class="h2">MON COMPTE</div><div class="lst">${compte}</div>
      ${role ? '' : '<p class="small muted" style="margin:12px 4px 0">Ce type de compte retrouve ses outils complets sur le site : <a href="dashboard-' + esc(m.role === 'administrateur' ? 'administrateur' : 'collectivite') + '.html" style="text-decoration:underline">ouvrir mon tableau de bord</a>.</p>'}
      <button class="toggle" id="desk-toggle" aria-expanded="false">${ic('desk', 's')} Disponible sur ordinateur (${MENU_DESK.length})</button>
      <div id="desk-list" hidden><p class="small muted" style="margin:10px 4px">Ces outils sont plus confortables sur grand écran. Ouvrez Diaspo’Actif depuis votre ordinateur pour les utiliser.</p><div class="lst">${MENU_DESK.map(t => `<div class="li dim"><span class="ic">${ic('desk')}</span><span class="sp"><span class="t">${esc(t)}</span></span></div>`).join('')}</div></div>
      <button class="btn out block" id="logout" style="margin-top:18px">${ic('logout', 's')} Se déconnecter</button>
      <p class="small muted" style="text-align:center;margin:14px 0 0">Version téléphone · <a href="dashboard-${esc(m.role === 'initiative' ? 'initiative' : (m.role === 'utilisateur' ? 'utilisateur' : 'collectivite'))}.html" style="text-decoration:underline">Ouvrir le site complet</a></p>`;
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
      const href = n => { const d = n.data || {}; if (d.lien) return d.lien; if (d.evenement_id) return '#/evenement/' + d.evenement_id; return '#/fil'; };
      const html = l.length ? `<div class="lst">${l.map(n => `<a class="li" href="${esc(href(n))}" style="${n.lue ? '' : 'background:var(--orange-l)'}"><span class="ic">${ic('bell')}</span><span class="sp"><span class="t">${esc(n.titre)}</span><br><span class="d">${esc(strip(n.contenu || '').slice(0, 110))} · ${esc(ago(n.created_at))}</span></span></a>`).join('')}</div>` : `<div class="empty"><div class="ei">${ic('bell', 'l')}</div><b>Aucune notification</b>Vous êtes à jour.</div>`;
      setPane('Notifications', html);
      if (r.non_lues) { api('/api/notifications/lire-tout', { method: 'POST', body: {} }).then(() => { S.unreadNotif = 0; paintBadges(); }).catch(() => { }); }
    } catch (e) { setPane('Notifications', `<div class="empty"><b>Indisponible</b>${esc(e.message)}</div>`); }
  }

  /* ---------- panneau plein écran ---------- */
  function setPane(title, html, foot, keepFoot) {
    const p = $('#pane'); p.hidden = false; document.body.style.overflow = 'hidden';
    if (!p.dataset.built) {
      p.innerHTML = `<div class="phead"><button class="ibtn" id="pane-back" aria-label="Retour">${ic('back')}</button><h2 id="pane-title"></h2></div><div class="pbody" id="pane-body"></div><div class="pfoot" id="pane-foot" hidden></div>`;
      p.dataset.built = '1'; $('#pane-back').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/' + (S.tab || 'fil'); };
    }
    $('#pane-title').textContent = title || '';
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
    else if (a === 'cr') paneCR(b);
    else if (a === 'cagnottes') paneCagnottes();
    else if (a === 'videos') paneVideos();
    else if (a === 'video') paneVideo(b);
    else if (window.MMods && typeof window.MMods[a] === 'function') window.MMods[a](b, c);
    else if (SITE_PAGES[a]) { location.replace(SITE_PAGES[a]); return; }
    else { location.hash = '#/accueil'; return; }
    done();
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
  async function init() {
    checkDesktopMode();
    $('#view').innerHTML = TABS.map(t => `<section id="t-${t}" hidden></section>`).join('');
    window.addEventListener('hashchange', () => route());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const v = $('.viewer'); if (v) v.remove(); } });
    /* Les modules « m-mod-*.js » sont chargés en différé après ce fichier : on attend qu'ils soient tous exécutés (DOMContentLoaded) avant de router, sinon une route de module arrivait avant son enregistrement et renvoyait vers la page du site. */
    /* readyState vaut déjà « interactive » pendant l'exécution des scripts différés : on attend l'événement, avec un délai de secours si jamais il est déjà passé. */
    if (document.readyState !== 'complete') await Promise.race([new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true })), new Promise(r => setTimeout(r, 1500))]);
    await loadMe();
    route(true);
    setInterval(() => { if (!document.hidden) refreshBadges(); }, 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadges(); });
    if ('serviceWorker' in navigator) { /* le site est « réseau uniquement » : rien à enregistrer */ }
  }
  window.MMods = window.MMods || {};
  window.MApp = { S, api, esc, strip, md, linkify, richHtml, ic, ICONS, setPane, closePane, openSheet, toast, needLogin, openLogin, loginCard, mediaBlock, videoBlock, money, dateLong, parseDay, ago, hhmm, dayLabel, initials, attrUrl, safeUrl, premiumLocked, premiumSheet, loadPremium, afterAuthChange, ROLE_LABEL };
  init();
})();

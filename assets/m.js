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
    plus: '<path d="M12 5v14M5 12h14"/>'
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
    myInsc: new Set(), pane: null, chatTimer: null, convNames: {}
  };
  const TABS = ['fil', 'evenements', 'messages', 'boutiques', 'moi'];
  const TITLES = { fil: "Fil d'actualité", evenements: 'Événements', messages: 'Messages', boutiques: 'Boutiques', moi: 'Mon espace' };
  const scrollMem = {};

  /* ---------- connexion ---------- */
  async function loadMe() {
    try { const r = await api('/api/auth/me'); S.me = r.user || null; } catch (e) { S.me = null; }
    if (S.me) { refreshBadges(); loadMyInsc(); }
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
            S.me = r.user; toast('Bienvenue ' + (r.user.prenom || '') + ' !'); close(true);
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
    S.fil = { mode: 'tous', page: 1, pages: 1, posts: [], loaded: false };
    S.ev.loaded = false; S.boutiques.loaded = false;
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
      ? `<a class="ibtn" href="#/notifs" aria-label="Notifications">${ic('bell')}<span class="dot" id="notif-badge" hidden></span></a>`
      : `<button class="pill-cta" id="top-login">Connexion</button>`;
    top.innerHTML = `<img class="logo" src="assets/logo.svg" alt="" onerror="this.style.display='none'">
      <h1><span class="brand-s">Diaspo’Actif</span><span id="top-title">${esc(TITLES[S.tab] || '')}</span></h1>${right}`;
    const l = $('#top-login'); if (l) l.onclick = () => openLogin();
    paintBadges();
  }
  function renderTabs() {
    const items = [['fil', 'Fil', 'fil'], ['evenements', 'Événements', 'cal'], ['messages', 'Messages', 'chat'], ['boutiques', 'Boutiques', 'shop'], ['moi', 'Moi', 'user']];
    $('#tabs').innerHTML = items.map(([k, l, i]) => `<button data-tab="${k}" aria-label="${l}" ${S.tab === k ? 'aria-current="page"' : ''} class="${S.tab === k ? 'on' : ''}">${ic(i)}<span>${l}</span>${k === 'messages' ? '<span class="dot" id="tab-badge-messages" hidden></span>' : ''}</button>`).join('');
    $$('#tabs button').forEach(b => b.onclick = () => {
      if (S.tab === b.dataset.tab && !S.pane) { window.scrollTo({ top: 0, behavior: 'smooth' }); refreshTab(b.dataset.tab); }
      else location.hash = '#/' + b.dataset.tab;
    });
    paintBadges();
  }

  /* ---------- routage ---------- */
  function route(force) {
    const h = location.hash.replace(/^#\/?/, '') || 'fil';
    const [a, b, c] = h.split('/');
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
    ({ fil: viewFil, evenements: viewEvents, messages: viewMessages, boutiques: viewBoutiques, moi: viewMoi })[t]();
  }
  function refreshTab(t) {
    if (t === 'fil') { S.fil = { mode: S.fil.mode, page: 1, pages: 1, posts: [], loaded: false }; }
    if (t === 'evenements') S.ev.loaded = false;
    if (t === 'boutiques') S.boutiques.loaded = false;
    renderTab(t);
  }

  /* ============================================================
     FIL
     ============================================================ */
  const FIL_MODES = [['tous', 'Pour vous'], ['suivis', 'Mes abonnements'], ['populaires', 'Populaires'], ['organisations', 'Organisations']];
  function viewFil() {
    const el = $('#t-fil');
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
        if (mine && !l.some(c => c.contenu === mine)) l.push({ auteur_nom: [S.me.prenom, S.me.nom].filter(Boolean).join(' '), photo_url: S.me.photo_url, contenu: mine, created_at: new Date().toISOString() });
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
  function evtCover(e) { return e.image_couverture || e.image_url || ''; }
  function viewEvents() {
    const el = $('#t-evenements');
    el.innerHTML = `<div class="search">${ic('search', 's')}<input id="evq" type="search" placeholder="Rechercher un événement…" aria-label="Rechercher un événement" value="${esc(S.ev.q)}"></div>
      <div class="chips">${[['avenir', 'À venir'], ['gratuit', 'Gratuits'], ['mes', 'Mes inscriptions'], ['passes', 'Passés']].map(([k, l]) => `<button class="chip ${S.ev.filtre === k ? 'on' : ''}" data-f="${k}">${l}</button>`).join('')}</div>
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
        <div class="tags"><span class="badge ${paid ? 'o' : 'g'}">${part}</span>${e.est_termine ? '<span class="badge">Terminé</span>' : ''}${inscrit ? `<span class="badge g">${ic('check', 's')} Inscrit</span>` : ''}${e.nb_participants ? `<span class="badge">${e.nb_participants} inscrit${e.nb_participants > 1 ? 's' : ''}</span>` : ''}</div></div></a>`;
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
    let cta;
    if (ev.est_termine) cta = `<button class="btn block" disabled>Événement terminé</button>`;
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
  const MENU_KEEP = [
    ['billets', 'ticket', 'Mes billets', 'Vos inscriptions et QR codes d’entrée', '#/billets'],
    ['formations', 'book', 'Formations', 'Vos formations en cours', 'formations.html'],
    ['parrainage', 'gift', 'Parrainage', 'Invitez vos proches', 'parrainage.html']
  ];
  const MENU_LIGHT = [
    ['emploi', 'brief', 'Emploi et stages', 'Offres et candidatures', 'emplois-stages.html'],
    ['paiements', 'card', 'Paiements', 'Historique et reçus', 'mes-paiements.html'],
    ['devis', 'file', 'Mes demandes de devis', 'Suivi des devis boutique', 'mes-devis.html'],
    ['abo', 'star', 'Mon abonnement', 'Premium et échéances', 'mon-abonnement.html'],
    ['confid', 'lock', 'Confidentialité', 'Vos données et visibilité', 'confidentialite.html'],
    ['loc', 'pin', 'Ma localisation', 'Ville et pays affichés', 'dashboard-utilisateur.html']
  ];
  const MENU_DESK = ['Business plans', 'CV, lettres et candidatures', 'Soumettre à Diaspo’Actif', 'Mes projets', 'Évaluation de projet', 'Réseau Pro', 'CRM partagé', 'Programmation', 'Liaison de comptes', 'Support pilote', 'Apparence', 'Mes statistiques'];
  function viewMoi() {
    const el = $('#t-moi');
    if (!S.me) {
      el.innerHTML = `${loginCard('Connectez-vous pour accéder à votre espace, vos billets et vos paramètres.')}<div class="lst" style="margin-top:6px"><a class="li" href="index.html"><span class="ic">${ic('desk')}</span><span class="sp"><span class="t">Découvrir Diaspo’Actif</span><br><span class="d">Présentation de la plateforme</span></span><span class="ch">${ic('chev', 's')}</span></a></div>`;
      $('#go-login').onclick = () => openLogin(); return;
    }
    const m = S.me; const nm = [m.prenom, m.nom].filter(Boolean).join(' ') || m.email;
    const li = ([k, i, t, d, h], dim) => `<a class="li ${dim ? 'dim' : ''}" href="${h}"><span class="ic">${ic(i)}</span><span class="sp"><span class="t">${esc(t)}</span><br><span class="d">${esc(d)}</span></span><span class="ch">${ic('chev', 's')}</span></a>`;
    el.innerHTML = `<a class="me" href="profil-app.html?id=${encodeURIComponent(m.id)}"><div class="av big">${m.photo_url ? `<img src="${attrUrl(m.photo_url)}" alt="" onerror="this.remove()">` : esc(initials(nm))}</div><div class="sp"><div class="nm ell">${esc(nm)}</div><div class="sub">${esc([m.ville, m.pays].filter(Boolean).join(', ') || m.email)}</div><div class="sub" style="margin-top:2px">Voir mon profil ›</div></div></a>
      <div class="h2">ESSENTIEL</div><div class="lst">${MENU_KEEP.map(x => li(x)).join('')}</div>
      <div class="h2">MON COMPTE</div><div class="lst">${MENU_LIGHT.map(x => li(x)).join('')}</div>
      <button class="toggle" id="desk-toggle" aria-expanded="false">${ic('desk', 's')} Disponible sur ordinateur (${MENU_DESK.length})</button>
      <div id="desk-list" hidden><p class="small muted" style="margin:10px 4px">Ces outils sont plus confortables sur grand écran. Ouvrez Diaspo’Actif depuis votre ordinateur pour les utiliser.</p><div class="lst">${MENU_DESK.map(t => `<div class="li dim"><span class="ic">${ic('desk')}</span><span class="sp"><span class="t">${esc(t)}</span></span></div>`).join('')}</div></div>
      <button class="btn out block" id="logout" style="margin-top:18px">${ic('logout', 's')} Se déconnecter</button>
      <p class="small muted" style="text-align:center;margin:14px 0 0">Version téléphone · <a href="dashboard-utilisateur.html" style="text-decoration:underline">Ouvrir le site complet</a></p>`;
    $('#desk-toggle').onclick = e => { const l = $('#desk-list'); l.hidden = !l.hidden; e.currentTarget.setAttribute('aria-expanded', String(!l.hidden)); };
    $('#logout').onclick = logout;
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
  function openPane(a, b, c) {
    S.pane = { k: a === 'conv' ? 'conv' : a };
    const done = () => { renderTop(); };
    if (a === 'evenement') paneEvent(b);
    else if (a === 'conv') paneConv(b);
    else if (a === 'billets') paneBillets();
    else if (a === 'billet') paneBillet(b, c);
    else if (a === 'notifs') paneNotifs();
    else { location.hash = '#/fil'; return; }
    done();
  }

  /* ---------- démarrage ---------- */
  async function init() {
    $('#view').innerHTML = TABS.map(t => `<section id="t-${t}" hidden></section>`).join('');
    window.addEventListener('hashchange', () => route());
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { const v = $('.viewer'); if (v) v.remove(); } });
    await loadMe();
    route(true);
    setInterval(() => { if (!document.hidden) refreshBadges(); }, 45000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBadges(); });
    if ('serviceWorker' in navigator) { /* le site est « réseau uniquement » : rien à enregistrer */ }
  }
  init();
})();

/* ============================================================
   Diaspo'Actif — Visionneur plein écran des photos et des vidéos des publications (2026-10-08, demande explicite)
   Un clic sur la photo ou la vidéo d'une actualité ouvre ce visionneur : on balaie (ou flèches, molette, touches ↑ ↓) pour passer
   aux autres photos / aux autres vidéos, soit de la même personne, soit de toute la plateforme (interrupteur en haut). Les photos
   et les vidéos restent séparées ; à l'intérieur d'une publication à plusieurs médias, le balayage horizontal passe de l'un à l'autre.
   Partagé par l'appli téléphone (m.js) et le site (posts.js) : une seule implémentation.
   Données : GET /api/fil/medias (publique : publications publiées, visibilité « public »).
   ============================================================ */
(function (root) {
  'use strict';
  var RE_VIDEO = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i, RE_IMG = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var urlOk = function (u) { return typeof u === 'string' && /^(https?:\/\/|\/[^\/])/i.test(u); };
  var plain = function (s) { return String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim(); };
  var V = null, toastT = null;

  function getJson(path) {
    return fetch(path, { credentials: 'same-origin' }).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (j) { if (!r.ok) throw new Error((j && j.error) || 'Erreur'); return j || {}; });
    });
  }
  function mediasDe(p) {
    var l = []; try { l = JSON.parse(p.medias || '[]'); } catch (e) { l = []; }
    if (!Array.isArray(l)) l = [];
    if (p.media_url) l.unshift({ type: p.media_type || '', url: p.media_url });
    return l.map(function (m) { return typeof m === 'string' ? { url: m } : m; }).filter(function (m) { return m && urlOk(m.url); }).map(function (m) {
      var kind = (m.type === 'video' || RE_VIDEO.test(m.url)) ? 'video' : ((m.type === 'image' || m.type === 'photo' || RE_IMG.test(m.url)) ? 'photo' : null);
      return kind ? { kind: kind, url: m.url, poster: urlOk(m.poster) ? m.poster : (urlOk(m.thumbnail) ? m.thumbnail : null) } : null;
    }).filter(Boolean);
  }
  function itemDePost(p, kind) {
    if (!p) return null;
    var medias = mediasDe(p).filter(function (m) { return m.kind === kind; });
    if (!medias.length) return null;
    var titre = plain(p.titre), corps = plain(p.corps != null ? p.corps : p.contenu);
    return {
      post_id: Number(p.id), auteur_id: Number(p.auteur_id) || null, auteur_nom: p.auteur_nom || '', auteur_photo: (p.auteur_profil && p.auteur_profil.photo_url) || null,
      kind: kind, medias: medias, titre: titre.slice(0, 120), extrait: (titre && corps.indexOf(titre) === 0 ? corps.slice(titre.length).trim() : corps).slice(0, 180),
      nb_likes: (p.reactions && p.reactions.like) || 0, nb_commentaires: p.nb_commentaires || 0, a_aime: !!p.user_a_aime
    };
  }
  var cur = function () { return V && V.items[V.idx]; };
  function toast(msg) {
    if (!V) return; var t = V.el.querySelector('.mv-toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2400);
  }

  /* ---------- ouverture ---------- */
  function open(cfg, opts) {
    if (V) fermer(true);
    var kind = cfg.kind === 'video' ? 'video' : 'photo';
    var v = V = { kind: kind, scope: 'plateforme', auteurId: null, items: [], idx: 0, mi: 0, opts: opts || {}, cur: { avant: null, apres: null }, fin: { avant: false, apres: false }, charge: { avant: false, apres: false }, histo: false, ver: 0, anim: 0, roue: 0 };
    construire();
    return getJson('/api/fil/' + encodeURIComponent(cfg.post_id)).then(function (r) { return itemDePost(r.post, kind); }, function () { return null; }).then(function (item) {
      if (V !== v) return;
      if (!item) item = { post_id: Number(cfg.post_id), auteur_id: Number(cfg.auteur_id) || null, auteur_nom: '', auteur_photo: null, kind: kind, medias: urlOk(cfg.url) ? [{ kind: kind, url: cfg.url, poster: null }] : [], titre: '', extrait: '', nb_likes: 0, nb_commentaires: 0, a_aime: false };
      if (!item.medias.length) { fermer(); return; }
      v.items = [item]; v.idx = 0;
      v.mi = Math.max(0, item.medias.map(function (m) { return m.url; }).indexOf(cfg.url));
      v.auteurId = item.auteur_id || Number(cfg.auteur_id) || null;
      v.scope = (cfg.portee === 'auteur' && v.auteurId) ? 'auteur' : 'plateforme';
      v.cur.avant = v.cur.apres = item.post_id;
      majPortee(); render(0);
      charger('avant'); charger('apres');
    });
  }

  function construire() {
    var d = document.createElement('div');
    d.className = 'mv'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', 'Visionneur de médias');
    d.innerHTML = '<div class="mv-top"><button type="button" class="mv-btn mv-x" aria-label="Fermer">✕</button>'
      + '<div class="mv-portee" role="tablist"><button type="button" data-p="auteur">Cette personne</button><button type="button" data-p="plateforme">Toute la plateforme</button></div></div>'
      + '<div class="mv-stage"></div><div class="mv-dots"></div>'
      + '<div class="mv-fleches"><button type="button" class="mv-btn" data-d="-1" aria-label="Précédent">▲</button><button type="button" class="mv-btn" data-d="1" aria-label="Suivant">▼</button></div>'
      + '<div class="mv-info"></div><div class="mv-toast" role="status"></div>';
    document.body.appendChild(d); V.el = d;
    V.overflow = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
    try { history.pushState({ mv: 1 }, ''); V.histo = true; } catch (e) { /* pas d'historique */ }
    d.querySelector('.mv-x').onclick = function () { fermer(); };
    d.querySelectorAll('[data-p]').forEach(function (b) { b.onclick = function () { changerPortee(b.dataset.p); }; });
    d.querySelectorAll('[data-d]').forEach(function (b) { b.onclick = function () { aller(Number(b.dataset.d)); }; });
    var st = d.querySelector('.mv-stage'), x0 = 0, y0 = 0, t0 = 0, actif = false;
    st.addEventListener('touchstart', function (e) { if (e.touches.length !== 1) { actif = false; return; } actif = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); }, { passive: true });
    st.addEventListener('touchend', function (e) {
      if (!actif) return; actif = false;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
      if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx)) { aller(dy < 0 ? 1 : -1); e.preventDefault(); }
      else if (Math.abs(dx) > 50) { media(dx < 0 ? 1 : -1); e.preventDefault(); }
    }, { passive: false });
    st.addEventListener('click', function (e) {
      var vid = st.querySelector('video'); if (!vid || e.target.closest('.mv-mute')) return;
      if (vid.paused) vid.play().catch(function () {}); else vid.pause();
    });
    st.addEventListener('wheel', function (e) {
      e.preventDefault(); var n = Date.now(); if (n - V.roue < 550 || Math.abs(e.deltaY) < 12) return; V.roue = n; aller(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
    d.addEventListener('click', function (e) {
      var a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'like') aimer(); else if (a.dataset.a === 'part') partager(); else if (a.dataset.a === 'auteur') ouvrirProfil(); else ouvrirPost();
    });
    document.addEventListener('keydown', touches, true);
    window.addEventListener('popstate', retour);
  }
  function touches(e) {
    if (!V) return;
    var k = e.key;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); }
    else if (k === 'ArrowDown' || k === 'j' || k === 'J') { e.preventDefault(); e.stopPropagation(); aller(1); }
    else if (k === 'ArrowUp' || k === 'k' || k === 'K') { e.preventDefault(); e.stopPropagation(); aller(-1); }
    else if (k === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); media(1); }
    else if (k === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); media(-1); }
  }
  function retour() { if (V) { V.histo = false; fermer(); } }
  function fermer(silencieux) {
    var v = V; if (!v) return; V = null;
    document.removeEventListener('keydown', touches, true); window.removeEventListener('popstate', retour);
    if (v.el) v.el.remove();
    document.documentElement.style.overflow = v.overflow || '';
    if (v.histo && !silencieux) { try { history.back(); } catch (e) { /* rien */ } }
  }

  /* ---------- données voisines ---------- */
  function charger(sens) {
    var v = V; if (!v || v.charge[sens] || v.fin[sens]) return Promise.resolve();
    v.charge[sens] = true; var ver = v.ver;
    var q = new URLSearchParams({ type: v.kind, limit: '8' }); q.set(sens, v.cur[sens]);
    if (v.scope === 'auteur' && v.auteurId) q.set('auteur_id', v.auteurId);
    return getJson('/api/fil/medias?' + q.toString()).then(function (r) {
      if (V !== v || v.ver !== ver) return;
      var connus = {}; v.items.forEach(function (i) { connus[i.post_id] = 1; });
      var nouveaux = (r.items || []).filter(function (i) { return !connus[i.post_id]; });
      if (sens === 'apres') { nouveaux.reverse(); v.items = nouveaux.concat(v.items); v.idx += nouveaux.length; } else v.items = v.items.concat(nouveaux);
      if (r.suivant == null) v.fin[sens] = true; else v.cur[sens] = r.suivant;
    }).catch(function () { /* nouvel essai au prochain balayage */ }).then(function () {
      if (V === v && v.ver === ver) { v.charge[sens] = false; majFleches(); }
    });
  }
  function changerPortee(p) {
    if (!V || p === V.scope || (p === 'auteur' && !V.auteurId)) return;
    var it = cur(); V.scope = p; V.items = [it]; V.idx = 0; V.cur = { avant: it.post_id, apres: it.post_id };
    V.fin = { avant: false, apres: false }; V.charge = { avant: false, apres: false }; V.ver++;
    majPortee(); majFleches(); charger('avant'); charger('apres');
  }

  /* ---------- navigation ---------- */
  function aller(d) {
    if (!V) return; var n = V.idx + d;
    if (n < 0 || n >= V.items.length) { rebond(d); if (n >= V.items.length) charger('avant'); else charger('apres'); return; }
    V.idx = n; V.mi = 0; render(d);
    if (n >= V.items.length - 3) charger('avant'); if (n <= 2) charger('apres');
  }
  function media(d) {
    if (!V) return; var it = cur(), n = V.mi + d; if (n < 0 || n >= it.medias.length) return; V.mi = n; render(0);
  }
  function rebond(d) {
    var s = V && V.el && V.el.querySelector('.mv-stage'); if (!s) return;
    s.classList.remove('mv-bump-h', 'mv-bump-b'); void s.offsetWidth; s.classList.add(d > 0 ? 'mv-bump-b' : 'mv-bump-h');
  }

  /* ---------- rendu ---------- */
  function majFleches() {
    if (!V) return; var b = V.el.querySelectorAll('[data-d]');
    b[0].disabled = V.idx <= 0 && V.fin.apres; b[1].disabled = V.idx >= V.items.length - 1 && V.fin.avant;
  }
  function majPortee() {
    if (!V) return;
    V.el.querySelectorAll('[data-p]').forEach(function (b) {
      b.classList.toggle('on', b.dataset.p === V.scope);
      if (b.dataset.p === 'auteur') b.hidden = !V.auteurId;
    });
  }
  function majMute() {
    var m = V && V.el.querySelector('.mv-mute'), v = V && V.el.querySelector('video'); if (!m || !v) return;
    m.textContent = v.muted ? '🔇' : '🔊'; m.setAttribute('aria-label', v.muted ? 'Activer le son' : 'Couper le son');
  }
  function majActions() {
    if (!V) return; var it = cur(), el = V.el;
    var l = el.querySelector('[data-a="like"]'); if (!l) return;
    l.classList.toggle('on', !!it.a_aime); l.querySelector('i').textContent = it.a_aime ? '♥' : '♡'; l.querySelector('span').textContent = it.nb_likes || '';
    el.querySelector('[data-a="open"] span').textContent = it.nb_commentaires ? it.nb_commentaires : '';
  }
  function render(dir) {
    if (!V) return; var it = cur(), m = it.medias[V.mi] || it.medias[0], el = V.el, st = el.querySelector('.mv-stage');
    var mk = m.kind || it.kind;
    st.classList.remove('mv-bump-h', 'mv-bump-b');
    var anim = dir > 0 ? 'mv-in-b' : dir < 0 ? 'mv-in-h' : '';
    if (mk === 'video') {
      st.innerHTML = '<video class="mv-media ' + anim + '" playsinline loop preload="auto"' + (m.poster ? ' poster="' + esc(m.poster) + '"' : '') + ' src="' + esc(m.url) + '"></video>'
        + '<div class="mv-play" aria-hidden="true">▶</div><button type="button" class="mv-mute" aria-label="Couper le son">🔊</button><div class="mv-prog"><i></i></div>';
      var vid = st.querySelector('video'), prog = st.querySelector('.mv-prog i'), play = st.querySelector('.mv-play');
      vid.addEventListener('timeupdate', function () { if (vid.duration) prog.style.width = (vid.currentTime / vid.duration * 100) + '%'; });
      vid.addEventListener('pause', function () { play.classList.add('on'); }); vid.addEventListener('play', function () { play.classList.remove('on'); });
      st.querySelector('.mv-mute').onclick = function (e) { e.stopPropagation(); vid.muted = !vid.muted; majMute(); };
      vid.muted = false; var p = vid.play();
      if (p && p.catch) p.catch(function () { vid.muted = true; majMute(); vid.play().catch(function () {}); });
      majMute();
    } else {
      st.innerHTML = '<img class="mv-media ' + anim + '" src="' + esc(m.url) + '" alt="' + esc(it.titre || 'Photo') + '" draggable="false">';
    }
    var dots = el.querySelector('.mv-dots');
    dots.innerHTML = it.medias.length > 1 ? it.medias.map(function (x, i) { return '<b class="' + (i === V.mi ? 'on' : '') + '"></b>'; }).join('') : '';
    var photo = it.auteur_photo ? '<img src="' + esc(it.auteur_photo) + '" alt="" onerror="this.remove()">' : '';
    var ini = esc((it.auteur_nom || '?').trim().charAt(0).toUpperCase());
    el.querySelector('.mv-info').innerHTML = '<div class="mv-auteur"><button type="button" class="mv-av" data-a="auteur" aria-label="Voir le profil">' + (photo || ini) + '</button>'
      + '<button type="button" class="mv-nom" data-a="auteur">' + esc(it.auteur_nom || 'Diaspo’Actif') + '</button></div>'
      + ((it.titre || it.extrait) ? '<div class="mv-txt">' + (it.titre ? '<b>' + esc(it.titre) + '</b> ' : '') + esc(it.extrait) + '</div>' : '')
      + '<div class="mv-actions"><button type="button" data-a="like" aria-label="J’aime"><i>♡</i><span></span></button>'
      + '<button type="button" data-a="open" aria-label="Commentaires">💬 <span></span></button>'
      + '<button type="button" data-a="part" aria-label="Partager">↗ Partager</button>'
      + '<button type="button" class="pri" data-a="open">Voir la publication</button></div>';
    majActions(); majFleches();
    if (mk === 'photo') { var nx = V.items[V.idx + 1]; if (nx && nx.medias[0] && nx.kind === 'photo') { var im = new Image(); im.src = nx.medias[0].url; } }
  }

  /* ---------- actions ---------- */
  function aimer() {
    var it = cur(); if (!it || it.a_aime) return;
    fetch('/api/fil/' + it.post_id + '/react', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'like' }) })
      .then(function (r) { if (r.status === 401) { toast('Connectez-vous pour aimer cette publication.'); return; } if (!r.ok) throw new Error(); it.a_aime = true; it.nb_likes++; majActions(); })
      .catch(function () { toast('Action impossible pour le moment.'); });
  }
  function partager() {
    var it = cur(); if (!it) return;
    var url = location.origin + '/fil-actualite.html?post=' + it.post_id + '&r=' + Date.now().toString(36), titre = it.titre || it.auteur_nom || 'Diaspo’Actif';
    var secours = function () { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { toast('Lien copié ✓'); }, function () { toast(url); }); else toast(url); };
    if (navigator.share) navigator.share({ title: titre, url: url }).catch(function (e) { if (!e || e.name !== 'AbortError') secours(); }); else secours();
  }
  function ouvrirPost() {
    var it = cur(), o = V && V.opts; if (!it) return; fermer();
    if (o && o.onOpenPost) o.onOpenPost(it.post_id); else location.href = '/fil-actualite.html?post=' + it.post_id;
  }
  function ouvrirProfil() {
    var it = cur(), o = V && V.opts; if (!it || !it.auteur_id) return; fermer();
    if (o && o.onOpenProfile) o.onOpenProfile(it.auteur_id); else location.href = '/profil.html?id=' + it.auteur_id;
  }

  /* ---------- site : vue détaillée d'une publication (posts.js) ---------- */
  function attachDetail(zone, post) {
    if (!zone || !post) return;
    var kind = mediasDe(post).some(function (m) { return m.kind === 'video'; }) && !mediasDe(post).some(function (m) { return m.kind === 'photo'; }) ? 'video'
      : (mediasDe(post).some(function (m) { return m.kind === 'photo'; }) ? 'photo' : 'video');
    zone.dataset.mvPost = post.id; zone.dataset.mvKind = kind;
    var aVideo = mediasDe(post).some(function (m) { return m.kind === 'video'; }), aPhoto = mediasDe(post).some(function (m) { return m.kind === 'photo'; });
    if (!aVideo && !aPhoto) return;
    var old = zone.querySelector('.mv-expand'); if (old) old.remove();
    var b = document.createElement('button'); b.type = 'button'; b.className = 'mv-expand'; b.title = 'Plein écran : parcourir les ' + (kind === 'video' ? 'vidéos' : 'photos');
    b.textContent = '⤢ Plein écran'; b.setAttribute('data-mv-ouvrir', '1'); zone.appendChild(b);
    if (!zone.__mv) {
      zone.__mv = 1;
      zone.addEventListener('click', function (e) {
        var img = e.target.closest('img.post-media-fg'), btn = e.target.closest('[data-mv-ouvrir]'); if (!img && !btn) return;
        e.preventDefault(); e.stopPropagation();
        open({ kind: img ? 'photo' : zone.dataset.mvKind, post_id: zone.dataset.mvPost, url: img ? img.getAttribute('src') : undefined, portee: /profil/i.test(location.pathname) ? 'auteur' : 'plateforme' }, {});
      }, true);
    }
  }

  root.MediaViewer = { open: open, close: fermer, attachDetail: attachDetail, estOuvert: function () { return !!V; } };
})(typeof window !== 'undefined' ? window : globalThis);

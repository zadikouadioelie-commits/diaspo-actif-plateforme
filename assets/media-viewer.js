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
  var plain = function (s) { s = String(s == null ? '' : s).replace(/<[^>]*>/g, ' '); for (var i = 0; i < 6 && /&(?:#39|#x27|apos|quot|amp|lt|gt);/i.test(s); i++) s = s.replace(/&(?:#39|#x27|apos);/gi, "'").replace(/&quot;/gi, '"').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&'); return s.replace(/&nbsp;/g, ' ').replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim(); };
  var V = null, toastT = null;
  /* Petite caméra stylisée (logo « Reels ») : corps arrondi, objectif en triangle, dégradé or — même dessin sur le site et sur téléphone. */
  var CAM = '<svg class="mv-cam" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="mvcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F3DC9B"/><stop offset=".5" stop-color="#E3C06E"/><stop offset="1" stop-color="#B9893A"/></linearGradient></defs><rect x="2" y="6" width="13.5" height="12" rx="3.2" fill="url(#mvcg)"/><path d="M17.2 10.4l4.2-2.5a.7.7 0 0 1 1.05.6v7a.7.7 0 0 1-1.05.6l-4.2-2.5z" fill="url(#mvcg)"/><circle cx="8.7" cy="12" r="2.6" fill="#0B1226" opacity=".85"/></svg>';

  /* Les six réactions du fil (mêmes types que REACTIONS dans assets/posts.js et que REACTIONS_FIL côté serveur). */
  var REACTIONS = [['like', '❤️', 'J’aime'], ['applause', '👏', 'Applaudir'], ['utile', '💡', 'Utile'], ['soutien', '🤝', 'Soutenir'], ['feliciter', '🎉', 'Féliciter'], ['inspirant', '🔥', 'Inspirant']];
  var emojiDe = function (t) { for (var i = 0; i < REACTIONS.length; i++) if (REACTIONS[i][0] === t) return REACTIONS[i][1]; return '❤️'; };

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

  /* ---------- Reels : l'univers des petites vidéos de la plateforme (2026-10-13, demande explicite) ----------
     Même visionneur, ouvert directement sur la vidéo la plus récente de TOUTE la plateforme, vidéos seules : on balaie vers le haut / le bas
     (ou ↑ ↓, molette) pour passer à la suivante, avec toutes les actions : j'aime, commentaires (tiroir), enregistrer, partager, s'abonner
     à l'auteur, voir la publication (où l'on peut aussi contribuer). */
  function openReels(opts) {
    if (V) fermer(true);
    var v = V = { kind: 'video', reels: true, scope: (opts && opts.auteurId) ? 'auteur' : 'plateforme', auteurId: (opts && Number(opts.auteurId)) || null, items: [], idx: 0, mi: 0, opts: opts || {}, cur: { avant: null, apres: null }, fin: { avant: false, apres: true }, charge: { avant: false, apres: false }, histo: false, ver: 0, anim: 0, roue: 0 };
    construire();
    return getJson('/api/fil/medias?type=video&limit=8' + (opts && opts.auteurId ? '&auteur_id=' + Number(opts.auteurId) : '') + (opts && opts.postId ? '&avant=' + (Number(opts.postId) + 1) : '')).then(function (r) {
      if (V !== v) return false;
      var l = (r && r.items) || [];
      if (!l.length) { ecranVide(v); return false; }
      if (opts && opts.postId) v.fin.apres = false;
      v.items = l; v.idx = 0; v.mi = 0; v.cur.avant = r.suivant != null ? r.suivant : l[l.length - 1].post_id; if (r.suivant == null) v.fin.avant = true;
      v.cur.apres = l[0].post_id; majPortee(); render(0); charger('avant');
      return true;
    }, function () { if (V === v) { toast('Les Reels ne se chargent pas pour le moment.'); setTimeout(function () { if (V === v) fermer(); }, 1800); } return false; });
  }

  /* Aucun Reel (encore) : le visionneur reste ouvert et invite à publier le premier (2026-10-14). */
  function ecranVide(v) {
    v.fin = { avant: true, apres: true };
    v.el.querySelector('.mv-stage').innerHTML = '';
    v.el.querySelector('.mv-info').innerHTML = '<div class="mv-vide"><b>Aucun Reel pour le moment</b><p>Soyez le premier à publier une petite vidéo : toute la communauté pourra la voir et réagir.</p>'
      + '<button type="button" class="mv-voir" data-a="creer">＋ Créer un Reel</button></div>';
  }
  /* Création d'un Reel (fenêtre assets/reels-creer.js, chargée à la demande) — après publication, le visionneur se rouvre sur le nouveau Reel. */
  function creer() {
    var lancer = function () {
      window.ReelsCreer.ouvrir({
        onLogin: V && V.opts && V.opts.onLogin,
        onPublie: function (r) { if (V && r && r.post_id) { var o = {}; for (var k in V.opts) o[k] = V.opts[k]; o.postId = r.post_id; openReels(o); } }
      });
    };
    if (window.ReelsCreer) { lancer(); return; }
    var sc = document.createElement('script'); sc.src = '/assets/reels-creer.js?v=20261014a'; sc.onload = lancer;
    sc.onerror = function () { toast('Impossible d’ouvrir la création pour le moment.'); };
    document.head.appendChild(sc);
  }

  function construire() {
    var d = document.createElement('div');
    d.className = 'mv' + (V.reels ? ' mv-reels' : ''); d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-label', V.reels ? 'Reels' : 'Visionneur de médias');
    d.innerHTML = '<div class="mv-top"><button type="button" class="mv-btn mv-x" aria-label="Fermer">✕</button>'
      + (V.reels ? '<div class="mv-brand">' + CAM + '<b>Reels</b></div><button type="button" class="mv-creer" data-a="creer" aria-label="Créer un Reel">＋ Créer</button>'
        : '<div class="mv-portee" role="tablist"><button type="button" data-p="auteur">Cette personne</button><button type="button" data-p="plateforme">Toute la plateforme</button></div>') + '</div>'
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
      var a0 = e.target.closest('[data-a="like"]');
      if (a0 && V.lp) { V.lp = false; return; }                                              /* le « clic » qui suit l'appui long ne doit pas refermer le choix qu'il vient d'ouvrir */
      var rr = e.target.closest('[data-r]'); if (rr) { reagir(rr.dataset.r); fermerPicker(); return; }
      if (!e.target.closest('.mv-picker')) fermerPicker();
      var a = e.target.closest('[data-a]'); if (!a) return;
      var k = a.dataset.a;
      if (k === 'creer') creer();
      else if (k === 'like') { if (V.reels) reagir('like'); else aimer(); } else if (k === 'part') partager(); else if (k === 'auteur') ouvrirProfil();
      else if (k === 'comm') commentaires(); else if (k === 'suivre') suivre(); else if (k === 'save') enregistrer(); else ouvrirPost();
    });
    /* Réactions des Reels : appui long (téléphone), survol (ordinateur) ou clic droit sur le cœur ouvrent le choix des six réactions. */
    var lpT = null, survolT = null, peutSurvoler = window.matchMedia && window.matchMedia('(hover:hover)').matches;
    d.addEventListener('pointerdown', function (e) {
      if (!V || !V.reels || !e.target.closest('[data-a="like"]')) return; V.lp = false; clearTimeout(lpT);
      lpT = setTimeout(function () { if (V) { V.lp = true; ouvrirPicker(); } }, 450);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) { d.addEventListener(t, function () { clearTimeout(lpT); setTimeout(function () { if (V) V.lp = false; }, 400); }, true); });   /* le « clic » qui suit un appui long est ignoré, puis l'indicateur retombe */
    d.addEventListener('contextmenu', function (e) { if (V && V.reels && e.target.closest('[data-a="like"]')) { e.preventDefault(); ouvrirPicker(); } });
    d.addEventListener('mouseover', function (e) {
      if (!peutSurvoler || !V || !V.reels || !e.target.closest('[data-a="like"]') || d.querySelector('.mv-picker')) return;
      clearTimeout(survolT); survolT = setTimeout(function () { if (V) ouvrirPicker(); }, 350);
    });
    d.addEventListener('mouseout', function (e) { if (e.target.closest('[data-a="like"]')) clearTimeout(survolT); });
    document.addEventListener('keydown', touches, true);
    window.addEventListener('popstate', retour);
  }
  function touches(e) {
    if (!V) return;
    if (document.querySelector('.rc-fond')) return;                                             /* fenêtre de création ouverte : elle gère le clavier */
    var k = e.key;
    if (k === 'Escape' && V.el.querySelector('.mv-picker')) { e.preventDefault(); e.stopPropagation(); fermerPicker(); return; }
    if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) {            /* saisie d'un commentaire : les lettres ne font pas défiler */
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerCommentaires(); }
      return;
    }
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (V.el.querySelector('.mv-comm')) fermerCommentaires(); else fermer(); }
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
    if (V.reels && it.reactions) {
      var mes = it.mes_reactions || [], total = it.nb_reactions || 0;
      l.classList.toggle('on', mes.length > 0); l.querySelector('i').textContent = mes.length ? emojiDe(mes[0]) : '♡'; l.querySelector('span').textContent = total || '';
      var rs = el.querySelector('.mv-reacts');
      if (rs) rs.innerHTML = REACTIONS.filter(function (r) { return it.reactions[r[0]] > 0; }).sort(function (a, b) { return it.reactions[b[0]] - it.reactions[a[0]]; })
        .map(function (r) { return '<span class="' + (mes.indexOf(r[0]) >= 0 ? 'on' : '') + '" title="' + esc(r[2]) + '">' + r[1] + ' ' + it.reactions[r[0]] + '</span>'; }).join('');
    } else { l.classList.toggle('on', !!it.a_aime); l.querySelector('i').textContent = it.a_aime ? '♥' : '♡'; l.querySelector('span').textContent = it.nb_likes || ''; }
    var c = el.querySelector('[data-a="comm"] span') || el.querySelector('[data-a="open"] span'); if (c) c.textContent = it.nb_commentaires ? it.nb_commentaires : '';
    var sv = el.querySelector('[data-a="save"]'); if (sv) { sv.classList.toggle('on', !!it.a_enregistre); sv.querySelector('span').textContent = it.a_enregistre ? 'Enregistré' : 'Enregistrer'; }
    var sf = el.querySelector('[data-a="suivre"]'); if (sf) { sf.classList.toggle('on', !!it.suivi); sf.textContent = it.suivi ? 'Abonné ✓' : '+ S’abonner'; sf.hidden = !!it.est_moi || !it.auteur_id; }
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
    if (V.reels) {
      el.querySelector('.mv-info').innerHTML = '<div class="mv-rail">'
        + '<button type="button" data-a="like" aria-label="J’aime"><i>♡</i><span></span></button>'
        + '<button type="button" data-a="comm" aria-label="Commentaires"><i>💬</i><span></span></button>'
        + '<button type="button" data-a="save" aria-label="Enregistrer"><i>🔖</i><span>Enregistrer</span></button>'
        + '<button type="button" data-a="part" aria-label="Partager"><i>↗</i><span>Partager</span></button></div>'
        + '<div class="mv-auteur"><button type="button" class="mv-av" data-a="auteur" aria-label="Voir le profil">' + (photo || ini) + '</button>'
        + '<button type="button" class="mv-nom" data-a="auteur">' + esc(it.auteur_nom || 'Membre') + '</button>'
        + '<button type="button" class="mv-suivre" data-a="suivre">+ S’abonner</button></div>'
        + ((it.titre || it.extrait) ? '<div class="mv-txt">' + (it.titre ? '<b>' + esc(it.titre) + '</b> ' : '') + esc(it.extrait) + '</div>' : '')
        + '<div class="mv-reacts" aria-label="Réactions"></div>'
        + '<button type="button" class="mv-voir" data-a="open">Voir la publication · Contribuer ›</button>';
      majActions(); majFleches();
      return;
    }
    el.querySelector('.mv-info').innerHTML = '<div class="mv-auteur"><button type="button" class="mv-av" data-a="auteur" aria-label="Voir le profil">' + (photo || ini) + '</button>'
      + '<button type="button" class="mv-nom" data-a="auteur">' + esc(it.auteur_nom || 'Membre') + '</button></div>'
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
  /* Réactions des Reels (2026-10-14) : un appui sur le cœur ajoute / retire « J'aime » ; le choix complet (six réactions) s'ouvre par appui long,
     survol ou clic droit. Chaque réaction se pose et se retire séparément ; le serveur garde un compteur par type. */
  function reagir(type) {
    var it = cur(); if (!it) return;
    it.reactions = it.reactions || {}; it.mes_reactions = it.mes_reactions || [];
    var deja = it.mes_reactions.indexOf(type) >= 0;
    var req = deja ? fetch('/api/fil/' + it.post_id + '/react/' + encodeURIComponent(type), { method: 'DELETE', credentials: 'same-origin' })
      : fetch('/api/fil/' + it.post_id + '/react', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: type }) });
    req.then(function (r) {
      if (r.status === 401) { toast('Connectez-vous pour réagir.'); return null; }
      if (!r.ok) throw new Error(); return r.json();
    }).then(function (j) {
      if (!j) return;
      var c = {}, tot = 0; REACTIONS.forEach(function (x) { var n = Number((j.reactions || {})[x[0]]) || 0; if (n) { c[x[0]] = n; tot += n; } });
      it.reactions = c; it.nb_reactions = tot;
      it.mes_reactions = deja ? it.mes_reactions.filter(function (t) { return t !== type; }) : it.mes_reactions.concat([type]);
      it.a_aime = it.mes_reactions.indexOf('like') >= 0; it.nb_likes = c.like || 0;
      if (V && cur() === it) majActions();
    }).catch(function () { toast('Action impossible pour le moment.'); });
  }
  function fermerPicker() { var p = V && V.el && V.el.querySelector('.mv-picker'); if (p) p.remove(); }
  function ouvrirPicker() {
    var it = cur(); if (!V || !it) return; fermerPicker();
    var info = V.el.querySelector('.mv-info'), like = V.el.querySelector('[data-a="like"]'); if (!info || !like) return;
    var mes = it.mes_reactions || [], rc = it.reactions || {};
    var p = document.createElement('div'); p.className = 'mv-picker'; p.setAttribute('role', 'menu'); p.setAttribute('aria-label', 'Choisir une réaction');
    p.innerHTML = REACTIONS.map(function (r) {
      return '<button type="button" role="menuitem" data-r="' + r[0] + '" class="' + (mes.indexOf(r[0]) >= 0 ? 'on' : '') + '" aria-label="' + esc(r[2]) + '" title="' + esc(r[2]) + '"><i>' + r[1] + '</i><span>' + (rc[r[0]] || '') + '</span></button>';
    }).join('');
    info.appendChild(p);
    var br = like.getBoundingClientRect(), ir = info.getBoundingClientRect();
    p.style.top = (br.top - ir.top - 4) + 'px'; p.style.right = (ir.right - br.left + 6) + 'px';
  }
  function partager() {
    var it = cur(); if (!it) return;
    var url = location.origin + '/fil-actualite.html?post=' + it.post_id + '&r=' + Date.now().toString(36), titre = it.titre || it.auteur_nom || 'Diaspo’Actif';
    var secours = function () { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(function () { toast('Lien copié ✓'); }, function () { toast(url); }); else toast(url); };
    if (navigator.share) navigator.share({ title: titre, url: url }).catch(function (e) { if (!e || e.name !== 'AbortError') secours(); }); else secours();
  }
  var ilYa = function (s) { var t = new Date(String(s || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s || '')) ? '' : 'Z')); if (isNaN(t)) return ''; var d = Math.round((Date.now() - t) / 60000); return d < 1 ? 'à l’instant' : d < 60 ? d + ' min' : d < 1440 ? Math.round(d / 60) + ' h' : Math.round(d / 1440) + ' j'; };
  function suivre() {
    var it = cur(); if (!it || !it.auteur_id) return;
    fetch('/api/follow/' + it.auteur_id, { method: it.suivi ? 'DELETE' : 'POST', credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { toast('Connectez-vous pour vous abonner.'); return; } if (!r.ok) throw new Error();
        var etat = !it.suivi; V.items.forEach(function (x) { if (x.auteur_id === it.auteur_id) x.suivi = etat; }); majActions(); toast(etat ? 'Abonné ✓' : 'Abonnement retiré');
      }).catch(function () { toast('Action impossible pour le moment.'); });
  }
  function enregistrer() {
    var it = cur(); if (!it) return;
    fetch('/api/fil/' + it.post_id + '/bookmark', { method: 'POST', credentials: 'same-origin' })
      .then(function (r) { if (r.status === 401) { toast('Connectez-vous pour enregistrer cette vidéo.'); return null; } if (!r.ok) throw new Error(); return r.json(); })
      .then(function (j) { if (!j) return; it.a_enregistre = !!j.bookmarked; majActions(); toast(it.a_enregistre ? 'Enregistré ✓' : 'Retiré des enregistrements'); })
      .catch(function () { toast('Action impossible pour le moment.'); });
  }
  function fermerCommentaires() { var d = V && V.el.querySelector('.mv-comm'); if (d) d.remove(); }
  function commentaires() {
    var it = cur(); if (!it || !V) return;
    if (V.el.querySelector('.mv-comm')) { fermerCommentaires(); return; }
    var d = document.createElement('div'); d.className = 'mv-comm'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Commentaires');
    d.innerHTML = '<div class="mv-comm-h"><b>Commentaires</b><button type="button" class="mv-btn mv-comm-x" aria-label="Fermer les commentaires">✕</button></div>'
      + '<div class="mv-comm-l"><p class="mv-comm-vide">Chargement…</p></div>'
      + '<form class="mv-comm-f"><input type="text" maxlength="500" placeholder="Écrire un commentaire…" aria-label="Écrire un commentaire" autocomplete="off"><button type="submit">Publier</button></form>';
    V.el.appendChild(d);
    var liste = d.querySelector('.mv-comm-l'), v = V, post = it.post_id;
    var ligne = function (c) {
      var ini = esc((c.auteur_nom || '?').trim().charAt(0).toUpperCase()), ph = c.photo_url && urlOk(c.photo_url) ? '<img src="' + esc(c.photo_url) + '" alt="" onerror="this.remove()">' : '';
      return '<div class="mv-c"><span class="mv-c-av">' + (ph || ini) + '</span><div><b>' + esc(c.auteur_nom || 'Membre') + '</b> <small>' + esc(ilYa(c.created_at)) + '</small><p>' + esc(c.contenu) + '</p></div></div>';
    };
    var peindre = function (l) { liste.innerHTML = l.length ? l.map(ligne).join('') : '<p class="mv-comm-vide">Aucun commentaire. Soyez le premier !</p>'; liste.scrollTop = liste.scrollHeight; };
    var cache = [];
    getJson('/api/fil/' + encodeURIComponent(post) + '/commentaires').then(function (r) { if (V !== v) return; cache = r.commentaires || []; it.nb_commentaires = cache.length; majActions(); peindre(cache); }, function () { liste.innerHTML = '<p class="mv-comm-vide">Les commentaires ne se chargent pas pour le moment.</p>'; });
    d.querySelector('.mv-comm-x').onclick = fermerCommentaires;
    d.querySelector('form').onsubmit = function (e) {
      e.preventDefault(); var inp = d.querySelector('input'), txt = inp.value.trim(); if (!txt) return;
      fetch('/api/fil/' + encodeURIComponent(post) + '/commentaires', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contenu: txt }) })
        .then(function (r) { if (r.status === 401) { toast('Connectez-vous pour commenter.'); return null; } if (!r.ok) throw new Error(); return r.json(); })
        .then(function (j) { if (!j || V !== v) return; var c = j.commentaire || j; cache.push(c); it.nb_commentaires = cache.length; inp.value = ''; majActions(); peindre(cache); })
        .catch(function () { toast('Commentaire impossible pour le moment.'); });
    };
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

  root.MediaViewer = { open: open, openReels: openReels, iconeReels: function () { return CAM; }, close: fermer, attachDetail: attachDetail, estOuvert: function () { return !!V; } };
})(typeof window !== 'undefined' ? window : globalThis);

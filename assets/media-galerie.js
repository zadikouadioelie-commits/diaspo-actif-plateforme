/* ============================================================
   Diaspo'Actif — Galerie photos et vidéos des cartouches et des comptes-rendus (2026-10-09, demande explicite)
   « Affiche les contenus médias en bas des cartouches, pour faire comprendre qu'on peut regarder toutes les photos et vidéos ;
   rends les cartouches cliquables ; en cliquant, on accède aux réactions et on peut défiler sur les autres médias — sans ouvrir
   une nouvelle page. »
   Deux briques, partagées par la page de lecture d'un compte-rendu et par les cartouches de l'accueil :
     MediaGalerie.bandeau(items)  → HTML de la bande de miniatures « 📷 8 photos · 🎬 1 vidéo — Voir tout » (à poser au bas d'une cartouche)
     MediaGalerie.open({items, index, titre, adapter}) → visionneuse plein écran dans la page : flèches, balayage, miniatures,
        touches ← → Échap, bouton retour ; barre du bas = réactions / commentaires / partage fournis par `adapter`.
   adapter = { lire(): Promise<{types:[[clé, emoji]…], reacts:{}, mine:{}, nbCom:n}>, reagir(clé): Promise<bool>,
               commentaires(): void, partager(): void, apres(): void (rafraîchir la page hôte après une réaction), connecte(): bool }
   ============================================================ */
(function (root) {
  'use strict';
  var RE_VIDEO = /\.(mp4|webm|mov|m4v|ogv)(\?|#|$)/i, RE_IMG = /\.(jpe?g|png|gif|webp|avif)(\?|#|$)/i;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var urlOk = function (u) { return typeof u === 'string' && /^(https?:\/\/|\/[^\/])/i.test(u); };
  var V = null;

  /* ---------- données ---------- */
  /* Photos et vidéos d'une publication du fil (champs medias / media_url) et, pour un compte-rendu, ses photos + sa vidéo-fichier ;
     à défaut de tout autre média, l'affiche du compte-rendu. */
  function itemsDePost(p) {
    var out = [], vu = {};
    var add = function (url, type, poster) {
      if (!urlOk(url) || vu[url]) return; vu[url] = 1;
      var video = type === 'video' || RE_VIDEO.test(url);
      if (!video && !(type === 'image' || type === 'photo' || RE_IMG.test(url) || !type)) return;
      out.push({ url: url, kind: video ? 'video' : 'photo', poster: urlOk(poster) ? poster : null });
    };
    if (!p) return out;
    var l = []; try { l = JSON.parse(p.medias || '[]'); } catch (e) { l = []; }
    if (!Array.isArray(l)) l = [];
    if (p.media_url) l.unshift({ type: p.media_type || '', url: p.media_url });
    l.forEach(function (m) { if (typeof m === 'string') add(m); else if (m) add(m.url, m.type, m.poster || m.thumbnail); });
    var cr = p.compte_rendu;
    if (cr) {
      (cr.medias || []).forEach(function (u) { add(u, 'image'); });
      if (cr.video_url && RE_VIDEO.test(cr.video_url)) add(cr.video_url, 'video');
      if (!out.length && cr.image) add(cr.image, 'image');
    }
    return out;
  }
  function libelle(items) {
    var ph = items.filter(function (i) { return i.kind === 'photo'; }).length, vi = items.length - ph, t = [];
    if (ph) t.push('📷 ' + ph + ' photo' + (ph > 1 ? 's' : ''));
    if (vi) t.push('🎬 ' + vi + ' vidéo' + (vi > 1 ? 's' : ''));
    return t.join(' · ');
  }

  /* ---------- bande de miniatures au bas d'une cartouche ---------- */
  function bandeau(items, max) {
    max = max || 5;
    if (!items || !items.length) return '';
    styles(); /* les styles de la bande doivent exister dès le rendu de la cartouche, pas seulement à l'ouverture de la galerie */
    var vis = items.slice(0, max), reste = items.length - vis.length;
    return '<div class="mgb" role="group" aria-label="Photos et vidéos : touchez pour tout voir"><div class="mgb-tiles">'
      + vis.map(function (it, i) {
        var fond = it.kind === 'video'
          ? (it.poster ? '<img src="' + esc(it.poster) + '" alt="" loading="lazy">' : '<video src="' + esc(it.url) + '#t=0.1" preload="metadata" muted playsinline></video>') + '<span class="mgb-play" aria-hidden="true">▶</span>'
          : '<img src="' + esc(it.url) + '" alt="" loading="lazy">';
        var plus = (i === vis.length - 1 && reste > 0) ? '<span class="mgb-plus">+' + reste + '</span>' : '';
        return '<button type="button" class="mgb-t" data-mgi="' + i + '" aria-label="Ouvrir ' + (it.kind === 'video' ? 'la vidéo ' : 'la photo ') + (i + 1) + ' sur ' + items.length + '">' + fond + plus + '</button>';
      }).join('')
      + '</div><button type="button" class="mgb-lib" data-mgi="0">' + libelle(items) + ' <b>Voir tout ›</b></button></div>';
  }

  /* ---------- visionneuse ---------- */
  function styles() {
    if (document.getElementById('mg-css')) return;
    var s = document.createElement('style'); s.id = 'mg-css';
    s.textContent = [
      '.mgb{margin:12px 0 4px}',
      '.mgb-tiles{display:flex;gap:6px}',
      '.mgb-t{position:relative;flex:1 1 0;min-width:0;aspect-ratio:1/1;border:0;padding:0;border-radius:10px;overflow:hidden;background:#dfe5ee;cursor:zoom-in}',
      '.mgb-t img,.mgb-t video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s}',
      '.mgb-t:hover img,.mgb-t:hover video{transform:scale(1.06)}',
      '.mgb-t:focus-visible,.mgb-lib:focus-visible{outline:3px solid #F26422;outline-offset:2px}',
      '.mgb-play{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-size:22px;background:rgba(0,0,0,.28);text-shadow:0 1px 4px rgba(0,0,0,.6)}',
      '.mgb-plus{position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-weight:800;font-size:20px;background:rgba(10,20,40,.62)}',
      '.mgb-lib{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;margin-top:6px;border:0;background:none;padding:6px 2px;font:inherit;font-size:13px;color:inherit;opacity:.85;cursor:pointer;text-align:left}',
      '.mgb-lib b{font-weight:800;color:#1558C8;opacity:1}',
      '.mg{position:fixed;inset:0;z-index:2147483000;background:rgba(6,12,26,.97);display:flex;flex-direction:column;color:#fff;font-family:inherit}',
      '.mg:focus{outline:none}',
      '.mg-top{flex:none;display:flex;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 8px}',
      '.mg-x{width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;font-size:18px;cursor:pointer}',
      '.mg-n{font-weight:800;font-size:14px}',
      '.mg-ti{margin-left:auto;font-size:13px;opacity:.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%}',
      '.mg-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 56px}',
      '.mg-media{max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;background:#000}',
      '.mg-fl{position:absolute;top:50%;transform:translateY(-50%);width:46px;height:46px;border-radius:50%;border:0;background:rgba(255,255,255,.18);color:#fff;font-size:28px;line-height:1;cursor:pointer;z-index:2}',
      '.mg-prev{left:8px}.mg-next{right:8px}',
      '.mg-strip{flex:none;display:flex;gap:8px;overflow-x:auto;padding:8px 14px;scrollbar-width:thin}',
      '.mg-th{position:relative;flex:none;width:68px;height:52px;border:2px solid transparent;border-radius:8px;overflow:hidden;padding:0;background:#222;cursor:pointer;opacity:.6}',
      '.mg-th img,.mg-th video{width:100%;height:100%;object-fit:cover;display:block}',
      '.mg-th.on{border-color:#F26422;opacity:1}',
      '.mg-bar{flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;padding:8px 14px calc(env(safe-area-inset-bottom,0px) + 14px)}',
      '.mg-r{border:1.5px solid rgba(255,255,255,.28);background:rgba(255,255,255,.1);color:#fff;border-radius:99px;padding:9px 16px;font:inherit;font-size:15px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}',
      '.mg-r.on{background:#F26422;border-color:#F26422}.mg-r b{font-weight:800}',
      '.mg-hint{font-size:13px;opacity:.85}.mg-hint a{color:#8CC4FF}',
      '@media (max-width:560px){.mg-stage{padding:0 8px}.mg-fl{width:40px;height:40px;font-size:24px}.mg-lib{display:none}.mg-ti{display:none}.mgb-plus{font-size:16px}}'
    ].join('\n');
    document.head.appendChild(s);
  }
  function open(cfg) {
    if (V || !cfg || !cfg.items || !cfg.items.length) return;
    styles();
    var items = cfg.items.filter(function (i) { return i && urlOk(i.url); });
    if (!items.length) return;
    var ov = document.createElement('div');
    ov.className = 'mg'; ov.tabIndex = -1; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Photos et vidéos');
    ov.innerHTML = '<div class="mg-top"><button type="button" class="mg-x" aria-label="Fermer">✕</button><span class="mg-n" aria-live="polite"></span><span class="mg-ti">' + esc(cfg.titre || '') + '</span></div>'
      + '<div class="mg-stage"><button type="button" class="mg-fl mg-prev" aria-label="Précédent">‹</button><div class="mg-slot"></div><button type="button" class="mg-fl mg-next" aria-label="Suivant">›</button></div>'
      + '<div class="mg-strip">' + items.map(function (it, k) {
        var th = it.kind === 'video' ? (it.poster ? '<img src="' + esc(it.poster) + '" alt="">' : '<video src="' + esc(it.url) + '#t=0.1" preload="metadata" muted playsinline></video>') + '<span class="mgb-play" aria-hidden="true">▶</span>' : '<img src="' + esc(it.url) + '" alt="" loading="lazy">';
        return '<button type="button" class="mg-th" data-k="' + k + '" aria-label="' + (it.kind === 'video' ? 'Vidéo ' : 'Photo ') + (k + 1) + '">' + th + '</button>';
      }).join('') + '</div><div class="mg-bar"></div>';
    document.body.appendChild(ov);
    V = { el: ov, items: items, i: Math.max(0, Math.min(items.length - 1, cfg.index || 0)), a: cfg.adapter || null, histo: false, overflow: document.documentElement.style.overflow, retour: document.activeElement };
    document.documentElement.style.overflow = 'hidden';
    try { history.pushState({ mg: 1 }, ''); V.histo = true; } catch (e) { /* pas d'historique */ }
    document.addEventListener('keydown', touches, true); window.addEventListener('popstate', pop);
    ov.addEventListener('click', function (e) {
      if (e.target.closest('.mg-x')) return fermer();
      if (e.target.closest('.mg-prev')) return aller(-1);
      if (e.target.closest('.mg-next')) return aller(1);
      var th = e.target.closest('[data-k]'); if (th) return montrer(Number(th.dataset.k));
      var rk = e.target.closest('[data-mg-rk]'); if (rk) return reagir(rk.dataset.mgRk);
      if (e.target.closest('[data-mg-com]')) { var a = V && V.a; fermer(); if (a && a.commentaires) setTimeout(a.commentaires, 140); return; }
      if (e.target.closest('[data-mg-share]')) { if (V && V.a && V.a.partager) V.a.partager(); return; }
      if (e.target === ov || e.target.classList.contains('mg-stage')) fermer();
    });
    var st = ov.querySelector('.mg-stage'), x0 = 0, y0 = 0, actif = false;
    st.addEventListener('touchstart', function (e) { if (e.touches.length !== 1) { actif = false; return; } actif = true; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    st.addEventListener('touchend', function (e) { if (!actif) return; actif = false; var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) aller(dx < 0 ? 1 : -1); }, { passive: true });
    montrer(V.i); ov.focus({ preventScroll: true }); barre();
  }
  function montrer(k) {
    var v = V; if (!v) return;
    var ancien = v.el.querySelector('.mg-media'); if (ancien && ancien.pause) { try { ancien.pause(); } catch (e) { /* rien */ } }
    v.i = (k + v.items.length) % v.items.length;
    var it = v.items[v.i], slot = v.el.querySelector('.mg-slot'), n = v.i + 1;
    slot.innerHTML = it.kind === 'video'
      ? '<video class="mg-media" controls playsinline preload="metadata" src="' + esc(it.url) + '"' + (it.poster ? ' poster="' + esc(it.poster) + '"' : '') + '></video>'
      : '<img class="mg-media" src="' + esc(it.url) + '" alt="' + (it.kind === 'video' ? 'Vidéo ' : 'Photo ') + n + ' sur ' + v.items.length + '">';
    v.el.querySelector('.mg-n').textContent = n + ' / ' + v.items.length;
    [].forEach.call(v.el.querySelectorAll('.mg-th'), function (b, j) { var on = j === v.i; b.classList.toggle('on', on); if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'center' }); });
    [v.i + 1, v.i - 1].forEach(function (j) { var u = v.items[(j + v.items.length) % v.items.length]; if (u && u.kind === 'photo') { var p = new Image(); p.src = u.url; } });
    var multi = v.items.length > 1;
    [].forEach.call(v.el.querySelectorAll('.mg-fl, .mg-strip'), function (e) { e.style.visibility = multi ? '' : 'hidden'; });
  }
  function aller(d) { if (V) montrer(V.i + d); }
  function barre() {
    var v = V; if (!v) return;
    var box = v.el.querySelector('.mg-bar');
    if (!v.a || !v.a.lire) { box.style.display = 'none'; return; }
    v.a.lire().then(function (s) {
      if (V !== v || !s) return;
      var nb = Number(s.nbCom) || 0, mine = s.mine || {}, reacts = s.reacts || {};
      box.innerHTML = (s.types || []).map(function (t) { return '<button type="button" class="mg-r' + (mine[t[0]] ? ' on' : '') + '" data-mg-rk="' + esc(t[0]) + '" aria-pressed="' + (mine[t[0]] ? 'true' : 'false') + '">' + t[1] + ' <b>' + (reacts[t[0]] || 0) + '</b></button>'; }).join('')
        + (v.a.commentaires ? '<button type="button" class="mg-r" data-mg-com>💬 <b>' + nb + '</b><span class="mg-lib"> commentaire' + (nb > 1 ? 's' : '') + '</span></button>' : '')
        + (v.a.partager ? '<button type="button" class="mg-r" data-mg-share>📤<span class="mg-lib"> Partager</span></button>' : '')
        + ((v.a.connecte && !v.a.connecte()) ? '<span class="mg-hint"><a href="login.html">Connectez-vous</a> pour réagir</span>' : '');
    }).catch(function () { box.style.display = 'none'; });
  }
  function reagir(type) {
    var v = V; if (!v || !v.a || !v.a.reagir) return;
    Promise.resolve(v.a.reagir(type)).then(function (ok) { if (ok && V === v) { barre(); if (v.a.apres) v.a.apres(); } });
  }
  function touches(e) {
    if (!V || (e.target.closest && e.target.closest('input, textarea'))) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); aller(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); aller(-1); }
  }
  function fermer() {
    var v = V; if (!v) return;
    if (v.histo) { try { history.back(); return; } catch (e) { /* repli */ } }
    nettoyer();
  }
  function nettoyer() {
    var v = V; if (!v) return; V = null;
    document.removeEventListener('keydown', touches, true); window.removeEventListener('popstate', pop);
    var m = v.el.querySelector('.mg-media'); if (m && m.pause) { try { m.pause(); } catch (e) { /* rien */ } }
    v.el.remove(); document.documentElement.style.overflow = v.overflow || '';
    if (v.retour && v.retour.isConnected && v.retour.focus) { try { v.retour.focus({ preventScroll: true }); } catch (e) { /* rien */ } }
  }
  function pop() { if (V) { V.histo = false; nettoyer(); } }

  root.MediaGalerie = { open: open, bandeau: bandeau, itemsDePost: itemsDePost, libelle: libelle, styles: styles, estOuverte: function () { return !!V; } };
})(window);

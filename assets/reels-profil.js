/* ============================================================
   Diaspo'Actif — Les Reels d'un compte, sur son profil public (2026-10-14, demande explicite)
   « Un Reel partagé s'affiche partout : dans l'univers des Reels, mais aussi sur le profil public du compte qui l'a publié. »
   Et, sur son propre profil, un bouton pour en créer un.

   Utilisation (site et téléphone) :
     ReelsProfil.monter(element, { auteurId, estMoi, viewerOpts })
       auteurId   — identifiant du COMPTE qui a publié (users.id ; pour une initiative : son owner_user_id)
       estMoi     — vrai sur son propre profil : affiche « Créer un Reel » (et une invitation s'il n'en a pas encore)
       viewerOpts — options passées au visionneur (téléphone : onOpenPost, onOpenProfile, onLogin)
     Sur le profil d'un autre compte sans Reel, la section se masque d'elle-même (aucun bloc vide).
   Données : GET /api/fil/medias?type=video&auteur_id=… (publications publiques ; les comptes de démonstration en sont exclus).
   Un clic sur une vignette ouvre le visionneur en mode Reels, sur cette vidéo, limité aux Reels de ce compte.
   ============================================================ */
(function () {
  'use strict';
  if (window.ReelsProfil) return;
  var VERSION = '20261014a';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); };
  var urlOk = function (u) { return typeof u === 'string' && /^(https?:\/\/|\/[^\/])/i.test(u); };
  var CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="13.5" height="12" rx="3.2" fill="currentColor"/><path d="M17.2 10.4l4.2-2.5a.7.7 0 0 1 1.05.6v7a.7.7 0 0 1-1.05.6l-4.2-2.5z" fill="currentColor"/></svg>';

  function css() {
    if (document.getElementById('rp-css')) return;
    var s = document.createElement('style'); s.id = 'rp-css';
    s.textContent = [
      '.rp-barre{display:flex;margin:0 0 12px}',
      '.rp-creer{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:46px;padding:0 20px;border-radius:999px;border:0;font:inherit;font-size:14.5px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#F3DC9A,#B9893A);color:#1a1202;box-shadow:0 10px 22px -12px rgba(185,137,58,.9)}',
      '.rp-creer svg{width:20px;height:20px}',
      '.rp-creer:focus-visible,.rp-t:focus-visible{outline:3px solid #E3C06E;outline-offset:2px}',
      '.rp-grille{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}',
      '.rp-t{position:relative;display:block;width:100%;aspect-ratio:9/16;padding:0;border-radius:14px;overflow:hidden;cursor:pointer;background:#0B1226;border:1px solid rgba(227,192,110,.35);color:#fff;font:inherit;text-align:left;transition:transform .3s,border-color .3s}',
      '.rp-t:hover{transform:translateY(-3px);border-color:#E3C06E}',
      '.rp-t img,.rp-t video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}',
      '.rp-t:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(6,10,20,.85));pointer-events:none}',
      '.rp-play{position:absolute;left:8px;top:8px;z-index:1;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(8,13,30,.72);border:1px solid rgba(227,192,110,.5);color:#E3C06E;font-size:12px;padding-left:2px}',
      '.rp-st{position:absolute;left:8px;right:8px;bottom:7px;z-index:1;font-size:12px;font-weight:700;display:flex;gap:10px;color:#fff}',
      '.rp-vide{padding:16px;border-radius:18px;background:linear-gradient(145deg,#14234a,#0B1226);border:1px solid rgba(227,192,110,.4);color:#C7D4E8;font-size:14px;line-height:1.5;text-align:center}',
      '.rp-vide b{display:block;font-size:16px;color:#fff;margin-bottom:4px}',
      '@media (prefers-reduced-motion:reduce){.rp-t{transition:none}.rp-t:hover{transform:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  /* Charge le visionneur (feuille + script) à la première utilisation, comme assets/reels.js. */
  var chargement = null;
  function visionneur() {
    if (window.MediaViewer && window.MediaViewer.openReels) return Promise.resolve();
    if (chargement) return chargement;
    chargement = new Promise(function (resolve) {
      if (!document.querySelector('link[href*="media-viewer.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/media-viewer.css?v=' + VERSION; document.head.appendChild(l); }
      var s = document.createElement('script'); s.src = '/assets/media-viewer.js?v=' + VERSION; s.onload = resolve; s.onerror = resolve; document.head.appendChild(s);
    });
    return chargement;
  }
  function createur() {
    if (window.ReelsCreer) return Promise.resolve();
    return new Promise(function (resolve) { var s = document.createElement('script'); s.src = '/assets/reels-creer.js?v=' + VERSION; s.onload = resolve; s.onerror = resolve; document.head.appendChild(s); });
  }

  function monter(el, o) {
    if (!el) return Promise.resolve(false);
    o = o || {}; css();
    var id = Number(o.auteurId); if (!id) return Promise.resolve(false);
    var section = el.closest('[data-reels-section], .pf-sec, .pvz-card, .init-section, .pc-card, .wb-card');
    function ouvrirVisionneur(postId) {
      var vo = {}; for (var k in (o.viewerOpts || {})) vo[k] = o.viewerOpts[k];
      vo.auteurId = id; if (postId) vo.postId = postId;
      return visionneur().then(function () { if (window.MediaViewer && MediaViewer.openReels) MediaViewer.openReels(vo); });
    }
    function creer() {
      createur().then(function () {
        if (!window.ReelsCreer) return;
        ReelsCreer.ouvrir({
          onLogin: o.viewerOpts && o.viewerOpts.onLogin,
          onPublie: function (r) { monter(el, o).then(function () { if (r && r.post_id && !r.silencieux) ouvrirVisionneur(r.post_id); }); }
        });
      });
    }
    return fetch('/api/fil/medias?type=video&limit=12&auteur_id=' + id, { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { items: [] }; }).catch(function () { return { items: [] }; })
      .then(function (r) {
        var items = (r && r.items) || [];
        if (!items.length && !o.estMoi) { el.innerHTML = ''; if (section) { section.hidden = true; section.style.display = 'none'; } return false; }
        if (section) { section.hidden = false; section.style.display = ''; }
        var html = o.estMoi ? '<div class="rp-barre"><button type="button" class="rp-creer" data-rp="creer">' + CAM + ' Créer un Reel</button></div>' : '';
        if (!items.length) html += '<div class="rp-vide"><b>Vous n’avez pas encore de Reel</b>Partagez une petite vidéo : elle apparaîtra ici, sur votre profil public, et dans les Reels de toute la communauté.</div>';
        else html += '<div class="rp-grille">' + items.map(function (it) {
          var m = (it.medias && it.medias[0]) || {}, t = it.titre || it.extrait || 'Reel';
          var vignette = urlOk(m.poster) ? '<img src="' + esc(m.poster) + '" alt="" loading="lazy">' : (urlOk(m.url) ? '<video src="' + esc(m.url) + '#t=0.5" muted playsinline preload="metadata"></video>' : '');
          return '<button type="button" class="rp-t" data-post="' + Number(it.post_id) + '" aria-label="Voir le Reel : ' + esc(t.slice(0, 80)) + '">' + vignette
            + '<span class="rp-play" aria-hidden="true">▶</span><span class="rp-st"><span>❤ ' + (Number(it.nb_reactions) || Number(it.nb_likes) || 0) + '</span><span>💬 ' + (Number(it.nb_commentaires) || 0) + '</span></span></button>';
        }).join('') + '</div>';
        el.innerHTML = html;
        var c = el.querySelector('[data-rp="creer"]'); if (c) c.onclick = creer;
        el.querySelectorAll('[data-post]').forEach(function (b) { b.onclick = function () { ouvrirVisionneur(Number(b.dataset.post)); }; });
        return true;
      });
  }

  window.ReelsProfil = { monter: monter };
})();

/* ============================================================
   Diaspo'Actif — Bouton « Reels » du site (2026-10-13, demande explicite)
   « Un logo à gauche des publications, qui sert à basculer dans l'univers des Reels : des publications vidéo courtes. »
   Posé en haut de la colonne de gauche du fil d'actualité. Toujours visible (2026-10-14) : s'il n'existe pas encore de vidéo publique, le visionneur l'annonce (« Aucun Reel pour le moment »).
   Un clic charge à la demande le visionneur plein écran (assets/media-viewer.js) et l'ouvre en mode Reels : on y balaie / fait défiler de
   vidéo en vidéo, avec toutes les actions (j'aime, commentaires, enregistrer, partager, s'abonner, voir la publication).
   Sur téléphone, le même bouton est dans assets/m.js (bandeau des filtres du fil).
   ============================================================ */
(function () {
  'use strict';
  var VERSION = '20261014a';
  function css() {
    if (document.getElementById('reels-css')) return;
    var s = document.createElement('style'); s.id = 'reels-css';
    s.textContent = '.fil-reels-btn{display:flex;align-items:center;gap:14px;width:100%;margin:0 0 14px;padding:14px 16px;border:1px solid rgba(227,192,110,.55);border-radius:16px;cursor:pointer;text-align:left;color:#fff;font-family:inherit;'
      + 'background:radial-gradient(ellipse 220px 120px at 100% 0%,rgba(227,192,110,.28),transparent 70%),linear-gradient(135deg,#14234a,#0B1226);box-shadow:0 14px 30px -18px rgba(11,18,38,.9);transition:transform .25s,box-shadow .25s}'
      + '.fil-reels-btn:hover{transform:translateY(-2px);box-shadow:0 20px 36px -18px rgba(11,18,38,.95)}'
      + '.fil-reels-btn:focus-visible{outline:3px solid #E3C06E;outline-offset:2px}'
      + '.fil-reels-btn[hidden]{display:none}'
      + '.fil-reels-ic{flex:none;width:46px;height:46px;border-radius:14px;background:rgba(255,255,255,.07);border:1px solid rgba(227,192,110,.35);display:flex;align-items:center;justify-content:center}'
      + '.fil-reels-ic svg{width:28px;height:28px}'
      + '.fil-reels-tx{display:flex;flex-direction:column;gap:2px;min-width:0}'
      + '.fil-reels-tx b{font-size:17px;font-weight:800;letter-spacing:.03em;color:#E3C06E}'
      + '.fil-reels-tx small{font-size:12px;color:#C7D4E8;line-height:1.35}'
      + '@media (max-width:1100px){.fil-reels-btn{padding:12px 14px}}'
      /* Version « segment » (2026-10-18, demande explicite : « dans la même cartouche que Grille et Liste ») : un bouton de plus dans la capsule, qui reprend son style. */
      + '.fg-bascule .fg-reels-seg{display:inline-flex;align-items:center;gap:7px}'
      + '.fg-reels-seg svg{width:18px;height:18px;flex:none}'
      + '.fg-reels-seg b{font-weight:800;letter-spacing:.02em}'
      + '.fg-bascule .fg-reels-seg:focus-visible{outline:3px solid #E3C06E;outline-offset:-2px}';
    document.head.appendChild(s);
  }
  var CAM_SECOURS = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="13.5" height="12" rx="3.2" fill="#E3C06E"/><path d="M17.2 10.4l4.2-2.5a.7.7 0 0 1 1.05.6v7a.7.7 0 0 1-1.05.6l-4.2-2.5z" fill="#E3C06E"/><circle cx="8.7" cy="12" r="2.6" fill="#0B1226" opacity=".85"/></svg>';

  /* Charge une seule fois le visionneur (feuille + script), puis l'ouvre en mode Reels. */
  var chargement = null;
  function charger() {
    if (window.MediaViewer && window.MediaViewer.openReels) return Promise.resolve();
    if (chargement) return chargement;
    chargement = new Promise(function (resolve) {
      if (!document.querySelector('link[href*="media-viewer.css"]')) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/media-viewer.css?v=' + VERSION; document.head.appendChild(l); }
      var s = document.createElement('script'); s.src = '/assets/media-viewer.js?v=' + VERSION; s.onload = resolve; s.onerror = resolve; document.head.appendChild(s);
    });
    return chargement;
  }
  function ouvrir() { return charger().then(function () { if (window.MediaViewer && window.MediaViewer.openReels) window.MediaViewer.openReels({}); }); }

  /* Le bouton se place en tête de la capsule « Grille / Liste » du fil ; sans cette capsule (autre page), il retrouve sa grande carte en haut de la colonne de gauche.
     Il n'a pas de data-vue : la page ne le prend donc jamais pour un mode d'affichage. */
  function monter() {
    if (document.getElementById('fil-reels-btn')) return;
    var capsule = document.querySelector('#fg-barre .fg-bascule');
    var col = capsule ? null : document.querySelector('.fil-col-left');
    if (!capsule && !col) return;
    css();
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'fil-reels-btn'; b.setAttribute('aria-label', 'Ouvrir les Reels, les petites vidéos de la plateforme');
    if (capsule) {
      b.className = 'fg-reels-seg'; b.title = 'Regarder et créer de petites vidéos';
      b.innerHTML = CAM_SECOURS + '<b>Reels</b>';
      b.onclick = ouvrir;
      capsule.insertBefore(b, capsule.firstChild);
      return;
    }
    b.className = 'fil-reels-btn';
    b.innerHTML = '<span class="fil-reels-ic">' + CAM_SECOURS + '</span><span class="fil-reels-tx"><b>Reels</b><small>Regarder et créer de petites vidéos</small></span>';
    b.onclick = ouvrir;
    col.insertBefore(b, col.firstChild);
  }
  window.Reels = { ouvrir: ouvrir };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter); else monter();
})();

/* ===========================================================
   assets/boutique-barre-proprio.js — Barre du propriétaire sur les pages boutique (2026-11-14)
   Le propriétaire voit désormais la NOUVELLE page de sa boutique (comme ses visiteurs). Une fine barre fixe en bas de page lui donne :
   - « Paramètres de la boutique » (l'assistant de création),
   - « Ancienne vue d'édition » (profil.html?…&vitrine=1&edition=1 : produits, vidéos… comme avant),
   - « Modifier mon profil ».
   La barre n'apparaît QUE pour le propriétaire connecté, jamais pour un visiteur, jamais dans l'aperçu de l'assistant (cadre ou ?preview=draft).
   Pages : boutique.html, portfolio.html, boutique-video.html, boutique-evenements.html, boutique-impact.html, boutique-finance.html.
   =========================================================== */
(function () {
  'use strict';
  if (window.BoutiqueBarreProprio) return;
  var q = new URLSearchParams(location.search);
  var id = q.get('id') || q.get('initiative');
  if (!id || window.top !== window.self || q.get('preview')) return;

  function api(chemin) {
    return fetch('/api' + chemin, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function poser(proprietaire) {
    var compte = encodeURIComponent(proprietaire);
    var style = document.createElement('style');
    style.textContent =
      '#bq-barre-proprio{position:fixed;left:0;right:0;bottom:0;z-index:900;display:flex;flex-wrap:wrap;align-items:center;gap:8px 14px;padding:8px 16px;background:#0B1226;color:#fff;font:600 13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 -6px 22px -10px rgba(0,0,0,.55);border-top:1px solid rgba(227,192,110,.45)}' +
      '#bq-barre-proprio span{flex:1 1 260px;min-width:0;opacity:.92}' +
      '#bq-barre-proprio a{display:inline-flex;align-items:center;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(227,192,110,.55);color:#fff;text-decoration:none;font-weight:700;background:rgba(255,255,255,.08)}' +
      '#bq-barre-proprio a.or{background:#E3C06E;color:#1B1304;border-color:#E3C06E}' +
      '#bq-barre-proprio a:hover{background:rgba(227,192,110,.28)}#bq-barre-proprio a.or:hover{background:#F0D08A}' +
      '#bq-barre-proprio a:focus-visible{outline:2px solid #E3C06E;outline-offset:2px}' +
      '@media (pointer:coarse),(max-width:720px){#bq-barre-proprio a{min-height:44px}}' +
      '@media print{#bq-barre-proprio{display:none}}';
    document.head.appendChild(style);
    var b = document.createElement('div');
    b.id = 'bq-barre-proprio'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Outils du propriétaire de la boutique');
    b.innerHTML = '<span>Vous voyez votre boutique comme vos visiteurs.</span>' +
      '<a class="or" href="dashboard-initiative.html#parametres-vitrine">Paramètres de la boutique</a>' +
      '<a href="profil.html?id=' + compte + '&vitrine=1&edition=1">Ancienne vue d’édition</a>' +
      '<a href="profil.html?id=' + compte + '&edition=1">Mon profil</a>';
    document.body.appendChild(b);
    /* la barre ne doit pas cacher le bas de la page */
    document.body.style.paddingBottom = (parseInt(getComputedStyle(document.body).paddingBottom, 10) || 0) + b.offsetHeight + 'px';
  }

  function demarrer() {
    Promise.all([api('/auth/me'), api('/initiatives/' + encodeURIComponent(id))]).then(function (r) {
      var moi = r[0] && r[0].user, ini = r[1] && r[1].initiative;
      if (moi && ini && ini.owner_user_id && Number(moi.id) === Number(ini.owner_user_id)) poser(ini.owner_user_id);
    });
  }
  window.BoutiqueBarreProprio = { esc: esc };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();

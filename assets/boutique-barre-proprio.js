/* ===========================================================
   assets/boutique-barre-proprio.js — Barre du propriétaire sur les pages boutique (2026-11-14)
   Le propriétaire voit désormais la NOUVELLE page de sa boutique (comme ses visiteurs). Une fine barre fixe en bas de page lui donne :
   - « Paramètres de la boutique » (l'assistant de création),
   - « Mes produits » (boutique de vente, depuis le 2026-11-21) : dashboard-initiative.html#parametres-vitrine&produits, la rubrique « Mes produits » des Paramètres de la boutique ;
     « Mes vidéos » / « Mes contenus » (autres types, en attendant leur propre rubrique) : profil.html?…&vitrine=1&edition=1 ; ne JAMAIS appeler cette vue « ancienne vue » — le propriétaire ne veut pas de retour en arrière,
   - « Mon profil ».
   Téléphone (≤ 640 px) : une ligne de texte puis trois boutons de même largeur sur une rangée.
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
    /* Téléphone : une ligne de texte, puis TROIS boutons de même largeur sur une seule rangée (jamais empilés sur trois lignes). */
    style.textContent =
      '#bq-barre-proprio{position:fixed;left:0;right:0;bottom:0;z-index:900;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 16px calc(8px + env(safe-area-inset-bottom,0px));background:#0B1226;color:#fff;font:600 13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 -6px 22px -10px rgba(0,0,0,.55);border-top:1px solid rgba(227,192,110,.45)}' +
      '#bq-barre-proprio span.bq-bp-texte{flex:1 1 260px;min-width:0;opacity:.92}' +
      '#bq-barre-proprio .bq-bp-liens{display:flex;flex-wrap:wrap;gap:8px 10px}' +
      '#bq-barre-proprio a{display:inline-flex;align-items:center;justify-content:center;text-align:center;min-height:36px;padding:0 14px;border-radius:999px;border:1px solid rgba(227,192,110,.55);color:#fff;text-decoration:none;font-weight:700;background:rgba(255,255,255,.08)}' +
      '#bq-barre-proprio a.or{background:#E3C06E;color:#1B1304;border-color:#E3C06E}' +
      '#bq-barre-proprio a:hover{background:rgba(227,192,110,.28)}#bq-barre-proprio a.or:hover{background:#F0D08A}' +
      '#bq-barre-proprio a:focus-visible{outline:2px solid #E3C06E;outline-offset:2px}' +
      '#bq-barre-proprio .bq-bp-court{display:none}' +
      '@media (pointer:coarse),(max-width:720px){#bq-barre-proprio a{min-height:44px}}' +
      '@media (max-width:640px){' +
        '#bq-barre-proprio{display:block;padding:7px 12px calc(8px + env(safe-area-inset-bottom,0px))}' +
        '#bq-barre-proprio span.bq-bp-texte{display:block;margin:0 0 7px;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '#bq-barre-proprio .bq-bp-liens{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}' +
        '#bq-barre-proprio a{padding:0 6px;font-size:13px;line-height:1.15;border-radius:12px}' +
        '#bq-barre-proprio .bq-bp-long{display:none}#bq-barre-proprio .bq-bp-court{display:inline}' +
      '}' +
      '@media print{#bq-barre-proprio{display:none}}';
    document.head.appendChild(style);
    var b = document.createElement('div');
    b.id = 'bq-barre-proprio'; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Outils du propriétaire de la boutique');
    /* Le lien du milieu mène à la gestion du contenu (produits, vidéos…), qui n'existe aujourd'hui que dans la page de profil : on le nomme par ce qu'il fait, pas par « ancienne vue ». */
    var page = location.pathname.split('/').pop();
    var contenu = page === 'boutique.html' ? 'Mes produits' : page === 'boutique-video.html' ? 'Mes vidéos' : 'Mes contenus';
    /* Boutique de vente : « Mes produits » ouvre la rubrique des Paramètres (plus l'ancienne vue d'édition du profil). Les autres types gardent leur lien actuel. */
    var lienContenu = page === 'boutique.html' ? 'dashboard-initiative.html#parametres-vitrine&produits' : 'profil.html?id=' + compte + '&vitrine=1&edition=1';
    b.innerHTML = '<span class="bq-bp-texte">Vous voyez votre boutique comme vos visiteurs.</span>' +
      '<div class="bq-bp-liens">' +
      '<a class="or" href="dashboard-initiative.html#parametres-vitrine"><span class="bq-bp-long">Paramètres de la boutique</span><span class="bq-bp-court">Paramètres</span></a>' +
      '<a href="' + lienContenu + '">' + contenu + '</a>' +
      '<a href="profil.html?id=' + compte + '&edition=1">Mon profil</a>' +
      '</div>';
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

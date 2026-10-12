/* Panneau « Paramètres Boutique » à gauche de la Boutique (2026-10-12, demande explicite) :
   « un raccourci qui ouvre un onglet sur la gauche et réduit la visibilité de la boutique, pour gérer les paramètres ET voir la boutique en même temps,
   avec un bouton plein écran. » Le terme à garder est « Boutique » (jamais « vitrine » dans l'interface).

   Le panneau n'est PAS une réécriture : il affiche, dans un cadre, la section « ⭐ Paramètres Boutique » déjà existante du tableau de bord de l'initiative
   (dashboard-initiative.html#parametres-vitrine), dont on masque l'en-tête et la barre latérale depuis ici (même origine) — aucune modification de ce fichier.
   Quand un réglage est enregistré dans le cadre, la Boutique se redessine toute seule. Au retour sur la page, le panneau est toujours fermé. */
(function () {
  'use strict';
  var ID = 'bq-param', LARGEUR = 0.45, SEUIL_MOBILE = 900, ZOOM_MIN = 0.45, LARGEUR_REF = 1180;
  var etat = { ouvert: false, plein: false, charge: false, minuteur: null, raf: 0 };

  function injecterStyle() {
    if (document.getElementById('bq-param-css')) return;
    var s = document.createElement('style'); s.id = 'bq-param-css';
    s.textContent =
      '#' + ID + '{position:fixed;left:0;bottom:0;top:var(--bq-top,84px);width:var(--bq-w,45vw);z-index:850;display:none;flex-direction:column;background:#fff;box-shadow:8px 0 30px -12px rgba(0,0,0,.55);border-right:2px solid #E3C06E}' +
      '#' + ID + '.on{display:flex}' +
      '#' + ID + '.plein{width:auto;right:0;border-right:0}' +
      '#' + ID + ' .bq-tete{display:flex;align-items:center;gap:8px;padding:10px 14px;background:#0B1226;color:#fff;font-weight:700;font-size:14px;line-height:1.2;font-family:inherit;flex:none}' +
      '#' + ID + ' .bq-tete b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
      '#' + ID + ' .bq-tete button{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(227,192,110,.5);border-radius:999px;padding:7px 13px;font-weight:700;font-size:13px;line-height:1;font-family:inherit;cursor:pointer;white-space:nowrap}' +
      '#' + ID + ' .bq-tete button:hover{background:rgba(227,192,110,.25)}' +
      '#' + ID + ' .bq-tete button:focus-visible{outline:2px solid #E3C06E;outline-offset:2px}' +
      '#' + ID + ' iframe{flex:1;width:100%;border:0;background:#fff;min-height:0}' +
      '#' + ID + ' .bq-info{display:none;flex:1;padding:28px 22px;color:#0D2B4E;font-size:14px;line-height:1.55;background:#fff}' +
      '#' + ID + ' .bq-info a{color:#0D47A1;font-weight:700}' +
      /* La Boutique se réduit : elle se range à droite du panneau et son contenu est rétréci (zoom) pour rester lisible en entier. */
      'body.bq-ouvert main.container{margin-left:var(--bq-w,45vw)!important;max-width:none!important;width:auto!important}' +
      'body.bq-ouvert main.container>*{zoom:var(--bq-zoom,.7)}' +
      'body.bq-ouvert.bq-plein main.container{display:none!important}' +
      'body.bq-plein{overflow:hidden}' +
      '@media print{#' + ID + '{display:none!important}}';
    document.head.appendChild(s);
  }

  function hautPanneau() {
    var t = document.querySelector('.topbar'); var h = t ? Math.round(t.getBoundingClientRect().bottom) : 84;
    return Math.max(0, h);
  }
  function mesurer() {
    var p = document.getElementById(ID); if (!p) return;
    var iw = window.innerWidth, mobile = iw < SEUIL_MOBILE;
    var pleinEff = etat.plein || mobile;
    var largeur = pleinEff ? iw : Math.max(380, Math.round(iw * LARGEUR));
    var zoom = Math.max(ZOOM_MIN, Math.min(1, (iw - largeur) / LARGEUR_REF));
    var r = document.documentElement.style;
    r.setProperty('--bq-w', largeur + 'px'); r.setProperty('--bq-zoom', zoom.toFixed(3)); r.setProperty('--bq-top', hautPanneau() + 'px');
    p.classList.toggle('plein', pleinEff); document.body.classList.toggle('bq-plein', pleinEff && etat.ouvert);
    var b = document.getElementById('bq-plein-btn');
    if (b) {
      b.textContent = pleinEff ? '⧉ Réduire' : '⛶ Plein écran';
      b.setAttribute('aria-label', pleinEff ? 'Réduire le panneau et revoir la Boutique' : 'Afficher les paramètres en plein écran');
      b.style.display = mobile ? 'none' : '';        /* sur petit écran : toujours plein écran, rien à basculer */
    }
  }
  function planifierMesure() { if (etat.raf) return; etat.raf = setTimeout(function () { etat.raf = 0; if (etat.ouvert) mesurer(); }, 30); }

  /* Le cadre : masque l'en-tête, la barre latérale et les widgets du tableau de bord ; surveille les enregistrements pour redessiner la Boutique. */
  function preparerCadre(f) {
    var win, doc;
    try { win = f.contentWindow; doc = f.contentDocument; } catch (e) { return; }
    var chemin = (win.location.pathname || '');
    var info = document.querySelector('#' + ID + ' .bq-info');
    if (!/dashboard-initiative/.test(chemin)) {            /* redirigé ailleurs (connexion, profil à compléter…) : on n'affiche pas une page dans la page */
      f.style.display = 'none'; info.style.display = 'block';
      info.innerHTML = '<b>Les Paramètres Boutique ne peuvent pas s\'afficher ici pour le moment.</b><br>Ouvrez-les depuis le <a href="dashboard-initiative.html#parametres-vitrine">tableau de bord</a>.';
      return;
    }
    f.style.display = ''; info.style.display = 'none';
    if (!doc.getElementById('bq-cadre-css')) {
      var s = doc.createElement('style'); s.id = 'bq-cadre-css';
      s.textContent = '.topbar,#da-back-bar,#da-cookie-banner,.sidebar,.sidebar-backdrop,.mobile-bottom-nav,.cb-fab,#cb-panel,#oz-panel,.footer,#po-bandeau,#origine-banner,#page-transition-overlay,#nd-ruban{display:none!important}' +
        '.page{display:block!important;min-height:0!important}main.content,.content{margin:0!important;padding:14px 16px!important;max-width:none!important;width:auto!important}body{padding-top:0!important}';
      doc.head.appendChild(s);
    }
    if (!win.__bqFetch) {
      win.__bqFetch = true;
      var f0 = win.fetch.bind(win);
      win.fetch = function (entree, init) {
        var methode = String((init && init.method) || (entree && entree.method) || 'GET').toUpperCase();
        var url = String((entree && entree.url) || entree || '');
        return f0(entree, init).then(function (r) {
          if (methode !== 'GET' && r && r.ok && /vitrine|boutique|initiative|catalogue|produit|collection|promo|theme|article/i.test(url)) rafraichirBoutique();
          return r;
        });
      };
    }
  }

  function rafraichirBoutique() {
    clearTimeout(etat.minuteur);
    etat.minuteur = setTimeout(function () {
      var v = document.getElementById('p-vitrine');
      if (v && v.style.display !== 'none' && typeof window.renderVitrine === 'function') window.renderVitrine();
    }, 900);
  }

  function creer() {
    if (document.getElementById(ID)) return document.getElementById(ID);
    injecterStyle();
    var p = document.createElement('aside'); p.id = ID; p.setAttribute('aria-label', 'Paramètres Boutique');
    p.innerHTML = '<div class="bq-tete"><b>⚙️ Paramètres Boutique</b>' +
      '<button type="button" id="bq-plein-btn">⛶ Plein écran</button>' +
      '<button type="button" id="bq-fermer-btn" aria-label="Fermer les paramètres de la Boutique">✕ Fermer</button></div>' +
      '<iframe title="Paramètres Boutique"></iframe><div class="bq-info" role="status"></div>';
    document.body.appendChild(p);
    p.querySelector('#bq-plein-btn').addEventListener('click', function () { etat.plein = !etat.plein; mesurer(); });
    p.querySelector('#bq-fermer-btn').addEventListener('click', fermer);
    p.querySelector('iframe').addEventListener('load', function () { preparerCadre(this); });
    return p;
  }

  function ouvrir() {
    if (window.__poActif) return;                            /* profil à compléter en priorité : le tableau de bord renverrait vers la fiche */
    var p = creer();
    etat.ouvert = true; etat.plein = false;
    p.classList.add('on'); document.body.classList.add('bq-ouvert');
    if (!etat.charge) { etat.charge = true; p.querySelector('iframe').src = 'dashboard-initiative.html#parametres-vitrine'; }
    mesurer();
    /* La Boutique réduite est remontée sous la barre du haut : on la voit tout de suite à droite du panneau. */
    var v = document.getElementById('p-vitrine');
    if (v) setTimeout(function () { window.scrollTo({ top: Math.max(0, v.getBoundingClientRect().top + window.pageYOffset - hautPanneau() - 8), behavior: 'instant' }); mesurer(); }, 60);
    var b = document.getElementById('pvt-param-btn'); if (b) b.setAttribute('aria-expanded', 'true');
    var c = document.getElementById('bq-fermer-btn'); if (c) c.focus();
  }
  function fermer() {
    var p = document.getElementById(ID); if (!p) return;
    etat.ouvert = false; etat.plein = false;
    p.classList.remove('on'); document.body.classList.remove('bq-ouvert', 'bq-plein');
    var b = document.getElementById('pvt-param-btn'); if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); }
  }

  window.ouvrirParametresBoutique = function () { if (etat.ouvert) fermer(); else ouvrir(); };
  window.addEventListener('resize', planifierMesure);
  window.addEventListener('scroll', planifierMesure, { passive: true });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !etat.ouvert) return;
    if (document.querySelector('.cda-modal-bg')) return;     /* une fenêtre de saisie est ouverte : Échap est pour elle */
    if (etat.plein) { etat.plein = false; mesurer(); } else fermer();
  });
})();

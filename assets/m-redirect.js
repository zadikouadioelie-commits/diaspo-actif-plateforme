/* ============================================================
   Diaspo'Actif — Bascule des visiteurs sur téléphone vers la nouvelle appli (m.html)
   ÉTAT : ACTIVÉ le 2026-10-07 (demande du propriétaire) par une ligne dans <head> des pages listées dans PAGES :
       <script src="/assets/m-redirect.js"></script>
   Règles :
   - uniquement les téléphones (pas les tablettes ni les ordinateurs) ;
   - uniquement les pages déjà refaites pour le téléphone (table ci-dessous) ; toutes les autres pages restent ouvertes
     telles quelles, avec leurs couleurs d'origine ;
   - « ?version=ordinateur » (lien « Version ordinateur » de l'appli) désactive la bascule pour la session ;
   - retour arrière : retirer la ligne <script> des pages, rien d'autre.
   ============================================================ */
(function (root) {
  'use strict';
  /* Page du site (nom de fichier) -> écran de l'appli. */
  var PAGES = {
    '': '#/accueil', 'index.html': '#/accueil',
    'annuaire.html': '#/annuaire', 'evenements-app.html': '#/evenements', 'vitrines.html': '#/boutiques',
    'messagerie.html': '#/messages', 'mes-billets.html': '#/billets', 'formations.html': '#/formations',
    'parrainage.html': '#/parrainage', 'mon-abonnement.html': '#/abonnement', 'confidentialite.html': '#/confidentialite', 'centre-financier.html': '#/centrefinancier',
    'reseau.html': '#/reseaupro', 'business-plan.html': '#/businessplan', 'mon-associe.html': '#/associe',
    'videos-tutoriels.html': '#/videos', 'cagnottes.html': '#/cagnottes', 'agenda.html': '#/agenda',
    'fil-actualite.html': '#/accueil', 'fil-actualite-app.html': '#/accueil', 'evenements.html': '#/evenements'
  };
  /* Les tableaux de bord (dashboard-*.html) ne sont PAS redirigés : ils contiennent des outils qui n'existent pas encore dans l'appli. */
  /* Pages avec paramètre : initiative.html?id=X, profil.html?id=X, compte-rendu.html?evt=X, videos-tutoriels.html?v=X */
  function cible(pathname, search, hash) {
    var f = String(pathname || '').replace(/^\//, '').split('/').pop();
    /* Tableaux de bord Utilisateur / Initiative : ouverts « nus », ils renvoient dans l'appli (écran « Moi ») ; avec un ancre
       (#evenements, #cagnottes…) ils restent ouverts, car ce sont les outils qui n'ont pas encore d'écran dans l'appli. */
    /* Retour de l'onboarding Stripe Connect (?connect=retour|refresh) : on rouvre l'onglet « Comptes » du Centre Financier (2026-10-28). */
    if (f === 'dashboard-initiative.html' && /[?&]connect=(retour|refresh)\b/.test(String(search || ''))) return '#/centrefinancier/comptes';
    if ((f === 'dashboard-utilisateur.html' || f === 'dashboard-initiative.html') && !String(hash || '').replace(/^#/, '')) return '#/moi';
    var q = {}; String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    if (f === 'initiative.html' && q.id) return '#/profil/i/' + encodeURIComponent(q.id);
    /* Lien de boutique (profil.html?id=<compte>&vitrine=1) : la boutique, pas le profil public (signalé le 2026-10-13). */
    if ((f === 'profil.html' || f === 'profil-app.html') && q.id && q.vitrine === '1') return '#/boutique/u/' + encodeURIComponent(q.id);
    if ((f === 'profil.html' || f === 'profil-app.html') && q.id) return '#/profil/' + encodeURIComponent(q.id);
    if ((f === 'compte-rendu.html' || f === 'compte-rendu-app.html') && q.evt && !q.edition) return '#/cr/' + encodeURIComponent(q.evt) + (q.synthese === '1' ? '/synthese' : '');
    /* Liens de partage (2026-10-07) : un événement ou une publication partagés s'ouvrent directement dans l'appli, sans compte. */
    if ((f === 'evenements.html' || f === 'evenements-app.html') && q.evt) return '#/evenement/' + encodeURIComponent(q.evt);
    if ((f === 'fil-actualite.html' || f === 'fil-actualite-app.html') && q.post) return '#/post/' + encodeURIComponent(q.post);
    if (f === 'videos-tutoriels.html' && q.v) return '#/video/' + encodeURIComponent(q.v);
    if (f === 'compte-rendu.html' || f === 'compte-rendu-app.html' || f === 'profil.html' || f === 'profil-app.html' || f === 'initiative.html') return '';
    return Object.prototype.hasOwnProperty.call(PAGES, f) ? PAGES[f] : '';
  }
  function telephone(ua, largeurEcran, tactile) {
    ua = String(ua || '');
    var phone = /Android.*Mobile|iPhone|iPod|Windows Phone/i.test(ua) && !/iPad|Tablet/i.test(ua);
    return phone && largeurEcran <= 600 && tactile !== false;
  }
  /* Conservé pour les tests uniquement : la bascule ne s'en sert plus (voir plus bas). */
  function venantDeLApp(ref) { return /^https?:\/\/[^\/]+\/m\.html/i.test(String(ref || '')); }
  /* Pages sans équivalent dans l'appli : sur téléphone elles gardent leur fonctionnement propre mais prennent
     l'habillage de l'appli (assets/m-site.css + barre du haut). TOUTE page sans redirection directe (cible()
     vide) est concernée, plus de liste figée — décidé le 2026-10-08, demande explicite « plus aucune ancienne
     version visuelle sur téléphone, sans exception » (tableaux de bord, administration, site vitrine inclus). */
  var LIBELLES_HABILLAGE = { 'login.html': 'Connexion', 'inscription.html': 'Créer un compte', 'mot-de-passe-oublie.html': 'Mot de passe oublié' };
  function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function habiller(f) {
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/m-site.css?v=20261008a'; document.head.appendChild(l);
    document.documentElement.classList.add('m-site');
    var barre = function () {
      if (document.getElementById('m-site-top')) return;
      /* Libellé connu sinon le <title> de la page, débarrassé de "Diaspo'Actif" (déjà repris par le logo juste
         au-dessus) — présent indifféremment en préfixe ("Diaspo'Actif — X") ou en suffixe ("X — Diaspo'Actif"). */
      var titre = LIBELLES_HABILLAGE[f] || String(document.title || '')
        .replace(/^Diaspo['’]Actif\s*[—-]\s*/i, '').replace(/\s*[—-]\s*Diaspo['’]Actif\s*$/i, '').trim();
      var t = document.createElement('div'); t.id = 'm-site-top';
      t.innerHTML = '<a href="/m.html#/accueil" aria-label="Retour à l’accueil"><img src="/assets/logo.png" alt=""><span><small>Diaspo’Actif</small>' + escHtml(titre) + '</span></a>';
      document.body.insertBefore(t, document.body.firstChild);
    };
    if (document.body) barre(); else document.addEventListener('DOMContentLoaded', barre);
    /* Page à fond SOMBRE d'origine (hors Nuit dorée, qui a sa propre règle) : une fois la page chargée, on regarde son fond sans l'habillage (la classe est retirée
       puis remise dans la même tâche : rien ne se repeint entre-temps). Fond sombre → .m-sombre : le fond clair forcé n'est pas appliqué. */
    window.addEventListener('load', function () {
      try {
        var h = document.documentElement;
        if (!document.body || /(^|\s)nd(-cv)?(\s|$)/.test(document.body.className)) return;
        h.classList.remove('m-site');
        var lum = function (c) {
          var m = String(c).match(/[\d.]+/g); if (!m || m.length < 3 || (m.length > 3 && +m[3] === 0)) return null;
          var f = function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(+m[0]) + 0.7152 * f(+m[1]) + 0.0722 * f(+m[2]);
        };
        var cb = getComputedStyle(document.body), ch = getComputedStyle(h);
        var l = lum(cb.backgroundColor);
        if (l === null) l = lum(ch.backgroundColor);
        /* Fond en dégradé (pas de couleur unie) : luminance moyenne des couleurs du dégradé. */
        if (l === null) {
          var img = (cb.backgroundImage !== 'none' ? cb.backgroundImage : ch.backgroundImage) || '';
          var cs = img.match(/rgba?\([^)]*\)/g);
          if (cs && cs.length) { var s = 0, n = 0; cs.forEach(function (c) { var v = lum(c); if (v !== null) { s += v; n++; } }); if (n) l = s / n; }
        }
        h.classList.add('m-site');
        if (l !== null && l < 0.18) h.classList.add('m-sombre');
      } catch (e) { document.documentElement.classList.add('m-site'); }
    });
  }
  root.MRedirect = { cible: cible, telephone: telephone, venantDeLApp: venantDeLApp, PAGES: PAGES,
    estTelephone: function () { try { return telephone(navigator.userAgent, Math.min(screen.width, screen.height), navigator.maxTouchPoints > 0) && !sessionStorage.getItem('da_version_ordinateur'); } catch (e) { return false; } } };
  if (typeof window === 'undefined' || !window.location) return;
  try {
    if (/[?&]version=ordinateur\b/.test(location.search)) { sessionStorage.setItem('da_version_ordinateur', '1'); return; }
    /* Plus de drapeau « venu de l'appli » (2026-10-07, signalé : le téléphone passait au hasard de la nouvelle à l'ancienne
       interface) : il désactivait la bascule pour toute la session dès qu'on suivait UN lien de l'appli vers une page du
       site, puis chaque page du site s'affichait à l'ancienne. Une page de l'ancien site qui a un équivalent dans l'appli
       renvoie toujours dans l'appli ; seul le choix explicite « Version ordinateur » est mémorisé. */
    if (sessionStorage.getItem('da_version_ordinateur')) return;
    if (!telephone(navigator.userAgent, Math.min(screen.width, screen.height), navigator.maxTouchPoints > 0)) return;
    var h = cible(location.pathname, location.search, location.hash);
    if (h) location.replace('/m.html' + h);
    else habiller(String(location.pathname).replace(/^\//, '').split('/').pop());
  } catch (e) { /* en cas de doute : on laisse la page du site s'afficher */ }
})(typeof window !== 'undefined' ? window : globalThis);

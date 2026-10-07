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
    'parrainage.html': '#/parrainage', 'mon-abonnement.html': '#/abonnement', 'confidentialite.html': '#/confidentialite',
    'reseau.html': '#/reseaupro', 'business-plan.html': '#/businessplan', 'mon-associe.html': '#/associe',
    'videos-tutoriels.html': '#/videos', 'cagnottes.html': '#/cagnottes',
    'fil-actualite.html': '#/accueil', 'evenements.html': '#/evenements'
  };
  /* Les tableaux de bord (dashboard-*.html) ne sont PAS redirigés : ils contiennent des outils qui n'existent pas encore dans l'appli. */
  /* Pages avec paramètre : initiative.html?id=X, profil.html?id=X, compte-rendu.html?evt=X, videos-tutoriels.html?v=X */
  function cible(pathname, search, hash) {
    var f = String(pathname || '').replace(/^\//, '').split('/').pop();
    /* Tableaux de bord Utilisateur / Initiative : ouverts « nus », ils renvoient dans l'appli (écran « Moi ») ; avec un ancre
       (#evenements, #cagnottes…) ils restent ouverts, car ce sont les outils qui n'ont pas encore d'écran dans l'appli. */
    if ((f === 'dashboard-utilisateur.html' || f === 'dashboard-initiative.html') && !String(hash || '').replace(/^#/, '')) return '#/moi';
    var q = {}; String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); });
    if (f === 'initiative.html' && q.id) return '#/profil/i/' + encodeURIComponent(q.id);
    if ((f === 'profil.html' || f === 'profil-app.html') && q.id) return '#/profil/' + encodeURIComponent(q.id);
    if (f === 'compte-rendu.html' && q.evt && !q.edition) return '#/cr/' + encodeURIComponent(q.evt);
    if (f === 'videos-tutoriels.html' && q.v) return '#/video/' + encodeURIComponent(q.v);
    if (f === 'compte-rendu.html' || f === 'profil.html' || f === 'profil-app.html' || f === 'initiative.html') return '';
    return Object.prototype.hasOwnProperty.call(PAGES, f) ? PAGES[f] : '';
  }
  function telephone(ua, largeurEcran, tactile) {
    ua = String(ua || '');
    var phone = /Android.*Mobile|iPhone|iPod|Windows Phone/i.test(ua) && !/iPad|Tablet/i.test(ua);
    return phone && largeurEcran <= 600 && tactile !== false;
  }
  /* Conservé pour les tests uniquement : la bascule ne s'en sert plus (voir plus bas). */
  function venantDeLApp(ref) { return /^https?:\/\/[^\/]+\/m\.html/i.test(String(ref || '')); }
  /* Pages d'entrée sans équivalent dans l'appli (connexion, inscription, mot de passe oublié) : sur téléphone elles gardent leur
     fonctionnement mais prennent l'habillage de l'appli (assets/m-site.css + barre du haut). */
  var HABILLEES = { 'login.html': 1, 'inscription.html': 1, 'mot-de-passe-oublie.html': 1 };
  function habiller(f) {
    if (!HABILLEES[f]) return;
    var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/m-site.css?v=20261007a'; document.head.appendChild(l);
    document.documentElement.classList.add('m-site');
    var barre = function () {
      if (document.getElementById('m-site-top')) return;
      var t = document.createElement('div'); t.id = 'm-site-top';
      t.innerHTML = '<a href="/m.html#/accueil" aria-label="Retour à l’accueil"><img src="/assets/logo.png" alt=""><span><small>Diaspo’Actif</small>' +
        ({ 'login.html': 'Connexion', 'inscription.html': 'Créer un compte', 'mot-de-passe-oublie.html': 'Mot de passe oublié' }[f]) + '</span></a>';
      document.body.insertBefore(t, document.body.firstChild);
    };
    if (document.body) barre(); else document.addEventListener('DOMContentLoaded', barre);
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

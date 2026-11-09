/* ============================================================
   Diaspo'Actif — Sur ordinateur, l'appli téléphone (m.html) renvoie vers la page ordinateur équivalente.
   Ajouté le 2026-11-09 (demande du propriétaire : « Option A »). C'est le miroir de assets/m-redirect.js (téléphone → appli).
   Règles :
   - uniquement les ordinateurs (ni téléphone, ni tablette, ni iPad qui se déclare « Macintosh » avec écran tactile) ;
   - « ?appli=1 » dans l'adresse garde l'appli ouverte sur ordinateur pour la session (essais, démonstrations) ;
   - écran sans équivalent connu : accueil du site ; écran « Moi » : profil ou tableau de bord selon le rôle (ou connexion) ;
   - retour arrière : retirer la ligne <script src="assets/m-bureau.js"> de m.html.
   ============================================================ */
(function (root) {
  'use strict';
  /* Écran de l'appli (premier segment du hash) -> page du site. */
  var ECRANS = {
    accueil: 'index.html', annuaire: 'annuaire.html', evenements: 'evenements.html', boutiques: 'vitrines.html',
    messages: 'messagerie.html', billets: 'mes-billets.html', formations: 'formations.html', parrainage: 'parrainage.html',
    abonnement: 'mon-abonnement.html', confidentialite: 'confidentialite.html', centrefinancier: 'centre-financier.html',
    reseaupro: 'reseau.html', businessplan: 'business-plan.html', associe: 'mon-associe.html', videos: 'videos-tutoriels.html',
    cagnottes: 'cagnottes.html', agenda: 'agenda.html', comptesrendus: 'comptes-rendus.html'
  };
  var DASH = { utilisateur: 'profil.html', initiative: 'profil.html', administrateur: 'dashboard-administrateur.html', officiel: 'dashboard-officiel.html', institutionnel: 'dashboard-institutionnel.html' };

  /* Page ordinateur pour un hash d'appli ('' = « Moi », à résoudre selon le compte). */
  function cible(hash) {
    var seg = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map(function (s) { try { return decodeURIComponent(s); } catch (e) { return s; } });
    var e = seg[0] || 'accueil', id = seg[seg.length - 1];
    if (e === 'moi') return '@moi';
    if (e === 'profil' && seg[1] === 'i' && seg[2]) return 'initiative.html?id=' + encodeURIComponent(seg[2]);
    if (e === 'profil' && seg[1]) return 'profil.html?id=' + encodeURIComponent(seg[1]);
    if (e === 'boutique' && seg[1] === 'u' && seg[2]) return 'profil.html?id=' + encodeURIComponent(seg[2]) + '&vitrine=1';
    if (e === 'evenement' && seg[1]) return 'evenements.html?evt=' + encodeURIComponent(seg[1]);
    if (e === 'post' && seg[1]) return 'fil-actualite.html?post=' + encodeURIComponent(seg[1]);
    if (e === 'video' && seg[1]) return 'videos-tutoriels.html?v=' + encodeURIComponent(seg[1]);
    if (e === 'cr' && seg[1]) return 'compte-rendu.html?evt=' + encodeURIComponent(seg[1]) + (seg[2] === 'synthese' ? '&synthese=1' : '');
    return Object.prototype.hasOwnProperty.call(ECRANS, e) ? ECRANS[e] : 'index.html';
  }
  function ordinateur(ua, tactile) {
    ua = String(ua || '');
    if (/Android|iPhone|iPad|iPod|Mobile|Tablet|Windows Phone|CriOS|FxiOS/i.test(ua)) return false;
    if (/Macintosh/i.test(ua) && tactile > 1) return false; /* iPad en mode « site pour ordinateur » */
    return true;
  }
  root.MBureau = { cible: cible, ordinateur: ordinateur, DASH: DASH };

  if (typeof window === 'undefined' || !window.location) return;
  try {
    if (/[?&]appli=1\b/.test(location.search)) { sessionStorage.setItem('da_appli_sur_ordinateur', '1'); return; }
    if (sessionStorage.getItem('da_appli_sur_ordinateur')) return;
    if (!ordinateur(navigator.userAgent, navigator.maxTouchPoints || 0)) return;
    var c = cible(location.hash);
    if (c !== '@moi') { location.replace('/' + c); return; }
    /* Écran « Moi » : la page dépend du rôle ; sans session, la connexion. */
    fetch('/api/auth/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      var u = d && (d.user || d), role = u && u.role;
      var p = !role ? 'login.html' : role === 'collectivite' ? 'profil-collectivite.html?id=' + u.id : (DASH[role] || 'index.html');
      location.replace('/' + p);
    }).catch(function () { location.replace('/login.html'); });
  } catch (e) { /* en cas de doute : l'appli s'affiche comme avant */ }
})(typeof window !== 'undefined' ? window : globalThis);

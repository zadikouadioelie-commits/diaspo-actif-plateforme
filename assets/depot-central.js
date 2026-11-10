/* ===========================================================
   assets/depot-central.js — Lot F (2026-11-10) : UN SEUL module de dépôt de projet, « Soumettre à Diaspo'Actif ».
   ===========================================================
   Une boutique n'a aucun formulaire de dépôt. Tout bouton « Soumettre / Déposer à Diaspo'Actif » appelle
   DepotCentral.ouvrir() : on vérifie la connexion puis on ouvre la section « Soumettre à Diaspo'Actif »
   du tableau de bord du compte (assets/soumission-da.js). Aucune donnée de la boutique n'est transmise.

   Usage :
     <script src="assets/depot-central.js"></script>
     <button data-depot>Soumettre à Diaspo'Actif</button>      ← branché automatiquement
     DepotCentral.ouvrir();                                     ← ou appel direct
   =========================================================== */
(function () {
  'use strict';

  /* Comptes autorisés à déposer (mêmes rôles que POST /api/projets, type soumission_da) et leur tableau de bord. */
  var TABLEAUX = {
    utilisateur: 'dashboard-utilisateur.html#soumission-da',
    initiative: 'dashboard-initiative.html#soumission-da',
    collectivite: 'dashboard-collectivite.html#soumission-da'
  };
  var NOM = "Soumettre à Diaspo'Actif";

  function prevenir(texte) {
    if (typeof window.notify === 'function') { window.notify(texte, 'warning'); return; }
    window.alert(texte);
  }

  function ouvrir() {
    return fetch((window.API_BASE || '/api') + '/auth/me', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (j) {
        var u = j && (j.user || j);
        if (!u || !u.role) {
          location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
          return;
        }
        var cible = TABLEAUX[u.role];
        if (!cible) {
          prevenir('« ' + NOM + ' » est réservé aux comptes Utilisateur, Initiative et Collectivité.');
          return;
        }
        location.href = cible;
      });
  }

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('[data-depot]') : null;
    if (!b) return;
    e.preventDefault();
    ouvrir();
  });

  window.DepotCentral = { ouvrir: ouvrir, nom: NOM };
})();

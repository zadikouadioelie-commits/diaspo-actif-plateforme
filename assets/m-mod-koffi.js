/* ============================================================
   Diaspo'Actif — Version téléphone : KOFFI (2026-11-01)
   - Conseiller de l'Annuaire : le bouton Koffi (assets/koffi-annuaire.js, même fenêtre que sur le site) apparaît sur l'onglet « Annuaire »
     pour une personne connectée, et disparaît dès qu'on le quitte. Toutes les règles sont décidées par le serveur.
   - Guide des événements : même principe sur l'onglet « Événements » (assets/koffi-evenements.js) ; les cartes ouvrent la fiche dans l'appli (#/evenement/ID).
   - Retour de Stripe après une recharge du crédit (m.html?kofi=succes|annule) : le crédit arrive par le webhook, on attend de le voir puis on prévient.
   Le tuteur des formations est monté par m-mod-formations.js ; le crédit (pastille, recharge) vient de assets/koffi-credit.js.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, toast } = A;

  function charger(src, test) {
    if (test()) return Promise.resolve();
    return new Promise(ok => { const sc = document.createElement('script'); sc.src = src; sc.onload = ok; sc.onerror = ok; document.head.appendChild(sc); });
  }
  const chargerAnnuaire = () => charger('/assets/koffi-annuaire.js?v=3', () => !!window.KoffiAnnuaire);
  const chargerEvenements = () => charger('/assets/koffi-evenements.js?v=1', () => !!window.KoffiEvenements);

  /* ── Conseiller de l'Annuaire : monté sur l'onglet Annuaire seulement ── */
  let enCours = false;
  const surAnnuaire = () => /^#\/annuaire(\/|$)/.test(location.hash);
  async function majAnnuaire() {
    if (enCours) return;
    const K = window.KoffiAnnuaire;
    if (!surAnnuaire() || !S.me) { if (K && K.estMonte()) K.demonter(); return; }
    if (K && K.estMonte()) return;
    enCours = true;
    try {
      await chargerAnnuaire();
      if (window.KoffiAnnuaire && surAnnuaire() && S.me && !window.KoffiAnnuaire.estMonte()) await window.KoffiAnnuaire.monter({ telephone: true, premiumUrl: '#/abonnement' });
      /* Départ de l'onglet pendant le chargement : on retire le bouton. */
      if (window.KoffiAnnuaire && !surAnnuaire() && window.KoffiAnnuaire.estMonte()) window.KoffiAnnuaire.demonter();
    } finally { enCours = false; }
  }
  window.addEventListener('hashchange', majAnnuaire);
  setInterval(majAnnuaire, 1500);   /* la session est lue de façon asynchrone au démarrage de l'appli */
  majAnnuaire();

  /* ── Guide des événements : monté sur l'onglet Événements seulement (pas sur la fiche d'un événement : #/evenement/ID) ── */
  let enCoursEv = false;
  const surEvenements = () => /^#\/evenements(\/|$)/.test(location.hash);
  async function majEvenements() {
    if (enCoursEv) return;
    const K = window.KoffiEvenements;
    if (!surEvenements() || !S.me) { if (K && K.estMonte()) K.demonter(); return; }
    if (K && K.estMonte()) return;
    enCoursEv = true;
    try {
      await chargerEvenements();
      if (window.KoffiEvenements && surEvenements() && S.me && !window.KoffiEvenements.estMonte()) await window.KoffiEvenements.monter({ telephone: true });
      if (window.KoffiEvenements && !surEvenements() && window.KoffiEvenements.estMonte()) window.KoffiEvenements.demonter();
    } finally { enCoursEv = false; }
  }
  window.addEventListener('hashchange', majEvenements);
  setInterval(majEvenements, 1500);
  majEvenements();

  /* ── Retour de Stripe ── */
  const p = new URLSearchParams(location.search);
  if (p.get('kofi')) {
    charger('/assets/koffi-credit.js?v=2', () => !!window.KoffiCredit).then(() => {
      if (!window.KoffiCredit) return;
      window.KoffiCredit.retourPaiement({ lg: 'fr', onFin: (statut, msg) => { toast(msg, statut === 'tard'); } });
    });
  }
})();

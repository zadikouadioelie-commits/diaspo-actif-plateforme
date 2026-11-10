/* ============================================================
   Diaspo'Actif — Version téléphone : KOFFI (2026-11-01)
   - Conseiller de l'Annuaire : le bouton Koffi (assets/koffi-annuaire.js, même fenêtre que sur le site) apparaît sur l'onglet « Annuaire »
     pour une personne connectée, et disparaît dès qu'on le quitte. Toutes les règles sont décidées par le serveur.
   - Guide des événements : même principe sur l'onglet « Événements » (assets/koffi-evenements.js) ; les cartes ouvrent la fiche dans l'appli (#/evenement/ID).
   - Guide des fiches d'inscription : même principe sur le module « Formulaires » (#/inscriptions…, assets/koffi-inscriptions.js) ; « Ouvrir la fiche » mène à #/inscriptions/ID.
   - Guide de navigation (assets/koffi-navigation.js) : bouton rond Koffi (son visage) en bas à gauche de tous les écrans, gratuit ; les cartes ouvrent l'écran de l'appli (#/…) ou la page du site.
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
  const chargerAnnuaire = () => charger('/assets/koffi-annuaire.js?v=5', () => !!window.KoffiAnnuaire);
  const chargerEvenements = () => charger('/assets/koffi-evenements.js?v=5', () => !!window.KoffiEvenements);
  const chargerInscriptions = () => charger('/assets/koffi-inscriptions.js?v=2', () => !!window.KoffiInscriptions);

  /* Tous les boutons Koffi du téléphone se déplacent au doigt ; une seule position mémorisée pour qu'il reste où on l'a posé d'un écran à l'autre. */
  const CLE_POS = 'da_koffi_pos_tel';
  const deplacable = (el, poignee) => charger('/assets/koffi-deplacable.js?v=1', () => !!window.KoffiDeplacable).then(() => { if (window.KoffiDeplacable && el.isConnected) window.KoffiDeplacable(el, CLE_POS, poignee); });

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
      if (window.KoffiAnnuaire && surAnnuaire() && S.me && !window.KoffiAnnuaire.estMonte()) { await window.KoffiAnnuaire.monter({ telephone: true, premiumUrl: '#/abonnement' }); const r = document.querySelector('.ka-root'); if (r) deplacable(r, r.querySelector('.ka-btn')); }
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
      if (window.KoffiEvenements && surEvenements() && S.me && !window.KoffiEvenements.estMonte()) { await window.KoffiEvenements.monter({ telephone: true, apresPublication: () => { const A = window.MApp; if (A && A.refreshTab) A.refreshTab('evenements'); } }); const r = document.querySelector('.ke-root'); if (r) deplacable(r, r.querySelector('.ke-btn')); }
      if (window.KoffiEvenements && !surEvenements() && window.KoffiEvenements.estMonte()) window.KoffiEvenements.demonter();
    } finally { enCoursEv = false; }
  }
  window.addEventListener('hashchange', majEvenements);
  setInterval(majEvenements, 1500);
  majEvenements();

  /* ── Guide des fiches d'inscription : monté sur le module « Formulaires » (#/inscriptions, #/inscriptions/ID…) seulement ── */
  let enCoursIns = false;
  const surInscriptions = () => /^#\/inscriptions(\/|$)/.test(location.hash);
  async function majInscriptions() {
    if (enCoursIns) return;
    const K = window.KoffiInscriptions;
    if (!surInscriptions() || !S.me) { if (K && K.estMonte()) K.demonter(); return; }
    if (K && K.estMonte()) return;
    enCoursIns = true;
    try {
      await chargerInscriptions();
      if (window.KoffiInscriptions && surInscriptions() && S.me && !window.KoffiInscriptions.estMonte()) { await window.KoffiInscriptions.monter({ telephone: true }); const r = document.querySelector('.ki-root'); if (r) deplacable(r, r.querySelector('.ki-btn')); }
      if (window.KoffiInscriptions && !surInscriptions() && window.KoffiInscriptions.estMonte()) window.KoffiInscriptions.demonter();
    } finally { enCoursIns = false; }
  }
  window.addEventListener('hashchange', majInscriptions);
  setInterval(majInscriptions, 1500);
  majInscriptions();

  /* ── Guide de navigation : bouton rond Koffi (son visage) en bas à gauche de TOUS les écrans pour une personne connectée (à droite : les boutons Koffi de l'Annuaire et des Événements).
     Le script de la fenêtre n'est chargé qu'au premier appui : aucun appel au serveur ni à l'IA tant que la personne ne l'ouvre pas. ── */
  function majNavigation() {
    const present = document.getElementById('kn-tel-btn');
    /* Sur l'Annuaire et les Événements, le Koffi de l'écran est déjà là : un seul bouton Koffi à la fois. */
    const koffiDeLEcran = surAnnuaire() || surEvenements() || surInscriptions();
    if (!S.me || koffiDeLEcran) { if (present) present.remove(); return; }
    if (present) return;
    if (!document.getElementById('kn-tel-style')) {
      const st = document.createElement('style'); st.id = 'kn-tel-style';
      st.textContent = '#kn-tel-btn{position:fixed;left:max(10px,calc((100vw - 560px)/2 + 10px));bottom:calc(78px + env(safe-area-inset-bottom));z-index:8900;width:46px;height:46px;border-radius:50%;border:0;padding:0;background:#0D2B4E;color:#fff;cursor:pointer;box-shadow:0 6px 18px rgba(13,43,78,.4),0 0 0 2px #F26422;display:flex;align-items:center;justify-content:center}#kn-tel-btn img{width:100%;height:100%;border-radius:50%;display:block;background:#fff}#kn-tel-btn:focus-visible{outline:3px solid #F26422;outline-offset:3px}';
      document.head.appendChild(st);
    }
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'kn-tel-btn'; b.innerHTML = '<img src="/assets/koffi-avatar-96.webp" alt="" width="46" height="46">'; b.setAttribute('aria-label', 'Koffi : où aller ?'); b.title = 'Koffi : où aller ?';
    b.addEventListener('click', async () => {
      await charger('/assets/koffi-navigation.js?v=3', () => !!window.KoffiNavigation);
      if (window.KoffiNavigation) window.KoffiNavigation.ouvrir({ telephone: true });
    });
    document.body.appendChild(b);
    deplacable(b, b);
  }
  setInterval(majNavigation, 1500);
  majNavigation();

  /* ── Retour de Stripe ── */
  const p = new URLSearchParams(location.search);
  if (p.get('kofi')) {
    charger('/assets/koffi-credit.js?v=3', () => !!window.KoffiCredit).then(() => {
      if (!window.KoffiCredit) return;
      window.KoffiCredit.retourPaiement({ lg: 'fr', onFin: (statut, msg) => { toast(msg, statut === 'tard'); } });
    });
  }
})();

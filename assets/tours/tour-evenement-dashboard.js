/* ============================================================
   Diaspo'Actif — Tutoriel interactif du module Événements
   (dashboard-initiative.html — création rapide, sans billetterie)

   Distinct du tutoriel "evenement" de billetterie.html (le seul
   endroit où les types de billets se configurent). Celui-ci couvre
   la création rapide d'un événement depuis le tableau de bord
   Initiative, y compris le verrou Premium reel de ce module.

   Fidélité au formulaire réel : seuls le titre et la date de
   début sont obligatoires côté serveur (cf. saveInitEvt()). Les
   autres étapes retenues restent franchissables sans être
   remplies (required:false) quand le champ est réellement
   facultatif dans l'application.
   ============================================================ */
(function () {
  "use strict";
  if (!window.GuidedTour) return;

  function modalVisible(id) {
    var el = document.getElementById(id);
    return !!(el && el.style.display !== "none" && el.style.display !== "");
  }

  GuidedTour.define("evenement-dashboard", [
    {
      id: "ievd-create-btn",
      target: '#evenements button[onclick^="openInitEvtModal()"]',
      title: "Créer un événement",
      description: "<p>Cliquez sur <strong>＋ Créer un événement</strong> pour ouvrir le formulaire de création rapide.</p>",
      placement: "bottom",
      arrow: "bottom",
      action: "click",
      animation: "halo",
      skipIf: function () { return modalVisible("init-evt-modal-bg"); },
    },
    {
      id: "ievd-titre",
      target: "#iev-titre",
      title: "Titre de l'événement",
      description: "<p>Donnez un titre clair à votre événement.</p>",
      placement: "bottom",
      action: "input",
      minLength: 1,
      animation: "zoom",
    },
    {
      id: "ievd-debut",
      target: "#iev-debut",
      title: "Date de début",
      description: "<p>Seconde information obligatoire : date et heure de début.</p>",
      placement: "bottom",
      action: "change",
    },
    {
      id: "ievd-ville",
      target: "#iev-ville",
      title: "Ville",
      description: "<p>Facultatif, mais recommandé pour situer votre événement.</p>",
      placement: "bottom",
      action: "input",
      minLength: 1,
      required: false,
    },
    {
      id: "ievd-cat",
      target: "#iev-cat",
      title: "Catégorie",
      description: "<p>Une catégorie est déjà présélectionnée — changez-la si besoin, ou laissez-la telle quelle.</p>",
      placement: "bottom",
      action: "continue",
    },
    {
      id: "ievd-capacite",
      target: "#iev-capacite",
      title: "Capacité",
      description: "<p>Facultatif — laissez à 0 pour une capacité illimitée.</p>",
      placement: "bottom",
      action: "continue",
    },
    {
      id: "ievd-insc-mode",
      target: '[name="iev-insc-mode"]',
      title: "Gestion des inscriptions",
      description: "<p>Choisissez comment se gèrent les inscriptions : libres, facultatives, obligatoires, ou avec validation manuelle de votre part. « Libre » est sélectionné par défaut.</p>",
      placement: "top",
      action: "continue",
    },
    {
      id: "ievd-mode-pub",
      target: '[name="iev-mode-pub"]',
      title: "Publication",
      description: "<p>Par défaut, l'événement est publié immédiatement à sa création. Vous pouvez aussi le programmer pour plus tard, ou le garder en brouillon.</p>",
      placement: "top",
      action: "continue",
    },
    {
      id: "ievd-submit",
      target: "#iev-btn-save",
      title: "C'est prêt !",
      description: "<p>Cliquez sur <strong>✅ Créer l'événement</strong>.</p>",
      placement: "top",
      arrow: "top",
      action: "click",
      animation: "pulse",
    },
    {
      id: "ievd-success",
      target: ".toast-success",
      title: "Création en cours…",
      description: "<p>Un instant…</p>",
      placement: "center",
      action: "wait-visible",
    },
  ], {
    title: "Créer un événement (tableau de bord)",
    finale: {
      icon: "🎉",
      title: "Événement créé !",
      message: "Retrouvez-le dans « Mes événements ». Pour configurer de vrais types de billets à vendre, direction 🎟️ Billetterie & Wallet.",
      cta: "Continuer",
    },
  });
})();

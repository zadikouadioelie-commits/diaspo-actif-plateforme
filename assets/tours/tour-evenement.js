/* ============================================================
   Diaspo'Actif — Tutoriel interactif du module Événements
   (billetterie.html — onglet Organisateur : création d'un
   événement ET configuration de ses billets, le seul endroit de
   la plateforme où les types de billets sont réellement paramétrés).
   Nécessite guided-tour.js (chargé avant ce fichier).

   Fidélité au formulaire réel : seuls le titre et la date de
   début sont réellement obligatoires côté serveur (cf. saveEvent()).
   Les autres étapes restent volontairement franchissables sans
   être remplies (required:false) — le tutoriel encourage sans
   jamais bloquer ce que l'application elle-même autorise.
   ============================================================ */
(function () {
  "use strict";
  if (!window.GuidedTour) return;

  function sectionActive(id) {
    var el = document.getElementById(id);
    return !!(el && el.classList.contains("active"));
  }
  function modalOpen(id) {
    var el = document.getElementById(id);
    return !!(el && el.classList.contains("open"));
  }

  GuidedTour.define("evenement", [
    {
      id: "evt-tab",
      target: "#tab-organisateur",
      title: "Créer un événement",
      description: "<p>Tous vos événements se gèrent depuis l'espace <strong>Organisateur</strong>. Cliquez sur l'onglet <strong>📊 Organisateur</strong>.</p>",
      placement: "bottom",
      arrow: "bottom",
      action: "click",
      animation: "halo",
      skipIf: function () { return sectionActive("sec-organisateur"); },
    },
    {
      id: "evt-create-btn",
      target: '#sec-organisateur button[onclick="openCreateEvent()"]',
      title: "C'est ici",
      description: "<p>Cliquez sur <strong>＋ Créer un événement</strong> pour ouvrir le formulaire.</p>",
      placement: "bottom",
      arrow: "bottom",
      action: "click",
      animation: "pulse",
      skipIf: function () { return modalOpen("modal-create-bg"); },
    },
    {
      id: "evt-titre",
      target: "#ev-titre",
      title: "Titre de l'événement",
      description: "<p>Donnez un titre clair — c'est ce que verront en premier vos futurs participants.</p>",
      placement: "bottom",
      action: "input",
      minLength: 1,
      animation: "zoom",
    },
    {
      id: "evt-debut",
      target: "#ev-debut",
      title: "Date de début",
      description: "<p>Seconde information obligatoire : date et heure de début de l'événement.</p>",
      placement: "bottom",
      action: "change",
    },
    {
      id: "evt-ville",
      target: "#ev-ville",
      title: "Ville",
      description: "<p>Facultatif, mais recommandé : indiquer la ville aide vos participants à situer l'événement.</p>",
      placement: "bottom",
      action: "input",
      minLength: 1,
      required: false,
    },
    {
      id: "evt-cat",
      target: "#ev-cat",
      title: "Catégorie",
      description: "<p>Une catégorie est déjà présélectionnée — changez-la si besoin, ou laissez-la telle quelle.</p>",
      placement: "bottom",
      action: "continue",
    },
    {
      id: "evt-tt-nom",
      target: "#tt-nom-0",
      title: "Créez votre premier billet",
      description: "<p>C'est ici que ça devient intéressant : nommez un type de billet (ex. « Standard »). Sans au moins un type de billet nommé, votre événement sera créé mais restera sans rien à vendre.</p>",
      placement: "top",
      arrow: "top",
      action: "input",
      minLength: 1,
      required: false,
      animation: "halo",
    },
    {
      id: "evt-tt-prix",
      target: "#tt-prix-0",
      title: "Prix du billet",
      description: "<p>Indiquez le prix en euros. Laissez à 0 pour un billet gratuit.</p>",
      placement: "top",
      action: "input",
      minLength: 1,
      required: false,
    },
    {
      id: "evt-tt-qte",
      target: "#tt-qte-0",
      title: "Quantité disponible",
      description: "<p>Pré-rempli à 100 — ajustez selon la capacité réelle de votre billet.</p>",
      placement: "top",
      action: "continue",
    },
    {
      id: "evt-cfg-active",
      target: "#cfg-active",
      title: "Billetterie active",
      description: "<p>Cette case est cochée par défaut : la vente de billets sera immédiatement possible dès la publication.</p>",
      placement: "top",
      action: "continue",
    },
    {
      id: "evt-publier",
      target: "#ev-publier",
      title: "Publier maintenant ?",
      description: "<p>Cochez pour publier l'événement immédiatement, ou laissez décoché pour le garder en brouillon et le publier plus tard.</p>",
      placement: "top",
      action: "check",
      required: false,
    },
    {
      id: "evt-submit",
      target: "#btn-save-event",
      title: "C'est prêt !",
      description: "<p>Cliquez sur <strong>Créer l'événement</strong>.</p>",
      placement: "top",
      arrow: "top",
      action: "click",
      animation: "pulse",
    },
    {
      id: "evt-success",
      target: ".toast-success",
      title: "Création en cours…",
      description: "<p>Un instant…</p>",
      placement: "center",
      action: "wait-visible",
    },
  ], {
    title: "Créer un événement avec billetterie",
    finale: {
      icon: "🎉",
      title: "Événement créé !",
      message: "Retrouvez-le dans « Mes événements ». Depuis sa fiche, « 📊 Tableau de bord » vous montrera vos participants et vos ventes en temps réel.",
      cta: "Continuer",
    },
  });
})();

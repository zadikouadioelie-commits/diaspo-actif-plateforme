/* ============================================================
   Diaspo'Actif — Tutoriel interactif du module Formulaires & Inscriptions
   (inscriptions-admin.html — page de détail d'une fiche)

   Parcours de découverte des 11 onglets de la fiche : clic réel sur
   chaque onglet pour que le contenu affiché change en même temps que
   l'explication, comme le tutoriel du module Événements
   (tour-evenement-dashboard.js), même patron.
   ============================================================ */
(function () {
  "use strict";
  if (!window.GuidedTour) return;

  function step(tab, label, description, placement) {
    return {
      id: "iad-" + tab,
      target: '[data-tab="' + tab + '"]',
      title: label,
      description: "<p>" + description + "</p>",
      placement: placement || "bottom",
      arrow: placement === "top" ? "top" : "bottom",
      action: "click",
      animation: "halo",
    };
  }

  GuidedTour.define("inscriptions-admin", [
    step("overview", "📊 Vue d'ensemble", "Le résumé de votre fiche : inscriptions reçues, types actifs, fonds gelés et places restantes en un coup d'œil."),
    step("types", "🏷️ Types d'inscription", "Créez les différents profils d'inscrits (ex. Participant, Exposant, Bénévole), gratuits ou payants, avec ou sans limite de places."),
    step("fields", "📝 Formulaire", "Choisissez les champs demandés aux personnes qui s'inscrivent — nom, téléphone, questions personnalisées…"),
    step("validation", "✅ Validation", "Décidez si chaque inscription est acceptée automatiquement ou si vous devez l'approuver vous-même avant confirmation."),
    step("public", "🌐 Aperçu public", "Voyez la fiche exactement comme la découvriront vos visiteurs, avant de la publier."),
    step("communication", "📧 Communication", "Personnalisez les e-mails envoyés automatiquement aux inscrits (confirmation, rappels…)."),
    step("qr", "🎟️ Contrôle QR", "Générez et scannez les billets/QR codes le jour de l'événement pour enregistrer les arrivées."),
    step("presences", "👥 Présences", "La liste des personnes inscrites, avec leur statut de présence."),
    step("finances", "💰 Finances", "Suivez les paiements reçus pour les types d'inscription payants."),
    step("stats", "📈 Statistiques", "L'évolution des inscriptions dans le temps, par type et par source."),
    {
      id: "iad-historique",
      target: '[data-tab="historique"]',
      title: "📜 Historique",
      description: "<p>Toutes les actions effectuées sur cette fiche, pour garder une trace de qui a changé quoi.</p><p>Vous connaissez maintenant toute la fiche !</p>",
      placement: "top",
      arrow: "top",
      action: "click",
      animation: "halo",
    },
  ], {
    title: "Découvrir une fiche d'inscription",
    finale: {
      icon: "🎉",
      title: "Vous savez tout !",
      message: "Retrouvez ce tutoriel à tout moment via le bouton 🎥 Tutoriel, en haut de la fiche.",
      cta: "Terminer",
    },
  });
})();

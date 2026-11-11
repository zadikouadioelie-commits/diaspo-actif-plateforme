/* ============================================================================================
   Registre des simulations de Diaspo'Actif (2026-11-11, demande explicite : « l'espace simulation va regrouper tous les
   systèmes simulés, y compris l'atelier des boutiques, et d'autres si nous en créons plus tard »).

   Une simulation = un système qui fonctionne avec des données fictives ou d'essai, sans toucher aux vraies données ni à de
   l'argent réel. La page espace-simulation.html affiche ce registre sous forme de cartes.

   POUR AJOUTER UNE SIMULATION PLUS TARD : ajouter UN objet à la liste ci-dessous (rien d'autre à modifier — ni la page, ni le menu).
     cle        identifiant court, unique, sans espace
     titre      nom affiché sur la carte
     resume     une phrase : ce que l'on peut faire ici
     detail     deux ou trois phrases : comment ça marche, ce qui est fictif
     garantie   ce qui est protégé (affiché en pastille) — ex. « Données fictives »
     url        page à ouvrir (même onglet)
     icone      nom d'une icône de ICONES ci-dessous (trait, jamais d'émoji)
     public     false = réservé aux administrateurs (cas de toutes les simulations actuelles) ; true = page ouverte aux membres
     note       (facultatif) précision de lancement, ex. « se lance depuis un business plan »
   ============================================================================================ */
(function () {
  'use strict';

  /* Icônes au trait (24×24, stroke currentColor) — même langage visuel que le menu des modules */
  var ICONES = {
    boutique: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    presentation: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="m7 12 3-3 3 2 4-4"/>',
    demo: '<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4z"/>',
    flacon: '<path d="M9 2h6M10 2v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 8V2"/><path d="M7.5 15h9"/>'
  };

  var SIMULATIONS = [
    {
      cle: 'atelier-boutiques',
      titre: 'Atelier des boutiques',
      resume: 'Voir une boutique réelle de chaque type, et essayer le système de création.',
      detail: 'Un exemple par type de boutique (6 types), consultable sur ordinateur, tablette et téléphone, plus l’écran de création avec ses couleurs et ses options. Les vraies boutiques ne changent pas.',
      garantie: 'Données fictives',
      url: 'atelier-boutiques.html',
      icone: 'boutique',
      public: false
    },
    {
      cle: 'presentation-business-plan',
      titre: 'Simulation de présentation d’un business plan',
      resume: 'S’entraîner à présenter un business plan devant un investisseur, un banquier ou un partenaire.',
      detail: 'Un interlocuteur simulé pose ses questions sur le business plan choisi, puis un rapport de la séance est enregistré. Aucune vraie personne n’est contactée.',
      garantie: 'Interlocuteurs simulés',
      url: 'business-plan-simulation.html',
      icone: 'presentation',
      public: false,
      note: 'Utilise les business plans du compte connecté ; elle se lance aussi depuis la fiche d’un business plan.'
    },
    {
      cle: 'demo-interactive',
      titre: 'Démo interactive de la plateforme',
      resume: 'Parcourir la plateforme comme un utilisateur, une initiative ou un officiel.',
      detail: 'Une version de démonstration de Diaspo’Actif (accueil, annuaire, fil, événements, messagerie, tableau de bord) avec des profils et des publications d’exemple.',
      garantie: 'Données fictives',
      url: 'demo.html',
      icone: 'demo',
      public: true
    }
  ];

  window.SIMULATIONS = SIMULATIONS;
  window.SIMULATIONS_ICONES = ICONES;
})();

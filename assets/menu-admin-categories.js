/* ============================================================================================
   Menu des modules du compte Administrateur : cinq catégories (2026-11-11, demande explicite : « dans le menu du compte
   administrateur, crée 4 catégories de modules comme pour les autres comptes : analyse, réponses à une demande, création, modération »,
   puis, capture du panneau des autres comptes à l'appui : « comme ça », puis : « élargis la vue, il manque simulation »).

   Le panneau est CELUI DES AUTRES COMPTES (assets/menu-modules-cartes.js : titre « Menu des modules », recherche, une rangée d'onglets,
   une carte par module avec icône et description). Ce fichier ne dessine rien : il DÉCLARE seulement la configuration du tiroir
   Administrateur, avant que menu-modules-cartes.js ne se monte (il doit donc être chargé AVANT lui) :
     - data-mmc-cats sur le tiroir  → les onglets sont ces quatre catégories (au lieu de Standard / Premium / Tous),
     - data-mmc-cat sur chaque lien → sa catégorie,
     - data-mmc-icone / data-mmc-desc sur chaque lien → icône et description d'un administrateur (« Formations » = créer, pas suivre).
   Rien n'est déplacé ni supprimé. Un module absent des tables ci-dessous reste visible dans TOUS les onglets (jamais perdu), avec l'icône
   « grille » et sans description.

   Pour ranger un module autrement : le changer de liste dans RANGEMENT. Pour en ajouter un : une ligne dans la liste de sa catégorie
   et une dans FICHES.  Retour arrière : retirer les deux balises <script> (ce fichier et menu-modules-cartes.js) de dashboard-administrateur.html.
   ============================================================================================ */
(function () {
  'use strict';
  if (window.__admCategories) return;
  window.__admCategories = true;

  const CATEGORIES = [['analyse', 'Analyse'], ['demandes', 'Réponses aux demandes'], ['creation', 'Création'], ['moderation', 'Modération'], ['simulation', 'Simulation']];

  /* Clé d'un module = son data-section, ou le nom de la page pour les liens vers un autre fichier. */
  const RANGEMENT = {
    analyse: [
      'vue-ensemble', 'reseau', 'retention', 'avancement-criteres', 'analytics-trafic', 'error-logs', 'initiatives',
      'membres', 'reseau-pro', 'diaspora-stats', 'obs-eco', 'obs-coop', 'obs-instit', 'revenus-diaspora',
      'cartographie-competences', 'obs-recensement', 'finances', 'ventes', 'oz-admin', 'origines', 'social-sync',
      'paiements-admin.html'
    ],
    demandes: [
      'accreditations', 'certifications', 'verifications-organisation', 'demandes-formateur', 'demandes-passage', 'ida-demandes',
      'rencontres', 'suppression-comptes', 'messages-techniques', 'support-pilote', 'faq-sr', 'partenariat-admin',
      'projets-evaluation.html'
    ],
    creation: [
      'formations', 'onboarding', 'videos-tutoriels', 'faq', 'chatbot', 'kofi-budget', 'partenaires-admin', 'packages', 'deals-admin',
      'diaspoactif-deals', 'parametres', 'billetterie', 'parrainage-admin', 'liens-adherents', 'contenu', 'communication',
      'publications', 'notifications-admin', 'ads', 'administrateurs-junior',
      'comptes-lies.html', 'comptes-lies-admin.html'
    ],
    moderation: [
      'moderation', 'avis-moderation', 'temoignages-admin', 'regles-contact', 'conformite', 'acces-delegue-admin'
    ],
    /* Tous les systèmes simulés sont regroupés dans l'Espace simulation (assets/simulations-registre.js) : un seul module ici,
       les prochaines simulations s'ajoutent au registre, pas à ce menu. */
    simulation: [
      'espace-simulation.html'
    ]
  };

  /* [icône de menu-modules-cartes.js, description d'une ligne] — du point de vue de l'administrateur */
  const FICHES = {
    'vue-ensemble': ['grille', "Suivre l'activité de la plateforme d'un coup d'œil"],
    'reseau': ['globe', 'Mesurer la diaspora et son réseau'],
    'retention': ['groupe', "Suivre l'arrivée et la fidélité des membres"],
    'avancement-criteres': ['courbe', "Suivre l'avancement des initiatives"],
    'analytics-trafic': ['barres', 'Analyser les visites et le trafic du site'],
    'error-logs': ['journal', 'Repérer les erreurs techniques'],
    'initiatives': ['immeuble', 'Consulter les initiatives et leurs projets'],
    'membres': ['groupe', 'Consulter et suivre les membres'],
    'reseau-pro': ['reseau', 'Suivre le réseau professionnel'],
    'diaspora-stats': ['barres', 'Explorer les données de la diaspora'],
    'obs-eco': ['euro', 'Suivre les données économiques'],
    'obs-coop': ['globe', 'Suivre la coopération entre territoires'],
    'obs-instit': ['immeuble', 'Suivre les données institutionnelles'],
    'revenus-diaspora': ['repere', 'Comparer les revenus par diaspora'],
    'cartographie-competences': ['boussole', 'Cartographier les compétences des membres'],
    'obs-recensement': ['liste', 'Suivre le recensement des communautés'],
    'finances': ['portefeuille', 'Suivre les finances de la plateforme'],
    'ventes': ['panier', 'Suivre les ventes et les transactions'],
    'oz-admin': ['etincelle', "Analyses et aide à la décision"],
    'origines': ['repere', 'Compléter les origines manquantes'],
    'social-sync': ['synchro', 'Suivre la synchronisation des réseaux sociaux'],
    'paiements-admin.html': ['carte', 'Suivre et contrôler les paiements'],

    'accreditations': ['bouclier', "Traiter les demandes d'accréditation"],
    'certifications': ['medaille', 'Examiner les demandes de certification'],
    'verifications-organisation': ['valide', 'Vérifier les organisations'],
    'demandes-formateur': ['diplome', 'Répondre aux demandes de compte formateur'],
    'demandes-passage': ['avion', "Traiter les passages en initiative existante"],
    'ida-demandes': ['porte_voix', "Répondre aux demandes d'influenceurs"],
    'rencontres': ['bulle', 'Répondre aux demandes de rencontre'],
    'suppression-comptes': ['corbeille', 'Traiter les demandes de suppression de compte'],
    'messages-techniques': ['bouee', "Répondre aux messages d'assistance"],
    'support-pilote': ['ecran', 'Répondre aux demandes de support pilote'],
    'faq-sr': ['ampoule', 'Répondre aux questions restées sans réponse'],
    'partenariat-admin': ['lien', 'Traiter les demandes de partenariat'],
    'projets-evaluation.html': ['dossier', 'Évaluer les projets déposés'],

    'formations': ['livre', 'Créer et gérer les formations'],
    'onboarding': ['lecture', "Créer les tutoriels d'accueil"],
    'videos-tutoriels': ['lecture', 'Publier les vidéos tutoriels'],
    'faq': ['ampoule', 'Rédiger la foire aux questions'],
    'chatbot': ['bulle', "Alimenter la mémoire de l'assistant"],
    'kofi-budget': ['etincelle', "Régler le budget de l'assistant Koffi"],
    'partenaires-admin': ['medaille', 'Créer et présenter les partenaires officiels'],
    'packages': ['colis', "Créer les packages Diaspo'Actif"],
    'deals-admin': ['cadeau', 'Attribuer des deals'],
    'diaspoactif-deals': ['lien', "Gérer les deals Diaspo'Actif"],
    'parametres': ['reglages', 'Régler la plateforme'],
    'billetterie': ['billet', 'Créer et gérer billetteries et événements'],
    'parrainage-admin': ['cadeau', 'Créer les invitations et le parrainage'],
    'liens-adherents': ['identite', "Créer les liens d'adhérents"],
    'contenu': ['document', 'Publier le contenu sur la diaspora'],
    'communication': ['courrier', 'Créer et envoyer des communications'],
    'publications': ['journal', 'Créer des publications'],
    'notifications-admin': ['cloche', 'Créer des notifications'],
    'ads': ['porte_voix', 'Créer des publicités'],
    'administrateurs-junior': ['personne', 'Créer les comptes administrateur junior'],
    'espace-simulation.html': ['ecran', 'Essayer les systèmes en simulation, sans rien de réel'],
    'comptes-lies.html': ['lien', 'Relier des comptes'],
    'comptes-lies-admin.html': ['euro', 'Régler les réductions des comptes liés'],

    'moderation': ['bouclier', 'Modérer les contenus signalés'],
    'avis-moderation': ['etoile', 'Modérer les avis et y répondre'],
    'temoignages-admin': ['bulle', 'Modérer les témoignages'],
    'regles-contact': ['groupe', 'Régler les règles de contact et de diffusion'],
    'conformite': ['valide', 'Contrôler la conformité et les données'],
    'acces-delegue-admin': ['cle', 'Contrôler les accès délégués']
  };

  const CAT_DE = {};
  Object.keys(RANGEMENT).forEach(c => RANGEMENT[c].forEach(k => { CAT_DE[k] = c; }));

  const HORS_MODULE = '.sb-search-results,.sb-install-group,.sb-bandeau-group,.sbp-cadre,.sb-reorder-toggle';

  function cleDuLien(a) {
    if (a.dataset.section) return a.dataset.section;
    const h = (a.getAttribute('href') || '').split('#')[0].split('?')[0];
    return h.split('/').pop();
  }

  function marquer(sb) {
    sb.querySelectorAll('a').forEach(a => {
      if (a.closest(HORS_MODULE) || a.id === 'sidebar-close' || a.classList.contains('sb-standalone')) return;
      const k = cleDuLien(a);
      if (CAT_DE[k] && a.dataset.mmcCat !== CAT_DE[k]) a.dataset.mmcCat = CAT_DE[k];
      const f = FICHES[k];
      if (f) { if (a.dataset.mmcIcone !== f[0]) a.dataset.mmcIcone = f[0]; if (a.dataset.mmcDesc !== f[1]) a.dataset.mmcDesc = f[1]; }
    });
  }

  function init() {
    const sb = document.querySelector('aside.sidebar[data-full-menu]');
    if (!sb) return;
    sb.dataset.mmcCats = JSON.stringify(CATEGORIES);
    marquer(sb);
    if (sb._admObs) return;
    // Un module réinjecté plus tard par un autre script (révélation d'un module, etc.) doit recevoir sa catégorie lui aussi
    sb._admObs = new MutationObserver(() => marquer(sb));
    sb._admObs.observe(sb, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

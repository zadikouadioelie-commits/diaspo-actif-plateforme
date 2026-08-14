/* Base de descriptions des modules — source unique utilisée par :
   1) l'icône "?" affichée à côté de chaque module dans les sidebars
   2) le chatbot O-Z, quand on lui demande "à quoi sert [module] ?"
   Une seule entrée par fonctionnalité, réutilisée sur les dashboards où elle apparaît. */
window.MODULE_AIDE = {

  /* ── Communs à plusieurs dashboards ── */
  confidentialite: { titre: "🔐 Confidentialité", texte: "Consultez les niveaux de visibilité de vos données (public, réseau, confidentiel) et gérez vos informations déclarées." },
  programmation: { titre: "⚙️ Programmation", texte: "Planifiez à l'avance vos publications et actions pour qu'elles se déclenchent automatiquement à la date choisie." },
  business_plans: { titre: "📋 Business Plans", texte: "Rédigez et structurez vos plans d'affaires ou de projet directement depuis la plateforme." },
  evaluation_projet: { titre: "📁 Évaluation de Projet", texte: "Faites évaluer un projet ou une initiative selon des critères structurés, utile pour convaincre partenaires et financeurs." },
  mon_agenda: { titre: "📅 Mon Agenda", texte: "Centralisez vos rendez-vous, événements et échéances liés à votre activité sur Diaspo'Actif." },
  visioconference: { titre: "📹 Visioconférence", texte: "Organisez ou rejoignez des réunions en ligne directement depuis votre espace, sans outil externe." },
  emplois_stages: { titre: "💼 Emplois & Stages", texte: "Publiez des offres d'emploi ou de stage, ou consultez les candidatures reçues." },
  reseau_pro: { titre: "🌐 Mon Réseau Pro", texte: "Développez votre réseau professionnel : contacts, mises en relation et recommandations au sein de la diaspora." },
  indice_fiabilite: { titre: "🛡️ Mon indice de fiabilité", texte: "Votre score de confiance sur la plateforme, calculé à partir de votre activité, vos vérifications et les avis reçus." },
  messagerie: { titre: "💬 Messages", texte: "Votre messagerie privée pour échanger directement avec les autres membres de Diaspo'Actif." },
  publications: { titre: "📰 Publications", texte: "Publiez des actualités, annonces ou contenus qui apparaissent dans le fil d'actualité de la plateforme." },
  accreditations_da: { titre: "🎖 Accréditations DA", texte: "Demandez des accréditations officielles Diaspo'Actif qui débloquent des droits ou fonctionnalités spécifiques." },
  support_pilote: { titre: "🖥️ Support Pilote", texte: "Demandez qu'un administrateur voie votre écran en direct et agisse à votre place pour une manipulation, uniquement sur les pages de Diaspo'Actif." },

  /* ── Dashboard Initiative — Premium ── */
  paiement_initiative: { titre: "💳 Module paiement", texte: "Configurez l'encaissement des paiements pour votre initiative (Vitrine, adhésions, billetterie)." },
  publicites: { titre: "📣 Publicités", texte: "Créez des campagnes publicitaires pour mettre en avant votre initiative sur la plateforme." },
  evenements: { titre: "📅 Événements", texte: "Créez et gérez vos propres événements, avec inscriptions et suivi des participants." },
  cotisations_adhesions: { titre: "🎫 Cotisations & Adhésions", texte: "Créez des formules d'adhésion et encaissez réellement les cotisations de vos membres, avec registre et campagnes de relance." },
  votes_securises: { titre: "🗳️ Votes sécurisés", texte: "Organisez des assemblées, élections ou consultations avec bulletin anonyme signé par le Code de Sécurité Diaspo'Actif (DS-ID)." },
  parametres_vitrine: { titre: "⭐ Paramètres Vitrine", texte: "Configurez votre boutique en ligne (Vitrine) : produits, apparence et modalités de vente." },
  profil_public: { titre: "👤 Mon profil public", texte: "La fiche visible par les autres membres et visiteurs : présentation, coordonnées et activités de votre initiative." },
  billetterie: { titre: "🎟️ Billetterie", texte: "Vendez des billets pour vos événements directement depuis la plateforme." },
  affiliation: { titre: "🔗 Affiliation", texte: "Identifiez officiellement les comptes utilisateurs qui font partie de votre organisation." },
  stats_impact: { titre: "🟪 Stats & Impact", texte: "Visualisez les statistiques et l'impact mesurable de votre initiative (portée, engagement, résultats)." },
  messages_vitrine: { titre: "🛍️ Messages de la vitrine", texte: "Les messages reçus de clients ou prospects intéressés par les produits de votre Vitrine." },
  liste_partenaires: { titre: "🤝 Liste des partenaires", texte: "Retrouvez et gérez les organisations partenaires associées à votre initiative." },
  candidatures: { titre: "📋 Candidatures", texte: "Consultez et traitez les candidatures reçues pour vos offres d'emploi ou de stage." },
  centre_financier: { titre: "💰 Centre Financier", texte: "Suivez vos revenus, gérez vos comptes de réception et effectuez des retraits vers votre compte bancaire." },
  asso_documents: { titre: "📁 Documents", texte: "Centralisez les documents officiels de votre association : statuts, procès-verbaux, contrats." },
  zones_action: { titre: "🟨 Zones d'action", texte: "Délimitez les territoires géographiques où votre initiative intervient concrètement." },

  /* ── Dashboard Utilisateur ── */
  cv_lettres: { titre: "📄 CV, Lettres, Candidatures", texte: "Créez et gérez vos CV, lettres de motivation et suivez vos candidatures à des offres." },
  mes_billets: { titre: "🎟 Mes Billets", texte: "Retrouvez tous les billets que vous avez achetés pour des événements sur la plateforme." },
  paiements_utilisateur: { titre: "💳 Paiements", texte: "Enregistrez vos cartes bancaires pour accélérer vos achats dans la Vitrine et vos autres paiements." },
  ma_localisation: { titre: "🟨 Ma localisation", texte: "Indiquez votre position géographique pour être visible dans les recherches locales et l'annuaire." },

  /* ── Dashboard Collectivité ── */
  identite_territoriale: { titre: "🔐 Identité Territoriale", texte: "Gérez les informations officielles rattachant votre institution à son territoire d'origine." },
  partenariats: { titre: "🟨 Partenariats", texte: "Suivez et gérez les partenariats officiels de votre institution avec d'autres organisations." },
  oz_collectivite: { titre: "🧠 OZ Collectivité", texte: "Assistant intelligent dédié aux institutions, pour analyser des données et répondre à vos questions stratégiques." },
  observatoire_mondial: { titre: "🌍 Observatoire Mondial", texte: "Statistiques anonymisées à l'échelle mondiale sur la diaspora, pour orienter vos décisions." },
  observatoire_territorial: { titre: "🏛 Observatoire Territorial", texte: "Statistiques centrées sur votre territoire de rattachement, pour piloter vos politiques locales." },
  consultations: { titre: "📋 Consultations", texte: "Lancez des consultations publiques auprès de la diaspora sur des sujets liés à votre institution." },
};

/* ================================================================
   Diaspo'Actif — Assistant intelligent v2
   9 couches : Histoire · Fonctionnalités · Navigation · Conversation
               Commercial · Ton · Profil · Recherche · Objectif
   ================================================================ */
(function () {
  'use strict';

  /* ─── Détection du profil connecté ─────────────────────────────
     Lit le rôle depuis localStorage (clé 'da_role') ou l'URL     */
  function getProfile() {
    try {
      const role = localStorage.getItem('da_role') || '';
      const page = window.location.pathname;
      if (role) return role;
      if (page.includes('dashboard-administrateur')) return 'administrateur';
      if (page.includes('dashboard-collectivite'))   return 'collectivite';
      if (page.includes('dashboard-institutionnel')) return 'institution';
      if (page.includes('dashboard-initiative'))     return 'initiative';
      if (page.includes('dashboard-utilisateur'))    return 'utilisateur';
      if (page.includes('dashboard-officiel'))       return 'officiel';
      return 'visiteur';
    } catch (e) { return 'visiteur'; }
  }

  /* ═══════════════════════════════════════════════════════════════
     BASE DE CONNAISSANCES — organisée en 9 catégories
     ═══════════════════════════════════════════════════════════════ */
  const KB = {

    /* ── 1. ACCUEIL & CONVERSATIONNEL ─────────────────────────── */
    welcome: {
      text: "Bonjour ! 👋 Je suis l'assistant Diaspo'Actif.\n\nComment puis-je vous aider aujourd'hui ?",
      quickReplies: [
        { label: "C'est quoi Diaspo'Actif ?", intent: "histoire" },
        { label: "Découvrir les fonctionnalités", intent: "fonctionnalites" },
        { label: "Je cherche comment faire quelque chose", intent: "nav_aide" },
        { label: "Les abonnements et tarifs", intent: "abonnements" },
      ],
    },

    bonjour: {
      text: "Bonjour et bienvenue ! 😊 Je suis l'assistant de Diaspo'Actif, toujours disponible pour vous informer, vous orienter et vous accompagner.\n\nQue puis-je faire pour vous ?",
      quickReplies: [
        { label: "Découvrir la plateforme", intent: "histoire" },
        { label: "Créer un compte", intent: "inscription" },
        { label: "Explorer l'annuaire", action: "annuaire.html" },
      ],
    },

    bonsoir: {
      text: "Bonsoir ! 🌙 Je suis l'assistant de Diaspo'Actif, disponible à toute heure pour vous aider.\n\nQue puis-je faire pour vous ce soir ?",
      quickReplies: [
        { label: "Découvrir la plateforme", intent: "histoire" },
        { label: "Créer un compte", intent: "inscription" },
      ],
    },

    merci: {
      text: "Avec plaisir ! 🙏 C'est un honneur de pouvoir vous aider.\n\nN'hésitez pas à revenir si vous avez d'autres questions — je suis là pour ça.",
      quickReplies: [
        { label: "Autre question", intent: "nav_aide" },
        { label: "Retour à l'accueil", action: "index.html" },
      ],
    },

    aurevoir: {
      text: "À bientôt ! 👋 N'hésitez pas à revenir si vous avez des questions.\n\nBonne continuation dans votre parcours avec Diaspo'Actif ! 🌍",
      quickReplies: [],
    },

    comment_vas_tu: {
      text: "Je suis un assistant numérique, donc toujours en pleine forme ! 😄\n\nMais ce qui compte surtout, c'est que vous puissiez obtenir les informations dont vous avez besoin. Je suis entièrement à votre disposition.",
      quickReplies: [
        { label: "J'ai besoin d'aide", intent: "nav_aide" },
        { label: "Découvrir la plateforme", intent: "histoire" },
      ],
    },

    aide: {
      text: "Bien sûr, je suis là pour vous aider ! 🤝 Voici ce que je peux faire pour vous :",
      bullets: [
        "📖 Vous expliquer l'histoire et la mission de Diaspo'Actif",
        "⚙️ Vous présenter toutes les fonctionnalités de la plateforme",
        "🧭 Vous guider pas à pas dans l'application",
        "💼 Vous conseiller sur les abonnements et accréditations",
        "💬 Répondre à toutes vos questions",
      ],
      quickReplies: [
        { label: "Histoire de Diaspo'Actif", intent: "histoire" },
        { label: "Les fonctionnalités", intent: "fonctionnalites" },
        { label: "M'aider à naviguer", intent: "nav_aide" },
        { label: "Les abonnements", intent: "abonnements" },
      ],
    },

    /* ── 2. HISTOIRE DE DIASPO'ACTIF ──────────────────────────── */
    histoire: {
      text: "Diaspo'Actif est né d'un constat fort : la diaspora africaine est un acteur de développement majeur, mais ses forces restent trop souvent dispersées et invisibles. 🌍",
      bullets: [
        "🎯 Fondé pour structurer un écosystème collaboratif au service de la diaspora",
        "🌐 Une plateforme numérique qui connecte les talents, les initiatives et les institutions",
        "🤝 Des ponts construits entre les communautés diasporiques et les territoires d'origine",
        "📈 Un outil au service du développement collectif, solidaire et durable",
      ],
      closing: "Diaspo'Actif ne remplace pas les acteurs — il leur donne les outils pour agir ensemble.",
      quickReplies: [
        { label: "Qui a fondé Diaspo'Actif ?", intent: "fondateurs" },
        { label: "Quelle est la vision ?", intent: "vision" },
        { label: "Quelles sont les valeurs ?", intent: "valeurs" },
        { label: "Les ambitions futures", intent: "ambitions" },
      ],
    },

    fondateurs: {
      text: "Diaspo'Actif a été fondé par des membres de la diaspora africaine eux-mêmes, convaincus qu'une plateforme dédiée pouvait changer la donne. 🙌",
      bullets: [
        "🧭 Portés par l'expérience vécue des défis de la diaspora",
        "💡 Motivés par l'absence d'un espace numérique structurant et inclusif",
        "🌍 Déterminés à bâtir un outil à la hauteur des ambitions de la communauté",
        "🤝 Soutenus par des partenaires institutionnels et associatifs engagés",
      ],
      closing: "Le projet est né de l'intérieur de la diaspora, pour la diaspora.",
      quickReplies: [
        { label: "La vision du projet", intent: "vision" },
        { label: "Les missions de l'association", intent: "missions" },
        { label: "Rejoindre Diaspo'Actif", action: "inscription.html" },
      ],
    },

    vision: {
      text: "La vision de Diaspo'Actif est ambitieuse et claire : faire de la diaspora africaine un acteur de développement structuré, visible et influent. 🔭",
      bullets: [
        "🌐 Un écosystème numérique où chaque membre peut agir et collaborer",
        "🔗 Des connexions concrètes entre diaspora, collectivités et institutions",
        "📊 Une visibilité et une lisibilité des initiatives diasporiques",
        "🏗️ Un impact mesurable et durable sur les territoires d'origine et d'accueil",
      ],
      closing: "La plateforme est un catalyseur. La transformation appartient aux acteurs de la diaspora.",
      quickReplies: [
        { label: "Les valeurs de Diaspo'Actif", intent: "valeurs" },
        { label: "Les missions", intent: "missions" },
        { label: "Les ambitions futures", intent: "ambitions" },
      ],
    },

    valeurs: {
      text: "Diaspo'Actif est guidé par des valeurs fondamentales qui orientent chaque décision. ❤️",
      bullets: [
        "🤝 Solidarité — la force collective au service de chaque membre",
        "🔍 Transparence — des processus clairs, lisibles et accessibles",
        "🌍 Inclusivité — ouverte à toutes les diasporas et à leurs alliés",
        "📚 Pédagogie — expliquer, former, accompagner à chaque étape",
        "🛡️ Intégrité — une accréditation rigoureuse qui garantit la confiance",
        "⚡ Action — favoriser le passage concret à l'acte",
      ],
      closing: "Ces valeurs ne sont pas des slogans — elles se traduisent dans chaque fonctionnalité de la plateforme.",
      quickReplies: [
        { label: "Les missions de l'association", intent: "missions" },
        { label: "La vision du projet", intent: "vision" },
        { label: "Rejoindre la plateforme", action: "inscription.html" },
      ],
    },

    missions: {
      text: "Diaspo'Actif poursuit plusieurs missions complémentaires pour la diaspora africaine. 📋",
      bullets: [
        "🗂️ Référencer et valoriser les initiatives diasporiques",
        "🔗 Connecter les acteurs entre eux (membres, associations, institutions)",
        "📢 Donner une voix et une visibilité aux projets de la diaspora",
        "🏛️ Faciliter les partenariats institutionnels (collectivités, ambassades, mairies)",
        "📊 Produire des données et analyses sur la diaspora (Observatoire)",
        "💼 Accompagner les démarches professionnelles et entrepreneuriales",
        "🎓 Former et sensibiliser aux enjeux de la diaspora",
      ],
      quickReplies: [
        { label: "L'Observatoire Diaspora", intent: "observatoire" },
        { label: "Les accréditations", intent: "accreditations" },
        { label: "Rejoindre la plateforme", action: "inscription.html" },
      ],
    },

    ambitions: {
      text: "Diaspo'Actif a des ambitions à la hauteur du potentiel de la diaspora africaine. 🚀",
      bullets: [
        "🌍 Devenir la référence numérique de la diaspora africaine en Europe et dans le monde",
        "🏛️ Structurer des partenariats avec les gouvernements et collectivités territoriales",
        "📊 Créer l'Observatoire de référence sur les données et contributions diasporiques",
        "💡 Incuber et accélérer les projets à fort impact collectif",
        "🎓 Développer des programmes de formation adaptés aux besoins diasporiques",
        "🌐 Étendre la plateforme à toutes les diasporas africaines du monde",
      ],
      closing: "Chaque membre, chaque initiative et chaque institution contribue à cette ambition collective.",
      quickReplies: [
        { label: "Participer au projet", action: "inscription.html" },
        { label: "Les fonctionnalités disponibles", intent: "fonctionnalites" },
      ],
    },

    /* ── 3. FONCTIONNALITÉS DE LA PLATEFORME ──────────────────── */
    fonctionnalites: {
      text: "Diaspo'Actif propose un ensemble complet de fonctionnalités pour tous les profils. ⚙️",
      bullets: [
        "📋 Annuaire — référencer et trouver des initiatives",
        "📰 Fil d'actualité — partager et suivre les nouvelles de la diaspora",
        "✉️ Messagerie — communiquer directement avec les membres",
        "📅 Événements — organiser et découvrir des rencontres",
        "🎓 Formations — accéder à des ressources pédagogiques",
        "💼 Offres — emplois, stages, investissements, missions",
        "📊 Observatoire — statistiques agrégées sur la diaspora",
        "🏛️ Communications institutionnelles — ciblées par territoire et nationalité",
        "📋 Consultations officielles — sondages et concertations",
        "🤝 Collaborations — projets partagés entre acteurs",
      ],
      quickReplies: [
        { label: "L'annuaire", intent: "annuaire" },
        { label: "La messagerie", intent: "messagerie" },
        { label: "L'Observatoire Diaspora", intent: "observatoire" },
        { label: "Les offres d'emploi", intent: "offres" },
      ],
    },

    annuaire: {
      text: "L'annuaire Diaspo'Actif est le répertoire de référence de la diaspora africaine. 🗂️",
      bullets: [
        "🔍 Recherchez par nom, domaine, pays, ville ou nationalité",
        "✅ Identifiez les initiatives accréditées (badge de confiance)",
        "📩 Contactez directement les porteurs de projets",
        "🏷️ Filtrez par secteur : santé, culture, technologie, éducation…",
        "🌍 Accessible à tous, sans inscription obligatoire",
      ],
      closing: "L'annuaire est le point d'entrée pour toute la communauté diasporique.",
      quickReplies: [
        { label: "Ouvrir l'annuaire", action: "annuaire.html" },
        { label: "Référencer mon initiative", action: "inscription.html" },
        { label: "Comment chercher ?", intent: "nav_recherche" },
      ],
    },

    fil_actualite: {
      text: "Le fil d'actualité est l'espace de vie de la communauté Diaspo'Actif. 📰",
      bullets: [
        "📢 Publiez des actualités, annonces, appels à projets",
        "❤️ Réagissez et commentez les publications des membres",
        "🔄 Partagez des contenus avec votre réseau",
        "🏛️ Suivez les communications institutionnelles officielles",
        "🔔 Recevez les actualités des initiatives que vous suivez",
      ],
      quickReplies: [
        { label: "Accéder au fil", action: "fil-actualite.html" },
        { label: "Comment publier ?", intent: "nav_publication" },
      ],
    },

    messagerie: {
      text: "La messagerie Diaspo'Actif vous permet de communiquer directement avec tous les membres. ✉️",
      bullets: [
        "💬 Conversations privées entre membres",
        "📎 Partage de fichiers et de liens",
        "🔔 Notifications en temps réel",
        "🏛️ Messagerie accessible depuis l'annuaire (bouton « Contacter »)",
        "🔒 Confidentialité garantie — vos échanges restent privés",
      ],
      quickReplies: [
        { label: "Ouvrir la messagerie", action: "messagerie.html" },
        { label: "Comment envoyer un message ?", intent: "nav_messagerie" },
      ],
    },

    evenements: {
      text: "La section Événements recense toutes les rencontres de la communauté diasporique. 📅",
      bullets: [
        "🎪 Événements physiques et virtuels",
        "📍 Filtrés par pays, ville et thématique",
        "🎟️ Inscription en ligne possible",
        "🏛️ Organisés par des membres ou des institutions partenaires",
        "📆 Agenda intégré pour ne rien manquer",
      ],
      quickReplies: [
        { label: "Voir les événements", action: "evenements.html" },
        { label: "Créer un événement", intent: "nav_evenement" },
      ],
    },

    formations: {
      text: "La section Formations met à disposition des ressources pédagogiques pour la diaspora. 🎓",
      bullets: [
        "📚 Modules de formation en ligne",
        "🎯 Thématiques variées : entrepreneuriat, juridique, numérique, culture",
        "🏛️ Formations proposées par Diaspo'Actif et ses partenaires",
        "📜 Attestations de participation disponibles",
        "🆓 Certaines formations accessibles gratuitement",
      ],
      quickReplies: [
        { label: "Voir les formations", action: "formations.html" },
      ],
    },

    offres: {
      text: "La section Offres regroupe toutes les opportunités professionnelles de la diaspora. 💼",
      bullets: [
        "👔 Offres d'emploi — postes à pourvoir dans les réseaux diasporiques",
        "🎓 Stages — opportunités pour les étudiants",
        "💰 Investissements — projets recherchant des financements",
        "🤝 Missions — collaborations ponctuelles et freelance",
        "📍 Filtrées par pays, secteur et type de contrat",
      ],
      quickReplies: [
        { label: "Voir les offres", action: "offres.html" },
        { label: "Publier une offre", intent: "nav_offre" },
      ],
    },

    observatoire: {
      text: "L'Observatoire Diaspora est un outil exclusif de Diaspo'Actif pour les institutions. 📊",
      bullets: [
        "🌍 Statistiques géographiques : répartition par pays, ville, région",
        "👔 Profils professionnels et secteurs d'activité",
        "🌱 Données sur les initiatives et associations",
        "💼 Statistiques emploi et investissement",
        "🔒 Données 100% agrégées et anonymisées — aucune donnée nominative",
        "🏛️ Réservé aux institutions accréditées par Diaspo'Actif",
      ],
      closing: "L'accès à l'Observatoire nécessite une accréditation officielle délivrée par Diaspo'Actif.",
      quickReplies: [
        { label: "Demander une accréditation", intent: "accreditations" },
        { label: "Protection des données", intent: "confidentialite" },
        { label: "Qui peut accéder ?", intent: "qui_peut" },
      ],
    },

    communications_inst: {
      text: "Les communications institutionnelles permettent aux collectivités de diffuser des messages officiels ciblés. ✉️",
      bullets: [
        "🎯 Ciblage précis par nationalité et territoire de résidence",
        "📸 Intégration de photos (jusqu'à 4), vidéo (2 min) et audio (20 sec)",
        "🔒 Envoi anonymisé — l'institution ne voit pas les identités individuelles",
        "📊 Statistiques après diffusion : nombre de destinataires, taux d'engagement",
        "🚫 Option de désabonnement pour les membres",
        "📋 Types : Annonce officielle, Appel à projets, Information consulaire, Événement",
      ],
      quickReplies: [
        { label: "Comment envoyer ?", intent: "nav_communications" },
        { label: "L'accréditation institutionnelle", intent: "accreditations" },
      ],
    },

    consultations: {
      text: "Le module Consultations permet aux institutions de recueillir l'avis de la diaspora. 📋",
      bullets: [
        "❓ Création de questionnaires ciblés (plusieurs types de questions)",
        "🎯 Ciblage par nationalité ou territoire",
        "📊 Résultats agrégés et anonymisés en temps réel",
        "🗳️ Questions à choix multiple, réponse libre, notation…",
        "📅 Durée configurable avec date de clôture",
        "🔒 Confidentialité des répondants garantie",
      ],
      quickReplies: [
        { label: "Lancer une consultation", intent: "nav_consultations" },
        { label: "Qui peut créer ?", intent: "qui_peut" },
      ],
    },

    cv_builder: {
      text: "Le CV Builder Diaspo'Actif vous permet de créer un curriculum vitae professionnel en ligne. 📄",
      bullets: [
        "🎨 Plusieurs templates visuels disponibles",
        "📝 Sections : expériences, formations, compétences, langues",
        "⬇️ Export PDF en un clic",
        "🌍 Adapté aux contextes international et diasporique",
        "💾 Sauvegarde automatique de vos données",
      ],
      quickReplies: [
        { label: "Créer mon CV", action: "cv-builder.html" },
      ],
    },

    collaborations: {
      text: "La section Collaborations facilite les projets partagés entre acteurs de la diaspora. 🤝",
      bullets: [
        "🔗 Proposez ou rejoignez des projets collaboratifs",
        "👥 Constituez des équipes multidisciplinaires",
        "📊 Suivez l'avancement des projets",
        "🌍 Collaborations transfrontalières entre membres",
      ],
      quickReplies: [
        { label: "Voir les collaborations", action: "collaborations.html" },
      ],
    },

    /* ── 4. NAVIGATION — CHEMINS EXACTS ───────────────────────── */
    nav_aide: {
      text: "Je peux vous guider précisément dans la plateforme. 🧭 Que souhaitez-vous faire ?",
      quickReplies: [
        { label: "Modifier mon profil", intent: "nav_profil" },
        { label: "Créer une initiative", intent: "nav_initiative" },
        { label: "Demander une accréditation", intent: "nav_accred" },
        { label: "Envoyer un message", intent: "nav_messagerie" },
        { label: "Trouver un projet", intent: "nav_recherche" },
        { label: "Accéder aux statistiques", intent: "nav_stats" },
      ],
    },

    nav_profil: {
      text: "Pour modifier votre profil, suivez ce chemin : 👤",
      steps: [
        "Connectez-vous à votre compte",
        "Cliquez sur votre avatar en haut à droite",
        "Sélectionnez « Mon profil »",
        "Ou naviguez vers : Tableau de bord → Paramètres → Informations personnelles",
        "Modifiez vos informations et cliquez sur « Enregistrer »",
      ],
      closing: "Chemin rapide : Tableau de bord → ⚙️ Paramètres → Informations personnelles",
      quickReplies: [
        { label: "Accéder à mon profil", action: "profil.html" },
        { label: "Autre question de navigation", intent: "nav_aide" },
      ],
    },

    nav_initiative: {
      text: "Pour créer une initiative sur Diaspo'Actif, voici les étapes : 🌱",
      steps: [
        "Inscrivez-vous ou connectez-vous en choisissant le type « Initiative »",
        "Accédez à votre Tableau de bord",
        "Section « Mon initiative » → Renseignez les informations",
        "Ajoutez un logo, une description, des domaines d'activité",
        "Votre initiative apparaît dans l'annuaire après validation",
      ],
      closing: "Pour plus de visibilité, pensez à demander une accréditation Diaspo'Actif.",
      quickReplies: [
        { label: "S'inscrire comme initiative", action: "inscription.html" },
        { label: "Demander une accréditation", intent: "nav_accred" },
      ],
    },

    nav_accred: {
      text: "Pour demander une accréditation Diaspo'Actif, voici le chemin exact : 🏅",
      steps: [
        "Connectez-vous à votre Tableau de bord",
        "Cliquez sur « Accréditations Diaspo'Actif » dans le menu latéral",
        "Choisissez le type d'accréditation souhaité",
        "Remplissez le formulaire de demande",
        "Soumettez — l'équipe vous répond sous 48h",
      ],
      closing: "Chemin : Tableau de bord → Accréditations DA → Nouvelle demande",
      quickReplies: [
        { label: "Types d'accréditations", intent: "accreditations" },
        { label: "Voir les tarifs", intent: "tarifs" },
        { label: "Se connecter", action: "login.html" },
      ],
    },

    nav_stats: {
      text: "Pour accéder aux statistiques de votre compte ou initiative : 📊",
      steps: [
        "Connectez-vous à votre Tableau de bord",
        "Section « Statistiques » ou « Tableau de bord » dans le menu latéral",
        "Visualisez les vues, engagements, membres et tendances",
      ],
      closing: "Chemin : Tableau de bord → 📊 Statistiques",
      quickReplies: [
        { label: "Se connecter", action: "login.html" },
        { label: "L'Observatoire (institutions)", intent: "observatoire" },
      ],
    },

    nav_messagerie: {
      text: "Pour envoyer un message à un autre membre : ✉️",
      steps: [
        "Option 1 — Via l'annuaire : trouvez le membre → cliquez sur « Contacter »",
        "Option 2 — Via la messagerie directe : icône ✉️ en haut de page",
        "Option 3 — Via un profil : bouton « Envoyer un message »",
        "Rédigez votre message et appuyez sur Envoyer",
      ],
      closing: "Chemin direct : Menu → ✉️ Messagerie → Nouvelle conversation",
      quickReplies: [
        { label: "Ouvrir la messagerie", action: "messagerie.html" },
        { label: "Voir l'annuaire", action: "annuaire.html" },
      ],
    },

    nav_recherche: {
      text: "Pour trouver un projet, une initiative ou un membre : 🔍",
      steps: [
        "Utilisez la barre de recherche en haut de page (icône 🔍)",
        "Ou accédez directement à la page Recherche",
        "Filtrez par type (initiative, membre, offre), pays, secteur",
        "L'annuaire offre des filtres plus avancés pour les initiatives",
      ],
      closing: "Chemin : Menu → 🔍 Recherche · ou · Annuaire → filtres avancés",
      quickReplies: [
        { label: "Ouvrir la recherche", action: "recherche.html" },
        { label: "Voir l'annuaire", action: "annuaire.html" },
      ],
    },

    nav_publication: {
      text: "Pour publier sur le fil d'actualité : 📰",
      steps: [
        "Accédez au fil d'actualité",
        "Cliquez sur la zone « Quoi de neuf ? » en haut du fil",
        "Rédigez votre message, ajoutez une image si souhaité",
        "Choisissez la catégorie (actualité, événement, appel à projets…)",
        "Cliquez sur « Publier »",
      ],
      closing: "Chemin : Menu → 📰 Fil d'actualité → zone de publication",
      quickReplies: [
        { label: "Aller au fil", action: "fil-actualite.html" },
      ],
    },

    nav_communications: {
      text: "Pour envoyer une communication institutionnelle ciblée : 🏛️",
      steps: [
        "Connectez-vous à votre Tableau de bord Collectivité ou Institutionnel",
        "Menu latéral → ✉️ Communications",
        "Cliquez sur « Nouvelle communication »",
        "Choisissez le type, rédigez l'objet et le contenu",
        "Ajoutez vos médias (jusqu'à 4 photos, 1 vidéo 2 min, 1 audio 20 sec)",
        "Définissez le ciblage géographique et par nationalité",
        "Cliquez sur « Envoyer »",
      ],
      closing: "Chemin : Tableau de bord → ✉️ Communications → Nouvelle communication",
      quickReplies: [
        { label: "En savoir plus", intent: "communications_inst" },
      ],
    },

    nav_consultations: {
      text: "Pour lancer une consultation officielle auprès de la diaspora : 📋",
      steps: [
        "Connectez-vous à votre Tableau de bord Collectivité",
        "Menu latéral → 📋 Consultations",
        "Cliquez sur « Nouvelle consultation »",
        "Renseignez le titre, la description et les questions",
        "Définissez le ciblage et la date de clôture",
        "Publiez — les membres ciblés peuvent répondre",
      ],
      closing: "Chemin : Tableau de bord → 📋 Consultations → Nouvelle consultation",
      quickReplies: [
        { label: "En savoir plus", intent: "consultations" },
      ],
    },

    nav_evenement: {
      text: "Pour créer un événement sur Diaspo'Actif : 📅",
      steps: [
        "Connectez-vous à votre Tableau de bord",
        "Accédez à la section « Événements »",
        "Cliquez sur « Créer un événement »",
        "Renseignez le titre, la description, la date, le lieu",
        "Choisissez si l'événement est physique ou virtuel",
        "Publiez — l'événement apparaît dans l'agenda communautaire",
      ],
      closing: "Chemin : Tableau de bord → 📅 Événements → Créer un événement",
      quickReplies: [
        { label: "Voir les événements", action: "evenements.html" },
      ],
    },

    nav_offre: {
      text: "Pour publier une offre (emploi, stage, investissement) : 💼",
      steps: [
        "Connectez-vous à votre Tableau de bord Initiative",
        "Accédez à la section « Offres »",
        "Cliquez sur « Publier une offre »",
        "Choisissez le type : emploi, stage, investissement, mission",
        "Renseignez les détails (secteur, pays, conditions, description)",
        "Publiez — l'offre est visible immédiatement dans la section Offres",
      ],
      closing: "Chemin : Tableau de bord → 💼 Offres → Publier une offre",
      quickReplies: [
        { label: "Voir les offres disponibles", action: "offres.html" },
      ],
    },

    nav_dashboard: {
      text: "Pour accéder à votre tableau de bord : 🏠",
      steps: [
        "Connectez-vous à votre compte",
        "Cliquez sur votre avatar ou le bouton « Mon espace »",
        "Le tableau de bord adapte son contenu selon votre profil",
      ],
      closing: "Le tableau de bord est personnalisé selon votre rôle : utilisateur, initiative, institution ou collectivité.",
      quickReplies: [
        { label: "Se connecter", action: "login.html" },
        { label: "Créer un compte", action: "inscription.html" },
      ],
    },

    /* ── 5. COMPTES, ABONNEMENTS & ACCRÉDITATIONS ─────────────── */
    comptes: {
      text: "Diaspo'Actif propose plusieurs types de comptes adaptés à chaque profil. 👤",
      bullets: [
        "🧑 Utilisateur — particulier de la diaspora, accès aux fonctionnalités sociales",
        "🌱 Initiative — association ou organisation, référencement dans l'annuaire",
        "🏛️ Institution — ambassades, consulats, mairies, ministères",
        "🌍 Collectivité — collectivités territoriales avec accès à l'Observatoire",
        "⚙️ Administrateur — gestion globale de la plateforme",
      ],
      closing: "Chaque type de compte donne accès à des fonctionnalités spécifiques.",
      quickReplies: [
        { label: "Créer un compte", action: "inscription.html" },
        { label: "Voir les abonnements", intent: "abonnements" },
        { label: "Les accréditations", intent: "accreditations" },
      ],
    },

    accreditations: {
      text: "Les accréditations Diaspo'Actif certifient l'engagement et la crédibilité d'un acteur. 🏅",
      bullets: [
        "🤝 Mobilisation Active — fédère activement des membres",
        "💡 Créateur d'Opportunités — génère des projets et opportunités concrets",
        "🔭 Observatoire Diaspora — accès aux statistiques anonymisées de la diaspora",
        "🏛️ Institutionnelle — partenariat reconnu avec des collectivités ou institutions",
        "📣 Création Publicité — autonomie totale pour créer et diffuser des campagnes",
      ],
      closing: "Chaque accréditation est instruite et validée par l'équipe Diaspo'Actif, qui garantit l'intégrité du processus.",
      quickReplies: [
        { label: "Comment en demander une ?", intent: "nav_accred" },
        { label: "Les tarifs", intent: "tarifs" },
        { label: "Créer un compte", action: "inscription.html" },
      ],
    },

    abonnements: {
      text: "Diaspo'Actif propose des formules adaptées à chaque étape de votre développement. 📦",
      bullets: [
        "🆓 Compte gratuit — inscription, profil, annuaire, messagerie, fil d'actualité",
        "⭐ Accréditation Niveau 1 — badge vérifié, meilleure visibilité, accès aux appels à projets",
        "🏆 Accréditation Niveau 2 — crédibilité maximale, partenariats premium, mise en avant",
        "📣 Publicité — créez et gérez vos propres campagnes publicitaires",
        "🔭 Observatoire — accès aux statistiques agrégées de la diaspora (institutions)",
      ],
      closing: "Il n'existe pas de formule universelle — choisissez ce qui correspond réellement à vos besoins.",
      quickReplies: [
        { label: "Voir les tarifs détaillés", intent: "tarifs" },
        { label: "Pourquoi prendre un abonnement ?", intent: "pourquoi_payer" },
        { label: "Quel abonnement pour moi ?", intent: "conseil_abonnement" },
      ],
    },

    tarifs: {
      text: "Voici les tarifs Diaspo'Actif, transparents et accessibles à tous. 💳",
      bullets: [
        "🆓 Compte utilisateur — entièrement gratuit",
        "🆓 Référencement initiative — entièrement gratuit",
        "⭐ Accréditation Niveau 1 (Initiative Vérifiée) — à partir de 29 €/an",
        "🏆 Accréditation Niveau 2 (Partenaire Stratégique) — à partir de 79 €/an",
        "📣 Accréditation Publicité — 49 €/an",
        "🔭 Observatoire Diaspora (institutions) — sur devis selon le périmètre",
      ],
      closing: "Chaque niveau débloque des fonctionnalités adaptées à votre situation. Comparez avant de choisir.",
      quickReplies: [
        { label: "Comparer les niveaux", intent: "abonnements" },
        { label: "Pourquoi s'accréditer ?", intent: "pourquoi_payer" },
        { label: "Créer un compte gratuit", action: "inscription.html" },
      ],
    },

    pourquoi_payer: {
      text: "Un abonnement Diaspo'Actif n'est pas une obligation — c'est un investissement dans votre visibilité et votre crédibilité. 💡",
      bullets: [
        "🔍 Visibilité accrue — votre initiative apparaît en priorité dans les recherches",
        "✅ Badge de confiance — les partenaires et membres reconnaissent votre sérieux",
        "📢 Accès aux appels à projets et financements réservés aux accrédités",
        "📊 Statistiques avancées sur votre audience et votre impact",
        "🤝 Réseau d'acteurs sélectionnés et engagés",
      ],
      closing: "La décision vous appartient entièrement. Commencez gratuitement et évoluez à votre rythme.",
      quickReplies: [
        { label: "Voir les tarifs", intent: "tarifs" },
        { label: "Créer un compte gratuit", action: "inscription.html" },
        { label: "Quel abonnement me correspond ?", intent: "conseil_abonnement" },
      ],
    },

    conseil_abonnement: {
      text: "Le choix dépend de votre profil et de vos objectifs. Voici un guide rapide 🧭",
      bullets: [
        "🧑 Simple particulier → Compte gratuit largement suffisant",
        "🌱 Association débutante → Commencez gratuit, accréditez-vous quand vous êtes prêt",
        "🏢 Organisation active avec projets → Niveau 1 pour la crédibilité",
        "🏆 Acteur référent cherchant des partenariats → Niveau 2 recommandé",
        "📣 Vous souhaitez communiquer à grande échelle → Accréditation Publicité",
        "🏛️ Institution publique ou collectivité → Accréditation Observatoire sur mesure",
      ],
      closing: "Il n'y a pas de mauvais choix — seulement celui qui correspond à où vous en êtes aujourd'hui.",
      quickReplies: [
        { label: "Voir les tarifs", intent: "tarifs" },
        { label: "Créer un compte", action: "inscription.html" },
        { label: "Parler à l'équipe", intent: "contact" },
      ],
    },

    /* ── 6. TECHNIQUE — COMPTE ET SÉCURITÉ ───────────────────── */
    inscription: {
      text: "S'inscrire sur Diaspo'Actif est simple, rapide et gratuit. ✅",
      steps: [
        "Cliquez sur « S'inscrire » en haut de la page",
        "Choisissez votre type de compte : Utilisateur, Initiative ou Institution",
        "Renseignez vos informations : nom, email, mot de passe",
        "Complétez votre profil (pays, ville, nationalité, domaines)",
        "Votre compte est actif immédiatement !",
      ],
      quickReplies: [
        { label: "S'inscrire maintenant", action: "inscription.html" },
        { label: "Se connecter", action: "login.html" },
        { label: "Quels types de comptes ?", intent: "comptes" },
      ],
    },

    connexion: {
      text: "Pour vous connecter à votre compte Diaspo'Actif : 🔑",
      steps: [
        "Cliquez sur « Se connecter » en haut de la page",
        "Entrez votre adresse email et votre mot de passe",
        "Cliquez sur « Connexion »",
        "Vous serez redirigé vers votre tableau de bord",
      ],
      closing: "Mot de passe oublié ? Cliquez sur « Mot de passe oublié » sur la page de connexion.",
      quickReplies: [
        { label: "Se connecter", action: "login.html" },
        { label: "Créer un compte", action: "inscription.html" },
      ],
    },

    confidentialite: {
      text: "Diaspo'Actif place la protection des données au cœur de son fonctionnement. 🔒",
      bullets: [
        "🚫 Aucune donnée nominative communiquée aux institutions",
        "📊 Les statistiques sont uniquement agrégées et anonymisées",
        "🔐 Seuil de confidentialité : les groupes de moins de 10 personnes sont masqués",
        "👁️ Chaque membre contrôle la visibilité de ses informations",
        "🛡️ Conformité RGPD pour la protection des données européennes",
      ],
      closing: "Votre identité ne sera jamais partagée sans votre consentement explicite.",
      quickReplies: [
        { label: "Politique de confidentialité", action: "confidentialite.html" },
        { label: "L'Observatoire Diaspora", intent: "observatoire" },
      ],
    },

    contact: {
      text: "Pour contacter l'équipe Diaspo'Actif : 📬",
      bullets: [
        "📧 Via le formulaire de contact sur www.diaspo-actif.com",
        "💬 Via la messagerie interne si vous avez un compte",
        "📱 Sur les réseaux sociaux officiels de Diaspo'Actif",
      ],
      closing: "L'équipe s'efforce de répondre dans les 48 heures ouvrées.",
      quickReplies: [
        { label: "Créer un compte", action: "inscription.html" },
        { label: "Retour à l'accueil", action: "index.html" },
      ],
    },

    qui_peut: {
      text: "Diaspo'Actif s'adresse à un large écosystème d'acteurs diasporiques et institutionnels. 🌍",
      bullets: [
        "🧑 Particuliers de la diaspora africaine et leurs alliés",
        "🌱 Associations, ONG, fondations, collectifs diasporiques",
        "🏢 Entreprises et entrepreneurs de la diaspora",
        "🏛️ Ambassades, consulats, représentations officielles",
        "🌍 Collectivités territoriales (mairies, régions, départements)",
        "📚 Étudiants, chercheurs, professionnels en mobilité",
        "🤝 Tout visiteur peut explorer l'annuaire sans inscription",
      ],
      quickReplies: [
        { label: "Créer un compte", action: "inscription.html" },
        { label: "Les types de comptes", intent: "comptes" },
        { label: "Voir l'annuaire", action: "annuaire.html" },
      ],
    },

    /* ── FALLBACK ──────────────────────────────────────────────── */
    fallback: {
      text: "Je n'ai pas encore la réponse à cette question précise. 🤔 Mais je peux vous orienter vers ce qui pourrait vous aider :",
      quickReplies: [
        { label: "Histoire de Diaspo'Actif", intent: "histoire" },
        { label: "Les fonctionnalités", intent: "fonctionnalites" },
        { label: "M'aider à naviguer", intent: "nav_aide" },
        { label: "Les abonnements et tarifs", intent: "tarifs" },
        { label: "Contacter l'équipe", intent: "contact" },
      ],
    },
  };

  /* ═══════════════════════════════════════════════════════════════
     DÉTECTION D'INTENTION — 9 catégories
     ═══════════════════════════════════════════════════════════════ */
  const INTENTS_MAP = [
    // ── Conversationnel
    { intent: "bonjour",       words: ["bonjour","salut","hello","bjr","coucou","hey"] },
    { intent: "bonsoir",       words: ["bonsoir","good evening","bonne nuit"] },
    { intent: "merci",         words: ["merci","thanks","thank you","parfait","super","excellent"] },
    { intent: "aurevoir",      words: ["au revoir","à bientôt","bye","ciao","bonne journée","bonne soirée","salut!"] },
    { intent: "comment_vas_tu",words: ["comment vas","comment tu","tu vas","ça va","ca va","t'es comment"] },
    { intent: "aide",          words: ["aide-moi","aidez-moi","besoin d'aide","j'ai besoin","peux-tu","peux tu","tu peux","pouvez-vous","vous pouvez"] },

    // ── Histoire & Vision
    { intent: "histoire",      words: ["histoire","origine","créé","fondé","comment est né","qui a créé","c'est quoi","diaspoactif","diaspo actif","à quoi","pour quoi","c'est pour qui"] },
    { intent: "fondateurs",    words: ["fondateur","créateur","qui a fondé","qui est","à l'origine"] },
    { intent: "vision",        words: ["vision","philosophie","idéologie","catalyseur","objectif","but","axe"] },
    { intent: "valeurs",       words: ["valeur","principe","éthique","intégrité","solidarité","inclusivité"] },
    { intent: "missions",      words: ["mission","rôle","raison d'être","que fait","vocation"] },
    { intent: "ambitions",     words: ["ambition","avenir","futur","plan","perspective","développement futur","roadmap"] },

    // ── Fonctionnalités
    { intent: "fonctionnalites", words: ["fonctionnalité","fonctionnalités","que peut-on","qu'est-ce qu'on","outil","module","que faire","que propose","que permet"] },
    { intent: "annuaire",      words: ["annuaire","répertoire","lister","listes","trouver une initiative"] },
    { intent: "fil_actualite", words: ["fil d'actualité","actualité","fil","publication","nouvelles","timeline"] },
    { intent: "messagerie",    words: ["messagerie","message","chat","tchat","envoyer un message","discuter"] },
    { intent: "evenements",    words: ["événement","événements","rencontre","agenda","conférence","meetup"] },
    { intent: "formations",    words: ["formation","formations","apprendre","cours","module","atelier"] },
    { intent: "offres",        words: ["offre","emploi","stage","investissement","mission","job","recrutement"] },
    { intent: "observatoire",  words: ["observatoire","statistique","données","données agrégées","analyse","rapport diaspora"] },
    { intent: "communications_inst", words: ["communication institutionnelle","diffuser","cibler","envoi ciblé","communiqué officiel"] },
    { intent: "consultations", words: ["consultation","sondage","questionnaire","avis","concertation"] },
    { intent: "cv_builder",    words: ["cv","curriculum","cv builder","créer un cv","mon cv"] },
    { intent: "collaborations",words: ["collaboration","projet collectif","projet partagé","co-créer"] },

    // ── Navigation
    { intent: "nav_aide",      words: ["où","comment faire","comment accéder","comment trouver","quel chemin","où est","où se trouve","comment aller","comment je"] },
    { intent: "nav_profil",    words: ["modifier profil","changer profil","mettre à jour profil","modifier mes informations","paramètres","mon compte"] },
    { intent: "nav_initiative",words: ["créer une initiative","créer mon initiative","ajouter une association","référencer"] },
    { intent: "nav_accred",    words: ["demander une accréditation","obtenir accréditation","comment accréditer","déposer une demande"] },
    { intent: "nav_stats",     words: ["statistiques","stats","chiffres","voir les stats","mes stats","tableau de bord"] },
    { intent: "nav_messagerie",words: ["envoyer un message","comment contacter","comment écrire","écrire à"] },
    { intent: "nav_recherche", words: ["chercher","rechercher","trouver un projet","trouver une personne","comment rechercher"] },
    { intent: "nav_publication",words: ["publier","poster","créer une publication","partager sur le fil","comment poster"] },
    { intent: "nav_communications", words: ["envoyer une communication","communication ciblée","diffuser un message","message officiel"] },
    { intent: "nav_consultations", words: ["créer une consultation","lancer un sondage","créer un questionnaire"] },
    { intent: "nav_evenement", words: ["créer un événement","organiser","planifier un événement"] },
    { intent: "nav_offre",     words: ["publier une offre","poster une offre","ajouter une offre","déposer une offre"] },
    { intent: "nav_dashboard", words: ["tableau de bord","dashboard","mon espace","accéder à mon compte"] },

    // ── Comptes & Abonnements
    { intent: "comptes",       words: ["type de compte","compte utilisateur","compte initiative","quel compte","profil compte"] },
    { intent: "accreditations",words: ["accréditation","accrédité","niveau","badge","mobilisation active","créateur d'opportunités"] },
    { intent: "abonnements",   words: ["abonnement","abonnements","formule","plan","offre premium","forfait"] },
    { intent: "tarifs",        words: ["tarif","prix","coût","combien","€","euro","gratuit","payant"] },
    { intent: "pourquoi_payer",words: ["pourquoi payer","pourquoi s'abonner","pourquoi prendre","avantage abonnement","bénéfice abonnement"] },
    { intent: "conseil_abonnement", words: ["quel abonnement","quelle formule","que me recommandez","que me conseiller","correspond à mes besoins"] },

    // ── Technique
    { intent: "inscription",   words: ["s'inscrire","inscription","créer un compte","créer mon compte","m'inscrire","créer mon profil"] },
    { intent: "connexion",     words: ["se connecter","connexion","login","me connecter","mot de passe","j'ai oublié"] },
    { intent: "confidentialite",words: ["confidentialité","privacy","rgpd","données personnelles","vie privée","protection"] },
    { intent: "contact",       words: ["contacter","joindre l'équipe","support","assistance","aide humaine"] },
    { intent: "qui_peut",      words: ["qui peut","éligible","pour qui","à qui s'adresse","quel public","cible"] },
  ];

  function detectIntent(text) {
    const t = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    for (const { intent, words } of INTENTS_MAP) {
      for (const w of words) {
        const norm = w.normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (t.includes(norm)) return intent;
      }
    }
    return null;
  }

  /* ═══════════════════════════════════════════════════════════════
     CONTEXTE ENRICHI — mémoire admin + site diaspo-actif.com
     ═══════════════════════════════════════════════════════════════ */
  let _ctx = [];
  let _ctxLoaded = false;

  async function loadContext() {
    try {
      const r = await fetch('/api/chatbot/context');
      if (!r.ok) return;
      const d = await r.json();
      _ctx = [
        ...(d.memories || []).map(m => ({ titre: m.titre, texte: m.contenu, priority: true })),
        ...(d.siteContent || []).map(s => ({ titre: '', texte: s, priority: false })),
      ];
    } catch (e) { /* silencieux */ }
    _ctxLoaded = true;
  }

  function searchContext(question) {
    if (!_ctx.length) return null;
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = norm(question).split(/\s+/).filter(w => w.length >= 4);
    if (!words.length) return null;
    let best = null, bestScore = 0;
    for (const entry of _ctx) {
      const haystack = norm(entry.titre + ' ' + entry.texte);
      let score = words.reduce((s, w) => s + (haystack.includes(w) ? (entry.priority ? 2 : 1) : 0), 0);
      if (score > bestScore) { bestScore = score; best = entry; }
    }
    return bestScore >= 2 ? best : null;
  }

  function renderContextHit(entry, question) {
    const norm = t => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const words = norm(question).split(/\s+/).filter(w => w.length >= 4);
    const sentences = entry.texte.split(/(?<=[.!?])\s+/).filter(s => s.length > 20);
    const ranked = sentences.map(s => ({
      s,
      score: words.reduce((n, w) => n + (norm(s).includes(w) ? 1 : 0), 0),
    })).sort((a, b) => b.score - a.score);
    const best = ranked.slice(0, 3).map(x => x.s).join(' ');
    const html = (entry.titre ? `<p><strong>${_esc(entry.titre)}</strong></p>` : '')
      + `<p>${_esc(best || entry.texte.slice(0, 300))}</p>`;
    return {
      html,
      quickReplies: [
        { label: "En savoir plus sur Diaspo'Actif", intent: 'histoire' },
        { label: "Les fonctionnalités", intent: 'fonctionnalites' },
        { label: 'Créer un compte', action: 'inscription.html' },
      ],
    };
  }

  /* ═══════════════════════════════════════════════════════════════
     ADAPTATION AU PROFIL
     ═══════════════════════════════════════════════════════════════ */
  function getProfileWelcome(profile) {
    const map = {
      visiteur:        { text: "Bonjour ! 👋 Je suis l'assistant Diaspo'Actif.\n\nVous explorez la plateforme ? Je peux vous expliquer comment ça fonctionne et vous aider à créer votre compte.", qr: [{ label: "C'est quoi Diaspo'Actif ?", intent: "histoire" }, { label: "Créer un compte gratuit", action: "inscription.html" }, { label: "Explorer l'annuaire", action: "annuaire.html" }] },
      utilisateur:     { text: "Bonjour ! 👋 Ravi de vous retrouver.\n\nComment puis-je vous aider aujourd'hui ? Je peux vous guider dans vos démarches ou vous informer sur les fonctionnalités.", qr: [{ label: "Modifier mon profil", intent: "nav_profil" }, { label: "Envoyer un message", intent: "nav_messagerie" }, { label: "Les accréditations", intent: "accreditations" }] },
      initiative:      { text: "Bonjour ! 👋 Heureux de vous revoir.\n\nEn tant qu'initiative, vous avez accès à un large éventail d'outils. Comment puis-je vous aider ?", qr: [{ label: "Demander une accréditation", intent: "nav_accred" }, { label: "Publier une offre", intent: "nav_offre" }, { label: "Voir mes statistiques", intent: "nav_stats" }] },
      collectivite:    { text: "Bonjour ! 👋 Bienvenue sur votre espace Collectivité.\n\nJe suis à votre disposition pour vous guider dans vos communications et l'utilisation de l'Observatoire.", qr: [{ label: "Envoyer une communication", intent: "nav_communications" }, { label: "L'Observatoire Diaspora", intent: "observatoire" }, { label: "Lancer une consultation", intent: "nav_consultations" }] },
      institution:     { text: "Bonjour ! 👋 Bienvenue sur votre espace institutionnel.\n\nComment puis-je vous assister aujourd'hui ?", qr: [{ label: "Envoyer une communication", intent: "nav_communications" }, { label: "Les consultations", intent: "consultations" }, { label: "L'Observatoire", intent: "observatoire" }] },
      administrateur:  { text: "Bonjour ! 👋 Tableau de bord administrateur actif.\n\nComment puis-je vous assister dans la gestion de la plateforme ?", qr: [{ label: "Gestion accréditations", intent: "accreditations" }, { label: "Toutes les fonctionnalités", intent: "fonctionnalites" }] },
    };
    return map[profile] || map.visiteur;
  }

  /* ═══════════════════════════════════════════════════════════════
     RENDU D'UNE RÉPONSE
     ═══════════════════════════════════════════════════════════════ */
  function renderResponse(key) {
    const r = KB[key] || KB.fallback;
    let html = '';
    if (r.text) html += `<p>${_esc(r.text).replace(/\n/g, '<br>')}</p>`;
    if (r.bullets) html += '<ul>' + r.bullets.map(b => `<li>${_esc(b)}</li>`).join('') + '</ul>';
    if (r.steps)   html += '<ol>' + r.steps.map(s => `<li>${_esc(s)}</li>`).join('') + '</ol>';
    if (r.closing) html += `<p class="cb-closing">${_esc(r.closing)}</p>`;
    return { html, quickReplies: r.quickReplies || [] };
  }

  /* ═══════════════════════════════════════════════════════════════
     WIDGET — Construction du panneau
     ═══════════════════════════════════════════════════════════════ */
  function buildWidget() {
    const fab = document.createElement('button');
    fab.id        = 'cb-fab';
    fab.className = 'cb-fab';
    fab.setAttribute('aria-label', 'Ouvrir l\'assistant Diaspo\'Actif');
    fab.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span class="cb-notif">1</span>`;

    const panel = document.createElement('div');
    panel.id        = 'cb-panel';
    panel.className = 'cb-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Assistant Diaspo\'Actif');
    panel.innerHTML = `
      <div class="cb-header">
        <div class="cb-avatar">DA</div>
        <div class="cb-header-info">
          <strong>Assistant Diaspo'Actif</strong>
          <span class="cb-status">● En ligne — toujours disponible</span>
        </div>
        <button class="cb-close" id="cb-close" aria-label="Fermer">✕</button>
      </div>
      <div class="cb-messages" id="cb-messages"></div>
      <div class="cb-quick" id="cb-quick"></div>
      <div class="cb-input-row">
        <input type="text" id="cb-input" placeholder="Posez votre question…" autocomplete="off" maxlength="400">
        <button id="cb-send" class="cb-send-btn" aria-label="Envoyer">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
        </button>
      </div>`;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    fab.addEventListener('click', () => togglePanel(true));
    document.getElementById('cb-close').addEventListener('click', () => togglePanel(false));
    document.getElementById('cb-send').addEventListener('click', sendMessage);
    document.getElementById('cb-input').addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

    setTimeout(() => showWelcome(), 800);
    loadContext();
  }

  let _open = false;
  function togglePanel(force) {
    _open = (force !== undefined) ? force : !_open;
    const panel = document.getElementById('cb-panel');
    panel.classList.toggle('open', _open);
    if (_open) {
      document.getElementById('cb-fab').querySelector('.cb-notif')?.remove();
      document.getElementById('cb-input').focus();
    }
  }

  /* ── Messages ─────────────────────────────────────────────────── */
  function showWelcome() {
    const profile = getProfile();
    const pw = getProfileWelcome(profile);
    const html = `<p>${_esc(pw.text).replace(/\n/g, '<br>')}</p>`;
    appendBotMessage(html, pw.qr);
  }

  function sendMessage() {
    const input = document.getElementById('cb-input');
    const text  = input.value.trim();
    if (!text) return;
    appendUserMessage(text);
    input.value = '';
    clearQuick();

    setTimeout(() => {
      const intent = detectIntent(text);
      if (intent && KB[intent]) {
        const { html, quickReplies } = renderResponse(intent);
        appendBotMessage(html, quickReplies);
      } else {
        const hit = searchContext(text);
        if (hit) {
          const { html, quickReplies } = renderContextHit(hit, text);
          appendBotMessage(html, quickReplies);
        } else {
          const { html, quickReplies } = renderResponse('fallback');
          appendBotMessage(html, quickReplies);
          logUnanswered(text);
        }
      }
    }, 350);
  }

  function logUnanswered(question) {
    try {
      fetch('/api/chatbot/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, langue: navigator.language?.slice(0,2) || 'fr' })
      }).catch(() => {});
    } catch(e) {}
  }

  function appendUserMessage(text) {
    const msg = document.createElement('div');
    msg.className = 'cb-msg cb-msg-user';
    msg.textContent = text;
    getMessages().appendChild(msg);
    scrollBottom();
  }

  function appendBotMessage(html, quickReplies) {
    const typing = document.createElement('div');
    typing.className = 'cb-msg cb-msg-bot cb-typing';
    typing.innerHTML = '<span></span><span></span><span></span>';
    getMessages().appendChild(typing);
    scrollBottom();

    const delay = Math.min(400 + html.length * 0.5, 1200);
    setTimeout(() => {
      typing.remove();
      const msg = document.createElement('div');
      msg.className = 'cb-msg cb-msg-bot';
      msg.innerHTML = html;
      getMessages().appendChild(msg);
      scrollBottom();
      renderQuick(quickReplies);
    }, delay);
  }

  function renderQuick(replies) {
    const qEl = document.getElementById('cb-quick');
    qEl.innerHTML = '';
    if (!replies || !replies.length) return;
    replies.forEach(r => {
      const btn = document.createElement('button');
      btn.className   = 'cb-qr-btn';
      btn.textContent = r.label;
      btn.addEventListener('click', () => {
        if (r.action) {
          window.location.href = r.action;
        } else if (r.intent) {
          clearQuick();
          appendUserMessage(r.label);
          setTimeout(() => {
            const { html, quickReplies } = renderResponse(r.intent);
            appendBotMessage(html, quickReplies);
          }, 350);
        }
      });
      qEl.appendChild(btn);
    });
  }

  function clearQuick() { document.getElementById('cb-quick').innerHTML = ''; }
  function getMessages() { return document.getElementById('cb-messages'); }
  function scrollBottom() {
    const el = getMessages();
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }

  function _esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ═══════════════════════════════════════════════════════════════
     STYLES — Widget flottant
     ═══════════════════════════════════════════════════════════════ */
  function injectStyles() {
    const css = `
.cb-fab {
  position: fixed; bottom: 28px; right: 28px; z-index: 1100;
  width: 60px; height: 60px; border-radius: 50%;
  background: linear-gradient(135deg, var(--orange, #ff6b00), #e55a00);
  color: #fff; border: none; cursor: pointer;
  box-shadow: 0 4px 20px rgba(255,107,0,.5);
  display: flex; align-items: center; justify-content: center;
  transition: transform .2s, box-shadow .2s;
}
.cb-fab:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(255,107,0,.65); }
.cb-fab svg { width: 26px; height: 26px; }
.cb-notif {
  position: absolute; top: -3px; right: -3px;
  background: #ef4444; color: #fff; border-radius: 99px;
  font-size: 11px; font-weight: 700; padding: 2px 6px; line-height: 1.4;
  border: 2px solid #fff;
}

.cb-panel {
  position: fixed; bottom: 100px; right: 28px; z-index: 1099;
  width: 380px; max-width: calc(100vw - 32px);
  background: #fff; border-radius: 18px;
  box-shadow: 0 8px 48px rgba(0,0,0,.2);
  display: flex; flex-direction: column;
  transform: translateY(24px) scale(.95); opacity: 0;
  pointer-events: none; transition: transform .28s cubic-bezier(.34,1.3,.64,1), opacity .22s;
  max-height: 560px; overflow: hidden;
}
.cb-panel.open { transform: none; opacity: 1; pointer-events: auto; }

.cb-header {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px;
  background: linear-gradient(135deg, var(--orange, #ff6b00) 0%, #e55a00 100%);
  border-radius: 18px 18px 0 0; color: #fff; flex-shrink: 0;
}
.cb-avatar {
  width: 38px; height: 38px; border-radius: 50%;
  background: rgba(255,255,255,.25); font-weight: 800;
  font-size: 13px; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; letter-spacing: 0.5px;
}
.cb-header-info { flex: 1; line-height: 1.3; min-width: 0; }
.cb-header-info strong { font-size: 14px; display: block; }
.cb-status { font-size: 11px; opacity: .85; }
.cb-close {
  background: none; border: none; color: #fff; font-size: 18px;
  cursor: pointer; padding: 4px 8px; border-radius: 8px;
  transition: background .15s; flex-shrink: 0;
}
.cb-close:hover { background: rgba(255,255,255,.2); }

.cb-messages {
  flex: 1; overflow-y: auto; padding: 14px 12px;
  display: flex; flex-direction: column; gap: 10px;
  scroll-behavior: smooth;
}
.cb-msg {
  max-width: 88%; padding: 10px 14px; border-radius: 14px;
  font-size: 13.5px; line-height: 1.6;
}
.cb-msg p { margin: 0 0 6px; }
.cb-msg p:last-child { margin-bottom: 0; }
.cb-msg ul, .cb-msg ol { margin: 6px 0 0; padding-left: 18px; }
.cb-msg li { margin-bottom: 5px; }
.cb-msg .cb-closing { font-style: italic; color: #64748b; font-size: 12px; margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 6px; }
.cb-msg-bot {
  background: #f1f5f9; color: #1e293b;
  border-bottom-left-radius: 4px; align-self: flex-start;
}
.cb-msg-user {
  background: linear-gradient(135deg, var(--orange, #ff6b00), #e55a00);
  color: #fff; border-bottom-right-radius: 4px; align-self: flex-end;
}

.cb-typing {
  display: flex; align-items: center; gap: 5px;
  padding: 14px 16px !important;
}
.cb-typing span {
  width: 7px; height: 7px; border-radius: 50%;
  background: #94a3b8; display: inline-block;
  animation: cb-bounce .9s infinite;
}
.cb-typing span:nth-child(2) { animation-delay: .15s; }
.cb-typing span:nth-child(3) { animation-delay: .30s; }
@keyframes cb-bounce {
  0%, 80%, 100% { transform: translateY(0); }
  40% { transform: translateY(-6px); }
}

.cb-quick {
  padding: 0 12px 10px; display: flex; flex-wrap: wrap; gap: 6px;
  flex-shrink: 0;
}
.cb-qr-btn {
  background: #fff; border: 1.5px solid var(--orange, #ff6b00);
  color: var(--orange, #ff6b00); border-radius: 99px;
  padding: 5px 13px; font-size: 12px; cursor: pointer;
  transition: background .15s, color .15s; white-space: nowrap;
}
.cb-qr-btn:hover { background: var(--orange, #ff6b00); color: #fff; }

.cb-input-row {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-top: 1px solid #e2e8f0;
  border-radius: 0 0 18px 18px; flex-shrink: 0;
  background: #fff;
}
#cb-input {
  flex: 1; border: 1.5px solid #e2e8f0; border-radius: 99px;
  padding: 9px 16px; font-size: 13px; outline: none;
  transition: border-color .15s; background: #f8fafc;
}
#cb-input:focus { border-color: var(--orange, #ff6b00); background: #fff; }
.cb-send-btn {
  width: 38px; height: 38px; border-radius: 50%;
  background: linear-gradient(135deg, var(--orange, #ff6b00), #e55a00);
  border: none; cursor: pointer;
  color: #fff; display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: transform .15s, box-shadow .15s;
}
.cb-send-btn:hover { transform: scale(1.08); box-shadow: 0 2px 10px rgba(255,107,0,.4); }
.cb-send-btn svg { width: 16px; height: 16px; }

@media (max-width: 480px) {
  .cb-panel { bottom: 90px; right: 12px; left: 12px; width: auto; max-height: 78dvh; border-radius: 14px 14px 14px 14px; }
  .cb-fab { bottom: 20px; right: 18px; }
}
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ── Init ─────────────────────────────────────────────────────── */
  function init() {
    injectStyles();
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();

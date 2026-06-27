/* ============================================================
   DIASPO'ACTIF — Système de tutoriels interactifs v2
   - Modal Bienvenue (Commencer / Plus tard)
   - Animations : curseur virtuel, spotlight pulsant, clics simulés
   - Voix off via Web Speech API (navigateur natif)
   - Sous-titres synchronisés
   - 18 types de comptes
   - Bouton "Tutoriels" dans la navbar
   ============================================================ */
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     LANGUES & VOIX
  ══════════════════════════════════════════════════════════ */
  const LANGS = {
    fr: { label: '🇫🇷 FR', code: 'fr-FR' },
    en: { label: '🇬🇧 EN', code: 'en-US' },
    es: { label: '🇪🇸 ES', code: 'es-ES' },
    pt: { label: '🇵🇹 PT', code: 'pt-PT' },
    ar: { label: '🇸🇦 AR', code: 'ar-SA' }
  };
  let _lang = localStorage.getItem('da_tuto_lang') || 'fr';

  /* ══════════════════════════════════════════════════════════
     TRADUCTIONS UI
  ══════════════════════════════════════════════════════════ */
  const UI = {
    fr: { commencer:'Commencer', plus_tard:'Plus tard', suivant:'Suivant →', precedent:'← Préc.', passer:'Passer', terminer:'Terminer ✓', voir:'→ Voir', step:'Étape', sur:'sur', voix_on:'🔊 Voix', voix_off:'🔇 Muet' },
    en: { commencer:'Start', plus_tard:'Later', suivant:'Next →', precedent:'← Back', passer:'Skip', terminer:'Finish ✓', voir:'→ Open', step:'Step', sur:'of', voix_on:'🔊 Voice', voix_off:'🔇 Mute' },
    es: { commencer:'Empezar', plus_tard:'Después', suivant:'Siguiente →', precedent:'← Atrás', passer:'Saltar', terminer:'Finalizar ✓', voir:'→ Ver', step:'Paso', sur:'de', voix_on:'🔊 Voz', voix_off:'🔇 Silencio' },
    pt: { commencer:'Começar', plus_tard:'Depois', suivant:'Próximo →', precedent:'← Anterior', passer:'Pular', terminer:'Concluir ✓', voir:'→ Ver', step:'Passo', sur:'de', voix_on:'🔊 Voz', voix_off:'🔇 Mudo' },
    ar: { commencer:'ابدأ', plus_tard:'لاحقاً', suivant:'التالي →', precedent:'→ السابق', passer:'تخطي', terminer:'إنهاء ✓', voir:'→ فتح', step:'خطوة', sur:'من', voix_on:'🔊 صوت', voix_off:'🔇 صامت' }
  };
  function ui(k) { return (UI[_lang] || UI.fr)[k]; }

  /* ══════════════════════════════════════════════════════════
     CONTENU DES TUTORIELS PAR RÔLE (18 types)
     Chaque étape : { el, pos, titre, desc, voice, lien?, badge?, cta? }
  ══════════════════════════════════════════════════════════ */
  const T = {

    /* ─── VISITEUR (non connecté) ─── */
    visiteur: {
      badge: '👋 Visiteur',
      couleur: '#6366f1',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Bienvenue sur Diaspo'Actif !", voice:"Bienvenue sur Diaspo Actif, la plateforme mondiale qui connecte les diasporas.", desc:"La plateforme mondiale qui connecte les diasporas, valorise les talents et accélère le développement.", badge:true },
          { el:'a[href="annuaire.html"]', pos:'bottom', titre:"🔍 L'Annuaire public", voice:"Explorez l'annuaire pour découvrir des milliers d'initiatives et de membres dans le monde.", desc:"Explorez des milliers d'initiatives, de profils et d'organisations dans plus de 28 pays." },
          { el:'a[href="inscription.html"], a[href="login.html"]', pos:'bottom', titre:"🔐 Créer votre compte", voice:"Créez votre compte gratuitement pour accéder à toutes les fonctionnalités.", desc:"Rejoignez gratuitement. Choisissez le type de compte adapté à votre situation.", lien:{href:'inscription.html',label:'Créer un compte'} },
          { el:null, pos:'center', titre:"✅ Rejoignez la communauté !", voice:"Rejoignez des milliers de membres actifs de la diaspora mondiale.", desc:"Déjà des milliers de membres actifs dans 28 pays.", cta:'visiteur' }
        ]
      }
    },

    /* ─── MEMBRE ─── */
    utilisateur: {
      badge: '👤 Membre',
      couleur: '#1e3a8a',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Membre", voice:"Bienvenue dans votre espace Diaspo Actif. Voici votre guide de démarrage.", desc:"Découvrez en 1 minute les fonctionnalités essentielles de votre compte Membre.", badge:true },
          { el:'.user-chip,.avatar', pos:'bottom', titre:"🪪 Votre profil public", voice:"Votre profil public est votre vitrine. Ajoutez une photo, une biographie et vos compétences.", desc:"Ajoutez photo, biographie, titre pro. Un profil complet est 5× plus visible.", lien:{href:'profil.html',label:'Mon profil'} },
          { el:'a[href="fil-actualite.html"]', pos:'bottom', titre:"📰 Le Fil d'actualité", voice:"Le fil d'actualité est le cœur de la communauté. Publiez, commentez, réagissez.", desc:"Publiez vos actualités, commentez, réagissez. Renforcez votre visibilité.", lien:{href:'fil-actualite.html',label:'Ouvrir le Fil'} },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💬 Messagerie privée", voice:"Contactez directement n'importe quel membre ou initiative avec la messagerie privée.", desc:"Contactez membres et initiatives. Démarrez une collaboration en privé.", lien:{href:'messagerie.html',label:'Messagerie'} },
          { el:'a[href="evenements.html"]', pos:'bottom', titre:"📅 Événements", voice:"Découvrez et participez aux événements organisés par la diaspora partout dans le monde.", desc:"Participez aux événements diaspora près de chez vous ou en ligne.", lien:{href:'evenements.html',label:'Voir les événements'} },
          { el:'#oz-fab,.oz-fab,#chatbot-fab', pos:'top', titre:"🤖 O-Z votre assistant", voice:"O-Z est votre assistant intelligent disponible vingt-quatre heures sur vingt-quatre. Posez-lui n'importe quelle question.", desc:"Votre assistant 24h/24 — recherche, aide, navigation, recommandations." },
          { el:null, pos:'center', titre:"✅ Vous êtes prêt !", voice:"Votre espace Membre est prêt. Commencez par compléter votre profil.", desc:"Commencez par votre profil pour être trouvé par la communauté.", cta:'utilisateur' }
        ]
      }
    },

    /* ─── ENTREPRENEUR ─── */
    entrepreneur: {
      badge: '💼 Entrepreneur',
      couleur: '#0f766e',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Entrepreneur", voice:"Bienvenue dans votre espace Entrepreneur sur Diaspo Actif.", desc:"Connectez votre activité à l'écosystème diaspora mondial.", badge:true },
          { el:'.user-chip,.avatar', pos:'bottom', titre:"🏢 Votre profil d'entreprise", voice:"Votre profil entrepreneur présente votre activité, vos marchés cibles et vos besoins.", desc:"Présentez votre activité, secteur, marchés cibles et recherches de partenariats.", lien:{href:'profil.html',label:'Mon profil'} },
          { el:'a[href="offres.html"],a[href="deals.html"]', pos:'bottom', titre:"🤝 Les Deals de collaboration", voice:"Accédez aux deals de collaboration pour trouver des partenaires, prestataires et investisseurs.", desc:"Trouvez partenaires, prestataires, investisseurs. Proposez vos services.", lien:{href:'offres.html',label:'Voir les Deals'} },
          { el:'a[href="fil-actualite.html"]', pos:'bottom', titre:"📢 Vos publications", voice:"Publiez vos actualités, vos offres et vos appels à collaboration.", desc:"Diffusez vos actualités, offres et appels à collaboration à toute la communauté." },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💬 Messagerie Business", voice:"Gérez vos conversations professionnelles dans la messagerie dédiée.", desc:"Conversations professionnelles centralisées, suivi des échanges.", lien:{href:'messagerie.html',label:'Messagerie'} },
          { el:'#oz-fab,.oz-fab,#chatbot-fab', pos:'top', titre:"🤖 O-Z — assistant business", voice:"O-Z peut vous aider à identifier des opportunités et des partenaires potentiels.", desc:"O-Z identifie pour vous des partenaires, investisseurs et opportunités." },
          { el:null, pos:'center', titre:"✅ Développez votre réseau !", voice:"Votre espace entrepreneur est prêt.", desc:"Démarrez par votre profil d'entreprise et publiez votre premier Deal.", cta:'entrepreneur' }
        ]
      }
    },

    /* ─── ASSOCIATION ─── */
    association: {
      badge: '🤲 Association',
      couleur: '#7c3aed',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Association", voice:"Bienvenue dans votre espace Association sur Diaspo Actif.", desc:"Mobilisez la diaspora autour de vos projets associatifs.", badge:true },
          { el:'.user-chip,.avatar', pos:'bottom', titre:"📋 Votre fiche association", voice:"Complétez votre fiche pour présenter vos missions, vos projets et vos besoins en bénévoles.", desc:"Missions, projets, besoin en bénévoles et ressources. Soyez visible.", lien:{href:'profil.html',label:'Ma fiche'} },
          { el:'a[href="offres.html"]', pos:'bottom', titre:"📢 Recrutez des bénévoles", voice:"Publiez vos appels à bénévoles et touchez des milliers de membres diaspora compétents.", desc:"Appels à bénévoles, dons, mécénat de compétences.", lien:{href:'offres.html',label:'Publier une offre'} },
          { el:'a[href="evenements.html"]', pos:'bottom', titre:"📅 Vos événements", voice:"Organisez et diffusez vos événements, collectes de fonds et webinaires.", desc:"Webinaires, collectes, événements en présentiel ou à distance.", lien:{href:'evenements.html',label:'Créer un événement'} },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💬 Communiquez", voice:"Échangez directement avec vos bénévoles, partenaires et institutions.", desc:"Messagerie directe avec bénévoles, partenaires, institutions.", lien:{href:'messagerie.html',label:'Messagerie'} },
          { el:null, pos:'center', titre:"✅ Mobilisez la diaspora !", voice:"Votre espace association est prêt.", desc:"Commencez par compléter votre fiche et publier votre premier appel.", cta:'association' }
        ]
      }
    },

    /* ─── INITIATIVE ─── */
    initiative: {
      badge: '🌱 Initiative',
      couleur: '#15803d',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Initiative", voice:"Bienvenue dans votre espace Initiative sur Diaspo Actif.", desc:"Gérez et développez votre initiative au sein de l'écosystème diaspora.", badge:true },
          { el:'a[href="dashboard-initiative.html"]', pos:'bottom', titre:"⚙️ Tableau de bord", voice:"Votre tableau de bord centralise toutes vos activités, statistiques et publications.", desc:"Statistiques, publications, candidatures, messages — tout centralisé.", lien:{href:'dashboard-initiative.html',label:'Mon tableau de bord'} },
          { el:null, pos:'center', titre:"📋 Votre fiche initiative", voice:"Complétez votre fiche avec vos domaines d'action, vos pays d'intervention et vos objectifs.", desc:"Domaines, pays, objectifs. Une fiche complète multiplie votre visibilité.", lien:{href:'dashboard-initiative.html',label:'Compléter ma fiche'} },
          { el:'a[href="offres.html"]', pos:'bottom', titre:"📢 Offres & Opportunités", voice:"Publiez des offres d'emploi, de bénévolat et de partenariat pour votre initiative.", desc:"Emplois, bénévolat, partenariats — diffusés à toute la diaspora.", lien:{href:'offres.html',label:'Créer une offre'} },
          { el:'a[href="evenements.html"]', pos:'bottom', titre:"📅 Vos événements", voice:"Organisez et promouvez vos événements auprès des membres ciblés.", desc:"Webinaires, ateliers, rencontres — agenda partagé avec la communauté.", lien:{href:'evenements.html',label:'Créer un événement'} },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💬 Candidatures & Messages", voice:"Recevez et gérez les candidatures directement dans votre messagerie.", desc:"Suivi des candidatures, discussions avec partenaires.", lien:{href:'messagerie.html',label:'Messagerie'} },
          { el:'#oz-fab,.oz-fab,#chatbot-fab', pos:'top', titre:"🤖 O-Z pour votre initiative", voice:"O-Z peut vous aider à rédiger des offres et trouver les bons profils.", desc:"Rédaction d'offres, recherche de profils, aide à la navigation." },
          { el:null, pos:'center', titre:"✅ Votre initiative rayonne !", voice:"Votre espace initiative est prêt.", desc:"Commencez par le tableau de bord et publiez votre première offre.", cta:'initiative' }
        ]
      }
    },

    /* ─── DIASPORA (rôle dédié) ─── */
    diaspora: {
      badge: '🌍 Diaspora',
      couleur: '#b45309',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Diaspora", voice:"Bienvenue dans votre espace Diaspora sur Diaspo Actif.", desc:"Votre espace dédié pour rester connecté à vos origines et contribuer au développement.", badge:true },
          { el:'.user-chip,.avatar', pos:'bottom', titre:"🌍 Votre profil diaspora", voice:"Votre profil diaspora présente vos origines, votre parcours et vos compétences disponibles.", desc:"Origines, parcours, compétences. Soyez visible pour les pays d'origine.", lien:{href:'profil.html',label:'Mon profil'} },
          { el:'a[href="annuaire.html"]', pos:'bottom', titre:"🔍 Trouvez vos compatriotes", voice:"Recherchez des membres selon leur pays d'origine, leur ville ou leur domaine de compétence.", desc:"Filtres : pays d'origine, compétences, localisation actuelle." },
          { el:'a[href="offres.html"]', pos:'bottom', titre:"💡 Opportunités de contribution", voice:"Découvrez des missions courtes pour contribuer au développement de votre pays d'origine.", desc:"Missions expertises, investissements, transfert de compétences." },
          { el:'a[href="evenements.html"]', pos:'bottom', titre:"📅 Événements diaspora", voice:"Participez aux événements communautaires organisés partout dans le monde.", desc:"Rencontres, forums, événements culturels de la diaspora." },
          { el:null, pos:'center', titre:"✅ Restez connecté à vos racines !", voice:"Votre espace diaspora est prêt.", desc:"Commencez par compléter votre profil et rejoindre votre communauté d'origine.", cta:'diaspora' }
        ]
      }
    },

    /* ─── COMMUNE ─── */
    commune: {
      badge: '🏘️ Commune',
      couleur: '#0369a1',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Commune", voice:"Bienvenue dans l'espace institutionnel de votre commune sur Diaspo Actif.", desc:"Connectez votre commune à sa diaspora pour accélérer le développement local.", badge:true },
          { el:'a[href="dashboard-collectivite.html"]', pos:'bottom', titre:"📊 Tableau de bord", voice:"Votre tableau de bord présente les statistiques de la diaspora liée à votre territoire.", desc:"Statistiques diaspora, indicateurs d'engagement, rapports automatisés.", lien:{href:'dashboard-collectivite.html',label:'Mon tableau de bord'} },
          { el:null, pos:'center', titre:"🌍 Votre profil institutionnel", voice:"Présentez les services de votre commune, vos projets de développement et vos partenariats.", desc:"Services communaux, projets de développement, programmes diaspora." },
          { el:'a[href="sondages.html"]', pos:'bottom', titre:"🗳️ Consulter votre diaspora", voice:"Lancez des consultations pour recueillir l'avis de votre diaspora sur vos projets.", desc:"Sondages, consultations citoyennes, collecte d'expertises." },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💬 Communication directe", voice:"Communiquez directement avec les membres de votre diaspora et vos partenaires.", desc:"Messagerie institutionnelle, communication ciblée." },
          { el:null, pos:'center', titre:"✅ Engagez votre diaspora !", voice:"Votre espace commune est prêt.", desc:"Commencez par compléter votre profil et lancer votre première consultation.", cta:'collectivite' }
        ]
      }
    },

    /* ─── RÉGION ─── */
    region: {
      badge: '🗺️ Région',
      couleur: '#0369a1',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Région", voice:"Bienvenue dans l'espace institutionnel de votre région sur Diaspo Actif.", desc:"Mobilisez la diaspora régionale pour le développement de votre territoire.", badge:true },
          { el:'a[href="dashboard-collectivite.html"]', pos:'bottom', titre:"📊 Observatoire Régional", voice:"Analysez les données de la diaspora sur votre région : compétences, investissements potentiels.", desc:"Données diaspora par région, secteurs, compétences disponibles.", lien:{href:'dashboard-collectivite.html',label:'Tableau de bord'} },
          { el:'a[href="statistiques.html"]', pos:'bottom', titre:"📡 Observatoire Diaspora", voice:"Accédez aux statistiques détaillées de la diaspora liée à votre région.", desc:"Analyses approfondies, cartographie de la diaspora régionale." },
          { el:'a[href="evenements.html"]', pos:'bottom', titre:"📅 Forums et Investissements", voice:"Organisez des forums d'investissement et des rencontres business avec la diaspora.", desc:"Forums investissement, rencontres entrepreneurs, salons diaspora." },
          { el:null, pos:'center', titre:"✅ Votre région se connecte !", voice:"Votre espace région est prêt.", desc:"Commencez par l'observatoire diaspora pour analyser votre territoire.", cta:'collectivite' }
        ]
      }
    },

    /* ─── PREFECTURE ─── */
    prefecture: {
      badge: '🏛️ Préfecture',
      couleur: '#0369a1',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Préfecture", voice:"Bienvenue dans l'espace institutionnel de votre préfecture sur Diaspo Actif.", desc:"Coordonnez les politiques diaspora à l'échelle de votre préfecture.", badge:true },
          { el:'a[href="dashboard-collectivite.html"]', pos:'bottom', titre:"📊 Tableau de bord préfectoral", voice:"Centralisez la gestion des relations avec la diaspora au niveau préfectoral.", desc:"Vue centralisée : diaspora, communes, initiatives, données.", lien:{href:'dashboard-collectivite.html',label:'Tableau de bord'} },
          { el:'a[href="sondages.html"]', pos:'bottom', titre:"🗳️ Consultations officielles", voice:"Menez des consultations officielles auprès de la diaspora de votre préfecture.", desc:"Consultations diaspora, sondages officiels, collecte d'avis citoyens." },
          { el:null, pos:'center', titre:"✅ Coordonnez les politiques diaspora !", voice:"Votre espace préfecture est prêt.", desc:"Démarrez par le tableau de bord pour une vue d'ensemble.", cta:'collectivite' }
        ]
      }
    },

    /* ─── MINISTERE ─── */
    ministere: {
      badge: '🏦 Ministère',
      couleur: '#1e3a8a',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Ministère", voice:"Bienvenue dans l'espace officiel de votre ministère sur Diaspo Actif.", desc:"Pilotez la stratégie nationale diaspora depuis votre espace ministériel.", badge:true },
          { el:'a[href="dashboard-collectivite.html"]', pos:'bottom', titre:"📊 Tableau de bord national", voice:"Pilotez la stratégie diaspora avec des données nationales en temps réel.", desc:"Données nationales : compétences, investissements, secteurs, cartographie.", lien:{href:'dashboard-collectivite.html',label:'Tableau de bord'} },
          { el:'a[href="statistiques.html"]', pos:'bottom', titre:"📡 Observatoire national", voice:"Analysez les données agrégées de la diaspora nationale pour orienter vos politiques.", desc:"Statistiques nationales, tendances, rapports pour décisions stratégiques." },
          { el:null, pos:'center', titre:"📢 Communications officielles", voice:"Diffusez des communications officielles directement à la diaspora nationale.", desc:"Annonces officielles, politiques d'accueil, programmes d'investissement." },
          { el:null, pos:'center', titre:"✅ Pilotez la stratégie nationale !", voice:"Votre espace ministère est prêt.", desc:"Commencez par l'observatoire national pour analyser l'état de la diaspora.", cta:'ministere' }
        ]
      }
    },

    /* ─── AMBASSADE ─── */
    ambassade: {
      badge: '🏴 Ambassade',
      couleur: '#991b1b',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Ambassade", voice:"Bienvenue dans l'espace officiel de votre ambassade sur Diaspo Actif.", desc:"Gérez les relations avec la diaspora depuis votre pays d'accréditation.", badge:true },
          { el:'a[href="dashboard-collectivite.html"]', pos:'bottom', titre:"📊 Tableau de bord consulaire", voice:"Suivez les données de la diaspora dans votre pays d'accréditation.", desc:"Données diaspora locale, services consulaires, événements communautaires.", lien:{href:'dashboard-collectivite.html',label:'Tableau de bord'} },
          { el:'a[href="evenements.html"]', pos:'bottom', titre:"📅 Événements communautaires", voice:"Organisez des événements pour la communauté expatriée dans votre pays.", desc:"Journées nationales, forums, événements culturels et officiels." },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💬 Services à la diaspora", voice:"Communiquez avec les membres de la diaspora pour vos services consulaires.", desc:"Messagerie officielle, information consulaire, appels à l'expertise." },
          { el:null, pos:'center', titre:"✅ Servez la diaspora !", voice:"Votre espace ambassade est prêt.", desc:"Commencez par compléter votre profil et publier vos services consulaires.", cta:'ambassade' }
        ]
      }
    },

    /* ─── CONSULAT ─── */
    consulat: {
      badge: '🏛️ Consulat',
      couleur: '#991b1b',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Consulat", voice:"Bienvenue dans l'espace officiel de votre consulat sur Diaspo Actif.", desc:"Services consulaires et lien avec la diaspora locale.", badge:true },
          { el:'a[href="dashboard-collectivite.html"]', pos:'bottom', titre:"📊 Services consulaires", voice:"Centralisez vos services et communications avec la communauté expatriée.", desc:"Gestion des services, communication, événements, données locales.", lien:{href:'dashboard-collectivite.html',label:'Tableau de bord'} },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💬 Contact direct", voice:"Communiquez directement avec les membres de la diaspora dans votre juridiction.", desc:"Messagerie directe avec les expatriés de votre zone consulaire." },
          { el:null, pos:'center', titre:"✅ Connectez-vous à votre diaspora !", voice:"Votre espace consulat est prêt.", desc:"Démarrez par le tableau de bord et publiez vos informations consulaires.", cta:'ambassade' }
        ]
      }
    },

    /* ─── ÉQUIPEMENTIER ─── */
    equipementier: {
      badge: '🏗️ Équipementier',
      couleur: '#92400e',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Équipementier", voice:"Bienvenue dans votre espace Équipementier sur Diaspo Actif.", desc:"Présentez vos solutions aux marchés diaspora et aux pays en développement.", badge:true },
          { el:'.user-chip,.avatar', pos:'bottom', titre:"🏗️ Votre vitrine", voice:"Présentez vos équipements, solutions et références projets à la communauté.", desc:"Catalogue produits, références projets, domaines d'intervention.", lien:{href:'profil.html',label:'Ma vitrine'} },
          { el:'a[href="offres.html"]', pos:'bottom', titre:"📢 Appels d'offres", voice:"Répondez aux appels d'offres publiés par les initiatives et les collectivités.", desc:"Appels d'offres publics et privés de la diaspora et des institutions." },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💼 Développement commercial", voice:"Échangez directement avec vos prospects et partenaires potentiels.", desc:"Discussions commerciales, partenariats, négociations directes." },
          { el:null, pos:'center', titre:"✅ Développez vos marchés !", voice:"Votre espace équipementier est prêt.", desc:"Commencez par votre vitrine et répondez aux premiers appels d'offres.", cta:'entrepreneur' }
        ]
      }
    },

    /* ─── INVESTISSEUR ─── */
    investisseur: {
      badge: '💰 Investisseur',
      couleur: '#065f46',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Investisseur", voice:"Bienvenue dans votre espace Investisseur sur Diaspo Actif.", desc:"Découvrez les meilleures opportunités d'investissement dans l'écosystème diaspora.", badge:true },
          { el:'.user-chip,.avatar', pos:'bottom', titre:"💰 Votre profil investisseur", voice:"Votre profil présente vos secteurs d'intérêt et vos critères d'investissement.", desc:"Secteurs cibles, tickets d'investissement, zones géographiques.", lien:{href:'profil.html',label:'Mon profil'} },
          { el:'a[href="offres.html"],a[href="deals.html"]', pos:'bottom', titre:"📊 Deal Flow", voice:"Accédez aux opportunités d'investissement sélectionnées dans l'écosystème diaspora.", desc:"Projets à financer, startups, infrastructures, immobilier diaspora." },
          { el:'a[href="annuaire.html"]', pos:'bottom', titre:"🔍 Due diligence", voice:"Explorez les profils et initiatives avant d'engager une conversation d'investissement.", desc:"Analyse des porteurs de projet, historique, références, réseaux." },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💬 Approche directe", voice:"Contactez directement les porteurs de projet qui correspondent à vos critères.", desc:"Discussions directes, NDA, partage de documents sécurisé." },
          { el:null, pos:'center', titre:"✅ Investissez dans la diaspora !", voice:"Votre espace investisseur est prêt.", desc:"Démarrez par le Deal Flow pour découvrir les meilleures opportunités.", cta:'investisseur' }
        ]
      }
    },

    /* ─── PARTENAIRE ─── */
    partenaire: {
      badge: '🏅 Partenaire Officiel',
      couleur: '#b45309',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace Partenaire Officiel", voice:"Bienvenue dans votre espace Partenaire Officiel sur Diaspo Actif.", desc:"Votre statut de Partenaire Officiel vous offre une visibilité prioritaire.", badge:true },
          { el:'.user-chip,.avatar', pos:'bottom', titre:"🏅 Votre fiche partenaire", voice:"Votre fiche partenaire est mise en avant dans toute la plateforme avec votre badge officiel.", desc:"Badge officiel, mise en avant homepage, priorité dans l'annuaire.", lien:{href:'profil.html',label:'Ma fiche'} },
          { el:'a[href="fil-actualite.html"]', pos:'bottom', titre:"📢 Publication sponsorisée", voice:"Vos publications apparaissent en priorité dans le fil d'actualité de la communauté.", desc:"Publications sponsorisées, visibilité renforcée auprès des membres." },
          { el:'a[href="evenements.html"]', pos:'bottom', titre:"📅 Événements co-brandés", voice:"Co-organisez des événements avec Diaspo Actif pour toucher des milliers de membres.", desc:"Événements co-brandés, webinaires exclusifs, ateliers partenaires." },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💼 Accès premium", voice:"Contactez directement toute la communauté sans restriction.", desc:"Messagerie illimitée, contacts directs avec toute la communauté." },
          { el:null, pos:'center', titre:"✅ Votre partenariat est actif !", voice:"Votre espace Partenaire Officiel est prêt. Profitez de votre visibilité premium.", desc:"Démarrez par votre fiche partenaire et votre première publication.", cta:'partenaire' }
        ]
      }
    },

    /* ─── ADMINISTRATEUR ─── */
    administrateur: {
      badge: '⚙️ Administrateur',
      couleur: '#374151',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Espace Administrateur", voice:"Bienvenue dans l'espace d'administration de Diaspo Actif.", desc:"Vous avez accès à l'ensemble des outils de gestion et de modération.", badge:true },
          { el:'a[href="dashboard-administrateur.html"]', pos:'bottom', titre:"🖥️ Dashboard principal", voice:"Le dashboard centralise toutes vos actions administratives en temps réel.", desc:"Statistiques globales, alertes, modération, actions rapides.", lien:{href:'dashboard-administrateur.html',label:'Ouvrir le Dashboard'} },
          { el:null, pos:'center', titre:"👥 Gestion des utilisateurs", voice:"Consultez, vérifiez, suspendez ou modifiez les comptes depuis le dashboard.", desc:"Profils, rôles, vérifications, suspensions, historique d'activité.", lien:{href:'dashboard-administrateur.html',label:'Gérer les utilisateurs'} },
          { el:null, pos:'center', titre:"🏅 Partenaires Officiels", voice:"Attribuez et gérez les statuts de Partenaires Officiels et leur visibilité.", desc:"Attribution, niveaux de visibilité, priorité, expiration." },
          { el:null, pos:'center', titre:"🤝 Deal Master", voice:"Supervisez et validez les deals de la plateforme, gérez les litiges.", desc:"Validation, modération, litiges, règles de la marketplace." },
          { el:null, pos:'center', titre:"💬 Modération témoignages", voice:"Approuvez ou refusez les témoignages avant publication avec le score automatique.", desc:"Score pertinence auto, approbation/refus, publication homepage." },
          { el:'#oz-fab,.oz-fab,#chatbot-fab', pos:'top', titre:"🤖 O-Z admin", voice:"O-Z dispose d'une interface admin pour rechercher des utilisateurs et des données.", desc:"Recherche utilisateurs, statistiques rapides, aide à la modération." },
          { el:null, pos:'center', titre:"✅ La plateforme est entre vos mains !", voice:"Votre espace administrateur est prêt.", desc:"Commencez par le Dashboard pour une vue complète de l'activité.", cta:'administrateur' }
        ]
      }
    },

    /* ─── SUPER ADMINISTRATEUR ─── */
    super_administrateur: {
      badge: '👑 Super Admin',
      couleur: '#1e1e2e',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Espace Super Administrateur", voice:"Bienvenue, Super Administrateur. Vous avez les accès les plus étendus de la plateforme.", desc:"Accès complet : configuration système, rôles, partenaires, données globales.", badge:true },
          { el:'a[href="dashboard-administrateur.html"]', pos:'bottom', titre:"🖥️ Dashboard global", voice:"Votre dashboard affiche toutes les métriques globales de la plateforme en temps réel.", desc:"Métriques globales, alertes système, performances, logs d'activité.", lien:{href:'dashboard-administrateur.html',label:'Dashboard global'} },
          { el:null, pos:'center', titre:"⚙️ Configuration système", voice:"Accédez aux paramètres avancés de la plateforme, règles métier et configurations.", desc:"Paramètres avancés, règles métier, features flags, intégrations." },
          { el:null, pos:'center', titre:"👑 Gestion des rôles", voice:"Créez, modifiez et attribuez tous les rôles de la plateforme.", desc:"Création et gestion de tous les types de comptes et leurs droits." },
          { el:null, pos:'center', titre:"✅ Vous contrôlez tout !", voice:"Votre espace Super Administrateur est actif.", desc:"Commencez par le Dashboard global pour surveiller l'état de la plateforme.", cta:'super_administrateur' }
        ]
      }
    },

    /* ─── COLLECTIVITÉ (fallback pour commune/region/prefecture/ministere) ─── */
    collectivite: {
      badge: '🏛️ Collectivité',
      couleur: '#0369a1',
      steps: {
        fr: [
          { el:null, pos:'center', titre:"Votre espace institutionnel", voice:"Bienvenue dans votre espace institutionnel sur Diaspo Actif.", desc:"Connectez votre institution à la diaspora mondiale.", badge:true },
          { el:'a[href="dashboard-collectivite.html"],a[href="dashboard-institutionnel.html"]', pos:'bottom', titre:"📊 Tableau de bord", voice:"Votre tableau de bord présente les données clés de la diaspora sur vos territoires.", desc:"Statistiques, indicateurs d'engagement, rapports automatisés.", lien:{href:'dashboard-collectivite.html',label:'Tableau de bord'} },
          { el:'a[href="sondages.html"]', pos:'bottom', titre:"🗳️ Consultations", voice:"Lancez des consultations citoyennes auprès de votre diaspora.", desc:"Sondages, consultations, collecte d'expertises diaspora." },
          { el:'a[href="statistiques.html"]', pos:'bottom', titre:"📡 Observatoire Diaspora", voice:"Analysez les données de la diaspora liée à votre territoire.", desc:"Données anonymisées, tendances, cartographie, secteurs." },
          { el:'a[href="messagerie.html"]', pos:'bottom', titre:"💬 Communication institutionnelle", voice:"Communiquez directement avec les initiatives et membres influents.", desc:"Messagerie officielle, partenariats, projets communs." },
          { el:null, pos:'center', titre:"✅ Engagez votre diaspora !", voice:"Votre espace institutionnel est prêt.", desc:"Commencez par le tableau de bord pour une vue d'ensemble.", cta:'collectivite' }
        ]
      }
    }
  };

  /* Alias de rôles → clé du tutoriel */
  const ROLE_MAP = {
    utilisateur:'utilisateur', membre:'utilisateur', entrepreneur:'entrepreneur',
    association:'association', initiative:'initiative', diaspora:'diaspora',
    commune:'commune', region:'region', prefecture:'prefecture',
    ministere:'ministere', ambassade:'ambassade', consulat:'consulat',
    equipementier:'equipementier', investisseur:'investisseur',
    partenaire:'partenaire', administrateur:'administrateur',
    super_administrateur:'super_administrateur', collectivite:'collectivite',
    default:'utilisateur'
  };

  /* CTA finales par rôle */
  const CTA = {
    visiteur:           [{href:'inscription.html',label:'🚀 Créer mon compte'},{href:'annuaire.html',label:'🔍 Explorer'}],
    utilisateur:        [{href:'profil.html',label:'✏️ Mon profil'},{href:'fil-actualite.html',label:'📰 Le Fil'}],
    entrepreneur:       [{href:'profil.html',label:'🏢 Mon profil'},{href:'offres.html',label:'🤝 Les Deals'}],
    association:        [{href:'profil.html',label:'📋 Ma fiche'},{href:'offres.html',label:'📢 Publier'}],
    initiative:         [{href:'dashboard-initiative.html',label:'⚙️ Mon tableau de bord'},{href:'offres.html',label:'📢 Créer une offre'}],
    diaspora:           [{href:'profil.html',label:'🌍 Mon profil'},{href:'annuaire.html',label:'🔍 Ma communauté'}],
    collectivite:       [{href:'dashboard-collectivite.html',label:'📊 Mon tableau de bord'},{href:'sondages.html',label:'🗳️ Consultation'}],
    ministere:          [{href:'dashboard-collectivite.html',label:'📊 Tableau de bord'},{href:'statistiques.html',label:'📡 Observatoire'}],
    ambassade:          [{href:'dashboard-collectivite.html',label:'📊 Tableau de bord'},{href:'evenements.html',label:'📅 Événements'}],
    entrepreneur:       [{href:'profil.html',label:'🏢 Mon profil'},{href:'offres.html',label:'📢 Mes deals'}],
    investisseur:       [{href:'profil.html',label:'💰 Mon profil'},{href:'offres.html',label:'📊 Deal Flow'}],
    partenaire:         [{href:'profil.html',label:'🏅 Ma fiche'},{href:'fil-actualite.html',label:'📢 Publier'}],
    administrateur:     [{href:'dashboard-administrateur.html',label:'🖥️ Dashboard'},{href:'annuaire.html',label:'👥 Membres'}],
    super_administrateur:[{href:'dashboard-administrateur.html',label:'👑 Dashboard global'},{href:'annuaire.html',label:'⚙️ Configuration'}]
  };

  function getSteps(role) {
    const key = ROLE_MAP[role] || ROLE_MAP.default;
    const tuto = T[key] || T.utilisateur;
    const langSteps = (tuto.steps[_lang] || tuto.steps.fr);
    return { steps: langSteps, meta: tuto };
  }

  /* ══════════════════════════════════════════════════════════
     CSS — styles de l'overlay, animations, curseur virtuel
  ══════════════════════════════════════════════════════════ */
  function injectStyles() {
    if (document.getElementById('da-demo-style')) return;
    const s = document.createElement('style');
    s.id = 'da-demo-style';
    s.textContent = `
      /* ── Overlay global ── */
      #da-demo-overlay{display:none;position:fixed;inset:0;z-index:99990;pointer-events:none;}
      #da-demo-backdrop{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:99991;pointer-events:all;backdrop-filter:blur(2px);}

      /* ── Spotlight pulsant ── */
      #da-demo-spotlight{
        position:fixed;border-radius:12px;z-index:99992;pointer-events:none;
        box-shadow:0 0 0 3px rgba(99,102,241,.9),0 0 0 6px rgba(99,102,241,.35),0 0 0 9999px rgba(2,6,23,.72);
        transition:all .4s cubic-bezier(.4,0,.2,1);
        animation:da-pulse 2s ease-in-out infinite;
      }
      @keyframes da-pulse{0%,100%{box-shadow:0 0 0 3px rgba(99,102,241,.9),0 0 0 6px rgba(99,102,241,.35),0 0 0 9999px rgba(2,6,23,.72);}
        50%{box-shadow:0 0 0 3px rgba(99,102,241,1),0 0 0 14px rgba(99,102,241,.2),0 0 0 9999px rgba(2,6,23,.72);}}

      /* ── Curseur virtuel ── */
      #da-virtual-cursor{
        position:fixed;width:24px;height:24px;z-index:99998;pointer-events:none;
        transform:translate(-4px,-4px);transition:all .5s cubic-bezier(.4,0,.2,1);
        filter:drop-shadow(0 2px 4px rgba(0,0,0,.5));
        display:none;
      }
      #da-virtual-cursor svg{width:24px;height:24px;}

      /* ── Flèche animée ── */
      #da-demo-arrow{
        position:fixed;z-index:99993;pointer-events:none;display:none;
        animation:da-bounce .8s ease-in-out infinite;
      }
      @keyframes da-bounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}

      /* ── Clic simulé ── */
      .da-click-ripple{
        position:fixed;width:36px;height:36px;border-radius:50%;z-index:99994;pointer-events:none;
        background:rgba(99,102,241,.4);transform:translate(-50%,-50%) scale(0);
        animation:da-ripple .6s ease-out forwards;
      }
      @keyframes da-ripple{0%{transform:translate(-50%,-50%) scale(0);opacity:1;}100%{transform:translate(-50%,-50%) scale(2.5);opacity:0;}}

      /* ── Card tutoriel ── */
      #da-demo-card{
        position:fixed;background:#fff;border-radius:20px;
        padding:22px 22px 18px;width:min(360px,92vw);
        box-shadow:0 32px 100px rgba(0,0,0,.35),0 0 0 1px rgba(0,0,0,.06);
        z-index:99999;pointer-events:all;
        transition:top .4s cubic-bezier(.4,0,.2,1),left .4s cubic-bezier(.4,0,.2,1),bottom .4s cubic-bezier(.4,0,.2,1);
        animation:da-card-in .3s cubic-bezier(.34,1.56,.64,1);
      }
      @keyframes da-card-in{from{opacity:0;transform:scale(.92) translateY(8px);}to{opacity:1;transform:scale(1) translateY(0);}}
      #da-demo-card-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;}
      #da-demo-progress{display:flex;gap:5px;align-items:center;flex:1;}
      .da-dot{width:7px;height:7px;border-radius:50%;background:#e2e8f0;transition:all .25s;}
      .da-dot.active{background:var(--da-color,#1e3a8a);transform:scale(1.3);}
      .da-dot.done{background:var(--da-color,#1e3a8a);opacity:.4;}
      #da-demo-lang-select{font-size:11px;border:1px solid #e2e8f0;border-radius:6px;padding:2px 6px;background:#f8fafc;cursor:pointer;color:#475569;}
      #da-demo-mute-btn{background:none;border:none;font-size:12px;cursor:pointer;color:#94a3b8;padding:2px 6px;border-radius:6px;border:1px solid #e2e8f0;}
      #da-demo-mute-btn:hover{background:#f1f5f9;}
      #da-demo-badge-wrap{margin-bottom:8px;}
      #da-demo-badge{display:inline-block;border-radius:7px;padding:3px 10px;font-size:11px;font-weight:700;letter-spacing:.3px;color:#fff;}
      #da-demo-step-label{font-size:11px;color:#94a3b8;margin-bottom:2px;}
      #da-demo-title{font-size:15px;font-weight:900;color:#0D1B2A;margin:0 0 7px;line-height:1.3;}
      #da-demo-desc{font-size:12.5px;color:#475569;line-height:1.65;margin:0 0 10px;}

      /* ── Sous-titres (voix sync) ── */
      #da-demo-subtitle{
        position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        background:rgba(0,0,0,.82);color:#fff;border-radius:10px;
        padding:8px 18px;font-size:13px;font-weight:500;line-height:1.5;
        z-index:99999;max-width:min(600px,90vw);text-align:center;
        display:none;pointer-events:none;
        box-shadow:0 4px 20px rgba(0,0,0,.4);
      }

      /* ── Lien contextuel ── */
      #da-demo-lien-wrap{margin-bottom:8px;}
      #da-demo-lien{display:inline-flex;align-items:center;gap:6px;background:#f0f9ff;border:1.5px solid #bae6fd;color:#0369a1;border-radius:8px;padding:7px 13px;font-size:12px;font-weight:700;text-decoration:none;transition:background .15s;}
      #da-demo-lien:hover{background:#e0f2fe;}

      /* ── CTA finale ── */
      #da-demo-cta-block{margin-bottom:10px;display:flex;flex-wrap:wrap;gap:8px;}
      .da-cta-btn{display:inline-block;border-radius:9px;padding:9px 16px;font-size:12px;font-weight:700;text-decoration:none;border:none;cursor:pointer;transition:opacity .15s;}
      .da-cta-btn:hover{opacity:.85;}
      .da-cta-p{color:#fff;}
      .da-cta-s{background:#f0fdf4;color:#15803d;border:1.5px solid #bbf7d0;}

      /* ── Navigation ── */
      #da-demo-nav{display:flex;justify-content:space-between;align-items:center;padding-top:13px;border-top:1px solid #f1f5f9;}
      #da-demo-skip{background:none;border:none;color:#94a3b8;font-size:12px;cursor:pointer;text-decoration:underline;padding:0;}
      #da-demo-skip:hover{color:#64748b;}
      .da-nav-btns{display:flex;gap:8px;}
      #da-demo-prev,#da-demo-next{border:none;border-radius:8px;padding:8px 16px;font-size:13px;font-weight:700;cursor:pointer;transition:background .15s;}
      #da-demo-prev{background:#f1f5f9;color:#475569;}
      #da-demo-prev:hover{background:#e2e8f0;}
      #da-demo-next{color:#fff;}
      #da-demo-next:hover{filter:brightness(1.1);}

      /* ── Bouton "Tutoriels" navbar ── */
      .da-revoir-btn{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,.1);border:1.5px solid rgba(255,255,255,.25);color:#fff;border-radius:8px;padding:5px 11px;font-size:12px;font-weight:600;cursor:pointer;text-decoration:none;transition:background .15s;}
      .da-revoir-btn:hover{background:rgba(255,255,255,.2);}

      /* ── Modal Bienvenue ── */
      #da-welcome-modal{display:none;position:fixed;inset:0;z-index:99990;align-items:center;justify-content:center;background:rgba(2,6,23,.75);backdrop-filter:blur(4px);}
      #da-welcome-modal.show{display:flex;}
      #da-welcome-box{background:#fff;border-radius:24px;padding:36px 32px;max-width:460px;width:92%;text-align:center;box-shadow:0 40px 120px rgba(0,0,0,.3);animation:da-card-in .35s cubic-bezier(.34,1.56,.64,1);}
      #da-welcome-logo{font-size:48px;margin-bottom:12px;}
      #da-welcome-box h2{font-size:22px;font-weight:900;color:#0D1B2A;margin:0 0 10px;}
      #da-welcome-box p{font-size:14px;color:#475569;line-height:1.65;margin:0 0 24px;}
      .da-welcome-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}
      #da-welcome-start{background:#1e3a8a;color:#fff;border:none;border-radius:12px;padding:13px 28px;font-size:15px;font-weight:800;cursor:pointer;transition:background .15s;}
      #da-welcome-start:hover{background:#1e40af;}
      #da-welcome-later{background:#f1f5f9;color:#475569;border:none;border-radius:12px;padding:13px 22px;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s;}
      #da-welcome-later:hover{background:#e2e8f0;}
    `;
    document.head.appendChild(s);
  }

  /* ══════════════════════════════════════════════════════════
     WEB SPEECH API — voix off
  ══════════════════════════════════════════════════════════ */
  let _muted = localStorage.getItem('da_tuto_muted') === '1';
  let _currentUtter = null;

  function speak(text, onEnd) {
    if (!window.speechSynthesis || _muted || !text) { if (onEnd) onEnd(); return; }
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = (LANGS[_lang] || LANGS.fr).code;
    utter.rate = 1.05;
    utter.pitch = 1.0;
    utter.onend = onEnd || null;
    _currentUtter = utter;
    /* Afficher sous-titres */
    const sub = document.getElementById('da-demo-subtitle');
    if (sub) { sub.textContent = text; sub.style.display = 'block'; }
    window.speechSynthesis.speak(utter);
  }

  function stopSpeech() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    const sub = document.getElementById('da-demo-subtitle');
    if (sub) sub.style.display = 'none';
  }

  /* ══════════════════════════════════════════════════════════
     ANIMATIONS — curseur, flèche, clic
  ══════════════════════════════════════════════════════════ */
  function ensureCursor() {
    let c = document.getElementById('da-virtual-cursor');
    if (!c) {
      c = document.createElement('div');
      c.id = 'da-virtual-cursor';
      c.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><path d="M5 3l14 9-7 1.5L9 21 5 3z" fill="white" stroke="#1e3a8a" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      document.body.appendChild(c);
    }
    return c;
  }

  function animateCursorTo(targetEl, cb) {
    const cursor = ensureCursor();
    cursor.style.display = 'block';
    if (!targetEl) { if (cb) setTimeout(cb, 200); return; }
    const r = targetEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top  + r.height / 2;
    cursor.style.left = cx + 'px';
    cursor.style.top  = cy + 'px';
    setTimeout(() => {
      simulateClick(cx, cy);
      if (cb) setTimeout(cb, 400);
    }, 600);
  }

  function simulateClick(x, y) {
    const rip = document.createElement('div');
    rip.className = 'da-click-ripple';
    rip.style.left = x + 'px';
    rip.style.top  = y + 'px';
    document.body.appendChild(rip);
    setTimeout(() => rip.remove(), 700);
  }

  function ensureArrow() {
    let a = document.getElementById('da-demo-arrow');
    if (!a) {
      a = document.createElement('div');
      a.id = 'da-demo-arrow';
      a.innerHTML = '⬇️';
      a.style.fontSize = '22px';
      document.body.appendChild(a);
    }
    return a;
  }

  function showArrow(targetEl) {
    const arrow = ensureArrow();
    if (!targetEl) { arrow.style.display = 'none'; return; }
    const r = targetEl.getBoundingClientRect();
    arrow.style.display = 'block';
    arrow.style.left = (r.left + r.width/2 - 11) + 'px';
    arrow.style.top  = (r.top - 36) + 'px';
  }

  /* ══════════════════════════════════════════════════════════
     SPOTLIGHT & POSITIONNEMENT
  ══════════════════════════════════════════════════════════ */
  function findEl(selector) {
    if (!selector) return null;
    for (const sel of selector.split(',').map(s => s.trim())) {
      try { const el = document.querySelector(sel); if (el) return el; } catch(e) {}
    }
    return null;
  }

  function spotlightEl(sp, targetEl) {
    if (!targetEl) { sp.style.display = 'none'; return; }
    const r = targetEl.getBoundingClientRect(), p = 10;
    Object.assign(sp.style, {
      display:'block', left:(r.left-p)+'px', top:(r.top-p)+'px',
      width:(r.width+p*2)+'px', height:(r.height+p*2)+'px'
    });
  }

  function positionCard(card, targetEl, pos) {
    card.style.transform = 'none';
    card.style.top = card.style.left = card.style.bottom = card.style.right = 'auto';
    if (!targetEl || pos === 'center') {
      card.style.top  = '50%'; card.style.left = '50%';
      card.style.transform = 'translate(-50%,-50%)'; return;
    }
    const r = targetEl.getBoundingClientRect(), cw = 380, ch = 260;
    const lft = Math.max(10, Math.min(r.left, window.innerWidth - cw - 10));
    if (pos === 'bottom' && r.bottom + ch + 16 < window.innerHeight) {
      card.style.top = (r.bottom + 14) + 'px'; card.style.left = lft + 'px';
    } else {
      card.style.bottom = (window.innerHeight - r.top + 14) + 'px'; card.style.left = lft + 'px';
    }
  }

  /* ══════════════════════════════════════════════════════════
     CONSTRUIRE L'OVERLAY
  ══════════════════════════════════════════════════════════ */
  function buildOverlay() {
    document.getElementById('da-demo-overlay')?.remove();
    const wrap = document.createElement('div');
    wrap.id = 'da-demo-overlay';
    wrap.innerHTML = `
      <div id="da-demo-backdrop"></div>
      <div id="da-demo-spotlight"></div>
      <div id="da-demo-subtitle"></div>
      <div id="da-demo-arrow"></div>
      <div id="da-demo-card">
        <div id="da-demo-card-header">
          <div id="da-demo-progress"></div>
          <div style="display:flex;gap:6px;">
            <button id="da-demo-mute-btn" title="Activer/couper la voix"></button>
            <select id="da-demo-lang-select"></select>
          </div>
        </div>
        <div id="da-demo-badge-wrap" style="display:none;"><span id="da-demo-badge"></span></div>
        <div id="da-demo-step-label"></div>
        <h3 id="da-demo-title"></h3>
        <p id="da-demo-desc"></p>
        <div id="da-demo-lien-wrap" style="display:none;">
          <a id="da-demo-lien" href="#" target="_self"></a>
        </div>
        <div id="da-demo-cta-block" style="display:none;"></div>
        <div id="da-demo-nav">
          <button id="da-demo-skip"></button>
          <div class="da-nav-btns">
            <button id="da-demo-prev"></button>
            <button id="da-demo-next"></button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    return wrap;
  }

  /* ══════════════════════════════════════════════════════════
     TOUR PRINCIPAL
  ══════════════════════════════════════════════════════════ */
  function launch(role) {
    injectStyles();
    stopSpeech();
    const { steps, meta } = getSteps(role);
    const overlay  = buildOverlay();
    const card     = document.getElementById('da-demo-card');
    const sp       = document.getElementById('da-demo-spotlight');
    const progEl   = document.getElementById('da-demo-progress');
    const badgeWrap= document.getElementById('da-demo-badge-wrap');
    const badgeEl  = document.getElementById('da-demo-badge');
    const stepLbl  = document.getElementById('da-demo-step-label');
    const titleEl  = document.getElementById('da-demo-title');
    const descEl   = document.getElementById('da-demo-desc');
    const lienWrap = document.getElementById('da-demo-lien-wrap');
    const lienEl   = document.getElementById('da-demo-lien');
    const ctaEl    = document.getElementById('da-demo-cta-block');
    const nextBtn  = document.getElementById('da-demo-next');
    const prevBtn  = document.getElementById('da-demo-prev');
    const skipBtn  = document.getElementById('da-demo-skip');
    const muteBtn  = document.getElementById('da-demo-mute-btn');
    const langSel  = document.getElementById('da-demo-lang-select');
    let cur = 0;

    /* Couleur de l'interface selon le rôle */
    card.style.setProperty('--da-color', meta.couleur || '#1e3a8a');
    nextBtn.style.background = meta.couleur || '#1e3a8a';

    /* Sélecteur de langue */
    Object.keys(LANGS).forEach(l => {
      const opt = document.createElement('option');
      opt.value = l; opt.textContent = LANGS[l].label;
      if (l === _lang) opt.selected = true;
      langSel.appendChild(opt);
    });
    langSel.addEventListener('change', () => {
      _lang = langSel.value;
      localStorage.setItem('da_tuto_lang', _lang);
      stopSpeech();
      launch(role); /* Relancer dans la nouvelle langue */
    });

    /* Bouton mute */
    function updateMuteBtn() { muteBtn.textContent = _muted ? ui('voix_off') : ui('voix_on'); }
    updateMuteBtn();
    muteBtn.addEventListener('click', () => {
      _muted = !_muted;
      localStorage.setItem('da_tuto_muted', _muted ? '1' : '0');
      updateMuteBtn();
      if (_muted) stopSpeech();
    });

    function render() {
      const step = steps[cur];

      /* Points de progression */
      progEl.innerHTML = steps.map((_,i) => {
        let cls = 'da-dot';
        if (i === cur) cls += ' active';
        else if (i < cur) cls += ' done';
        return `<span class="${cls}"></span>`;
      }).join('');

      /* Badge rôle (1ère étape) */
      if (step.badge) {
        badgeEl.textContent = meta.badge;
        badgeEl.style.background = meta.couleur || '#1e3a8a';
        badgeWrap.style.display = 'block';
      } else { badgeWrap.style.display = 'none'; }

      /* Étape X / Y */
      stepLbl.textContent = `${ui('step')} ${cur+1} ${ui('sur')} ${steps.length}`;

      titleEl.textContent = step.titre;
      descEl.textContent  = step.desc;

      /* Bouton de langue */
      nextBtn.textContent  = cur === steps.length-1 ? ui('terminer') : ui('suivant');
      prevBtn.textContent  = ui('precedent');
      skipBtn.textContent  = ui('passer');
      prevBtn.style.display = cur > 0 ? 'inline-block' : 'none';
      skipBtn.style.display = cur === steps.length-1 ? 'none' : 'inline-block';

      /* Lien contextuel */
      if (step.lien) {
        lienEl.href = step.lien.href;
        lienEl.textContent = ui('voir') + ' ' + step.lien.label;
        lienWrap.style.display = 'block';
      } else { lienWrap.style.display = 'none'; }

      /* CTA finale */
      if (step.cta) {
        const ctaBtns = CTA[step.cta] || CTA.utilisateur;
        ctaEl.innerHTML = ctaBtns.map((b, i) =>
          `<a href="${b.href}" class="da-cta-btn ${i===0?'da-cta-p':'da-cta-s'}" ${i===0?`style="background:${meta.couleur||'#1e3a8a'}"`:''}">${b.label}</a>`
        ).join('');
        ctaEl.style.display = 'flex';
      } else { ctaEl.style.display = 'none'; }

      /* Cible et animations */
      const targetEl = findEl(step.el);
      spotlightEl(sp, targetEl);
      positionCard(card, targetEl, step.pos);
      showArrow(targetEl);

      if (targetEl) {
        targetEl.scrollIntoView({ behavior:'smooth', block:'center', inline:'nearest' });
        setTimeout(() => animateCursorTo(targetEl), 500);
      } else {
        const cursor = document.getElementById('da-virtual-cursor');
        if (cursor) cursor.style.display = 'none';
      }

      /* Voix off + sous-titres */
      speak(step.voice || step.titre);
    }

    function finish() {
      stopSpeech();
      overlay.style.display = 'none';
      overlay.remove();
      document.getElementById('da-virtual-cursor')?.remove();
      document.getElementById('da-demo-arrow')?.remove();
      fetch('/api/demo/vu', { method:'POST', credentials:'include' }).catch(()=>{});
      localStorage.setItem('da_demo_vu', '1');
    }

    nextBtn.addEventListener('click', () => { stopSpeech(); if (cur === steps.length-1) finish(); else { cur++; render(); } });
    prevBtn.addEventListener('click', () => { stopSpeech(); if (cur > 0) { cur--; render(); } });
    skipBtn.addEventListener('click', () => { stopSpeech(); finish(); });
    document.getElementById('da-demo-backdrop').addEventListener('click', () => { stopSpeech(); finish(); });

    overlay.style.display = 'block';
    render();
  }

  /* ══════════════════════════════════════════════════════════
     MODAL BIENVENUE — "Commencer" / "Plus tard"
  ══════════════════════════════════════════════════════════ */
  function showWelcomeModal(role) {
    injectStyles();
    const key = ROLE_MAP[role] || 'utilisateur';
    const meta = (T[key] || T.utilisateur);

    const modal = document.createElement('div');
    modal.id = 'da-welcome-modal';
    modal.innerHTML = `
      <div id="da-welcome-box">
        <div id="da-welcome-logo">🌍</div>
        <h2>Bienvenue sur Diaspo'Actif !</h2>
        <p>Souhaitez-vous découvrir rapidement votre espace <strong>${meta.badge}</strong> en <strong>1 minute</strong> ?</p>
        <div class="da-welcome-btns">
          <button id="da-welcome-start" style="background:${meta.couleur||'#1e3a8a'};">▶ Commencer</button>
          <button id="da-welcome-later">Plus tard</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.classList.add('show');

    document.getElementById('da-welcome-start').addEventListener('click', () => {
      modal.remove();
      launch(role);
    });
    document.getElementById('da-welcome-later').addEventListener('click', () => {
      modal.remove();
      fetch('/api/demo/plus-tard', { method:'POST', credentials:'include' }).catch(()=>{});
      localStorage.setItem('da_demo_plus_tard', Date.now().toString());
    });
  }

  /* ══════════════════════════════════════════════════════════
     API PUBLIQUE
  ══════════════════════════════════════════════════════════ */
  window.DADemo = {
    launch,
    showWelcomeModal,
    checkUser(user) {
      if (!user) return;
      if (user.demo_vue) { localStorage.setItem('da_demo_vu','1'); return; }
      if (localStorage.getItem('da_demo_vu') === '1') return;
      /* Vérifier délai "plus tard" — repropser après 24h */
      const pt = localStorage.getItem('da_demo_plus_tard');
      if (pt && Date.now() - parseInt(pt) < 86400000) return;
      if (user.nb_connexions === 1) {
        setTimeout(() => showWelcomeModal(user.role), 1500);
      }
    }
  };
})();

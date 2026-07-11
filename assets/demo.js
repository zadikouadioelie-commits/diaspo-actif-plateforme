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

  /* ══════════════════════════════════════════════════════════
     TUTORIELS PAR FONCTIONNALITÉ — chacun dédié à un seul sujet
     id = identifiant du catalogue dans tutoriels.html
  ══════════════════════════════════════════════════════════ */
  const STEPS_FONCTIONS = {

    /* ── PROFIL ── */
    'f-profil': {
      badge:'🪪 Profil', couleur:'#6366f1',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Compléter votre profil public",
          voice:"Votre profil public est votre vitrine sur Diaspo Actif. Voyons comment le rendre percutant.",
          desc:"Un profil complet est 5× plus visible dans l'annuaire. Suivez ce guide pas à pas." },
        { el:'.user-chip,.avatar,.profile-head', pos:'bottom',
          titre:"📸 Photo & Nom d'affichage",
          voice:"Commencez par ajouter une photo de profil professionnelle. Elle apparaît sur toutes vos publications.",
          desc:"Cliquez sur votre avatar pour uploader une photo. Choisissez une image claire, de face.",
          lien:{href:'profil.html', label:'Mon profil'} },
        { el:null, pos:'center',
          titre:"✍️ Biographie & Titre professionnel",
          voice:"Rédigez une biographie courte qui résume qui vous êtes, votre secteur et vos objectifs.",
          desc:"80 à 150 mots suffisent. Mentionnez votre domaine, vos expertises et ce que vous cherchez sur la plateforme." },
        { el:null, pos:'center',
          titre:"🌍 Localisation & Nationalités",
          voice:"Renseignez votre localisation actuelle et vos nationalités. Ces données permettent aux initiatives de vous trouver.",
          desc:"Localisation actuelle + pays d'origine. Vous pouvez en ajouter plusieurs avec justificatifs.",
          lien:{href:'profil.html', label:'Modifier ma localisation'} },
        { el:null, pos:'center',
          titre:"🏷️ Domaines d'expertise",
          voice:"Ajoutez vos domaines d'expertise pour apparaître dans les bons résultats de recherche.",
          desc:"Agriculture, Tech, Santé, Finance… Plus vos tags sont précis, plus vous recevez d'opportunités ciblées." },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Profil optimisé !",
          voice:"Votre profil est prêt. Un profil complet vous rend éligible au badge de vérification.",
          desc:"Complétez maintenant votre profil pour commencer à être trouvé par la communauté." }
      ]
    },

    /* ── QR CODE ── */
    'f-qrcode': {
      badge:'📱 QR Code', couleur:'#0f172a',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Votre QR Code Diaspo'Actif",
          voice:"Votre QR Code personnel est une carte d'identité numérique unique sur la plateforme.",
          desc:"Chaque compte dispose d'un QR Code unique qui pointe directement vers votre profil public." },
        { el:'#qr-code-section,.qr-code-wrap,[id*="qrcode"],[class*="qrcode"]', pos:'bottom',
          titre:"🔑 Trouver votre QR Code",
          voice:"Votre QR Code est disponible dans votre tableau de bord, dans la section Mon QR Code.",
          desc:"Rendez-vous dans votre tableau de bord → section 'Mon QR Code Diaspo'Actif'.",
          lien:{href:'dashboard-utilisateur.html', label:'Mon tableau de bord'} },
        { el:null, pos:'center',
          titre:"📲 Partager votre QR Code",
          voice:"Téléchargez votre QR Code ou partagez-le directement depuis votre profil.",
          desc:"Téléchargez en PNG ou partagez le lien direct. Idéal pour vos cartes de visite, emails, réseaux sociaux." },
        { el:null, pos:'center',
          titre:"🔍 Scanner le QR Code d'un autre membre",
          voice:"Utilisez l'outil de scan pour accéder directement au profil d'un autre membre.",
          desc:"Depuis le menu principal, cliquez sur 'Scanner' pour ouvrir le lecteur QR Code.",
          lien:{href:'scanner.html', label:'Scanner un QR Code'} },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Maîtrisez votre QR Code !",
          voice:"Votre QR Code est votre identifiant numérique unique sur Diaspo Actif.",
          desc:"Imprimez-le, partagez-le, scannez ceux des autres membres pour démarrer des connexions instantanées." }
      ]
    },

    /* ── BADGES ── */
    'f-badges': {
      badge:'🎖️ Badges', couleur:'#b45309',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Les badges et certifications",
          voice:"Les badges valorisent votre engagement et votre crédibilité sur la plateforme.",
          desc:"Chaque badge se débloque en accomplissant des actions spécifiques sur la plateforme." },
        { el:null, pos:'center',
          titre:"🥇 Types de badges",
          voice:"Il existe trois catégories de badges : profil, activité et certification.",
          desc:"• 🪪 Profil vérifié — identité validée\n• 🌟 Membre actif — publications et interactions\n• 🏅 Partenaire certifié — statut officiel" },
        { el:null, pos:'center',
          titre:"📈 Comment débloquer des badges",
          voice:"Complétez votre profil, publiez régulièrement et vérifiez votre identité pour débloquer des badges.",
          desc:"Complétez 100% du profil → badge Profil complet. 10 publications → badge Contributeur. Vérification → badge Certifié.",
          lien:{href:'profil.html', label:'Voir mes badges'} },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Démarrez votre collection !",
          voice:"Les badges renforcent votre crédibilité et augmentent votre visibilité dans l'annuaire.",
          desc:"Commencez par vérifier votre identité pour obtenir le badge de confiance." }
      ]
    },

    /* ── CONFIDENTIALITÉ ── */
    'f-confidentialite': {
      badge:'🔒 Confidentialité', couleur:'#374151',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Gérer votre confidentialité",
          voice:"Diaspo Actif vous donne un contrôle total sur la visibilité de vos informations.",
          desc:"Choisissez précisément qui peut voir chaque partie de votre profil et de vos activités." },
        { el:null, pos:'center',
          titre:"👁️ Niveaux de visibilité",
          voice:"Trois niveaux sont disponibles : public, membres uniquement, et privé.",
          desc:"• 🌍 Public — visible par tous les visiteurs\n• 👥 Membres — visible uniquement aux connectés\n• 🔒 Privé — visible uniquement par vous" },
        { el:null, pos:'center',
          titre:"⚙️ Paramétrer votre profil",
          voice:"Accédez aux paramètres de confidentialité depuis votre profil ou votre tableau de bord.",
          desc:"Choisissez la visibilité de votre email, téléphone, localisation précise et historique d'activité.",
          lien:{href:'profil.html', label:'Paramètres de confidentialité'} },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Votre vie privée est protégée !",
          voice:"Vous contrôlez totalement ce que les autres voient de votre profil.",
          desc:"Vous pouvez modifier ces paramètres à tout moment depuis votre profil." }
      ]
    },

    /* ── PUBLICATION ── */
    'f-publication': {
      badge:'📝 Publication', couleur:'#1e3a8a',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Publier une actualité",
          voice:"Publiez vos actualités, réalisations et opportunités directement dans le fil de la communauté.",
          desc:"Vos publications touchent tous vos abonnés et apparaissent dans le fil d'actualité." },
        { el:'#post-compose,.post-compose,[id*="compose"],textarea[placeholder*="publi"],textarea[placeholder*="actualit"]', pos:'bottom',
          titre:"✍️ Rédiger votre publication",
          voice:"Cliquez dans la zone de texte en haut du fil pour commencer à rédiger votre publication.",
          desc:"Tapez votre texte, ajoutez des emojis, des hashtags pour améliorer la visibilité.",
          lien:{href:'fil-actualite.html', label:'Ouvrir le Fil'} },
        { el:null, pos:'center',
          titre:"📎 Enrichir votre publication",
          voice:"Ajoutez des images, des liens, des sondages ou des événements à votre publication.",
          desc:"• 🖼️ Photos & vidéos\n• 🔗 Liens avec aperçu\n• 📊 Sondages\n• 📅 Événements\n• 📁 Documents" },
        { el:null, pos:'center',
          titre:"🎯 Cibler votre audience",
          voice:"Choisissez si votre publication est publique, réservée aux membres ou ciblée par pays.",
          desc:"Public = tout le monde. Membres = connectés uniquement. Vous pouvez aussi cibler par pays ou secteur." },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Publiez et engagez la communauté !",
          voice:"Une publication hebdomadaire suffit pour rester visible et actif dans la communauté.",
          desc:"Les publications avec images génèrent 3× plus d'interactions. Commencez maintenant !" }
      ]
    },

    /* ── MESSAGERIE ── */
    'f-messagerie': {
      badge:'💬 Messagerie', couleur:'#7c3aed',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Utiliser la messagerie privée",
          voice:"La messagerie privée vous permet de contacter directement n'importe quel membre ou initiative.",
          desc:"Conversations directes, partage de fichiers, notifications en temps réel." },
        { el:'a[href="messagerie.html"]', pos:'bottom',
          titre:"💬 Accéder à la messagerie",
          voice:"Cliquez sur l'icône message dans la barre de navigation pour accéder à vos conversations.",
          desc:"Ou depuis un profil, cliquez sur le bouton 'Contacter' pour démarrer une conversation.",
          lien:{href:'messagerie.html', label:'Ouvrir la messagerie'} },
        { el:null, pos:'center',
          titre:"✉️ Démarrer une conversation",
          voice:"Cliquez sur Nouvelle conversation, cherchez le membre et tapez votre message.",
          desc:"Nouveau message → cherchez le nom → rédigez → envoyez. Vous pouvez joindre des fichiers PDF, images, documents." },
        { el:null, pos:'center',
          titre:"🔔 Notifications de messages",
          voice:"Vous recevez une notification en temps réel dès qu'un message arrive.",
          desc:"Badge rouge sur l'icône messagerie dans la navbar. Notifications push si activées sur votre navigateur." },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Commencez à échanger !",
          voice:"La messagerie est le meilleur moyen de transformer une connexion en collaboration concrète.",
          desc:"Contactez une initiative ou un membre qui vous intéresse dès maintenant." }
      ]
    },

    /* ── CONNEXION ── */
    'f-connexion': {
      badge:'🤝 Connexion', couleur:'#15803d',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Envoyer une demande de connexion",
          voice:"Les connexions sont le cœur de votre réseau sur Diaspo Actif.",
          desc:"Connectez-vous avec des membres, des initiatives et des partenaires pour élargir votre réseau." },
        { el:'a[href="annuaire.html"]', pos:'bottom',
          titre:"🔍 Trouver un profil à connecter",
          voice:"Utilisez l'annuaire pour trouver des profils selon leurs domaines, leur localisation ou leur nationalité.",
          desc:"Annuaire → filtrez par domaine, pays, type de compte → cliquez sur un profil.",
          lien:{href:'annuaire.html', label:"Ouvrir l'annuaire"} },
        { el:null, pos:'center',
          titre:"➕ Envoyer la demande",
          voice:"Sur le profil du membre, cliquez sur le bouton Se connecter pour envoyer votre demande.",
          desc:"Cliquez 'Se connecter' → la demande est envoyée. Vous pouvez ajouter un message personnalisé." },
        { el:null, pos:'center',
          titre:"✅ Gérer vos demandes reçues",
          voice:"Retrouvez vos demandes de connexion reçues dans votre tableau de bord ou vos notifications.",
          desc:"Tableau de bord → Connexions → Demandes reçues. Acceptez ou refusez en un clic.",
          lien:{href:'dashboard-utilisateur.html', label:'Mes connexions'} }
      ]
    },

    /* ── ÉVÉNEMENT ── */
    'f-evenement': {
      badge:'📅 Événement', couleur:'#0369a1',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Créer un événement",
          voice:"Organisez un événement diaspora et touchez des milliers de membres ciblés.",
          desc:"Webinaires, ateliers, conférences, rencontres — tous types d'événements en ligne ou en présentiel." },
        { el:'a[href="evenements.html"]', pos:'bottom',
          titre:"📅 Accéder aux événements",
          voice:"Cliquez sur Événements dans le menu pour accéder à l'espace de création.",
          desc:"Menu → Événements → bouton '+ Créer un événement'.",
          lien:{href:'evenements.html', label:'Gérer mes événements'} },
        { el:null, pos:'center',
          titre:"📋 Informations de l'événement",
          voice:"Renseignez le titre, la description, la date, le lieu et le type d'événement.",
          desc:"• Titre accrocheur\n• Description détaillée\n• Date & heure (fuseau horaire)\n• Lieu ou lien visioconférence\n• Catégorie (formation, réseau, culture…)" },
        { el:null, pos:'center',
          titre:"🎯 Cibler les participants",
          voice:"Définissez votre audience cible par pays, secteur ou type de compte.",
          desc:"Ciblez vos invitations : tous les membres, par pays d'origine, par secteur d'activité." },
        { el:null, pos:'center',
          titre:"📢 Promouvoir votre événement",
          voice:"Votre événement est automatiquement promu dans le fil d'actualité et le calendrier diaspora.",
          desc:"Publication automatique dans le fil + calendrier communautaire + notifications aux membres ciblés." },
        { el:null, pos:'center', cta:'initiative',
          titre:"✅ Votre événement est prêt !",
          voice:"Votre événement sera visible par des milliers de membres de la diaspora.",
          desc:"Créez votre premier événement et invitez votre réseau dès maintenant." }
      ]
    },

    /* ── BILLETTERIE ── */
    'f-billetterie': {
      badge:'🎫 Billetterie', couleur:'#7c3aed',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Créer une billetterie",
          voice:"La billetterie intégrée vous permet de vendre et gérer des billets directement sur la plateforme.",
          desc:"Événements payants, entrées gratuites avec inscription, billets VIP — tout est gérable depuis Diaspo'Actif." },
        { el:null, pos:'center',
          titre:"🎟️ Configurer vos billets",
          voice:"Créez plusieurs types de billets : entrée standard, VIP, en ligne ou présentiel.",
          desc:"• Types de billets (Standard / VIP / Gratuit)\n• Nombre de places disponibles\n• Prix et devise\n• Date limite de vente",
          lien:{href:'billetterie.html', label:'Gérer ma billetterie'} },
        { el:null, pos:'center',
          titre:"💳 Paiement & Validation",
          voice:"Les participants paient en ligne et reçoivent leur billet par email avec QR Code d'entrée.",
          desc:"Paiement sécurisé → email automatique avec QR Code → scan à l'entrée de l'événement." },
        { el:null, pos:'center', cta:'initiative',
          titre:"✅ Votre billetterie est active !",
          voice:"Gérez vos ventes, remboursements et listes d'invités depuis votre tableau de bord.",
          desc:"Tableau de bord → Billetterie → suivez vos ventes en temps réel." }
      ]
    },

    /* ── MES BILLETS (utilisateur) ── */
    'f-mes-billets': {
      badge:'🎟 Mes Billets', couleur:'#7c3aed',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Consulter mes billets",
          voice:"Retrouvez tous les billets que vous avez achetés pour des événements sur Diaspo'Actif.",
          desc:"Chaque billet acheté sur un événement d'initiative est automatiquement rangé ici, avec son statut à jour." },
        { el:null, pos:'center',
          titre:"🔍 Voir le détail d'un billet",
          voice:"Ouvrez un billet pour afficher son QR Code, le lieu, l'heure et le titulaire.",
          desc:"• QR Code à présenter à l'entrée\n• Statut (à venir, aujourd'hui, utilisé, remboursé…)\n• Type de billet (Standard / VIP / Gratuit)",
          lien:{href:'mes-billets.html', label:'Voir mes billets'} },
        { el:null, pos:'center',
          titre:"⬇️ Emporter votre billet",
          voice:"Téléchargez votre billet en PDF ou ajoutez l'événement à votre agenda Google.",
          desc:"Le bouton PDF génère un billet imprimable avec QR Code ; le bouton Agenda ajoute l'événement à votre calendrier." },
        { el:null, pos:'center',
          titre:"✅ Vous êtes prêt !",
          voice:"Ce module ne sert qu'à consulter et conserver vos billets — la création d'événements reste réservée aux comptes Initiative.",
          desc:"Un souci avec un billet ? Contactez directement l'organisateur depuis le détail du billet." }
      ]
    },

    /* ── BUSINESS PLAN ── */
    'f-business-plan': {
      badge:'📋 Business Plan', couleur:'#1e3a8a',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Créer un Business Plan",
          voice:"L'outil Business Plan vous aide à structurer votre projet étape par étape, pour convaincre partenaires et investisseurs.",
          desc:"Startup, PME, association, ONG, coopérative… choisissez un modèle adapté à votre projet." },
        { el:null, pos:'center',
          titre:"📝 Remplir les sections",
          voice:"Présentation, marché, offre, stratégie, finances — chaque section vous guide avec des exemples.",
          desc:"• Résumé et présentation du projet\n• Étude de marché et positionnement\n• Stratégie et plan d'action\n• Simulation financière intégrée",
          lien:{href:'business-plan.html', label:'Mes Business Plans'} },
        { el:null, pos:'center',
          titre:"🔗 Partager et suivre",
          voice:"Suivez la progression de complétude et partagez votre business plan avec vos partenaires.",
          desc:"Barre de progression automatique, duplication en un clic, partage collaboratif avec droits d'accès." },
        { el:null, pos:'center', cta:'entrepreneur',
          titre:"✅ Votre projet est structuré !",
          voice:"Revenez à tout moment modifier votre business plan à mesure que votre projet évolue.",
          desc:"Tableau de bord → Business Plans → créez, dupliquez ou archivez vos plans." }
      ]
    },

    /* ── CV ET LETTRE DE MOTIVATION ── */
    'f-cv-lettre': {
      badge:'🟧 CV & Lettre', couleur:'#b45309',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"CV et lettre de motivation",
          voice:"Générez un CV et une lettre de motivation professionnels directement depuis votre profil.",
          desc:"Plusieurs modèles (Classique, Corporate, Créatif, International) et thèmes de couleur au choix." },
        { el:null, pos:'center',
          titre:"🧩 Construire votre CV",
          voice:"Reprenez les informations de votre profil ou complétez-les, puis choisissez votre modèle.",
          desc:"• Expériences, formations, compétences\n• QR Code intégré pointant vers votre profil public\n• Export PDF téléchargeable",
          lien:{href:'cv-builder.html', label:'Créer mon CV'} },
        { el:null, pos:'center',
          titre:"✉️ Rédiger votre lettre",
          voice:"La lettre de motivation reprend le même style visuel que votre CV pour un dossier cohérent.",
          desc:"Modèles et thèmes assortis à votre CV, QR Code, export PDF prêt à l'envoi.",
          lien:{href:'lettre-builder.html', label:'Créer ma lettre'} },
        { el:null, pos:'center',
          titre:"✅ Votre dossier de candidature est prêt !",
          voice:"Téléchargez vos documents ou envoyez-les directement depuis la plateforme.",
          desc:"CV, lettre de motivation et profil vérifié — tout est réuni pour candidater en confiance." }
      ]
    },

    /* ── COMPTE INITIATIVE — modules du dashboard ── */
    'f-init-presentation': { badge:'📋 Ma fiche initiative', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Ma fiche initiative", voice:"Complétez la présentation publique de votre initiative pour inspirer confiance.", desc:"Mission, historique, équipe, réseaux sociaux, infos pratiques — tout ce qui donne envie de vous rejoindre." },
      { el:null, pos:'center', titre:"✏️ Éditez chaque section", voice:"Cliquez sur le crayon à côté de chaque rubrique pour la modifier directement.", desc:"Chaque section (mission, équipe, zones d'action...) s'édite en ligne, sans quitter la page.", lien:{href:'dashboard-initiative.html', label:'Ma fiche initiative'} },
      { el:null, pos:'center', cta:'initiative', titre:"✅ Une fiche complète, plus de confiance", voice:"Une fiche bien remplie augmente votre score d'activité et votre crédibilité.", desc:"Revenez régulièrement mettre à jour vos informations." }
    ]},
    'f-init-publications': { badge:'📰 Publications vitrine', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Publier sur votre vitrine", voice:"Annoncez vos actualités, offres et nouveautés directement sur votre vitrine publique.", desc:"Vos publications apparaissent dans l'onglet Vitrine de votre profil, visibles par tous vos abonnés." },
      { el:null, pos:'center', titre:"🖼️ Texte, image, promotion", voice:"Ajoutez une image, un prix promotionnel ou un appel à l'action à chaque publication.", desc:"• Titre et description\n• Image de mise en avant\n• Prix / promotion optionnels\n• Bouton d'action (contacter, commander...)", lien:{href:'dashboard-initiative.html', label:'Publications'} },
      { el:null, pos:'center', titre:"✅ Suivez l'engagement", voice:"Vues, partages, réactions et commentaires sont mesurés sur chaque publication.", desc:"Utilisez ces statistiques pour savoir ce qui intéresse le plus votre communauté." }
    ]},
    'f-init-zones': { badge:'🗺️ Zones d\'action', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Zones d'action", voice:"Indiquez les pays et régions où votre initiative intervient concrètement.", desc:"Ces zones apparaissent sur votre profil public et alimentent les observatoires territoriaux." },
      { el:null, pos:'center', titre:"🌍 Ajoutez vos zones", voice:"Sélectionnez un ou plusieurs pays/régions d'intervention.", desc:"Plus vos zones sont précises, plus votre initiative sera visible auprès des membres concernés.", lien:{href:'dashboard-initiative.html', label:'Zones d\'action'} },
      { el:null, pos:'center', titre:"✅ Visibilité ciblée", voice:"Les collectivités et membres de ces zones vous retrouveront plus facilement.", desc:"Mettez à jour vos zones dès que votre périmètre d'action évolue." }
    ]},
    'f-init-stats': { badge:'📊 Statistiques & Impact', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Statistiques & Impact", voice:"Suivez en temps réel les indicateurs clés de votre initiative.", desc:"Vues du profil, nombre de membres, abonnés, publications — tout en un coup d'œil." },
      { el:null, pos:'center', titre:"📈 Comprendre votre impact", voice:"Ajoutez aussi des statistiques déclaratives : projets menés, bénéficiaires, pays couverts.", desc:"Ces chiffres renforcent la crédibilité de votre fiche auprès des visiteurs.", lien:{href:'dashboard-initiative.html', label:'Stats & Impact'} },
      { el:null, pos:'center', titre:"✅ Un tableau de bord clair", voice:"Revenez régulièrement pour suivre votre progression.", desc:"Le score d'activité se calcule automatiquement à partir de ces données." }
    ]},
    'f-init-messages-vitrine': { badge:'🛍️ Messages de la vitrine', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Messages de la vitrine", voice:"Les visiteurs de votre vitrine peuvent vous écrire directement — retrouvez leurs messages ici.", desc:"Un espace dédié, séparé de votre messagerie personnelle, pour les demandes commerciales." },
      { el:null, pos:'center', titre:"💬 Répondre rapidement", voice:"Chaque message affiche le produit ou la publication concernée pour répondre avec le bon contexte.", desc:"Un badge signale les messages non lus.", lien:{href:'dashboard-initiative.html', label:'Messages de la vitrine'} },
      { el:null, pos:'center', titre:"✅ Ne manquez aucune opportunité", voice:"Une réponse rapide augmente vos chances de convertir un visiteur en client ou en membre.", desc:"Activez les notifications pour être alerté en temps réel." }
    ]},
    'f-init-vitrine': { badge:'⭐ Paramètres de la vitrine', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Paramètres de la vitrine", voice:"Personnalisez l'apparence de votre vitrine publique pour qu'elle vous ressemble.", desc:"Thème de couleur, bannière, sections mises en avant — votre vitrine, votre identité." },
      { el:null, pos:'center', titre:"🎨 Choisissez votre thème", voice:"Un sélecteur de thème flottant vous permet de prévisualiser instantanément le rendu.", desc:"Le choix est sauvegardé automatiquement pour tous vos visiteurs.", lien:{href:'dashboard-initiative.html', label:'Paramètres Vitrine'} },
      { el:null, pos:'center', titre:"✅ Une vitrine professionnelle", voice:"Une belle vitrine inspire confiance et encourage les abonnements.", desc:"Mettez régulièrement à jour votre bannière et vos sections mises en avant." }
    ]},
    'f-init-partenaires': { badge:'🤝 Liste des partenaires', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Liste des partenaires", voice:"Mettez en avant les organisations qui soutiennent ou collaborent avec votre initiative.", desc:"Logos cliquables affichés sur votre profil public, dans l'ordre de votre choix." },
      { el:null, pos:'center', titre:"➕ Ajouter un partenaire", voice:"Recherchez un compte existant sur la plateforme ou ajoutez un partenaire externe.", desc:"Réorganisez l'ordre d'affichage par glisser-déposer, activez/désactivez un partenaire sans le supprimer.", lien:{href:'dashboard-initiative.html', label:'Liste des partenaires'} },
      { el:null, pos:'center', titre:"✅ Crédibilité renforcée", voice:"Des partenariats visibles rassurent les nouveaux visiteurs.", desc:"Chaque logo renvoie vers le profil du partenaire." }
    ]},
    'f-init-adhesions': { badge:'🎫 Cotisations & Adhésions', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Cotisations & Adhésions", voice:"Créez des formules d'adhésion payantes ou gratuites et gérez votre registre de membres.", desc:"Carte membre numérique avec QR Code, relances automatiques, encaissement en ligne." },
      { el:null, pos:'center', titre:"💳 Créer une formule", voice:"Définissez le montant, la périodicité et les moyens de paiement acceptés (carte, virement, Mobile Money).", desc:"• Nom et description de la formule\n• Montant et périodicité\n• Modes de paiement\n• Liste de stockage des adhérents", lien:{href:'dashboard-initiative.html', label:'Cotisations & Adhésions'} },
      { el:null, pos:'center', titre:"🔔 Relances automatiques", voice:"Les adhérents en retard reçoivent automatiquement des rappels par email.", desc:"Suivez vos encaissements et exportez votre registre en CSV." },
      { el:null, pos:'center', cta:'initiative', titre:"✅ Une gestion simplifiée", voice:"Toute votre trésorerie d'adhésion centralisée en un seul endroit.", desc:"Tableau de bord → Cotisations & Adhésions → suivez vos campagnes." }
    ]},
    'f-init-votes': { badge:'🗳️ Votes sécurisés', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Votes sécurisés", voice:"Organisez des scrutins et assemblées générales avec vote électronique sécurisé.", desc:"Authentification par DS-ID, bulletins anonymes, résultats certifiés." },
      { el:null, pos:'center', titre:"🗳️ Créer un scrutin", voice:"Définissez les résolutions à voter et la liste des électeurs autorisés.", desc:"• Résolutions à voter\n• Électeurs (adhérents à jour, liste réseau pro...)\n• Dates d'ouverture/fermeture", lien:{href:'dashboard-initiative.html', label:'Votes sécurisés'} },
      { el:null, pos:'center', titre:"📊 Résultats certifiés", voice:"À la clôture, un compte rendu automatique est généré avec le taux de participation.", desc:"Les électeurs sont relancés automatiquement s'ils n'ont pas encore voté." },
      { el:null, pos:'center', cta:'initiative', titre:"✅ Une gouvernance transparente", voice:"Vos assemblées générales gagnent en légitimité et en traçabilité.", desc:"Tableau de bord → Votes sécurisés → consultez l'historique des scrutins." }
    ]},
    'f-init-recrutement': { badge:'📋 Candidatures', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Candidatures", voice:"Publiez des appels à candidatures et centralisez les postulants.", desc:"Bénévoles, stagiaires, membres d'équipe — gérez tout le processus de recrutement." },
      { el:null, pos:'center', titre:"📝 Publier une offre", voice:"Décrivez le profil recherché et les conditions.", desc:"Les candidatures reçues sont classées et consultables depuis votre tableau de bord.", lien:{href:'dashboard-initiative.html', label:'Candidatures'} },
      { el:null, pos:'center', titre:"✅ Suivez vos recrutements", voice:"Contactez directement les candidats intéressants depuis la messagerie.", desc:"Clôturez une offre une fois le poste pourvu." }
    ]},
    'f-init-paiement': { badge:'💳 Module paiement', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Module paiement", voice:"Connectez votre compte Stripe pour recevoir directement les paiements de vos activités.", desc:"Boutique, adhésions, billetterie — tous les paiements transitent par ce module." },
      { el:null, pos:'center', titre:"🔗 Connecter Stripe", voice:"Créez ou reliez votre compte Stripe Connect en quelques clics.", desc:"Diaspo'Actif prélève une commission automatique sur chaque transaction, le reste est reversé sur votre compte.", lien:{href:'dashboard-initiative.html', label:'Module paiement'} },
      { el:null, pos:'center', titre:"✅ Paiements sécurisés", voice:"Toutes les transactions sont traitées par Stripe, aucune donnée bancaire ne transite par nos serveurs.", desc:"Suivez vos encaissements depuis votre tableau de bord Stripe." }
    ]},
    'f-init-publicites': { badge:'📣 Publicités', couleur:'#15803d', steps:[
      { el:null, pos:'center', badge:true, titre:"Publicités", voice:"Créez des campagnes publicitaires pour gagner en visibilité sur la plateforme.", desc:"Ciblez une zone géographique, une audience, et suivez les performances de votre campagne." },
      { el:null, pos:'center', titre:"🎯 Créer une campagne", voice:"Choisissez une image ou une courte vidéo, définissez votre budget et votre audience cible.", desc:"Chaque campagne est soumise à validation par l'équipe Diaspo'Actif avant diffusion.", lien:{href:'dashboard-initiative.html', label:'Publicités'} },
      { el:null, pos:'center', titre:"✅ Mesurez les résultats", voice:"Impressions, clics et conversions sont suivis en temps réel.", desc:"Ajustez votre campagne selon les performances observées." }
    ]},

    /* ── COMPTE COLLECTIVITÉ — modules du dashboard ── */
    'f-coll-cockpit': { badge:'📊 Tableau de bord collectivité', couleur:'#0369a1', steps:[
      { el:null, pos:'center', badge:true, titre:"Tableau de bord collectivité", voice:"Votre cockpit centralise tous les indicateurs clés de votre territoire.", desc:"Diaspora connectée, initiatives rattachées, activité récente — la vue d'ensemble de votre compétence." },
      { el:null, pos:'center', titre:"📌 Accès rapide aux modules", voice:"Depuis le cockpit, accédez en un clic aux initiatives à valider, aux observatoires et aux communications.", desc:"Le menu latéral regroupe tous les modules disponibles pour votre compte.", lien:{href:'dashboard-collectivite.html', label:'Cockpit'} },
      { el:null, pos:'center', titre:"✅ Pilotez votre territoire", voice:"Revenez régulièrement pour suivre l'évolution de votre diaspora et de vos initiatives.", desc:"Chaque module approfondit une dimension de votre action territoriale." }
    ]},
    'f-coll-initiatives': { badge:'✅ Valider les initiatives', couleur:'#0369a1', steps:[
      { el:null, pos:'center', badge:true, titre:"Valider les initiatives", voice:"Examinez les initiatives qui se rattachent à votre territoire de compétence.", desc:"Chaque nouvelle initiative liée à votre périmètre attend votre validation avant d'être pleinement active." },
      { el:null, pos:'center', titre:"🔍 Examiner un dossier", voice:"Consultez la fiche complète de l'initiative avant de vous prononcer.", desc:"Mission, responsable, zones d'action — toutes les informations nécessaires à votre décision.", lien:{href:'dashboard-collectivite.html', label:'Initiatives à valider'} },
      { el:null, pos:'center', titre:"✅ Valider ou refuser", voice:"Une fois validée, l'initiative apparaît dans votre liste d'initiatives validées et gagne en visibilité.", desc:"Vous pouvez motiver un refus pour guider le porteur de projet." }
    ]},
    'f-coll-identite': { badge:'🔐 Identité Territoriale', couleur:'#0369a1', steps:[
      { el:null, pos:'center', badge:true, titre:"Identité Territoriale", voice:"Obtenez un identifiant territorial officiel unique, gage d'authenticité pour votre collectivité.", desc:"Un badge de confiance qui protège votre compte contre l'usurpation par de faux comptes institutionnels." },
      { el:null, pos:'center', titre:"🪪 Générer votre identifiant", voice:"Votre identifiant est généré automatiquement à partir de votre pays, ville et type d'organisme.", desc:"Un vérificateur de doublon détecte les collectivités similaires déjà enregistrées.", lien:{href:'dashboard-collectivite.html', label:'Identité Territoriale'} },
      { el:null, pos:'center', titre:"✅ Un badge de confiance", voice:"Le journal d'activité trace toutes les actions liées à votre identité territoriale.", desc:"Les administrateurs rattachés à votre institution apparaissent également sur cette page." }
    ]},
    'f-coll-partenariats': { badge:'🟨 Partenariats', couleur:'#0369a1', steps:[
      { el:null, pos:'center', badge:true, titre:"Partenariats", voice:"Suivez et développez vos partenariats institutionnels avec d'autres acteurs de la plateforme.", desc:"Une vue centralisée de toutes vos relations partenariales." },
      { el:null, pos:'center', titre:"🤝 Développer votre réseau", voice:"Identifiez de nouveaux partenaires potentiels parmi les initiatives et institutions actives.", desc:"Chaque partenariat renforce votre rayonnement territorial.", lien:{href:'dashboard-collectivite.html', label:'Partenariats'} },
      { el:null, pos:'center', titre:"✅ Un écosystème renforcé", voice:"Des partenariats actifs et visibles valorisent votre action auprès de la diaspora.", desc:"Mettez à jour régulièrement l'état de vos partenariats." }
    ]},
    'f-coll-oz': { badge:'🧠 OZ Collectivité', couleur:'#0369a1', steps:[
      { el:null, pos:'center', badge:true, titre:"OZ Collectivité", voice:"OZ est votre assistant IA territorial, le Directeur Intelligence Diaspora de votre collectivité.", desc:"Posez-lui des questions sur votre diaspora, vos compétences disponibles, vos opportunités d'investissement." },
      { el:null, pos:'center', titre:"💬 Poser une question", voice:"Demandez par exemple : « Quelles compétences ont mes membres en informatique ? » ou « Qui souhaite investir ? ».", desc:"OZ répond à partir des données réelles de votre diaspora connectée, bornées à votre périmètre.", lien:{href:'dashboard-collectivite.html', label:'OZ Collectivité'} },
      { el:null, pos:'center', titre:"💡 Transformer en action", voice:"Les suggestions d'OZ peuvent être converties en un clic en Opportunité stratégique.", desc:"Un pont direct entre l'observation et l'action concrète sur le terrain." },
      { el:null, pos:'center', titre:"✅ Une intelligence territoriale", voice:"OZ Collectivité vous aide à prendre des décisions éclairées sur votre territoire.", desc:"Toutes les données respectent le seuil de confidentialité (minimum 10 membres, aucune donnée nominative)." }
    ]},
    'f-coll-observatoire': { badge:'🌍 Observatoires', couleur:'#0369a1', steps:[
      { el:null, pos:'center', badge:true, titre:"Observatoires Mondial & Territorial", voice:"Deux observatoires vous donnent une vision statistique complète de la diaspora.", desc:"Observatoire Mondial : vision globale anonymisée. Observatoire Territorial : bornée à votre périmètre de compétence." },
      { el:null, pos:'center', titre:"📊 Explorer les données", voice:"Nationalités, origines, résidence, compétences, secteurs, initiatives, entreprises — tout est représenté visuellement.", desc:"Un seuil de confidentialité de 10 membres minimum garantit qu'aucune donnée nominative n'est exposée.", lien:{href:'dashboard-collectivite.html', label:'Observatoires'} },
      { el:null, pos:'center', titre:"⚠️ Observer ne veut pas dire contacter", voice:"Accéder à une statistique n'autorise jamais à contacter individuellement les membres hors de votre juridiction.", desc:"Le premier contact appartient toujours au membre — la diffusion collective reste le seul canal." },
      { el:null, pos:'center', titre:"✅ Une vision stratégique", voice:"Utilisez ces observatoires pour orienter vos politiques territoriales envers la diaspora.", desc:"Enregistrez une donnée intéressante comme Opportunité stratégique pour la transformer en action." }
    ]},
    'f-coll-opportunites': { badge:'💡 Opportunités stratégiques', couleur:'#0369a1', steps:[
      { el:null, pos:'center', badge:true, titre:"Opportunités stratégiques", voice:"Le pont entre l'observation et l'action : transformez une donnée en projet concret.", desc:"Depuis l'Observatoire Mondial, enregistrez une observation comme opportunité à traiter." },
      { el:null, pos:'center', titre:"🎯 Passer à l'action", voice:"Chaque opportunité peut être transformée en communication, appel à projets ou consultation.", desc:"L'action est automatiquement bornée à votre juridiction — jamais de contact individuel hors périmètre.", lien:{href:'dashboard-collectivite.html', label:'Opportunités stratégiques'} },
      { el:null, pos:'center', titre:"✅ Historique tracé", voice:"Chaque opportunité conserve un historique complet de son évolution jusqu'à l'action.", desc:"Suivez l'état de chaque opportunité : nouvelle, en cours d'action, traitée." }
    ]},
    'f-coll-communications': { badge:'🟥 Communications', couleur:'#0369a1', steps:[
      { el:null, pos:'center', badge:true, titre:"Communications", voice:"Diffusez des communications officielles aux membres relevant de votre compétence territoriale.", desc:"Actualités, alertes, informations pratiques — un canal de diffusion collective vers votre diaspora." },
      { el:null, pos:'center', titre:"📤 Rédiger et diffuser", voice:"Votre communication est automatiquement limitée aux membres de votre juridiction.", desc:"Un encart rappelle le périmètre exact de diffusion avant l'envoi.", lien:{href:'dashboard-collectivite.html', label:'Communications'} },
      { el:null, pos:'center', titre:"✅ Un canal officiel", voice:"Vos communications apparaissent identifiées comme provenant d'une institution vérifiée.", desc:"Consultez le taux de lecture de vos communications passées." }
    ]},
    'f-coll-consultations': { badge:'📋 Consultations', couleur:'#0369a1', steps:[
      { el:null, pos:'center', badge:true, titre:"Consultations", voice:"Lancez des consultations publiques pour recueillir l'avis de votre communauté.", desc:"Idéal pour associer la diaspora à vos décisions territoriales." },
      { el:null, pos:'center', titre:"📝 Créer une consultation", voice:"Rédigez votre question et les options de réponse, puis diffusez-la à votre périmètre.", desc:"Les résultats sont agrégés en temps réel.", lien:{href:'dashboard-collectivite.html', label:'Consultations'} },
      { el:null, pos:'center', titre:"✅ Une démocratie participative", voice:"Utilisez les résultats pour orienter vos décisions et communiquer sur les suites données.", desc:"Une consultation active renforce le lien entre votre collectivité et sa diaspora." }
    ]},

    /* ── ADMINISTRATION — modules avancés ── */
    'f-adm-reseau': { badge:'🌍 Réseau & Diaspora', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Réseau & Diaspora", voice:"Explorez la cartographie globale du réseau et de la diaspora inscrite sur la plateforme.", desc:"Une vue d'ensemble de tous les membres, toutes origines et résidences confondues." },
      { el:null, pos:'center', titre:"📊 Analyser la répartition", voice:"Filtrez par pays d'origine, de résidence, secteur d'activité.", desc:"Ces données alimentent aussi les observatoires proposés aux collectivités.", lien:{href:'dashboard-administrateur.html', label:'Réseau & Diaspora'} },
      { el:null, pos:'center', titre:"✅ Piloter la croissance", voice:"Identifiez les zones à fort potentiel de développement.", desc:"Croisez ces données avec les statistiques d'acquisition." }
    ]},
    'f-adm-acquisition': { badge:'👥 Acquisition Membres', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Acquisition Membres", voice:"Suivez les indicateurs d'acquisition et de rétention de nouveaux membres.", desc:"Inscriptions, taux d'activation, rétention — la santé de la croissance de la plateforme." },
      { el:null, pos:'center', titre:"📈 Comprendre les tendances", voice:"Identifiez les canaux d'acquisition les plus performants.", desc:"Ajustez vos actions de communication en fonction des résultats observés.", lien:{href:'dashboard-administrateur.html', label:'Acquisition Membres'} },
      { el:null, pos:'center', titre:"✅ Optimiser la croissance", voice:"Ces indicateurs guident les décisions produit et marketing.", desc:"Suivez l'évolution mois après mois." }
    ]},
    'f-adm-init-projets': { badge:'🌐 Initiatives & Projets', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Initiatives & Projets", voice:"Supervisez l'ensemble des initiatives et projets créés sur la plateforme.", desc:"Une vue globale, tous territoires confondus, complémentaire à la validation par les collectivités." },
      { el:null, pos:'center', titre:"🔍 Superviser et intervenir", voice:"Consultez le détail de chaque initiative et intervenez en cas de besoin.", desc:"Cette vue croise les données de toutes les collectivités validatrices.", lien:{href:'dashboard-administrateur.html', label:'Initiatives & Projets'} },
      { el:null, pos:'center', titre:"✅ Une vision plateforme", voice:"Identifiez les initiatives les plus actives et les tendances par secteur.", desc:"Utile pour la mise en avant éditoriale ou les partenariats stratégiques." }
    ]},
    'f-adm-accreditations': { badge:'🏛️ Accréditations', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Accréditations", voice:"Traitez les demandes d'accréditation premium soumises par les comptes.", desc:"Gestion des Associations, Créateur de formations, et autres accréditations spécialisées." },
      { el:null, pos:'center', titre:"✅ Examiner une demande", voice:"Consultez le dossier soumis et validez ou refusez la demande.", desc:"Une fois accordée, l'accréditation débloque les modules premium correspondants.", lien:{href:'dashboard-administrateur.html', label:'Accréditations'} },
      { el:null, pos:'center', titre:"✅ Un contrôle qualité", voice:"Les accréditations garantissent que les comptes premium respectent les standards de la plateforme.", desc:"Vous pouvez révoquer une accréditation en cas de manquement." }
    ]},
    'f-adm-certifications': { badge:'🛡️ Certifications', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Certifications", voice:"Gérez les certifications délivrées aux comptes et organisations de la plateforme.", desc:"Un gage de confiance supplémentaire, distinct des accréditations premium." },
      { el:null, pos:'center', titre:"✅ Délivrer ou retirer", voice:"Attribuez une certification après vérification, ou retirez-la si nécessaire.", desc:"Les certifications sont visibles publiquement sur le profil concerné.", lien:{href:'dashboard-administrateur.html', label:'Certifications'} },
      { el:null, pos:'center', titre:"✅ Renforcer la confiance", voice:"Un écosystème certifié inspire davantage confiance aux nouveaux membres.", desc:"Documentez vos critères de certification pour rester cohérent." }
    ]},
    'f-adm-membres': { badge:'👥 Registre des membres', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Registre des membres", voice:"Consultez et administrez le registre complet des membres de la plateforme.", desc:"Complémentaire à « Gérer les utilisateurs », avec une vue registre/export." },
      { el:null, pos:'center', titre:"🔍 Rechercher et filtrer", voice:"Filtrez par type de compte, statut, date d'inscription.", desc:"Exportez le registre pour vos analyses ou obligations de reporting.", lien:{href:'dashboard-administrateur.html', label:'Membres'} },
      { el:null, pos:'center', titre:"✅ Une base fiable", voice:"Un registre à jour est essentiel pour le pilotage de la plateforme.", desc:"Croisez avec les statistiques Diaspora Données pour une vue enrichie." }
    ]},
    'f-adm-reseau-pro': { badge:'💼 Réseau Professionnel', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Réseau Professionnel", voice:"Supervisez les connexions et échanges du réseau professionnel de la plateforme.", desc:"Une vue d'ensemble des mises en relation entre membres." },
      { el:null, pos:'center', titre:"🔍 Surveiller l'activité", voice:"Identifiez les connexions actives et les éventuels abus à modérer.", desc:"Ce module alimente aussi les listes de diffusion « Réseau professionnel ».", lien:{href:'dashboard-administrateur.html', label:'Réseau Professionnel'} },
      { el:null, pos:'center', titre:"✅ Un réseau sain", voice:"Un réseau professionnel actif est un indicateur clé d'engagement.", desc:"Suivez son évolution dans le temps." }
    ]},
    'f-adm-diaspora-stats': { badge:'📊 Diaspora Données', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Diaspora Données", voice:"Analysez les données démographiques et professionnelles de la diaspora inscrite.", desc:"Origines, résidences, secteurs d'activité, compétences — la donnée brute derrière les observatoires." },
      { el:null, pos:'center', titre:"📈 Explorer en profondeur", voice:"Croisez plusieurs dimensions pour dégager des tendances.", desc:"Ces données alimentent l'Observatoire Mondial mis à disposition des collectivités.", lien:{href:'dashboard-administrateur.html', label:'Diaspora Données'} },
      { el:null, pos:'center', titre:"✅ Une intelligence data", voice:"Utilisez ces analyses pour orienter la stratégie éditoriale et produit.", desc:"Le seuil de confidentialité s'applique aussi en interne." }
    ]},
    'f-adm-contenu': { badge:'📄 Contenu diaspora', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Contenu diaspora", voice:"Gérez le contenu éditorial dédié à la diaspora sur la plateforme.", desc:"Articles, ressources, contenus mis en avant auprès des membres diaspora." },
      { el:null, pos:'center', titre:"✏️ Publier du contenu", voice:"Créez ou modérez le contenu éditorial diffusé.", desc:"Assurez la cohérence avec la ligne éditoriale de la plateforme.", lien:{href:'dashboard-administrateur.html', label:'Contenu diaspora'} },
      { el:null, pos:'center', titre:"✅ Une ligne éditoriale forte", voice:"Un contenu de qualité fidélise les membres diaspora.", desc:"Planifiez vos publications à l'avance." }
    ]},
    'f-adm-observatoires': { badge:'📈 Observatoires (Éco/Coop/Instit.)', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Observatoires Économique, Coopération & Institutionnel", voice:"Trois tableaux de bord globaux pour piloter la plateforme à haut niveau.", desc:"Économique : flux et investissements. Coopération : partenariats inter-acteurs. Institutionnel : activité des collectivités." },
      { el:null, pos:'center', titre:"📊 Explorer chaque observatoire", voice:"Chaque observatoire propose ses propres indicateurs et filtres.", desc:"Utilisez-les pour des rapports internes ou des présentations stratégiques.", lien:{href:'dashboard-administrateur.html', label:'Observatoires'} },
      { el:null, pos:'center', titre:"✅ Une vision 360°", voice:"Complémentaires aux observatoires collectivité, ces vues sont réservées à l'administration.", desc:"Croisez-les avec les données Finances et Revenus par diaspora." }
    ]},
    'f-adm-revenus': { badge:'🗺️ Revenus par diaspora', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Revenus par diaspora", voice:"Visualisez la répartition géographique des revenus générés par la plateforme.", desc:"Quelles zones de diaspora génèrent le plus d'activité économique ?" },
      { el:null, pos:'center', titre:"🗺️ Cartographie des revenus", voice:"Une carte interactive répartit les revenus par pays et région.", desc:"Croisez avec Finances pour une vue complète.", lien:{href:'dashboard-administrateur.html', label:'Revenus par diaspora'} },
      { el:null, pos:'center', titre:"✅ Orienter la stratégie", voice:"Identifiez les zones prioritaires pour vos investissements marketing.", desc:"Suivez l'évolution trimestre après trimestre." }
    ]},
    'f-adm-finances': { badge:'💰 Finances', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Finances", voice:"Suivez les finances globales de la plateforme : commissions, wallet, flux Stripe.", desc:"Le tableau de bord financier consolidé de Diaspo'Actif." },
      { el:null, pos:'center', titre:"💳 Commissions et wallet", voice:"Chaque transaction (boutique, adhésions, billetterie) génère une commission suivie ici.", desc:"Le wallet de chaque compte Initiative retrace ses transactions entrantes et sortantes.", lien:{href:'dashboard-administrateur.html', label:'Finances'} },
      { el:null, pos:'center', titre:"✅ Une trésorerie maîtrisée", voice:"Un suivi rigoureux garantit la santé financière de la plateforme.", desc:"Exportez vos rapports pour la comptabilité." }
    ]},
    'f-adm-ventes': { badge:'🛒 Ventes & Transactions', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Ventes & Transactions", voice:"Consultez l'historique complet de toutes les ventes et transactions Stripe de la plateforme.", desc:"Boutique, billetterie, adhésions — chaque transaction est tracée." },
      { el:null, pos:'center', titre:"🔍 Rechercher une transaction", voice:"Filtrez par compte, date, statut de paiement.", desc:"Utile pour le support client en cas de litige ou de remboursement.", lien:{href:'dashboard-administrateur.html', label:'Ventes & Transactions'} },
      { el:null, pos:'center', titre:"✅ Une traçabilité complète", voice:"Chaque euro qui transite par la plateforme est traçable.", desc:"Croisez avec le module Finances pour la vue consolidée." }
    ]},
    'f-adm-plans': { badge:'📋 Plans & Abonnements', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Plans & Abonnements", voice:"Configurez les plans et abonnements proposés aux différents types de comptes.", desc:"Gratuit, premium, accréditations — définissez la grille tarifaire de la plateforme." },
      { el:null, pos:'center', titre:"⚙️ Créer ou modifier un plan", voice:"Ajustez les fonctionnalités incluses et le tarif de chaque plan.", desc:"Les changements s'appliquent aux nouveaux abonnements.", lien:{href:'dashboard-administrateur.html', label:'Plans & Abonnements'} },
      { el:null, pos:'center', titre:"✅ Une offre claire", voice:"Une grille tarifaire cohérente facilite la conversion des comptes gratuits.", desc:"Suivez le taux d'adoption de chaque plan." }
    ]},
    'f-adm-promotions': { badge:'🎯 Promotions', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Promotions", voice:"Créez et pilotez des campagnes promotionnelles à l'échelle de la plateforme.", desc:"Codes promo, offres limitées dans le temps, mise en avant de contenus." },
      { el:null, pos:'center', titre:"🎁 Lancer une promotion", voice:"Définissez la durée, le périmètre et l'avantage accordé.", desc:"Suivez le taux d'utilisation en temps réel.", lien:{href:'dashboard-administrateur.html', label:'Promotions'} },
      { el:null, pos:'center', titre:"✅ Stimuler l'engagement", voice:"Les promotions bien ciblées augmentent l'activité sur la plateforme.", desc:"Analysez les résultats après chaque campagne." }
    ]},
    'f-adm-communication': { badge:'✉️ Communication', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Communication", voice:"Envoyez des communications globales à l'ensemble ou à des segments de membres.", desc:"Newsletters, annonces importantes, alertes plateforme." },
      { el:null, pos:'center', titre:"📤 Rédiger et cibler", voice:"Segmentez votre audience par rôle, pays ou activité.", desc:"Prévisualisez avant l'envoi pour éviter toute erreur.", lien:{href:'dashboard-administrateur.html', label:'Communication'} },
      { el:null, pos:'center', titre:"✅ Un canal maîtrisé", voice:"Suivez les taux d'ouverture et ajustez votre stratégie de communication.", desc:"Espacez vos envois pour ne pas lasser vos membres." }
    ]},
    'f-adm-publications': { badge:'📢 Publications (modération)', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Publications (modération)", voice:"Supervisez et modérez l'ensemble des publications diffusées sur la plateforme.", desc:"Fil d'actualité, vitrines, publications d'événements — une vue centralisée." },
      { el:null, pos:'center', titre:"🛡️ Modérer un contenu", voice:"Retirez ou signalez un contenu qui ne respecte pas les règles de la plateforme.", desc:"Les publications signalées par les membres apparaissent en priorité.", lien:{href:'dashboard-administrateur.html', label:'Publications'} },
      { el:null, pos:'center', titre:"✅ Un espace sain", voice:"Une modération réactive préserve la qualité de la plateforme.", desc:"Documentez vos décisions pour rester cohérent dans le temps." }
    ]},
    'f-adm-moderation': { badge:'🛡️ Modération', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Modération", voice:"Traitez les signalements et modérez les contenus problématiques de la plateforme.", desc:"Le centre de modération centralise tous les signalements reçus." },
      { el:null, pos:'center', titre:"🚩 Traiter un signalement", voice:"Examinez le contenu signalé et prenez une décision : ignorer, avertir, ou suspendre.", desc:"Chaque décision est tracée pour garder un historique de modération.", lien:{href:'dashboard-administrateur.html', label:'Modération'} },
      { el:null, pos:'center', titre:"✅ Une communauté protégée", voice:"Une modération cohérente et réactive protège tous les membres.", desc:"Croisez avec le Journal d'erreurs pour détecter les abus techniques." }
    ]},
    'f-adm-suppression': { badge:'🗑️ Suppressions de comptes', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Demandes de suppression de comptes", voice:"Traitez les demandes de suppression définitive de compte, conformément au RGPD.", desc:"Chaque demande transite par l'administration avant toute suppression irréversible." },
      { el:null, pos:'center', titre:"📋 Examiner une demande", voice:"Échangez si besoin avec le membre avant de finaliser la suppression.", desc:"La suppression anonymise les données conformément à la réglementation.", lien:{href:'dashboard-administrateur.html', label:'Demandes de suppression'} },
      { el:null, pos:'center', titre:"✅ Conformité RGPD", voice:"Un traitement rigoureux de ces demandes protège la plateforme juridiquement.", desc:"Conservez une trace de chaque traitement effectué." }
    ]},
    'f-adm-publicites': { badge:'📣 Publicités (Ads)', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Publicités (Ads)", voice:"Validez et pilotez les campagnes publicitaires soumises par les comptes Initiative.", desc:"Chaque publicité est vérifiée avant diffusion sur la plateforme." },
      { el:null, pos:'center', titre:"✅ Valider une campagne", voice:"Vérifiez le contenu, le budget et le ciblage avant d'approuver.", desc:"Suivez les performances globales des campagnes actives.", lien:{href:'dashboard-administrateur.html', label:'Publicités'} },
      { el:null, pos:'center', titre:"✅ Un espace publicitaire sain", voice:"Un contrôle qualité rigoureux préserve la confiance des membres.", desc:"Refusez toute publicité non conforme à la charte." }
    ]},
    'f-adm-social-sync': { badge:'🔄 Sync réseaux sociaux', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Synchronisation réseaux sociaux", voice:"Configurez la synchronisation automatique avec les réseaux sociaux externes.", desc:"Facebook, LinkedIn, Instagram — diffusez automatiquement du contenu croisé." },
      { el:null, pos:'center', titre:"🔗 Connecter un réseau", voice:"Autorisez la connexion et définissez les règles de synchronisation.", desc:"Les membres peuvent aussi synchroniser leur propre compte depuis leur tableau de bord.", lien:{href:'dashboard-administrateur.html', label:'Synchronisation réseaux sociaux'} },
      { el:null, pos:'center', titre:"✅ Plus de portée", voice:"La synchronisation étend la visibilité du contenu Diaspo'Actif au-delà de la plateforme.", desc:"Surveillez les erreurs de synchronisation régulièrement." }
    ]},
    'f-adm-error-logs': { badge:'🩺 Journal d\'erreurs', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Journal d'erreurs", voice:"Le monitoring maison remplace un outil externe type Sentry pour suivre les erreurs applicatives.", desc:"Chaque erreur serveur ou client significative est journalisée ici." },
      { el:null, pos:'center', titre:"🔍 Diagnostiquer un incident", voice:"Consultez le détail technique de chaque erreur pour en identifier la cause.", desc:"Filtrez par gravité, page ou date pour prioriser les correctifs.", lien:{href:'dashboard-administrateur.html', label:'Journal d\'erreurs'} },
      { el:null, pos:'center', titre:"✅ Une plateforme fiable", voice:"Un suivi régulier permet de corriger les problèmes avant qu'ils n'impactent trop d'utilisateurs.", desc:"Croisez avec les retours du support pour prioriser." }
    ]},
    'f-adm-formations': { badge:'📚 Formations', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Formations", voice:"Gérez le catalogue de formations proposées sur la plateforme.", desc:"Validez les formations créées par les comptes accrédités « Créateur de formations »." },
      { el:null, pos:'center', titre:"✅ Modérer le catalogue", voice:"Vérifiez la qualité et la pertinence de chaque formation avant publication.", desc:"Retirez les formations obsolètes ou non conformes.", lien:{href:'dashboard-administrateur.html', label:'Formations'} },
      { el:null, pos:'center', titre:"✅ Un catalogue de qualité", voice:"Des formations pertinentes renforcent la valeur ajoutée de la plateforme.", desc:"Suivez les inscriptions par formation." }
    ]},
    'f-adm-chatbot': { badge:'🧠 Mémoire Chatbot', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Mémoire Chatbot", voice:"Alimentez la base de connaissances utilisée par les assistants IA de la plateforme.", desc:"Plus la mémoire est riche, plus les réponses du chatbot sont pertinentes." },
      { el:null, pos:'center', titre:"➕ Enrichir la base", voice:"Ajoutez des questions/réponses fréquentes ou des connaissances métier.", desc:"Les questions sans réponse remontées par les utilisateurs peuvent être intégrées ici.", lien:{href:'dashboard-administrateur.html', label:'Mémoire Chatbot'} },
      { el:null, pos:'center', titre:"✅ Un assistant plus performant", voice:"Une base de connaissances à jour améliore l'expérience de tous les membres.", desc:"Révisez régulièrement les réponses générées." }
    ]},
    'f-adm-oz-intel': { badge:'🤖 O-Z Intelligence', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"O-Z Intelligence", voice:"Pilotez et affinez le comportement de l'assistant IA O-Z présent sur toute la plateforme.", desc:"O-Z répond aux questions des membres par un moteur de règles, sans dépendre d'un LLM externe." },
      { el:null, pos:'center', titre:"⚙️ Ajuster les intentions", voice:"Configurez les intentions reconnues par O-Z et leurs réponses associées.", desc:"Surveillez les questions non comprises pour enrichir le moteur.", lien:{href:'dashboard-administrateur.html', label:'O-Z Intelligence'} },
      { el:null, pos:'center', titre:"✅ Un assistant cohérent partout", voice:"O-Z Intelligence garantit une expérience homogène sur tous les comptes.", desc:"Un seul réglage impacte instantanément toute la plateforme." }
    ]},
    'f-adm-onboarding': { badge:'🎓 Tutoriels d\'accueil', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Tutoriels d'accueil", voice:"Configurez les tutoriels de bienvenue proposés aux nouveaux comptes.", desc:"Le premier contact d'un nouveau membre avec la plateforme passe souvent par ces tutoriels." },
      { el:null, pos:'center', titre:"✏️ Adapter le parcours", voice:"Personnalisez le message et les étapes selon le type de compte créé.", desc:"C'est ici que sont configurés les tutoriels « Prise en main » par rôle du Centre des tutos.", lien:{href:'dashboard-administrateur.html', label:'Tutoriels d\'accueil'} },
      { el:null, pos:'center', titre:"✅ Un accueil réussi", voice:"Un bon onboarding réduit le taux d'abandon des nouveaux comptes.", desc:"Testez régulièrement le parcours du point de vue d'un nouvel utilisateur." }
    ]},
    'f-adm-packages': { badge:'📦 Package Diaspo\'Actif', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Package Diaspo'Actif", voice:"Gérez les packages d'offres groupées proposés sur la plateforme.", desc:"Des bouquets de fonctionnalités combinées, vendus comme une offre unique." },
      { el:null, pos:'center', titre:"⚙️ Composer un package", voice:"Associez plusieurs modules ou avantages dans une offre packagée.", desc:"Définissez le tarif global du package.", lien:{href:'dashboard-administrateur.html', label:'Package Diaspo\'Actif'} },
      { el:null, pos:'center', titre:"✅ Une offre différenciante", voice:"Les packages simplifient le choix pour les comptes hésitants.", desc:"Suivez leur taux d'adoption." }
    ]},
    'f-adm-deals-attrib': { badge:'🎖️ Attribution & Deals', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Attribution de Deal & Deals Diaspo'Actif", voice:"Attribuez des deals spéciaux et supervisez la marketplace Deals Diaspo'Actif.", desc:"Un dispositif complémentaire au module Deals classique, pour des offres pilotées par l'administration." },
      { el:null, pos:'center', titre:"🎁 Attribuer un deal", voice:"Sélectionnez le compte bénéficiaire et les conditions du deal accordé.", desc:"Suivez l'utilisation des deals attribués.", lien:{href:'dashboard-administrateur.html', label:'Attribution de Deal'} },
      { el:null, pos:'center', titre:"✅ Une marketplace dynamique", voice:"Des deals attractifs stimulent l'engagement des comptes Initiative.", desc:"Analysez régulièrement les deals les plus performants." }
    ]},
    'f-adm-deal-master': { badge:'⭐ Deal Master', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Deal Master", voice:"Gérez le statut et les privilèges du badge Deal Master, réservé aux comptes les plus actifs en collaboration.", desc:"Un badge de reconnaissance visible publiquement sur le profil." },
      { el:null, pos:'center', titre:"🏅 Attribuer le badge", voice:"Sélectionnez les comptes méritant le statut Deal Master selon leur activité.", desc:"Le badge peut être retiré en cas d'inactivité ou de manquement.", lien:{href:'dashboard-administrateur.html', label:'Deal Master'} },
      { el:null, pos:'center', titre:"✅ Valoriser l'excellence", voice:"Ce badge encourage une collaboration active et de qualité sur la plateforme.", desc:"Communiquez sur les nouveaux Deal Master pour valoriser la reconnaissance." }
    ]},
    'f-adm-parametres': { badge:'⚙️ Paramètres plateforme', couleur:'#374151', steps:[
      { el:null, pos:'center', badge:true, titre:"Paramètres plateforme", voice:"Configurez les paramètres généraux de la plateforme Diaspo'Actif.", desc:"Réglages globaux qui impactent l'ensemble des comptes." },
      { el:null, pos:'center', titre:"⚙️ Ajuster les réglages", voice:"Modifiez avec précaution : ces paramètres ont un impact plateforme entière.", desc:"Testez chaque changement important avant de le généraliser.", lien:{href:'dashboard-administrateur.html', label:'Paramètres'} },
      { el:null, pos:'center', titre:"✅ Une configuration maîtrisée", voice:"Documentez chaque changement de paramètre important.", desc:"Revenez ici pour tout réglage global de la plateforme." }
    ]},

    /* ── GESTION DES ASSOCIATIONS ── */
    'f-asso-accreditation': {
      badge:'🏅 Accréditation Asso', couleur:'#7c3aed',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Accréditation « Gestion des Associations »",
          voice:"L'accréditation Gestion des Associations est un module premium qui transforme votre compte en véritable outil de gouvernance associative.",
          desc:"Adhérents, cotisations, trésorerie, comptabilité intelligente, assemblées générales et votes électroniques — tout dans un espace sécurisé." },
        { el:null, pos:'center',
          titre:"🎖 Deux niveaux d'accréditation",
          voice:"Choisissez entre Association Vérifiée, le badge de confiance, et Association Accréditée, qui débloque tous les outils de gestion.",
          desc:"• Association Vérifiée — badge de confiance affiché sur votre profil\n• Association Accréditée — abonnement premium + tous les modules de gestion" },
        { el:null, pos:'center',
          titre:"📝 Faire votre demande",
          voice:"Depuis votre tableau de bord Initiative, le volet Accréditations affiche désormais la Gestion des Associations. Cliquez sur Découvrir et demander.",
          desc:"Tableau de bord → Accréditations DA → carte « Gestion des Associations » → Découvrir & demander.",
          lien:{href:'dashboard-initiative.html#accreditations', label:'Voir mes accréditations'} },
        { el:null, pos:'center', cta:'initiative',
          titre:"✅ Validation par l'équipe Diaspo'Actif",
          voice:"Après vérification de votre association et activation de l'abonnement, le badge est accordé et tous les modules se débloquent.",
          desc:"Une fois approuvée, la section « Gestion Association » apparaît dans votre menu avec adhérents, cotisations, finances et plus encore." }
      ]
    },

    'f-asso-adherents': {
      badge:'👥 Adhérents', couleur:'#7c3aed',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Gérer les adhérents",
          voice:"Le registre des adhérents centralise tous vos membres, leur statut et leur historique, en respectant strictement la confidentialité.",
          desc:"Numéro d'adhérent automatique, ancienneté calculée, statut (actif, suspendu, en attente) et carte de membre numérique." },
        { el:null, pos:'center',
          titre:"➕ Ajouter un membre",
          voice:"Ajoutez un adhérent manuellement ou rattachez un compte Diaspo'Actif existant, sans qu'il ait besoin d'un second compte.",
          desc:"Section Adhérents → + Nouvel adhérent → identité, statut, type d'adhésion. Les coordonnées personnelles restent masquées aux autres membres.",
          lien:{href:'dashboard-initiative.html#asso-adherents', label:'Mes adhérents'} },
        { el:null, pos:'center',
          titre:"🎫 Rôles & carte de membre",
          voice:"Attribuez des rôles — président, trésorier, secrétaire — qui déterminent les permissions de chacun. Chaque membre reçoit une carte avec QR Code.",
          desc:"Le QR Code sert au pointage des présences, au contrôle d'accès aux événements et à la vérification de l'adhésion." },
        { el:null, pos:'center', cta:'initiative',
          titre:"✅ Votre registre est prêt !",
          voice:"Retrouvez à tout moment l'historique des cotisations et participations de chaque adhérent.",
          desc:"Adhérents → fiche membre → historique complet des cotisations, votes et événements." }
      ]
    },

    'f-asso-cotisations': {
      badge:'💰 Cotisations', couleur:'#7c3aed',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Cotisations & relances automatiques",
          voice:"Le module de cotisations gère les paiements, leur suivi mois par mois et les relances automatiques des impayés.",
          desc:"Cotisations annuelles, mensuelles, trimestrielles ou personnalisées, avec suivi visuel par membre." },
        { el:null, pos:'center',
          titre:"💳 Encaisser un paiement",
          voice:"Vos membres paient par carte, PayPal, Mobile Money ou virement bancaire avec une référence générée automatiquement.",
          desc:"• Carte / PayPal / Stripe\n• Mobile Money (Orange Money, Wave…)\n• Virement bancaire → référence COTISATION-2026-PRENOM-NOM\n• Validation du virement par le trésorier",
          lien:{href:'dashboard-initiative.html#asso-cotisations', label:'Mes cotisations'} },
        { el:null, pos:'center',
          titre:"🔔 Relances automatiques",
          voice:"Activez le moteur de relances : la plateforme détecte les retards et envoie des rappels gradués à J plus 7, 15, 30 et 60.",
          desc:"Niveaux INFO → WARNING → URGENT → DERNIER AVIS. Suspension automatique possible au-delà du dernier jalon." },
        { el:null, pos:'center', cta:'initiative',
          titre:"✅ Trésorerie maîtrisée !",
          voice:"Le tableau de bord du trésorier affiche en temps réel les montants encaissés, en attente et en retard.",
          desc:"Tableau de bord trésorier → cotisations encaissées, en attente, retards et taux de recouvrement." }
      ]
    },

    'f-asso-tresorerie': {
      badge:'📊 Trésorerie', couleur:'#7c3aed',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Trésorerie & comptabilité intelligente",
          voice:"Tenez la comptabilité de votre association sans effort : recettes, dépenses, budgets et bilans automatiques.",
          desc:"Multi-comptes, multi-devises (EUR, XOF, XAF, USD…), calculs automatiques et piste d'audit complète." },
        { el:null, pos:'center',
          titre:"📷 Numériser une facture (OCR)",
          voice:"Photographiez ou importez une facture : l'intelligence artificielle extrait le fournisseur, le montant et la TVA automatiquement.",
          desc:"Facture PDF ou photo → OCR → classement automatique par année et trimestre → détection des doublons → coffre-fort numérique.",
          lien:{href:'dashboard-initiative.html#asso-finances', label:'Ma trésorerie'} },
        { el:null, pos:'center',
          titre:"📈 Budgets & rapports",
          voice:"Définissez des budgets par catégorie et comparez le prévu au réel. Les rapports financiers se génèrent automatiquement.",
          desc:"Budget prévu vs réel par catégorie • rapports mensuels, trimestriels et annuels • alertes de dépassement." },
        { el:null, pos:'center', cta:'initiative',
          titre:"✅ Comptabilité transparente !",
          voice:"Chaque opération est tracée et aucune écriture ne peut être supprimée : la transparence est totale.",
          desc:"Trésorerie → audit → historique horodaté de toutes les opérations et validations." }
      ]
    },

    'f-asso-assemblee': {
      badge:'🗳️ Assemblées & Votes', couleur:'#7c3aed',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Assemblées générales & votes électroniques",
          voice:"Organisez une assemblée générale en un seul clic, avec convocation, ordre du jour et émargement automatiques.",
          desc:"Convocation auto, ordre du jour généré, émargement QR Code, visioconférence, vote sécurisé et procès-verbal." },
        { el:null, pos:'center',
          titre:"📋 Créer une assemblée",
          voice:"La création en un clic génère la convocation et l'ordre du jour. Définissez le quorum requis pour valider les décisions.",
          desc:"Assemblées → Nouvelle AG → date, lieu ou visio, quorum. La convocation et l'ordre du jour sont pré-remplis automatiquement.",
          lien:{href:'dashboard-initiative.html#asso-votes', label:'Mes assemblées & votes'} },
        { el:null, pos:'center',
          titre:"🗳️ Lancer un vote",
          voice:"Créez des votes de résolution, des élections ou des consultations, en mode public ou secret.",
          desc:"• Résolution / Élection / Consultation / Budget\n• Vote public ou secret (anonyme)\n• Résultats calculés et archivés automatiquement avec horodatage." },
        { el:null, pos:'center', cta:'initiative',
          titre:"✅ Gouvernance simplifiée !",
          voice:"Le contrôle du quorum, le procès-verbal et l'archivage sont gérés automatiquement par la plateforme.",
          desc:"Quorum vérifié en temps réel → PV généré → archivage sécurisé de toutes les décisions." }
      ]
    },

    /* ── AGENDA ── */
    'f-agenda': {
      badge:'📆 Agenda', couleur:'#0f766e',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Utiliser votre agenda",
          voice:"Votre agenda centralise tous vos rendez-vous, réunions et événements sur la plateforme.",
          desc:"Synchronisez vos événements, planifiez des rendez-vous et recevez des rappels automatiques." },
        { el:'a[href="evenements.html"]', pos:'bottom',
          titre:"📆 Accéder à l'agenda",
          voice:"Accédez à votre agenda depuis le menu Événements ou votre tableau de bord.",
          desc:"Menu → Événements → vue Agenda. Ou Tableau de bord → section Calendrier.",
          lien:{href:'evenements.html', label:'Mon agenda'} },
        { el:null, pos:'center',
          titre:"📌 Ajouter un rendez-vous",
          voice:"Créez des rendez-vous individuels ou collectifs avec d'autres membres de la plateforme.",
          desc:"+ Nouveau rendez-vous → titre, participants, date, lieu ou lien visio. Les invités reçoivent une notification." },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Organisez votre temps !",
          voice:"Votre agenda est synchronisable avec Google Calendar et les autres outils de planification.",
          desc:"Retrouvez tous vos événements, réunions et rendez-vous diaspora au même endroit." }
      ]
    },

    /* ── DEAL ── */
    'f-deal': {
      badge:'🤝 Deal', couleur:'#15803d',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Créer un Deal de collaboration",
          voice:"Un Deal est une proposition de collaboration ouverte à toute la communauté diaspora.",
          desc:"Offres d'emploi, bénévolat, partenariat, prestation de service — publiez et recevez des candidatures." },
        { el:'a[href="offres.html"],a[href="deals.html"]', pos:'bottom',
          titre:"📋 Accéder aux Deals",
          voice:"Accédez aux Deals depuis le menu principal de la plateforme.",
          desc:"Menu → Deals / Offres → bouton '+ Créer un Deal'.",
          lien:{href:'offres.html', label:'Créer un Deal'} },
        { el:null, pos:'center',
          titre:"✍️ Rédiger votre Deal",
          voice:"Décrivez précisément votre besoin, les compétences requises et les conditions proposées.",
          desc:"• Type (emploi / bénévolat / partenariat / prestation)\n• Description détaillée\n• Compétences recherchées\n• Durée et rémunération\n• Localisation ou distanciel" },
        { el:null, pos:'center',
          titre:"🎯 Cibler les bons profils",
          voice:"Définissez les critères de votre Deal pour attirer les profils correspondants.",
          desc:"Pays cible, secteur, niveau d'expérience, disponibilité. Les profils correspondants reçoivent une notification." },
        { el:null, pos:'center', cta:'initiative',
          titre:"✅ Votre Deal est publié !",
          voice:"Votre Deal est maintenant visible par des milliers de membres qualifiés.",
          desc:"Gérez vos candidatures depuis le tableau de bord → section Mes Deals." }
      ]
    },

    /* ── PROJET ── */
    'f-projet': {
      badge:'📋 Projet', couleur:'#1e3a8a',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Créer un projet collaboratif",
          voice:"La gestion de projet intégrée vous permet de collaborer avec des membres de la diaspora monde entier.",
          desc:"Lancez un projet, invitez des membres, assignez des tâches et suivez l'avancement en temps réel." },
        { el:null, pos:'center',
          titre:"🚀 Lancer un projet",
          voice:"Depuis votre tableau de bord, créez un nouveau projet et définissez ses objectifs.",
          desc:"Tableau de bord → Mes Projets → Nouveau Projet → nom, description, date de livraison, membres.",
          lien:{href:'dashboard-utilisateur.html', label:'Mes projets'} },
        { el:null, pos:'center',
          titre:"👥 Inviter des collaborateurs",
          voice:"Invitez des membres depuis l'annuaire ou parmi vos connexions existantes.",
          desc:"Recherchez des profils par compétences → Inviter au projet → ils reçoivent une notification." },
        { el:null, pos:'center',
          titre:"✅ Assigner des tâches",
          voice:"Créez des tâches, assignez-les aux membres et suivez la progression avec un tableau Kanban.",
          desc:"Tâches → Assigner → Délai → Statut (À faire / En cours / Terminé). Notifications automatiques." },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Votre projet collaboratif est lancé !",
          voice:"Collaborez avec des talents diaspora du monde entier sur vos projets.",
          desc:"Créez votre premier projet et invitez vos connexions à rejoindre l'aventure." }
      ]
    },

    /* ── CONTRAT ── */
    'f-contrat': {
      badge:'📄 Contrat', couleur:'#374151',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Signer un contrat sur Diaspo'Actif",
          voice:"La signature électronique intégrée vous permet de formaliser vos collaborations sans quitter la plateforme.",
          desc:"Contrats de prestation, accords de partenariat, lettres de mission — signés et archivés en ligne." },
        { el:null, pos:'center',
          titre:"📝 Créer un contrat",
          voice:"Utilisez un modèle existant ou rédigez votre propre contrat depuis votre tableau de bord.",
          desc:"Tableau de bord → Contrats → Nouveau contrat → choisir un modèle ou rédiger librement.",
          lien:{href:'dashboard-utilisateur.html', label:'Mes contrats'} },
        { el:null, pos:'center',
          titre:"✍️ Signature électronique",
          voice:"Envoyez le contrat aux signataires. Chacun reçoit un email avec un lien de signature sécurisé.",
          desc:"Ajoutez les signataires → envoyez → chaque partie signe électroniquement avec horodatage légal." },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Vos collaborations sont sécurisées !",
          voice:"Les contrats signés sont archivés et téléchargeables en PDF depuis votre espace.",
          desc:"Retrouvez tous vos contrats signés et en attente dans Tableau de bord → Contrats." }
      ]
    },

    /* ── VISIOCONFÉRENCE ── */
    'f-visio': {
      badge:'📹 Visioconférence', couleur:'#0369a1',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Organiser une visioconférence",
          voice:"Lancez des appels vidéo directs ou planifiez des réunions avec plusieurs membres diaspora.",
          desc:"Appels vidéo HD, réunions de groupe, partage d'écran — directement intégrés à la plateforme." },
        { el:'a[href="messagerie.html"]', pos:'bottom',
          titre:"📹 Lancer un appel vidéo",
          voice:"Dans la messagerie, cliquez sur l'icône caméra pour démarrer un appel vidéo direct.",
          desc:"Messagerie → ouvrez une conversation → icône 📹 → appel vidéo HD lancé instantanément.",
          lien:{href:'messagerie.html', label:'Messagerie'} },
        { el:null, pos:'center',
          titre:"📅 Planifier une réunion",
          voice:"Planifiez une réunion avec plusieurs participants et envoyez les invitations automatiquement.",
          desc:"Agenda → Nouvelle réunion → invitez jusqu'à 50 participants → lien de réunion généré automatiquement.",
          lien:{href:'reunions.html', label:'Mes réunions'} },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Réunissez votre réseau !",
          voice:"Les réunions sont enregistrables et les liens restent actifs pour les absents.",
          desc:"Partage d'écran, tableau blanc, chat en direct — tout ce qu'il faut pour une réunion productive." }
      ]
    },

    /* ── RECHERCHE ── */
    'f-recherche': {
      badge:'🔍 Recherche', couleur:'#6366f1',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Effectuer une recherche avancée",
          voice:"Le moteur de recherche Diaspo Actif vous permet de trouver n'importe quel profil, initiative ou contenu.",
          desc:"Recherche par mots-clés, filtres avancés, localisation, secteur et bien plus encore." },
        { el:'a[href="recherche.html"],input[type="search"],#search-input,.search-input', pos:'bottom',
          titre:"🔍 Accéder à la recherche",
          voice:"Cliquez sur la loupe dans la barre de navigation ou accédez à la page Recherche avancée.",
          desc:"Barre de navigation → icône 🔍 pour une recherche rapide. Page Recherche pour les filtres avancés.",
          lien:{href:'recherche.html', label:'Recherche avancée'} },
        { el:null, pos:'center',
          titre:"🎛️ Utiliser les filtres",
          voice:"Affinez vos résultats avec les filtres par type, pays, secteur et disponibilité.",
          desc:"• Type (membre / initiative / événement / deal)\n• Pays d'origine ou de résidence\n• Secteur d'activité\n• Disponibilité et statut" },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Trouvez exactement ce que vous cherchez !",
          voice:"La recherche avancée indexe tous les profils, initiatives et contenus de la plateforme.",
          desc:"Combinez plusieurs filtres pour des résultats ultra-précis." }
      ]
    },

    /* ── O-Z ASSISTANT ── */
    'f-oz': {
      badge:'🤖 O-Z', couleur:'#1e3a8a',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Utiliser O-Z, votre assistant IA",
          voice:"O-Z est l'assistant intelligent de Diaspo Actif, disponible vingt-quatre heures sur vingt-quatre.",
          desc:"Posez n'importe quelle question à O-Z : navigation, recherche, aide, recommandations." },
        { el:'#oz-fab,.oz-fab,#chatbot-fab', pos:'top',
          titre:"🤖 Ouvrir O-Z",
          voice:"Cliquez sur l'icône O-Z en bas à droite de l'écran pour ouvrir le chat.",
          desc:"L'icône est toujours visible en bas à droite. Cliquez dessus pour démarrer une conversation." },
        { el:null, pos:'center',
          titre:"💬 Exemples de questions",
          voice:"Vous pouvez demander à O-Z de trouver des profils, d'expliquer une fonctionnalité ou de vous guider.",
          desc:"• 'Trouve-moi des initiatives en agriculture au Sénégal'\n• 'Comment créer un événement ?'\n• 'Montre-moi les derniers Deals disponibles'\n• 'Qui peut m'aider avec du financement ?'" },
        { el:null, pos:'center',
          titre:"🌐 O-Z parle plusieurs langues",
          voice:"O-Z comprend le français, l'anglais, l'espagnol, le portugais et l'arabe.",
          desc:"Écrivez dans la langue de votre choix. O-Z s'adapte automatiquement à votre langue." },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ O-Z est votre copilote !",
          voice:"O-Z apprend de vos préférences pour vous proposer des recommandations de plus en plus pertinentes.",
          desc:"Essayez maintenant en posant votre première question à O-Z !" }
      ]
    },

    /* ── GROUPES ── */
    'f-groupes': {
      badge:'👥 Groupes', couleur:'#7c3aed',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Créer et gérer un groupe",
          voice:"Les groupes permettent de rassembler des membres autour d'un thème, d'un pays ou d'un projet commun.",
          desc:"Groupes publics, privés ou secrets — vous contrôlez l'accès et l'animation." },
        { el:null, pos:'center',
          titre:"➕ Créer un groupe",
          voice:"Depuis le menu, accédez à Groupes et cliquez sur Créer un groupe.",
          desc:"Nom → description → catégorie → type (public / privé / secret) → photo de couverture → créer.",
          lien:{href:'fil-actualite.html', label:'Accéder aux groupes'} },
        { el:null, pos:'center',
          titre:"📢 Animer votre groupe",
          voice:"Publiez du contenu, organisez des discussions et des événements exclusifs pour vos membres.",
          desc:"Publications exclusives, sondages de groupe, événements réservés aux membres, annonces." },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Votre communauté vous attend !",
          voice:"Les groupes actifs attirent de nouveaux membres automatiquement via l'algorithme de recommandation.",
          desc:"Créez votre groupe et invitez vos connexions à rejoindre la communauté." }
      ]
    },

    /* ── VÉRIFICATION ── */
    'f-verification': {
      badge:'✅ Vérification', couleur:'#15803d',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Faire vérifier votre compte",
          voice:"La vérification d'identité renforce votre crédibilité et débloque des fonctionnalités avancées.",
          desc:"Un compte vérifié obtient un badge de confiance visible par toute la communauté." },
        { el:null, pos:'center',
          titre:"📋 Documents requis",
          voice:"Préparez une pièce d'identité valide et un justificatif de domicile récent.",
          desc:"• Passeport ou carte d'identité nationale\n• Justificatif de domicile de moins de 3 mois\n• Photo de profil claire (optionnel)" },
        { el:null, pos:'center',
          titre:"📤 Soumettre votre dossier",
          voice:"Depuis votre profil, accédez à la section Vérification et uploadez vos documents.",
          desc:"Profil → section Vérification → uploader les documents → soumettre. Traitement sous 24-48h.",
          lien:{href:'profil.html', label:'Demander la vérification'} },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Badge de confiance débloqué !",
          voice:"Une fois vérifié, votre badge apparaît sur votre profil, vos publications et dans l'annuaire.",
          desc:"Les membres vérifiés reçoivent 2× plus de réponses à leurs demandes de connexion." }
      ]
    },

    /* ── STATS UTILISATEUR ── */
    'f-stats': {
      badge:'📊 Statistiques', couleur:'#0f766e',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Comprendre vos statistiques",
          voice:"Vos statistiques vous montrent l'impact de votre présence sur la plateforme.",
          desc:"Vues du profil, interactions, croissance du réseau — tout est mesuré en temps réel." },
        { el:'a[href="dashboard-utilisateur.html"],a[href="dashboard-initiative.html"]', pos:'bottom',
          titre:"📈 Accéder aux statistiques",
          voice:"Retrouvez vos statistiques dans votre tableau de bord, section Statistiques.",
          desc:"Tableau de bord → section Statistiques. Vue quotidienne, hebdomadaire ou mensuelle.",
          lien:{href:'dashboard-utilisateur.html', label:'Mon tableau de bord'} },
        { el:null, pos:'center',
          titre:"🔑 Indicateurs clés",
          voice:"Suivez les vues de votre profil, le nombre de connexions, les interactions sur vos publications.",
          desc:"• 👁️ Vues du profil\n• 🤝 Nouvelles connexions\n• 💬 Interactions (likes, commentaires)\n• 📢 Portée de vos publications\n• 🔍 Apparitions dans la recherche" },
        { el:null, pos:'center', cta:'utilisateur',
          titre:"✅ Optimisez votre présence !",
          voice:"Analysez vos statistiques pour identifier ce qui fonctionne et amplifier votre impact.",
          desc:"Publiez aux heures de pointe et complétez votre profil pour booster vos statistiques." }
      ]
    },

    /* ── ADMIN : GESTION UTILISATEURS ── */
    'a-users': {
      badge:'👥 Admin — Utilisateurs', couleur:'#374151',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Gérer les utilisateurs",
          voice:"Le dashboard administrateur vous donne un accès complet à tous les comptes de la plateforme.",
          desc:"Recherchez, vérifiez, suspendez ou modifiez n'importe quel compte depuis le dashboard." },
        { el:'a[href="dashboard-administrateur.html"]', pos:'bottom',
          titre:"🖥️ Accéder à la gestion",
          voice:"Depuis le dashboard admin, accédez à la section Utilisateurs.",
          desc:"Dashboard → section Utilisateurs → liste complète avec filtres.",
          lien:{href:'dashboard-administrateur.html', label:'Dashboard Admin'} },
        { el:null, pos:'center',
          titre:"🔍 Rechercher un compte",
          voice:"Cherchez un utilisateur par nom, email, rôle ou statut de vérification.",
          desc:"Filtres : nom, email, rôle, pays, statut (actif / suspendu / vérifié), date d'inscription." },
        { el:null, pos:'center',
          titre:"⚙️ Actions disponibles",
          voice:"Pour chaque compte, vous pouvez voir le profil, modifier le rôle, vérifier, suspendre ou supprimer.",
          desc:"• Voir le profil public\n• Modifier le rôle\n• Accorder/révoquer la vérification\n• Suspendre le compte\n• Supprimer définitivement" },
        { el:null, pos:'center', cta:'administrateur',
          titre:"✅ Maîtrisez la gestion des comptes !",
          voice:"Toutes les actions sont tracées dans les logs d'administration pour audit.",
          desc:"Chaque action est horodatée et conservée dans les logs pour traçabilité complète." }
      ]
    },

    /* ── ADMIN : MODÉRATION TÉMOIGNAGES ── */
    'a-temoignages': {
      badge:'💬 Admin — Témoignages', couleur:'#374151',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Modérer les témoignages",
          voice:"Les témoignages soumis par les membres doivent être approuvés avant publication sur l'accueil.",
          desc:"Système de score automatique + validation manuelle avant affichage sur la homepage." },
        { el:'a[href="dashboard-administrateur.html"]', pos:'bottom',
          titre:"💬 Accéder aux témoignages",
          voice:"Dashboard admin, section Témoignages.",
          desc:"Dashboard → Témoignages → liste de tous les avis soumis avec leur score de pertinence.",
          lien:{href:'dashboard-administrateur.html', label:'Dashboard Admin'} },
        { el:null, pos:'center',
          titre:"⭐ Score de pertinence automatique",
          voice:"Chaque témoignage reçoit un score automatique basé sur sa longueur, sa note et son contenu.",
          desc:"Score calculé sur : longueur (2 pts), note ≥4 (2 pts), points positifs (1 pt), suggestions (1 pt), consentement (1 pt). Max : 7 pts." },
        { el:null, pos:'center', cta:'administrateur',
          titre:"✅ Modérez et valorisez les avis !",
          voice:"Les témoignages approuvés apparaissent automatiquement dans le carousel de la page d'accueil.",
          desc:"Approuvés → affichés homepage. Refusés → notifiés à l'auteur. Signalés → mis de côté pour examen." }
      ]
    },

    /* ── ADMIN : PARTENAIRES ── */
    'a-partenaires': {
      badge:'🏅 Admin — Partenaires', couleur:'#b45309',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Gérer les Partenaires Officiels",
          voice:"Les Partenaires Officiels bénéficient d'une visibilité prioritaire sur toute la plateforme.",
          desc:"Attribuez le statut, configurez la visibilité et gérez les partenariats depuis le dashboard." },
        { el:'a[href="dashboard-administrateur.html"]', pos:'bottom',
          titre:"🏅 Section Partenaires",
          voice:"Dashboard admin, section Partenaires Officiels.",
          desc:"Dashboard → Partenaires Officiels → liste des partenaires actifs, en attente et expirés.",
          lien:{href:'dashboard-administrateur.html', label:'Dashboard Admin'} },
        { el:null, pos:'center',
          titre:"➕ Attribuer le statut",
          voice:"Recherchez un compte existant et attribuez-lui le statut de Partenaire Officiel.",
          desc:"Chercher un compte → Attribuer Partenaire Officiel → configurer : catégorie, priorité, visibilité, durée, slogan." },
        { el:null, pos:'center',
          titre:"🔧 Configurer la visibilité",
          voice:"Choisissez le niveau de visibilité, la priorité d'affichage et les domaines d'expertise affichés.",
          desc:"Niveaux : Public / Membres / Premium. Priorité 1-10. Mise en avant homepage oui/non. Slogan." },
        { el:null, pos:'center', cta:'administrateur',
          titre:"✅ Partenariats gérés !",
          voice:"Les partenaires expirant bientôt génèrent des alertes automatiques dans le dashboard.",
          desc:"Alertes automatiques 30 jours avant expiration. Renouvellement en un clic." }
      ]
    },

    /* ── ADMIN : DEALS ── */
    'a-deals': {
      badge:'🤝 Admin — Deals', couleur:'#374151',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Superviser les Deals",
          voice:"En tant qu'administrateur, vous supervisez tous les Deals publiés sur la plateforme.",
          desc:"Validation, modération des contenus inappropriés, gestion des litiges entre parties." },
        { el:null, pos:'center',
          titre:"📋 Liste des Deals",
          voice:"Accédez à la liste complète des Deals depuis le dashboard admin, section Deal Master.",
          desc:"Dashboard → Deal Master → filtres par statut (actif / en attente / signalé / clôturé).",
          lien:{href:'dashboard-administrateur.html', label:'Dashboard Admin'} },
        { el:null, pos:'center',
          titre:"🚩 Traiter les signalements",
          voice:"Les Deals signalés par des membres apparaissent en priorité pour modération.",
          desc:"Deal signalé → examiner le contenu → approuver, modifier, ou retirer le Deal avec notification à l'auteur." },
        { el:null, pos:'center', cta:'administrateur',
          titre:"✅ La marketplace est sous contrôle !",
          voice:"Tous les deals retirés sont archivés et consultables dans les logs d'administration.",
          desc:"Logs complets de toutes les actions de modération pour audit et traçabilité." }
      ]
    },

    /* ── ADMIN : STATS GLOBALES ── */
    'a-stats': {
      badge:'📊 Admin — Statistiques', couleur:'#0f766e',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Statistiques globales de la plateforme",
          voice:"Le dashboard admin présente toutes les métriques globales de Diaspo Actif en temps réel.",
          desc:"Membres, publications, deals, revenus, croissance — tout en un seul tableau de bord." },
        { el:'a[href="dashboard-administrateur.html"]', pos:'bottom',
          titre:"📈 Métriques clés",
          voice:"Le tableau de bord affiche les indicateurs essentiels de santé de la plateforme.",
          desc:"• 👥 Total membres & croissance\n• 📝 Publications / jour\n• 🤝 Deals actifs\n• 💬 Messages échangés\n• 🌍 Répartition géographique",
          lien:{href:'dashboard-administrateur.html', label:'Dashboard Admin'} },
        { el:null, pos:'center',
          titre:"📅 Rapports périodiques",
          voice:"Générez des rapports hebdomadaires et mensuels pour suivre l'évolution de la plateforme.",
          desc:"Rapport hebdomadaire → export CSV/PDF. Comparaison période précédente. Tendances automatiques." },
        { el:null, pos:'center', cta:'administrateur',
          titre:"✅ Pilotez avec les données !",
          voice:"Les statistiques vous permettent de prendre des décisions basées sur les données réelles.",
          desc:"Consultez les stats tous les lundis pour piloter les actions de la semaine." }
      ]
    },

    /* ── ADMIN : FAQ & SIGNALEMENTS ── */
    'a-faq': {
      badge:'🚩 Admin — Signalements', couleur:'#dc2626',
      steps:[
        { el:null, pos:'center', badge:true,
          titre:"Gérer la FAQ & les signalements",
          voice:"Les questions sans réponse et les signalements nécessitent une attention prioritaire.",
          desc:"Interface centralisée pour traiter les questions membres et modérer les contenus signalés." },
        { el:null, pos:'center',
          titre:"❓ Questions sans réponse",
          voice:"Les questions posées à O-Z sans réponse satisfaisante remontent ici pour traitement manuel.",
          desc:"Dashboard → FAQ SAR → liste des questions non résolues → répondre → publier dans la FAQ.",
          lien:{href:'dashboard-administrateur.html', label:'Dashboard Admin'} },
        { el:null, pos:'center',
          titre:"🚩 Traiter les signalements",
          voice:"Profils, publications et messages signalés par des membres apparaissent ici pour modération.",
          desc:"Signalement → examiner → actions : avertir, modifier, supprimer, bannir temporairement ou définitivement." },
        { el:null, pos:'center', cta:'administrateur',
          titre:"✅ Plateforme sécurisée !",
          voice:"Traiter rapidement les signalements garantit un environnement sain et professionnel pour tous.",
          desc:"Objectif : répondre à tout signalement sous 24h. Alertes automatiques pour les cas urgents." }
      ]
    }

  };

  /* ── Lancer un tutoriel fonctionnel par son id ── */
  function launchFeature(id) {
    const feat = STEPS_FONCTIONS[id];
    if (!feat) { launch('utilisateur'); return; }
    injectStyles();
    stopSpeech();

    const overlay = buildOverlay();
    const card    = document.getElementById('da-demo-card');
    const sp      = document.getElementById('da-demo-spotlight');
    const progEl  = document.getElementById('da-demo-progress');
    const badgeWrap = document.getElementById('da-demo-badge-wrap');
    const badgeEl = document.getElementById('da-demo-badge');
    const stepLbl = document.getElementById('da-demo-step-label');
    const titleEl = document.getElementById('da-demo-title');
    const descEl  = document.getElementById('da-demo-desc');
    const lienWrap= document.getElementById('da-demo-lien-wrap');
    const lienEl  = document.getElementById('da-demo-lien');
    const ctaEl   = document.getElementById('da-demo-cta-block');
    const nextBtn = document.getElementById('da-demo-next');
    const prevBtn = document.getElementById('da-demo-prev');
    const skipBtn = document.getElementById('da-demo-skip');
    const muteBtn = document.getElementById('da-demo-mute-btn');
    const langSel = document.getElementById('da-demo-lang-select');

    card.style.setProperty('--da-color', feat.couleur || '#1e3a8a');
    nextBtn.style.background = feat.couleur || '#1e3a8a';

    /* Sélecteur langue */
    Object.keys(LANGS).forEach(l => {
      const opt = document.createElement('option');
      opt.value = l; opt.textContent = LANGS[l].label;
      if (l === _lang) opt.selected = true;
      langSel.appendChild(opt);
    });
    langSel.addEventListener('change', () => {
      _lang = langSel.value; localStorage.setItem('da_tuto_lang', _lang);
      stopSpeech(); launchFeature(id);
    });

    function updateMuteBtn() { muteBtn.textContent = _muted ? ui('voix_off') : ui('voix_on'); }
    updateMuteBtn();
    muteBtn.addEventListener('click', () => {
      _muted = !_muted; localStorage.setItem('da_tuto_muted', _muted ? '1' : '0');
      updateMuteBtn(); if (_muted) stopSpeech();
    });

    const steps = feat.steps;
    let cur = 0;

    function render() {
      const step = steps[cur];
      progEl.innerHTML = steps.map((_,i) => {
        let cls = 'da-dot';
        if (i === cur) cls += ' active'; else if (i < cur) cls += ' done';
        return `<span class="${cls}"></span>`;
      }).join('');
      if (step.badge) { badgeEl.textContent = feat.badge; badgeEl.style.background = feat.couleur || '#1e3a8a'; badgeWrap.style.display = 'block'; }
      else { badgeWrap.style.display = 'none'; }
      stepLbl.textContent = `${ui('step')} ${cur+1} ${ui('sur')} ${steps.length}`;
      titleEl.textContent = step.titre;
      descEl.textContent  = step.desc;
      nextBtn.textContent  = cur === steps.length-1 ? ui('terminer') : ui('suivant');
      prevBtn.textContent  = ui('precedent');
      skipBtn.textContent  = ui('passer');
      prevBtn.style.display = cur > 0 ? 'inline-block' : 'none';
      skipBtn.style.display = cur === steps.length-1 ? 'none' : 'inline-block';
      if (step.lien) { lienEl.href = step.lien.href; lienEl.textContent = ui('voir') + ' ' + step.lien.label; lienWrap.style.display = 'block'; }
      else { lienWrap.style.display = 'none'; }
      if (step.cta) {
        const ctaBtns = CTA[step.cta] || CTA.utilisateur;
        ctaEl.innerHTML = ctaBtns.map((b,i) => `<a href="${b.href}" class="da-cta-btn ${i===0?'da-cta-p':'da-cta-s'}" ${i===0?`style="background:${feat.couleur||'#1e3a8a'}"`:''}">${b.label}</a>`).join('');
        ctaEl.style.display = 'flex';
      } else { ctaEl.style.display = 'none'; }
      const targetEl = findEl(step.el);
      spotlightEl(sp, targetEl);
      positionCard(card, targetEl, step.pos);
      showArrow(targetEl);
      if (targetEl) { targetEl.scrollIntoView({behavior:'smooth',block:'center'}); setTimeout(() => animateCursorTo(targetEl), 500); }
      else { const cur2 = document.getElementById('da-virtual-cursor'); if (cur2) cur2.style.display = 'none'; }
      speak(step.voice || step.titre);
    }

    function finish() {
      stopSpeech(); overlay.style.display = 'none'; overlay.remove();
      document.getElementById('da-virtual-cursor')?.remove();
      document.getElementById('da-demo-arrow')?.remove();
    }

    nextBtn.addEventListener('click', () => { stopSpeech(); if (cur === steps.length-1) finish(); else { cur++; render(); } });
    prevBtn.addEventListener('click', () => { stopSpeech(); if (cur > 0) { cur--; render(); } });
    skipBtn.addEventListener('click', () => { stopSpeech(); finish(); });
    document.getElementById('da-demo-backdrop').addEventListener('click', () => { stopSpeech(); finish(); });
    overlay.style.display = 'block';
    render();
  }

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
    launchFeature,
    hasFeature: (id) => !!STEPS_FONCTIONS[id],
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

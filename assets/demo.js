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

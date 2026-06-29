/* ===========================================================
   DIASPO'ACTIF — Données fictives (démo)
   =========================================================== */

const INITIATIVES = [
  {
    id: "aito",
    nom: "Association des Ivoiriens de Toulouse et de l'Occitanie",
    sigle: "A.I.T.O",
    pays: "Côte d'Ivoire",
    region: "Occitanie",
    ville: "Toulouse, France",
    zone: "Europe de l'Ouest",
    nationalite1: "Ivoirienne",
    nationalite2: "Française",
    nationalites_concernees: ["Diaspora ivoirienne"],
    nationalite_unique: true,
    domaine: "Action Sociale",
    type: "Association",
    membres: 342,
    vues: 1200,
    abonnes: 215,
    description: "Fédère la diaspora ivoirienne d'Occitanie autour de l'entraide, la culture et l'entrepreneuriat. Organise forums et galas de solidarité.",
    lat: 43.6, lon: 1.4
  },
  {
    id: "tech4senegal",
    nom: "Tech For Senegal",
    sigle: "TFS",
    pays: "Sénégal",
    region: "Dakar",
    ville: "Dakar, Sénégal",
    zone: "Afrique de l'Ouest",
    nationalite1: "Sénégalaise",
    nationalite2: "Canadienne",
    nationalites_concernees: ["Diaspora sénégalaise", "Toutes nationalités"],
    nationalite_unique: false,
    domaine: "Technologie",
    type: "ONG",
    membres: 580,
    vues: 3400,
    abonnes: 410,
    description: "Projet d'agriculture connectée porté par des ingénieurs de la diaspora sénégalaise. Recherche actuellement des compétences en IoT.",
    lat: 14.7, lon: -17.4
  },
  {
    id: "mali-sante",
    nom: "Santé Sans Frontière Mali",
    sigle: "SSF",
    pays: "Mali",
    region: "Bamako",
    ville: "Bamako, Mali",
    zone: "Afrique de l'Ouest",
    nationalite1: "Malienne",
    nationalite2: "Belge",
    nationalites_concernees: ["Diaspora malienne"],
    nationalite_unique: true,
    domaine: "Santé",
    type: "Fondation",
    membres: 198,
    vues: 980,
    abonnes: 140,
    description: "Finance des équipements médicaux dans les zones rurales maliennes grâce aux contributions de la diaspora en Belgique.",
    lat: 12.6, lon: -8.0
  },
  {
    id: "coop-cacao",
    nom: "Coopérative Cacao Solidaire",
    sigle: "CCS",
    pays: "Cameroun",
    region: "Littoral",
    ville: "Douala, Cameroun",
    zone: "Afrique Centrale",
    nationalite1: "Camerounaise",
    nationalite2: "Allemande",
    nationalites_concernees: ["Diaspora camerounaise"],
    nationalite_unique: false,
    domaine: "Agriculture",
    type: "Coopérative",
    membres: 76,
    vues: 540,
    abonnes: 62,
    description: "Structure 120 producteurs de cacao autour de prix équitables et d'exportations directes vers l'Europe.",
    lat: 4.05, lon: 9.7
  },
  {
    id: "marrakech-edu",
    nom: "Marrakech Éducation Plus",
    sigle: "MEP",
    pays: "Maroc",
    region: "Marrakech-Safi",
    ville: "Marrakech, Maroc",
    zone: "Afrique du Nord",
    nationalite1: "Marocaine",
    nationalite2: "Française",
    nationalites_concernees: ["Diaspora marocaine", "Toutes nationalités"],
    nationalite_unique: false,
    domaine: "Éducation",
    type: "Association",
    membres: 264,
    vues: 1510,
    abonnes: 190,
    description: "Construit des bibliothèques rurales et finance des bourses pour étudiants grâce au réseau marocain de France.",
    lat: 31.6, lon: -8.0
  },
  {
    id: "benin-green",
    nom: "Bénin Green Future",
    sigle: "BGF",
    pays: "Bénin",
    region: "Littoral",
    ville: "Cotonou, Bénin",
    zone: "Afrique de l'Ouest",
    nationalite1: "Béninoise",
    nationalite2: "Américaine",
    nationalites_concernees: ["Diaspora béninoise"],
    nationalite_unique: true,
    domaine: "Environnement",
    type: "ONG",
    membres: 132,
    vues: 760,
    abonnes: 95,
    description: "Reforestation et gestion des déchets plastiques avec le soutien de la diaspora béninoise aux États-Unis.",
    lat: 6.4, lon: 2.3
  },
  {
    id: "tunis-startup",
    nom: "Tunis Startup Bridge",
    sigle: "TSB",
    pays: "Tunisie",
    region: "Tunis",
    ville: "Tunis, Tunisie",
    zone: "Afrique du Nord",
    nationalite1: "Tunisienne",
    nationalite2: "Canadienne",
    nationalites_concernees: ["Toutes nationalités"],
    nationalite_unique: false,
    domaine: "Entrepreneuriat",
    type: "Entreprise",
    membres: 410,
    vues: 2300,
    abonnes: 305,
    description: "Accélérateur connectant jeunes entrepreneurs tunisiens et investisseurs de la diaspora nord-américaine.",
    lat: 36.8, lon: 10.2
  },
  {
    id: "guinee-culture",
    nom: "Racines de Guinée",
    sigle: "RDG",
    pays: "Guinée",
    region: "Conakry",
    ville: "Conakry, Guinée",
    zone: "Afrique de l'Ouest",
    nationalite1: "Guinéenne",
    nationalite2: "Espagnole",
    nationalites_concernees: ["Diaspora guinéenne"],
    nationalite_unique: true,
    domaine: "Culture",
    type: "Association",
    membres: 145,
    vues: 690,
    abonnes: 88,
    description: "Valorise le patrimoine culturel guinéen via des festivals organisés en Espagne et en Guinée.",
    lat: 9.5, lon: -13.7
  },
  {
    id: "rdc-femmes",
    nom: "Femmes Actives du Congo",
    sigle: "FAC",
    pays: "RD Congo",
    region: "Kinshasa",
    ville: "Kinshasa, RD Congo",
    zone: "Afrique Centrale",
    nationalite1: "Congolaise",
    nationalite2: "Britannique",
    nationalites_concernees: ["Diaspora congolaise"],
    nationalite_unique: false,
    domaine: "Entrepreneuriat",
    type: "Coopérative",
    membres: 220,
    vues: 1100,
    abonnes: 160,
    description: "Micro-crédits et formation pour entrepreneuses congolaises, soutenus par la diaspora installée au Royaume-Uni.",
    lat: -4.3, lon: 15.3
  },
  {
    id: "togo-num",
    nom: "Togo Numérique",
    sigle: "TN",
    pays: "Togo",
    region: "Maritime",
    ville: "Lomé, Togo",
    zone: "Afrique de l'Ouest",
    nationalite1: "Togolaise",
    nationalite2: "Suisse",
    nationalites_concernees: ["Diaspora togolaise", "Toutes nationalités"],
    nationalite_unique: false,
    domaine: "Technologie",
    type: "Entreprise",
    membres: 95,
    vues: 430,
    abonnes: 70,
    description: "Forme aux métiers du numérique dans des centres communautaires, en lien avec des mentors togolais de Suisse.",
    lat: 6.1, lon: 1.2
  }
];

const ACTUALITES = [
  { titre: "Le Forum des entrepreneurs ivoiriens de Toulouse affiche complet", source: "A.I.T.O", date: "12 juin 2026", resume: "120 participants confirmés pour l'édition 2026, centrée sur l'accès au financement." },
  { titre: "Tech For Senegal lève des fonds pour son projet d'agriculture connectée", source: "Tech For Senegal", date: "8 juin 2026", resume: "La structure recherche des compétences en IoT pour étendre le réseau de capteurs." },
  { titre: "Diaspo'Actif annonce un appel à projets santé pour l'Afrique de l'Ouest", source: "Diaspo'Actif (Officiel)", date: "2 juin 2026", resume: "Les initiatives du secteur santé peuvent candidater jusqu'au 30 juillet." },
  { titre: "Marrakech Éducation Plus inaugure sa 5e bibliothèque rurale", source: "Marrakech Éducation Plus", date: "27 mai 2026", resume: "Plus de 3000 enfants ont désormais accès à un espace de lecture dédié." }
];

const EVENEMENTS = [
  { titre: "Forum des entrepreneurs ivoiriens de Toulouse", organisateur: "A.I.T.O", date: "2026-11-15", lieu: "Toulouse, France", statut: "ouvert", domaine: "Entrepreneuriat", type: "forum", pays: "France" },
  { titre: "Gala de solidarité de fin d'année A.I.T.O", organisateur: "A.I.T.O", date: "2026-12-02", lieu: "Toulouse, France", statut: "ouvert", domaine: "Culture", type: "evenement", pays: "France" },
  { titre: "Sommet Tech Diaspora Dakar", organisateur: "Tech For Senegal", date: "2027-01-20", lieu: "Dakar, Sénégal", statut: "ouvert", domaine: "Technologie", type: "forum", pays: "Senegal" },
  { titre: "Atelier financement pour coopératives", organisateur: "Diaspo'Actif (Officiel)", date: "2027-02-05", lieu: "En ligne", statut: "ouvert", domaine: "Entrepreneuriat", type: "webinaire", pays: "France" }
];

const CONVERSATIONS = [
  {
    avec: "Tech For Senegal",
    initials: "TS",
    derniere: "Bonjour Jean ! Merci de votre intérêt...",
    heure: "11:20",
    messages: [
      { de: "moi", texte: "Bonjour, votre projet d'agriculture connectée m'intéresse beaucoup. Comment puis-je m'impliquer ?" },
      { de: "eux", texte: "Bonjour Jean ! Merci de votre intérêt. Nous cherchons actuellement des compétences en IoT et en logistique pour étendre le réseau de capteurs au-delà de Dakar." },
      { de: "moi", texte: "J'ai justement une expérience en supply chain. Puis-je vous envoyer mon profil détaillé ?" }
    ]
  },
  {
    avec: "Association des Ivoiriens de Toulouse",
    initials: "AI",
    derniere: "Pour profiter d'une demande de partenariat...",
    heure: "Hier",
    messages: [
      { de: "eux", texte: "Bonjour, nous avons vu votre profil et souhaiterions échanger sur un partenariat pour notre forum de novembre." },
      { de: "moi", texte: "Avec plaisir, je suis disponible cette semaine." }
    ]
  },
  {
    avec: "Diaspo'Actif (Officiel)",
    initials: "DA",
    derniere: "Bienvenue sur Diaspo'Actif !",
    heure: "3 juin",
    messages: [
      { de: "eux", texte: "Bienvenue sur Diaspo'Actif ! Vous êtes désormais abonné aux communications officielles de la plateforme." }
    ]
  }
];

const RECHERCHES = [
  { requete: "ONG · Sénégal · Tech", date: "Aujourd'hui, 10:45" },
  { requete: "Association · Côte d'Ivoire", date: "Hier, 18:12" },
  { requete: "Fondation · Santé · Mali", date: "20 juin 2026" }
];

/* ---------- Modèle économique ---------- */
const TARIF_INITIATIVE_ANNUEL = 50; // € / an / initiative

/* ---------- Accréditations Diaspo'Actif ---------- */

const REGLE_ACCREDITATIONS_DA = "Les accréditations Diaspo'Actif ne constituent ni une récompense, ni une distinction honorifique. Elles correspondent à des autorisations opérationnelles accordées à un utilisateur ou à une organisation afin d'exercer certaines fonctions ou d'accéder à des services spécifiques de la plateforme.";

const ACCREDITATIONS_DA = [
  {
    type: 'creation_publicite',
    label: 'Création de Publicité',
    emoji: '📣',
    couleur: '#dc2626',
    couleurBg: '#fef2f2',
    couleurBorder: '#dc2626',
    couleurText: '#991b1b',
    description: 'Autorisation de créer et soumettre des publicités sur la plateforme Diaspo\'Actif. Chaque publicité est soumise à validation par l\'équipe avant diffusion.',
    droits: [
      'Créer des campagnes publicitaires complètes (6 paramètres)',
      'Définir le ciblage géographique et démographique',
      'Choisir les emplacements de diffusion',
      'Définir les périodes et fréquences d\'affichage',
      'Suivre les statistiques d\'impressions et de clics',
      'Soumettre des publicités à validation administrative'
    ],
    eligible: ['initiative'],
    prix: { initiative: 49 }
  },
  {
    type: 'gestion_associations',
    label: 'Gestion des Associations',
    emoji: '🏅',
    couleur: '#7c3aed',
    couleurBg: '#f5f3ff',
    couleurBorder: '#7c3aed',
    couleurText: '#4c1d95',
    description: 'Accréditation premium pour gérer entièrement votre association depuis un espace sécurisé : adhérents, cotisations, trésorerie, comptabilité intelligente, assemblées générales et votes électroniques.',
    droits: [
      'Gérer les adhérents et cartes de membre (QR Code)',
      'Encaisser les cotisations (carte, virement, Mobile Money) et relances automatiques',
      'Tenir la trésorerie et la comptabilité (OCR des factures, coffre-fort numérique)',
      'Organiser des assemblées générales et des votes électroniques',
      'Consulter les statistiques avancées et l\'indice d\'engagement',
      'Assistant IA : analyses financières, prédictions, rapports automatiques'
    ],
    eligible: ['initiative'],
    prix: { initiative: 0 },
    prixLabel: 'Premium — sur abonnement',
    module: 'asso'
  }
];

/* ---------- Compte Institutionnel : organismes publics partenaires ---------- */
const INSTITUTIONS = [
  { nom: "Ambassade de Côte d'Ivoire en France", type: "Ambassade", pays: "Côte d'Ivoire", abonnes: 4820 },
  { nom: "Consulat du Sénégal à Paris", type: "Consulat", pays: "Sénégal", abonnes: 3110 },
  { nom: "Mairie de Toulouse — Relations Diaspora", type: "Mairie", pays: "France", abonnes: 980 },
  { nom: "Ministère des Maliens de l'Extérieur", type: "Ministère", pays: "Mali", abonnes: 6230 }
];

/* ---------- Cartographie des compétences (talents diaspora) ---------- */
const COMPETENCES = [
  { nom: "Aïcha K.", profil: "Experte", secteur: "Santé publique", pays_residence: "France", origine: "Côte d'Ivoire" },
  { nom: "Moussa D.", profil: "Entrepreneur", secteur: "AgriTech", pays_residence: "Canada", origine: "Sénégal" },
  { nom: "Fatou B.", profil: "Chercheuse", secteur: "Énergies renouvelables", pays_residence: "Belgique", origine: "Mali" },
  { nom: "Karim T.", profil: "Investisseur", secteur: "Fintech", pays_residence: "Émirats Arabes Unis", origine: "Tunisie" },
  { nom: "Aminata S.", profil: "Étudiante", secteur: "Data Science", pays_residence: "Allemagne", origine: "Guinée" },
  { nom: "Yannick M.", profil: "Cadre", secteur: "Logistique", pays_residence: "France", origine: "Cameroun" }
];

/* ---------- Critères de ciblage institutionnel ---------- */
const SEGMENTS_CIBLAGE = [
  "Nationalité ou origine", "Pays de résidence", "Région", "Ville", "Profession",
  "Tranche d'âge", "Niveau d'études", "Centres d'intérêt", "Statut professionnel",
  "Membres d'associations", "Entrepreneurs / Étudiants / Investisseurs / Cadres"
];

/* ---------- Types de diffusion collective (institutions) ---------- */
const TYPES_DIFFUSION_INSTITUTION = [
  "Message privé", "Newsletter", "Invitation à un événement", "Appel à projets",
  "Consultation citoyenne", "Information consulaire", "Communiqué officiel",
  "Convocation", "Appel à contribution", "Alerte administrative", "Campagne d'information"
];

/* ---------- Publicités fictives (démo monétisation, géolocalisées) ---------- */
const PUBLICITES = [
  { marque: "AfriTransfer", accroche: "Envoyez de l'argent à votre famille en 3 minutes, frais réduits pour la diaspora.", cta: "Découvrir l'offre", icone: "💸", couleur: "#1FA971" },
  { marque: "Air Sahel", accroche: "Vols directs Paris–Dakar–Abidjan dès 399 €. Réservez votre billet retour au pays.", cta: "Voir les vols", icone: "✈️", couleur: "#3457D5" },
  { marque: "Banque Diaspora+", accroche: "Ouvrez un compte multi-devises pensé pour les investisseurs de la diaspora.", cta: "Ouvrir un compte", icone: "🏦", couleur: "#8138C2" },
  { marque: "ConnectPro Formations", accroche: "Formez-vous à distance aux métiers du numérique avec des mentors de la diaspora.", cta: "Voir les formations", icone: "🎓", couleur: "#F2761F" },
  { marque: "AssurDiaspora", accroche: "Protégez votre famille au pays avec une assurance santé pensée pour la diaspora.", cta: "Comparer les offres", icone: "🛡️", couleur: "#B68900" },
  { marque: "Toulouse Job Diaspora", accroche: "15 offres d'emploi locales près de chez vous, ouvertes aux profils biculturels.", cta: "Voir les offres", icone: "📍", couleur: "#3457D5" }
];

/* ---------- Profil utilisateur (démo) : nationalités + localisation ---------- */
const UTILISATEUR_PROFIL = {
  nom: "Jean K.",
  nationalites: [
    { pays: "Côte d'Ivoire", document: "Carte Nationale d'Identité", statut: "Vérifiée" },
    { pays: "France", document: "Passeport", statut: "En attente de vérification" }
  ],
  localisation: {
    pays: "France",
    region: "Occitanie",
    ville: "Toulouse",
    code_postal: "31000",
    visibilite: "Visible par les institutions et les initiatives suivies"
  }
};

/* ---------- Fil d'Actualité Global ---------- */
const FIL_ACTUALITE = [
  { auteur: "Tech For Senegal", type: "Association", categorie: "Opportunité professionnelle", contenu: "Nous recherchons un(e) ingénieur(e) IoT pour étendre notre réseau de capteurs agricoles à Dakar. Profils de la diaspora bienvenus.", date: "Il y a 2 h", reactions: 48, commentaires: 12, partages: 6 },
  { auteur: "Jean K.", type: "Utilisateur", categorie: "Publication", contenu: "Très heureux d'avoir rejoint le réseau Tech For Senegal aujourd'hui. Hâte de contribuer avec mon expérience en logistique !", date: "Il y a 4 h", reactions: 21, commentaires: 3, partages: 1 },
  { auteur: "Diaspo'Actif", type: "Institution", categorie: "Appel à projets", contenu: "Appel à projets santé pour l'Afrique de l'Ouest : financement jusqu'à 15 000 € pour les initiatives sélectionnées. Candidatures jusqu'au 30 juillet.", date: "Il y a 6 h", reactions: 132, commentaires: 28, partages: 54 },
  { auteur: "Ambassade de Côte d'Ivoire en France", type: "Institution", categorie: "Actualité des diasporas", contenu: "Consultation citoyenne ouverte : donnez votre avis sur les nouveaux services consulaires en ligne.", date: "Il y a 8 h", reactions: 76, commentaires: 19, partages: 9 },
  { auteur: "ConnectPro Formations", type: "Entreprise", categorie: "Offre de formation", contenu: "Nouvelle session de formation accélérée 'Data Analyst' à distance, mentorée par des professionnels de la diaspora. Places limitées.", date: "Hier", reactions: 64, commentaires: 8, partages: 15 },
  { auteur: "A.I.T.O", type: "Association", categorie: "Annonce d'événement", contenu: "Le Forum des entrepreneurs ivoiriens de Toulouse affiche déjà 120 participants confirmés pour le 15 novembre !", date: "Hier", reactions: 95, commentaires: 14, partages: 22 },
  { auteur: "Marrakech Éducation Plus", type: "Association", categorie: "Actualité des diasporas", contenu: "Notre 5e bibliothèque rurale est inaugurée ! Plus de 3000 enfants ont désormais accès à un espace de lecture dédié.", date: "Il y a 2 jours", reactions: 210, commentaires: 31, partages: 47 }
];

/* ---------- Financements participatifs en cours ---------- */
const CAMPAGNES_FINANCEMENT = [
  { id: "camp-puits", projet: "Puits d'eau potable pour 3 villages", porteur: "Bénin Green Future", recherche: 8000, collecte: 5420, contributeurs: 132, jours_restants: 18 },
  { id: "camp-ambulance", projet: "Ambulance communautaire pour Bamako", porteur: "Santé Sans Frontière Mali", recherche: 15000, collecte: 9100, contributeurs: 204, jours_restants: 27 },
  { id: "camp-incubateur", projet: "Incubateur numérique pour jeunes entrepreneurs", porteur: "Tunis Startup Bridge", recherche: 12000, collecte: 11760, contributeurs: 311, jours_restants: 4 },
  { id: "camp-bus", projet: "Bus scolaire pour zones rurales", porteur: "Marrakech Éducation Plus", recherche: 6000, collecte: 1980, contributeurs: 58, jours_restants: 41 }
];

/* ---------- Projets Diaspo'Actif en cours ---------- */
const PROJETS_DIASPOACTIF = [
  { id: "proj-sante-ouest", nom: "Programme Santé Afrique de l'Ouest", categorie: "Mission institutionnelle", avancement: 62, partenaires: ["Diaspo'Actif", "Santé Sans Frontière Mali", "Ministère des Maliens de l'Extérieur"], besoins: "Recherche de médecins volontaires et de financements complémentaires." },
  { id: "proj-agritech", nom: "Réseau AgriTech Diaspora", categorie: "Projet économique", avancement: 38, partenaires: ["Diaspo'Actif", "Tech For Senegal", "Coopérative Cacao Solidaire"], besoins: "Ingénieurs IoT et partenaires logistiques en Afrique de l'Ouest." },
  { id: "proj-formation-num", nom: "Programme de formation numérique territoriale", categorie: "Programme de formation", avancement: 80, partenaires: ["Diaspo'Actif", "ConnectPro Formations", "Togo Numérique"], besoins: "Mentors bénévoles pour les sessions à distance." },
  { id: "proj-archives", nom: "Archives culturelles des diasporas", categorie: "Action solidaire", avancement: 21, partenaires: ["Diaspo'Actif", "Racines de Guinée"], besoins: "Collecte de témoignages et de documents historiques." }
];

/* ---------- « J'ai Financé » : historique personnel de l'utilisateur ---------- */
const MES_FINANCEMENTS = [
  { campagne: "Ambulance communautaire pour Bamako", montant: 50, date: "10 juin 2026" },
  { campagne: "Incubateur numérique pour jeunes entrepreneurs", montant: 25, date: "2 mai 2026" },
  { campagne: "Puits d'eau potable pour 3 villages", montant: 30, date: "14 avril 2026" }
];

/* ---------- « Collaborations en cours » de l'utilisateur ---------- */
const MES_COLLABORATIONS = [
  { titre: "Réseau AgriTech Diaspora", role: "Contributeur logistique", avec: "Tech For Senegal", statut: "En cours" },
  { titre: "Forum des entrepreneurs ivoiriens de Toulouse", role: "Bénévole organisation", avec: "A.I.T.O", statut: "Mission réalisée" },
  { titre: "Groupe de travail Mobilité diaspora", role: "Membre du groupe", avec: "Diaspo'Actif (Officiel)", statut: "En cours" }
];

/* ---------- Moyens de paiement disponibles pour billetterie/cotisations (démo) ---------- */
const MOYENS_PAIEMENT = ["Carte bancaire", "PayPal", "Virement bancaire", "Mobile Money (Orange/MTN/Moov/Wave)", "Apple Pay", "Google Pay"];
const TYPES_TARIFICATION = ["Tarif unique", "Plusieurs catégories de tarifs", "Accès gratuit", "Participation libre"];

/* ---------- Système multilingue (démo) ---------- */
const LANGUES = [
  { code: "fr", label: "FR" },
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
  { code: "de", label: "DE" },
  { code: "zh", label: "中文" },
  { code: "hi", label: "हिंदी" }
];

const NAV_LABELS = {
  fr: { accueil:"Accueil", annuaire:"Annuaire", fil:"Fil d'actualité", actualites:"Actualités", evenements:"Événements" },
  en: { accueil:"Home", annuaire:"Directory", fil:"News Feed", actualites:"News", evenements:"Events" },
  es: { accueil:"Inicio", annuaire:"Directorio", fil:"Novedades", actualites:"Noticias", evenements:"Eventos" },
  de: { accueil:"Start", annuaire:"Verzeichnis", fil:"Newsfeed", actualites:"Nachrichten", evenements:"Veranstaltungen" },
  zh: { accueil:"首页", annuaire:"名录", fil:"动态", actualites:"新闻", evenements:"活动" },
  hi: { accueil:"होम", annuaire:"निर्देशिका", fil:"न्यूज़ फ़ीड", actualites:"समाचार", evenements:"कार्यक्रम" }
};

const ROLE_LABELS = {
  fr: { utilisateur:"Utilisateur", initiative:"Initiative", officiel:"Officiel", institutionnel:"Institutionnel" },
  en: { utilisateur:"User", initiative:"Initiative", officiel:"Official", institutionnel:"Institutional" },
  es: { utilisateur:"Usuario", initiative:"Iniciativa", officiel:"Oficial", institutionnel:"Institucional" },
  de: { utilisateur:"Nutzer", initiative:"Initiative", officiel:"Offiziell", institutionnel:"Institutionell" },
  zh: { utilisateur:"用户", initiative:"倡议", officiel:"官方", institutionnel:"机构" },
  hi: { utilisateur:"उपयोगकर्ता", initiative:"पहल", officiel:"आधिकारिक", institutionnel:"संस्थागत" }
};

const FOOTER_TEXT = {
  fr: "Diaspo'Actif · Du Sud au Nord — Prototype interactif (données fictives) · 2026",
  en: "Diaspo'Actif · From South to North — Interactive prototype (sample data) · 2026",
  es: "Diaspo'Actif · Del Sur al Norte — Prototipo interactivo (datos ficticios) · 2026",
  de: "Diaspo'Actif · Vom Süden in den Norden — Interaktiver Prototyp (Beispieldaten) · 2026",
  zh: "Diaspo'Actif · 从南到北 — 交互式原型（示例数据） · 2026",
  hi: "Diaspo'Actif · दक्षिण से उत्तर — इंटरैक्टिव प्रोटोटाइप (नमूना डेटा) · 2026"
};

const GREETING = { fr:"Bonjour", en:"Hello", es:"Hola", de:"Hallo", zh:"你好", hi:"नमस्ते" };

/* ---------- Niveaux de confidentialité des données ---------- */
const CONFIDENTIALITE_NIVEAUX = [
  {
    niveau: "Public",
    icone: "🌍",
    classe: "conf-public",
    description: "Visible par l'ensemble des membres de Diaspo'Actif, y compris les visiteurs non connectés à certains contenus.",
    champs: ["Nom et prénom (ou pseudonyme)", "Photo", "Ville (optionnel)", "Profession", "Compétences", "Projets", "Publications"]
  },
  {
    niveau: "Réseau uniquement",
    icone: "🔒",
    classe: "conf-reseau",
    description: "Visible uniquement par les membres de votre réseau (connexions acceptées, initiatives suivies, groupes communs).",
    champs: ["Téléphone", "Email", "Documents partagés", "Certaines informations professionnelles"]
  },
  {
    niveau: "Confidentiel",
    icone: "🔐",
    classe: "conf-confidentiel",
    description: "Accès réservé à Diaspo'Actif et aux institutions habilitées, dans un cadre strictement encadré.",
    champs: ["Nationalités", "Pièces d'identité", "Documents de vérification", "Coordonnées administratives", "Informations de paiement"]
  }
];

/* ---------- Observatoire statistique de la diaspora (institutions) ---------- */
const SEUIL_CONFIDENTIALITE_OBSERVATOIRE = 10; // sous ce seuil, la statistique est masquée

const OBSERVATOIRE_DIASPORA = {
  nationalite: "Diaspora ivoirienne",
  total: 6670,
  par_pays: [
    { pays: "France", membres: 4520, villes: [
        { ville: "Paris", membres: 1540 },
        { ville: "Marseille", membres: 620 },
        { ville: "Lyon", membres: 410 },
        { ville: "Toulouse", membres: 320 }
      ] },
    { pays: "Canada", membres: 980, villes: [
        { ville: "Montréal", membres: 710 },
        { ville: "Québec", membres: 120 }
      ] },
    { pays: "Allemagne", membres: 640, villes: [] },
    { pays: "États-Unis", membres: 530, villes: [] }
  ],
  par_secteur: [
    { secteur: "Technologie", membres: 820 },
    { secteur: "Santé", membres: 540 },
    { secteur: "Éducation", membres: 430 },
    { secteur: "Commerce", membres: 610 },
    { secteur: "Autre", membres: 4270 }
  ],
  par_age: [
    { tranche: "18-25 ans", membres: 980 },
    { tranche: "26-35 ans", membres: 2210 },
    { tranche: "36-50 ans", membres: 2340 },
    { tranche: "51 ans et plus", membres: 1140 }
  ],
  par_niveau_etudes: [
    { niveau: "Bac ou inférieur", membres: 1340 },
    { niveau: "Licence / Bachelor", membres: 2230 },
    { niveau: "Master", membres: 2150 },
    { niveau: "Doctorat", membres: 950 }
  ],
  porteurs_projets: 312,
  entrepreneurs: 540,
  investisseurs: 87,
  etudiants: 940
};

/* ---------- Exemple de résultat agrégé d'une communication ciblée (démo) ---------- */
const ENVOI_CIBLE_EXEMPLE = { destinataires: 247, taux_ouverture: 61, taux_participation: 18, reponses: 34 };

/* ---------- Profil Utilisateur consolidé (exemple démo) ---------- */
const PROFIL_EXEMPLE = {
  nom: "Ynouss Diallo",
  statut_professionnel: "Chef(fe) d'entreprise",
  ville: "Toulouse, France",
  verifie: true,
  profession: {
    situation: "Chef(fe) d'entreprise",
    niveau_etudes: "Bac+5 / Master 2",
    secteur: "Technologies & Numérique",
    linkedin: "linkedin.com/in/ynouss-diallo",
    entreprise: "Y-DITECH",
    pays_siege: "France",
    activite_pays_origine: "Non, mais projet d'implantation",
    recherche: ["Investisseurs", "Associés", "Clients", "Talents", "Partenaires publics"]
  },
  projet: {
    presentation: "Bureau d'étude en conception électronique embarquée.",
    secteurs: ["Technologies & Numérique"],
    localisation: "Abidjan – Côte d'Ivoire",
    nationalite_unique: true,
    nationalite_ciblee: "Côte d'Ivoire",
    stade: ["Prototype validé", "Étude de marché en cours"],
    emplois_envisages: "1 à 5 emplois",
    investissement_previsionnel: "50 000 €",
    financement_recherche: "10 000 € à 50 000 €",
    moyens_paiement: ["Carte bancaire", "PayPal", "Orange Money", "MTN Money", "Wave", "Virement bancaire"],
    impact: { emplois_prevus: 5, pays_cible: "Côte d'Ivoire", investissement_estime: "50 000 €" }
  },
  motivations: ["Création d'entreprise", "Investissement diaspora", "Développement territorial", "Innovation"],
  attentes: ["Rencontrer des décideurs publics", "Développer mon réseau", "Participer aux recommandations", "Identifier des partenaires"],
  activite: {
    finance_projets: 3,
    finance_montant: "2 500 €",
    collaborations_cours: 5,
    collaborations_nouvelles: 2,
    reseau_contacts: 148,
    reseau_nouvelles: 7,
    evenements: ["Forum DFG Paris", "Rencontre Investisseurs Diaspora", "Forum Diaspo'Actif"],
    badge: "argent"
  }
};

const BADGES_ENGAGEMENT = [
  { niveau: "bronze", label: "Contributeur Bronze", icone: "🥉" },
  { niveau: "argent", label: "Contributeur Argent", icone: "🥈" },
  { niveau: "or", label: "Contributeur Or", icone: "🥇" }
];

/* ── Liste complète des pays du monde ── */
const PAYS_DU_MONDE = [
  "Afghanistan","Afrique du Sud","Albanie","Algérie","Allemagne","Andorre","Angola","Antigua-et-Barbuda",
  "Arabie Saoudite","Argentine","Arménie","Australie","Autriche","Azerbaïdjan",
  "Bahamas","Bahreïn","Bangladesh","Barbade","Bélarus","Belgique","Belize","Bénin","Bhoutan","Bolivie",
  "Bosnie-Herzégovine","Botswana","Brésil","Brunei","Bulgarie","Burkina Faso","Burundi",
  "Cabo Verde","Cambodge","Cameroun","Canada","Centrafrique","Chili","Chine","Chypre","Colombie",
  "Comores","Congo","Costa Rica","Côte d'Ivoire","Croatie","Cuba",
  "Danemark","Djibouti","Dominique",
  "Égypte","Émirats Arabes Unis","Équateur","Érythrée","Espagne","Estonie","Eswatini","États-Unis","Éthiopie",
  "Fidji","Finlande","France",
  "Gabon","Gambie","Géorgie","Ghana","Grèce","Grenade","Guatemala","Guinée","Guinée Équatoriale",
  "Guinée-Bissau","Guyana",
  "Haïti","Honduras","Hongrie",
  "Inde","Indonésie","Irak","Iran","Irlande","Islande","Israël","Italie",
  "Jamaïque","Japon","Jordanie",
  "Kazakhstan","Kenya","Kirghizistan","Kiribati","Kosovo","Koweït",
  "Laos","Lesotho","Lettonie","Liban","Libéria","Libye","Liechtenstein","Lituanie","Luxembourg",
  "Macédoine du Nord","Madagascar","Malaisie","Malawi","Maldives","Mali","Malte","Maroc","Marshall",
  "Maurice","Mauritanie","Mexique","Micronésie","Moldavie","Monaco","Mongolie","Monténégro","Mozambique",
  "Myanmar",
  "Namibie","Nauru","Népal","Nicaragua","Niger","Nigéria","Norvège","Nouvelle-Zélande",
  "Oman","Ouganda","Ouzbékistan",
  "Pakistan","Palaos","Palestine","Panama","Papouasie-Nouvelle-Guinée","Paraguay","Pays-Bas","Pérou",
  "Philippines","Pologne","Portugal",
  "Qatar",
  "République Démocratique du Congo","République Dominicaine","République Tchèque","Roumanie",
  "Royaume-Uni","Russie","Rwanda",
  "Saint-Kitts-et-Nevis","Saint-Vincent-et-les-Grenadines","Sainte-Lucie","Salvador","Samoa",
  "São Tomé-et-Príncipe","Sénégal","Serbie","Seychelles","Sierra Leone","Singapour","Slovaquie",
  "Slovénie","Somalie","Soudan","Soudan du Sud","Sri Lanka","Suède","Suisse","Suriname",
  "Syrie",
  "Tadjikistan","Tanzanie","Tchad","Thaïlande","Timor-Leste","Togo","Tonga","Trinité-et-Tobago",
  "Tunisie","Turkménistan","Turquie","Tuvalu",
  "Ukraine","Uruguay",
  "Vanuatu","Venezuela","Vietnam",
  "Yémen",
  "Zambie","Zimbabwe"
].sort();

/* ── Villes majeures du monde ── */
const VILLES_DU_MONDE = [
  // Afrique (prioritaire pour la diaspora)
  "Abidjan","Accra","Addis-Abeba","Alger","Antananarivo","Asmara","Bamako","Bangui","Banjul","Bissau",
  "Brazzaville","Bujumbura","Cabo","Caire (Le)","Cape Town","Casablanca","Conakry","Cotonou","Dakar",
  "Dar es Salaam","Djibouti","Douala","Durban","Freetown","Gaborone","Harare","Johannesburg","Kampala",
  "Khartoum","Kinshasa","Kigali","Lagos","Libreville","Lilongwe","Lomé","Luanda","Lusaka","Malabo",
  "Maputo","Marrakech","Mogadiscio","Monrovia","Moroni","Nairobi","N'Djamena","Niamey","Nouakchott",
  "Ouagadougou","Port-Louis","Porto-Novo","Praia","Rabat","São Tomé","Tripoli","Tunis","Windhoek",
  "Yaoundé",
  // Europe
  "Athènes","Berlin","Bruxelles","Bucarest","Budapest","Copenhague","Dublin","Genève","Helsinki",
  "Lisbonne","Ljubljana","Londres","Luxembourg","Lyon","Madrid","Marseille","Milan","Minsk","Monaco",
  "Montpellier","Moscou","Munich","Nice","Nicosie","Oslo","Paris","Prague","Reims","Riga","Rome",
  "Rotterdam","Saint-Pétersbourg","Sofia","Stockholm","Strasbourg","Tallinn","Tirana","Toulouse",
  "Vaduz","Vienne","Vilnius","Varsovie","Zurich",
  // Amérique du Nord
  "Atlanta","Boston","Calgary","Chicago","Dallas","Denver","Houston","Las Vegas","Los Angeles","Miami",
  "Montréal","New York","Ottawa","Philadelphie","Phoenix","San Francisco","Seattle","Toronto",
  "Vancouver","Washington D.C.",
  // Amérique Latine & Caraïbes
  "Bogotá","Buenos Aires","Caracas","Havane","Lima","Mexico","Panama City","Port-au-Prince",
  "Port-of-Spain","Quito","Rio de Janeiro","Saint-Domingue","Santiago","São Paulo",
  // Asie
  "Ankara","Bagdad","Bangkok","Beyrouth","Dacca","Delhi","Dhaka","Doha","Dubaï","Hanoi","Hong Kong",
  "Istanbul","Jakarta","Kaboul","Karachi","Katmandou","Kuala Lumpur","Manille","Mumbai","Muscat",
  "Nicosie","Nur-Sultan","Pékin","Phnom Penh","Rangoun","Riyad","Séoul","Shanghai","Singapour",
  "Taipei","Tachkent","Téhéran","Tel Aviv","Tokyo","Vientiane","Yangon",
  // Océanie / autres
  "Auckland","Canberra","Melbourne","Nuku'alofa","Port Moresby","Suva","Sydney","Wellington"
].sort();

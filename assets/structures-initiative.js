/* ═════════════════════════════════════════════════════════════════
   Structures d'initiative — listes partagées (2026-10-09, demande explicite)
   Source unique de vérité pour les cinq fiches : Type de structure, Forme juridique,
   Taille de l'entreprise, Domaine d'activité (suggestions de sous-domaines) et
   Organisme financier (famille puis type). Chargé par le navigateur
   (inscription.html, parametres-compte.html, annuaire) ET par le serveur
   (server/index.js : validation + filtre de l'annuaire) — d'où le format UMD.
   RÈGLE : on AJOUTE, on ne renomme ni ne retire jamais une entrée déjà publiée
   (des comptes réels en portent les libellés).
   ═════════════════════════════════════════════════════════════════ */
(function (root) {
  /* Type de structure — [libellé, nouveau ?]. « Cooperative » (sans accent, ancienne saisie) est reconnu comme « Coopérative ». */
  const TYPES = [
    ['Association', 0], ['ONG', 0], ['Fondation', 0], ['Coopérative', 0], ['Mutuelle', 1], ['Organisme de formation', 1],
    ['Établissement public', 1], ['Collectivité territoriale', 1], ['Organisation professionnelle', 1], ["Groupement d'entrepreneurs", 1],
    ['Entreprise', 0], ['Startup', 0], ['Projet collectif', 0], ['Autre', 0]
  ];
  const TYPES_ENTREPRISE = ['Entreprise', 'Startup'];

  /* Forme juridique — [libellé, aide, mots reconnus dans une saisie libre ancienne]. */
  const FORMES = [
    ['Entreprise individuelle (EI)', 'Activité exercée par une personne physique', ['ei', 'entreprise individuelle']],
    ['Micro-entreprise', "Régime simplifié de l'entreprise individuelle en France", ['micro entreprise', 'microentreprise', 'auto entrepreneur', 'autoentrepreneur', 'micro entrepreneur']],
    ['EURL', 'Société à responsabilité limitée avec un associé unique', ['eurl']],
    ['SARL', 'Société à responsabilité limitée', ['sarl']],
    ['SASU', 'Société par actions simplifiée unipersonnelle', ['sasu']],
    ['SAS', 'Société par actions simplifiée', ['sas']],
    ['SA', 'Société anonyme', ['sa']],
    ['SNC', 'Société en nom collectif', ['snc']],
    ['SCS / SCA', 'Sociétés en commandite', ['scs', 'sca']],
    ['Société coopérative', 'Entreprise détenue ou gouvernée collectivement selon ses règles', ['societe cooperative', 'scop', 'scic']],
    ['GIE', "Groupement d'intérêt économique", ['gie']],
    ['Société civile', 'Structure destinée à certaines activités civiles, notamment immobilières', ['societe civile', 'sci']]
  ];
  const FORME_AUTRE = 'Autre (à préciser)';

  /* Taille de l'entreprise — [libellé, aide]. */
  const TAILLES = [
    ['Travailleur indépendant', 'Une personne qui exerce une activité professionnelle de manière indépendante.'],
    ['TPE — Très petite entreprise', 'Petite structure, souvent avec moins de 10 salariés selon la classification retenue.'],
    ['PME — Petite et moyenne entreprise', "Entreprise de taille intermédiaire, avec des effectifs et un chiffre d'affaires limités selon les critères applicables."],
    ['ETI — Entreprise de taille intermédiaire', 'En France, catégorie située entre les PME et les grandes entreprises.'],
    ['Grande entreprise', "Organisation de grande dimension, avec des effectifs, des activités ou un chiffre d'affaires importants."]
  ];

  /* Organisme financier — famille → types. Apparaît pour les domaines financiers. */
  const FIN = {
    'Banques commerciales': ['Banque de détail', "Banque d'affaires", "Banque d'investissement", 'Banque privée', 'Banque en ligne', 'Banque internationale', 'Banque de financement des entreprises', 'Banque spécialisée dans les PME', "Banque spécialisée dans l'agriculture", "Banque spécialisée dans l'immobilier"],
    'Institutions de microfinance': ['Institution de microfinance', 'Établissement de microcrédit', "Coopérative d'épargne et de crédit", 'Caisse populaire', "Mutuelle d'épargne et de crédit", 'Institution de finance solidaire', 'Organisme de financement des petits entrepreneurs'],
    'Organismes publics de financement': ["Banque publique d'investissement", 'Banque de développement', 'Fonds public de financement', 'Fonds de garantie des prêts', 'Organisme public de soutien aux PME', 'Fonds de développement agricole', 'Fonds de développement local', "Fonds de financement de l'innovation", "Organisme public de financement de l'économie sociale et solidaire"],
    'Institutions financières internationales': ['Banque multilatérale de développement', 'Banque régionale de développement', 'Institution financière internationale', 'Fonds international de développement', 'Fonds de financement du développement', 'Organisme de financement de projets internationaux', 'Institution de financement du commerce international'],
    "Fonds d'investissement": ['Fonds de capital-risque (Venture Capital)', 'Fonds de capital-investissement (Private Equity)', "Fonds d'investissement à impact", "Fonds d'investissement immobilier", "Fonds d'investissement agricole", "Fonds d'investissement dans les PME", "Fonds d'investissement dans les start-up", "Fonds d'investissement diaspora", "Fonds d'investissement en infrastructures", "Fonds d'investissement à vocation sociale"],
    'Financement des entreprises et des entrepreneurs': ['Organisme de prêt professionnel', "Organisme de financement des créateurs d'entreprise", "Organisme de financement des repreneurs d'entreprise", 'Organisme de financement des associations', 'Organisme de financement des projets agricoles', 'Organisme de financement des entreprises innovantes', "Organisme de financement de l'économie sociale et solidaire", 'Plateforme de financement participatif', "Organisme de prêt d'honneur", 'Réseau de business angels', 'Incubateur proposant un financement', 'Accélérateur proposant un investissement'],
    'Garantie et cautionnement': ['Fonds de garantie bancaire', 'Société de cautionnement mutuel', 'Organisme de garantie des prêts professionnels', 'Fonds de garantie agricole', 'Organisme de garantie des crédits aux PME', 'Société de garantie des investissements', 'Organisme de garantie des financements internationaux'],
    'Assurances et prévoyance': ["Compagnie d'assurance", "Compagnie d'assurance-vie", 'Assurance-crédit', 'Assurance des entreprises', 'Assurance des risques professionnels', 'Organisme de prévoyance', 'Mutuelle', 'Société de réassurance'],
    'Paiement et fintech': ['Établissement de paiement', 'Établissement de monnaie électronique', "Fintech spécialisée dans les transferts d'argent", 'Service de paiement mobile', 'Plateforme de transfert international', 'Solution de paiement pour entreprises', 'Plateforme de gestion financière', 'Plateforme de crédit numérique', 'Solution de financement de factures', 'Société de technologie financière'],
    'Financement du commerce international': ['Organisme de financement import-export', "Société d'affacturage", 'Organisme de crédit documentaire', "Organisme de financement de la chaîne d'approvisionnement", 'Société de financement des exportations', "Organisme d'assurance des exportations", 'Organisme de financement du commerce Afrique-Europe'],
    'Épargne et placement': ["Société de gestion d'actifs", 'Fonds de pension', 'Gestionnaire de patrimoine', 'Conseiller en investissements financiers', 'Société de courtage financier', 'Société de gestion de portefeuille', 'Organisme de placement collectif', "Plateforme d'investissement", "Structure d'épargne salariale"],
    'Accompagnement financier': ['Cabinet de conseil en financement', 'Cabinet de montage de dossiers de financement', "Cabinet d'expertise comptable", "Cabinet d'audit financier", 'Conseil en levée de fonds', 'Conseil en investissement', "Organisme d'éducation financière", "Réseau d'accompagnement entrepreneurial", "Structure d'aide à la gestion budgétaire", "Organisme d'accompagnement au surendettement"]
  };
  /* Clés (assets/domaines-activite.js) des domaines qui déclenchent la fiche « Organisme financier ». */
  const DOMAINES_FINANCE = ['banque_microfinance', 'finance_investissement', 'assurance_prevoyance'];

  /* Sous-domaines suggérés par domaine (clé) — simples suggestions : le champ « Sous domaine » reste libre. */
  const SOUS_DOMAINES = {
    btp_immobilier: ['Construction', 'Maçonnerie', 'Électricité', 'Plomberie', 'Peinture', 'Menuiserie', 'Génie civil', 'Terrassement', 'Rénovation', 'Climatisation'],
    agriculture: ['Cultures agricoles', 'Maraîchage', 'Exploitation forestière', 'Agroalimentaire', 'Coopératives agricoles'],
    elevage_peche: ['Élevage', 'Pisciculture', 'Pêche'],
    industrie_production: ['Transformation de matières premières', 'Textile', 'Métallurgie', 'Fabrication de meubles', 'Emballages', 'Artisanat de production'],
    numerique_technologie: ['Développement logiciel', 'Cybersécurité', 'Intelligence artificielle', 'Création de sites web', 'Téléphonie', 'Réseaux', 'Maintenance informatique'],
    transport_logistique: ['Transport de personnes', 'Livraison', 'Transport de marchandises', 'Déménagement', 'Entreposage', 'Transit', 'Import-export', 'Logistique internationale'],
    commerce_distribution: ['Vente en gros', 'Vente au détail', 'Boutiques', 'Supermarchés', 'Commerce en ligne', 'Grossistes', 'Importateurs', 'Distributeurs'],
    conseil_services: ['Conseil', 'Comptabilité', 'Juridique', 'Recrutement', 'Marketing', 'Communication', 'Formation professionnelle', 'Études', 'Audit', 'Gestion administrative'],
    restauration_agroalimentaire: ['Restaurants', 'Traiteurs', 'Cafés'],
    hotellerie_hebergement: ['Hôtels', 'Hébergement touristique', "Gîtes et chambres d'hôtes"],
    tourisme_voyage: ['Agences de voyages', 'Guides touristiques', 'Loisirs'],
    evenementiel: ['Organisation d\'événements', 'Animation', 'Location de matériel'],
    energie_environnement: ['Électricité', 'Panneaux photovoltaïques', 'Solaire thermique', 'Énergies renouvelables', 'Traitement des déchets', 'Recyclage', 'Assainissement', 'Efficacité énergétique'],
    medecine_sante: ['Cabinets médicaux', 'Laboratoires', 'Pharmacies', 'Soins à domicile', 'Optique'],
    sante: ['Bien-être', 'Centres de remise en forme'],
    immobilier: ['Agences immobilières', 'Gestion locative', 'Promotion immobilière', 'Syndic', 'Expertise immobilière'],
    education_formation: ['Écoles privées', 'Centres de formation', 'Soutien scolaire', 'Formation en ligne'],
    culture_arts: ['Graphisme', 'Photographie', 'Cinéma', 'Musique', 'Édition'],
    communication_medias: ['Presse', 'Création de contenu', 'Édition'],
    services_personne: ['Ménage', "Garde d'enfants", 'Aide aux personnes âgées', 'Coiffure', 'Esthétique'],
    artisanat: ['Couture', 'Cordonnerie', 'Bijouterie', 'Poterie', 'Menuiserie artisanale', 'Réparation'],
    automobile_mobilite: ['Garages', 'Mécanique', 'Carrosserie', 'Location de véhicules', 'Pièces détachées'],
    mines_ressources: ['Extraction minière', 'Carrières', 'Exploitation pétrolière et gazière'],
    securite_gardiennage: ['Surveillance', 'Sécurité privée', 'Installation de systèmes de sécurité'],
    recherche_innovation: ['Laboratoires', "Bureaux d'études", 'Recherche appliquée', 'Nouvelles technologies'],
    sport: ['Clubs sportifs', 'Salles de sport', 'Coaching', 'Activités récréatives'],
    services_funeraires: ['Pompes funèbres', 'Marbrerie', 'Organisation des obsèques'],
    eau_assainissement: ["Distribution d'eau", 'Forage', 'Traitement des eaux', 'Assainissement'],
    telecoms_infrastructures: ['Opérateurs télécoms', 'Fibre optique', 'Installation de réseaux'],
    droit_administration: ["Cabinets d'avocats", 'Commissaires de justice', 'Formalités administratives', 'Conseil réglementaire'],
    commerce_international: ['Exportation', 'Importation', 'Représentation commerciale', 'Négoce international'],
    finance_investissement: ["Fonds d'investissement", "Gestion d'actifs", 'Conseil en investissement', 'Courtage'],
    banque_microfinance: ['Banques', 'Microfinance', "Coopératives d'épargne et de crédit", 'Services de paiement'],
    assurance_prevoyance: ['Assurance', 'Courtage', 'Prévoyance', 'Réassurance']
  };

  /* ── Outils ── */
  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  /* Deux saisies désignent le même type si elles ne diffèrent que par la casse ou les accents (Cooperative / Coopérative). */
  const typeIdentique = (a, b) => !!a && !!b && norm(a) === norm(b);
  /* Une saisie libre ancienne (« SARL au capital de… », « Association loi 1901 ») correspond-elle à la forme choisie ?
     Comparaison par MOTS entiers : « SASU » ne doit pas correspondre à « SAS ». */
  function formeCorrespond(texte, choix) {
    const f = FORMES.find(x => x[0] === choix); if (!f) return norm(texte) === norm(choix);
    const t = ' ' + norm(texte).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    return f[2].some(m => t.includes(' ' + m + ' '));
  }
  const estEntreprise = type => TYPES_ENTREPRISE.some(t => typeIdentique(t, type));
  const estDomaineFinance = cle => DOMAINES_FINANCE.includes(cle);
  /* Nettoie les quatre champs avant enregistrement : une valeur hors liste est ignorée (null) plutôt que stockée. */
  function nettoyer(b) {
    b = b || {};
    const txt = (v, max) => { const s = String(v == null ? '' : v).trim().slice(0, max || 160); return s || null; };
    const taille = TAILLES.some(t => t[0] === b.taille_entreprise) ? b.taille_entreprise : null;
    const famille = Object.prototype.hasOwnProperty.call(FIN, b.finance_famille) ? b.finance_famille : null;
    const typeFin = famille && FIN[famille].includes(b.finance_type) ? b.finance_type : null;
    return { type: txt(b.type, 80), forme_juridique: txt(b.forme_juridique, 120), taille_entreprise: taille, finance_famille: famille, finance_type: typeFin };
  }

  const API = { TYPES, TYPES_ENTREPRISE, FORMES, FORME_AUTRE, TAILLES, FIN, DOMAINES_FINANCE, SOUS_DOMAINES, norm, typeIdentique, formeCorrespond, estEntreprise, estDomaineFinance, nettoyer };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.STRUCTURES_INITIATIVE = API;
})(typeof window !== 'undefined' ? window : globalThis);

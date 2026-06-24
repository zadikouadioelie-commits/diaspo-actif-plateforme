/* ===========================================================
   DIASPO'ACTIF — Seed initial (rôles v2 : administrateur / collectivite)
   =========================================================== */
const fs = require("node:fs");
const path = require("node:path");
const db = require("./db");
const { hashPassword } = require("./auth");

function loadLegacyData() {
  const file = path.join(__dirname, "..", "assets", "data.js");
  const code = fs.readFileSync(file, "utf-8");
  const sandbox = new Function(code + "\nreturn { INITIATIVES, ACTUALITES, EVENEMENTS, FIL_ACTUALITE, UTILISATEUR_PROFIL, PROFIL_EXEMPLE };");
  return sandbox();
}

function alreadySeeded() {
  const row = db.prepare("SELECT COUNT(*) AS n FROM users").get();
  return row.n > 0;
}

function seed() {
  if (alreadySeeded()) {
    console.log("Base déjà initialisée — seed ignoré.");
    return;
  }

  const legacy = loadLegacyData();

  /* ---- Initiatives ---- */
  const insertInitiative = db.prepare(`
    INSERT INTO initiatives (slug, nom, sigle, pays, region, ville, zone, nationalite1, nationalite2,
      nationalites_concernees, nationalite_unique, origine1, origine2, rayonnement, pays_intervention,
      domaine, type, membres, vues, abonnes, description, mission, historique, site_web, lat, lon)
    VALUES (@slug, @nom, @sigle, @pays, @region, @ville, @zone, @nationalite1, @nationalite2,
      @nationalites_concernees, @nationalite_unique, @origine1, @origine2, @rayonnement, @pays_intervention,
      @domaine, @type, @membres, @vues, @abonnes, @description, @mission, @historique, @site_web, @lat, @lon)
  `);

  const origineMap = {
    "aito":           { origine1: "Côte d'Ivoire", origine2: null,         rayonnement: "régionale",      pays_intervention: [] },
    "tech4senegal":   { origine1: "Sénégal",        origine2: "Canada",     rayonnement: "internationale", pays_intervention: [{"pays":"Sénégal","region":"Thiès"},{"pays":"Sénégal","region":"Kaolack"}] },
    "mali-sante":     { origine1: "Mali",            origine2: "Belgique",   rayonnement: "nationale",      pays_intervention: [{"pays":"Mali","region":"Koulikoro"},{"pays":"Mali","region":"Ségou"}] },
    "cacao-solidaire":{ origine1: "Cameroun",        origine2: "Allemagne",  rayonnement: "internationale", pays_intervention: [{"pays":"Cameroun"},{"pays":"Allemagne","ville":"Berlin"}] },
    "marrakech-edu":  { origine1: "Maroc",           origine2: "France",     rayonnement: "régionale",      pays_intervention: [] },
    "benin-green":    { origine1: "Bénin",           origine2: "États-Unis", rayonnement: "nationale",      pays_intervention: [{"pays":"Bénin","region":"Littoral"},{"pays":"Bénin","region":"Ouémé"}] },
    "tunis-startup":  { origine1: "Tunisie",         origine2: "Canada",     rayonnement: "internationale", pays_intervention: [{"pays":"Tunisie"},{"pays":"Canada","ville":"Montréal"}] },
    "racines-guinee": { origine1: "Guinée",          origine2: "Espagne",    rayonnement: "internationale", pays_intervention: [{"pays":"Guinée"},{"pays":"Espagne","ville":"Madrid"}] },
    "femmes-congo":   { origine1: "RD Congo",        origine2: null,         rayonnement: "nationale",      pays_intervention: [] },
    "togo-num":       { origine1: "Togo",            origine2: "Suisse",     rayonnement: "internationale", pays_intervention: [{"pays":"Togo"},{"pays":"Suisse","ville":"Genève"}] },
  };

  const missionMap = {
    "aito": "Fédérer, représenter et valoriser la diaspora ivoirienne d'Occitanie. Créer des liens entre la France et la Côte d'Ivoire à travers l'entraide, la culture et l'entrepreneuriat.",
    "tech4senegal": "Mettre les compétences technologiques de la diaspora sénégalaise au service du développement agricole durable au Sénégal.",
    "mali-sante": "Améliorer l'accès aux soins dans les zones rurales maliennes grâce aux dons et compétences de la diaspora malienne en Belgique.",
  };
  const historiqueMap = {
    "aito": "Fondée en 2012 par un collectif d'étudiants ivoiriens à Toulouse, l'A.I.T.O est devenue en dix ans la principale association de la diaspora ivoirienne d'Occitanie avec plus de 340 membres actifs.",
    "tech4senegal": "Créée en 2018 par des ingénieurs sénégalais basés au Canada, Tech For Senegal a déployé ses premiers capteurs IoT agricoles à Thiès en 2020 avant de s'étendre à 3 régions.",
    "mali-sante": "Née en 2015 à Bruxelles à l'initiative de médecins maliens expatriés, SSF a financé l'équipement de 12 centres de santé en zones rurales maliennes.",
  };
  const siteWebMap = {
    "aito": "https://aito-toulouse.org",
    "tech4senegal": "https://tech4senegal.org",
  };

  for (const it of legacy.INITIATIVES) {
    insertInitiative.run({
      slug: it.id,
      nom: it.nom,
      sigle: it.sigle || null,
      pays: it.pays,
      region: it.region || null,
      ville: it.ville || null,
      zone: it.zone || null,
      nationalite1: it.nationalite1 || null,
      nationalite2: it.nationalite2 || null,
      nationalites_concernees: JSON.stringify(it.nationalites_concernees || []),
      nationalite_unique: it.nationalite_unique ? 1 : 0,
      origine1: (origineMap[it.id] || {}).origine1 || null,
      origine2: (origineMap[it.id] || {}).origine2 || null,
      rayonnement: (origineMap[it.id] || {}).rayonnement || 'locale',
      pays_intervention: JSON.stringify((origineMap[it.id] || {}).pays_intervention || []),
      domaine: it.domaine || null,
      type: it.type || null,
      membres: it.membres || 0,
      vues: it.vues || 0,
      abonnes: it.abonnes || 0,
      description: it.description || null,
      mission: missionMap[it.id] || null,
      historique: historiqueMap[it.id] || null,
      site_web: siteWebMap[it.id] || null,
      lat: it.lat || null,
      lon: it.lon || null,
    });
  }

  /* ---- Actualités & Événements ---- */
  const insertActu = db.prepare(`INSERT INTO actualites (titre, source, date_pub, resume) VALUES (?, ?, ?, ?)`);
  for (const a of legacy.ACTUALITES) insertActu.run(a.titre, a.source, a.date, a.resume);

  const insertEvt = db.prepare(`INSERT INTO evenements (titre, organisateur, date_evt, lieu, statut, domaine, type_evt, pays, inscription_ouverte) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  for (const e of legacy.EVENEMENTS) insertEvt.run(e.titre, e.organisateur, e.date, e.lieu, e.statut||'ouvert', e.domaine||null, e.type||'evenement', e.pays||null);

  /* ---- Fil d'actualité ---- */
  const insertFil = db.prepare(`INSERT INTO fil_posts (auteur_id, auteur_nom, type, categorie, contenu, created_at) VALUES (NULL, ?, ?, ?, ?, datetime('now', ?))`);
  legacy.FIL_ACTUALITE.forEach((p, idx) => {
    insertFil.run(p.auteur, p.type, p.categorie, p.contenu, `-${(idx + 1) * 3} hours`);
  });

  // Ajouter des posts supplémentaires sur les 14 derniers jours pour les tendances
  const postsDemo = [
    { auteur:"Jean K.", type:"post", cat:"annonce",     contenu:"Rejoignez notre réseau d'entrepreneurs diaspora — plus de 500 membres actifs !",    jours:1 },
    { auteur:"A.I.T.O", type:"post", cat:"evenement",   contenu:"Webinaire gratuit : Créer son entreprise en Afrique depuis l'Europe — 15 juillet",    jours:2 },
    { auteur:"Ynouss D.", type:"post", cat:"article",   contenu:"Retour d'expérience : comment j'ai monté ma startup entre Paris et Dakar",             jours:3 },
    { auteur:"DiaspoActif", type:"officiel", cat:"annonce", contenu:"📣 Nouveau : l'Observatoire Diaspora est en ligne. Collectivités, découvrez les données.",jours:4 },
    { auteur:"Jean K.", type:"post", cat:"question",    contenu:"Question : quels sont les meilleurs outils pour gérer une équipe transnationale ?",    jours:5 },
    { auteur:"A.I.T.O", type:"post", cat:"partage",    contenu:"Partenariat signé avec l'APIX pour faciliter l'investissement des diasporas au Sénégal", jours:6 },
    { auteur:"Ynouss D.", type:"post", cat:"article",   contenu:"Guide pratique : obtenir un visa entrepreneur au Sénégal en 2025",                     jours:7 },
    { auteur:"DiaspoActif", type:"officiel", cat:"alerte", contenu:"Mise à jour des conditions générales d'utilisation — à lire avant le 30 juin",       jours:9 },
    { auteur:"Jean K.", type:"post", cat:"evenement",   contenu:"Je serai au Salon de la Diaspora à Paris — qui vient ? Retrouvons-nous au stand DiaspoActif !", jours:11 },
    { auteur:"A.I.T.O", type:"post", cat:"annonce",    contenu:"Appel à projets ouvert : financement jusqu'à 5000€ pour les initiatives diaspora 2025",   jours:13 },
  ];
  const insertFilExtra = db.prepare(`
    INSERT INTO fil_posts (auteur_id, auteur_nom, type, categorie, contenu, created_at)
    VALUES (NULL, ?, ?, ?, ?, datetime('now', '-' || ? || ' days', '-' || ? || ' hours'))
  `);
  postsDemo.forEach((p, i) => insertFilExtra.run(p.auteur, p.type, p.cat, p.contenu, p.jours, (i % 12) + 1));

  /* ---- Comptes de démonstration (mot de passe : Demo1234!) ---- */
  const insertUser = db.prepare(`
    INSERT INTO users (nom, email, password_hash, password_salt, role, ville, pays, profil_json)
    VALUES (@nom, @email, @password_hash, @password_salt, @role, @ville, @pays, @profil_json)
  `);
  const pw = hashPassword("Demo1234!");

  const jeanProfil = { nationalites: legacy.UTILISATEUR_PROFIL.nationalites, localisation: legacy.UTILISATEUR_PROFIL.localisation };
  const jeanId = insertUser.run({
    nom: "Jean K.", email: "jean@diaspoactif.demo",
    password_hash: pw.hash, password_salt: pw.salt,
    role: "utilisateur", ville: "Toulouse", pays: "France",
    profil_json: JSON.stringify(jeanProfil)
  }).lastInsertRowid;

  insertUser.run({
    nom: legacy.PROFIL_EXEMPLE.nom, email: "ynouss@diaspoactif.demo",
    password_hash: pw.hash, password_salt: pw.salt,
    role: "utilisateur", ville: "Toulouse", pays: "France",
    profil_json: JSON.stringify(legacy.PROFIL_EXEMPLE)
  });

  const initUserId = insertUser.run({
    nom: "A.I.T.O", email: "contact@aito.diaspoactif.demo",
    password_hash: pw.hash, password_salt: pw.salt,
    role: "initiative", ville: "Toulouse", pays: "France",
    profil_json: "{}"
  }).lastInsertRowid;

  const adminId = insertUser.run({
    nom: "Diaspo'Actif Admin", email: "admin@diaspoactif.demo",
    password_hash: pw.hash, password_salt: pw.salt,
    role: "administrateur", ville: null, pays: null,
    profil_json: "{}"
  }).lastInsertRowid;

  insertUser.run({
    nom: "Consulat du Sénégal à Paris", email: "consulat.senegal@diaspoactif.demo",
    password_hash: pw.hash, password_salt: pw.salt,
    role: "collectivite", ville: "Paris", pays: "France",
    profil_json: "{}"
  });

  /* Lier A.I.T.O au compte initiative, activer abonnement */
  db.prepare("UPDATE initiatives SET owner_user_id = ?, abonnement_actif = 1 WHERE slug = 'aito'").run(initUserId);

  /* ---- Abonnements démo (Jean suit 3 initiatives) ---- */
  const aitoId = db.prepare("SELECT id FROM initiatives WHERE slug = 'aito'").get().id;
  const tfsId = db.prepare("SELECT id FROM initiatives WHERE slug = 'tech4senegal'").get()?.id;
  const ssfId = db.prepare("SELECT id FROM initiatives WHERE slug = 'mali-sante'").get()?.id;
  const insertAbo = db.prepare("INSERT INTO abonnements (user_id, initiative_id) VALUES (?, ?)");
  insertAbo.run(jeanId, aitoId);
  if (tfsId) insertAbo.run(jeanId, tfsId);
  if (ssfId) insertAbo.run(jeanId, ssfId);

  /* ---- Formations démo ---- */
  const insertForm = db.prepare(`
    INSERT INTO formations (titre, type_formation, organisme, domaine, nationalite, langue, niveau, description, prix, gratuit, duree, places, initiative_id, owner_user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const formations = [
    ["Entrepreneuriat diaspora : de l'idée au projet", "Webinaire", "A.I.T.O", "Économie", "Toutes nationalités", "Français", "Débutant", "Comment structurer et financer votre projet en diaspora. Retours d'expérience d'entrepreneurs franco-ivoiriens.", 0, 1, "3h", 200, aitoId, initUserId],
    ["Agriculture connectée et IoT pour le développement rural", "Module certifiant", "Tech For Senegal", "Technologie", "Sénégalaise", "Français", "Intermédiaire", "Maîtrisez les capteurs et plateformes IoT appliqués à l'agriculture africaine. Cas pratiques au Sénégal.", 49, 0, "8h (4 sessions)", 50, tfsId || null, null],
    ["Accès aux soins en zones rurales : enjeux et solutions", "Webinaire", "Santé Sans Frontière Mali", "Santé", "Malienne", "Français", "Tous niveaux", "Comprendre les défis sanitaires dans les zones rurales et comment la diaspora peut contribuer.", 0, 1, "2h", 500, ssfId || null, null],
    ["Gestion financière pour associations diaspora", "Atelier en ligne", "Diaspo'Actif", "Finance", "Toutes nationalités", "Français", "Débutant", "Comptabilité associative, gestion des cotisations, demandes de subventions. Animé par des experts bénévoles.", 0, 1, "4h", 80, null, adminId],
    ["Droit des étrangers et naturalisation en France", "Atelier en ligne", "Diaspo'Actif", "Droit", "Toutes nationalités", "Français", "Tous niveaux", "Les démarches administratives, le droit au séjour, la naturalisation et les démarches consulaires. Avec un avocat spécialisé.", 25, 0, "3h", 30, null, adminId],
    ["Leadership féminin dans la diaspora africaine", "Coaching", "A.I.T.O", "Action Sociale", "Toutes nationalités", "Français", "Intermédiaire", "Programme de mentorat sur 6 semaines pour les femmes entrepreneures et associatives de la diaspora.", 0, 1, "6 semaines", 20, aitoId, initUserId],
  ];
  for (const f of formations) insertForm.run(...f);

  /* ---- Certifications démo ---- */
  // Tech For Senegal et A.I.T.O obtiennent le badge Initiative Vérifiée
  const insertCertif = db.prepare(`
    INSERT OR IGNORE INTO certifications (initiative_id, niveau, statut, admin_id, date_attribution)
    VALUES (?, 'verifie', 'actif', ?, datetime('now', ?))
  `);
  const insertHisto = db.prepare(`
    INSERT INTO certification_historique (initiative_id, action, admin_id, admin_nom, motif)
    VALUES (?, 'attribution', ?, 'Diaspo''Actif Admin', ?)
  `);
  if (tfsId) {
    insertCertif.run(tfsId, adminId, '-45 days');
    insertHisto.run(tfsId, adminId, "Structure active, profil complet, projets IoT vérifiés sur le terrain.");
  }
  insertCertif.run(aitoId, adminId, '-12 days');
  insertHisto.run(aitoId, adminId, "Association ivoirienne de référence à Toulouse, entretien réalisé le 12/06/2026.");

  /* ---- Conversation démo Jean ↔ A.I.T.O ---- */
  const convId = db.prepare(`INSERT INTO conversations (user1_id, user2_id) VALUES (?, ?)`).run(jeanId, initUserId).lastInsertRowid;
  const insertMsg = db.prepare(`INSERT INTO messages (conversation_id, sender_id, contenu, created_at) VALUES (?, ?, ?, datetime('now', ?))`);
  insertMsg.run(convId, initUserId, "Bonjour, nous avons vu votre profil et souhaiterions échanger sur un partenariat pour notre forum de novembre.", "-1 day");
  insertMsg.run(convId, jeanId, "Avec plaisir, je suis disponible cette semaine.", "-20 hours");

  /* ---- Accréditation Observatoire Diaspora (Consulat du Sénégal) ---- */
  const consulatId = db.prepare("SELECT id FROM users WHERE email='consulat.senegal@diaspoactif.demo'").get()?.id;
  if (consulatId) {
    const accredId = db.prepare(`
      INSERT OR IGNORE INTO accreditations_observatoire
        (institution_id, date_debut, date_fin, nationalites_autorisees, territoires_autorises, droits, notes_admin)
      VALUES (?, date('now','-30 days'), date('now','+335 days'),
        '["Sénégalaise"]',
        '[{"pays":"France"},{"pays":"Belgique"},{"pays":"Suisse"}]',
        '{"voir_competences":1,"voir_secteurs":1,"voir_initiatives":1,"voir_geographie":1}',
        'Accréditation initiale — Consulat Général du Sénégal à Paris. Périmètre Europe francophone.')
    `).run().lastInsertRowid;
    if (accredId) {
      db.prepare("INSERT INTO accreditations_historique (accreditation_id,action,admin_id,admin_nom,details) VALUES (?,?,?,?,?)")
        .run(accredId, "creation", adminId, "Diaspo'Actif Admin", "Accréditation délivrée — Consulat Général du Sénégal à Paris.");
    }
    /* Communication institutionnelle démo */
    db.prepare(`INSERT OR IGNORE INTO communications_institutionnelles (emetteur_id,titre,contenu,type,cible_json,nb_destinataires)
      VALUES (?,?,?,?,?,?)`)
      .run(consulatId,
        "Programme d'appui aux entrepreneurs sénégalais en Europe",
        "Le Consulat Général du Sénégal à Paris lance un programme d'appui aux entrepreneurs de la diaspora sénégalaise établis en Europe. Ce dispositif comprend un accompagnement juridique, fiscal et financier pour les porteurs de projets souhaitant investir au Sénégal.\n\nInscriptions ouvertes jusqu'au 31 juillet 2026.",
        "appel_projets",
        '{"nationalites":["Sénégalaise"],"pays":["France","Belgique","Suisse"]}',
        42);
    /* Consultation démo */
    const consultId = db.prepare(`INSERT INTO consultations (emetteur_id,titre,description,type,statut,date_cloture,cible_json)
      VALUES (?,?,?,?,?,?,?)`)
      .run(consulatId,
        "Obstacles rencontrés par les entrepreneurs sénégalais en Europe",
        "Cette consultation vise à identifier les principaux freins auxquels font face les entrepreneurs de la diaspora sénégalaise en Europe afin d'adapter notre programme d'appui.",
        "consultation_diaspora", "ouverte", "2026-08-31",
        '{"nationalites":["Sénégalaise"]}').lastInsertRowid;
    const insQ = db.prepare("INSERT INTO consultation_questions (consultation_id,texte,type,options_json,ordre) VALUES (?,?,?,?,?)");
    insQ.run(consultId, "Quels sont les principaux obstacles que vous rencontrez dans votre activité entrepreneuriale ?", "choix_multiple",
      '["Accès au financement","Complexité administrative","Réseau professionnel limité","Fiscalité","Méconnaissance du marché sénégalais","Autre"]', 0);
    insQ.run(consultId, "Quel type d'accompagnement souhaiteriez-vous en priorité ?", "choix_unique",
      '["Accompagnement juridique","Accompagnement fiscal","Mise en réseau","Accès aux financements","Formation entrepreneuriale"]', 1);
    insQ.run(consultId, "Avez-vous des commentaires ou suggestions supplémentaires ?", "texte_libre", "[]", 2);
  }

  /* ===== ACTIVITÉ PLATEFORME (DAU/WAU/MAU) ===== */
  const allUsers = db.prepare("SELECT id FROM users").all().map(r => r.id);
  const insAct = db.prepare("INSERT OR IGNORE INTO user_activity (user_id, date) VALUES (?,?)");
  // Simuler 30 jours d'activité : chaque utilisateur actif en moyenne 60% des jours
  for (let d = 29; d >= 0; d--) {
    const dateStr = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    // Taux de présence décroissant avec le recul (plus actifs récemment)
    const taux = 0.3 + (29 - d) / 29 * 0.5; // 30% → 80%
    allUsers.forEach(uid => {
      if (Math.random() < taux) insAct.run(uid, dateStr);
    });
  }

  /* ===== ENGAGEMENT : RÉACTIONS, COMMENTAIRES, SESSIONS ===== */
  const allPosts = db.prepare("SELECT id FROM fil_posts").all().map(r => r.id);
  const insReact = db.prepare("INSERT OR IGNORE INTO fil_reactions (post_id, user_id, type) VALUES (?,?,?)");
  const insComm  = db.prepare("INSERT INTO fil_commentaires (post_id, auteur_id, auteur_nom, contenu, created_at) VALUES (?,?,?,?,datetime('now',?))");
  const insSession = db.prepare(`
    INSERT OR IGNORE INTO user_sessions (user_id, date, duree_sec) VALUES (?,?,?)
  `);

  const commentairesSeed = [
    "Excellent partage, merci pour ces infos précieuses !",
    "Très inspirant, je vais me renseigner davantage.",
    "Je suis entièrement d'accord avec ce point de vue.",
    "Avez-vous des ressources supplémentaires à recommander ?",
    "Bravo pour cette initiative, c'est exactement ce dont on avait besoin.",
    "Pouvez-vous partager le lien vers le programme complet ?",
    "Je partage à mon réseau, merci !",
    "Cette question est fondamentale pour notre communauté.",
    "Hâte de participer à cet événement !",
    "Merci pour ce retour d'expérience très utile.",
  ];

  allPosts.forEach(postId => {
    // Likes : 20%→90% des utilisateurs selon popularité
    const likeRate = 0.2 + Math.random() * 0.7;
    allUsers.forEach(uid => {
      if (Math.random() < likeRate) insReact.run(postId, uid, "like");
      if (Math.random() < 0.08) insReact.run(postId, uid, "repost");
    });
    // Commentaires : 0 à 4 par post
    const nbComm = Math.floor(Math.random() * 5);
    for (let i = 0; i < nbComm; i++) {
      const uid = allUsers[Math.floor(Math.random() * allUsers.length)];
      const nom = db.prepare("SELECT nom FROM users WHERE id=?").get(uid)?.nom || "Membre";
      const texte = commentairesSeed[Math.floor(Math.random() * commentairesSeed.length)];
      const heuresPassees = Math.floor(Math.random() * 72);
      insComm.run(postId, uid, nom, texte, `-${heuresPassees} hours`);
    }
  });

  // Sessions : durée réaliste sur 30 jours (entre 2 et 25 minutes par session)
  for (let d = 29; d >= 0; d--) {
    const dateStr = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
    const taux = 0.3 + (29 - d) / 29 * 0.5;
    allUsers.forEach(uid => {
      if (Math.random() < taux) {
        const dureeMin = 2 + Math.floor(Math.random() * 23); // 2–25 min
        insSession.run(uid, dateStr, dureeMin * 60);
      }
    });
  }

  /* ===== PUBLICITÉS DÉMO ===== */
  const insPub = db.prepare(`
    INSERT OR IGNORE INTO publicites
      (titre,description,image_url,lien_url,lien_texte,annonceur,format,statut,date_debut,date_fin,priorite,
       cible_pays,cible_roles,cible_nationalites,created_by)
    VALUES (?,?,?,?,?,?,?,?,date('now','-5 days'),date('now','+60 days'),?,?,?,?,?)
  `);
  // Bannière universelle
  insPub.run(
    "Salon de la Diaspora 2025 — Paris","Retrouvez les acteurs de la diaspora africaine pour 3 jours d'échanges, networking et opportunités.",
    "https://picsum.photos/seed/salon2025/800/200","https://diaspoactif.fr","Découvrir le programme",
    "Diaspo'Actif","banniere","active",3,
    "[]","[]","[]",adminId
  );
  // Post natif — ciblé Sénégalais en France
  insPub.run(
    "Ouvrir une entreprise au Sénégal : guide pratique","APIX vous accompagne dans vos démarches d'investissement. Découvrez les opportunités et avantages fiscaux.",
    "https://picsum.photos/seed/apix/600/400","https://apix.sn","En savoir plus",
    "APIX Sénégal","native","active",2,
    '["France"]','["utilisateur","initiative"]','["Sénégalaise"]',adminId
  );
  // Annuaire — toutes nationalités
  insPub.run(
    "AssurDiaspora — Assurance rapatriement & famille","Protégez votre famille où qu'elle soit. Offres dédiées aux membres de la diaspora.",
    "https://picsum.photos/seed/assur/400/300","https://assurdiaspora.com","Obtenir un devis",
    "AssurDiaspora","annuaire","active",1,
    "[]","[]","[]",adminId
  );

  console.log(`Seed terminé : ${legacy.INITIATIVES.length} initiatives, 5 comptes, 6 formations, ${3} abonnements démo.`);
  console.log("Comptes démo (mot de passe : Demo1234!) :");
  console.log("  jean@diaspoactif.demo            → utilisateur");
  console.log("  ynouss@diaspoactif.demo          → utilisateur (profil complet)");
  console.log("  contact@aito.diaspoactif.demo    → initiative (A.I.T.O)");
  console.log("  admin@diaspoactif.demo           → administrateur");
  console.log("  consulat.senegal@diaspoactif.demo → collectivite");
}

seed();

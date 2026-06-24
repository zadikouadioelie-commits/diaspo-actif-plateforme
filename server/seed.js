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

  console.log(`Seed terminé : ${legacy.INITIATIVES.length} initiatives, 5 comptes, 6 formations, ${3} abonnements démo.`);
  console.log("Comptes démo (mot de passe : Demo1234!) :");
  console.log("  jean@diaspoactif.demo            → utilisateur");
  console.log("  ynouss@diaspoactif.demo          → utilisateur (profil complet)");
  console.log("  contact@aito.diaspoactif.demo    → initiative (A.I.T.O)");
  console.log("  admin@diaspoactif.demo           → administrateur");
  console.log("  consulat.senegal@diaspoactif.demo → collectivite");
}

seed();

#!/usr/bin/env node
/* ── Création des comptes de test Diaspo'Actif ──
   Lance avec : node server/seed-comptes-test.js
   Nécessite DATABASE_URL dans l'environnement.
*/
const { Pool } = require("pg");
const crypto = require("node:crypto");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

const COMPTES = [
  {
    nom: "Utilisateur Test",
    prenom: "Jean",
    email: "test-utilisateur@diaspoactif.com",
    password: "TestUser2024!",
    role: "utilisateur",
    pays_origine: "Côte d'Ivoire",
    pays_residence: "France",
    ville: "Paris",
    bio: "Compte de test — utilisateur standard de la plateforme Diaspo'Actif.",
    is_demo: true
  },
  {
    nom: "Initiative Test",
    prenom: "Marie",
    email: "test-initiative@diaspoactif.com",
    password: "TestInit2024!",
    role: "initiative",
    nom_institution: "Initiative Diaspora Tech",
    pays_origine: "Sénégal",
    pays_residence: "Belgique",
    ville: "Bruxelles",
    bio: "Compte de test — porteur d'initiative diasporique.",
    is_demo: true
  },
  {
    nom: "Collectivité Test",
    prenom: null,
    email: "test-collectivite@diaspoactif.com",
    password: "TestColl2024!",
    role: "collectivite",
    nom_institution: "Mairie de Test",
    pays_residence: "France",
    ville: "Lyon",
    bio: "Compte de test — collectivité territoriale partenaire.",
    is_demo: true
  },
  {
    nom: "Administrateur",
    prenom: "Admin",
    email: "admin@diaspoactif.com",
    password: "AdminDA@2024!Secure",
    role: "administrateur",
    pays_residence: "France",
    ville: "Paris",
    bio: "Compte administrateur de la plateforme Diaspo'Actif.",
    is_demo: false
  }
];

async function run() {
  const client = await pool.connect();
  try {
    /* Ajouter les colonnes si elles n'existent pas */
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE");
    await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS nom_institution TEXT");

    for (const c of COMPTES) {
      const { hash, salt } = hashPassword(c.password);
      await client.query(`
        INSERT INTO users (nom, prenom, email, password_hash, password_salt, role,
          nom_institution, ville, bio, is_demo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          password_salt = EXCLUDED.password_salt,
          role = EXCLUDED.role,
          is_demo = EXCLUDED.is_demo
      `, [
        c.nom, c.prenom || null, c.email, hash, salt, c.role,
        c.nom_institution || null, c.ville || null, c.bio || null,
        c.is_demo
      ]);
      console.log(`✅ ${c.role.toUpperCase()} — ${c.email}`);
    }

    console.log("\n🎉 Comptes créés avec succès !\n");
    console.log("┌─────────────────────────────────────────────────────────┐");
    console.log("│  COMPTES DE TEST                                        │");
    console.log("├───────────────────────────┬─────────────────────────────┤");
    for (const c of COMPTES) {
      const role = c.role.padEnd(14);
      const email = c.email.padEnd(36);
      console.log(`│  ${role} │ ${email}│`);
      console.log(`│  mot de passe : ${c.password.padEnd(40)}│`);
      console.log("├───────────────────────────┴─────────────────────────────┤");
    }
    console.log("└─────────────────────────────────────────────────────────┘");

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error("❌ Erreur:", e.message); process.exit(1); });

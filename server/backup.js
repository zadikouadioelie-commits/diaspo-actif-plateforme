/* ===========================================================
   DIASPO'ACTIF — Sauvegarde manuelle/programmée de la base
   Filet de sécurité GRATUIT en complément du PITR Neon (6h).
   Exporte toutes les tables en un fichier JSON horodaté.

   Usage :
     DATABASE_URL=... node server/backup.js
     DATABASE_URL=... node server/backup.js --out C:\chemin\vers\dossier

   Ne nécessite aucun abonnement, aucune dépendance en plus de "pg"
   (déjà utilisée par db-pg.js pour la connexion à Neon).
   =========================================================== */
const fs = require("node:fs");
const path = require("node:path");

if (!process.env.DATABASE_URL) {
  console.error("[backup] DATABASE_URL manquant — ce script sauvegarde uniquement la base PostgreSQL (production/Neon).");
  console.error("[backup] Exemple : DATABASE_URL=postgresql://... node server/backup.js");
  process.exit(1);
}

const { Pool } = require("pg");
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

const argOut = process.argv.find((a, i) => process.argv[i - 1] === "--out");
const OUT_DIR = argOut || path.join(__dirname, "..", "backups");

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log("[backup] Connexion à la base…");
  const { rows: tables } = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema='public' AND table_type='BASE TABLE'
    ORDER BY table_name
  `);
  console.log(`[backup] ${tables.length} tables trouvées.`);

  const dump = { exported_at: new Date().toISOString(), tables: {} };
  let totalRows = 0;

  for (const { table_name } of tables) {
    try {
      const { rows } = await pool.query(`SELECT * FROM "${table_name}"`);
      dump.tables[table_name] = rows;
      totalRows += rows.length;
      console.log(`  ✓ ${table_name} (${rows.length} lignes)`);
    } catch (e) {
      console.error(`  ✗ ${table_name} — erreur: ${e.message}`);
      dump.tables[table_name] = { _error: e.message };
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = path.join(OUT_DIR, `diaspoactif-backup-${stamp}.json`);
  fs.writeFileSync(filename, JSON.stringify(dump, null, 0));

  const sizeMo = (fs.statSync(filename).size / 1024 / 1024).toFixed(2);
  console.log(`\n[backup] ✅ Terminé : ${filename}`);
  console.log(`[backup] ${tables.length} tables, ${totalRows} lignes, ${sizeMo} Mo`);

  await cleanupOldBackups();
  await pool.end();
}

/* Conserve les 14 derniers exports, supprime les plus anciens (évite de saturer le disque) */
async function cleanupOldBackups(keep = 14) {
  const files = fs.readdirSync(OUT_DIR)
    .filter(f => f.startsWith("diaspoactif-backup-") && f.endsWith(".json"))
    .map(f => ({ f, t: fs.statSync(path.join(OUT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  const toDelete = files.slice(keep);
  toDelete.forEach(({ f }) => {
    fs.unlinkSync(path.join(OUT_DIR, f));
    console.log(`[backup] 🗑 Ancienne sauvegarde supprimée : ${f}`);
  });
}

main().catch(e => {
  console.error("[backup] ❌ Échec :", e.message);
  process.exit(1);
});

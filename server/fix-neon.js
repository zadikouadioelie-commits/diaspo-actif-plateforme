const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function run() {
  const cols = await p.query("SELECT column_name FROM information_schema.columns WHERE table_name='formations' ORDER BY ordinal_position");
  console.log('formations:', cols.rows.map(x => x.column_name).join(', '));
  // Ajouter colonnes manquantes
  await p.query(`ALTER TABLE formations ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'publiee'`);
  await p.query(`ALTER TABLE formations ADD COLUMN IF NOT EXISTS motif_refus TEXT`);
  await p.query(`ALTER TABLE formations ADD COLUMN IF NOT EXISTS organisateur_id INTEGER`);
  await p.query(`ALTER TABLE formations ADD COLUMN IF NOT EXISTS brouillon INTEGER DEFAULT 0`);
  console.log('Colonnes ajoutées OK');
  p.end();
}
run().catch(e => { console.error(e.message); p.end(); });

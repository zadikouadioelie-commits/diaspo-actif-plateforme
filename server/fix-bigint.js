const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  // 1. Trouver toutes les colonnes INTEGER qui stockent des timestamps (ms Unix)
  const r = await p.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE data_type = 'integer'
      AND column_name IN ('created_at','updated_at','expires_at','timestamp','last_active','last_login','last_seen')
      AND table_schema = 'public'
    ORDER BY table_name, column_name
  `);

  console.log(`Colonnes INTEGER à migrer en BIGINT (${r.rows.length}) :`);
  for (const row of r.rows) {
    console.log(` - ${row.table_name}.${row.column_name}`);
  }

  for (const row of r.rows) {
    try {
      await p.query(`ALTER TABLE "${row.table_name}" ALTER COLUMN "${row.column_name}" TYPE BIGINT`);
      console.log(`✅ ${row.table_name}.${row.column_name} → BIGINT`);
    } catch (e) {
      console.log(`⚠️  ${row.table_name}.${row.column_name} : ${e.message}`);
    }
  }

  // 2. Vérifier aussi la colonne created_at dans sessions
  try {
    await p.query(`ALTER TABLE sessions ALTER COLUMN created_at TYPE BIGINT`);
    console.log('✅ sessions.created_at → BIGINT (confirmé)');
  } catch (e) {
    console.log('sessions.created_at :', e.message);
  }

  console.log('\n✅ Migration BIGINT terminée');
  p.end();
}
run().catch(e => { console.error(e.message); p.end(); });

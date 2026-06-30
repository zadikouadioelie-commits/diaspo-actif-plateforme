const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const tables = ['fil_posts','fil_reactions','fil_commentaires','fil_post_views','conversations','messages','user_follows'];
  for (const t of tables) {
    const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name=$1 ORDER BY ordinal_position", [t]);
    if (r.rows.length === 0) console.log("MISSING: " + t);
    else console.log(t + ": " + r.rows.map(x => x.column_name).join(", "));
  }
  const ud = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' AND column_name='is_demo'");
  console.log(ud.rows.length ? "OK: users.is_demo" : "MISSING: users.is_demo");
  pool.end();
}
run().catch(e => { console.error(e.message); pool.end(); });

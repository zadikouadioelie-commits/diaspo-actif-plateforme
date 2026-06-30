/* ===========================================================
   DIASPO'ACTIF — Adaptateur PostgreSQL (Neon)
   Même interface que node:sqlite DatabaseSync mais async.
   Utilisé en production quand DATABASE_URL est définie.
   =========================================================== */
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

/* Convertit les placeholders ? en $1, $2... pour Postgres */
function toPg(sql) {
  let i = 0;
  return sql
    .replace(/\?/g, () => `$${++i}`)
    .replace(/datetime\('now'\)/gi, "NOW()")
    .replace(/date\('now'\)/gi, "CURRENT_DATE")
    .replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, "BIGSERIAL PRIMARY KEY")
    .replace(/\bBLOB\b/gi, "BYTEA")
    .replace(/INSERT OR IGNORE INTO/gi, "INSERT INTO")
    .replace(/INSERT OR REPLACE INTO/gi, "INSERT INTO")
    .replace(/ON CONFLICT\b/gi, "ON CONFLICT");
}

/* Retourne un résultat INSERT avec lastInsertRowid */
function addReturning(sql) {
  const s = sql.trim().toUpperCase();
  if (s.startsWith("INSERT") && !s.includes("RETURNING")) {
    return sql.trimEnd() + " RETURNING id";
  }
  return sql;
}

/* Convertit PRAGMA table_info(x) en requête pg */
function isPragmaInfo(sql) {
  return /^\s*PRAGMA\s+table_info\s*\(/i.test(sql);
}
function pragmaToTable(sql) {
  const m = sql.match(/PRAGMA\s+table_info\s*\(\s*(\w+)\s*\)/i);
  return m ? m[1] : null;
}

/* Classe statement — équivalent de DatabaseSync.prepare() */
class PgStatement {
  constructor(sql) {
    this._raw = sql;
    this._pragma = isPragmaInfo(sql);
    this._table = this._pragma ? pragmaToTable(sql) : null;
    this._sql = this._pragma ? null : toPg(sql);
  }

  /* Retourne une ligne ou null */
  async get(...args) {
    if (this._pragma) {
      const r = await pool.query(
        "SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'",
        [this._table]
      );
      return r.rows[0] || null;
    }
    const params = args.flat();
    const r = await pool.query(this._sql, params);
    return r.rows[0] || null;
  }

  /* Retourne toutes les lignes */
  async all(...args) {
    if (this._pragma) {
      const r = await pool.query(
        "SELECT column_name AS name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public'",
        [this._table]
      );
      return r.rows;
    }
    const params = args.flat();
    const r = await pool.query(this._sql, params);
    return r.rows;
  }

  /* Exécute (INSERT/UPDATE/DELETE) — retourne { changes, lastInsertRowid } */
  async run(...args) {
    const params = args.flat();
    const sql = addReturning(this._sql);
    const r = await pool.query(sql, params);
    return {
      changes: r.rowCount || 0,
      lastInsertRowid: r.rows[0]?.id || null,
    };
  }
}

/* db.exec() — pour CREATE TABLE, etc. */
async function exec(sql) {
  // Découpe les instructions multiples séparées par ;
  const stmts = sql
    .split(/;\s*/)
    .map(s => s.trim())
    .filter(Boolean);

  for (const stmt of stmts) {
    const pg = toPg(stmt);
    try {
      await pool.query(pg);
    } catch (e) {
      // Ignore "already exists" errors pour les migrations
      if (!e.message.includes("already exists") &&
          !e.message.includes("duplicate column")) {
        console.error("[db-pg] exec error:", e.message, "\nSQL:", pg.slice(0, 200));
      }
    }
  }
}

function prepare(sql) {
  return new PgStatement(sql);
}

/* Migrations automatiques au démarrage */
pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT").catch(() => {});
pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires BIGINT").catch(() => {});
pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT").catch(() => {});

module.exports = { prepare, exec, pool };

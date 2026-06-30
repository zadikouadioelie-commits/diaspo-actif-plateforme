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
    // INSERT OR IGNORE → INSERT avec ON CONFLICT DO NOTHING (si pas déjà présent)
    .replace(/\bINSERT OR IGNORE INTO\b/gi, "INSERT INTO")
    .replace(/\bINSERT OR REPLACE INTO\b/gi, "INSERT INTO")
    .replace(/ON CONFLICT\b/gi, "ON CONFLICT");
}

/* Ajoute ON CONFLICT DO NOTHING aux INSERT qui venaient de INSERT OR IGNORE */
function wasIgnoreInsert(rawSql) {
  return /\bINSERT OR IGNORE INTO\b/i.test(rawSql);
}

/* Ajoute RETURNING id pour récupérer l'ID inséré, sauf si déjà présent */
function addReturningIfNeeded(sql, raw) {
  const s = sql.trim().toUpperCase();
  if (!s.startsWith("INSERT")) return sql;
  let out = sql;
  // Ajouter ON CONFLICT DO NOTHING pour les INSERT OR IGNORE d'origine
  if (wasIgnoreInsert(raw) && !s.includes("ON CONFLICT")) {
    out = out.trimEnd() + " ON CONFLICT DO NOTHING";
  }
  // Ajouter RETURNING id si pas déjà là
  if (!out.trim().toUpperCase().includes("RETURNING")) {
    out = out.trimEnd() + " RETURNING id";
  }
  return out;
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
    const sql = addReturningIfNeeded(this._sql, this._raw);
    try {
      const r = await pool.query(sql, params);
      return { changes: r.rowCount || 0, lastInsertRowid: r.rows[0]?.id || null };
    } catch (e) {
      // La table n'a pas de colonne "id" — réessai sans RETURNING
      if (e.code === '42703' && e.message.includes('"id"')) {
        const sqlNoRet = sql.replace(/\s+RETURNING id\s*$/i, '');
        const r = await pool.query(sqlNoRet, params);
        return { changes: r.rowCount || 0, lastInsertRowid: null };
      }
      throw e;
    }
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
pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE").catch(() => {});
pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS nom_institution TEXT").catch(() => {});

module.exports = { prepare, exec, pool };

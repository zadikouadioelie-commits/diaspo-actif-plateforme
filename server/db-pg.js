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
  /* Filet de sécurité : une fonction serverless qui se fige/meurt en plein milieu
     d'une requête (ou en attente du verrou pg_advisory_lock de pg-init.js) ne doit
     jamais laisser une session Postgres bloquée indéfiniment — ça a déjà provoqué
     une panne totale du site (verrou jamais libéré → toutes les requêtes suivantes
     en attente pour toujours). Ces timeouts forcent Postgres à couper lui-même. */
  statement_timeout: 20000,
  query_timeout: 20000,
  idle_in_transaction_session_timeout: 20000,
});

/* Ne jamais laisser une erreur sur une connexion inactive du pool (ex: coupure réseau
   côté Neon) faire planter tout le process serverless avec une exception non gérée. */
pool.on('error', (err) => {
  console.error('[pg pool] erreur sur connexion inactive :', err.message);
});

/* Traduit julianday(X) SQLite → équivalent PostgreSQL, en respectant les parenthèses
   imbriquées (X peut contenir COALESCE(...), etc.). Le code n'utilise julianday()
   que pour des SOUSTRACTIONS (julianday(a) - julianday(b)) : seul l'écart entre deux
   appels doit être correct, l'origine (epoch) choisie s'annule dans la différence. */
function translateJulianday(sql) {
  const marker = "julianday(";
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const idx = sql.indexOf(marker, i);
    if (idx === -1) { out += sql.slice(i); break; }
    out += sql.slice(i, idx);
    let depth = 1, j = idx + marker.length;
    while (j < sql.length && depth > 0) {
      if (sql[j] === "(") depth++;
      else if (sql[j] === ")") depth--;
      j++;
    }
    const inner = sql.slice(idx + marker.length, j - 1);
    out += `(EXTRACT(EPOCH FROM (${inner})::timestamptz) / 86400.0)`;
    i = j;
  }
  return out;
}

/* Traduit date(X) SQLite (X ≠ 'now', déjà traité en amont) → to_char text PostgreSQL.
   Nécessaire car en Postgres `date(col)` est interprété comme un CAST vers le type
   `date`, qui ne se compare pas au texte produit par les traductions date('now')
   (erreur "operator does not exist: date = text" — vue en prod le 2026-07-02).
   Gère la forme à 2 args date(x,'unixepoch'). Parenthèses imbriquées respectées. */
function translateDateFn(sql) {
  const lower = sql.toLowerCase();
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const idx = lower.indexOf("date(", i);
    if (idx === -1) { out += sql.slice(i); break; }
    // Vérifie la frontière de mot (exclut update(, date_trunc n'a pas de "date(")
    const prev = idx > 0 ? sql[idx - 1] : "";
    if (/[A-Za-z0-9_$]/.test(prev)) { out += sql.slice(i, idx + 5); i = idx + 5; continue; }
    let depth = 1, j = idx + 5;
    while (j < sql.length && depth > 0) {
      if (sql[j] === "(") depth++;
      else if (sql[j] === ")") depth--;
      j++;
    }
    const inner = sql.slice(idx + 5, j - 1).trim();
    out += sql.slice(i, idx);
    const unixMatch = inner.match(/^([\s\S]+?),\s*'unixepoch'$/i);
    if (unixMatch) {
      out += `to_char(to_timestamp((${unixMatch[1].trim()})::double precision),'YYYY-MM-DD')`;
    } else {
      out += `to_char((${inner})::timestamptz,'YYYY-MM-DD')`;
    }
    i = j;
  }
  return out;
}

/* Convertit les placeholders ? en $1, $2... pour Postgres.
   Domaine TEXTE partout pour les fonctions date/heure : en SQLite, datetime()/date()/
   strftime() renvoient des chaînes et les colonnes *_at sont TEXT — les traductions
   doivent donc produire du texte, sinon Postgres refuse les mélanges de types
   (ex: COALESCE(created_at, NOW()) → "COALESCE types text and timestamptz cannot
   be matched", cause du crash trust-score du 2026-07-02). */
function toPg(sql) {
  let i = 0;
  const out = sql
    .replace(/\?/g, () => `$${++i}`)
    // datetime('now', modifier) SQLite → PostgreSQL (avant la forme sans modificateur)
    .replace(/datetime\('now',\s*'-(\d+)\s*(day|hour|minute|month|year)s?'\)/gi,
      (_, n, unit) => `to_char(NOW() - INTERVAL '${n} ${unit.toLowerCase()}s','YYYY-MM-DD HH24:MI:SS')`)
    .replace(/datetime\('now',\s*'start of (day|month|year)'\)/gi,
      (_, unit) => `to_char(date_trunc('${unit.toLowerCase()}',NOW()),'YYYY-MM-DD HH24:MI:SS')`)
    // Forme dynamique : datetime('now','-'||expr||' days')
    .replace(/datetime\('now',\s*'-'\s*\|\|\s*([\s\S]+?)\s*\|\|\s*'\s*days?'\)/gi,
      (_, expr) => `to_char(NOW() - ((${expr})::int * INTERVAL '1 day'),'YYYY-MM-DD HH24:MI:SS')`)
    .replace(/datetime\('now'\)/gi, "to_char(NOW(),'YYYY-MM-DD HH24:MI:SS')")
    // strftime SQLite → to_char PostgreSQL (ordre important: plus spécifique d'abord)
    .replace(/strftime\('%Y-%m',\s*'now',\s*'-1 month'\)/gi, "to_char(NOW() - INTERVAL '1 month','YYYY-MM')")
    .replace(/strftime\('%Y-%m',\s*'now'\)/gi, "to_char(NOW(),'YYYY-MM')")
    .replace(/strftime\('%Y',\s*'now'\)/gi, "to_char(NOW(),'YYYY')")
    // strftime(fmt, colonne) — formats utilisés dans le code : %Y-%m, %Y, %m
    .replace(/strftime\('%Y-%m',\s*([A-Za-z_][A-Za-z0-9_.]*)\)/gi, (_, col) => `to_char((${col})::timestamptz,'YYYY-MM')`)
    .replace(/strftime\('%Y',\s*([A-Za-z_][A-Za-z0-9_.]*)\)/gi, (_, col) => `to_char((${col})::timestamptz,'YYYY')`)
    .replace(/strftime\('%m',\s*([A-Za-z_][A-Za-z0-9_.]*)\)/gi, (_, col) => `to_char((${col})::timestamptz,'MM')`)
    // date('now', modifier) SQLite → PostgreSQL
    .replace(/date\('now',\s*'-(\d+)\s*(day|month|year)s?'\)/gi,
      (_, n, unit) => `to_char(CURRENT_DATE - INTERVAL '${n} ${unit.toLowerCase()}s','YYYY-MM-DD')`)
    // Forme dynamique : date('now','-'||expr||' days')
    .replace(/date\('now',\s*'-'\s*\|\|\s*([\s\S]+?)\s*\|\|\s*'\s*days?'\)/gi,
      (_, expr) => `to_char(CURRENT_DATE - ((${expr})::int * INTERVAL '1 day'),'YYYY-MM-DD')`)
    .replace(/date\('now'\)/gi, "to_char(CURRENT_DATE,'YYYY-MM-DD')")
    // MIN(val, expr) SQLite (LEAST) → LEAST PostgreSQL (MIN() seul est un agrégat)
    .replace(/\bMIN\((\d+),/gi, "LEAST($1,")
    .replace(/\bINTEGER PRIMARY KEY AUTOINCREMENT\b/gi, "BIGSERIAL PRIMARY KEY")
    .replace(/\bBLOB\b/gi, "BYTEA")
    .replace(/\bINSERT OR IGNORE INTO\b/gi, "INSERT INTO")
    .replace(/\bINSERT OR REPLACE INTO\b/gi, "INSERT INTO")
    .replace(/ON CONFLICT\b/gi, "ON CONFLICT");
  return translateDateFn(translateJulianday(out));
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

/* Convertit les BigInt en Number dans les résultats (COUNT(*) PostgreSQL retourne BigInt) */
function normalizeBigInt(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj);
  if (Array.isArray(obj)) return obj.map(normalizeBigInt);
  if (typeof obj === 'object') {
    const out = {};
    for (const k of Object.keys(obj)) out[k] = normalizeBigInt(obj[k]);
    return out;
  }
  return obj;
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
    return normalizeBigInt(r.rows[0]) || null;
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
    return normalizeBigInt(r.rows);
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

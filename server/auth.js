/* ===========================================================
   DIASPO'ACTIF — Authentification (hash de mots de passe + sessions SQLite)
   Sessions persistées en DB pour survivre aux cold starts Vercel
   =========================================================== */
const crypto = require("node:crypto");
const db = require("./db");

/* Créer la table sessions si elle n'existe pas */
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

/* Nettoyer les sessions > 30 jours au démarrage */
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
try { db.prepare("DELETE FROM sessions WHERE created_at < ?").run(Date.now() - THIRTY_DAYS); } catch(e) {}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(expectedHash, "hex"));
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT OR REPLACE INTO sessions (token, user_id, created_at) VALUES (?,?,?)").run(token, userId, Date.now());
  return token;
}

function getSession(token) {
  if (!token) return null;
  const row = db.prepare("SELECT user_id, created_at FROM sessions WHERE token=?").get(token);
  if (!row) return null;
  if (Date.now() - row.created_at > THIRTY_DAYS) { db.prepare("DELETE FROM sessions WHERE token=?").run(token); return null; }
  return { userId: row.user_id, createdAt: row.created_at };
}

function destroySession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token=?").run(token);
}

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  });
  return out;
}

module.exports = { hashPassword, verifyPassword, createSession, getSession, destroySession, parseCookies };

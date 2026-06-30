/* ===========================================================
   DIASPO'ACTIF — Point d'entrée Vercel Serverless
   Production : PostgreSQL (Neon) via DATABASE_URL
   Développement : SQLite dans /tmp
   =========================================================== */
const fs   = require("node:fs");
const path = require("node:path");

const DB_PATH  = "/tmp/diaspoactif.db";
const IS_PG    = !!process.env.DATABASE_URL;

let handleRequest;
let initPromise;

try {
  if (IS_PG) {
    /* ── Mode PostgreSQL (production Neon) ── */
    const pgInit = require("../server/pg-init");
    initPromise = pgInit();
    handleRequest = require("../server/index.js");
  } else {
    /* ── Mode SQLite (développement local) ── */
    if (!fs.existsSync(DB_PATH)) {
      require("../server/seed.js");
    }
    handleRequest = require("../server/index.js");
    initPromise = Promise.resolve();
  }
} catch (e) {
  console.error("[Vercel] Init error:", e.stack || e.message);
  handleRequest = function(req, res) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server init failed", detail: e.message }));
  };
  initPromise = Promise.resolve();
}

module.exports = async function(req, res) {
  try {
    await initPromise;
  } catch (e) {
    console.error("[Vercel] DB init error:", e.message);
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "DB init failed", detail: e.message }));
    return;
  }
  return handleRequest(req, res);
};

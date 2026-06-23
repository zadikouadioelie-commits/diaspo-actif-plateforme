/* ===========================================================
   DIASPO'ACTIF — Point d'entrée Vercel Serverless
   Toutes les requêtes /api/* sont routées ici.
   La DB SQLite est en /tmp (éphémère — se re-seed au cold start).
   =========================================================== */
const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = "/tmp/diaspoactif.db";

// Auto-seed si la DB n'existe pas encore (cold start Vercel)
if (!fs.existsSync(DB_PATH)) {
  try {
    require("../server/seed.js");
  } catch (e) {
    console.error("[Vercel] Seed error:", e.message);
  }
}

const handleRequest = require("../server/index.js");

module.exports = handleRequest;

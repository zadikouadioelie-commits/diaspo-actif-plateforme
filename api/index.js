/* ===========================================================
   DIASPO'ACTIF — Point d'entrée Vercel Serverless
   Toutes les requêtes /api/* sont routées ici.
   La DB SQLite est en /tmp (éphémère — se re-seed au cold start).
   =========================================================== */
const fs = require("node:fs");
const path = require("node:path");

const DB_PATH = "/tmp/diaspoactif.db";

let handleRequest;

try {
  // Auto-seed si la DB n'existe pas encore (cold start Vercel)
  if (!fs.existsSync(DB_PATH)) {
    require("../server/seed.js");
  }
  handleRequest = require("../server/index.js");
} catch (e) {
  console.error("[Vercel] Init error:", e.stack || e.message);
  handleRequest = function(req, res) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Server init failed", detail: e.message }));
  };
}

module.exports = handleRequest;

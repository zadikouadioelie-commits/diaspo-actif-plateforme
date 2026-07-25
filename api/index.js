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

/* Une initialisation ratée ne doit PAS condamner l'instance.

   initPromise n'était créée qu'une seule fois, au chargement du module. Si pgInit()
   rejetait — il suffit d'une connexion Neon refusée au réveil de la base, pool.connect()
   se trouvant hors du try — alors TOUTES les requêtes servies par cette instance
   renvoyaient « DB init failed » jusqu'à son recyclage, y compris celles qui n'avaient
   aucun besoin d'une migration. Une panne totale déclenchée par un incident passager.
   Constaté le 2026-07-25 en cliquant sur « Réparer la base » : la requête n'atteignait
   même pas la route.

   Désormais l'échec est mémorisé sans faire rejeter initPromise, la requête est servie
   quand même — le schéma est presque toujours déjà en place, et une route qui manquerait
   vraiment de sa table échouera seule, elle — et l'initialisation est retentée
   périodiquement au lieu d'être abandonnée définitivement. */
let initErreur = null;
let prochainEssaiInit = 0;
const RETENTER_INIT_APRES_MS = 15000;

function lancerInit(demarrer) {
  return Promise.resolve()
    .then(demarrer)
    .then(() => { initErreur = null; })
    .catch((e) => {
      initErreur = e;
      prochainEssaiInit = Date.now() + RETENTER_INIT_APRES_MS;
      console.error("[Vercel] Échec d'initialisation de la base :", e.stack || e.message);
    });
}

if (IS_PG) {
  /* Référence capturée AVANT la réassignation : sans cela, la fonction lirait la nouvelle
     valeur de initPromise et la promesse finirait par s'attendre elle-même. */
  const initialisation = initPromise;
  initPromise = lancerInit(() => initialisation);
}

module.exports = async function(req, res) {
  await initPromise;
  /* Nouvelle tentative en arrière-plan du cycle de requête : si elle réussit, les
     requêtes suivantes retrouvent un schéma à jour sans qu'aucune n'ait été refusée. */
  if (IS_PG && initErreur && Date.now() >= prochainEssaiInit) {
    initPromise = lancerInit(() => require("../server/pg-init")());
    await initPromise;
  }
  if (initErreur) res.setHeader("X-Db-Init", "echec");
  return handleRequest(req, res);
};

#!/usr/bin/env node
/* Régénère les miniatures « Voir l'exemple » de l'Atelier des boutiques.

   Usage :  node scripts/generer-miniatures.js portfolio
            node scripts/generer-miniatures.js ecom video
            node scripts/generer-miniatures.js tous
            node scripts/generer-miniatures.js portfolio --sortie C:\temp\essai   (n'écrase rien dans le dépôt)

   Règle de travail : chaque fois qu'un type est amélioré, refaire sa miniature dans le même commit.

   Fonctionnement (aucune dépendance npm) :
   - un petit serveur local sert le dépôt, avec un FAUX compte administrateur uniquement pour /api/auth/me
     (la vraie base n'est jamais ouverte) ; le bandeau « Exemple » et le voile de connexion sont masqués ;
   - Chrome (ou Edge) sans interface prend la capture ;
   - ffmpeg (dossier local tools/ffmpeg-…/bin, non suivi par git, sinon ffmpeg du PATH) la recadre au format 16:10 et l'écrit en WebP 560 × 350.
   Les adresses des exemples viennent du registre assets/boutique-types.js (source unique). */
"use strict";
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const lancer = promisify(execFile); // asynchrone : le serveur local doit répondre pendant la capture
const { createRequire } = require("node:module");

const RACINE = path.resolve(__dirname, "..");
const MINIATURES = path.join(RACINE, "exemples-boutiques", "miniatures");
const registre = createRequire(__filename)(path.join(RACINE, "assets", "boutique-types.js"));
const TYPES = registre.TYPES;

const TYPES_MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2" };
const MASQUE = "<style>#exBandeau,#exVoile{display:none!important}</style>";

function trouver(candidats) { return candidats.find((c) => c && fs.existsSync(c)); }
const NAVIGATEUR = trouver([
  process.env.CHROME_PATH,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
]);
function dossierFfmpeg() {
  const base = path.join(RACINE, "tools");
  const d = fs.existsSync(base) ? fs.readdirSync(base).find((n) => /^ffmpeg/.test(n)) : null;
  return d ? path.join(base, d, "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg") : "ffmpeg";
}

function demarrerServeur() {
  const srv = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split("?")[0]);
    if (url === "/api/auth/me") { res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ user: { id: 1, role: "administrateur", prenom: "Miniatures" } })); }
    if (url.startsWith("/api/")) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end("{}"); }
    const f = path.resolve(RACINE, "." + (url === "/" ? "/index.html" : url));
    if (!f.startsWith(RACINE + path.sep)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (e, d) => {
      if (e) { res.writeHead(404); return res.end("introuvable"); }
      const ext = path.extname(f).toLowerCase();
      res.writeHead(200, { "Content-Type": TYPES_MIME[ext] || "application/octet-stream" });
      res.end(ext === ".html" ? d.toString("utf8").replace("</head>", MASQUE + "</head>") : d);
    });
  });
  return new Promise((ok) => srv.listen(0, "127.0.0.1", () => ok(srv)));
}

async function main() {
  const args = process.argv.slice(2);
  let sortie = MINIATURES;
  const i = args.indexOf("--sortie");
  if (i >= 0) { sortie = path.resolve(args[i + 1] || ""); args.splice(i, 2); }
  const cles = args.includes("tous") ? Object.keys(TYPES) : args;
  if (!cles.length) { console.error("Indiquez un ou plusieurs types (" + Object.keys(TYPES).join(", ") + ") ou « tous »."); process.exit(1); }
  const inconnus = cles.filter((c) => !TYPES[c] || !TYPES[c].exemple);
  if (inconnus.length) { console.error("Type inconnu ou sans exemple : " + inconnus.join(", ")); process.exit(1); }
  if (!NAVIGATEUR) { console.error("Chrome ou Edge introuvable : indiquez son chemin dans la variable CHROME_PATH."); process.exit(1); }
  fs.mkdirSync(sortie, { recursive: true });

  const serveur = await demarrerServeur();
  const port = serveur.address().port;
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "miniatures-"));
  let echecs = 0;
  try {
    for (const cle of cles) {
      const png = path.join(temp, cle + ".png");
      const cible = path.join(sortie, cle + ".webp");
      try {
        await lancer(NAVIGATEUR, ["--headless", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=1280,900",
          "--virtual-time-budget=6000", "--user-data-dir=" + path.join(temp, "profil-" + cle), "--screenshot=" + png,
          "http://127.0.0.1:" + port + TYPES[cle].exemple], { timeout: 90000 });
        if (!fs.existsSync(png)) throw new Error("capture absente");
        await lancer(dossierFfmpeg(), ["-y", "-loglevel", "error", "-i", png, "-vf", "crop=iw:iw/1.6:0:0,scale=560:350:flags=lanczos", "-c:v", "libwebp", "-quality", "82", cible], { timeout: 60000 });
        console.log("OK  " + cle + " -> " + cible + " (" + fs.statSync(cible).size + " octets)");
      } catch (e) { echecs++; console.error("ÉCHEC " + cle + " : " + e.message); }
    }
  } finally {
    serveur.close();
    fs.rmSync(temp, { recursive: true, force: true });
  }
  process.exit(echecs ? 1 : 0);
}
main();

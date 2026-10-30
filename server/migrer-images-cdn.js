#!/usr/bin/env node
/* Migration des images d'événement stockées en base64 vers le CDN (2026-10-30, demande explicite : « occupe-toi des images sur le CDN »).

   Usage (depuis le dossier du site) :
     node --env-file=.env server/migrer-images-cdn.js --scan                 → compte rendu en LECTURE SEULE : colonnes de toute la base contenant des images base64
     node --env-file=.env server/migrer-images-cdn.js                        → simulation : ce qui serait fait pour les événements, rien n'est écrit ni envoyé
     node --env-file=.env server/migrer-images-cdn.js --appliquer            → migration réelle (sauvegarde d'abord, vérification de chaque adresse avant d'écrire)
     node --env-file=.env server/migrer-images-cdn.js --retablir <fichier>   → remet les valeurs d'origine d'après une sauvegarde

   Sûreté :
   - une sauvegarde JSON des valeurs d'origine est écrite AVANT toute modification (dossier « sauvegardes-migration-images » à côté du dossier du site) ;
   - chaque image est envoyée sur le CDN puis relue (HEAD = 200) avant que la ligne ne soit modifiée ; au moindre doute la ligne est laissée telle quelle ;
   - l'UPDATE ne s'applique que si les valeurs en base sont encore celles lues (aucun écrasement d'une modification faite entre-temps) ;
   - idempotent : une valeur déjà en adresse CDN n'est jamais retouchée ;
   - les anciennes affiches enfermées dans le cadre 2:1 perdent leurs bandes latérales unies (mêmes garde-fous que le rognage d'affichage). */
const fs = require("fs");
const path = require("path");
const https = require("https");
const { Client } = require("pg");
const { imageVersCdn, rognerBandesLaterales, lireDataUri } = require("./images-cdn");

const args = process.argv.slice(2);
const APPLIQUER = args.includes("--appliquer");
const SCAN = args.includes("--scan");
const iRet = args.indexOf("--retablir");

function connexion() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL manquante (lancez avec --env-file=.env)."); process.exit(1); }
  return new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
}
const ko = n => (n / 1024).toFixed(0) + " Ko";
const HEAD = u => new Promise(r => { const q = https.request(u, { method: "HEAD", timeout: 20000 }, res => r(res.statusCode)); q.on("error", () => r(0)); q.on("timeout", () => { q.destroy(); r(0); }); q.end(); });

async function scan(c) {
  const cols = (await c.query("SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('text','character varying') ORDER BY 1,2")).rows;
  const trouves = [];
  for (const { table_name: t, column_name: col } of cols) {
    try {
      const r = (await c.query(`SELECT COUNT(*)::int AS n, COALESCE(SUM(LENGTH("${col}")),0)::bigint AS octets FROM "${t}" WHERE "${col}" LIKE '%data:image/%'`)).rows[0];
      if (r.n > 0) trouves.push({ table: t, colonne: col, lignes: r.n, poids: ko(Number(r.octets)) });
    } catch (e) { /* table/colonne illisible : ignorée */ }
  }
  console.log(trouves.length ? "Colonnes contenant des images base64 :" : "Aucune image base64 trouvée.");
  if (trouves.length) console.table(trouves);
}

async function retablir(c, fichier) {
  const sauv = JSON.parse(fs.readFileSync(fichier, "utf8"));
  for (const l of sauv.lignes) {
    await c.query("UPDATE evenements SET image_couverture=$1, image_url=$2, galerie_photos=$3 WHERE id=$4", [l.image_couverture, l.image_url, l.galerie_photos, l.id]);
    console.log("rétabli : événement", l.id);
  }
}

async function dimensions(valeur, rogner) {
  const p = lireDataUri(valeur); if (!p) return null;
  const sharp = require("sharp");
  const m0 = await sharp(p.buffer).metadata();
  let m1 = m0;
  if (rogner) { const b = await rognerBandesLaterales(p.buffer); m1 = await sharp(b).metadata(); }
  return { avant: `${m0.width}x${m0.height}`, apres: `${m1.width}x${m1.height}`, poids: ko(p.buffer.length) };
}

(async () => {
  const c = connexion();
  await c.connect();
  try {
    console.log("Base :", new URL(process.env.DATABASE_URL).hostname);
    if (SCAN) return await scan(c);
    if (iRet >= 0) return await retablir(c, args[iRet + 1]);

    const lignes = (await c.query(
      "SELECT id, titre, owner_user_id, image_couverture, image_url, galerie_photos FROM evenements WHERE image_couverture LIKE 'data:image/%' OR image_url LIKE 'data:image/%' OR galerie_photos LIKE '%data:image/%' ORDER BY id")).rows;
    console.log(`${lignes.length} événement(s) avec des images en base64.`);
    if (!lignes.length) return;

    const dossier = path.join(__dirname, "..", "..", "sauvegardes-migration-images");
    let sauvegarde = null;
    if (APPLIQUER) {
      fs.mkdirSync(dossier, { recursive: true });
      const fichier = path.join(dossier, "evenements-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
      sauvegarde = { date: new Date().toISOString(), lignes: lignes.map(l => ({ id: l.id, titre: l.titre, image_couverture: l.image_couverture, image_url: l.image_url, galerie_photos: l.galerie_photos })) };
      fs.writeFileSync(fichier, JSON.stringify(sauvegarde));
      console.log("Sauvegarde écrite :", fichier, `(${ko(fs.statSync(fichier).size)})`);
      console.log("Pour revenir en arrière : node --env-file=.env server/migrer-images-cdn.js --retablir \"" + fichier + "\"");
    }

    let total = { ok: 0, ignorees: 0 };
    for (const l of lignes) {
      const cache = new Map(); // la même image (couverture = image_url) n'est envoyée qu'une fois
      const convertir = async v => {
        if (typeof v !== "string" || !v.startsWith("data:image/")) return v;
        if (cache.has(v)) return cache.get(v);
        let res = v;
        if (!APPLIQUER) { const d = await dimensions(v, true); console.log(`   [simulation] ${d ? d.avant + " → " + d.apres + " · " + d.poids : "illisible"}`); res = v; }
        else {
          const url = await imageVersCdn(v, l.owner_user_id, { rogner: true });
          if (url !== v && (await HEAD(url)) === 200) res = url;
          else if (url !== v) console.log("   ⚠️ adresse non vérifiée, valeur conservée :", url);
        }
        cache.set(v, res); return res;
      };
      console.log(`#${l.id} ${String(l.titre).slice(0, 50)}`);
      const nCouv = await convertir(l.image_couverture);
      const nUrl = await convertir(l.image_url);
      let nGal = l.galerie_photos;
      try { const g = JSON.parse(l.galerie_photos || "[]"); if (Array.isArray(g)) nGal = JSON.stringify(await Promise.all(g.map(x => convertir(x)))); } catch (e) { /* galerie illisible : laissée */ }
      if (!APPLIQUER) continue;
      if (nCouv === l.image_couverture && nUrl === l.image_url && nGal === l.galerie_photos) { total.ignorees++; continue; }
      const r = await c.query(
        "UPDATE evenements SET image_couverture=$1, image_url=$2, galerie_photos=$3 WHERE id=$4 AND image_couverture IS NOT DISTINCT FROM $5 AND image_url IS NOT DISTINCT FROM $6 AND galerie_photos IS NOT DISTINCT FROM $7",
        [nCouv, nUrl, nGal, l.id, l.image_couverture, l.image_url, l.galerie_photos]);
      if (r.rowCount === 1) { total.ok++; console.log("   ✅ migré"); } else { total.ignorees++; console.log("   ⏭️ modifié entre-temps, laissé tel quel"); }
    }
    if (APPLIQUER) console.log(`Terminé : ${total.ok} événement(s) migré(s), ${total.ignorees} laissé(s) tel(s) quel(s).`);
    else console.log("Simulation terminée : rien n'a été écrit. Relancez avec --appliquer pour migrer.");
  } finally { await c.end(); }
})().catch(e => { console.error("ERREUR :", e.message); process.exit(1); });

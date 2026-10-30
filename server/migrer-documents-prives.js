#!/usr/bin/env node
/* Migration des documents de cours déjà en ligne vers le stockage PRIVÉ (lot F, 2026-10-30).
   Avant le lot F, les PDF / Excel / Word / PowerPoint d'un cours étaient sur le CDN public (adresse devinable). Ce script copie chacun d'eux dans le stockage privé
   (BUNNY_PRIVATE_ZONE / BUNNY_PRIVATE_KEY) et remplace l'adresse par une référence « prive:… » dans :
     - formation_lecons.contenu_url (leçons PDF et « Document à télécharger ») ;
     - formation_studio_docs.contenu_json et formation_studio_versions.contenu_json (éléments « Document » du Studio).
   Les anciens fichiers publics ne sont PAS supprimés : à effacer à la main du CDN une fois la vérification faite (la liste est affichée à la fin).

   Usage (depuis le dossier du site) :
     node --env-file=.env server/migrer-documents-prives.js                  → simulation : ce qui serait copié, rien n'est écrit
     node --env-file=.env server/migrer-documents-prives.js --appliquer      → migration réelle (sauvegarde d'abord)
     node --env-file=.env server/migrer-documents-prives.js --retablir <fichier>   → remet les valeurs d'origine d'après une sauvegarde

   Sûreté : sauvegarde JSON AVANT toute écriture (dossier « sauvegardes-migration-documents » à côté du site) ; chaque fichier est copié puis RELU dans le stockage privé
   (même taille) avant que la ligne ne soit modifiée ; l'UPDATE ne s'applique que si la valeur en base est encore celle lue ; idempotent (une référence « prive: » n'est jamais retouchée). */
const fs = require("fs");
const path = require("path");

const HOTE_CDN = /^https:\/\/[a-z0-9.-]+\.b-cdn\.net\//i;
const EXT_OK = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const MAX = 15 * 1024 * 1024;
const extDe = url => { const m = String(url).split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i); return m ? m[1].toLowerCase() : ""; };
const migrable = url => typeof url === "string" && HOTE_CDN.test(url) && EXT_OK.includes(extDe(url));

/* Adresses publiques des éléments « Document » et « Fichier à télécharger » d'un document du Studio (texte JSON) ; une image n'est jamais concernée (migrable() ne retient que les documents de cours). */
function urlsDuStudio(json) {
  let doc; try { doc = JSON.parse(json); } catch (_) { return []; }
  const urls = [];
  for (const p of (doc && doc.pages) || []) for (const e of p.elements || []) if ((e.type === "document" || e.type === "fichier") && e.props && migrable(e.props.url)) urls.push(e.props.url);
  return urls;
}
/* Même document, adresses remplacées d'après la table { adresse publique → référence privée } ; null si rien ne change. */
function reecrireStudio(json, table) {
  let doc; try { doc = JSON.parse(json); } catch (_) { return null; }
  let change = false;
  for (const p of (doc && doc.pages) || []) for (const e of p.elements || []) if ((e.type === "document" || e.type === "fichier") && e.props && table[e.props.url]) { e.props.url = table[e.props.url]; change = true; }
  return change ? JSON.stringify(doc) : null;
}

module.exports = { migrable, urlsDuStudio, reecrireStudio };
if (require.main !== module) return;

(async () => {
  const { Client } = require("pg");
  const Prive = require("./formation-prive");
  const args = process.argv.slice(2), APPLIQUER = args.includes("--appliquer"), iRet = args.indexOf("--retablir");
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL manquante (lancez avec --env-file=.env)."); process.exit(1); }
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    if (iRet >= 0) {
      const sauv = JSON.parse(fs.readFileSync(args[iRet + 1], "utf8"));
      for (const l of sauv.lecons) { await c.query("UPDATE formation_lecons SET contenu_url=$1 WHERE id=$2", [l.contenu_url, l.id]); console.log("rétabli : leçon", l.id); }
      for (const d of sauv.docs) { await c.query("UPDATE formation_studio_docs SET contenu_json=$1 WHERE id=$2", [d.contenu_json, d.id]); console.log("rétabli : document du Studio", d.id); }
      for (const v of sauv.versions) { await c.query("UPDATE formation_studio_versions SET contenu_json=$1 WHERE id=$2", [v.contenu_json, v.id]); console.log("rétablie : version du Studio", v.id); }
      return;
    }
    if (!Prive.configure()) { console.error("Stockage privé non configuré : définissez BUNNY_PRIVATE_ZONE et BUNNY_PRIVATE_KEY."); process.exit(1); }
    const lecons = (await c.query(`SELECT l.id, l.contenu_url, f.owner_user_id AS proprio FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id JOIN formations f ON f.id=m.formation_id
      WHERE l.type IN ('pdf','telechargement') AND l.contenu_url LIKE 'https://%b-cdn.net/%'`)).rows.filter(l => migrable(l.contenu_url));
    const docs = (await c.query("SELECT d.id, d.contenu_json, f.owner_user_id AS proprio FROM formation_studio_docs d JOIN formations f ON f.id=d.formation_id WHERE d.contenu_json LIKE '%b-cdn.net%'")).rows;
    const versions = (await c.query("SELECT v.id, v.contenu_json, f.owner_user_id AS proprio FROM formation_studio_versions v JOIN formation_studio_docs d ON d.id=v.doc_id JOIN formations f ON f.id=d.formation_id WHERE v.contenu_json LIKE '%b-cdn.net%'")).rows;
    /* adresses à copier, par propriétaire : la référence porte le numéro du compte */
    const aCopier = new Map(); // "proprio|adresse" → { proprio, url }
    const noter = (proprio, url) => aCopier.set(proprio + "|" + url, { proprio, url });
    lecons.forEach(l => noter(l.proprio, l.contenu_url));
    [...docs, ...versions].forEach(r => urlsDuStudio(r.contenu_json).forEach(u => noter(r.proprio, u)));
    console.log(`${lecons.length} leçon(s), ${docs.length} document(s) et ${versions.length} version(s) du Studio concernés — ${aCopier.size} fichier(s) distinct(s) à copier.`);
    if (!APPLIQUER) { console.log("Simulation : rien n'est écrit. Relancez avec --appliquer pour migrer."); aCopier.forEach(f => console.log("  ", f.url)); return; }

    const dossier = path.join(__dirname, "..", "..", "sauvegardes-migration-documents"); fs.mkdirSync(dossier, { recursive: true });
    const fichierSauv = path.join(dossier, "documents-" + new Date().toISOString().replace(/[:.]/g, "-") + ".json");
    fs.writeFileSync(fichierSauv, JSON.stringify({ lecons: lecons.map(l => ({ id: l.id, contenu_url: l.contenu_url })), docs: docs.map(d => ({ id: d.id, contenu_json: d.contenu_json })), versions: versions.map(v => ({ id: v.id, contenu_json: v.contenu_json })) }));
    console.log("Sauvegarde écrite :", fichierSauv);

    const table = new Map(); // "proprio|adresse" → référence privée (ou null si la copie a échoué)
    for (const [cle, f] of aCopier) {
      try {
        const r = await fetch(f.url, { redirect: "error", signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error("lecture " + r.status);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length > MAX || !buf.length) throw new Error("taille inattendue");
        const ref = Prive.creerRef(f.proprio, extDe(f.url));
        await Prive.ecrire(buf, ref);
        const relu = await Prive.lire(ref, MAX);
        if (relu.length !== buf.length) throw new Error("relecture différente");
        table.set(cle, ref); console.log("copié :", f.url, "→", ref);
      } catch (e) { table.set(cle, null); console.log("IGNORÉ (laissé tel quel) :", f.url, "—", e.message); }
    }
    let n = 0;
    for (const l of lecons) {
      const ref = table.get(l.proprio + "|" + l.contenu_url); if (!ref) continue;
      n += (await c.query("UPDATE formation_lecons SET contenu_url=$1 WHERE id=$2 AND contenu_url=$3", [ref, l.id, l.contenu_url])).rowCount;
    }
    for (const [tab, lignes] of [["formation_studio_docs", docs], ["formation_studio_versions", versions]]) {
      for (const r of lignes) {
        const sous = {}; urlsDuStudio(r.contenu_json).forEach(u => { const ref = table.get(r.proprio + "|" + u); if (ref) sous[u] = ref; });
        const neuf = reecrireStudio(r.contenu_json, sous); if (!neuf) continue;
        n += (await c.query(`UPDATE ${tab} SET contenu_json=$1 WHERE id=$2 AND contenu_json=$3`, [neuf, r.id, r.contenu_json])).rowCount;
      }
    }
    console.log(`${n} ligne(s) modifiée(s). Anciens fichiers publics à supprimer du CDN après vérification :`);
    for (const [cle, f] of aCopier) if (table.get(cle)) console.log("  ", f.url);
  } finally { await c.end(); }
})().catch(e => { console.error("ERREUR :", e.message); process.exit(1); });

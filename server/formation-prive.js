/* ═════════════════════════════════════════════════
   server/formation-prive.js — Formation Diaspora, lot F : FICHIERS PRIVÉS des cours (2026-10-30).

   Problème d'avant : les PDF / Excel d'un cours étaient envoyés sur le CDN public sous un nom devinable (identifiant-horodatage) et leur adresse
   figurait dans les données de la leçon : toute personne qui la connaissait lisait le fichier sans passer par la plateforme.

   Maintenant :
   1. Envoi : POST /api/formateur/document-cours. Si un stockage Bunny PRIVÉ est configuré (BUNNY_PRIVATE_ZONE + BUNNY_PRIVATE_KEY : une zone de
      stockage SANS zone de diffusion publique), le fichier y est déposé sous un nom aléatoire (128 bits) et la leçon garde une RÉFÉRENCE « prive:… »
      que seul le serveur sait lire. Sans ce stockage, le fichier va sur le CDN public mais sous un nom aléatoire (plus devinable).
   2. Lecture : le navigateur ne reçoit plus jamais l'adresse d'un document de cours (leçons PDF / « Document » : masquée ; éléments « Document »
      du Studio : adresse factice qui ne garde que l'extension). Tout passe par les routes …/document/* (accès contrôlé, formation-documents.js).
   Le formateur propriétaire (et l'administrateur) gardent les vraies adresses : elles servent à modifier la leçon.
   ═════════════════════════════════════════════════ */
"use strict";

const crypto = require("crypto");

const REF = /^prive:formations\/\d+\/[a-f0-9]{32}\.[a-z0-9]{2,5}$/;
const OFFICE_EXT = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];
const MAX_ENVOI = 15 * 1024 * 1024;
const TIMEOUT_MS = 20000;
const MAX_AUDIO = 4 * 1024 * 1024;

/* Extension réelle d'un fichier audio d'après ses premiers octets (jamais d'après son nom) ; "" si ce n'est pas un audio accepté. */
function typeAudio(b) {
  if (!b || b.length < 12) return "";
  if (b.slice(0, 3).toString("latin1") === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "mp3";
  if (b.slice(4, 8).toString("latin1") === "ftyp") return "m4a";
  if (b.slice(0, 4).toString("latin1") === "OggS") return "ogg";
  if (b.slice(0, 4).toString("latin1") === "RIFF" && b.slice(8, 12).toString("latin1") === "WAVE") return "wav";
  return "";
}

const zone = () => process.env.BUNNY_PRIVATE_ZONE || "";
const cle = () => process.env.BUNNY_PRIVATE_KEY || "";
const base = () => (process.env.BUNNY_PRIVATE_URL || "https://storage.bunnycdn.com").replace(/\/+$/, "");
const configure = () => !!(zone() && cle());
const estRef = v => typeof v === "string" && v.startsWith("prive:");

function urlStockage(ref) {
  if (!REF.test(ref)) throw Object.assign(new Error("Référence de fichier invalide."), { statut: 400, code: "adresse" });
  return `${base()}/${encodeURIComponent(zone())}/${ref.slice("prive:".length)}`;
}

async function ecrire(buf, ref) {
  const r = await fetch(urlStockage(ref), { method: "PUT", headers: { AccessKey: cle(), "Content-Type": "application/octet-stream" }, body: buf, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`Stockage privé : envoi refusé (${r.status}).`);
}

/* Lecture côté serveur d'un fichier privé (jamais exposée telle quelle au navigateur). */
async function lire(ref, maxOctets) {
  if (!configure()) throw Object.assign(new Error("Le stockage des documents est momentanément indisponible."), { statut: 502, code: "injoignable" });
  let r;
  try { r = await fetch(urlStockage(ref), { headers: { AccessKey: cle() }, redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) }); }
  catch (e) { if (e.statut) throw e; throw Object.assign(new Error("Le document est momentanément injoignable. Réessayez dans un instant."), { statut: 502, code: "injoignable" }); }
  if (!r.ok) throw Object.assign(new Error(r.status === 404 ? "Fichier introuvable." : "Le document est momentanément injoignable."), { statut: r.status === 404 ? 404 : 502, code: r.status === 404 ? "introuvable" : "injoignable" });
  if ((Number(r.headers.get("content-length")) || 0) > maxOctets) throw Object.assign(new Error("Fichier trop volumineux pour s'afficher dans la page."), { statut: 413, code: "trop_gros" });
  const morceaux = []; let total = 0;
  for await (const m of r.body) { total += m.length; if (total > maxOctets) throw Object.assign(new Error("Fichier trop volumineux pour s'afficher dans la page."), { statut: 413, code: "trop_gros" }); morceaux.push(Buffer.from(m)); }
  return Buffer.concat(morceaux);
}

/* Masque l'adresse des documents dans le plan d'une formation (modules → chapitres → leçons) : leçons PDF et « Document à télécharger ». */
function masquerLecons(modules) {
  for (const m of modules || []) for (const c of m.chapitres || []) for (const l of c.lecons || []) {
    if (["pdf", "telechargement"].includes(l.type) && l.contenu_url) { l.contenu_url = null; l.a_document = 1; }
  }
  return modules;
}

/* Copie d'un document du Studio où chaque élément « Document » n'a plus qu'une adresse factice (l'extension suffit au rendu : le fichier passe par le serveur). */
function masquerStudio(doc) {
  const copie = JSON.parse(JSON.stringify(doc || {}));
  for (const p of copie.pages || []) for (const e of p.elements || []) {
    if (e.type === "document" && e.props && e.props.url) {
      const m = String(e.props.url).split("?")[0].split("#")[0].match(/\.([a-z0-9]{2,5})$/i);
      e.props.url = `document:${String(e.id).replace(/[^\w-]/g, "")}${m ? "." + m[1].toLowerCase() : ""}`;
    }
  }
  return copie;
}

/* Nouvelle référence privée (nom aléatoire de 128 bits) pour le compte « uid ». */
const creerRef = (uid, ext) => `prive:formations/${Number(uid)}/${crypto.randomBytes(16).toString("hex")}.${String(ext).toLowerCase().replace(/[^a-z0-9]/g, "")}`;

module.exports = { REF, typeAudio, configure, estRef, lire, ecrire, creerRef, masquerLecons, masquerStudio };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, estCreateur } = deps;

  /* Contrôles communs aux envois de fichiers de cours : connexion, créateur, cadence, lecture du fichier reçu. Renvoie { user, f } ou null (réponse déjà faite). */
  async function lireEnvoi(req, res, nom, max) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    if (!(await estCreateur(user))) { sendJSON(res, 403, { error: "L'envoi de fichiers de cours est réservé aux créateurs de formations." }); return null; }
    const lim = SEC.rateLimit(`${nom}:${user.id}`, 40, 600000);
    if (!lim.allowed) { sendJSON(res, 429, { error: `Trop d'envois. Réessayez dans ${lim.retryAfter}s.` }); return null; }
    const m = (req.headers["content-type"] || "").match(/boundary=([^\s;]+)/);
    if (!m) { sendJSON(res, 400, { error: "Format invalide." }); return null; }
    const morceaux = []; let taille = 0, trop = false;
    await new Promise(fin => { req.on("data", c => { taille += c.length; if (taille > max + 4096) trop = true; else morceaux.push(c); }); req.on("end", fin); req.on("error", fin); });
    const mo = Math.round(max / 1048576 * 10) / 10;
    if (trop) { sendJSON(res, 413, { error: `Fichier trop volumineux (${mo} Mo au plus).` }); return null; }
    const f = Object.values(require("./upload").parseMultipart(Buffer.concat(morceaux), m[1]).files)[0];
    if (!f || !f.buffer || !f.buffer.length) { sendJSON(res, 400, { error: "Aucun fichier reçu." }); return null; }
    if (f.buffer.length > max) { sendJSON(res, 413, { error: `Fichier trop volumineux (${mo} Mo au plus).` }); return null; }
    return { user, f };
  }

  /* POST /api/formateur/audio-cours — envoi d'un fichier audio de cours (MP3, M4A/AAC, OGG, WAV : type vérifié sur les octets, 4 Mo au plus : limite d'une requête de l'hébergeur).
     Un audio n'a rien de confidentiel : il va sur le CDN public, sous un nom aléatoire. */
  route("POST", "/api/formateur/audio-cours", async (req, res) => {
    const r = await lireEnvoi(req, res, "audio-cours", MAX_AUDIO);
    if (!r) return;
    const type = typeAudio(r.f.buffer);
    if (!type) return sendJSON(res, 400, { error: "Format non supporté (MP3, M4A, OGG ou WAV requis)." });
    try {
      const url = await require("./upload").uploadToBunny(r.f.buffer, `${r.user.id}-${Date.now()}-${crypto.randomBytes(16).toString("hex")}.${type}`, "formations-audios");
      SEC.logSecurity("upload", { uid: Number(r.user.id), kind: "audio-cours", type, size: r.f.buffer.length });
      sendJSON(res, 200, { url });
    } catch (e) { sendJSON(res, 500, SEC.safeError(e, "upload audio de cours")); }
  });

  /* POST /api/formateur/document-cours — envoi d'un document de cours (PDF, Word, Excel, PowerPoint) ; réservé aux créateurs de formations. */
  route("POST", "/api/formateur/document-cours", async (req, res) => {
    const r = await lireEnvoi(req, res, "doc-cours", MAX_ENVOI);
    if (!r) return;
    const { user, f } = r;
    const { uploadToBunny } = require("./upload");
    const b = f.buffer;
    const ext = (f.filename || "").split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "");
    const pdf = b.length > 4 && b.slice(0, 1024).includes("%PDF-");
    const zip = b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && (b[2] === 3 || b[2] === 5 || b[2] === 7);
    const ole = b.length > 8 && b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0;
    if (!pdf && !((zip || ole) && OFFICE_EXT.includes(ext))) return sendJSON(res, 400, { error: "Format non supporté (PDF, Word, Excel ou PowerPoint requis)." });
    const extFinale = pdf ? "pdf" : ext;
    const alea = crypto.randomBytes(16).toString("hex"); /* nom du fichier sur le CDN public si aucun stockage privé n'est configuré */
    try {
      let url, prive = false;
      if (configure()) {
        url = creerRef(user.id, extFinale);
        await ecrire(b, url); prive = true;
      } else {
        url = await uploadToBunny(b, `${user.id}-${Date.now()}-${alea}.${extFinale}`, "formations-documents");
      }
      SEC.logSecurity("upload", { uid: Number(user.id), kind: "document-cours", type: extFinale, size: b.length, prive });
      sendJSON(res, 200, { url, prive });
    } catch (e) { sendJSON(res, 500, SEC.safeError(e, "upload document de cours")); }
  });
};

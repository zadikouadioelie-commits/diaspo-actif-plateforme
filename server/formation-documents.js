/* ═════════════════════════════════════════════════
   server/formation-documents.js — Formation Diaspora : DOCUMENTS PDF et EXCEL affichés DANS la page du cours (2026-10-30)

   Un document de cours (leçon classique de type PDF / téléchargement, ou élément « Document » du Studio) peut être :
     - affiché directement dans la page (visionneuse : assets/doc-viewer.js) — « intégré » ;
     - proposé en pièce jointe — « téléchargeable » ;
     - les deux à la fois, avec une hauteur d'affichage choisie par le formateur.
   Le navigateur ne reçoit JAMAIS l'adresse brute du fichier pour le lire : il passe par ce module, qui
     - applique le MÊME contrôle d'accès que la lecture du cours (propriétaire / administrateur ; apprenant ayant le droit sur le module ; leçon offerte en aperçu) ;
     - vérifie le vrai type du fichier par ses premiers octets (PDF, classeur .xlsx) et sa taille — l'extension ne suffit pas ;
     - n'appelle que des hébergeurs connus (*.b-cdn.net, le dossier /uploads du site) : jamais une adresse choisie à la volée (pas de SSRF) ;
     - sert le PDF par morceaux (en-tête Range) pour un chargement progressif, et le classeur Excel par FENÊTRES de lignes : un gros classeur n'est jamais envoyé en entier ;
     - ne sert le fichier en téléchargement que si le formateur l'a autorisé ;
     - n'exécute rien : aucune macro, aucun script (un classeur à macros est refusé).
   Pour l'assistant pédagogique (Koffi) : texteDeDocument() renvoie le texte des cellules et des formules d'un classeur ; un PDF se lit nativement côté assistant.
   ═════════════════════════════════════════════════ */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const Droits = require("./formation-droits");
const Prive = require("./formation-prive");
const XL = require("./xlsx-lecteur");
const XLS = require("./xls-lecteur");

const MAX_OCTETS = 4.4 * 1024 * 1024;   /* limite d'une réponse de l'hébergeur du site (4,5 Mo) : au-delà, repli sur l'affichage direct */
const MAX_OCTETS_CLASSEUR = 12 * 1024 * 1024;
const TIMEOUT_MS = 15000;
const LIMITES_EXCEL = [
  "Les formules ne sont pas recalculées : la dernière valeur enregistrée par Excel est affichée, avec le texte de la formule.",
  "Graphiques, images, formes, tableaux croisés dynamiques et mises en forme conditionnelles ne sont pas dessinés.",
  "Les couleurs de thème et les bordures ne sont pas reprises ; gras, italique, couleurs et fonds simples le sont.",
  "Les anciens fichiers .xls (Excel 97-2003) s'affichent sans le texte des formules, sans couleurs ni bordures ; les classeurs à macros (.xlsm) et les classeurs protégés par mot de passe ne s'affichent pas.",
];

const famille = url => {
  let p = ""; try { p = new URL(String(url || ""), "http://x").pathname; } catch (_) { p = String(url || ""); }
  const e = (/\.([a-z0-9]{2,5})$/i.exec(p) || [])[1];
  const x = e ? e.toLowerCase() : "";
  return x === "pdf" ? "pdf" : x === "xlsx" ? "excel" : x === "xlsm" ? "xlsm" : x === "xls" ? "xls" : "autre";
};
const nomFichier = (url, nom) => { const n = String(nom || "").trim(); if (n) return n.slice(0, 150); try { return decodeURIComponent(path.basename(new URL(String(url), "http://x").pathname)).slice(0, 150) || "document"; } catch (_) { return "document"; } };
const typesMime = { pdf: "application/pdf", excel: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", xls: "application/vnd.ms-excel" };
/* Pièces jointes : extension → { type réel attendu d'après les octets, type MIME }. « zip » = Office moderne, « ole » = Office 97-2003. */
const TELECHARGEABLES = {
  pdf: ["pdf", "application/pdf"], xlsx: ["zip", typesMime.excel], xlsm: ["zip", "application/vnd.ms-excel.sheet.macroEnabled.12"], xls: ["ole", typesMime.xls],
  docx: ["zip", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"], doc: ["ole", "application/msword"],
  pptx: ["zip", "application/vnd.openxmlformats-officedocument.presentationml.presentation"], ppt: ["ole", "application/vnd.ms-powerpoint"],
  jpg: ["jpg", "image/jpeg"], jpeg: ["jpg", "image/jpeg"], png: ["png", "image/png"], webp: ["webp", "image/webp"], gif: ["gif", "image/gif"],
};
const extensionDe = url => { let p = ""; try { p = new URL(String(url || ""), "http://x").pathname; } catch (_) { p = String(url || ""); } return ((/\.([a-z0-9]{2,5})$/i.exec(p) || [])[1] || "").toLowerCase(); };
const nomSur = s => String(s).replace(/[^\w.\- àâäçéèêëîïôöùûüÿœ()]/gi, "_").slice(0, 120);

/* ── Octets : cache mémoire court (le lecteur PDF demande plusieurs morceaux d'un même fichier) ── */
const cacheOctets = new Map(), cacheClasseurs = new Map();
function lru(cache, cle, valeur, max) { cache.delete(cle); cache.set(cle, valeur); while (cache.size > max) cache.delete(cache.keys().next().value); }
async function lireOctets(url, hoteSite) {
  const cle = String(url); const c = cacheOctets.get(cle);
  if (c && Date.now() - c.t < 300000) return c.buf;
  let buf;
  if (Prive.estRef(cle)) {
    /* Fichier du stockage privé (lot F) : lu par le serveur seul. */
    buf = await Prive.lire(cle, MAX_OCTETS_CLASSEUR);
  } else if (/^\/uploads\/[\w.\-]+$/.test(cle)) {
    const p = path.join(__dirname, cle);
    if (!fs.existsSync(p)) throw Object.assign(new Error("Fichier introuvable."), { statut: 404, code: "introuvable" });
    const st = fs.statSync(p); if (st.size > MAX_OCTETS_CLASSEUR) throw Object.assign(new Error("Fichier trop volumineux pour s'afficher dans la page."), { statut: 413, code: "trop_gros" });
    buf = fs.readFileSync(p);
  } else {
    let u; try { u = new URL(cle); } catch (_) { throw Object.assign(new Error("Adresse du document invalide."), { statut: 400, code: "adresse" }); }
    const h = u.hostname.toLowerCase();
    if (u.protocol !== "https:" || !(h.endsWith(".b-cdn.net") || (hoteSite && h === hoteSite))) throw Object.assign(new Error("Ce document n'est pas hébergé sur la plateforme : il ne peut pas être affiché dans la page."), { statut: 400, code: "hote_non_autorise" });
    let r;
    try { r = await fetch(u, { redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "DiaspoActif-Documents/1.0" } }); }
    catch (_) { throw Object.assign(new Error("Le document est momentanément injoignable. Réessayez dans un instant."), { statut: 502, code: "injoignable" }); }
    if (!r.ok) throw Object.assign(new Error(r.status === 404 ? "Fichier introuvable." : "Le document est momentanément injoignable."), { statut: r.status === 404 ? 404 : 502, code: "injoignable" });
    const annonce = Number(r.headers.get("content-length")) || 0;
    if (annonce > MAX_OCTETS_CLASSEUR) throw Object.assign(new Error("Fichier trop volumineux pour s'afficher dans la page."), { statut: 413, code: "trop_gros" });
    const morceaux = []; let total = 0;
    for await (const m of r.body) { total += m.length; if (total > MAX_OCTETS_CLASSEUR) throw Object.assign(new Error("Fichier trop volumineux pour s'afficher dans la page."), { statut: 413, code: "trop_gros" }); morceaux.push(Buffer.from(m)); }
    buf = Buffer.concat(morceaux);
  }
  lru(cacheOctets, cle, { buf, t: Date.now() }, 6);
  return buf;
}
/* Vrai type d'après le contenu, jamais d'après le nom. */
function typeReel(buf) {
  if (buf.length >= 5 && buf.slice(0, 1024).includes("%PDF-")) return "pdf";
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 3 || buf[2] === 5 || buf[2] === 7)) return "zip";
  if (buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0) return "ole";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") return "webp";
  if (buf.length >= 6 && /^GIF8[79]a$/.test(buf.slice(0, 6).toString("latin1"))) return "gif";
  return "autre";
}

function classeurDe(url, buf) {
  const cle = url + "#" + buf.length; const c = cacheClasseurs.get(cle);
  if (c) { lru(cacheClasseurs, cle, c, 4); return c; }
  const cl = typeReel(buf) === "ole" ? XLS.ouvrir(buf) : XL.ouvrir(buf);
  lru(cacheClasseurs, cle, cl, 4);
  return cl;
}

/* Le document décrit par une leçon (classique) ou un élément du Studio. Renvoie null s'il n'y en a pas. */
function decrire(lecon, doc, elementId) {
  if (Number(lecon.studio)) {
    const el = doc && (doc.pages || []).flatMap(p => p.elements || []).find(e => e.id === elementId && (e.type === "document" || e.type === "fichier"));
    if (!el || !el.props || !el.props.url) return null;
    const p = el.props;
    /* « Fichier à télécharger » (lot I) : toujours une pièce jointe, jamais affichée dans la page. */
    if (el.type === "fichier") return { url: p.url, nom: nomFichier(p.url, p.nom), integre: false, telechargeable: true, hauteur: 640 };
    return { url: p.url, nom: nomFichier(p.url, p.nom), integre: p.integre !== undefined ? !!p.integre : p.mode !== "telechargement", telechargeable: p.telechargeable !== undefined ? !!p.telechargeable : p.mode === "telechargement", hauteur: Math.min(1600, Math.max(200, Number(p.hauteur) || 640)) };
  }
  if (!lecon.contenu_url || !["pdf", "telechargement", "presentation"].includes(lecon.type)) return null;
  const integre = lecon.doc_integre != null ? !!Number(lecon.doc_integre) : lecon.type === "pdf";
  return { url: lecon.contenu_url, nom: nomFichier(lecon.contenu_url, lecon.titre), integre, telechargeable: lecon.telechargement_autorise == null || !!Number(lecon.telechargement_autorise), hauteur: Math.min(1600, Math.max(200, Number(lecon.doc_hauteur) || 640)) };
}

module.exports = { famille, typeReel, decrire, lireOctets, LIMITES_EXCEL, MAX_OCTETS };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, checkFormationOwner } = deps;
  const BASE = "/api/formations/:id/lecons/:leconId/document";
  const parse = s => { try { return JSON.parse(s); } catch (_) { return null; } };

  async function docDeLecon(lecon, brouillon) {
    if (!Number(lecon.studio)) return null;
    const d = await db.prepare("SELECT * FROM formation_studio_docs WHERE lecon_id=?").get(Number(lecon.id)); if (!d) return null;
    if (brouillon) return parse(d.contenu_json);
    if (d.publiee_version == null) return null;
    const v = await db.prepare("SELECT contenu_json FROM formation_studio_versions WHERE doc_id=? AND version=?").get(d.id, Number(d.publiee_version));
    return v ? parse(v.contenu_json) : null;
  }

  /* Contrôle d'accès + description du document. Répond lui-même en cas de refus (renvoie null). */
  async function contexte(req, res, params, query) {
    const lim = SEC.rateLimit(`documents:${SEC.clientIp(req)}`, 900, 600000);
    if (!lim.allowed) { sendJSON(res, 429, { error: `Trop de requêtes. Réessayez dans ${lim.retryAfter}s.` }); return null; }
    const user = await getCurrentUser(req);
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(Number(params.id));
    if (!f) { sendJSON(res, 404, { error: "Formation introuvable." }); return null; }
    const lecon = await db.prepare("SELECT l.* FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE l.id=? AND m.formation_id=?").get(Number(params.leconId), f.id);
    if (!lecon) { sendJSON(res, 404, { error: "Contenu introuvable." }); return null; }
    const proprietaire = !!(user && checkFormationOwner(f, user));
    let autorise = proprietaire;
    if (!autorise && user) {
      await Droits.balayerExpirations(db, { userId: user.id, formationId: f.id });
      const insc = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").get(f.id, user.id);
      autorise = !!insc && await Droits.leconPermise(db, insc, f.id, lecon.id);
    }
    if (!autorise && Number(lecon.apercu_gratuit) && f.statut === "publiee" && (!f.acces_type || f.acces_type === "public")) autorise = true;
    if (!autorise) { sendJSON(res, user ? 403 : 401, { error: user ? "Vous n'avez pas accès à ce document." : "Connexion requise." }); return null; }
    const brouillon = proprietaire && (query || {}).brouillon === "1";
    const doc = await docDeLecon(lecon, brouillon);
    const d = decrire(lecon, doc, String((query || {}).element || ""));
    if (!d) { sendJSON(res, 404, { error: "Document introuvable dans ce cours." }); return null; }
    return { user, f, lecon, proprietaire, brouillon, d, fam: famille(d.url), hote: String(req.headers.host || "").split(":")[0].toLowerCase() };
  }
  const erreur = (res, e) => {
    if (e && e.statut) return sendJSON(res, e.statut, { error: e.message, code: e.code });
    if (e instanceof XL.ErreurClasseur) return sendJSON(res, e.code === "macros" || e.code === "trop_gros" ? 413 : 415, { error: e.message, code: e.code });
    return sendJSON(res, 500, SEC.safeError(e, "formation-documents"));
  };

  /* Description : ce que le navigateur a besoin de savoir pour monter la bonne visionneuse. */
  route("GET", BASE + "/infos", async (req, res, params, body, query) => {
    const c = await contexte(req, res, params, query); if (!c) return;
    const peutDl = c.d.telechargeable || c.proprietaire;
    /* Un ancien classeur .xls se montre comme un classeur : la visionneuse Excel le lit (le format réel est signalé à part). */
    const info = { nom: c.d.nom, famille: c.fam === "xls" ? "excel" : c.fam, format: c.fam === "xls" ? "xls" : undefined, integre: c.d.integre, telechargeable: c.d.telechargeable, hauteur: c.d.hauteur, peut_telecharger: peutDl };
    if (!c.d.integre) { /* simple pièce jointe : pas de visionneuse, donc rien à signaler sur le format */ }
    else if (c.fam === "xlsm") info.erreur = { code: "macros", message: "Les classeurs à macros (.xlsm) ne sont pas affichés : les macros ne sont jamais exécutées." };
    else if (c.fam === "autre") info.erreur = { code: "format", message: "Ce type de fichier ne peut pas s'afficher dans la page." };
    sendJSON(res, 200, info);
  });

  /* Le PDF : octets servis par morceaux (Range). Uniquement si l'affichage intégré est activé (ou en aperçu par le formateur). */
  route("GET", BASE + "/fichier", async (req, res, params, body, query) => {
    const c = await contexte(req, res, params, query); if (!c) return;
    if (c.fam !== "pdf") return sendJSON(res, 415, { error: "Seuls les PDF sont servis ainsi.", code: "format" });
    if (!c.d.integre && !c.proprietaire) return sendJSON(res, 403, { error: "L'affichage dans la page n'est pas activé pour ce document.", code: "non_integre" });
    try {
      const buf = await lireOctets(c.d.url, c.hote);
      if (typeReel(buf) !== "pdf") return sendJSON(res, 415, { error: "Ce fichier n'est pas un PDF valide.", code: "format" });
      if (buf.length > MAX_OCTETS) return sendJSON(res, 413, { error: "Ce PDF est trop volumineux pour la lecture progressive : il s'ouvre directement.", code: "trop_gros" });
      const ent = { "Content-Type": "application/pdf", "Accept-Ranges": "bytes", "Content-Disposition": `inline; filename="${nomSur(c.d.nom)}.pdf"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=300", "Content-Security-Policy": "sandbox" };
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
      if (m && (m[1] !== "" || m[2] !== "")) {
        let a = m[1] === "" ? Math.max(0, buf.length - Number(m[2])) : Number(m[1]); let b = m[1] === "" || m[2] === "" ? buf.length - 1 : Math.min(Number(m[2]), buf.length - 1);
        if (a > b || a >= buf.length) { res.writeHead(416, { "Content-Range": `bytes */${buf.length}` }); return res.end(); }
        res.writeHead(206, { ...ent, "Content-Range": `bytes ${a}-${b}/${buf.length}`, "Content-Length": b - a + 1 }); return res.end(buf.slice(a, b + 1));
      }
      res.writeHead(200, { ...ent, "Content-Length": buf.length }); res.end(buf);
    } catch (e) { erreur(res, e); }
  });

  /* Téléchargement : seulement si le formateur l'a autorisé (le propriétaire peut toujours récupérer son fichier). */
  route("GET", BASE + "/telecharger", async (req, res, params, body, query) => {
    const c = await contexte(req, res, params, query); if (!c) return;
    if (!c.d.telechargeable && !c.proprietaire) return sendJSON(res, 403, { error: "Le téléchargement de ce document n'est pas autorisé par le formateur.", code: "non_telechargeable" });
    try {
      const buf = await lireOctets(c.d.url, c.hote); const t = typeReel(buf);
      /* Le type du fichier se lit sur ses octets ; l'extension annoncée doit y correspondre (un .docx est un conteneur « zip », un .doc un conteneur « ole »…). */
      const ext = extensionDe(c.d.url), att = TELECHARGEABLES[ext];
      if (!att || att[0] !== t) return sendJSON(res, 415, { error: "Ce fichier n'est pas du type annoncé : il ne peut pas être téléchargé.", code: "format" });
      res.writeHead(200, { "Content-Type": att[1], "Content-Length": buf.length, "Content-Disposition": `attachment; filename="${nomSur(c.d.nom.replace(/\.[a-z0-9]{2,5}$/i, ""))}.${ext}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
      res.end(buf);
    } catch (e) { erreur(res, e); }
  });

  /* Classeur Excel : liste des feuilles + styles (jamais les cellules). */
  async function classeurAccessible(c, res) {
    if (c.fam === "xlsm") { sendJSON(res, 415, { error: "Les classeurs à macros (.xlsm) ne sont pas affichés : les macros ne sont jamais exécutées.", code: "macros" }); return null; }
    if (c.fam !== "excel" && c.fam !== "xls") { sendJSON(res, 415, { error: "Ce fichier n'est pas un classeur Excel.", code: "format" }); return null; }
    if (!c.d.integre && !c.proprietaire) { sendJSON(res, 403, { error: "L'affichage dans la page n'est pas activé pour ce document.", code: "non_integre" }); return null; }
    const buf = await lireOctets(c.d.url, c.hote);
    const reel = typeReel(buf);
    if (reel !== (c.fam === "xls" ? "ole" : "zip")) { sendJSON(res, 415, { error: `Ce fichier n'est pas un classeur Excel (${c.fam === "xls" ? ".xls" : ".xlsx"}) valide.`, code: "format" }); return null; }
    return classeurDe(c.d.url, buf);
  }
  route("GET", BASE + "/classeur", async (req, res, params, body, query) => {
    const c = await contexte(req, res, params, query); if (!c) return;
    try {
      const cl = await classeurAccessible(c, res); if (!cl) return;
      sendJSON(res, 200, { ...XL.resume(cl), limites: LIMITES_EXCEL, date1904: cl.date1904 });
    } catch (e) { erreur(res, e); }
  });
  /* Une fenêtre de lignes d'une feuille : ?feuille=0&debut=0&n=100 */
  route("GET", BASE + "/feuille", async (req, res, params, body, query) => {
    const c = await contexte(req, res, params, query); if (!c) return;
    try {
      const cl = await classeurAccessible(c, res); if (!cl) return;
      const q = query || {}; const i = Math.floor(Number(q.feuille) || 0);
      if (!cl.feuilles[i]) return sendJSON(res, 404, { error: "Feuille introuvable.", code: "feuille" });
      res.setHeader && res.setHeader("Cache-Control", "private, max-age=120");
      sendJSON(res, 200, XL.fenetre(cl, i, q.debut, q.n));
    } catch (e) { erreur(res, e); }
  });

  /* Pour l'assistant pédagogique : le texte d'un document de cours, sans passer par HTTP (le contrôle d'accès est fait par l'appelant). */
  module.exports.texteDeDocument = async function texteDeDocument(lecon, doc, elementId, hoteSite, maxCar) {
    const d = decrire(lecon, doc, elementId); if (!d) return null;
    const fam = famille(d.url);
    /* PDF : les octets sont fournis (un fichier du stockage privé n'a pas d'adresse lisible de l'extérieur) ; l'adresse n'est donnée que si elle est publique. */
    if (fam === "pdf") { const octets = await lireOctets(d.url, hoteSite).catch(() => null); return { type: "pdf", nom: d.nom, url: Prive.estRef(d.url) ? null : d.url, octets, texte: null, note: "PDF : à lire nativement (pages numérotées)." }; }
    if (fam !== "excel" && fam !== "xls") return { type: fam, nom: d.nom, texte: null, note: "Format non lisible." };
    const buf = await lireOctets(d.url, hoteSite);
    if (typeReel(buf) !== (fam === "xls" ? "ole" : "zip")) return { type: "excel", nom: d.nom, texte: null, note: "Fichier invalide." };
    const cl = classeurDe(d.url, buf);
    return { type: "excel", nom: d.nom, texte: XL.exporterTexte(cl, maxCar), feuilles: cl.feuilles.map(f => f.nom) };
  };
};

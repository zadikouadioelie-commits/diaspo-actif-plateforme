/* ═════════════════════════════════════════════════
   server/formation-studio.js — Formation Diaspora : STUDIO de création par glisser-déposer (lot D, 2026-10-30)

   Un « document studio » est rattaché à UNE leçon (formation_lecons.studio = 1) : il contient des pages, chacune avec des éléments
   (titre, texte, image, vidéo, bouton…). Deux modes dans le même studio : « libre » (éléments positionnés en x/y/largeur/hauteur sur une page 1280 × 720,
   comme Canva) et « structure » (éléments empilés dans l'ordre, comme un constructeur de pages / PowerPoint). Le même JSON sert aux deux : changer de mode ne perd rien.

   - formation_studio_docs      : le BROUILLON courant (rev = compteur de révision : sauvegarde automatique + détection des conflits de modification).
   - formation_studio_versions  : l'historique (points de restauration, versions publiées). Les apprenants ne lisent QUE la version publiée :
                                  modifier le brouillon d'une formation déjà suivie ne touche ni leur lecture, ni leur progression (qui reste attachée à la leçon).
   - Tout le contenu est NETTOYÉ ICI (HTML autorisé en liste blanche, URL https uniquement, tailles bornées) : le navigateur n'est jamais une source de confiance.
   ═════════════════════════════════════════════════ */
"use strict";
const Droits = require("./formation-droits");

const TYPES_TEXTE = ["titre", "soustitre", "paragraphe", "citation", "encadre"];
const TYPES = [...TYPES_TEXTE, "image", "video", "audio", "separateur", "lien", "bouton", "fichier", "tableau", "validation"];
const POLICES = ["Arial", "Georgia", "Times New Roman", "Verdana", "Trebuchet MS", "Garamond", "Calibri", "Segoe UI", "Courier New", "sans-serif", "serif"];
const MAX_PAGES = 60, MAX_ELEMENTS = 200, MAX_JSON = 900 * 1024;
const LARG = 1280, HAUT = 720;

const nbr = (v, min, max, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
const txt = (v, max) => String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, max);
const couleur = v => (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(v || "")) ? String(v) : "");
const choix = (v, liste, def) => (liste.includes(v) ? v : def);
function urlHttps(v) { try { const u = new URL(String(v || "")); return u.protocol === "https:" && String(v).length <= 600 ? u.toString() : ""; } catch (_) { return ""; } }
function urlWeb(v) { try { const u = new URL(String(v || "")); return (u.protocol === "https:" || u.protocol === "http:") && String(v).length <= 600 ? u.toString() : ""; } catch (_) { return ""; } }
const idOk = v => (/^[A-Za-z0-9_-]{1,40}$/.test(String(v || "")) ? String(v) : "");

function nettoyerElement(e, SEC, pagesIds) {
  if (!e || typeof e !== "object" || !TYPES.includes(e.type)) return null;
  const p = e.props && typeof e.props === "object" ? e.props : {};
  const out = {
    type: e.type,
    x: Math.round(nbr(e.x, -2000, 6000, 0)), y: Math.round(nbr(e.y, -2000, 6000, 0)),
    w: Math.round(nbr(e.w, 20, 4000, 300)), h: Math.round(nbr(e.h, 8, 4000, 80)),
    z: Math.round(nbr(e.z, 0, 999, 1)), locked: !!e.locked, props: {},
  };
  const o = out.props;
  if (TYPES_TEXTE.includes(e.type)) {
    o.html = SEC.sanitizeRichHtml(txt(p.html, 20000));
    o.police = choix(p.police, POLICES, "");
    /* 0 / vide = « automatique » (taille et interligne par défaut du type d'élément) : ne jamais le ramener au minimum autorisé. */
    o.taille = Number(p.taille) > 0 ? Math.round(nbr(p.taille, 8, 120, 0)) : 0;
    o.couleur = couleur(p.couleur);
    o.fond = couleur(p.fond);
    o.align = choix(p.align, ["left", "center", "right", "justify"], "left");
    o.interligne = Number(p.interligne) > 0 ? nbr(p.interligne, 1, 3, 0) : 0;
    o.gras = !!p.gras;
  } else if (e.type === "image") {
    o.url = urlHttps(p.url); o.alt = txt(p.alt, 200); o.legende = txt(p.legende, 200);
    o.ajust = choix(p.ajust, ["cover", "contain"], "contain"); o.rayon = Math.round(nbr(p.rayon, 0, 60, 0)); o.align = choix(p.align, ["left", "center", "right"], "center");
  } else if (e.type === "video") {
    o.url = urlHttps(p.url); o.titre = txt(p.titre, 120); o.miniature = urlHttps(p.miniature);
  } else if (e.type === "audio") {
    o.url = urlHttps(p.url); o.titre = txt(p.titre, 120);
  } else if (e.type === "separateur") {
    o.style = choix(p.style, ["trait", "pointille", "double"], "trait"); o.couleur = couleur(p.couleur); o.epaisseur = Math.round(nbr(p.epaisseur, 1, 12, 2));
  } else if (e.type === "lien") {
    o.libelle = txt(p.libelle, 120); o.url = urlWeb(p.url);
  } else if (e.type === "bouton") {
    o.libelle = txt(p.libelle, 80); o.action = choix(p.action, ["lien", "page", "fichier"], "lien");
    o.url = o.action === "page" ? "" : (o.action === "fichier" ? urlHttps(p.url) : urlWeb(p.url));
    o.page = o.action === "page" && pagesIds.has(String(p.page)) ? String(p.page) : "";
    o.couleur = couleur(p.couleur); o.couleur_texte = couleur(p.couleur_texte); o.rayon = Math.round(nbr(p.rayon, 0, 60, 10));
  } else if (e.type === "fichier") {
    o.nom = txt(p.nom, 150); o.url = urlHttps(p.url); o.description = txt(p.description, 200);
  } else if (e.type === "tableau") {
    const lignes = (Array.isArray(p.lignes) ? p.lignes : []).slice(0, 30).map(l => (Array.isArray(l) ? l : []).slice(0, 8).map(c => txt(c, 200)));
    o.lignes = lignes.length ? lignes : [["", ""], ["", ""]];
    o.entete = p.entete !== false;
  } else if (e.type === "validation") {
    o.libelle = txt(p.libelle, 200) || "J'ai terminé cette activité"; o.obligatoire = p.obligatoire !== false;
  }
  return out;
}

/* Valide et nettoie un document entier. Renvoie { doc } ou { erreur }. */
function nettoyerDoc(brut, SEC) {
  if (!brut || typeof brut !== "object") return { erreur: "Contenu du studio invalide." };
  const mode = choix(brut.mode, ["libre", "structure"], "structure");
  const pagesBrutes = Array.isArray(brut.pages) ? brut.pages : null;
  if (!pagesBrutes) return { erreur: "Le contenu du studio doit contenir des pages." };
  if (pagesBrutes.length > MAX_PAGES) return { erreur: `Un module studio est limité à ${MAX_PAGES} pages.` };
  const vus = new Set();
  const unique = (id, prefixe) => { let v = idOk(id); while (!v || vus.has(v)) v = prefixe + Math.random().toString(36).slice(2, 10); vus.add(v); return v; };
  const pagesIds = new Set(pagesBrutes.map(pg => String(idOk(pg && pg.id))).filter(Boolean));
  const pages = [];
  for (const pg of pagesBrutes) {
    if (!pg || typeof pg !== "object") continue;
    const els = Array.isArray(pg.elements) ? pg.elements : [];
    if (els.length > MAX_ELEMENTS) return { erreur: `Une page est limitée à ${MAX_ELEMENTS} éléments.` };
    const page = { id: unique(pg.id, "p_"), titre: txt(pg.titre, 120), fond: couleur(pg.fond), elements: [] };
    for (const e of els) {
      const c = nettoyerElement(e, SEC, pagesIds);
      if (!c) continue;
      c.id = unique(e.id, "e_");
      page.elements.push(c);
    }
    pages.push(page);
  }
  if (!pages.length) pages.push({ id: unique("", "p_"), titre: "", fond: "", elements: [] });
  const doc = { mode, pages };
  if (Buffer.byteLength(JSON.stringify(doc), "utf8") > MAX_JSON) return { erreur: "Ce module est trop volumineux : retirez du contenu ou répartissez-le sur plusieurs leçons." };
  return { doc };
}

/* Contrôles avant publication : ce qui est incomplet est dit clairement, page par page. */
function problemes(doc) {
  const liste = [];
  const total = doc.pages.reduce((a, p) => a + p.elements.length, 0);
  if (!total) liste.push("Le module est vide : ajoutez au moins un élément.");
  doc.pages.forEach((pg, i) => {
    const n = `Page ${i + 1}`;
    pg.elements.forEach(e => {
      const p = e.props;
      if (e.type === "image" && !p.url) liste.push(`${n} : une image n'a pas de fichier.`);
      if (e.type === "video" && !p.url) liste.push(`${n} : une vidéo n'a pas d'adresse.`);
      if (e.type === "audio" && !p.url) liste.push(`${n} : un audio n'a pas de fichier.`);
      if (e.type === "fichier" && !p.url) liste.push(`${n} : un fichier téléchargeable n'a pas de fichier.`);
      if (e.type === "lien" && (!p.url || !p.libelle)) liste.push(`${n} : un lien est incomplet (texte ou adresse manquants).`);
      if (e.type === "bouton") {
        if (!p.libelle) liste.push(`${n} : un bouton n'a pas de texte.`);
        if ((p.action === "page" && !p.page) || (p.action !== "page" && !p.url)) liste.push(`${n} : le bouton « ${p.libelle || "sans texte"} » n'a pas de destination.`);
      }
    });
  });
  return liste;
}

const parse = s => { try { return JSON.parse(s); } catch (_) { return null; } };
const docVide = () => ({ mode: "structure", pages: [{ id: "p_" + Math.random().toString(36).slice(2, 10), titre: "", fond: "", elements: [] }] });

module.exports = { TYPES, nettoyerDoc, problemes };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, checkFormationOwner } = deps;
  const exiger = deps.exigerPremium;

  /* Charge formation + leçon (de CETTE formation) pour le propriétaire / l'administrateur / le formateur invité. Renvoie null après avoir répondu. */
  async function contexteProprietaire(req, res, params, ecriture) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) { sendJSON(res, 404, { error: "Formation introuvable." }); return null; }
    if (!checkFormationOwner(f, user)) { sendJSON(res, 403, { error: "Interdit." }); return null; }
    if (ecriture && exiger && !(await exiger(user, res, "formations"))) return null;
    const lecon = await db.prepare("SELECT l.* FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE l.id=? AND m.formation_id=?").get(params.leconId, f.id);
    if (!lecon) { sendJSON(res, 404, { error: "Leçon introuvable." }); return null; }
    return { user, f, lecon };
  }
  const chargerDoc = leconId => db.prepare("SELECT * FROM formation_studio_docs WHERE lecon_id=?").get(Number(leconId));
  const BASE = "/api/formations/:id/lecons/:leconId/studio";

  /* GET — le brouillon (un document vide, non enregistré, si la leçon n'a pas encore de studio). */
  route("GET", BASE, async (req, res, params) => {
    const c = await contexteProprietaire(req, res, params, false); if (!c) return;
    const d = await chargerDoc(c.lecon.id);
    if (!d) return sendJSON(res, 200, { existe: false, doc: docVide(), rev: 0, publiee_version: null, lecon: { id: Number(c.lecon.id), titre: c.lecon.titre }, formation: { id: Number(c.f.id), titre: c.f.titre } });
    const doc = parse(d.contenu_json) || docVide();
    doc.mode = d.mode || doc.mode;
    sendJSON(res, 200, { existe: true, doc, rev: Number(d.rev), publiee_version: d.publiee_version != null ? Number(d.publiee_version) : null, modifie_le: d.updated_at, lecon: { id: Number(c.lecon.id), titre: c.lecon.titre }, formation: { id: Number(c.f.id), titre: c.f.titre } });
  });

  /* PUT { mode, pages, rev } — sauvegarde automatique. rev doit être celui que le navigateur a reçu : sinon 409 (quelqu'un d'autre — ou un autre onglet — a enregistré entre-temps). */
  route("PUT", BASE, async (req, res, params, body) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const lim = SEC.rateLimit(`studio-save:${c.user.id}`, 240, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop d'enregistrements. Réessayez dans ${lim.retryAfter}s.` });
    const r = nettoyerDoc(body, SEC);
    if (r.erreur) return sendJSON(res, 400, { error: r.erreur });
    const json = JSON.stringify(r.doc);
    const d = await chargerDoc(c.lecon.id);
    if (!d) {
      try {
        await db.prepare("INSERT INTO formation_studio_docs (lecon_id, formation_id, mode, contenu_json, rev, updated_by) VALUES (?,?,?,?,1,?)").run(c.lecon.id, c.f.id, r.doc.mode, json, c.user.id);
      } catch (e) { return sendJSON(res, 409, { error: "Ce module vient d'être créé dans un autre onglet : rechargez la page.", code: "conflit" }); }
      await db.prepare("UPDATE formation_lecons SET studio=1 WHERE id=?").run(c.lecon.id);
      return sendJSON(res, 200, { ok: true, rev: 1, doc: r.doc });
    }
    if (Number(body.rev) !== Number(d.rev)) return sendJSON(res, 409, { error: "Ce module a été modifié ailleurs depuis votre dernier chargement.", code: "conflit", rev: Number(d.rev) });
    await db.prepare("UPDATE formation_studio_docs SET mode=?, contenu_json=?, rev=rev+1, updated_at=datetime('now'), updated_by=? WHERE id=? AND rev=?").run(r.doc.mode, json, c.user.id, d.id, d.rev);
    const apres = await db.prepare("SELECT rev FROM formation_studio_docs WHERE id=?").get(d.id);
    if (Number(apres.rev) !== Number(d.rev) + 1) return sendJSON(res, 409, { error: "Ce module a été modifié ailleurs pendant l'enregistrement.", code: "conflit", rev: Number(apres.rev) });
    sendJSON(res, 200, { ok: true, rev: Number(apres.rev), doc: r.doc });
  });

  async function creerVersion(d, contenuJson, mode, publiee, userId, libelle) {
    const { m } = (await db.prepare("SELECT COALESCE(MAX(version),0) AS m FROM formation_studio_versions WHERE doc_id=?").get(d.id));
    const version = Number(m) + 1;
    await db.prepare("INSERT INTO formation_studio_versions (doc_id, version, mode, contenu_json, publiee, auteur_id, libelle) VALUES (?,?,?,?,?,?,?)").run(d.id, version, mode, contenuJson, publiee ? 1 : 0, userId, libelle || null);
    /* Mémoire bornée : on garde les 60 dernières versions (les versions publiées ne sont jamais supprimées). */
    await db.prepare("DELETE FROM formation_studio_versions WHERE doc_id=? AND publiee=0 AND version <= ?").run(d.id, version - 60);
    return version;
  }

  /* GET …/versions — l'historique (sans le contenu). */
  route("GET", BASE + "/versions", async (req, res, params) => {
    const c = await contexteProprietaire(req, res, params, false); if (!c) return;
    const d = await chargerDoc(c.lecon.id);
    if (!d) return sendJSON(res, 200, { versions: [] });
    const rows = await db.prepare("SELECT v.version, v.publiee, v.libelle, v.created_at, u.nom, u.prenom FROM formation_studio_versions v LEFT JOIN users u ON u.id=v.auteur_id WHERE v.doc_id=? ORDER BY v.version DESC LIMIT 100").all(d.id);
    sendJSON(res, 200, { versions: rows.map(r => ({ version: Number(r.version), publiee: !!Number(r.publiee), en_ligne: d.publiee_version != null && Number(d.publiee_version) === Number(r.version), libelle: r.libelle || null, date: r.created_at, auteur: [r.prenom, r.nom].filter(Boolean).join(" ") || null })) });
  });

  /* POST …/versions { libelle? } — point de restauration du brouillon courant. */
  route("POST", BASE + "/versions", async (req, res, params, body) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const d = await chargerDoc(c.lecon.id);
    if (!d) return sendJSON(res, 409, { error: "Rien à sauvegarder : le module est vide." });
    const version = await creerVersion(d, d.contenu_json, d.mode, false, c.user.id, txt(body && body.libelle, 80) || "Point de restauration");
    sendJSON(res, 201, { ok: true, version });
  });

  /* POST …/restaurer { version, rev } — le brouillon reprend le contenu d'une version (le brouillon actuel est d'abord conservé). */
  route("POST", BASE + "/restaurer", async (req, res, params, body) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const d = await chargerDoc(c.lecon.id);
    if (!d) return sendJSON(res, 404, { error: "Aucun historique pour ce module." });
    const v = await db.prepare("SELECT * FROM formation_studio_versions WHERE doc_id=? AND version=?").get(d.id, Number(body && body.version));
    if (!v) return sendJSON(res, 404, { error: "Version introuvable." });
    if (body && body.rev != null && Number(body.rev) !== Number(d.rev)) return sendJSON(res, 409, { error: "Ce module a été modifié ailleurs.", code: "conflit", rev: Number(d.rev) });
    await creerVersion(d, d.contenu_json, d.mode, false, c.user.id, "Avant restauration de la version " + v.version);
    await db.prepare("UPDATE formation_studio_docs SET mode=?, contenu_json=?, rev=rev+1, updated_at=datetime('now'), updated_by=? WHERE id=?").run(v.mode, v.contenu_json, c.user.id, d.id);
    const apres = await db.prepare("SELECT rev FROM formation_studio_docs WHERE id=?").get(d.id);
    const doc = parse(v.contenu_json) || docVide(); doc.mode = v.mode;
    sendJSON(res, 200, { ok: true, rev: Number(apres.rev), doc });
  });

  /* POST …/publier — fige le brouillon en version publiée, après contrôle des éléments obligatoires. */
  route("POST", BASE + "/publier", async (req, res, params) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const d = await chargerDoc(c.lecon.id);
    if (!d) return sendJSON(res, 400, { error: "Le module est vide : ajoutez au moins un élément.", problemes: ["Le module est vide : ajoutez au moins un élément."] });
    const doc = parse(d.contenu_json) || docVide();
    const liste = problemes(doc);
    if (liste.length) return sendJSON(res, 400, { error: "Le module n'est pas prêt à être publié.", problemes: liste });
    const version = await creerVersion(d, d.contenu_json, d.mode, true, c.user.id, "Publication");
    await db.prepare("UPDATE formation_studio_docs SET publiee_version=? WHERE id=?").run(version, d.id);
    sendJSON(res, 200, { ok: true, version });
  });

  /* POST …/depublier — les apprenants ne voient plus rien (leur progression est conservée). */
  route("POST", BASE + "/depublier", async (req, res, params) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const d = await chargerDoc(c.lecon.id);
    if (!d || d.publiee_version == null) return sendJSON(res, 409, { error: "Ce module n'est pas publié." });
    await db.prepare("UPDATE formation_studio_docs SET publiee_version=NULL WHERE id=?").run(d.id);
    sendJSON(res, 200, { ok: true });
  });

  /* GET …/lecture — le module tel que lu par l'apprenant : la VERSION PUBLIÉE, jamais le brouillon (sauf ?brouillon=1 pour le propriétaire : prévisualisation).
     Accès : propriétaire / administrateur ; apprenant ayant le droit sur le module de la leçon ; ou leçon offerte en aperçu gratuit d'une formation publiée. */
  route("GET", BASE + "/lecture", async (req, res, params) => {
    const lim = SEC.rateLimit(`studio-lecture:${SEC.clientIp(req)}`, 600, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de requêtes. Réessayez dans ${lim.retryAfter}s.` });
    const user = await getCurrentUser(req);
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    const lecon = await db.prepare("SELECT l.* FROM formation_lecons l JOIN formation_modules m ON m.id=l.module_id WHERE l.id=? AND m.formation_id=?").get(params.leconId, f.id);
    if (!lecon || !Number(lecon.studio)) return sendJSON(res, 404, { error: "Contenu introuvable." });
    const proprietaire = !!(user && checkFormationOwner(f, user));
    let autorise = proprietaire;
    if (!autorise && user) {
      await Droits.balayerExpirations(db, { userId: user.id, formationId: f.id });
      const insc = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").get(f.id, user.id);
      autorise = !!insc && await Droits.leconPermise(db, insc, f.id, lecon.id);
    }
    if (!autorise && Number(lecon.apercu_gratuit) && f.statut === "publiee" && (!f.acces_type || f.acces_type === "public")) autorise = true;
    if (!autorise) return sendJSON(res, 403, { error: "Vous n'avez pas accès à ce contenu." });
    const d = await chargerDoc(lecon.id);
    if (!d) return sendJSON(res, 404, { error: "Contenu introuvable." });
    const brouillon = proprietaire && new URL(req.url, "http://localhost").searchParams.get("brouillon") === "1";
    if (brouillon) { const doc = parse(d.contenu_json) || docVide(); doc.mode = d.mode; return sendJSON(res, 200, { doc, version: null, brouillon: true }); }
    if (d.publiee_version == null) return sendJSON(res, 404, { error: "Ce contenu n'est pas encore publié." });
    const v = await db.prepare("SELECT * FROM formation_studio_versions WHERE doc_id=? AND version=?").get(d.id, Number(d.publiee_version));
    if (!v) return sendJSON(res, 404, { error: "Contenu introuvable." });
    const doc = parse(v.contenu_json) || docVide(); doc.mode = v.mode;
    sendJSON(res, 200, { doc, version: Number(v.version) });
  });
};

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
const TYPES = [...TYPES_TEXTE, "image", "video", "audio", "separateur", "lien", "bouton", "fichier", "document", "tableau", "validation", "quiz"];
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
  } else if (e.type === "document") {
    o.nom = txt(p.nom, 150); o.url = urlHttps(p.url); o.mode = choix(p.mode, ["lecteur", "telechargement"], "lecteur");
  } else if (e.type === "quiz") {
    o.quiz_id = Math.max(0, Math.floor(Number(p.quiz_id)) || 0); /* vérifié contre la leçon au moment de l'enregistrement (PUT) */
    o.libelle = txt(p.libelle, 120); /* texte de la carte dans l'éditeur (titre + nombre de questions), purement informatif */
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
      if (e.type === "document" && !p.url) liste.push(`${n} : un document n'a pas de fichier.`);
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

/* Types de question du moteur de quiz existant et bornes — partagés avec les routes d'activité ci-dessous. */
const KINDS = {
  questionnaire: { type: "intermediaire", correction_auto: 1, note_minimale: 50, depot_fichier: "non", titre: "Questionnaire" },
  evaluation: { type: "examen_final", correction_auto: 1, note_minimale: 70, depot_fichier: "non", titre: "Évaluation" },
  exercice: { type: "exercice", correction_auto: 0, note_minimale: 50, depot_fichier: "optionnel", titre: "Exercice pratique" },
};
const kindDe = q => (Number(q.correction_auto) === 0 ? "exercice" : q.type === "examen_final" ? "evaluation" : "questionnaire");

/* Valide une question envoyée par l'éditeur du Studio. Renvoie { vals } ou { erreur }. */
function lireQuestion(b) {
  const question = txt(b && b.question, 500).trim();
  if (!question) return { erreur: "Écrivez l'énoncé de la question." };
  const type = choix(b.type, ["qcm", "vrai_faux", "texte_libre"], "");
  if (!type) return { erreur: "Type de question inconnu." };
  const points = Math.round(nbr(b.points, 1, 20, 1));
  const explication = txt(b.explication, 500).trim() || null;
  let options = null, reponse = null;
  if (type === "qcm") {
    options = [...new Set((Array.isArray(b.options) ? b.options : []).map(o => txt(o, 200).trim()).filter(Boolean))].slice(0, 8);
    if (options.length < 2) return { erreur: "Proposez au moins deux choix différents." };
    const bonnes = (Array.isArray(b.bonnes) ? b.bonnes : []).map(o => txt(o, 200).trim());
    const ok = options.filter(o => bonnes.includes(o));
    if (!ok.length) return { erreur: "Cochez au moins une bonne réponse." };
    reponse = ok.join("|");
  } else if (type === "vrai_faux") {
    reponse = b.bonne === "Faux" ? "Faux" : b.bonne === "Vrai" ? "Vrai" : null;
    if (!reponse) return { erreur: "Indiquez si l'affirmation est vraie ou fausse." };
  } else {
    reponse = txt(b.reponse_attendue, 300).trim() || null; /* vide = réponse libre non notée (ou corrigée par le formateur) */
  }
  return { vals: { question, type, options_json: options ? JSON.stringify(options) : null, reponse_correcte: reponse, points, explication } };
}

module.exports = { TYPES, KINDS, nettoyerDoc, problemes, lireQuestion };

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
    const quizLecon = await db.prepare("SELECT id FROM formation_quiz WHERE lecon_id=? AND formation_id=?").get(c.lecon.id, c.f.id);
    let quizVu = false;
    r.doc.pages.forEach(pg => { pg.elements = pg.elements.filter(e => {
      if (e.type !== "quiz") return true;
      if (quizVu) return false; /* un seul quiz / questionnaire / exercice par module */
      quizVu = true; e.props.quiz_id = quizLecon && Number(e.props.quiz_id) === Number(quizLecon.id) ? Number(quizLecon.id) : 0;
      return true;
    }); });
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
    const quizLecon = await db.prepare("SELECT * FROM formation_quiz WHERE lecon_id=? AND formation_id=?").get(c.lecon.id, c.f.id);
    const placeQuiz = doc.pages.map((p, i) => p.elements.some(e => e.type === "quiz" && Number(e.props.quiz_id) > 0 && quizLecon && Number(e.props.quiz_id) === Number(quizLecon.id)) ? i + 1 : 0).find(Boolean);
    doc.pages.forEach((p, i) => p.elements.forEach(e => { if (e.type === "quiz" && !(quizLecon && Number(e.props.quiz_id) === Number(quizLecon.id))) liste.push(`Page ${i + 1} : l'activité évaluée n'est pas encore créée (choisissez Quiz, Questionnaire ou Exercice).`); }));
    if (quizLecon && !placeQuiz) liste.push("Cette leçon a une activité évaluée (quiz, questionnaire ou exercice) qui n'est placée dans aucune page : ajoutez-la dans une page, ou supprimez-la.");
    if (quizLecon && placeQuiz) {
      const nbQ = Number((await db.prepare("SELECT COUNT(*) AS n FROM formation_quiz_questions WHERE quiz_id=?").get(quizLecon.id)).n) || 0;
      if (!nbQ && !(Number(quizLecon.correction_auto) === 0 && quizLecon.depot_fichier && quizLecon.depot_fichier !== "non")) liste.push(`Page ${placeQuiz} : l'activité « ${quizLecon.titre} » n'a encore aucune question.`);
    }
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

  /* ── Activité évaluée de la leçon (quiz, questionnaire, exercice) : le moteur de quiz existant, piloté depuis le Studio. Une seule par leçon. ── */
  const detailQuiz = async q => {
    const qs = await db.prepare("SELECT * FROM formation_quiz_questions WHERE quiz_id=? ORDER BY ordre ASC, id ASC").all(q.id);
    return { id: Number(q.id), kind: kindDe(q), titre: q.titre, note_minimale: Number(q.note_minimale), max_tentatives: q.max_tentatives == null ? null : Number(q.max_tentatives),
      temps_limite_min: q.temps_limite_min == null ? null : Number(q.temps_limite_min), melanger: !!Number(q.melanger), depot_fichier: q.depot_fichier || "non", correction_auto: Number(q.correction_auto) !== 0,
      questions: qs.map(x => { let o = []; try { o = JSON.parse(x.options_json || "[]") || []; } catch (_) {} return { id: Number(x.id), question: x.question, type: x.type, options: o, bonnes: String(x.reponse_correcte || "").split("|").filter(Boolean), reponse_correcte: x.reponse_correcte || "", points: Number(x.points) || 1, explication: x.explication || "" }; }) };
  };
  const quizDeLecon = (c) => db.prepare("SELECT * FROM formation_quiz WHERE lecon_id=? AND formation_id=?").get(c.lecon.id, c.f.id);

  route("GET", BASE + "/activite", async (req, res, params) => {
    const c = await contexteProprietaire(req, res, params, false); if (!c) return;
    const q = await quizDeLecon(c);
    sendJSON(res, 200, { quiz: q ? await detailQuiz(q) : null });
  });
  route("POST", BASE + "/activite", async (req, res, params, body) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const K = KINDS[body && body.kind]; if (!K) return sendJSON(res, 400, { error: "Choisissez Quiz / questionnaire, Évaluation ou Exercice pratique." });
    if (c.f.suivi_mode === "aucun") return sendJSON(res, 400, { error: "Cette formation est réglée « sans suivi de progression » : elle ne peut pas contenir d'activité évaluée.", code: "suivi_desactive" });
    if (await quizDeLecon(c)) return sendJSON(res, 409, { error: "Cette leçon a déjà une activité évaluée : créez une autre leçon pour en ajouter une." });
    const titre = txt(body.titre, 120).trim() || K.titre;
    const id = (await db.prepare("INSERT INTO formation_quiz (formation_id,lecon_id,titre,type,note_minimale,correction_auto,depot_fichier) VALUES (?,?,?,?,?,?,?)").run(c.f.id, c.lecon.id, titre, K.type, K.note_minimale, K.correction_auto, K.depot_fichier)).lastInsertRowid;
    sendJSON(res, 201, { quiz: await detailQuiz(await db.prepare("SELECT * FROM formation_quiz WHERE id=?").get(id)) });
  });
  route("PUT", BASE + "/activite", async (req, res, params, body) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const q = await quizDeLecon(c); if (!q) return sendJSON(res, 404, { error: "Aucune activité évaluée dans cette leçon." });
    const b = body || {}; const sets = {};
    const entier = (v, min, max, nom) => { if (v === null || v === "") return { v: null }; const n = Math.floor(Number(v)); if (!Number.isFinite(n) || n < min || n > max) return { erreur: `${nom} doit être compris entre ${min} et ${max} (ou vide pour aucune limite).` }; return { v: n }; };
    if (b.titre !== undefined) { const t2 = txt(b.titre, 120).trim(); if (!t2) return sendJSON(res, 400, { error: "Le titre ne peut pas être vide." }); sets.titre = t2; }
    if (b.note_minimale !== undefined) { const r = entier(b.note_minimale, 0, 100, "Le seuil de réussite"); if (r.erreur || r.v == null) return sendJSON(res, 400, { error: r.erreur || "Indiquez le seuil de réussite (0 à 100 %)." }); sets.note_minimale = r.v; }
    if (b.max_tentatives !== undefined) { const r = entier(b.max_tentatives, 1, 20, "Le nombre de tentatives"); if (r.erreur) return sendJSON(res, 400, { error: r.erreur }); sets.max_tentatives = r.v; }
    if (b.temps_limite_min !== undefined) { const r = entier(b.temps_limite_min, 1, 480, "La durée"); if (r.erreur) return sendJSON(res, 400, { error: r.erreur }); sets.temps_limite_min = r.v; }
    if (b.melanger !== undefined) sets.melanger = b.melanger ? 1 : 0;
    if (b.depot_fichier !== undefined) {
      if (!["non", "optionnel", "obligatoire"].includes(b.depot_fichier)) return sendJSON(res, 400, { error: "Dépôt de fichier inconnu (non, optionnel ou obligatoire)." });
      if (Number(q.correction_auto) !== 0 && b.depot_fichier !== "non") return sendJSON(res, 400, { error: "Le dépôt de fichier est réservé aux exercices corrigés par le formateur." });
      sets.depot_fichier = b.depot_fichier;
    }
    for (const k of Object.keys(sets)) await db.prepare(`UPDATE formation_quiz SET ${k}=? WHERE id=?`).run(sets[k], q.id);
    sendJSON(res, 200, { quiz: await detailQuiz(await db.prepare("SELECT * FROM formation_quiz WHERE id=?").get(q.id)) });
  });
  route("DELETE", BASE + "/activite", async (req, res, params) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const q = await quizDeLecon(c); if (!q) return sendJSON(res, 404, { error: "Aucune activité évaluée dans cette leçon." });
    await db.prepare("DELETE FROM formation_quiz_tentatives WHERE quiz_id=?").run(q.id);
    await db.prepare("DELETE FROM formation_quiz_sessions WHERE quiz_id=?").run(q.id);
    await db.prepare("DELETE FROM formation_quiz_questions WHERE quiz_id=?").run(q.id);
    await db.prepare("DELETE FROM formation_quiz WHERE id=?").run(q.id);
    sendJSON(res, 200, { ok: true });
  });
  route("POST", BASE + "/activite/questions", async (req, res, params, body) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const q = await quizDeLecon(c); if (!q) return sendJSON(res, 404, { error: "Créez d'abord l'activité évaluée." });
    const r = lireQuestion(body); if (r.erreur) return sendJSON(res, 400, { error: r.erreur });
    const nb = Number((await db.prepare("SELECT COUNT(*) AS n FROM formation_quiz_questions WHERE quiz_id=?").get(q.id)).n) || 0;
    if (nb >= 60) return sendJSON(res, 400, { error: "Une activité est limitée à 60 questions." });
    const { m } = await db.prepare("SELECT COALESCE(MAX(ordre),-1) AS m FROM formation_quiz_questions WHERE quiz_id=?").get(q.id);
    const v = r.vals;
    const id = (await db.prepare("INSERT INTO formation_quiz_questions (quiz_id,question,type,options_json,reponse_correcte,points,ordre,explication) VALUES (?,?,?,?,?,?,?,?)").run(q.id, v.question, v.type, v.options_json, v.reponse_correcte, v.points, Number(m) + 1, v.explication)).lastInsertRowid;
    sendJSON(res, 201, { id: Number(id), quiz: await detailQuiz(q) });
  });
  route("PUT", BASE + "/activite/questions/:qid", async (req, res, params, body) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const q = await quizDeLecon(c); if (!q) return sendJSON(res, 404, { error: "Aucune activité évaluée dans cette leçon." });
    const ex = await db.prepare("SELECT id FROM formation_quiz_questions WHERE id=? AND quiz_id=?").get(params.qid, q.id); if (!ex) return sendJSON(res, 404, { error: "Question introuvable." });
    const r = lireQuestion(body); if (r.erreur) return sendJSON(res, 400, { error: r.erreur });
    const v = r.vals;
    await db.prepare("UPDATE formation_quiz_questions SET question=?, type=?, options_json=?, reponse_correcte=?, points=?, explication=? WHERE id=?").run(v.question, v.type, v.options_json, v.reponse_correcte, v.points, v.explication, ex.id);
    sendJSON(res, 200, { quiz: await detailQuiz(q) });
  });
  route("DELETE", BASE + "/activite/questions/:qid", async (req, res, params) => {
    const c = await contexteProprietaire(req, res, params, true); if (!c) return;
    const q = await quizDeLecon(c); if (!q) return sendJSON(res, 404, { error: "Aucune activité évaluée dans cette leçon." });
    await db.prepare("DELETE FROM formation_quiz_questions WHERE id=? AND quiz_id=?").run(params.qid, q.id);
    sendJSON(res, 200, { quiz: await detailQuiz(q) });
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

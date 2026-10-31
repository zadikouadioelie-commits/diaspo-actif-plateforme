/* ═════════════════════════════════════════════════
   server/formation-recap-module.js — Fin de module : récapitulatif PDF et carte mentale, automatiques (2026-10-31)

   Deux OPTIONS de formation, cochables par tout créateur (onglet « Certificat » du constructeur, PUT /api/formations/:id/reglages) :
   - carte_module  : une carte mentale du module, générée à partir de son plan ;
   - recap_module  : un récapitulatif PDF téléchargeable du module.
   Rien à rédiger : le contenu vient de ce que le créateur a déjà écrit — titres, chapitres, leçons, et les blocs repérés par leur titre
   « À retenir » (points clés) et « Exercice » (mise en pratique), dans une leçon texte comme dans une leçon Studio.
   Débloqués quand l'apprenant a terminé toutes les activités obligatoires du module ; le formateur (et l'administrateur) les voient toujours (aperçu).
   Le récapitulatif est fabriqué à la demande (jamais stocké). La carte est une carte de formation (cartes_mentales.module_id) tenue à jour à chaque demande.
   ═════════════════════════════════════════════════ */
"use strict";
const { Pdf, MM, largeurTexte, decouper } = require("./pdf-simple");
const Cartes = require("./cartes-mentales");
const Catalogue = require("./formation-catalogue");
const Droits = require("./formation-droits");

const MAX_RETENIR = 4, MAX_EXERCICE = 2, MAX_LIGNE = 260;

/* ── HTML → lignes de texte ── */
const ENTITES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ", "&laquo;": "«", "&raquo;": "»" };
const decoder = s => String(s).replace(/&(?:amp|lt|gt|quot|apos|nbsp|laquo|raquo|#39);/g, m => ENTITES[m] || m).replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)));
function lignesDeHtml(html) {
  return decoder(String(html || "").replace(/<\s*br\s*\/?>/gi, "\n").replace(/<\/(p|li|h[1-6]|blockquote|div|tr|ul|ol)>/gi, "\n").replace(/<[^>]*>/g, ""))
    .split(/\n/).map(l => l.replace(/\s+/g, " ").replace(/^[•\-–*]\s+/, "").trim()).filter(Boolean);
}

/* Lignes d'une leçon : texte enrichi, ou page(s) Studio publiée(s) (dernière version publiée, à défaut le brouillon). */
async function lignesDeLecon(db, lecon) {
  if (Number(lecon.studio)) {
    const d = await db.prepare("SELECT * FROM formation_studio_docs WHERE lecon_id=?").get(lecon.id);
    if (!d) return [];
    let json = d.contenu_json;
    if (d.publiee_version) {
      const v = await db.prepare("SELECT contenu_json FROM formation_studio_versions WHERE doc_id=? AND version=?").get(d.id, d.publiee_version);
      if (v && v.contenu_json) json = v.contenu_json;
    }
    let doc; try { doc = JSON.parse(json); } catch (_) { return []; }
    const out = [];
    for (const pg of doc.pages || []) for (const e of pg.elements || []) {
      const p = e.props || {};
      if (["titre", "soustitre", "paragraphe", "citation", "encadre"].includes(e.type)) out.push(...lignesDeHtml(p.html));
      else if (e.type === "tableau") (p.lignes || []).forEach(l => out.push((l || []).filter(Boolean).join(" · ")));
    }
    return out.filter(Boolean);
  }
  return lignesDeHtml(lecon.contenu_texte);
}

const RE_RETENIR = /^(?:à|a)\s+retenir\s*[:\-–—]?\s*(.*)$/i;
const RE_EXERCICE = /^exercice(?:\s+(?:personnel|principal|pratique|du module))?\s*[:\-–—]?\s*(.*)$/i;
const RE_SECTION = /^(?:à retenir|exercice|étude de cas|mise en situation|évaluation|à vous de jouer|leçon\s+\d+|chapitre\s+\d+|thème\s+\d+|\d\.\s)/i;
const coupe = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

/* Repère les blocs « À retenir » et « Exercice » : la ligne qui porte le titre (texte éventuel sur la même ligne), puis les lignes suivantes jusqu'au titre suivant. */
function extraire(lignes) {
  const prendre = (re, max) => {
    const i = lignes.findIndex(l => re.test(l));
    if (i < 0) return [];
    const items = [];
    const m = re.exec(lignes[i]);
    if (m && m[1]) items.push(m[1]);
    for (let k = i + 1; k < lignes.length && items.length < max; k++) { if (RE_SECTION.test(lignes[k])) break; items.push(lignes[k]); }
    return items.slice(0, max).map(x => coupe(x, MAX_LIGNE));
  };
  return { retenir: prendre(RE_RETENIR, MAX_RETENIR), exercice: prendre(RE_EXERCICE, MAX_EXERCICE) };
}

/* Contenu d'un module : { module, chapitres: [{ titre, lecons: [{ id, titre, retenir[], exercice[] }] }] } */
async function contenuModule(db, f, module) {
  const chapitres = [];
  for (const c of await db.prepare("SELECT id, titre FROM formation_chapitres WHERE module_id=? ORDER BY ordre ASC, id ASC").all(module.id)) {
    const lecons = [];
    for (const l of await db.prepare("SELECT id, titre, type, studio, contenu_texte FROM formation_lecons WHERE chapitre_id=? ORDER BY ordre ASC, id ASC").all(c.id)) {
      const x = extraire(await lignesDeLecon(db, l));
      lecons.push({ id: Number(l.id), titre: l.titre, retenir: x.retenir, exercice: x.exercice });
    }
    chapitres.push({ id: Number(c.id), titre: c.titre, lecons });
  }
  return { module: { id: Number(module.id), titre: module.titre, description: module.description || "" }, chapitres };
}

/* ── Carte mentale du module ── */
function arbreCarte(contenu) {
  const palette = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#be185d"];
  const id = () => require("crypto").randomBytes(5).toString("hex");
  const racine = { id: id(), texte: coupe(contenu.module.titre, 120), couleur: "#0d2b4e", enfants: [] };
  let total = 1;
  const MAX = Cartes.MAX_NOEUDS - 2;
  contenu.chapitres.forEach((c, k) => {
    if (total >= MAX) return;
    const couleur = palette[k % palette.length];
    const nc = { id: id(), texte: coupe(c.titre, 120), couleur, lien: { type: "chapitre", id: c.id }, enfants: [] };
    total++;
    for (const l of c.lecons) {
      if (total >= MAX) break;
      const nl = { id: id(), texte: coupe(l.titre, 120), couleur, lien: { type: "lecon", id: l.id }, enfants: [] };
      if (l.exercice.length) nl.note = coupe("Exercice : " + l.exercice.join(" "), 1500);
      total++;
      for (const r of l.retenir.slice(0, 3)) { if (total >= MAX) break; nl.enfants.push({ id: id(), texte: coupe(r, 120), couleur, enfants: [] }); total++; }
      nc.enfants.push(nl);
    }
    racine.enfants.push(nc);
  });
  return { v: 1, racine };
}

/* ── Récapitulatif PDF (A4, aucune flèche ni coche : le générateur ne sait écrire que l'alphabet latin) ── */
const NAVY = "#0D2B4E", OR = "#C99A2E", GRIS = "#64748b", ENCRE = "#1e293b";
function recapPdf(contenu, meta) {
  const L = 210 * MM, H = 297 * MM, MARGE = 18 * MM, LARGEUR = L - 2 * MARGE, BAS = H - 20 * MM;
  const pdf = new Pdf({ Title: `Récapitulatif — ${contenu.module.titre}`, Author: meta.auteur || "Diaspo'Actif", Subject: meta.formation, Producer: "Diaspo'Actif" });
  let p, y, n = 0;
  const pied = () => {
    p.ligne(MARGE, H - 14 * MM, L - MARGE, H - 14 * MM, { couleur: "#e2e8f0", epaisseur: 0.6 });
    p.texte(coupe(`${meta.formation} · ${meta.auteur || "Diaspo'Actif"}`, 90), MARGE, H - 9.5 * MM, { taille: 8, couleur: GRIS });
    p.texte(`Page ${n}`, L - MARGE, H - 9.5 * MM, { taille: 8, couleur: GRIS, align: "right" });
  };
  const nouvellePage = (premiere) => {
    p = pdf.page(L, H); n++;
    if (premiere) {
      p.rect(0, 0, L, 52 * MM, { fond: NAVY });
      p.texte("RÉCAPITULATIF DE MODULE", MARGE, 16 * MM, { police: "Helvetica-Bold", taille: 9, couleur: "#f3d58a", espacement: 1.6 });
      const t = decouper(contenu.module.titre, "Helvetica-Bold", 22, LARGEUR).slice(0, 3);
      t.forEach((l, i) => p.texte(l, MARGE, 27 * MM + i * 9.2 * MM, { police: "Helvetica-Bold", taille: 22, couleur: "#ffffff" }));
      p.texte(coupe(meta.formation, 95), MARGE, 47 * MM, { taille: 9.5, couleur: "#cbd5e1" });
      y = 62 * MM;
    } else { p.rect(0, 0, L, 9 * MM, { fond: NAVY }); y = 22 * MM; }
    pied();
  };
  const place = h => { if (y + h > BAS) nouvellePage(false); };
  const para = (txt, x, larg, o) => { const lignes = decouper(txt, o.police || "Helvetica", o.taille, larg); const ih = o.taille * 1.38; place(lignes.length * ih); lignes.forEach((l, i) => p.texte(l, x, y + i * ih + o.taille, o)); y += lignes.length * ih; };

  nouvellePage(true);
  if (contenu.module.description) {
    const desc = decouper(contenu.module.description, "Helvetica", 10.5, LARGEUR - 12 * MM);
    const h = desc.length * 14.5 + 22;
    place(h);
    p.rect(MARGE, y, LARGEUR, h, { fond: "#f8f5ec" }); p.rect(MARGE, y, 3, h, { fond: OR });
    p.texte("OBJECTIF DU MODULE", MARGE + 8 * MM, y + 14, { police: "Helvetica-Bold", taille: 8, couleur: OR, espacement: 1 });
    desc.forEach((l, i) => p.texte(l, MARGE + 8 * MM, y + 29 + i * 14.5, { taille: 10.5, couleur: ENCRE }));
    y += h + 14;
  }
  let numLecon = 0;
  contenu.chapitres.forEach((c, ci) => {
    place(46);
    p.rect(MARGE, y, LARGEUR, 22, { fond: NAVY });
    p.texte(coupe(`Chapitre ${ci + 1} · ${c.titre}`, 80), MARGE + 8, y + 15, { police: "Helvetica-Bold", taille: 11.5, couleur: "#ffffff" });
    y += 32;
    for (const l of c.lecons) {
      numLecon++;
      place(40);
      para(`${numLecon}. ${l.titre}`, MARGE, LARGEUR, { police: "Helvetica-Bold", taille: 11, couleur: NAVY });
      for (const r of l.retenir) { y += 2; const lg = decouper(r, "Helvetica", 9.8, LARGEUR - 16); place(lg.length * 13.6); lg.forEach((t, i) => { if (i === 0) p.texte("•", MARGE + 5, y + 9.8, { taille: 9.8, couleur: OR, police: "Helvetica-Bold" }); p.texte(t, MARGE + 16, y + 9.8 + i * 13.6, { taille: 9.8, couleur: ENCRE }); }); y += lg.length * 13.6; }
      if (l.exercice.length) { y += 3; para("À faire : " + l.exercice.join(" "), MARGE + 16, LARGEUR - 16, { police: "Helvetica-Oblique", taille: 9.3, couleur: GRIS }); }
      y += 8;
    }
    y += 6;
  });
  /* Dernière page : mes notes */
  nouvellePage(false);
  p.texte("MES NOTES", MARGE, y + 10, { police: "Helvetica-Bold", taille: 11, couleur: NAVY, espacement: 1.4 }); y += 26;
  const blocs = ["Les trois idées que je retiens de ce module", "Ce que je vais essayer cette semaine"];
  blocs.forEach(b => {
    p.texte(b, MARGE, y + 9, { police: "Helvetica-Bold", taille: 10, couleur: ENCRE }); y += 16;
    for (let i = 0; i < 5; i++) { p.ligne(MARGE, y + 18 * (i + 1), L - MARGE, y + 18 * (i + 1), { couleur: "#cbd5e1", epaisseur: 0.6 }); }
    y += 18 * 5 + 22;
  });
  return pdf.build();
}

/* Le module est terminé quand toutes ses activités obligatoires le sont. */
async function moduleTermine(db, inscription, moduleId) {
  const lecons = await db.prepare("SELECT id FROM formation_lecons WHERE module_id=? AND COALESCE(obligatoire,1)<>0").all(moduleId);
  if (!lecons.length) return false;
  const faites = new Set((await db.prepare("SELECT lecon_id FROM formation_lecons_progression WHERE inscription_id=? AND termine<>0").all(inscription.id)).map(r => Number(r.lecon_id)));
  return lecons.every(l => faites.has(Number(l.id)));
}

module.exports = { extraire, lignesDeHtml, contenuModule, arbreCarte, recapPdf, moduleTermine };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC } = deps;
  const estAdmin = u => u && u.role === "administrateur";

  /* Qui peut voir quoi : le propriétaire et l'administrateur toujours (aperçu) ; un apprenant inscrit seulement une fois le module terminé. */
  async function contexte(req, res, params) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(Number(params.id));
    if (!f) { sendJSON(res, 404, { error: "Formation introuvable." }); return null; }
    const proprio = Number(f.owner_user_id) === Number(user.id) || estAdmin(user);
    let inscription = null;
    if (!proprio) {
      inscription = await db.prepare("SELECT * FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')<>'en_attente'").get(f.id, user.id);
      if (!inscription) { sendJSON(res, 403, { error: "Ce document est réservé aux personnes inscrites à la formation." }); return null; }
    }
    return { user, f, proprio, inscription };
  }
  async function etatModule(c, m) {
    if (c.proprio) return { termine: false, disponible: true, apercu: true };
    const auto = await Droits.modulesAutorises(db, c.inscription);
    if (auto && !auto.has(Number(m.id))) return { termine: false, disponible: false, apercu: false, hors_acces: true };
    const suiviAucun = c.f.suivi_mode === "aucun";
    const termine = suiviAucun ? true : await moduleTermine(db, c.inscription, m.id);
    return { termine, disponible: termine, apercu: false };
  }

  /* GET /api/formations/:id/fin-de-module — ce que la page de suivi affiche sous chaque module. */
  route("GET", "/api/formations/:id/fin-de-module", async (req, res, params) => {
    const c = await contexte(req, res, params); if (!c) return;
    const carte = !!Number(c.f.carte_module), recap = !!Number(c.f.recap_module);
    if (!carte && !recap) return sendJSON(res, 200, { carte, recap, modules: [] });
    const modules = [];
    for (const m of await db.prepare("SELECT id, titre FROM formation_modules WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(c.f.id)) {
      const e = await etatModule(c, m);
      if (e.hors_acces) continue;
      modules.push({ id: Number(m.id), titre: m.titre, termine: e.termine, disponible: e.disponible, apercu: e.apercu });
    }
    sendJSON(res, 200, { carte, recap, modules });
  });

  async function moduleAutorise(req, res, params, option) {
    const c = await contexte(req, res, params); if (!c) return null;
    if (!Number(c.f[option])) { sendJSON(res, 404, { error: "Cette option n'est pas activée pour cette formation." }); return null; }
    const m = await db.prepare("SELECT * FROM formation_modules WHERE id=? AND formation_id=?").get(Number(params.moduleId), c.f.id);
    if (!m) { sendJSON(res, 404, { error: "Module introuvable." }); return null; }
    const e = await etatModule(c, m);
    if (!e.disponible) { sendJSON(res, 403, { error: e.hors_acces ? "Ce module ne fait pas partie de votre accès." : "Terminez toutes les activités obligatoires de ce module pour obtenir ce document.", code: "module_non_termine" }); return null; }
    return { ...c, m };
  }

  /* GET /api/formations/:id/modules/:moduleId/recapitulatif.pdf */
  route("GET", "/api/formations/:id/modules/:moduleId/recapitulatif.pdf", async (req, res, params) => {
    const c = await moduleAutorise(req, res, params, "recap_module"); if (!c) return;
    const lim = SEC.rateLimit(`recap-module:${c.user.id}`, 60, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de demandes. Réessayez dans ${lim.retryAfter}s.` });
    try {
      const contenu = await contenuModule(db, c.f, c.m);
      const buf = recapPdf(contenu, { formation: c.f.titre, auteur: await Catalogue.nomAuteur(db, c.f.owner_user_id) });
      const nom = String(c.m.titre).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "module";
      res.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": buf.length, "Content-Disposition": `attachment; filename="recapitulatif-${nom}.pdf"`, "Cache-Control": "private, max-age=60", "X-Content-Type-Options": "nosniff" });
      res.end(buf);
    } catch (e) { sendJSON(res, 500, SEC.safeError(e, "recap-module")); }
  });

  /* POST /api/formations/:id/modules/:moduleId/carte — crée ou met à jour la carte du module ; renvoie son identifiant (lisible ensuite via /api/cartes-mentales/:id). */
  route("POST", "/api/formations/:id/modules/:moduleId/carte", async (req, res, params) => {
    const c = await moduleAutorise(req, res, params, "carte_module"); if (!c) return;
    const lim = SEC.rateLimit(`carte-module:${c.user.id}`, 60, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de demandes. Réessayez dans ${lim.retryAfter}s.` });
    try {
      const contenu = await contenuModule(db, c.f, c.m);
      const { arbre, nb_noeuds } = Cartes.nettoyerArbre(arbreCarte(contenu));
      const titre = coupe(`Carte mentale — ${c.m.titre}`, 120);
      const ex = await db.prepare("SELECT id FROM cartes_mentales WHERE formation_id=? AND module_id=?").get(c.f.id, c.m.id);
      let id;
      if (ex) { await db.prepare("UPDATE cartes_mentales SET titre=?, data_json=?, nb_noeuds=?, updated_at=datetime('now') WHERE id=?").run(titre, JSON.stringify(arbre), nb_noeuds, ex.id); id = ex.id; }
      else id = (await db.prepare("INSERT INTO cartes_mentales (owner_user_id, formation_id, module_id, titre, data_json, nb_noeuds) VALUES (?,?,?,?,?,?)").run(c.f.owner_user_id, c.f.id, c.m.id, titre, JSON.stringify(arbre), nb_noeuds)).lastInsertRowid;
      sendJSON(res, 200, { id: Number(id) });
    } catch (e) { sendJSON(res, 500, SEC.safeError(e, "carte-module")); }
  });
};

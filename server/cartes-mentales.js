/* ═════════════════════════════════════════════════
   server/cartes-mentales.js — Cartes mentales (lot 3 « Diaspo'Actif Formation », 2026-10-18)

   Une carte mentale est un ARBRE de noeuds (texte court, note, couleur, lien vers un chapitre/une leçon/une adresse). Deux usages, une seule table :
   - carte de FORMATION (formation_id renseigné) : créée par le formateur (carte vierge ou GÉNÉRÉE depuis le plan de la formation : modules, chapitres,
     leçons, chacun relié à son contenu), consultable par les apprenants inscrits ;
   - carte PERSONNELLE (formation_id NULL) : pour résumer un cours ou préparer un projet ; visible de son seul auteur.
   L'arbre est validé et nettoyé ICI (limites de profondeur / nombre de noeuds / longueur, couleurs et liens contrôlés, aucun HTML) : la page l'affiche
   avec textContent uniquement.
   ═════════════════════════════════════════════════ */
"use strict";
const crypto = require("crypto");

const MAX_CARTES_PAR_COMPTE = 60;
const MAX_NOEUDS = 250;
const MAX_PROFONDEUR = 7;
const MAX_TEXTE = 120;
const MAX_NOTE = 1500;
const COULEUR_RE = /^#[0-9a-fA-F]{6}$/;

const nouvelId = () => crypto.randomBytes(5).toString("hex");
const propre = (v, max) => String(v == null ? "" : v).replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);

/* Nettoie un lien de noeud : { type:'chapitre'|'lecon', id } ou { type:'url', url } (http/https uniquement). */
function lienValide(l) {
  if (!l || typeof l !== "object") return null;
  if (l.type === "url") {
    const u = String(l.url || "").trim().slice(0, 500);
    return /^https?:\/\/[^\s<>"']+$/i.test(u) ? { type: "url", url: u } : null;
  }
  if ((l.type === "chapitre" || l.type === "lecon") && Number.isInteger(Number(l.id)) && Number(l.id) > 0) return { type: l.type, id: Number(l.id) };
  return null;
}

/* Valide et normalise un arbre ; lève une Error avec un message lisible si la structure est inutilisable. */
function nettoyerArbre(data) {
  const racine = data && typeof data === "object" ? data.racine : null;
  if (!racine || typeof racine !== "object") throw new Error("La carte doit avoir un noeud central.");
  let total = 0;
  const vus = new Set();
  function noeud(n, profondeur) {
    if (!n || typeof n !== "object") return null;
    if (++total > MAX_NOEUDS) throw new Error(`Une carte ne peut pas dépasser ${MAX_NOEUDS} noeuds.`);
    if (profondeur > MAX_PROFONDEUR) throw new Error(`Une carte ne peut pas dépasser ${MAX_PROFONDEUR} niveaux.`);
    let id = /^[a-z0-9]{4,24}$/i.test(String(n.id || "")) ? String(n.id) : nouvelId();
    while (vus.has(id)) id = nouvelId();
    vus.add(id);
    const out = { id, texte: propre(n.texte, MAX_TEXTE) || "Idée" };
    const note = propre(n.note, MAX_NOTE);
    if (note) out.note = note;
    if (COULEUR_RE.test(String(n.couleur || ""))) out.couleur = String(n.couleur).toLowerCase();
    const lien = lienValide(n.lien);
    if (lien) out.lien = lien;
    if (n.replie === true) out.replie = true;
    out.enfants = (Array.isArray(n.enfants) ? n.enfants : []).map(e => noeud(e, profondeur + 1)).filter(Boolean);
    return out;
  }
  const arbre = { v: 1, racine: noeud(racine, 1) };
  return { arbre, nb_noeuds: total };
}

/* Carte générée depuis le plan d'une formation : formation → modules → chapitres → leçons, chaque noeud relié à son contenu. */
async function arbreDepuisFormation(db, f) {
  const palette = ["#2563eb", "#16a34a", "#d97706", "#9333ea", "#dc2626", "#0891b2", "#be185d"];
  const racine = { id: nouvelId(), texte: propre(f.titre, MAX_TEXTE) || "Formation", enfants: [] };
  const modules = await db.prepare("SELECT id, titre FROM formation_modules WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(f.id);
  let total = 1, k = 0;
  for (const m of modules) {
    const couleur = palette[k++ % palette.length];
    const nm = { id: nouvelId(), texte: propre(m.titre, MAX_TEXTE), couleur, enfants: [] };
    for (const c of await db.prepare("SELECT id, titre FROM formation_chapitres WHERE module_id=? ORDER BY ordre ASC, id ASC").all(m.id)) {
      if (total >= MAX_NOEUDS - 1) break;
      const nc = { id: nouvelId(), texte: propre(c.titre, MAX_TEXTE), couleur, lien: { type: "chapitre", id: Number(c.id) }, enfants: [] };
      total++;
      for (const l of await db.prepare("SELECT id, titre FROM formation_lecons WHERE chapitre_id=? ORDER BY ordre ASC, id ASC").all(c.id)) {
        if (total >= MAX_NOEUDS - 1) break;
        nc.enfants.push({ id: nouvelId(), texte: propre(l.titre, MAX_TEXTE), couleur, lien: { type: "lecon", id: Number(l.id) }, enfants: [] });
        total++;
      }
      nm.enfants.push(nc);
    }
    racine.enfants.push(nm); total++;
  }
  return { v: 1, racine };
}

const arbreVide = titre => ({ v: 1, racine: { id: nouvelId(), texte: propre(titre, MAX_TEXTE) || "Mon idée centrale", enfants: [] } });

/* Droits d'un compte sur une carte : lecture (propriétaire, administrateur, formateur de la formation, apprenant inscrit) / édition (propriétaire, administrateur). */
async function droits(db, carte, user) {
  if (!user) return { lecture: false, edition: false };
  if (Number(carte.owner_user_id) === Number(user.id) || user.role === "administrateur") return { lecture: true, edition: true };
  if (carte.formation_id != null) {
    const f = await db.prepare("SELECT owner_user_id FROM formations WHERE id=?").get(carte.formation_id);
    if (f && Number(f.owner_user_id) === Number(user.id)) return { lecture: true, edition: false };
    const insc = await db.prepare("SELECT id FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").get(carte.formation_id, user.id);
    if (insc) return { lecture: true, edition: false };
  }
  return { lecture: false, edition: false };
}

/* Cartes d'une formation (titres seulement) : affichées aux apprenants inscrits dans l'espace de suivi. */
async function cartesDeFormation(db, formationId) {
  return (await db.prepare("SELECT id, titre, updated_at FROM cartes_mentales WHERE formation_id=? ORDER BY id ASC").all(formationId)).map(c => ({ id: Number(c.id), titre: c.titre }));
}

module.exports = { nettoyerArbre, arbreDepuisFormation, arbreVide, droits, cartesDeFormation, MAX_NOEUDS, MAX_PROFONDEUR };

module.exports.register = function register({ route, db, sendJSON, getCurrentUser, SEC, checkFormationOwner }) {
  const dto = c => ({ id: Number(c.id), titre: c.titre, formation_id: c.formation_id != null ? Number(c.formation_id) : null, nb_noeuds: Number(c.nb_noeuds) || 0, updated_at: c.updated_at, created_at: c.created_at });

  /* GET /api/cartes-mentales — mes cartes (personnelles + celles de mes formations). */
  route("GET", "/api/cartes-mentales", async (req, res, params, body, query) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const rows = await db.prepare(`SELECT c.*, f.titre AS formation_titre FROM cartes_mentales c LEFT JOIN formations f ON f.id=c.formation_id
      WHERE c.owner_user_id=? ORDER BY c.updated_at DESC, c.id DESC`).all(user.id);
    const fid = query && query.formation_id ? Number(query.formation_id) : null;
    sendJSON(res, 200, { cartes: rows.filter(c => !fid || Number(c.formation_id) === fid).map(c => ({ ...dto(c), formation_titre: c.formation_titre || null })) });
  });

  /* POST /api/cartes-mentales { titre, formation_id?, modele?: 'vide' | 'plan' } */
  route("POST", "/api/cartes-mentales", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const limite = SEC.rateLimit(`carte-creer:${user.id}`, 30, 3600000);
    if (!limite.allowed) return sendJSON(res, 429, { error: `Trop de créations. Réessayez dans ${limite.retryAfter}s.` });
    const n = (await db.prepare("SELECT COUNT(*) AS n FROM cartes_mentales WHERE owner_user_id=?").get(user.id))?.n || 0;
    if (Number(n) >= MAX_CARTES_PAR_COMPTE) return sendJSON(res, 400, { error: `Vous avez atteint la limite de ${MAX_CARTES_PAR_COMPTE} cartes : supprimez-en une pour en créer une nouvelle.` });
    let f = null;
    if (body && body.formation_id != null && body.formation_id !== "") {
      f = await db.prepare("SELECT * FROM formations WHERE id=?").get(body.formation_id);
      if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
      if (!checkFormationOwner(f, user)) return sendJSON(res, 403, { error: "Seul le formateur peut créer une carte pour sa formation." });
    }
    const titre = propre(body && body.titre, 120) || (f ? `Carte mentale — ${f.titre}`.slice(0, 120) : "Ma carte mentale");
    const arbre = f && body && body.modele === "plan" ? await arbreDepuisFormation(db, f) : arbreVide(f ? f.titre : titre);
    const { arbre: propreArbre, nb_noeuds } = nettoyerArbre(arbre);
    const id = (await db.prepare("INSERT INTO cartes_mentales (owner_user_id, formation_id, titre, data_json, nb_noeuds) VALUES (?,?,?,?,?)")
      .run(user.id, f ? f.id : null, titre, JSON.stringify(propreArbre), nb_noeuds)).lastInsertRowid;
    sendJSON(res, 201, { id: Number(id) });
  });

  /* GET /api/cartes-mentales/:id — la carte complète, si le compte y a droit. */
  route("GET", "/api/cartes-mentales/:id", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const c = await db.prepare("SELECT * FROM cartes_mentales WHERE id=?").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Carte introuvable." });
    const d = await droits(db, c, user);
    if (!d.lecture) return sendJSON(res, 404, { error: "Carte introuvable." });
    let data; try { data = JSON.parse(c.data_json); } catch (_) { data = arbreVide(c.titre); }
    const f = c.formation_id != null ? await db.prepare("SELECT id, titre FROM formations WHERE id=?").get(c.formation_id) : null;
    /* Pour relier un noeud à un chapitre / une leçon : le plan de la formation, réservé à celui qui peut modifier la carte. */
    let plan = null;
    if (f && d.edition) {
      plan = [];
      for (const m of await db.prepare("SELECT id, titre FROM formation_modules WHERE formation_id=? ORDER BY ordre ASC, id ASC").all(f.id))
        for (const ch of await db.prepare("SELECT id, titre FROM formation_chapitres WHERE module_id=? ORDER BY ordre ASC, id ASC").all(m.id)) {
          plan.push({ type: "chapitre", id: Number(ch.id), titre: ch.titre });
          for (const l of await db.prepare("SELECT id, titre FROM formation_lecons WHERE chapitre_id=? ORDER BY ordre ASC, id ASC").all(ch.id)) plan.push({ type: "lecon", id: Number(l.id), titre: l.titre });
        }
    }
    sendJSON(res, 200, { carte: { ...dto(c), data }, edition: d.edition, formation: f ? { id: Number(f.id), titre: f.titre } : null, plan });
  });

  /* PUT /api/cartes-mentales/:id { titre?, data } — enregistrement (automatique côté page) ; arbre validé et nettoyé. */
  route("PUT", "/api/cartes-mentales/:id", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const limite = SEC.rateLimit(`carte-maj:${user.id}`, 600, 3600000);
    if (!limite.allowed) return sendJSON(res, 429, { error: `Trop d'enregistrements. Réessayez dans ${limite.retryAfter}s.` });
    const c = await db.prepare("SELECT * FROM cartes_mentales WHERE id=?").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Carte introuvable." });
    if (!(await droits(db, c, user)).edition) return sendJSON(res, 403, { error: "Interdit." });
    let nettoye;
    try { nettoye = nettoyerArbre(body && body.data); } catch (e) { return sendJSON(res, 400, { error: e.message }); }
    const titre = body && body.titre != null ? (propre(body.titre, 120) || c.titre) : c.titre;
    await db.prepare("UPDATE cartes_mentales SET titre=?, data_json=?, nb_noeuds=?, updated_at=datetime('now') WHERE id=?").run(titre, JSON.stringify(nettoye.arbre), nettoye.nb_noeuds, c.id);
    sendJSON(res, 200, { ok: true, nb_noeuds: nettoye.nb_noeuds, data: nettoye.arbre });
  });

  /* POST /api/cartes-mentales/:id/copier — une copie personnelle (modifiable) d'une carte que le compte peut lire (carte d'un module, d'une formation…). */
  route("POST", "/api/cartes-mentales/:id/copier", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const limite = SEC.rateLimit(`carte-creer:${user.id}`, 30, 3600000);
    if (!limite.allowed) return sendJSON(res, 429, { error: `Trop de créations. Réessayez dans ${limite.retryAfter}s.` });
    const c = await db.prepare("SELECT * FROM cartes_mentales WHERE id=?").get(params.id);
    if (!c || !(await droits(db, c, user)).lecture) return sendJSON(res, 404, { error: "Carte introuvable." });
    const n = (await db.prepare("SELECT COUNT(*) AS n FROM cartes_mentales WHERE owner_user_id=?").get(user.id))?.n || 0;
    if (Number(n) >= MAX_CARTES_PAR_COMPTE) return sendJSON(res, 400, { error: `Vous avez atteint la limite de ${MAX_CARTES_PAR_COMPTE} cartes : supprimez-en une pour en créer une nouvelle.` });
    let data; try { data = JSON.parse(c.data_json); } catch (_) { return sendJSON(res, 400, { error: "Carte illisible." }); }
    const { arbre, nb_noeuds } = nettoyerArbre(data);
    const titre = propre(`${c.titre} (ma copie)`, 120);
    const id = (await db.prepare("INSERT INTO cartes_mentales (owner_user_id, formation_id, titre, data_json, nb_noeuds) VALUES (?,?,?,?,?)").run(user.id, null, titre, JSON.stringify(arbre), nb_noeuds)).lastInsertRowid;
    sendJSON(res, 201, { id: Number(id) });
  });

  route("DELETE", "/api/cartes-mentales/:id", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const c = await db.prepare("SELECT * FROM cartes_mentales WHERE id=?").get(params.id);
    if (!c) return sendJSON(res, 404, { error: "Carte introuvable." });
    if (!(await droits(db, c, user)).edition) return sendJSON(res, 403, { error: "Interdit." });
    await db.prepare("DELETE FROM cartes_mentales WHERE id=?").run(c.id);
    sendJSON(res, 200, { ok: true });
  });
};

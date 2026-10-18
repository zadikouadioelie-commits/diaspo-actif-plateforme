/* ═════════════════════════════════════════════════
   server/parcours-formation.js — Prérequis et parcours de formation (lot 3 « Diaspo'Actif Formation », 2026-10-18)

   - PRÉREQUIS : une formation peut exiger d'avoir terminé d'autres formations (formation_prerequis). L'inscription est refusée tant qu'ils ne sont pas
     terminés (contrôle serveur dans POST /api/formations/:id/inscrire) ; les cycles (A exige B qui exige A) sont refusés à l'enregistrement.
   - PARCOURS : une suite ordonnée de formations publiées qui mènent à un objectif (entreprendre, gérer une initiative, comprendre les démarches…) —
     formation_parcours + formation_parcours_etapes. L'apprenant voit pour chaque étape : terminée, en cours, disponible ou verrouillée (prérequis manquants),
     et la prochaine étape à suivre.
   « Terminée » = inscription active et payée dont l'avancement est de 100 %.
   ═════════════════════════════════════════════════ */
"use strict";

const MAX_ETAPES = 12;
const MAX_PREREQUIS = 10;
const propre = (v, max) => String(v == null ? "" : v).replace(/<[^>]*>/g, " ").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[ \t]+/g, " ").trim().slice(0, max);
const entiersUniques = a => [...new Set((Array.isArray(a) ? a : []).map(Number).filter(n => Number.isInteger(n) && n > 0))];

/* État d'un apprenant face à une formation. */
async function etatApprenant(db, formationId, userId) {
  if (!userId) return { statut: "non_inscrit", avancement_pct: 0 };
  const i = await db.prepare("SELECT avancement_pct FROM formation_inscriptions WHERE formation_id=? AND user_id=? AND statut='active' AND COALESCE(paiement_statut,'paye')='paye'").get(formationId, userId);
  if (!i) return { statut: "non_inscrit", avancement_pct: 0 };
  const pct = Number(i.avancement_pct) || 0;
  return { statut: pct >= 100 ? "termine" : "en_cours", avancement_pct: pct };
}

async function prerequisDe(db, formationId) {
  return (await db.prepare(`SELECT f.id, f.titre FROM formation_prerequis p JOIN formations f ON f.id=p.prerequis_formation_id WHERE p.formation_id=? ORDER BY p.id ASC`).all(formationId))
    .map(f => ({ id: Number(f.id), titre: f.titre }));
}

/* Prérequis NON terminés par ce compte (userId nul : tous). */
async function prerequisManquants(db, formationId, userId) {
  const manquants = [];
  for (const p of await prerequisDe(db, formationId)) if ((await etatApprenant(db, p.id, userId)).statut !== "termine") manquants.push(p);
  return manquants;
}

/* Ajouter « formation exige prerequis » créerait-il une boucle ? (on remonte les prérequis du prérequis). */
async function creerUnCycle(db, formationId, prerequisId) {
  const vus = new Set(), pile = [Number(prerequisId)];
  while (pile.length) {
    const x = pile.pop();
    if (x === Number(formationId)) return true;
    if (vus.has(x)) continue;
    vus.add(x);
    for (const r of await db.prepare("SELECT prerequis_formation_id AS p FROM formation_prerequis WHERE formation_id=?").all(x)) pile.push(Number(r.p));
  }
  return false;
}

const PEUT_CREER = new Set(["administrateur", "partenaire", "initiative"]);
const resume = f => ({ id: Number(f.id), titre: f.titre, image_url: f.image_url || null, niveau: f.niveau || null, duree: f.duree || null, gratuit: Number(f.gratuit) === 1 || f.mode_acces === "gratuit", prix: Number(f.prix) || 0, devise: f.devise || "EUR", statut: f.statut });

module.exports = { etatApprenant, prerequisDe, prerequisManquants, creerUnCycle };

module.exports.register = function register({ route, db, sendJSON, getCurrentUser, checkFormationOwner }) {

  /* GET /api/formations/:id/prerequis — public ; avec un compte connecté, indique en plus ce qui lui manque. */
  route("GET", "/api/formations/:id/prerequis", async (req, res, params) => {
    const f = await db.prepare("SELECT id FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    const user = await getCurrentUser(req);
    const prerequis = await prerequisDe(db, params.id);
    const manquants = user ? await prerequisManquants(db, params.id, user.id) : prerequis;
    sendJSON(res, 200, { prerequis, manquants });
  });

  /* PUT /api/formations/:id/prerequis { ids: [formationId, …] } — remplace la liste (formateur ou administrateur). */
  route("PUT", "/api/formations/:id/prerequis", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(params.id);
    if (!f) return sendJSON(res, 404, { error: "Formation introuvable." });
    if (!checkFormationOwner(f, user)) return sendJSON(res, 403, { error: "Interdit." });
    const ids = entiersUniques(body && body.ids);
    if (ids.length > MAX_PREREQUIS) return sendJSON(res, 400, { error: `Au plus ${MAX_PREREQUIS} prérequis.` });
    if (ids.includes(Number(f.id))) return sendJSON(res, 400, { error: "Une formation ne peut pas être son propre prérequis." });
    for (const id of ids) if (!(await db.prepare("SELECT id FROM formations WHERE id=?").get(id))) return sendJSON(res, 404, { error: `Formation ${id} introuvable.` });
    /* Cycles : on retient la nouvelle liste, puis on vérifie chaque prérequis contre l'état actuel (sans les anciens prérequis de CETTE formation). */
    await db.prepare("DELETE FROM formation_prerequis WHERE formation_id=?").run(f.id);
    for (const id of ids) {
      if (await creerUnCycle(db, f.id, id)) {
        await db.prepare("DELETE FROM formation_prerequis WHERE formation_id=?").run(f.id);
        return sendJSON(res, 400, { error: "Ce prérequis créerait une boucle (une formation exigerait, directement ou non, celle qui l'exige)." });
      }
      await db.prepare("INSERT INTO formation_prerequis (formation_id, prerequis_formation_id) VALUES (?,?)").run(f.id, id);
    }
    sendJSON(res, 200, { ok: true, prerequis: await prerequisDe(db, f.id) });
  });

  /* ── Parcours ── */
  async function detailParcours(p, user) {
    const etapes = await db.prepare(`SELECT e.ordre, f.* FROM formation_parcours_etapes e JOIN formations f ON f.id=e.formation_id WHERE e.parcours_id=? ORDER BY e.ordre ASC, e.id ASC`).all(p.id);
    const sorties = [];
    let nbTermine = 0, prochaine = null;
    for (const f of etapes) {
      const etat = await etatApprenant(db, f.id, user ? user.id : null);
      const manquants = etat.statut === "non_inscrit" ? await prerequisManquants(db, f.id, user ? user.id : null) : [];
      const indisponible = f.statut !== "publiee";
      let statut = etat.statut === "termine" ? "termine" : etat.statut === "en_cours" ? "en_cours" : (manquants.length ? "verrouille" : "disponible");
      if (statut === "termine") nbTermine++;
      const e = { ordre: Number(f.ordre), formation: resume(f), statut, avancement_pct: etat.avancement_pct, prerequis_manquants: manquants, indisponible };
      if (!prochaine && !indisponible && (statut === "en_cours" || statut === "disponible")) prochaine = Number(f.id);
      sorties.push(e);
    }
    return { etapes: sorties, nb_etapes: sorties.length, nb_termine: nbTermine, termine: sorties.length > 0 && nbTermine === sorties.length, prochaine_formation_id: prochaine };
  }
  const dtoParcours = p => ({ id: Number(p.id), titre: p.titre, description: p.description || "", objectif: p.objectif || "", statut: p.statut, owner_user_id: Number(p.owner_user_id), updated_at: p.updated_at });

  /* GET /api/parcours-formation — parcours publiés (+ les miens, brouillons compris), avec ma progression si connecté. */
  route("GET", "/api/parcours-formation", async (req, res) => {
    const user = await getCurrentUser(req);
    const rows = await db.prepare("SELECT * FROM formation_parcours WHERE statut='publie' OR owner_user_id=? ORDER BY updated_at DESC, id DESC").all(user ? user.id : 0);
    const parcours = [];
    for (const p of rows) {
      const d = await detailParcours(p, user);
      parcours.push({ ...dtoParcours(p), nb_etapes: d.nb_etapes, nb_termine: d.nb_termine, termine: d.termine, mien: !!user && Number(p.owner_user_id) === Number(user.id), titres: d.etapes.map(e => e.formation.titre) });
    }
    sendJSON(res, 200, { parcours });
  });

  route("GET", "/api/parcours-formation/:id", async (req, res, params) => {
    const user = await getCurrentUser(req);
    const p = await db.prepare("SELECT * FROM formation_parcours WHERE id=?").get(params.id);
    if (!p) return sendJSON(res, 404, { error: "Parcours introuvable." });
    const proprio = !!user && (Number(p.owner_user_id) === Number(user.id) || user.role === "administrateur");
    if (p.statut !== "publie" && !proprio) return sendJSON(res, 404, { error: "Parcours introuvable." });
    sendJSON(res, 200, { parcours: dtoParcours(p), modifiable: proprio, ...(await detailParcours(p, user)) });
  });

  /* Valide titre / étapes ; retourne { erreur } ou { titre, description, objectif, ids }. */
  async function lireParcours(body, user, publie) {
    const titre = propre(body && body.titre, 140);
    if (!titre) return { erreur: "Donnez un titre au parcours." };
    const ids = entiersUniques(body && body.formation_ids);
    if (ids.length < 2) return { erreur: "Un parcours réunit au moins deux formations." };
    if (ids.length > MAX_ETAPES) return { erreur: `Un parcours compte ${MAX_ETAPES} formations au plus.` };
    for (const id of ids) {
      const f = await db.prepare("SELECT id, statut, owner_user_id FROM formations WHERE id=?").get(id);
      if (!f) return { erreur: `Formation ${id} introuvable.` };
      if (publie && f.statut !== "publiee") return { erreur: "Pour publier le parcours, toutes ses formations doivent être publiées." };
      if (!publie && f.statut !== "publiee" && Number(f.owner_user_id) !== Number(user.id) && user.role !== "administrateur") return { erreur: "Vous ne pouvez ajouter que des formations publiées ou les vôtres." };
    }
    return { titre, description: propre(body && body.description, 1500), objectif: propre(body && body.objectif, 300), ids };
  }
  async function ecrireEtapes(parcoursId, ids) {
    await db.prepare("DELETE FROM formation_parcours_etapes WHERE parcours_id=?").run(parcoursId);
    for (const [i, id] of ids.entries()) await db.prepare("INSERT INTO formation_parcours_etapes (parcours_id, formation_id, ordre) VALUES (?,?,?)").run(parcoursId, id, i);
  }

  route("POST", "/api/parcours-formation", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (!PEUT_CREER.has(user.role)) return sendJSON(res, 403, { error: "La création de parcours est réservée aux comptes qui peuvent créer des formations." });
    const n = (await db.prepare("SELECT COUNT(*) AS n FROM formation_parcours WHERE owner_user_id=?").get(user.id))?.n || 0;
    if (Number(n) >= 30) return sendJSON(res, 400, { error: "Limite de 30 parcours atteinte." });
    const l = await lireParcours(body, user, false);
    if (l.erreur) return sendJSON(res, 400, { error: l.erreur });
    const id = (await db.prepare("INSERT INTO formation_parcours (owner_user_id, titre, description, objectif, statut) VALUES (?,?,?,?,'brouillon')").run(user.id, l.titre, l.description || null, l.objectif || null)).lastInsertRowid;
    await ecrireEtapes(id, l.ids);
    sendJSON(res, 201, { id: Number(id) });
  });

  route("PUT", "/api/parcours-formation/:id", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const p = await db.prepare("SELECT * FROM formation_parcours WHERE id=?").get(params.id);
    if (!p) return sendJSON(res, 404, { error: "Parcours introuvable." });
    if (Number(p.owner_user_id) !== Number(user.id) && user.role !== "administrateur") return sendJSON(res, 403, { error: "Interdit." });
    const statut = body && body.statut === "publie" ? "publie" : "brouillon";
    const l = await lireParcours(body, user, statut === "publie");
    if (l.erreur) return sendJSON(res, 400, { error: l.erreur });
    await db.prepare("UPDATE formation_parcours SET titre=?, description=?, objectif=?, statut=?, updated_at=datetime('now') WHERE id=?").run(l.titre, l.description || null, l.objectif || null, statut, p.id);
    await ecrireEtapes(p.id, l.ids);
    sendJSON(res, 200, { ok: true, statut });
  });

  route("DELETE", "/api/parcours-formation/:id", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const p = await db.prepare("SELECT * FROM formation_parcours WHERE id=?").get(params.id);
    if (!p) return sendJSON(res, 404, { error: "Parcours introuvable." });
    if (Number(p.owner_user_id) !== Number(user.id) && user.role !== "administrateur") return sendJSON(res, 403, { error: "Interdit." });
    await db.prepare("DELETE FROM formation_parcours_etapes WHERE parcours_id=?").run(p.id);
    await db.prepare("DELETE FROM formation_parcours WHERE id=?").run(p.id);
    sendJSON(res, 200, { ok: true });
  });
};

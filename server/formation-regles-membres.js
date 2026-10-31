/* ═════════════════════════════════════════════════
   server/formation-regles-membres.js — Formation Diaspora : tarifs réservés aux membres d'une initiative (2026-10-31)

   Une RÈGLE = « les personnes affiliées à l'initiative X ont −N % (ou la gratuité) sur cette formation / sur toutes mes formations ».
   - formation_regles_membres : une règle par (formateur, formation ou « toutes » = 0, initiative). Mode « pourcentage » ou « gratuit ».
   - Affilié = initiative_membres.statut 'accepte' et affiliation non échue. Contrôlé ICI, côté serveur, au moment de l'achat.
   - Application AUTOMATIQUE (aucun code à saisir). Pas de cumul : la meilleure offre entre promotion, code et tarif membre s'applique.
   - Une règle propre à une formation l'emporte sur la règle « toutes mes formations » pour la même initiative.
   - Suivi : chaque commande garde coupon_source='membre' et coupon_id=règle → personnes, remises, encaissé, accès gratuits, par mois.
   ═════════════════════════════════════════════════ */
"use strict";
const Finances = require("./formation-finances");

const REGLES_MAX = 20; /* règles par formation (ou par « toutes mes formations ») */
const aujourdhui = () => new Date().toISOString().slice(0, 10);

/* L'initiative officielle Diaspo'Actif (même résolution que getInitiativeOfficielleId() de server/index.js). */
async function initiativeOfficielleId(db) {
  const env = parseInt(process.env.DA_INITIATIVE_OFFICIELLE_ID, 10);
  if (!isNaN(env)) return env;
  try {
    const p = await db.prepare("SELECT valeur FROM parametres_plateforme WHERE cle='da_initiative_officielle_id'").get();
    const id = parseInt(p && p.valeur, 10);
    if (!isNaN(id)) return id;
    const m = await db.prepare("SELECT valeur FROM parametres_plateforme WHERE cle='da_email_officiel'").get();
    const email = String((m && m.valeur) || "diaspo.actif@gmail.com").toLowerCase();
    const i = await db.prepare("SELECT i.id FROM initiatives i JOIN users u ON u.id=i.owner_user_id WHERE LOWER(u.email)=? LIMIT 1").get(email);
    return i ? Number(i.id) : null;
  } catch (_) { return null; }
}

/* Affiliation « acceptée » et encore valable. */
async function affilie(db, userId, initiativeId) {
  if (!userId || !initiativeId) return false;
  const m = await db.prepare("SELECT date_debut, date_fin FROM initiative_membres WHERE initiative_id=? AND user_id=? AND statut='accepte'").get(Number(initiativeId), Number(userId));
  if (!m) return false;
  const jour = aujourdhui();
  if (m.date_debut && String(m.date_debut).slice(0, 10) > jour) return false;
  if (m.date_fin && String(m.date_fin).slice(0, 10) < jour) return false;
  return true;
}

const libelle = r => r.mode === "gratuit" ? `Gratuit pour les membres de ${r.initiative_nom}` : `−${Number(r.reduction_pct)} % pour les membres de ${r.initiative_nom}`;

/* Règles qui s'appliquent à une formation : celles de la formation, puis les « toutes mes formations » pour les initiatives non déjà couvertes. */
async function reglesApplicables(db, f) {
  const rows = await db.prepare(`SELECT r.*, i.nom AS initiative_nom FROM formation_regles_membres r JOIN initiatives i ON i.id=r.initiative_id
    WHERE r.actif=1 AND r.owner_user_id=? AND r.formation_cle IN (0, ?) ORDER BY r.formation_cle DESC, r.id ASC`).all(Number(f.owner_user_id), Number(f.id));
  const vues = new Set(), out = [];
  for (const r of rows) { if (vues.has(Number(r.initiative_id))) continue; vues.add(Number(r.initiative_id)); out.push(r); }
  return out;
}

function prixAvecRegle(r, prixDepart) {
  let prix = r.mode === "gratuit" ? 0 : Finances.arrondi(Math.max(0, Number(prixDepart) * (1 - Number(r.reduction_pct) / 100)));
  if (prix > 0 && prix < Finances.PAIEMENT_MINIMUM) prix = Finances.PAIEMENT_MINIMUM; /* Stripe refuse moins de 0,50 € */
  return prix;
}

/* La meilleure offre membre pour cet acheteur, ou null. prixDepart = prix avant toute promotion ; prixActuel = prix qu'il paierait sans tarif membre. */
async function offreMembre(db, f, userId, prixDepart, prixActuel) {
  if (!userId || !(Number(prixActuel) > 0)) return null;
  let meilleure = null;
  for (const r of await reglesApplicables(db, f)) {
    if (!(await affilie(db, userId, r.initiative_id))) continue;
    const prix = prixAvecRegle(r, prixDepart);
    if (!(prix < Number(prixActuel))) continue;
    if (!meilleure || prix < meilleure.prix_final) meilleure = { regle: r, prix_final: prix, remise: Finances.arrondi(Number(prixActuel) - prix), gratuit: prix === 0, libelle: libelle(r) };
  }
  return meilleure;
}
/* Ce que la commande enregistre dans coupon_code / coupon_source / coupon_id. */
const traceCommande = o => ({ source: "membre", id: Number(o.regle.id), code: `Membres ${o.regle.initiative_nom}` });

/* Mentions publiques « −10 % pour les membres de Segom » d'une liste de formations (une requête groupée). Renvoie Map(formationId → [{ initiative_id, initiative_nom, mode, pct, texte }]). */
async function mentionsPourFormations(db, formations) {
  const out = new Map();
  const payantes = (formations || []).filter(f => f && f.owner_user_id && (f.mode_acces || "gratuit") !== "gratuit");
  if (!payantes.length) return out;
  const owners = [...new Set(payantes.map(f => Number(f.owner_user_id)))];
  const rows = await db.prepare(`SELECT r.*, i.nom AS initiative_nom FROM formation_regles_membres r JOIN initiatives i ON i.id=r.initiative_id
    WHERE r.actif=1 AND r.owner_user_id IN (${owners.map(() => "?").join(",")}) ORDER BY r.formation_cle DESC, r.id ASC`).all(...owners);
  for (const f of payantes) {
    const vues = new Set(), liste = [];
    for (const r of rows) {
      if (Number(r.owner_user_id) !== Number(f.owner_user_id) || ![0, Number(f.id)].includes(Number(r.formation_cle)) || vues.has(Number(r.initiative_id))) continue;
      vues.add(Number(r.initiative_id));
      liste.push({ initiative_id: Number(r.initiative_id), initiative_nom: r.initiative_nom, mode: r.mode, pct: r.mode === "gratuit" ? 100 : Number(r.reduction_pct), texte: libelle(r) });
    }
    if (liste.length) out.set(Number(f.id), liste);
  }
  return out;
}

/* Suivi d'une règle : personnes (comptées une fois), réductions accordées, encaissé, accès gratuits, dernière utilisation, par mois. */
async function statsRegles(db, ids) {
  const stats = new Map();
  for (const id of ids) stats.set(Number(id), { personnes: 0, commandes: 0, remises: 0, encaisse: 0, gratuits: 0, derniere: null, par_mois: [] });
  if (!ids.length) return stats;
  const marques = ids.map(() => "?").join(",");
  for (const l of await db.prepare(`SELECT coupon_id, COUNT(DISTINCT user_id) AS personnes, COUNT(*) AS commandes, COALESCE(SUM(remise),0) AS remises, COALESCE(SUM(montant),0) AS encaisse,
      COALESCE(SUM(CASE WHEN montant<=0 THEN 1 ELSE 0 END),0) AS gratuits, MAX(paye_le) AS derniere
    FROM formation_commandes WHERE coupon_source='membre' AND coupon_id IN (${marques}) AND statut='payee' GROUP BY coupon_id`).all(...ids)) {
    Object.assign(stats.get(Number(l.coupon_id)), { personnes: Number(l.personnes), commandes: Number(l.commandes), remises: Finances.arrondi(l.remises), encaisse: Finances.arrondi(l.encaisse), gratuits: Number(l.gratuits), derniere: l.derniere || null });
  }
  for (const l of await db.prepare(`SELECT coupon_id, SUBSTR(paye_le,1,7) AS mois, COUNT(DISTINCT user_id) AS personnes, COALESCE(SUM(remise),0) AS remises, COALESCE(SUM(montant),0) AS encaisse
    FROM formation_commandes WHERE coupon_source='membre' AND coupon_id IN (${marques}) AND statut='payee' GROUP BY coupon_id, SUBSTR(paye_le,1,7) ORDER BY mois DESC`).all(...ids)) {
    stats.get(Number(l.coupon_id)).par_mois.push({ mois: l.mois, personnes: Number(l.personnes), remises: Finances.arrondi(l.remises), encaisse: Finances.arrondi(l.encaisse) });
  }
  return stats;
}

module.exports = { REGLES_MAX, initiativeOfficielleId, affilie, libelle, reglesApplicables, prixAvecRegle, offreMembre, traceCommande, mentionsPourFormations, statsRegles };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, exigerPremium } = deps;
  const M = module.exports;
  const estAdmin = u => u && u.role === "administrateur";

  async function formateur(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    if (!(await exigerPremium(user, res, "formations"))) return null;
    return user;
  }
  async function proprietaire(req, res, formationId) {
    const user = await formateur(req, res); if (!user) return null;
    const f = await db.prepare("SELECT id, owner_user_id, titre FROM formations WHERE id=?").get(Number(formationId));
    if (!f) { sendJSON(res, 404, { error: "Formation introuvable." }); return null; }
    if (Number(f.owner_user_id) !== Number(user.id) && !estAdmin(user)) { sendJSON(res, 403, { error: "Interdit." }); return null; }
    return { user, f };
  }
  const invisible = u => !!(u && (u.invisible_annuaire_definitif || (u.invisible_annuaire_jusqu_au && new Date(u.invisible_annuaire_jusqu_au) > new Date())));

  /* ── Recherche d'initiatives (aide à la saisie) : seulement celles que l'annuaire montre au public ── */
  route("GET", "/api/formateur/initiatives-recherche", async (req, res, params, body, query) => {
    const user = await formateur(req, res); if (!user) return;
    const mesFormations = await db.prepare("SELECT COUNT(*) AS n FROM formations WHERE owner_user_id=?").get(Number(user.id));
    if (!Number(mesFormations && mesFormations.n) && !estAdmin(user)) return sendJSON(res, 403, { error: "Réservé aux formateurs." });
    const lim = SEC.rateLimit(`formation-init-recherche:${user.id}`, 120, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de recherches. Réessayez dans ${lim.retryAfter}s.` });
    const q = String((query && query.q) || "").trim().toLowerCase().slice(0, 60);
    if (q.length < 2) return sendJSON(res, 200, { initiatives: [] });
    const motif = `%${q.replace(/[\\%_]/g, m => "\\" + m)}%`;
    const rows = await db.prepare(`SELECT i.id, i.nom, i.sigle, i.ville, i.pays, i.logo_url, u.invisible_annuaire_definitif, u.invisible_annuaire_jusqu_au
      FROM initiatives i JOIN users u ON u.id=i.owner_user_id
      WHERE (LOWER(i.nom) LIKE ? ESCAPE '\\' OR LOWER(COALESCE(i.sigle,'')) LIKE ? ESCAPE '\\') ORDER BY i.nom ASC LIMIT 40`).all(motif, motif);
    const officielle = await M.initiativeOfficielleId(db);
    sendJSON(res, 200, { initiatives: rows.filter(r => !invisible(r)).slice(0, 8).map(r => ({ id: Number(r.id), nom: r.nom, sigle: r.sigle || null, ville: r.ville || null, pays: r.pays || null, logo_url: r.logo_url || null, officielle: Number(r.id) === officielle })) });
  });

  /* Lecture et écriture, communes à « cette formation » (formation_cle = id) et « toutes mes formations » (formation_cle = 0). */
  async function lister(ownerId, cle) {
    const rows = await db.prepare(`SELECT r.*, i.nom AS initiative_nom, i.logo_url AS initiative_logo FROM formation_regles_membres r JOIN initiatives i ON i.id=r.initiative_id
      WHERE r.owner_user_id=? AND r.formation_cle=? ORDER BY r.id DESC`).all(Number(ownerId), Number(cle));
    const stats = await M.statsRegles(db, rows.map(r => r.id));
    return rows.map(r => ({ id: Number(r.id), initiative_id: Number(r.initiative_id), initiative_nom: r.initiative_nom, initiative_logo: r.initiative_logo || null, mode: r.mode, reduction_pct: Number(r.reduction_pct) || 0,
      actif: !!Number(r.actif), formation_cle: Number(r.formation_cle), texte: M.libelle(r), stats: stats.get(Number(r.id)) }));
  }
  /* Le score de fiabilité compte les réductions créées pour les membres Diaspo'Actif : on invalide son cache pour que les points apparaissent aussitôt. */
  const rafraichirScore = async ownerId => { try { await db.prepare("DELETE FROM trust_cache WHERE user_id=?").run(Number(ownerId)); } catch (_) { /* cache absent */ } };
  async function creer(res, ownerId, cle, body) {
    const b = body || {};
    const mode = b.mode === "gratuit" ? "gratuit" : "pourcentage";
    let pct = 0;
    if (mode === "pourcentage") {
      pct = Number(b.reduction_pct);
      if (!(pct >= 1 && pct <= 99)) return sendJSON(res, 400, { error: "Le pourcentage doit être compris entre 1 et 99 % (pour 100 %, choisissez la gratuité)." });
    } else if (b.confirme !== true) {
      return sendJSON(res, 409, { code: "confirmation_requise", error: "Vous renoncez à vos revenus pour ces membres : confirmez pour activer la gratuité." });
    }
    let initiativeId;
    if (b.officielle === true) { initiativeId = await M.initiativeOfficielleId(db); if (!initiativeId) return sendJSON(res, 404, { error: "L'initiative officielle Diaspo'Actif est introuvable." }); }
    else {
      initiativeId = Number(b.initiative_id);
      if (!(initiativeId > 0)) return sendJSON(res, 400, { error: "Choisissez une initiative." });
    }
    const init = await db.prepare("SELECT i.id, i.nom, u.invisible_annuaire_definitif, u.invisible_annuaire_jusqu_au FROM initiatives i JOIN users u ON u.id=i.owner_user_id WHERE i.id=?").get(initiativeId);
    if (!init || (b.officielle !== true && invisible(init))) return sendJSON(res, 404, { error: "Initiative introuvable." });
    const existante = await db.prepare("SELECT id FROM formation_regles_membres WHERE owner_user_id=? AND formation_cle=? AND initiative_id=?").get(Number(ownerId), Number(cle), initiativeId);
    if (existante) {
      await db.prepare("UPDATE formation_regles_membres SET mode=?, reduction_pct=?, actif=1 WHERE id=?").run(mode, pct, existante.id);
      await rafraichirScore(ownerId);
      return sendJSON(res, 200, { id: Number(existante.id), mis_a_jour: true });
    }
    const n = await db.prepare("SELECT COUNT(*) AS n FROM formation_regles_membres WHERE owner_user_id=? AND formation_cle=?").get(Number(ownerId), Number(cle));
    if (Number(n && n.n) >= M.REGLES_MAX) return sendJSON(res, 400, { error: `Vous pouvez avoir ${M.REGLES_MAX} règles au plus ici. Supprimez-en une.` });
    try {
      const id = (await db.prepare("INSERT INTO formation_regles_membres (owner_user_id, formation_cle, initiative_id, mode, reduction_pct) VALUES (?,?,?,?,?)").run(Number(ownerId), Number(cle), initiativeId, mode, pct)).lastInsertRowid;
      await rafraichirScore(ownerId);
      sendJSON(res, 201, { id: Number(id) });
    } catch (e) {
      if (/unique|duplicate/i.test(String(e && e.message))) return sendJSON(res, 409, { error: "Cette règle existe déjà." });
      sendJSON(res, 500, SEC.safeError(e, "formation-regle-membres"));
    }
  }
  async function basculer(res, ownerId, cle, id, body) {
    const r = await db.prepare("UPDATE formation_regles_membres SET actif=? WHERE id=? AND owner_user_id=? AND formation_cle=?").run(body && body.actif ? 1 : 0, Number(id), Number(ownerId), Number(cle));
    if (!r || !Number(r.changes)) return sendJSON(res, 404, { error: "Règle introuvable." });
    sendJSON(res, 200, { ok: true, actif: !!(body && body.actif) });
  }
  async function supprimer(res, ownerId, cle, id) {
    await db.prepare("DELETE FROM formation_regles_membres WHERE id=? AND owner_user_id=? AND formation_cle=?").run(Number(id), Number(ownerId), Number(cle));
    await rafraichirScore(ownerId);
    sendJSON(res, 200, { ok: true });
  }

  /* Une formation */
  route("GET", "/api/formations/:id/regles-membres", async (req, res, params) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    sendJSON(res, 200, { regles: await lister(ctx.f.owner_user_id, ctx.f.id), globales: await lister(ctx.f.owner_user_id, 0), officielle_id: await M.initiativeOfficielleId(db) });
  });
  route("POST", "/api/formations/:id/regles-membres", async (req, res, params, body) => { const ctx = await proprietaire(req, res, params.id); if (ctx) await creer(res, ctx.f.owner_user_id, ctx.f.id, body); });
  route("PATCH", "/api/formations/:id/regles-membres/:regleId", async (req, res, params, body) => { const ctx = await proprietaire(req, res, params.id); if (ctx) await basculer(res, ctx.f.owner_user_id, ctx.f.id, params.regleId, body); });
  route("DELETE", "/api/formations/:id/regles-membres/:regleId", async (req, res, params) => { const ctx = await proprietaire(req, res, params.id); if (ctx) await supprimer(res, ctx.f.owner_user_id, ctx.f.id, params.regleId); });

  /* Toutes mes formations (y compris celles de demain) */
  route("GET", "/api/formateur/regles-membres", async (req, res) => {
    const user = await formateur(req, res); if (!user) return;
    sendJSON(res, 200, { regles: await lister(user.id, 0), officielle_id: await M.initiativeOfficielleId(db) });
  });
  route("POST", "/api/formateur/regles-membres", async (req, res, params, body) => { const user = await formateur(req, res); if (user) await creer(res, user.id, 0, body); });
  route("PATCH", "/api/formateur/regles-membres/:regleId", async (req, res, params, body) => { const user = await formateur(req, res); if (user) await basculer(res, user.id, 0, params.regleId, body); });
  route("DELETE", "/api/formateur/regles-membres/:regleId", async (req, res, params) => { const user = await formateur(req, res); if (user) await supprimer(res, user.id, 0, params.regleId); });
};

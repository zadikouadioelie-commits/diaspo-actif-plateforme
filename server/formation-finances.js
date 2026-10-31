/* ═════════════════════════════════════════════════
   server/formation-finances.js — Formation Diaspora, lot B : L'ARGENT (2026-10-30)

   - Prix effectif : la promotion de la formation (promo_active / promo_reduction_pct / promo_date_fin) est enfin appliquée au paiement
     (elle ne concernait que l'affichage du formulaire). Elle porte sur la formation complète ; un module vendu seul garde son prix.
   - Coupons : pourcentage OU montant fixe, dates de début et de fin, limite totale et limite par personne ; un coupon vaut pour UNE formation
     ou pour TOUTES celles d'un formateur (« coupon global »). Le coupon se calcule ici, côté serveur : le navigateur n'envoie que le code.
   - Commission : 3 % par défaut ; l'administration peut fixer un autre taux pour un formateur (formation_commissions_formateurs).
     Le taux appliqué est écrit sur la commande au moment du paiement : changer le taux plus tard ne réécrit jamais une vente passée.
   - Vues : « Ventes et revenus » du formateur, vue financière de l'administration. AUCUN remboursement de formation (décision du 2026-10-30).
   ═════════════════════════════════════════════════ */
"use strict";

const COMMISSION_DEFAUT = 3;
const COMMISSION_MAX = 30;
const PAIEMENT_MINIMUM = 0.5; /* Stripe refuse un paiement inférieur à 0,50 € */

const arrondi = n => Math.round((Number(n) || 0) * 100) / 100;
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const jourValide = s => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
const codeNormalise = s => String(s == null ? "" : s).trim().toUpperCase();
const codeValide = c => /^[A-Z0-9_-]{3,30}$/.test(c);

/* ── Commission ── */
async function commissionPour(db, formateurId) {
  if (!formateurId) return COMMISSION_DEFAUT;
  const r = await db.prepare("SELECT pct FROM formation_commissions_formateurs WHERE user_id=?").get(Number(formateurId));
  const p = r ? Number(r.pct) : NaN;
  return Number.isFinite(p) && p >= 0 && p <= COMMISSION_MAX ? p : COMMISSION_DEFAUT;
}

/* Découpe un montant payé : commission de la plateforme et net du formateur (la somme redonne toujours le montant payé, au centime). */
function partager(montant, pct) {
  const commission = arrondi(Number(montant) * Number(pct) / 100);
  return { commission, net: arrondi(Number(montant) - commission) };
}

/* ── Promotion de la formation ── */
function promoEnCours(f) {
  if (!f || !Number(f.promo_active)) return null;
  const pct = Number(f.promo_reduction_pct);
  if (!(pct > 0 && pct <= 100)) return null;
  if (f.promo_date_fin && String(f.promo_date_fin).slice(0, 10) < aujourdhui()) return null;
  return pct;
}
/* Prix de la FORMATION COMPLÈTE après promotion. */
function prixFormation(f) {
  const base = (f.mode_acces || "gratuit") === "gratuit" ? 0 : Math.max(0, Number(f.prix) || 0);
  const pct = base > 0 ? promoEnCours(f) : null;
  return { catalogue: base, promo_pct: pct, prix: pct ? arrondi(base * (1 - pct / 100)) : base };
}

/* ── Coupons ── */
function remiseDe(c, prixBase) {
  const base = Math.max(0, Number(prixBase) || 0);
  if (c.type_reduction === "montant") return Math.min(base, arrondi(c.montant_fixe));
  return arrondi(base * Math.min(100, Math.max(0, Number(c.reduction_pct) || 0)) / 100);
}
const STATUTS_COMPTES = "('payee','en_attente')";

async function utilisations(db, source, couponId, userId) {
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM formation_commandes WHERE coupon_source=? AND coupon_id=? AND statut IN ${STATUTS_COMPTES} AND NOT (user_id=? AND statut='en_attente')`).get(source, Number(couponId), Number(userId || 0));
  const moi = userId ? await db.prepare(`SELECT COUNT(*) AS n FROM formation_commandes WHERE coupon_source=? AND coupon_id=? AND user_id=? AND statut='payee'`).get(source, Number(couponId), Number(userId)) : { n: 0 };
  return { total: Number(total && total.n) || 0, moi: Number(moi && moi.n) || 0 };
}

/* Vérifie un code pour (formation, apprenant) et calcule le prix à payer. Ne modifie rien. Renvoie { ok, erreur } ou { ok, coupon, remise, prix_final }. */
/* prixCatalogue (facultatif) : prix avant promotion. Un code GÉNÉRÉ ne se cumule pas avec la promotion en cours : la meilleure des deux offres s'applique. */
async function evaluerCoupon(db, f, codeBrut, userId, prixBase, prixCatalogue) {
  const code = codeNormalise(codeBrut);
  if (!code) return { ok: false, erreur: "Saisissez un code." };
  if (!(Number(prixBase) > 0)) return { ok: false, erreur: "Cette formation est gratuite : aucun code n'est nécessaire." };
  let source = "formation";
  let c = await db.prepare("SELECT * FROM formation_coupons WHERE formation_id=? AND code=?").get(Number(f.id), code);
  if (!c && f.owner_user_id) { c = await db.prepare("SELECT * FROM formation_coupons_globaux WHERE owner_user_id=? AND code=?").get(Number(f.owner_user_id), code); source = "global"; }
  if (!c || (c.actif != null && !Number(c.actif))) return { ok: false, erreur: "Ce code n'est pas valable." };
  const jour = aujourdhui();
  if (c.date_debut && String(c.date_debut).slice(0, 10) > jour) return { ok: false, erreur: `Ce code sera valable à partir du ${String(c.date_debut).slice(0, 10).split("-").reverse().join("/")}.` };
  if (c.date_fin && String(c.date_fin).slice(0, 10) < jour) return { ok: false, erreur: "Ce code a expiré." };
  const u = await utilisations(db, source, c.id, userId);
  if (c.max_utilisations && u.total >= Number(c.max_utilisations)) return { ok: false, erreur: "Ce code a atteint sa limite d'utilisations." };
  const parPersonne = c.max_par_utilisateur == null ? 1 : Number(c.max_par_utilisateur);
  if (parPersonne > 0 && userId && u.moi >= parPersonne) return { ok: false, erreur: "Vous avez déjà utilisé ce code." };
  const generation = !!c.type_code && Number(prixCatalogue) > Number(prixBase);
  const baseCode = generation ? Number(prixCatalogue) : Number(prixBase);
  const prixFinal = arrondi(Math.max(0, baseCode - remiseDe(c, baseCode)));
  if (generation && !(prixFinal < Number(prixBase))) return { ok: false, erreur: "La promotion en cours est déjà plus avantageuse que ce code : vous n'en avez pas besoin." };
  const remise = arrondi(Number(prixBase) - prixFinal);
  if (!(remise > 0)) return { ok: false, erreur: "Ce code n'accorde aucune réduction sur cette offre." };
  if (prixFinal > 0 && prixFinal < PAIEMENT_MINIMUM) return { ok: false, erreur: "Avec ce code, le prix passerait sous le minimum de paiement (0,50 €)." };
  return { ok: true, coupon: { source, id: Number(c.id), code }, remise, prix_final: prixFinal };
}

/* ── Écriture d'une vente : commission et net sur la commande (à l'instant du paiement) ── */
async function enregistrerVente(db, formation, montant, commandeId) {
  const pct = await commissionPour(db, formation && formation.owner_user_id);
  const { commission, net } = partager(montant, pct);
  if (commandeId) await db.prepare("UPDATE formation_commandes SET commission_pct=?, commission=?, net_formateur=? WHERE id=?").run(pct, commission, net, Number(commandeId));
  return { pct, commission, net };
}

/* ── Lecture des ventes (commandes payées + anciennes inscriptions payantes sans commande) ── */
async function lireVentes(db, filtre) {
  const f = filtre || {};
  const conds = ["c.statut='payee'", "COALESCE(c.montant,0)>0"];
  const args = [];
  if (f.formateurId != null) { conds.push("fo.owner_user_id=?"); args.push(Number(f.formateurId)); }
  if (f.formationId != null) { conds.push("c.formation_id=?"); args.push(Number(f.formationId)); }
  const commandes = await db.prepare(`SELECT c.id, c.formation_id, c.montant, c.prix_initial, c.remise, c.promo_pct, c.coupon_code, c.commission_pct, c.commission, c.net_formateur, c.paye_le, c.created_at,
      fo.titre AS formation_titre, fo.owner_user_id, u.nom AS acheteur_nom, u.email AS acheteur_email,
      (SELECT l.libelle FROM formation_commande_lignes l WHERE l.commande_id=c.id ORDER BY l.id LIMIT 1) AS libelle, (SELECT l.module_id FROM formation_commande_lignes l WHERE l.commande_id=c.id ORDER BY l.id LIMIT 1) AS module_id
    FROM formation_commandes c JOIN formations fo ON fo.id=c.formation_id LEFT JOIN users u ON u.id=c.user_id
    WHERE ${conds.join(" AND ")} ORDER BY COALESCE(c.paye_le,c.created_at) DESC`).all(...args);
  const conds2 = ["COALESCE(i.paiement_statut,'paye')='paye'", "COALESCE(i.montant_paye,0)>0",
    "NOT EXISTS (SELECT 1 FROM formation_commandes c2 WHERE c2.user_id=i.user_id AND c2.formation_id=i.formation_id AND c2.statut='payee' AND COALESCE(c2.montant,0)>0)"];
  const args2 = [];
  if (f.formateurId != null) { conds2.push("fo.owner_user_id=?"); args2.push(Number(f.formateurId)); }
  if (f.formationId != null) { conds2.push("i.formation_id=?"); args2.push(Number(f.formationId)); }
  const anciennes = await db.prepare(`SELECT i.id, i.formation_id, i.montant_paye AS montant, i.date_inscription AS paye_le, fo.titre AS formation_titre, fo.owner_user_id, u.nom AS acheteur_nom, u.email AS acheteur_email
    FROM formation_inscriptions i JOIN formations fo ON fo.id=i.formation_id LEFT JOIN users u ON u.id=i.user_id
    WHERE ${conds2.join(" AND ")} ORDER BY i.date_inscription DESC`).all(...args2);

  const ventes = [];
  for (const r of commandes) {
    const montant = Number(r.montant) || 0;
    /* Commande payée avant le lot B (ou paiement dont l'écriture a échoué) : taux de l'époque, 3 %. */
    const pct = r.commission_pct != null ? Number(r.commission_pct) : COMMISSION_DEFAUT;
    const p = r.commission != null ? { commission: Number(r.commission), net: Number(r.net_formateur) } : partager(montant, pct);
    ventes.push({ source: "commande", id: Number(r.id), date: r.paye_le || r.created_at, formation_id: Number(r.formation_id), formation: r.formation_titre, formateur_id: Number(r.owner_user_id) || null,
      libelle: r.libelle || r.formation_titre, module_id: r.module_id ? Number(r.module_id) : null, acheteur: r.acheteur_nom || "—", acheteur_email: r.acheteur_email || "",
      prix_initial: r.prix_initial != null ? Number(r.prix_initial) : montant + (Number(r.remise) || 0), promo_pct: r.promo_pct != null ? Number(r.promo_pct) : null, remise: Number(r.remise) || 0, coupon: r.coupon_code || null,
      montant, commission_pct: pct, commission: p.commission, net: p.net });
  }
  for (const r of anciennes) {
    const montant = Number(r.montant) || 0, p = partager(montant, COMMISSION_DEFAUT);
    ventes.push({ source: "inscription", id: Number(r.id), date: r.paye_le, formation_id: Number(r.formation_id), formation: r.formation_titre, formateur_id: Number(r.owner_user_id) || null,
      libelle: r.formation_titre, module_id: null, acheteur: r.acheteur_nom || "—", acheteur_email: r.acheteur_email || "", prix_initial: montant, promo_pct: null, remise: 0, coupon: null,
      montant, commission_pct: COMMISSION_DEFAUT, commission: p.commission, net: p.net });
  }
  const du = f.du && jourValide(f.du) ? f.du : null, au = f.au && jourValide(f.au) ? f.au : null;
  const retenues = ventes.filter(v => { const j = String(v.date || "").slice(0, 10); return (!du || j >= du) && (!au || j <= au); });
  retenues.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
  return retenues;
}

const somme = (liste, cle) => arrondi(liste.reduce((s, v) => s + (Number(v[cle]) || 0), 0));
function totaux(liste) {
  return { nb: liste.length, brut: somme(liste, "montant"), remises: somme(liste, "remise"), commission: somme(liste, "commission"), net: somme(liste, "net") };
}
function grouper(liste, cleDe) {
  const m = new Map();
  for (const v of liste) { const k = cleDe(v); if (!m.has(k)) m.set(k, []); m.get(k).push(v); }
  return m;
}
function parMois(liste) {
  return [...grouper(liste, v => String(v.date || "").slice(0, 7) || "—")].map(([mois, l]) => ({ mois, ...totaux(l) })).sort((a, b) => b.mois.localeCompare(a.mois));
}
function parFormation(liste) {
  return [...grouper(liste, v => v.formation_id)].map(([id, l]) => ({ formation_id: id, formation: l[0].formation, ...totaux(l) })).sort((a, b) => b.brut - a.brut);
}
function parCoupon(liste) {
  const avec = liste.filter(v => v.coupon);
  return [...grouper(avec, v => v.coupon)].map(([code, l]) => ({ code, nb: l.length, remises: somme(l, "remise"), brut: somme(l, "montant") })).sort((a, b) => b.nb - a.nb);
}

const csvCell = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
function exportCsv(ventes, avecFormateur) {
  const entetes = ["Date", "Formation", "Offre", "Acheteur", "E-mail", "Prix initial (€)", "Promotion (%)", "Code", "Remise (€)", "Payé (€)", "Commission (%)", "Commission (€)", "Net formateur (€)"];
  if (avecFormateur) entetes.splice(2, 0, "Formateur");
  const lignes = ventes.map(v => {
    const l = [String(v.date || "").slice(0, 10), v.formation, v.libelle, v.acheteur, v.acheteur_email, v.prix_initial.toFixed(2), v.promo_pct == null ? "" : v.promo_pct, v.coupon || "", v.remise.toFixed(2), v.montant.toFixed(2), v.commission_pct, v.commission.toFixed(2), v.net.toFixed(2)];
    if (avecFormateur) l.splice(2, 0, v.formateur || "");
    return l;
  });
  return "﻿" + [entetes, ...lignes].map(r => r.map(csvCell).join(";")).join("\r\n");
}

module.exports = {
  COMMISSION_DEFAUT, COMMISSION_MAX, PAIEMENT_MINIMUM, arrondi, partager, commissionPour, promoEnCours, prixFormation, remiseDe, evaluerCoupon, enregistrerVente,
  lireVentes, totaux, parMois, parFormation, parCoupon, exportCsv,
};

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, exigerPremium } = deps;
  const F = module.exports;
  const estAdmin = u => u && u.role === "administrateur";

  /* Un coupon : champs validés (pourcentage ou montant fixe, dates, limites). Renvoie { err } ou { v }. */
  function lireCoupon(body) {
    const b = body || {};
    const code = codeNormalise(b.code);
    if (!codeValide(code)) return { err: "Le code doit contenir 3 à 30 caractères : lettres, chiffres, tiret ou souligné." };
    const type = b.type_reduction === "montant" ? "montant" : "pourcentage";
    let pct = 0, montant = null;
    if (type === "pourcentage") {
      pct = Number(b.reduction_pct);
      if (!(pct >= 1 && pct <= 100)) return { err: "La réduction doit être comprise entre 1 et 100 %." };
    } else {
      montant = F.arrondi(Number(b.montant_fixe));
      if (!(montant > 0 && montant <= 10000)) return { err: "Le montant de la réduction doit être compris entre 0,01 et 10 000 €." };
    }
    const debut = b.date_debut ? String(b.date_debut).slice(0, 10) : null, fin = b.date_fin ? String(b.date_fin).slice(0, 10) : null;
    if (debut && !jourValide(debut)) return { err: "Date de début invalide." };
    if (fin && !jourValide(fin)) return { err: "Date de fin invalide." };
    if (debut && fin && fin < debut) return { err: "La date de fin doit suivre la date de début." };
    const max = b.max_utilisations ? Math.floor(Number(b.max_utilisations)) : null;
    if (b.max_utilisations && !(max >= 1 && max <= 1000000)) return { err: "La limite d'utilisations doit être un nombre entier positif." };
    const parPers = b.max_par_utilisateur === "" || b.max_par_utilisateur == null ? 1 : Math.floor(Number(b.max_par_utilisateur));
    if (!(parPers >= 0 && parPers <= 1000)) return { err: "La limite par personne doit être un nombre entier (0 = illimitée)." };
    return { v: { code, type, pct, montant, debut, fin, max, parPers } };
  }

  async function proprietaire(req, res, formationId) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    const f = await db.prepare("SELECT id, owner_user_id, titre FROM formations WHERE id=?").get(Number(formationId));
    if (!f) { sendJSON(res, 404, { error: "Formation introuvable." }); return null; }
    if (Number(f.owner_user_id) !== Number(user.id) && !estAdmin(user)) { sendJSON(res, 403, { error: "Interdit." }); return null; }
    if (!(await exigerPremium(user, res, "formations"))) return null;
    return { user, f };
  }

  async function avecUsages(c, source) {
    const u = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(remise),0) AS remises FROM formation_commandes WHERE coupon_source=? AND coupon_id=? AND statut='payee'`).get(source, Number(c.id));
    return { ...c, source, nb_utilises: Number(u && u.n) || 0, remises_accordees: F.arrondi(u && u.remises) };
  }

  /* ── Coupons d'une formation (+ les coupons globaux du propriétaire, en lecture) ── */
  route("GET", "/api/formations/:id/coupons", async (req, res, params) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    const coupons = [];
    for (const c of await db.prepare("SELECT * FROM formation_coupons WHERE formation_id=? ORDER BY created_at DESC, id DESC").all(ctx.f.id)) coupons.push(await avecUsages(c, "formation"));
    const globaux = [];
    for (const c of await db.prepare("SELECT * FROM formation_coupons_globaux WHERE owner_user_id=? ORDER BY created_at DESC, id DESC").all(ctx.f.owner_user_id)) globaux.push(await avecUsages(c, "global"));
    sendJSON(res, 200, { coupons, globaux });
  });

  route("POST", "/api/formations/:id/coupons", async (req, res, params, body) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    const { err, v } = lireCoupon(body); if (err) return sendJSON(res, 400, { error: err });
    if (await db.prepare("SELECT id FROM formation_coupons_globaux WHERE owner_user_id=? AND code=?").get(ctx.f.owner_user_id, v.code)) return sendJSON(res, 400, { error: "Ce code existe déjà comme coupon valable sur toutes vos formations." });
    try {
      const id = (await db.prepare(`INSERT INTO formation_coupons (formation_id, code, reduction_pct, max_utilisations, type_reduction, montant_fixe, date_debut, date_fin, max_par_utilisateur) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(ctx.f.id, v.code, v.pct, v.max, v.type, v.montant, v.debut, v.fin, v.parPers)).lastInsertRowid;
      sendJSON(res, 201, { id });
    } catch (e) {
      if (/unique|duplicate/i.test(String(e && e.message))) return sendJSON(res, 400, { error: "Ce code de coupon existe déjà pour cette formation." });
      sendJSON(res, 500, SEC.safeError(e, "formation-coupon"));
    }
  });

  /* ── Générer des codes en un clic (2026-10-31) : individuel = une seule utilisation ; collectif = N personnes ou illimité. Chaque code est enregistré aussitôt. ── */
  const ALPHABET_CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; /* sans I, L, O, 0, 1 : aucune confusion à la lecture ou à la dictée */
  const morceau = n => Array.from({ length: n }, () => ALPHABET_CODE[require("crypto").randomInt(ALPHABET_CODE.length)]).join("");
  const prefixeDe = titre => { const p = String(titre || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4); return p.length >= 3 ? p : "PROMO"; };
  route("POST", "/api/formations/:id/coupons/generer", async (req, res, params, body) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    const lim = SEC.rateLimit(`formation-coupon-gen:${ctx.user.id}`, 30, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop de générations. Réessayez dans ${lim.retryAfter}s.` });
    const b = body || {};
    const type = b.type === "collectif" ? "collectif" : b.type === "individuel" ? "individuel" : null;
    if (!type) return sendJSON(res, 400, { error: "Choisissez un code individuel ou un code collectif." });
    /* La réduction et la date limite passent par le même contrôle que les codes saisis à la main (le code fictif n'est jamais enregistré). */
    const { err, v } = lireCoupon({ code: "TEMOIN", type_reduction: b.type_reduction, reduction_pct: b.reduction_pct, montant_fixe: b.montant_fixe, date_fin: b.date_fin });
    if (err) return sendJSON(res, 400, { error: err });
    let quantite = 1, max = 1;
    if (type === "individuel") {
      quantite = b.quantite == null || b.quantite === "" ? 1 : Math.floor(Number(b.quantite));
      if (!(quantite >= 1 && quantite <= 50)) return sendJSON(res, 400, { error: "Vous pouvez générer de 1 à 50 codes individuels à la fois." });
    } else if (b.illimite === true || b.max_personnes == null || b.max_personnes === "") max = null;
    else {
      max = Math.floor(Number(b.max_personnes));
      if (!(max >= 2 && max <= 1000000)) return sendJSON(res, 400, { error: "Un code collectif doit pouvoir servir à au moins 2 personnes (sinon choisissez « individuel »)." });
    }
    const prefixe = prefixeDe(ctx.f.titre), crees = [];
    try {
      for (let i = 0; i < quantite; i++) {
        let ok = false;
        for (let essai = 0; essai < 12 && !ok; essai++) {
          const code = `${prefixe}-${morceau(4)}-${morceau(4)}`;
          if (await db.prepare("SELECT id FROM formation_coupons_globaux WHERE owner_user_id=? AND code=?").get(ctx.f.owner_user_id, code)) continue;
          try {
            const id = (await db.prepare("INSERT INTO formation_coupons (formation_id, code, reduction_pct, max_utilisations, type_reduction, montant_fixe, date_debut, date_fin, max_par_utilisateur, type_code) VALUES (?,?,?,?,?,?,?,?,?,?)")
              .run(ctx.f.id, code, v.pct, max, v.type, v.montant, null, v.fin, 1, type)).lastInsertRowid;
            crees.push({ id: Number(id), code, type_code: type, max_utilisations: max, type_reduction: v.type, reduction_pct: v.pct, montant_fixe: v.montant, date_fin: v.fin });
            ok = true;
          } catch (e) { if (!/unique|duplicate/i.test(String(e && e.message))) throw e; }
        }
        if (!ok) return sendJSON(res, 500, { error: "Impossible de générer un code unique. Réessayez." });
      }
    } catch (e) { return sendJSON(res, 500, SEC.safeError(e, "formation-coupon-generer")); }
    sendJSON(res, 201, { codes: crees });
  });

  route("PATCH", "/api/formations/:id/coupons/:couponId", async (req, res, params, body) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    const actif = body && body.actif ? 1 : 0;
    const r = await db.prepare("UPDATE formation_coupons SET actif=? WHERE id=? AND formation_id=?").run(actif, Number(params.couponId), ctx.f.id);
    if (!r || !Number(r.changes)) return sendJSON(res, 404, { error: "Coupon introuvable." });
    sendJSON(res, 200, { ok: true, actif });
  });

  route("DELETE", "/api/formations/:id/coupons/:couponId", async (req, res, params) => {
    const ctx = await proprietaire(req, res, params.id); if (!ctx) return;
    await db.prepare("DELETE FROM formation_coupons WHERE id=? AND formation_id=?").run(Number(params.couponId), ctx.f.id);
    sendJSON(res, 200, { ok: true });
  });

  /* ── Coupons globaux (valables sur toutes les formations du formateur) ── */
  async function formateurPremium(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    if (!(await exigerPremium(user, res, "formations"))) return null;
    return user;
  }
  route("GET", "/api/formateur/coupons-globaux", async (req, res) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const out = [];
    for (const c of await db.prepare("SELECT * FROM formation_coupons_globaux WHERE owner_user_id=? ORDER BY created_at DESC, id DESC").all(user.id)) out.push(await avecUsages(c, "global"));
    sendJSON(res, 200, { coupons: out });
  });
  route("POST", "/api/formateur/coupons-globaux", async (req, res, params, body) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const { err, v } = lireCoupon(body); if (err) return sendJSON(res, 400, { error: err });
    if (await db.prepare("SELECT c.id FROM formation_coupons c JOIN formations f ON f.id=c.formation_id WHERE f.owner_user_id=? AND c.code=?").get(user.id, v.code)) return sendJSON(res, 400, { error: "Ce code existe déjà comme coupon d'une de vos formations : choisissez-en un autre." });
    try {
      const id = (await db.prepare(`INSERT INTO formation_coupons_globaux (owner_user_id, code, type_reduction, reduction_pct, montant_fixe, date_debut, date_fin, max_utilisations, max_par_utilisateur) VALUES (?,?,?,?,?,?,?,?,?)`)
        .run(user.id, v.code, v.type, v.pct, v.montant, v.debut, v.fin, v.max, v.parPers)).lastInsertRowid;
      sendJSON(res, 201, { id });
    } catch (e) {
      if (/unique|duplicate/i.test(String(e && e.message))) return sendJSON(res, 400, { error: "Ce code existe déjà." });
      sendJSON(res, 500, SEC.safeError(e, "formation-coupon-global"));
    }
  });
  route("PATCH", "/api/formateur/coupons-globaux/:id", async (req, res, params, body) => {
    const user = await formateurPremium(req, res); if (!user) return;
    const actif = body && body.actif ? 1 : 0;
    const r = await db.prepare("UPDATE formation_coupons_globaux SET actif=? WHERE id=? AND owner_user_id=?").run(actif, Number(params.id), user.id);
    if (!r || !Number(r.changes)) return sendJSON(res, 404, { error: "Coupon introuvable." });
    sendJSON(res, 200, { ok: true, actif });
  });
  route("DELETE", "/api/formateur/coupons-globaux/:id", async (req, res, params) => {
    const user = await formateurPremium(req, res); if (!user) return;
    await db.prepare("DELETE FROM formation_coupons_globaux WHERE id=? AND owner_user_id=?").run(Number(params.id), user.id);
    sendJSON(res, 200, { ok: true });
  });

  /* ── Vérifier un code avant de payer (l'apprenant voit le nouveau prix ; le calcul définitif se refait à l'achat) ── */
  route("POST", "/api/formations/:id/coupon/verifier", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const lim = SEC.rateLimit(`formation-coupon:${user.id}`, 20, 600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop d'essais. Réessayez dans ${lim.retryAfter}s.` });
    const f = await db.prepare("SELECT * FROM formations WHERE id=?").get(Number(params.id));
    if (!f || f.statut !== "publiee") return sendJSON(res, 404, { error: "Formation introuvable ou non publiée." });
    let base;
    if (body && body.module_id) {
      const m = await db.prepare("SELECT * FROM formation_modules WHERE id=? AND formation_id=?").get(Number(body.module_id), f.id);
      if (!m) return sendJSON(res, 404, { error: "Module introuvable dans cette formation." });
      base = (f.mode_acces || "gratuit") === "gratuit" ? 0 : Math.max(0, Number(m.prix) || 0);
    } else base = F.prixFormation(f).prix;
    const r = await F.evaluerCoupon(db, f, body && body.code, user.id, base, body && body.module_id ? null : F.prixFormation(f).catalogue);
    if (!r.ok) return sendJSON(res, 200, { valide: false, erreur: r.erreur });
    sendJSON(res, 200, { valide: true, code: r.coupon.code, prix_avant: base, remise: r.remise, prix_final: r.prix_final });
  });

  /* Le taux de commission qui s'appliquera à MES prochaines ventes (affiché dans le formulaire de tarification). */
  route("GET", "/api/formateur/commission", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const pct = await F.commissionPour(db, user.id);
    sendJSON(res, 200, { pct, personnalisee: pct !== COMMISSION_DEFAUT });
  });

  /* ── « Ventes et revenus » du formateur ── */
  route("GET", "/api/formateur/ventes", async (req, res, params, body, query) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const q = query || {};
    const filtre = { formateurId: user.id, du: q.du || null, au: q.au || null, formationId: q.formation_id ? Number(q.formation_id) : null };
    if ((q.du && !jourValide(q.du)) || (q.au && !jourValide(q.au))) return sendJSON(res, 400, { error: "Date invalide (format AAAA-MM-JJ)." });
    const ventes = await F.lireVentes(db, filtre);
    if (q.format === "csv") {
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="ventes-formations.csv"' });
      return res.end(F.exportCsv(ventes, false));
    }
    const mesFormations = await db.prepare("SELECT id, titre FROM formations WHERE owner_user_id=? ORDER BY titre").all(user.id);
    const commission = await F.commissionPour(db, user.id);
    const solde = await db.prepare("SELECT COALESCE(wallet_balance,0) AS s FROM users WHERE id=?").get(user.id);
    sendJSON(res, 200, {
      commission_pct: commission, commission_personnalisee: commission !== COMMISSION_DEFAUT, solde_wallet: F.arrondi(solde && solde.s),
      totaux: F.totaux(ventes), par_mois: F.parMois(ventes), par_formation: F.parFormation(ventes), par_coupon: F.parCoupon(ventes),
      ventes: ventes.slice(0, 200), nb_total: ventes.length, mes_formations: mesFormations,
    });
  });

  /* ── Administration : vue financière + commissions par formateur ── */
  route("GET", "/api/admin/formations/finances", async (req, res, params, body, query) => {
    const user = await getCurrentUser(req);
    if (!estAdmin(user)) return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
    const q = query || {};
    if ((q.du && !jourValide(q.du)) || (q.au && !jourValide(q.au))) return sendJSON(res, 400, { error: "Date invalide (format AAAA-MM-JJ)." });
    const ventes = await F.lireVentes(db, { du: q.du || null, au: q.au || null });
    const noms = {};
    for (const u of await db.prepare("SELECT id, nom FROM users WHERE id IN (SELECT DISTINCT owner_user_id FROM formations WHERE owner_user_id IS NOT NULL)").all()) noms[Number(u.id)] = u.nom;
    ventes.forEach(v => { v.formateur = noms[v.formateur_id] || "—"; });
    if (q.format === "csv") {
      res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="finances-formations.csv"' });
      return res.end(F.exportCsv(ventes, true));
    }
    const perso = {};
    for (const r of await db.prepare("SELECT user_id, pct, note FROM formation_commissions_formateurs").all()) perso[Number(r.user_id)] = r;
    const parFormateur = [...grouper(ventes, v => v.formateur_id)].map(([id, l]) => ({
      formateur_id: id, formateur: noms[id] || "—", commission_pct: perso[id] ? Number(perso[id].pct) : COMMISSION_DEFAUT, personnalisee: !!perso[id], ...F.totaux(l),
    })).sort((a, b) => b.brut - a.brut);
    sendJSON(res, 200, {
      commission_defaut: COMMISSION_DEFAUT, totaux: F.totaux(ventes), par_mois: F.parMois(ventes), par_formateur: parFormateur, par_formation: F.parFormation(ventes).slice(0, 30), par_coupon: F.parCoupon(ventes).slice(0, 30),
      ventes: ventes.slice(0, 100), nb_total: ventes.length, commissions_personnalisees: Object.keys(perso).length,
    });
  });

  route("GET", "/api/admin/formations/commissions", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!estAdmin(user)) return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
    const lignes = await db.prepare(`SELECT c.user_id, c.pct, c.note, c.updated_at, u.nom, u.email FROM formation_commissions_formateurs c LEFT JOIN users u ON u.id=c.user_id ORDER BY u.nom`).all();
    const formateurs = await db.prepare("SELECT u.id, u.nom, COUNT(f.id) AS nb FROM formations f JOIN users u ON u.id=f.owner_user_id GROUP BY u.id, u.nom ORDER BY u.nom").all();
    sendJSON(res, 200, { defaut: COMMISSION_DEFAUT, max: COMMISSION_MAX, formateurs: formateurs.map(x => ({ id: Number(x.id), nom: x.nom || "—", nb_formations: Number(x.nb) || 0 })), commissions: lignes.map(l => ({ user_id: Number(l.user_id), nom: l.nom || "—", email: l.email || "", pct: Number(l.pct), note: l.note || "", modifie_le: l.updated_at })) });
  });

  /* Fixe le taux d'un formateur (n'agit que sur les ventes FUTURES : le taux de chaque vente est écrit à son paiement). */
  route("PUT", "/api/admin/formations/commissions/:userId", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!estAdmin(user)) return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
    const cible = await db.prepare("SELECT id, nom FROM users WHERE id=?").get(Number(params.userId));
    if (!cible) return sendJSON(res, 404, { error: "Compte introuvable." });
    const pct = Number(body && body.pct);
    if (!(pct >= 0 && pct <= COMMISSION_MAX)) return sendJSON(res, 400, { error: `La commission doit être comprise entre 0 et ${COMMISSION_MAX} %.` });
    const note = String((body && body.note) || "").trim().slice(0, 300) || null;
    const existe = await db.prepare("SELECT id FROM formation_commissions_formateurs WHERE user_id=?").get(cible.id);
    if (existe) await db.prepare("UPDATE formation_commissions_formateurs SET pct=?, note=?, modifie_par=?, updated_at=datetime('now') WHERE user_id=?").run(pct, note, user.id, cible.id);
    else await db.prepare("INSERT INTO formation_commissions_formateurs (user_id, pct, note, modifie_par) VALUES (?,?,?,?)").run(cible.id, pct, note, user.id);
    sendJSON(res, 200, { ok: true, user_id: Number(cible.id), pct });
  });

  route("DELETE", "/api/admin/formations/commissions/:userId", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!estAdmin(user)) return sendJSON(res, 403, { error: "Réservé aux administrateurs." });
    await db.prepare("DELETE FROM formation_commissions_formateurs WHERE user_id=?").run(Number(params.userId));
    sendJSON(res, 200, { ok: true, pct: COMMISSION_DEFAUT });
  });
};

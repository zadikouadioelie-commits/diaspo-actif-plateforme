/* ═══════════════════════════════════════════════════════════════
   server/reduction-comptes-lies.js — Réduction automatique « comptes liés » (2026-10-31)
   ═══════════════════════════════════════════════════════════════
   Quand une même personne relie plusieurs comptes Premium PAYANTS (système « Liaison de comptes »,
   comptes_lies_groupes / comptes_lies_membres), la plateforme lui accorde automatiquement une
   réduction sur les abonnements les moins chers, SANS aucune démarche de sa part :

     - le compte le moins cher            → -20 %
     - le deuxième moins cher             → -10 %   (à partir de 3 comptes)
     - le compte le plus cher             → plein tarif, toujours
     - plafond ABSOLU                     → 20 % (PLAFOND_PCT), vérifié avant tout appel à Stripe

   Règles (demande explicite de l'utilisateur, 2026-10-31) :
     - Il faut au moins DEUX comptes éligibles : Premium PAYANT (au moins une facture réellement payée,
       jamais la gratuité ni la découverte), abonnement Stripe actif, compte réel (ni démo, ni masqué,
       ni supprimé, ni suspendu).
     - La réduction ne démarre qu'à la facture SUIVANTE (le coupon s'applique aux prochaines factures,
       jamais rétroactivement) : le premier mois est toujours payé plein tarif.
     - Jamais de cumul : un compte qui bénéficie déjà d'une autre réduction (code D'A, parrainage…) est
       écarté du calcul. Le coupon Stripe de ce module est reconnaissable à son identifiant
       « liaison_<pct>_forever » : seuls ces coupons-là sont posés, remplacés ou retirés ici.
     - Si les conditions ne sont plus réunies (compte délié, supprimé, abonnement résilié ou impayé,
       un seul compte payant restant), la réduction est retirée à la facture suivante.
     - La vérité est lue chez Stripe (prix plein de l'abonnement, coupon réellement posé) : le module
       est idempotent et se répare seul à chaque passage.

   Fonctionne par dépendances injectées (db, stripe, creerNotif) pour être testable avec un faux
   client Stripe. Aucune route ici : server/index.js appelle evaluerTout() depuis le cron quotidien.
   ═══════════════════════════════════════════════════════════════ */

const PLAFOND_PCT = 20;
const PALIERS_PCT = [20, 10];          // rang 0 = abonnement le moins cher
const DELAI_MIN_JOURS = 1;             // délai de sécurité après le premier paiement réel (rétrofacturation éventuelle)
const TYPES_PREMIUM = ['utilisateur_abonne', 'initiative_abonne'];
const PREFIXE_COUPON = 'liaison_';

/* Comptes « réels » : mêmes critères que l'audience publicitaire (ADS_COMPTES_REELS de server/index.js). */
const COMPTE_REEL_SQL = "u.role != 'administrateur' AND (u.compte_masque IS NULL OR u.compte_masque=0) AND (u.is_demo IS NULL OR u.is_demo=FALSE) AND u.nom != 'Compte supprimé'";

function idCoupon(pct) { return `${PREFIXE_COUPON}${Math.round(pct)}_forever`; }
function pctDepuisCoupon(couponId) {
  const m = /^liaison_(\d+)_forever$/.exec(String(couponId || ''));
  return m ? Number(m[1]) : 0;
}

/* Réduction à appliquer, du rang (0 = moins cher) dans une liste de `n` abonnements éligibles.
   Pure et testable : le plus cher (rang n-1) ne reçoit jamais rien, le plafond est une garantie finale. */
function pctPourRang(rang, n) {
  if (n < 2 || rang >= n - 1) return 0;
  const pct = PALIERS_PCT[rang] || 0;
  return Math.min(pct, PLAFOND_PCT);
}

function coupon(sub) {
  if (!sub) return null;
  if (sub.discount && sub.discount.coupon) return sub.discount.coupon;
  if (Array.isArray(sub.discounts)) {
    const d = sub.discounts.find(x => x && typeof x === 'object' && x.coupon);
    if (d) return d.coupon;
  }
  return null;
}

/* Prix mensuel PLEIN de l'abonnement (le coupon n'altère jamais unit_amount, cf. POST /api/accreditations/:type/payer). */
function prixMensuelPlein(sub) {
  const item = sub && sub.items && sub.items.data && sub.items.data[0];
  const price = item && item.price;
  if (!price || !price.unit_amount || !price.recurring) return null;
  const nbMois = price.recurring.interval === 'year' ? 12 * (price.recurring.interval_count || 1)
    : price.recurring.interval === 'month' ? (price.recurring.interval_count || 1) : null;
  if (!nbMois) return null;
  return price.unit_amount / 100 / nbMois;
}

async function couponStripe(stripe, pct) {
  if (pct > PLAFOND_PCT) throw new Error(`Plafond de ${PLAFOND_PCT} % dépassé (${pct} %).`);
  const id = idCoupon(pct);
  try { await stripe.coupons.retrieve(id); return id; } catch (e) { /* à créer ci-dessous */ }
  try {
    await stripe.coupons.create({ id, percent_off: pct, duration: 'forever', name: `Comptes liés -${pct}%`, metadata: { source: 'comptes_lies' } });
    return id;
  } catch (e) {
    try { await stripe.coupons.retrieve(id); return id; } catch (e2) { throw e; }
  }
}

/* Membres d'un groupe susceptibles de compter : compte réel, non suspendu. */
async function membresReels(db, groupeId) {
  const rows = await db.prepare(`
    SELECT u.id, u.nom, u.prenom, u.role, u.email, u.suspendu_definitif, u.suspendu_jusqu_au, m.date_liaison
    FROM comptes_lies_membres m JOIN users u ON u.id = m.user_id
    WHERE m.groupe_id=? AND ${COMPTE_REEL_SQL}
  `).all(groupeId);
  const maintenant = new Date();
  return rows.filter(u => !u.suspendu_definitif && !(u.suspendu_jusqu_au && new Date(u.suspendu_jusqu_au) > maintenant));
}

async function accreditationPayante(db, userId) {
  const ph = TYPES_PREMIUM.map(() => '?').join(',');
  return db.prepare(`
    SELECT ua.id, ua.user_id, ua.stripe_subscription_id, ua.montant_paye, ua.reduction_pct_appliquee,
           COALESCE(ua.premier_paiement_le, ua.date_attribution) AS premier_paiement, d.type
    FROM user_accreditations ua JOIN accred_definitions d ON d.id = ua.accred_id
    WHERE ua.user_id=? AND d.type IN (${ph}) AND ua.statut='active'
      AND ua.stripe_subscription_id IS NOT NULL AND ua.montant_paye > 0
    ORDER BY ua.id DESC LIMIT 1
  `).get(userId, ...TYPES_PREMIUM);
}

function etiquette(u) { return [u.prenom, u.nom].filter(Boolean).join(' ') || `Compte ${u.id}`; }

/* Calcule (sans rien écrire) la situation d'un groupe. */
async function analyserGroupe({ db, stripe, maintenant = new Date() }, groupeId) {
  const membres = await membresReels(db, groupeId);
  const detail = [];
  const eligibles = [];
  for (const u of membres) {
    const ligne = { user_id: u.id, nom: etiquette(u), role: u.role, premium_payant: false, eligible: false, raison: null, prix_mensuel_plein: null, pct_actuel: 0, pct_voulu: 0, stripe_subscription_id: null };
    detail.push(ligne);
    const ua = await accreditationPayante(db, u.id);
    if (!ua) { ligne.raison = 'pas_de_premium_payant'; continue; }
    ligne.premium_payant = true;
    ligne.stripe_subscription_id = ua.stripe_subscription_id;
    let sub;
    try { sub = await stripe.subscriptions.retrieve(ua.stripe_subscription_id); }
    catch (e) { ligne.raison = 'abonnement_illisible'; continue; }
    const c = coupon(sub);
    ligne.pct_actuel = c ? pctDepuisCoupon(c.id) : 0;
    ligne.prix_mensuel_plein = prixMensuelPlein(sub);
    if (!sub || sub.status !== 'active') { ligne.raison = 'abonnement_non_actif'; continue; }
    if (sub.cancel_at_period_end) { ligne.raison = 'resiliation_programmee'; continue; }
    if (!ligne.prix_mensuel_plein) { ligne.raison = 'prix_inconnu'; continue; }
    if (c && !ligne.pct_actuel) { ligne.raison = 'autre_reduction'; continue; }   // coupon qui n'est pas le nôtre : jamais de cumul
    if (!c && Number(ua.reduction_pct_appliquee) > 0) { ligne.raison = 'autre_reduction'; continue; }
    const depuis = ua.premier_paiement ? new Date(String(ua.premier_paiement).replace(' ', 'T') + (String(ua.premier_paiement).includes('T') ? '' : 'Z')) : null;
    if (!depuis || isNaN(depuis) || (maintenant - depuis) < DELAI_MIN_JOURS * 86400000) { ligne.raison = 'premier_paiement_trop_recent'; continue; }
    ligne.eligible = true;
    eligibles.push(ligne);
  }
  eligibles.sort((a, b) => a.prix_mensuel_plein - b.prix_mensuel_plein || a.user_id - b.user_id);
  eligibles.forEach((l, i) => { l.rang = i; l.pct_voulu = pctPourRang(i, eligibles.length); });
  return { groupe_id: groupeId, comptes: detail, nb_eligibles: eligibles.length };
}

async function appliquerLigne({ db, stripe, creerNotif }, groupeId, ligne, simuler) {
  const action = ligne.pct_voulu > 0 ? (ligne.pct_actuel > 0 ? 'modifier' : 'appliquer') : 'retirer';
  const sortie = { user_id: ligne.user_id, action, de: ligne.pct_actuel, vers: ligne.pct_voulu, fait: false };
  if (simuler) return sortie;
  const subId = ligne.stripe_subscription_id;
  if (ligne.pct_voulu > PLAFOND_PCT) throw new Error('Plafond dépassé');
  if (action === 'retirer') {
    await stripe.subscriptions.deleteDiscount(subId);
  } else {
    const idc = await couponStripe(stripe, ligne.pct_voulu);
    await stripe.subscriptions.update(subId, { discounts: [{ coupon: idc }] });
  }
  const pct = ligne.pct_voulu;
  await db.prepare("UPDATE reductions_comptes_lies SET statut='retiree', retire_le=datetime('now'), motif_retrait=? WHERE user_id=? AND statut='active'")
    .run(action === 'retirer' ? 'conditions_non_reunies' : 'remplacee', ligne.user_id);
  if (pct > 0) {
    await db.prepare(`INSERT INTO reductions_comptes_lies (groupe_id, user_id, stripe_subscription_id, pct, rang, prix_mensuel_plein, coupon_id, statut)
      VALUES (?,?,?,?,?,?,?, 'active')`).run(groupeId, ligne.user_id, subId, pct, ligne.rang ?? null, ligne.prix_mensuel_plein, idCoupon(pct));
  }
  try { await db.prepare("UPDATE user_accreditations SET reduction_pct_appliquee=?, updated_at=datetime('now') WHERE stripe_subscription_id=?").run(pct, subId); } catch (e) { /* traçabilité non bloquante */ }
  if (creerNotif) {
    if (pct > 0) {
      creerNotif(ligne.user_id, 'reduction_comptes_lies', `Réduction de ${pct} % sur votre Premium`,
        `Parce que vous avez relié plusieurs comptes Premium, votre abonnement bénéficie automatiquement de ${pct} % de réduction à partir de votre prochain prélèvement. Elle dure tant que vos comptes restent reliés et abonnés.`, { pct });
    } else {
      creerNotif(ligne.user_id, 'reduction_comptes_lies_fin', 'Réduction « comptes liés » terminée',
        "Les conditions de la réduction pour comptes liés ne sont plus réunies (comptes déliés, abonnement arrêté…). Votre abonnement revient au tarif normal à votre prochain prélèvement.", {});
    }
  }
  sortie.fait = true;
  return sortie;
}

/* Évalue un groupe et applique (ou simule) les écarts avec ce qui est réellement posé chez Stripe. */
async function evaluerGroupe(ctx, groupeId, { simuler = false } = {}) {
  const analyse = await analyserGroupe(ctx, groupeId);
  const actions = [];
  const erreurs = [];
  for (const ligne of analyse.comptes) {
    if (!ligne.stripe_subscription_id || ligne.raison === 'abonnement_illisible') continue;
    if (ligne.pct_voulu === ligne.pct_actuel) continue;
    /* Un compte non éligible ne peut avoir qu'une réduction de ce module à retirer ; un coupon étranger n'est jamais touché. */
    if (!ligne.eligible && ligne.pct_actuel === 0) continue;
    try { actions.push(await appliquerLigne(ctx, groupeId, ligne, simuler)); }
    catch (e) { erreurs.push({ user_id: ligne.user_id, erreur: e.message }); }
  }
  return { ...analyse, actions, erreurs, simule: simuler };
}

/* Retire la réduction d'un compte qui n'appartient plus à aucun groupe (délié, groupe dissous). */
async function retirerOrphelins(ctx, { simuler = false } = {}) {
  const { db, stripe } = ctx;
  const rows = await db.prepare(`
    SELECT r.user_id, r.stripe_subscription_id, r.pct FROM reductions_comptes_lies r
    WHERE r.statut='active' AND NOT EXISTS (SELECT 1 FROM comptes_lies_membres m WHERE m.user_id = r.user_id)
  `).all();
  const actions = [], erreurs = [];
  for (const r of rows) {
    try {
      let ligne = { user_id: r.user_id, stripe_subscription_id: r.stripe_subscription_id, pct_actuel: r.pct, pct_voulu: 0, rang: null, prix_mensuel_plein: null };
      try {
        const sub = await stripe.subscriptions.retrieve(r.stripe_subscription_id);
        const c = coupon(sub);
        ligne.pct_actuel = c ? pctDepuisCoupon(c.id) : 0;
      } catch (e) { /* abonnement disparu : on ferme simplement la trace */ ligne.pct_actuel = 0; }
      if (ligne.pct_actuel === 0) {
        if (!simuler) {
          await db.prepare("UPDATE reductions_comptes_lies SET statut='retiree', retire_le=datetime('now'), motif_retrait='abonnement_sans_coupon' WHERE user_id=? AND statut='active'").run(r.user_id);
          try { await db.prepare("UPDATE user_accreditations SET reduction_pct_appliquee=0 WHERE stripe_subscription_id=? AND reduction_pct_appliquee>0").run(r.stripe_subscription_id); } catch (e) { /* non bloquant */ }
        }
        continue;
      }
      actions.push(await appliquerLigne(ctx, null, ligne, simuler));
    } catch (e) { erreurs.push({ user_id: r.user_id, erreur: e.message }); }
  }
  return { actions, erreurs };
}

async function evaluerTout(ctx, opts = {}) {
  const groupes = await ctx.db.prepare("SELECT id FROM comptes_lies_groupes ORDER BY id").all();
  const resultats = [];
  for (const g of groupes) resultats.push(await evaluerGroupe(ctx, g.id, opts));
  const orphelins = await retirerOrphelins(ctx, opts);
  return { groupes: resultats, orphelins };
}

/* Vue d'ensemble pour l'administration : tous les groupes de comptes liés, leurs membres et les réductions. */
async function listerGroupesAdmin(db, { minComptes = 2 } = {}) {
  const groupes = await db.prepare(`
    SELECT g.id, g.created_at, COUNT(m.id) AS nb_comptes
    FROM comptes_lies_groupes g JOIN comptes_lies_membres m ON m.groupe_id = g.id
    GROUP BY g.id, g.created_at HAVING COUNT(m.id) >= ? ORDER BY COUNT(m.id) DESC, g.id
  `).all(minComptes);
  const ph = TYPES_PREMIUM.map(() => '?').join(',');
  const sortie = [];
  for (const g of groupes) {
    const membres = await db.prepare(`
      SELECT u.id, u.nom, u.prenom, u.email, u.role, u.ds_id, u.compte_masque, u.is_demo, m.date_liaison
      FROM comptes_lies_membres m JOIN users u ON u.id = m.user_id WHERE m.groupe_id=? ORDER BY m.date_liaison, u.id
    `).all(g.id);
    const comptes = [];
    for (const u of membres) {
      const ua = await db.prepare(`
        SELECT ua.statut, ua.montant_paye, ua.type_tarif, ua.date_expiration, ua.reduction_pct_appliquee
        FROM user_accreditations ua JOIN accred_definitions d ON d.id = ua.accred_id
        WHERE ua.user_id=? AND d.type IN (${ph}) ORDER BY ua.id DESC LIMIT 1
      `).get(u.id, ...TYPES_PREMIUM);
      const red = await db.prepare("SELECT pct, rang, prix_mensuel_plein, applique_le FROM reductions_comptes_lies WHERE user_id=? AND statut='active' ORDER BY id DESC LIMIT 1").get(u.id);
      comptes.push({
        user_id: u.id, nom: etiquette(u), email: u.email, role: u.role, ds_id: u.ds_id, date_liaison: u.date_liaison,
        compte_reel: !(u.compte_masque) && !u.is_demo,
        premium: ua ? (Number(ua.montant_paye) > 0 && ua.statut === 'active' ? 'payant' : (ua.statut === 'active' ? 'gratuit' : ua.statut)) : 'aucun',
        reduction_pct: red ? Number(red.pct) : 0, reduction_depuis: red ? red.applique_le : null,
      });
    }
    sortie.push({ groupe_id: g.id, cree_le: g.created_at, nb_comptes: Number(g.nb_comptes), nb_premium_payants: comptes.filter(c => c.premium === 'payant').length, comptes });
  }
  return sortie;
}

/* Combien de comptes RÉELS une personne possède-t-elle ? Fonction réutilisable par les futures promotions. */
async function nombreComptesDePersonne(db, userId) {
  const m = await db.prepare("SELECT groupe_id FROM comptes_lies_membres WHERE user_id=?").get(userId);
  if (!m) return { groupe_id: null, nb_comptes: 1, user_ids: [Number(userId)] };
  const membres = await membresReels(db, m.groupe_id);
  const ids = membres.map(u => Number(u.id));
  if (!ids.includes(Number(userId))) ids.push(Number(userId));
  return { groupe_id: m.groupe_id, nb_comptes: ids.length, user_ids: ids };
}

module.exports = {
  PLAFOND_PCT, PALIERS_PCT, DELAI_MIN_JOURS, PREFIXE_COUPON,
  pctPourRang, pctDepuisCoupon, idCoupon, prixMensuelPlein,
  analyserGroupe, evaluerGroupe, evaluerTout, retirerOrphelins,
  listerGroupesAdmin, nombreComptesDePersonne,
};

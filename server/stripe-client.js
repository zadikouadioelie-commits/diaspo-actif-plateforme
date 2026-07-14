/* ── Client Stripe Diaspo'Actif — Paiements marketplace (Connect) + Vérification d'identité (Identity) ──
   Mode TEST uniquement tant que le code n'a pas été validé (voir project_diaspoactif memory : échéance
   paiement réel 2026-09-02 max). Ne jamais utiliser STRIPE_SECRET_KEY en mode live sans validation explicite. */
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const IS_LIVE_KEY = STRIPE_SECRET_KEY ? STRIPE_SECRET_KEY.startsWith("sk_live_") : false;

let stripe = null;
if (STRIPE_SECRET_KEY) {
  const Stripe = require("stripe");
  stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" });
  if (IS_LIVE_KEY) {
    console.warn("[Stripe] ⚠️ Clé LIVE détectée — vérifie que c'est bien intentionnel avant tout déploiement.");
  } else {
    console.log("[Stripe] Client initialisé en mode TEST.");
  }
} else {
  console.log("[Stripe] STRIPE_SECRET_KEY absent — module Stripe désactivé.");
}

/* Vérifie la connectivité à l'API Stripe (diagnostic) */
async function ping() {
  if (!stripe) return { ok: false, reason: "no_key" };
  try {
    const account = await stripe.accounts.retrieve();
    return { ok: true, mode: IS_LIVE_KEY ? "live" : "test", account_id: account.id, business_name: account.business_profile?.name || null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/* Retourne le Stripe Customer id de l'utilisateur (générique, réutilisé pour tous les flux de
   paiement : boutique, billetterie, adhésions), le créant au besoin. Persiste `db` reçu en
   paramètre pour éviter une dépendance circulaire avec server/db.js. */
async function getOrCreateStripeCustomer(db, user) {
  if (!stripe) throw new Error("Module Stripe désactivé (clé absente).");
  /* Ne pas se fier à `user.stripe_customer_id` : certains appelants (ex. getCurrentUser)
     ne sélectionnent pas cette colonne — on relit toujours la valeur autoritative en base. */
  const row = await db.prepare("SELECT stripe_customer_id FROM users WHERE id=?").get(user.id);
  if (row && row.stripe_customer_id) return row.stripe_customer_id;
  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: [user.prenom, user.nom].filter(Boolean).join(" ") || user.nom || undefined,
    metadata: { diaspoactif_user_id: String(user.id) },
  });
  await db.prepare("UPDATE users SET stripe_customer_id=? WHERE id=?").run(customer.id, user.id);
  return customer.id;
}

module.exports = { stripe, IS_LIVE_KEY, ping, getOrCreateStripeCustomer };

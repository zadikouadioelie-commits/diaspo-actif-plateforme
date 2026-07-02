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

module.exports = { stripe, IS_LIVE_KEY, ping };

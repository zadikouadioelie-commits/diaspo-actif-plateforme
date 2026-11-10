/* ═════════════════════════════════════════════════════════════════
   server/payments/refunds.js — Remboursements des commandes de boutique (lot G, 2026-11-10)

   Les commandes de boutique sont payées DIRECTEMENT au commerçant (server/payments/stripe-provider.js :
   charge créée SUR son compte Stripe Connect ; paypal-client.js : payee.merchant_id). Un remboursement doit donc
   partir du compte du commerçant, jamais du compte de la plateforme :
     - Stripe  → stripe.refunds.create({ payment_intent, amount… }, { stripeAccount })
     - PayPal  → POST /v2/payments/captures/{id}/refund avec PayPal-Auth-Assertion du vendeur
   Les anciennes commandes (paiement_direct = 0) ont été encaissées par la plateforme : remboursement sans compte tiers.

   Ce fichier ne modifie AUCUN fichier de paiement existant : il n'importe que server/stripe-client.js (lecture) et lit
   les mêmes variables d'environnement que server/paypal-client.js.
   Règle du dossier : le montant est TOUJOURS recalculé ici à partir de la commande, jamais reçu du client.
   Règle du dossier : « remboursé » n'est jamais présumé. Ces fonctions renvoient « en cours » ; la confirmation vient du
   prestataire (webhook Stripe, ou relecture de l'état par l'API : lire…).
   ═════════════════════════════════════════════════════════════════ */
"use strict";

const Config = require("../retours-config");

/* ── Montant ────────────────────────────────────────────────────── */

/* Montant à rembourser pour une commande (unité principale, 2 décimales). commande = ligne commandes_vitrine.
   montant_total = prix × quantité + frais de livraison (voir POST /api/produits/:id/commander). */
function montantRemboursable(commande, { inclureLivraison = Config.INCLURE_LIVRAISON } = {}) {
  const total = Number(commande && commande.montant_total) || 0;
  const livraison = Number(commande && commande.frais_livraison) || 0;
  const net = inclureLivraison ? total : total - livraison;
  return Math.max(0, parseFloat(net.toFixed(2)));
}

const enCentimes = (montant) => Math.round(Number(montant) * 100);

/* ── Comptes du commerçant ───────────────────────────────────────── */

/* Compte du commerçant à créditer/débiter pour cette commande. null pour une ancienne commande encaissée par la plateforme. */
async function compteDuCommercant(db, commande) {
  if (!Number(commande.paiement_direct)) return null;
  if (commande.provider === "paypal") {
    const r = await db.prepare("SELECT merchant_id_paypal FROM paypal_connect_accounts WHERE initiative_id=?").get(commande.initiative_id);
    return r && r.merchant_id_paypal ? String(r.merchant_id_paypal) : null;
  }
  const r = await db.prepare("SELECT stripe_account_id FROM stripe_connect_accounts WHERE initiative_id=?").get(commande.initiative_id);
  return r && r.stripe_account_id ? String(r.stripe_account_id) : null;
}

/* ── Stripe ──────────────────────────────────────────────────────── */

function optionsStripe(compte, idempotencyKey) {
  const o = {};
  if (compte) o.stripeAccount = compte;
  if (idempotencyKey) o.idempotencyKey = String(idempotencyKey);
  return Object.keys(o).length ? o : undefined;
}

/* Retrouve le payment_intent de la commande (mémorisé, sinon lu dans la session Checkout — sur le compte du vendeur). */
async function paymentIntentStripe({ stripe, commande, compte }) {
  if (commande.stripe_payment_intent) return commande.stripe_payment_intent;
  if (!commande.stripe_session_id) throw new Error("Aucune référence de paiement Stripe pour cette commande.");
  const session = await stripe.checkout.sessions.retrieve(commande.stripe_session_id, { expand: ["payment_intent"] }, optionsStripe(compte));
  const pi = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent && session.payment_intent.id;
  if (!pi) throw new Error("Paiement Stripe introuvable pour cette commande.");
  return pi;
}

/* Demande le remboursement à Stripe. Renvoie { providerRefundId, statutPrestataire, paymentIntent }. Lève une erreur si Stripe refuse. */
async function demanderRemboursementStripe({ stripe, commande, montant, compte, rembourserCommission = Config.REMBOURSER_COMMISSION, metadata = {}, idempotence }) {
  if (!stripe) throw erreurIndisponible("Remboursement par carte momentanément indisponible.");
  const paymentIntent = await paymentIntentStripe({ stripe, commande, compte });
  const params = {
    payment_intent: paymentIntent,
    amount: enCentimes(montant),
    reason: "requested_by_customer",
    metadata,
  };
  /* Commission de la plateforme (application_fee) : rendue au vendeur seulement si le réglage Q2 le demande, et seulement pour un paiement direct. */
  if (compte && rembourserCommission) params.refund_application_fee = true;
  /* Clé d'idempotence : un nouvel essai pour la même demande ne rembourse jamais deux fois. */
  const refund = await stripe.refunds.create(params, optionsStripe(compte, idempotence));
  return { providerRefundId: refund.id, statutPrestataire: refund.status || "pending", paymentIntent };
}

/* Relit l'état d'un remboursement chez Stripe. Renvoie 'confirme' | 'en_cours' | 'echoue'. */
async function lireRemboursementStripe({ stripe, providerRefundId, compte }) {
  if (!stripe) throw erreurIndisponible("Stripe indisponible.");
  const r = await stripe.refunds.retrieve(providerRefundId, {}, optionsStripe(compte));
  return traduireStatutStripe(r.status);
}

function traduireStatutStripe(statut) {
  if (statut === "succeeded") return "confirme";
  if (statut === "failed" || statut === "canceled") return "echoue";
  return "en_cours"; // pending, requires_action…
}

/* ── PayPal ──────────────────────────────────────────────────────── */

function configPayPal(env = process.env) {
  const live = env.PAYPAL_MODE === "live";
  return {
    clientId: env.PAYPAL_CLIENT_ID,
    clientSecret: env.PAYPAL_CLIENT_SECRET,
    apiBase: env.PAYPAL_API_BASE || (live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"),
    bnCode: env.PAYPAL_BN_CODE,
  };
}

/* Même construction que server/paypal-client.js (fonction non exportée là-bas) : jeton non signé indiquant à PayPal que l'on agit pour le vendeur. */
function authAssertion(clientId, merchantId) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64({ iss: clientId, payer_id: String(merchantId) })}.`;
}

async function appelPayPal({ cfg, fetchImpl = fetch, methode, chemin, corps, merchantId }) {
  if (!cfg.clientId || !cfg.clientSecret) throw erreurIndisponible("Remboursement PayPal momentanément indisponible.");
  const auth = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const tok = await fetchImpl(`${cfg.apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!tok.ok) throw new Error(`PayPal OAuth ${tok.status}`);
  const { access_token } = await tok.json();
  const headers = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };
  if (merchantId) {
    headers["PayPal-Auth-Assertion"] = authAssertion(cfg.clientId, merchantId);
    if (cfg.bnCode) headers["PayPal-Partner-Attribution-Id"] = cfg.bnCode;
  }
  const r = await fetchImpl(`${cfg.apiBase}${chemin}`, { method: methode, headers, ...(corps ? { body: JSON.stringify(corps) } : {}) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`PayPal ${methode} ${chemin} ${r.status} : ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

/* Identifiant de capture PayPal de la commande (mémorisé, sinon lu dans la commande PayPal). */
async function captureIdPayPal({ cfg, fetchImpl, commande, compte }) {
  if (commande.paypal_capture_id) return commande.paypal_capture_id;
  if (!commande.paypal_order_id) throw new Error("Aucune référence de paiement PayPal pour cette commande.");
  const ordre = await appelPayPal({ cfg, fetchImpl, methode: "GET", chemin: `/v2/checkout/orders/${encodeURIComponent(commande.paypal_order_id)}`, merchantId: compte });
  const capture = ordre.purchase_units && ordre.purchase_units[0] && ordre.purchase_units[0].payments && ordre.purchase_units[0].payments.captures && ordre.purchase_units[0].payments.captures[0];
  if (!capture || !capture.id) throw new Error("Capture PayPal introuvable pour cette commande.");
  return capture.id;
}

async function demanderRemboursementPayPal({ commande, montant, devise, compte, env = process.env, fetchImpl = fetch, idempotence }) {
  const cfg = configPayPal(env);
  const captureId = await captureIdPayPal({ cfg, fetchImpl, commande, compte });
  const data = await appelPayPal({
    cfg, fetchImpl, methode: "POST", chemin: `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, merchantId: compte,
    corps: {
      amount: { currency_code: String(devise || "EUR").toUpperCase(), value: Number(montant).toFixed(2) },
      note_to_payer: "Remboursement Diaspo'Actif",
      ...(idempotence ? { invoice_id: String(idempotence) } : {}),
    },
  });
  return { providerRefundId: data.id, statutPrestataire: data.status || "PENDING", captureId };
}

async function lireRemboursementPayPal({ providerRefundId, compte, env = process.env, fetchImpl = fetch }) {
  const cfg = configPayPal(env);
  const data = await appelPayPal({ cfg, fetchImpl, methode: "GET", chemin: `/v2/payments/refunds/${encodeURIComponent(providerRefundId)}`, merchantId: compte });
  return traduireStatutPayPal(data.status);
}

function traduireStatutPayPal(statut) {
  if (statut === "COMPLETED") return "confirme";
  if (statut === "FAILED" || statut === "CANCELLED") return "echoue";
  return "en_cours"; // PENDING
}

/* ── Utilitaires ─────────────────────────────────────────────────── */

function erreurIndisponible(message) {
  const e = new Error(message);
  e.code = "REMBOURSEMENT_INDISPONIBLE";
  return e;
}

module.exports = {
  montantRemboursable,
  compteDuCommercant,
  demanderRemboursementStripe,
  lireRemboursementStripe,
  traduireStatutStripe,
  demanderRemboursementPayPal,
  lireRemboursementPayPal,
  traduireStatutPayPal,
  authAssertion,
  erreurIndisponible,
};

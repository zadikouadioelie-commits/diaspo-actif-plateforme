/* ── Client PayPal Diaspo'Actif — Orders API v2 (REST direct, pas de SDK npm) ──
   Deuxième prestataire de paiement après Stripe (2026-09-29, demande explicite : couverture
   mondiale). Désactivé tant que PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET ne sont pas configurés
   (même convention que server/stripe-client.js : `if (!stripe)`). PAYPAL_MODE=live bascule vers
   l'API réelle ; par défaut (absent ou toute autre valeur) on utilise le bac à sable (sandbox),
   le seul environnement où un compte développeur PayPal gratuit suffit pour tester. */
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const IS_LIVE = process.env.PAYPAL_MODE === "live";
const API_BASE = IS_LIVE ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const paypalEnabled = !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);

if (paypalEnabled) {
  console.log(`[PayPal] Client activé en mode ${IS_LIVE ? "LIVE" : "SANDBOX"}.`);
} else {
  console.log("[PayPal] PAYPAL_CLIENT_ID/PAYPAL_CLIENT_SECRET absents — module PayPal désactivé.");
}

/* Jeton d'accès OAuth2 (client_credentials), mis en cache en mémoire jusqu'à ~1 min avant
   expiration — évite un aller-retour /oauth2/token à chaque appel (durée de vie typique 9h). */
let cachedToken = null; // { value, expiresAt }
async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const r = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!r.ok) throw new Error(`PayPal OAuth ${r.status} : ${await r.text()}`);
  const data = await r.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 300) * 1000 - 60000 };
  return cachedToken.value;
}

/* En-tête PayPal-Auth-Assertion : jeton non signé (alg none) qui indique à PayPal que l'application
   agit au nom du vendeur (payer_id = identifiant marchand du vendeur). Exigé pour créer et capturer
   une commande dont le bénéficiaire est un compte tiers. */
function authAssertion(merchantId) {
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "none" })}.${b64({ iss: PAYPAL_CLIENT_ID, payer_id: String(merchantId) })}.`;
}

/* Crée une commande PayPal (intent CAPTURE, paiement en une fois — même modèle que Stripe
   Checkout en mode "payment"). Retourne { id, approveUrl } : id à conserver côté Diaspo'Actif
   (colonne paypal_order_id), approveUrl est l'équivalent du session.url de Stripe (à rediriger
   l'acheteur dessus). */
async function createOrder({ amount, currency, description, custom_id, return_url, cancel_url, payee_merchant_id, platform_fee }) {
  if (!paypalEnabled) throw new Error("Module PayPal désactivé (clés absentes).");
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const unite = {
    custom_id: String(custom_id),
    description: (description || "Diaspo'Actif").slice(0, 127),
    amount: { currency_code: currency, value: Number(amount).toFixed(2) },
  };
  /* Paiement DIRECT au commerçant (décision du 2026-11-10) : l'argent est versé sur le compte
     PayPal du vendeur (payee.merchant_id), jamais sur celui de Diaspo'Actif. La commission de la
     plateforme (server/commission.js) est prélevée en frais de plateforme, versée au compte
     Partenaire. Sans payee_merchant_id (anciens flux non boutique) le comportement est inchangé. */
  if (payee_merchant_id) {
    unite.payee = { merchant_id: String(payee_merchant_id) };
    headers["PayPal-Auth-Assertion"] = authAssertion(payee_merchant_id);
    if (process.env.PAYPAL_BN_CODE) headers["PayPal-Partner-Attribution-Id"] = process.env.PAYPAL_BN_CODE;
    if (platform_fee && Number(platform_fee) > 0 && process.env.PAYPAL_PARTNER_ID) {
      unite.payment_instruction = {
        disbursement_mode: "INSTANT",
        platform_fees: [{
          amount: { currency_code: currency, value: Number(platform_fee).toFixed(2) },
          payee: { merchant_id: process.env.PAYPAL_PARTNER_ID },
        }],
      };
    }
  }
  const r = await fetch(`${API_BASE}/v2/checkout/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [unite],
      application_context: {
        brand_name: "Diaspo'Actif",
        user_action: "PAY_NOW",
        return_url,
        cancel_url,
      },
    }),
  });
  if (!r.ok) throw new Error(`PayPal createOrder ${r.status} : ${await r.text()}`);
  const order = await r.json();
  const approveUrl = (order.links || []).find(l => l.rel === "approve")?.href;
  if (!approveUrl) throw new Error("PayPal createOrder : lien d'approbation absent de la réponse.");
  return { id: order.id, approveUrl };
}

/* Capture une commande PayPal préalablement approuvée par l'acheteur (appelé quand celui-ci
   revient sur return_url — PayPal n'exige pas de webhook signé pour ce flux simple, contrairement
   à Stripe). Retourne { statut, providerRef } : statut 'COMPLETED' = paiement encaissé,
   providerRef = id de la capture (équivalent du payment_intent Stripe, pour trace/remboursement
   futur). Idempotent côté PayPal : capturer une commande déjà capturée renvoie une erreur
   ORDER_ALREADY_CAPTURED — remontée telle quelle, à l'appelant de traiter en best-effort. */
async function captureOrder(orderId, { merchantId } = {}) {
  if (!paypalEnabled) throw new Error("Module PayPal désactivé (clés absentes).");
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  if (merchantId) {
    headers["PayPal-Auth-Assertion"] = authAssertion(merchantId);
    if (process.env.PAYPAL_BN_CODE) headers["PayPal-Partner-Attribution-Id"] = process.env.PAYPAL_BN_CODE;
  }
  const r = await fetch(`${API_BASE}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`PayPal captureOrder ${r.status} : ${JSON.stringify(data)}`);
  const capture = data.purchase_units?.[0]?.payments?.captures?.[0];
  return { statut: data.status, providerRef: capture?.id || null };
}

module.exports = { paypalEnabled, IS_LIVE, createOrder, captureOrder };

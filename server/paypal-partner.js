/* ── Onboarding des vendeurs PayPal (Partner Referrals API) — 2026-11-02 ──
   Permet à chaque Initiative de connecter SON PROPRE compte PayPal pour recevoir directement
   l'argent de ses ventes, sur le même principe que Stripe Connect (server/index.js, routes
   /connect/*) : Diaspo'Actif reste un simple intermédiaire, jamais détenteur des fonds du vendeur.

   Désactivé tant que PAYPAL_PARTNER_ID n'est pas configuré — ce réglage n'existe qu'après
   acceptation de Diaspo'Actif au programme Partenaire PayPal (démarche de l'utilisateur, hors de
   ce code ; voir le formulaire "Contacter l'équipe commerciale PayPal"). PAYPAL_CLIENT_ID/
   PAYPAL_CLIENT_SECRET sont les mêmes que server/paypal-client.js (même app PayPal, qui reçoit
   les droits Partenaire une fois le programme accepté) — paypalPartnerEnabled reste une variable
   séparée de paypalEnabled : un compte peut encaisser pour lui-même (checkout simple) sans être
   encore agréé Partenaire pour onboarder des vendeurs tiers. */
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const PAYPAL_PARTNER_ID = process.env.PAYPAL_PARTNER_ID; // Merchant ID PayPal du compte Partenaire Diaspo'Actif
const IS_LIVE = process.env.PAYPAL_MODE === "live";
const API_BASE = IS_LIVE ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

const paypalPartnerEnabled = !!(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET && PAYPAL_PARTNER_ID);

if (paypalPartnerEnabled) {
  console.log(`[PayPal Partner] Onboarding des vendeurs activé en mode ${IS_LIVE ? "LIVE" : "SANDBOX"}.`);
} else {
  console.log("[PayPal Partner] PAYPAL_PARTNER_ID absent — onboarding des vendeurs PayPal désactivé (l'encaissement PayPal simple n'est pas affecté).");
}

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

/* Démarre l'onboarding d'un vendeur. trackingId = identifiant Diaspo'Actif qu'on retrouve au
   retour (ici : l'id de l'Initiative). Renvoie l'URL à laquelle rediriger le vendeur pour qu'il
   crée ou relie son propre compte PayPal — équivalent de stripe.accountLinks.create(). */
async function creerReferral({ trackingId, returnUrl }) {
  if (!paypalPartnerEnabled) throw new Error("Onboarding PayPal désactivé (programme Partenaire non configuré).");
  const token = await getAccessToken();
  const r = await fetch(`${API_BASE}/v2/customer/partner-referrals`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      tracking_id: String(trackingId),
      partner_config_override: { return_url: returnUrl },
      operations: [{
        operation: "API_INTEGRATION",
        api_integration_preference: {
          rest_api_integration: {
            integration_method: "PAYPAL",
            integration_type: "THIRD_PARTY",
            third_party_details: { features: ["PAYMENT", "REFUND"] },
          },
        },
      }],
      products: ["PPCP"],
      legal_consents: [{ type: "SHARE_DATA_CONSENT", granted: true }],
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`PayPal partner-referrals ${r.status} : ${JSON.stringify(data)}`);
  const actionUrl = (data.links || []).find(l => l.rel === "action_url")?.href;
  if (!actionUrl) throw new Error("PayPal partner-referrals : action_url absente de la réponse.");
  return { actionUrl };
}

/* État de l'intégration d'un vendeur déjà onboardé — à appeler quand il revient sur return_url
   (PayPal y ajoute merchantIdInPayPal en paramètre) pour savoir s'il peut réellement encaisser. */
async function statutMarchand(merchantIdInPayPal) {
  if (!paypalPartnerEnabled) throw new Error("Onboarding PayPal désactivé (programme Partenaire non configuré).");
  const token = await getAccessToken();
  const r = await fetch(`${API_BASE}/v1/customer/partners/${PAYPAL_PARTNER_ID}/merchant-integrations/${encodeURIComponent(merchantIdInPayPal)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`PayPal merchant-integrations ${r.status} : ${JSON.stringify(data)}`);
  return {
    paymentsReceivable: !!data.payments_receivable,
    emailConfirmed: !!data.primary_email_confirmed,
    merchantId: data.merchant_id || merchantIdInPayPal,
  };
}

module.exports = { paypalPartnerEnabled, IS_LIVE, creerReferral, statutMarchand, PAYPAL_PARTNER_ID };

/* ── Adaptateur PayPal pour la couche de paiement commune (server/payments) ──
   Enveloppe fine autour de server/paypal-client.js. PayPal Orders v2 ne prend qu'un montant
   agrégé par purchase_unit (pas de vrai détail ligne par ligne côté PayPal) : lineItems sert
   uniquement à construire une description lisible, jamais une vraie facture détaillée. */
const { paypalEnabled, createOrder, captureOrder } = require("../paypal-client");

const code = "paypal";
const label = "PayPal";

function isConfigured() {
  return paypalEnabled;
}

async function createCheckoutSession({ devise, lineItems, customId, successUrl, cancelUrl }) {
  if (!paypalEnabled) throw new Error("Module PayPal désactivé (clés absentes).");
  const montant = parseFloat(lineItems.reduce((s, li) => s + Number(li.montantUnitaire) * (li.quantite || 1), 0).toFixed(2));
  const description = lineItems.length === 1
    ? `${lineItems[0].nom}${lineItems[0].quantite > 1 ? ` (x${lineItems[0].quantite})` : ""}`
    : `Panier Diaspo'Actif (${lineItems.length} article${lineItems.length > 1 ? "s" : ""})`;
  const order = await createOrder({ amount: montant, currency: devise, description, custom_id: customId, return_url: successUrl, cancel_url: cancelUrl });
  return { providerSessionId: order.id, checkoutUrl: order.approveUrl };
}

module.exports = { code, label, isConfigured, createCheckoutSession, captureOrder };

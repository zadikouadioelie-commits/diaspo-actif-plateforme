/* ── Adaptateur Stripe pour la couche de paiement commune (server/payments) ──
   Enveloppe fine autour de server/stripe-client.js : ne change aucun comportement, centralise
   juste la construction de la session Checkout qui était dupliquée dans
   POST /api/produits/:id/commander et POST /api/panier/commander (server/index.js). */
const { stripe, getOrCreateStripeCustomer } = require("../stripe-client");

const code = "stripe";
const label = "Carte bancaire";

function isConfigured() {
  return !!stripe;
}

/* lineItems: [{ nom, montantUnitaire, quantite }] — montantUnitaire en unité principale (ex. 12.50),
   converti ici en centimes comme l'exige Stripe. metadata : objet simple string->string. */
async function createCheckoutSession({ db, user, devise, lineItems, metadata, successUrl, cancelUrl, enregistrerCarte }) {
  if (!stripe) throw new Error("Module Stripe désactivé (clé absente).");
  const customerId = await getOrCreateStripeCustomer(db, user);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer: customerId,
    line_items: lineItems.map(li => ({
      price_data: {
        currency: devise.toLowerCase(),
        unit_amount: Math.round(Number(li.montantUnitaire) * 100),
        product_data: { name: li.nom },
      },
      quantity: li.quantite || 1,
    })),
    ...(enregistrerCarte ? { payment_intent_data: { setup_future_usage: "off_session" } } : {}),
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
  return { providerSessionId: session.id, checkoutUrl: session.url };
}

module.exports = { code, label, isConfigured, createCheckoutSession };

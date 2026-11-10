/* ── Adaptateur Stripe pour la couche de paiement commune (server/payments) ──
   Enveloppe fine autour de server/stripe-client.js : ne change aucun comportement, centralise
   juste la construction de la session Checkout qui était dupliquée dans
   POST /api/produits/:id/commander et POST /api/panier/commander (server/index.js). */
const { stripe } = require("../stripe-client");

const code = "stripe";
const label = "Carte bancaire";

function isConfigured() {
  return !!stripe;
}

/* lineItems: [{ nom, montantUnitaire, quantite }] — montantUnitaire en unité principale (ex. 12.50),
   converti ici en centimes comme l'exige Stripe. metadata : objet simple string->string.

   PAIEMENT DIRECT AU COMMERÇANT (décision du 2026-11-10) : la session est créée SUR le compte
   Stripe Connect du vendeur (en-tête Stripe-Account = beneficiaire.compte, « direct charge »).
   L'argent est donc encaissé par le commerçant ; Diaspo'Actif ne reçoit que la commission
   (application_fee_amount, calculée par server/commission.js). Aucun transit sur le compte de la
   plateforme. Conséquence : le client Stripe de la plateforme n'existe pas sur le compte du
   vendeur — on passe l'e-mail de l'acheteur (customer_email) et l'enregistrement de carte
   (setup_future_usage) n'est pas proposé pour ces paiements. */
async function createCheckoutSession({ user, devise, lineItems, metadata, successUrl, cancelUrl, beneficiaire, commission }) {
  if (!stripe) throw new Error("Module Stripe désactivé (clé absente).");
  if (!beneficiaire?.compte) throw new Error("Compte Stripe du commerçant absent : paiement direct impossible.");
  const fraisCentimes = Math.round(Number(commission || 0) * 100);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(user?.email ? { customer_email: user.email } : {}),
    line_items: lineItems.map(li => ({
      price_data: {
        currency: devise.toLowerCase(),
        unit_amount: Math.round(Number(li.montantUnitaire) * 100),
        product_data: { name: li.nom },
      },
      quantity: li.quantite || 1,
    })),
    payment_intent_data: {
      ...(fraisCentimes > 0 ? { application_fee_amount: fraisCentimes } : {}),
      metadata,
    },
    metadata,
    success_url: successUrl,
    cancel_url: cancelUrl,
  }, { stripeAccount: beneficiaire.compte });
  return { providerSessionId: session.id, checkoutUrl: session.url };
}

module.exports = { code, label, isConfigured, createCheckoutSession };

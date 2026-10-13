/* ── Registre des prestataires de paiement (server/payments) ──
   Point d'entrée unique pour savoir QUELS prestataires sont réellement utilisables : un
   prestataire doit être (a) configuré (clés API présentes — stripeProvider.isConfigured()) ET
   (b) activé par l'administrateur (payment_methods_config.actif, piloté depuis
   paiements-admin.html). Avant ce module, l'interrupteur admin était purement cosmétique :
   POST /api/produits/:id/commander et POST /api/panier/commander acceptaient n'importe quel
   provider tant que ses clés API étaient configurées, sans jamais vérifier
   payment_methods_config (2026-10-13, trouvé en comparant le cahier des charges § 6 au code).

   Ajouter un prestataire (ex. Mobile Money) = ajouter un module `xxx-provider.js` du même
   contrat (code/label/isConfigured/createCheckoutSession) et une ligne dans PROVIDERS —
   jamais toucher aux routes de commande, qui n'appellent plus que ce registre. */
const stripeProvider = require("./stripe-provider");
const paypalProvider = require("./paypal-provider");

const PROVIDERS = [stripeProvider, paypalProvider];

/* payment_methods_config garde ses codes historiques ('carte','paypal','virement' — colonne
   CHECK en base, coûteux à migrer pour un simple renommage cosmétique) alors que
   commandes_vitrine.provider et ce registre utilisent les codes techniques réels ('stripe',
   'paypal'). Cette correspondance est LA seule traduction entre les deux mondes.
   'virement' n'a jamais eu de parcours de paiement réel codé nulle part (aucune route ne sait
   encaisser un virement) : volontairement absent d'AUCUN prestataire ci-dessous, donc jamais
   proposé à l'achat même si un admin l'active par erreur dans l'ancienne liste. */
const CONFIG_CODE_BY_PROVIDER = { stripe: "carte", paypal: "paypal" };

function getProvider(code) {
  return PROVIDERS.find(p => p.code === code) || null;
}

async function configActif(db, providerCode) {
  const configCode = CONFIG_CODE_BY_PROVIDER[providerCode];
  if (!configCode) return false;
  const row = await db.prepare("SELECT actif FROM payment_methods_config WHERE code=?").get(configCode);
  // Pas de ligne = jamais configuré par un admin → actif par défaut (comportement identique à avant ce module).
  return row ? !!row.actif : true;
}

/* Un prestataire est utilisable pour une commande s'il est configuré (clés API) ET activé
   (admin). Pays/devise : prévu pour une restriction par pays du vendeur (cahier des charges
   § 2 et § 6) — non appliqué en Phase 1 (Stripe et PayPal couvrent large), le paramètre existe
   déjà pour que la Phase "Mobile Money" n'ait qu'à enrichir cette seule fonction. */
async function isProviderAllowed(db, providerCode, { pays, devise } = {}) {
  const provider = getProvider(providerCode);
  if (!provider || !provider.isConfigured()) return false;
  return configActif(db, providerCode);
}

async function listAvailable(db, { pays, devise } = {}) {
  const dispo = [];
  for (const p of PROVIDERS) {
    if (p.isConfigured() && await configActif(db, p.code)) dispo.push({ code: p.code, label: p.label });
  }
  return dispo;
}

module.exports = { PROVIDERS, getProvider, isProviderAllowed, listAvailable, CONFIG_CODE_BY_PROVIDER };

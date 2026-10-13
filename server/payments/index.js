/* ── Couche de paiement indépendante du prestataire — point d'entrée ──
   server/index.js n'importe plus jamais stripe-client/paypal-client directement pour un
   paiement de boutique : tout passe par ce module (cahier des charges § 8 : "interface commune
   pour connecter plusieurs prestataires... possibilité d'ajouter un prestataire sans modifier
   le fonctionnement des boutiques"). */
const registry = require("./registry");
const stripeProvider = require("./stripe-provider");
const paypalProvider = require("./paypal-provider");

/* Vocabulaire canonique des statuts de paiement (cahier des charges § 4). commandes_vitrine.
   paiement_statut reste une colonne TEXT libre (comme partout ailleurs dans ce projet, voir
   STATUTS_PROJETS_DA) : ces constantes évitent les fautes de frappe, rien de plus.
   EN_ATTENTE/PAYE/ECHOUE/EXPIRE : utilisés dès cette phase (fondations).
   EN_COURS/REMBOURSEMENT_EN_COURS/REMBOURSE/VERIFICATION_MANUELLE : vocabulaire réservé aux
   phases suivantes (remboursements, incidents vendeur) — déclarés ici pour que leur orthographe
   soit fixée une seule fois, pas encore produits par aucune route. */
const STATUT_PAIEMENT = {
  EN_ATTENTE: "en_attente",
  EN_COURS: "en_cours",
  PAYE: "paye",
  ECHOUE: "echoue",
  EXPIRE: "expire",
  REMBOURSEMENT_EN_COURS: "remboursement_en_cours",
  REMBOURSE: "rembourse",
  VERIFICATION_MANUELLE: "verification_manuelle",
};

/* Crée une session de paiement auprès du prestataire demandé — remplace les blocs
   if (provider==='paypal') {...} else {...} qui étaient dupliqués dans
   POST /api/produits/:id/commander et POST /api/panier/commander. Lève une erreur si le
   prestataire n'est pas réellement disponible (clés absentes OU désactivé par l'admin) :
   à l'appelant de vérifier registry.isProviderAllowed() AVANT de créer la ligne commandes_vitrine
   (même garde qu'avant ce module, pour ne jamais laisser une commande 'en_attente' orpheline).
   opts communs : { db, user, providerCode, devise, lineItems, metadata, customId, successUrl, cancelUrl, enregistrerCarte } */
async function creerSessionPaiement(opts) {
  const provider = registry.getProvider(opts.providerCode);
  if (!provider) throw new Error(`Prestataire de paiement inconnu : ${opts.providerCode}`);
  return provider.createCheckoutSession(opts);
}

module.exports = {
  STATUT_PAIEMENT,
  registry,
  stripeProvider,
  paypalProvider,
  creerSessionPaiement,
  isProviderAllowed: registry.isProviderAllowed,
  listAvailable: registry.listAvailable,
};

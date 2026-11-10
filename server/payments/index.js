/* ── Couche de paiement indépendante du prestataire — point d'entrée ──
   server/index.js n'importe plus jamais stripe-client/paypal-client directement pour un
   paiement de boutique : tout passe par ce module (cahier des charges § 8 : "interface commune
   pour connecter plusieurs prestataires... possibilité d'ajouter un prestataire sans modifier
   le fonctionnement des boutiques"). */
const registry = require("./registry");
const { TAUX_COMMISSION } = require("../commission");
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
  /* Paiement DIRECT au commerçant (2026-11-10) : le bénéficiaire est toujours résolu ici, jamais
     fourni par l'appelant, et la commission vient de server/commission.js (source unique). */
  const beneficiaire = await verifierBeneficiaire(opts.db, opts.providerCode, opts.initiativeId);
  const total = (opts.lineItems || []).reduce((s, li) => s + Number(li.montantUnitaire) * (li.quantite || 1), 0);
  const commission = calculerCommission(total);
  return provider.createCheckoutSession({ ...opts, beneficiaire, commission });
}

/* Commission de la plateforme sur un montant (unité principale, arrondi au centime). */
function calculerCommission(montant) {
  return parseFloat((Math.round(Number(montant || 0) * TAUX_COMMISSION * 100) / 100).toFixed(2));
}

/* Retrouve le compte du commerçant (Stripe Connect ou PayPal Partner) auquel l'argent doit aller,
   et vérifie qu'il peut réellement encaisser. Lève une erreur de code BENEFICIAIRE_NON_PRET sinon :
   à appeler AVANT de créer la ligne commandes_vitrine (même esprit que isProviderAllowed), pour ne
   jamais laisser une commande « en_attente » orpheline ni encaisser sur le compte de la plateforme. */
async function verifierBeneficiaire(db, providerCode, initiativeId) {
  const refus = (msg) => { const e = new Error(msg); e.code = "BENEFICIAIRE_NON_PRET"; return e; };
  if (!initiativeId) throw refus("Commerçant inconnu : paiement direct impossible.");
  if (providerCode === "paypal") {
    const r = await db.prepare("SELECT merchant_id_paypal, payments_receivable, statut FROM paypal_connect_accounts WHERE initiative_id=?").get(initiativeId);
    if (!r || !r.merchant_id_paypal || r.statut !== "active" || !r.payments_receivable) {
      throw refus("Ce vendeur n'a pas encore activé la réception des paiements par PayPal.");
    }
    return { fournisseur: "paypal", compte: r.merchant_id_paypal };
  }
  const r = await db.prepare("SELECT stripe_account_id, charges_enabled, statut FROM stripe_connect_accounts WHERE initiative_id=?").get(initiativeId);
  if (!r || !r.stripe_account_id || r.statut !== "active" || !r.charges_enabled) {
    throw refus("Ce vendeur n'a pas encore activé la réception des paiements par carte.");
  }
  return { fournisseur: "stripe", compte: r.stripe_account_id };
}

module.exports = {
  STATUT_PAIEMENT,
  registry,
  stripeProvider,
  paypalProvider,
  creerSessionPaiement,
  verifierBeneficiaire,
  calculerCommission,
  isProviderAllowed: registry.isProviderAllowed,
  listAvailable: registry.listAvailable,
};

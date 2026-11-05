/* Couverture géographique des prestataires de paiement (server/payments) — 2026-11-02, demande
   explicite : « si un compte qui est couvert [par Stripe] ne [choisit pas de moyen
   d'encaissement], il n'a aucun autre moyen de recevoir de l'argent... il faut lui dire. »
   Sert à décider si le choix d'un moyen d'encaissement (Stripe Connect aujourd'hui, PayPal/Mobile
   Money demain) doit devenir OBLIGATOIRE avant la mise en ligne d'une boutique, plutôt que de
   laisser un repli silencieux sur le portefeuille interne — réservé aux pays réellement non
   couverts.

   Liste volontairement prudente (pays où Stripe Connect est confirmé disponible) — à vérifier/
   étendre sur https://stripe.com/global avant d'ajouter un pays. Sous-estimer cette liste est
   sans risque (le vendeur reste simplement sur le portefeuille, comme aujourd'hui) ; la
   sur-estimer bloquerait à tort un vendeur qui n'est pas réellement couvert — donc on ne liste
   que les pays confirmés. */
"use strict";

const PAYS_STRIPE_CONNECT = new Set([
  // Europe de l'Ouest
  "FR", "BE", "CH", "LU", "DE", "AT", "NL", "ES", "PT", "IT", "IE", "GB", "GI", "LI",
  // Europe du Nord
  "DK", "SE", "NO", "FI", "EE", "LV", "LT",
  // Europe centrale et de l'Est
  "PL", "CZ", "SK", "SI", "HR", "HU", "RO", "BG", "GR", "CY", "MT",
  // Amérique du Nord
  "US", "CA",
  // Océanie
  "AU", "NZ",
  // Asie
  "JP", "SG", "HK", "MY", "TH", "IN", "ID", "PH",
  // Moyen-Orient / Afrique
  "AE", "ZA",
  // Amérique latine
  "BR", "MX",
]);

function couvertStripe(codePays) {
  if (!codePays) return false;
  return PAYS_STRIPE_CONNECT.has(String(codePays).trim().toUpperCase());
}

/* Prestataire à recommander pour un pays donné, selon la couverture connue. Renvoie null si
   aucun prestataire actuel ne couvre ce pays (le portefeuille interne reste alors le seul moyen,
   sans que ce soit considéré comme un choix évité par le vendeur). */
function prestataireRecommande(codePays) {
  if (couvertStripe(codePays)) return "stripe";
  return null;
}

module.exports = { PAYS_STRIPE_CONNECT, couvertStripe, prestataireRecommande };

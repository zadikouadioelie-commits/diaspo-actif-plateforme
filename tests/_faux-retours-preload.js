/* Faux Stripe pour les tests de remboursement (lot G) : reprend tests/_faux-stripe-preload.js et y ajoute
   - checkout.sessions.retrieve → renvoie un payment_intent (le serveur le lit sur le compte du vendeur) ;
   - refunds.create   → crée un remboursement « pending » et journalise l'appel (params + options) dans FAUX_REFUNDS_LOG ;
   - refunds.retrieve → renvoie l'état écrit par le test dans FAUX_REFUNDS_ETATS ({ "re_faux_1": "succeeded" }), « pending » sinon.
   Aucune requête réseau. (Fichier sans suffixe .test.js : le lanceur de tests ne l'exécute pas lui-même.) */
const path = require('node:path');
const fs = require('node:fs');

require('./_faux-stripe-preload');
const chemin = path.join(__dirname, '..', 'server', 'stripe-client.js');
const stripe = require.cache[chemin].exports.stripe;

let compteur = 0;
const journaliser = (ligne) => {
  if (!process.env.FAUX_REFUNDS_LOG) return;
  try { fs.appendFileSync(process.env.FAUX_REFUNDS_LOG, JSON.stringify(ligne) + '\n'); } catch (e) { /* sans importance */ }
};
const lireEtats = () => {
  try { return JSON.parse(fs.readFileSync(process.env.FAUX_REFUNDS_ETATS, 'utf8')); } catch (e) { return {}; }
};

stripe.checkout.sessions.retrieve = async (id, params, options) => {
  journaliser({ appel: 'sessions.retrieve', id, options });
  return { id, status: 'complete', payment_intent: 'pi_faux_' + id };
};
stripe.refunds = {
  async create(params, options) {
    const id = 're_faux_' + (++compteur);
    journaliser({ appel: 'refunds.create', id, params, options });
    return { id, status: 'pending', amount: params.amount, payment_intent: params.payment_intent };
  },
  async retrieve(id, params, options) {
    journaliser({ appel: 'refunds.retrieve', id, options });
    return { id, status: lireEtats()[id] || 'pending' };
  },
};

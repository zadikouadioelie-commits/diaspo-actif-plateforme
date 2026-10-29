/* Faux client Stripe pour les tests d'intégration (chargé via NODE_OPTIONS=--require dans le serveur lancé par le harnais).
   Aucune requête réseau : les sessions Checkout vivent en mémoire dans le processus du serveur, les tests lisent l'effet dans la base.
   (Fichier sans suffixe .test.js : le lanceur de tests ne l'exécute pas lui-même.) */
const path = require('node:path');

const chemin = path.join(__dirname, '..', 'server', 'stripe-client.js');
const sessions = {};
let compteur = 0;

const fauxStripe = {
  checkout: {
    sessions: {
      async create(o) {
        const id = 'cs_test_faux_' + (++compteur);
        sessions[id] = { id, status: 'open', url: 'https://stripe.test/pay/' + id, metadata: o.metadata, montant: o.line_items[0].price_data.unit_amount };
        return sessions[id];
      },
      async retrieve(id) {
        if (!sessions[id]) { const e = new Error('No such checkout.session'); e.code = 'resource_missing'; throw e; }
        return sessions[id];
      },
      async expire(id) {
        if (!sessions[id]) { const e = new Error('No such checkout.session'); e.code = 'resource_missing'; throw e; }
        sessions[id].status = 'expired';
        return sessions[id];
      },
    },
  },
};

require.cache[chemin] = {
  id: chemin, filename: chemin, loaded: true, children: [], paths: [],
  exports: { stripe: fauxStripe, IS_LIVE_KEY: false, async ping() { return { ok: true }; }, async getOrCreateStripeCustomer() { return 'cus_test_faux'; } },
};

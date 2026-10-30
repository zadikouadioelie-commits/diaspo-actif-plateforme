/* Faux client Stripe pour les tests d'intégration (chargé via NODE_OPTIONS=--require dans le serveur lancé par le harnais).
   Aucune requête réseau : les sessions Checkout vivent en mémoire dans le processus du serveur, les tests lisent l'effet dans la base.
   (Fichier sans suffixe .test.js : le lanceur de tests ne l'exécute pas lui-même.) */
const path = require('node:path');

const chemin = path.join(__dirname, '..', 'server', 'stripe-client.js');
const sessions = {};
let compteur = 0;

const fauxStripe = {
  /* Les tests envoient un événement JSON non signé à POST /api/stripe/webhook (STRIPE_WEBHOOK_SECRET factice posé par le test) : aucune vérification de signature ici, jamais en production. */
  webhooks: { constructEvent(brut) { return JSON.parse(Buffer.isBuffer(brut) ? brut.toString('utf8') : String(brut)); } },
  checkout: {
    sessions: {
      async create(o) {
        const id = 'cs_test_faux_' + (++compteur);
        sessions[id] = { id, status: 'open', url: 'https://stripe.test/pay/' + id, metadata: o.metadata, custom_text: o.custom_text, success_url: o.success_url, cancel_url: o.cancel_url, montant: o.line_items[0].price_data.unit_amount };
        /* Optionnel : un test peut relire les sessions créées (le serveur est un autre processus) via FAUX_STRIPE_LOG=<fichier>. */
        if (process.env.FAUX_STRIPE_LOG) { try { require('node:fs').appendFileSync(process.env.FAUX_STRIPE_LOG, JSON.stringify(sessions[id]) + '\n'); } catch (e) { /* sans importance */ } }
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

/* ===========================================================
   tests/paiement-direct.test.js — Paiement direct au commerçant (2026-11-10)
   ===========================================================
   Vérifie, sans réseau ni vraie clé, que la couche de paiement (server/payments) :
   - envoie la session Stripe SUR le compte du vendeur (stripeAccount) avec la commission en frais d'application ;
   - envoie la commande PayPal avec le vendeur comme bénéficiaire et la commission en frais de plateforme ;
   - refuse (BENEFICIAIRE_NON_PRET) un vendeur sans compte actif, au lieu d'encaisser sur le compte de la plateforme ;
   - calcule la commission depuis server/commission.js (source unique), arrondie au centime.
   Tout est simulé : aucun paiement réel.

   Lancer : node --test tests/paiement-direct.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const RACINE = path.join(__dirname, '..');
const appelsStripe = [];
const appelsPaypal = [];

/* Faux clients injectés AVANT le chargement des adaptateurs. */
const cheminStripe = path.join(RACINE, 'server', 'stripe-client.js');
require.cache[cheminStripe] = {
  id: cheminStripe, filename: cheminStripe, loaded: true, children: [], paths: [],
  exports: {
    stripe: { checkout: { sessions: { async create(corps, options) {
      appelsStripe.push({ corps, options });
      return { id: 'cs_test_direct_1', url: 'https://stripe.test/pay/cs_test_direct_1' };
    } } } },
    IS_LIVE_KEY: false,
  },
};
const cheminPaypal = path.join(RACINE, 'server', 'paypal-client.js');
require.cache[cheminPaypal] = {
  id: cheminPaypal, filename: cheminPaypal, loaded: true, children: [], paths: [],
  exports: {
    paypalEnabled: true, IS_LIVE: false,
    async createOrder(o) { appelsPaypal.push(o); return { id: 'ORDER_TEST_1', approveUrl: 'https://paypal.test/approve/ORDER_TEST_1' }; },
    async captureOrder() { return {}; },
  },
};

const paiements = require(path.join(RACINE, 'server', 'payments', 'index.js'));
const { TAUX_COMMISSION } = require(path.join(RACINE, 'server', 'commission.js'));

/* Fausse base : renvoie la ligne voulue selon la table interrogée. */
function fausseBase({ stripe, paypal }) {
  return { prepare(sql) {
    return { async get() {
      if (/stripe_connect_accounts/.test(sql)) return stripe;
      if (/paypal_connect_accounts/.test(sql)) return paypal;
      return undefined;
    } };
  } };
}
const VENDEUR_STRIPE = { stripe_account_id: 'acct_vendeur_123', charges_enabled: 1, statut: 'active' };
const VENDEUR_PAYPAL = { merchant_id_paypal: 'MERCHANT_VENDEUR_1', payments_receivable: 1, statut: 'active' };
const ARTICLES = [{ nom: 'Savon', montantUnitaire: 12.5, quantite: 2 }, { nom: 'Crème', montantUnitaire: 30, quantite: 1 }];
const COMMUN = { initiativeId: 7, devise: 'EUR', lineItems: ARTICLES, metadata: { commande: '42' }, customId: 'cmd-42',
  successUrl: 'https://exemple.test/ok', cancelUrl: 'https://exemple.test/annule', user: { email: 'acheteur@exemple.test' } };

test('la commission vient de server/commission.js et est arrondie au centime', () => {
  assert.equal(paiements.calculerCommission(55), parseFloat((55 * TAUX_COMMISSION).toFixed(2)));
  assert.equal(paiements.calculerCommission(0), 0);
  assert.equal(paiements.calculerCommission(0.01), 0);
  assert.equal(paiements.calculerCommission(33.33), parseFloat((Math.round(33.33 * TAUX_COMMISSION * 100) / 100).toFixed(2)));
});

test('Stripe : la session est créée sur le compte du vendeur, avec la commission en frais d\'application', async () => {
  appelsStripe.length = 0;
  const r = await paiements.creerSessionPaiement({ ...COMMUN, providerCode: 'stripe', db: fausseBase({ stripe: VENDEUR_STRIPE }) });
  assert.equal(r.providerSessionId, 'cs_test_direct_1');
  assert.equal(appelsStripe.length, 1);
  const { corps, options } = appelsStripe[0];
  assert.deepEqual(options, { stripeAccount: 'acct_vendeur_123' }, 'paiement direct : encaissé par le vendeur');
  assert.equal(corps.payment_intent_data.application_fee_amount, Math.round(paiements.calculerCommission(55) * 100));
  assert.equal(corps.line_items[0].price_data.unit_amount, 1250);
  assert.equal(corps.line_items[0].quantity, 2);
  assert.equal(corps.customer_email, 'acheteur@exemple.test');
  assert.equal(corps.customer, undefined, 'pas de client de la plateforme sur le compte du vendeur');
  assert.equal(corps.payment_intent_data.setup_future_usage, undefined, 'pas d\'enregistrement de carte en paiement direct');
});

test('PayPal : le vendeur est le bénéficiaire, la commission est un frais de plateforme', async () => {
  appelsPaypal.length = 0;
  const r = await paiements.creerSessionPaiement({ ...COMMUN, providerCode: 'paypal', db: fausseBase({ paypal: VENDEUR_PAYPAL }) });
  assert.equal(r.providerSessionId, 'ORDER_TEST_1');
  assert.equal(appelsPaypal.length, 1);
  const o = appelsPaypal[0];
  assert.equal(o.payee_merchant_id, 'MERCHANT_VENDEUR_1');
  assert.equal(o.platform_fee, paiements.calculerCommission(55));
  assert.equal(o.amount, 55);
  assert.equal(o.currency, 'EUR');
});

test('un vendeur sans compte actif est refusé (jamais d\'encaissement sur le compte de la plateforme)', async () => {
  appelsStripe.length = 0; appelsPaypal.length = 0;
  const cas = [
    ['stripe', { stripe: undefined }],
    ['stripe', { stripe: { ...VENDEUR_STRIPE, charges_enabled: 0 } }],
    ['stripe', { stripe: { ...VENDEUR_STRIPE, statut: 'en_attente' } }],
    ['stripe', { stripe: { ...VENDEUR_STRIPE, stripe_account_id: null } }],
    ['paypal', { paypal: undefined }],
    ['paypal', { paypal: { ...VENDEUR_PAYPAL, payments_receivable: 0 } }],
    ['paypal', { paypal: { ...VENDEUR_PAYPAL, statut: 'suspendu' } }],
  ];
  for (const [code, lignes] of cas) {
    await assert.rejects(
      paiements.creerSessionPaiement({ ...COMMUN, providerCode: code, db: fausseBase(lignes) }),
      (e) => e.code === 'BENEFICIAIRE_NON_PRET',
      `${code} ${JSON.stringify(lignes)} doit être refusé`);
  }
  assert.equal(appelsStripe.length + appelsPaypal.length, 0, 'aucune session créée chez le prestataire');
});

test('un commerçant inconnu est refusé', async () => {
  await assert.rejects(
    paiements.creerSessionPaiement({ ...COMMUN, initiativeId: null, providerCode: 'stripe', db: fausseBase({ stripe: VENDEUR_STRIPE }) }),
    (e) => e.code === 'BENEFICIAIRE_NON_PRET');
});

test('le bénéficiaire est résolu côté serveur : un bénéficiaire fourni par l\'appelant est ignoré', async () => {
  appelsStripe.length = 0;
  await paiements.creerSessionPaiement({ ...COMMUN, providerCode: 'stripe', db: fausseBase({ stripe: VENDEUR_STRIPE }),
    beneficiaire: { compte: 'acct_pirate' }, commission: 0 });
  assert.deepEqual(appelsStripe[0].options, { stripeAccount: 'acct_vendeur_123' });
  assert.ok(appelsStripe[0].corps.payment_intent_data.application_fee_amount > 0, 'la commission n\'est pas modifiable par l\'appelant');
});

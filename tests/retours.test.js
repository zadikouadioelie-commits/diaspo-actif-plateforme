/* ===========================================================
   tests/retours.test.js — Réclamations, retours sous 15 jours, litiges et remboursements (lot G, 2026-11-10)
   ===========================================================
   Points d'acceptation 5.4 du dossier (05-tests-acceptation.md) :
   4.1 formulaire : détail < 20 caractères et photo > 1 Mo refusés
   4.2 dossier « envoyée » à 14 jours sans réponse du vendeur : inchangé
   4.3 à 15 jours (calcul serveur) : « litige », le vendeur ne peut plus agir
   4.4 l'administrateur voit boutique, plaignant, produit, motif, description, photo, historique
   4.5 remboursement « effectué » SEULEMENT après la confirmation du prestataire (faux Stripe, faux PayPal)
   4.6 le montant du remboursement est recalculé côté serveur
   4.7 historique complet, horodaté par le serveur, jamais modifié
   4.8 le client voit ses demandes et répond aux précisions
   + remboursement depuis le compte du commerçant (paiement direct), ancienne commande encaissée par la plateforme, échec du prestataire,
     relecture par la tâche planifiée, accès (un tiers ne voit rien), tâche protégée par le secret.
   Intégration : vrai serveur + copie isolée de la base de dev ; aucun paiement réel, aucune clé réelle.
   Lancer : node --test tests/retours.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const http = require('node:http');
const H = require('./_formation-harness');
const Config = require('../server/retours-config');

const JOUR = 86400000;
const il_y_a = (j) => new Date(Date.now() - j * JOUR).toISOString().slice(0, 19).replace('T', ' ');
const PNG_1PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const DETAIL = 'Le tissu est déchiré au niveau de la couture gauche dès la réception.';

let env, port, paypal, fichiers, rnd;
const jarAdmin = H.cookieJar();
let adminId, vendeur, initId, produitId;

/* Faux PayPal : serveur HTTP local ; l'état du remboursement est piloté par le test. */
function demarrerFauxPaypal() {
  const etat = { refunds: {}, appels: [], statut: 'PENDING' };
  const srv = http.createServer((req, res) => {
    let corps = '';
    req.on('data', (c) => { corps += c; });
    req.on('end', () => {
      etat.appels.push({ methode: req.method, url: req.url, assertion: req.headers['paypal-auth-assertion'], corps });
      const rep = (obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if (req.url === '/v1/oauth2/token') return rep({ access_token: 'jeton_faux' });
      if (req.method === 'GET' && req.url.startsWith('/v2/checkout/orders/')) return rep({ purchase_units: [{ payments: { captures: [{ id: 'CAPTURE_FAUSSE_1' }] } }] });
      if (req.method === 'POST' && /^\/v2\/payments\/captures\/[^/]+\/refund$/.test(req.url)) {
        const id = 'REFUND_FAUX_' + (Object.keys(etat.refunds).length + 1);
        etat.refunds[id] = { corps: JSON.parse(corps || '{}') };
        return rep({ id, status: 'PENDING' }, 201);
      }
      const m = req.url.match(/^\/v2\/payments\/refunds\/([^/]+)$/);
      if (req.method === 'GET' && m) return rep({ id: m[1], status: etat.statut });
      rep({ message: 'inconnu' }, 404);
    });
  });
  return new Promise((resolve) => srv.listen(0, '127.0.0.1', () => resolve({ srv, etat, port: srv.address().port })));
}

test.before(async () => {
  rnd = Math.random().toString(36).slice(2, 9);
  fichiers = {
    journal: path.join(os.tmpdir(), `faux-refunds-log-${process.pid}-${Date.now()}.txt`),
    etats: path.join(os.tmpdir(), `faux-refunds-etats-${process.pid}-${Date.now()}.json`),
  };
  fs.writeFileSync(fichiers.journal, '');
  fs.writeFileSync(fichiers.etats, '{}');
  paypal = await demarrerFauxPaypal();
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-retours-preload.js')).replace(/\\\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  process.env.CRON_SECRET = 'cron_test_factice';
  process.env.FAUX_REFUNDS_LOG = fichiers.journal;
  process.env.FAUX_REFUNDS_ETATS = fichiers.etats;
  process.env.PAYPAL_CLIENT_ID = 'client_faux';
  process.env.PAYPAL_CLIENT_SECRET = 'secret_faux';
  process.env.PAYPAL_API_BASE = `http://127.0.0.1:${paypal.port}`;
  env = await H.demarrer('retours');
  port = env.base;

  /* Administrateur (litiges) + vendeur propriétaire d'une boutique avec un produit */
  await H.creerFormateur(env, jarAdmin, rnd, 'Admin');
  adminId = sql('select id from users where email=?', H.compte(rnd, 'Admin', 'utilisateur').email)[0].id;
  vendeur = await nouveauCompte('Vendeur');
  initId = Number(inserer('initiatives', { nom: `Boutique Retours ${rnd}`, owner_user_id: vendeur.id }).lastInsertRowid);
  produitId = Number(inserer('produits_vitrine', { initiative_id: initId, nom: 'Robe wax', prix: 50, regle_retour_id: 'vet' }).lastInsertRowid);
  inserer('stripe_connect_accounts', { initiative_id: initId, stripe_account_id: 'acct_vendeur_retours' });
  inserer('paypal_connect_accounts', { initiative_id: initId, merchant_id_paypal: 'MERCHANT_RETOURS_1' });
});
test.after(() => {
  if (env) env.stop();
  if (paypal) paypal.srv.close();
  for (const f of Object.values(fichiers || {})) { try { fs.unlinkSync(f); } catch (e) { /* sans importance */ } }
});

/* ── Aides ── */
function sql(req, ...args) {
  const db = new H.DatabaseSync(env.dbPath);
  try {
    db.exec('PRAGMA busy_timeout=5000');
    return /^\s*select/i.test(req) ? db.prepare(req).all(...args) : db.prepare(req).run(...args);
  } finally { db.close(); }
}
/* INSERT en renseignant seulement les colonnes voulues + les colonnes obligatoires sans valeur par défaut. */
function inserer(table, valeurs) {
  const db = new H.DatabaseSync(env.dbPath);
  try {
    const obligatoires = db.prepare(`PRAGMA table_info(${table})`).all().filter((c) => c.notnull && c.dflt_value == null && !c.pk).map((c) => [c.name, c.type]);
    const tout = { ...valeurs };
    for (const [nom, type] of obligatoires) if (tout[nom] === undefined) tout[nom] = /INT|REAL/i.test(type) ? 0 : 'x';
    const noms = Object.keys(tout);
    return db.prepare(`INSERT INTO ${table} (${noms.join(',')}) VALUES (${noms.map(() => '?').join(',')})`).run(...noms.map((n) => tout[n]));
  } finally { db.close(); }
}
let compteurComptes = 0;
async function nouveauCompte(nom) {
  const jar = H.cookieJar();
  const nomUnique = nom + (++compteurComptes);
  await H.creerApprenant(env, jar, rnd, nomUnique);
  const id = sql('select id from users where email=?', H.compte(rnd, nomUnique, 'utilisateur').email)[0].id;
  return { jar, id };
}
/* Commande payée de 2 x 50 € + 5 € de livraison = 105 €. */
function commander({ acheteurId, direct = 1, provider = 'stripe', statut = 'paye', session = true }) {
  const n = ++compteurComptes;
  return Number(inserer('commandes_vitrine', {
    produit_id: produitId, initiative_id: initId, acheteur_id: acheteurId, quantite: 2, montant_total: 105, frais_livraison: 5,
    paiement_statut: statut, provider, paiement_direct: direct,
    stripe_session_id: provider === 'stripe' && session ? `cs_test_retours_${rnd}_${n}` : null,
    paypal_order_id: provider === 'paypal' ? `ORDER_RETOURS_${rnd}_${n}` : null,
  }).lastInsertRowid);
}
const appel = (jar, methode, url, corps) => env.call(jar, methode, url, corps);
async function ouvrir(acheteur, commandeId, extra = {}) {
  return appel(acheteur.jar, 'POST', '/api/retours', { commande_id: commandeId, motif: Config.MOTIFS[0], details: DETAIL, ...extra });
}
/* Un client, une commande payée et un dossier ouvert. */
async function nouveauDossier(options = {}) {
  const acheteur = await nouveauCompte('Client');
  const commandeId = commander({ acheteurId: acheteur.id, ...options });
  const r = await ouvrir(acheteur, commandeId, options.extra || {});
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { acheteur, commandeId, retourId: r.data.id };
}
const retour = (id) => sql('select * from retours where id=?', id)[0];
const commandeDb = (id) => sql('select * from commandes_vitrine where id=?', id)[0];
const refundDe = (retourId) => sql('select * from refunds where retour_id=? order by id desc', retourId)[0];
const evenements = (id) => sql('select * from dispute_events where retour_id=? order by id', id);
const journalStripe = () => fs.readFileSync(fichiers.journal, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
async function webhookRefund(type, refundId, statut, extra = {}) {
  return appel(null, 'POST', '/api/stripe/webhook', { id: 'evt_' + Math.random().toString(36).slice(2), type, data: { object: { id: refundId, status: statut, ...extra } } });
}
async function cron() {
  const res = await fetch(`${port}/api/cron/retours-escalade`, { headers: { Authorization: 'Bearer cron_test_factice' } });
  return { status: res.status, data: await res.json().catch(() => null) };
}

/* ═════════════ 4.1 Formulaire ═════════════ */
test('4.1 formulaire : champs obligatoires, détail ≥ 20 caractères, photo ≤ 1 Mo', async (t) => {
  const client = await nouveauCompte('Formulaire');
  const commandeId = commander({ acheteurId: client.id });

  await t.test('détail de moins de 20 caractères refusé', async () => {
    const r = await ouvrir(client, commandeId, { details: 'Trop court' });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /20/);
  });
  await t.test('motif absent de la liste refusé', async () => {
    const r = await ouvrir(client, commandeId, { motif: 'Parce que' });
    assert.equal(r.status, 400);
  });
  await t.test('photo de plus de 1 Mo refusée', async () => {
    const lourde = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Config.PHOTO_MAX_OCTETS + 10, 1)]).toString('base64');
    const r = await ouvrir(client, commandeId, { photo_base64: 'data:image/jpeg;base64,' + lourde });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /1 Mo/);
  });
  await t.test('un fichier qui n\'est pas une image est refusé', async () => {
    const r = await ouvrir(client, commandeId, { photo_base64: 'data:image/png;base64,' + Buffer.from('<script>alert(1)</script>').toString('base64') });
    assert.equal(r.status, 400);
  });
  assert.equal(sql('select count(*) n from retours where commande_id=?', commandeId)[0].n, 0, 'aucun dossier créé par une demande refusée');

  await t.test('demande valide avec photo : dossier « envoyée », vendeur prévenu', async () => {
    const r = await ouvrir(client, commandeId, { photo_base64: PNG_1PX });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const d = retour(r.data.id);
    assert.equal(d.statut, 'envoyee');
    assert.equal(d.produit_nom, 'Robe wax');
    assert.equal(Number(d.montant_commande), 105);
    assert.match(d.photo_url, /^data:image\/png;base64,/);
    assert.equal(d.regle_retour, 'Oui, sous 14 jours.');
    const notif = sql("select * from notifications where user_id=? and type='retour_nouveau' order by id desc", vendeur.id)[0];
    assert.ok(notif, 'le vendeur reçoit une notification');
  });
  await t.test('une seule demande ouverte par commande', async () => {
    const r = await ouvrir(client, commandeId);
    assert.equal(r.status, 409);
  });
});

test('4.1 bis : seule une commande payée DE L\'ACHETEUR peut faire l\'objet d\'une demande', async () => {
  const proprietaire = await nouveauCompte('Proprio');
  const intrus = await nouveauCompte('Intrus');
  const nonPayee = commander({ acheteurId: proprietaire.id, statut: 'en_attente' });
  assert.equal((await ouvrir(proprietaire, nonPayee)).status, 409, 'commande non payée');
  const payee = commander({ acheteurId: proprietaire.id });
  assert.equal((await ouvrir(intrus, payee)).status, 404, 'la commande d\'un autre');
  assert.equal((await appel(null, 'POST', '/api/retours', { commande_id: payee, motif: Config.MOTIFS[0], details: DETAIL })).status, 401, 'sans connexion');
});

/* ═════════════ 4.2 / 4.3 Délai de 15 jours ═════════════ */
test('4.2 / 4.3 délai de 15 jours calculé par le serveur', async (t) => {
  const refus = await nouveauDossier();
  const pris = await nouveauDossier();
  const precis = await nouveauDossier();

  await t.test('sans secret, la tâche planifiée est refusée', async () => {
    const res = await fetch(`${port}/api/cron/retours-escalade`);
    assert.equal(res.status, 401);
  });
  await t.test('14 jours sans réponse : le dossier reste « envoyée »', async () => {
    sql('update retours set derniere_activite_at=? where id=?', il_y_a(14), refus.retourId);
    const r = await cron();
    assert.equal(r.status, 200);
    assert.equal(retour(refus.retourId).statut, 'envoyee');
  });
  await t.test('un dossier en attente de précisions du client n\'est jamais escaladé', async () => {
    const p = await appel(vendeur.jar, 'POST', `/api/retours/${precis.retourId}/preciser`, { message: 'Pouvez-vous envoyer une photo de l\'étiquette ?' });
    assert.equal(p.status, 200);
    sql('update retours set derniere_activite_at=? where id=?', il_y_a(40), precis.retourId);
    await cron();
    assert.equal(retour(precis.retourId).statut, 'precisions');
  });
  await t.test('plus de 15 jours : « litige », historique et notifications', async () => {
    sql('update retours set derniere_activite_at=? where id=?', il_y_a(15.01), pris.retourId);
    const r = await cron();
    assert.equal(r.status, 200);
    assert.ok(r.data.escalade.transmis >= 1);
    assert.equal(retour(pris.retourId).statut, 'litige');
    const ev = evenements(pris.retourId).pop();
    assert.equal(ev.action, 'escalade_delai');
    assert.equal(ev.role, 'systeme');
    assert.ok(sql("select 1 from notifications where user_id=? and type='retour_litige'", pris.acheteur.id).length, 'le client est prévenu');
    assert.ok(sql("select 1 from notifications where user_id=? and type='retour_litige'", vendeur.id).length, 'le vendeur est prévenu');
    assert.ok(sql("select 1 from notifications where user_id=? and type='retour_litige'", adminId).length, 'l\'administrateur est prévenu');
  });
  await t.test('le vendeur ne peut plus agir sur un litige', async () => {
    for (const action of ['accepter', 'refuser', 'rembourser', 'preciser']) {
      const r = await appel(vendeur.jar, 'POST', `/api/retours/${pris.retourId}/${action}`, { motif: 'Refus du vendeur', message: 'Message du vendeur' });
      assert.equal(r.status, 409, action);
    }
    const r = await appel(vendeur.jar, 'POST', `/api/retours/${pris.retourId}/repondre`, { message: 'Tentative de réponse' });
    assert.equal(r.status, 409);
    assert.equal(retour(pris.retourId).statut, 'litige');
    const liste = await appel(vendeur.jar, 'GET', `/api/initiatives/${initId}/retours`);
    assert.equal(liste.data.retours.find((d) => d.id === pris.retourId).verrouille_vendeur, true);
  });
  await t.test('la tâche est idempotente : un dossier déjà en litige n\'est pas retraité', async () => {
    const avant = evenements(pris.retourId).length;
    await cron();
    assert.equal(evenements(pris.retourId).length, avant);
  });
});

/* ═════════════ 4.4 Vue de l'administrateur ═════════════ */
test('4.4 l\'administrateur voit tout le dossier ; les autres n\'y accèdent pas', async () => {
  const d = await nouveauDossier({ extra: { photo_base64: PNG_1PX } });
  sql('update retours set derniere_activite_at=? where id=?', il_y_a(16), d.retourId);
  await cron();
  const r = await appel(jarAdmin, 'GET', '/api/admin/litiges');
  assert.equal(r.status, 200);
  const l = r.data.litiges.find((x) => x.id === d.retourId);
  assert.ok(l, 'le litige est listé');
  assert.equal(l.boutique, `Boutique Retours ${rnd}`);
  assert.ok(l.plaignant && l.plaignant_email, 'plaignant identifié');
  assert.equal(l.produit, 'Robe wax');
  assert.equal(l.motif, Config.MOTIFS[0]);
  assert.equal(l.details, DETAIL);
  assert.match(l.photo, /^data:image\/png/);
  assert.ok(l.historique.length >= 2 && l.historique.every((e) => e.le && e.par), 'historique daté');
  assert.equal((await appel(d.acheteur.jar, 'GET', '/api/admin/litiges')).status, 403, 'un client n\'y accède pas');
  assert.equal((await appel(vendeur.jar, 'GET', '/api/admin/litiges')).status, 403, 'un vendeur n\'y accède pas');
  assert.equal((await appel(null, 'GET', '/api/admin/litiges')).status, 401);
  for (const action of ['rembourser', 'refuser', 'demander-pieces']) {
    assert.equal((await appel(vendeur.jar, 'POST', `/api/admin/litiges/${d.retourId}/${action}`, { message: 'Décision du vendeur' })).status, 403, action);
  }
});

/* ═════════════ 4.5 / 4.6 Remboursement confirmé par le prestataire ═════════════ */
test('4.5 / 4.6 remboursement Stripe : demandé depuis le compte du vendeur, confirmé seulement par Stripe', async (t) => {
  const d = await nouveauDossier();
  let refund;

  await t.test('le montant envoyé par le client est ignoré : il est recalculé par le serveur', async () => {
    const avant = journalStripe().length;
    const r = await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/rembourser`, { montant: 0.01, amount: 1, devise: 'USD' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.montant, 105);
    const creation = journalStripe().slice(avant).find((l) => l.appel === 'refunds.create');
    assert.ok(creation, 'Stripe est appelé');
    assert.equal(creation.params.amount, 10500, '105,00 € en centimes, jamais le montant reçu');
    assert.equal(creation.params.payment_intent, 'pi_faux_' + commandeDb(d.commandeId).stripe_session_id, 'le paiement est retrouvé par la session de la commande');
    assert.equal(creation.options.stripeAccount, 'acct_vendeur_retours', 'le remboursement part du compte du commerçant');
    assert.ok(creation.options.idempotencyKey, 'clé d\'idempotence');
    if (!Config.REMBOURSER_COMMISSION) assert.equal(creation.params.refund_application_fee, undefined);
  });
  await t.test('« remboursé » n\'est PAS écrit tant que Stripe n\'a pas confirmé', () => {
    refund = refundDe(d.retourId);
    assert.equal(refund.statut, 'en_cours');
    assert.equal(Number(refund.montant), 105);
    assert.equal(refund.compte_beneficiaire, 'acct_vendeur_retours');
    assert.equal(retour(d.retourId).statut, 'remboursement_en_cours');
    assert.equal(commandeDb(d.commandeId).paiement_statut, 'remboursement_en_cours');
    assert.equal(refund.confirme_at, null);
  });
  await t.test('une deuxième demande est refusée (jamais deux remboursements)', async () => {
    const r = await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/rembourser`, {});
    assert.equal(r.status, 409);
    assert.equal(sql('select count(*) n from refunds where retour_id=?', d.retourId)[0].n, 1);
  });
  await t.test('un événement « en attente » ne confirme rien', async () => {
    await webhookRefund('refund.updated', refund.provider_refund_id, 'pending');
    assert.equal(refundDe(d.retourId).statut, 'en_cours');
    assert.equal(retour(d.retourId).statut, 'remboursement_en_cours');
  });
  await t.test('l\'événement de Stripe « réussi » confirme : remboursée, commande remboursée, client prévenu', async () => {
    const r = await webhookRefund('refund.updated', refund.provider_refund_id, 'succeeded');
    assert.equal(r.status, 200);
    const rf = refundDe(d.retourId);
    assert.equal(rf.statut, 'confirme');
    assert.equal(rf.confirme_par, 'webhook');
    assert.ok(rf.confirme_at);
    assert.equal(retour(d.retourId).statut, 'remboursee');
    assert.equal(commandeDb(d.commandeId).paiement_statut, 'rembourse');
    assert.ok(sql("select 1 from notifications where user_id=? and type='retour_rembourse'", d.acheteur.id).length);
  });
  await t.test('un événement rejoué ne change rien (idempotent)', async () => {
    const avant = evenements(d.retourId).length;
    await webhookRefund('refund.updated', refund.provider_refund_id, 'succeeded');
    await webhookRefund('charge.refunded', 'ch_x', null, { refunds: { data: [{ id: refund.provider_refund_id, status: 'succeeded' }] } });
    assert.equal(evenements(d.retourId).length, avant);
  });
  await t.test('paiement direct : aucune écriture de portefeuille (le vendeur n\'avait pas été crédité)', () => {
    assert.equal(sql("select count(*) n from wallet_transactions where commande_vitrine_id=? and type like 'refund_%'", d.commandeId)[0].n, 0);
  });
  await t.test('le vendeur ne peut pas agir sur un autre dossier que le sien, un tiers non plus', async () => {
    const autre = await nouveauCompte('Autre');
    assert.equal((await appel(autre.jar, 'POST', `/api/retours/${d.retourId}/rembourser`, {})).status, 403);
    assert.equal((await appel(autre.jar, 'POST', `/api/retours/${d.retourId}/repondre`, { message: 'Je me mêle de ça' })).status, 403);
  });
});

test('4.5 échec du prestataire : la commande redevient « payée », le dossier peut être redemandé', async () => {
  const d = await nouveauDossier();
  assert.equal((await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/rembourser`, {})).status, 200);
  const refund = refundDe(d.retourId);
  await webhookRefund('refund.updated', refund.provider_refund_id, 'failed');
  assert.equal(refundDe(d.retourId).statut, 'echoue');
  assert.equal(commandeDb(d.commandeId).paiement_statut, 'paye', 'jamais « remboursée » sur un échec');
  assert.equal(retour(d.retourId).statut, 'acceptee');
  assert.ok(sql("select 1 from notifications where user_id=? and type='retour_remboursement_echoue'", vendeur.id).length);
  /* le vendeur peut le redemander : nouveau remboursement, nouvelle clé d'idempotence */
  const encore = await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/rembourser`, {});
  assert.equal(encore.status, 200, JSON.stringify(encore.data));
  assert.equal(sql('select count(*) n from refunds where retour_id=?', d.retourId)[0].n, 2);
});

test('4.5 relecture par la tâche planifiée si le webhook est manqué', async () => {
  const d = await nouveauDossier();
  await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/rembourser`, {});
  const refund = refundDe(d.retourId);
  assert.equal((await cron()).data.verification.confirmes >= 0, true);
  assert.equal(refundDe(d.retourId).statut, 'en_cours', 'toujours en attente côté Stripe');
  fs.writeFileSync(fichiers.etats, JSON.stringify({ [refund.provider_refund_id]: 'succeeded' }));
  const r = await cron();
  assert.ok(r.data.verification.confirmes >= 1);
  const rf = refundDe(d.retourId);
  assert.equal(rf.statut, 'confirme');
  assert.equal(rf.confirme_par, 'lecture_api');
  assert.equal(retour(d.retourId).statut, 'remboursee');
});

test('4.5 ancienne commande encaissée par la plateforme : remboursement sans compte tiers + contre-écritures', async () => {
  const acheteur = await nouveauCompte('Ancien');
  const commandeId = commander({ acheteurId: acheteur.id, direct: 0 });
  /* écritures d'origine : commission 2 % retenue, 102,90 € crédités au vendeur */
  inserer('wallet_transactions', { commande_vitrine_id: commandeId, type: 'platform_fee', montant: 2.1, commission_rate: 0.02, prix_billet: 105, platform_fee: 2.1, organizer_amount: 102.9 });
  inserer('wallet_transactions', { commande_vitrine_id: commandeId, type: 'organizer_credit', beneficiaire_id: vendeur.id, montant: 102.9, commission_rate: 0.02, prix_billet: 105, platform_fee: 2.1, organizer_amount: 102.9 });
  sql('update users set wallet_balance=200 where id=?', vendeur.id);
  const r = await ouvrir(acheteur, commandeId);
  assert.equal(r.status, 201);
  const avant = journalStripe().length;
  assert.equal((await appel(vendeur.jar, 'POST', `/api/retours/${r.data.id}/rembourser`, {})).status, 200);
  const creation = journalStripe().slice(avant).find((l) => l.appel === 'refunds.create');
  assert.equal(creation.options && creation.options.stripeAccount, undefined, 'encaissé par la plateforme : pas de compte tiers');
  assert.equal(sql('select wallet_balance b from users where id=?', vendeur.id)[0].b, 200, 'rien n\'est repris avant la confirmation');
  await webhookRefund('refund.updated', refundDe(r.data.id).provider_refund_id, 'succeeded');
  assert.equal(retour(r.data.id).statut, 'remboursee');
  const debits = sql("select type, montant, sens from wallet_transactions where commande_vitrine_id=? and type like 'refund_%' order by id", commandeId);
  assert.deepEqual(debits.map((x) => x.type), ['refund_platform_fee', 'refund_organizer_debit']);
  assert.ok(debits.every((x) => x.sens === 'debit'));
  assert.equal(sql('select wallet_balance b from users where id=?', vendeur.id)[0].b, 200 - 102.9);
  assert.equal(sql("select count(*) n from wallet_transactions where commande_vitrine_id=? and type in ('platform_fee','organizer_credit')", commandeId)[0].n, 2, 'les lignes d\'origine ne sont pas réécrites');
});

test('4.5 remboursement PayPal : capture remboursée depuis le compte du vendeur, confirmé par la relecture', async () => {
  const d = await nouveauDossier({ provider: 'paypal' });
  const avant = paypal.etat.appels.length;
  const r = await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/rembourser`, { montant: 1 });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const appels = paypal.etat.appels.slice(avant);
  const rembourse = appels.find((a) => a.methode === 'POST' && /\/captures\/CAPTURE_FAUSSE_1\/refund$/.test(a.url));
  assert.ok(rembourse, 'la capture est remboursée');
  assert.deepEqual(JSON.parse(rembourse.corps).amount, { currency_code: 'EUR', value: '105.00' }, 'montant recalculé côté serveur');
  assert.ok(rembourse.assertion, 'agit pour le compte du vendeur (PayPal-Auth-Assertion)');
  assert.match(Buffer.from(rembourse.assertion.split('.')[1], 'base64url').toString(), /MERCHANT_RETOURS_1/);
  assert.equal(retour(d.retourId).statut, 'remboursement_en_cours');
  paypal.etat.statut = 'PENDING';
  await cron();
  assert.equal(retour(d.retourId).statut, 'remboursement_en_cours', 'PayPal n\'a pas confirmé');
  paypal.etat.statut = 'COMPLETED';
  await cron();
  assert.equal(refundDe(d.retourId).statut, 'confirme');
  assert.equal(retour(d.retourId).statut, 'remboursee');
  assert.equal(commandeDb(d.commandeId).paiement_statut, 'rembourse');
});

test('un vendeur sans compte de paiement retrouvé : rien n\'est remboursé au hasard, l\'administrateur est prévenu', async () => {
  const d = await nouveauDossier();
  sql('update stripe_connect_accounts set stripe_account_id=? where initiative_id=?', '', initId);
  const avant = journalStripe().length;
  const r = await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/rembourser`, {});
  sql('update stripe_connect_accounts set stripe_account_id=? where initiative_id=?', 'acct_vendeur_retours', initId);
  assert.equal(r.status, 409);
  assert.equal(journalStripe().slice(avant).filter((l) => l.appel === 'refunds.create').length, 0, 'aucun appel au prestataire');
  assert.equal(refundDe(d.retourId).statut, 'verification_manuelle');
  assert.ok(sql("select 1 from notifications where user_id=? and type='retour_verification_manuelle'", adminId).length);
});

/* ═════════════ 4.7 Historique ═════════════ */
test('4.7 historique complet, horodaté par le serveur, jamais modifié', async () => {
  const d = await nouveauDossier();
  const photo = await appel(d.acheteur.jar, 'GET', '/api/mes-retours');
  assert.ok(photo.data.retours.length >= 1);
  await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/preciser`, { message: 'Quelle est la taille commandée ?' });
  const apresPrecisions = evenements(d.retourId).map((e) => JSON.stringify(e));
  await appel(d.acheteur.jar, 'POST', `/api/retours/${d.retourId}/repondre`, { message: 'La taille 42, comme indiqué.', created_at: '2000-01-01 00:00:00', role: 'vendeur' });
  await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/refuser`, { motif: 'Défaut non démontré par la photo.' });
  const ev = evenements(d.retourId);
  assert.deepEqual(ev.map((e) => e.action), ['ouverture', 'precisions_demandees', 'reponse_client', 'refuse']);
  assert.deepEqual(ev.slice(0, apresPrecisions.length).map((e) => JSON.stringify(e)), apresPrecisions, 'les lignes passées ne changent jamais');
  assert.ok(ev.every((e) => /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(e.created_at)));
  assert.ok(ev.every((e) => e.created_at >= il_y_a(1)), 'horodatage du serveur : une date envoyée par le client est ignorée');
  assert.equal(ev[2].role, 'client', 'le rôle vient de la session, pas du corps de la requête');
  assert.equal(ev[3].statut_avant, 'envoyee');
  assert.equal(ev[3].statut_apres, 'refusee');
  const sources = fs.readFileSync(path.join(__dirname, '..', 'server', 'retours.js'), 'utf8');
  assert.ok(!/UPDATE\s+dispute_events|DELETE\s+FROM\s+dispute_events/i.test(sources), 'aucune requête de modification ni de suppression de l\'historique');
});

/* ═════════════ 4.8 Côté client ═════════════ */
test('4.8 le client voit ses demandes et répond aux précisions du vendeur', async () => {
  const d = await nouveauDossier();
  const autre = await nouveauCompte('Voisin');

  const mes = await appel(d.acheteur.jar, 'GET', '/api/mes-retours');
  assert.equal(mes.status, 200);
  assert.deepEqual(mes.data.retours.map((x) => x.id), [d.retourId]);
  assert.equal(mes.data.retours[0].statut, 'envoyee');
  assert.equal((await appel(autre.jar, 'GET', '/api/mes-retours')).data.retours.length, 0, 'un autre client ne voit pas ce dossier');
  assert.equal((await appel(null, 'GET', '/api/mes-retours')).status, 401);

  assert.equal((await appel(d.acheteur.jar, 'POST', `/api/retours/${d.retourId}/repondre`, { message: 'Je ne devrais pas pouvoir' })).status, 409, 'rien n\'est demandé au client pour l\'instant');
  assert.equal((await appel(d.acheteur.jar, 'POST', `/api/retours/${d.retourId}/accepter`, {})).status, 403, 'un client n\'accepte pas son propre retour');
  assert.equal((await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/preciser`, { message: '' })).status, 400, 'précisions vides refusées');
  assert.equal((await appel(vendeur.jar, 'POST', `/api/retours/${d.retourId}/preciser`, { message: 'Merci de joindre une photo de l\'étiquette.' })).status, 200);
  assert.equal(retour(d.retourId).statut, 'precisions');
  assert.ok(sql("select 1 from notifications where user_id=? and type='retour_precisions'", d.acheteur.id).length, 'le client est prévenu');

  const vu = await appel(d.acheteur.jar, 'GET', '/api/mes-retours');
  const dossier = vu.data.retours[0];
  assert.equal(dossier.statut, 'precisions');
  assert.match(dossier.historique.map((e) => e.texte).join(' '), /étiquette/);
  assert.equal((await appel(d.acheteur.jar, 'POST', `/api/retours/${d.retourId}/repondre`, { message: 'Ok' })).status, 400, 'réponse trop courte');
  assert.equal((await appel(d.acheteur.jar, 'POST', `/api/retours/${d.retourId}/repondre`, { message: 'Voici la précision demandée.' })).status, 200);
  assert.equal(retour(d.retourId).statut, 'envoyee', 'la balle retourne chez le vendeur');
  assert.ok(sql("select 1 from notifications where user_id=? and type='retour_reponse'", vendeur.id).length);

  /* le vendeur voit les dossiers de SA boutique seulement */
  const liste = await appel(vendeur.jar, 'GET', `/api/initiatives/${initId}/retours`);
  assert.equal(liste.status, 200);
  assert.ok(liste.data.retours.some((x) => x.id === d.retourId));
  assert.equal((await appel(autre.jar, 'GET', `/api/initiatives/${initId}/retours`)).status, 403);

  /* commandes proposées dans le formulaire : payées, sans dossier ouvert */
  const eligibles = await appel(d.acheteur.jar, 'GET', '/api/mes-retours/commandes-eligibles');
  assert.equal(eligibles.status, 200);
  assert.ok(!eligibles.data.commandes.some((c) => c.id === d.commandeId), 'la commande déjà en cours n\'est plus proposée');
  assert.deepEqual(eligibles.data.motifs, Config.MOTIFS);
});

/* ═════════════ Litige : décisions de l'administrateur ═════════════ */
test('litige : l\'administrateur demande des pièces, refuse (motif obligatoire) ou rembourse', async (t) => {
  const aRefuser = await nouveauDossier();
  const aRembourser = await nouveauDossier();
  for (const d of [aRefuser, aRembourser]) sql('update retours set derniere_activite_at=? where id=?', il_y_a(20), d.retourId);
  await cron();

  await t.test('demander des pièces prévient le client et le vendeur', async () => {
    const r = await appel(jarAdmin, 'POST', `/api/admin/litiges/${aRefuser.retourId}/demander-pieces`, { message: 'Photos de la couture et du colis.' });
    assert.equal(r.status, 200);
    assert.equal(evenements(aRefuser.retourId).pop().action, 'pieces_demandees');
    assert.equal(retour(aRefuser.retourId).statut, 'litige');
  });
  await t.test('le client peut répondre à l\'administrateur pendant le litige', async () => {
    const r = await appel(aRefuser.acheteur.jar, 'POST', `/api/retours/${aRefuser.retourId}/repondre`, { message: 'Voici les photos demandées.' });
    assert.equal(r.status, 200);
    assert.equal(retour(aRefuser.retourId).statut, 'litige');
    assert.equal(evenements(aRefuser.retourId).pop().role, 'client');
  });
  await t.test('refuser sans motif est impossible', async () => {
    assert.equal((await appel(jarAdmin, 'POST', `/api/admin/litiges/${aRefuser.retourId}/refuser`, { message: '' })).status, 400);
    assert.equal(retour(aRefuser.retourId).statut, 'litige');
  });
  await t.test('refus motivé : litige traité', async () => {
    const r = await appel(jarAdmin, 'POST', `/api/admin/litiges/${aRefuser.retourId}/refuser`, { message: 'Aucune preuve de défaut.' });
    assert.equal(r.status, 200);
    const d = retour(aRefuser.retourId);
    assert.equal(d.statut, 'litige_traite');
    assert.equal(d.decision, 'refus');
    assert.match(d.motif_decision, /preuve/);
  });
  await t.test('remboursement décidé par l\'administrateur : demandé au prestataire, « litige traité » seulement après confirmation', async () => {
    const r = await appel(jarAdmin, 'POST', `/api/admin/litiges/${aRembourser.retourId}/rembourser`, { message: 'Défaut établi, remboursement validé.' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(retour(aRembourser.retourId).statut, 'remboursement_en_cours');
    await webhookRefund('refund.updated', refundDe(aRembourser.retourId).provider_refund_id, 'succeeded');
    assert.equal(retour(aRembourser.retourId).statut, 'litige_traite');
    assert.equal(commandeDb(aRembourser.commandeId).paiement_statut, 'rembourse');
  });
  await t.test('l\'administrateur n\'agit que sur un dossier en litige', async () => {
    const d = await nouveauDossier();
    assert.equal((await appel(jarAdmin, 'POST', `/api/admin/litiges/${d.retourId}/rembourser`, { message: 'Remboursement immédiat' })).status, 409);
  });
});

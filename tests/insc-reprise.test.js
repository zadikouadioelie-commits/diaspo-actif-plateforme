/* ===========================================================
   tests/insc-reprise.test.js — inscriptions payantes non abouties (2026-10-29)
   ===========================================================
   Une inscription payante laissée sans paiement : (1) ne bloque plus le même e-mail, on peut la RETROUVER et relancer le paiement ;
   (2) au-delà de 24 h elle est supprimée, sauf si la personne l'a gardée en brouillon ; (3) une inscription payée n'est jamais touchée.

   Lancer : node --test tests/insc-reprise.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./_formation-harness');

const SLUG = 'test-gala-diaspora-2026';
const TYPE_PAYANT = 6; // « VIP » 25 € de la fiche de développement

let env;
test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\\\/g, '/');
  env = await H.demarrer('insc-reprise');
});
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
const corps = (email, extra = {}) => ({ type_id: TYPE_PAYANT, nom: 'Test', prenom: 'Reprise', email, telephone: '0600000000', reponses: {}, ...extra });
/* Les routes publiques sont limitées par IP (10 essais / 15 min) : chaque appel part d'une adresse différente. */
let n = 0;
const appel = async (method, url, body) => {
  const res = await fetch(env.base + url, { method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.9.${Math.floor(++n / 200)}.${n % 200}` }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
};
const creer = (email, extra) => appel('POST', `/api/insc/public/${SLUG}/inscriptions`, corps(email, extra));
const reprendre = (b) => appel('POST', `/api/insc/public/${SLUG}/inscriptions/reprendre`, b);
const vieillir = (id, heures) => sql("UPDATE insc_inscriptions SET created_at=datetime('now', ?) WHERE id=?", `-${heures} hours`, id);

test('reprise, expiration à 24 h, brouillon', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const email = `reprise-${rnd}@example.com`;
  let id1, ref1, session1;

  await t.test('un paiement non terminé crée la ligne puis bloque un second essai… avec proposition de reprise', async () => {
    let r = await creer(email);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.ok(r.data.checkout_url, 'lien de paiement');
    id1 = r.data.id; ref1 = r.data.reference; session1 = r.data.checkout_url;
    assert.equal(sql('select statut_paiement s from insc_inscriptions where id=?', id1)[0].s, 'en_attente');
    r = await creer(email);
    assert.equal(r.status, 409);
    assert.equal(r.data.reprise_possible, true);
  });

  await t.test('reprise par e-mail : nouveau lien de paiement, même ligne, pas de doublon', async () => {
    const r = await reprendre({ email: email.toUpperCase(), type_id: TYPE_PAYANT });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.checkout_url && r.data.checkout_url !== session1, 'nouvelle session de paiement');
    assert.equal(r.data.reference, ref1);
    assert.equal(sql('select count(*) n from insc_inscriptions where lower(email)=?', email)[0].n, 1);
    assert.notEqual(sql('select transaction_ref t from insc_inscriptions where id=?', id1)[0].t, null);
  });

  await t.test('reprise par référence (lien d\'annulation Stripe)', async () => {
    const r = await reprendre({ reference: ref1 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.checkout_url);
  });

  await t.test('une session expirée côté Stripe (echec) se reprend aussi, et repasse en attente', async () => {
    sql("UPDATE insc_inscriptions SET statut_paiement='echec' WHERE id=?", id1);
    const r = await reprendre({ reference: ref1 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(sql('select statut_paiement s from insc_inscriptions where id=?', id1)[0].s, 'en_attente');
  });

  await t.test('une inscription déjà payée n\'est pas reprise et garde son blocage de doublon', async () => {
    sql("UPDATE insc_inscriptions SET statut_paiement='paye' WHERE id=?", id1);
    let r = await reprendre({ reference: ref1 });
    assert.equal(r.status, 409);
    r = await creer(email);
    assert.equal(r.status, 400);
    assert.equal(r.data.reprise_possible, undefined);
    vieillir(id1, 72);
    r = await reprendre({ reference: ref1 });
    assert.equal(r.status, 409, 'payée = jamais supprimée, même après 72 h');
    assert.equal(sql('select count(*) n from insc_inscriptions where id=?', id1)[0].n, 1);
  });

  await t.test('au-delà de 24 h, l\'inscription non payée est supprimée : plus de reprise, et le même e-mail peut recommencer', async () => {
    const e2 = `expire-${rnd}@example.com`;
    let r = await creer(e2);
    assert.equal(r.status, 201);
    const id2 = r.data.id;
    vieillir(id2, 23);
    r = await reprendre({ email: e2, type_id: TYPE_PAYANT });
    assert.equal(r.status, 200, 'à 23 h elle est encore reprenable');
    vieillir(id2, 25);
    r = await reprendre({ email: e2, type_id: TYPE_PAYANT });
    assert.equal(r.status, 404);
    assert.equal(sql('select count(*) n from insc_inscriptions where id=?', id2)[0].n, 0, 'ligne supprimée');
    r = await creer(e2);
    assert.equal(r.status, 201, 'le même e-mail peut s\'inscrire de nouveau');
  });

  await t.test('un nouvel essai après 24 h purge l\'ancienne ligne au passage (sans cron)', async () => {
    const e3 = `ancien-${rnd}@example.com`;
    let r = await creer(e3);
    const id3 = r.data.id;
    vieillir(id3, 30);
    r = await creer(e3);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(sql('select count(*) n from insc_inscriptions where id=?', id3)[0].n, 0);
  });

  await t.test('brouillon volontaire : aucune session de paiement, jamais supprimé, repris plus tard', async () => {
    const e4 = `brouillon-${rnd}@example.com`;
    let r = await creer(e4, { email: null, brouillon: true });
    assert.equal(r.status, 400, 'un e-mail est indispensable pour retrouver un brouillon');
    r = await creer(e4, { brouillon: true });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.brouillon, true);
    assert.equal(r.data.checkout_url, undefined);
    const id4 = r.data.id, ref4 = r.data.reference;
    const ligne = sql('select brouillon b, transaction_ref t, statut_paiement s from insc_inscriptions where id=?', id4)[0];
    assert.equal(Number(ligne.b), 1); assert.equal(ligne.t, null); assert.equal(ligne.s, 'en_attente');
    vieillir(id4, 200); // plus de huit jours
    r = await creer(e4);
    assert.equal(r.status, 409); assert.equal(r.data.reprise_possible, true);
    assert.match(r.data.error, /brouillon/i);
    assert.equal(sql('select count(*) n from insc_inscriptions where id=?', id4)[0].n, 1, 'brouillon conservé');
    r = await reprendre({ reference: ref4 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.checkout_url);
  });

  await t.test('le cron purge tout ce qui est expiré, hors brouillons et inscriptions payées', async () => {
    /* Le brouillon d'abord : tout nouvel envoi purge déjà la fiche, la ligne à supprimer doit être vieillie en dernier. */
    const r2 = await creer(`cron-b-${rnd}@example.com`, { brouillon: true }); vieillir(r2.data.id, 26);
    const r1 = await creer(`cron-a-${rnd}@example.com`); vieillir(r1.data.id, 26);
    const r = await appel('GET', '/api/cron/insc-non-abouties');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.ok(r.data.supprimees >= 1, JSON.stringify(r.data));
    assert.equal(sql('select count(*) n from insc_inscriptions where id=?', r1.data.id)[0].n, 0);
    assert.equal(sql('select count(*) n from insc_inscriptions where id=?', r2.data.id)[0].n, 1);
  });
});

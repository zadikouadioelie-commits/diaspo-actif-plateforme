/* ===========================================================
   tests/multi-connexion.test.js — garde « connecté à plusieurs endroits » (2026-11-02)
   ===========================================================
   Cas réel : un téléphone garde un cookie dont la session a été révoquée. Le serveur le traite déjà comme
   anonyme, mais le garde bloquait quand même toute l'API (403 multi_connexion) dès que le compte avait deux
   connexions actives ailleurs — sans fenêtre « Est-ce vous ? » possible, donc impasse sur les pages publiques.

   Module isolé, fausse base (aucun serveur, aucun fichier). Lancer : node --test tests/multi-connexion.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const MultiConnexion = require('../server/multi-connexion');
const { horodatage } = require('../server/connexions');

const id = (n) => String(n).padStart(32, '0').replace(/0/g, 'a').slice(0, 31) + String(n % 10);
const A = id(1), B = id(2), C = id(3);   // trois connexions du même compte

/* Fausse base : reconnaît les requêtes lues par evaluer() / Connexions.verifier(). */
function fauxDb({ connexions, multi = null }) {
  return {
    prepare(sql) {
      return {
        get: async (arg) => {
          if (/FROM users/.test(sql)) return { email: 'membre@example.com', is_demo: 0 };
          if (/FROM multi_connexion/.test(sql)) return multi;
          if (/FROM connexions WHERE id=/.test(sql)) return connexions.find(c => c.id === arg) || null;
          throw new Error('requête inattendue : ' + sql);
        },
        all: async () => {
          if (/FROM connexions WHERE user_id=/.test(sql)) return connexions.filter(c => !c.revoque_at);
          throw new Error('requête inattendue : ' + sql);
        },
      };
    },
  };
}
const cx = (idc, extra = {}) => ({ id: idc, user_id: 7, type_appareil: 'mobile', navigateur: 'Chrome', os: 'Android', ville: null, pays: null, last_seen_at: horodatage(), expire_at: horodatage(3600 * 1000), revoque_at: null, ...extra });

test('deux connexions actives : la confirmation est requise', async () => {
  const ev = await MultiConnexion.evaluer(fauxDb({ connexions: [cx(A), cx(B)] }), 7, A);
  assert.ok(ev, 'la question doit être posée');
  assert.equal(ev.autres.length, 1);
  assert.equal(ev.autres[0].appareil && ev.autres[0].appareil.length > 0, true);
});

test('une seule connexion : aucune confirmation', async () => {
  assert.equal(await MultiConnexion.evaluer(fauxDb({ connexions: [cx(A)] }), 7, A), null);
});

test('cookie dont la session est révoquée : jamais bloqué, même avec deux autres connexions actives', async () => {
  const connexions = [cx(A, { revoque_at: horodatage() }), cx(B), cx(C)];
  assert.equal(await MultiConnexion.evaluer(fauxDb({ connexions }), 7, A), null);
});

test('cookie dont la session est expirée : jamais bloqué', async () => {
  const connexions = [cx(A, { expire_at: horodatage(-3600 * 1000) }), cx(B), cx(C)];
  assert.equal(await MultiConnexion.evaluer(fauxDb({ connexions }), 7, A), null);
});

test('session inconnue du registre : jamais bloquée', async () => {
  assert.equal(await MultiConnexion.evaluer(fauxDb({ connexions: [cx(B), cx(C)] }), 7, A), null);
});

test('confirmation déjà donnée (« oui » valable une heure) : plus de question', async () => {
  const multi = { code: '1234', ok_jusqua: horodatage(1800 * 1000), essais: 0, verrou_jusqua: null };
  assert.equal(await MultiConnexion.evaluer(fauxDb({ connexions: [cx(A), cx(B)], multi }), 7, A), null);
});

test('ma session pas vue depuis plus de 24 h mais valide + une autre active : la question est posée', async () => {
  const vieille = horodatage(-25 * 3600 * 1000);
  const ev = await MultiConnexion.evaluer(fauxDb({ connexions: [cx(A, { last_seen_at: vieille }), cx(B)] }), 7, A);
  assert.ok(ev);
  assert.equal(ev.autres.length, 1);
});

/* ===========================================================
   tests/confirmation-appareil-code-multi.test.js — preuve d'un nouvel appareil par le code multi-connexion (2026-11-04)
   ===========================================================
   Le code à 3 chiffres affiché dans les notifications est supprimé : la fenêtre « Confirmez que c'est bien vous » demande
   le code multi-connexion à 4 chiffres que le titulaire a déjà choisi dans « Paramètres du compte ».

   Module isolé, fausse base (aucun serveur, aucun fichier). Lancer : node --test tests/confirmation-appareil-code-multi.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os'), path = require('node:path');
/* confirmation-appareil → connexions → auth → db.js ouvre une base au chargement : une base temporaire évite de verrouiller la vraie. */
process.env.DIASPOACTIF_TEST_DB_PATH = path.join(os.tmpdir(), `da-confirmation-code-multi-${process.pid}.db`);
const ConfirmationAppareil = require('../server/confirmation-appareil');

const fauxDb = (ligne) => ({
  prepare(sql) {
    return { get: async (userId) => { assert.match(sql, /FROM multi_connexion WHERE user_id=\?/); return userId === 7 ? ligne : null; } };
  },
});

test('le bon code à 4 chiffres est accepté', async () => {
  assert.equal(await ConfirmationAppareil.codeMultiValide(fauxDb({ code: '4821' }), 7, '4821'), true);
  assert.equal(await ConfirmationAppareil.codeMultiValide(fauxDb({ code: '4821' }), 7, ' 4821 '), true, 'espaces ignorés');
});

test('un mauvais code, un code de 3 ou de 5 chiffres, du texte : refusés', async () => {
  const db = fauxDb({ code: '4821' });
  for (const saisie of ['4822', '482', '48210', 'abcd', '', null, undefined, '48 21'])
    assert.equal(await ConfirmationAppareil.codeMultiValide(db, 7, saisie), false, 'refusé : ' + JSON.stringify(saisie));
});

test('compte sans code multi-connexion : rien n\'est accepté et aCodeMulti le dit', async () => {
  assert.equal(await ConfirmationAppareil.aCodeMulti(fauxDb(null), 7), false);
  assert.equal(await ConfirmationAppareil.codeMultiValide(fauxDb(null), 7, '0000'), false, 'aucun code défini : même 0000 est refusé');
  assert.equal(await ConfirmationAppareil.aCodeMulti(fauxDb({ code: null }), 7), false);
  assert.equal(await ConfirmationAppareil.aCodeMulti(fauxDb({ code: '4821' }), 7), true);
});

test('le code d\'un autre compte ne vaut pas', async () => {
  assert.equal(await ConfirmationAppareil.codeMultiValide(fauxDb({ code: '4821' }), 8, '4821'), false);
});

test('l\'ancien code à 3 chiffres des notifications n\'existe plus', () => {
  assert.equal(ConfirmationAppareil.codeNotif, undefined);
  assert.equal(ConfirmationAppareil.codeNotifValide, undefined);
  assert.equal(ConfirmationAppareil.MAX_ESSAIS_CODE_MULTI, 3);
});

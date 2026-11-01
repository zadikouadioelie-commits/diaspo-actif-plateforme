/* ===========================================================
   tests/codes-sans-ambiguite.test.js — aucun code tapé à la main ne mêle le chiffre 0 et la lettre O (2026-11-01)
   ===========================================================
   DS-ID (10 car.), code d'invitation, code de vérification de certification : alphabets sans 0 ni O. Les codes déjà émis ne changent pas.
   Lancer : node --test tests/codes-sans-ambiguite.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('DS-ID : 10 caractères, jamais de 0 ni de O (3000 tirages)', () => {
  /* Base SQLite jetable : db.js ouvre sa base à l'import. */
  process.env.DIASPOACTIF_TEST_DB_PATH = path.join(os.tmpdir(), `codes-sans-ambiguite-${process.pid}-${Date.now()}.db`);
  delete process.env.DATABASE_URL;
  const db = require('../server/db');
  const vus = new Set();
  for (let i = 0; i < 3000; i++) {
    const c = db.generateDsId();
    assert.match(c, /^[A-NP-Z1-9]{10}$/, 'DS-ID : ' + c);
    vus.add(c);
  }
  assert.ok(vus.size > 2990, 'les codes restent bien répartis');
  try { fs.unlinkSync(process.env.DIASPOACTIF_TEST_DB_PATH); } catch (e) { /* base encore ouverte : sans importance */ }
});

test('alphabets des autres codes : aucun 0 ni O', () => {
  const db = source('server/db.js'), index = source('server/index.js');
  const alphabet = (src, nom) => { const m = src.match(new RegExp(nom + "\\s*=\\s*'([^']+)'")); assert.ok(m, nom + ' introuvable'); return m[1]; };
  for (const [src, nom] of [[db, 'DS_ID_ALPHABET'], [index, 'INVITATION_ALPHABET']]) {
    const a = alphabet(src, nom);
    assert.ok(!/[0O]/.test(a), nom + ' contient 0 ou O : ' + a);
    assert.ok(a.includes('1') && a.includes('Z') && a.includes('9'), nom + ' garde le reste de l\'alphabet');
  }
  /* DA-ID de production et code de certification : tirés dans un alphabet sans 0 ni O (plus de toString(36)). */
  assert.ok(!/generateDaId = \(\) => Math\.random\(\)\.toString\(36\)/.test(db), 'DA-ID de production : plus de base 36');
  assert.ok(!/'CERT-' \+ Date\.now\(\)\.toString\(36\)/.test(index), 'certification : plus de base 36');
  assert.match(index, /const _alpha = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'/);
});

test('les codes déjà émis restent valides : aucune règle ne rejette un 0 ou un O à la saisie', () => {
  const index = source('server/index.js');
  /* Les vérifications comparent la chaîne enregistrée ; aucune ne filtre l'alphabet à la saisie du DS-ID. */
  assert.ok(!/ds_?id[^\n]{0,80}\.test\([^)]*\)[^\n]{0,60}\[\^0O\]/i.test(index));
});

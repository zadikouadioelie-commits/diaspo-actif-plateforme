/* ===========================================================
   tests/kofi-interdits.test.js — KOFFI N'A JAMAIS ACCÈS AUX SECRETS (2026-11-01, règle explicite du propriétaire)
   ===========================================================
   Koffi ne doit jamais avoir accès : au mot de passe, au code secret, au code de connexion multiple, aux messages sécurisés (nouveau type de message, autre session).
   Vérifié ici : (1) AUCUN module server/kofi*.js ne lit une table ou une colonne de secret (lecture du code source — une table future « messages_securises » est déjà couverte) ;
   (2) le texte est masqué avant l'IA et avant la base ; (3) tous les prompts portent la consigne ; (4) rien ne part au fournisseur d'IA.
   Lancer : node --test tests/kofi-interdits.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const I = require('../server/kofi-interdits');

const SERVEUR = path.join(__dirname, '..', 'server');
const MODULES = fs.readdirSync(SERVEUR).filter(f => /^kofi.*\.js$/.test(f) && f !== 'kofi-interdits.js');

test('Koffi — aucun module ne lit une table ou une colonne de secret (code source)', () => {
  assert.ok(MODULES.length >= 10, 'les modules Koffi sont bien trouvés : ' + MODULES.join(', '));
  const fautes = [];
  for (const f of MODULES) {
    const src = fs.readFileSync(path.join(SERVEUR, f), 'utf8');
    /* Tables citées dans le SQL (FROM / JOIN / INTO / UPDATE / TABLE). */
    for (const m of src.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE|TABLE(?:\s+IF\s+NOT\s+EXISTS)?)\s+([a-z_][a-z0-9_]*)/gi)) {
      if (I.TABLES_INTERDITES.test(m[1])) fautes.push(`${f} : table « ${m[1]} »`);
    }
    /* Colonnes : on ne regarde que les lignes qui contiennent du SQL. */
    src.split('\n').forEach((ligne, i) => {
      if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/.test(ligne) || !/\b(FROM|INTO|SET|WHERE)\b/i.test(ligne)) return;
      const m = I.COLONNES_INTERDITES.exec(ligne.replace(/\/\*.*?\*\//g, ''));
      if (m) fautes.push(`${f}:${i + 1} : colonne « ${m[1]} »`);
    });
    assert.ok(!/SELECT\s+\*\s+FROM\s+users\b/i.test(src) && !/\bu\.\*/.test(src), `${f} : jamais « SELECT * » sur users (il contient le mot de passe)`);
  }
  assert.deepEqual(fautes, [], 'Koffi ne doit jamais toucher à : ' + fautes.join(' ; '));
});

test('Koffi — la liste d\'interdits couvre les tables sensibles de la plateforme (dont les messages sécurisés à venir)', () => {
  for (const t of ['multi_connexion', 'connexions', 'appareils_reconnus', 'appareils_principaux', 'messages_securises', 'message_securise', 'secure_messages', 'messagerie_securisee', 'password_resets', 'user_tokens', 'sessions', 'codes_secrets'])
    assert.ok(I.TABLES_INTERDITES.test(t), t + ' doit être interdite');
  for (const t of ['kofi_conversations', 'kofi_messages', 'evenements', 'users', 'formations'])
    assert.ok(!I.TABLES_INTERDITES.test(t), t + ' reste autorisée');
  for (const c of ['password_hash', 'password_salt', 'code_secret', 'secret_code', 'token', 'mdp'])
    assert.ok(I.COLONNES_INTERDITES.test('SELECT ' + c + ' FROM x'), c + ' doit être interdite');
});

test('Koffi — mots de passe, codes et jetons sont masqués ; le reste de la phrase est intact', () => {
  const m = I.masquerSecrets;
  assert.equal(m('mon mot de passe est Abc123!'), 'mon mot de passe est ' + I.MASQUE);
  assert.equal(m('mdp : azerty'), 'mdp : ' + I.MASQUE);
  assert.equal(m('password: "hunter2" ok'), 'password: ' + I.MASQUE + ' ok');
  assert.equal(m('code secret = 4821'), 'code secret = ' + I.MASQUE);
  assert.equal(m('mon code secret 4821'), 'mon code secret ' + I.MASQUE);
  assert.equal(m('le code de connexion est 123456'), 'le code de connexion est ' + I.MASQUE);
  assert.equal(m('code de vérification 998877'), 'code de vérification ' + I.MASQUE);
  assert.match(m('Authorization: Bearer abcdefghij1234567890'), new RegExp('Bearer ' + I.MASQUE.replace(/[[\]]/g, '\\$&')));
  assert.ok(!/sk-/.test(m('ma clé sk-abcdefghijklmnopqrstuvwxyz1234')));
  assert.ok(!/[a-f0-9]{40}/.test(m('hash ' + 'a1b2c3d4e5'.repeat(4))));
  /* Les questions normales ne sont pas touchées. */
  for (const t of ['mon mot de passe ne marche pas', 'j\'ai oublié mon mot de passe', 'où changer mon code secret ?', 'code postal 69000', 'les événements du 15 décembre', 'Je cherche un avocat à Abidjan'])
    assert.equal(m(t), t);
  assert.equal(m(null), ''); assert.equal(m(undefined), '');
});

test('Koffi — tous les prompts portent la consigne SECRETS', () => {
  const E = require('../server/kofi-evenements'), A = require('../server/kofi-annuaire'), Ad = require('../server/kofi-admin'), B = require('../server/kofi-businessplan'), C = require('../server/kofi-createur'),
    N = require('../server/kofi-navigation'), T = require('../server/kofi'), Cp = require('../server/kofi-comprehension');
  for (const [nom, sys] of [['événements', E.systemePour()], ['annuaire', A.systemePour()], ['admin', Ad.systemePour()],
    ['business plan', B.systemePour({ role: 'investisseur', social: false, nom: 'X', plan: {}, nbQuestions: 5 })], ['créateur', C.systemePour({ titre: 'F', id: 1, modules: [] }, null)],
    ['navigation', N.systemePour([])], ['tuteur', T.systemePour('fr', { titre: 'F' }, '')], ['bloc commun', Cp.bloc('fr', 'x').join('\n')]])
    assert.match(sys, /JAMAIS accès aux mots de passe/, nom + ' : consigne SECRETS absente');
  assert.match(Cp.bloc('en', 'x').join('\n'), /NEVER have access to passwords/);
});

test('Koffi — rien de secret ne part au fournisseur d\'IA (point de passage unique) ni dans les textes nettoyés', async () => {
  const journal = path.join(os.tmpdir(), 'faux-ia-interdits-' + process.pid + '.log');
  process.env.KOFI_IA_FAUSSE = '1'; process.env.KOFI_FAUX_LOG = journal;
  try { fs.unlinkSync(journal); } catch (e) { /* absent */ }
  const IA = require('../server/kofi-ia');
  await IA.repondre({ modele: 'x', systeme: 'ASSISTANT_NAVIGATION test', maxSortie: 300, messages: [
    { role: 'user', content: 'mon mot de passe est SuperSecret99 !' }, { role: 'assistant', content: 'Ne le partagez pas.' },
    { role: 'user', content: '<demande>\nmon code de connexion est 482913 — et où est ma messagerie ?\n</demande>' }] });
  const envoye = fs.readFileSync(journal, 'utf8');
  fs.unlinkSync(journal);
  assert.ok(!/SuperSecret99/.test(envoye) && !/482913/.test(envoye), 'un secret est parti vers le fournisseur : ' + envoye);
  assert.ok(envoye.includes(I.MASQUE) && /messagerie/.test(envoye));
  /* À l'enregistrement : chaque module masque via nettoyer() — contrôle du code. */
  for (const f of ['kofi', 'kofi-createur', 'kofi-annuaire', 'kofi-evenements', 'kofi-admin', 'kofi-businessplan', 'kofi-navigation'])
    assert.match(fs.readFileSync(path.join(SERVEUR, f + '.js'), 'utf8'), /const nettoyer = s => require\("\.\/kofi-interdits"\)\.masquerSecrets\(/, f + ' : nettoyer() doit masquer les secrets');
});

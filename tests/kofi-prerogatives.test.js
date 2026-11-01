/* ===========================================================
   tests/kofi-prerogatives.test.js — KOFFI NE FAIT JAMAIS PLUS QUE LE TITULAIRE DU COMPTE (2026-11-01, règle explicite du propriétaire)
   ===========================================================
   « Une personne qui a un compte ne peut pas passer au travers de Koffi pour outrepasser ses prérogatives. Le Koffi de l'administrateur est séparé de tous les autres. »
   Vérifié ici : (1) aucun Koffi autre que celui de l'administrateur ne décrit, ne cite ni ne promet une fonction d'administration (prompts, carte commune,
   réponses « Que sais-tu faire ? ») ; (2) tous portent la consigne PRÉROGATIVES ; (3) le Koffi de l'administrateur garde ses fonctions et ne se contredit pas ;
   (4) ses routes sont réservées au rôle administrateur côté serveur ; (5) aucun module non-admin n'appelle le code de kofi-admin.
   Lancer : node --test tests/kofi-prerogatives.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SERVEUR = path.join(__dirname, '..', 'server');
/* Ce qui ne doit apparaître que chez l'assistant de l'administrateur. */
const FONCTIONS_ADMIN = /assistant de l['’]administrateur|administrator assistant|assistant d['’]administrateur|ouverture de modules|notifications aux membres|chiffres de la plateforme|platform figures|espace administrateur/i;

const E = require('../server/kofi-evenements'), A = require('../server/kofi-annuaire'), Ad = require('../server/kofi-admin'), B = require('../server/kofi-businessplan'),
  C = require('../server/kofi-createur'), N = require('../server/kofi-navigation'), T = require('../server/kofi'), Cp = require('../server/kofi-comprehension'),
  Comp = require('../server/kofi-competences'), I = require('../server/kofi-interdits');

const PROMPTS_ORDINAIRES = () => [
  ['événements', E.systemePour()], ['annuaire', A.systemePour()],
  ['business plan', B.systemePour({ role: 'investisseur', social: false, nom: 'X', plan: {}, nbQuestions: 5 })],
  ['créateur', C.systemePour({ titre: 'F', id: 1, modules: [] }, null)], ['navigation', N.systemePour([])],
  ['tuteur', T.systemePour('fr', { titre: 'F' }, '')], ['bloc commun (fr)', Cp.bloc('fr', 'Annuaire').join('\n')], ['bloc commun (en)', Cp.bloc('en', 'Annuaire').join('\n')],
];

test('Koffi — aucun Koffi ordinaire ne décrit ni ne promet de fonction d\'administration', () => {
  for (const [nom, sys] of PROMPTS_ORDINAIRES()) assert.ok(!FONCTIONS_ADMIN.test(sys), nom + ' : mentionne une fonction d\'administration');
  assert.ok(!Cp.CARTE.some(c => FONCTIONS_ADMIN.test(c.fr) || FONCTIONS_ADMIN.test(c.en) || /admin/i.test(c.lieu)), 'la carte commune ne cite pas l\'administrateur');
});

test('Koffi — les réponses « Que sais-tu faire ? » des Koffi ordinaires ne citent aucune fonction d\'administration', () => {
  const reponses = [Comp.reponseEleve('fr', {}), Comp.reponseEleve('en', {}), Comp.reponseCreateur({}), Comp.reponseAnnuaire({}), Comp.reponseEvenements({}), Comp.reponseBusinessPlan({})];
  for (const r of reponses) assert.ok(!FONCTIONS_ADMIN.test(r), 'réponse ordinaire qui cite l\'administration : ' + r.slice(0, 80));
});

test('Koffi — tous les Koffi portent la consigne PRÉROGATIVES (jamais plus que le titulaire du compte)', () => {
  for (const [nom, sys] of PROMPTS_ORDINAIRES().filter(p => !/\(en\)/.test(p[0])))
    assert.match(sys, /PRÉROGATIVES/, nom + ' : consigne PRÉROGATIVES absente');
  assert.match(Cp.bloc('en', 'x').join('\n'), /PREROGATIVES/);
  assert.match(Ad.systemePour(), /PRÉROGATIVES/, 'admin : consigne PRÉROGATIVES absente');
  assert.match(PROMPTS_ORDINAIRES()[0][1], /aucune fonction d'administration/, 'un Koffi ordinaire refuse explicitement les fonctions d\'administration');
});

test('Koffi — le Koffi de l\'administrateur garde ses fonctions et ne se contredit pas', () => {
  const sys = Ad.systemePour();
  assert.match(sys, /JAMAIS accès aux mots de passe/, 'les SECRETS restent interdits même à l\'administrateur');
  assert.ok(!/aucune fonction d'administration/.test(sys), 'le Koffi administrateur n\'a pas la ligne « aucune fonction d\'administration »');
  assert.ok(!/aucune fonction d'administration/.test(I.regle('fr', true).join('\n')));
  assert.match(I.regle('fr', false).join('\n'), /aucune fonction d'administration/);
  assert.ok(!/no administration function/.test(I.regle('en', true).join('\n')));
  assert.match(I.regle('en', false).join('\n'), /no administration function/);
});

test('Koffi — les routes du Koffi administrateur sont réservées au rôle administrateur (code source)', () => {
  const src = fs.readFileSync(path.join(SERVEUR, 'kofi-admin.js'), 'utf8');
  assert.match(src, /user\.role !== "administrateur"/, 'garde de rôle manquante');
  assert.match(src, /if \(user\.role !== "administrateur"\) \{ sendJSON\(res, 403/, 'refus 403 manquant');
  /* Chaque route /api/kofi/admin/... commence par la garde de rôle (les routes de cron ont leur propre secret). */
  const lignes = src.split('\n');
  const routes = lignes.map((l, i) => [l, i]).filter(([l]) => /route\("(?:GET|POST|PUT|PATCH|DELETE)", "\/api\/kofi\/admin\//.test(l));
  assert.ok(routes.length >= 6, 'routes trouvées : ' + routes.length);
  for (const [l, i] of routes) assert.match(lignes[i + 1], /await exiger\(req, res\)/, 'route sans garde de rôle : ' + l.trim());
});

test('Koffi — aucun module ordinaire n\'appelle le code de l\'assistant administrateur', () => {
  const autorises = new Set(['kofi-admin.js', 'kofi-competences.js', 'kofi.js']);   /* kofi.js = branchement (register) ; kofi-competences = texte « Que sais-tu faire ? » de l'admin */
  for (const f of fs.readdirSync(SERVEUR).filter(f => /^kofi.*\.js$/.test(f))) {
    if (autorises.has(f)) continue;
    const src = fs.readFileSync(path.join(SERVEUR, f), 'utf8');
    assert.ok(!/require\(["']\.\/kofi-admin["']\)/.test(src), f + ' : ne doit pas utiliser kofi-admin');
  }
  /* Dans kofi-competences, seule la réponse de l'administrateur peut parler d'administration. */
  const src = fs.readFileSync(path.join(SERVEUR, 'kofi-competences.js'), 'utf8');
  assert.match(src, /reponseAdmin: \(\) => reponseAdmin\(\)/);
});

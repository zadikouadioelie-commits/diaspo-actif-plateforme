/* ===========================================================
   tests/formation-cartes-parcours.test.js — Diaspo'Actif Formation, lot 3 (2026-10-18)
   ===========================================================
   Cartes mentales (carte personnelle, carte générée depuis le plan d'une formation, droits de lecture/édition, nettoyage de l'arbre),
   prérequis entre formations (inscription refusée tant qu'ils ne sont pas terminés, cycles refusés) et parcours de formation (étapes, statuts, prochaine étape).
   Intégration HTTP réelle, base SQLite isolée (voir tests/_formation-harness.js). Les deux fichiers sont séparés car l'inscription est limitée par adresse IP (5 par heure et par serveur).
   Lancer : node --test tests/formation-cartes-parcours.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('cartes'); });
test.after(() => { if (env) env.stop(); });

test('cartes mentales : création, plan généré, droits, nettoyage', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar();
  const call = env.call;
  let fid, carteForm, cartePerso, l1;

  await t.test('setup — une formation (1 module, 1 chapitre, 2 leçons), un inscrit, un non-inscrit', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Inscrit');
    await H.creerApprenant(env, jarB, rnd, 'Externe');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Formation cartes ' + rnd, description: 'x' })).data.id;
    const mod = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'Les bases' })).data.id;
    const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'Introduction' })).data.id;
    l1 = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Bienvenue', type: 'texte', contenu_texte: '<p>x</p>' })).data.id;
    await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Les outils', type: 'texte', contenu_texte: '<p>y</p>' });
    H.publier(env, fid);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
  });

  await t.test('carte personnelle : créée vierge, visible de son seul auteur', async () => {
    let r = await call(jarA, 'POST', '/api/cartes-mentales', { titre: 'Mon projet' });
    assert.equal(r.status, 201); cartePerso = r.data.id;
    r = await call(jarA, 'GET', `/api/cartes-mentales/${cartePerso}`);
    assert.equal(r.status, 200); assert.equal(r.data.edition, true); assert.equal(r.data.carte.data.racine.texte, 'Mon projet'); assert.equal(r.data.formation, null);
    assert.equal((await call(jarB, 'GET', `/api/cartes-mentales/${cartePerso}`)).status, 404, 'invisible pour un autre compte');
    assert.equal((await call(null, 'GET', `/api/cartes-mentales/${cartePerso}`)).status, 401);
    assert.equal((await call(jarB, 'PUT', `/api/cartes-mentales/${cartePerso}`, { data: { racine: { texte: 'piraté', enfants: [] } } })).status, 403, "aucun autre compte ne modifie ma carte");
    assert.equal((await call(jarB, 'DELETE', `/api/cartes-mentales/${cartePerso}`)).status, 403);
  });

  await t.test('enregistrement : l\'arbre est nettoyé (HTML retiré, couleur/lien invalides écartés, identifiants uniques) et borné', async () => {
    const data = { racine: { id: 'racine1', texte: 'Projet <b>agricole</b>', enfants: [
      { id: 'dup1', texte: '<script>alert(1)</script>Budget', couleur: '#FF0000', note: 'Voir <i>devis</i>', lien: { type: 'url', url: 'https://example.org/devis' }, enfants: [] },
      { id: 'dup1', texte: 'Planning', couleur: 'rouge', lien: { type: 'url', url: 'javascript:alert(1)' }, enfants: [{ texte: 'Étape 1', lien: { type: 'lecon', id: 5 }, replie: true, enfants: [] }] },
    ] } };
    let r = await call(jarA, 'PUT', `/api/cartes-mentales/${cartePerso}`, { titre: 'Projet agricole', data });
    assert.equal(r.status, 200); assert.equal(r.data.nb_noeuds, 4);
    const rac = r.data.data.racine;
    assert.equal(rac.texte, 'Projet agricole');
    const [budget, planning] = rac.enfants;
    assert.ok(!JSON.stringify(rac).includes('<') && !JSON.stringify(rac).includes('>'), 'aucun balisage conservé');
    assert.equal(budget.texte, 'alert(1) Budget', 'les balises sont retirées, le texte reste du texte');
    assert.equal(budget.couleur, '#ff0000'); assert.deepEqual(budget.lien, { type: 'url', url: 'https://example.org/devis' }); assert.equal(budget.note, 'Voir devis');
    assert.equal(planning.couleur, undefined, 'couleur invalide écartée'); assert.equal(planning.lien, undefined, 'lien javascript: refusé');
    assert.notEqual(budget.id, planning.id, 'identifiants rendus uniques');
    assert.deepEqual(planning.enfants[0].lien, { type: 'lecon', id: 5 }); assert.equal(planning.enfants[0].replie, true);
    const tropProfond = { racine: { texte: 'a', enfants: [{ texte: 'b', enfants: [{ texte: 'c', enfants: [{ texte: 'd', enfants: [{ texte: 'e', enfants: [{ texte: 'f', enfants: [{ texte: 'g', enfants: [{ texte: 'h', enfants: [] }] }] }] }] }] }] }] } };
    assert.equal((await call(jarA, 'PUT', `/api/cartes-mentales/${cartePerso}`, { data: tropProfond })).status, 400);
    const trop = { racine: { texte: 'r', enfants: Array.from({ length: 260 }, (_, i) => ({ texte: 'n' + i, enfants: [] })) } };
    assert.equal((await call(jarA, 'PUT', `/api/cartes-mentales/${cartePerso}`, { data: trop })).status, 400);
    assert.equal((await call(jarA, 'PUT', `/api/cartes-mentales/${cartePerso}`, { data: {} })).status, 400);
  });

  await t.test('carte de formation GÉNÉRÉE depuis le plan : modules, chapitres, leçons reliés à leur contenu', async () => {
    assert.equal((await call(jarA, 'POST', '/api/cartes-mentales', { titre: 'x', formation_id: fid, modele: 'plan' })).status, 403, 'seul le formateur crée une carte de formation');
    const r = await call(jarF, 'POST', '/api/cartes-mentales', { formation_id: fid, modele: 'plan' });
    assert.equal(r.status, 201); carteForm = r.data.id;
    const g = await call(jarF, 'GET', `/api/cartes-mentales/${carteForm}`);
    const rac = g.data.carte.data.racine;
    assert.equal(rac.texte, 'Formation cartes ' + rnd);
    assert.equal(rac.enfants[0].texte, 'Les bases');
    const chap = rac.enfants[0].enfants[0];
    assert.equal(chap.texte, 'Introduction'); assert.equal(chap.lien.type, 'chapitre');
    assert.deepEqual(chap.enfants.map(e => e.texte), ['Bienvenue', 'Les outils']);
    assert.equal(chap.enfants[0].lien.type, 'lecon'); assert.equal(Number(chap.enfants[0].lien.id), Number(l1));
    assert.equal(g.data.edition, true); assert.ok(g.data.plan.length >= 3, 'le plan est fourni au formateur pour relier les noeuds');
    assert.equal(g.data.formation.id, Number(fid));
  });

  await t.test('droits : l\'inscrit LIT sans modifier ; le non-inscrit ne voit rien ; la carte apparaît dans l\'espace de suivi', async () => {
    const lu = await call(jarA, 'GET', `/api/cartes-mentales/${carteForm}`);
    assert.equal(lu.status, 200); assert.equal(lu.data.edition, false); assert.equal(lu.data.plan, null);
    assert.equal((await call(jarA, 'PUT', `/api/cartes-mentales/${carteForm}`, { data: { racine: { texte: 'x', enfants: [] } } })).status, 403);
    assert.equal((await call(jarA, 'DELETE', `/api/cartes-mentales/${carteForm}`)).status, 403);
    assert.equal((await call(jarB, 'GET', `/api/cartes-mentales/${carteForm}`)).status, 404);
    const s = await call(jarA, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(s.data.cartes_mentales.length, 1); assert.equal(Number(s.data.cartes_mentales[0].id), Number(carteForm));
    const miennes = await call(jarA, 'GET', '/api/cartes-mentales');
    assert.equal(miennes.data.cartes.length, 1, 'l\'inscrit ne possède que sa carte personnelle');
    const duFormateur = await call(jarF, 'GET', `/api/cartes-mentales?formation_id=${fid}`);
    assert.equal(duFormateur.data.cartes.length, 1);
  });

  await t.test('suppression de la formation : sa carte disparaît avec elle ; la carte personnelle reste', async () => {
    const sq = new H.DatabaseSync(env.dbPath);
    sq.prepare("UPDATE formations SET statut='brouillon' WHERE id=?").run(fid); sq.close();
    assert.equal((await call(jarF, 'DELETE', `/api/formations/${fid}`)).status, 200);
    assert.equal((await call(jarF, 'GET', `/api/cartes-mentales/${carteForm}`)).status, 404);
    assert.equal((await call(jarA, 'GET', `/api/cartes-mentales/${cartePerso}`)).status, 200);
    assert.equal((await call(jarA, 'DELETE', `/api/cartes-mentales/${cartePerso}`)).status, 200);
  });
});

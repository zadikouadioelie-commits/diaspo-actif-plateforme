/* ===========================================================
   tests/formation-catalogue.test.js — Formation Diaspora, lot E : catalogue (2026-10-30)
   ===========================================================
   Catégories modifiables par l'administration (liste publique, création, renommage qui suit les formations, désactivation, suppression
   refusée tant qu'elles servent, ordre), validation de la catégorie à la création, catalogue enrichi (modules, leçons, inscrits, prix
   promotionnel, « Populaire »), tableau de bord du formateur filtrable.
   Intégration HTTP réelle, base SQLite isolée — voir tests/_formation-harness.js.
   Lancer : node --test tests/formation-catalogue.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('catalogue'); });
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('catalogue : catégories, cartes enrichies, tableau de bord filtrable', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, fid2, idAdmin, idA, idB;
  const noms = r => r.data.categories.map(c => c.nom);

  await t.test('setup — un formateur (administrateur) et deux apprenants', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Alpha');
    await H.creerApprenant(env, jarB, rnd, 'Bravo');
    idAdmin = sql("select id from users where email like ?", `test-utilisateur-${rnd}-formateur%`)[0].id;
    idA = sql("select id from users where email like ?", `test-utilisateur-${rnd}-alpha%`)[0].id;
    idB = sql("select id from users where email like ?", `test-utilisateur-${rnd}-bravo%`)[0].id;
  });

  await t.test('la liste publique est semée avec les dix catégories d’origine, dans l’ordre', async () => {
    const r = await call(anon, 'GET', '/api/formation-categories');
    assert.equal(r.status, 200);
    assert.equal(r.data.categories.length, 10);
    assert.equal(r.data.categories[0].nom, 'Action Sociale');
    assert.equal(r.data.categories[9].nom, 'Environnement');
    assert.ok(r.data.categories.every(c => c.icone && c.actif === 1));
    const encore = await call(anon, 'GET', '/api/formation-categories');
    assert.equal(encore.data.categories.length, 10, 'le semis ne se refait pas');
  });

  await t.test('administration réservée', async () => {
    assert.equal((await call(anon, 'GET', '/api/admin/formation-categories')).status, 401);
    assert.equal((await call(jarA, 'GET', '/api/admin/formation-categories')).status, 403);
    assert.equal((await call(jarA, 'POST', '/api/admin/formation-categories', { nom: 'Pirate' })).status, 403);
    assert.equal((await call(jarA, 'PATCH', '/api/admin/formation-categories/1', { nom: 'Pirate' })).status, 403);
    assert.equal((await call(jarA, 'DELETE', '/api/admin/formation-categories/1')).status, 403);
  });

  await t.test('créer une catégorie : validations, doublon insensible aux accents et à la casse', async () => {
    assert.equal((await call(jarF, 'POST', '/api/admin/formation-categories', { nom: ' ' })).status, 400);
    assert.equal((await call(jarF, 'POST', '/api/admin/formation-categories', { nom: 'a' })).status, 400);
    assert.equal((await call(jarF, 'POST', '/api/admin/formation-categories', { nom: 'economie' })).status, 409, 'Économie existe déjà');
    const r = await call(jarF, 'POST', '/api/admin/formation-categories', { nom: '  Numérique   & IA ', icone: '🤖' });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const n = r.data.categories.find(c => c.nom === 'Numérique & IA');
    assert.ok(n, 'espaces superflus retirés'); assert.equal(n.icone, '🤖'); assert.equal(n.ordre, 11);
    const publique = await call(anon, 'GET', '/api/formation-categories');
    assert.ok(noms(publique).includes('Numérique & IA'));
  });

  await t.test('une formation ne peut prendre qu’une catégorie proposée', async () => {
    const mauvaise = await call(jarF, 'POST', '/api/formations', { titre: 'Mauvaise ' + rnd, domaine: 'Astrologie' });
    assert.equal(mauvaise.status, 400);
    const ok = await call(jarF, 'POST', '/api/formations', { titre: 'Catalogue un ' + rnd, description: 'x', domaine: 'Numérique & IA' });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    fid = ok.data.id;
    const ok2 = await call(jarF, 'POST', '/api/formations', { titre: 'Catalogue deux ' + rnd, description: 'y', domaine: 'Santé' });
    fid2 = ok2.data.id;
    const maj = await call(jarF, 'PUT', `/api/formations/${fid}`, { domaine: 'Inconnue' });
    assert.equal(maj.status, 400);
    const sans = await call(jarF, 'PUT', `/api/formations/${fid}`, { titre: 'Catalogue un bis ' + rnd });
    assert.equal(sans.status, 200, 'ne pas toucher à la catégorie ne bloque pas');
  });

  await t.test('renommer suit les formations ; désactiver retire du choix sans toucher aux formations', async () => {
    const id = sql("select id from formation_categories where nom='Numérique & IA'")[0].id;
    const dup = await call(jarF, 'PATCH', `/api/admin/formation-categories/${id}`, { nom: 'Santé' });
    assert.equal(dup.status, 409);
    const r = await call(jarF, 'PATCH', `/api/admin/formation-categories/${id}`, { nom: 'Numérique' });
    assert.equal(r.status, 200);
    assert.equal(sql('select domaine d from formations where id=?', fid)[0].d, 'Numérique', 'le texte de la formation suit le renommage');
    const off = await call(jarF, 'PATCH', `/api/admin/formation-categories/${id}`, { actif: 0 });
    assert.equal(off.data.categories.find(c => c.id === id).actif, 0);
    assert.ok(!noms(await call(anon, 'GET', '/api/formation-categories')).includes('Numérique'), 'retirée de la liste publique');
    assert.equal(sql('select domaine d from formations where id=?', fid)[0].d, 'Numérique');
    assert.equal((await call(jarF, 'POST', '/api/formations', { titre: 'Refus ' + rnd, domaine: 'Numérique' })).status, 400, 'plus choisissable');
    const modif = await call(jarF, 'PUT', `/api/formations/${fid}`, { domaine: 'Numérique', titre: 'Garde sa catégorie ' + rnd });
    assert.equal(modif.status, 200, 'une formation qui l’utilise déjà reste modifiable');
    await call(jarF, 'PATCH', `/api/admin/formation-categories/${id}`, { actif: 1 });
  });

  await t.test('suppression refusée tant qu’une formation s’en sert, possible ensuite', async () => {
    const id = sql("select id from formation_categories where nom='Numérique'")[0].id;
    const r = await call(jarF, 'DELETE', `/api/admin/formation-categories/${id}`);
    assert.equal(r.status, 409); assert.equal(r.data.nb_formations, 1);
    sql("update formations set domaine='Santé' where id=?", fid);
    const ok = await call(jarF, 'DELETE', `/api/admin/formation-categories/${id}`);
    assert.equal(ok.status, 200); assert.ok(!noms(ok).includes('Numérique'));
    assert.equal((await call(jarF, 'DELETE', `/api/admin/formation-categories/${id}`)).status, 404);
  });

  await t.test('ordre : les catégories citées passent devant, les autres suivent', async () => {
    const liste = (await call(jarF, 'GET', '/api/admin/formation-categories')).data.categories;
    const droit = liste.find(c => c.nom === 'Droit').id, finance = liste.find(c => c.nom === 'Finance').id;
    const r = await call(jarF, 'PUT', '/api/admin/formation-categories/ordre', { ids: [droit, finance, 99999, droit] });
    assert.equal(r.status, 200);
    assert.deepEqual(noms(r).slice(0, 3), ['Droit', 'Finance', 'Action Sociale']);
    assert.deepEqual(r.data.categories.map(c => c.ordre), r.data.categories.map((_, i) => i + 1), 'ordres consécutifs');
  });

  await t.test('catalogue : nombre de modules, de leçons, de participants et prix promotionnel', async () => {
    const m1 = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'Un' })).data.id;
    const m2 = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'Deux' })).data.id;
    for (const [m, titre] of [[m1, 'a'], [m1, 'b'], [m2, 'c']]) {
      const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${m}/chapitres`, { titre: 'Ch ' + titre })).data.id;
      assert.equal((await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre, type: 'texte', contenu_texte: '<p>x</p>' })).status, 201);
    }
    sql("UPDATE formations SET mode_acces='payant', prix=80, gratuit=0, promo_active=1, promo_reduction_pct=25, promo_date_fin=? WHERE id=?", new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), fid);
    H.publier(env, fid); H.publier(env, fid2);
    let r = await call(anon, 'GET', '/api/formations');
    const f = r.data.formations.find(x => x.id === fid);
    assert.equal(f.nb_modules, 2); assert.equal(f.nb_lecons, 3); assert.equal(f.nb_inscrits, 0);
    assert.equal(f.prix_catalogue, 80); assert.equal(f.promo_pct, 25); assert.equal(f.prix_final, 60);
    assert.ok(f.formateur_affiche, 'le formateur est nommé');
    assert.equal(f.populaire, 0, 'personne n’est populaire sans participants');
    const detail = (await call(anon, 'GET', `/api/formations/${fid}`)).data.formation;
    assert.equal(detail.prix_catalogue, 80); assert.equal(detail.promo_pct, 25); assert.equal(detail.prix_final, 60, 'la fiche (et le téléphone) reçoivent aussi le prix promotionnel');
    const gratuite = r.data.formations.find(x => x.id === fid2);
    assert.equal(gratuite.prix_final, 0); assert.equal(gratuite.promo_pct, null);
    sql("UPDATE formations SET promo_date_fin=? WHERE id=?", new Date(Date.now() - 86400000).toISOString().slice(0, 10), fid);
    r = await call(anon, 'GET', '/api/formations');
    const fin = r.data.formations.find(x => x.id === fid);
    assert.equal(fin.promo_pct, null); assert.equal(fin.prix_final, 80, 'promotion terminée : plein tarif');
  });

  await t.test('« Populaire » : au moins trois participants, et seulement les plus suivies', async () => {
    for (const u of [idAdmin, idA]) sql("INSERT INTO formation_inscriptions (formation_id, user_id, statut, paiement_statut, montant_paye) VALUES (?,?,'active','paye',0)", fid, u);
    let f = (await call(anon, 'GET', '/api/formations')).data.formations.find(x => x.id === fid);
    assert.equal(f.nb_inscrits, 2); assert.equal(f.populaire, 0, 'deux participants : pas assez');
    sql("INSERT INTO formation_inscriptions (formation_id, user_id, statut, paiement_statut, montant_paye) VALUES (?,?,'active','paye',0)", fid, idB);
    f = (await call(anon, 'GET', '/api/formations')).data.formations.find(x => x.id === fid);
    assert.equal(f.nb_inscrits, 3); assert.equal(f.populaire, 1);
    sql("UPDATE formation_inscriptions SET statut='annulee' WHERE formation_id=? AND user_id=?", fid, idB);
    f = (await call(anon, 'GET', '/api/formations')).data.formations.find(x => x.id === fid);
    assert.equal(f.nb_inscrits, 2); assert.equal(f.populaire, 0, 'une inscription annulée ne compte pas');
    sql("UPDATE formation_inscriptions SET statut='active' WHERE formation_id=? AND user_id=?", fid, idB);
  });

  await t.test('tableau de bord filtrable : formation, statut, catégorie, période', async () => {
    const tout = (await call(jarF, 'GET', '/api/mes-formations/dashboard')).data.stats;
    assert.equal(tout.nb_formations, 2); assert.equal(tout.nb_eleves, 3);
    const unique = (await call(jarF, 'GET', `/api/mes-formations/dashboard?formation_id=${fid2}`)).data.stats;
    assert.equal(unique.nb_formations, 1); assert.equal(unique.nb_eleves, 0, 'la seconde formation n’a personne');
    const f1 = (await call(jarF, 'GET', `/api/mes-formations/dashboard?formation_id=${fid}`)).data.stats;
    assert.equal(f1.nb_eleves, 3);
    const brouillons = (await call(jarF, 'GET', '/api/mes-formations/dashboard?statut=brouillon')).data.stats;
    assert.equal(brouillons.nb_formations, 0, 'les deux sont publiées');
    const sante = (await call(jarF, 'GET', '/api/mes-formations/dashboard?domaine=' + encodeURIComponent('Santé'))).data.stats;
    assert.equal(sante.nb_formations, 2);
    sql("UPDATE formation_inscriptions SET date_inscription='2020-03-10 10:00:00' WHERE formation_id=? AND user_id=?", fid, idB);
    const ancienne = (await call(jarF, 'GET', '/api/mes-formations/dashboard?du=2020-03-01&au=2020-03-31')).data.stats;
    assert.equal(ancienne.nb_eleves, 1, 'une seule inscription date de mars 2020');
    const rien = (await call(jarF, 'GET', '/api/mes-formations/dashboard?du=2019-01-01&au=2019-12-31')).data.stats;
    assert.equal(rien.nb_eleves, 0);
    const bizarre = (await call(jarF, 'GET', '/api/mes-formations/dashboard?du=pas-une-date&formation_id=abc')).data.stats;
    assert.equal(bizarre.nb_eleves, 3, 'filtres illisibles ignorés');
  });
});

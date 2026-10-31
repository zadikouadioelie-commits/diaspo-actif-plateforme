/* ===========================================================
   tests/formation-auteur.test.js — l'auteur d'une formation est TOUJOURS le compte propriétaire (décision du 2026-10-31)
   ===========================================================
   Initiative : le nom de la structure, jamais la personne qui gère le compte. Particulier : « prénom nom ». Administration : le nom de l'institution.
   Aucun nom saisi à la main (formateur_nom, formateur_organisation, organisme) ne s'affiche : personne ne peut publier au nom d'un autre.
   Lancer : node --test tests/formation-auteur.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const Cat = require('../server/formation-catalogue');

let env;
test.before(async () => { env = await H.demarrer('auteur'); });
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).all(...args); } finally { db.close(); } };
const run = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return db.prepare(req).run(...args); } finally { db.close(); } };

test('nomDeCompte : initiative = nom de la structure, particulier = prénom nom, institution = nom de l\'institution', () => {
  assert.equal(Cat.nomDeCompte({ role: 'initiative', prenom: 'Ondet', nom: 'ZADI' }, "Diaspo'Actif Officiel"), "Diaspo'Actif Officiel");
  assert.equal(Cat.nomDeCompte({ role: 'utilisateur', prenom: 'Aminata', nom: 'Diallo' }, null), 'Aminata Diallo');
  assert.equal(Cat.nomDeCompte({ role: 'administrateur', prenom: 'A', nom: 'B', nom_institution: 'Mairie de Lyon' }, null), 'Mairie de Lyon');
  assert.equal(Cat.nomDeCompte({ role: 'initiative', prenom: 'A', nom: 'B' }, null), 'A B', 'initiative sans fiche : repli sur le compte');
});

test('un nom saisi à la main ne s\'affiche jamais ; le nom du compte s\'affiche partout', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), call = env.call;
  const c = await H.creerFormateur(env, jarF, rnd, 'Zadi');
  const uid = sql('SELECT id FROM users WHERE email=?', c.email)[0].id;
  run("UPDATE users SET nom_institution=? WHERE id=?", 'Association Soleil', uid);

  /* Création : on tente d'écrire un autre nom comme « organisme ». */
  let r = await call(jarF, 'POST', '/api/formations', { titre: 'Formation auteur ' + rnd, description: 'x', organisme: 'Banque Fictive' });
  assert.ok([200, 201].includes(r.status), JSON.stringify(r.data));
  const id = r.data.id;
  assert.equal(sql('SELECT organisme FROM formations WHERE id=?', id)[0].organisme, 'Association Soleil', 'organisme forcé à l\'écriture');

  /* Mise à jour : on tente de signer au nom d'un autre. */
  r = await call(jarF, 'PUT', `/api/formations/${id}`, { formateur_nom: 'Ministre Faux', formateur_organisation: 'Banque Fictive' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const ligne = sql('SELECT organisme, formateur_nom, formateur_organisation FROM formations WHERE id=?', id)[0];
  assert.equal(ligne.formateur_nom, 'Association Soleil');
  assert.equal(ligne.formateur_organisation, 'Association Soleil');

  /* Même si une ancienne ligne porte un faux nom, la lecture le remplace. */
  run("UPDATE formations SET organisme='Banque Fictive', formateur_nom='Ministre Faux', formateur_organisation='Banque Fictive' WHERE id=?", id);
  H.publier(env, id);

  r = await call(null, 'GET', `/api/formations/${id}`);
  assert.equal(r.status, 200);
  for (const k of ['organisme', 'formateur_nom', 'formateur_organisation', 'auteur_nom']) assert.equal(r.data.formation[k], 'Association Soleil', 'détail : ' + k);

  r = await call(null, 'GET', '/api/formations');
  const carte = r.data.formations.find(f => Number(f.id) === Number(id));
  assert.ok(carte, 'dans le catalogue');
  for (const k of ['organisme', 'formateur_nom', 'formateur_organisation', 'auteur_nom', 'formateur_affiche']) assert.equal(carte[k], 'Association Soleil', 'catalogue : ' + k);

  /* La page de l'apprenant (offre / contenu) ne montre pas non plus le faux nom. */
  const faux = JSON.stringify((await call(null, 'GET', `/api/formations/${id}/offre`)).data);
  assert.ok(!/Banque Fictive|Ministre Faux/.test(faux), 'offre sans faux nom');
});

test('compte initiative : la formation porte le nom de l\'initiative, pas celui de la personne qui la gère', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), call = env.call;
  const c = await H.creerFormateur(env, jarF, rnd, 'Gestionnaire');
  const uid = sql('SELECT id FROM users WHERE email=?', c.email)[0].id;
  const r0 = await call(jarF, 'POST', '/api/formations', { titre: 'Formation initiative ' + rnd, description: 'x' });
  const id = r0.data.id;
  /* Le compte devient une initiative (les formations d'initiative exigent un abonnement : on ne teste ici que l'affichage). */
  run("UPDATE users SET role='initiative', nom_institution=NULL WHERE id=?", uid);
  const cols = sql("PRAGMA table_info(initiatives)").filter(x => x.notnull && x.dflt_value == null && !x.pk).map(x => x.name);
  const valeurs = { owner_user_id: uid, nom: 'Initiative Baobab ' + rnd, type: 'association', description: 'x', pays: 'France', ville: 'Paris', categorie: 'Éducation', secteur: 'Éducation' };
  const noms = [...new Set(['owner_user_id', 'nom', ...cols])];
  run(`INSERT INTO initiatives (${noms.join(',')}) VALUES (${noms.map(() => '?').join(',')})`, ...noms.map(n => valeurs[n] != null ? valeurs[n] : 'x'));
  H.publier(env, id);
  const r = await call(null, 'GET', '/api/formations');
  const carte = r.data.formations.find(f => Number(f.id) === Number(id));
  assert.equal(carte.formateur_affiche, 'Initiative Baobab ' + rnd);
  assert.ok(!/Gestionnaire/.test(JSON.stringify([carte.formateur_affiche, carte.organisme, carte.formateur_nom, carte.auteur_nom])), 'jamais le nom du gestionnaire');
});

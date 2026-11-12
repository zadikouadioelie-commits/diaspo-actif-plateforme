/* tests/inscription-presentation-bio.test.js — « À propos » rempli dès l'inscription (2026-11-12).
   Une initiative / une collectivité a déjà écrit sa présentation (obligatoire) : elle est recopiée dans users.bio, nettoyée, et la page
   profil l'affiche. Une bio saisie par le titulaire n'est jamais écrasée. Base isolée (copie), aucun e-mail envoyé. */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

test('inscription : la présentation de la structure devient son « À propos »', async (t) => {
  const env = await H.demarrer('bio-inscription');
  t.after(() => env.stop());
  const rnd = 'bio' + Math.random().toString(36).slice(2, 5);
  const sql = (req, ...a) => { const d = new H.DatabaseSync(env.dbPath); try { return d.prepare(req).all(...a); } finally { d.close(); } };

  await t.test('initiative : description recopiée et nettoyée', async () => {
    const jar = H.cookieJar();
    const c = H.compte(rnd, 'Asso', 'initiative'); delete c.bio;
    Object.assign(c, {
      nom: 'AJES Test ' + rnd, type_initiative: 'association', statut_creation: 'en_creation', secteur: 'Environnement', ville: 'Abidjan', pays: "Côte d'Ivoire",
      description: "<p>Association ivoirienne pour l'environnement.</p><script>alert(1)</script>",
      nom_responsable: 'Agoua', prenom_responsable: 'Odje', fonction_responsable: 'President', email_responsable: `resp-${rnd}@example.com`, tel_responsable: '+22501020304',
    });
    const r = await env.call(jar, 'POST', '/api/auth/signup', c);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    const id = r.data.user.id;
    assert.equal(sql('select bio from users where id=?', id)[0].bio, "<p>Association ivoirienne pour l'environnement.</p>", 'copiée sans le script');
    const p = await env.call(jar, 'GET', '/api/profil/' + id);
    assert.match(p.data.profil.bio, /Association ivoirienne/);
  });

  await t.test('collectivité : description de l\'institution recopiée', async () => {
    const jar = H.cookieJar();
    const c = H.compte(rnd, 'Mairie', 'collectivite'); delete c.bio;
    Object.assign(c, {
      nom: 'Mairie Test ' + rnd, nom_institution: 'Mairie Test', type_organisme: 'mairie', pays_concerne: "Côte d'Ivoire", pays_origine_institution: "Côte d'Ivoire",
      pays_exercice: "Côte d'Ivoire", ville_exercice: 'Abidjan', telephone_pro: '+22501020304', description_institution: '<p>Commune de test.</p>',
    });
    const r = await env.call(jar, 'POST', '/api/auth/signup', c);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(sql('select bio from users where id=?', r.data.user.id)[0].bio, '<p>Commune de test.</p>');
  });

  await t.test('une bio saisie à l\'inscription n\'est pas remplacée par la description', async () => {
    const jar = H.cookieJar();
    const c = H.compte(rnd, 'Asso2', 'initiative');
    Object.assign(c, {
      bio: 'Ma présentation personnelle.', nom: 'Asso Deux ' + rnd, type_initiative: 'association', statut_creation: 'en_creation', secteur: 'Santé', ville: 'Abidjan', pays: "Côte d'Ivoire",
      description: '<p>Description de la structure.</p>', nom_responsable: 'Koné', prenom_responsable: 'Awa', fonction_responsable: 'Presidente',
      email_responsable: `resp2-${rnd}@example.com`, tel_responsable: '+22501020305',
    });
    const r = await env.call(jar, 'POST', '/api/auth/signup', c);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(sql('select bio from users where id=?', r.data.user.id)[0].bio, 'Ma présentation personnelle.');
  });
});

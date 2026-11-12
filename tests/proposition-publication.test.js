/* ===========================================================
   tests/proposition-publication.test.js — Publication préparée automatiquement (2026-11-12)
   ===========================================================
   Un vrai serveur contre une COPIE isolée de la base. Vérifie :
   • un nouveau compte reçoit la proposition dès la fin de l'inscription (n°1), avec nom, présentation et mention « networking » ;
   • la voir plusieurs fois pendant la même connexion ne la compte qu'une fois ;
   • la connexion suivante la propose une 2e fois (n°2), la suivante plus jamais ;
   • « Reporter » la fait disparaître jusqu'à la prochaine connexion (qui compte comme la 2e) ;
   • publier (POST /api/fil) la supprime pour de bon ; un compte qui a déjà publié n'en reçoit jamais ;
   • une initiative reçoit son nom, son descriptif et sa mission ;
   • un compte de démonstration et un visiteur non connecté n'en reçoivent pas.

   Lancer : node --test tests/proposition-publication.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('proppub'); });
test.after(() => { if (env) env.stop(); });

const sql = (fn) => { const d = new H.DatabaseSync(env.dbPath); try { return fn(d); } finally { d.close(); } };
const proposition = (jar) => env.call(jar, 'GET', '/api/fil/proposition');
/* Une seule session à la fois par compte (protection « multi-connexion ») : on ferme la précédente avant de se reconnecter,
   comme une vraie personne qui revient plus tard. */
async function seConnecter(c, precedent) {
  if (precedent) await env.call(precedent, 'POST', '/api/auth/logout');
  const jar = H.cookieJar();
  const r = await env.call(jar, 'POST', '/api/auth/login', { email: c.email, password: c.password });
  assert.equal(r.status, 200, 'connexion : ' + JSON.stringify(r.data));
  return jar;
}
const nbPropositions = (email) => sql(d => Number(d.prepare('SELECT prop_pub_nb n FROM users WHERE email=?').get(email).n));

test('inscription → proposition n°1, comptée une seule fois ; connexion → n°2 ; connexion suivante → plus rien', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jar = H.cookieJar();
  const c = await H.creerApprenant(env, jar, rnd, 'Premier');

  const p1 = await proposition(jar);
  assert.equal(p1.status, 200);
  assert.equal(p1.data.a_proposer, true, 'proposée dès la fin de la création du compte');
  assert.equal(p1.data.numero, 1);
  assert.equal(p1.data.max, 2);
  assert.match(p1.data.texte, /Aminata Premier/, 'le nom du compte');
  assert.match(p1.data.texte, /Compte de test pour la formation\./, 'la présentation (bio)');
  assert.match(p1.data.texte, /rencontres et du networking/, 'la mention networking');

  const p1bis = await proposition(jar);
  assert.equal(p1bis.data.numero, 1, 'la revoir pendant la même connexion ne la recompte pas');
  assert.equal(nbPropositions(c.email), 1);

  const jar2 = await seConnecter(c, jar);
  const p2 = await proposition(jar2);
  assert.equal(p2.data.a_proposer, true);
  assert.equal(p2.data.numero, 2, 'deuxième proposition à la connexion suivante');

  const jar3 = await seConnecter(c, jar2);
  const p3 = await proposition(jar3);
  assert.equal(p3.data.a_proposer, false, 'après 2 propositions, plus jamais');
  assert.equal(nbPropositions(c.email), 2);
  const jar4 = await seConnecter(c, jar3);
  assert.equal((await proposition(jar4)).data.a_proposer, false);
});

test('« Reporter » fait disparaître la carte ; la prochaine connexion compte comme la 2e', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jar = H.cookieJar();
  const c = await H.creerApprenant(env, jar, rnd, 'Reporte');
  assert.equal((await proposition(jar)).data.a_proposer, true);
  const r = await env.call(jar, 'POST', '/api/fil/proposition/reporter');
  assert.equal(r.status, 200);
  assert.equal((await proposition(jar)).data.a_proposer, false, 'reportée : plus de carte');
  const jar2 = await seConnecter(c, jar);
  const p = await proposition(jar2);
  assert.equal(p.data.a_proposer, true);
  assert.equal(p.data.numero, 2);
});

test('se connecter sans ouvrir de page ne consomme aucune proposition', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const c = H.compte(rnd, 'Silencieux', 'utilisateur');
  const jarIns = H.cookieJar();
  assert.equal((await env.call(jarIns, 'POST', '/api/auth/signup', c)).status, 201);
  let j = await seConnecter(c, jarIns);
  j = await seConnecter(c, j); j = await seConnecter(c, j); j = await seConnecter(c, j);
  assert.equal(nbPropositions(c.email), 0, 'jamais affichée = jamais comptée');
  const jar = j;
  assert.equal((await proposition(jar)).data.numero, 1);
});

test('publier supprime la proposition ; un compte qui a déjà publié n\'en reçoit jamais', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jar = H.cookieJar();
  const c = await H.creerApprenant(env, jar, rnd, 'Publie');
  const p = await proposition(jar);
  assert.equal(p.data.a_proposer, true);
  const pub = await env.call(jar, 'POST', '/api/fil', { contenu: p.data.texte, categorie: 'Publication', visibilite: 'public', pub_type: 'texte' });
  assert.ok(pub.status === 200 || pub.status === 201, 'publication : ' + JSON.stringify(pub.data));
  assert.equal((await proposition(jar)).data.a_proposer, false, 'publiée : plus de carte');
  const jar2 = await seConnecter(c, jar);
  assert.equal((await proposition(jar2)).data.a_proposer, false);

  /* Compte déjà ancien qui a publié avant : jamais de proposition. */
  const rnd2 = Math.random().toString(36).slice(2, 9);
  const c2 = H.compte(rnd2, 'Ancien', 'utilisateur');
  const jarIns2 = H.cookieJar();
  assert.equal((await env.call(jarIns2, 'POST', '/api/auth/signup', c2)).status, 201);
  sql(d => d.prepare("UPDATE users SET premiere_publication_le=datetime('now'), prop_pub_en_cours=0, prop_pub_nb=0 WHERE email=?").run(c2.email));
  const jarAncien = await seConnecter(c2, jarIns2);
  assert.equal((await proposition(jarAncien)).data.a_proposer, false);
});

test('compte existant sans publication : proposée à la prochaine connexion', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const c = H.compte(rnd, 'Existant', 'utilisateur');
  const jarIns = H.cookieJar();
  assert.equal((await env.call(jarIns, 'POST', '/api/auth/signup', c)).status, 201);
  /* Simule un compte créé AVANT la fonction : aucun état de proposition. */
  sql(d => d.prepare('UPDATE users SET prop_pub_nb=0, prop_pub_en_cours=0, prop_pub_vue=0 WHERE email=?').run(c.email));
  const jar = await seConnecter(c, jarIns);
  const p = await proposition(jar);
  assert.equal(p.data.a_proposer, true);
  assert.equal(p.data.numero, 1);
});

test('initiative : nom, descriptif, mission et mention networking', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const c = H.compte(rnd, 'Initiative', 'utilisateur');
  const jarIns = H.cookieJar();
  assert.equal((await env.call(jarIns, 'POST', '/api/auth/signup', c)).status, 201);
  sql(d => {
    const u = d.prepare('SELECT id FROM users WHERE email=?').get(c.email);
    d.prepare("UPDATE users SET role='initiative' WHERE id=?").run(u.id);
    d.prepare('INSERT INTO initiatives (slug, nom, description, mission, ville, pays, owner_user_id) VALUES (?,?,?,?,?,?,?)').run(
      'atelier-' + rnd, 'Atelier Solaire ' + rnd, '<p>Nous formons des jeunes aux métiers du solaire.</p>', 'Électrifier les villages grâce à la diaspora.', 'Abidjan', "Côte d'Ivoire", u.id);
  });
  const jar = await seConnecter(c, jarIns);
  const p = await proposition(jar);
  assert.equal(p.data.a_proposer, true);
  assert.match(p.data.texte, new RegExp('Atelier Solaire ' + rnd), 'nom de l\'initiative');
  assert.match(p.data.texte, /Nous formons des jeunes aux métiers du solaire\./, 'descriptif sans balise');
  assert.doesNotMatch(p.data.texte, /<p>/);
  assert.match(p.data.texte, /Électrifier les villages grâce à la diaspora\./, 'accroche tirée de la mission');
  assert.match(p.data.texte, /disponible pour des rencontres et du networking/);
});

test('compte de démonstration et visiteur : jamais de proposition', async () => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const c = H.compte(rnd, 'Demo', 'utilisateur');
  const jarIns = H.cookieJar();
  assert.equal((await env.call(jarIns, 'POST', '/api/auth/signup', c)).status, 201);
  sql(d => d.prepare('UPDATE users SET is_demo=1 WHERE email=?').run(c.email));
  const jar = await seConnecter(c, jarIns);
  assert.equal((await proposition(jar)).data.a_proposer, false);
  assert.equal((await proposition(H.cookieJar())).data.a_proposer, false, 'visiteur non connecté');
  const rep = await env.call(H.cookieJar(), 'POST', '/api/fil/proposition/reporter');
  assert.equal(rep.status, 401);
});

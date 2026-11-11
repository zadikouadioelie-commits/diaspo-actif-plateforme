/* ===========================================================
   tests/newsletter.test.js — Newsletter des initiatives, étape N1 (2026-11-11)
   ===========================================================
   Abonnement avec double confirmation, désabonnement propre à chaque boutique, liste visible du seul propriétaire.
   Vrai serveur sur une COPIE de la base de dev ; aucun e-mail réel (pas de clé d'envoi), aucun paiement.
   Lancer : node --test tests/newsletter.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const NL = require('../server/newsletter.js');

let env, jarA, jarB, idA, idB, rnd, compteurIp = 0;

const run = (req, ...args) => { const bd = new H.DatabaseSync(env.dbPath); try { return bd.prepare(req).run(...args); } finally { bd.close(); } };
const lire = (req, ...args) => { const bd = new H.DatabaseSync(env.dbPath); try { return bd.prepare(req).get(...args); } finally { bd.close(); } };
const ligne = (initId, email) => lire('SELECT * FROM nl_abonnes WHERE initiative_id=? AND email=?', initId, email);

/* Une adresse IP distincte par demande : la limite de 10 demandes par heure et par connexion ne doit pas fausser les tests. */
async function abonner(initId, corps) {
  compteurIp++;
  const r = await fetch(`${env.base}/api/newsletter/${initId}/abonner`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.99.${(compteurIp >> 8) & 255}.${compteurIp & 255}` }, body: JSON.stringify(corps),
  });
  let data = null; try { data = await r.json(); } catch (e) {}
  return { status: r.status, data };
}
const page = async (chemin) => { const r = await fetch(`${env.base}${chemin}`); return { status: r.status, texte: await r.text() }; };

test.before(async () => {
  env = await H.demarrer('newsletter');
  rnd = Math.random().toString(36).slice(2, 8);
  jarA = H.cookieJar(); jarB = H.cookieJar();
  const a = await H.creerApprenant(env, jarA, rnd, 'ProprioA');
  const b = await H.creerApprenant(env, jarB, rnd, 'ProprioB');
  const uidA = lire('SELECT id FROM users WHERE email=?', a.email).id;
  const uidB = lire('SELECT id FROM users WHERE email=?', b.email).id;
  idA = Number(run("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Boutique Alpha', ?)", uidA).lastInsertRowid);
  idB = Number(run("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Boutique Beta', ?)", uidB).lastInsertRowid);
});
test.after(() => env && env.stop());

test('N1 jetons : longs, aléatoires, différents à chaque appel', () => {
  const a = NL.creerJeton(), b = NL.creerJeton();
  assert.notEqual(a, b);
  assert.ok(a.length >= 30);
});

test('N1 le formulaire refuse : consentement absent, adresse invalide, champ piège rempli, boutique inconnue', async () => {
  const email = `refus-${rnd}@example.com`;
  assert.equal((await abonner(idA, { email })).status, 400, 'sans consentement');
  assert.equal((await abonner(idA, { email, consentement: 'oui' })).status, 400, 'le consentement doit être exactement vrai');
  assert.equal((await abonner(idA, { email: 'pas-une-adresse', consentement: true })).status, 400);
  assert.equal((await abonner(idA, { email, consentement: true, site_perso: 'http://spam' })).status, 400, 'champ piège');
  assert.equal((await abonner(999999, { email, consentement: true })).status, 404);
  assert.equal(ligne(idA, email), undefined, 'aucune ligne ne doit être créée par un refus');
});

test('N1 inscription : l\'abonné est « en attente » et ne devient actif qu\'après avoir cliqué sur le lien', async () => {
  const email = `abonne-${rnd}@example.com`;
  const r = await abonner(idA, { email, nom: 'Awa', consentement: true });
  assert.equal(r.status, 200);
  assert.equal(r.data.message, NL.MESSAGE_GENERIQUE);
  const l = ligne(idA, email);
  assert.equal(l.statut, 'en_attente');
  assert.ok(l.consentement_le, 'la date du consentement est conservée');

  /* Un jeton inventé ne confirme rien. */
  assert.equal((await page('/api/newsletter/confirmer?t=inventeinventeinventeinvente')).status, 400);
  assert.equal(ligne(idA, email).statut, 'en_attente');

  const ok = await page(`/api/newsletter/confirmer?t=${encodeURIComponent(l.jeton)}`);
  assert.equal(ok.status, 200);
  assert.match(ok.texte, /Inscription confirmée/);
  assert.equal(ligne(idA, email).statut, 'actif');
  assert.ok(ligne(idA, email).confirme_le);
  assert.equal((await page(`/api/newsletter/confirmer?t=${encodeURIComponent(l.jeton)}`)).status, 200, 'second clic : déjà confirmé, sans erreur');
});

test('N1 la réponse est la même pour une adresse déjà inscrite : on ne révèle pas qui est abonné', async () => {
  const email = `abonne-${rnd}@example.com`;
  const nouveau = await abonner(idA, { email: `inconnu-${rnd}@example.com`, consentement: true });
  const connu = await abonner(idA, { email, consentement: true });
  assert.equal(connu.status, nouveau.status);
  assert.deepEqual(connu.data, nouveau.data);
  assert.equal(ligne(idA, email).statut, 'actif', 'un abonné actif reste actif et ne repasse pas « en attente »');
});

test('N1 un lien de confirmation expire au bout de 7 jours', async () => {
  const email = `expire-${rnd}@example.com`;
  await abonner(idA, { email, consentement: true });
  run("UPDATE nl_abonnes SET derniere_confirmation_le=datetime('now','-8 days') WHERE initiative_id=? AND email=?", idA, email);
  const l = ligne(idA, email);
  const r = await page(`/api/newsletter/confirmer?t=${encodeURIComponent(l.jeton)}`);
  assert.equal(r.status, 400);
  assert.match(r.texte, /expiré/);
  assert.equal(ligne(idA, email).statut, 'en_attente');
});

test('N1 le désabonnement est propre à la boutique et ne touche pas les autres', async () => {
  const email = `deux-boutiques-${rnd}@example.com`;
  for (const id of [idA, idB]) {
    await abonner(id, { email, consentement: true });
    await page(`/api/newsletter/confirmer?t=${encodeURIComponent(ligne(id, email).jeton)}`);
    assert.equal(ligne(id, email).statut, 'actif');
  }
  assert.notEqual(ligne(idA, email).jeton, ligne(idB, email).jeton, 'un jeton par boutique');
  const r = await page(`/api/newsletter/desabonner?t=${encodeURIComponent(ligne(idA, email).jeton)}`);
  assert.equal(r.status, 200);
  assert.match(r.texte, /désabonné/);
  assert.equal(ligne(idA, email).statut, 'desabonne');
  assert.ok(ligne(idA, email).desabonne_le);
  assert.equal(ligne(idB, email).statut, 'actif', 'l\'autre boutique n\'est pas concernée');
  assert.equal((await page('/api/newsletter/desabonner?t=jetonquinexistepasjetonquinexistepas')).status, 400);
});

test('N1 se réinscrire après un désabonnement demande un nouveau consentement et rend l\'ancien lien inutilisable', async () => {
  const email = `retour-${rnd}@example.com`;
  await abonner(idA, { email, consentement: true });
  const ancien = ligne(idA, email).jeton;
  await page(`/api/newsletter/confirmer?t=${encodeURIComponent(ancien)}`);
  await page(`/api/newsletter/desabonner?t=${encodeURIComponent(ancien)}`);
  assert.equal(ligne(idA, email).statut, 'desabonne');
  /* L'ancien lien de confirmation ne ré-active jamais quelqu'un qui s'est désabonné. */
  assert.equal((await page(`/api/newsletter/confirmer?t=${encodeURIComponent(ancien)}`)).status, 400);
  assert.equal(ligne(idA, email).statut, 'desabonne');
  const r = await abonner(idA, { email, consentement: true });
  assert.equal(r.status, 200);
  const l = ligne(idA, email);
  assert.equal(l.statut, 'en_attente');
  assert.notEqual(l.jeton, ancien);
  assert.equal(l.desabonne_le, null);
});

test('N1 le propriétaire voit ses abonnés (sans jeton) ; un autre propriétaire et un visiteur n\'y ont pas accès', async () => {
  assert.equal((await env.call(null, 'GET', `/api/initiatives/${idA}/newsletter/abonnes`)).status, 401);
  assert.equal((await env.call(jarB, 'GET', `/api/initiatives/${idA}/newsletter/abonnes`)).status, 403);
  const r = await env.call(jarA, 'GET', `/api/initiatives/${idA}/newsletter/abonnes`);
  assert.equal(r.status, 200);
  assert.ok(r.data.abonnes.length >= 3);
  assert.ok(r.data.abonnes.every(a => !('jeton' in a)), 'le jeton ne doit jamais être renvoyé');
  assert.ok(r.data.abonnes.every(a => a.email), 'chaque abonné a une adresse');
  const total = r.data.compteurs.actifs + r.data.compteurs.en_attente + r.data.compteurs.desabonnes;
  assert.equal(total, r.data.abonnes.length);
  assert.ok(r.data.compteurs.actifs >= 1 && r.data.compteurs.en_attente >= 1 && r.data.compteurs.desabonnes >= 1);
  /* La boutique B ne voit pas les abonnés de A. */
  const b = await env.call(jarB, 'GET', `/api/initiatives/${idB}/newsletter/abonnes`);
  assert.ok(b.data.abonnes.every(x => ligne(idB, x.email)), 'uniquement les abonnés de sa propre boutique');
});

test('N1 le propriétaire peut retirer un abonné de sa boutique, pas celui d\'une autre', async () => {
  const email = `retire-${rnd}@example.com`;
  await abonner(idA, { email, consentement: true });
  const id = ligne(idA, email).id;
  assert.equal((await env.call(jarB, 'DELETE', `/api/initiatives/${idA}/newsletter/abonnes/${id}`)).status, 403);
  assert.ok(ligne(idA, email), 'rien n\'est supprimé par un tiers');
  /* Même propriétaire mais mauvaise boutique : introuvable. */
  assert.equal((await env.call(jarB, 'DELETE', `/api/initiatives/${idB}/newsletter/abonnes/${id}`)).status, 404);
  assert.ok(ligne(idA, email));
  assert.equal((await env.call(jarA, 'DELETE', `/api/initiatives/${idA}/newsletter/abonnes/${id}`)).status, 200);
  assert.equal(ligne(idA, email), undefined);
});

test('N1 le message de confirmation est échappé et contient le lien', () => {
  const html = NL.htmlConfirmation({ nomBoutique: '<b>Boutique</b> & Cie', lien: 'https://exemple.test/api/newsletter/confirmer?t=abc' });
  assert.ok(!html.includes('<b>Boutique</b>'), 'le nom de la boutique est échappé');
  assert.match(html, /&lt;b&gt;Boutique&lt;\/b&gt; &amp; Cie/);
  assert.match(html, /href="https:\/\/exemple\.test\/api\/newsletter\/confirmer\?t=abc"/);
});

/* Module « Accréditations » (2026-11-02) : un vrai serveur contre une COPIE isolée de la base de dev.
   Vérifie la réserve au compte officiel, la demande, l'attribution par message sécurisé, l'activation par code
   (usage unique, lié au compte, 3 erreurs = blocage, expiration) et la suspension / réactivation / révocation. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { demarrer, cookieJar, compte, creerFormateur, creerApprenant, DatabaseSync } = require('./_formation-harness');
const crypto = require('node:crypto');
const AccredSimple = require('../server/accreditation-simple');

const MDP_OFFICIEL = 'OfficielTest123!';
const DEMANDE = { type: 'influenceur_ida', telephone: '+33 6 12 34 56 78', email: 'officiel@example.com', motif: "Je souhaite publier des podcasts vidéo pour la diaspora." };

test('Accréditations : parcours complet', async (t) => {
  const env = await demarrer('accred');
  t.after(() => env.stop());
  const rnd = Date.now().toString(36);
  const sq = () => { const c = new DatabaseSync(env.dbPath); c.exec('PRAGMA busy_timeout=15000'); return c; };

  /* Le compte officiel de la copie reçoit un mot de passe connu (base isolée). */
  let s = sq();
  const off = s.prepare("SELECT id, email FROM users WHERE email='diaspo.actif@gmail.com'").get();
  assert.ok(off, 'le compte officiel existe dans la base de dev');
  const sel = crypto.randomBytes(16).toString('hex');
  s.prepare('UPDATE users SET password_hash=?, password_salt=?, suspendu_definitif=0, suspendu_jusqu_au=NULL WHERE id=?').run(crypto.scryptSync(MDP_OFFICIEL, sel, 64).toString('hex'), sel, off.id);
  s.close();

  const jOff = cookieJar(), jAdmin = cookieJar(), jMembre = cookieJar(), jAnon = cookieJar();
  const adminCpt = await creerFormateur(env, jAdmin, rnd, 'AdminAcc');     // promu administrateur dans la base isolée
  await creerApprenant(env, jMembre, rnd, 'MembreAcc');
  const lo = await env.call(jOff, 'POST', '/api/auth/login', { email: 'diaspo.actif@gmail.com', password: MDP_OFFICIEL });
  assert.equal(lo.status, 200, 'connexion du compte officiel : ' + JSON.stringify(lo.data));

  await t.test('réserve : anonyme 401, autre membre 403, officiel 200', async () => {
    assert.equal((await env.call(jAnon, 'GET', '/api/accreditation-simple/etat')).status, 401);
    assert.equal((await env.call(jMembre, 'GET', '/api/accreditation-simple/etat')).status, 403);
    const r = await env.call(jOff, 'GET', '/api/accreditation-simple/etat');
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.types.map(x => x.type), ['formateur', 'influenceur_ida']);
    assert.ok(r.data.types.every(x => x.statut === 'aucune'));
  });

  await t.test('/api/auth/me : drapeau visible du seul compte officiel', async () => {
    const o = await env.call(jOff, 'GET', '/api/auth/me');
    assert.deepEqual(o.data.user.accred_simple, { actives: [], suspendues: [] });
    const m = await env.call(jMembre, 'GET', '/api/auth/me');
    assert.equal(m.data.user.accred_simple, null);
  });

  await t.test('demande : validations, enregistrement, doublon', async () => {
    assert.equal((await env.call(jOff, 'POST', '/api/accreditation-simple/demande', { ...DEMANDE, telephone: 'abc' })).status, 400);
    assert.equal((await env.call(jOff, 'POST', '/api/accreditation-simple/demande', { ...DEMANDE, email: 'pas-un-mail' })).status, 400);
    assert.equal((await env.call(jOff, 'POST', '/api/accreditation-simple/demande', { ...DEMANDE, motif: 'court' })).status, 400);
    assert.equal((await env.call(jOff, 'POST', '/api/accreditation-simple/demande', { ...DEMANDE, type: 'inconnu' })).status, 400);
    assert.equal((await env.call(jMembre, 'POST', '/api/accreditation-simple/demande', DEMANDE)).status, 403);
    assert.equal((await env.call(jOff, 'POST', '/api/accreditation-simple/demande', DEMANDE)).status, 201);
    assert.equal((await env.call(jOff, 'POST', '/api/accreditation-simple/demande', DEMANDE)).status, 409);
    const e = await env.call(jOff, 'GET', '/api/accreditation-simple/etat');
    assert.equal(e.data.types.find(x => x.type === 'influenceur_ida').statut, 'demande_envoyee');
  });

  await t.test('administration : réservée aux administrateurs, la demande est visible avec téléphone et e-mail', async () => {
    assert.equal((await env.call(jOff, 'GET', '/api/admin/accreditation-simple/demandes')).status, 403);
    assert.equal((await env.call(jMembre, 'POST', '/api/admin/accreditation-simple/attribuer', { user_id: off.id, type: 'influenceur_ida' })).status, 403);
    const d = await env.call(jAdmin, 'GET', '/api/admin/accreditation-simple/demandes');
    assert.equal(d.status, 200);
    const ligne = d.data.demandes.find(x => x.user_id === off.id && x.type === 'influenceur_ida');
    assert.ok(ligne);
    assert.equal(ligne.telephone, DEMANDE.telephone);
    assert.equal(ligne.email, DEMANDE.email);
  });

  await t.test('attribution : message sécurisé envoyé, aucun code en clair en base, demande traitée', async () => {
    const r = await env.call(jAdmin, 'POST', '/api/admin/accreditation-simple/attribuer', { user_id: off.id, type: 'influenceur_ida' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const s2 = sq();
    const a = s2.prepare("SELECT * FROM accred_simple_attributions WHERE user_id=? AND type='influenceur_ida'").get(off.id);
    assert.equal(a.statut, 'code_envoye');
    assert.match(a.code_hash, /^[0-9a-f]{64}$/);
    const n = s2.prepare("SELECT COUNT(*) AS n FROM messages_securises").get().n;
    assert.ok(n >= 1, 'un message sécurisé a été créé');
    const dem = s2.prepare("SELECT statut FROM accred_simple_demandes WHERE user_id=? AND type='influenceur_ida'").get(off.id);
    assert.equal(dem.statut, 'traitee');
    s2.close();
    const e = await env.call(jOff, 'GET', '/api/accreditation-simple/etat');
    assert.equal(e.data.types.find(x => x.type === 'influenceur_ida').statut, 'code_a_saisir');
    assert.equal((await env.call(jAdmin, 'POST', '/api/admin/accreditation-simple/attribuer', { user_id: 999999999, type: 'influenceur_ida' })).status, 404);
  });

  /* Le code réel n'est lisible que dans le message sécurisé : pour tester l'activation, on installe un code connu (même haché que le serveur). */
  const CODE = 'ABCD2345';
  const poserCode = (expire) => { const s3 = sq(); s3.prepare("UPDATE accred_simple_attributions SET statut='code_envoye', code_hash=?, code_expire_le=?, essais=0, verrou_jusqua=NULL WHERE user_id=? AND type='influenceur_ida'").run(AccredSimple._hacher(CODE, off.id, 'influenceur_ida'), expire || new Date(Date.now() + 86400000).toISOString(), off.id); s3.close(); };
  const activer = (jar, code) => env.call(jar, 'POST', '/api/accreditation-simple/activer', { type: 'influenceur_ida', code });

  await t.test('activation : 3 erreurs = blocage, même le bon code est refusé pendant le blocage', async () => {
    poserCode();
    const r1 = await activer(jOff, 'ZZZZ-9999'); assert.equal(r1.status, 403); assert.equal(r1.data.essais_restants, 2);
    assert.equal((await activer(jOff, 'ZZZZ-9998')).status, 403);
    assert.equal((await activer(jOff, 'ZZZZ-9997')).status, 429);
    assert.equal((await activer(jOff, 'ABCD-2345')).status, 429);
    const s4 = sq(); s4.prepare("UPDATE accred_simple_attributions SET verrou_jusqua=NULL, essais=0 WHERE user_id=?").run(off.id); s4.close();
  });

  await t.test('activation : code expiré refusé', async () => {
    poserCode(new Date(Date.now() - 1000).toISOString());
    assert.equal((await activer(jOff, 'ABCD-2345')).status, 410);
    const e = await env.call(jOff, 'GET', '/api/accreditation-simple/etat');
    assert.equal(e.data.types.find(x => x.type === 'influenceur_ida').code_expire, true);
  });

  await t.test('activation : bon code accepté, usage unique, haché effacé', async () => {
    poserCode();
    const ok = await activer(jOff, 'abcd-2345');
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal((await activer(jOff, 'ABCD-2345')).status, 404, 'le code ne sert qu\'une fois');
    const s5 = sq(); const a = s5.prepare("SELECT statut, code_hash FROM accred_simple_attributions WHERE user_id=?").get(off.id); s5.close();
    assert.equal(a.statut, 'active'); assert.equal(a.code_hash, null);
    const me = await env.call(jOff, 'GET', '/api/auth/me');
    assert.deepEqual(me.data.user.accred_simple.actives, ['influenceur_ida']);
  });

  await t.test('le code est lié au compte : le même code ne correspond à rien pour un autre compte', () => {
    assert.notEqual(AccredSimple._hacher(CODE, off.id, 'influenceur_ida'), AccredSimple._hacher(CODE, off.id + 1, 'influenceur_ida'));
    assert.notEqual(AccredSimple._hacher(CODE, off.id, 'influenceur_ida'), AccredSimple._hacher(CODE, off.id, 'formateur'));
  });

  await t.test('suspendre / réactiver / retirer', async () => {
    const cible = { user_id: off.id, type: 'influenceur_ida' };
    assert.equal((await env.call(jAdmin, 'POST', '/api/admin/accreditation-simple/reactiver', cible)).status, 409, 'rien à réactiver');
    assert.equal((await env.call(jAdmin, 'POST', '/api/admin/accreditation-simple/suspendre', { ...cible, motif: 'Contrôle' })).status, 200);
    let e = await env.call(jOff, 'GET', '/api/accreditation-simple/etat');
    assert.equal(e.data.types.find(x => x.type === 'influenceur_ida').statut, 'suspendue');
    assert.deepEqual((await env.call(jOff, 'GET', '/api/auth/me')).data.user.accred_simple, { actives: [], suspendues: ['influenceur_ida'] });
    assert.equal((await env.call(jAdmin, 'POST', '/api/admin/accreditation-simple/reactiver', cible)).status, 200);
    assert.equal((await env.call(jAdmin, 'POST', '/api/admin/accreditation-simple/revoquer', { ...cible, motif: 'Fin de partenariat' })).status, 200);
    e = await env.call(jOff, 'GET', '/api/accreditation-simple/etat');
    assert.equal(e.data.types.find(x => x.type === 'influenceur_ida').statut, 'revoquee');
    assert.equal((await env.call(jOff, 'POST', '/api/accreditation-simple/demande', DEMANDE)).status, 409, 'une accréditation retirée ne se redemande pas seul');
  });

  await t.test('renvoi : un nouveau code annule l\'ancien', async () => {
    assert.equal((await env.call(jAdmin, 'POST', '/api/admin/accreditation-simple/attribuer', { user_id: off.id, type: 'influenceur_ida' })).status, 200);
    const s6 = sq(); const avant = s6.prepare("SELECT code_hash FROM accred_simple_attributions WHERE user_id=?").get(off.id).code_hash; s6.close();
    assert.equal((await env.call(jAdmin, 'POST', '/api/admin/accreditation-simple/renvoyer', { user_id: off.id, type: 'influenceur_ida' })).status, 200);
    const s7 = sq(); const apres = s7.prepare("SELECT code_hash, statut FROM accred_simple_attributions WHERE user_id=?").get(off.id); s7.close();
    assert.notEqual(avant, apres.code_hash); assert.equal(apres.statut, 'code_envoye');
  });

  await t.test('refus d\'une demande', async () => {
    assert.equal((await env.call(jOff, 'POST', '/api/accreditation-simple/demande', { ...DEMANDE, type: 'formateur' })).status, 201);
    const d = (await env.call(jAdmin, 'GET', '/api/admin/accreditation-simple/demandes')).data.demandes.find(x => x.type === 'formateur');
    assert.equal((await env.call(jAdmin, 'POST', '/api/admin/accreditation-simple/refuser', { demande_id: d.id, motif: 'Dossier incomplet' })).status, 200);
    const e = await env.call(jOff, 'GET', '/api/accreditation-simple/etat');
    const f = e.data.types.find(x => x.type === 'formateur');
    assert.equal(f.statut, 'demande_refusee'); assert.equal(f.motif, 'Dossier incomplet');
  });
});

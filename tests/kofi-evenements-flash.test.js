/* ===========================================================
   tests/kofi-evenements-flash.test.js — KOFFI CRÉE UN ÉVÉNEMENT FLASH (2026-11-01)
   ===========================================================
   Règles vérifiées : seuls les comptes autorisés (Initiative, Collectivité, Administrateur + Premium) peuvent créer — les autres reçoivent une explication, rien n'est publié ;
   Koffi pose les questions qui manquent (brouillon incomplet = jamais publié) ; la confirmation (« oui » ou bouton Publier) ne publie que si le brouillon était complet ET identique à
   celui que la personne a vu ; la publication passe par la route habituelle POST /api/evenements (donc mêmes contrôles) ; date passée / lointaine refusées ; l'image jointe n'est
   JAMAIS transmise à l'IA ; abandon du brouillon ; un bouton périmé est refusé.
   Lancer : node --test tests/kofi-evenements-flash.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const F = require('../server/kofi-evenements-flash');
const E = require('../server/kofi-evenements');

let env;
const journalIA = path.join(os.tmpdir(), 'faux-ia-evenements-flash-' + process.pid + '.log');
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-evenements-flash');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('Koffi événement flash — fonctions pures', () => {
  const auj = '2026-11-04';
  const v = F.validerBrouillon({ titre: '  Soirée <b>culture</b> ', date_evt: '2026-11-20', lieu: 'Salle A', ville: 'Lyon', pays: 'France', description: 'x'.repeat(700), image_choix: 'sans' }, auj);
  assert.equal(v.champs.titre, 'Soirée culture'); assert.equal(v.champs.description.length, F.MAX_DESCRIPTION);
  assert.deepEqual(F.manquants(v.champs), []);
  assert.deepEqual(F.manquants(F.validerBrouillon({}, auj).champs).map(x => x.cle), ['titre', 'date', 'lieu', 'ville', 'description', 'image']);
  assert.deepEqual(F.manquants(F.validerBrouillon({ titre: 'A', date_evt: '2026-11-20', en_ligne: true, description: 'd', image_choix: 'sans' }, auj).champs), [], 'en ligne : ni lieu ni ville');
  assert.ok(F.validerBrouillon({ date_evt: '2026-10-01' }, auj).problemes.includes('date_passee'));
  assert.ok(F.validerBrouillon({ date_evt: '2030-10-01' }, auj).problemes.includes('date_lointaine'));
  assert.ok(F.validerBrouillon({ date_evt: '2026-11-20', heure_debut: '20:00', heure_fin: '18:00' }, auj).problemes.includes('heure_fin_avant_debut'));
  const c = F.validerBrouillon({ titre: 'T', date_evt: '2026-11-20', lieu: 'L', ville: 'V', pays: 'P', description: 'D', image_choix: 'sans', image_url: 'javascript:alert(1)' }, auj).champs;
  assert.equal(c.image_url, '', 'seule une adresse https ou interne est acceptée');
  assert.equal(F.corpsPublication(c).inscription_ouverte, false);
  assert.ok(F.memeBrouillon(c, { ...c })); assert.ok(!F.memeBrouillon(c, { ...c, titre: 'Autre' }));
  assert.ok(E.lireSortie('{"action":"flash","message":"ok","brouillon":{"titre":"A"},"confirme":true}').confirme);
  assert.equal(E.lireSortie('{"action":"flash","message":"ok","brouillon":{"titre":"A"},"confirme":"oui"}').confirme, false, 'seul le booléen true confirme');
  assert.equal(E.lireSortie('{"action":"abandonner"}').action, 'abandonner');
  assert.match(E.systemePour(), /événement flash/i);
});

test('Koffi événement flash — parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const jar = {}; for (const n of ['Adm', 'Adm2', 'Libre']) jar[n] = H.cookieJar();
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const etat = j => call(j, 'GET', '/api/kofi/evenements/etat');
  const dire = (j, texte, extra) => call(j, 'POST', '/api/kofi/evenements/messages', { texte, ...extra });
  const nbEvt = titre => sql('select count(*) n from evenements where titre=?', titre)[0].n;
  const TITRE = 'Soirée flash ' + rnd;
  const TITRE_BTN = 'Rencontre bouton ' + rnd;
  const COMPLET = `FLASHFAUX F_TITRE:${TITRE.replace(/ /g, '_')} F_DATE:+9 F_LIEU:Maison_des_Associations F_VILLE:Lyon F_PAYS:France F_DESC:Une_soirée_pour_se_retrouver. F_SANSIMAGE`;
  let conv;

  await t.test('setup — un administrateur (peut publier) et un compte simple (ne peut pas)', async () => {
    await H.creerFormateur(env, jar.Adm, rnd, 'Adm');
    await H.creerFormateur(env, jar.Adm2, rnd, 'Adm2');   /* second administrateur : la limite de 12 messages par minute s'applique par compte */
    await H.creerApprenant(env, jar.Libre, rnd, 'Libre');
    sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid('Libre'));
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    for (const n of ['Adm', 'Adm2', 'Libre']) assert.equal((await call(jar[n], 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
  });

  await t.test('/etat : la création n\'est annoncée qu\'aux comptes autorisés', async () => {
    assert.equal((await etat(jar.Adm)).data.flash.disponible, true);
    assert.equal((await etat(jar.Libre)).data.flash.disponible, false);
  });

  await t.test('compte sans droit : Koffi explique, rien n\'est publié', async () => {
    const r = await dire(jar.Libre, COMPLET + ' CONFIRMEFAUX');
    assert.equal(r.status, 200); assert.match(r.data.message.contenu, /Seuls les comptes Initiative, Collectivité et Administrateur/);
    assert.equal(r.data.message.brouillon, undefined); assert.equal(nbEvt(TITRE), 0);
  });

  await t.test('brouillon incomplet : Koffi dit ce qui manque, rien n\'est publié, même si le modèle demande de confirmer', async () => {
    let r = await dire(jar.Adm, `FLASHFAUX F_TITRE:${TITRE.replace(/ /g, '_')} CONFIRMEFAUX`);
    assert.equal(r.status, 200); conv = r.data.conversation_id;
    const b = r.data.message.brouillon;
    assert.ok(b && b.pret === false); assert.ok(b.manquants.includes('la date')); assert.ok(b.manquants.includes('la description'));
    assert.match(r.data.message.contenu, /Il me manque encore/);
    assert.equal(nbEvt(TITRE), 0);
    /* Le brouillon est complété d'un message à l'autre. */
    r = await dire(jar.Adm, 'FLASHFAUX F_DATE:+9 F_LIEU:Maison_des_Associations F_VILLE:Lyon F_PAYS:France', { conversation_id: conv });
    assert.deepEqual(r.data.message.brouillon.manquants, ['la description', "l'image (ou « sans image »)"]);
    assert.equal(r.data.message.brouillon.titre, TITRE, 'le titre du message précédent est conservé');
    r = await dire(jar.Adm, 'FLASHFAUX F_DESC:Une_soirée_pour_se_retrouver. F_SANSIMAGE CONFIRMEFAUX', { conversation_id: conv });
    assert.equal(r.data.message.brouillon.pret, true, 'complet, mais le brouillon précédent ne l\'était pas : pas de publication sur ce « oui »');
    assert.equal(nbEvt(TITRE), 0, 'la personne n\'a pas encore VU le brouillon complet');
  });

  await t.test('confirmation après avoir vu le brouillon complet : publié par la route habituelle', async () => {
    const r = await dire(jar.Adm, 'FLASHFAUX CONFIRMEFAUX', { conversation_id: conv });
    assert.equal(r.status, 200); assert.match(r.data.message.contenu, /C'est publié/);
    assert.equal(r.data.message.evenements.length, 1); assert.equal(r.data.message.evenements[0].titre, TITRE);
    const e = sql('select * from evenements where titre=?', TITRE);
    assert.equal(e.length, 1); assert.equal(e[0].ville, 'Lyon'); assert.equal(e[0].owner_user_id, uid('Adm'));
    assert.ok(!e[0].inscription_ouverte, 'événement flash : informatif');
    /* Après publication, plus de brouillon en cours : un nouveau « oui » ne republie rien. */
    const r2 = await dire(jar.Adm, 'FLASHFAUX CONFIRMEFAUX', { conversation_id: conv });
    assert.equal(nbEvt(TITRE), 1);
    assert.ok(r2.data.message.brouillon && r2.data.message.brouillon.pret === false);
  });

  await t.test('bouton Publier : brouillon complet d\'un coup, puis clic ; un second clic est refusé', async () => {
    const COMPLET2 = COMPLET.replace(TITRE.replace(/ /g, '_'), TITRE_BTN.replace(/ /g, '_'));
    const r = await dire(jar.Adm, COMPLET2);
    assert.equal(r.data.message.brouillon.pret, true); assert.equal(nbEvt(TITRE_BTN), 0);
    const mid = r.data.message.id;
    assert.equal((await call(jar.Libre, 'POST', '/api/kofi/evenements/flash/publier', { message_id: mid })).status, 404, 'le brouillon d\'une autre personne');
    const p = await call(jar.Adm, 'POST', '/api/kofi/evenements/flash/publier', { message_id: mid });
    assert.equal(p.status, 201, JSON.stringify(p.data)); assert.equal(nbEvt(TITRE_BTN), 1);
    assert.match(p.data.message.contenu, /C'est publié/); assert.equal(p.data.message.evenements[0].titre, TITRE_BTN);
    assert.equal((await call(jar.Adm, 'POST', '/api/kofi/evenements/flash/publier', { message_id: mid })).status, 409, 'plus le dernier brouillon');
    assert.equal(nbEvt(TITRE_BTN), 1);
  });

  await t.test('date passée refusée ; abandon du brouillon ; bouton Abandonner', async () => {
    let r = await dire(jar.Adm, COMPLET.replace('F_DATE:+9', 'F_DATE:2020-01-01').replace(TITRE.replace(/ /g, '_'), 'Vieux_projet'));
    assert.match(r.data.message.contenu, /déjà passée/); assert.ok(r.data.message.brouillon.manquants.includes('la date'));
    const conv2 = r.data.conversation_id;
    r = await dire(jar.Adm, 'ABANDONFAUX', { conversation_id: conv2 });
    assert.match(r.data.message.contenu, /abandonne/); assert.equal(r.data.message.brouillon, undefined);
    r = await dire(jar.Adm, 'FLASHFAUX CONFIRMEFAUX', { conversation_id: conv2 });
    assert.equal(nbEvt('Vieux projet'), 0);
    const r3 = await dire(jar.Adm, COMPLET.replace(TITRE.replace(/ /g, '_'), 'Projet_abandonné'));
    const a = await call(jar.Adm, 'POST', '/api/kofi/evenements/flash/abandonner', { message_id: r3.data.message.id });
    assert.equal(a.status, 200); assert.equal(nbEvt('Projet abandonné'), 0);
    assert.equal((await call(jar.Adm, 'POST', '/api/kofi/evenements/flash/publier', { message_id: r3.data.message.id })).status, 409);
  });

  await t.test('image jointe : jamais transmise à l\'IA ; échec d\'enregistrement signalé', async () => {
    try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ }
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const r = await dire(jar.Adm, COMPLET.replace('F_SANSIMAGE', '') + ' F_AVECIMAGE', { image: png });
    assert.equal(r.status, 200);
    const journal = fs.existsSync(journalIA) ? fs.readFileSync(journalIA, 'utf8') : '';
    assert.ok(journal.length > 0); assert.ok(!journal.includes('iVBORw0KGgo'), 'l\'image ne part jamais au fournisseur d\'IA');
    const b = r.data.message.brouillon;
    if (!b.image_url) { assert.match(r.data.message.contenu, /pas pu enregistrer l'image/); assert.ok(b.manquants.includes("l'image (ou « sans image »)")); }
    else assert.match(b.image_url, /^https:\/\//);
  });

  await t.test('un message qui n\'a rien à voir avec le brouillon le conserve (recherche entre deux)', async () => {
    const r1 = await dire(jar.Adm2, COMPLET.replace(TITRE.replace(/ /g, '_'), 'Brouillon_conservé'));
    const cv = r1.data.conversation_id;
    const r2 = await dire(jar.Adm2, 'PERIODE:a_venir', { conversation_id: cv });
    assert.equal(r2.status, 200);
    const r3 = await dire(jar.Adm2, 'FLASHFAUX CONFIRMEFAUX', { conversation_id: cv });
    assert.match(r3.data.message.contenu, /C'est publié/); assert.equal(nbEvt('Brouillon conservé'), 1);
  });
});

/* ===========================================================
   tests/kofi-navigation.test.js — KOFFI, GUIDE DE NAVIGATION DANS TOUTES LES PAGES (2026-11-01)
   ===========================================================
   Règles vérifiées : le modèle ne reçoit QUE le catalogue des pages (aucun e-mail, nom ni donnée de compte) et la page où se trouve la personne ; seules des clés du
   catalogue (filtré par rôle) deviennent des boutons, les liens sont construits par le serveur ; GRATUIT : ni le crédit, ni le mensuel Premium, ni les 15 questions
   offertes ne sont touchés, mais l'usage est enregistré (catégorie « navigation ») ; majorité exigée avant tout appel IA ; « Que sais-tu faire ? » sans IA ;
   panne / refus / réponse illisible sans effet sur le crédit ; plafond quotidien ; conversations privées et supprimables.
   Lancer : node --test tests/kofi-navigation.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const N = require('../server/kofi-navigation');
const Pages = require('../server/kofi-navigation-pages');

let env;
const journalIA = path.join(os.tmpdir(), 'faux-ia-navigation-' + process.pid + '.log');
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-navigation');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('Koffi navigation — catalogue et sortie du modèle (fonctions pures)', () => {
  /* Catalogue : clés uniques, adresses relatives, aucune page d'administration. */
  const cles = Pages.PAGES.map(p => p.cle);
  assert.equal(new Set(cles).size, cles.length);
  for (const p of Pages.PAGES) { assert.ok(p.titre && p.desc, p.cle); assert.ok(!/^https?:/.test(p.url) && !p.url.startsWith('/'), p.cle); }
  assert.ok(!Pages.PAGES.some(p => /admin/i.test(p.url) && !p.url.startsWith('@')));
  /* Selon le compte : tableau de bord, profil, pages réservées. */
  const u = Pages.pagesPour({ id: 7, role: 'utilisateur' }), i = Pages.pagesPour({ id: 8, role: 'initiative' }), c = Pages.pagesPour({ id: 9, role: 'collectivite' });
  assert.equal(u.find(p => p.cle === 'tableau_de_bord').url, 'dashboard-utilisateur.html');
  assert.equal(i.find(p => p.cle === 'tableau_de_bord').url, 'dashboard-initiative.html');
  assert.equal(u.find(p => p.cle === 'mon_profil').url, 'profil.html?id=7');
  assert.equal(c.find(p => p.cle === 'mon_profil').url, 'profil-collectivite.html?id=9');
  assert.ok(!u.some(p => p.cle === 'scanner_billets') && i.some(p => p.cle === 'scanner_billets'));
  /* Page actuelle : seul le NOM de fichier compte ; les alias « -app » sont reconnus ; le reste est ignoré. */
  assert.equal(Pages.pageActuelle('/evenements-app.html?x=1').cle, 'evenements');
  assert.equal(Pages.pageActuelle('annuaire.html#haut').cle, 'annuaire');
  assert.equal(Pages.pageActuelle('/dashboard-initiative.html').cle, 'tableau_de_bord');
  assert.equal(Pages.pageActuelle('https://exemple.test/../etc/passwd'), null);
  assert.equal(Pages.pageActuelle('/inconnue.html'), null);
  /* Sortie du modèle : seules les clés autorisées, 3 au plus, sans doublon ; sans message ou sans JSON = illisible. */
  const ok = ['evenements', 'annuaire', 'faq', 'premium'];
  const s = N.lireSortie('```json\n{"message":"Voici.","destinations":["evenements","nimporte","evenements","annuaire","faq","premium"]}\n```', ok);
  assert.deepEqual(s.destinations, ['evenements', 'annuaire', 'faq']);
  assert.deepEqual(N.lireSortie('{"message":"Bonjour","destinations":"evenements"}', ok).destinations, []);
  assert.equal(N.lireSortie('{"message":"","destinations":["faq"]}', ok), null);
  assert.equal(N.lireSortie('Voici ma réponse sans structure.', ok), null);
  assert.match(N.systemePour(u), /ASSISTANT_NAVIGATION/);
  assert.match(N.systemePour(u), /- evenements \| Événements \|/);
});

test('Koffi navigation — parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const NOMS = ['Prop', 'Libre', 'Autre', 'Plaf', 'Nomaj', 'Adm'];
  const jar = {}; for (const n of NOMS) jar[n] = H.cookieJar();
  const anon = H.cookieJar();
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const etat = j => call(j, 'GET', '/api/kofi/navigation/etat');
  const msg = (j, body) => call(j, 'POST', '/api/kofi/navigation/messages', body);
  const solde = async nom => { const w = (await call(jar[nom], 'GET', '/api/kofi/portefeuille')).data.portefeuille; return Math.round((w.solde_eur + w.mensuel_restant_eur + w.achete_restant_eur) * 1e6) / 1e6 + ':' + (w.offertes ? w.offertes.restantes : '-'); };
  const nbIA = () => { try { return fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean).length; } catch (e) { return 0; } };
  const dernierAppel = () => { const l = fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean); return JSON.parse(l[l.length - 1]); };
  const usages = nom => sql('select categorie, cout_eur from kofi_usage where user_id=? order by id', uid(nom));

  await t.test('setup — comptes, réserve IA, majorité', async () => {
    await H.creerFormateur(env, jar.Adm, rnd, 'Adm');
    for (const n of ['Prop', 'Libre', 'Autre', 'Plaf', 'Nomaj']) await H.creerApprenant(env, jar[n], rnd, n);
    for (const n of ['Prop', 'Libre', 'Autre', 'Plaf', 'Nomaj']) { sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid(n)); sql('DELETE FROM user_accreditations WHERE user_id=?', uid(n)); }
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    H.ordinariser(env, rnd, 'Prop');
    for (const n of ['Libre', 'Autre', 'Plaf', 'Adm']) assert.equal((await call(jar[n], 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
  });

  await t.test('accès : visiteur 401 ; majorité exigée avant tout appel IA', async () => {
    assert.equal((await etat(anon)).status, 401);
    assert.equal((await msg(anon, { texte: 'où sont les événements ?' })).status, 401);
    const avant = nbIA();
    const r = await msg(jar.Nomaj, { texte: 'où sont les événements ?' });
    assert.equal(r.status, 403); assert.equal(r.data.code, 'majorite_requise');
    assert.equal(nbIA(), avant);
    const e = await etat(jar.Nomaj); assert.equal(e.status, 200); assert.equal(e.data.etat, 'majorite'); assert.ok(e.data.majorite.texte);
    assert.equal((await etat(jar.Libre)).data.etat, 'utilisable');
  });

  await t.test('réponse : boutons validés par le serveur, GRATUIT (crédit et questions offertes intacts), usage enregistré', async () => {
    const s0 = { Prop: await solde('Prop'), Libre: await solde('Libre') };
    for (const nom of ['Prop', 'Libre']) {
      const avant = nbIA();
      const r = await msg(jar[nom], { texte: 'Où publier un événement ? PAGE:evenements,inexistante,annuaire,evenements', page: '/fil-actualite.html' });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      assert.equal(nbIA(), avant + 1);
      assert.deepEqual(r.data.message.destinations.map(d => d.cle), ['evenements', 'annuaire']);
      assert.deepEqual(r.data.message.destinations.map(d => d.url), ['evenements.html', 'annuaire.html']);
      assert.equal(r.data.message.destinations[0].tel, '#/evenements');
      assert.equal(r.data.message.gratuit, true);
    }
    assert.equal(await solde('Prop'), s0.Prop); assert.equal(await solde('Libre'), s0.Libre);
    for (const nom of ['Prop', 'Libre']) { const u = usages(nom); assert.equal(u.length, 1); assert.equal(u[0].categorie, 'navigation'); assert.ok(u[0].cout_eur > 0); }
  });

  await t.test('ce que reçoit le modèle : catalogue + page actuelle, aucune donnée de compte', async () => {
    const appel = dernierAppel();
    assert.match(appel.systeme, /ASSISTANT_NAVIGATION/);
    assert.match(appel.systeme, /- annuaire \| Annuaire \|/);
    const entree = JSON.stringify(appel);
    const c = H.compte(rnd, 'Libre', 'utilisateur');
    for (const interdit of [c.email, c.nom, c.telephone, String(uid('Libre'))]) assert.ok(!entree.includes(interdit), 'ne doit pas être transmis : ' + interdit);
    assert.match(appel.messages[appel.messages.length - 1].content, /<page_actuelle>fil \| Fil d'actualité<\/page_actuelle>/);
    /* Une page inventée ou une adresse libre ne devient jamais un nom de page. */
    await msg(jar.Autre, { texte: 'où ça ?', page: 'https://pirate.test/x.html' });
    assert.match(dernierAppel().messages.pop().content, /<page_actuelle>inconnue<\/page_actuelle>/);
  });

  await t.test('chiffres publics (2026-11-01) : le modèle reçoit des compteurs exacts, jamais de donnée de compte dedans', async () => {
    await msg(jar.Autre, { texte: 'combien de boutiques y a-t-il ?' });
    const appel = dernierAppel();
    assert.match(appel.systeme, /<stats_publiques>/);
    const nbBoutiquesAttendu = sql(`SELECT COUNT(*) n FROM initiatives i LEFT JOIN users u ON u.id=i.owner_user_id WHERE (u.is_demo IS NULL OR u.is_demo=FALSE) AND i.vitrine_active=1`)[0].n;
    assert.match(appel.systeme, new RegExp(`boutiques actives : ${nbBoutiquesAttendu}\\b`));
    assert.match(appel.systeme, /membres \(hors administration\) : \d+/);
    assert.match(appel.systeme, /jamais citer ni estimer un autre chiffre/);
  });

  await t.test('pages réservées : un compte ordinaire ne reçoit pas le scanner ; l\'administrateur oui', async () => {
    const a = await msg(jar.Autre, { texte: 'scanner les billets PAGE:scanner_billets,faq' });
    assert.deepEqual(a.data.message.destinations.map(d => d.cle), ['faq']);
    assert.ok(!dernierAppel().systeme.includes('- scanner_billets |'));
    const b = await msg(jar.Adm, { texte: 'scanner les billets PAGE:scanner_billets,tableau_de_bord' });
    assert.deepEqual(b.data.message.destinations.map(d => d.cle), ['scanner_billets', 'tableau_de_bord']);
    assert.equal(b.data.message.destinations[1].url, 'dashboard-administrateur.html');
  });

  await t.test('« Que sais-tu faire ? » : réponse fixe sans IA, aucun usage ; message vide ou trop long refusé', async () => {
    const avant = nbIA(), n0 = usages('Autre').length;
    const r = await msg(jar.Autre, { texte: 'Que sais-tu faire ?' });
    assert.equal(r.status, 200); assert.match(r.data.message.contenu, /guide de navigation/); assert.match(r.data.message.contenu, /gratuites/);
    assert.equal(nbIA(), avant); assert.equal(usages('Autre').length, n0);
    assert.equal((await msg(jar.Autre, { texte: '   ' })).status, 400);
    const long = await msg(jar.Autre, { texte: 'x'.repeat(601) });
    assert.equal(long.status, 400); assert.equal(long.data.code, 'trop_long');
  });

  await t.test('panne, refus et réponse illisible : aucun effet sur le crédit', async () => {
    const s0 = await solde('Libre');
    const panne = await msg(jar.Libre, { texte: 'où ? PANNEFAUSSE' });
    assert.equal(panne.status, 503); assert.equal(panne.data.code, 'indisponible');
    const refus = await msg(jar.Libre, { texte: 'où ? REFUSFAUX' });
    assert.equal(refus.status, 200); assert.deepEqual(refus.data.message.destinations.map(d => d.cle), ['faq']);
    const ill = await msg(jar.Libre, { texte: 'où ? JSONFAUX' });
    assert.equal(ill.status, 200); assert.deepEqual(ill.data.message.destinations, []); assert.match(ill.data.message.contenu, /reformuler/);
    assert.equal(await solde('Libre'), s0);
    const cats = usages('Libre').map(u => u.categorie);
    assert.ok(cats.includes('navigation_refus') && cats.includes('navigation_illisible'));
  });

  await t.test('conversations : reprise, privées, supprimables', async () => {
    const e = await etat(jar.Prop);
    assert.ok(e.data.conversation && e.data.conversation.messages.length >= 2);
    const dest = e.data.conversation.messages.filter(m => m.role === 'assistant')[0].destinations;
    assert.deepEqual(dest.map(d => d.cle), ['evenements', 'annuaire']);
    const id = e.data.conversation.id;
    assert.equal((await call(jar.Autre, 'DELETE', `/api/kofi/navigation/conversations/${id}`)).status, 404);
    assert.equal((await msg(jar.Autre, { texte: 'suite', conversation_id: id })).status, 404);
    /* La suite d'une conversation emporte l'historique (messages alternés). */
    const suite = await msg(jar.Prop, { texte: 'et pour mes billets ? PAGE:mes_billets', conversation_id: id });
    assert.equal(suite.status, 200); assert.equal(suite.data.conversation_id, id);
    assert.ok(dernierAppel().messages.length >= 3);
    assert.equal((await call(jar.Prop, 'DELETE', `/api/kofi/navigation/conversations/${id}`)).status, 200);
    assert.equal((await etat(jar.Prop)).data.conversation, null);
    assert.equal(sql('select count(*) as n from kofi_messages where conversation_id=?', id)[0].n, 0);
  });

  await t.test('plafond quotidien : au-delà de 40 questions en 24 h, 429 sans appel IA', async () => {
    for (let i = 0; i < 40; i++) sql("INSERT INTO kofi_usage (user_id, formation_id, categorie, jetons_entree, jetons_sortie, cout_eur, modele) VALUES (?,?,?,?,?,?,?)", uid('Plaf'), null, 'navigation', 100, 50, 0.001, 'test');
    const avant = nbIA();
    const r = await msg(jar.Plaf, { texte: 'où ?' });
    assert.equal(r.status, 429); assert.equal(r.data.code, 'plafond_jour');
    assert.equal(nbIA(), avant);
  });
});

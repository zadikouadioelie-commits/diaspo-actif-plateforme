/* ===========================================================
   tests/fil-accueil.test.js — Fil de l'accueil du profil public (2026-11-02)
   ===========================================================
   Un vrai serveur contre une COPIE isolée de la base. Vérifie :
   • « Tout » : toute la plateforme — officiel d'abord, autres publications (brassées chaque heure), puis celles du compte en dernier ; ni brouillon,
     ni archivée, ni programmée, ni compte de démonstration ; les Reels (vidéo marquée reel) n'y sont pas, une vidéo ordinaire si ;
   • une publication non publique n'est visible que de son auteur ;
   • chaque filtre ne rend que son type : textes, photos, vidéos, articles, événements ;
   • « Mes actualités » : uniquement ce que le compte a publié ou republié (jamais les autres), connexion exigée ;
   • « Abonnements » : seulement les comptes suivis ;
   • pagination par curseur : aucune publication sautée ni répétée.

   Lancer : node --test tests/fil-accueil.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('filaccueil'); });
test.after(() => { if (env) env.stop(); });

const sql = (fn) => { const d = new H.DatabaseSync(env.dbPath); try { return fn(d); } finally { d.close(); } };

test('fil de l\'accueil : filtres, Mes actualités, abonnements, pagination', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarA = H.cookieJar(), jarB = H.cookieJar(), jarD = H.cookieJar();
  const a = await H.creerApprenant(env, jarA, rnd, 'Moi');
  const b = await H.creerApprenant(env, jarB, rnd, 'Autre');
  const dm = await H.creerApprenant(env, jarD, rnd, 'Demo');
  const idDe = (email) => sql(d => d.prepare('SELECT id FROM users WHERE email=?').get(email).id);
  const idA = idDe(a.email), idB = idDe(b.email), idD = idDe(dm.email);
  sql(d => d.prepare('UPDATE users SET is_demo=1 WHERE id=?').run(idD));
  const c = (jar, u) => env.call(jar, 'GET', u);
  const marque = 'T' + rnd;

  const ajouter = (auteur, o) => sql(d => Number(d.prepare(
    `INSERT INTO fil_posts (auteur_id, auteur_nom, type, categorie, contenu, medias, statut, visibilite, pub_type, original_post_id, titre, corps)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    auteur, 'Nom', o.type || 'texte', o.categorie || null, `${marque} ${o.contenu}`, o.medias || null, o.statut || 'publie', o.visibilite || 'public',
    o.pub_type || null, o.original_post_id || null, `${marque} ${o.contenu}`, `${marque} ${o.contenu}`).lastInsertRowid));

  const T1 = ajouter(idB, { contenu: 'texte B' });
  const PH = ajouter(idB, { contenu: 'photo B', type: 'photo', medias: JSON.stringify([{ type: 'image', url: '/uploads/a.jpg' }]) });
  const VI = ajouter(idB, { contenu: 'video B', type: 'video', medias: JSON.stringify([{ type: 'video', url: '/uploads/a.mp4' }]) });
  const AR = ajouter(idB, { contenu: 'article B', type: 'article', pub_type: 'article' });
  const EV = ajouter(idB, { contenu: 'evenement B', categorie: 'Événement' });
  const T2 = ajouter(idA, { contenu: 'texte A' });
  const VA = ajouter(idA, { contenu: 'video A', type: 'video', medias: JSON.stringify([{ type: 'video', url: '/uploads/b.mp4' }]) });
  const RP = ajouter(idA, { contenu: 'repost A', type: 'repost', pub_type: 'repost', original_post_id: PH });
  const REEL = JSON.stringify([{ type: 'video', url: '/uploads/reel.mp4', reel: true, fin_lecture: 33 }]);
  const RA = ajouter(idA, { contenu: 'reel A', type: 'video', medias: REEL });
  const RB = ajouter(idB, { contenu: 'reel B', type: 'video', medias: REEL });
  const BROUILLON = ajouter(idB, { contenu: 'brouillon', statut: 'brouillon' });
  const ARCHIVE = ajouter(idB, { contenu: 'archive', statut: 'archive' });
  const PROG = ajouter(idB, { contenu: 'programme', statut: 'programme' });
  const PRIVE_B = ajouter(idB, { contenu: 'prive B', visibilite: 'prive' });
  const PRIVE_A = ajouter(idA, { contenu: 'prive A', visibilite: 'prive' });
  const DEMO = ajouter(idD, { contenu: 'demo' });
  const mien = (r) => r.data.posts.filter(p => String(p.contenu || '').includes(marque)).map(p => p.id);

  await t.test('Tout : toute la plateforme (les miennes en dernier), sans Reels/brouillon/archive/programmé/démo/privé d\'autrui', async () => {
    const r = await c(jarA, '/api/fil/accueil?filtre=tout&limit=20');
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const ids = mien(r);
    for (const id of [T1, PH, VI, AR, EV, T2, VA, RP, PRIVE_A]) assert.ok(ids.includes(id), `la publication ${id} est dans le fil`);
    for (const id of [RA, RB]) assert.ok(!ids.includes(id), `le Reel ${id} a sa propre bande : il n'est pas dans le fil du bas`);
    for (const id of [BROUILLON, ARCHIVE, PROG, PRIVE_B, DEMO]) assert.ok(!ids.includes(id), `la publication ${id} n'est pas dans le fil`);
    const miennes = [T2, VA, RP, PRIVE_A], autres = [T1, PH, VI, AR, EV];
    assert.ok(Math.max(...autres.map(id => ids.indexOf(id))) < Math.min(...miennes.map(id => ids.indexOf(id))), 'mes publications viennent à la suite de celles de la plateforme');
    assert.deepEqual(miennes.map(id => ids.indexOf(id)).sort((x, y) => x - y).map(i => ids[i]), [PRIVE_A, RP, VA, T2], 'mes publications : de la plus récente à la plus ancienne');
  });

  await t.test('visiteur déconnecté : fil public, sans les publications non publiques', async () => {
    const r = await c(null, '/api/fil/accueil?limit=20');
    assert.equal(r.status, 200);
    assert.ok(!mien(r).includes(PRIVE_A) && !mien(r).includes(PRIVE_B));
    assert.ok(mien(r).includes(T1));
  });

  await t.test('chaque filtre ne rend que son type', async () => {
    const f = async (nom) => { const rr = await c(jarA, `/api/fil/accueil?filtre=${nom}&limit=20`); assert.equal(rr.status, 200, nom + ' : ' + JSON.stringify(rr.data)); return mien(rr); };
    assert.deepEqual((await f('videos')).sort(), [VI, VA].sort(), 'vidéos');
    assert.deepEqual((await f('photos')).sort(), [PH, RP].sort(), 'photos (y compris la photo d\'une republication)');
    assert.deepEqual(await f('articles'), [AR], 'articles');
    assert.deepEqual(await f('evenements'), [EV], 'événements');
    const textes = await f('textes');
    for (const id of [T1, T2, EV, PRIVE_A]) assert.ok(textes.includes(id), `texte ${id}`);
    for (const id of [PH, VI, VA, RP, AR]) assert.ok(!textes.includes(id), `pas un texte : ${id}`);
  });

  await t.test('Mes actualités : seulement ce que j\'ai publié ou republié', async () => {
    const r = await c(jarA, '/api/fil/accueil?filtre=mes&limit=20');
    assert.equal(r.status, 200);
    assert.deepEqual(mien(r).sort(), [T2, VA, RP, PRIVE_A, RA].sort(), 'tout ce que j\'ai publié, Reels compris');
    assert.ok(r.data.posts.every(p => Number(p.auteur_id) === idA), 'aucune publication d\'un autre compte');
    assert.equal((await c(null, '/api/fil/accueil?filtre=mes')).status, 401, 'connexion exigée');
  });

  await t.test('Abonnements : seulement les comptes suivis', async () => {
    sql(d => { d.prepare('DELETE FROM user_follows WHERE follower_id=?').run(idA); d.prepare('DELETE FROM abonnements WHERE user_id=?').run(idA); });
    const vide = await c(jarA, '/api/fil/accueil?filtre=abonnements');
    assert.equal(vide.status, 200);
    assert.deepEqual(vide.data.posts, []);
    assert.ok(vide.data.conseil);
    sql(d => d.prepare('INSERT INTO user_follows (follower_id, followed_id) VALUES (?,?)').run(idA, idB));
    const r = await c(jarA, '/api/fil/accueil?filtre=abonnements&limit=20');
    assert.ok(mien(r).includes(T1));
    assert.ok(r.data.posts.every(p => Number(p.auteur_id) === idB));
    assert.ok(!mien(r).includes(T2));
    assert.equal((await c(null, '/api/fil/accueil?filtre=abonnements')).status, 401);
  });

  await t.test('pagination par curseur : rien de sauté, rien de répété (y compris sous un filtre)', async () => {
    const toutes = [];
    let avant = null;
    for (let i = 0; i < 20; i++) {
      const r = await c(jarA, `/api/fil/accueil?filtre=tout&limit=3${avant ? '&avant=' + avant : ''}`);
      toutes.push(...r.data.posts.map(p => p.id));
      if (!r.data.suivant) break;
      avant = r.data.suivant;
    }
    assert.equal(new Set(toutes).size, toutes.length, 'aucun doublon');
    const complet = (await c(jarA, '/api/fil/accueil?filtre=tout&limit=20')).data.posts.map(p => p.id);
    assert.deepEqual(toutes.slice(0, complet.length), complet, 'la même suite, page par page ou d\'un bloc');
    const attendus = sql(d => d.prepare(
      "SELECT id FROM fil_posts WHERE contenu LIKE ? AND COALESCE(statut,'publie')='publie' AND (COALESCE(visibilite,'public')='public' OR auteur_id=?) AND auteur_id<>? ORDER BY id DESC").all(marque + '%', idA, idD).map(r => r.id));
    assert.deepEqual(toutes.filter(id => attendus.includes(id)).sort((x, y) => x - y), attendus.filter(id => id !== RA && id !== RB).sort((x, y) => x - y), 'toutes les publications attendues, sans doublon, sans Reels');

    const videos = []; avant = null;
    for (let i = 0; i < 20; i++) {
      const r = await c(jarA, `/api/fil/accueil?filtre=videos&limit=1${avant ? '&avant=' + avant : ''}`);
      videos.push(...r.data.posts.map(p => p.id));
      if (!r.data.suivant) break;
      avant = r.data.suivant;
    }
    assert.ok(videos.includes(VI) && videos.includes(VA));
    assert.equal(new Set(videos).size, videos.length);
  });

  await t.test('le compte officiel passe en tête, puis la plateforme, puis mes publications', async () => {
    sql(d => d.prepare('UPDATE users SET is_official=1 WHERE id=?').run(idB));
    try {
      const r = await c(jarA, '/api/fil/accueil?filtre=tout&limit=20');
      const ids = mien(r);
      assert.deepEqual(ids.slice(0, 5), [EV, AR, VI, PH, T1], 'les publications officielles d\'abord, de la plus récente à la plus ancienne');
      assert.ok(ids.indexOf(T2) > ids.indexOf(T1), 'mes publications ensuite');
    } finally { sql(d => d.prepare('UPDATE users SET is_official=0 WHERE id=?').run(idB)); }
  });

  await t.test('brassage horaire : l\'ordre change à chaque heure, reste stable dans l\'heure ; récentes fixes ; miennes en dernier', async () => {
    const { ordonner, rang } = require('../server/fil-accueil');
    const autres = Array.from({ length: 40 }, (_, i) => ({ id: 1000 - i, auteur_id: 7 }));
    const miens = [{ id: 5, auteur_id: 9 }, { id: 3, auteur_id: 9 }];
    const o = (heure) => ordonner({ autres, miens, officiels: new Set(), heure });
    assert.deepEqual(o(100), o(100), 'stable pendant l\'heure');
    assert.notDeepEqual(o(100), o(101), 'un autre ordre à l\'heure suivante');
    assert.deepEqual(o(100).slice(0, 4), [1000, 999, 998, 997], 'les 4 plus récentes restent en tête');
    assert.deepEqual(o(100).slice(-2), [5, 3], 'mes publications à la suite');
    assert.equal(new Set(o(100)).size, 42, 'aucun doublon');
    assert.equal(rang(12, 5), rang(12, 5));
  });

  await t.test('le curseur garde son heure : le défilement ne change pas d\'ordre quand l\'heure tourne', async () => {
    const r = await c(jarA, '/api/fil/accueil?filtre=tout&limit=2&avant=123-0');
    assert.equal(r.status, 200);
    assert.ok(!r.data.suivant || /^123-\d+$/.test(r.data.suivant), 'le curseur renvoyé garde l\'heure du curseur reçu : ' + r.data.suivant);
    assert.ok(r.data.posts.length <= 2);
  });

  await t.test('filtre inconnu : retombe sur « Tout » ; catégorie : filtre exact', async () => {
    const r = await c(jarA, '/api/fil/accueil?filtre=nimportequoi&limit=20');
    assert.equal(r.status, 200); assert.equal(r.data.filtre, 'tout');
    const cat = await c(jarA, '/api/fil/accueil?filtre=tout&categorie=%C3%89v%C3%A9nement&limit=20');
    assert.deepEqual(mien(cat), [EV]);
  });
});

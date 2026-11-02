/* ===========================================================
   tests/comptes-rendus-espace.test.js — espace « Compte-rendu d'événement » (2026-11-02)
   Liste de TOUS les comptes-rendus publiés : pages (?offset=), recherche (?q=), indicateur « suite », événements non publics exclus.
   Lancer : node --test tests/comptes-rendus-espace.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const H = require('./_formation-harness');

const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('API : pages, recherche et événements non publics exclus', async () => {
  const env = await H.demarrer('cr-espace');
  try {
    const db = new DatabaseSync(env.dbPath);
    db.exec('PRAGMA busy_timeout=15000');
    const proprio = db.prepare("SELECT id FROM users ORDER BY id LIMIT 1").get().id;
    const evt = db.prepare("INSERT INTO evenements (titre, date_evt, owner_user_id, visibilite, statut, ville) VALUES (?,?,?,?,?,?)");
    const cr = db.prepare("INSERT INTO evenement_comptes_rendus (evenement_id, auteur_id, titre, resume, statut, published_at) VALUES (?,?,?,?,?,?)");
    const ids = [];
    for (let i = 1; i <= 14; i++) {
      const e = evt.run('Forum test ' + i, '2026-09-' + String(i).padStart(2, '0'), proprio, 'public', 'publie', i % 2 ? 'Abidjan' : 'Lyon');
      const id = Number(e.lastInsertRowid); ids.push(id);
      cr.run(id, proprio, 'Bilan du forum ' + i, 'Résumé numéro ' + i, 'publie', '2026-10-' + String(i).padStart(2, '0') + ' 10:00:00');
    }
    const prive = Number(evt.run('Forum secret', '2026-09-20', proprio, 'prive', 'publie', 'Paris').lastInsertRowid);
    cr.run(prive, proprio, 'Bilan secret', 'confidentiel', 'publie', '2026-10-30 10:00:00');
    const brouillon = Number(evt.run('Forum brouillon', '2026-09-21', proprio, 'public', 'publie', 'Paris').lastInsertRowid);
    cr.run(brouillon, proprio, 'Bilan brouillon', 'pas fini', 'brouillon', null);
    db.close();

    const get = async p => (await env.call(null, 'GET', p)).data;
    /* Page 1 : 5 plus récents, du plus récent au plus ancien, il y en a encore. */
    let r = await get('/api/comptes-rendus/publies?limit=5');
    assert.equal(r.comptes_rendus.length, 5);
    assert.deepEqual(r.comptes_rendus.map(c => c.titre), ['Bilan du forum 14', 'Bilan du forum 13', 'Bilan du forum 12', 'Bilan du forum 11', 'Bilan du forum 10']);
    assert.equal(r.suite, true);
    /* Page 3 : les 4 derniers, plus de suite. */
    r = await get('/api/comptes-rendus/publies?limit=5&offset=10');
    assert.deepEqual(r.comptes_rendus.map(c => c.titre), ['Bilan du forum 4', 'Bilan du forum 3', 'Bilan du forum 2', 'Bilan du forum 1']);
    assert.equal(r.suite, false);
    /* Ni privé ni brouillon, nulle part. */
    r = await get('/api/comptes-rendus/publies?limit=30');
    assert.equal(r.comptes_rendus.length, 14);
    assert.ok(!r.comptes_rendus.some(c => /secret|brouillon/i.test(c.titre)));
    /* Recherche par ville (insensible à la casse) et par titre. */
    r = await get('/api/comptes-rendus/publies?limit=30&q=LYON');
    assert.equal(r.comptes_rendus.length, 7);
    assert.ok(r.comptes_rendus.every(c => c.ville === 'Lyon'));
    r = await get('/api/comptes-rendus/publies?limit=30&q=forum%207');
    assert.deepEqual(r.comptes_rendus.map(c => c.titre), ['Bilan du forum 7']);
    r = await get('/api/comptes-rendus/publies?q=introuvable-xyz');
    assert.deepEqual(r.comptes_rendus, []);
    assert.equal(r.suite, false);
    /* Un % ou un _ saisi ne doit rien casser (recherche littérale, pas d'erreur). */
    r = await get('/api/comptes-rendus/publies?q=' + encodeURIComponent("%'; --"));
    assert.ok(Array.isArray(r.comptes_rendus));
  } finally { await env.stop(); }
});

test('Téléphone : plus d\'épinglage des comptes-rendus en tête des actualités', () => {
  const m = source('assets/m.js');
  assert.ok(!/crs\.slice\(0, 3\)/.test(m), 'les 3 derniers comptes-rendus ne sont plus forcés en tête');
  assert.match(m, /function actusFusion\(posts\)/);
  assert.match(m, /ACTU\.crs\[0\]\.ts > ts/);
});

test('Téléphone : la logique d\'insertion par date place le compte-rendu à sa vraie place (2ᵉ, 3ᵉ…)', () => {
  /* Même algorithme que actusFusion, isolé : posts reçus dans l'ordre, comptes-rendus insérés selon leur date. */
  const fusion = (posts, crs) => {
    const sortie = []; crs = crs.slice().sort((a, b) => b.ts - a.ts);
    posts.forEach(p => { while (crs.length && crs[0].ts > p.ts) sortie.push(crs.shift().n); sortie.push(p.n); });
    while (crs.length) sortie.push(crs.shift().n);
    return sortie;
  };
  const posts = [{ n: 'A', ts: 100 }, { n: 'B', ts: 90 }, { n: 'C', ts: 80 }, { n: 'D', ts: 70 }];
  assert.deepEqual(fusion(posts, [{ n: 'CR', ts: 95 }]), ['A', 'CR', 'B', 'C', 'D'], '2ᵉ place');
  assert.deepEqual(fusion(posts, [{ n: 'CR', ts: 85 }]), ['A', 'B', 'CR', 'C', 'D'], '3ᵉ place');
  assert.deepEqual(fusion(posts, [{ n: 'CR', ts: 150 }]), ['CR', 'A', 'B', 'C', 'D'], 'plus récent que tout : en tête, seulement parce que plus récent');
  assert.deepEqual(fusion(posts, [{ n: 'CR', ts: 10 }]), ['A', 'B', 'C', 'D', 'CR'], 'plus ancien que tout : en dernier');
});

test('Boutons : site (Événements) et redirection téléphone', () => {
  assert.match(source('evenements-app.html'), /id="btn-comptes-rendus" href="comptes-rendus\.html"/);
  assert.match(source('assets/m-redirect.js'), /'comptes-rendus\.html': '#\/comptesrendus'/);
  assert.match(source('assets/m.js'), /href="#\/comptesrendus"/);
  assert.match(source('assets/m.js'), /a === 'comptesrendus'\) paneCRListe\(\)/);
});

test('Le nombre d\'inscrits n\'est plus affiché au public (cartes d\'événements, site et téléphone)', () => {
  const m = source('assets/m.js');
  assert.ok(!/nb_participants \? `<span class="badge">/.test(m), 'téléphone : plus de badge « N inscrits » sur la carte');
  assert.ok(!/r\.nb_participants \?/.test(m), 'téléphone : plus de badge « N inscrits » sur la fiche');
  assert.match(source('evenements-app.html'), /\(evt\.nb_participants && peutGerer\)/, 'site : visible seulement pour l\'organisateur et l\'administrateur');
  assert.ok(!/nb_participants!=null/.test(source('profil-app.html')), 'profil public : plus de compteur d\'inscrits');
});

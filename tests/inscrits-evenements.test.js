/* ===========================================================
   tests/inscrits-evenements.test.js — nombre d'inscrits d'un événement (2026-11-02)
   1. Le compteur additionne TOUTES les voies d'inscription (formulaire simple, inscription rapide, fiche d'inscription) — bug constaté :
      une inscrite à l'événement Diaspo'Actif n'était pas comptée.
   2. L'organisateur peut masquer le nombre au public depuis la cartouche (POST /api/evenements/:id/masquer-inscrits) ; lui et l'administrateur le voient toujours.
   Lancer : node --test tests/inscrits-evenements.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const H = require('./_formation-harness');

const source = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('API : compteur toutes voies + masquage au public, propriétaire et administrateur voient toujours', async () => {
  const env = await H.demarrer('inscrits-evt');
  try {
    const rnd = Date.now().toString(36);
    const jarProprio = H.cookieJar(), jarVisiteur = H.cookieJar(), jarAdmin = H.cookieJar(), anonyme = null;
    const proprio = await H.creerApprenant(env, jarProprio, rnd, 'Proprio');
    const visiteur = await H.creerApprenant(env, jarVisiteur, rnd, 'Visiteur');
    const admin = await H.creerFormateur(env, jarAdmin, rnd, 'Admin');

    const sq = new H.DatabaseSync(env.dbPath);
    sq.exec('PRAGMA busy_timeout=15000');
    const uid = c => sq.prepare('SELECT id FROM users WHERE email=?').get(c.email).id;
    const idProprio = uid(proprio), idVisiteur = uid(visiteur);
    const ev = sq.prepare("INSERT INTO evenements (titre, date_evt, owner_user_id, visibilite, statut, ville, places_max) VALUES (?,?,?,?,?,?,?)");
    const evtId = Number(ev.run('Événement compté', '2027-03-01', idProprio, 'public', 'ouvert', 'Paris', 3).lastInsertRowid);
    sq.close();

    /* La table des inscriptions rapides est créée à la demande par le serveur : un enregistrement de l'événement par son propriétaire la prépare. */
    const maj = await env.call(jarProprio, 'PUT', '/api/evenements/' + evtId, { titre: 'Événement compté', date_evt: '2027-03-01', places_max: 3, visibilite: 'public', statut: 'ouvert', inscription_rapide_active: true });
    assert.equal(maj.status, 200, JSON.stringify(maj.data));

    const s2 = new H.DatabaseSync(env.dbPath);
    s2.exec('PRAGMA busy_timeout=15000');
    /* Voie 1 : formulaire simple. */
    s2.prepare('INSERT INTO evenements_participants (evenement_id, user_id) VALUES (?,?)').run(evtId, idVisiteur);
    /* Voie 2 : inscription rapide. */
    s2.prepare('INSERT INTO evenements_inscriptions_rapides (evenement_id, user_id, nom, prenom, email) VALUES (?,?,?,?,?)').run(evtId, null, 'Kouassi', 'Awa', 'awa@example.com');
    /* Voie 3 : fiche d'inscription liée (2 comptées, 1 annulée et 1 en liste d'attente NON comptées). */
    const fiche = Number(s2.prepare("INSERT INTO insc_fiches (owner_user_id, nom, slug, statut) VALUES (?,?,?,'publiee')").run(idProprio, 'Fiche test', 'fiche-test-' + rnd).lastInsertRowid);
    const type = Number(s2.prepare("INSERT INTO insc_types (fiche_id, cle, label) VALUES (?,?,?)").run(fiche, 'standard', 'Standard').lastInsertRowid);
    s2.prepare('INSERT INTO insc_fiches_evenements (fiche_id, evenement_id) VALUES (?,?)').run(fiche, evtId);
    const insc = s2.prepare("INSERT INTO insc_inscriptions (fiche_id, type_id, evenement_id, reference, nom, prenom, email, statut, statut_paiement, qr_token) VALUES (?,?,?,?,?,?,?,?,'non_concerne',?)");
    [['inscrit', 'a'], ['confirme', 'b'], ['annule', 'c'], ['liste_attente', 'd']].forEach(([st, k]) => insc.run(fiche, type, evtId, 'REF-' + rnd + k, 'Nom' + k, 'Prenom' + k, k + '@example.com', st, 'QR-' + rnd + k));
    s2.close();

    const liste = async jar => ((await env.call(jar, 'GET', '/api/evenements')).data.evenements || []).find(e => e.id === evtId);

    /* 1. Compteur : 1 + 1 + 2 = 4, visible du public. */
    let e = await liste(anonyme);
    assert.equal(e.nb_participants, 4, 'les trois voies d\'inscription sont comptées (annulée et liste d\'attente exclues)');
    assert.equal(e.est_gerant, 0);
    assert.equal(e.complet, 1, '4 inscrits pour 3 places : complet');

    /* 2. Seul le propriétaire (ou l'administrateur) peut masquer. */
    assert.equal((await env.call(anonyme, 'POST', `/api/evenements/${evtId}/masquer-inscrits`, { masquer: true })).status, 401);
    assert.equal((await env.call(jarVisiteur, 'POST', `/api/evenements/${evtId}/masquer-inscrits`, { masquer: true })).status, 403);
    const ok = await env.call(jarProprio, 'POST', `/api/evenements/${evtId}/masquer-inscrits`, { masquer: true });
    assert.equal(ok.status, 200); assert.equal(ok.data.masquer_inscrits, 1);

    /* 3. Masqué : le public ne reçoit PAS le nombre (ni la liste des autres inscrits) ; le propriétaire et l'administrateur le voient toujours. */
    e = await liste(anonyme);
    assert.equal(e.nb_participants, null, 'le public ne reçoit pas le nombre');
    assert.equal(e.inscrits_masques, 1);
    assert.equal(e.complet, 1, 'le public sait toujours que c\'est complet');
    e = await liste(jarVisiteur); assert.equal(e.nb_participants, null);
    e = await liste(jarProprio);
    assert.equal(e.nb_participants, 4, 'le propriétaire voit toujours le nombre'); assert.equal(e.est_gerant, 1); assert.equal(e.inscrits_masques, 1);
    e = await liste(jarAdmin); assert.equal(e.nb_participants, 4, 'l\'administrateur aussi'); assert.equal(e.est_gerant, 1);

    const detailPublic = (await env.call(anonyme, 'GET', '/api/evenements/' + evtId)).data;
    assert.equal(detailPublic.nb_participants, null); assert.equal(detailPublic.participants.length, 0, 'aucun inscrit nominatif pour le public');
    const detailVisiteur = (await env.call(jarVisiteur, 'GET', '/api/evenements/' + evtId)).data;
    assert.equal(detailVisiteur.participants.length, 1, 'un inscrit se voit lui-même'); assert.equal(detailVisiteur.nb_participants, null);
    const detailProprio = (await env.call(jarProprio, 'GET', '/api/evenements/' + evtId)).data;
    assert.equal(detailProprio.nb_participants, 4);

    const reco = ((await env.call(anonyme, 'GET', '/api/evenements/recommandes')).data.evenements || []).find(x => x.id === evtId);
    assert.equal(reco.nb_participants, null, 'même règle sur la liste recommandée');

    /* 4. Réafficher. */
    assert.equal((await env.call(jarProprio, 'POST', `/api/evenements/${evtId}/masquer-inscrits`, { masquer: false })).data.masquer_inscrits, 0);
    e = await liste(anonyme); assert.equal(e.nb_participants, 4); assert.equal(e.inscrits_masques, 0);
  } finally { env.stop(); }
});

test('Interfaces : interrupteur sur la cartouche (téléphone + site), compteur lu depuis le serveur', () => {
  const m = source('assets/m.js');
  assert.match(m, /data-mask-ev=/, 'téléphone : interrupteur sur la cartouche');
  assert.match(m, /\/masquer-inscrits/, 'téléphone : appelle la route de bascule');
  assert.match(m, /function evtInscritsBadge/, 'téléphone : le nombre est de nouveau affiché quand le serveur l\'envoie');
  assert.match(m, /if \(!Number\(e\.est_gerant\)\) return ''/, 'téléphone : interrupteur réservé à l\'organisateur');
  const s = source('evenements-app.html');
  assert.match(s, /\$\{peutGerer \? masqueInscritsBouton\(evt\) : ''\}/, 'site : interrupteur réservé à l\'organisateur');
  assert.match(s, /\/masquer-inscrits/, 'site : appelle la route de bascule');
  assert.match(s, /\$\{evt\.nb_participants \? '<span>👥/, 'site : le nombre s\'affiche quand le serveur l\'envoie');
  assert.ok(/e\.nb_participants!=null/.test(source('profil-app.html')), 'profil public : compteur lu depuis le serveur');
});

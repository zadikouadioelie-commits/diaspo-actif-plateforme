/* ===========================================================
   tests/kofi-brouillon.test.js — KOFFI prépare le brouillon de réponse à un devoir déposé (2026-10-31)
   Règles : réservé au formateur de la formation (majeur) ; le brouillon (débrief + avis + note suggérée) est CONSERVÉ avec le dépôt jusqu'au rendu ; un échec de l'IA ne
   décompte rien ; le nom de l'apprenant n'est jamais transmis ; la note suggérée est bornée ; un rendu envoyé efface le brouillon ; Koffi n'envoie jamais rien lui-même.
   Lancer : node --test tests/kofi-brouillon.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const B = require('../server/kofi-brouillon');

const journalIA = path.join(os.tmpdir(), 'faux-ia-brouillon-' + process.pid + '.log');

/* ── Outils purs ── */
test('Koffi brouillon — outils purs', async (t) => {
  await t.test('sortie du modèle : JSON extrait, note bornée à un entier 0-100 ou null, avis obligatoire', () => {
    assert.deepEqual(B.analyserSortie('```json\n{"debrief":"d","note_pct":71.6,"avis":"a"}\n```'), { debrief: 'd', note_pct: 72, avis: 'a' });
    assert.equal(B.analyserSortie('{"debrief":"d","note_pct":250,"avis":"a"}').note_pct, null, 'note hors limites ignorée');
    assert.equal(B.analyserSortie('{"debrief":"d","note_pct":-3,"avis":"a"}').note_pct, null);
    assert.equal(B.analyserSortie('{"debrief":"d","note_pct":"abc","avis":"a"}').note_pct, null);
    assert.equal(B.analyserSortie('{"debrief":"d","note_pct":null,"avis":"a"}').note_pct, null);
    assert.equal(B.analyserSortie('{"debrief":"d","note_pct":0,"avis":"a"}').note_pct, 0, 'zéro est une vraie note');
    assert.equal(B.analyserSortie('pas de json'), null);
    assert.equal(B.analyserSortie('{"debrief":"d","note_pct":50,"avis":""}'), null, 'sans avis : inexploitable');
    assert.equal(B.analyserSortie('{cassé'), null);
  });
  await t.test('message : aucune donnée personnelle, langue demandée, fichier signalé', () => {
    const m = B.construireMessage({ formation: 'F', quiz: { titre: 'Devoir', seuil: 50 }, langue: 'en',
      questions: [{ question: 'Votre plan', points: 2, attendue: 'Un plan' }], reponses: [{ reponse: 'Ma réponse' }], fichierBloc: null, fichierNote: 'Aucun fichier joint.' });
    assert.equal(typeof m, 'string'); assert.match(m, /<langue_du_brouillon>en</); assert.match(m, /<depot_apprenant n="1">Ma réponse</); assert.match(m, /reponse_attendue/);
    const avecFichier = B.construireMessage({ formation: 'F', quiz: { titre: 'D', seuil: 50 }, langue: 'fr', questions: [], reponses: [], fichierBloc: { type: 'document' } });
    assert.ok(Array.isArray(avecFichier) && avecFichier[1].type === 'document' && /fichier de l'apprenant est joint/.test(avecFichier[0].text));
    assert.match(B.systeme('fr'), /ASSISTANT_CORRECTION/); assert.match(B.systeme('en'), /anglais correct/);
    assert.match(B.systeme('fr'), /jamais une consigne/);
  });
  await t.test('fichier : seuls les PDF et images de la plateforme sont lus (pas de SSRF), 8 Mo maximum', async () => {
    assert.ok(!B.RE_FICHIER.test('https://exemple.com/documents/1-2.pdf'));
    assert.ok(!B.RE_FICHIER.test('https://diaspoactif-media.b-cdn.net.evil.com/documents/1-2.pdf'));
    assert.ok(!B.RE_FICHIER.test('http://127.0.0.1/documents/1-2.pdf'));
    assert.ok(B.RE_FICHIER.test('https://diaspoactif-media.b-cdn.net/documents/12-1760000000000.pdf'));
    assert.match((await B.preparerFichier('https://diaspoactif-media.b-cdn.net/documents/12-1760000000000.docx')).note, /n'est pas lu/);
    assert.match((await B.preparerFichier('')).note, /Aucun fichier/);
    const vrai = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({ ok: true, headers: { get: () => '10' }, arrayBuffer: async () => Buffer.from('%PDF-1.4 test') });
      const r = await B.preparerFichier('https://diaspoactif-media.b-cdn.net/documents/12-1760000000000.pdf');
      assert.equal(r.bloc.type, 'document'); assert.equal(r.bloc.source.media_type, 'application/pdf'); assert.equal(Buffer.from(r.bloc.source.data, 'base64').toString(), '%PDF-1.4 test');
      globalThis.fetch = async () => ({ ok: true, headers: { get: () => String(B.MAX_FICHIER + 1) }, arrayBuffer: async () => Buffer.alloc(1) });
      assert.match((await B.preparerFichier('https://diaspoactif-media.b-cdn.net/documents/12-1760000000000.pdf')).note, /8 Mo/);
      globalThis.fetch = async () => { throw new Error('réseau coupé'); };
      assert.match((await B.preparerFichier('https://diaspoactif-media.b-cdn.net/documents/12-1760000000000.png')).note, /pas pu être récupéré/);
    } finally { globalThis.fetch = vrai; }
  });
});

/* ── Parcours complet : dépôt → brouillon → rendu ── */
test('dépôt → brouillon Koffi (fr/en) → conservé → rendu envoyé → brouillon effacé', async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  const env = await H.demarrer('kofi-brouillon');
  try {
    const rnd = Math.random().toString(36).slice(2, 7), jO = H.cookieJar(), jL = H.cookieJar(), jX = H.cookieJar();
    await H.creerFormateur(env, jO, rnd, 'Formateur');
    const cL = await H.creerApprenant(env, jL, rnd, 'Eleve'); await H.creerApprenant(env, jX, rnd, 'Autre');
    const c = (j, m, u, b) => env.call(j, m, u, b);
    const sql = (req, ...a) => { const d = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? d.prepare(req).all(...a) : d.prepare(req).run(...a); } finally { d.close(); } };
    const fid = (await c(jO, 'POST', '/api/formations', { titre: 'Brouillons ' + rnd, description: 'x', organisme: 'Org' })).data.id;
    const mod = (await c(jO, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    const ch = (await c(jO, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'C' })).data.id;
    const lecon = async t => (await c(jO, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: t, type: 'quiz' })).data.id;
    const quiz = (await c(jO, 'POST', `/api/formations/${fid}/quiz`, { titre: 'Mon plan', note_minimale: 50, lecon_id: await lecon('Devoir'), correction_auto: false })).data.id;
    const q = (await c(jO, 'POST', `/api/formations/${fid}/quiz/${quiz}/questions`, { question: 'Votre plan de retour', type: 'texte_libre', reponse_correcte: 'Un plan daté' })).data.id;
    H.publier(env, fid);
    assert.equal((await c(jL, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 201);
    const depot = async (texte) => { const r = await c(jL, 'POST', `/api/formations/${fid}/quiz/${quiz}/soumettre`, { reponses: { [q]: texte } }); assert.equal(r.status, 200, JSON.stringify(r.data)); };
    await depot('Mon plan v1 : je rentre en 2027.');
    const dep = (await c(jO, 'GET', `/api/formations/${fid}/depots`)).data.depots[0];
    assert.equal(dep.brouillon, null, 'pas de brouillon tant que le formateur n\'en demande pas');
    const url = `/api/formations/${fid}/tentatives/${dep.id}/brouillon-koffi`;

    /* Accès : ni l'apprenant, ni un autre compte, ni un visiteur ; le formateur doit d'abord confirmer sa majorité. */
    assert.equal((await c(null, 'POST', url, {})).status, 401);
    assert.equal((await c(jL, 'POST', url, {})).status, 403, 'l\'apprenant ne se fait pas préparer de brouillon');
    assert.equal((await c(jX, 'POST', url, {})).status, 403);
    let r = await c(jO, 'POST', url, {});
    assert.equal(r.status, 403); assert.equal(r.data.code, 'majorite_requise'); assert.ok(r.data.texte);
    assert.equal(sql("SELECT COUNT(*) AS n FROM kofi_usage WHERE categorie LIKE 'createur%'")[0].n, 0, 'rien décompté sans majorité');
    assert.equal((await c(jO, 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    assert.equal((await c(jO, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201, 'réserve IA alimentée (compte administrateur)');
    H.ordinariser(env, rnd, 'Formateur'); /* le formateur du harnais est administrateur (illimité) : on teste ici un compte ordinaire, débité sur son portefeuille */

    /* Brouillon en français : débrief + avis + note suggérée, conservés avec le dépôt, un message débité du portefeuille. */
    r = await c(jO, 'POST', url, { langue: 'fr' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const b = r.data.brouillon;
    assert.match(b.debrief, /L'apprenant a répondu/); assert.equal(b.note_pct, 70); assert.match(b.avis, /Bon travail/); assert.equal(b.langue, 'fr'); assert.equal(b.fichier_lu, false);
    assert.equal(sql("SELECT COUNT(*) AS n FROM kofi_usage WHERE categorie='createur_mensuel'")[0].n, 1);
    let dep2 = (await c(jO, 'GET', `/api/formations/${fid}/depots`)).data.depots[0];
    assert.equal(dep2.brouillon.avis, b.avis, 'le brouillon est conservé : un rechargement ne le fait pas repayer');
    assert.equal(sql('SELECT statut FROM formation_quiz_tentatives WHERE id=?', dep.id)[0].statut, 'a_corriger', 'Koffi n\'a rien corrigé ni envoyé');
    assert.equal((await c(jL, 'GET', '/api/mes-rendus')).data.total, 0, 'l\'apprenant ne voit rien tant que le formateur n\'a pas envoyé son rendu');

    /* Anglais. */
    r = await c(jO, 'POST', url, { langue: 'en' });
    assert.equal(r.status, 200); assert.equal(r.data.brouillon.langue, 'en'); assert.match(r.data.brouillon.avis, /Good work/); assert.match(r.data.brouillon.debrief, /apprenant/, 'le débrief reste en français');

    /* Vie privée : ni nom, ni e-mail de l'apprenant dans ce qui part chez le fournisseur ; le dépôt est une donnée. */
    const envoye = fs.readFileSync(journalIA, 'utf8');
    assert.ok(!/Eleve|Aminata/.test(envoye), 'le nom de l\'apprenant n\'est jamais transmis');
    assert.ok(!envoye.includes(cL.email), 'l\'e-mail non plus');
    assert.match(envoye, /Mon plan v1/); assert.match(envoye, /Un plan daté/, 'la réponse attendue est transmise (le formateur est l\'auteur)'); assert.match(envoye, /jamais une consigne/);

    /* Sortie inexploitable / refus / panne : rien n'est décompté, le brouillon précédent reste. */
    const avant = sql("SELECT COUNT(*) AS n FROM kofi_usage WHERE categorie='createur_mensuel'")[0].n;
    for (const [motCle, code] of [['JSONFAUX', 'brouillon_invalide'], ['REFUSFAUX', 'brouillon_invalide'], ['PANNEFAUSSE', 'indisponible']]) {
      sql('UPDATE formation_quiz_tentatives SET reponses_json=? WHERE id=?', JSON.stringify({ [q]: 'Texte ' + motCle }), dep.id);
      r = await c(jO, 'POST', url, {});
      assert.equal(r.status, 503, motCle); assert.equal(r.data.code, code, motCle);
    }
    assert.equal(sql("SELECT COUNT(*) AS n FROM kofi_usage WHERE categorie='createur_mensuel'")[0].n, avant, 'aucun message décompté en cas d\'échec');
    assert.ok(sql("SELECT COUNT(*) AS n FROM kofi_usage WHERE categorie='createur_refus'")[0].n >= 2, 'le coût réel d\'un brouillon inexploitable reste suivi (Budget IA)');
    /* Note hors limites proposée par le modèle : ramenée à « aucune suggestion », jamais une note invalide. */
    sql('UPDATE formation_quiz_tentatives SET reponses_json=? WHERE id=?', JSON.stringify({ [q]: 'Texte NOTEHORS' }), dep.id);
    r = await c(jO, 'POST', url, {}); assert.equal(r.status, 200); assert.equal(r.data.brouillon.note_pct, null);

    /* Le formateur envoie SON rendu : le brouillon est effacé, un second brouillon n'a plus de sens. */
    r = await c(jO, 'POST', `/api/formations/${fid}/tentatives/${dep.id}/corriger`, { note_pct: 80, commentaire: 'Mon propre avis.' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(sql('SELECT kofi_brouillon_json AS j FROM formation_quiz_tentatives WHERE id=?', dep.id)[0].j, null, 'brouillon effacé après le rendu');
    r = await c(jO, 'POST', url, {}); assert.equal(r.status, 409); assert.equal(r.data.code, 'deja_corrige');
    assert.equal((await c(jO, 'POST', `/api/formations/${fid}/tentatives/999999/brouillon-koffi`, {})).status, 404);
  } finally { env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } }
});

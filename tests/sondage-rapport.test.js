/* ===========================================================
   tests/sondage-rapport.test.js — RAPPORT DE RÉSULTATS D'UN SONDAGE (2026-11-10)
   ===========================================================
   Règles vérifiées : réservé au créateur (et à l'administrateur) ; effectifs et pourcentages exacts par type de question (choix unique, oui/non, choix multiples,
   échelle, nombre, date, texte) ; une personne = un envoi ; ANONYMAT : aucun nom, e-mail, téléphone ni identifiant de compte dans la réponse, réponses libres masquées
   (e-mail, lien, numéro) et non reproduites sous 5 réponses ; effectif faible signalé ; sondage sans réponse.
   Lancer : node --test tests/sondage-rapport.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const R = require('../server/sondage-rapport');

let env;
test.before(async () => { env = await H.demarrer('sondage-rapport'); });
test.after(() => { if (env) env.stop(); });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('masquer — retire e-mails, liens et numéros', () => {
  assert.equal(R.masquer('Écrivez à jean.dupont@mail.fr ou appelez le +33 6 12 34 56 78, voir https://exemple.org/x et www.site.com'), 'Écrivez à [e-mail] ou appelez le [numéro], voir [lien] et [lien]');
  assert.equal(R.masquer(null), ''); assert.equal(R.masquer('a'.repeat(900)).length, 400);
});

test('rapport de sondage — agrégats, anonymat, accès', async () => {
  const rnd = Math.random().toString(36).slice(2, 7), jar = { Adm: H.cookieJar(), Libre: H.cookieJar(), Anon: H.cookieJar() };
  await H.creerFormateur(env, jar.Adm, rnd, 'Adm'); await H.creerApprenant(env, jar.Libre, rnd, 'Libre');
  const call = env.call;

  const cree = await call(jar.Adm, 'POST', '/api/sondages', { titre: 'Santé et diaspora', description: 'Enquête de test', statut: 'brouillon', diffusion: {}, questions: [
    { texte: 'Êtes-vous membre ?', type: 'oui_non' },
    { texte: 'Quels services ?', type: 'choix_multiple', options: ['Santé', 'Éducation', 'Emploi'] },
    { texte: 'Pays de résidence', type: 'choix_unique', options: ['France', 'Belgique', 'Canada'] },
    { texte: 'Accueil', type: 'echelle_5', min_label: 'mauvais', max_label: 'excellent' },
    { texte: 'Âge', type: 'nombre', obligatoire: false },
    { texte: 'Commentaire', type: 'texte_long', obligatoire: false },
    { texte: 'Sans réponse', type: 'texte_libre', obligatoire: false },
  ] });
  assert.equal(cree.status, 201, JSON.stringify(cree.data)); const sid = cree.data.id;
  const Q = sql('select id, texte from sondage_questions where sondage_id=? order by ordre', sid);
  assert.equal(Q.length, 7);

  /* 6 personnes : comptes nommés avec e-mail et téléphone (jamais censés sortir). */
  const ident = [['Kouassi', 'Awa'], ['Traoré', 'Moussa'], ['Diallo', 'Fanta'], ['Koné', 'Yao'], ['Bamba', 'Sali'], ['Touré', 'Ibrahim']];
  const jours = ['2026-11-01', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-03', '2026-11-03'];
  const oui = ['Oui', 'oui', 'Non', 'Oui', 'Non', 'Oui'];
  const multi = [['Santé'], ['Santé', 'Emploi'], ['Emploi'], ['Santé', 'Éducation', 'Emploi'], ['Éducation'], ['Santé']];
  const pays = ['France', 'France', 'Belgique', 'France', 'Canada', 'Belgique'];
  const note = [5, 4, 4, 3, 5, 1];
  const age = [30, 40, 50, 'abc', 20, 60];
  const texte = ['Très bien, contactez-moi : awa.kouassi@mail.fr', 'Appelez le 06 12 34 56 78', 'Voir https://perso.example.org/moi', 'Merci pour cette initiative', 'Bravo', null];
  ident.forEach(([nom, prenom], i) => {
    const rid = Number(sql("insert into sondage_repondants (sondage_id, nom, prenom, email, telephone, created_at) values (?,?,?,?,?,?)", sid, nom, prenom, `${prenom.toLowerCase()}.${nom.toLowerCase()}@secret.test`, `+3360000000${i}`, jours[i] + ' 10:00:00').lastInsertRowid);
    const val = [oui[i], multi[i], pays[i], note[i], age[i], texte[i]];
    val.forEach((v, k) => { if (v === null) return; sql("insert into sondage_reponses (sondage_id, question_id, user_id, reponse, repondant_id, created_at) values (?,?,?,?,?,?)", sid, Q[k].id, 15, JSON.stringify(v), rid, jours[i] + ' 10:00:00'); });
  });

  /* ── Accès : créateur oui, autre compte non, anonyme non. ── */
  assert.equal((await call(jar.Anon, 'GET', `/api/sondages/${sid}/rapport`)).status, 401);
  assert.equal((await call(jar.Libre, 'GET', `/api/sondages/${sid}/rapport`)).status, 403, 'un autre compte ne voit pas le rapport');
  const r = await call(jar.Adm, 'GET', `/api/sondages/${sid}/rapport`); assert.equal(r.status, 200, JSON.stringify(r.data));
  const d = r.data;
  assert.equal(d.repondants, 6); assert.equal(d.nb_questions, 7);
  assert.deepEqual(d.evolution, [{ jour: '2026-11-01', n: 2 }, { jour: '2026-11-02', n: 1 }, { jour: '2026-11-03', n: 3 }]);
  assert.equal(d.premiere_reponse, '2026-11-01'); assert.equal(d.derniere_reponse, '2026-11-03');
  const q = i => d.questions[i];

  /* ── Oui / Non : la casse est unifiée. ── */
  assert.deepEqual(q(0).modalites, [{ libelle: 'Oui', n: 4, pct: 66.7 }, { libelle: 'Non', n: 2, pct: 33.3 }]);
  assert.equal(q(0).famille, 'choix'); assert.equal(q(0).n, 6); assert.equal(q(0).taux_reponse, 100);
  /* ── Choix multiples : pourcentage = part des PERSONNES (le total dépasse 100 %). ── */
  assert.equal(q(1).famille, 'multiple');
  assert.deepEqual(q(1).modalites.map(m => [m.libelle, m.n, m.pct]), [['Santé', 4, 66.7], ['Éducation', 2, 33.3], ['Emploi', 3, 50]]);
  /* ── Choix unique : l'ordre du questionnaire est conservé, une modalité à zéro reste visible. ── */
  assert.deepEqual(q(2).modalites.map(m => [m.libelle, m.n]), [['France', 3], ['Belgique', 2], ['Canada', 1]]);
  /* ── Échelle : 5 colonnes, moyenne et médiane. ── */
  assert.equal(q(3).famille, 'echelle'); assert.equal(q(3).max, 5); assert.equal(q(3).max_label, 'excellent');
  assert.deepEqual(q(3).modalites.map(m => m.n), [1, 0, 1, 2, 2]);
  assert.equal(q(3).stats.moyenne, 3.67); assert.equal(q(3).stats.mediane, 4);
  /* ── Nombre : la valeur illisible est ignorée. ── */
  assert.deepEqual(q(4).stats, { moyenne: 40, mediane: 40, min: 20, max: 60 });
  /* ── Texte : 5 réponses ⇒ reproduites, mais masquées. ── */
  assert.equal(q(5).n, 5); assert.equal(q(5).verbatims_masques, false);
  assert.ok(q(5).verbatims.includes('Très bien, contactez-moi : [e-mail]'));
  assert.ok(q(5).verbatims.includes('Appelez le [numéro]'));
  assert.ok(q(5).verbatims.includes('Voir [lien]'));
  assert.equal(q(5).effectif_faible, false);
  /* ── Question sans réponse. ── */
  assert.equal(q(6).n, 0); assert.equal(q(6).taux_reponse, 0); assert.equal(q(6).verbatims_masques, false);

  /* ── ANONYMAT : rien d'identifiant dans toute la réponse. ── */
  const brut = JSON.stringify(d);
  for (const interdit of ['Kouassi', 'Awa', 'Traoré', 'Moussa', 'secret.test', 'awa.kouassi', '+336000', '0612345678', 'perso.example.org', 'user_id', 'repondant_id', 'email', 'telephone']) assert.ok(!brut.includes(interdit), 'ne doit pas contenir « ' + interdit + ' »');

  /* ── Sous 5 réponses libres : aucune citation reproduite (une citation pourrait désigner quelqu'un). ── */
  sql('delete from sondage_reponses where question_id=? and repondant_id=(select id from sondage_repondants where sondage_id=? order by id limit 1)', Q[5].id, sid);
  const d2 = (await call(jar.Adm, 'GET', `/api/sondages/${sid}/rapport`)).data;
  assert.equal(d2.questions[5].n, 4); assert.deepEqual(d2.questions[5].verbatims, []); assert.equal(d2.questions[5].verbatims_masques, true);
  assert.equal(d2.questions[5].effectif_faible, true, 'sous 5 réponses : effectif faible signalé');

  /* ── Sondage vide : rapport valide, zéro partout. ── */
  const vide = await call(jar.Adm, 'POST', '/api/sondages', { titre: 'Vide', statut: 'brouillon', diffusion: {}, questions: [{ texte: 'Q', type: 'oui_non' }, { texte: 'R', type: 'echelle_10' }] });
  const dv = (await call(jar.Adm, 'GET', `/api/sondages/${vide.data.id}/rapport`)).data;
  assert.equal(dv.repondants, 0); assert.equal(dv.taux_reponse_moyen, 0); assert.deepEqual(dv.evolution, []);
  assert.deepEqual(dv.questions.map(x => x.n), [0, 0]); assert.equal(dv.questions[1].modalites.length, 10);

  /* ── Sondage inexistant : refusé. ── */
  assert.equal((await call(jar.Adm, 'GET', '/api/sondages/99999999/rapport')).status, 403);
});

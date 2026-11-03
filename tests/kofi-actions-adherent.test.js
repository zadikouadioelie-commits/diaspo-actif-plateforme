/* ===========================================================
   tests/kofi-actions-adherent.test.js — KOFFI AJOUTE UN ADHÉRENT À LA PLACE DE LA PERSONNE (2026-11-03)
   ===========================================================
   Règles vérifiées : Koffi ne se dit capable QUE si le compte l'est réellement (compte Initiative, une seule initiative, formule active) ; le modèle ne reçoit ni les formules
   ni aucune donnée d'adhérent hors de ce que la personne écrit ; le brouillon du modèle est revalidé par le serveur (e-mail, dates, formule) ; le RÉSUMÉ est écrit par le serveur
   et RIEN n'est ajouté avant le « oui » (bouton ou réponse tapée) ; « oui mais… » n'est pas un oui ; l'ajout passe par la route habituelle (mêmes droits) ; une action n'a lieu qu'une fois ;
   elle est tracée (kofi_actions + journal d'audit de l'association) ; la proposition expire dès qu'une autre réponse arrive ; personne d'autre ne peut la confirmer.
   Lancer : node --test tests/kofi-actions-adherent.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const H = require('./_formation-harness');
const A = require('../server/kofi-actions');
const N = require('../server/kofi-navigation');

test('Koffi — ajouter un adhérent : fonctions pures', () => {
  const MAINT = Date.parse('2026-11-03T10:00:00Z');
  /* Brouillon revalidé : longueurs, e-mail, dates, durée, unités. */
  const v = A.validerAdherent({ nom: '  Dupont ', prenom: 'Jean', email: 'JEAN@Exemple.com', telephone: 'tel +33 6 12 34 56 78 <b>', date_adhesion: '2026-11-01', duree_valeur: 12, duree_unite: 'mois', formule: 'annuelle' }, MAINT);
  assert.deepEqual(v.problemes, []);
  assert.equal(v.champs.nom, 'Dupont'); assert.equal(v.champs.email, 'jean@exemple.com'); assert.equal(v.champs.telephone, '+33 6 12 34 56 78');
  assert.equal(v.champs.duree_valeur, 12); assert.equal(v.champs.duree_unite, 'mois');
  assert.deepEqual(A.validerAdherent({ nom: 'X', email: 'pas-un-mail' }, MAINT).problemes, ['email_invalide']);
  assert.deepEqual(A.validerAdherent({ nom: 'X', date_adhesion: '2026-02-30' }, MAINT).problemes, ['date_adhesion_invalide']);
  assert.deepEqual(A.validerAdherent({ nom: 'X', date_adhesion: '2031-01-01' }, MAINT).problemes, ['date_adhesion_invalide']);
  assert.deepEqual(A.validerAdherent({ nom: 'X', date_adhesion: '2026-11-10', date_fin: '2026-11-01' }, MAINT).problemes, ['fin_avant_debut']);
  assert.equal(A.validerAdherent({ nom: 'X', duree_valeur: 500 }, MAINT).champs.duree_valeur, 0);
  assert.equal(A.validerAdherent({ nom: 'X', duree_valeur: 3, duree_unite: 'siecles' }, MAINT).champs.duree_unite, 'mois');
  /* La date de fin prime sur la durée. */
  const f = A.validerAdherent({ nom: 'X', date_adhesion: '2026-11-01', date_fin: '2027-03-31', duree_valeur: 6 }, MAINT).champs;
  assert.equal(f.date_fin, '2027-03-31'); assert.equal(f.duree_valeur, 0);
  /* Un secret écrit dans un champ libre est masqué. */
  assert.ok(!A.validerAdherent({ nom: 'X', observations: 'mot de passe : Azerty123' }, MAINT).champs.observations.includes('Azerty123'));
  /* Formule : une seule → elle ; sinon rapprochement par le nom, sans accent ni casse ; ambiguë/inconnue → on demande. */
  const un = [{ id: 1, nom: 'Cotisation annuelle' }], deux = [{ id: 1, nom: 'Cotisation annuelle' }, { id: 2, nom: 'Membre bienfaiteur' }, { id: 3, nom: 'Cotisation étudiante' }];
  assert.equal(A.choisirFormule('', un).formule.id, 1);
  assert.equal(A.choisirFormule('', deux).statut, 'manquante');
  assert.equal(A.choisirFormule('BIENFAITEUR', deux).formule.id, 2);
  assert.equal(A.choisirFormule('cotisation etudiante', deux).formule.id, 3);
  assert.equal(A.choisirFormule('cotisation', deux).statut, 'ambigue');
  assert.equal(A.choisirFormule('gold', deux).statut, 'inconnue');
  assert.deepEqual(A.choisirFormule('gold', deux).choix, ['Cotisation annuelle', 'Membre bienfaiteur', 'Cotisation étudiante']);
  /* Ce qui manque. */
  assert.deepEqual(A.manquants({ nom: '', duree_valeur: 0, date_fin: '', date_adhesion: '' }, { statut: 'manquante' }).map(x => x.cle), ['nom', 'formule']);
  assert.deepEqual(A.manquants({ nom: 'X', duree_valeur: 6, date_fin: '', date_adhesion: '' }, { statut: 'ok' }).map(x => x.cle), ['date_adhesion']);
  assert.deepEqual(A.manquants({ nom: 'X', duree_valeur: 0, date_fin: '', date_adhesion: '' }, { statut: 'ok' }), []);
  /* Corps de la route habituelle. */
  assert.deepEqual(A.corps({ nom: 'Dupont', prenom: 'Jean', email: '', telephone: '', adresse: '', ville: 'Lyon', pays: '', observations: '', date_adhesion: '2026-11-01', date_fin: '', duree_valeur: 12, duree_unite: 'mois' }, 5),
    { formule_id: 5, nom: 'Dupont', prenom: 'Jean', email: null, telephone: null, adresse: null, pays: null, ville: 'Lyon', observations: null, date_adhesion: '2026-11-01', mode_validite: 'individuel', duree_valeur: 12, duree_unite: 'mois' });
  const col = A.corps({ nom: 'D', date_adhesion: '2026-11-01', date_fin: '2027-03-31', duree_valeur: 0, duree_unite: 'mois' }, 5);
  assert.equal(col.mode_validite, 'collectif'); assert.equal(col.periode_collective_fin, '2027-03-31');
  assert.equal(A.corps({ nom: 'D', date_adhesion: '', date_fin: '', duree_valeur: 0, duree_unite: 'mois' }, 5).date_adhesion, undefined);
  /* Résumé écrit par le serveur. */
  const r = A.resume(f.nom ? { ...f, nom: 'Dupont', prenom: 'Jean' } : f, { nom: 'Cotisation annuelle' }, [{ nom: 'Dupont', prenom: 'Jean' }]);
  assert.match(r, /Nom : Jean Dupont/); assert.match(r, /du 1 novembre 2026 au 31 mars 2027/); assert.match(r, /⚠️ Une fiche existe déjà/); assert.match(r, /Aucun paiement n'est enregistré/); assert.match(r, /Oui, ajouter/);
  /* « oui » ne vaut que s'il est SEUL ; une correction n'est pas un accord. */
  for (const t of ['oui', 'Oui !', 'OK', "d'accord", 'Oui, vas-y', 'oui merci', 'je confirme', 'C’est bon']) assert.equal(A.ouiNon(t), 'oui', t);
  for (const t of ['non', 'Annule', 'laisse tomber', 'non merci']) assert.equal(A.ouiNon(t), 'non', t);
  for (const t of ['oui mais son e-mail est faux', 'non, il s’appelle Martin', 'peut-être', 'ajoute aussi Marie', '']) assert.equal(A.ouiNon(t), null, t);
  /* Le modèle ne peut demander que l'action prévue. */
  const ok = ['faq'];
  assert.equal(N.lireSortie('{"message":"ok","destinations":[],"action":{"type":"supprimer_tout","adherent":{"nom":"X"}}}', ok).action, null);
  assert.equal(N.lireSortie('{"message":"ok","destinations":[],"action":{"type":"ajouter_adherent"}}', ok).action, null);
  assert.deepEqual(N.lireSortie('{"message":"ok","destinations":[],"action":{"type":"ajouter_adherent","adherent":{"nom":"X"}}}', ok).action, { type: 'ajouter_adherent', adherent: { nom: 'X' } });
  /* Le prompt : « capable » seulement si le compte l'est. */
  assert.match(N.systemePour([], null, { ajouter_adherent: true }, '2026-11-03'), /AJOUTER UN ADHÉRENT/);
  assert.match(N.systemePour([], null, { ajouter_adherent: true }, '2026-11-03'), /<date_du_jour>2026-11-03<\/date_du_jour>/);
  assert.match(N.systemePour([], null, { ajouter_adherent: false, raison: 'pas Initiative' }), /Tu n'es PAS capable d'ajouter/);
  assert.ok(!/AJOUTER UN ADHÉRENT/.test(N.systemePour([], null, { ajouter_adherent: false })));
  assert.ok(!/"action"/.test(N.systemePour([], null, { ajouter_adherent: false })));
});

let env;
const journalIA = path.join(os.tmpdir(), 'faux-ia-actions-' + process.pid + '.log');
test.before(async () => {
  process.env.KOFI_IA_FAUSSE = '1';
  process.env.KOFI_FAUX_LOG = journalIA;
  process.env.PREMIUM_FIN_GRATUITE_COMMUNE = '2020-01-01T00:00:00.000Z';
  env = await H.demarrer('kofi-actions-adherent');
});
test.after(() => { if (env) env.stop(); try { fs.unlinkSync(journalIA); } catch (e) { /* absent */ } });
const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { db.exec('PRAGMA busy_timeout=8000'); return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };

test('Koffi — ajouter un adhérent : parcours complet', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 7);
  const call = env.call;
  const NOMS = ['Adm', 'Asso', 'Asso2', 'Asso3', 'Simple', 'Autre', 'Vide'];
  const jar = {}; for (const n of NOMS) jar[n] = H.cookieJar();
  const uid = nom => sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id;
  const msg = (j, body) => call(j, 'POST', '/api/kofi/navigation/messages', body);
  const etat = j => call(j, 'GET', '/api/kofi/navigation/etat');
  const lignes = () => { try { return fs.readFileSync(journalIA, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch (e) { return []; } };
  const membres = init => sql('select * from adhesion_membres where initiative_id=? order by id', init);
  const actions = nom => sql("select * from kofi_actions where user_id=? order by id", uid(nom));
  const adh = o => 'ADHJSON:' + JSON.stringify(o);
  let initId, fAnnuelle, fBienf, initAsso2, fAnnAsso2, fBienfAsso2, initAsso3, fAnnAsso3, fBienfAsso3;

  await t.test('setup — une association (2 formules), un compte simple, une association sans formule', async () => {
    await H.creerFormateur(env, jar.Adm, rnd, 'Adm');
    for (const n of ['Asso', 'Asso2', 'Asso3', 'Simple', 'Autre', 'Vide']) await H.creerApprenant(env, jar[n], rnd, n);
    for (const n of ['Asso', 'Asso2', 'Asso3', 'Simple', 'Autre', 'Vide']) { sql("UPDATE users SET created_at=datetime('now','-2 year') WHERE id=?", uid(n)); sql('DELETE FROM user_accreditations WHERE user_id=?', uid(n)); }
    assert.equal((await call(jar.Adm, 'POST', '/api/admin/kofi/budget/recharge', { montant_eur: 10 })).status, 201);
    for (const n of ['Asso', 'Asso2', 'Asso3', 'Simple', 'Autre', 'Vide', 'Adm']) assert.equal((await call(jar[n], 'POST', '/api/kofi/majorite', { confirme: true })).status, 200);
    for (const n of ['Asso', 'Asso2', 'Asso3', 'Vide']) sql("UPDATE users SET role='initiative' WHERE id=?", uid(n));
    initId = Number(sql("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Association Test', ?)", uid('Asso')).lastInsertRowid);
    fAnnuelle = Number(sql("INSERT INTO adhesion_formules (initiative_id, nom, ordre) VALUES (?, 'Cotisation annuelle', 1)", initId).lastInsertRowid);
    fBienf = Number(sql("INSERT INTO adhesion_formules (initiative_id, nom, ordre) VALUES (?, 'Membre bienfaiteur', 2)", initId).lastInsertRowid);
    for (const n of ['Asso2', 'Asso3']) {
      const i = Number(sql("INSERT INTO initiatives (nom, owner_user_id) VALUES (?, ?)", 'Association ' + n, uid(n)).lastInsertRowid);
      const f1 = Number(sql("INSERT INTO adhesion_formules (initiative_id, nom, ordre) VALUES (?, 'Cotisation annuelle', 1)", i).lastInsertRowid);
      const f2 = Number(sql("INSERT INTO adhesion_formules (initiative_id, nom, ordre) VALUES (?, 'Membre bienfaiteur', 2)", i).lastInsertRowid);
      if (n === 'Asso2') { initAsso2 = i; fAnnAsso2 = f1; fBienfAsso2 = f2; } else { initAsso3 = i; fAnnAsso3 = f1; fBienfAsso3 = f2; }
    }
    sql("INSERT INTO initiatives (nom, owner_user_id) VALUES ('Association Vide', ?)", uid('Vide'));
  });

  await t.test('capacités annoncées : seulement pour le compte qui peut réellement le faire (textes à jour)', async () => {
    const a = (await etat(jar.Asso)).data;
    assert.equal(a.capacites.ajouter_adherent, true);
    assert.match(a.avertissement, /peut ajouter un adhérent/); assert.match(a.avertissement, /seulement après votre « oui »/);
    assert.ok(a.suggestions.includes('Peux-tu ajouter un adhérent à ma place ?'));
    for (const n of ['Simple', 'Vide']) {
      const e = (await etat(jar[n])).data;
      assert.equal(e.capacites.ajouter_adherent, false, n);
      assert.match(e.avertissement, /il ne fait rien à votre place/);
      assert.ok(!e.suggestions.includes('Peux-tu ajouter un adhérent à ma place ?'));
    }
    /* « Que sais-tu faire ? » le dit aussi — sans IA. */
    const avec = (await msg(jar.Asso, { texte: 'Que sais-tu faire ?' })).data.message.contenu;
    assert.match(avec, /Ajouter un adhérent à votre registre/); assert.match(avec, /guide de navigation/); assert.match(avec, /gratuites/);
    const sans = (await msg(jar.Simple, { texte: 'Que sais-tu faire ?' })).data.message.contenu;
    assert.ok(!/Ajouter un adhérent/.test(sans)); assert.match(sans, /Ce que je ne fais pas : agir à votre place/);
  });

  await t.test('ce que reçoit le modèle : la règle d\'action pour l\'association, rien sur ses formules ni ses adhérents', async () => {
    await msg(jar.Asso, { texte: 'Peux-tu ajouter un adhérent ?' });
    const appelAsso = lignes().pop();
    assert.match(appelAsso.systeme, /AJOUTER UN ADHÉRENT/); assert.match(appelAsso.systeme, /<date_du_jour>\d{4}-\d{2}-\d{2}<\/date_du_jour>/);
    const entree = JSON.stringify(appelAsso);
    for (const interdit of ['bienfaiteur', 'Cotisation annuelle', 'Association Test']) assert.ok(!entree.includes(interdit), 'ne doit pas être transmis : ' + interdit);
    await msg(jar.Simple, { texte: 'Peux-tu ajouter un adhérent ?' });
    const appelSimple = lignes().pop();
    assert.match(appelSimple.systeme, /Tu n'es PAS capable d'ajouter/); assert.ok(!/AJOUTER UN ADHÉRENT/.test(appelSimple.systeme));
  });

  let conv, propo;
  await t.test('proposition : le serveur écrit le résumé, RIEN n\'est ajouté avant le « oui »', async () => {
    const r = await msg(jar.Asso, { texte: 'Ajoute Jean Dupont ' + adh({ nom: 'Dupont', prenom: 'Jean', email: 'Jean.Dupont@Exemple.com', telephone: '+33 6 12 34 56 78', ville: 'Lyon', pays: 'France', formule: 'annuelle', date_adhesion: '2026-11-01', duree_valeur: 12, duree_unite: 'mois' }) });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    conv = r.data.conversation_id; propo = r.data.message;
    assert.match(propo.contenu, /Je m'apprête à ajouter cet adhérent/); assert.match(propo.contenu, /Nom : Jean Dupont/); assert.match(propo.contenu, /Formule d'adhésion : Cotisation annuelle/);
    assert.match(propo.contenu, /jean\.dupont@exemple\.com/); assert.match(propo.contenu, /à partir du 1 novembre 2026, pour 12 mois/); assert.match(propo.contenu, /Aucun paiement/);
    assert.equal(propo.action.statut, 'proposee'); assert.equal(propo.action.type, 'ajouter_adherent');
    assert.equal(membres(initId).length, 0, 'rien ne doit être écrit avant le oui');
    const a = actions('Asso'); assert.equal(a.length, 1); assert.equal(a[0].statut, 'proposee'); assert.equal(a[0].type, 'ajouter_adherent');
  });

  await t.test('rechargement de la page : la proposition attend toujours (boutons), pas encore ajoutée', async () => {
    const e = (await etat(jar.Asso)).data;
    const m = e.conversation.messages.filter(x => x.role === 'assistant' && x.action).pop();
    assert.equal(m.action.statut, 'proposee'); assert.equal(m.action.id, propo.action.id);
  });

  await t.test('un autre compte ne peut ni confirmer ni annuler cette demande', async () => {
    assert.equal((await call(jar.Autre, 'POST', `/api/kofi/navigation/actions/${propo.action.id}/confirmer`)).status, 404);
    assert.equal((await call(jar.Simple, 'POST', `/api/kofi/navigation/actions/${propo.action.id}/annuler`)).status, 404);
    assert.equal((await call(null, 'POST', `/api/kofi/navigation/actions/${propo.action.id}/confirmer`)).status, 401);
    assert.equal(membres(initId).length, 0);
  });

  await t.test('« oui mais… » n\'est PAS un oui : l\'ancienne proposition expire, une nouvelle est faite avec la correction (le modèle a reçu le brouillon)', async () => {
    const r = await msg(jar.Asso, { texte: 'oui mais le prénom est Jeanne ' + adh({ nom: 'Dupont', prenom: 'Jeanne', email: 'jean.dupont@exemple.com', telephone: '+33 6 12 34 56 78', ville: 'Lyon', pays: 'France', formule: 'annuelle', date_adhesion: '2026-11-01', duree_valeur: 12, duree_unite: 'mois' }), conversation_id: conv });
    assert.equal(r.status, 200);
    assert.equal(membres(initId).length, 0);
    const appel = lignes().pop();
    assert.match(appel.messages.map(m => m.content).join('\n'), /<brouillon_adherent>.*"prenom":"Jean".*<\/brouillon_adherent>/);
    assert.match(r.data.message.contenu, /Nom : Jeanne Dupont/);
    const a = actions('Asso'); assert.equal(a[0].statut, 'expiree'); assert.equal(a[1].statut, 'proposee');
    /* L'ancien bouton ne marche plus. */
    const vieux = await call(jar.Asso, 'POST', `/api/kofi/navigation/actions/${propo.action.id}/confirmer`);
    assert.equal(vieux.status, 409); assert.equal(vieux.data.code, 'plus_en_attente');
    assert.equal(membres(initId).length, 0);
    propo = r.data.message;
  });

  await t.test('« oui » dans la conversation : l\'adhérent est ajouté par la route habituelle, tracé, une seule fois', async () => {
    const avant = lignes().length;
    const r = await msg(jar.Asso, { texte: 'Oui, vas-y', conversation_id: conv });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(lignes().length, avant, 'pas d\'appel IA pour un simple oui');
    assert.match(r.data.message.contenu, /C'est fait ✅ Jeanne Dupont est ajouté\(e\)/);
    assert.deepEqual(r.data.maj_actions, [{ id: propo.action.id, statut: 'appliquee' }]);
    assert.deepEqual(r.data.message.destinations.map(d => d.cle), ['tableau_de_bord']);
    const m = membres(initId); assert.equal(m.length, 1);
    assert.equal(m[0].nom, 'Dupont'); assert.equal(m[0].prenom, 'Jeanne'); assert.equal(m[0].email, 'jean.dupont@exemple.com'); assert.equal(m[0].formule_id, fAnnuelle); assert.equal(m[0].ville, 'Lyon');
    assert.equal(m[0].statut, 'a_jour'); assert.match(m[0].date_adhesion, /^2026-11-01/); assert.match(m[0].date_expiration, /^2027-(10-31|11-01)/);   /* 10-31 23:00 si le serveur est à l'heure de Paris (arithmétique locale de la route existante) */
    assert.equal(m[0].linked_user_id, null);
    const a = actions('Asso')[1]; assert.equal(a.statut, 'appliquee'); assert.ok(a.applique_le); assert.equal(JSON.parse(a.resultat_json).membre_id, m[0].id);
    const audit = sql('select * from adhesion_audit_log where initiative_id=? and membre_id=? order by id', initId, m[0].id);
    assert.ok(audit.length >= 2); assert.ok(audit.some(l => /Ajoutée par Koffi à la demande de/.test(l.details || '') && l.acteur_id === uid('Asso')));
    /* Un second « oui » ne recrée rien. */
    const encore = await msg(jar.Asso, { texte: 'oui', conversation_id: conv });
    assert.equal(encore.status, 200); assert.equal(membres(initId).length, 1);
    assert.equal((await call(jar.Asso, 'POST', `/api/kofi/navigation/actions/${propo.action.id}/confirmer`)).status, 409);
    assert.equal(membres(initId).length, 1);
  });

  await t.test('formule manquante avec 2 formules : Koffi demande laquelle (les noms viennent du serveur), puis le brouillon est complété', async () => {
    const r = await msg(jar.Asso2, { texte: 'Ajoute Marie Martin ' + adh({ nom: 'Martin', prenom: 'Marie', email: 'marie@exemple.com' }) });
    assert.equal(r.status, 200);
    assert.ok(!r.data.message.action);
    assert.match(r.data.message.contenu, /Pour quelle formule d'adhésion \? Vos formules : « Cotisation annuelle », « Membre bienfaiteur »/);
    assert.equal(actions('Asso2').filter(a => a.statut === 'proposee').length, 0);
    const c2 = r.data.conversation_id;
    /* Le modèle ne renvoie ici que la formule : le serveur garde le reste du brouillon. */
    const suite = await msg(jar.Asso2, { texte: 'bienfaiteur ' + adh({ formule: 'bienfaiteur' }), conversation_id: c2 });
    assert.match(suite.data.message.contenu, /Nom : Marie Martin/); assert.match(suite.data.message.contenu, /Formule d'adhésion : Membre bienfaiteur/);
    assert.match(suite.data.message.contenu, /aucune date donnée, la fiche sera « en attente »/);
    assert.equal(suite.data.message.action.statut, 'proposee');
    /* Bouton « Oui, ajouter » : même résultat que le oui tapé. */
    const ok = await call(jar.Asso2, 'POST', `/api/kofi/navigation/actions/${suite.data.message.action.id}/confirmer`);
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.match(ok.data.message.contenu, /C'est fait ✅ Marie Martin/); assert.equal(ok.data.maj_actions[0].statut, 'appliquee');
    const m = membres(initAsso2).find(x => x.nom === 'Martin'); assert.equal(m.formule_id, fBienfAsso2); assert.equal(m.statut, 'en_attente'); assert.equal(m.date_adhesion, null);
    /* L'état rechargé montre la carte comme faite. */
    const e = (await etat(jar.Asso2)).data;
    assert.equal(e.conversation.messages.filter(x => x.action).pop().action.statut, 'appliquee');
  });

  await t.test('données invalides : e-mail ou date incorrects → on redemande, rien n\'est proposé ni écrit', async () => {
    const n0 = membres(initAsso2).length;
    const r1 = await msg(jar.Asso2, { texte: 'Ajoute Paul ' + adh({ nom: 'Paul', formule: 'annuelle', email: 'pas-un-email' }) });
    assert.match(r1.data.message.contenu, /n'a pas l'air valide/); assert.ok(!r1.data.message.action);
    const r2 = await msg(jar.Asso2, { texte: 'Ajoute Paul ' + adh({ nom: 'Paul', formule: 'annuelle', date_adhesion: '2026-02-31' }) });
    assert.match(r2.data.message.contenu, /n'est pas une date valide/); assert.ok(!r2.data.message.action);
    const r3 = await msg(jar.Asso2, { texte: 'Ajoute Paul ' + adh({ nom: 'Paul', formule: 'annuelle', duree_valeur: 6, duree_unite: 'mois' }) });
    assert.match(r3.data.message.contenu, /À partir de quelle date l'adhésion commence-t-elle/); assert.ok(!r3.data.message.action);
    assert.equal(membres(initAsso2).length, n0);
  });

  await t.test('du … au … : période collective ; doublon signalé dans le résumé ; « non » annule sans rien écrire', async () => {
    const r = await msg(jar.Asso2, { texte: 'Ajoute Marie ' + adh({ nom: 'Martin', prenom: 'Marie', email: 'marie@exemple.com', formule: 'annuelle', date_adhesion: '2026-11-01', date_fin: '2027-03-31' }) });
    assert.match(r.data.message.contenu, /du 1 novembre 2026 au 31 mars 2027/); assert.match(r.data.message.contenu, /⚠️ Une fiche existe déjà/);
    const n0 = membres(initAsso2).length;
    const non = await msg(jar.Asso2, { texte: 'non', conversation_id: r.data.conversation_id });
    assert.match(non.data.message.contenu, /je n'ajoute rien/); assert.deepEqual(non.data.maj_actions, [{ id: r.data.message.action.id, statut: 'annulee' }]);
    assert.equal(membres(initAsso2).length, n0);
    /* Même demande, confirmée cette fois : période collective enregistrée. */
    const r2 = await msg(jar.Asso2, { texte: 'Ajoute Louise ' + adh({ nom: 'Kouassi', prenom: 'Louise', formule: 'annuelle', date_adhesion: '2026-11-01', date_fin: '2027-03-31' }) });
    const ok = await call(jar.Asso2, 'POST', `/api/kofi/navigation/actions/${r2.data.message.action.id}/confirmer`);
    assert.equal(ok.status, 200);
    const m = membres(initAsso2).find(x => x.nom === 'Kouassi'); assert.match(m.date_expiration, /^2027-03-31/);
    /* Bouton « Annuler ». */
    const r3 = await msg(jar.Asso2, { texte: 'Ajoute Awa ' + adh({ nom: 'Awa', formule: 'annuelle' }) });
    const an = await call(jar.Asso2, 'POST', `/api/kofi/navigation/actions/${r3.data.message.action.id}/annuler`);
    assert.equal(an.status, 200); assert.equal(an.data.maj_actions[0].statut, 'annulee'); assert.ok(!membres(initAsso2).some(x => x.nom === 'Awa'));
  });

  await t.test('un compte qui ne peut pas : même si le modèle « demandait » l\'action, elle est ignorée (aucune proposition, aucune fiche)', async () => {
    for (const nom of ['Simple', 'Vide']) {
      const r = await msg(jar[nom], { texte: 'Ajoute quelqu\'un ' + adh({ nom: 'Intrus', formule: 'x' }) });
      assert.equal(r.status, 200); assert.ok(!r.data.message.action); assert.ok(!/Je m'apprête/.test(r.data.message.contenu));
      assert.equal(actions(nom).length, 0);
    }
    assert.ok(!sql("select * from adhesion_membres where nom='Intrus'").length);
  });

  await t.test('une confirmation d\'une demande dont les droits ont disparu (formule désactivée) : refus honnête, rien d\'écrit', async () => {
    const r = await msg(jar.Asso3, { texte: 'Ajoute Zoé ' + adh({ nom: 'Zoé', formule: 'annuelle' }) });
    const n0 = membres(initAsso3).length;
    sql('UPDATE adhesion_formules SET actif=0 WHERE initiative_id=?', initAsso3);
    const ok = await call(jar.Asso3, 'POST', `/api/kofi/navigation/actions/${r.data.message.action.id}/confirmer`);
    assert.equal(ok.status, 200); assert.match(ok.data.message.contenu, /Je ne peux pas ajouter cet adhérent/); assert.equal(ok.data.maj_actions[0].statut, 'echec');
    assert.equal(membres(initAsso3).length, n0);
    sql('UPDATE adhesion_formules SET actif=1 WHERE initiative_id=?', initAsso3);
  });

  await t.test('plafond quotidien : au-delà de 30 ajouts par Koffi en 24 h, refus honnête', async () => {
    const r = await msg(jar.Asso3, { texte: 'Ajoute Yao ' + adh({ nom: 'Yao', formule: 'annuelle' }) });
    const conv0 = r.data.conversation_id;
    for (let i = 0; i < A.MAX_PAR_JOUR; i++) sql("INSERT INTO kofi_actions (conversation_id, message_id, user_id, formation_id, type, titre, params_json, statut) VALUES (?,?,?,?,?,?,?,?)", conv0, null, uid('Asso3'), 0, 'ajouter_adherent', 'test', '{}', 'appliquee');
    const n0 = membres(initAsso3).length;
    const ok = await call(jar.Asso3, 'POST', `/api/kofi/navigation/actions/${r.data.message.action.id}/confirmer`);
    assert.match(ok.data.message.contenu, /limite de 30 adhérents/); assert.equal(membres(initAsso3).length, n0);
    sql("DELETE FROM kofi_actions WHERE titre='test'");
  });

  await t.test('supprimer la conversation efface les propositions mais garde la trace des ajouts faits', async () => {
    /* Un ajout réellement fait (Asso3 n'a pas dépassé son plafond : les lignes factices ont été retirées) + une proposition restée en attente, dans UNE conversation. */
    const r1 = await msg(jar.Asso3, { texte: 'Ajoute Kofi ' + adh({ nom: 'Kofi', formule: 'annuelle' }) });
    const conv3 = r1.data.conversation_id;
    assert.equal((await call(jar.Asso3, 'POST', `/api/kofi/navigation/actions/${r1.data.message.action.id}/confirmer`)).status, 200);
    const r2 = await msg(jar.Asso3, { texte: 'Ajoute Adjoua ' + adh({ nom: 'Adjoua', formule: 'annuelle' }), conversation_id: conv3 });
    assert.equal(r2.data.message.action.statut, 'proposee');
    const faits = () => actions('Asso3').filter(a => a.statut === 'appliquee');
    assert.equal(faits().length, 1);
    assert.equal((await call(jar.Asso3, 'DELETE', `/api/kofi/navigation/conversations/${conv3}`)).status, 200);
    assert.equal(actions('Asso3').filter(a => a.conversation_id === conv3 && a.statut !== 'appliquee').length, 0, 'propositions effacées avec la conversation');
    assert.equal(faits().length, 1, 'la trace de l\'ajout fait reste');
    assert.ok(sql('select * from adhesion_audit_log where initiative_id=?', initAsso3).some(l => /Ajoutée par Koffi/.test(l.details || '')), 'le journal d\'audit de l\'association reste');
    assert.ok(!sql('select * from adhesion_membres where initiative_id=? and nom=?', initAsso3, 'Adjoua').length, 'la proposition effacée n\'a rien créé');
  });
});

/* ===========================================================
   tests/formation-acces.test.js — Diaspo'Actif Formation, lot 4 (2026-10-18), points 4, 5, 6, 7 et 8
   ===========================================================
   Formateurs invités (création autorisée puis retirée par l'administration), droits sur les contenus exigés à la soumission, aperçu gratuit de
   quelques leçons (seules celles-ci sont lisibles sans inscription), mode de suivi (auto / manuel avec enregistrement groupé / sans suivi),
   modèle visuel du document figé à la délivrance.

   Lancer : node --test tests/formation-acces.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');

let env;
test.before(async () => { env = await H.demarrer('acces'); });
test.after(() => { if (env) env.stop(); });

test('invités, droits, aperçu gratuit, mode de suivi, modèle de document', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarAdmin = H.cookieJar(), jarInv = H.cookieJar(), jarL = H.cookieJar();
  await H.creerFormateur(env, jarAdmin, rnd, 'Admin');
  const invite = await H.creerApprenant(env, jarInv, rnd, 'Expert');
  await H.creerApprenant(env, jarL, rnd, 'Kone');
  const c = (jar, m, u, b) => env.call(jar, m, u, b);
  let invId, fid, mod, ch, lA, lB, lQ;

  await t.test('point 7 — un simple utilisateur ne crée pas de formation ; l\'administration l\'invite ; puis le retire', async () => {
    let r = await c(jarInv, 'POST', '/api/formations', { titre: 'Refusée ' + rnd });
    assert.equal(r.status, 403);
    r = await c(jarInv, 'GET', '/api/formateur/statut'); assert.equal(r.data.peut_creer, false);
    assert.equal((await c(jarInv, 'POST', '/api/admin/formateurs-invites', { identifiant: invite.email })).status, 403, 'seule l\'administration invite');
    assert.equal((await c(jarAdmin, 'POST', '/api/admin/formateurs-invites', { identifiant: 'personne@example.com' })).status, 404);
    r = await c(jarAdmin, 'POST', '/api/admin/formateurs-invites', { identifiant: invite.email.toUpperCase(), motif: 'Expert en comptabilité' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); invId = r.data.user_id;
    assert.equal((await c(jarAdmin, 'POST', '/api/admin/formateurs-invites', { identifiant: invite.email })).status, 409);
    r = await c(jarInv, 'GET', '/api/formateur/statut'); assert.equal(r.data.peut_creer, true); assert.equal(r.data.source, 'invite');
    r = await c(jarInv, 'POST', '/api/formations', { titre: 'Comptabilité ' + rnd, description: 'x' });
    assert.equal(r.status, 201, JSON.stringify(r.data)); fid = r.data.id;
    const liste = await c(jarAdmin, 'GET', '/api/admin/formateurs-invites');
    assert.equal(liste.data.invites.length, 1); assert.equal(liste.data.invites[0].nb_formations, 1); assert.equal(liste.data.invites[0].statut, 'actif');
    assert.equal((await c(jarInv, 'GET', '/api/admin/formateurs-invites')).status, 403);
  });

  await t.test('construction par le formateur invité : 3 leçons (1 offerte, 1 quiz)', async () => {
    mod = (await c(jarInv, 'POST', `/api/formations/${fid}/modules`, { titre: 'M' })).data.id;
    ch = (await c(jarInv, 'POST', `/api/formations/${fid}/modules/${mod}/chapitres`, { titre: 'C' })).data.id;
    const mk = async (titre, type, extra) => { const r = await c(jarInv, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre, type, contenu_texte: '<p>SECRET ' + titre + '</p>', ...(extra || {}) }); assert.equal(r.status, 201, JSON.stringify(r.data)); return r.data.id; };
    lA = await mk('Leçon offerte', 'texte', { apercu_gratuit: true });
    lB = await mk('Leçon payante', 'texte');
    lQ = await mk('Quiz', 'quiz');
    assert.equal((await c(jarInv, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Quiz offert', type: 'quiz', apercu_gratuit: true })).status, 400, 'un quiz ne s\'offre pas en aperçu');
    const q = (await c(jarInv, 'POST', `/api/formations/${fid}/quiz`, { titre: 'Quiz final', lecon_id: lQ, note_minimale: 50 })).data.id;
    await c(jarInv, 'POST', `/api/formations/${fid}/quiz/${q}/questions`, { question: 'Q ?', type: 'qcm', options: ['Oui', 'Non'], reponse_correcte: 'Oui' });
    /* Une leçon d'une autre formation ne se modifie pas par son identifiant. */
    const autre = (await c(jarAdmin, 'POST', '/api/formations', { titre: 'Autre ' + rnd })).data.id;
    assert.equal((await c(jarAdmin, 'PUT', `/api/formations/${autre}/lecons/${lA}`, { titre: 'Détournée' })).status, 404);
    assert.equal((await c(jarAdmin, 'DELETE', `/api/formations/${autre}/lecons/${lA}`)).status, 404);
  });

  await t.test('point 4 — aperçu : seule la leçon offerte est lisible, formation non publiée introuvable', async () => {
    assert.equal((await c(null, 'GET', `/api/formations/${fid}/decouverte`)).status, 404, 'brouillon : rien n\'est exposé');
    H.publier(env, fid);
    const r = await c(null, 'GET', `/api/formations/${fid}/decouverte`);
    assert.equal(r.status, 200);
    assert.equal(r.data.nb_lecons, 3); assert.equal(r.data.nb_apercu, 1);
    const lecons = r.data.modules[0].chapitres[0].lecons;
    const texte = JSON.stringify(r.data);
    assert.match(texte, /SECRET Leçon offerte/); assert.doesNotMatch(texte, /SECRET Leçon payante/, 'le contenu des autres leçons ne sort jamais');
    assert.equal(lecons.find(l => l.id === lB).contenu_texte, undefined);
    assert.equal(lecons.find(l => l.id === lQ).apercu_gratuit, false);
    /* Retirer l'offre : plus rien de lisible. */
    const rr = await c(jarInv, 'PUT', `/api/formations/${fid}/lecons/${lA}`, { apercu_gratuit: false });
    assert.equal(rr.status, 200);
    const apres = await c(null, 'GET', `/api/formations/${fid}/decouverte`);
    assert.doesNotMatch(JSON.stringify(apres.data), /SECRET/);
    await c(jarInv, 'PUT', `/api/formations/${fid}/lecons/${lA}`, { apercu_gratuit: true });
  });

  await t.test('point 6 — la soumission exige la confirmation des droits sur les contenus', async () => {
    const f2 = (await c(jarInv, 'POST', '/api/formations', { titre: 'À soumettre ' + rnd, description: 'Description complète.', mode_acces: 'gratuit' })).data.id;
    const m2 = (await c(jarInv, 'POST', `/api/formations/${f2}/modules`, { titre: 'M' })).data.id;
    const c2 = (await c(jarInv, 'POST', `/api/formations/${f2}/modules/${m2}/chapitres`, { titre: 'C' })).data.id;
    await c(jarInv, 'POST', `/api/formations/${f2}/chapitres/${c2}/lecons`, { titre: 'L', type: 'texte', contenu_texte: '<p>x</p>' });
    let r = await c(jarInv, 'POST', `/api/formations/${f2}/publier`, {});
    assert.equal(r.status, 400); assert.equal(r.data.code, 'droits_requis');
    r = await c(jarInv, 'POST', `/api/formations/${f2}/publier`, { droits_confirmes: 'oui' });
    assert.equal(r.status, 400, 'seul true est accepté');
    r = await c(jarInv, 'POST', `/api/formations/${f2}/publier`, { droits_confirmes: true });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const d = new H.DatabaseSync(env.dbPath);
    const row = d.prepare('SELECT statut, droits_confirmes_le, droits_confirmes_par FROM formations WHERE id=?').get(f2); d.close();
    assert.equal(row.statut, 'soumise'); assert.ok(row.droits_confirmes_le); assert.equal(Number(row.droits_confirmes_par), invId);
  });

  await t.test('point 8 — « sans suivi » incompatible avec document et quiz ; modes valides ; progression refusée', async () => {
    let r = await c(jarInv, 'PUT', `/api/formations/${fid}/reglages`, { suivi_mode: 'aucun' });
    assert.equal(r.status, 400, 'formation déjà en ligne : le mode de suivi est figé');
    const fq = (await c(jarInv, 'POST', '/api/formations', { titre: 'Avec quiz ' + rnd, description: 'x' })).data.id;
    await c(jarInv, 'POST', `/api/formations/${fq}/quiz`, { titre: 'Un quiz' });
    r = await c(jarInv, 'PUT', `/api/formations/${fq}/reglages`, { suivi_mode: 'aucun' });
    assert.equal(r.status, 400, 'la formation contient un quiz'); assert.equal(r.data.code, 'quiz_presents');
    assert.equal((await c(jarInv, 'PUT', `/api/formations/${fq}/reglages`, { suivi_mode: 'delirant' })).status, 400);
    const f3 = (await c(jarInv, 'POST', '/api/formations', { titre: 'Libre ' + rnd, description: 'x' })).data.id;
    const m3 = (await c(jarInv, 'POST', `/api/formations/${f3}/modules`, { titre: 'M' })).data.id;
    const c3 = (await c(jarInv, 'POST', `/api/formations/${f3}/modules/${m3}/chapitres`, { titre: 'C' })).data.id;
    const l3 = (await c(jarInv, 'POST', `/api/formations/${f3}/chapitres/${c3}/lecons`, { titre: 'L', type: 'texte' })).data.id;
    r = await c(jarInv, 'PUT', `/api/formations/${f3}/certificat`, { certificat_actif: true, certificat_type: 'suivi' }); assert.equal(r.status, 200);
    r = await c(jarInv, 'PUT', `/api/formations/${f3}/reglages`, { suivi_mode: 'aucun' });
    assert.equal(r.status, 400); assert.equal(r.data.code, 'certificat_actif');
    await c(jarInv, 'PUT', `/api/formations/${f3}/certificat`, { certificat_actif: false, certificat_type: 'suivi' });
    r = await c(jarInv, 'PUT', `/api/formations/${f3}/reglages`, { suivi_mode: 'aucun' }); assert.equal(r.status, 200);
    r = await c(jarInv, 'PUT', `/api/formations/${f3}/certificat`, { certificat_actif: true, certificat_type: 'suivi' });
    assert.equal(r.status, 400, 'pas de document sans suivi'); assert.equal(r.data.code, 'suivi_desactive');
    r = await c(jarInv, 'POST', `/api/formations/${f3}/quiz`, { titre: 'Interdit' }); assert.equal(r.status, 400);
    H.publier(env, f3);
    assert.equal((await c(jarL, 'POST', `/api/formations/${f3}/inscrire`, {})).status, 201);
    r = await c(jarL, 'POST', `/api/formations/${f3}/lecons/${l3}/progression`, { termine: true });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'suivi_desactive');
    r = await c(jarL, 'POST', `/api/formations/${f3}/progression-lot`, { lecons: [{ id: l3, termine: true }] });
    assert.equal(r.status, 409); assert.equal(r.data.code, 'suivi_desactive');
    r = await c(jarL, 'GET', `/api/formations/${f3}/suivre`);
    assert.equal(r.data.parcours.statut, 'libre'); assert.equal(r.data.formation.suivi_mode, 'aucun');
  });

  await t.test('points 5 et 8 — mode manuel : enregistrement groupé ; modèle du document figé à la délivrance', async () => {
    const f4 = (await c(jarInv, 'POST', '/api/formations', { titre: 'Manuel ' + rnd, description: 'x' })).data.id;
    const m4 = (await c(jarInv, 'POST', `/api/formations/${f4}/modules`, { titre: 'M' })).data.id;
    const c4 = (await c(jarInv, 'POST', `/api/formations/${f4}/modules/${m4}/chapitres`, { titre: 'C' })).data.id;
    const mk = async (titre) => (await c(jarInv, 'POST', `/api/formations/${f4}/chapitres/${c4}/lecons`, { titre, type: 'texte' })).data.id;
    const a = await mk('A'), b = await mk('B');
    assert.equal((await c(jarInv, 'PUT', `/api/formations/${f4}/reglages`, { suivi_mode: 'manuel' })).status, 200);
    assert.equal((await c(jarInv, 'PUT', `/api/formations/${f4}/certificat`, { certificat_actif: true, certificat_type: 'suivi', certificat_modele: 'baroque' })).status, 400, 'modèle inconnu refusé');
    assert.equal((await c(jarInv, 'PUT', `/api/formations/${f4}/certificat`, { certificat_actif: true, certificat_type: 'suivi', certificat_modele: 'premium' })).status, 200);
    H.publier(env, f4);
    /* Le suivi ne se règle plus une fois la formation en ligne. */
    assert.equal((await c(jarInv, 'PUT', `/api/formations/${f4}/reglages`, { suivi_mode: 'auto' })).status, 400);
    assert.equal((await c(jarL, 'POST', `/api/formations/${f4}/inscrire`, {})).status, 201);
    let r = await c(jarL, 'POST', `/api/formations/${f4}/progression-lot`, { lecons: [{ id: a, termine: true }, { id: 999999, termine: true }, { id: lQ, termine: true }] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.appliquees, 1); assert.equal(r.data.ignorees, 2, 'leçons étrangères à la formation ignorées'); assert.equal(r.data.avancement_pct, 50);
    assert.equal(r.data.attestation, null);
    r = await c(jarL, 'POST', `/api/formations/${f4}/progression-lot`, { lecons: [{ id: b, termine: true }] });
    assert.equal(r.data.avancement_pct, 100);
    assert.ok(r.data.attestation, 'le document est délivré à 100 %'); assert.equal(r.data.attestation.modele, 'premium');
    const code = r.data.attestation.code;
    /* Le formateur change de modèle APRÈS : le document déjà délivré ne bouge pas. */
    const d = new H.DatabaseSync(env.dbPath); d.prepare("UPDATE formations SET statut='brouillon' WHERE id=?").run(f4); d.close();
    await c(jarInv, 'PUT', `/api/formations/${f4}/certificat`, { certificat_actif: true, certificat_type: 'suivi', certificat_modele: 'moderne' });
    const mon = await c(jarL, 'GET', `/api/attestations/mon/${code}`);
    assert.equal(mon.data.attestation.modele, 'premium', 'modèle figé à la délivrance');
    const pub = await c(null, 'GET', `/api/attestations/verifier/${code}`);
    assert.equal(pub.data.modele, 'premium');
  });

  await t.test('point 7 — retrait : plus de création, mais les formations existantes restent', async () => {
    let r = await c(jarAdmin, 'DELETE', `/api/admin/formateurs-invites/${invId}`); assert.equal(r.status, 200);
    assert.equal((await c(jarAdmin, 'DELETE', `/api/admin/formateurs-invites/${invId}`)).status, 404);
    assert.equal((await c(jarInv, 'GET', '/api/formateur/statut')).data.peut_creer, false);
    assert.equal((await c(jarInv, 'POST', '/api/formations', { titre: 'Après retrait ' + rnd })).status, 403);
    r = await c(jarInv, 'GET', '/api/mes-formations');
    assert.ok(r.data.formations.length >= 3, 'ses formations restent visibles');
    assert.equal((await c(jarAdmin, 'POST', '/api/admin/formateurs-invites', { identifiant: String(invId) })).status, 201, 'on peut le réinviter (par numéro de compte)');
  });
});

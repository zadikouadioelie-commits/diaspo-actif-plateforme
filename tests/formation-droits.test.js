/* ===========================================================
   tests/formation-droits.test.js — Formation Diaspora, lot A (2026-10-30)
   ===========================================================
   Droits d'accès par formation OU par module, commandes, paiement validé par le seul webhook, expiration, révocation, anciennes inscriptions.
   Intégration HTTP réelle, base SQLite isolée, faux Stripe (aucun vrai paiement) — voir tests/_formation-harness.js et tests/_faux-stripe-preload.js.
   Lancer : node --test tests/formation-droits.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const H = require('./_formation-harness');

let env;
test.before(async () => {
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\\\/g, '/');
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  process.env.CRON_SECRET = 'cron_test_factice';
  env = await H.demarrer('droits');
});
test.after(() => { if (env) env.stop(); });

const sql = (req, ...args) => { const db = new H.DatabaseSync(env.dbPath); try { return req.trim().toLowerCase().startsWith('select') ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); } };
async function webhook(type, objet) {
  const res = await fetch(env.base + '/api/stripe/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'stripe-signature': 'x' }, body: JSON.stringify({ type, data: { object: objet } }) });
  return res.status;
}
const paye = (commandeId, montant) => webhook('checkout.session.completed', { id: 'cs_x', amount_total: Math.round(montant * 100), metadata: { diaspoactif_formation_commande_id: String(commandeId) } });

test('droits d\'accès : formation complète, modules vendus seuls, expiration, révocation', async (t) => {
  const rnd = Math.random().toString(36).slice(2, 9);
  const jarF = H.cookieJar(), jarA = H.cookieJar(), jarB = H.cookieJar(), jarC = H.cookieJar(), anon = H.cookieJar();
  const call = env.call;
  let fid, m1, m2, m3, l1, l2, l3, quizM2, proprietaire;

  const ajouterModule = async (titre, extra) => {
    const m = (await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre, ...extra }));
    assert.equal(m.status, 201, JSON.stringify(m.data));
    const ch = (await call(jarF, 'POST', `/api/formations/${fid}/modules/${m.data.id}/chapitres`, { titre: 'Ch ' + titre })).data.id;
    const l = (await call(jarF, 'POST', `/api/formations/${fid}/chapitres/${ch}/lecons`, { titre: 'Leçon ' + titre, type: 'texte', contenu_texte: '<p>contenu secret ' + titre + '</p>' })).data.id;
    return { m: m.data.id, l };
  };

  await t.test('setup — formation payante 30 €, trois modules (10 € / 12 € / non vendu seul), 3 apprenants', async () => {
    await H.creerFormateur(env, jarF, rnd, 'Formateur');
    await H.creerApprenant(env, jarA, rnd, 'Apprenant');
    await H.creerApprenant(env, jarB, rnd, 'Deuxieme');
    await H.creerApprenant(env, jarC, rnd, 'Ancien');
    fid = (await call(jarF, 'POST', '/api/formations', { titre: 'Entrepreneuriat ' + rnd, description: 'x' })).data.id;
    sql("UPDATE formations SET mode_acces='payant', prix=30, gratuit=0 WHERE id=?", fid);
    proprietaire = sql('select owner_user_id o from formations where id=?', fid)[0].o;
    ({ m: m1, l: l1 } = await ajouterModule('M1', { vendable_seul: 1, prix: 10 }));
    ({ m: m2, l: l2 } = await ajouterModule('M2', { vendable_seul: 1, prix: 12 }));
    ({ m: m3, l: l3 } = await ajouterModule('M3', {}));
    /* un quiz dans le module 2 */
    const q = await call(jarF, 'POST', `/api/formations/${fid}/quiz`, { titre: 'Quiz M2', type: 'exercice', note_minimale: 50, lecon_id: l2 });
    quizM2 = q.data.id;
    H.publier(env, fid);
    sql("UPDATE formations SET certificat_actif=1, certificat_type='suivi' WHERE id=?", fid);
    assert.ok(fid && m1 && m2 && m3);
  });

  await t.test('vendre un module seul : prix obligatoire dans une formation payante', async () => {
    const r = await call(jarF, 'POST', `/api/formations/${fid}/modules`, { titre: 'Sans prix', vendable_seul: 1 });
    assert.equal(r.status, 400, 'jamais de module offert par oubli');
    const ok = await call(jarF, 'PUT', `/api/formations/${fid}/modules/${m3}`, { vendable_seul: 0 });
    assert.equal(ok.status, 200);
  });

  await t.test('la fiche publique expose les modules, leurs prix et ce qui est vendu seul', async () => {
    const r = await call(anon, 'GET', `/api/formations/${fid}/offre`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.formation.prix, 30);
    assert.equal(r.data.mon_acces, null);
    const parId = Object.fromEntries(r.data.modules.map(m => [m.id, m]));
    assert.equal(parId[m1].vendable_seul, true); assert.equal(parId[m1].prix, 10);
    assert.equal(parId[m2].prix, 12);
    assert.equal(parId[m3].vendable_seul, false);
  });

  await t.test('refus : visiteur non connecté, module non vendu seul, module d\'une autre formation', async () => {
    assert.equal((await call(anon, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m1 })).status, 401);
    let r = await call(jarA, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m3 });
    assert.equal(r.status, 400, JSON.stringify(r.data));
    r = await call(jarA, 'POST', `/api/formations/${fid}/acquerir`, { module_id: 99999999 });
    assert.equal(r.status, 404);
  });

  let commande1;
  await t.test('achat d\'un module : rien n\'est accordé avant le paiement confirmé par le serveur', async () => {
    let r = await call(jarA, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m1 });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.ok(r.data.checkout_url); assert.equal(r.data.portee, 'modules');
    commande1 = r.data.commande_id;
    const cmd = sql('select montant, statut from formation_commandes where id=?', commande1)[0];
    assert.equal(cmd.montant, 10); assert.equal(cmd.statut, 'en_attente');
    assert.equal(sql("select statut from formation_acces where commande_id=?", commande1)[0].statut, 'en_attente');
    assert.equal((await call(jarA, 'GET', `/api/formations/${fid}/suivre`)).status, 403, 'contenu fermé tant que Stripe n\'a pas confirmé');
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/lecons/${l1}/progression`, { termine: true })).status, 403);
  });

  await t.test('double clic : le paiement en cours est repris, aucun doublon', async () => {
    const r = await call(jarA, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m1 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.repris, true);
    assert.equal(sql('select count(*) n from formation_commandes where user_id=(select id from users where email=?)', H.compte(rnd, 'Apprenant', 'utilisateur').email)[0].n, 1);
    assert.equal(sql('select count(*) n from formation_acces where commande_id=?', commande1)[0].n, 1);
  });

  await t.test('paiement confirmé (webhook) : accès au SEUL module, formateur crédité, et rejouer l\'événement ne change rien', async () => {
    const avant = sql('select wallet_balance w from users where id=?', proprietaire)[0].w || 0;
    assert.equal(await paye(commande1, 10), 200);
    assert.equal(sql('select statut from formation_commandes where id=?', commande1)[0].statut, 'payee');
    assert.equal(sql('select statut from formation_acces where commande_id=?', commande1)[0].statut, 'actif');
    const insc = sql('select statut, paiement_statut, portee, montant_paye from formation_inscriptions where formation_id=?', fid)[0];
    assert.equal(insc.statut, 'active'); assert.equal(insc.paiement_statut, 'paye'); assert.equal(insc.portee, 'modules'); assert.equal(insc.montant_paye, 10);
    const apres = sql('select wallet_balance w from users where id=?', proprietaire)[0].w;
    assert.equal(Math.round((apres - avant) * 100), 970, '10 € moins 3 % de commission');
    await paye(commande1, 10);
    assert.equal(sql('select wallet_balance w from users where id=?', proprietaire)[0].w, apres, 'événement rejoué : pas de second crédit');
  });

  await t.test('l\'apprenant voit le module acquis, les autres sont verrouillés et sans contenu', async () => {
    const r = await call(jarA, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.portee, 'modules');
    assert.deepEqual(r.data.modules.map(m => Number(m.id)), [Number(m1)]);
    assert.deepEqual(r.data.modules_verrouilles.map(m => Number(m.id)).sort(), [Number(m2), Number(m3)].sort());
    assert.ok(!JSON.stringify(r.data.modules_verrouilles).includes('contenu secret'), 'aucun contenu des modules verrouillés');
    assert.ok(JSON.stringify(r.data.modules).includes('contenu secret M1'));
    assert.ok(!JSON.stringify(r.data.modules).includes('contenu secret M2'));
  });

  await t.test('progression : seules les activités du module acquis, jauge calculée sur ce module, aucun document de formation', async () => {
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/lecons/${l2}/progression`, { termine: true })).status, 403, 'activité du module 2 non acquise');
    const r = await call(jarA, 'POST', `/api/formations/${fid}/lecons/${l1}/progression`, { termine: true });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.avancement_pct, 100);
    assert.equal(r.data.attestation, null, 'un module seul ne donne pas l\'attestation de la formation');
    assert.equal(sql('select count(*) n from formation_attestations where formation_id=?', fid)[0].n, 0);
    const lot = await call(jarA, 'POST', `/api/formations/${fid}/progression-lot`, { lecons: [{ id: l2, termine: true }] });
    assert.equal(lot.status, 200); assert.equal(lot.data.appliquees, 0); assert.equal(lot.data.ignorees, 1);
  });

  await t.test('le quiz d\'un module non acquis est fermé (passage et envoi)', async () => {
    assert.equal((await call(jarA, 'GET', `/api/formations/${fid}/quiz/${quizM2}/passer`)).status, 403);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/quiz/${quizM2}/soumettre`, { reponses: {} })).status, 403);
  });

  let commande2;
  await t.test('acheter un second module : les deux sont ouverts, le troisième reste fermé', async () => {
    let r = await call(jarA, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m2 });
    assert.equal(r.status, 201, JSON.stringify(r.data)); commande2 = r.data.commande_id;
    assert.equal((await call(jarA, 'GET', `/api/formations/${fid}/suivre`)).data.modules.length, 1, 'toujours un seul module avant paiement, et l\'accès du module 1 n\'est pas coupé');
    assert.equal(await paye(commande2, 12), 200);
    r = await call(jarA, 'GET', `/api/formations/${fid}/suivre`);
    assert.deepEqual(r.data.modules.map(m => Number(m.id)).sort(), [Number(m1), Number(m2)].sort());
    assert.deepEqual(r.data.modules_verrouilles.map(m => Number(m.id)), [Number(m3)]);
    assert.equal((await call(jarA, 'GET', `/api/formations/${fid}/quiz/${quizM2}/passer`)).status, 200, 'quiz du module 2 ouvert');
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m2 })).status, 409, 'jamais deux fois le même module');
  });

  await t.test('formation complète : tout s\'ouvre, la portée devient « formation », plus de module séparé à racheter', async () => {
    let r = await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(await paye(r.data.commande_id, 30), 200);
    assert.equal(sql('select portee from formation_inscriptions where formation_id=?', fid)[0].portee, 'formation');
    r = await call(jarA, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(r.data.modules.length, 3); assert.equal(r.data.modules_verrouilles.length, 0);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/lecons/${l3}/progression`, { termine: true })).status, 200);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m1 })).status, 409);
    assert.equal((await call(jarA, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 409);
  });

  await t.test('session de paiement expirée : commande close, droit retiré, première inscription supprimée, nouvel essai possible', async () => {
    let r = await call(jarB, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m1 });
    assert.equal(r.status, 201); const cid = r.data.commande_id;
    assert.equal(await webhook('checkout.session.expired', { id: 'cs_y', metadata: { diaspoactif_formation_commande_id: String(cid) } }), 200);
    assert.equal(sql('select statut from formation_commandes where id=?', cid)[0].statut, 'expiree');
    assert.equal(sql('select count(*) n from formation_acces where commande_id=?', cid)[0].n, 0);
    assert.equal(sql('select count(*) n from formation_inscriptions where formation_id=? and user_id=(select user_id from formation_commandes where id=?)', fid, cid)[0].n, 0);
    r = await call(jarB, 'POST', `/api/formations/${fid}/acquerir`, { module_id: m1 });
    assert.equal(r.status, 201, 'le même module peut être racheté après une session expirée');
    await webhook('checkout.session.expired', { id: 'cs_z', metadata: { diaspoactif_formation_commande_id: String(r.data.commande_id) } });
  });

  let f2, uB;
  await t.test('formation gratuite à durée d\'accès limitée : accès immédiat, échéance posée, expiration, réouverture', async () => {
    f2 = (await call(jarF, 'POST', '/api/formations', { titre: 'Gratuite ' + rnd, description: 'x' })).data.id;
    const mod = (await call(jarF, 'POST', `/api/formations/${f2}/modules`, { titre: 'G' })).data.id;
    const ch = (await call(jarF, 'POST', `/api/formations/${f2}/modules/${mod}/chapitres`, { titre: 'C' })).data.id;
    await call(jarF, 'POST', `/api/formations/${f2}/chapitres/${ch}/lecons`, { titre: 'L', type: 'texte', contenu_texte: '<p>x</p>' });
    H.publier(env, f2);
    assert.equal((await call(jarF, 'PUT', `/api/formations/${f2}/reglages`, { duree_acces_jours: 0 })).status, 400);
    let r = await call(jarF, 'PUT', `/api/formations/${f2}/reglages`, { duree_acces_jours: 30 });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    r = await call(jarB, 'POST', `/api/formations/${f2}/inscrire`, {});
    assert.equal(r.status, 201, JSON.stringify(r.data));
    uB = sql('select id from users where email=?', H.compte(rnd, 'Deuxieme', 'utilisateur').email)[0].id;
    const a = sql('select statut, type_acces, date_expiration from formation_acces where user_id=? and formation_id=?', uB, f2)[0];
    assert.equal(a.statut, 'actif'); assert.equal(a.type_acces, 'gratuit'); assert.ok(a.date_expiration, 'échéance posée');
    const jours = (Date.parse(a.date_expiration.replace(' ', 'T') + 'Z') - Date.now()) / 86400000;
    assert.ok(jours > 29 && jours < 31, 'environ 30 jours : ' + jours);
    assert.equal((await call(jarB, 'GET', `/api/formations/${f2}/suivre`)).status, 200);
    sql("UPDATE formation_acces SET date_expiration=datetime('now','-1 hours') WHERE user_id=? AND formation_id=?", uB, f2);
    assert.equal((await call(jarB, 'GET', `/api/formations/${f2}/suivre`)).status, 403, 'accès échu : fermé');
    assert.equal(sql('select statut from formation_acces where user_id=? and formation_id=?', uB, f2)[0].statut, 'expire');
    assert.equal(sql('select statut from formation_inscriptions where user_id=? and formation_id=?', uB, f2)[0].statut, 'expiree');
    r = await call(jarB, 'POST', `/api/formations/${f2}/inscrire`, {});
    assert.equal(r.status, 201, 'une réinscription rouvre l\'accès');
    assert.equal((await call(jarB, 'GET', `/api/formations/${f2}/suivre`)).status, 200);
    assert.equal(sql('select count(*) n from formation_acces where user_id=? and formation_id=?', uB, f2)[0].n, 1, 'une seule ligne de droit');
  });

  await t.test('le cron quotidien expire les droits échus (secret exigé)', async () => {
    sql("UPDATE formation_acces SET date_expiration=datetime('now','-2 hours') WHERE user_id=? AND formation_id=?", uB, f2);
    let res = await fetch(env.base + '/api/cron/formation-acces-expires');
    assert.equal(res.status, 401);
    res = await fetch(env.base + '/api/cron/formation-acces-expires', { headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET } });
    assert.equal(res.status, 200);
    assert.ok((await res.json()).expires >= 1);
    assert.equal(sql('select statut from formation_acces where user_id=? and formation_id=?', uB, f2)[0].statut, 'expire');
  });

  await t.test('révocation et réouverture par le formateur (jamais par un apprenant)', async () => {
    const liste = await call(jarF, 'GET', `/api/formations/${fid}/acces`);
    assert.equal(liste.status, 200);
    const mien = liste.data.acces.find(a => a.portee === 'formation' && a.statut === 'actif');
    assert.ok(mien, 'droit « formation complète » de l\'apprenant A');
    assert.equal((await call(jarA, 'PATCH', `/api/formations/${fid}/acces/${mien.id}`, { statut: 'revoque' })).status, 403);
    assert.equal((await call(jarC, 'GET', `/api/formations/${fid}/acces`)).status, 403);
    let r = await call(jarF, 'PATCH', `/api/formations/${fid}/acces/${mien.id}`, { statut: 'revoque', motif: 'test' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    /* Le droit « formation complète » est retiré ; les deux modules achetés séparément restent à l'apprenant : accès limité à ces modules. */
    let s = await call(jarA, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(s.status, 200); assert.equal(s.data.portee, 'modules'); assert.equal(s.data.modules.length, 2); assert.equal(s.data.modules_verrouilles.length, 1);
    assert.equal((await call(jarF, 'PATCH', `/api/formations/${fid}/acces/${mien.id}`, { statut: 'revoque' })).status, 409, 'déjà révoqué');
    /* Plus aucun droit actif : accès fermé, inscription annulée. */
    for (const a of liste.data.acces.filter(a => a.portee === 'module' && a.statut === 'actif')) assert.equal((await call(jarF, 'PATCH', `/api/formations/${fid}/acces/${a.id}`, { statut: 'revoque' })).status, 200);
    assert.equal((await call(jarA, 'GET', `/api/formations/${fid}/suivre`)).status, 403);
    assert.equal(sql("select statut from formation_inscriptions where formation_id=? and user_id=(select user_id from formation_acces where id=?)", fid, mien.id)[0].statut, 'annulee');
    r = await call(jarF, 'PATCH', `/api/formations/${fid}/acces/${mien.id}`, { statut: 'actif' });
    assert.equal(r.status, 200);
    s = await call(jarA, 'GET', `/api/formations/${fid}/suivre`);
    assert.equal(s.status, 200); assert.equal(s.data.portee, 'formation'); assert.equal(s.data.modules.length, 3);
    assert.equal((await call(jarF, 'PATCH', `/api/formations/${fid}/acces/${mien.id}`, { statut: 'rembourse' })).status, 400, 'pas de remboursement de formation');
  });

  await t.test('ancienne inscription (avant le lot A) : reconnue, rattrapée dans « Mes accès », jamais rachetable', async () => {
    const uC = sql('select id from users where email=?', H.compte(rnd, 'Ancien', 'utilisateur').email)[0].id;
    sql("INSERT INTO formation_inscriptions (formation_id,user_id,montant_paye,paiement_statut,statut) VALUES (?,?,30,'paye','active')", fid, uC);
    assert.equal(sql('select count(*) n from formation_acces where user_id=?', uC)[0].n, 0);
    assert.equal((await call(jarC, 'GET', `/api/formations/${fid}/suivre`)).status, 200, 'l\'ancienne inscription donne toujours accès');
    const r = await call(jarC, 'GET', '/api/mes-acces');
    assert.equal(r.status, 200);
    assert.equal(r.data.acces.length, 1);
    assert.equal(r.data.acces[0].portee, 'formation'); assert.equal(r.data.acces[0].statut, 'actif'); assert.equal(r.data.acces[0].type_acces, 'paye');
    assert.equal((await call(jarC, 'POST', `/api/formations/${fid}/inscrire`, {})).status, 409);
  });

  await t.test('« Mes accès » : formations et modules, avec leur état', async () => {
    const r = await call(jarA, 'GET', '/api/mes-acces');
    assert.equal(r.status, 200);
    assert.ok(r.data.acces.length >= 3, JSON.stringify(r.data));
    assert.ok(r.data.acces.some(a => a.portee === 'module' && a.module_titre === 'M1'));
    assert.ok(r.data.acces.some(a => a.portee === 'formation' && a.formation_titre.startsWith('Entrepreneuriat')));
    assert.equal((await call(anon, 'GET', '/api/mes-acces')).status, 401);
  });
});

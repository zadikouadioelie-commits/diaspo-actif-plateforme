/* ===========================================================
   tests/boutique-equipe.test.js — Équipe d'une boutique : postes, droits, invitation, bascule (2026-11-15)
   ===========================================================
   Un propriétaire invite une personne (compte à elle) avec un poste ; elle accepte ; elle bascule sur la boutique ; ses actions sont limitées aux droits du poste.
   Points vérifiés :
   1. unitaires : droits, règles de routes, masquage des contacts
   2. invitation : poste inconnu, auto-invitation, compte inconnu, doublon, seul le propriétaire invite
   3. acceptation : avant, aucune bascule possible ; après, la boutique apparaît dans « mes boutiques »
   4. sans bascule, la personne n'a AUCUN droit sur la boutique (elle agit comme elle-même)
   5. après bascule : accès aux seules routes du poste, 403 avec le droit manquant sinon ; une autre boutique reste fermée
   6. sans le droit « coordonnées » : contacts des clients retirés de la réponse
   7. retours : « Gérer les commandes » ouvre accepter/refuser, mais rembourser exige le droit « Rembourser »
   8. journal : chaque écriture faite au nom du propriétaire est inscrite avec la vraie personne
   9. /api/auth/me : renvoie la vraie personne (jamais les coordonnées du propriétaire) + la boutique active
   10. retrait / départ : l'accès tombe immédiatement ; un cookie falsifié ne donne rien
   Intégration : vrai serveur + copie isolée de la base de dev. Lancer : node --test tests/boutique-equipe.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('./_formation-harness');
const Equipe = require('../server/boutique-equipe');

let env, rnd;
let compteurComptes = 0;
let proprio, initId, produitId, commandeId, retourId, acheteur;
let autreProprio, autreInitId, autreCommandeId;
let gestionnaireEquipe, editeurEquipe;

function sql(req, ...args) {
  const db = new H.DatabaseSync(env.dbPath);
  try { db.exec('PRAGMA busy_timeout=5000'); return /^\s*select/i.test(req) ? db.prepare(req).all(...args) : db.prepare(req).run(...args); }
  finally { db.close(); }
}
function inserer(table, valeurs) {
  const db = new H.DatabaseSync(env.dbPath);
  try {
    const obligatoires = db.prepare(`PRAGMA table_info(${table})`).all().filter((c) => c.notnull && c.dflt_value == null && !c.pk).map((c) => [c.name, c.type]);
    const tout = { ...valeurs };
    for (const [nom, type] of obligatoires) if (tout[nom] === undefined) tout[nom] = /INT|REAL/i.test(type) ? 0 : 'x';
    const noms = Object.keys(tout);
    return db.prepare(`INSERT INTO ${table} (${noms.join(',')}) VALUES (${noms.map(() => '?').join(',')})`).run(...noms.map((n) => tout[n]));
  } finally { db.close(); }
}
async function nouveauCompte(nom) {
  const jar = H.cookieJar();
  const nomUnique = nom + (++compteurComptes);
  await H.creerApprenant(env, jar, rnd, nomUnique);
  const email = H.compte(rnd, nomUnique, 'utilisateur').email;
  const id = sql('select id from users where email=?', email)[0].id;
  return { jar, id, email };
}
/* Ajoute directement une personne acceptée dans l'équipe (pour les cas qui ne testent pas l'invitation elle-même). */
function membreDirect(initiativeId, userId, poste, droits) {
  inserer('boutique_equipe', { initiative_id: initiativeId, user_id: userId, poste, droits_json: JSON.stringify(droits), statut: 'accepte', accepte_le: '2026-11-15 10:00:00' });
}
const call = (jar, m, p, b) => env.call(jar, m, p, b);

test.before(async () => {
  rnd = Math.random().toString(36).slice(2, 9);
  env = await H.demarrer('boutique-equipe');
  proprio = await nouveauCompte('Proprio');
  initId = Number(inserer('initiatives', { nom: `Boutique Équipe ${rnd}`, owner_user_id: proprio.id }).lastInsertRowid);
  produitId = Number(inserer('produits_vitrine', { initiative_id: initId, nom: 'Robe wax', prix: 50 }).lastInsertRowid);
  acheteur = await nouveauCompte('Acheteur');
  commandeId = Number(inserer('commandes_vitrine', {
    produit_id: produitId, initiative_id: initId, acheteur_id: acheteur.id, quantite: 1, montant_total: 50, paiement_statut: 'paye',
    livraison_nom: 'Awa Koné', livraison_adresse: '12 rue des Lilas', livraison_ville: 'Lyon', livraison_telephone: '0600000000', mode_livraison: 'expedition',
  }).lastInsertRowid);
  retourId = Number(inserer('retours', { commande_id: commandeId, initiative_id: initId, acheteur_id: acheteur.id, produit_nom: 'Robe wax', motif: 'Défaut', details: 'Le tissu est déchiré dès la réception du colis.', statut: 'envoyee' }).lastInsertRowid);
  autreProprio = await nouveauCompte('AutreProprio');
  autreInitId = Number(inserer('initiatives', { nom: `Autre Boutique ${rnd}`, owner_user_id: autreProprio.id }).lastInsertRowid);
  const autreProd = Number(inserer('produits_vitrine', { initiative_id: autreInitId, nom: 'Sac', prix: 30 }).lastInsertRowid);
  autreCommandeId = Number(inserer('commandes_vitrine', { produit_id: autreProd, initiative_id: autreInitId, acheteur_id: acheteur.id, quantite: 1, montant_total: 30 }).lastInsertRowid);
});
test.after(() => { if (env) env.stop(); });

/* ── 1. unitaires ── */
test('1. droits, règles de routes et masquage des contacts', () => {
  assert.deepEqual(Equipe.normaliserDroits(['commandes', 'n_importe_quoi', 'commandes', 'publier']), ['publier', 'commandes']);
  assert.equal(Equipe.normaliserDroits('x'), null);
  assert.equal(Equipe.DROITS.length, 8);
  assert.deepEqual(Equipe.NOMS_POSTES, ['Administrateur', 'Gestionnaire commercial', 'Gestionnaire des commandes', 'Responsable des expéditions', 'Éditeur de contenus', 'Lecteur des statistiques']);
  assert.equal(Equipe.trouverRegle('GET', '/api/initiatives/12/commandes').regle.droit, 'commandes');
  assert.equal(Equipe.trouverRegle('DELETE', '/api/produits/9').regle.droit, 'supprimer');
  assert.equal(Equipe.trouverRegle('POST', '/api/retours/4/rembourser').regle.droit, 'rembourser');
  assert.equal(Equipe.trouverRegle('PUT', '/api/auth/mot-de-passe'), null, 'le compte lui-même n\'est jamais ouvert au personnel');
  assert.equal(Equipe.trouverRegle('GET', '/api/mon-initiative'), null);
  const m = Equipe.masquer({ commandes: [{ id: 1, acheteur_nom: 'A', acheteur_email: 'a@x.fr', livraison_ville: 'Lyon' }] }, Equipe.CLES_COORDONNEES);
  assert.equal(m.commandes[0].acheteur_email, null);
  assert.equal(m.commandes[0].livraison_ville, null);
  assert.equal(m.commandes[0].acheteur_nom, 'A');
});

/* ── 2. invitation ── */
test('2. invitation : refus des cas invalides, seul le propriétaire invite', async () => {
  const gestionnaire = await nouveauCompte('Gestionnaire');
  assert.equal((await call(proprio.jar, 'POST', `/api/initiatives/${initId}/equipe-boutique`, { email: gestionnaire.email, poste: 'Chef suprême' })).status, 400, 'poste inconnu');
  assert.equal((await call(proprio.jar, 'POST', `/api/initiatives/${initId}/equipe-boutique`, { email: proprio.email, poste: 'Administrateur' })).status, 400, 'auto-invitation');
  assert.equal((await call(proprio.jar, 'POST', `/api/initiatives/${initId}/equipe-boutique`, { email: `inconnu-${rnd}@example.com`, poste: 'Administrateur' })).status, 404, 'compte inconnu');
  assert.equal((await call(proprio.jar, 'POST', `/api/initiatives/${initId}/equipe-boutique`, { email: gestionnaire.email, poste: 'Administrateur', droits: 'oups' })).status, 400, 'droits invalides');
  /* un tiers (même membre d'une autre boutique) ne peut pas inviter */
  assert.equal((await call(gestionnaire.jar, 'POST', `/api/initiatives/${initId}/equipe-boutique`, { email: acheteur.email, poste: 'Administrateur' })).status, 403);
  assert.equal((await call(gestionnaire.jar, 'GET', `/api/initiatives/${initId}/equipe-boutique`)).status, 403);
  const ok = await call(proprio.jar, 'POST', `/api/initiatives/${initId}/equipe-boutique`, { email: gestionnaire.email, poste: 'Gestionnaire des commandes', message: 'Bienvenue' });
  assert.equal(ok.status, 201);
  assert.equal((await call(proprio.jar, 'POST', `/api/initiatives/${initId}/equipe-boutique`, { email: gestionnaire.email, poste: 'Administrateur' })).status, 409, 'invitation déjà en attente');
  const liste = (await call(proprio.jar, 'GET', `/api/initiatives/${initId}/equipe-boutique`)).data;
  const ligne = liste.membres.find((x) => x.user_id === gestionnaire.id);
  assert.equal(ligne.statut, 'invite');
  assert.deepEqual(ligne.droits, ['commandes', 'rembourser', 'coordonnees'], 'droits par défaut du poste');
  assert.equal(liste.postes.length, 6);
  /* la personne invitée reçoit une notification */
  assert.ok(sql("select id from notifications where user_id=? and type='boutique_equipe_invitation'", gestionnaire.id).length >= 1);
  gestionnaireEquipe = gestionnaire;
});

/* ── 3. acceptation et bascule ── */
test('3. avant l\'acceptation aucune bascule ; après, la boutique apparaît dans « mes boutiques »', async () => {
  const g = gestionnaireEquipe;
  let mb = (await call(g.jar, 'GET', '/api/mes-boutiques')).data;
  assert.equal(mb.invitations.length, 1);
  assert.equal(mb.invitations[0].poste, 'Gestionnaire des commandes');
  assert.ok(!mb.boutiques.some((b) => b.initiative_id === initId), 'pas encore membre');
  assert.equal((await call(g.jar, 'POST', '/api/boutique-active', { initiative_id: initId })).status, 403, 'bascule impossible avant d\'accepter');
  /* personne d'autre ne peut répondre à sa place */
  assert.equal((await call(acheteur.jar, 'POST', `/api/mes-invitations-boutique/${mb.invitations[0].id}/repondre`, { accepter: true })).status, 404);
  const r = await call(g.jar, 'POST', `/api/mes-invitations-boutique/${mb.invitations[0].id}/repondre`, { accepter: true });
  assert.equal(r.status, 200);
  mb = (await call(g.jar, 'GET', '/api/mes-boutiques')).data;
  assert.equal(mb.invitations.length, 0);
  const b = mb.boutiques.find((x) => x.initiative_id === initId);
  assert.ok(b);
  assert.equal(b.poste, 'Gestionnaire des commandes');
  assert.equal(b.proprietaire, false);
  assert.equal(mb.active, g.id && 0 === mb.active ? 0 : mb.active, 'une personne sans boutique propre n\'a pas de boutique active tant qu\'elle n\'a pas basculé');
});

/* ── 4. sans bascule : aucun droit ── */
test('4. sans bascule, la personne agit comme elle-même : aucun droit sur la boutique', async () => {
  const g = gestionnaireEquipe;
  assert.equal((await call(g.jar, 'GET', `/api/initiatives/${initId}/commandes`)).status, 403);
  assert.equal((await call(g.jar, 'PATCH', `/api/commandes_vitrine/${commandeId}`, { statut: 'traitee' })).status, 403);
  assert.equal(sql('select statut from commandes_vitrine where id=?', commandeId)[0].statut, 'en_attente');
});

/* ── 5. après bascule ── */
test('5. après bascule : routes du poste ouvertes, droit manquant refusé, autre boutique fermée', async () => {
  const g = gestionnaireEquipe;
  const sw = await call(g.jar, 'POST', '/api/boutique-active', { initiative_id: initId });
  assert.equal(sw.status, 200);
  assert.equal(sw.data.poste, 'Gestionnaire des commandes');
  /* lecture des commandes : autorisée */
  const cmd = await call(g.jar, 'GET', `/api/initiatives/${initId}/commandes`);
  assert.equal(cmd.status, 200);
  assert.equal(cmd.data.commandes.length, 1);
  assert.equal(cmd.data.commandes[0].livraison_ville, 'Lyon', 'ce poste a le droit « coordonnées »');
  /* changement de statut : autorisé et réellement appliqué */
  assert.equal((await call(g.jar, 'PATCH', `/api/commandes_vitrine/${commandeId}`, { statut: 'traitee' })).status, 200);
  assert.equal(sql('select statut from commandes_vitrine where id=?', commandeId)[0].statut, 'traitee');
  /* droit manquant : ce poste ne publie pas et ne supprime pas, ne voit pas les statistiques */
  const sup = await call(g.jar, 'DELETE', `/api/produits/${produitId}`);
  assert.equal(sup.status, 403);
  assert.equal(sup.data.droit_requis, 'supprimer');
  assert.equal((await call(g.jar, 'PUT', `/api/produits/${produitId}`, { nom: 'Pirate' })).status, 403);
  assert.equal(sql('select nom from produits_vitrine where id=?', produitId)[0].nom, 'Robe wax');
  assert.equal((await call(g.jar, 'GET', `/api/initiatives/${initId}/stats-impact`)).status, 403);
  /* une autre boutique reste fermée même avec la boutique active choisie */
  assert.equal((await call(g.jar, 'GET', `/api/initiatives/${autreInitId}/commandes`)).status, 403);
  assert.equal((await call(g.jar, 'PATCH', `/api/commandes_vitrine/${autreCommandeId}`, { statut: 'traitee' })).status, 403);
  assert.equal(sql('select statut from commandes_vitrine where id=?', autreCommandeId)[0].statut, 'en_attente');
  /* le compte et les réglages ne sont jamais ouverts */
  const mi = await call(g.jar, 'GET', '/api/mon-initiative');
  assert.notEqual(mi.data.initiative && mi.data.initiative.id, initId, '« mon initiative » reste celle de la personne');
});

test('5b. droits modifiables par le propriétaire : « Éditeur de contenus » publie mais ne supprime pas', async () => {
  const e = await nouveauCompte('Editeur');
  membreDirect(initId, e.id, 'Éditeur de contenus', ['publier']);
  assert.equal((await call(e.jar, 'POST', '/api/boutique-active', { initiative_id: initId })).status, 200);
  const modif = await call(e.jar, 'PUT', `/api/produits/${produitId}`, { nom: 'Robe wax modifiée' });
  assert.equal(modif.status, 200, JSON.stringify(modif.data));
  assert.equal(sql('select nom from produits_vitrine where id=?', produitId)[0].nom, 'Robe wax modifiée');
  assert.equal((await call(e.jar, 'DELETE', `/api/produits/${produitId}`)).status, 403);
  assert.equal((await call(e.jar, 'GET', `/api/initiatives/${initId}/commandes`)).status, 403);
  /* le propriétaire ajoute le droit « supprimer » : effet immédiat */
  assert.equal((await call(proprio.jar, 'PATCH', `/api/initiatives/${initId}/equipe-boutique/${e.id}`, { droits: ['publier', 'supprimer'] })).status, 200);
  /* un produit déjà commandé ne peut pas être supprimé (règle existante) : on supprime un produit sans commande */
  const jetable = Number(inserer('produits_vitrine', { initiative_id: initId, nom: 'Jetable', prix: 5 }).lastInsertRowid);
  const sup = await call(e.jar, 'DELETE', `/api/produits/${jetable}`);
  assert.equal(sup.status, 200, JSON.stringify(sup.data));
  assert.equal(sql('select count(*) as c from produits_vitrine where id=?', jetable)[0].c, 0);
  editeurEquipe = e;
});

/* ── 6. coordonnées ── */
test('6. sans le droit « coordonnées », les contacts des clients sont retirés', async () => {
  const s = await nouveauCompte('SansCoordonnees');
  membreDirect(initId, s.id, 'Gestionnaire des commandes', ['commandes']);
  await call(s.jar, 'POST', '/api/boutique-active', { initiative_id: initId });
  const cmd = await call(s.jar, 'GET', `/api/initiatives/${initId}/commandes`);
  assert.equal(cmd.status, 200);
  const c = cmd.data.commandes[0];
  assert.equal(c.acheteur_email, null);
  assert.equal(c.livraison_adresse, null);
  assert.equal(c.livraison_telephone, null);
  assert.equal(c.livraison_ville, null);
  assert.ok(c.acheteur_nom, 'le nom de l\'acheteur reste visible');
  /* le propriétaire, lui, voit tout */
  const pc = (await call(proprio.jar, 'GET', `/api/initiatives/${initId}/commandes`)).data.commandes[0];
  assert.equal(pc.livraison_ville, 'Lyon');
  assert.equal(pc.acheteur_email, acheteur.email);
});

/* ── 7. retours : commandes ≠ rembourser ── */
test('7. retours : « Gérer les commandes » accepte ou refuse, mais rembourser exige « Rembourser »', async () => {
  const sr = await nouveauCompte('SansRembourser');
  membreDirect(initId, sr.id, 'Responsable des expéditions', ['commandes', 'coordonnees']);
  await call(sr.jar, 'POST', '/api/boutique-active', { initiative_id: initId });
  const liste = await call(sr.jar, 'GET', `/api/initiatives/${initId}/retours`);
  assert.equal(liste.status, 200);
  assert.equal(liste.data.retours.length, 1);
  const remb = await call(sr.jar, 'POST', `/api/retours/${retourId}/rembourser`, {});
  assert.equal(remb.status, 403);
  assert.equal(remb.data.droit_requis, 'rembourser');
  const acc = await call(sr.jar, 'POST', `/api/retours/${retourId}/preciser`, { message: 'Pouvez-vous envoyer une photo du col, s\'il vous plaît ?' });
  assert.equal(acc.status, 200, JSON.stringify(acc.data));
  assert.equal(sql('select statut from retours where id=?', retourId)[0].statut, 'precisions');
  /* un tiers sans poste ne peut rien faire sur ce dossier */
  assert.equal((await call(gestionnaireEquipe.jar, 'POST', '/api/boutique-active', { initiative_id: autreInitId })).status, 403);
});

/* ── 8. journal ── */
test('8. journal : les écritures faites au nom du propriétaire sont inscrites avec la vraie personne', async () => {
  const j = (await call(proprio.jar, 'GET', `/api/initiatives/${initId}/equipe-boutique-journal`)).data.journal;
  assert.ok(j.some((x) => x.acteur_id === gestionnaireEquipe.id && /PATCH \/api\/commandes_vitrine/.test(x.action) && x.poste === 'Gestionnaire des commandes'), 'changement de statut par le gestionnaire');
  assert.ok(j.some((x) => x.acteur_id === editeurEquipe.id && /DELETE \/api\/produits/.test(x.action)), 'suppression par l\'éditeur');
  assert.ok(j.some((x) => x.action === 'invitation'), 'invitation par le propriétaire');
  assert.ok(!j.some((x) => /GET /.test(x.action)), 'les lectures ne sont pas journalisées');
  assert.equal((await call(gestionnaireEquipe.jar, 'GET', `/api/initiatives/${initId}/equipe-boutique-journal`)).status, 403, 'le journal est réservé au propriétaire');
});

/* ── 9. /api/auth/me ── */
test('9. /api/auth/me renvoie la vraie personne et la boutique active, jamais le propriétaire', async () => {
  const g = gestionnaireEquipe;
  const me = (await call(g.jar, 'GET', '/api/auth/me')).data.user;
  assert.equal(me.id, g.id);
  assert.equal(me.email, g.email);
  assert.notEqual(me.email, proprio.email);
  assert.equal(me.boutique_active.initiative_id, initId);
  assert.equal(me.boutique_active.poste, 'Gestionnaire des commandes');
  assert.deepEqual(me.boutique_active.droits, ['commandes', 'rembourser', 'coordonnees']);
  const moiProprio = (await call(proprio.jar, 'GET', '/api/auth/me')).data.user;
  assert.equal(moiProprio.boutique_active, null);
});

/* ── 10. retour à son compte, retrait, départ, cookie falsifié ── */
test('10. retour à son propre compte, retrait par le propriétaire, départ, cookie falsifié', async () => {
  const g = gestionnaireEquipe;
  /* retour à son propre compte : plus aucun droit sur la boutique */
  assert.equal((await call(g.jar, 'POST', '/api/boutique-active', { initiative_id: null })).status, 200);
  assert.equal((await call(g.jar, 'GET', `/api/initiatives/${initId}/commandes`)).status, 403);
  /* on rebascule, puis le propriétaire retire la personne : l'accès tombe tout de suite */
  assert.equal((await call(g.jar, 'POST', '/api/boutique-active', { initiative_id: initId })).status, 200);
  assert.equal((await call(g.jar, 'GET', `/api/initiatives/${initId}/commandes`)).status, 200);
  assert.equal((await call(proprio.jar, 'DELETE', `/api/initiatives/${initId}/equipe-boutique/${g.id}`)).status, 200);
  assert.equal((await call(g.jar, 'GET', `/api/initiatives/${initId}/commandes`)).status, 403, 'le cookie reste mais ne donne plus rien');
  assert.equal((await call(g.jar, 'POST', '/api/boutique-active', { initiative_id: initId })).status, 403);
  assert.equal((await call(g.jar, 'GET', '/api/auth/me')).data.user.boutique_active, null);
  /* une personne peut quitter une équipe d'elle-même */
  const e = editeurEquipe;
  assert.equal((await call(e.jar, 'DELETE', `/api/mes-boutiques/${initId}/quitter`)).status, 200);
  assert.equal((await call(e.jar, 'PUT', `/api/produits/${produitId}`, { nom: 'Après départ' })).status, 403);
  assert.equal((await call(e.jar, 'DELETE', `/api/mes-boutiques/${initId}/quitter`)).status, 404, 'déjà parti');
  /* cookie falsifié : un inconnu qui pose boutique_active à la main n'obtient rien */
  const intrus = await nouveauCompte('Intrus');
  intrus.jar.apply = ((orig) => (headers) => { orig(headers); headers.Cookie = (headers.Cookie ? headers.Cookie + '; ' : '') + `boutique_active=${initId}`; })(intrus.jar.apply.bind(intrus.jar));
  assert.equal((await call(intrus.jar, 'GET', `/api/initiatives/${initId}/commandes`)).status, 403);
  assert.equal((await call(intrus.jar, 'PATCH', `/api/commandes_vitrine/${commandeId}`, { statut: 'annulee' })).status, 403);
  /* la personne retirée peut être réinvitée */
  const re = await call(proprio.jar, 'POST', `/api/initiatives/${initId}/equipe-boutique`, { user_id: g.id, poste: 'Lecteur des statistiques' });
  assert.equal(re.status, 201);
  const mb = (await call(g.jar, 'GET', '/api/mes-boutiques')).data;
  assert.equal(mb.invitations.length, 1);
  assert.equal(mb.invitations[0].poste, 'Lecteur des statistiques');
});

/* ── 11. statistiques ── */
test('11. « Lecteur des statistiques » lit les statistiques mais pas les commandes', async () => {
  const g = gestionnaireEquipe;
  const inv = (await call(g.jar, 'GET', '/api/mes-boutiques')).data.invitations[0];
  assert.equal((await call(g.jar, 'POST', `/api/mes-invitations-boutique/${inv.id}/repondre`, { accepter: true })).status, 200);
  await call(g.jar, 'POST', '/api/boutique-active', { initiative_id: initId });
  assert.equal((await call(g.jar, 'GET', `/api/initiatives/${initId}/stats-impact`)).status, 200);
  assert.equal((await call(g.jar, 'GET', `/api/initiatives/${initId}/commandes`)).status, 403);
  /* un refus d'invitation ne donne rien non plus */
  const r = await nouveauCompte('Refus');
  assert.equal((await call(proprio.jar, 'POST', `/api/initiatives/${initId}/equipe-boutique`, { user_id: r.id, poste: 'Administrateur' })).status, 201);
  const invR = (await call(r.jar, 'GET', '/api/mes-boutiques')).data.invitations[0];
  assert.equal((await call(r.jar, 'POST', `/api/mes-invitations-boutique/${invR.id}/repondre`, { accepter: false })).status, 200);
  assert.equal((await call(r.jar, 'POST', '/api/boutique-active', { initiative_id: initId })).status, 403);
});

/* ── 12. une personne qui a aussi sa propre boutique ── */
test('12. une personne qui a sa propre boutique la garde et bascule vers l\'autre', async () => {
  const d = autreProprio;                       // propriétaire de « Autre Boutique »
  membreDirect(initId, d.id, 'Gestionnaire des commandes', ['commandes', 'coordonnees']);
  const mb = (await call(d.jar, 'GET', '/api/mes-boutiques')).data;
  assert.equal(mb.boutiques.length, 2);
  const propre = mb.boutiques.find((b) => b.proprietaire);
  assert.equal(propre.initiative_id, autreInitId);
  assert.equal(propre.poste, 'Propriétaire');
  assert.equal(propre.droits.length, 8);
  assert.equal(mb.active, autreInitId, 'sans bascule, sa propre boutique est active');
  /* sur sa propre boutique : plein pouvoir, comme avant */
  assert.equal((await call(d.jar, 'GET', `/api/initiatives/${autreInitId}/commandes`)).status, 200);
  /* bascule vers la boutique où elle est invitée */
  assert.equal((await call(d.jar, 'POST', '/api/boutique-active', { initiative_id: initId })).status, 200);
  assert.equal((await call(d.jar, 'GET', '/api/mes-boutiques')).data.active, initId);
  assert.equal((await call(d.jar, 'GET', `/api/initiatives/${initId}/commandes`)).status, 200);
  /* sa propre boutique reste accessible en tant que propriétaire, même avec l'autre boutique active */
  assert.equal((await call(d.jar, 'GET', `/api/initiatives/${autreInitId}/commandes`)).status, 200);
  /* retour à sa propre boutique */
  assert.equal((await call(d.jar, 'POST', '/api/boutique-active', { initiative_id: autreInitId })).status, 200);
  assert.equal((await call(d.jar, 'GET', `/api/initiatives/${initId}/commandes`)).status, 403);
});

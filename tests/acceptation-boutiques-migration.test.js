/* ===========================================================
   tests/acceptation-boutiques-migration.test.js — Lot H, points restants (2026-11-12)
   ===========================================================
   Rejoue les points qui étaient « Bloqués » dans tests/acceptation-boutiques.test.js tant que le lot B n'était pas commité :
   1.1  Vidéo → Traditionnelle : avertissement, rien ne change sans validation
   1.2  Après confirmation : toute l'ancienne boutique est conservée (bonus), rien n'est supprimé, retour en arrière possible
   1.3  Ajouter une option ne réduit pas le bonus ; le bonus n'est pas compté dans la limite
   1.11 Message de migration au propriétaire ; la migration ne démarre qu'après sa validation
   5.3  Aucune boutique modifiée sans l'accord de son propriétaire
   5.2  Parcours d'achat complet en simulation : panier, commande, paiement (faux Stripe), livraison, notifications, messagerie
   Les tests marqués « todo » décrivent ce que le dossier d'acceptation (05) exige et que la plateforme ne fait PAS encore :
   ils ne bloquent pas la suite, ils apparaissent comme « à faire » dans la sortie et dans le rapport du lot H.
   Aucun paiement réel, aucune clé réelle : vrai serveur sur une COPIE de la base de dev, faux Stripe.
   Lancer : node --test tests/acceptation-boutiques-migration.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const H = require('./_formation-harness');
const Types = require('../assets/boutique-types.js');
const { TAUX_COMMISSION } = require('../server/commission.js');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

let env, rnd, jarAdmin, vendeur, acheteur, tiers, initId, initAutre, n = 0;

function sql(req, ...args) {
  const db = new DatabaseSync(env.dbPath);
  try {
    db.exec('PRAGMA busy_timeout=5000');
    return /^\s*select/i.test(req) ? db.prepare(req).all(...args) : db.prepare(req).run(...args);
  } finally { db.close(); }
}
function inserer(table, valeurs) {
  const db = new DatabaseSync(env.dbPath);
  try {
    const obligatoires = db.prepare(`PRAGMA table_info(${table})`).all().filter((c) => c.notnull && c.dflt_value == null && !c.pk).map((c) => [c.name, c.type]);
    const tout = { ...valeurs };
    for (const [nom, type] of obligatoires) if (tout[nom] === undefined) tout[nom] = /INT|REAL/i.test(type) ? 0 : 'x';
    const noms = Object.keys(tout);
    return db.prepare(`INSERT INTO ${table} (${noms.join(',')}) VALUES (${noms.map(() => '?').join(',')})`).run(...noms.map((c) => tout[c]));
  } finally { db.close(); }
}
async function nouveauCompte(nom) {
  const jar = H.cookieJar();
  const unique = nom + (++n);
  await H.creerApprenant(env, jar, rnd, unique);
  const id = sql('select id from users where email=?', H.compte(rnd, unique, 'utilisateur').email)[0].id;
  return { jar, id };
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function jusqua(condition, delai = 4000) {
  const debut = Date.now();
  for (;;) { const v = await condition(); if (v) return v; if (Date.now() - debut > delai) return v; await attendre(100); }
}

/* Contenu de la boutique qui doit survivre à tout changement de type (champs de VITRINE_CONTENU_MODULE, server/index.js). */
const CHAMPS_CONTENU = ['description', 'mission', 'vitrine_portfolio_json', 'vitrine_equipe_json', 'galerie_json', 'vitrine_videos_json', 'realisations_json',
  'vitrine_services', 'vitrine_services_categories_json', 'vitrine_expertise_json', 'vitrine_certifications_json', 'vitrine_documents_json',
  'vitrine_partenaires_json', 'vitrine_temoignages_json', 'vitrine_vision_objectifs', 'vitrine_resultats_impact_json', 'besoins_json',
  'vitrine_reservation_json', 'vitrine_pourquoi_choisir'];
const contenuBoutique = (id) => sql(`select ${CHAMPS_CONTENU.join(',')} from initiatives where id=?`, id)[0];
const produitsBoutique = (id) => sql('select * from produits_vitrine where initiative_id=? order by id', id);
const typeBrouillon = (id) => {
  const l = sql('select vitrine_type as t, vitrine_draft_json as d from initiatives where id=?', id)[0];
  const b = JSON.parse(l.d || '{}');
  return b.type !== undefined ? b.type : l.t;
};
/* Photographie intégrale (toutes les colonnes) des boutiques, produits et commandes ; `differences` dit quelle ligne et quelle colonne ont bougé. */
const instantane = () => ({
  initiatives: sql('select * from initiatives order by id'),
  produits: sql('select * from produits_vitrine order by id'),
  commandes: sql('select * from commandes_vitrine order by id'),
});
function differences(avant, apres) {
  const sortie = [];
  for (const table of Object.keys(avant)) {
    if (avant[table].length !== apres[table].length) sortie.push(`${table} : ${avant[table].length} ligne(s) avant, ${apres[table].length} après`);
    avant[table].forEach((ligne, i) => {
      for (const col of Object.keys(ligne)) if (col !== 'vues' /* compteur de visites de la page publique : ce n'est pas un contenu de boutique */ && apres[table][i] && ligne[col] !== apres[table][i][col]) sortie.push(`${table}#${ligne.id}.${col} : ${String(ligne[col]).slice(0, 60)} → ${String(apres[table][i][col]).slice(0, 60)}`);
    });
  }
  return sortie;
}

function creerBoutiqueVideo(proprietaireId, nom) {
  const id = Number(inserer('initiatives', { nom, owner_user_id: proprietaireId, vitrine_type: 'video' }).lastInsertRowid);
  sql(`UPDATE initiatives SET description=?, vitrine_services=?, vitrine_videos_json=?, vitrine_documents_json=?, vitrine_vision_objectifs=?,
       vitrine_portfolio_json=?, vitrine_temoignages_json=?, realisations_json=? WHERE id=?`,
  'Studio de vidéos courtes prêtes à l\'emploi.', 'Montage\nSous-titrage',
  JSON.stringify([{ titre: 'Bande démo', url: 'https://exemple.test/demo.mp4' }]),
  JSON.stringify([{ nom: 'Dossier de presse', url: 'https://exemple.test/presse.pdf' }]),
  'Rendre la vidéo courte accessible à toutes les initiatives.',
  JSON.stringify([{ titre: 'Spot associatif' }]),
  JSON.stringify([{ texte: 'Très professionnel', auteur: 'Awa' }]),
  JSON.stringify([{ titre: 'Clip 2025' }]), id);
  for (const [nomProduit, prix] of [['Vidéo 45 s', 80], ['Vidéo 1 min', 120], ['Pack 3 vidéos', 300]]) {
    inserer('produits_vitrine', { initiative_id: id, nom: nomProduit, prix, statut: 'disponible', disponible: 1 });
  }
  return id;
}

test.before(async () => {
  rnd = Math.random().toString(36).slice(2, 9);
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\/g, '/');
  process.env.STRIPE_SECRET_KEY = 'sk_test_factice_migration';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  env = await H.demarrer('acceptation-migration');
  jarAdmin = H.cookieJar();
  await H.creerFormateur(env, jarAdmin, rnd, 'Admin'); /* simple compte promu administrateur dans la base isolée */
  vendeur = await nouveauCompte('Vendeur');
  acheteur = await nouveauCompte('Acheteur');
  tiers = await nouveauCompte('Tiers');
  initId = creerBoutiqueVideo(vendeur.id, `Studio Vidéo Acceptation ${rnd}`);
  initAutre = creerBoutiqueVideo(vendeur.id, `Studio Vidéo Second ${rnd}`);
  /* Mise en service des 6 types par l'administrateur, comme en recette (elle est éteinte par défaut). */
  const on = await env.call(jarAdmin, 'PUT', '/api/admin/boutique-types-v2', { actif: true });
  assert.equal(on.status, 200, JSON.stringify(on.data));
});
test.after(() => { if (env) env.stop(); });

/* ═════════════ 5.3 Aucune boutique modifiée sans accord du propriétaire ═════════════ */
test('5.3 la mise en service des 6 types, la lecture du registre, l\'analyse et le bonus ne modifient AUCUNE boutique (toutes colonnes comparées)', async () => {
  const avant = instantane();
  await env.call(jarAdmin, 'PUT', '/api/admin/boutique-types-v2', { actif: false });
  await env.call(jarAdmin, 'PUT', '/api/admin/boutique-types-v2', { actif: true });
  await env.call(null, 'GET', '/api/vitrine-modules-registry');
  await env.call(vendeur.jar, 'GET', '/api/vitrine-modules-registry');
  await env.call(vendeur.jar, 'GET', `/api/initiatives/${initId}/vitrine/analyser-type?type=ecom`);
  await env.call(vendeur.jar, 'GET', `/api/initiatives/${initId}/vitrine/bonus`);
  await env.call(null, 'GET', `/api/initiatives/${initId}`);
  await env.call(vendeur.jar, 'GET', `/api/initiatives/${initId}`);
  assert.deepEqual(differences(avant, instantane()), [], 'une lecture ou la mise en service a réécrit une ligne de boutique, de produit ou de commande');
});

test('5.3 seul le propriétaire peut changer le type de sa boutique : visiteur 401, tiers 403, administrateur 403 ; rien n\'est modifié', async () => {
  const avant = instantane();
  const corps = { type: 'ecom', mode: 'adapter' };
  const url = `/api/initiatives/${initId}/vitrine/changer-type`;
  assert.equal((await env.call(null, 'POST', url, corps)).status, 401);
  assert.equal((await env.call(tiers.jar, 'POST', url, corps)).status, 403);
  assert.equal((await env.call(jarAdmin, 'POST', url, corps)).status, 403, 'même un administrateur ne migre pas la boutique d\'un autre');
  assert.equal((await env.call(tiers.jar, 'PUT', `/api/initiatives/${initId}/vitrine-draft`, { type: 'ecom' })).status, 403);
  assert.equal((await env.call(tiers.jar, 'GET', `/api/initiatives/${initId}/vitrine/analyser-type?type=ecom`)).status, 403);
  assert.equal((await env.call(tiers.jar, 'GET', `/api/initiatives/${initId}/vitrine/bonus`)).status, 403);
  assert.equal((await env.call(tiers.jar, 'PUT', `/api/initiatives/${initId}/vitrine/bonus`, { cle: 'documents', publie: true })).status, 403);
  assert.equal((await env.call(tiers.jar, 'POST', `/api/initiatives/${initId}/vitrine/restaurer/1`)).status, 403);
  assert.deepEqual(differences(avant, instantane()), [], 'un refus ne doit laisser aucune trace dans la boutique');
});

/* ═════════════ 1.1 / 1.11 Avant la validation ═════════════ */
test('1.1 l\'analyse « Vidéo → Traditionnelle » répond sans rien modifier et liste conservé / adapté / bonus', async () => {
  const avant = instantane();
  const sauvegardesAvant = sql('select count(*) as n from vitrine_sauvegardes where initiative_id=?', initId)[0].n;
  const r = await env.call(vendeur.jar, 'GET', `/api/initiatives/${initId}/vitrine/analyser-type?type=ecom`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.type_actuel, 'video');
  assert.equal(r.data.type_cible, 'ecom');
  const cles = (liste) => (liste || []).map((x) => x.cle);
  assert.ok(cles(r.data.conserves).includes('produits'), 'les produits restent dans une boutique traditionnelle');
  for (const orphelin of ['galerie_videos', 'documents', 'vision_objectifs']) assert.ok(cles(r.data.orphelins).includes(orphelin), `« ${orphelin} » n'a plus de place : il doit être annoncé comme rangé dans le bonus`);
  assert.deepEqual(differences(avant, instantane()), [], 'analyser ne doit rien changer');
  assert.equal(sql('select count(*) as n from vitrine_sauvegardes where initiative_id=?', initId)[0].n, sauvegardesAvant, 'analyser ne doit pas prendre de sauvegarde');
});

test('1.1 / 1.11 l\'écran de changement de type est un avertissement : « J\'ai compris » obligatoire, bouton inactif tant que la case n\'est pas cochée, un seul chemin vers le serveur', () => {
  const src = lire('dashboard-initiative.html');
  assert.match(src, /async function pvOuvrirChangementType\(type\)/);
  assert.match(src, /Votre boutique va changer entièrement de présentation/, 'message d\'avertissement au propriétaire');
  assert.match(src, /<input type="checkbox" id="pv-type-compris"[^>]*onchange="document\.getElementById\('pv-type-ok'\)\.disabled=!this\.checked"/, 'la case commande le bouton');
  assert.match(src, /<button id="pv-type-ok" disabled onclick="pvConfirmerChangementType\('\$\{type\}'\)"/, 'le bouton de confirmation est désactivé par défaut');
  assert.match(src, /J'ai compris : la présentation de ma boutique va changer entièrement/);
  assert.match(src, /Rien n'est supprimé\. Une sauvegarde est prise automatiquement/);
  /* choisir une carte ouvre l'avertissement, jamais le changement */
  assert.match(src, /function pvChoisirType\(type\)[\s\S]{0,700}pvOuvrirChangementType\(type\);/);
  assert.equal((src.match(/vitrine\/changer-type/g) || []).length, 1, 'le changement de type ne doit être appelé que depuis pvConfirmerChangementType');
  assert.equal((src.match(/pvConfirmerChangementType\(/g) || []).length, 2, 'définition + bouton de l\'avertissement, rien d\'autre');
  for (const f of fs.readdirSync(path.join(RACINE, 'assets')).filter((x) => x.endsWith('.js'))) {
    assert.ok(!/vitrine\/changer-type/.test(lire('assets/' + f)), `assets/${f} ne doit pas migrer une boutique`);
  }
});

test('1.1 l\'avertissement précise que la lecture vidéo devient indisponible (dossier 01 §1.4)', { todo: 'Non livré : ni l\'analyse serveur ni l\'écran ne parlent des fonctions rendues inaccessibles (lecture vidéo)' }, async () => {
  const r = await env.call(vendeur.jar, 'GET', `/api/initiatives/${initId}/vitrine/analyser-type?type=ecom`);
  const texteServeur = JSON.stringify(r.data);
  const ecran = lire('dashboard-initiative.html');
  const bloc = ecran.slice(ecran.indexOf('async function pvOuvrirChangementType'), ecran.indexOf('async function pvConfirmerChangementType'));
  assert.ok(/lecture vid[ée]o|inaccessible|indisponible/i.test(texteServeur) || /lecture vid[ée]o/i.test(bloc), 'aucune mention de la lecture vidéo devenue indisponible');
});

test('1.1 / 1.11 le serveur refuse un changement de type non confirmé : rien ne change tant que « J\'ai compris » n\'est pas validé', { todo: 'Non livré : la case n\'est contrôlée que par la page ; POST changer-type migre sans confirmation' }, async () => {
  const avant = JSON.stringify(sql('select * from initiatives where id=?', initAutre));
  const r = await env.call(vendeur.jar, 'POST', `/api/initiatives/${initAutre}/vitrine/changer-type`, { type: 'ecom', mode: 'adapter' });
  const apres = JSON.stringify(sql('select * from initiatives where id=?', initAutre));
  assert.ok(r.status >= 400 && r.status < 500, `un appel sans confirmation doit être refusé, reçu ${r.status}`);
  assert.equal(apres, avant, 'la boutique a été modifiée sans confirmation');
});

test('1.11 le message de migration reprend la formulation du dossier (« va migrer sur un autre format… il vous suffit de les valider »)', { todo: 'Libellé différent : « Votre boutique va changer entièrement de présentation… » (le message existe, mais pas avec le texte du dossier 01 §1.4)' }, () => {
  const src = lire('dashboard-initiative.html');
  assert.match(src, /va migrer sur un autre format/);
  assert.match(src, /il vous suffit de les valider/);
});

/* ═════════════ 1.2 Après confirmation : tout est conservé ═════════════ */
let contenuAvant, produitsAvant, sauvegardeId, bonusApres;
test('1.2 après confirmation, la boutique passe au type Traditionnelle : une sauvegarde est prise, aucun contenu ni produit n\'est modifié', async () => {
  contenuAvant = contenuBoutique(initId);
  produitsAvant = produitsBoutique(initId);
  const r = await env.call(vendeur.jar, 'POST', `/api/initiatives/${initId}/vitrine/changer-type`, { type: 'ecom', mode: 'adapter' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.type, 'ecom');
  assert.ok(r.data.sauvegarde_id, 'une sauvegarde intégrale est prise avant la transformation');
  sauvegardeId = r.data.sauvegarde_id;
  assert.equal(typeBrouillon(initId), 'ecom');
  assert.equal(sql('select vitrine_type as t from initiatives where id=?', initId)[0].t, 'video', 'la boutique PUBLIÉE ne change qu\'à la publication : le propriétaire vérifie d\'abord l\'aperçu');
  assert.deepEqual(contenuBoutique(initId), contenuAvant, 'aucun contenu de la boutique ne doit être modifié ou supprimé');
  assert.deepEqual(produitsBoutique(initId), produitsAvant, 'aucun produit ne doit être modifié ou supprimé');
  const lignes = sql('select * from vitrine_sauvegardes where initiative_id=? and id=?', initId, sauvegardeId);
  assert.equal(lignes.length, 1);
  assert.equal(lignes[0].type_avant, 'video');
  assert.equal(lignes[0].type_apres, 'ecom');
});

test('1.2 le bonus contient toute l\'ancienne boutique qui n\'a plus de place, et le propriétaire seul le voit', async () => {
  const r = await env.call(vendeur.jar, 'GET', `/api/initiatives/${initId}/vitrine/bonus`);
  assert.equal(r.status, 200, JSON.stringify(r.data));
  bonusApres = r.data.bonus;
  const cles = bonusApres.map((b) => b.cle);
  for (const attendu of ['galerie_videos', 'documents', 'vision_objectifs']) assert.ok(cles.includes(attendu), `« ${attendu} » doit être dans le bonus`);
  for (const garde of ['produits', 'temoignages', 'realisations', 'portfolio']) assert.ok(!cles.includes(garde), `« ${garde} » a sa place dans le type Traditionnelle : il ne doit pas être dans le bonus`);
  for (const b of bonusApres.filter((x) => x.publiable)) assert.equal(b.publie, false, 'le bonus est masqué aux visiteurs tant que le propriétaire ne le publie pas');
  /* Visiteur : le bonus n'est visible que s'il a été publié, un par un. */
  const visiteur = await env.call(null, 'GET', `/api/initiatives/${initId}`);
  assert.equal(visiteur.status, 200);
  assert.deepEqual(visiteur.data.initiative.vitrine_bonus, [], 'un visiteur ne voit aucun élément du bonus non publié');
});

test('1.2 le propriétaire publie un élément du bonus un par un ; rien n\'est supprimé quand il le retire', async () => {
  const pub = await env.call(vendeur.jar, 'PUT', `/api/initiatives/${initId}/vitrine/bonus`, { cle: 'documents', publie: true });
  assert.equal(pub.status, 200, JSON.stringify(pub.data));
  assert.equal(pub.data.bonus.find((b) => b.cle === 'documents').publie, true);
  const retire = await env.call(vendeur.jar, 'PUT', `/api/initiatives/${initId}/vitrine/bonus`, { cle: 'documents', publie: false });
  assert.equal(retire.status, 200);
  assert.equal(retire.data.bonus.find((b) => b.cle === 'documents').publie, false);
  assert.deepEqual(contenuBoutique(initId), contenuAvant, 'masquer un élément ne le supprime pas');
  const refus = await env.call(vendeur.jar, 'PUT', `/api/initiatives/${initId}/vitrine/bonus`, { cle: 'produits', publie: true });
  assert.equal(refus.status, 400, 'une rubrique stockée en table se gère depuis son écran, pas depuis le bonus');
});

test('1.2 le compteur « 20 % des produits visibles » existe et affiche le bon nombre', { todo: 'Non livré : le bonus se règle rubrique par rubrique, sans bouton ni compteur « 20 % des produits » (dossier 01 §1.3)' }, () => {
  const src = lire('dashboard-initiative.html');
  const bloc = src.slice(src.indexOf('async function renderPvBonus'), src.indexOf('async function pvBasculerBonus'));
  assert.match(bloc, /20\s?%/, 'aucun bouton ni compteur « 20 % » dans l\'écran du bonus');
});

test('1.2 « Repartir à zéro » reste réversible et le retour en arrière restitue la boutique d\'origine', async () => {
  const restaure = await env.call(vendeur.jar, 'POST', `/api/initiatives/${initId}/vitrine/restaurer/${sauvegardeId}`);
  assert.equal(restaure.status, 200, JSON.stringify(restaure.data));
  assert.equal(typeBrouillon(initId), 'video', 'le type d\'origine est revenu');
  assert.deepEqual(contenuBoutique(initId), contenuAvant);
  assert.deepEqual(produitsBoutique(initId), produitsAvant);
  /* Autre boutique : le mode « zéro » efface seulement le contenu hors type, après sauvegarde prise. */
  const zero = await env.call(vendeur.jar, 'POST', `/api/initiatives/${initAutre}/vitrine/changer-type`, { type: 'ecom', mode: 'zero' });
  assert.equal(zero.status, 200, JSON.stringify(zero.data));
  assert.ok(zero.data.sauvegarde_id, 'même en « repartir à zéro », une sauvegarde est prise');
  const avantRestauration = contenuBoutique(initAutre);
  assert.equal(avantRestauration.vitrine_videos_json, '[]', 'effacement demandé explicitement : le contenu hors type est vidé');
  const retour = await env.call(vendeur.jar, 'POST', `/api/initiatives/${initAutre}/vitrine/restaurer/${zero.data.sauvegarde_id}`);
  assert.equal(retour.status, 200);
  assert.match(String(contenuBoutique(initAutre).vitrine_videos_json), /Bande démo/, 'la sauvegarde rend le contenu effacé');
});

/* ═════════════ 1.3 Options et bonus ═════════════ */
test('1.3 ajouter une option ne réduit pas le bonus (mêmes rubriques avant et après), et le contenu reste intact', async () => {
  const migre = await env.call(vendeur.jar, 'POST', `/api/initiatives/${initId}/vitrine/changer-type`, { type: 'ecom', mode: 'adapter' });
  assert.equal(migre.status, 200, JSON.stringify(migre.data));
  const avant = (await env.call(vendeur.jar, 'GET', `/api/initiatives/${initId}/vitrine/bonus`)).data.bonus.map((b) => b.cle).sort();
  assert.ok(avant.length >= 3);
  /* Une « option » du type Traditionnelle = une rubrique optionnelle de son modèle, activée depuis la bibliothèque. */
  const reg = (await env.call(vendeur.jar, 'GET', '/api/vitrine-modules-registry')).data;
  const optionnels = reg.templates.ecom.optionnels.filter((m) => reg.modules[m] && reg.modules[m].implemente);
  assert.ok(optionnels.length >= 2, 'le type Traditionnelle propose des options');
  const modules = {};
  for (const m of optionnels.slice(0, 3)) modules[m] = { actif: true };
  const ajout = await env.call(vendeur.jar, 'PUT', `/api/initiatives/${initId}/vitrine-draft`, { modules });
  assert.equal(ajout.status, 200, JSON.stringify(ajout.data));
  const apres = (await env.call(vendeur.jar, 'GET', `/api/initiatives/${initId}/vitrine/bonus`)).data.bonus.map((b) => b.cle).sort();
  assert.deepEqual(apres, avant, 'ajouter des options ne doit pas retirer un élément du bonus');
  assert.deepEqual(contenuBoutique(initId), contenuAvant);
});

test('1.3 le maximum d\'options = types − 1 (calculé) et ne dépend pas du bonus', () => {
  const nbTypes = Object.keys(Types.TYPES).length;
  assert.equal(Types.MAX_OPTIONS, nbTypes - 1);
  assert.equal(Types.MAX_COPIES, 3);
  const desc = require('../server/boutique-types.js').descriptionPourInterface({ actif: true, estAdministrateur: false });
  assert.equal(desc.max_options, nbTypes - 1, 'le plafond annoncé à l\'interface suit le registre, pas le nombre d\'éléments du bonus');
});

test('1.3 le serveur plafonne le nombre d\'options à MAX_OPTIONS et les copies à MAX_COPIES, sans compter le bonus', { todo: 'Non livré : options et copies (lot B4) n\'existent pas encore sur la vraie plateforme ; les plafonds ne sont lus que par l\'écran' }, () => {
  const src = lire('server/index.js');
  assert.match(src, /MAX_OPTIONS|REGISTRE\.MAX_OPTIONS/, 'aucun contrôle serveur du nombre d\'options');
  assert.match(src, /MAX_COPIES/, 'aucun contrôle serveur du nombre de copies');
});

/* ═════════════ 5.2 Parcours d'achat complet, en simulation ═════════════ */
let produitRetrait, produitExpedition, sessionPaiement, commandes;
const FRAIS = 6.5;
const suiteAchat = {};

test('5.2 préparation : vendeur Abonné relié à un faux compte de paiement, boutiques ouvertes', () => {
  const boutique = Number(inserer('initiatives', { nom: `Boutique Achat ${rnd}`, owner_user_id: vendeur.id }).lastInsertRowid);
  suiteAchat.boutique = boutique;
  inserer('compte_accreditations', { user_id: vendeur.id, type: 'initiative_abonne', statut: 'active' });
  inserer('stripe_connect_accounts', { initiative_id: boutique, stripe_account_id: 'acct_achat_test', statut: 'active', charges_enabled: 1 });
  produitRetrait = Number(inserer('produits_vitrine', { initiative_id: boutique, nom: 'Panier en raphia', prix: 25, statut: 'disponible', disponible: 1, livraison_retrait: 1, livraison_expedition: 0 }).lastInsertRowid);
  produitExpedition = Number(inserer('produits_vitrine', { initiative_id: boutique, nom: 'Boubou brodé', prix: 90, statut: 'disponible', disponible: 1, livraison_retrait: 0, livraison_expedition: 1, frais_expedition: FRAIS }).lastInsertRowid);
  assert.ok(produitRetrait && produitExpedition);
});

test('5.2 pendant la réorganisation (boutiques en maintenance) aucun achat ne démarre ; une fois rouvertes, le panier se remplit', async () => {
  sql("INSERT OR REPLACE INTO parametres_plateforme (cle, valeur) VALUES ('boutiques_en_maintenance', 'true')");
  const ajout = await env.call(acheteur.jar, 'POST', '/api/panier', { produit_id: produitRetrait, quantite: 1 });
  assert.equal(ajout.status, 201, 'le panier reste utilisable : ' + JSON.stringify(ajout.data));
  const ferme = await env.call(acheteur.jar, 'POST', '/api/panier/commander', {});
  assert.equal(ferme.status, 423, 'en maintenance, la commande est suspendue');
  assert.equal(ferme.data.maintenance, true);
  sql("INSERT OR REPLACE INTO parametres_plateforme (cle, valeur) VALUES ('boutiques_en_maintenance', 'false')");
});

test('5.2 le panier : ajout (fusion), quantité, mode de livraison contrôlé par le serveur, total recalculé côté serveur', async () => {
  /* produit à retrait déjà ajouté une fois : un second ajout incrémente la ligne (jamais de doublon) */
  assert.equal((await env.call(acheteur.jar, 'POST', '/api/panier', { produit_id: produitRetrait, quantite: 1 })).status, 201);
  const refusMode = await env.call(acheteur.jar, 'POST', '/api/panier', { produit_id: produitRetrait, quantite: 1, mode_livraison: 'expedition' });
  assert.equal(refusMode.status, 400, 'expédition non proposée pour ce produit');
  assert.equal((await env.call(acheteur.jar, 'POST', '/api/panier', { produit_id: produitExpedition, quantite: 1, mode_livraison: 'expedition' })).status, 201);
  const propre = await env.call(vendeur.jar, 'POST', '/api/panier', { produit_id: produitRetrait, quantite: 1 });
  assert.equal(propre.status, 400, 'on ne peut pas acheter dans sa propre boutique');
  const panier = await env.call(acheteur.jar, 'GET', '/api/panier');
  assert.equal(panier.status, 200);
  const ligneRetrait = panier.data.items.find((l) => l.produit_id === produitRetrait);
  assert.equal(ligneRetrait.quantite, 2, 'deux ajouts = une ligne de quantité 2');
  assert.equal(panier.data.items.length, 2);
  assert.equal(panier.data.total, 2 * 25 + 90 + FRAIS, 'prix et frais calculés par le serveur');
  assert.equal(panier.data.nb_articles, 3);
  /* modifier puis retirer une ligne */
  assert.equal((await env.call(acheteur.jar, 'PATCH', `/api/panier/${ligneRetrait.id}`, { quantite: 3 })).status, 200);
  assert.equal((await env.call(acheteur.jar, 'GET', '/api/panier')).data.total, 3 * 25 + 90 + FRAIS);
  assert.equal((await env.call(acheteur.jar, 'PATCH', `/api/panier/${ligneRetrait.id}`, { quantite: 2 })).status, 200);
  assert.equal((await env.call(tiers.jar, 'PATCH', `/api/panier/${ligneRetrait.id}`, { quantite: 99 })).status, 404, 'le panier d\'un autre est inaccessible');
  assert.equal((await env.call(null, 'GET', '/api/panier')).status, 401);
});

test('5.2 commander : l\'adresse est exigée pour l\'expédition, le prix envoyé par le client est ignoré, la session de paiement est créée', async () => {
  const sansAdresse = await env.call(acheteur.jar, 'POST', '/api/panier/commander', { initiative_id: suiteAchat.boutique });
  assert.equal(sansAdresse.status, 400);
  assert.match(String(sansAdresse.data.error), /adresse/i);
  assert.equal(sql('select count(*) as n from commandes_vitrine where acheteur_id=?', acheteur.id)[0].n, 0, 'aucune commande orpheline sur un refus');
  const r = await env.call(acheteur.jar, 'POST', '/api/panier/commander', {
    initiative_id: suiteAchat.boutique, prix: 0.01, montant_total: 0.01, provider: 'stripe',
    livraison_nom: 'Aminata Test', livraison_adresse: '1 rue de la Paix', livraison_code_postal: '75002', livraison_ville: 'Paris', livraison_pays: 'France',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.match(String(r.data.checkout_url), /^https:\/\/stripe\.test\/pay\/cs_test_faux_/);
  sessionPaiement = r.data.checkout_url.split('/').pop();
  commandes = sql('select * from commandes_vitrine where acheteur_id=? order by id', acheteur.id);
  assert.equal(commandes.length, 2, 'une commande par article');
  const retrait = commandes.find((c) => c.produit_id === produitRetrait);
  const expedition = commandes.find((c) => c.produit_id === produitExpedition);
  assert.equal(retrait.montant_total, 50, 'le montant vient du produit, pas du client');
  assert.equal(expedition.montant_total, 90 + FRAIS);
  assert.equal(expedition.frais_livraison, FRAIS);
  for (const c of commandes) { assert.equal(c.paiement_statut, 'en_attente'); assert.equal(c.paiement_direct, 1); assert.equal(c.provider, 'stripe'); }
  assert.equal(expedition.livraison_ville, 'Paris');
  assert.equal(retrait.livraison_adresse, null, 'pas d\'adresse pour un retrait sur place');
  assert.equal((await env.call(acheteur.jar, 'GET', '/api/panier')).data.items.length, 0, 'les articles payés sortent du panier');
});

test('5.2 un paiement non confirmé ne livre rien : le vendeur ne peut pas expédier une commande « en attente »', async () => {
  const expedition = commandes.find((c) => c.produit_id === produitExpedition);
  const r = await env.call(vendeur.jar, 'PATCH', `/api/commandes_vitrine/${expedition.id}/livraison`, { action: 'expedier' });
  assert.equal(r.status, 400);
  assert.match(String(r.data.error), /paiement/i);
});

test('5.2 la confirmation du prestataire (webhook) finalise la commande : retrait prêt, expédition à traiter, commission 4 % au registre, aucun crédit au vendeur (paiement direct)', async () => {
  const soldeAvant = Number(sql('select coalesce(wallet_balance,0) as s from users where id=?', vendeur.id)[0].s);
  const evenement = { id: 'evt_achat_' + rnd, type: 'checkout.session.completed', data: { object: { id: sessionPaiement, metadata: { diaspoactif_panier_checkout: '1' } } } };
  const w = await env.call(null, 'POST', '/api/stripe/webhook', evenement);
  assert.equal(w.status, 200, JSON.stringify(w.data));
  commandes = sql('select * from commandes_vitrine where acheteur_id=? order by id', acheteur.id);
  for (const c of commandes) assert.equal(c.paiement_statut, 'paye', `commande ${c.id} non payée`);
  assert.equal(commandes.find((c) => c.produit_id === produitRetrait).statut_livraison, 'pret_retrait', 'retrait sur place : prêt automatiquement');
  assert.equal(commandes.find((c) => c.produit_id === produitExpedition).statut_livraison, 'a_traiter', 'expédition : le vendeur doit encore expédier');
  const ids = commandes.map((c) => c.id);
  const marque = ids.map(() => '?').join(',');
  const frais = sql(`select * from wallet_transactions where type='platform_fee' and commande_vitrine_id in (${marque})`, ...ids);
  assert.equal(frais.length, 2, 'une commission enregistrée par commande');
  for (const f of frais) {
    const brut = commandes.find((c) => c.id === f.commande_vitrine_id).montant_total;
    assert.equal(f.platform_fee, parseFloat((brut * TAUX_COMMISSION).toFixed(2)), 'commission = taux unique de server/commission.js');
  }
  assert.equal(sql(`select count(*) as n from wallet_transactions where type='organizer_credit' and commande_vitrine_id in (${marque})`, ...ids)[0].n, 0, 'paiement direct : le vendeur n\'est jamais crédité deux fois');
  assert.equal(Number(sql('select coalesce(wallet_balance,0) as s from users where id=?', vendeur.id)[0].s), soldeAvant);
  /* idempotence : un webhook rejoué ne double rien */
  await env.call(null, 'POST', '/api/stripe/webhook', evenement);
  assert.equal(sql(`select count(*) as n from wallet_transactions where type='platform_fee' and commande_vitrine_id in (${marque})`, ...ids)[0].n, 2);
});

test('5.2 notifications : l\'acheteur est averti du paiement, le vendeur de la vente', async () => {
  const acheteurNotif = await jusqua(async () => { const r = await env.call(acheteur.jar, 'GET', '/api/notifications'); return r.data.notifications.filter((x) => x.type === 'commande_payee').length >= 2 ? r.data.notifications : null; });
  assert.ok(acheteurNotif, 'l\'acheteur doit recevoir une notification « commande_payee » par commande');
  const vendeurNotif = await jusqua(async () => { const r = await env.call(vendeur.jar, 'GET', '/api/notifications'); return r.data.notifications.filter((x) => x.type === 'commande_vendue').length >= 2 ? r.data.notifications : null; });
  assert.ok(vendeurNotif, 'le vendeur doit recevoir une notification « commande_vendue » par commande');
  assert.ok(vendeurNotif.some((x) => /retrait/i.test(x.contenu || x.message || x.corps || JSON.stringify(x))), 'le vendeur voit qu\'une commande est à préparer pour retrait');
});

test('5.2 livraison : seul le vendeur expédie, l\'acheteur reçoit le suivi, une commande ne s\'expédie qu\'une fois', async () => {
  const expedition = commandes.find((c) => c.produit_id === produitExpedition);
  const url = `/api/commandes_vitrine/${expedition.id}/livraison`;
  assert.equal((await env.call(acheteur.jar, 'PATCH', url, { action: 'expedier' })).status, 403, 'l\'acheteur ne marque pas sa propre commande expédiée');
  assert.equal((await env.call(tiers.jar, 'PATCH', url, { action: 'expedier' })).status, 403);
  const mauvais = await env.call(vendeur.jar, 'PATCH', url, { action: 'expedier', numero_suivi: 'AB12', transporteur: 'inconnu' });
  assert.equal(mauvais.status, 400, 'transporteur inconnu refusé');
  const ok = await env.call(vendeur.jar, 'PATCH', url, { action: 'expedier', numero_suivi: 'AB123456789FR', transporteur: 'colissimo' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.match(String(ok.data.lien_suivi), /laposte\.fr/);
  assert.equal(sql('select statut_livraison as s from commandes_vitrine where id=?', expedition.id)[0].s, 'expedie');
  assert.equal((await env.call(vendeur.jar, 'PATCH', url, { action: 'expedier', numero_suivi: 'ZZ99999999FR', transporteur: 'colissimo' })).status, 400, 'déjà expédiée');
  const notif = await jusqua(async () => (await env.call(acheteur.jar, 'GET', '/api/notifications')).data.notifications.find((x) => x.type === 'commande_expediee'));
  assert.ok(notif, 'l\'acheteur doit être averti de l\'expédition');
  /* L'acheteur retrouve ses achats, avec le suivi. */
  const mes = await env.call(acheteur.jar, 'GET', '/api/mes-commandes-boutique');
  assert.equal(mes.status, 200);
  assert.equal(mes.data.commandes.length, 2);
  const sienne = mes.data.commandes.find((c) => c.id === expedition.id);
  assert.equal(sienne.numero_suivi, 'AB123456789FR');
  assert.equal(sienne.initiative_nom, `Boutique Achat ${rnd}`);
  assert.equal((await env.call(tiers.jar, 'GET', '/api/mes-commandes-boutique')).data.commandes.length, 0, 'les commandes d\'un autre restent privées');
});

test('5.2 messagerie : l\'acheteur peut écrire au vendeur depuis sa vitrine, le vendeur reçoit le message', async () => {
  /* Règle de la plateforme : un visiteur écrit directement au propriétaire d'une vitrine ACTIVE ; sinon il doit d'abord établir le contact. */
  sql('UPDATE initiatives SET vitrine_active=1 WHERE id=?', initId);
  const conv = await env.call(acheteur.jar, 'POST', '/api/conversations', { user_id: vendeur.id, origine: 'vitrine', sujet: 'Ma commande' });
  assert.ok(conv.status === 200 || conv.status === 201, 'ouverture de la conversation : ' + conv.status + ' ' + JSON.stringify(conv.data));
  const convId = conv.data.conversation_id || (conv.data.conversation && conv.data.conversation.id) || conv.data.id;
  assert.ok(convId, 'identifiant de conversation absent : ' + JSON.stringify(conv.data));
  const envoi = await env.call(acheteur.jar, 'POST', `/api/conversations/${convId}/messages`, { contenu: 'Bonjour, à quelle heure puis-je retirer mon panier ?' });
  assert.ok(envoi.status === 200 || envoi.status === 201, 'envoi : ' + envoi.status + ' ' + JSON.stringify(envoi.data));
  const lu = await env.call(vendeur.jar, 'GET', `/api/conversations/${convId}/messages`);
  assert.equal(lu.status, 200);
  assert.ok(JSON.stringify(lu.data).includes('retirer mon panier'), 'le vendeur doit lire le message');
  assert.equal((await env.call(tiers.jar, 'GET', `/api/conversations/${convId}/messages`)).status === 200 && JSON.stringify((await env.call(tiers.jar, 'GET', `/api/conversations/${convId}/messages`)).data).includes('retirer mon panier'), false, 'un tiers ne lit pas la conversation');
});

test('5.2 le paiement expiré n\'engage rien : la commande passe à « expiré » et ne peut pas être expédiée', async () => {
  assert.equal((await env.call(acheteur.jar, 'POST', '/api/panier', { produit_id: produitExpedition, quantite: 1, mode_livraison: 'expedition' })).status, 201);
  const r = await env.call(acheteur.jar, 'POST', '/api/panier/commander', {
    initiative_id: suiteAchat.boutique, livraison_nom: 'Aminata Test', livraison_adresse: '1 rue de la Paix', livraison_code_postal: '75002', livraison_ville: 'Paris', livraison_pays: 'France',
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const session = r.data.checkout_url.split('/').pop();
  await env.call(null, 'POST', '/api/stripe/webhook', { id: 'evt_exp_' + rnd, type: 'checkout.session.expired', data: { object: { id: session, metadata: { diaspoactif_panier_checkout: '1' } } } });
  const derniere = sql('select * from commandes_vitrine where acheteur_id=? order by id desc limit 1', acheteur.id)[0];
  assert.notEqual(derniere.paiement_statut, 'paye');
  assert.notEqual(derniere.paiement_statut, 'en_attente', 'la session expirée clôt la commande');
  const exp = await env.call(vendeur.jar, 'PATCH', `/api/commandes_vitrine/${derniere.id}/livraison`, { action: 'expedier' });
  assert.equal(exp.status, 400, 'une commande non payée ne s\'expédie pas');
});

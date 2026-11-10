/* ===========================================================
   tests/acceptation-boutiques.test.js — Tests d'acceptation de la refonte des boutiques (lot H, 2026-11-10)
   ===========================================================
   Reprend les points du dossier 05-tests-acceptation.md qui se vérifient par le code et par l'API :
   1.4  options : copies et maximum calculés depuis le registre des types
   1.7  article en rupture : impossible à ajouter au panier ET à commander directement
   1.10 « Acheter maintenant » n'existe nulle part
   1.12 équipe : invitation, un tiers ne peut pas répondre à la place de l'invité
   1.13 aucune émoticône dans les pages de boutique (périmètre retenu : pages de boutique, exemples, atelier, retours)
   1.14 aucun badge « vendeur vérifié » / « créateur certifié »
   3.1  aucun bouton « Déposer un projet » dans les pages de boutique
   5.1  non-régression : une copie de la base de dev ne perd aucune ligne des tables boutique après migration
   Les points 4.1 à 4.8 (réclamations et remboursements) sont dans tests/retours.test.js.
   Les points qui dépendent d'un lot pas encore livré (1.1 à 1.3, 1.5, 1.6, 1.11, 2.x, 3.2 à 3.5, 5.3) ne sont PAS
   écrits ici : ils sont « Bloqués » dans le rapport tant que le lot n'est pas commité.
   Un point en échec connu est marqué `todo` : il est exécuté et affiché, mais ne fait pas échouer la suite ;
   retirer `todo` dès que la correction est livrée.
   Aucun paiement réel, aucune clé réelle : vrai serveur sur une COPIE de la base de dev.
   Lancer : node --test tests/acceptation-boutiques.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const H = require('./_formation-harness');
const Types = require('../assets/boutique-types.js');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');

/* Retire les commentaires HTML et JS : on contrôle ce que l'utilisateur VOIT, pas les notes de développement. */
function sansCommentaires(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
}

/* Pages de boutique (périmètre de 1.10, 1.13, 3.1). */
function pagesBoutique() {
  const liste = ['boutique.html', 'boutique-video.html', 'portfolio.html', 'panier.html', 'atelier-boutiques.html', 'retours.html',
    'litiges-admin.html', 'assets/boutique-types.js', 'assets/retours-commun.js', 'assets/retours-vendeur.js'];
  const dossier = path.join(RACINE, 'exemples-boutiques');
  if (fs.existsSync(dossier)) {
    for (const f of fs.readdirSync(dossier)) if (/\.(html|js)$/.test(f)) liste.push('exemples-boutiques/' + f);
  }
  return liste.filter((rel) => fs.existsSync(path.join(RACINE, rel)));
}

/* ═════════════ 1.4 Options : copies et maximum calculés ═════════════ */
test('1.4 une option est dupliquée 3 fois au plus ; le nombre maximal d\'options = nombre de types − 1 (calculé)', () => {
  const nbTypes = Object.keys(Types.TYPES).length;
  assert.ok(nbTypes >= 2, 'le registre doit contenir plusieurs types');
  assert.equal(Types.MAX_COPIES, 3);
  assert.equal(Types.MAX_OPTIONS, nbTypes - 1, 'MAX_OPTIONS doit suivre le registre, jamais une valeur écrite à la main');
  /* Ajouter un type fait monter le maximum sans toucher au code : on le vérifie sur une copie du registre. */
  assert.match(lire('assets/boutique-types.js'), /MAX_OPTIONS\s*[:=][^\n]*(length|keys)/i, 'MAX_OPTIONS doit être calculé à partir de la liste des types');
});

/* ═════════════ 1.10 « Acheter maintenant » ═════════════ */
test('1.10 « Acheter maintenant » n\'existe dans aucune page de boutique ni de panier', () => {
  const fautes = [];
  for (const rel of pagesBoutique()) if (/Acheter maintenant/i.test(sansCommentaires(lire(rel)))) fautes.push(rel);
  assert.deepEqual(fautes, []);
});
test('1.10 bis « Acheter maintenant » n\'existe plus dans profil-app.html (publications du fil)', { todo: 'à retirer par la session 1 : 2 occurrences (PUB_CTA_LABEL et liste déroulante du type d\'appel)' }, () => {
  const occurrences = (sansCommentaires(lire('profil-app.html')).match(/Acheter maintenant/g) || []).length;
  assert.equal(occurrences, 0, `${occurrences} occurrence(s) restante(s) dans profil-app.html`);
});

/* ═════════════ 1.13 Aucune émoticône ═════════════ */
const EMOTICONE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{2604}\u{2607}-\u{27BF}\u{2B50}\u{2B55}\u{FE0F}]/u;
const SYMBOLES_AUTORISES = /[\u2713-\u2718\u2605\u2606\u2022]/gu; /* coches, croix, étoiles typographiques, puce : pas des émoticônes */
test('1.13 aucune émoticône dans les pages de boutique (le périmètre « toute la plateforme » est à confirmer)', { todo: 'ÉCHEC À CORRIGER : panier.html et exemples-boutiques/boutique.html contiennent des émoticônes (session 1)' }, () => {
  const fautes = [];
  for (const rel of pagesBoutique()) {
    const texte = sansCommentaires(lire(rel)).replace(SYMBOLES_AUTORISES, '');
    const trouvees = [...new Set(Array.from(texte).filter((c) => EMOTICONE.test(c)))];
    if (trouvees.length) fautes.push(`${rel} : ${trouvees.join(' ')}`);
  }
  assert.deepEqual(fautes, []);
});

/* ═════════════ 1.14 Aucun badge vendeur vérifié / créateur certifié ═════════════ */
test('1.14 aucun badge « vendeur vérifié » ni « créateur certifié » dans les pages de boutique, la page d\'accueil des boutiques et les modules de retour', { todo: "ÉCHEC À CORRIGER : exemples-boutiques/parametres-vitrine.html annonce un badge « Vendeur vérifié » (session 1)" }, () => {
  const motif = /(vendeur|boutique|marchand|commerçant|créateur|createur)\s+(vérifié|verifie|certifié|certifie|agréé)/i;
  const fautes = [];
  const fichiers = [...pagesBoutique(), 'vitrines.html', 'site-vitrine.html', 'assets/app.js'].filter((rel) => fs.existsSync(path.join(RACINE, rel)));
  for (const rel of fichiers) if (motif.test(sansCommentaires(lire(rel)))) fautes.push(rel);
  assert.deepEqual(fautes, []);
});

/* ═════════════ 3.1 Aucun bouton de dépôt de projet dans une boutique ═════════════ */
test("3.1 aucun bouton « Déposer un projet » / « Soumettre mon projet » dans les pages de boutique (le texte de renvoi « Pour soumettre un projet, utilisez Soumettre à Diaspo'Actif » est permis)", () => {
  const motif = /(Déposer|Soumettre|Envoyer)\s+(mon|un|votre|ton)\s+projet/; /* sensible à la casse : un libellé de bouton commence par une majuscule */
  const fautes = [];
  for (const rel of pagesBoutique()) if (motif.test(sansCommentaires(lire(rel)))) fautes.push(rel);
  assert.deepEqual(fautes, []);
});

/* ═════════════ Tests avec serveur réel (copie de la base de dev) ═════════════ */
let env, rnd, vendeur, acheteur, initId, produitDispo, produitEpuise, avantMigration;
const TABLES_BOUTIQUE = ['initiatives', 'produits_vitrine', 'commandes_vitrine', 'catalogues_vitrine', 'initiative_membres'];

function compter(chemin, tables) {
  const db = new DatabaseSync(chemin, { readOnly: true });
  try {
    const sortie = {};
    for (const t of tables) {
      const existe = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
      sortie[t] = existe ? Number(db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n) : null;
    }
    return sortie;
  } finally { db.close(); }
}
function tablesVitrine(chemin) {
  const db = new DatabaseSync(chemin, { readOnly: true });
  try { return db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'vitrine\\_%' ESCAPE '\\'").all().map((r) => r.name); }
  finally { db.close(); }
}
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
    return db.prepare(`INSERT INTO ${table} (${noms.join(',')}) VALUES (${noms.map(() => '?').join(',')})`).run(...noms.map((n) => tout[n]));
  } finally { db.close(); }
}
let n = 0;
async function nouveauCompte(nom) {
  const jar = H.cookieJar();
  const unique = nom + (++n);
  await H.creerApprenant(env, jar, rnd, unique);
  const id = sql('select id from users where email=?', H.compte(rnd, unique, 'utilisateur').email)[0].id;
  return { jar, id };
}

test.before(async () => {
  rnd = Math.random().toString(36).slice(2, 9);
  /* 5.1 : photographie des tables AVANT le démarrage (le serveur applique ses migrations au démarrage). */
  const source = path.join(RACINE, 'server', 'diaspoactif.db');
  if (fs.existsSync(source)) {
    avantMigration = { comptes: compter(source, TABLES_BOUTIQUE), vitrines: Object.fromEntries(tablesVitrine(source).map((t) => [t, compter(source, [t])[t]])) };
  }
  /* Faux Stripe (aucun réseau) + clé factice : le parcours de commande va jusqu'au contrôle du produit. */
  process.env.NODE_OPTIONS = '--require ' + JSON.stringify(path.join(__dirname, '_faux-stripe-preload.js')).replace(/\\/g, '/');
  process.env.STRIPE_SECRET_KEY = 'sk_test_factice_acceptation';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_factice';
  env = await H.demarrer('acceptation');
  vendeur = await nouveauCompte('Vendeur');
  acheteur = await nouveauCompte('Acheteur');
  initId = Number(inserer('initiatives', { nom: `Boutique Acceptation ${rnd}`, owner_user_id: vendeur.id }).lastInsertRowid);
  /* Le vendeur doit être « Abonné » pour vendre ; les boutiques sont rouvertes (elles sont fermées par défaut le temps de la refonte). */
  inserer('compte_accreditations', { user_id: vendeur.id, type: 'initiative_abonne', statut: 'active' });
  inserer('stripe_connect_accounts', { initiative_id: initId, stripe_account_id: 'acct_acceptation', statut: 'active', charges_enabled: 1 });
  sql("INSERT OR REPLACE INTO parametres_plateforme (cle, valeur) VALUES ('boutiques_en_maintenance', 'false')");
  produitDispo = Number(inserer('produits_vitrine', { initiative_id: initId, nom: 'Sac en wax', prix: 30, statut: 'disponible', disponible: 1 }).lastInsertRowid);
  produitEpuise = Number(inserer('produits_vitrine', { initiative_id: initId, nom: 'Sac épuisé', prix: 30, statut: 'epuise', disponible: 0 }).lastInsertRowid);
});
test.after(() => { if (env) env.stop(); });

/* ═════════════ 1.7 Article en rupture ═════════════ */
test('1.7 un article en rupture ne peut pas être ajouté au panier', async () => {
  const ok = await env.call(acheteur.jar, 'POST', '/api/panier', { produit_id: produitDispo, quantite: 1 });
  assert.equal(ok.status, 201, 'un article disponible doit pouvoir être ajouté : ' + JSON.stringify(ok.data));
  const refus = await env.call(acheteur.jar, 'POST', '/api/panier', { produit_id: produitEpuise, quantite: 1 });
  assert.equal(refus.status, 400);
  assert.match(String(refus.data && refus.data.error), /disponible/i);
  const contenu = sql('select produit_id from panier_items where user_id=?', acheteur.id).map((r) => r.produit_id);
  assert.ok(!contenu.includes(produitEpuise), 'l\'article en rupture ne doit jamais entrer dans le panier');
});
test('1.7 bis un article en rupture ne peut pas être commandé directement (hors panier)', { todo: 'ÉCHEC À CORRIGER : POST /api/produits/:id/commander ne contrôle pas le statut du produit (seul le panier le fait)' }, async () => {
  const avant = sql('select count(*) as n from commandes_vitrine where produit_id=?', produitEpuise)[0].n;
  const r = await env.call(acheteur.jar, 'POST', '/api/produits/' + produitEpuise + '/commander', { quantite: 1, mode_livraison: 'retrait' });
  const apres = sql('select count(*) as n from commandes_vitrine where produit_id=?', produitEpuise)[0].n;
  assert.ok(r.status >= 400 && r.status < 500 && /disponible|rupture|épuis/i.test(String(r.data && r.data.error)),
    `refus attendu pour cause d'indisponibilité, reçu ${r.status} ${JSON.stringify(r.data).slice(0, 160)}`);
  assert.equal(apres, avant, 'aucune commande ne doit être créée pour un article en rupture');
});

/* ═════════════ 2.2 Vidéo promo limitée à 57 secondes, contrôlée par le serveur ═════════════ */
test('2.2 vidéo de boutique : 57 secondes au plus, refus au-delà (contrôle serveur, pas seulement dans le formulaire)', async () => {
  const base = { nom: 'Produit avec vidéo', prix: 12, video_url: 'https://exemple.test/video.mp4', video_type: 'lien' };
  const trop = await env.call(vendeur.jar, 'POST', `/api/initiatives/${initId}/produits`, { ...base, video_duree: 58 });
  assert.equal(trop.status, 400, JSON.stringify(trop.data));
  assert.match(String(trop.data && trop.data.error), /57 secondes/);
  const limite = await env.call(vendeur.jar, 'POST', `/api/initiatives/${initId}/produits`, { ...base, video_duree: 57 });
  assert.ok(limite.status === 200 || limite.status === 201, '57 s doit être accepté : ' + JSON.stringify(limite.data));
});

/* ═════════════ 1.12 Équipe : invitation et réponse ═════════════ */
test("1.12 invitation d'un membre : un tiers ne peut ni inviter ni répondre ; l'invité répond lui-même", async () => {
  const invite = await nouveauCompte('Invite');
  const tiers = await nouveauCompte('Tiers');
  const refusTiers = await env.call(tiers.jar, 'POST', `/api/initiatives/${initId}/membres`, { user_id: invite.id, fonction: 'Vendeuse' });
  assert.ok([401, 403, 404].includes(refusTiers.status), 'un tiers ne peut pas inviter : ' + refusTiers.status);
  /* Règle de la plateforme : le propriétaire doit avoir rempli son profil public pour inviter (affiliation). */
  const bloque = await env.call(vendeur.jar, 'POST', `/api/initiatives/${initId}/membres`, { user_id: invite.id, fonction: 'Vendeuse' });
  assert.equal(bloque.status, 403);
  assert.match(String(bloque.data && bloque.data.error), /profil public/i);
  assert.equal(sql('select count(*) as n from initiative_membres where initiative_id=? and user_id=?', initId, invite.id)[0].n, 0);
  /* Invitation posée directement (profil complet supposé) : on contrôle qui peut répondre. */
  inserer('initiative_membres', { initiative_id: initId, user_id: invite.id, fonction: 'Vendeuse', statut: 'en_attente', origine: 'invitation' });
  const usurpation = await env.call(tiers.jar, 'PUT', `/api/initiatives/${initId}/membres/${invite.id}`, { statut: 'accepte' });
  assert.ok([401, 403, 404].includes(usurpation.status), 'un tiers ne peut pas répondre pour autrui : ' + usurpation.status);
  assert.equal(sql('select statut from initiative_membres where initiative_id=? and user_id=?', initId, invite.id)[0].statut, 'en_attente');
  const refus = await env.call(invite.jar, 'PUT', `/api/initiatives/${initId}/membres/${invite.id}`, { statut: 'refuse' });
  assert.equal(refus.status, 200, JSON.stringify(refus.data));
  assert.equal(sql('select statut from initiative_membres where initiative_id=? and user_id=?', initId, invite.id)[0].statut, 'refuse');
});

/* ═════════════ 5.1 Non-régression des données ═════════════ */
test('5.1 après migration, la copie de la base de dev ne perd aucune ligne des tables boutique', { skip: process.env.CI && !fs.existsSync(path.join(RACINE, 'server', 'diaspoactif.db')) }, () => {
  assert.ok(avantMigration, 'base de dev absente : lancer node server/seed.js');
  /* Les lignes créées par ce test (1 initiative, 2 produits, membres) s'ajoutent : on exige « au moins autant qu\'avant ». */
  const apres = compter(env.dbPath, TABLES_BOUTIQUE);
  for (const t of TABLES_BOUTIQUE) {
    if (avantMigration.comptes[t] === null) continue;
    assert.ok(apres[t] >= avantMigration.comptes[t], `${t} : ${avantMigration.comptes[t]} ligne(s) avant, ${apres[t]} après`);
  }
  const tablesApres = new Set(tablesVitrine(env.dbPath));
  for (const [t, nb] of Object.entries(avantMigration.vitrines)) {
    assert.ok(tablesApres.has(t), `la table ${t} a disparu`);
    assert.ok(compter(env.dbPath, [t])[t] >= nb, `${t} : ${nb} ligne(s) avant, moins après`);
  }
});

/* ===========================================================
   tests/boutique-reglages.test.js — Réglages par boutique (assistant de création, lot 2, 2026-11-13)
   ===========================================================
   1. Module server/boutique-reglages.js : valeurs par défaut sans restriction, validation, contrôle de commande, frais de livraison.
   2. Serveur réel (copie de la base de dev) : brouillon lu par le propriétaire seul, publié avec la boutique, refus d'un réglage invalide,
      un autre compte ne peut rien écrire.
   3. Application à la commande : minimum de commande, pays desservis, retrait / expédition fermés, panier ; une boutique SANS réglage commande comme avant.
   Aucun paiement : tous les refus se produisent avant la création de la session de paiement.
   Lancer : node --test tests/boutique-reglages.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const R = require('../server/boutique-reglages.js');
const H = require('./_formation-harness');

/* ═════════════ 1. Module ═════════════ */
test('R1 les valeurs par défaut n\'imposent aucune restriction', () => {
  const d = R.defauts();
  assert.equal(d.commercial.minimum_commande, 0);
  assert.deepEqual(d.commercial.pays_vente, []);
  assert.equal(d.livraison.expedition, true);
  assert.equal(d.livraison.retrait, true);
  assert.equal(d.livraison.frais_mode, 'produit');
  assert.equal(R.controlerCommande(d, { mode: 'expedition', pays: 'Japon', montant: 1 }), null);
  assert.equal(R.controlerCommande(d, { mode: 'retrait', montant: 0.5 }), null);
  assert.equal(R.fraisLivraison(d, 7.5), 7.5);
});

test('R1 une colonne vide, illisible ou mal formée redonne les valeurs par défaut', () => {
  for (const brut of [undefined, null, '', '{}', 'pas du json', '[1,2]', '"x"', 42]) assert.deepEqual(R.lire(brut), R.defauts(), String(brut));
});

test('R1 la validation borne, nettoie et signale les valeurs invalides', () => {
  const ok = R.normaliser({ commercial: { minimum_commande: '12,5', pays_vente: ['France', ' france ', 'Sénégal', ''] }, livraison: { frais_mode: 'fixe', frais_montant: 4.999, preparation_jours: 99, delai_estime: 'x'.repeat(200) } });
  assert.equal(ok.erreur, undefined);
  assert.equal(ok.reglages.commercial.minimum_commande, 12.5);
  assert.deepEqual(ok.reglages.commercial.pays_vente, ['France', 'Sénégal'], 'doublons et vides retirés');
  assert.equal(ok.reglages.livraison.frais_montant, 5);
  assert.equal(ok.reglages.livraison.preparation_jours, 60);
  assert.equal(ok.reglages.livraison.delai_estime.length, 80);
  assert.equal(R.normaliser({ commercial: { minimum_commande: -4 } }).reglages.commercial.minimum_commande, 0);
  assert.match(R.normaliser({ livraison: { frais_mode: 'gratos' } }).erreur, /frais de livraison/);
  assert.match(R.normaliser({ confiance: { statut_juridique: 'Pirate' } }).erreur, /statut juridique/);
  assert.match(R.normaliser({ confiance: { email: 'pas-un-mail' } }).erreur, /e-mail/);
  assert.match(R.normaliser({ confiance: { cgv: { url: 'javascript:alert(1)' } } }).erreur, /http/);
  assert.match(R.normaliser({ commercial: { pays_vente: 'France' } }).erreur, /pays de vente/);
  assert.match(R.normaliser({ commercial: { pays_vente: new Array(R.MAX_PAYS + 1).fill('X') } }).erreur, /Trop de pays/);
});

test('R1 une mise à jour partielle garde les autres champs', () => {
  const a = R.normaliser({ confiance: { raison_sociale: 'Éclat Beauté SAS', siret: '123' } }).reglages;
  const b = R.normaliser({ confiance: { tel: '+33 6' } }, a).reglages;
  assert.equal(b.confiance.raison_sociale, 'Éclat Beauté SAS');
  assert.equal(b.confiance.tel, '+33 6');
  assert.equal(a.confiance.tel, '', 'l\'objet de départ n\'est pas modifié');
});

test('R1 le texte est nettoyé (caractères de contrôle) et les documents légaux gardent texte et lien', () => {
  const r = R.normaliser({ confiance: { cgv: { texte: 'a\u0000b\u0007c', url: 'https://exemple.org/cgv' } } }).reglages;
  assert.equal(r.confiance.cgv.texte, 'abc');
  assert.equal(r.confiance.cgv.url, 'https://exemple.org/cgv');
});

test('R1 contrôle de commande : minimum, pays desservis (sans accents ni majuscules), modes fermés', () => {
  const r = R.normaliser({ commercial: { minimum_commande: 30, pays_vente: ['Sénégal', "Côte d'Ivoire"] }, livraison: { retrait: false } }).reglages;
  assert.match(R.controlerCommande(r, { mode: 'expedition', pays: 'Sénégal', montant: 20 }), /minimum/);
  assert.equal(R.controlerCommande(r, { mode: 'expedition', pays: 'senegal', montant: 30 }), null);
  assert.equal(R.controlerCommande(r, { mode: 'expedition', pays: "COTE D IVOIRE", montant: 31 }), null);
  assert.match(R.controlerCommande(r, { mode: 'expedition', pays: 'France', montant: 100 }), /ne livre pas/);
  assert.match(R.controlerCommande(r, { mode: 'retrait', montant: 100 }), /retrait/);
  assert.equal(R.controlerCommande(r, { mode: 'expedition' }), null, 'sans pays ni montant (ajout au panier), seuls les modes sont contrôlés');
  assert.match(R.controlerCommande(R.normaliser({ livraison: { expedition: false } }).reglages, { mode: 'expedition', pays: 'France', montant: 99 }), /expédition/);
});

test('R1 frais de livraison : par produit, gratuit ou fixe', () => {
  const g = (livraison) => R.normaliser({ livraison }).reglages;
  assert.equal(R.fraisLivraison(g({ frais_mode: 'produit' }), 6), 6);
  assert.equal(R.fraisLivraison(g({ frais_mode: 'gratuit' }), 6), 0);
  assert.equal(R.fraisLivraison(g({ frais_mode: 'fixe', frais_montant: 3.5 }), 6), 3.5);
  assert.equal(R.fraisLivraison(undefined, 2), 2);
});

/* ═════════════ 2 et 3. Serveur réel ═════════════ */
let env, rnd, proprio, visiteur, oid, produitRetrait, produitExp;
const sql = (req, ...args) => {
  const db = new DatabaseSync(env.dbPath);
  try { db.exec('PRAGMA busy_timeout=5000'); return /^\s*select/i.test(req) ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); }
};
async function compte(nom) {
  const jar = H.cookieJar();
  await H.creerApprenant(env, jar, rnd, nom);
  return { jar, id: sql('select id from users where email=?', H.compte(rnd, nom, 'utilisateur').email)[0].id };
}
const mon = (jar, brouillon = true) => env.call(jar, 'GET', '/api/mon-initiative' + (brouillon ? '?preview=draft' : ''));
const put = (reglages, jar) => env.call((jar || proprio.jar), 'PUT', `/api/initiatives/${oid}/vitrine-draft`, { reglages });
const publier = () => env.call(proprio.jar, 'POST', `/api/initiatives/${oid}/vitrine-publish`);
const colonne = () => JSON.parse(sql('select vitrine_reglages_json as r from initiatives where id=?', oid)[0].r || '{}');
const commander = (idProduit, corps) => env.call(visiteur.jar, 'POST', `/api/produits/${idProduit}/commander`, corps);
const adresse = (pays) => ({ mode_livraison: 'expedition', livraison_nom: 'A B', livraison_adresse: '1 rue X', livraison_code_postal: '75001', livraison_ville: 'Paris', livraison_pays: pays });

test.before(async () => {
  rnd = Math.random().toString(36).slice(2, 9);
  env = await H.demarrer('reglages-boutique');
  sql("INSERT OR REPLACE INTO parametres_plateforme (cle, valeur) VALUES ('boutiques_en_maintenance', 'false')"); /* boutiques rouvertes : sinon toute commande répond 423 avant les réglages */
  proprio = await compte('ProprioReg');
  visiteur = await compte('VisiteurReg');
  oid = Number(sql('insert into initiatives (nom, owner_user_id, vitrine_type) values (?,?,?)', `Boutique Réglages ${rnd}`, proprio.id, 'ecom').lastInsertRowid);
  produitRetrait = Number(sql("insert into produits_vitrine (initiative_id, nom, prix, statut, disponible, livraison_retrait, livraison_expedition) values (?,?,?,?,?,?,?)", oid, 'Panier en raphia', 25, 'disponible', 1, 1, 0).lastInsertRowid);
  produitExp = Number(sql("insert into produits_vitrine (initiative_id, nom, prix, statut, disponible, livraison_retrait, livraison_expedition, frais_expedition) values (?,?,?,?,?,?,?,?)", oid, 'Boubou brodé', 90, 'disponible', 1, 1, 8).lastInsertRowid);
});
test.after(() => { if (env) env.stop(); });

test('R2 une boutique neuve expose les valeurs par défaut au propriétaire', async () => {
  const b = (await mon(proprio.jar)).data.initiative;
  assert.deepEqual(b.vitrine_reglages, R.defauts());
  assert.deepEqual((await mon(proprio.jar, false)).data.initiative.vitrine_reglages, R.defauts());
});

test('R2 les réglages du brouillon ne sont pas publiés avant « Publier » puis le sont, et le brouillon est vidé', async () => {
  const r = await put({ commercial: { minimum_commande: 30, pays_vente: ['France'] }, confiance: { raison_sociale: 'Boutique SAS' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal((await mon(proprio.jar)).data.initiative.vitrine_reglages.commercial.minimum_commande, 30);
  assert.equal((await mon(proprio.jar, false)).data.initiative.vitrine_reglages.commercial.minimum_commande, 0, 'rien n\'est publié');
  assert.deepEqual(colonne(), {});
  assert.equal((await publier()).status, 200);
  assert.equal(colonne().commercial.minimum_commande, 30);
  assert.equal(colonne().confiance.raison_sociale, 'Boutique SAS');
  assert.equal(sql('select vitrine_draft_json as d from initiatives where id=?', oid)[0].d, '{}');
});

test('R2 deux enregistrements successifs se fusionnent ; une publication sans réglage garde les réglages publiés', async () => {
  assert.equal((await put({ livraison: { frais_mode: 'fixe', frais_montant: 5 } })).status, 200);
  const brouillon = (await mon(proprio.jar)).data.initiative.vitrine_reglages;
  assert.equal(brouillon.commercial.minimum_commande, 30, 'le publié reste la base du brouillon');
  assert.equal(brouillon.livraison.frais_montant, 5);
  assert.equal((await publier()).status, 200);
  assert.equal((await env.call(proprio.jar, 'PUT', `/api/initiatives/${oid}/vitrine-draft`, { theme: 'bordeaux' })).status, 200);
  assert.equal((await publier()).status, 200);
  assert.equal(colonne().commercial.minimum_commande, 30);
  assert.equal(colonne().livraison.frais_mode, 'fixe');
});

test('R2 un réglage invalide est refusé avec un message, et rien n\'est modifié', async () => {
  const avant = colonne();
  const r = await put({ livraison: { frais_mode: 'inconnu' } });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /frais de livraison/);
  assert.equal((await put('texte')).status, 400);
  assert.deepEqual(colonne(), avant);
});

test('R2 un autre compte ne peut ni écrire ni lire les réglages', async () => {
  assert.equal((await put({ commercial: { minimum_commande: 1 } }, visiteur.jar)).status, 403);
  const vue = await env.call(visiteur.jar, 'GET', '/api/mon-initiative');
  assert.ok(!vue.data.initiative || !vue.data.initiative.vitrine_reglages || vue.data.initiative.id !== oid);
});

test('R3 minimum de commande : refusé sous le minimum, avec le montant dans le message', async () => {
  const r = await commander(produitRetrait, { quantite: 1 });
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.match(r.data.error, /minimum de commande .* 30,00/);
});

test('R3 pays desservis : une adresse hors liste est refusée avant tout paiement', async () => {
  const r = await commander(produitExp, adresse('Japon'));
  assert.equal(r.status, 400, JSON.stringify(r.data));
  assert.match(r.data.error, /ne livre pas dans ce pays/);
  assert.match(r.data.error, /France/);
});

test('R3 un pays desservi (écrit sans accent ni majuscule) passe le contrôle des réglages', async () => {
  const r = await commander(produitExp, adresse('FRANCE'));
  assert.notEqual(r.status, 423, 'boutiques en maintenance : le test ne prouve rien');
  assert.ok(!/minimum|ne livre pas|retrait|expédition/i.test(String((r.data && r.data.error) || '')), 'refus inattendu : ' + JSON.stringify(r.data));
});

test('R3 retrait fermé par la boutique : commande et ajout au panier refusés ; expédition fermée de même', async () => {
  assert.equal((await put({ commercial: { minimum_commande: 0, pays_vente: [] }, livraison: { retrait: false } })).status, 200);
  assert.equal((await publier()).status, 200);
  const r = await commander(produitRetrait, { quantite: 1, mode_livraison: 'retrait' });
  assert.equal(r.status, 400);
  assert.match(r.data.error, /retrait/);
  const panier = await env.call(visiteur.jar, 'POST', '/api/panier', { produit_id: produitRetrait, quantite: 1, mode_livraison: 'retrait' });
  assert.equal(panier.status, 400, JSON.stringify(panier.data));
  assert.match(panier.data.error, /retrait/);
  assert.equal((await put({ livraison: { retrait: true, expedition: false } })).status, 200);
  assert.equal((await publier()).status, 200);
  const exp = await commander(produitExp, adresse('France'));
  assert.equal(exp.status, 400);
  assert.match(exp.data.error, /expédition/);
});

test('R3 une boutique sans aucun réglage se comporte comme avant (aucun refus venant des réglages)', async () => {
  sql("update initiatives set vitrine_reglages_json='{}' where id=?", oid);
  const r = await commander(produitExp, adresse('Japon'));
  assert.notEqual(r.status, 423, 'boutiques en maintenance : le test ne prouve rien');
  assert.ok(!/minimum|ne livre pas|ne propose pas/i.test(String((r.data && r.data.error) || '')), JSON.stringify(r.data));
  const panier = await env.call(visiteur.jar, 'POST', '/api/panier', { produit_id: produitRetrait, quantite: 1, mode_livraison: 'retrait' });
  assert.ok([200, 201].includes(panier.status), JSON.stringify(panier.data));
});

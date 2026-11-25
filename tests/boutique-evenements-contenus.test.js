/* ===========================================================
   tests/boutique-evenements-contenus.test.js — « Mes événements » dans Paramètres Boutique (2026-11-24, étape 2)
   Le propriétaire d'une boutique « Créateur d'événements » voit, publie et ouvre ses événements dans les Paramètres, plus dans l'ancienne vue du profil.
   Lancer : node --test tests/boutique-evenements-contenus.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lire = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const dash = lire('dashboard-initiative.html');
const mod = lire('assets/boutique-evenements-contenus.js');
const barre = lire('assets/boutique-barre-proprio.js');
const css = lire('assets/boutique-produits.css');
const page = lire('assets/boutique-evenements.js');
const serveur = lire('server/index.js');

test('EV1 le tableau de bord porte la carte « Mes événements », son script et le montage', () => {
  assert.match(dash, /id="pv-evenements"/);
  assert.match(dash, /id="pv-evenements-mount"/);
  assert.match(dash, /<h3[^>]*>Mes événements<\/h3>/);
  assert.match(dash, /<script src="assets\/boutique-evenements-contenus\.js\?v=2"><\/script>/);
  assert.match(dash, /if \(window\.PvEvenements\) PvEvenements\.monter\(init\);/);
});

test('EV2 la carte ne s\'affiche que pour le type « Créateur d\'événements »', () => {
  assert.match(mod, /\(type !== 'events' && type !== 'evenement'\)\) \{ carte\.style\.display = 'none'; return; \}/);
  assert.match(mod, /\/\[#&\]evenements\(&\|\$\)\/\.test\(location\.hash\)/);
});

test('EV3 les événements viennent de la même source que la page boutique-evenements.html', () => {
  assert.match(mod, /api\('GET', '\/evenements\?owner=' \+ encodeURIComponent\(S\.ownerId\)\)/);
  assert.ok(page.includes("'/evenements?owner='"), 'la page publique ne lit pas /evenements?owner=');
  assert.match(mod, /Number\(e\.owner_user_id\) === Number\(S\.ownerId\)/);
});

test('EV4 le module n\'appelle que GET /evenements, GET /auth/me et deux PATCH ciblés (publier, visibilite-boutique)', () => {
  const appels = (mod.match(/api\('[A-Z]+', '[^']*'/g) || []);
  assert.deepEqual([...new Set(appels)].sort(), ["api('GET', '/auth/me'", "api('GET', '/evenements?owner='", "api('PATCH', '/evenements/'"].sort());
  assert.match(mod, /'\/evenements\/' \+ id \+ '\/publier'/);
  assert.match(mod, /'\/evenements\/' \+ id \+ '\/visibilite-boutique'/);
  assert.match(serveur, /route\("PATCH", "\/api\/evenements\/:id\/publier"/);
  assert.match(serveur, /route\("GET", "\/api\/evenements"/);
});

test('EV5 on ne réécrit jamais un événement ici : aucun PUT ni DELETE', () => {
  assert.ok(!/api\('(PUT|DELETE|POST)'/.test(mod), 'écriture interdite dans ce module');
});

test('EV6 les trois onglets : à venir et en cours, brouillons, terminés', () => {
  ['a_venir', 'brouillon', 'termine'].forEach((c) => assert.ok(mod.includes("cle: '" + c + "'")));
  assert.match(mod, /e\.statut_temporel === 'termine'/);
  assert.match(mod, /if \(e\.statut === 'brouillon'\) return 'brouillon';/);
});

test('EV7 publier : seulement un brouillon, après confirmation, et le propriétaire est prévenu des alertes', () => {
  assert.match(mod, /if \(!e \|\| e\.statut !== 'brouillon'\) return;/);
  assert.match(mod, /window\.confirm\('Publier « '/);
  assert.match(mod, /abonnés aux alertes/);
  assert.match(mod, /Événement publié\. Il apparaît maintenant dans votre boutique\./);
});

test('EV8 Modifier, Voir et Nouvel événement mènent aux écrans existants ; « Tout gérer » ouvre Mes événements', () => {
  assert.match(mod, /href="evenements\.html#evt-' \+ id \+ '"/);
  assert.match(mod, /href="evenements\.html\?evt=' \+ id \+ '"/);
  assert.match(mod, /href="evenements\.html\?creer_evenement=1"/);
  assert.match(mod, /window\.initShowSection\('evenements'\)/);
  assert.match(dash, /evenements\.html\?creer_evenement=1/, 'le tableau de bord utilise déjà cette adresse de création');
});

test('EV9 la visibilité de chaque événement est dite : Boutique et Événements / Boutique uniquement / Hors de votre boutique', () => {
  assert.match(mod, /Boutique uniquement/);
  assert.match(mod, /Hors de votre boutique/);
  assert.match(mod, /Boutique et Événements/);
  assert.match(mod, /Number\(e\.masquer_boutique\)/);
  assert.match(mod, /Publication prévue le /);
});

test('EV10 un contenu est échappé partout (jamais d\'injection par un titre, un lieu ou une image)', () => {
  assert.match(mod, /function esc\(s\)/);
  assert.match(mod, /esc\(nom\)/);
  assert.match(mod, /esc\(quand\)/);
  assert.match(mod, /function imageDe\(e\) \{[^}]*\^\(https\?:\\\/\\\/\|\\\/\)/);
  assert.ok(!/innerHTML\s*=\s*[^;]*\+\s*e\.titre\b/.test(mod), 'titre injecté sans échappement');
  assert.match(mod, /function entier\(v\)/);
});

test('EV11 « Réservation » éteinte est signalée au propriétaire, sans rien supprimer', () => {
  assert.match(mod, /window\.BoutiqueRubriques\.active\(S\.etat, 'reservation'\)/);
  assert.match(mod, /rubrique « Réservation » est éteinte/);
  assert.match(page, /rub\('reservation'\)/);
});

test('EV12 une panne de chargement donne un message et un bouton Réessayer, pas un écran vide', () => {
  assert.match(mod, /ne peuvent pas être chargés pour le moment/);
  assert.match(mod, /data-a="reessayer"/);
  assert.match(mod, /\.catch\(function \(\) \{ S\.evts = false; dessiner\(\); \}\)/);
});

test('EV13 la barre du propriétaire mène à « Mes événements » ; impact et finance gardent leur lien en attendant', () => {
  assert.match(barre, /page === 'boutique-evenements\.html' \? 'Mes événements'/);
  assert.match(barre, /page === 'boutique-evenements\.html' \? 'dashboard-initiative\.html#parametres-vitrine&evenements'/);
  assert.match(barre, /vitrine=1&edition=1/, 'les types sans rubrique gardent leur lien en attendant');
});

test('EV14 la carte partage le style de « Mes produits » sans le casser ; les liens ne sont pas soulignés', () => {
  assert.match(css, /:is\(#pv-produits,#pv-portfolio,#pv-evenements(,#pv-impact)?(,#pv-finance)?\) \.pvp-ligne/);
  assert.match(css, /a\.pvp-btn\{text-decoration:none\}/);
  assert.match(css, /\.pvp-ligne\.pvp-ev\{grid-template-columns:56px minmax\(0,1fr\) auto\}/);
  assert.match(mod, /class="pvp-ligne pvp-ev"/);
  assert.ok(!/^#pv-produits /m.test(css), 'sélecteur restant propre à « Mes produits » seulement');
});

test('EV15 le propriétaire est retrouvé même si l\'initiative ne le porte pas', () => {
  assert.match(mod, /api\('GET', '\/auth\/me'\)/);
  assert.match(mod, /S\.ownerId = init\.owner_user_id \|\| null/);
});

test('EV16 la route visibilite-boutique ne touche QUE masquer_boutique, pour le propriétaire ou un administrateur', () => {
  const m = serveur.match(/route\("PATCH", "\/api\/evenements\/:id\/visibilite-boutique"[\s\S]*?\n\}\);/);
  assert.ok(m, 'route absente');
  const r = m[0];
  assert.match(r, /if \(!user\) return sendJSON\(res, 401/);
  assert.match(r, /Number\(evt\.owner_user_id\) !== Number\(user\.id\) && user\.role !== "administrateur"/);
  assert.match(r, /UPDATE evenements SET masquer_boutique=\? WHERE id=\?/);
  assert.equal((r.match(/UPDATE /g) || []).length, 1, 'une seule écriture');
  assert.ok(!/DELETE|INSERT/.test(r), 'aucune suppression ni insertion');
  assert.match(r, /typeof body\?\.afficher !== "boolean"/);
});

test('EV17 un événement « Boutique uniquement » ne peut pas être masqué de la boutique (il disparaîtrait partout)', () => {
  const r = serveur.match(/route\("PATCH", "\/api\/evenements\/:id\/visibilite-boutique"[\s\S]*?\n\}\);/)[0];
  assert.match(r, /if \(evt\.visibilite === "boutique"\)/);
  assert.match(r, /sendJSON\(res, 400/);
  assert.match(mod, /function masquable\(e\) \{ return e\.statut !== 'brouillon' && e\.visibilite !== 'boutique'; \}/);
});

test('EV18 le bouton « Masquer de la boutique » / « Afficher dans la boutique » écrit afficher et rafraîchit l\'aperçu', () => {
  assert.match(mod, /data-a="visibilite"/);
  assert.match(mod, /Afficher dans la boutique/);
  assert.match(mod, /Masquer de la boutique/);
  assert.match(mod, /api\('PATCH', '\/evenements\/' \+ id \+ '\/visibilite-boutique', \{ afficher: afficher \}\)/);
  assert.match(mod, /e\.masquer_boutique = afficher \? 0 : 1;/);
  assert.match(mod, /else if \(a === 'visibilite' && l\) basculer\(entier\(l\.dataset\.id\)\);/);
  assert.match(mod, /Il reste visible dans Événements/);
});

test('EV19 la lecture publique de la boutique respecte déjà masquer_boutique (rien d\'autre à changer côté lecture)', () => {
  assert.match(serveur, /if \(query\.boutique\) rows = rows\.filter\(r => !r\.masquer_boutique\);/);
  assert.match(page, /boutique=1/);
});

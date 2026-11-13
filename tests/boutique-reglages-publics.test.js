/* ===========================================================
   tests/boutique-reglages-publics.test.js — Réglages et couleurs vus par les visiteurs (lot 4A, 2026-11-13)
   ===========================================================
   1. assets/boutique-reglages-public.js : une boutique sans réglage n'affiche rien ; chaque ligne affichée correspond à un réglage choisi ;
      tout texte saisi est échappé ; un lien dangereux n'est jamais proposé.
   2. Serveur réel (copie de la base de dev) : la fiche publique d'une boutique renvoie ses réglages publiés, jamais son brouillon.
   3. Palette des pages claires (commerce, vidéo, portfolio) : sans couleurs la charte d'origine est conservée ; avec couleurs, les variables sont posées puis retirées.
   4. Les six pages de boutique chargent le module et l'utilisent.
   Lancer : node --test tests/boutique-reglages-publics.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const R = require('../server/boutique-reglages.js');
const P = require('../assets/boutique-reglages-public.js');
const C = require('../assets/boutique-couleurs.js');
const H = require('./_formation-harness');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const reglages = (partiel) => R.normaliser(partiel).reglages;

/* ═════════════ 1. Module d'affichage ═════════════ */
test('P1 une boutique qui n\'a rien réglé n\'affiche rien', () => {
  P.definir(R.defauts());
  assert.equal(P.htmlConditions(), '');
  assert.equal(P.htmlLegal(), '');
  assert.equal(P.resumeLivraison(), null);
  for (const vide of [undefined, null, 'x', 42]) { P.definir(vide); assert.equal(P.htmlConditions(), ''); assert.equal(P.htmlLegal(), ''); }
});

test('P1 chaque réglage choisi donne une ligne, et seulement celle-là', () => {
  P.definir(reglages({ commercial: { minimum_commande: 20, pays_vente: ['France', 'Sénégal'] }, livraison: { expedition: false, frais_mode: 'fixe', frais_montant: 4.9, preparation_jours: 3, delai_estime: '5 à 7 jours' } }));
  const l = Object.fromEntries(P.lignesConditions());
  assert.equal(l['Commande minimum'], '20,00 €');
  assert.equal(l['Livraison dans'], 'France, Sénégal');
  assert.equal(l['Mode de remise'], 'Retrait sur place uniquement');
  assert.equal(l['Frais de livraison'], '4,90 € par commande');
  assert.equal(l['Préparation'], '3 jours');
  assert.equal(l['Délai de livraison estimé'], '5 à 7 jours');
  P.definir(reglages({ livraison: { frais_mode: 'gratuit', preparation_jours: 1 } }));
  assert.deepEqual(P.lignesConditions(), [['Frais de livraison', 'Offerts'], ['Préparation', '1 jour']]);
  P.definir(reglages({ livraison: { retrait: false } }));
  assert.deepEqual(P.lignesConditions(), [['Mode de remise', 'Expédition uniquement']]);
  assert.match(P.htmlConditions(), /^<section class="rp-conditions"/);
});

test('P1 les types sans envoi de produit n\'affichent que le minimum de commande', () => {
  P.definir(reglages({ commercial: { minimum_commande: 10, pays_vente: ['France'] }, livraison: { frais_mode: 'gratuit', delai_estime: 'vite' } }));
  assert.deepEqual(P.lignesConditions({ livraison: false }), [['Commande minimum', '10,00 €']]);
});

test('P1 le résumé pour la bande de garanties suit les réglages, sinon ne change rien', () => {
  P.definir(R.defauts());
  assert.equal(P.resumeLivraison(), null);
  P.definir(reglages({ livraison: { expedition: false } }));
  assert.deepEqual(P.resumeLivraison(), { titre: 'Retrait sur place', sous: 'uniquement' });
  P.definir(reglages({ livraison: { frais_mode: 'gratuit', delai_estime: '48 h' } }));
  assert.deepEqual(P.resumeLivraison(), { titre: 'Livraison offerte', sous: '48 h' });
  P.definir(reglages({ commercial: { pays_vente: ['France', 'Belgique', 'Suisse'] } }));
  assert.equal(P.resumeLivraison().sous, 'France, Belgique…');
});

test('P2 informations légales : identité, documents avec texte (bouton) ou lien seul, tout est échappé', () => {
  P.definir(reglages({ confiance: {
    raison_sociale: 'Éclat <b>SAS</b>', nom_commercial: 'Éclat', statut_juridique: 'Association', siret: '123 456', email: 'contact@exemple.org', tel: '+33 6 12 34 56 78',
    cgv: { texte: 'Texte <script>alert(1)</script>', url: '' },
    retours: { texte: '', url: 'https://exemple.org/retours' },
    mentions: { texte: '', url: '' },
  } }));
  const h = P.htmlLegal();
  assert.match(h, /Informations légales de la boutique/);
  assert.ok(!/<b>SAS<\/b>/.test(h) && /Éclat &lt;b&gt;SAS&lt;\/b&gt;/.test(h), 'raison sociale échappée');
  assert.match(h, /mailto:contact@exemple\.org/);
  assert.match(h, /tel:\+33612345678/);
  assert.match(h, /data-rp-doc="cgv"/, 'texte -> bouton qui ouvre la fenêtre');
  assert.match(h, /href="https:\/\/exemple\.org\/retours" target="_blank" rel="noopener noreferrer"/, 'lien seul -> nouvel onglet sûr');
  assert.ok(!/data-rp-doc="mentions"/.test(h) && !/Mentions légales/.test(h), 'document vide non proposé');
  assert.deepEqual(P.documents().map(d => d.id), ['cgv', 'retours']);
});

test('P2 un lien qui n\'est pas http(s) n\'est jamais proposé', () => {
  P.definir({ confiance: { cgv: { texte: '', url: 'javascript:alert(1)' }, retours: { texte: '', url: 'data:text/html,x' } } });
  assert.equal(P.documents().length, 0);
  assert.equal(P.htmlLegal(), '');
});

test('P2 la fenêtre des textes légaux est un <dialog> natif (focus, Échap) et ne lit que le texte échappé', () => {
  const SRC = lire('assets/boutique-reglages-public.js');
  assert.match(SRC, /createElement\("dialog"\)/);
  assert.match(SRC, /showModal/);
  assert.match(SRC, /aria-labelledby/);
  assert.match(SRC, /esc\(contenu\.texte\)/);
  assert.doesNotMatch(SRC, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'aucun emoji');
});

/* ═════════════ 2. Serveur réel ═════════════ */
let env, rnd, proprio, oid;
const sql = (req, ...args) => {
  const db = new DatabaseSync(env.dbPath);
  try { db.exec('PRAGMA busy_timeout=5000'); return /^\s*select/i.test(req) ? db.prepare(req).all(...args) : db.prepare(req).run(...args); } finally { db.close(); }
};

test.before(async () => {
  rnd = Math.random().toString(36).slice(2, 9);
  env = await H.demarrer('reglages-publics');
  const jar = H.cookieJar();
  await H.creerApprenant(env, jar, rnd, 'ProprioPub');
  proprio = { jar, id: sql('select id from users where email=?', H.compte(rnd, 'ProprioPub', 'utilisateur').email)[0].id };
  oid = Number(sql('insert into initiatives (nom, owner_user_id, vitrine_type) values (?,?,?)', `Boutique Publique ${rnd}`, proprio.id, 'ecom').lastInsertRowid);
});
test.after(() => { if (env) env.stop(); });

test('P3 un visiteur lit les réglages PUBLIÉS de la boutique, jamais le brouillon', async () => {
  const visiteur = H.cookieJar();
  const avant = (await env.call(visiteur, 'GET', `/api/initiatives/${oid}`)).data.initiative;
  assert.deepEqual(avant.vitrine_reglages, R.defauts(), 'boutique neuve : valeurs par défaut');
  assert.equal((await env.call(proprio.jar, 'PUT', `/api/initiatives/${oid}/vitrine-draft`, { reglages: { commercial: { minimum_commande: 40 }, confiance: { raison_sociale: 'Publiée SAS' } } })).status, 200);
  const brouillonVuParVisiteur = (await env.call(visiteur, 'GET', `/api/initiatives/${oid}?preview=draft`)).data.initiative;
  assert.equal(brouillonVuParVisiteur.vitrine_reglages.commercial.minimum_commande, 0, 'un visiteur ne voit jamais le brouillon, même avec ?preview=draft');
  const brouillonVuParProprio = (await env.call(proprio.jar, 'GET', `/api/initiatives/${oid}?preview=draft`)).data.initiative;
  assert.equal(brouillonVuParProprio.vitrine_reglages.commercial.minimum_commande, 40, 'le propriétaire voit son brouillon dans l\'aperçu');
  assert.equal((await env.call(proprio.jar, 'POST', `/api/initiatives/${oid}/vitrine-publish`)).status, 200);
  const apres = (await env.call(visiteur, 'GET', `/api/initiatives/${oid}`)).data.initiative;
  assert.equal(apres.vitrine_reglages.commercial.minimum_commande, 40);
  assert.equal(apres.vitrine_reglages.confiance.raison_sociale, 'Publiée SAS');
  assert.ok(!('vitrine_draft_json' in apres) || apres.vitrine_draft_json == null, 'le brouillon brut reste privé');
});

/* ═════════════ 3. Couleurs des pages claires ═════════════ */
test('C1 sans couleurs enregistrées, la charte d\'origine est conservée', () => {
  assert.equal(C.paletteClaire(undefined), null);
  assert.equal(C.paletteClaire([]), null);
  assert.equal(C.paletteClaire(['pas une couleur']), null);
  const poses = [];
  const el = { style: { setProperty: (n, v) => poses.push([n, v]), removeProperty: () => {} } };
  C.appliquerPage(el, {}, { '--x': 'p' });
  C.appliquerPage(el, { couleurs: [] }, { '--x': 'p' });
  assert.deepEqual(poses, []);
});

test('C1 avec couleurs : variables posées, texte blanc lisible sur la couleur principale, retirées au retour au thème d\'origine', () => {
  const pal = C.paletteClaire(['#f2d16b', '#0f3330', '#e6c98a']);
  assert.ok(C.contraste('#ffffff', pal.p) >= 4.5, 'une couleur principale claire est assombrie pour rester lisible');
  assert.ok(C.contraste('#ffffff', pal.s) >= 4.5);
  assert.equal(pal.a, '#e6c98a', 'l\'accent garde sa vraie couleur');
  const etat = {}, attrs = {};
  const el = { style: { setProperty: (n, v) => { etat[n] = v; }, removeProperty: (n) => { delete etat[n]; } }, setAttribute: (n, v) => { attrs[n] = v; }, removeAttribute: (n) => { delete attrs[n]; } };
  const noms = { '--bq-bordeaux': 'p', '--bq-marine': 's', '--bq-or': 'a' };
  C.appliquerPage(el, { couleurs: ['#1f6b55', '#0f3330', '#e6c98a'] }, noms);
  assert.deepEqual(Object.keys(etat).sort(), ['--bq-bordeaux', '--bq-marine', '--bq-or']);
  assert.equal(attrs['data-couleurs'], '1', "l'attribut réserve les dégradés personnalisés aux boutiques qui ont choisi leurs couleurs");
  C.appliquerPage(el, {}, noms);
  assert.deepEqual(etat, {}, 'plus de couleurs : tout est retiré');
  assert.deepEqual(attrs, {}, "et l'attribut aussi");
  C.appliquerPage(el, { couleurs: ['#1f6b55'] }, noms);
  assert.equal(Object.keys(etat).length, 3, 'une seule couleur suffit : les autres sont déduites');
});

/* ═════════════ 4. Câblage des six pages ═════════════ */
const PAGES = [
  ['boutique.html', 'assets/boutique-commerce.js', { couleurs: true, conditions: true }],
  ['boutique-video.html', 'assets/boutique-video.js', { couleurs: true, conditions: true }],
  ['portfolio.html', 'assets/boutique-portfolio.js', { couleurs: true, conditions: true }],
  ['boutique-evenements.html', 'assets/boutique-evenements.js', { couleurs: false, conditions: false }],
  ['boutique-impact.html', 'assets/boutique-impact.js', { couleurs: false, conditions: false }],
  ['boutique-finance.html', 'assets/boutique-finance.js', { couleurs: false, conditions: false }],
];
for (const [html, js, opt] of PAGES) {
  test(`W1 ${html} charge le module des réglages avant son script et l'utilise`, () => {
    const h = lire(html), s = lire(js);
    const iMod = h.indexOf('boutique-reglages-public.js'), iPage = h.lastIndexOf(path.basename(js));
    assert.ok(iMod > 0 && iPage > iMod, 'le module est chargé avant la page');
    assert.match(s, /definir\(etat\.init\.vitrine_reglages\)/);
    assert.match(s, /rp\('htmlLegal'\)/, 'informations légales dans le bas de page');
    assert.equal(/rp\('htmlConditions'/.test(s), opt.conditions, 'bloc livraison et conditions : seulement là où il y a des produits');
    assert.doesNotThrow(() => new (require('node:vm').Script)(s));
  });
}
for (const [html, js] of PAGES.filter(p => p[2].couleurs)) {
  test(`W2 ${html} applique les couleurs de la boutique (et l'aperçu instantané)`, () => {
    const h = lire(html), s = lire(js);
    assert.ok(h.indexOf('boutique-couleurs.js') > 0 && h.indexOf('boutique-types.js') > 0);
    assert.match(s, /appliquerCouleurs\(styleBoutique\(etat\.init\.vitrine_style_json\)\)/);
    assert.match(s, /da-vitrine-style/);
    const noms = /var NOMS_COULEURS = (\{[^}]*\});/.exec(s);
    assert.ok(noms, 'correspondance des variables');
    const vars = [...noms[1].matchAll(/'(--[a-z0-9-]+)'/g)].map(m => m[1]);
    const css = lire(js.replace('.js', '.css'));
    for (const v of vars) assert.ok(css.includes(v + ':'), `${v} est bien défini dans la feuille de style`);
  });
}

for (const [css, corps] of [['assets/boutique-commerce.css', 'body.bq'], ['assets/boutique-portfolio.css', 'body.pf'], ['assets/boutique-video.css', 'body.bv']]) {
  test(`W3 ${css} : les couleurs écrites en dur ne changent que pour une boutique personnalisée`, () => {
    const c = lire(css);
    const regles = c.split(String.fromCharCode(10)).filter(l => l.includes(corps + '[data-couleurs]'));
    assert.ok(regles.length >= 1, "règles réservées à l'attribut");
    for (const l of regles) assert.ok(l.startsWith(corps + '[data-couleurs]'), "aucune règle personnalisée ne s'applique sans l'attribut : " + l.slice(0, 60));
  });
}

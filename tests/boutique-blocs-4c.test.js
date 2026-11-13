/* ===========================================================
   tests/boutique-blocs-4c.test.js — Blocs faisables par type de boutique (lot 4C, 2026-11-13)
   ===========================================================
   Pages visiteur rejouées dans un faux navigateur (aucun serveur, aucune base) :
   1. Événements : inscription gratuite sur place, « Mes inscriptions », annulation.
   2. Vidéo : À propos, Avis des clients, Contact et réseaux sous le catalogue, qui suivent les rubriques.
   3. Commerce : pastille « -xx % » calculée sur le prix barré, tri du catalogue (prix, promotions).
   4. Impact : galerie photos, événements à venir, réseaux, filtre « Ouverts / Terminés » et rubriques choisies.
   Lancer : node --test tests/boutique-blocs-4c.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const JS_RUB = lire('assets/boutique-rubriques.js');
const JS_EV = lire('assets/boutique-evenements.js');
const JS_VID = lire('assets/boutique-video.js');
const JS_COM = lire('assets/boutique-commerce.js');
const JS_IMP = lire('assets/boutique-impact.js');

const attendre = (ms = 50) => new Promise((r) => setTimeout(r, ms));
const eteint = (...cles) => { const o = {}; cles.forEach((k) => { o[k] = { actif: false, ordre: 1, choisi: true }; }); return o; };

/* Faux navigateur : un élément par identifiant, écouteurs conservés pour rejouer clics et changements. */
function navigateur(ids, reponses, options = {}) {
  const ecouteurs = {};
  const el = (extra) => Object.assign({ innerHTML: '', textContent: '', hidden: true, className: '', classList: { add() {}, remove() {}, toggle() {} }, addEventListener(t, f) { (ecouteurs[`el:${t}`] = ecouteurs[`el:${t}`] || []).push(f); }, querySelector: () => null, querySelectorAll: () => [], setAttribute() {}, style: {} }, extra || {});
  const elements = {};
  ids.forEach((id) => { elements[id] = el(); });
  const appli = elements[ids[0]];
  const appels = [];
  const document = {
    getElementById: (id) => elements[id] || null, querySelector: () => null, querySelectorAll: () => [], title: '', contains: () => false,
    body: { style: { setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, classList: { add() {}, remove() {} } },
    addEventListener(t, f) { (ecouteurs[`doc:${t}`] = ecouteurs[`doc:${t}`] || []).push(f); },
  };
  const fetch = async (u, opt) => {
    const chemin = String(u).replace(/^\/api/, '');
    const methode = (opt && opt.method) || 'GET';
    appels.push(`${methode} ${chemin}`);
    const rep = reponses[`${methode} ${chemin}`] || (methode === 'GET' ? reponses[chemin] : undefined);
    return { ok: !!rep, status: rep ? 200 : 404, json: async () => rep || { error: 'Introuvable.' } };
  };
  const fenetre = {
    document, fetch, location: { search: options.recherche || '?id=3', origin: 'http://x', href: '', pathname: '/' }, navigator: {}, matchMedia: () => ({ matches: false }),
    addEventListener() {}, parent: null, localStorage: { getItem: () => null, setItem() {} }, confirm: () => true, scrollTo() {},
  };
  fenetre.parent = fenetre;
  fenetre.DA_verifierMaintenanceBoutique = async () => false;
  const ctx = vm.createContext(Object.assign(fenetre, { window: fenetre, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval, localStorage: fenetre.localStorage, console }));
  const cible = (attrs) => ({
    dataset: attrs, id: attrs.id || '',
    hasAttribute: (n) => n in attrs || (n.indexOf('data-') === 0 && n.slice(5) in attrs),
    getAttribute: (n) => (n in attrs ? attrs[n] : attrs[n.replace(/^data-/, '')]),
    closest(sel) { const noms = (String(sel).match(/\[data-([a-z-]+)\]/g) || []).map((x) => x.slice(6, -1)); return noms.some((n) => n in attrs) || (sel[0] === '#' && sel.slice(1) === attrs.id) ? this : null; }, disabled: false,
  });
  return {
    ctx, appli, elements, appels, ecouteurs,
    html: () => appli.innerHTML,
    clic(attrs, sur = 'el') { (ecouteurs[`${sur}:click`] || []).forEach((f) => f({ target: cible(attrs), preventDefault() {} })); },
    change(cibleObj) { (ecouteurs['doc:change'] || []).forEach((f) => f({ target: cibleObj })); },
  };
}

/* ═════════════ 1. Événements ═════════════ */
const jour = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const evt = (id, titre, plus = {}) => Object.assign({ id, titre, owner_user_id: 7, statut: 'publie', statut_temporel: 'a_venir', date_evt: jour(5 + id), heure_debut: '18:30', lieu: 'Salle', ville: 'Toulouse', type_evt: 'atelier', type_participation: 'gratuit', mode_participation: 'presentiel', inscription_ouverte: 1, nb_participants: 3, places_max: 30 }, plus);
const INIT_EV = { id: 3, nom: 'Maison des Rencontres', owner_user_id: 7, vitrine_type: 'events', description: 'La maison des rencontres de la communauté.' };
async function lancerEvenements({ moi = { id: 9, role: 'utilisateur' }, evenements, inscriptions = [], init = {}, extra = {} } = {}) {
  const evs = evenements || [evt(1, 'Atelier cuisine'), evt(2, 'Soirée payante', { type_participation: 'payant', prix_min: 15 })];
  const rep = Object.assign({
    '/initiatives/3': { initiative: Object.assign({}, INIT_EV, init) },
    '/evenements?owner=7&boutique=1': { evenements: evs },
    '/auth/me': { user: moi },
    '/evenements/participants/mine': { inscriptions: inscriptions.map((id) => ({ evenement_id: id })) },
    '/agenda/evenements-ajoutes': { ids: [] },
    'POST /evenements/1/rejoindre': { ok: true },
    'DELETE /evenements/1/quitter': { ok: true },
  }, extra);
  const nav = navigateur(['evb-app', 'evb-toast'], rep);
  vm.runInContext(JS_RUB, nav.ctx);
  vm.runInContext(JS_EV, nav.ctx);
  await attendre();
  return nav;
}
const onglets = (html) => (html.match(/data-onglet="([a-z_]+)"/g) || []).map((x) => x.slice(13, -1));

test("E1 visiteur non connecté : l'inscription renvoie vers la fiche, pas d'onglet « Mes inscriptions »", async () => {
  const nav = await lancerEvenements({ moi: null });
  assert.doesNotMatch(nav.html(), /data-inscrire/);
  assert.match(nav.html(), /evenements\.html\?evt=1/);
  assert.ok(!onglets(nav.html()).includes('mes'));
});

test('E1 connecté : un événement gratuit propose « S’inscrire » sur place, un événement payant garde le lien vers la fiche', async () => {
  const nav = await lancerEvenements();
  assert.match(nav.html(), /data-inscrire="1"/);
  assert.doesNotMatch(nav.html(), /data-inscrire="2"/, 'payant : le paiement passe par la fiche');
  assert.match(nav.html(), /evenements\.html\?evt=2/);
  assert.deepEqual(onglets(nav.html()).filter((o) => o === 'mes'), ['mes']);
});

test("E1 le clic sur « S’inscrire » appelle l'inscription réelle puis confirme", async () => {
  const nav = await lancerEvenements();
  nav.clic({ inscrire: '1' }, 'el');
  await attendre();
  assert.ok(nav.appels.includes('POST /evenements/1/rejoindre'));
  assert.equal(nav.elements['evb-toast'].textContent, 'Inscription enregistrée.');
});

test('E1 une inscription refusée par le serveur affiche son message et ne change rien', async () => {
  const nav = await lancerEvenements({ extra: { 'POST /evenements/1/rejoindre': undefined } });
  nav.clic({ inscrire: '1' }, 'el');
  await attendre();
  assert.ok(nav.appels.includes('POST /evenements/1/rejoindre'));
  assert.notEqual(nav.elements['evb-toast'].textContent, 'Inscription enregistrée.');
});

test('E1 déjà inscrit : bouton « Inscrit » bloqué, onglet « Mes inscriptions » rempli, annulation possible', async () => {
  const nav = await lancerEvenements({ inscriptions: [1] });
  assert.match(nav.html(), /disabled>Inscrit</);
  assert.doesNotMatch(nav.html(), /data-inscrire="1"/);
  nav.clic({ onglet: 'mes' }, 'el');
  await attendre();
  assert.match(nav.html(), /Mes inscriptions/);
  assert.match(nav.html(), /data-quitter="1"/, "l'annulation est proposée dans « Mes inscriptions »");
  nav.clic({ quitter: '1' }, 'el');
  await attendre();
  assert.ok(nav.appels.includes('DELETE /evenements/1/quitter'));
  assert.equal(nav.elements['evb-toast'].textContent, 'Inscription annulée.');
});

test('E1 sans la rubrique Réservation, plus aucune inscription ni onglet « Mes inscriptions »', async () => {
  const nav = await lancerEvenements({ init: { vitrine_modules_state: eteint('reservation') } });
  assert.doesNotMatch(nav.html(), /data-inscrire/);
  assert.ok(!onglets(nav.html()).includes('mes'));
});

/* ═════════════ 2. Vidéo ═════════════ */
const INIT_VID = {
  id: 3, nom: 'Studio Baobab', owner_user_id: 7, vitrine_type: 'video', description: 'Un studio de films documentaires sur les diasporas africaines.',
  site_web: 'baobab.example.org', reseaux_sociaux: JSON.stringify({ youtube: 'https://youtube.com/@baobab' }),
};
async function lancerVideo(init = {}, avis) {
  const rep = {
    '/initiatives/3': { initiative: Object.assign({}, INIT_VID, init) },
    '/initiatives/3/produits': { produits: [] },
    '/initiatives/3/avis': avis || { total: 2, moyenne: 4.5, avis: [{ commentaire: 'Film magnifique, très émouvant.', prenom: 'Awa', nom: 'Diop' }, { commentaire: '', prenom: 'X', nom: 'Y' }] },
    '/auth/me': { user: null },
  };
  const nav = navigateur(['bv-app', 'bv-toast', 'bv-modal'], rep);
  vm.runInContext(JS_RUB, nav.ctx);
  vm.runInContext(JS_VID, nav.ctx);
  await attendre();
  return nav.html();
}

test('V1 la page Vidéo présente À propos, avis des clients, contact et réseaux sous le catalogue', async () => {
  const html = await lancerVideo();
  assert.match(html, /bv-pres/);
  assert.match(html, /<h2>À propos<\/h2>/);
  assert.match(html, /films documentaires/);
  assert.match(html, /<h2>Avis des clients<\/h2>/);
  assert.match(html, /Film magnifique/);
  assert.doesNotMatch(html, /<cite>X Y\.<\/cite>/, 'un avis sans commentaire est ignoré');
  assert.match(html, /<h2>Contact<\/h2>/);
  assert.match(html, /href="messagerie\.html\?with=7/);
  assert.match(html, /href="https:\/\/baobab\.example\.org"/, 'le site sans « https:// » est complété');
  assert.match(html, /https:\/\/youtube\.com\/@baobab/);
});

test('V1 chaque rubrique éteinte retire son bloc, et seulement lui', async () => {
  assert.doesNotMatch(await lancerVideo({ vitrine_modules_state: eteint('a_propos') }), /<h2>À propos<\/h2>/);
  assert.match(await lancerVideo({ vitrine_modules_state: eteint('a_propos') }), /<h2>Avis des clients<\/h2>/);
  assert.doesNotMatch(await lancerVideo({ vitrine_modules_state: eteint('avis') }), /<h2>Avis des clients<\/h2>/);
  const sansContact = await lancerVideo({ vitrine_modules_state: eteint('contact') });
  assert.doesNotMatch(sansContact, /Nous écrire/);
  assert.match(sansContact, /youtube\.com/, 'les réseaux restent tant que leur rubrique est active');
  const sansReseaux = await lancerVideo({ vitrine_modules_state: eteint('reseaux_sociaux') });
  assert.doesNotMatch(sansReseaux, /youtube\.com/);
  assert.match(sansReseaux, /Nous écrire/);
});

test("V1 sans description, sans avis ni réseau : aucun bloc vide n'est affiché", async () => {
  const html = await lancerVideo({ description: '', site_web: '', reseaux_sociaux: '{}', vitrine_modules_state: eteint('contact') }, { total: 0, moyenne: 0, avis: [] });
  assert.doesNotMatch(html, /bv-pres"/);
});

/* ═════════════ 3. Commerce ═════════════ */
const PRODUITS = [
  { id: 1, nom: 'Sac en pagne', prix: 40, prix_promo: 30, statut: 'disponible', categorie: 'Sacs', photo_url: '', stock: 5 },
  { id: 2, nom: 'Bracelet perlé', prix: 10, statut: 'disponible', categorie: 'Bijoux', photo_url: '', stock: 5 },
  { id: 3, nom: 'Tissu wax', prix: 25, prix_promo: 20, statut: 'disponible', categorie: 'Tissus', photo_url: '', stock: 5 },
  { id: 4, nom: 'Prix absurde', prix: 10, prix_promo: 15, statut: 'disponible', categorie: 'Bijoux', photo_url: '', stock: 5 },
];
async function lancerCommerce() {
  const rep = {
    '/initiatives/3': { initiative: { id: 3, nom: 'Boutique Soleil', owner_user_id: 7, vitrine_type: 'commerce', description: 'Mode et accessoires.' } },
    '/initiatives/3/produits': { produits: PRODUITS },
    '/initiatives/3/catalogues': { catalogues: [] },
    '/initiatives/3/avis': { total: 0, moyenne: 0, avis: [] },
    '/auth/me': { user: null },
    '/evenements': { evenements: [] },
    '/formations': { formations: [] },
  };
  const nav = navigateur(['bq-app', 'bq-toast', 'bq-modal'], rep);
  vm.runInContext(JS_RUB, nav.ctx);
  vm.runInContext(JS_COM, nav.ctx);
  await attendre(80);
  nav.clic({ act: 'tout' }, 'doc');
  await attendre();
  return nav;
}
const positions = (html, noms) => noms.map((n) => html.indexOf(n));
const croissant = (p) => p.every((x, i) => x >= 0 && (i === 0 || x > p[i - 1]));

test('C1 la liste du catalogue affiche la réduction réelle (-25 %, -20 %), jamais pour un prix promo supérieur au prix', async () => {
  const nav = await lancerCommerce();
  const html = nav.html();
  assert.match(html, /bq-reduc[^>]*>-25 %</, '40 → 30 = -25 %');
  assert.match(html, /bq-reduc[^>]*>-20 %</, '25 → 20 = -20 %');
  assert.equal((html.match(/class="bq-reduc"/g) || []).length, 2, 'le produit à prix promo supérieur n’a pas de pastille');
});

test('C1 le tri propose 5 critères et reclasse les produits (prix croissant, décroissant, promotions d’abord)', async () => {
  const nav = await lancerCommerce();
  assert.match(nav.html(), /<select id="bq-tri">/);
  assert.equal((nav.html().match(/<option value=/g) || []).length, 5);
  const noms = ['Bracelet perlé', 'Tissu wax', 'Sac en pagne'];
  nav.change({ id: 'bq-tri', value: 'prix_asc' });
  assert.ok(croissant(positions(nav.html(), noms)), 'prix croissant : 10 puis 20 (promo) puis 30 (promo)');
  nav.change({ id: 'bq-tri', value: 'prix_desc' });
  assert.ok(croissant(positions(nav.html(), ['Sac en pagne', 'Tissu wax', 'Bracelet perlé'])), 'prix décroissant');
  nav.change({ id: 'bq-tri', value: 'promos' });
  const h = nav.html();
  assert.ok(h.indexOf('Bracelet perlé') > h.indexOf('Sac en pagne') && h.indexOf('Bracelet perlé') > h.indexOf('Tissu wax'), 'les produits en promotion passent avant les autres');
});

/* ═════════════ 4. Impact ═════════════ */
const camp = (id, titre, statut, plus = {}) => Object.assign({ id, slug: `c${id}`, titre, statut, owner_user_id: 7, initiative_id: 3, type_don: 'campagne', objectif: 1000, montant_collecte: 200, categorie: 'Éducation' }, plus);
const INIT_IMP = { id: 3, nom: 'Association Horizon', owner_user_id: 7, vitrine_type: 'impact', description: 'Une association de développement local.',
  galerie_json: JSON.stringify([{ url: '/img/g1.jpg', titre: 'Inauguration du puits' }, 'javascript:alert(1)', { url: '/img/g2.jpg' }]),
  reseaux_sociaux: JSON.stringify({ facebook: 'https://facebook.com/horizon' }), site_web: 'horizon.example.org' };
async function lancerImpact(init = {}, { campagnes, evenements } = {}) {
  const rep = {
    '/initiatives/3': { initiative: Object.assign({}, INIT_IMP, init) },
    '/cagnottes/publiques?owner_user_id=7': { cagnottes: campagnes || [camp(1, 'Puits du village', 'active'), camp(2, 'École rénovée', 'terminee'), camp(3, 'Cantine scolaire', 'active')] },
    '/initiatives/3/partenaires': { partenaires: [] },
    '/evenements?owner=7&boutique=1': { evenements: evenements || [evt(1, 'Gala de solidarité', { ville: 'Lyon', pays: 'France' }), evt(2, 'Ancienne soirée', { statut_temporel: 'termine' }), evt(3, 'Brouillon', { statut: 'brouillon' })] },
    '/auth/me': { user: null },
  };
  const nav = navigateur(['imp-app', 'imp-liste'], rep);
  vm.runInContext(JS_RUB, nav.ctx);
  vm.runInContext(JS_IMP, nav.ctx);
  await attendre(80);
  return nav;
}

test('I1 la page Impact montre la galerie, les événements à venir et les réseaux, sans image dangereuse', async () => {
  const nav = await lancerImpact();
  const html = nav.html();
  assert.match(html, /id="galerie"/);
  assert.match(html, /Inauguration du puits/);
  assert.match(html, /\/img\/g2\.jpg/);
  assert.doesNotMatch(html, /javascript:/);
  assert.match(html, /id="evenements"/);
  assert.match(html, /Gala de solidarité/);
  assert.doesNotMatch(html, /Ancienne soirée/, 'un événement terminé n’est pas « à venir »');
  assert.doesNotMatch(html, /Brouillon/);
  assert.match(html, /id="reseaux"/);
  assert.match(html, /https:\/\/facebook\.com\/horizon/);
  assert.match(html, /https:\/\/horizon\.example\.org/);
  assert.match(html, /href="#galerie"/, 'la barre de rubriques propose la galerie');
  assert.match(html, /href="#evenements"/);
});

test('I1 chaque rubrique éteinte retire son bloc et son entrée de menu, et seulement elle', async () => {
  const sans = async (...c) => (await lancerImpact({ vitrine_modules_state: eteint(...c) })).html();
  const h1 = await sans('galerie_photos');
  assert.doesNotMatch(h1, /id="galerie"/); assert.doesNotMatch(h1, /href="#galerie"/); assert.match(h1, /id="evenements"/);
  const h2 = await sans('evenements');
  assert.doesNotMatch(h2, /id="evenements"/); assert.match(h2, /id="galerie"/);
  const h3 = await sans('reseaux_sociaux');
  assert.doesNotMatch(h3, /id="reseaux"/); assert.match(h3, /id="galerie"/);
});

test('I1 le filtre « Ouverts / Terminés » classe les projets et se rejoue au clic', async () => {
  const nav = await lancerImpact();
  assert.match(nav.html(), /data-statut="ouverts"/);
  assert.match(nav.html(), /École rénovée/);
  assert.match(nav.html(), /Puits du village/);
  nav.clic({ statut: 'ouverts' }, 'el');
  await attendre();
  const zone = nav.elements['imp-liste'].innerHTML;
  assert.match(zone, /Puits du village/);
  assert.match(zone, /Cantine scolaire/);
  assert.doesNotMatch(zone, /École rénovée/, 'les projets terminés sont masqués');
  nav.clic({ statut: 'termines' }, 'el');
  await attendre();
  assert.match(nav.elements['imp-liste'].innerHTML, /École rénovée/);
  assert.doesNotMatch(nav.elements['imp-liste'].innerHTML, /Puits du village/);
  nav.clic({ statut: '' }, 'el');
  await attendre();
  assert.match(nav.elements['imp-liste'].innerHTML, /Puits du village/);
  assert.match(nav.elements['imp-liste'].innerHTML, /École rénovée/);
});

test('I1 le filtre de statut n’apparaît pas quand tous les projets sont dans le même état', async () => {
  const nav = await lancerImpact({}, { campagnes: [camp(1, 'Puits du village', 'active'), camp(3, 'Cantine scolaire', 'active')] });
  assert.doesNotMatch(nav.html(), /data-statut=/);
});

test('I1 une boutique Impact sans galerie, sans événement ni réseau n’affiche aucun bloc vide', async () => {
  const nav = await lancerImpact({ galerie_json: '[]', reseaux_sociaux: '{}', site_web: '' }, { evenements: [] });
  const html = nav.html();
  assert.doesNotMatch(html, /id="galerie"/);
  assert.doesNotMatch(html, /id="evenements"/);
  assert.doesNotMatch(html, /id="reseaux"/);
});

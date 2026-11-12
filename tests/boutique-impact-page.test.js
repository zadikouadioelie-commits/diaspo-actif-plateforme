/* Tests — page publique « Projet Impact » (lot E, 2026-11-12).
   Lancer : node --test tests/boutique-impact-page.test.js
   1. Le type « impact » a une page dédiée dans le registre ; l'ancien type « projet » n'est pas redirigé avant la bascule.
   2. La page se charge, lit les vraies API (initiative, cagnottes publiques, partenaires) et affiche projets, vision, résultats, besoins.
   3. Respect des choix du créateur (montants et contributeurs masqués, rubriques désactivées), texte sûr, couleurs, aucune émoticône. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BT = require('../server/boutique-types.js');

const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const JS = lire('assets/boutique-impact.js');

/* ═════════════ 1. Registre et redirection ═════════════ */
test('I1 le type « impact » a une page dédiée dans le registre', () => {
  assert.ok(BT.PAGES_DEDIEES.includes('impact'));
  const reg = BT.REGISTRE.TYPES.impact;
  assert.ok(reg, 'le type existe dans le registre');
});

test('I1 un visiteur de la clé « impact » est envoyé sur la page ; l\'ancien type « projet » reste inchangé', () => {
  const html = lire('profil-app.html');
  assert.match(html, /vitrine_type === 'impact'\) \{ location\.replace\('boutique-impact\.html\?id='/);
  assert.ok(!/vitrine_type === 'projet'\)\s*\{\s*location\.replace\('boutique-impact/.test(html), 'l\'ancien type n\'est pas redirigé avant la bascule');
});

/* ═════════════ 2. La page dans un faux navigateur ═════════════ */
const AUJ = new Date();
const jour = (n) => new Date(AUJ.getTime() + n * 86400000).toISOString().slice(0, 10);
const CAMP = [
  { id: 1, slug: 'ecole', titre: 'École de quartier', description: '<p>Construire <script>alert(1)</script>une école</p>', categorie: 'Éducation', owner_user_id: 7, initiative_id: 3, type_don: 'campagne', objectif_montant: 10000, montant_collecte: 4500, pourcentage: 45, devise: 'EUR', nb_contributeurs: 30, date_fin: jour(10), statut: 'active', image_url: 'https://exemple.org/a.jpg' },
  { id: 2, slug: 'puits', titre: 'Puits solaire', categorie: 'Santé', owner_user_id: 7, initiative_id: 3, type_don: 'campagne', objectif_montant: 5000, montant_collecte: 5200, pourcentage: 100, devise: 'EUR', nb_contributeurs: 12, statut: 'active' },
  { id: 3, slug: 'masque', titre: 'Collecte discrète', categorie: 'Santé', owner_user_id: 7, initiative_id: 3, type_don: 'campagne', objectif_montant: 2000, montant_collecte: 877, pourcentage: 44, devise: 'EUR', nb_contributeurs: 8, afficher_montants: 0, afficher_participants: 0, statut: 'active' },
  { id: 4, slug: 'autre-init', titre: 'Projet d\'une autre boutique', categorie: 'Santé', owner_user_id: 7, initiative_id: 99, type_don: 'campagne', statut: 'active' },
  { id: 5, slug: 'don-mensuel', titre: 'Don mensuel', owner_user_id: 7, initiative_id: 3, type_don: 'recurrent', est_vedette: 1, statut: 'active' },
  { id: 6, slug: 'ancienne', titre: 'Collecte passée', categorie: 'Éducation', owner_user_id: 7, initiative_id: 3, type_don: 'campagne', objectif_montant: 1000, montant_collecte: 300, pourcentage: 30, devise: 'EUR', nb_contributeurs: 5, statut: 'expiree' },
];
const INIT = {
  id: 3, nom: 'Maison du Partage', owner_user_id: 7, vitrine_type: 'impact', slogan: 'Agir ensemble, ici et là-bas', ville: 'Lyon', pays: 'France',
  description: '<p>Une association au service des familles.</p>', vitrine_vision_objectifs: '<p>Un accès à l\'école pour <b>chaque</b> enfant.</p><p>Une eau saine dans chaque village.</p>',
  vitrine_resultats_impact: [{ valeur: '500+', libelle: 'enfants accompagnés' }, { valeur: '12', libelle: 'villages équipés' }],
  besoins: ['Bénévoles', 'Matériel scolaire'],
  vitrine_equipe_json: JSON.stringify([{ nom: 'Awa Diop', fonction: 'Présidente' }, { nom: 'Karim <b>Sow</b>', fonction: 'Trésorier', photo: 'javascript:alert(2)' }]),
  realisations: [{ titre: 'Bibliothèque ouverte', description: 'Mille livres donnés.', image: 'https://exemple.org/b.jpg', lien: 'https://exemple.org/biblio' }],
  vitrine_style_json: JSON.stringify({ couleurs: ['#1e5e91', '#d9534f', '#2e8b57'] }),
};
const PARTS = [{ nom: 'Fondation Horizon', type_partenaire: 'Fondation', logo_url: 'https://exemple.org/logo.png', site_web: 'exemple.org' }, { nom: 'Mairie de Lyon' }];

async function lancer({ camp = CAMP, init = {}, parts = PARTS, maintenance = false, url = '?id=3' } = {}) {
  const appels = [];
  const gestionnaires = [];
  const liste = { innerHTML: '' };
  const app = { innerHTML: '', addEventListener: (t, f) => gestionnaires.push(f) };
  const elements = { 'imp-app': app, 'imp-liste': liste };
  const styles = {};
  const document = {
    getElementById: (id) => elements[id] || null, querySelector: () => null, querySelectorAll: () => [], title: '',
    body: { style: { setProperty: (k, v) => { styles[k] = v; } } }, addEventListener() {},
  };
  const reponses = {
    '/initiatives/3': { initiative: Object.assign({}, INIT, init) },
    '/cagnottes/publiques?owner_user_id=7': { cagnottes: camp },
    '/initiatives/3/partenaires': { partenaires: parts },
    '/auth/me': { user: null },
  };
  const fetch = async (u) => {
    const chemin = String(u).replace(/^\/api/, ''); appels.push(chemin);
    const rep = reponses[chemin];
    return { ok: !!rep, status: rep ? 200 : 404, json: async () => rep || { error: 'Introuvable.' } };
  };
  const fenetre = { document, fetch, location: { search: url, origin: 'http://x', href: '' }, navigator: {}, addEventListener() {}, parent: null };
  fenetre.parent = fenetre;
  if (maintenance !== null) fenetre.DA_verifierMaintenanceBoutique = async () => maintenance;
  const ctx = vm.createContext(Object.assign(fenetre, { window: fenetre, URLSearchParams, setTimeout, clearTimeout, Date, console }));
  vm.runInContext(JS, ctx);
  await new Promise((r) => setTimeout(r, 30));
  /* Simule un clic sur un élément portant les attributs demandés. */
  const clic = (attrs) => {
    const cible = { closest: (sel) => { const m = /^\[(data-[a-z]+)\]$/.exec(sel); return m && attrs[m[1]] !== undefined ? { getAttribute: (n) => attrs[n] } : null; } };
    gestionnaires.forEach((f) => f({ target: cible }));
  };
  return { html: app.innerHTML, appels, styles, liste, clic };
}

test('I2 la page lit l\'initiative, les cagnottes publiques de son propriétaire et les partenaires, puis les affiche', async () => {
  const { html, appels } = await lancer();
  assert.deepEqual(appels.slice(0, 1), ['/initiatives/3']);
  assert.ok(appels.includes('/cagnottes/publiques?owner_user_id=7'));
  assert.ok(appels.includes('/initiatives/3/partenaires'));
  assert.match(html, /Maison du Partage/);
  assert.match(html, /École de quartier/);
  assert.match(html, /Puits solaire/);
  assert.match(html, /Bibliothèque ouverte/);
  assert.match(html, /Fondation Horizon/);
  assert.match(html, /500\+/);
  assert.match(html, /Matériel scolaire/);
  assert.match(html, /Awa Diop/);
  assert.match(html, /Présidente/);
  assert.match(html, /Une eau saine dans chaque village/);
});

test('I2 seules les collectes de CETTE boutique sont des projets ; un don récurrent sert au bouton « Faire un don »', async () => {
  const { html } = await lancer();
  assert.ok(!html.includes('autre boutique'), 'cagnotte rattachée à une autre initiative écartée');
  assert.ok(!html.includes('<h3>Don mensuel</h3>'), 'un don récurrent n\'est pas une carte de projet');
  assert.match(html, /href="cagnotte\.html\?slug=don-mensuel"[^>]*>[^<]*<svg[\s\S]*?<\/svg>Faire un don/);
  assert.match(html, /cagnotte\.html\?slug=ecole/, 'lien de soutien vers la page de cagnotte');
});

test('I2 l\'avancement des collectes est affiché ; objectif atteint et collecte terminée sont signalés', async () => {
  const { html } = await lancer();
  assert.match(html, /<b>45 %<\/b>/);
  assert.match(html, /Objectif atteint/);
  assert.match(html, /Collecte terminée/);
  /* La collecte se termine à la fin du dernier jour : le décompte l'inclut (10 ou 11 selon l'heure). */
  assert.match(html, /1[01] jours restants/);
  assert.match(html, /Soutenir ce projet/);
  assert.match(html, /Voir le projet/, 'collecte terminée : simple consultation');
});

test('I2 les chiffres du bandeau ne comptent que ce que chaque créateur accepte de montrer', async () => {
  const { html } = await lancer();
  /* 4 500 + 5 200 + 300 = 10 000 € ; la collecte « discrète » (877 €) est exclue ; soutiens : 30 + 12 + 5 = 47 (les 8 masqués exclus). */
  assert.match(html, /10[\s  ]000[\s  ]€/);
  assert.match(html, /<b>47<\/b><span>soutiens reçus<\/span>/);
  assert.ok(!/877/.test(html), 'montant masqué jamais affiché');
  assert.match(html, /<b>5<\/b><span>projets présentés<\/span>/, '4 collectes + 1 réalisation');
});

test('I3 une rubrique désactivée par le créateur n\'est pas affichée', async () => {
  const { html } = await lancer({ init: { vitrine_modules_state: { resultats_impact: { actif: false }, besoins_projet: { actif: false }, partenaires: { actif: false }, equipe: { actif: false } } } });
  assert.ok(!html.includes('Awa Diop'));
  assert.ok(!html.includes('id="resultats"'));
  assert.ok(!html.includes('id="besoins"'));
  assert.ok(!html.includes('id="partenaires"'));
  assert.ok(!html.includes('Fondation Horizon'));
  assert.match(html, /id="projets"/, 'les autres rubriques restent');
});

test('I3 le texte venu de la base est affiché sans balises et les adresses d\'image dangereuses sont refusées', async () => {
  const sale = [Object.assign({}, CAMP[0], { titre: '<img src=x onerror=alert(1)>', image_url: 'javascript:alert(1)' })];
  const { html } = await lancer({ camp: sale });
  assert.ok(!html.includes('<img src=x'), 'le titre est échappé');
  assert.match(html, /&lt;img src=x/);
  assert.ok(!/javascript:/i.test(html), 'adresse d\'image dangereuse refusée');
  assert.ok(!html.includes('<script>alert'), 'balises du texte riche retirées');
  assert.ok(!html.includes('<b>chaque</b>'), 'la vision est en texte simple');
});

test('I3 les couleurs de la boutique sont appliquées, sinon Marine, Orange et Vert', async () => {
  const a = await lancer();
  assert.equal(a.styles['--c1'], '#1e5e91');
  assert.equal(a.styles['--c2'], '#d9534f');
  assert.equal(a.styles['--c3'], '#2e8b57');
  assert.equal(a.styles['--on-navy'], '#ffffff', 'texte blanc sur une couleur principale sombre');
  const b = await lancer({ init: { vitrine_style_json: null } });
  assert.equal(b.styles['--c1'], '#0d2750');
  assert.equal(b.styles['--c2'], '#f47c20');
  const clair = await lancer({ init: { vitrine_style_json: JSON.stringify({ couleurs: ['#f5e6a8'] }) } });
  assert.equal(clair.styles['--on-navy'], '#0d1b2a', 'texte sombre sur une couleur principale claire');
});

test('I4 le filtre par catégorie réduit la liste ; « Afficher plus » ajoute des projets', async () => {
  const { liste, clic, html } = await lancer();
  assert.match(html, /data-cat="Éducation"/);
  assert.match(html, /data-cat="Santé"/);
  clic({ 'data-cat': 'Éducation' });
  assert.match(liste.innerHTML, /École de quartier/);
  assert.match(liste.innerHTML, /Collecte passée/);
  assert.ok(!liste.innerHTML.includes('Puits solaire'));
  clic({ 'data-cat': '' });
  assert.match(liste.innerHTML, /Puits solaire/);
  const beaucoup = [];
  for (let i = 0; i < 9; i++) beaucoup.push(Object.assign({}, CAMP[1], { id: 100 + i, slug: 'p' + i, titre: 'Projet numéro ' + i }));
  const r = await lancer({ camp: beaucoup });
  const m = await lancer({ camp: beaucoup });
  m.clic({ 'data-plus': '1' });
  assert.equal((m.liste.innerHTML.match(/class="carte"/g) || []).length, 9, 'six projets, puis tous');
  assert.match(r.html, /Afficher plus de projets \(3\)/);
});

test('I4 aucun projet : message clair ; boutique inconnue : message clair ; maintenance : rien n\'est chargé', async () => {
  const vide = await lancer({ camp: [], parts: [], init: { realisations: [], besoins: [], vitrine_equipe_json: '', vitrine_resultats_impact: [], vitrine_vision_objectifs: '', description: '' } });
  assert.match(vide.html, /n’a pas encore publié de projet/);
  const absente = await lancer({ url: '' });
  assert.match(absente.html, /Aucune boutique indiquée/);
  const arret = await lancer({ maintenance: true });
  assert.deepEqual(arret.appels, [], 'en maintenance, aucune donnée n\'est demandée');
});

/* ═════════════ 3. Qualité ═════════════ */
test('I5 la page n\'utilise aucune émoticône et ne code aucun paiement', () => {
  const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  for (const f of ['boutique-impact.html', 'assets/boutique-impact.js', 'assets/boutique-impact.css']) {
    assert.ok(!emo.test(lire(f)), `${f} contient une émoticône`);
  }
  assert.ok(!/stripe|\/panier|paiement\//i.test(JS.replace(/aucun paiement[^\n]*/gi, '')), 'aucun appel de paiement');
});

test('I5 la page charge ses fichiers et les modules partagés (couleurs, maintenance)', () => {
  const html = lire('boutique-impact.html');
  for (const s of ['boutique-impact.css', 'boutique-impact.js', 'boutique-couleurs.js', 'boutique-maintenance.js', 'boutique-types.js']) assert.ok(html.includes(s), s);
  assert.doesNotThrow(() => new vm.Script(JS), 'le script est valide');
  assert.ok(fs.existsSync(path.join(RACINE, 'assets/boutique-impact.css')));
});

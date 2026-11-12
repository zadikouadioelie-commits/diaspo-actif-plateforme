/* Tests — page publique « Créateur d'événements » (lot E, 2026-11-12).
   Lancer : node --test tests/boutique-evenements-page.test.js
   1. Le type « events » a une page dédiée dans le registre ; les types sans page (impact, finance) n'en ont pas encore.
   2. La page se charge, lit les vraies API et affiche les événements (exécutée dans un faux navigateur, sans réseau).
   3. Règles d'inscription, filtres, texte sûr, aucune émoticône, redirection des visiteurs. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BT = require('../server/boutique-types.js');

const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const JS = lire('assets/boutique-evenements.js');

/* ═════════════ 1. Registre et redirection ═════════════ */
test('E1 le type « events » a une page dédiée ; impact et finance n\'en ont pas encore', () => {
  assert.ok(BT.PAGES_DEDIEES.includes('events'));
  assert.ok(!BT.PAGES_DEDIEES.includes('impact'));
  assert.ok(!BT.PAGES_DEDIEES.includes('finance'));
});

test('E1 un visiteur de la clé « events » est envoyé sur la page ; l\'ancien type « evenement » reste inchangé', () => {
  const html = lire('profil-app.html');
  assert.match(html, /vitrine_type === 'events'\) \{ location\.replace\('boutique-evenements\.html\?id='/);
  assert.ok(!/vitrine_type === 'evenement'\)\s*\{\s*location\.replace\('boutique-evenements/.test(html), 'l\'ancien type n\'est pas redirigé avant la bascule');
});

/* ═════════════ 2. La page dans un faux navigateur ═════════════ */
const AUJ = new Date();
const jour = (n) => new Date(AUJ.getTime() + n * 86400000).toISOString().slice(0, 10);
const EVTS = [
  { id: 1, titre: 'Atelier cuisine', owner_user_id: 7, statut: 'publie', statut_temporel: 'a_venir', date_evt: jour(5), heure_debut: '18:30', heure_fin: '21:00', lieu: 'Salle', ville: 'Toulouse', type_evt: 'atelier', type_participation: 'payant', prix_min: 12, places_max: 20, nb_participants: 14, mode_participation: 'presentiel', inscription_ouverte: 1, fiche_slug: 'atelier-cuisine', description: '<p>Un atelier <script>alert(1)</script>pratique</p>' },
  { id: 2, titre: 'Webinaire gratuit', owner_user_id: 7, statut: 'publie', statut_temporel: 'a_venir', date_evt: jour(9), type_evt: 'webinaire', type_participation: 'gratuit', prix_min: 0, mode_participation: 'distanciel', inscription_ouverte: 1, lien_inscription: 'https://exemple.org/inscription' },
  { id: 3, titre: 'Soirée complète', owner_user_id: 7, statut: 'publie', statut_temporel: 'a_venir', date_evt: jour(12), type_evt: 'gala', places_max: 10, nb_participants: 10, mode_participation: 'presentiel', inscription_ouverte: 1 },
  { id: 4, titre: 'Annonce informative', owner_user_id: 7, statut: 'publie', statut_temporel: 'a_venir', date_evt: jour(3), type_evt: 'evenement', mode_participation: 'presentiel', inscription_ouverte: 0 },
  { id: 5, titre: 'Gala passé', owner_user_id: 7, statut: 'publie', statut_temporel: 'termine', est_termine: true, date_evt: jour(-30), type_evt: 'gala', mode_participation: 'presentiel', inscription_ouverte: 1 },
  { id: 6, titre: 'Brouillon caché', owner_user_id: 7, statut: 'brouillon', statut_temporel: 'a_venir', date_evt: jour(2), mode_participation: 'presentiel' },
  { id: 7, titre: 'Événement d\'un autre compte', owner_user_id: 99, statut: 'publie', statut_temporel: 'a_venir', date_evt: jour(2), mode_participation: 'presentiel' },
];

async function lancer({ evts = EVTS, init = {}, maintenance = false, url = '?id=3' } = {}) {
  const appels = [];
  const app = { innerHTML: '', addEventListener() {} };
  const elements = { 'evb-app': app, 'evb-toast': { classList: { add() {}, remove() {} } } };
  const styles = {};
  const document = {
    getElementById: (id) => elements[id] || null, querySelector: () => null, querySelectorAll: () => [], title: '', contains: () => false,
    body: { style: { setProperty: (k, v) => { styles[k] = v; } } }, addEventListener() {},
  };
  const reponses = {
    '/initiatives/3': { initiative: Object.assign({ id: 3, nom: 'Maison des Rencontres', owner_user_id: 7, vitrine_type: 'events', slogan: 'Rencontres de la communauté', vitrine_style_json: JSON.stringify({ couleurs: ['#1e5e91', '#0f3330', '#e6c98a'] }) }, init) },
    '/evenements?owner=7&boutique=1': { evenements: evts },
    '/auth/me': { user: null },
    '/agenda/evenements-ajoutes': { ids: [] },
  };
  const fetch = async (u) => {
    const chemin = String(u).replace(/^\/api/, ''); appels.push(chemin);
    const rep = reponses[chemin];
    return { ok: !!rep, status: rep ? 200 : 404, json: async () => rep || { error: 'Introuvable.' } };
  };
  const fenetre = { document, fetch, location: { search: url, origin: 'http://x', href: '' }, navigator: {}, matchMedia: () => ({ matches: false }), addEventListener() {}, parent: null };
  fenetre.parent = fenetre;
  if (maintenance !== null) fenetre.DA_verifierMaintenanceBoutique = async () => maintenance;
  const ctx = vm.createContext(Object.assign(fenetre, { window: fenetre, URLSearchParams, setTimeout, clearTimeout, console }));
  vm.runInContext(JS, ctx);
  await new Promise((r) => setTimeout(r, 30));
  return { html: app.innerHTML, appels, styles, document };
}

test('E2 la page lit l\'initiative et les événements de son propriétaire, puis les affiche', async () => {
  const { html, appels } = await lancer();
  assert.deepEqual(appels.slice(0, 2), ['/initiatives/3', '/evenements?owner=7&boutique=1']);
  assert.match(html, /Maison des Rencontres/);
  assert.match(html, /Atelier cuisine/);
  assert.match(html, /Webinaire gratuit/);
});

test('E2 ni brouillon ni événement d\'un autre compte, et les terminés restent dans leur onglet', async () => {
  const { html } = await lancer();
  assert.ok(!html.includes('Brouillon caché'));
  assert.ok(!html.includes('autre compte'));
  assert.ok(!html.includes('Gala passé'), 'le passé n\'est pas dans « À venir »');
  assert.match(html, /Terminés <span class="n">1<\/span>/);
});

test('E2 le texte venu de la base est affiché sans balises', async () => {
  const { html } = await lancer({ evts: [Object.assign({}, EVTS[0], { titre: '<img src=x onerror=alert(1)>' })] });
  assert.ok(!html.includes('<img src=x'), 'le titre est échappé');
  assert.match(html, /&lt;img src=x/);
});

test('E2 les couleurs de la boutique sont appliquées, sinon Bordeaux et Or', async () => {
  const a = await lancer();
  assert.equal(a.styles['--c1'], '#1e5e91');
  assert.equal(a.styles['--c3'], '#e6c98a');
  const b = await lancer({ init: { vitrine_style_json: null } });
  assert.equal(b.styles['--c1'], '#83172f');
  assert.equal(b.styles['--c3'], '#d8b36a');
});

test('E2 les règles du bouton d\'inscription suivent celles de la plateforme', async () => {
  const { html } = await lancer();
  assert.match(html, /inscription-publique\.html\?slug=atelier-cuisine/, 'fiche publiée : page d\'inscription');
  assert.match(html, /href="https:\/\/exemple\.org\/inscription"[^>]*rel="noopener noreferrer"/, 'lien externe de l\'organisateur');
  assert.match(html, /<button type="button" class="btn or" disabled>Complet<\/button>/, 'complet');
  assert.match(html, /<button type="button" class="btn or" disabled>Événement informatif<\/button>/, 'événement sans inscription');
  assert.ok(!/evenements\.html\?evt=4"/.test(html), 'rien à rejoindre sur un événement informatif');
});

test('E2 aucun événement : message clair ; boutique inconnue : message clair ; maintenance : rien n\'est chargé', async () => {
  const vide = await lancer({ evts: [] });
  assert.match(vide.html, /Aucun événement publié pour le moment/);
  const absente = await lancer({ url: '' });
  assert.match(absente.html, /Aucune boutique indiquée/);
  const arret = await lancer({ maintenance: true });
  assert.deepEqual(arret.appels, [], 'en maintenance, aucune donnée n\'est demandée');
});

/* ═════════════ 3. Qualité ═════════════ */
test('E3 la page n\'utilise aucune émoticône et ne code aucun paiement', () => {
  const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  for (const f of ['boutique-evenements.html', 'assets/boutique-evenements.js', 'assets/boutique-evenements.css']) {
    assert.ok(!emo.test(lire(f)), `${f} contient une émoticône`);
  }
  assert.ok(!/stripe|\/panier|paiement\//i.test(JS.replace(/Aucun paiement[^']*/g, '')), 'aucun appel de paiement');
});

test('E3 la page charge ses fichiers et les modules partagés (couleurs, maintenance)', () => {
  const html = lire('boutique-evenements.html');
  for (const s of ['boutique-evenements.css', 'boutique-evenements.js', 'boutique-couleurs.js', 'boutique-maintenance.js', 'boutique-types.js']) assert.ok(html.includes(s), s);
  assert.doesNotThrow(() => new vm.Script(JS), 'le script est valide');
  assert.ok(fs.existsSync(path.join(RACINE, 'assets/boutique-evenements.css')));
});

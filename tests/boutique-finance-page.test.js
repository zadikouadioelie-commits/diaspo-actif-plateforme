/* Tests — page publique « Organismes de financement » (lot E, 2026-11-12).
   Lancer : node --test tests/boutique-finance-page.test.js
   1. Le type « finance » a une page dédiée ; les visiteurs y sont envoyés.
   2. La page se charge, lit les vraies API et affiche programmes, projets accompagnés, résultats, rendez-vous, documents…
   3. Aucun formulaire de dépôt (un seul bouton « Soumettre à Diaspo'Actif »), aucun paiement, rubriques désactivées respectées, texte sûr. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BT = require('../server/boutique-types.js');

const RACINE = path.join(__dirname, '..');
const lire = (f) => fs.readFileSync(path.join(RACINE, f), 'utf8');
const JS = lire('assets/boutique-finance.js');

/* ═════════════ 1. Registre et redirection ═════════════ */
test('F1 le type « finance » a une page dédiée dans le registre', () => {
  assert.ok(BT.PAGES_DEDIEES.includes('finance'));
  assert.ok(BT.REGISTRE.TYPES.finance, 'le type existe dans le registre');
});

test('F1 un visiteur de la clé « finance » est envoyé sur la page', () => {
  const html = lire('profil-app.html');
  assert.match(html, /vitrine_type === 'finance'\) \{ location\.replace\('boutique-finance\.html\?id='/);
});

/* ═════════════ 2. La page dans un faux navigateur ═════════════ */
const INIT = {
  id: 3, nom: 'Microfinance Soleil', owner_user_id: 7, vitrine_type: 'finance', slogan: 'Financer les petits projets', ville: 'Dakar', pays: 'Sénégal',
  description: '<p>Un organisme de microfinance <script>alert(1)</script>pour les entrepreneurs.</p>', mission: 'Rendre le crédit accessible.',
  vitrine_services: 'Microcrédit entreprise : de 500 à 5 000 euros\nGarantie de prêt\n- Épargne solidaire : taux fixe',
  realisations: [{ titre: 'Boulangerie de Thiès', categorie: 'Commerce', description: 'Crédit de démarrage.', image: 'https://exemple.org/b.jpg', lien: 'https://exemple.org/thies' }],
  vitrine_resultats_impact: [{ valeur: '1 200', libelle: 'crédits accordés' }, { valeur: '92 %', libelle: 'taux de remboursement' }],
  vitrine_reservation_json: JSON.stringify([{ intitule: 'Entretien conseil', duree: '30 min', prix: 'Gratuit', lien: 'https://exemple.org/rdv' }, { intitule: 'Rendez-vous crédit' }]),
  documents: [{ titre: 'Guide du demandeur', url: '/uploads/guide.pdf' }, { titre: 'Lien dangereux', url: 'javascript:alert(1)' }],
  vitrine_temoignages: [{ texte: 'Un accompagnement sérieux.', nom: 'Awa', fonction: 'Boulangère' }],
  vitrine_certifications: [{ nom: 'Agrément BCEAO', annee: '2019' }],
  vitrine_equipe_json: JSON.stringify([{ nom: 'Moussa Ba', fonction: 'Directeur' }]),
  vitrine_style_json: JSON.stringify({ couleurs: ['#1e5e91', '#d9534f', '#2e8b57'] }),
};
const PARTS = [{ nom: 'Fondation Horizon', type_partenaire: 'Fondation' }];

async function lancer({ init = {}, parts = PARTS, maintenance = false, url = '?id=3' } = {}) {
  const appels = [];
  const app = { innerHTML: '', addEventListener() {} };
  const styles = {};
  const document = {
    getElementById: (id) => (id === 'imp-app' ? app : null), querySelector: () => null, querySelectorAll: () => [], title: '',
    body: { style: { setProperty: (k, v) => { styles[k] = v; } } }, addEventListener() {},
  };
  const reponses = {
    '/initiatives/3': { initiative: Object.assign({}, INIT, init) },
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
  return { html: app.innerHTML, appels, styles };
}

test('F2 la page lit l\'initiative et ses partenaires, puis affiche toutes les rubriques', async () => {
  const { html, appels } = await lancer();
  assert.deepEqual(appels.slice(0, 1), ['/initiatives/3']);
  assert.ok(appels.includes('/initiatives/3/partenaires'));
  assert.match(html, /Microfinance Soleil/);
  assert.match(html, /Microcrédit entreprise/);
  assert.match(html, /Boulangerie de Thiès/);
  assert.match(html, /1 200/);
  assert.match(html, /Entretien conseil/);
  assert.match(html, /Guide du demandeur/);
  assert.match(html, /Un accompagnement sérieux/);
  assert.match(html, /Agrément BCEAO · 2019/);
  assert.match(html, /Moussa Ba/);
  assert.match(html, /Fondation Horizon/);
});

test('F2 chaque ligne du champ Services devient un programme ; « Titre : description » est séparé', async () => {
  const { html } = await lancer();
  assert.equal((html.match(/class="programme"/g) || []).length, 3);
  assert.match(html, /<h3>Microcrédit entreprise<\/h3><p>de 500 à 5 000 euros<\/p>/);
  assert.match(html, /<h3>Garantie de prêt<\/h3><a/, 'sans description : titre seul');
  assert.match(html, /<h3>Épargne solidaire<\/h3>/, 'puce de liste retirée');
});

test('F2 rendez-vous : lien de réservation de l\'organisme, sinon demande par la messagerie', async () => {
  const { html } = await lancer();
  assert.match(html, /href="https:\/\/exemple\.org\/rdv"[^>]*>Réserver/);
  assert.match(html, /href="messagerie\.html\?with=7&amp;origine=vitrine&amp;objet=Rendez-vous%20%3A%20Rendez-vous%20cr%C3%A9dit"[^>]*>Demander/);
});

test('F3 aucun formulaire de dépôt : seuls des boutons « Soumettre à Diaspo\'Actif » (dépôt central), pas de champ de saisie', async () => {
  const { html } = await lancer();
  assert.ok(!/<form|<input|<textarea|<select/i.test(html), 'aucun formulaire ni champ de saisie');
  assert.equal((html.match(/data-depot/g) || []).length, 2, 'bandeau et barre finale');
  assert.match(html, /Soumettre à Diaspo’Actif/);
  assert.match(lire('boutique-finance.html'), /depot-central\.js/);
});

test('F3 une rubrique désactivée par le créateur n\'est pas affichée', async () => {
  const off = (k) => ({ [k]: { actif: false } });
  const modules = Object.assign({}, off('services'), off('realisations'), off('reservation'), off('documents'), off('temoignages'), off('certifications'), off('equipe'), off('partenaires'), off('resultats_impact'));
  const { html } = await lancer({ init: { vitrine_modules_state: modules } });
  for (const t of ['Microcrédit entreprise', 'Boulangerie de Thiès', 'Entretien conseil', 'Guide du demandeur', 'Un accompagnement', 'Agrément BCEAO', 'Moussa Ba', 'Fondation Horizon', 'crédits accordés']) {
    assert.ok(!html.includes(t), t + ' devrait être masqué');
  }
  assert.match(html, /id="presentation"/, 'la présentation reste');
});

test('F3 texte venu de la base sans balises ; liens et images dangereux refusés', async () => {
  const { html } = await lancer({ init: { description: '<img src=x onerror=alert(1)>', vitrine_services: '<b>Offre</b> piégée', realisations: [{ titre: 'X', image: 'javascript:alert(2)', lien: 'javascript:alert(3)' }] } });
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!/javascript:/i.test(html), 'aucune adresse dangereuse');
  assert.ok(!html.includes('<b>Offre</b>'));
  assert.match(html, /Offre piégée/);
  assert.match(html, /href="\/uploads\/guide\.pdf"/, 'document du site accepté');
});

test('F3 les couleurs de la boutique sont appliquées, sinon Marine, Orange et Vert', async () => {
  const a = await lancer();
  assert.equal(a.styles['--c1'], '#1e5e91');
  const b = await lancer({ init: { vitrine_style_json: null } });
  assert.equal(b.styles['--c1'], '#0d2750');
  assert.equal(b.styles['--c2'], '#f47c20');
});

test('F4 sans contenu : message clair ; boutique inconnue : message clair ; maintenance : rien n\'est chargé', async () => {
  const vide = await lancer({ parts: [], init: { description: '', mission: '', vitrine_services: '', realisations: [], vitrine_resultats_impact: [], vitrine_reservation_json: '', documents: [], vitrine_temoignages: [], vitrine_certifications: [], vitrine_equipe_json: '' } });
  assert.match(vide.html, /n’a pas encore publié ses programmes/);
  assert.match(vide.html, /data-depot/, 'le dépôt central reste proposé');
  const absente = await lancer({ url: '' });
  assert.match(absente.html, /Aucune boutique indiquée/);
  const arret = await lancer({ maintenance: true });
  assert.deepEqual(arret.appels, [], 'en maintenance, aucune donnée n\'est demandée');
});

/* ═════════════ 3. Qualité ═════════════ */
test('F5 aucune émoticône, aucun paiement ni souscription', () => {
  const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  for (const f of ['boutique-finance.html', 'assets/boutique-finance.js', 'assets/boutique-finance.css']) {
    assert.ok(!emo.test(lire(f)), `${f} contient une émoticône`);
  }
  assert.ok(!/stripe|\/panier|paiement\/|souscri/i.test(JS.replace(/aucun paiement[^\n]*/gi, '').replace(/Aucun paiement, aucune souscription[^\n]*/g, '')), 'aucun appel de paiement');
});

test('F5 la page charge ses fichiers et les modules partagés', () => {
  const html = lire('boutique-finance.html');
  for (const s of ['boutique-impact.css', 'boutique-finance.css', 'boutique-finance.js', 'boutique-couleurs.js', 'boutique-maintenance.js', 'boutique-types.js', 'depot-central.js']) assert.ok(html.includes(s), s);
  assert.doesNotThrow(() => new vm.Script(JS), 'le script est valide');
  assert.ok(fs.existsSync(path.join(RACINE, 'assets/boutique-finance.css')));
});

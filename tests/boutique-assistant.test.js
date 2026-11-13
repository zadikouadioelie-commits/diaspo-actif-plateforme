/* ===========================================================
   tests/boutique-assistant.test.js — Assistant de création d'une boutique, lot 1 (2026-11-13)
   ===========================================================
   1. Fonctions pures : progression « Étape X sur N », bornes, pourcentage, recherche sans accents.
   2. Montage dans un faux navigateur : un panneau par étape, les blocs existants rangés dedans, Précédent / Suivant, « Publier » à la dernière étape,
      pastilles d'état avec texte pour les lecteurs d'écran, entrée secondaire (Bonus) hors parcours.
   3. Branchement dans le tableau de bord : les blocs existants gardent leurs identifiants, plus d'émoticônes ni de « Étape N » dans la section.
   Lancer : node --test tests/boutique-assistant.test.js
   =========================================================== */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const RACINE = path.join(__dirname, '..');
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), 'utf8');
const JS = lire('assets/boutique-assistant.js');
const CSS = lire('assets/boutique-assistant.css');

/* Faux document minimal : assez pour exécuter monter() (éléments avec innerHTML, requêtes par attribut simples). */
function fauxNavigateur() {
  const memoire = {};
  const fenetre = {
    sessionStorage: { getItem: (k) => (k in memoire ? memoire[k] : null), setItem: (k, v) => { memoire[k] = String(v); } },
  };
  fenetre.window = fenetre;
  vm.runInContext(JS, vm.createContext(Object.assign(fenetre, { console })));
  return { A: fenetre.BoutiqueAssistant, memoire };
}
const { A } = fauxNavigateur();
const clone = (x) => JSON.parse(JSON.stringify(x));

const ETAPES = [
  { cle: 'type', num: '1', titre: 'Modèle principal', mots: 'type forme' },
  { cle: 'identite', num: '2', titre: 'Identité', mots: 'nom logo' },
  { cle: 'options', num: '3', titre: 'Modules complémentaires', mots: 'options exemplaires' },
  { cle: 'apparence', num: '4', titre: 'Apparence et personnalisation', mots: 'couleurs style' },
  { cle: 'rubriques', num: '5', titre: 'Navigation et rubriques', mots: 'ordre menu' },
  { cle: 'bonus', titre: 'Bonus boutique', sous: true, mots: 'ancien contenu' },
  { cle: 'publication', titre: 'Publication', mots: 'publier statut' },
];

/* ═════════════ 1. Fonctions pures ═════════════ */
test('A1 le parcours exclut les entrées secondaires et compte six étapes', () => {
  assert.equal(A.parcours(ETAPES).length, 6);
  assert.ok(!A.parcours(ETAPES).some((e) => e.sous));
});

test('A1 libellé de progression, pourcentage et bornes', () => {
  assert.equal(A.libelleProgression(0, 6, 'Modèle principal'), 'Étape 1 sur 6 : Modèle principal');
  assert.equal(A.libelleProgression(5, 6, 'Publication'), 'Étape 6 sur 6 : Publication');
  assert.equal(A.pourcentage(0, 6), 17);
  assert.equal(A.pourcentage(5, 6), 100);
  assert.equal(A.pourcentage(0, 0), 0);
  assert.equal(A.borner(-3, 6), 0);
  assert.equal(A.borner(9, 6), 5);
  assert.equal(A.borner(2, 6), 2);
});

test('A1 la recherche trouve par titre ou mot-clé, sans tenir compte des accents ni des majuscules', () => {
  const cles = (q) => A.filtrer(ETAPES, q).map((e) => e.cle);
  assert.deepEqual(cles(''), ETAPES.map((e) => e.cle), 'recherche vide : tout reste');
  assert.deepEqual(cles('IDENTITE'), ['identite']);
  assert.deepEqual(cles('identité'), ['identite']);
  assert.deepEqual(cles('couleurs'), ['apparence']);
  assert.deepEqual(cles('publier'), ['publication']);
  assert.deepEqual(cles('zzz'), []);
  assert.ok(cles('ancien').includes('bonus'), 'l\'entrée secondaire est aussi trouvée');
});

/* ═════════════ 2. Montage dans un faux navigateur ═════════════ */
function elt(tag = 'div') {
  const e = {
    tag, children: [], parent: null, attrs: {}, hidden: false, className: '', style: {}, _html: '', textContent: '', disabled: false,
    classList: { toggle(c, v) { e.className = (e.className.split(' ').filter((x) => x && x !== c).concat(v ? [c] : [])).join(' '); } },
    get innerHTML() { return e._html; }, set innerHTML(v) { e._html = v; },
    setAttribute(k, v) { e.attrs[k] = String(v); }, getAttribute(k) { return k in e.attrs ? e.attrs[k] : null; }, removeAttribute(k) { delete e.attrs[k]; },
    appendChild(c) { c.parent = e; e.children.push(c); return c; },
    insertBefore(c, ref) { c.parent = e; const i = ref ? e.children.indexOf(ref) : e.children.length; e.children.splice(i < 0 ? e.children.length : i, 0, c); return c; },
    get firstChild() { return e.children[0] || null; }, get nextSibling() { return e.parent ? e.parent.children[e.parent.children.indexOf(e) + 1] || null : null; },
    addEventListener(t, f) { e['on_' + t] = f; }, focus() { e.enfoque = true; }, scrollIntoView() {},
    querySelector: () => elt(), querySelectorAll: () => [],
  };
  return e;
}

test('A2 monter() produit un menu, une barre de progression et un panneau par étape, avec les blocs existants rangés dedans', () => {
  const parent = elt(); const bloc = elt(); bloc.id = 'bloc-existant';
  /* document minimal : createElement renvoie des éléments dont l'innerHTML est inspecté ensuite */
  const docs = { createElement: (t) => elt(t) };
  const fen = { document: docs, sessionStorage: { getItem: () => null, setItem() {} } };
  fen.window = fen;
  const ctx = vm.createContext(Object.assign(fen, { console }));
  vm.runInContext(JS, ctx);
  /* Le faux document ne sait pas chercher dans le HTML généré : on contrôle donc le HTML produit. */
  const retour = fen.BoutiqueAssistant.monter(parent, { etapes: clone(ETAPES), contenus: { type: [bloc] }, etat: () => 'ok' });
  assert.ok(retour && typeof retour.afficher === 'function' && typeof retour.rafraichir === 'function');
  const [nav, centre] = parent.children;
  assert.ok(nav && /pvw-liste/.test(nav.innerHTML), 'le menu des étapes est créé');
  for (const e of ETAPES) {
    assert.ok(nav.innerHTML.includes(`data-etape="${e.cle}"`), `entrée du menu : ${e.cle}`);
    assert.ok(centre.innerHTML.includes(`data-panneau="${e.cle}"`), `panneau : ${e.cle}`);
  }
  assert.match(nav.innerHTML, /Rechercher un paramètre/);
  assert.match(nav.innerHTML, /1\. Modèle principal/);
  assert.ok(!/ 6\. Bonus/.test(nav.innerHTML), 'l\'entrée secondaire n\'a pas de numéro');
  assert.match(centre.innerHTML, /data-nav="prec"[^>]*>Précédent/);
  assert.match(centre.innerHTML, /data-nav="suiv"[^>]*>Suivant/);
});

test('A2 le script est valide, texte échappé, pastilles lisibles sans la couleur', () => {
  assert.doesNotThrow(() => new vm.Script(JS));
  assert.match(JS, /pvw-sr/, 'texte « Terminé » / « À compléter » pour les lecteurs d\'écran');
  assert.match(JS, /LIBELLE_ETAT/);
  assert.match(JS, /aria-current/);
  assert.match(JS, /\.replace\(\/\[&<>"'\]\/g/, 'les titres sont échappés');
});

test('A2 la dernière étape propose « Publier », la première désactive « Précédent »', () => {
  assert.match(JS, /courant === n - 1 && !etape\.sous \? "Publier" : "Suivant"/);
  assert.match(JS, /prec\.disabled = courant === 0 && !etape\.sous/);
  assert.match(JS, /onPublier/);
});

test('A2 la mémoire du navigateur est facultative : un refus n\'empêche pas l\'assistant de fonctionner', () => {
  assert.match(JS, /try \{ return window\.sessionStorage\.getItem/);
  assert.match(JS, /catch \(e\) \{ \/\* mémoire indisponible/);
});

/* ═════════════ 3. Branchement et qualité ═════════════ */
const HTML = lire('dashboard-initiative.html');
const section = HTML.slice(HTML.indexOf('id="parametres-vitrine"'), HTML.indexOf('SECTION EXPANSION')).replace(/<!--[\s\S]*?-->/g, '');

test('A3 le tableau de bord charge l\'assistant et le monte avant de remplir les blocs', () => {
  assert.match(HTML, /boutique-assistant\.css/);
  assert.match(HTML, /boutique-assistant\.js/);
  assert.match(HTML, /function pvMonterAssistant\(\)/);
  const charge = HTML.indexOf('async function loadParametresVitrineFull');
  assert.ok(HTML.indexOf('pvMonterAssistant();', charge) > charge && HTML.indexOf('pvMonterAssistant();', charge) < HTML.indexOf("api('GET', '/vitrine-modules-registry')", charge), 'monté avant les appels qui remplissent les blocs');
});

test('A3 chaque bloc existant garde son identifiant (rien n\'est recréé) et rejoint son étape', () => {
  for (const id of ['pv-templates-grid', 'pv-infos-form', 'pv-card-preview-mount', 'pv-style-presets', 'pv-theme-swatches', 'pv-studio', 'pv-quick-activate', 'pv-modules-lib', 'pv-order-list', 'pv-bonus', 'pv-options', 'btn-statut-visible', 'pv-preview-frame', 'pv-draft-status']) {
    assert.ok(section.includes(`id="${id}"`), `${id} est toujours là`);
  }
  for (const cle of ['type', 'identite', 'options', 'apparence', 'rubriques', 'bonus', 'publication']) assert.ok(HTML.includes(`cle: '${cle}'`), `étape ${cle}`);
  assert.match(HTML, /onPublier: \(\) => pvPublish\(\)/);
});

test('A3 la section n\'a plus d\'émoticônes ni de pastilles « Étape N » : l\'assistant numérote', () => {
  const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  assert.ok(!emo.test(section), 'émoticône restante dans la section : ' + (section.match(emo) || [''])[0]);
  assert.ok(!/>Étape [12]</.test(section));
  for (const f of ['assets/boutique-assistant.js', 'assets/boutique-assistant.css']) assert.ok(!emo.test(lire(f)), `${f} contient une émoticône`);
});

test('A3 les pastilles d\'état et le résumé de publication dépendent des vraies données', () => {
  assert.match(HTML, /function pvAssistantEtat\(cle\)/);
  assert.match(HTML, /case 'publication': return __pvDraftPending \? 'afaire' : 'ok'/);
  assert.match(HTML, /function pvAssistantResume\(\)/);
  assert.match(HTML, /if \(window\.__pvAssistant\) window\.__pvAssistant\.rafraichir\(\);/);
});

test('A3 la mise en page suit la maquette : menu | étape | aperçu, adaptée aux petits écrans', () => {
  assert.match(CSS, /grid-template-columns: 224px minmax\(0, 1fr\) minmax\(0, 1\.15fr\)/);
  assert.match(CSS, /\.pv-builder-left \{ display: contents; \}/);
  assert.match(CSS, /@media \(max-width: 1000px\)/);
  assert.match(CSS, /prefers-reduced-motion/);
  assert.match(CSS, /focus-visible/);
  assert.ok(!/transition: width/.test(CSS), 'la jauge est animée par transformation, pas par largeur');
});

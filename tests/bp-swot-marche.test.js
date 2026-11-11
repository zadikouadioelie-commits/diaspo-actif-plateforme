/* Tests des modules assets/bp-swot.js et assets/bp-marche.js (2026-11-10) — logique pure, sans
   navigateur ni base de données. Lancés par `npm test`. */
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../assets/bp-swot.js');
const M = require('../assets/bp-marche.js');

/* ───────── SWOT ───────── */
test('SWOT : un plan ancien (textes seuls) est lu comme des éléments non évalués, ligne à ligne', () => {
  const els = S.elements({ forces: '- Équipe complémentaire\n• Accès direct à la diaspora', faiblesses: 'Trésorerie tendue', opportunites: '', menaces: '  ' });
  assert.equal(els.length, 3);
  assert.deepEqual(els.map(e => [e.cat, e.titre, e.impact]), [['forces', 'Équipe complémentaire', 0], ['forces', 'Accès direct à la diaspora', 0], ['faiblesses', 'Trésorerie tendue', 0]]);
});

test('SWOT : les ids dérivés du texte sont stables d\'un rendu à l\'autre', () => {
  const sw = { forces: 'A\nB' };
  assert.deepEqual(S.elements(sw).map(e => e.id), S.elements(sw).map(e => e.id));
});

test('SWOT : textes() recalcule « une ligne = un élément » et ignore les titres vides', () => {
  const els = [{ cat: 'forces', titre: 'A' }, { cat: 'forces', titre: '  ' }, { cat: 'menaces', titre: 'Aléas climatiques' }];
  assert.deepEqual(S.textes(els), { forces: 'A', faiblesses: '', opportunites: '', menaces: 'Aléas climatiques' });
});

test('SWOT : éléments structurés cohérents avec les textes → utilisés tels quels (détails conservés)', () => {
  const els = [{ id: 'x1', cat: 'forces', titre: 'Équipe', impact: 3, justification: 'Deux fondateurs', consequence: '', action: 'Former' }];
  const sw = Object.assign({ elements: els }, S.textes(els));
  const lus = S.elements(sw);
  assert.equal(lus.length, 1);
  assert.equal(lus[0].justification, 'Deux fondateurs');
  assert.equal(lus[0].impact, 3);
});

test('SWOT : un texte modifié ailleurs reconstruit la catégorie sans perdre les lignes inchangées', () => {
  const els = [{ id: 'x1', cat: 'forces', titre: 'Équipe', impact: 3, action: 'Former' }, { id: 'x2', cat: 'forces', titre: 'Réseau', impact: 2 }, { id: 'x3', cat: 'menaces', titre: 'Concurrence', impact: 4 }];
  const sw = Object.assign({ elements: els }, S.textes(els), { forces: 'Équipe\nMarque forte' });
  const lus = S.elements(sw);
  const forces = lus.filter(e => e.cat === 'forces');
  assert.deepEqual(forces.map(e => e.titre), ['Équipe', 'Marque forte']);
  assert.equal(forces[0].impact, 3);          // inchangée : détails gardés
  assert.equal(forces[1].impact, 0);          // nouvelle : non évaluée
  assert.equal(lus.filter(e => e.cat === 'menaces')[0].impact, 4);   // autre catégorie intacte
});

test('SWOT : labels d\'impact — « Critique » pour ce qui nuit, « Décisif » pour ce qui sert', () => {
  assert.equal(S.niveauLabel('menaces', 4), 'Critique');
  assert.equal(S.niveauLabel('forces', 4), 'Décisif');
  assert.equal(S.niveauLabel('forces', 0), 'Non évalué');
  assert.equal(S.niveauLabel('faiblesses', 2), 'Modéré');
});

test('SWOT : la priorité est déduite de l\'impact', () => {
  assert.equal(S.priorite({ impact: 4 }).niveau, 'Critique');
  assert.equal(S.priorite({ impact: 3 }).niveau, 'Haute');
  assert.equal(S.priorite({ impact: 2 }).niveau, 'Moyenne');
  assert.equal(S.priorite({ impact: 1 }).niveau, 'Basse');
  assert.equal(S.priorite({ impact: 0 }).niveau, 'Non évaluée');
});

test('SWOT : plan d\'action trié par priorité, ce qui nuit avant ce qu\'on exploite, sans les éléments sans action', () => {
  const els = [
    { cat: 'forces', titre: 'F', impact: 3, action: 'Capitaliser' },
    { cat: 'faiblesses', titre: 'Trésorerie tendue', impact: 4, action: 'Constituer une réserve' },
    { cat: 'menaces', titre: 'Aléas', impact: 3, action: 'Diversifier' },
    { cat: 'opportunites', titre: 'O', impact: 4, action: 'Saisir' },
    { cat: 'faiblesses', titre: 'Sans action', impact: 4, action: '' },
  ];
  const plan = S.planActions(els);
  assert.deepEqual(plan.map(r => r.titre), ['Trésorerie tendue', 'O', 'Aléas', 'F']);
  assert.equal(plan[0].priorite.niveau, 'Critique');
});

test('SWOT : la synthèse proposée n\'utilise que la saisie et se base sur l\'impact', () => {
  const els = [
    { cat: 'forces', titre: 'Équipe complémentaire', impact: 4 }, { cat: 'forces', titre: 'Accès à la diaspora', impact: 3 }, { cat: 'forces', titre: 'Faible', impact: 1 },
    { cat: 'faiblesses', titre: 'Trésorerie tendue', impact: 4, action: 'Constituer une réserve de trésorerie.' },
    { cat: 'menaces', titre: 'Aléas climatiques', impact: 3 }, { cat: 'opportunites', titre: 'Demande croissante', impact: 3 },
  ];
  const t = S.proposerSynthese(els);
  assert.match(t, /^Le projet s'appuie sur équipe complémentaire et accès à la diaspora, et peut tirer parti de demande croissante\./);
  assert.match(t, /trésorerie tendue et aléas climatiques/);
  assert.match(t, /La stratégie prioritaire consiste à constituer une réserve de trésorerie avant d'accélérer/);
  assert.ok(!/Faible/.test(t));
  assert.equal(S.proposerSynthese([]), '');
});

test('SWOT : un brouillon non validé n\'est jamais repris dans le dossier', () => {
  assert.equal(S.syntheseAAfficher({ synthese: 'Texte', synthese_validee: false }), '');
  assert.equal(S.syntheseAAfficher({ synthese: ' Texte ', synthese_validee: true }), 'Texte');
  assert.equal(S.syntheseAAfficher({ synthese: 'Écrit à la main' }), 'Écrit à la main');   // plan sans drapeau = saisie manuelle
  assert.equal(S.syntheseAAfficher({}), '');
});

test('SWOT : bilan des éléments', () => {
  const b = S.bilan([{ cat: 'forces', titre: 'A', impact: 2, action: 'x' }, { cat: 'forces', titre: 'B' }, { cat: 'forces', titre: '' }]);
  assert.deepEqual(b, { total: 2, sansImpact: 1, sansAction: 1, avecAction: 1 });
});

/* ───────── Marché ───────── */
test('Marché : le cas relevé — 0,5 % de 32 M€ = 160 000 €, pas 90 000 €', () => {
  const [r] = M.controleObjectifs([{ marche: 'Diaspora France', montant: 32000000, part_pct: 0.5, objectif: 90000, devise: '€' }]);
  assert.equal(r.statut, 'incoherent');
  assert.equal(r.attendu, 160000);
  assert.match(r.message, /0,5 % de 32 000 000 € = 160 000 €, mais l'objectif annoncé est 90 000 €/);
});

test('Marché : 2 % de 18 milliards FCFA = 360 millions FCFA est cohérent', () => {
  const [r] = M.controleObjectifs([{ marche: 'Local', montant: '18000000000', part_pct: '2', objectif: '360000000', devise: 'FCFA' }]);
  assert.equal(r.statut, 'ok');
  assert.equal(r.attendu, 360000000);
});

test('Marché : une ligne incomplète n\'est ni validée ni refusée ; une ligne vide est ignorée', () => {
  const r = M.controleObjectifs([{ marche: 'X', montant: 100 }, {}, null]);
  assert.equal(r.length, 1);
  assert.equal(r[0].statut, 'incomplet');
});

test('Marché : tolérance d\'arrondi de 2 %', () => {
  assert.equal(M.controleObjectifs([{ montant: 1000000, part_pct: 1, objectif: 10100 }])[0].statut, 'ok');
  assert.equal(M.controleObjectifs([{ montant: 1000000, part_pct: 1, objectif: 11000 }])[0].statut, 'incoherent');
});

test('Marché : SOM ≤ SAM ≤ TAM', () => {
  assert.deepEqual(M.controleEmboitement({ tam: 100, sam: 50, som: 10 }), []);
  assert.equal(M.controleEmboitement({ tam: 100, sam: 150, som: 10 }).length, 1);
  assert.equal(M.controleEmboitement({ tam: 100, sam: 50, som: 60 }).length, 1);
  assert.deepEqual(M.controleEmboitement({}), []);
});

test('Marché : indicateurs clés — au plus 4, seulement ceux qui ont une valeur', () => {
  const ind = M.indicateurs({ indicateurs_cles: [{ valeur: '32 M€', libelle: 'Marché diaspora', perimetre: 'France / an' }, { valeur: '' }, { valeur: '+8 %' }, { valeur: 'a' }, { valeur: 'b' }, { valeur: 'c' }] });
  assert.equal(ind.length, 4);
  assert.equal(ind[0].libelle, 'Marché diaspora');
});

test('Marché : barres de segments triées par priorité, segments non notés exclus', () => {
  const b = M.barresSegments([{ nom_segment: 'B2B', priorite: 55 }, { nom_segment: 'Diaspora', priorite: 88, localisation: 'France', canal_achat: 'E-commerce' }, { nom_segment: 'Sans note' }, { nom_segment: 'Trop', priorite: 150 }]);
  assert.deepEqual(b.map(x => [x.nom, x.pct]), [['Trop', 100], ['Diaspora', 88], ['B2B', 55]]);
  assert.equal(b[1].detail, 'France · E-commerce');
});

test('Marché : conclusion de faisabilité proposée à partir de la saisie, hypothèses exclues des concurrents cités', () => {
  const f = M.proposerFaisabilite({ taille_marche: '32 M€ par an', evolution: '+8 %', tam: 32000000, sam: 4000000, canaux_distribution_global: 'E-commerce, épiceries', reglementation: 'Normes sanitaires', concurrents: [{ nom: 'Acteur A', statut_donnee: 'verifie' }, { nom: 'Acteur B', statut_donnee: 'hypothese' }] });
  assert.match(f.attractivite, /Taille du marché : 32 M€ par an\. Croissance : \+8 %\./);
  assert.match(f.penetration, /Concurrents identifiés : Acteur A\./);
  assert.ok(!/Acteur B/.test(f.penetration));
  assert.match(f.conditions, /Réglementation : Normes sanitaires\./);
  assert.deepEqual(M.proposerFaisabilite({}), { attractivite: '', penetration: '', conditions: '' });
});

test('Marché : une conclusion non validée n\'est jamais reprise dans le dossier', () => {
  assert.equal(M.faisabiliteAAfficher({ faisabilite: { attractivite: 'x' }, faisabilite_validee: false }), null);
  assert.deepEqual(M.faisabiliteAAfficher({ faisabilite: { attractivite: ' x ', penetration: '', conditions: '' }, faisabilite_validee: true }), { attractivite: 'x', penetration: '', conditions: '' });
  assert.equal(M.faisabiliteAAfficher({}), null);
});

/* ───────── Stratégie marketing ───────── */
const K = require('../assets/bp-marketing.js');

test('Marketing : budget par canal = campagnes avec canal et budget, trié, pourcentages cohérents', () => {
  const b = K.budgetsParCanal({ campagnes: [{ canal: 'Dégustations', budget: 500 }, { canal: 'Publicité digitale', budget: 800 }, { canal: 'Sans budget' }, { canal: 'Contenus', budget: 400 }, { canal: 'Supports', budget: 300 }] });
  assert.equal(b.total, 2000);
  assert.deepEqual(b.lignes.map(l => [l.canal, l.pct]), [['Publicité digitale', 40], ['Dégustations', 25], ['Contenus', 20], ['Supports', 15]]);
});

test('Marketing : contrôle du budget — somme des canaux vs enveloppe annoncée', () => {
  assert.equal(K.controleBudget({ budget_marketing_annuel: 2000, campagnes: [{ canal: 'A', budget: 2000 }] }), null);
  assert.match(K.controleBudget({ budget_marketing_annuel: 2000, campagnes: [{ canal: 'A', budget: 3000 }] }), /plus que l'enveloppe annoncée/);
  assert.match(K.controleBudget({ budget_marketing_mensuel: 500, campagnes: [{ canal: 'A', budget: 2000 }] }), /4\s000 € ne sont pas encore répartis|ne sont pas encore répartis/);
  assert.equal(K.controleBudget({ campagnes: [{ canal: 'A', budget: 10 }] }), null);   // pas d'enveloppe : rien à comparer
});

test('Marketing : un statut inconnu ou absent vaut « Hypothèse » (jamais « Constaté » par défaut)', () => {
  assert.equal(K.statutDe(undefined), 'hypothese');
  assert.equal(K.statutDe('n\'importe quoi'), 'hypothese');
  assert.equal(K.statutLabel('constate'), 'Constaté');
  assert.equal(K.planActions({ plan_actions: [{ periode: 'Mois 1–2', actions: 'Lancement' }] })[0].statut, 'hypothese');
});

test('Marketing : indicateurs calculés quand les données existent, absents sinon', () => {
  assert.deepEqual(K.indicateursPerformance({}, {}), []);
  const r = K.indicateursPerformance({ campagnes: [{ canal: 'A', budget: 1000, prospects: 200, conversions: 20 }], nb_points_vente: 3, statuts_indicateurs: { cac: 'objectif' } },
    { business_model: { prix_moyen: 25, taux_retention: 40 }, ca_annee1: 10000 });
  const par = Object.fromEntries(r.map(x => [x.cle, x]));
  assert.equal(par.cac.valeur, '50 €');             // 1000 ÷ 20
  assert.equal(par.cac.statut, 'objectif');
  assert.equal(par.conversion.valeur, '10 %');       // 20 ÷ 200
  assert.equal(par.panier.valeur, '25 €');
  assert.equal(par.fidelisation.valeur, '40 %');
  assert.equal(par.roas.valeur, '10 €');             // 10 000 ÷ 1 000
  assert.equal(par.points_vente.valeur, '3');
  assert.equal(par.conversion.statut, 'hypothese');
});

test('Marketing : le CAC saisi dans le business model prime sur le calcul', () => {
  const r = K.indicateursPerformance({ campagnes: [{ canal: 'A', budget: 1000, conversions: 20 }] }, { business_model: { cac: 12 } });
  assert.equal(r.find(x => x.cle === 'cac').valeur, '12 €');
});

test('Marketing : la synthèse proposée ne cite que la saisie, avec le statut des objectifs', () => {
  const p = K.proposerSynthese({ campagnes: [{ canal: 'Publicité digitale', budget: 800, objectif: '500 visiteurs', statut_donnee: 'objectif' }, { canal: 'Dégustations', budget: 200 }] });
  assert.match(p.canaux_prioritaires, /Publicité digitale \(800 €, 80 % du budget\) et Dégustations \(200 €, 20 % du budget\)/);
  assert.match(p.resultats_attendus, /Publicité digitale : 500 visiteurs \(objectif\)/);
  assert.deepEqual(K.proposerSynthese({}), { canaux_prioritaires: '', resultats_attendus: '' });
});

test('Marketing : synthèse non validée jamais reprise ; parcours = étapes décrites', () => {
  assert.equal(K.syntheseAAfficher({ synthese: { canaux_prioritaires: 'x' }, synthese_validee: false }), null);
  assert.equal(K.syntheseAAfficher({ synthese: { canaux_prioritaires: ' x ' }, synthese_validee: true }).canaux_prioritaires, 'x');
  assert.deepEqual(K.parcours({ parcours: [{ etape: '', description: 'Réseaux' }, { etape: 'Convertir', description: '' }] }), [{ etape: 'Attirer', description: 'Réseaux' }]);
});

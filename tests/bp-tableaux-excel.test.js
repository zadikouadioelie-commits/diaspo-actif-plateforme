const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../assets/bp-tableaux-excel.js');
const E = require('../assets/bp-enrichi.js');
const P = require('../assets/bp-previsionnel.js');

const tables = X.registre(E, P);
const T = id => tables.find(t => t.id === id);

/* Faux SheetJS : suffisant pour vérifier la construction et la relecture sans la vraie bibliothèque. */
const XLSX = {
  utils: {
    book_new: () => ({ SheetNames: [], Sheets: {} }),
    aoa_to_sheet: aoa => ({ aoa: aoa.map(r => r.slice()) }),
    sheet_add_aoa: (ws, aoa, o) => { const r0 = Number(String(o.origin).slice(1)) - 1; aoa.forEach((r, i) => { ws.aoa[r0 + i] = r.slice(); }); return ws; },
    book_append_sheet: (wb, ws, nom) => { wb.SheetNames.push(nom); wb.Sheets[nom] = ws; },
    sheet_to_json: ws => ws.aoa.map(r => r.slice()),
  },
};

test('le registre couvre tous les tableaux, ids uniques, colonnes non vides', () => {
  assert.ok(tables.length >= 55, 'nombre de tableaux : ' + tables.length);
  assert.equal(new Set(tables.map(t => t.id)).size, tables.length);
  tables.forEach(t => { assert.ok(t.cols.length > 0, t.id); assert.equal(new Set(t.cols.map(c => c.k)).size, t.cols.length, 'clés en double dans ' + t.id); });
  ['marche.concurrents', 'risques.items', 'rh.postes', 'strategie_marketing.campagnes', 'calendrier.phases', 'plan_financier.prevision'].forEach(id => assert.ok(T(id), id));
});

test('les listes à lignes fixes ou prolongeant un autre tableau ne sont pas dupliquées', () => {
  assert.ok(!tables.some(t => t.k === 'porter'));
});

test('aller-retour : exporter puis relire redonne les mêmes lignes (concurrents)', () => {
  const t = T('marche.concurrents');
  const rows = [{ nom: 'Acteur A', type: 'direct', prix: '12 €', positionnement: 'premium', menace: '60', statut_donnee: 'verifie' }, { nom: 'Acteur B', type: 'substitut', statut_donnee: 'hypothese' }];
  const aoa = X.lignesVersAoa(t, rows);
  assert.equal(aoa[0][0], 'Concurrent');
  assert.equal(aoa[1][1], 'Concurrent direct');            // libellé lisible dans Excel
  const lu = X.aoaVersLignes(t, aoa);
  assert.equal(lu.rows.length, 2); assert.deepEqual(lu.ignorees, []);
  assert.equal(lu.rows[0].type, 'direct'); assert.equal(lu.rows[0].menace, '60'); assert.equal(lu.rows[0].prix, '12 €');
  assert.equal(lu.rows[1].statut_donnee, 'hypothese');
});

test('les valeurs de choix acceptent le libellé, la valeur technique et les accents/majuscules', () => {
  const t = T('risques.items');
  const lu = X.aoaVersLignes(t, [['Risque', 'Probabilité', 'Impact'], ['Panne', 'ÉLEVÉ', 'critique'], ['Retard', 'Moyen', 'zzz']]);
  assert.equal(lu.rows[0].probabilite, 'eleve'); assert.equal(lu.rows[0].impact, 'critique');
  assert.equal(lu.rows[1].impact, ''); assert.equal(lu.ignorees.length, 1);
  assert.match(lu.ignorees[0], /Ligne 3.*Impact.*valeur autorisée/);
});

test('nombres : virgule, espaces, pourcentage ; texte refusé et signalé', () => {
  const t = T('plan_financier.immobilisations_liste');
  const lu = X.aoaVersLignes(t, [['Investissement', 'Montant', 'Valeur résiduelle'], ['Four', '12 500,5', 'abc'], ['Camion', 8000, '10 %']]);
  assert.equal(lu.rows[0].montant, '12500.5'); assert.equal(lu.rows[0].valeur_residuelle, '');
  assert.equal(lu.rows[1].montant, '8000'); assert.equal(lu.rows[1].valeur_residuelle, '10');
  assert.equal(lu.ignorees.length, 1);
});

test('dates : JJ/MM/AAAA, ISO, numéro de série Excel et objet Date', () => {
  assert.equal(X.dateIso('15/09/2026'), '2026-09-15');
  assert.equal(X.dateIso('2026-9-5'), '2026-09-05');
  assert.equal(X.dateIso(46280), '2026-09-15');
  assert.equal(X.dateIso(new Date(2026, 8, 15)), '2026-09-15');
  assert.equal(X.dateIso('demain'), null);
  assert.equal(X.dateIso(''), '');
});

test('titre de feuille avant les en-têtes, lignes vides et colonnes inconnues ignorées', () => {
  const t = T('marche.concurrents');
  const lu = X.aoaVersLignes(t, [['Mes concurrents'], [''], ['Concurrent', 'Colonne inventée', 'Prix'], ['A', 'zz', '10'], ['', '', ''], ['B', '', '']]);
  assert.equal(lu.rows.length, 2); assert.equal(lu.rows[0].prix, '10'); assert.equal(lu.rows[0].colonne_inventee, undefined);
});

test('feuille sans en-têtes reconnus : aucune ligne', () => {
  const lu = X.aoaVersLignes(T('rh.postes'), [['a', 'b'], [1, 2]]);
  assert.equal(lu.entete, false); assert.equal(lu.rows.length, 0);
});

test('limite de 500 lignes', () => {
  const t = T('impact.indicateurs');
  const aoa = [['Indicateur']]; for (let i = 0; i < 600; i++) aoa.push(['i' + i]);
  const lu = X.aoaVersLignes(t, aoa);
  assert.equal(lu.rows.length, 500); assert.equal(lu.tronque, true);
});

test('appliquer : remplacer ou ajouter à la suite', () => {
  const t = T('marche.concurrents'), s = { marche: { concurrents: [{ nom: 'Ancien' }] } };
  X.appliquer(s, t, [{ nom: 'Nouveau' }], 'ajouter');
  assert.deepEqual(s.marche.concurrents.map(c => c.nom), ['Ancien', 'Nouveau']);
  X.appliquer(s, t, [{ nom: 'Seul' }], 'remplacer');
  assert.deepEqual(s.marche.concurrents.map(c => c.nom), ['Seul']);
  const s2 = {}; X.appliquer(s2, T('risques.items'), [{ description: 'r' }], 'remplacer');
  assert.equal(s2.risques.items.length, 1);
});

test("l'équipe fondatrice reçoit un identifiant pour chaque ligne importée", () => {
  const s = {}; X.appliquer(s, T('infos_generales.membres_equipe'), [{ nom: 'A' }, { nom: 'B' }], 'remplacer');
  assert.ok(s.infos_generales.membres_equipe.every(m => m.id));
  assert.notEqual(s.infos_generales.membres_equipe[0].id, s.infos_generales.membres_equipe[1].id);
});

test('listes des rubriques enrichies : aller-retour sur un tableau à choix', () => {
  const t = tables.find(x => x.enrichi && x.cols.some(c => c.t === 'choix'));
  assert.ok(t);
  const c = t.cols.find(c => c.t === 'choix');
  const rows = [Object.fromEntries(t.cols.map(col => [col.k, col.t === 'choix' ? col.opts[0][0] : col.t === 'nombre' ? '5' : col.t === 'date' ? '2026-01-02' : 'texte']))];
  const lu = X.aoaVersLignes(t, X.lignesVersAoa(t, rows));
  assert.equal(lu.rows.length, 1); assert.deepEqual(lu.ignorees, []);
  assert.equal(lu.rows[0][c.k], rows[0][c.k]);
});

test('prévisionnel : les lignes sont regroupées par section, sections créées au besoin', () => {
  const t = T('plan_financier.prevision'), s = {};
  const lu = X.aoaVersLignes(t, [['Section', 'Nature de la section', 'Ligne', 'Poste', 'Fréquence', 'Montant', 'Année de début (1 à 5)', 'Hausse annuelle (%)'],
    ['Ventes', 'Recette', 'Boutique', "Chiffre d'affaires", 'Chaque mois', 2000, 1, 10],
    ['Ventes', 'Recette', 'Marché', "Chiffre d'affaires", 'Chaque mois', 500, 2, ''],
    ['Charges', 'Dépense', 'Loyer', 'Loyers & immobilier', 'Chaque mois', 400, 1, ''],
    ['Mes formations', 'Dépense', 'Stage', 'Autres charges', 'Une seule fois', 500, 2, '']]);
  assert.deepEqual(lu.ignorees, []);
  X.appliquer(s, t, lu.rows, 'remplacer', P);
  const pv = s.plan_financier.prevision;
  assert.deepEqual(pv.sections.map(x => x.nom), ['Ventes', 'Charges', 'Mes formations']);
  assert.equal(pv.sections[0].lignes.length, 2);
  assert.equal(pv.sections[2].lignes[0].frequence, 'ponctuel');
  const c = P.calculer(pv);
  assert.equal(c.annees[0].recettes, 24000); assert.equal(c.annees[1].ponctuelles, 500);
});

test('prévisionnel : un poste de dépense sur une recette est corrigé, ajout à la suite conserve l\'existant', () => {
  const t = T('plan_financier.prevision');
  const s = { plan_financier: { prevision: { sections: [{ id: 'a', nom: 'Ventes', nature: 'recette', lignes: [{ id: 'x', nom: 'Existant', frequence: 'annuel', montant: '1', poste: 'ca' }] }] } } };
  X.appliquer(s, t, [{ section: 'Ventes', nature: 'recette', nom: 'Nouveau', poste: 'loyers', frequence: 'annuel', montant: '2' }], 'ajouter', P);
  const l = s.plan_financier.prevision.sections[0].lignes;
  assert.equal(l.length, 2); assert.equal(l[1].poste, 'ca');
});

test('export des données actuelles du prévisionnel puis relecture identique', () => {
  const t = T('plan_financier.prevision');
  const sections = { plan_financier: { prevision: { sections: [{ nom: 'Ventes', nature: 'recette', lignes: [{ nom: 'Boutique', poste: 'ca', frequence: 'mensuel', montant: '2000', annee_debut: '1' }] }] } } };
  const lu = X.aoaVersLignes(t, X.lignesVersAoa(t, X.lignesActuelles(sections, t)));
  assert.equal(lu.rows.length, 1); assert.equal(lu.rows[0].section, 'Ventes'); assert.equal(lu.rows[0].nature, 'recette'); assert.equal(lu.rows[0].montant, '2000');
});

test('classeur : une feuille par tableau, noms valides et uniques, modèle vide puis relecture par les en-têtes', () => {
  const { wb } = X.construireClasseur(XLSX, tables, { avecDonnees: false, nomProjet: 'Test' });
  assert.ok(wb.SheetNames.includes('Lisez-moi')); assert.ok(wb.SheetNames.includes('Valeurs autorisées'));
  wb.SheetNames.forEach(n => { assert.ok(n.length <= 31, n); assert.ok(!/[\\\/\?\*\[\]:]/.test(n), n); });
  assert.equal(new Set(wb.SheetNames.map(n => n.toLowerCase())).size, wb.SheetNames.length);
  assert.equal(wb.SheetNames.length, tables.length + 2);
  const lu = X.lireClasseur(XLSX, wb, tables);
  assert.equal(lu.inconnues.length, 0);
  assert.ok(lu.resultats.every(r => r.rows.length === 0));
});

test('classeur avec données : chaque feuille est rattachée au bon tableau même renommée', () => {
  const sections = { marche: { concurrents: [{ nom: 'A', type: 'direct' }] }, risques: { items: [{ description: 'Panne', probabilite: 'eleve', impact: 'critique' }] } };
  const { wb } = X.construireClasseur(XLSX, tables.filter(t => ['marche.concurrents', 'risques.items'].includes(t.id)), { avecDonnees: true, sections });
  const nom = wb.SheetNames.find(n => /Concurrents/.test(n)); wb.Sheets['Renommée'] = wb.Sheets[nom]; wb.SheetNames[wb.SheetNames.indexOf(nom)] = 'Renommée'; delete wb.Sheets[nom];
  const lu = X.lireClasseur(XLSX, wb, tables);
  const conc = lu.resultats.find(r => r.table.id === 'marche.concurrents'), ris = lu.resultats.find(r => r.table.id === 'risques.items');
  assert.equal(conc.rows[0].nom, 'A'); assert.equal(ris.rows[0].impact, 'critique');
});

test('feuille étrangère signalée comme inconnue', () => {
  const wb = { SheetNames: ['Budget perso'], Sheets: { 'Budget perso': { aoa: [['Truc', 'Machin'], [1, 2]] } } };
  const lu = X.lireClasseur(XLSX, wb, tables);
  assert.deepEqual(lu.inconnues, ['Budget perso']); assert.equal(lu.resultats.length, 0);
});

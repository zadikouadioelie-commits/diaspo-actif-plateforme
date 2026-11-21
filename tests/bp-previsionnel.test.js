const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../assets/bp-previsionnel.js');

const L = (o) => Object.assign({ nom: 'x', frequence: 'mensuel', montant: 0 }, o);
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.01, a + ' ≠ ' + b);

test('une ligne mensuelle vaut 12 fois le montant chaque année', () => {
  const r = P.ligneParAn(L({ montant: 100 }));
  assert.deepEqual(r, [1200, 1200, 1200, 1200, 1200]);
});

test('fréquences trimestrielle, semestrielle et annuelle', () => {
  assert.equal(P.ligneParAn(L({ frequence: 'trimestriel', montant: 250 }))[0], 1000);
  assert.equal(P.ligneParAn(L({ frequence: 'semestriel', montant: 500 }))[0], 1000);
  assert.equal(P.ligneParAn(L({ frequence: 'annuel', montant: 1000 }))[2], 1000);
});

test('une dépense ponctuelle ne compte que l\'année choisie, sans hausse', () => {
  const r = P.ligneParAn(L({ frequence: 'ponctuel', montant: 9000, annee_debut: '2', croissance_pct: '10' }));
  assert.deepEqual(r, [0, 9000, 0, 0, 0]);
});

test('année de début, mois de début et année de fin', () => {
  const r = P.ligneParAn(L({ montant: 100, annee_debut: '2', mois_debut: '7', annee_fin: '3' }));
  assert.equal(r[0], 0); near(r[1], 600); assert.equal(r[2], 1200); assert.equal(r[3], 0); assert.equal(r[4], 0);
});

test('la hausse annuelle s\'applique à partir de l\'année suivant le début', () => {
  const r = P.ligneParAn(L({ frequence: 'annuel', montant: 1000, croissance_pct: '10' }));
  near(r[0], 1000); near(r[1], 1100); near(r[2], 1210);
});

test('année par année : les valeurs saisies sont reprises telles quelles', () => {
  const r = P.ligneParAn({ frequence: 'personnalise', v1: '10', v2: '', v3: '30,5', v4: 'abc', v5: '50' });
  assert.deepEqual(r, [10, 0, 30.5, 0, 50]);
});

test('nombre tolère espaces et virgule, et ne renvoie jamais NaN', () => {
  assert.equal(P.nombre('1 200,50'), 1200.5);
  assert.equal(P.nombre(undefined), 0);
  assert.equal(P.nombre('x'), 0);
});

test('un prévisionnel vide est reconnu vide, sans chiffre inventé', () => {
  const c = P.calculer(P.modeleParDefaut());
  assert.equal(c.vide, true);
  assert.equal(c.totalRecettes, 0);
  assert.equal(c.annees.length, 5);
  assert.equal(P.calculer(undefined).vide, true);
});

function exemple() {
  return {
    tresorerie_depart: '5000',
    sections: [
      { id: 's1', nom: 'Ventes', nature: 'recette', lignes: [
        { nom: 'Boutique en ligne', poste: 'ca', frequence: 'mensuel', montant: '2000', annee_debut: '1', croissance_pct: '10' },
        { nom: 'Subvention', poste: 'autres_produits', frequence: 'ponctuel', montant: '3000', annee_debut: '1' } ] },
      { id: 's2', nom: 'Charges fixes', nature: 'depense', lignes: [
        { nom: 'Loyer', poste: 'loyers', frequence: 'mensuel', montant: '400' },
        { nom: 'Logiciel', poste: 'autres_charges', frequence: 'annuel', montant: '600' } ] },
      { id: 's3', nom: 'Équipement', nature: 'depense', lignes: [
        { nom: 'Four', poste: 'investissement', frequence: 'ponctuel', montant: '8000', annee_debut: '1' } ] },
      { id: 's4', nom: 'Mes formations', nature: 'depense', lignes: [
        { nom: 'Stage', poste: 'autres_charges', frequence: 'ponctuel', montant: '500', annee_debut: '2' } ] },
    ],
  };
}

test('totaux : recettes, dépenses, récurrentes, ponctuelles, solde et cumul', () => {
  const c = P.calculer(exemple());
  const a1 = c.annees[0], a2 = c.annees[1];
  near(a1.recettes, 24000 + 3000);
  near(a1.depenses, 4800 + 600 + 8000);
  near(a1.recurrentes, 5400); near(a1.ponctuelles, 8000);
  near(a1.solde, 27000 - 13400); near(a1.cumul, 5000 + 13600);
  near(a1.recurrentesParMois, 450);
  near(a2.recettes, 26400); near(a2.ponctuelles, 500);
  near(a2.cumul, a1.cumul + a2.solde);
  near(a1.marge, 13600 / 27000 * 100);
});

test('une section ajoutée par le porteur est comptée comme les autres', () => {
  const c = P.calculer(exemple());
  const s = c.sections.find(x => x.nom === 'Mes formations');
  near(s.total, 500);
  near(c.totalDepenses, c.annees.reduce((x, y) => x + y.depenses, 0));
  near(c.soldeTotal, c.totalRecettes - c.totalDepenses);
});

test('besoin de financement et année de rétablissement', () => {
  const c = P.calculer({ tresorerie_depart: 0, sections: [
    { nom: 'R', nature: 'recette', lignes: [{ nom: 'v', frequence: 'personnalise', v1: 0, v2: 6000, v3: 20000, v4: 20000, v5: 20000 }] },
    { nom: 'D', nature: 'depense', lignes: [{ nom: 'c', frequence: 'annuel', montant: 10000 }] } ] });
  near(c.cumulMin, -14000); near(c.besoinFinancement, 14000);
  assert.equal(c.premiereAnneeRentable, 3);
  assert.equal(c.anneeRetablie, 4);
});

test('trésorerie jamais négative : pas de besoin de financement', () => {
  const c = P.calculer({ tresorerie_depart: 1000, sections: [{ nom: 'R', nature: 'recette', lignes: [{ nom: 'v', frequence: 'annuel', montant: 100 }] }] });
  assert.equal(c.besoinFinancement, 0); assert.equal(c.anneeRetablie, null);
  assert.ok(c.alertes.some(m => /Aucune dépense/.test(m)));
});

test('report vers le compte de résultat : par poste, investissements exclus', () => {
  const r = P.reporterCompteResultat(exemple());
  assert.equal(r.valeurs.ca_1, 24000); assert.equal(r.valeurs.ca_2, 26400);
  assert.equal(r.valeurs.autres_produits_1, 3000);
  assert.equal(r.valeurs.loyers_1, 4800);
  assert.equal(r.valeurs.autres_charges_1, 600);
  assert.equal(r.valeurs.autres_charges_2, 1100);
  assert.equal(r.investissements, 8000);
  assert.equal(r.valeurs.achats_1, undefined);
});

test('alertes : fin avant début, montant sans nom', () => {
  const c = P.calculer({ sections: [{ nom: 'D', nature: 'depense', lignes: [
    { nom: 'a', frequence: 'mensuel', montant: 10, annee_debut: 3, annee_fin: 2 },
    { nom: '', frequence: 'mensuel', montant: 10 } ] }] });
  assert.ok(c.alertes.some(m => /précède/.test(m)));
  assert.ok(c.alertes.some(m => /pas de nom/.test(m)));
});

test('données abîmées : jamais d\'exception ni de NaN', () => {
  const c = P.calculer({ sections: [null, { nature: 'recette', lignes: [null, { frequence: 'zzz', montant: 'abc' }] }, { lignes: 'oups' }] });
  assert.ok(c.annees.every(y => Number.isFinite(y.solde) && Number.isFinite(y.cumul)));
});

test('affichage : synthèse, détail et graphique sont produits, texte utilisateur échappé', () => {
  const pv = exemple(); pv.sections[0].nom = '<b>Ventes</b>';
  const c = P.calculer(pv);
  const t = P.tableauSynthese(c, { cls: 'pv-t' }), d = P.tableauSections(c, { cls: 'pv-t' }), g = P.svgGraphique(c);
  assert.match(t, /Recettes \(gains\)/); assert.match(t, /Solde de l'année/); assert.match(t, /Trésorerie cumulée/);
  assert.match(d, /&lt;b&gt;Ventes&lt;\/b&gt;/); assert.ok(!/<b>Ventes/.test(d));
  assert.match(d, /Boutique en ligne/); assert.match(g, /<svg/); assert.match(g, /polyline/);
  assert.equal((t.match(/<tr/g) || []).length, 9);
});

test('affichage : un prévisionnel vide ne produit rien', () => {
  const c = P.calculer(P.modeleParDefaut());
  assert.equal(P.tableauSynthese(c), ''); assert.equal(P.tableauSections(c), ''); assert.equal(P.svgGraphique(c), ''); assert.deepEqual(P.lecture(c), []);
});

test('lecture : phrases fidèles aux chiffres', () => {
  const l = P.lecture(P.calculer(exemple()));
  assert.ok(l.some(x => /dès l'année 1/.test(x)));
  assert.ok(l.some(x => /reste positive/.test(x)));
  const neg = P.lecture(P.calculer({ sections: [{ nom: 'D', nature: 'depense', lignes: [{ nom: 'c', frequence: 'annuel', montant: 100 }] }, { nom: 'R', nature: 'recette', lignes: [{ nom: 'r', frequence: 'annuel', montant: 10 }] }] }));
  assert.ok(neg.some(x => /restent supérieures/.test(x))); assert.ok(neg.some(x => /Besoin de financement maximal/.test(x)));
});

test('graphique : montants négatifs (trésorerie cumulée) restent dans le cadre', () => {
  const c = P.calculer({ sections: [{ nom: 'D', nature: 'depense', lignes: [{ nom: 'c', frequence: 'annuel', montant: 5000 }] }] });
  const g = P.svgGraphique(c);
  const ys = [...g.matchAll(/cy="(-?[\d.]+)"/g)].map(m => Number(m[1]));
  assert.ok(ys.length === 5 && ys.every(v => v > 0 && v < 236));
});

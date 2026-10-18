/* Tests de la masse salariale détaillée et des tableaux par produit du module Business Plan
   (2026-10-18) -- fonctions pures de assets/business-plan-calc.js. Chiffres calculés à la main. */
const test = require('node:test');
const assert = require('node:assert/strict');
const BPCalc = require('../assets/business-plan-calc.js');

test('calcMasseSalariale', async (t) => {
  await t.test('un salarié toute l\'année : brut × 12, charges patronales en plus', () => {
    const r = BPCalc.calcMasseSalariale({ taux_charges_patronales: '40', masse_salariale_liste: [{ poste: 'Gérant', effectif: '1', brut_mensuel: '2000' }] });
    const y = r.annees[0];
    assert.equal(y.brut, 24000);
    assert.equal(y.charges, 9600);
    assert.equal(y.total, 33600);
    assert.equal(y.etp, 1);
    assert.equal(r.annees[4].total, 33600); // toujours en poste au bout de 5 ans
  });

  await t.test('embauche au mois 7 : 6 mois la première année, 12 ensuite', () => {
    const r = BPCalc.calcMasseSalariale({ masse_salariale_liste: [{ effectif: '2', brut_mensuel: '1000', debut_mois: '7' }] });
    assert.equal(r.annees[0].brut, 12000); // 2 × 1000 × 6
    assert.equal(r.annees[1].brut, 24000);
    assert.equal(r.annees[0].etp, 1);
  });

  await t.test('fin de contrat au mois 18 : 6 mois en année 2, rien après', () => {
    const r = BPCalc.calcMasseSalariale({ masse_salariale_liste: [{ effectif: '1', brut_mensuel: '1000', fin_mois: '18' }] });
    assert.equal(r.annees[0].brut, 12000);
    assert.equal(r.annees[1].brut, 6000);
    assert.equal(r.annees[2].brut, 0);
  });

  await t.test('revalorisation annuelle et taux de charges propre au poste', () => {
    const r = BPCalc.calcMasseSalariale({ taux_charges_patronales: '40', revalorisation_salaires: '10',
      masse_salariale_liste: [{ effectif: '1', brut_mensuel: '1000', taux_charges: '20' }] });
    assert.equal(r.annees[0].total, 14400);          // 12 000 × 1,20
    assert.ok(Math.abs(r.annees[1].total - 15840) < 0.01); // 13 200 × 1,20
  });

  await t.test('sans poste valide : vide', () => {
    assert.equal(BPCalc.calcMasseSalariale({}).vide, true);
    assert.equal(BPCalc.calcMasseSalariale({ masse_salariale_liste: [{ poste: 'x' }] }).vide, true);
  });
});

test('calcProduits', async (t) => {
  const pf = { produits_liste: [
    { nom: 'Mangue séchée', prix_ht: '6', cout_unitaire: '2.5', vol_1: '10000', vol_2: '15000' },
    { nom: 'Jus', prix_ht: '4', cout_unitaire: '1', vol_1: '5000' },
  ] };

  await t.test('marge unitaire, taux de marge, chiffre d\'affaires et achats par année', () => {
    const r = BPCalc.calcProduits(pf);
    assert.equal(r.produits[0].marge, 3.5);
    assert.ok(Math.abs(r.produits[0].margePct - 58.3333) < 0.001);
    assert.equal(r.annees[0].ca, 80000);     // 60 000 + 20 000
    assert.equal(r.annees[0].achats, 30000); // 25 000 + 5 000
    assert.equal(r.annees[0].marge, 50000);
    assert.equal(r.annees[1].ca, 90000);
    assert.equal(r.avecVolumes, true);
  });

  await t.test('prix TTC avec la TVA du plan', () => {
    assert.equal(BPCalc.calcProduits(pf).produits[0].ttc, 6);
    assert.ok(Math.abs(BPCalc.calcProduits({ ...pf, tva_assujetti: 'oui', tva_taux: '20' }).produits[0].ttc - 7.2) < 1e-9);
  });

  await t.test('sans volumes : pas de chiffre d\'affaires à reporter', () => {
    assert.equal(BPCalc.calcProduits({ produits_liste: [{ nom: 'x', prix_ht: '5' }] }).avecVolumes, false);
    assert.equal(BPCalc.calcProduits({}).vide, true);
  });
});

test('alertes de cohérence : salaires et chiffre d\'affaires', async (t) => {
  await t.test('salaires saisis différents de la masse salariale détaillée', () => {
    const alertes = BPCalc.detecterIncoherences({ plan_financier: { salaires_1: '10000', masse_salariale_liste: [{ effectif: '1', brut_mensuel: '2000' }] } });
    assert.ok(alertes.some(a => a.titre.includes('masse salariale')));
  });
  await t.test('pas d\'alerte quand les chiffres concordent', () => {
    const alertes = BPCalc.detecterIncoherences({ plan_financier: { salaires_1: '24000', masse_salariale_liste: [{ effectif: '1', brut_mensuel: '2000' }] } });
    assert.ok(!alertes.some(a => a.titre.includes('masse salariale')));
  });
  await t.test('chiffre d\'affaires saisi différent du total des produits', () => {
    const alertes = BPCalc.detecterIncoherences({ plan_financier: { ca_1: '50000', produits_liste: [{ nom: 'x', prix_ht: '10', cout_unitaire: '4', vol_1: '1000' }] } });
    assert.ok(alertes.some(a => a.titre.includes('total des produits')));
  });
});

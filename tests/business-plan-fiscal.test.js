/* Tests de la fiscalité, de la TVA et de la trésorerie sur 36 mois du module Business Plan
   (2026-10-18) -- fonctions pures de assets/business-plan-calc.js, sans DOM ni base de données.
   Exécutable via `npm test` (node:test). Les chiffres attendus sont calculés à la main dans les
   commentaires, pour qu'un écart soit lisible. */
const test = require('node:test');
const assert = require('node:assert/strict');
const BPCalc = require('../assets/business-plan-calc.js');

test('parseJours', () => {
  assert.equal(BPCalc.parseJours('30 jours'), 30);
  assert.equal(BPCalc.parseJours('Ex : 45 j'), 45);
  assert.equal(BPCalc.parseJours('à la livraison'), 0);
  assert.equal(BPCalc.parseJours(''), 0);
  assert.equal(BPCalc.parseJours(undefined), 0);
});

test('calcModeleFinancier', async (t) => {
  const base = { ca_1: '100000', achats_1: '30000', salaires_1: '20000', loyers_1: '10000', marketing_charge_1: '5000', autres_charges_1: '5000' };

  await t.test('sans régime ni TVA : aucun impôt, résultat net = résultat avant impôt (plans existants inchangés)', () => {
    const y = BPCalc.calcModeleFinancier(base).annees[0];
    assert.equal(y.avantImpot, 30000);
    assert.equal(y.impot, 0);
    assert.equal(y.net, 30000);
    assert.equal(y.tvaCollectee, 0);
  });

  await t.test('IS au taux saisi sur le résultat avant impôt', () => {
    const y = BPCalc.calcModeleFinancier({ ...base, regime_fiscal: 'is', taux_impot: '25' }).annees[0];
    assert.equal(y.impot, 7500);
    assert.equal(y.net, 22500);
  });

  await t.test('taux par défaut quand le régime est choisi sans taux', () => {
    assert.equal(BPCalc.calcModeleFinancier({ ...base, regime_fiscal: 'is' }).annees[0].impot, 7500);
    assert.equal(BPCalc.calcModeleFinancier({ ...base, regime_fiscal: 'ir' }).annees[0].impot, 4500);
  });

  await t.test('IS avec taux réduit jusqu\'au plafond', () => {
    const y = BPCalc.calcModeleFinancier({ ...base, regime_fiscal: 'is', taux_impot: '25', is_taux_reduit: '15', is_seuil_reduit: '20000' }).annees[0];
    // 20 000 × 15 % + 10 000 × 25 % = 3 000 + 2 500
    assert.equal(y.impot, 5500);
  });

  await t.test('les déficits antérieurs s\'imputent sur les bénéfices suivants', () => {
    const pf = { regime_fiscal: 'is', taux_impot: '25', ca_1: '10000', achats_1: '30000', ca_2: '100000', achats_2: '40000' };
    const [a1, a2] = BPCalc.calcModeleFinancier(pf).annees;
    assert.equal(a1.avantImpot, -20000);
    assert.equal(a1.impot, 0);
    // bénéfice 60 000 − déficit 20 000 = base 40 000 × 25 %
    assert.equal(a2.impot, 10000);
    const sansReport = BPCalc.calcModeleFinancier({ ...pf, report_deficit: 'non' }).annees[1];
    assert.equal(sansReport.impot, 15000);
  });

  await t.test('micro-entreprise : taux forfaitaire sur le chiffre d\'affaires', () => {
    const y = BPCalc.calcModeleFinancier({ ...base, regime_fiscal: 'micro', taux_impot: '12' }).annees[0];
    assert.equal(y.impot, 12000);
    assert.equal(y.net, 18000);
  });

  await t.test('structure exonérée : aucun impôt', () => {
    assert.equal(BPCalc.calcModeleFinancier({ ...base, regime_fiscal: 'exonere' }).annees[0].impot, 0);
  });

  await t.test('TVA : collectée sur le CA, déductible sur achats et charges externes, jamais sur les salaires', () => {
    const y = BPCalc.calcModeleFinancier({ ...base, tva_assujetti: 'oui', tva_taux: '20' }).annees[0];
    assert.equal(y.tvaCollectee, 20000);
    assert.equal(y.tvaDeductible, 10000); // (30 000 + 10 000 + 5 000 + 5 000) × 20 %
    assert.equal(y.tvaSolde, 10000);
    assert.equal(y.caTTC, 120000);
    const partielle = BPCalc.calcModeleFinancier({ ...base, tva_assujetti: 'oui', tva_taux: '20', tva_part_deductible: '50' }).annees[0];
    assert.equal(partielle.tvaDeductible, 5000);
  });

  await t.test('TVA non assujetti : zéro', () => {
    assert.equal(BPCalc.calcModeleFinancier({ ...base, tva_assujetti: 'non', tva_taux: '20' }).annees[0].tvaCollectee, 0);
  });
});

test('calcEcheancierMensuel', async (t) => {
  await t.test('rembourse tout le capital et rien pendant le différé', () => {
    const ech = BPCalc.calcEcheancierMensuel({ montant: '12000', taux: '6', duree: '14', differe: '2' }, 24);
    assert.equal(ech[1].capital + ech[1].interets, 0);
    assert.equal(ech[2].capital + ech[2].interets, 0);
    const capital = ech.reduce((s, e) => s + e.capital, 0);
    assert.ok(Math.abs(capital - 12000) < 0.01, 'capital remboursé = ' + capital);
    assert.equal(ech[15].capital + ech[15].interets, 0);
  });

  await t.test('cohérent avec calcEcheancierEmprunt (total des intérêts)', () => {
    const d = { montant: '20000', taux: '5', duree: '36', differe: '0' };
    const mensuel = BPCalc.calcEcheancierMensuel(d, 36).reduce((s, e) => s + e.interets, 0);
    const annuel = BPCalc.calcEcheancierEmprunt(d).parAnnee;
    const total = Object.values(annuel).reduce((s, a) => s + a.interets, 0);
    assert.ok(Math.abs(mensuel - total) < 0.01);
  });
});

test('calcTresorerie', async (t) => {
  const an = n => ({ ['ca_' + n]: '120000', ['achats_' + n]: '60000', ['salaires_' + n]: '24000', ['loyers_' + n]: '12000', ['autres_charges_' + n]: '12000' });
  const base = { ...an(1), ...an(2), ...an(3) };

  await t.test('36 mois ; la somme des flux de l\'année 1 = résultat quand tout est payé comptant', () => {
    const r = BPCalc.calcTresorerie(base, 36);
    assert.equal(r.mois.length, 36);
    const flux1 = r.mois.slice(0, 12).reduce((s, m) => s + m.flux, 0);
    assert.ok(Math.abs(flux1 - 12000) < 0.01, 'flux an 1 = ' + flux1);
    assert.equal(r.mois[35].tresorerie, r.fin);
  });

  await t.test('un délai client de 60 jours décale les encaissements de 2 mois', () => {
    const r = BPCalc.calcTresorerie({ ...base, delai_paiement_clients: '60 jours' }, 36);
    assert.equal(r.delaiClientsMois, 2);
    assert.equal(r.mois[0].clients, 0);
    assert.equal(r.mois[1].clients, 0);
    assert.ok(Math.abs(r.mois[2].clients - 10000) < 0.01);
    assert.ok(r.minimum < 0, 'un décalage client creuse la trésorerie');
    assert.ok(r.besoinComplementaire > 0);
  });

  await t.test('un emprunt est encaissé au mois 1 puis remboursé chaque mois', () => {
    const r = BPCalc.calcTresorerie({ ...base, dettes: [{ montant: '12000', taux: '0', duree: '12', differe: '0' }] }, 36);
    assert.equal(r.mois[0].emprunts, 12000);
    assert.ok(Math.abs(r.mois[0].remboursements - 1000) < 0.01);
    assert.ok(Math.abs(r.mois[11].remboursements - 1000) < 0.01);
    assert.equal(r.mois[12].remboursements, 0);
  });

  await t.test('l\'impôt est payé au 3e mois de l\'année suivante', () => {
    const r = BPCalc.calcTresorerie({ ...base, regime_fiscal: 'is', taux_impot: '25' }, 36);
    assert.equal(r.mois[14].impots, 0.25 * 12000);
    assert.equal(r.mois[2].impots, 0);
  });

  await t.test('la TVA du mois est reversée le mois suivant', () => {
    const r = BPCalc.calcTresorerie({ ...base, tva_assujetti: 'oui', tva_taux: '20' }, 36);
    // par mois : collectée 2 000 − déductible 20 % × (5 000 + 1 000 + 1 000) = 1 400 → 600 à payer
    assert.equal(r.mois[0].tva, 0);
    assert.ok(Math.abs(r.mois[1].tva - 600) < 0.01);
  });

  await t.test('plan de financement : ressources encaissées, emplois décaissés, réserve de trésorerie conservée', () => {
    const r = BPCalc.calcTresorerie({ pf_apport: '30000', pf_materiel: '20000', pf_tresorerie: '10000' }, 36);
    assert.equal(r.mois[0].apports, 30000);
    assert.equal(r.mois[0].investissements, 20000);
    assert.equal(r.mois[0].tresorerie, 10000);
  });

  await t.test('la montée en charge répartit moins de ventes sur les premiers mois sans changer le total annuel', () => {
    const r = BPCalc.calcTresorerie({ ca_1: '120000', montee_en_charge_mois: '6' }, 12);
    assert.ok(r.mois[0].clients < r.mois[6].clients);
    const total = r.mois.reduce((s, m) => s + m.clients, 0);
    assert.ok(Math.abs(total - 120000) < 0.01);
  });
});

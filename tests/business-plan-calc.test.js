/* Tests du module business-plan-calc.js (2026-09-01, consolidation du module Business Plan).
   Rejoint la suite de tests existante du dépôt (tests/*.test.js, node:test -- intégré à Node.js
   depuis la version 18, zéro nouvelle dépendance) -- déjà exécutable via `npm test`
   (voir le script "test" de package.json), pas un nouveau mécanisme.

   ⚠️ Ne JAMAIS lancer `node --test` sans argument depuis la racine (auto-découverte de Node,
   distincte de `npm test`) : elle balaie TOUT fichier dont le nom finit en "-test.js"/"
   .test.js" dans tout le dépôt, y compris d'anciens scripts d'exécution manuelle qui ne sont
   pas des tests -- c'est exactement ce qui a exposé server/seed-comptes-test.js (renommé
   server/seed-comptes.js le 2026-09-01 pour cette raison précise, voir son en-tête).

   Ne couvre volontairement que les fonctions de calcul PURES du module Business Plan (entrée →
   sortie, sans DOM ni base de données) -- le reste de ce module (rendu HTML, sauvegarde, routes
   serveur) n'a pas de suite de tests et cela reste vrai après ce chantier. */
const test = require('node:test');
const assert = require('node:assert/strict');
const BPCalc = require('../assets/business-plan-calc.js');

test('calcAmortissementAnnuel', async (t) => {
  await t.test('additionne l\'amortissement linéaire de plusieurs immobilisations', () => {
    const total = BPCalc.calcAmortissementAnnuel([
      { montant: '18000', valeur_residuelle: '2000', duree_amortissement: '7' }, // 2285.71/an
      { montant: '9000', valeur_residuelle: '1000', duree_amortissement: '7' },  // 1142.86/an
    ]);
    assert.ok(Math.abs(total - (16000/7 + 8000/7)) < 0.01);
  });

  await t.test('ignore une immobilisation sans durée d\'amortissement (division par zéro évitée)', () => {
    const total = BPCalc.calcAmortissementAnnuel([{ montant: '5000', duree_amortissement: '' }]);
    assert.equal(total, 0);
  });

  await t.test('ne descend jamais sous zéro même si la valeur résiduelle dépasse le montant', () => {
    const total = BPCalc.calcAmortissementAnnuel([{ montant: '1000', valeur_residuelle: '5000', duree_amortissement: '5' }]);
    assert.equal(total, 0);
  });

  await t.test('liste vide ou absente -> 0', () => {
    assert.equal(BPCalc.calcAmortissementAnnuel([]), 0);
    assert.equal(BPCalc.calcAmortissementAnnuel(undefined), 0);
  });
});

test('calcInteretsParAnnee', async (t) => {
  await t.test('coût total = mensualité × durée − capital, réparti sur la durée en années', () => {
    // 48 mois = 4 ans, mensualité 500 -> coût total = 500*48 - 20000 = 4000, soit 1000/an sur 4 ans
    const parAnnee = BPCalc.calcInteretsParAnnee([{ montant: '20000', duree: '48', mensualite: '500' }]);
    assert.ok(Math.abs(parAnnee[1] - 1000) < 0.01);
    assert.ok(Math.abs(parAnnee[4] - 1000) < 0.01);
    assert.equal(parAnnee[5], 0);
  });

  await t.test('sans mensualité, retombe sur une approximation à intérêts simples', () => {
    // 20000 à 7% sur 24 mois (2 ans) = 20000*0.07*2 = 2800 total, 1400/an
    const parAnnee = BPCalc.calcInteretsParAnnee([{ montant: '20000', duree: '24', taux: '7' }]);
    assert.ok(Math.abs(parAnnee[1] - 1400) < 0.01);
    assert.ok(Math.abs(parAnnee[2] - 1400) < 0.01);
  });

  await t.test('plafonne à l\'année 5 pour un prêt plus long', () => {
    const parAnnee = BPCalc.calcInteretsParAnnee([{ montant: '10000', duree: '96', taux: '5' }]); // 8 ans
    assert.deepEqual(Object.keys(parAnnee).map(Number).sort(), [1,2,3,4,5]);
  });

  await t.test('dette sans durée ignorée, retourne un objet 1-5 rempli de zéros', () => {
    const parAnnee = BPCalc.calcInteretsParAnnee([{ montant: '10000' }]);
    assert.deepEqual(parAnnee, { 1:0, 2:0, 3:0, 4:0, 5:0 });
  });
});

test('calcDilution', async (t) => {
  await t.test('calcule le % cédé et le % restant aux fondateurs', () => {
    const d = BPCalc.calcDilution(45000, 125000);
    assert.ok(Math.abs(d.pctCede - 36) < 0.01);
    assert.ok(Math.abs(d.pctFondateursApres - 64) < 0.01);
  });

  await t.test('retourne null si le montant ou la valorisation manque (pas de valeur trompeuse)', () => {
    assert.equal(BPCalc.calcDilution(null, 125000), null);
    assert.equal(BPCalc.calcDilution(45000, 0), null);
    assert.equal(BPCalc.calcDilution(45000, ''), null);
  });
});

test('calcScenariosFinancement', async (t) => {
  await t.test('calcule les 3 paliers 50/100/150% avec leur couverture du besoin', () => {
    const scenarios = BPCalc.calcScenariosFinancement(40000, 50000);
    assert.equal(scenarios.length, 3);
    const [p50, p100, p150] = scenarios;
    assert.equal(p50.pct, 50); assert.equal(p50.recu, 20000); assert.equal(p50.couverture, 40); assert.equal(p50.statut, 'insuffisant');
    assert.equal(p100.recu, 40000); assert.equal(p100.couverture, 80); assert.equal(p100.statut, 'partiel');
    assert.equal(p150.recu, 60000); assert.equal(p150.couverture, 120); assert.equal(p150.statut, 'couvert');
  });

  await t.test('sans investissement initial renseigné, couverture et statut restent null (pas de 0% trompeur)', () => {
    const scenarios = BPCalc.calcScenariosFinancement(40000, 0);
    assert.equal(scenarios[0].couverture, null);
    assert.equal(scenarios[0].statut, null);
  });

  await t.test('sans montant recherché, retourne un tableau vide', () => {
    assert.deepEqual(BPCalc.calcScenariosFinancement(0, 50000), []);
    assert.deepEqual(BPCalc.calcScenariosFinancement(null, 50000), []);
  });
});

test('calcBFR', async (t) => {
  await t.test('formule normative : stock moyen + créances clients − dettes fournisseurs', () => {
    const bfr = BPCalc.calcBFR({ stockMoyen: 3000, creancesClients: 5000, dettesFournisseurs: 2000 });
    assert.equal(bfr, 6000);
  });

  await t.test('peut être négatif (fournisseurs financent le cycle) -- pas de plancher à zéro', () => {
    const bfr = BPCalc.calcBFR({ stockMoyen: 1000, creancesClients: 1000, dettesFournisseurs: 5000 });
    assert.equal(bfr, -3000);
  });

  await t.test('champs manquants traités comme zéro', () => {
    assert.equal(BPCalc.calcBFR({}), 0);
  });
});

test('detecterIncoherences', async (t) => {
  await t.test('ne signale rien sur un jeu de données cohérent', () => {
    const sections = {
      plan_financier: {
        ca_1: '12000', achats_1: '9600', investissement_initial: '8000',
        stock_moyen_valeur: '500', creances_clients: '0', dettes_fournisseurs: '0',
        immobilisations_liste: [{ montant: '5000' }], pf_materiel: '4000', pf_vehicules: '1000',
        dettes: [{ montant: '3000' }], pf_banque: '3000',
        pf_apport: '4000', pf_banque_ignore_dup: undefined,
      },
      plan_commercial: { nb_contrats_funnel: '5', panier_moyen_commercial: '200' },
      produits: { etude_prix: [{ produit: 'X', marge_souhaitee: '20' }] },
      financement: { montant: '8000', pourcentage_propose: '40', valorisation_apres: '20000' },
    };
    // équilibre Ressources (apport 2000 + banque 3000 = 5000) et Emplois (matériel 4000 + véhicules 1000 = 5000)
    sections.plan_financier.pf_apport = '2000';
    const alertes = BPCalc.detecterIncoherences(sections);
    assert.deepEqual(alertes, []);
  });

  await t.test('détecte un CA très supérieur à la capacité du funnel commercial', () => {
    const alertes = BPCalc.detecterIncoherences({
      plan_financier: { ca_1: '500000' },
      plan_commercial: { nb_contrats_funnel: '5', panier_moyen_commercial: '100' },
    });
    assert.ok(alertes.some(a => a.titre.includes('supérieur à la capacité commerciale')));
  });

  await t.test('détecte une marge déclarée très différente de la marge calculée', () => {
    const alertes = BPCalc.detecterIncoherences({
      plan_financier: { ca_1: '10000', achats_1: '8000' }, // marge calculée 20%
      produits: { etude_prix: [{ produit: 'Test', marge_souhaitee: '90' }] },
    });
    assert.ok(alertes.some(a => a.titre.includes('Marge déclarée')));
  });

  await t.test('détecte un financement recherché inférieur au besoin (investissement + BFR)', () => {
    const alertes = BPCalc.detecterIncoherences({
      plan_financier: { investissement_initial: '50000' },
      financement: { montant: '10000' },
    });
    assert.ok(alertes.some(a => a.titre.includes('inférieur au besoin identifié')));
  });

  await t.test('ne signale rien quand le financement recherché + l\'apport personnel couvrent le besoin -- correctif du 2026-09-01', () => {
    // Trouvé en créant un vrai plan ("Optim Home") : le besoin total peut être sciemment couvert
    // en partie par l'apport personnel, pas uniquement par le financement recherché -- comparer
    // le montant recherché seul au besoin produisait une fausse alerte.
    const alertes = BPCalc.detecterIncoherences({
      plan_financier: { investissement_initial: '9000', apport_personnel: '2000', stock_moyen_valeur: '800', creances_clients: '0', dettes_fournisseurs: '0' },
      financement: { montant: '7000' },
    });
    assert.ok(!alertes.some(a => a.titre.includes('inférieur au besoin identifié')));
  });

  await t.test('signale quand même si financement + apport ne suffisent pas', () => {
    const alertes = BPCalc.detecterIncoherences({
      plan_financier: { investissement_initial: '9000', apport_personnel: '500' },
      financement: { montant: '3000' },
    });
    assert.ok(alertes.some(a => a.titre.includes('inférieur au besoin identifié')));
  });

  await t.test('détecte un pourcentage de capital proposé incohérent avec la dilution calculée', () => {
    const alertes = BPCalc.detecterIncoherences({
      financement: { montant: '45000', valorisation_apres: '125000', pourcentage_propose: '5' }, // calculé ~36%
    });
    assert.ok(alertes.some(a => a.titre.includes('Pourcentage de capital proposé')));
  });

  await t.test('détecte un écart entre la liste des immobilisations et le total Matériel + Véhicules', () => {
    const alertes = BPCalc.detecterIncoherences({
      plan_financier: {
        immobilisations_liste: [{ montant: '40000' }],
        pf_materiel: '5000', pf_vehicules: '5000',
      },
    });
    assert.ok(alertes.some(a => a.titre.includes('immobilisations différent')));
  });

  await t.test('détecte un écart entre la liste des dettes et le poste Banque', () => {
    const alertes = BPCalc.detecterIncoherences({
      plan_financier: { dettes: [{ montant: '20000' }], pf_banque: '2000' },
    });
    assert.ok(alertes.some(a => a.titre.includes('emprunts différent')));
  });

  await t.test('détecte un plan de financement déséquilibré (Ressources ≠ Emplois) -- le bug trouvé le 2026-08-31', () => {
    const alertes = BPCalc.detecterIncoherences({
      plan_financier: { pf_apport: '8000', pf_banque: '20000', pf_diaspo_invest: '17000', // Ressources = 45000
        pf_materiel: '33000', pf_vehicules: '7000', pf_construction: '5000', pf_logiciels: '1000',
        pf_stocks: '3000', pf_tresorerie: '12000', pf_frais_admin: '2000', pf_communication: '2000' }, // Emplois = 65000
    });
    const alerte = alertes.find(a => a.titre.includes('déséquilibré'));
    assert.ok(alerte, 'alerte de déséquilibre attendue');
    assert.match(alerte.detail, /45\s?000/);
    assert.match(alerte.detail, /65\s?000/);
  });
});

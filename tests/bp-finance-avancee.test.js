'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../assets/bp-finance-avancee.js');
const P = require('../assets/bp-previsionnel.js');

const pfBase = () => ({
  investissement_initial: '5000',
  salaires_1: '1000', salaires_2: '1000', salaires_3: '1000', salaires_4: '1000', salaires_5: '1000',
  offres_portefeuille: [{ nom: 'Essentiel', prix_mensuel: '100', cout_mensuel: '60', clients_depart: '0', clients_a1: '12', clients_a2: '12', clients_a3: '12', clients_a4: '12', clients_a5: '12', resiliation_pct: '10' }],
});

test('plan vide ou sans offre : résultat « vide », jamais de chiffre inventé', () => {
  assert.equal(F.calculer({}).vide, true);
  assert.equal(F.calculer(null).vide, true);
  assert.equal(F.calculer({ offres_portefeuille: [{ nom: 'X', prix_mensuel: '' }] }).vide, true);
  assert.equal(F.calculer({ offres_portefeuille: [{ nom: 'X', prix_mensuel: '50' }] }).vide, true, 'sans aucun client saisi');
  assert.equal(F.indicateurs(F.calculer({})), '');
  assert.deepEqual(F.reporterCompteResultat(F.calculer({})), {});
});

test('montée linéaire des clients : CA, coûts, marge et résultat de l\'année 1', () => {
  const c = F.calculer(pfBase());
  const y = c.annees[0];
  assert.equal(y.CA, 100 * 78);          // clients 1..12 chaque mois → somme 78
  assert.equal(y.CV, 60 * 78);
  assert.equal(y.marge, 40 * 78);
  assert.equal(y.fixes, 1000);
  assert.equal(y.resultat, 40 * 78 - 1000);
  assert.equal(c.annees[1].CA, 100 * 144);
  assert.equal(y.clientsFin, 12);
});

test('seuil de rentabilité = charges fixes / marge par client', () => {
  const c = F.calculer(pfBase());
  const y = c.annees[0];
  assert.ok(Math.abs(y.seuilClients - 1000 / (3120 / 6.5)) < 1e-9);
  assert.equal(c.annees[1].moyenne, 12);
});

test('résiliations et nouveaux clients à gagner', () => {
  const c = F.calculer(pfBase());
  assert.ok(Math.abs(c.annees[1].resilies - 1.2) < 1e-9);   // 10 % de 12 clients en début d'année 2
  assert.ok(Math.abs(c.annees[1].acquisitions - 1.2) < 1e-9);
  assert.equal(c.annees[0].acquisitions, 12);
});

test('délai de retour sur investissement : premier mois où le cumul redevient positif', () => {
  const pf = pfBase(), c = F.calculer(pf);
  let cum = -5000, attendu = null;
  for (let m = 1; m <= 60; m++) { const cl = m <= 12 ? m : 12; cum += cl * 40 - 1000 / 12; if (attendu === null && cum >= 0) attendu = m; }
  assert.equal(c.delaiRetourMois, attendu);
  const sans = pfBase(); sans.investissement_initial = '';
  assert.equal(F.calculer(sans).delaiRetourMois, null);
});

test('cumul des résultats prend en compte l\'investissement de départ', () => {
  const c = F.calculer(pfBase());
  assert.equal(c.annees[0].cumul, c.annees[0].resultat - 5000);
  assert.equal(c.annees[1].cumul, c.annees[0].cumul + c.annees[1].resultat);
});

test('scénarios : prudent < central < optimiste, coefficients modifiables', () => {
  const c = F.calculer(pfBase());
  const r = k => c.scenarios[k].parAn[4].resultat;
  assert.ok(r('prudent') < r('central') && r('central') < r('optimiste'));
  assert.equal(c.parametresScenarios.prudent.clients, 80);
  const pf = pfBase(); pf.scenario_prudent_clients_pct = '50'; pf.scenario_prudent_charges_pct = '100';
  const c2 = F.calculer(pf);
  assert.equal(c2.scenarios.prudent.parAn[4].CA, c2.scenarios.central.parAn[4].CA / 2);
  assert.equal(c2.parametresScenarios.prudent.clients, 50);
});

test('charges fixes : compte de résultat, sinon prévisionnel libre', () => {
  const prev = P.modeleParDefaut();
  const l = P.nouvelleLigne('depense'); l.nom = 'Loyer'; l.poste = 'loyers'; l.frequence = 'mensuel'; l.montant = '200';
  prev.sections[1].lignes.push(l);
  const pf = { prevision: prev };
  assert.deepEqual(F.chargesFixes(pf, P), [2400, 2400, 2400, 2400, 2400]);
  pf.loyers_1 = '5000';
  assert.equal(F.chargesFixes(pf, P)[0], 5000);
  assert.equal(F.chargesFixes(pf, P)[1], 2400);
  assert.equal(F.chargesFixes(pf)[1], 0, 'sans module prévisionnel : rien d\'inventé');
});

test('alertes : coût absent ou supérieur au prix, charges fixes absentes', () => {
  const pf = pfBase(); pf.offres_portefeuille[0].cout_mensuel = '';
  assert.ok(F.calculer(pf).alertes.some(a => /aucun coût estimé/.test(a)));
  const pf2 = pfBase(); pf2.offres_portefeuille[0].cout_mensuel = '150';
  assert.ok(F.calculer(pf2).alertes.some(a => /dépasse le prix/.test(a)));
  const pf3 = pfBase(); ['1', '2', '3', '4', '5'].forEach(a => { delete pf3['salaires_' + a]; });
  assert.ok(F.calculer(pf3).alertes.some(a => /charge fixe/.test(a)));
});

test('report dans le compte de résultat : ca_N et achats_N arrondis, rien d\'autre', () => {
  const v = F.reporterCompteResultat(F.calculer(pfBase()));
  assert.equal(v.ca_1, 7800); assert.equal(v.achats_1, 4680); assert.equal(v.ca_5, 14400);
  assert.equal(Object.keys(v).length, 10);
});

test('60 mois : clients et CA de chaque mois', () => {
  const t = F.tableau60Mois(F.calculer(pfBase()));
  assert.equal(t.length, 60);
  assert.equal(t[0].clients, 1); assert.equal(t[11].clients, 12); assert.equal(t[59].clients, 12);
  assert.equal(t[11].ca, 1200);
  assert.equal(t[59].annee, 5);
});

test('plusieurs offres : répartition du CA et rentabilité par offre', () => {
  const pf = pfBase();
  pf.offres_portefeuille.push({ nom: 'Premium', prix_mensuel: '300', cout_mensuel: '150', clients_depart: '0', clients_a1: '6', resiliation_pct: '5' });
  const c = F.calculer(pf);
  assert.equal(c.parOffre.length, 2);
  assert.equal(c.parOffre[1].tauxMarge, 50);
  assert.equal(c.parOffre[1].fin[4], 6, 'année sans valeur : on reporte la précédente');
  const somme = c.parOffre.reduce((s, o) => s + o.partCaAn1, 0);
  assert.ok(Math.abs(somme - 100) < 1e-9);
});

test('affichage : tableaux et graphiques produits, texte utilisateur échappé', () => {
  const pf = pfBase(); pf.offres_portefeuille[0].nom = '<b>Essentiel</b>';
  const c = F.calculer(pf);
  [F.tableauClients(c), F.tableauCA(c), F.tableauRentabiliteOffres(c), F.tableauScenarios(c)].forEach(h => { assert.ok(h.startsWith('<table')); assert.ok(!h.includes('<b>Essentiel</b>')); });
  assert.ok(F.svgClients(c).startsWith('<svg')); assert.ok(F.svgResultat(c).startsWith('<svg')); assert.ok(F.svgRepartition(c).startsWith('<svg'));
  assert.ok(F.indicateurs(c).includes('fa-kpi'));
  assert.ok(F.lecture(c).length >= 3);
  assert.equal(F.svgClients(F.calculer({})), '');
});

test('données hostiles : texte, négatifs, tableau absent ne plantent pas', () => {
  const c = F.calculer({ offres_portefeuille: 'oups', salaires_1: 'abc' });
  assert.equal(c.vide, true);
  const c2 = F.calculer({ offres_portefeuille: [null, { prix_mensuel: '-5' }, { nom: 'Ok', prix_mensuel: '10', clients_a1: '-3', cout_mensuel: 'x' }] });
  assert.equal(c2.vide, false);
  assert.equal(c2.annees[0].clientsFin, 0);
});

/* ── Bilan prévisionnel, BFR et ratios ── */
const CALC = require('../assets/business-plan-calc.js');
const pfBilan = () => ({
  regime_fiscal: 'exonere',
  ca_1: '100000', ca_2: '150000', ca_3: '200000', ca_4: '250000', ca_5: '300000',
  achats_1: '30000', achats_2: '45000', achats_3: '60000', achats_4: '75000', achats_5: '90000',
  salaires_1: '20000', salaires_2: '25000', salaires_3: '30000', salaires_4: '35000', salaires_5: '40000',
  loyers_1: '6000', loyers_2: '6000', loyers_3: '6000', loyers_4: '6000', loyers_5: '6000',
  immobilisations_liste: [{ nom: 'Véhicule', montant: '20000', duree_amortissement: '5', valeur_residuelle: '0' }],
  dettes: [{ nom: 'Prêt', montant: '30000', taux: '8', duree: '36', differe: '0' }],
  pf_apport: '15000', pf_associes: '10000',
  delai_paiement_clients: '30 jours', delai_paiement_fournisseurs: '60 jours', rotation_stocks: '15',
});

test('bilan : actif = passif (contrôle réel, trésorerie déduite des flux)', () => {
  const b = F.bilan(pfBilan(), CALC);
  assert.equal(b.vide, false);
  assert.equal(b.annees.length, 5);
  assert.equal(b.equilibre, true);
  b.annees.forEach(y => assert.ok(Math.abs(y.actif - y.passif) < 1e-6, 'an ' + y.a));
});

test('bilan : immobilisations nettes, capital, dettes qui s\'éteignent, BFR en jours', () => {
  const b = F.bilan(pfBilan(), CALC), y1 = b.annees[0], y4 = b.annees[3];
  assert.equal(y1.immosNettes, 16000);
  assert.equal(b.annees[4].immosNettes, 0);
  assert.equal(y1.capital, 25000);
  assert.ok(y1.dettes > 0 && y1.dettes < 30000);
  assert.equal(y4.dettes, 0, 'prêt de 36 mois soldé après l\'année 3');
  assert.ok(Math.abs(y1.creances - 100000 * 30 / 365) < 1e-6);
  assert.ok(Math.abs(y1.fournisseurs - (30000 + 6000) * 60 / 365) < 1e-6);
  assert.ok(Math.abs(y1.bfr - (y1.creances + y1.stocks - y1.fournisseurs)) < 1e-9);
});

test('ratios : marge brute, endettement, couverture de la dette', () => {
  const b = F.bilan(pfBilan(), CALC), y1 = b.annees[0];
  assert.ok(Math.abs(y1.margeBrutePct - 70) < 1e-9);
  assert.ok(Math.abs(y1.endettement - y1.dettes / y1.capitauxPropres) < 1e-9);
  assert.ok(y1.couvertureDette > 0);
  assert.equal(b.annees[4].capaciteRemboursementAns, 0);
});

test('bilan : alertes sans immobilisation, sans apport, sans délais ; vide sans chiffre d\'affaires', () => {
  assert.equal(F.bilan({}, CALC).vide, true);
  assert.equal(F.bilan(pfBilan()).vide, true, 'sans module de calcul : rien d\'inventé');
  const pf = pfBilan(); pf.immobilisations_liste = []; pf.pf_apport = ''; pf.pf_associes = ''; pf.dettes = []; pf.delai_paiement_clients = ''; pf.delai_paiement_fournisseurs = ''; pf.rotation_stocks = '';
  const a = F.bilan(pf, CALC).alertes.join(' | ');
  assert.match(a, /Aucune immobilisation/); assert.match(a, /Aucun apport/); assert.match(a, /Aucun délai/);
  assert.equal(F.bilan(pf, CALC).equilibre, true, 'l\'égalité reste vraie même sans hypothèse');
});

test('bilan : amortissement au-delà de la durée signalé, trésorerie négative signalée', () => {
  const pf = pfBilan(); pf.immobilisations_liste[0].duree_amortissement = '2';
  assert.match(F.bilan(pf, CALC).alertes.join(' '), /négatives/);
  const pf2 = pfBilan(); pf2.pf_apport = ''; pf2.pf_associes = ''; pf2.dettes = []; pf2.salaires_1 = '90000';
  assert.match(F.bilan(pf2, CALC).alertes.join(' '), /trésorerie de fin d'année 1 est négative/);
});

test('affichage du bilan, du BFR et des ratios', () => {
  const b = F.bilan(pfBilan(), CALC);
  [F.tableauBilan(b), F.tableauBFR(b), F.tableauRatios(b)].forEach(h => assert.ok(h.startsWith('<table')));
  assert.equal(F.tableauBilan(F.bilan({}, CALC)), '');
  assert.equal(F.jours('45 jours'), 45); assert.equal(F.jours(''), 0);
});

test('part des charges fixes et de l\'investissement supportée par les offres', () => {
  const pf = pfBase(); pf.portefeuille_part_charges_pct = '40';
  const c = F.calculer(pf);
  assert.equal(c.partChargesPct, 40);
  assert.equal(c.annees[0].fixes, 400);
  assert.equal(c.investissement, 2000);
  assert.equal(F.calculer(pfBase()).partChargesPct, 100);
  const hors = pfBase(); hors.portefeuille_part_charges_pct = '250';
  assert.equal(F.calculer(hors).partChargesPct, 100, 'plafonnée à 100 %');
  assert.ok(F.indicateurs(c).includes('part de 40 %'));
});

test('les nombres de clients ne portent jamais de symbole monétaire', () => {
  const c = F.calculer(pfBase());
  const ctx = { fmt: n => Math.round(n) + ' €' };
  const html = F.indicateurs(c, ctx) + F.tableauClients(c, ctx) + F.tableauCA(c, ctx);
  assert.ok(!/\d\s*€\s*clients/.test(html), 'seuil exprimé en clients, pas en euros');
  const clients = F.tableauClients(c, ctx);
  assert.ok(!clients.includes('€'), 'tableau des clients sans euro');
  assert.ok(F.lecture(c, ctx).every(l => !/€\s*(client|clients|en fin)/.test(l)), 'phrases de lecture sans euro devant « client »');
  assert.match(F.indicateurs(c, ctx), /Chiffre d'affaires année 5<\/div>|€/, 'les montants gardent leur devise');
});

test('bilan : prêt dont la mensualité ne solde pas le capital — équilibre conservé et alerte', () => {
  const pf = pfBilan();
  pf.dettes = [{ nom: 'Prêt court', montant: '20000', taux: '7', duree: '48', differe: '6', mensualite: '500', date_debut: '2027-01-01' }];
  const b = F.bilan(pf, CALC);
  assert.equal(b.equilibre, true, 'actif = passif toutes années, même avec un solde non remboursé par l\'échéancier');
  b.annees.forEach(y => assert.ok(Math.abs(y.ecart) < 1, 'an ' + y.a));
  assert.match(b.alertes.join(' '), /n'est pas entièrement remboursé/);
  assert.ok(b.annees[4].dettes < 1, 'dette soldée en fin d\'année 5');
});

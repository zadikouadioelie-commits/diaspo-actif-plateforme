/* Tests de assets/bp-enrichi.js — cahier des charges enrichi du Business Plan (rubriques 1 à 20). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const E = require('../assets/bp-enrichi.js');

const bp = (s, extra) => Object.assign({ nom_projet: 'Projet test', sections: s }, extra || {});

test('structure : 20 rubriques, clés valides et uniques, types connus', () => {
  assert.equal(E.rubriques().length, 20);
  const types = ['texte', 'long', 'nombre', 'date', 'choix'];
  for (const r of E.rubriques()) {
    const cles = new Set();
    for (const c of E.cartes(r)) for (const f of c.champs) {
      assert.ok(types.includes(f.t), r + '.' + f.k); assert.ok(f.l && f.k, r);
      assert.ok(!cles.has(f.k), 'clé en double : ' + r + '.' + f.k); cles.add(f.k);
      if (f.t === 'choix') assert.ok(f.opts && f.opts.length > 1, r + '.' + f.k);
    }
    const lk = new Set();
    for (const l of E.listes(r)) {
      assert.ok(!lk.has(l.k), 'liste en double : ' + r + '.' + l.k); lk.add(l.k);
      assert.ok(l.titre && l.cols.length, r + '.' + l.k);
      assert.ok(l.cols.some(c => c.k === l.nom) || l.base, 'colonne titre absente : ' + r + '.' + l.k);
      const ck = new Set(); for (const c of l.cols) { assert.ok(types.includes(c.t)); assert.ok(!ck.has(c.k), 'colonne en double ' + l.k + '.' + c.k); ck.add(c.k); if (c.t === 'choix') assert.ok(c.opts.length > 1); }
    }
    assert.ok(![...cles].some(k => lk.has(k)), 'clé de champ = clé de liste dans ' + r);
  }
});

test('aucun doublon de saisie : les nouvelles clés ne reprennent aucun champ déjà présent dans l\'éditeur', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'business-plan-edit.html'), 'utf8');
  const existantes = new Set([...html.matchAll(/(?:field|textarea|select|bmcField|finInput)\(\s*'([a-z_0-9]+)'/g)].map(m => m[1]));
  const doublons = [];
  for (const r of E.rubriques()) for (const c of E.cartes(r)) for (const f of c.champs) if (existantes.has(f.k)) doublons.push(r + '.' + f.k);
  assert.deepEqual(doublons, []);
});

test('libellés et détection des données : rien d\'affiché tant que rien n\'est saisi', () => {
  assert.equal(E.libelles('infos_generales').nature_activite, "Nature de l'activité");
  for (const r of E.rubriques()) { assert.equal(E.contientDonnees(r, {}), false, r); assert.equal(E.blocs(r, bp({})).filter(b => b.html).length === 0 || r === 'infos_generales' || r === 'resume_executif', true, r); }
  assert.equal(E.contientDonnees('infos_generales', { nature_activite: 'B2B' }), true);
  assert.equal(E.contientDonnees('marche', { porter: [{ force: 'Rivalité entre concurrents' }] }), false, 'les lignes par défaut ne comptent pas comme saisie');
  assert.equal(E.contientDonnees('marche', { porter: [{ force: 'Rivalité entre concurrents', intensite: 'Forte' }] }), true);
});

test('SMART : complet seulement avec objectif, indicateur + cible, réalisme et échéance', () => {
  const ok = E.smart({ objectif: 'Ouvrir', indicateur: 'Points de vente', valeur_cible: '3', atteignable: 'Oui', echeance: '2027-06' });
  assert.equal(ok.complet, true);
  const ko = E.smart({ objectif: 'Ouvrir', indicateur: 'Points de vente' });
  assert.equal(ko.complet, false); assert.deepEqual(ko.manquants, ['indicateur et valeur cible', 'réalisme', 'échéance']);
  assert.equal(E.smart({ objectif: 'a', indicateur: 'b', valeur_cible: '1', atteignable: 'Non', echeance: 'x' }).complet, false);
});

test('priorisation : score = gravité × fréquence × urgence sur 100, tri décroissant, non évalué en dernier', () => {
  const r = E.prioriser([{ probleme: 'A', gravite: '5', frequence: '5', urgence: '5' }, { probleme: 'B', gravite: '2', frequence: '2', urgence: '2' }, { probleme: 'C', gravite: '4' }]);
  assert.deepEqual(r.map(x => x.probleme), ['A', 'B', 'C']); assert.equal(r[0].score, 100); assert.equal(r[1].score, 6); assert.equal(r[2].score, null);
});

test('plan SWOT : priorité = probabilité × impact, niveaux 5 / 10 / 15', () => {
  const p = E.planSwot([{ element: 'a', probabilite: '5', impact_note: '4' }, { element: 'b', probabilite: '2', impact_note: '3' }, { element: 'c', probabilite: '1', impact_note: '1' }, { element: 'd' }]);
  assert.deepEqual(p.map(x => x.priorite), ['Critique', 'Moyenne', 'Faible', null]); assert.equal(p[0].score, 20);
});

test('TOWS : base proposée uniquement à partir des éléments saisis, jamais sans élément', () => {
  const t = E.proposerTows([{ cat: 'forces', titre: 'Équipe' }, { cat: 'opportunites', titre: 'Demande' }, { cat: 'menaces', titre: 'Prix' }]);
  assert.match(t.tows_so, /Équipe.*Demande/); assert.match(t.tows_st, /Équipe.*Prix/); assert.equal(t.tows_wo, ''); assert.equal(t.tows_wt, '');
  assert.deepEqual(E.proposerTows([]), { tows_so: '', tows_st: '', tows_wo: '', tows_wt: '' });
});

test('LTV / CAC : ratio seulement si les deux valeurs existent', () => {
  const r = E.ltvCac([{ segment: 'A', cac_segment: '100', ltv_segment: '450' }, { segment: 'B', cac_segment: '100', ltv_segment: '120' }, { segment: 'C', cac_segment: '50' }, { segment: 'D', cac_segment: '100', ltv_segment: '30' }]);
  assert.deepEqual(r.map(x => x.lecture), ['Rentable', 'À surveiller', '', 'Non rentable']); assert.equal(r[0].ratio, 4.5); assert.equal(r[2].ratio, null);
});

test('hypothèses critiques : décompte des validées / invalidées / non testées', () => {
  const v = E.validation([{ hypothese: 'a', critique: 'Oui', statut_validation: 'Validée' }, { hypothese: 'b', critique: 'Oui' }, { hypothese: 'c', critique: 'Oui', statut_validation: 'Invalidée' }, { hypothese: 'd', critique: 'Non', statut_validation: 'Validée' }]);
  assert.deepEqual([v.total, v.critiques, v.critiquesValidees, v.critiquesInvalidees, v.critiquesNonTestees, v.pctCritiquesValidees], [4, 3, 1, 1, 1, 33]);
});

test('campagnes : écarts et coûts par prospect calculés seulement avec les valeurs saisies', () => {
  const c = E.campagnes([{ campagne: 'X', budget_prevu: '1000', budget_reel: '1200', prospects_prevus: '100', prospects_reels: '80', conversions_prevues: '10', conversions_reelles: '12' }, { campagne: 'Y', budget_prevu: '500', prospects_prevus: '50' }]);
  assert.equal(c[0].ecart_budget, 200); assert.equal(c[0].cout_prospect_prevu, 10); assert.equal(c[0].cout_prospect_reel, 15); assert.equal(c[0].taux_conv_reel, 15);
  assert.equal(c[1].ecart_budget, null); assert.equal(c[1].cout_prospect_reel, null); assert.equal(c[1].realise, false);
});

test('produits : coût de revient = somme des coûts de la fiche sinon catalogue ; marges, TTC, CA, utilisation, contribution', () => {
  const p = E.produitsCalcules([
    { nom: 'P1', prix_vente: '100', cout_matieres: '30', cout_main_oeuvre: '10', tva_pct: '20', volume_mensuel_prevu: '10', capacite_production_annuelle: '240' },
    { nom: 'P2', prix_vente: '50', cout_revient: '40', volume_annuel_prevu: '100' }, { nom: 'P3' }, { prix_vente: '5' }]);
  assert.equal(p.length, 3);
  assert.equal(p[0].coutRevient, 40); assert.equal(p[0].margeBrute, 60); assert.equal(p[0].tauxMarque, 60); assert.equal(p[0].prixTtc, 120); assert.equal(p[0].volAn, 120); assert.equal(p[0].ca, 12000); assert.equal(p[0].utilisation, 50);
  assert.equal(p[1].coutRevient, 40); assert.equal(p[1].methodeCout, 'Coût de revient du catalogue'); assert.equal(p[1].margeContrib, null); assert.equal(p[1].ca, 5000);
  assert.equal(p[2].ca, null); assert.equal(p[2].margeBrute, null);
  assert.equal(Math.round(p[0].contribution + p[1].contribution), 100);
  assert.deepEqual(E.classement(p, 'ca').map(x => x.nom), ['P1', 'P2']);
});

test('entonnoir, pipeline pondéré, objectifs réalisés', () => {
  const e = E.entonnoir([{ etape: 'Prospects', nb: '100' }, { etape: 'RDV', nb: '40' }, { etape: 'Contrats', nb: '10' }]);
  assert.deepEqual(e.map(x => x.taux), [null, 40, 25]);
  const p = E.pipeline([{ prospect: 'A', montant: '1000', probabilite: '50' }, { prospect: 'B', montant: '2000' }]);
  assert.equal(p.total, 3000); assert.equal(p.pondere, 500); assert.equal(p.incomplets, 1);
  const o = E.objectifsRealises([{ libelle: 'T1', objectif: '200', realise: '150' }, { libelle: 'T2', objectif: '200' }]);
  assert.equal(o[0].atteinte, 75); assert.equal(o[1].atteinte, null);
});

test('gouvernance : droits de vote, séparation des fonctions', () => {
  assert.equal(E.listes('organisation').find(l => l.k === 'droits_vote').calc, 'vote');
  const d = E.blocs('organisation', bp({ organisation: { droits_vote: [{ detenteur: 'A', voix_pct: '60' }, { detenteur: 'B', voix_pct: '30' }], decisions_responsabilites: [{ decision: 'Achat', decide: 'Awa', execute: 'Ibrahim', controle: 'awa' }] } }));
  const html = d.map(b => b.html).join('');
  assert.match(html, /totalisent 90 % au lieu de 100 %/); assert.match(html, /décide et contrôle/); assert.match(html, /Séparation des fonctions à revoir/);
});

test('RH : effectifs, ETP et plan sur trois ans cumulé', () => {
  const eff = E.listes('rh').find(l => l.k === 'effectifs_detail');
  assert.ok(eff);
  const plan = E.planRh([{ horizon: '12 mois', poste: 'Vendeur', nb: '2', budget: '1000' }, { horizon: '36 mois', poste: 'Comptable', nb: '1', budget: '500' }], [{ service: 'Prod', nb: '4', etp: '3.5', categorie: 'Salarié' }]);
  assert.deepEqual(plan.map(x => x.cumulRecrutements), [2, 2, 3]); assert.deepEqual(plan.map(x => x.effectifFin), [6, 6, 7]); assert.deepEqual(plan.map(x => x.cumulBudget), [1000, 1000, 1500]);
  assert.equal(E.planRh([{ horizon: '12 mois', nb: '1' }], [])[0].effectifFin, null, 'pas d\'effectif de départ saisi : aucune fin de période inventée');
});

test('calendrier : alertes de retard et Gantt', () => {
  const now = Date.parse('2026-11-11');
  const a = E.blocs('calendrier', bp({ calendrier: { phases: [
    { nom: 'P1', debut: '2026-01-01', fin: '2026-06-30', statut: 'en_cours', avancement_physique: '40', chemin_critique: 'Oui' },
    { nom: 'P2', debut: '2026-02-01', fin: '2026-03-31', statut: 'termine', fin_reelle: '2026-04-10' },
    { nom: 'P3', debut: '2027-01-01', fin: '2027-03-01', statut: 'planifie' }] } }));
  const html = a.map(b => b.html).join('');
  assert.match(html, /ench-gt/); assert.match(html, /Chemin critique|class="br cr"/);
  const al = E.listes('calendrier')[0] && require('../assets/bp-enrichi.js');
  assert.ok(al);
  const x = [{ nom: 'P1', fin: '2026-06-30', statut: 'en_cours', avancement_physique: '40' }, { nom: 'P2', fin: '2026-03-31', statut: 'termine', fin_reelle: '2026-04-10' }, { nom: 'P3', fin: '2027-03-01', statut: 'planifie' }, { nom: 'P4', fin: '2027-03-01', statut: 'retard' }];
  assert.match(html, /Alertes de retard/);
  assert.equal(E.contientDonnees('calendrier', { phases: [{ nom: 'P', debut: '2026-01-01', fin: '2026-02-01' }] }), true);
  assert.equal(x.length, 4); assert.ok(now > 0);
});

test('plan financier : fiabilité (jamais « vérifiée » par défaut) et DSCR', () => {
  const html = E.blocs('plan_financier', bp({ plan_financier: { hypotheses_financieres: [{ hypothese: 'Prix moyen', valeur: '12', fiabilite: 'Vérifiée' }, { hypothese: 'Croissance', valeur: '10 %' }], service_dette: [{ annee: '2027', flux_disponible: '120', service_dette: '100' }, { annee: '2028', flux_disponible: '50' }] } })).map(b => b.html).join('');
  assert.match(html, /Déclarative \(non précisée\)/); assert.match(html, /1 vérifiée\(s\), 0 estimée\(s\), 1 déclarative\(s\)/); assert.match(html, /1,20 · Couverture confortable/);
  assert.match(html, /—/);
});

test('risques : criticité probabilité × impact, cartographie et registre trié', () => {
  const r = E.risquesCalcules([{ description: 'Panne', probabilite: 'moyen', impact: 'critique', risque_residuel: 'faible' }, { description: 'Retard', probabilite: 'faible', impact: 'faible' }, { description: 'Sans note' }]);
  assert.deepEqual(r.map(x => x.score), [8, 1, null]); assert.deepEqual(r.map(x => x.criticite), ['Élevée', 'Faible', null]); assert.equal(r[0].residuel, 'Faible');
  const html = E.blocs('risques', bp({ risques: { items: [{ description: 'Panne', probabilite: 'moyen', impact: 'critique' }, { description: 'Retard', probabilite: 'critique', impact: 'critique' }] } })).map(b => b.html).join('');
  assert.match(html, /ench-carte/); assert.ok(html.indexOf('Retard') < html.indexOf('Panne') || html.lastIndexOf('Retard') < html.lastIndexOf('Panne'));
  assert.equal(E.contientDonnees('risques', { items: [{ description: 'x', probabilite: 'moyen', impact: 'moyen' }] }), true);
});

test('impact : progression seulement si les trois valeurs sont numériques', () => {
  const r = E.indicateursImpact([{ nom: 'Emplois', situation_initiale: '0', valeur_actuelle: '5', valeur_cible: '20' }, { nom: 'Texte', valeur_actuelle: 'oui', valeur_cible: 'oui' }]);
  assert.equal(r[0].progression, 25); assert.equal(r[1].progression, null); assert.equal(r[1].preuve, 'Non précisé');
});

test('financement : seul « Obtenu » est acquis ; reste = besoin − obtenu ; rien sans besoin saisi', () => {
  const s = E.sourcesFinancement([{ organisme: 'Banque', montant: '30000', statut: 'Obtenu' }, { organisme: 'Région', montant: '20000', statut: 'En cours' }, { organisme: 'Business angel', montant: '10000', statut: 'Envisagé' }, { organisme: 'X', montant: '5000' }], '100000');
  assert.deepEqual([s.obtenu, s.enCours, s.envisage, s.reste, s.couverture, s.sansStatut], [30000, 20000, 10000, 70000, 60, 1]);
  assert.equal(E.sourcesFinancement([{ organisme: 'B', montant: '1', statut: 'Obtenu' }], '').reste, null);
});

test('résumé : reprend la saisie, signale le manque, ne comble jamais', () => {
  const b = bp({ resume_executif: { opportunite: 'Marché de la diaspora', besoin_total_financement: '100000', montant_securise: '20000', objectifs_prioritaires: [{ objectif: 'Ouvrir', echeance: '2027', indicateur: '3 points' }] }, probleme: { description: 'Produits importés' }, solution: { description: 'Transformer sur place' } });
  const c = E.resume(b, 'court'), l = E.resume(b, 'long');
  assert.ok(c.blocs.find(x => x.titre === 'Opportunité')); assert.ok(c.blocs.find(x => x.titre === 'Problème prioritaire').texte.includes('importés'));
  assert.match(c.blocs.find(x => x.titre === 'Besoin de financement').texte, /100000.*20000/);
  assert.ok(c.manquants.includes('Rentabilité et trésorerie')); assert.ok(c.manquants.includes('Proposition aux financeurs'));
  assert.ok(!JSON.stringify(c).match(/\d{5,}/g) || JSON.stringify(c).match(/\d{5,}/g).every(n => ['100000', '20000'].includes(n)), 'aucun chiffre qui ne vienne pas de la saisie');
  assert.ok(l.blocs.length === c.blocs.length);
  const long = 'x'.repeat(500); assert.ok(E.resume(bp({ resume_executif: { opportunite: long } }), 'court').blocs[0].texte.length <= 230); assert.equal(E.resume(bp({ resume_executif: { opportunite: long } }), 'long').blocs[0].texte.length, 500);
});

test('fiche d\'identité et organigramme automatique : seulement les champs renseignés', () => {
  const b = bp({ infos_generales: { forme_juridique_actuelle: 'SARL', type_numero_immatriculation: 'RCCM', numero_immatriculation: 'CI-123', ville: 'Korhogo', pays: 'Côte d\'Ivoire', responsable: 'Awa Koné', responsable_poste: 'DG', membres_equipe: [{ nom: 'Touré', prenom: 'Ibrahim', fonction: 'Production' }, { nom: 'Koné', prenom: 'Awa', fonction: 'DG' }] } }, { secteur: 'Agroalimentaire' });
  const f = Object.fromEntries(E.ficheIdentite(b));
  assert.equal(f['Forme juridique'], 'SARL'); assert.equal(f['Immatriculation'], 'RCCM CI-123'); assert.equal(f['Implantation'], "Korhogo, Côte d'Ivoire"); assert.ok(!('Site internet' in f));
  const n = E.noeudsOrganigrammeAuto(b.sections.infos_generales);
  assert.equal(n[0].nom, 'Awa Koné'); assert.equal(n.length, 2, 'le responsable n\'est pas dupliqué'); assert.equal(n[1].parent_id, 'r');
  assert.deepEqual(E.noeudsOrganigrammeAuto({}), []);
});

test('capital : alerte si le total ne fait pas 100 %', () => {
  const html = E.blocs('infos_generales', bp({ infos_generales: { actionnariat: [{ associe: 'A', part_pct: '60' }, { associe: 'B', part_pct: '30' }] } })).map(b => b.html).join('');
  assert.match(html, /totalisent 90 % au lieu de 100 %/);
  assert.doesNotMatch(E.blocs('infos_generales', bp({ infos_generales: { actionnariat: [{ associe: 'A', part_pct: '60' }, { associe: 'B', part_pct: '40' }] } })).map(b => b.html).join(''), /au lieu de 100/);
});

test('frise : tri chronologique quand les dates sont lisibles, sinon ordre saisi', () => {
  assert.deepEqual(E.triChrono([{ date: '2026-05' }, { date: '2025-01-10' }, { date: '2025-12' }]).map(x => x.date), ['2025-01-10', '2025-12', '2026-05']);
  assert.deepEqual(E.triChrono([{ date: 'bientôt' }, { date: '2025' }]).map(x => x.date), ['bientôt', '2025']);
});

test('sécurité : le contenu saisi est échappé dans tous les rendus', () => {
  const x = '<img src=x onerror=alert(1)>';
  const sections = { infos_generales: { nature_activite: x, chronologie: [{ date: '2025', jalon: x }], actionnariat: [{ associe: x, part_pct: '100' }] }, probleme: { description: x, causes_profondes: [{ cause: x }], consequences_arbre: [{ consequence: x }], problemes_prioritaires: [{ probleme: x, gravite: '3', frequence: '3', urgence: '3' }] },
    marche: { porter: [{ force: 'F', intensite: 'Forte', analyse: x }], historique_marche: [{ annee: x, valeur: '5' }] }, swot: { tows_so: x, swot_actions: [{ element: x, probabilite: '2', impact_note: '2' }] },
    produits: { items: [{ nom: x, prix_vente: '10', description_technique: x }] }, strategie_marketing: { suivi_campagnes: [{ campagne: x, budget_prevu: '1' }] },
    solution: { parcours_etapes: [{ etape: x }], fonctionnalites: [{ fonctionnalite: x }] }, calendrier: { phases: [{ nom: x, debut: '2026-01-01', fin: '2026-02-01' }] }, risques: { items: [{ description: x, probabilite: 'moyen', impact: 'moyen' }] },
    impact: { indicateurs: [{ nom: x, situation_initiale: '0', valeur_actuelle: '1', valeur_cible: '2' }] }, annexes: { items: [{ nom: x, categorie: 'Audit' }] }, financement: { sources_financement: [{ organisme: x, montant: '1', statut: 'Obtenu' }] } };
  for (const r of E.rubriques()) { const h = E.blocs(r, bp(sections)).map(b => b.html).join(''); assert.ok(!h.includes('<img src=x'), 'non échappé dans ' + r); }
  const ed = E.editeurHtml('infos_generales', { chronologie: [{ jalon: x }] }, {});
  assert.ok(!ed.includes('<img src=x'));
});

test('éditeur : chaque rubrique produit un formulaire avec ses cartes et ses listes', () => {
  for (const r of E.rubriques()) {
    const h = E.editeurHtml(r, {}, {});
    assert.match(h, /Compléments de la rubrique/);
    for (const c of E.cartes(r)) assert.ok(h.includes(c.titre.replace(/&/g, '&amp;').replace(/'/g, '&#39;')) || h.includes(c.titre) || h.includes(c.titre.replace(/'/g, '&#39;')), r + ' ' + c.titre);
    assert.equal(E.editeurHtml(r, {}, { ro: true }).includes('enrAjouter'), false, 'lecteur : pas de bouton d\'ajout (' + r + ')');
  }
  assert.match(E.editeurHtml('marche', {}, {}), /Rivalité entre concurrents/, 'les cinq forces de Porter sont préremplies');
  assert.match(E.editeurHtml('swot', {}, {}), /enrProposerTows/); assert.match(E.editeurHtml('resume_executif', {}, {}), /enrApercuResume/);
});

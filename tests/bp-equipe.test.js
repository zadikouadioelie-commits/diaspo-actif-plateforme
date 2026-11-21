'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../assets/bp-enrichi.js');

const base = () => ({
  membres_equipe: [
    { nom: 'Awa Koné', fonction: 'Fondatrice & Directrice générale', annees_experience: '8', participation_capital: '50 %', formation: 'Master Commerce International' },
    { prenom: 'Ibrahim', nom: 'Touré', fonction: 'Associé — Responsable production', annees_experience: '5', categorie: 'Dirigeant ou associé' },
    { nom: 'Moussa Ouattara', fonction: 'Opérateur de production', annees_experience: '3' },
    { nom: 'Dr Yao', fonction: 'Médecin du travail', categorie: 'Conseil ou expert' },
  ],
  parcours_professionnel: [
    { personne: 'Koné Awa', poste: 'Acheteuse', organisation: 'Centrale d\'achat', periode: '2018 – 2026', realisations: '+40 % de fournisseurs' },
    { personne: 'ibrahim toure', poste: 'Ingénieur procédés', organisation: 'Usine de transformation', periode: '2021 – 2026' },
    { personne: 'Awa Koné', poste: 'Stagiaire achats', organisation: 'Grossiste', periode: '2017' },
  ],
  diplomes_qualifications: [
    { personne: 'Awa Koné', intitule: 'Master Commerce International', niveau: 'Bac+5 (master, ingénieur)', justificatif: 'Fourni' },
    { personne: 'Moussa Ouattara', intitule: 'CAP agroalimentaire', niveau: 'Bac ou équivalent', justificatif: 'À fournir' },
    { personne: 'Ibrahim Touré', intitule: 'Diplôme d\'ingénieur', niveau: 'Bac+5 (master, ingénieur)', justificatif: 'Fourni' },
  ],
});

test('deux listes ajoutées à « informations générales » sans déplacer « actionnariat » (index 0)', () => {
  const ks = E.listes('infos_generales').map(l => l.k);
  assert.equal(ks[0], 'actionnariat');
  assert.ok(ks.includes('parcours_professionnel') && ks.includes('diplomes_qualifications'));
  E.listes('infos_generales').filter(l => l.groupe === 'equipe').forEach(l => assert.ok(l.cols.some(c => c.k === 'personne'), l.k));
});

test('regroupement par personne : mêmes mots, ordre et accents indifférents', () => {
  const r = E.equipeDetaillee(base()), p = nom => r.personnes.find(x => x.nom === nom);
  assert.equal(p('Awa Koné').parcours.length, 2, 'Koné Awa + Awa Koné');
  assert.equal(p('Awa Koné').diplomes.length, 1);
  assert.equal(p('Ibrahim Touré').parcours.length, 1, '« ibrahim toure » sans accent');
  assert.equal(p('Moussa Ouattara').diplomes[0].intitule, 'CAP agroalimentaire');
  assert.ok(r.personnes.every(x => !x.horsFiche), 'personne sans fiche : aucune ici');
});

test('catégorie : celle de la fiche, sinon déduite (capital ou fonction de direction), signalée « inferee »', () => {
  const r = E.equipeDetaillee(base()), cat = n => r.personnes.find(x => x.nom === n);
  assert.equal(cat('Awa Koné').categorie, 'Dirigeant ou associé'); assert.equal(cat('Awa Koné').inferee, true);
  assert.equal(cat('Ibrahim Touré').categorie, 'Dirigeant ou associé'); assert.equal(cat('Ibrahim Touré').inferee, false);
  assert.equal(cat('Moussa Ouattara').categorie, 'Équipe'); assert.equal(cat('Moussa Ouattara').inferee, true);
  assert.equal(cat('Dr Yao').categorie, 'Conseil ou expert');
  assert.equal(r.groupes.dirigeants.length, 2); assert.equal(r.groupes.equipe.length, 1); assert.equal(r.groupes.conseil.length, 1);
});

test('indicateurs : années cumulées, diplômes, niveaux Bac+5, justificatifs', () => {
  const k = E.equipeDetaillee(base()).kpi;
  assert.equal(k.dirigeants, 2); assert.equal(k.equipe, 1); assert.equal(k.conseil, 1);
  assert.equal(k.anneesDirigeants, 13, '8 + 5');
  assert.equal(k.anneesEquipe, 3);
  assert.equal(k.diplomes, 3); assert.equal(k.diplomesBac5, 2);
  assert.equal(k.justificatifsFournis, 2); assert.equal(k.justificatifsAFournir, 1);
  assert.equal(k.experiences, 3);
  assert.equal(k.sansDiplome, 1, 'seul « Dr Yao » n\'a ni diplôme saisi ni formation');
});

test('une ligne dont la personne n\'a pas de fiche crée une personne à part ; sans nom elle est comptée', () => {
  const g = base(); g.parcours_professionnel.push({ personne: 'Paul Inconnu', poste: 'Consultant' }, { poste: 'Poste sans nom' }); g.diplomes_qualifications.push({ intitule: 'Diplôme sans nom' });
  const r = E.equipeDetaillee(g), x = r.personnes.find(p => p.nom === 'Paul Inconnu');
  assert.ok(x && x.horsFiche && x.parcours.length === 1);
  assert.equal(r.kpi.sansPersonne, 2);
});

test('aucun chiffre inventé : plan vide, valeurs hostiles', () => {
  assert.equal(E.equipeDetaillee({}).vide, true);
  assert.equal(E.equipeDetaillee(null).vide, true);
  const r = E.equipeDetaillee({ membres_equipe: [null, { nom: '<b>X</b>', annees_experience: 'abc', participation_capital: '??' }, 'texte'], parcours_professionnel: 'pas une liste', diplomes_qualifications: [null, 3] });
  assert.equal(r.personnes.length, 1); assert.equal(r.personnes[0].annees, null); assert.equal(r.kpi.anneesDirigeants, 0);
});

test('lecture : les deux listes sont masquées de la fiche A4 quand la page « Équipe » les présente', () => {
  const bp = { sections: { infos_generales: base() } };
  const avec = E.blocs('infos_generales', bp, { esc: s => String(s) }).map(b => b.titre).join('|');
  const sans = E.blocs('infos_generales', bp, { esc: s => String(s), sansEquipe: true }).map(b => b.titre).join('|');
  assert.ok(/Parcours professionnel/.test(avec) && /Diplômes/.test(avec));
  assert.ok(!/Parcours professionnel/.test(sans) && !/Diplômes/.test(sans));
});

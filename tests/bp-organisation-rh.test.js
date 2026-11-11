const test = require('node:test');
const assert = require('node:assert');
const { BPOrga, BPRh } = require('../assets/bp-organisation.js');

test('une pratique sans statut est « prévue », jamais « en place »', () => {
  assert.strictEqual(BPOrga.statutPratique(undefined), 'prevu');
  assert.strictEqual(BPOrga.statutPratique('nimporte'), 'prevu');
  assert.strictEqual(BPOrga.statutPratique('en_place'), 'en_place');
  assert.strictEqual(BPOrga.statutPratiqueLabel('recommande'), 'Recommandé');
});

test('organigramme : arbre par rattachement, sommets et niveaux', () => {
  const ns = BPOrga.noeuds({ organigramme: [
    { id: 'a', nom: 'Awa Koné', fonction: 'Direction générale' },
    { id: 'b', nom: 'Comité de direction', parent_id: 'a' },
    { id: 'c', nom: 'Ibrahim Touré', fonction: 'Production', parent_id: 'b' },
    { id: 'd', nom: 'Fatou Diabaté', fonction: 'Qualité & Export', parent_id: 'b' },
    { id: 'e', nom: '', fonction: '' },
  ] });
  assert.strictEqual(ns.length, 4);
  const a = BPOrga.arbre(ns);
  assert.strictEqual(a.length, 1);
  assert.deepStrictEqual(BPOrga.niveaux(a).map(l => l.length), [1, 1, 2]);
  assert.deepStrictEqual(BPOrga.controleOrganigramme(ns), []);
});

test('organigramme : parent inconnu, auto-référence et boucle deviennent des sommets sans planter', () => {
  const ns = BPOrga.noeuds({ organigramme: [
    { id: 'a', nom: 'A', parent_id: 'b' },
    { id: 'b', nom: 'B', parent_id: 'a' },
    { id: 'c', nom: 'C', parent_id: 'c' },
    { id: 'd', nom: 'D', parent_id: 'zzz' },
  ] });
  const a = BPOrga.arbre(ns);
  assert.ok(a.length >= 3);
  assert.ok(BPOrga.controleOrganigramme(ns).length >= 1);
});

test('organigramme : le HTML échappe les noms', () => {
  const html = BPOrga.organigrammeHtml(BPOrga.noeuds({ organigramme: [{ id: 'a', nom: '<b>X</b>', fonction: 'DG' }] }));
  assert.ok(!html.includes('<b>X</b>'));
  assert.ok(html.includes('&lt;b&gt;X&lt;/b&gt;'));
});

test('RACI : un seul approbateur, R et A obligatoires', () => {
  const l = BPOrga.raci({ raci: [
    { activite: 'Budget', r: 'Direction', a: 'Awa Koné', c: 'Associés', i: 'Équipe' },
    { activite: 'Recrutement', r: 'RH', a: 'Awa et Ibrahim' },
    { activite: 'Fournisseurs', r: 'Achats' },
    { activite: '' },
  ] });
  assert.strictEqual(l.length, 3);
  const c = BPOrga.controleRaci(l);
  assert.deepStrictEqual(c.map(x => x.etat), ['ok', 'plusieurs', 'incomplet']);
});

test('bilan des pratiques : compte en place / prévu / recommandé', () => {
  const o = {
    raci: [{ activite: 'Budget', r: 'DG', a: 'DG', statut: 'en_place' }],
    gouvernance_financiere: [{ sujet: 'Dépenses', regle: 'Au-delà de 500 €, accord de la direction', statut: 'prevu' }, { sujet: 'Banque', regle: 'Double signature', statut: 'recommande' }, { sujet: 'vide', regle: '' }],
    pilotage_indicateurs: [{ domaine: 'Qualité', indicateur: 'Taux de non-conformité' }],
  };
  assert.deepStrictEqual(BPOrga.bilanPratiques(o), { en_place: 1, prevu: 2, recommande: 1, total: 4 });
});

test('RH : 6 actuels + 4 recrutements = 10 identifiés, 2 postes à définir pour 12', () => {
  const rh = { effectif_actuel: '6', effectif_prevu: '12', postes: [
    { intitule: 'Opérateur de production', nb_personnes: '2', cout_total_employeur: '9000' },
    { intitule: 'Commercial B2B', nb_personnes: '1', cout_total_employeur: '14000' },
    { intitule: 'Chargé de logistique et export', cout_total_employeur: '12000' },
    { intitule: '' },
  ] };
  const e = BPRh.effectifs(rh);
  assert.strictEqual(e.recrutements, 4);
  assert.strictEqual(e.identifies, 10);
  assert.strictEqual(e.aDefinir, 2);
  assert.deepStrictEqual(BPRh.courbe(rh).map(b => b.valeur), [6, 10, 12]);
  assert.strictEqual(BPRh.noteCourbe(rh), 'Objectif à 12 mois : 12 collaborateurs, dont 2 postes encore à définir.');
  assert.strictEqual(BPRh.masseRecrutements(rh), 2 * 9000 + 14000 + 12000);
  assert.match(BPRh.controle(rh)[0], /2 postes restent à définir/);
});

test('RH : incohérences détectées (postes au-delà de l\'objectif, objectif sous l\'effectif actuel)', () => {
  const trop = { effectif_actuel: 6, effectif_prevu: 8, postes: [{ intitule: 'A', nb_personnes: 3 }] };
  assert.match(BPRh.controle(trop)[0], /au-delà de l'effectif prévu/);
  const recule = { effectif_actuel: 6, effectif_prevu: 4 };
  assert.match(BPRh.controle(recule)[0], /inférieur à l'effectif actuel/);
});

test('RH : indicateurs calculés, jamais inventés', () => {
  assert.deepStrictEqual(BPRh.indicateurs({}, {}), []);
  const rh = { effectif_actuel: 6, effectif_prevu: 12, postes: [{ intitule: 'Opérateur', nb_personnes: 2, cout_total_employeur: 10000 }] };
  const ind = BPRh.indicateurs(rh, { ca_annee1: 200000 });
  const par = k => ind.find(i => i.cle === k);
  assert.strictEqual(par('effectif_actuel').statut, 'constate');
  assert.strictEqual(par('effectif_objectif').statut, 'objectif');
  assert.strictEqual(par('a_definir').valeur, '4');
  assert.strictEqual(par('masse').valeur.replace(/\s/g, ' '), '20 000');            /* 2 × 10 000, tel que saisi : aucune unité inventée */
  assert.strictEqual(par('cout_moyen').valeur.replace(/\s/g, ' '), '10 000');
  assert.strictEqual(BPRh.indicateurs(rh, { ca_annee1: 200000 }).find(i => i.cle === 'poids_ca'), undefined);   /* ratio au CA retiré : période des coûts inconnue */
});

test('RH : histogramme SVG sur une seule échelle', () => {
  const svg = BPRh.barresSvg([{ libelle: 'Actuel', valeur: 6 }, { libelle: 'Objectif à 12 mois', valeur: 12 }]);
  assert.ok(svg.startsWith('<svg'));
  assert.strictEqual((svg.match(/<rect /g) || []).length, 2);
  assert.ok(svg.includes('>12<') && svg.includes('>6<'));
  assert.strictEqual(BPRh.barresSvg([]), '');
});

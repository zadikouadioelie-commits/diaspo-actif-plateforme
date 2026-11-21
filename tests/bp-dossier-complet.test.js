'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../assets/bp-dossier-complet.js');
const E = require('../assets/bp-enrichi.js');

test('le registre compte 62 documents numérotés de 1 à 62, répartis en 6 groupes (10 + 11 + 19 + 8 + 8 + 6)', () => {
  assert.equal(D.DOCS.length, 62);
  assert.deepEqual(D.DOCS.map(d => d.n), Array.from({ length: 62 }, (_, i) => i + 1));
  const par = g => D.DOCS.filter(d => d.groupe === g).length;
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(par), [10, 11, 19, 8, 8, 6]);
  D.DOCS.forEach(d => { assert.ok(d.titre && d.contenu && d.rub && d.libelle && d.page && d.req.length, 'doc ' + d.n); });
});

test('chaque rubrique et chaque liste citées par le registre existent vraiment', () => {
  const rubriquesEditeur = ['infos_generales', 'resume_executif', 'presentation', 'probleme', 'solution', 'marche', 'swot', 'business_model', 'produits', 'strategie_marketing', 'plan_commercial', 'plan_operationnel', 'organisation', 'rh', 'calendrier', 'plan_financier', 'risques', 'impact', 'financement', 'annexes', 'completude', 'strategie_developpement', 'juridique', 'pilotage'];
  D.DOCS.forEach(d => {
    assert.ok(rubriquesEditeur.includes(d.rub), 'rubrique de saisie inconnue : doc ' + d.n);
    d.req.forEach(c => {
      if (c.r) assert.ok(rubriquesEditeur.includes(c.r), 'doc ' + d.n + ' : ' + c.r);
      if (c.l && E.SPEC[c.r]) {
        // listes de la spécification enrichie : doivent exister ; les listes « historiques » de l'éditeur (immobilisations_liste, dettes) ne sont pas dans la spécification
        const connue = E.listes(c.r).some(l => l.k === c.l);
        const historiques = ['immobilisations_liste', 'dettes', 'charges_detaillees'];
        assert.ok(connue || historiques.includes(c.l), 'doc ' + d.n + ' : liste inconnue ' + c.r + '.' + c.l);
      }
    });
  });
});

test('un plan vide : 0 rempli, 62 à faire, jamais de pourcentage inventé', () => {
  const e = D.etat({ sections: {} });
  assert.equal(e.compte.rempli, 0); assert.equal(e.compte.vide, 62); assert.equal(e.pct, 0);
  assert.equal(D.etat(null).compte.vide, 62);
});

test('états rempli / partiel : critères tous satisfaits ou partiellement', () => {
  const bp = { sections: { swot: { forces: [{ titre: 'Équipe' }] }, resume_executif: { projet: 'x' }, strategie_developpement: { agences: [{ agence: 'Abidjan' }] } } };
  const e = D.etat(bp), doc = n => e.docs.find(d => d.n === n);
  assert.equal(doc(7).etat, 'rempli');
  assert.equal(doc(2).etat, 'rempli');
  assert.equal(doc(9).etat, 'partiel', 'agences saisies mais pas les étapes');
  assert.equal(doc(17).etat, 'partiel', 'organisation vide, agences saisies');
  assert.equal(doc(5).etat, 'vide');
});

test('documents juridiques : seuls les statuts d\'avancement réels comptent, texte à faire valider', () => {
  const bp = { sections: { juridique: { documents_juridiques: [{ type_document: 'Projet de statuts', document: 'Statuts', statut_document: 'Projet rédigé' }, { type_document: 'Pacte d\'associés', statut_document: 'Non commencé' }] } } };
  const e = D.etat(bp), doc = n => e.docs.find(d => d.n === n);
  assert.equal(doc(41).etat, 'rempli');
  assert.match(doc(41).note, /professionnel du droit/);
  assert.equal(doc(42).etat, 'vide', '« non commencé » ne compte pas');
});

test('pièces réelles (immatriculation, assurance, devis, apports, lettres) : signalées à joindre', () => {
  const e = D.etat({ sections: {} });
  [44, 47, 51, 52, 54].forEach(n => assert.match(e.docs.find(d => d.n === n).note, /Pièce réelle à joindre/));
  const e2 = D.etat({ sections: { financement: { devis_fournisseurs: [{ fournisseur: 'A', montant: '100' }] } } });
  const d51 = e2.docs.find(d => d.n === 51);
  assert.equal(d51.etat, 'rempli'); assert.match(d51.note, /Joindre la pièce réelle/);
});

test('business plan complet : 80 % des 19 rubriques de base', () => {
  const faire = k => { const s = {}; D.OBLIGATOIRES.slice(0, k).forEach(r => { s[r] = { x: 'texte' }; }); return D.etat({ sections: s }).docs.find(d => d.n === 3).etat; };
  assert.equal(faire(16), 'rempli');
  assert.equal(faire(15), 'partiel');
  assert.equal(faire(10), 'partiel');
  assert.equal(faire(5), 'vide');
});

test('affichage : groupes, compteurs, échappement du texte', () => {
  const e = D.etat({ sections: {} });
  const h = D.tableauHtml(e, { lien: d => '<a>' + d.libelle + '</a>' });
  assert.equal((h.match(/<table/g) || []).length, 6);
  assert.ok(h.includes('0 / 10') && h.includes('0 / 6'));
  assert.ok(h.includes('À faire'));
  assert.equal(D.rempli(false), false); assert.equal(D.rempli({ a: [{ b: '' }] }), false); assert.equal(D.rempli({ a: [{ b: 'x' }] }), true);
});

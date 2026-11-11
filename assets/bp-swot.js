/* ═════════════════════════════════════════════════════════════════
   bp-swot.js — Diaspo'Actif (2026-11-10)
   Logique PURE de la rubrique « Analyse SWOT » du Business Plan, partagée par l'éditeur
   (business-plan-edit.html), la vue (business-plan-view.html) et le dossier investisseur
   (business-plan-dossier.html : PDF + PowerPoint). Chargé en <script> classique (window.BPSwot)
   ET en require() côté Node (tests/bp-swot.test.js).

   Modèle de données (sections.swot) :
   - forces / faiblesses / opportunites / menaces : TEXTES (une ligne = un élément). Ils restent la
     source lue par tout le reste de la plateforme (audit de complétude, assistant, téléphone,
     Koffi) : l'éditeur les recalcule à chaque modification des éléments structurés.
   - elements : [{ id, cat, titre, impact (0-4), justification, consequence, action }] — plusieurs
     éléments par catégorie, avec leur niveau d'impact, leur justificatif, leur conséquence et
     l'action corrective prévue.
   - synthese + synthese_validee : « Lecture stratégique du SWOT ». Une proposition automatique
     n'est reprise dans le dossier qu'une fois validée par l'utilisateur.

   Rétro-compatibilité : un plan ancien (textes seuls) est lu comme des éléments non évalués,
   ligne à ligne ; si un texte est modifié en dehors de l'éditeur (assistant, import), les
   éléments de cette catégorie sont reconstruits depuis le texte sans perdre les détails des
   lignes inchangées.
   ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPSwot = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CATS = [
    { key: 'forces',        label: 'Forces',        singulier: 'une force',        origine: 'interne', positif: true,  color: '#1A7A52', bg: 'rgba(26,122,82,.07)' },
    { key: 'faiblesses',    label: 'Faiblesses',    singulier: 'une faiblesse',    origine: 'interne', positif: false, color: '#B5451F', bg: 'rgba(181,69,31,.07)' },
    { key: 'opportunites',  label: 'Opportunités',  singulier: 'une opportunité',  origine: 'externe', positif: true,  color: '#1E4F8A', bg: 'rgba(30,79,138,.07)' },
    { key: 'menaces',       label: 'Menaces',       singulier: 'une menace',       origine: 'externe', positif: false, color: '#4B5160', bg: 'rgba(75,81,96,.09)' },
  ];
  const CAT_KEYS = CATS.map(c => c.key);
  const cat = k => CATS.find(c => c.key === k);

  /* Niveaux d'impact : 0 = non évalué. « Critique » n'a de sens que pour ce qui nuit ; pour une
     force ou une opportunité, le plus haut niveau s'appelle « Décisif ». */
  function niveauLabel(catKey, n) {
    n = Number(n) || 0;
    if (n <= 0) return 'Non évalué';
    if (n === 1) return 'Faible';
    if (n === 2) return 'Modéré';
    if (n === 3) return 'Élevé';
    return (cat(catKey) && cat(catKey).positif) ? 'Décisif' : 'Critique';
  }
  function impactNum(v) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : 0; }

  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const sansPuce = s => String(s).replace(/^\s*(?:[-•*–·]|\d+[.)])\s*/, '');
  /* Lignes d'un texte libre : une ligne = un élément, puces éventuelles retirées. */
  function lignes(texte) {
    return String(texte == null ? '' : texte).split(/\r?\n/).map(l => clean(sansPuce(l))).filter(Boolean);
  }

  let _seq = 0;
  function nouvelId() { _seq++; return 'e' + Date.now().toString(36) + _seq.toString(36) + Math.random().toString(36).slice(2, 5); }
  function vide(catKey) { return { id: nouvelId(), cat: catKey, titre: '', impact: 0, justification: '', consequence: '', action: '' }; }

  function normaliser(e) {
    return {
      id: e.id || nouvelId(), cat: e.cat, titre: String(e.titre == null ? '' : e.titre),
      impact: impactNum(e.impact), justification: String(e.justification || ''), consequence: String(e.consequence || ''), action: String(e.action || ''),
    };
  }

  /* Éléments structurés d'une section SWOT (voir « Rétro-compatibilité » en tête de fichier).
     Ne modifie jamais `sw`. */
  function elements(sw) {
    sw = sw || {};
    const stock = Array.isArray(sw.elements) ? sw.elements.filter(e => e && CAT_KEYS.includes(e.cat)).map(normaliser) : [];
    const out = [];
    CATS.forEach(c => {
      const miens = stock.filter(e => e.cat === c.key);
      const texte = sw[c.key];
      const attendu = miens.map(e => clean(e.titre)).filter(Boolean).join('\n');
      if (stock.length && (texte === undefined || lignes(texte).join('\n') === attendu)) { out.push(...miens); return; }
      const restants = miens.slice();
      lignes(texte).forEach((l, i) => {
        const k = restants.findIndex(e => clean(e.titre) === l);
        if (k >= 0) { out.push(restants.splice(k, 1)[0]); return; }
        out.push({ id: 'l-' + c.key + '-' + i, cat: c.key, titre: l, impact: 0, justification: '', consequence: '', action: '' });
      });
    });
    return out;
  }

  /* Textes « une ligne = un élément » recalculés depuis les éléments (pour le reste de la plateforme). */
  function textes(els) {
    const r = {};
    CATS.forEach(c => { r[c.key] = (els || []).filter(e => e.cat === c.key).map(e => clean(e.titre)).filter(Boolean).join('\n'); });
    return r;
  }

  /* Priorité d'une action, DÉDUITE du niveau d'impact de l'élément (jamais saisie à part) :
     une action n'est jamais plus urgente que ce qu'elle traite. */
  function priorite(e) {
    const n = impactNum(e && e.impact);
    return n >= 4 ? { niveau: 'Critique', rang: 4 } : n === 3 ? { niveau: 'Haute', rang: 3 } : n === 2 ? { niveau: 'Moyenne', rang: 2 } : n === 1 ? { niveau: 'Basse', rang: 1 } : { niveau: 'Non évaluée', rang: 0 };
  }

  /* Plan d'action : un rang par élément qui a une action, du plus urgent au moins urgent ;
     à priorité égale, ce qui nuit (faiblesses, menaces) passe avant ce qu'on exploite. */
  const ORDRE_CAT = { faiblesses: 0, menaces: 1, forces: 2, opportunites: 3 };
  function planActions(els) {
    return (els || []).filter(e => clean(e.titre) && clean(e.action)).map(e => ({ cat: e.cat, titre: clean(e.titre), action: clean(e.action), consequence: clean(e.consequence), priorite: priorite(e) }))
      .map((r, i) => Object.assign(r, { _i: i }))
      .sort((a, b) => (b.priorite.rang - a.priorite.rang) || (ORDRE_CAT[a.cat] - ORDRE_CAT[b.cat]) || (a._i - b._i))
      .map(r => { delete r._i; return r; });
  }

  /* Éléments d'une catégorie, du plus fort impact au plus faible (ordre de saisie à égalité). */
  function classes(els, catKey) {
    return (els || []).map((e, i) => ({ e, i })).filter(x => x.e.cat === catKey && clean(x.e.titre))
      .sort((a, b) => (impactNum(b.e.impact) - impactNum(a.e.impact)) || (a.i - b.i)).map(x => x.e);
  }

  const minus = t => (t.length > 1 && t[0] === t[0].toUpperCase() && t[1] === t[1].toLowerCase() && /[A-ZÀ-Ý]/.test(t[0])) ? t[0].toLowerCase() + t.slice(1) : t;
  const sansPoint = t => String(t).replace(/[\s.;:]+$/, '');
  function liste(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' et ' + a[a.length - 1]; }

  /* Brouillon de « Lecture stratégique du SWOT », assemblé UNIQUEMENT avec ce que l'utilisateur a
     saisi (aucune donnée inventée, aucun service externe). À relire et valider. */
  function proposerSynthese(els) {
    const t = (k, n) => classes(els, k).slice(0, n).map(e => sansPoint(minus(clean(e.titre))));
    const forces = t('forces', 2), opps = t('opportunites', 1), fai = t('faiblesses', 2), men = t('menaces', 1);
    const phrases = [];
    if (forces.length) phrases.push("Le projet s'appuie sur " + liste(forces) + (opps.length ? ', et peut tirer parti de ' + liste(opps) : '') + '.');
    else if (opps.length) phrases.push('Le projet peut tirer parti de ' + liste(opps) + '.');
    const vig = fai.concat(men);
    if (vig.length) phrases.push('Son développement dépend toutefois de la maîtrise de ' + (vig.length > 1 ? 'plusieurs points de vigilance : ' : 'ce point de vigilance : ') + liste(vig) + '.');
    const negatifs = planActions(els).filter(r => r.cat === 'faiblesses' || r.cat === 'menaces');
    if (negatifs.length) phrases.push('La stratégie prioritaire consiste à ' + minus(sansPoint(negatifs[0].action)) + " avant d'accélérer le développement commercial.");
    else if (vig.length) phrases.push("La priorité stratégique est de traiter ces points de vigilance avant d'accélérer le développement commercial.");
    return phrases.join(' ');
  }

  /* Synthèse à reprendre dans le dossier : celle que l'utilisateur a écrite ou validée —
     un brouillon automatique non validé n'est jamais publié. */
  function syntheseAAfficher(sw) {
    sw = sw || {};
    const s = clean(sw.synthese);
    if (!s) return '';
    return sw.synthese_validee === false ? '' : String(sw.synthese).trim();
  }

  /* Résumé chiffré, pour l'éditeur (« 3 éléments sans action », etc.). */
  function bilan(els) {
    const rempli = (els || []).filter(e => clean(e.titre));
    return { total: rempli.length, sansImpact: rempli.filter(e => !impactNum(e.impact)).length, sansAction: rempli.filter(e => !clean(e.action)).length, avecAction: rempli.filter(e => clean(e.action)).length };
  }

  return { CATS, CAT_KEYS, cat, niveauLabel, impactNum, lignes, nouvelId, vide, elements, textes, priorite, planActions, classes, proposerSynthese, syntheseAAfficher, bilan };
});

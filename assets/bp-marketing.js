/* ═════════════════════════════════════════════════════════════════
   bp-marketing.js — Diaspo'Actif (2026-11-10)
   Logique PURE de la rubrique « Stratégie marketing » du Business Plan, partagée par l'éditeur,
   la vue et le dossier investisseur (PDF + PowerPoint). Chargé en <script> classique
   (window.BPMarketing) ET en require() côté Node (tests/bp-marketing.test.js).

   Principe directeur : ne JAMAIS inventer de performance. Toute donnée chiffrée porte un statut
   « Objectif », « Hypothèse » ou « Constaté » ; sans choix de l'utilisateur, c'est « Hypothèse ».

   Données (sections.strategie_marketing) — les champs historiques (identite_marque, communication,
   strategie_digitale, publicite, partenariats, evenements, fidelisation, budget_marketing_mensuel,
   budget_marketing_annuel, campagnes[]) sont conservés tels quels. Ajouts :
   - parcours      : [{ etape, description }] parcours d'acquisition (Attirer, Convertir, Fidéliser,
                     Recommander par défaut, libellés modifiables).
   - campagnes[i]  : + statut_donnee. Le budget par canal EST la liste des campagnes (canal + budget).
   - plan_actions  : [{ periode, actions, indicateurs, budget, statut_donnee }] calendrier d'exécution.
   - nb_points_vente : nombre de points de vente (indicateur de distribution).
   - statuts_indicateurs : { cle: statut } pour le tableau de performance.
   - synthese {canaux_prioritaires, resultats_attendus} + synthese_validee.
   ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPMarketing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const has = v => v !== null && v !== undefined && String(v).trim() !== '';
  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const nombre = v => { if (!has(v)) return null; const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

  const STATUTS = { objectif: 'Objectif', hypothese: 'Hypothèse', constate: 'Constaté' };
  const statutDe = v => STATUTS[v] ? v : 'hypothese';
  const statutLabel = v => STATUTS[statutDe(v)];

  const PARCOURS_DEFAUT = ['Attirer', 'Convertir', 'Fidéliser', 'Recommander'];
  const PARCOURS_EXEMPLES = ['Réseaux sociaux, événements, partenaires…', 'Dégustations, boutique en ligne, offres de découverte…', 'Abonnement, carte de fidélité, newsletter…', 'Parrainage, avis clients, bouche-à-oreille…'];

  function fmtNb(n, dec) { return (Math.round(n * Math.pow(10, dec || 0)) / Math.pow(10, dec || 0)).toLocaleString('fr-FR').replace(/ | /g, ' '); }
  function fmtMontant(n, devise) { return Number.isFinite(n) ? fmtNb(n, 2) + ' ' + (devise || '€') : ''; }

  /* Parcours d'acquisition à afficher : les étapes qui ont une description (libellé par défaut
     si l'utilisateur n'en a pas changé). */
  function parcours(s) {
    const l = Array.isArray(s && s.parcours) ? s.parcours : [];
    return l.map((p, i) => ({ etape: clean(p && p.etape) || PARCOURS_DEFAUT[i] || ('Étape ' + (i + 1)), description: clean(p && p.description) })).filter(p => p.description);
  }

  /* Budget par canal : les campagnes qui ont un canal et un budget > 0, du plus gros au plus petit. */
  function budgetsParCanal(s) {
    const l = (Array.isArray(s && s.campagnes) ? s.campagnes : []).filter(c => c && has(c.canal) && (nombre(c.budget) || 0) > 0)
      .map((c, i) => ({ canal: clean(c.canal), budget: nombre(c.budget), statut: statutDe(c.statut_donnee), _i: i }));
    const total = l.reduce((t, c) => t + c.budget, 0);
    return { total, lignes: l.sort((a, b) => (b.budget - a.budget) || (a._i - b._i)).map(c => ({ canal: c.canal, budget: c.budget, statut: c.statut, pct: total > 0 ? c.budget / total * 100 : 0 })) };
  }

  /* Enveloppe annuelle annoncée : budget annuel, sinon mensuel × 12. */
  function enveloppeAnnuelle(s) {
    const a = nombre(s && s.budget_marketing_annuel), m = nombre(s && s.budget_marketing_mensuel);
    return a ? a : (m ? m * 12 : null);
  }

  /* Cohérence : la somme des budgets par canal doit tenir dans l'enveloppe annoncée (tolérance 2 %). */
  function controleBudget(s) {
    const env = enveloppeAnnuelle(s), b = budgetsParCanal(s);
    if (!env || !b.total) return null;
    if (Math.abs(b.total - env) <= env * 0.02) return null;
    return b.total > env
      ? 'Les budgets par canal totalisent ' + fmtMontant(b.total) + ', soit plus que l\'enveloppe annoncée (' + fmtMontant(env) + ' par an).'
      : 'Les budgets par canal totalisent ' + fmtMontant(b.total) + ' sur une enveloppe annoncée de ' + fmtMontant(env) + ' par an : ' + fmtMontant(env - b.total) + ' ne sont pas encore répartis.';
  }

  /* Plan d'action marketing : lignes renseignées. */
  function planActions(s) {
    return (Array.isArray(s && s.plan_actions) ? s.plan_actions : []).filter(p => p && (has(p.actions) || has(p.periode)))
      .map(p => ({ periode: clean(p.periode), actions: clean(p.actions), indicateurs: clean(p.indicateurs), budget: nombre(p.budget), statut: statutDe(p.statut_donnee) }));
  }

  /* Tableau de performance : CALCULÉ quand les données financières et commerciales existent,
     sinon repris tel que saisi ailleurs dans le plan. `ctx` = { business_model, plan_commercial,
     presentation, ca_annee1 }. Une ligne n'existe que si sa valeur est connue. */
  function indicateursPerformance(s, ctx) {
    s = s || {}; ctx = ctx || {};
    const bm = ctx.business_model || {}, pc = ctx.plan_commercial || {}, pr = ctx.presentation || {};
    const camps = (Array.isArray(s.campagnes) ? s.campagnes : []).filter(c => c);
    const budgetCamp = camps.reduce((t, c) => t + (nombre(c.budget) || 0), 0);
    const conv = camps.reduce((t, c) => t + (nombre(c.conversions) || 0), 0);
    const pros = camps.reduce((t, c) => t + (nombre(c.prospects) || 0), 0);
    const st = s.statuts_indicateurs || {};
    const rows = [];
    const add = (cle, label, mesure, valeur, origine) => { if (valeur) rows.push({ cle, label, mesure, valeur, origine, statut: statutDe(st[cle]) }); };

    let cac = null, cacO = '';
    if (nombre(bm.cac) !== null) { cac = fmtMontant(nombre(bm.cac)); cacO = 'Saisi dans le business model'; }
    else if (budgetCamp > 0 && conv > 0) { cac = fmtMontant(budgetCamp / conv); cacO = 'Calculé : budget des campagnes ÷ conversions'; }
    add('cac', "Coût d'acquisition client (CAC)", 'Dépense marketing moyenne pour obtenir un nouveau client', cac, cacO);

    let tc = null, tcO = '';
    if (pros > 0 && conv > 0) { tc = fmtNb(conv / pros * 100, 1) + ' %'; tcO = 'Calculé : conversions ÷ prospects des campagnes'; }
    else if (nombre(pc.nb_prospects_funnel) > 0 && nombre(pc.nb_contrats_funnel) !== null) { tc = fmtNb(nombre(pc.nb_contrats_funnel) / nombre(pc.nb_prospects_funnel) * 100, 1) + ' %'; tcO = 'Calculé : contrats ÷ prospects du plan commercial'; }
    else if (nombre(bm.taux_conversion_ue) !== null) { tc = fmtNb(nombre(bm.taux_conversion_ue), 1) + ' %'; tcO = 'Saisi dans le business model'; }
    add('conversion', 'Taux de conversion', 'Pourcentage de visiteurs ou de prospects devenant acheteurs', tc, tcO);

    if (nombre(bm.prix_moyen) !== null) add('panier', 'Panier moyen', "Montant moyen d'une commande", fmtMontant(nombre(bm.prix_moyen)), 'Saisi dans le business model');

    const ret = nombre(bm.taux_retention) !== null ? nombre(bm.taux_retention) : nombre(pr.taux_fidelisation);
    if (ret !== null) add('fidelisation', 'Taux de fidélisation', 'Proportion de clients qui achètent à nouveau', fmtNb(ret, 1) + ' %', nombre(bm.taux_retention) !== null ? 'Saisi dans le business model' : 'Saisi dans la traction');

    const budgetRef = budgetCamp > 0 ? budgetCamp : enveloppeAnnuelle(s);
    const ca = nombre(ctx.ca_annee1);
    if (ca && budgetRef) add('roas', 'Retour sur dépenses publicitaires (ROAS)', "Chiffre d'affaires généré par euro dépensé en marketing", fmtNb(ca / budgetRef, 1) + ' €', "Calculé : chiffre d'affaires de l'année 1 ÷ budget marketing");

    if (nombre(s.nb_points_vente) !== null) add('points_vente', 'Nombre de points de vente', 'Progression du réseau de distribution', fmtNb(nombre(s.nb_points_vente)), 'Saisi dans la stratégie marketing');
    return rows;
  }

  /* Brouillon de synthèse stratégique, assemblé UNIQUEMENT avec la saisie. À relire et valider. */
  function proposerSynthese(s) {
    const b = budgetsParCanal(s);
    const top = b.lignes.slice(0, 3).map(l => l.canal + ' (' + fmtMontant(l.budget) + ', ' + fmtNb(l.pct) + ' % du budget)');
    const resultats = (Array.isArray(s && s.campagnes) ? s.campagnes : []).filter(c => c && has(c.canal) && has(c.objectif)).slice(0, 4)
      .map(c => clean(c.canal) + ' : ' + clean(c.objectif).replace(/[\s.;]+$/, '') + ' (' + statutLabel(c.statut_donnee).toLowerCase() + ')');
    return {
      canaux_prioritaires: top.length ? 'Les canaux prioritaires, au regard du budget qui leur est consacré, sont ' + (top.length > 1 ? top.slice(0, -1).join(', ') + ' et ' + top[top.length - 1] : top[0]) + '.' : '',
      resultats_attendus: resultats.length ? 'Résultats attendus — ' + resultats.join(' ; ') + '.' : '',
    };
  }

  /* Synthèse à reprendre dans le dossier : saisie ou validée par l'utilisateur. */
  function syntheseAAfficher(s) {
    s = s || {};
    if (s.synthese_validee === false) return null;
    const y = s.synthese || {};
    const r = { canaux_prioritaires: clean(y.canaux_prioritaires) ? String(y.canaux_prioritaires).trim() : '', resultats_attendus: clean(y.resultats_attendus) ? String(y.resultats_attendus).trim() : '' };
    return (r.canaux_prioritaires || r.resultats_attendus) ? r : null;
  }

  /* Anneau de répartition (SVG inline, sans bibliothèque). Les couleurs ne portent jamais seules
     l'information : la légende (canal, montant, %) est fournie à côté par l'appelant. */
  const PALETTE = ['#1B4B8C', '#C9A24B', '#1A7A52', '#B84C1A', '#7A5FA8', '#6B7280', '#2E74E0', '#8C6D1F'];
  function donutSvg(lignes, taille) {
    taille = taille || 180;
    const r = 40, circ = 2 * Math.PI * r;
    let cumul = 0;
    const arcs = (lignes || []).map((l, i) => {
      const part = Math.max(0, Math.min(100, l.pct)) / 100 * circ;
      const s = '<circle cx="50" cy="50" r="' + r + '" fill="none" stroke="' + PALETTE[i % PALETTE.length] + '" stroke-width="18" stroke-dasharray="' + part.toFixed(3) + ' ' + (circ - part).toFixed(3) + '" stroke-dashoffset="' + (-cumul).toFixed(3) + '" transform="rotate(-90 50 50)"/>';
      cumul += part; return s;
    }).join('');
    return '<svg width="' + taille + '" height="' + taille + '" viewBox="0 0 100 100" role="img" aria-label="Répartition du budget marketing par canal"><circle cx="50" cy="50" r="' + r + '" fill="none" stroke="#9CA3AF" stroke-opacity=".25" stroke-width="18"/>' + arcs + '</svg>';
  }

  return { PALETTE, donutSvg, STATUTS, statutDe, statutLabel, PARCOURS_DEFAUT, PARCOURS_EXEMPLES, parcours, budgetsParCanal, enveloppeAnnuelle, controleBudget, planActions, indicateursPerformance, proposerSynthese, syntheseAAfficher, fmtMontant, fmtNb, nombre };
});

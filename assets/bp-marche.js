/* ═════════════════════════════════════════════════════════════════
   bp-marche.js — Diaspo'Actif (2026-11-10)
   Logique PURE de la rubrique « Étude de marché » du Business Plan, partagée par l'éditeur, la
   vue et le dossier investisseur (PDF + PowerPoint). Chargé en <script> classique (window.BPMarche)
   ET en require() côté Node (tests/bp-marche.test.js).

   Ajouts de cette version (sections.marche) :
   - indicateurs_cles : jusqu'à 4 tuiles [{ valeur, libelle, perimetre }] affichées en tête de page.
   - objectifs_part   : [{ marche, montant, part_pct, objectif, devise }] — contrôle de COHÉRENCE :
     montant × part % doit donner l'objectif annoncé (ex. 0,5 % de 32 M€ = 160 000 €, pas 90 000 €).
   - segments_clients[i].priorite (0-100) : barres de PRIORISATION COMMERCIALE (jamais présentées
     comme des parts de marché mesurées).
   - concurrents[i] : prix_kg, origine_produits, qualite_emballage, certifications, tracabilite,
     statut_donnee ('verifie' | 'a_verifier' | 'hypothese') pour distinguer réel et hypothétique.
   - sources_donnees, marche_accessible_detail, comportement_achat, canaux_distribution_global,
     analyse_prix, validation_marche : textes d'argumentation.
   - faisabilite {attractivite, penetration, conditions} + faisabilite_validee : conclusion de
     faisabilité commerciale ; un brouillon automatique n'est repris dans le dossier qu'une fois validé.
   ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPMarche = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const has = v => v !== null && v !== undefined && String(v).trim() !== '';
  const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const nombre = v => { if (!has(v)) return null; const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? n : null; };

  /* Montant lisible : 160 000 € ; 360 000 000 FCFA. La devise est du texte libre (€, FCFA, $…). */
  function fmtMontant(n, devise) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '';
    const txt = (Math.round(n * 100) / 100).toLocaleString('fr-FR').replace(/ | /g, ' ');
    return devise ? txt + ' ' + clean(devise) : txt;
  }
  /* Pourcentage lisible : 0,5 % */
  function fmtPct(p) { return (Math.round(p * 100) / 100).toLocaleString('fr-FR') + ' %'; }

  /* Contrôle de cohérence « part visée × marché = objectif annoncé ». Tolérance de 2 % (arrondis
     de saisie). Une ligne incomplète n'est jamais jugée : ni validée ni refusée (statut 'incomplet'). */
  function controleObjectifs(lignes) {
    return (Array.isArray(lignes) ? lignes : []).filter(l => l && (has(l.marche) || has(l.montant) || has(l.part_pct) || has(l.objectif))).map(l => {
      const montant = nombre(l.montant), pct = nombre(l.part_pct), objectif = nombre(l.objectif);
      const base = { marche: clean(l.marche), devise: clean(l.devise), montant, pct, objectif };
      if (montant === null || pct === null || objectif === null) return Object.assign(base, { statut: 'incomplet', attendu: (montant !== null && pct !== null) ? montant * pct / 100 : null, message: '' });
      const attendu = montant * pct / 100;
      const ecart = objectif - attendu;
      const ok = Math.abs(ecart) <= Math.max(Math.abs(attendu) * 0.02, 0.5);
      const message = ok ? '' : fmtPct(pct) + ' de ' + fmtMontant(montant, base.devise) + ' = ' + fmtMontant(attendu, base.devise) + ", mais l'objectif annoncé est " + fmtMontant(objectif, base.devise) + '. Corrigez la part visée, le montant du marché ou l\'objectif.';
      return Object.assign(base, { statut: ok ? 'ok' : 'incoherent', attendu, ecart, message });
    });
  }

  /* Rappel pratique : SOM ≤ SAM ≤ TAM (un marché visé ne peut pas dépasser le marché accessible). */
  function controleEmboitement(m) {
    m = m || {};
    const tam = nombre(m.tam), sam = nombre(m.sam), som = nombre(m.som), r = [];
    if (tam !== null && sam !== null && sam > tam) r.push('Le marché accessible (SAM) ne peut pas dépasser le marché total (TAM).');
    if (sam !== null && som !== null && som > sam) r.push('Le marché visé (SOM) ne peut pas dépasser le marché accessible (SAM).');
    if (tam !== null && som !== null && sam === null && som > tam) r.push('Le marché visé (SOM) ne peut pas dépasser le marché total (TAM).');
    return r;
  }

  /* Tuiles d'indicateurs clés renseignées (au plus 4). */
  function indicateurs(m) {
    return (Array.isArray(m && m.indicateurs_cles) ? m.indicateurs_cles : []).filter(i => i && has(i.valeur)).slice(0, 4)
      .map(i => ({ valeur: clean(i.valeur), libelle: clean(i.libelle), perimetre: clean(i.perimetre) }));
  }

  /* Barres de priorisation commerciale des segments : seuls les segments nommés et notés (> 0). */
  function barresSegments(segments) {
    return (Array.isArray(segments) ? segments : []).filter(s => s && has(s.nom_segment) && (nombre(s.priorite) || 0) > 0)
      .map((s, i) => ({ nom: clean(s.nom_segment), pct: Math.max(0, Math.min(100, nombre(s.priorite))), detail: [s.localisation, s.canal_achat].map(clean).filter(Boolean).join(' · '), _i: i }))
      .sort((a, b) => (b.pct - a.pct) || (a._i - b._i)).map(s => { delete s._i; return s; });
  }

  const STATUTS = { verifie: 'Vérifié', a_verifier: 'À vérifier', hypothese: 'Hypothèse' };
  function statutLabel(v) { return STATUTS[v] || ''; }

  /* Brouillon de « Conclusion de faisabilité commerciale » en trois parties, assemblé avec ce que
     l'utilisateur a déjà saisi dans la rubrique (rien d'inventé). À relire et valider. */
  function proposerFaisabilite(m) {
    m = m || {};
    const frag = (...v) => v.filter(x => x && has(x)).map(x => clean(x).replace(/[\s.;]+$/, '')).filter(Boolean);
    const phrases = a => a.length ? a.join('. ') + '.' : '';
    const concNoms = (Array.isArray(m.concurrents) ? m.concurrents : []).filter(c => c && has(c.nom) && c.statut_donnee !== 'hypothese').map(c => clean(c.nom));
    const tam = nombre(m.tam), sam = nombre(m.sam), som = nombre(m.som);
    const attr = frag(
      has(m.taille_marche) && 'Taille du marché : ' + m.taille_marche,
      has(m.evolution) && 'Croissance : ' + m.evolution,
      has(m.besoins_clients) && 'Demande : ' + m.besoins_clients,
      (tam !== null && sam !== null) && 'Marché accessible : ' + fmtMontant(sam) + ' sur ' + fmtMontant(tam) + ' de marché total',
    );
    const pen = frag(
      has(m.analyse_prix) && m.analyse_prix,
      has(m.positionnement) && 'Positionnement : ' + m.positionnement,
      has(m.canaux_distribution_global) && 'Distribution : ' + m.canaux_distribution_global,
      concNoms.length && 'Concurrents identifiés : ' + concNoms.join(', '),
      (som !== null) && 'Marché visé : ' + fmtMontant(som),
    );
    const cond = frag(
      has(m.reglementation) && 'Réglementation : ' + m.reglementation,
      has(m.barrieres_entree) && "Barrières à l'entrée : " + m.barrieres_entree,
      has(m.validation_marche) && 'Validation commerciale : ' + m.validation_marche,
    );
    return { attractivite: phrases(attr), penetration: phrases(pen), conditions: phrases(cond) };
  }

  /* Conclusion à reprendre dans le dossier : saisie ou validée par l'utilisateur. Jamais un
     brouillon automatique non validé. */
  function faisabiliteAAfficher(m) {
    m = m || {};
    const f = m.faisabilite || {};
    if (m.faisabilite_validee === false) return null;
    const r = { attractivite: clean(f.attractivite) ? String(f.attractivite).trim() : '', penetration: clean(f.penetration) ? String(f.penetration).trim() : '', conditions: clean(f.conditions) ? String(f.conditions).trim() : '' };
    return (r.attractivite || r.penetration || r.conditions) ? r : null;
  }

  return { nombre, fmtMontant, fmtPct, controleObjectifs, controleEmboitement, indicateurs, barresSegments, statutLabel, STATUTS, proposerFaisabilite, faisabiliteAAfficher };
});

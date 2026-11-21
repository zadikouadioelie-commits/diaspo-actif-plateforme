/* ═══════════════════════════════════════════════════════════════════
   bp-dossier-complet.js — Diaspo'Actif (2026-11-12)
   Registre des 62 documents d'un dossier d'investissement complet, en 6 groupes :
   1. Documents stratégiques et présentation · 2. Documents commerciaux et opérationnels ·
   3. Documents financiers (Excel automatisé) · 4. Documents juridiques et administratifs ·
   5. Documents justificatifs pour les financeurs · 6. Documents de pilotage interne.

   Pour chaque document : où il se remplit (rubrique), où il apparaît dans le dossier, et son ÉTAT
   (rempli / partiel / à faire), calculé uniquement sur ce que l'auteur a réellement saisi.
   Les pièces réelles (immatriculation, assurance, devis, apports, lettres d'intention) restent à joindre :
   le registre le signale, il ne les invente pas. Les textes juridiques sont à valider par un
   professionnel du droit du pays concerné.
   Module UMD : window.BPDossierComplet côté navigateur, require() côté tests.
   ═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPDossierComplet = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GROUPES = [
    { id: 1, titre: 'Documents stratégiques et présentation de l\'entreprise' },
    { id: 2, titre: 'Documents commerciaux et opérationnels' },
    { id: 3, titre: 'Documents financiers — prévisionnel sur 5 ans' },
    { id: 4, titre: 'Documents juridiques et administratifs' },
    { id: 5, titre: 'Documents justificatifs pour les financeurs' },
    { id: 6, titre: 'Documents de pilotage interne' },
  ];

  const a_ = v => v !== undefined && v !== null && String(v).trim() !== '';
  /* Valeur « remplie » : texte non vide, nombre, ou tableau/objet contenant quelque chose de rempli. */
  function rempli(v) {
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.some(rempli);
    if (typeof v === 'object') return Object.keys(v).some(k => rempli(v[k]));
    if (typeof v === 'boolean') return false;
    return a_(v);
  }
  const rub = (bp, r) => ((bp && bp.sections) || {})[r] || {};

  /* Un « critère » : { r: rubrique } = rubrique non vide ; { r, k } = champ rempli ; { r, any:[k…] } = l'un des champs ;
     { r, l } = liste avec au moins une ligne remplie. Renvoie vrai/faux. */
  function critere(bp, c) {
    const d = rub(bp, c.r);
    if (c.l) return Array.isArray(d[c.l]) && d[c.l].some(rempli);
    if (c.k) return rempli(d[c.k]);
    if (c.any) return c.any.some(k => rempli(d[k]));
    return rempli(d);
  }

  const R = (r, extra) => Object.assign({ r }, extra || {});
  const L = (r, l) => ({ r, l });
  const ANY = (r, any) => ({ r, any });
  const TYPE_JUR = (type) => ({ juridique: type });   // document juridique du registre, par type

  /* ou : rubrique de saisie (cle), libellé, page du dossier imprimable (id). req : critères ; tous remplis = « rempli ». */
  const DOCS = [
    // 1 — Stratégie et présentation
    [1, 1, 'Présentation générale', 'Identité, activité, mission, vision, valeurs', 'presentation', 'Présentation détaillée', 'presentation', [R('presentation'), R('infos_generales')]],
    [2, 1, 'Résumé exécutif', 'Synthèse du projet pour les investisseurs (2 à 3 pages)', 'resume_executif', 'Résumé exécutif', 'resume', [R('resume_executif')]],
    [3, 1, 'Business plan complet', 'Document central réunissant toutes les analyses', 'completude', 'Vérification complétude', 'tout', [{ complet: true }]],
    [4, 1, 'Présentation des fondateurs', 'Profils, compétences, expériences et complémentarité', 'infos_generales', 'Équipe et fondateurs', 'equipe', [ANY('infos_generales', ['equipe_fondatrice', 'membres_equipe', 'actionnariat']), L('infos_generales', 'parcours_professionnel')]],
    [5, 1, 'Étude de marché', 'Marché visé : clients cibles, besoins, taille, évolution et sources des données', 'marche', 'Étude de marché', 'marche', [R('marche'), ANY('marche', ['sources_verifiables_estimations', 'historique_marche'])]],
    [6, 1, 'Analyse de la concurrence', 'Entreprises concurrentes, prix, avantages et faiblesses', 'marche', 'Étude de marché', 'marche', [ANY('marche', ['concurrents', 'solutions_substitution', 'comparaison_prix_equivalents', 'concurrence'])]],
    [7, 1, 'Analyse SWOT', 'Forces, faiblesses, opportunités, menaces', 'swot', 'Analyse SWOT', 'swot', [R('swot')]],
    [8, 1, 'Business Model Canvas', 'Modèle économique résumé sur une page', 'business_model', 'Business Model Canvas', 'bmc', [R('business_model')]],
    [9, 1, 'Stratégie de développement à 5 ans', 'Étapes de croissance, ouverture de nouveaux sites, diversification', 'strategie_developpement', 'Stratégie de développement', 'strategie_developpement', [L('strategie_developpement', 'etapes_developpement'), L('strategie_developpement', 'agences')]],
    [10, 1, 'Pitch deck investisseurs', 'Présentation synthétique de 10 à 15 diapositives', 'resume_executif', 'Dossier → PowerPoint', 'pitch', [R('resume_executif'), R('marche'), R('plan_financier')]],
    // 2 — Commercial et opérationnel
    [11, 2, 'Catalogue des offres', 'Produits, services et formules proposés, avec leurs prix', 'produits', 'Produits et services', 'prixproduits', [R('produits'), L('plan_financier', 'offres_portefeuille')]],
    [12, 2, 'Politique tarifaire', 'Prix, coûts de revient, marges et rentabilité', 'produits', 'Prix, volumes et marges', 'prixproduits', [ANY('produits', ['etude_prix', 'items']), L('plan_financier', 'offres_portefeuille')]],
    [13, 2, 'Stratégie commerciale', 'Prospection, acquisition et fidélisation', 'plan_commercial', 'Plan commercial', 'plan_commercial', [R('plan_commercial')]],
    [14, 2, 'Plan marketing et communication', 'Publicité, réseaux sociaux, partenariats', 'strategie_marketing', 'Stratégie marketing', 'strategie_marketing', [R('strategie_marketing')]],
    [15, 2, 'Prévisions commerciales', 'Nombre de clients et ventes sur 60 mois', 'plan_financier', 'Portefeuille clients', 'finance_avancee', [L('plan_financier', 'offres_portefeuille')]],
    [16, 2, 'Plan d\'organisation', 'Fonctionnement de l\'entreprise et de ses sites', 'organisation', 'Organisation et gouvernance', 'organisation', [R('organisation'), R('plan_operationnel')]],
    [17, 2, 'Organigramme', 'Direction, sites, équipes opérationnelles et fonctions support', 'organisation', 'Organisation et gouvernance', 'organisation', [R('organisation'), L('strategie_developpement', 'agences')]],
    [18, 2, 'Plan de recrutement', 'Effectifs, salaires, recrutements progressifs', 'rh', 'Ressources humaines', 'rh', [R('rh'), ANY('plan_financier', ['salaires_1', 'masse_salariale'])]],
    [19, 2, 'Plan logistique', 'Véhicules, matériel, stocks et déplacements', 'plan_operationnel', 'Plan opérationnel', 'plan_operationnel', [L('plan_operationnel', 'logistique_moyens'), L('plan_operationnel', 'deplacements')]],
    [20, 2, 'Manuel des opérations', 'Procédures, urgences, contrôles qualité et suivi des clients', 'plan_operationnel', 'Plan opérationnel', 'plan_operationnel', [L('plan_operationnel', 'procedures_operations')]],
    [21, 2, 'Plan de gestion des risques', 'Pannes, impayés, sinistres, sécurité, litiges', 'risques', 'Analyse des risques', 'risques', [R('risques')]],
    // 3 — Financier
    [22, 3, 'Hypothèses financières', 'Paramètres modifiables', 'plan_financier', 'Plan financier', 'finances', [L('plan_financier', 'hypotheses_financieres')]],
    [23, 3, 'Investissements initiaux', 'Véhicules, équipements, outils numériques, locaux', 'plan_financier', 'Plan financier', 'finances', [ANY('plan_financier', ['investissement_initial', 'immobilisations_liste'])]],
    [24, 3, 'Plan de financement initial', 'Apports, emprunts, investissements', 'financement', 'Plan de financement', 'planfinancement', [ANY('plan_financier', ['pf_apport', 'pf_banque', 'pf_associes']), L('financement', 'sources_financement')]],
    [25, 3, 'Chiffre d\'affaires prévisionnel', 'Ventes de produits, abonnements et prestations', 'plan_financier', 'Plan financier', 'finances', [ANY('plan_financier', ['ca_1', 'offres_portefeuille', 'prevision'])]],
    [26, 3, 'Évolution du portefeuille clients', 'Acquisition, résiliation, fidélisation', 'plan_financier', 'Portefeuille clients', 'finance_avancee', [L('plan_financier', 'offres_portefeuille')]],
    [27, 3, 'Charges fixes', 'Loyers, assurances, abonnements logiciels', 'plan_financier', 'Plan financier', 'finances', [ANY('plan_financier', ['loyers_1', 'autres_charges_1', 'charges_detaillees', 'prevision'])]],
    [28, 3, 'Charges variables', 'Matières, consommables, carburant, sous-traitance', 'plan_financier', 'Plan financier', 'finances', [ANY('plan_financier', ['achats_1', 'charges_detaillees', 'prevision'])]],
    [29, 3, 'Masse salariale', 'Salaires et charges sociales', 'rh', 'Masse salariale', 'massesalariale', [ANY('plan_financier', ['salaires_1', 'prevision']), R('rh')]],
    [30, 3, 'Amortissements', 'Dépréciation des investissements', 'plan_financier', 'Plan financier', 'finances', [L('plan_financier', 'immobilisations_liste')]],
    [31, 3, 'Emprunts', 'Intérêts et échéanciers', 'plan_financier', 'Plan de financement', 'planfinancement', [L('plan_financier', 'dettes')]],
    [32, 3, 'Compte de résultat prévisionnel', 'Produits, charges, résultat', 'plan_financier', 'Plan financier', 'finances', [ANY('plan_financier', ['ca_1', 'ca_2'])]],
    [33, 3, 'Plan de trésorerie', 'Encaissements et décaissements mensuels', 'plan_financier', 'Trésorerie', 'tresorerie', [ANY('plan_financier', ['ca_1', 'prevision']), ANY('plan_financier', ['delai_paiement_clients', 'tresorerie_depart', 'prevision'])]],
    [34, 3, 'Bilan prévisionnel', 'Actif, passif et capitaux propres', 'plan_financier', 'Bilan et ratios', 'finance_avancee', [ANY('plan_financier', ['ca_1']), ANY('plan_financier', ['pf_apport', 'pf_associes', 'dettes', 'immobilisations_liste'])]],
    [35, 3, 'Besoin en fonds de roulement', 'Décalages entre paiements et encaissements', 'plan_financier', 'Bilan et ratios', 'finance_avancee', [ANY('plan_financier', ['delai_paiement_clients', 'delai_paiement_fournisseurs', 'rotation_stocks'])]],
    [36, 3, 'Seuil de rentabilité', 'Niveau d\'activité minimal pour couvrir les charges', 'plan_financier', 'Portefeuille clients', 'finance_avancee', [L('plan_financier', 'offres_portefeuille'), ANY('plan_financier', ['salaires_1', 'loyers_1', 'autres_charges_1', 'prevision'])]],
    [37, 3, 'Analyse de rentabilité par offre', 'Marge et rentabilité de chaque offre du portefeuille', 'plan_financier', 'Portefeuille clients', 'finance_avancee', [L('plan_financier', 'offres_portefeuille')]],
    [38, 3, 'Scénarios financiers', 'Prudent, central et optimiste', 'plan_financier', 'Portefeuille clients', 'finance_avancee', [L('plan_financier', 'offres_portefeuille')]],
    [39, 3, 'Ratios financiers', 'Marges, liquidité, endettement, capacité de remboursement', 'plan_financier', 'Bilan et ratios', 'finance_avancee', [ANY('plan_financier', ['ca_1']), ANY('plan_financier', ['pf_apport', 'pf_associes', 'dettes'])]],
    [40, 3, 'Tableau de bord financier', 'Graphiques et indicateurs de performance', 'plan_financier', 'Tableau de bord', 'finance_avancee', [L('plan_financier', 'offres_portefeuille')]],
    // 4 — Juridique
    [41, 4, 'Projet de statuts', 'Organisation juridique de l\'entreprise', 'juridique', 'Documents juridiques', 'juridique', [TYPE_JUR('Projet de statuts')], 'droit'],
    [42, 4, 'Pacte d\'associés', 'Gouvernance, cession des parts, conflits, décisions', 'juridique', 'Documents juridiques', 'juridique', [TYPE_JUR('Pacte d\'associés'), ANY('juridique', ['pacte_gouvernance', 'pacte_cession_parts', 'pacte_conflits'])], 'droit'],
    [43, 4, 'Répartition du capital', 'Répartition envisagée, à confirmer entre associés', 'infos_generales', 'Informations générales', 'organisation', [L('infos_generales', 'actionnariat')]],
    [44, 4, 'Justificatifs d\'immatriculation', 'RCCM, identification fiscale et autres formalités applicables', 'infos_generales', 'Informations générales', 'juridique', [ANY('infos_generales', ['numero_immatriculation', 'numero_identification_fiscale'])], 'piece'],
    [45, 4, 'Contrats clients', 'Conditions des ventes, abonnements et prestations', 'juridique', 'Documents juridiques', 'juridique', [L('juridique', 'contrats_types')], 'droit'],
    [46, 4, 'Conditions générales de vente', 'Paiements, résiliations, garanties, responsabilités', 'juridique', 'Documents juridiques', 'juridique', [ANY('juridique', ['cgv_paiements', 'cgv_resiliation', 'cgv_garanties', 'cgv_responsabilite'])], 'droit'],
    [47, 4, 'Dossier d\'assurance', 'Responsabilité civile professionnelle, véhicules et autres couvertures', 'juridique', 'Documents juridiques', 'juridique', [L('juridique', 'assurances_couvertures')], 'piece'],
    [48, 4, 'Conformité des données clients', 'Données personnelles, sécurité, accès et conservation', 'juridique', 'Documents juridiques', 'juridique', [L('juridique', 'registre_donnees')]],
    // 5 — Financeurs
    [49, 5, 'Demande de financement', 'Montant demandé, objet et durée', 'financement', 'Financement', 'financement', [ANY('financement', ['besoin_total']), L('financement', 'sources_financement')]],
    [50, 5, 'Plan d\'utilisation des fonds', 'Affectation détaillée du financement', 'financement', 'Financement', 'financement', [ANY('financement', ['utilisation_postes', 'tranches_financement']), L('financement', 'tranches_financement')]],
    [51, 5, 'Devis fournisseurs', 'Matériel, véhicules, informatique, locaux', 'financement', 'Financement', 'financement', [L('financement', 'devis_fournisseurs')], 'piece'],
    [52, 5, 'Justificatifs des apports', 'Fonds personnels et apports des associés', 'financement', 'Financement', 'financement', [L('financement', 'apports_associes')], 'piece'],
    [53, 5, 'CV des dirigeants', 'Parcours, diplômes et compétences de chaque dirigeant', 'infos_generales', 'Équipe et fondateurs', 'equipe', [L('infos_generales', 'parcours_professionnel'), L('infos_generales', 'diplomes_qualifications')]],
    [54, 5, 'Lettres d\'intention', 'Clients ou partenaires potentiels', 'financement', 'Financement', 'financement', [L('financement', 'lettres_intention')], 'piece'],
    [55, 5, 'Analyse des garanties', 'Garanties éventuellement proposées à la banque', 'financement', 'Financement', 'financement', [ANY('financement', ['garanties_propose']), L('financement', 'garanties_offertes')]],
    [56, 5, 'Calendrier de déploiement', 'Étapes de lancement et jalons de financement', 'calendrier', 'Calendrier de mise en œuvre', 'calendrier', [R('calendrier'), L('financement', 'tranches_financement')]],
    // 6 — Pilotage interne
    [57, 6, 'Budget annuel', 'Objectifs et dépenses par service', 'pilotage', 'Pilotage interne', 'pilotage', [L('pilotage', 'budget_annuel')]],
    [58, 6, 'Tableau de bord par agence', 'Résultats de chaque site ou agence, existant ou futur', 'pilotage', 'Pilotage interne', 'pilotage', [L('pilotage', 'suivi_agences')]],
    [59, 6, 'Suivi commercial des clients', 'Prospects, devis, contrats, conversion', 'pilotage', 'Pilotage interne', 'pilotage', [L('pilotage', 'suivi_commercial')]],
    [60, 6, 'Suivi de l\'activité opérationnelle', 'Délais, coûts, qualité, productivité', 'pilotage', 'Pilotage interne', 'pilotage', [L('pilotage', 'suivi_interventions')]],
    [61, 6, 'Suivi des stocks', 'Achats, consommations, inventaires', 'pilotage', 'Pilotage interne', 'pilotage', [L('pilotage', 'suivi_stocks')]],
    [62, 6, 'Reporting mensuel', 'Comparaison du réalisé avec le prévisionnel', 'pilotage', 'Pilotage interne', 'pilotage', [L('pilotage', 'reporting_mensuel')]],
  ].map(x => ({ n: x[0], groupe: x[1], titre: x[2], contenu: x[3], rub: x[4], libelle: x[5], page: x[6], req: x[7], nature: x[8] || null }));

  const OBLIGATOIRES = ['infos_generales', 'resume_executif', 'presentation', 'probleme', 'solution', 'marche', 'swot', 'business_model', 'produits', 'strategie_marketing', 'plan_commercial', 'plan_operationnel', 'organisation', 'rh', 'calendrier', 'plan_financier', 'risques', 'impact', 'financement'];

  function critereOk(bp, c) {
    if (c.complet) return OBLIGATOIRES.filter(r => rempli(rub(bp, r))).length >= Math.ceil(OBLIGATOIRES.length * 0.8);
    if (c.juridique) { const l = rub(bp, 'juridique').documents_juridiques; return Array.isArray(l) && l.some(x => x && x.type_document === c.juridique && a_(x.statut_document) && x.statut_document !== 'Non commencé'); }
    return critere(bp, c);
  }

  /* État d'un document : rempli / partiel / vide, avec la liste de ce qui manque (messages lisibles). */
  function etatDocument(bp, d) {
    const ok = d.req.map(c => critereOk(bp, c)), n = ok.filter(Boolean).length;
    let etat = n === d.req.length ? 'rempli' : n > 0 ? 'partiel' : 'vide';
    if (d.req[0] && d.req[0].complet && etat === 'vide') {   /* business plan complet : « partiel » dès la moitié des rubriques de base */
      if (OBLIGATOIRES.filter(r => rempli(rub(bp, r))).length >= Math.ceil(OBLIGATOIRES.length * 0.5)) etat = 'partiel';
    }
    let note = '';
    if (d.nature === 'droit') note = 'Texte à faire valider par un professionnel du droit.';
    if (d.nature === 'piece') note = etat === 'vide' ? 'Pièce réelle à joindre (annexes).' : 'Joindre la pièce réelle dans les annexes.';
    return { n: d.n, etat, note, satisfaits: n, total: d.req.length };
  }

  /* Vue d'ensemble : tous les documents avec leur état, groupés, et les compteurs. */
  function etat(bp) {
    const docs = DOCS.map(d => Object.assign({}, d, etatDocument(bp, d)));
    const compte = { rempli: 0, partiel: 0, vide: 0 }; docs.forEach(d => { compte[d.etat]++; });
    const groupes = GROUPES.map(g => { const l = docs.filter(d => d.groupe === g.id); return Object.assign({}, g, { docs: l, rempli: l.filter(d => d.etat === 'rempli').length, total: l.length }); });
    return { docs, groupes, compte, total: docs.length, pct: Math.round((compte.rempli + compte.partiel * 0.5) / docs.length * 100) };
  }

  const LIB = { rempli: 'Rempli', partiel: 'Partiel', vide: 'À faire' };
  const ECHAPPE = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /* Tableau des documents d'un groupe ou de tous. ctx : { esc, lien(doc) → html du lien, cls } */
  function tableauHtml(e, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || ECHAPPE;
    return e.groupes.map(g => `<h4 class="dc-h">${g.id}. ${esc(g.titre)} <span class="dc-c">${g.rempli} / ${g.total}</span></h4><table class="dc-t${ctx.cls ? ' ' + ctx.cls : ''}"><thead><tr><th>N°</th><th>Document</th><th>Où le trouver</th><th>État</th></tr></thead><tbody>${g.docs.map(d =>
      `<tr><td class="num">${d.n}</td><td><strong>${esc(d.titre)}</strong><br><span class="dc-n">${esc(d.contenu)}</span>${d.note ? `<br><span class="dc-n dc-w">${esc(d.note)}</span>` : ''}</td><td>${ctx.lien ? ctx.lien(d) : esc(d.libelle)}</td><td><span class="dc-e dc-${d.etat}">${LIB[d.etat]}</span></td></tr>`).join('')}</tbody></table>`).join('');
  }

  const CSS = '.dc-h{margin:14px 0 6px;font-size:14px}.dc-c{font-weight:500;font-size:12px;opacity:.7;margin-left:6px}.dc-t{width:100%;border-collapse:collapse;font-size:12.5px}.dc-t th,.dc-t td{padding:6px 8px;border-bottom:1px solid var(--pv-grille,#cfd6e2);text-align:left;vertical-align:top}.dc-t td.num{width:34px;font-variant-numeric:tabular-nums;opacity:.7}.dc-n{font-size:11.5px;opacity:.75}.dc-w{color:var(--pv-negatif,#c2410c);opacity:1}.dc-e{display:inline-block;padding:2px 9px;border-radius:99px;font-size:11px;font-weight:700;white-space:nowrap}.dc-rempli{background:rgba(15,123,95,.16);color:#0F7B5F}.dc-partiel{background:rgba(232,163,61,.22);color:#9a6208}.dc-vide{background:rgba(194,65,12,.13);color:#c2410c}';

  return { GROUPES, DOCS, OBLIGATOIRES, rempli, etat, etatDocument, tableauHtml, CSS, LIB };
});

/* ═══════════════════════════════════════════════════════════════════
   business-plan-calc.js — Diaspo'Actif (2026-09-01)
   Consolidation du module Business Plan (chantier "améliore tous" du 2026-09-01, suite à
   l'audit fait à l'utilisateur) : extrait les fonctions de calcul PURES du module Business Plan
   hors de business-plan-edit.html pour qu'elles soient (a) testables sans navigateur/DOM et
   (b) partagées sans duplication silencieuse.

   Chaque fonction ici prend ses données EN PARAMÈTRE (jamais de lecture de `sections` globale,
   jamais d'écriture DOM) -- les wrappers dans business-plan-edit.html (bpCalcAmortissementAnnuel,
   bpCalcInteretsParAnnee, bpCalcDilution, bpCalcScenariosFinancement, bpDetecterIncoherences)
   restent responsables de lire `sections` et d'écrire dans le DOM, mais délèguent tout le calcul
   ici -- comportement externe inchangé, logique enfin testable (voir test/business-plan-calc.test.js).

   Chargé en <script> classique côté navigateur (window.BPCalc) ET en require() côté Node (tests).
   ═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

  /* Amortissement linéaire annuel total, toutes immobilisations confondues -- appliqué
     uniformément sur les 5 années du compte de résultat (simplification documentée : pas de
     calcul différent par année selon la date d'acquisition de chaque immobilisation). */
  function calcAmortissementAnnuel(immobilisations) {
    return (immobilisations || []).reduce((total, im) => {
      const duree = num(im.duree_amortissement);
      if (!duree || duree <= 0) return total;
      const base = num(im.montant) - num(im.valeur_residuelle);
      return total + Math.max(0, base) / duree;
    }, 0);
  }

  /* Coût des intérêts d'emprunt par année (1 à 5), toutes dettes confondues. Avec mensualité
     saisie : coût total = mensualité × durée − capital emprunté. Sans mensualité : approximation
     à intérêts simples (montant × taux × durée en années). Réparti linéairement sur la durée du
     prêt, plafonné à l'année 5 (au-delà, l'intérêt residuel n'apparaît plus dans le compte de
     résultat prévisionnel à 5 ans). */
  function calcInteretsParAnnee(dettes) {
    const parAnnee = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    (dettes || []).forEach(d => {
      const dureeMois = num(d.duree);
      if (!dureeMois || dureeMois <= 0) return;
      const dureeAnnees = Math.min(5, Math.max(1, Math.ceil(dureeMois / 12)));
      const montant = num(d.montant);
      const mensualite = num(d.mensualite);
      const coutTotal = mensualite > 0
        ? Math.max(0, mensualite * dureeMois - montant)
        : montant * (num(d.taux) / 100) * (dureeMois / 12);
      const interetAnnuel = coutTotal / dureeAnnees;
      for (let an = 1; an <= dureeAnnees; an++) parAnnee[an] += interetAnnuel;
    });
    return parAnnee;
  }

  /* Simulation de dilution : % du capital cédé pour le montant recherché, à la valorisation
     après investissement déclarée. Retourne null si les données manquent (pas de valeur par
     défaut trompeuse). */
  function calcDilution(montant, valorisationApres) {
    const m = num(montant), v = num(valorisationApres);
    if (!m || !v) return null;
    const pctCede = (m / v) * 100;
    return { pctCede, pctFondateursApres: 100 - pctCede };
  }

  /* Scénarios 50/100/150% du financement demandé : montant réellement reçu à chaque palier et
     sa couverture de l'investissement initial déclaré. */
  function calcScenariosFinancement(montantDemande, investissementInitial) {
    const montant = num(montantDemande), besoin = num(investissementInitial);
    if (!montant) return [];
    return [50, 100, 150].map(pct => {
      const recu = montant * pct / 100;
      const couverture = besoin > 0 ? Math.round(recu / besoin * 100) : null;
      const statut = couverture === null ? null
        : couverture >= 100 ? 'couvert' : couverture >= 60 ? 'partiel' : 'insuffisant';
      return { pct, recu, couverture, statut };
    });
  }

  /* BFR (besoin en fonds de roulement) -- formule normative statique standard :
     BFR = Stock moyen + Créances clients − Dettes fournisseurs.
     Les 3 entrées sont déjà des champs numériques existants du plan financier (stock_moyen_valeur,
     creances_clients, dettes_fournisseurs) -- jusqu'ici jamais utilisés pour calculer quoi que ce
     soit : le champ `bfr` affiché dans le tableau de bord était en réalité du TEXTE LIBRE
     ("Besoin en fonds de roulement estimé à 12 000 € pour couvrir...") passé à parseFloat(), qui
     retombe systématiquement sur 0/NaN pour une valeur qui commence par une lettre -- le ratio
     BFR/CA du tableau de bord affichait donc silencieusement "0%" (toujours au vert) pour tout
     plan rempli normalement. Bug trouvé le 2026-09-01 en consolidant ce module. */
  function calcBFR({ stockMoyen, creancesClients, dettesFournisseurs }) {
    return num(stockMoyen) + num(creancesClients) - num(dettesFournisseurs);
  }

  /* Alertes de cohérence (2026-08-31, point 27 du cahier des charges "Évolution du module
     Business Plan" + extension du 2026-09-01) -- contrôles arithmétiques purs sur les données
     déjà saisies, jamais un appel serveur, jamais persisté. Chaque alerte est explicable : elle
     retourne toujours les deux valeurs comparées, jamais un simple "incohérence détectée". */
  function detecterIncoherences(sections) {
    const has = v => v !== undefined && v !== null && String(v).trim() !== '';
    const alertes = [];

    const fin = sections.plan_financier || {};
    const commercial = sections.plan_commercial || {};
    const financement = sections.financement || {};
    const etudePrix = sections.produits?.etude_prix || [];

    const ca1 = has(fin.ca_1) ? num(fin.ca_1) : null;
    const contratsFunnel = has(commercial.nb_contrats_funnel) ? num(commercial.nb_contrats_funnel) : null;
    const panierMoyen = has(commercial.panier_moyen_commercial) ? num(commercial.panier_moyen_commercial) : null;

    // 1. CA prévisionnel très éloigné de la capacité commerciale du funnel, dans les deux sens
    if (ca1 !== null && ca1 > 0 && contratsFunnel !== null && contratsFunnel > 0 && panierMoyen !== null && panierMoyen > 0) {
      const caFunnelMax = contratsFunnel * panierMoyen * 12;
      if (ca1 > caFunnelMax * 3) {
        alertes.push({ titre: 'Chiffre d\'affaires très supérieur à la capacité commerciale déclarée',
          detail: `CA An 1 saisi : ${Math.round(ca1)}. Capacité suggérée par le funnel (${contratsFunnel} contrats × ${Math.round(panierMoyen)} × 12 mois) : environ ${Math.round(caFunnelMax)}.`,
          cible: 'plan_commercial' });
      } else if (ca1 * 3 < contratsFunnel * panierMoyen) {
        alertes.push({ titre: 'Chiffre d\'affaires très inférieur à ce que suggèrent les contrats et le panier moyen',
          detail: `${contratsFunnel} contrats × ${Math.round(panierMoyen)} de panier moyen = ${Math.round(contratsFunnel*panierMoyen)}, largement supérieur au CA An 1 saisi (${Math.round(ca1)}).`,
          cible: 'plan_commercial' });
      }
    }

    // 2. Marge déclarée (étude de prix) vs marge réellement calculée sur le compte de résultat An 1
    if (ca1 !== null && ca1 > 0) {
      const margeCalculee = ((ca1 - num(fin.achats_1)) / ca1) * 100;
      etudePrix.forEach(e => {
        const margeDeclaree = has(e.marge_souhaitee) ? num(e.marge_souhaitee) : null;
        if (margeDeclaree !== null && Math.abs(margeDeclaree - margeCalculee) > 20) {
          alertes.push({ titre: `Marge déclarée sur « ${e.produit || 'un produit'} » très différente de la marge calculée`,
            detail: `Marge souhaitée saisie : ${margeDeclaree}%. Marge brute calculée sur le compte de résultat An 1 (CA − achats) / CA : ${margeCalculee.toFixed(1)}%.`,
            cible: 'produits' });
        }
      });
    }

    // 3. Montant de financement recherché vs besoin réel (investissement initial + BFR calculé)
    const montantRecherche = has(financement.montant) ? num(financement.montant) : null;
    const investissement = has(fin.investissement_initial) ? num(fin.investissement_initial) : null;
    if (montantRecherche !== null && investissement !== null && investissement > 0) {
      const bfr = calcBFR({ stockMoyen: fin.stock_moyen_valeur, creancesClients: fin.creances_clients, dettesFournisseurs: fin.dettes_fournisseurs });
      const besoin = investissement + Math.max(0, bfr);
      if (montantRecherche < besoin * 0.9) {
        alertes.push({ titre: 'Montant recherché inférieur au besoin identifié',
          detail: `Montant recherché : ${Math.round(montantRecherche)}. Investissement initial déclaré${bfr>0?' + BFR calculé':''} : ${Math.round(besoin)}.`,
          cible: 'financement' });
      }
    }

    // 4. Pourcentage de capital proposé vs dilution réellement calculée
    const pctPropose = has(financement.pourcentage_propose) ? num(financement.pourcentage_propose) : null;
    const dilution = calcDilution(montantRecherche, financement.valorisation_apres);
    if (pctPropose !== null && dilution !== null && Math.abs(pctPropose - dilution.pctCede) > 5) {
      alertes.push({ titre: 'Pourcentage de capital proposé incohérent avec la valorisation',
        detail: `Pourcentage déclaré : ${pctPropose}%. Calculé (montant recherché / valorisation après) : ${dilution.pctCede.toFixed(1)}%.`,
        cible: 'financement' });
    }

    // 5. Immobilisations détaillées vs total Matériel + Véhicules du plan de financement
    //    (exactement le type d'écart trouvé et corrigé à la main le 2026-08-31 sur l'exemple
    //    publié -- deux saisies séparées du même montant, sans garantie qu'elles se recoupent).
    const totalImmobilisations = (fin.immobilisations_liste || []).reduce((s, im) => s + num(im.montant), 0);
    const materielVehicules = num(fin.pf_materiel) + num(fin.pf_vehicules);
    if (totalImmobilisations > 0 && materielVehicules > 0 && Math.abs(totalImmobilisations - materielVehicules) > Math.max(500, totalImmobilisations * 0.1)) {
      alertes.push({ titre: 'Détail des immobilisations différent du total Matériel + Véhicules',
        detail: `Somme de la liste des immobilisations : ${Math.round(totalImmobilisations)}. Matériel + Véhicules (plan de financement) : ${Math.round(materielVehicules)}.`,
        cible: 'plan_financier' });
    }

    // 6. Dettes détaillées vs poste "Banque" du plan de financement
    const totalDettes = (fin.dettes || []).reduce((s, d) => s + num(d.montant), 0);
    const banque = num(fin.pf_banque);
    if (totalDettes > 0 && banque > 0 && Math.abs(totalDettes - banque) > Math.max(500, totalDettes * 0.1)) {
      alertes.push({ titre: 'Détail des emprunts différent du poste "Banque" du plan de financement',
        detail: `Somme des emprunts détaillés : ${Math.round(totalDettes)}. Poste "Banque" (Ressources) : ${Math.round(banque)}.`,
        cible: 'plan_financier' });
    }

    // 7. Plan de financement déséquilibré (Ressources ≠ Emplois) -- LE bug trouvé le 2026-08-31
    //    sur l'exemple publié (20 000 € d'écart, jamais détecté avant qu'on ne le cherche).
    const RESS = ['pf_apport','pf_associes','pf_famille','pf_business_angels','pf_banque','pf_subvention','pf_investisseur','pf_crowdfunding','pf_diaspo_invest','pf_autres_ress'];
    const EMP = ['pf_terrain','pf_construction','pf_materiel','pf_vehicules','pf_logiciels','pf_stocks','pf_tresorerie','pf_frais_admin','pf_communication','pf_recrutement'];
    const totalRessources = RESS.reduce((s,k) => s + num(fin[k]), 0);
    const totalEmplois = EMP.reduce((s,k) => s + num(fin[k]), 0);
    if ((totalRessources > 0 || totalEmplois > 0) && Math.abs(totalRessources - totalEmplois) > Math.max(1, Math.max(totalRessources, totalEmplois) * 0.01)) {
      alertes.push({ titre: 'Plan de financement déséquilibré (Ressources ≠ Emplois)',
        detail: `Total Ressources : ${Math.round(totalRessources)}. Total Emplois : ${Math.round(totalEmplois)}. Un plan de financement doit toujours s'équilibrer : on ne peut pas dépenser plus qu'on ne finance.`,
        cible: 'plan_financier' });
    }

    return alertes;
  }

  return { calcAmortissementAnnuel, calcInteretsParAnnee, calcDilution, calcScenariosFinancement, calcBFR, detecterIncoherences };
});

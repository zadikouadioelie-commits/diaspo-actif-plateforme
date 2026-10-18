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

  /* Vraie mensualité d'emprunt (formule PMT), pas une approximation -- ajoutée le 2026-09-01,
     n'existait nulle part sur la plateforme (aucun simulateur de prêt, aucun autre module).
     N'affecte PAS calcInteretsParAnnee() ci-dessus (toujours utilisée par calcFinRow/calcRatios/
     detecterIncoherences dans business-plan-edit.html) : fonction purement additive, réservée
     à un affichage détaillé (échéancier) qui n'existait pas avant. Taux à 0% : capital réparti
     également sur la durée, aucun intérêt (la formule standard divise par zéro à ce taux). */
  function calcMensualite(montant, tauxAnnuelPct, dureeMoisRemboursement) {
    const c = num(montant), n = num(dureeMoisRemboursement), tMensuel = num(tauxAnnuelPct) / 100 / 12;
    if (!c || !n || n <= 0) return 0;
    if (!tMensuel) return c / n;
    return c * tMensuel / (1 - Math.pow(1 + tMensuel, -n));
  }

  /* Échéancier complet d'un emprunt : capital restant dû / intérêts payés / capital remboursé,
     agrégés par année (1..N) plutôt que mois par mois (plus lisible dans un dossier). Convention
     du différé : aucune échéance (ni capital ni intérêt) pendant les `differe` premiers mois --
     le remboursement s'étale ensuite sur (duree - differe) mois restants. Si `mensualite` est
     saisie par l'utilisateur, elle prime sur le calcul PMT (on ne contredit jamais une donnée
     déclarée) ; sinon, la vraie mensualité est calculée. */
  function calcEcheancierEmprunt(dette) {
    const montant = num(dette?.montant), tauxAnnuel = num(dette?.taux), dureeMois = num(dette?.duree), differeMois = Math.max(0, num(dette?.differe));
    if (!montant || !dureeMois || dureeMois <= differeMois) return null;
    const dureeRemboursement = dureeMois - differeMois;
    const mensualite = num(dette.mensualite) > 0 ? num(dette.mensualite) : calcMensualite(montant, tauxAnnuel, dureeRemboursement);
    const tauxMensuel = tauxAnnuel ? tauxAnnuel / 100 / 12 : 0;
    let capitalRestant = montant;
    const parAnnee = {};
    for (let mois = 1; mois <= dureeMois; mois++) {
      const annee = Math.ceil(mois / 12);
      if (!parAnnee[annee]) parAnnee[annee] = { interets: 0, capitalRembourse: 0, capitalRestantFin: capitalRestant };
      if (mois > differeMois) {
        const interetMois = capitalRestant * tauxMensuel;
        const capitalMois = Math.min(capitalRestant, Math.max(0, mensualite - interetMois));
        capitalRestant = Math.max(0, capitalRestant - capitalMois);
        parAnnee[annee].interets += interetMois;
        parAnnee[annee].capitalRembourse += capitalMois;
      }
      parAnnee[annee].capitalRestantFin = capitalRestant;
    }
    return { mensualite, dureeRemboursement, parAnnee, capitalRestantFin: capitalRestant };
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
      // Le besoin total est couvert par le financement recherché ET l'apport personnel -- les
      // comparer l'un à l'autre isolément produisait une fausse alerte sur tout plan où une
      // partie du besoin est sciemment couverte par l'apport plutôt que par le financement
      // recherché (trouvé le 2026-09-01 en créant un plan réel avec ce cas de figure).
      const apport = num(fin.apport_personnel);
      const finance = montantRecherche + apport;
      if (finance < besoin * 0.9) {
        alertes.push({ titre: 'Montant recherché (+ apport personnel) inférieur au besoin identifié',
          detail: `Montant recherché + apport personnel : ${Math.round(finance)}. Investissement initial déclaré${bfr>0?' + BFR calculé':''} : ${Math.round(besoin)}.`,
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

    // 8. Trésorerie négative dans les 36 premiers mois (calculée avec les délais de paiement, la TVA,
    //    les emprunts et le plan de financement) : un projet rentable peut manquer de cash.
    if (has(fin.ca_1) && num(fin.ca_1) > 0) {
      const tr = calcTresorerie(fin, 36);
      if (tr.premierMoisNegatif) {
        alertes.push({ titre: 'Trésorerie négative dans les 36 premiers mois',
          detail: `La trésorerie calculée devient négative au mois ${tr.premierMoisNegatif}. Point bas : ${Math.round(tr.minimum)} au mois ${tr.moisMinimum} — il manque environ ${Math.round(tr.besoinComplementaire)} de financement ou de trésorerie de départ.`,
          cible: 'plan_financier' });
      }
    }

    return alertes;
  }

  /* ═══════════════ Fiscalité, TVA et trésorerie sur 36 mois (2026-10-18) ═══════════════
     Trois fonctions pures ajoutées pour rapprocher le module d'un vrai modèle de prévisionnel
     (impôt et TVA calculés, trésorerie mensuelle avec délais de paiement). Elles lisent le même
     objet `plan_financier` que l'éditeur ; sans régime fiscal ni TVA renseignés, tout se comporte
     comme avant (impôt = 0, TVA = 0) : les plans existants ne changent pas d'un centime. */
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  // « 30 jours », « 45 j », « 30 » → 30 ; texte sans chiffre → 0.
  function parseJours(texte) {
    const m = String(texte === undefined || texte === null ? '' : texte).match(/\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(',', '.')) : 0;
  }

  const REGIMES = ['is', 'ir', 'micro', 'exonere'];
  // Valeurs indicatives proposées quand l'utilisateur choisit un régime sans saisir de taux.
  const TAUX_IMPOT_DEFAUT = { is: 25, ir: 15, micro: 12.3, exonere: 0 };
  const RESSOURCES_PF = ['pf_apport', 'pf_associes', 'pf_famille', 'pf_business_angels', 'pf_banque', 'pf_subvention', 'pf_investisseur', 'pf_crowdfunding', 'pf_diaspo_invest', 'pf_autres_ress'];
  const EMPLOIS_PF = ['pf_terrain', 'pf_construction', 'pf_materiel', 'pf_vehicules', 'pf_logiciels', 'pf_stocks', 'pf_tresorerie', 'pf_frais_admin', 'pf_communication', 'pf_recrutement'];

  /* Compte de résultat complet sur 5 ans, avec impôt et TVA.
     - Impôt (régime `is` ou `ir`) : taux × résultat avant impôt positif, après imputation des
       déficits antérieurs (report illimité, désactivable : report_deficit = 'non'). En `is`, un taux
       réduit peut s'appliquer jusqu'à un plafond de bénéfice (is_taux_reduit / is_seuil_reduit).
     - `micro` : cotisations et impôt forfaitaires = taux × chiffre d'affaires, sans lien avec les charges.
     - `exonere` (association, structure exonérée) : aucun impôt.
     - TVA (tva_assujetti = 'oui') : les montants saisis sont HORS TAXE ; collectée sur le chiffre
       d'affaires, déductible sur achats + loyers + marketing + autres charges (part ouvrant droit à
       déduction réglable), jamais sur les salaires. Solde négatif = crédit de TVA. */
  function calcModeleFinancier(pf) {
    pf = pf || {};
    const amort = calcAmortissementAnnuel(pf.immobilisations_liste || []);
    const interets = calcInteretsParAnnee(pf.dettes || []);
    const regime = REGIMES.includes(pf.regime_fiscal) ? pf.regime_fiscal : '';
    const tauxImpot = has(pf.taux_impot) ? Math.max(0, num(pf.taux_impot)) : (TAUX_IMPOT_DEFAUT[regime] || 0);
    const tauxReduit = regime === 'is' && has(pf.is_taux_reduit) ? Math.max(0, num(pf.is_taux_reduit)) : 0;
    const seuilReduit = regime === 'is' && has(pf.is_seuil_reduit) ? Math.max(0, num(pf.is_seuil_reduit)) : 0;
    const reportDeficit = pf.report_deficit !== 'non';
    const tvaOn = pf.tva_assujetti === 'oui';
    const tvaTaux = tvaOn ? (has(pf.tva_taux) ? Math.max(0, num(pf.tva_taux)) : 20) : 0;
    const tvaPartDeductible = has(pf.tva_part_deductible) ? Math.min(100, Math.max(0, num(pf.tva_part_deductible))) : 100;

    const impotSur = base => {
      if (base <= 0) return 0;
      if (tauxReduit > 0 && seuilReduit > 0) return Math.min(base, seuilReduit) * tauxReduit / 100 + Math.max(0, base - seuilReduit) * tauxImpot / 100;
      return base * tauxImpot / 100;
    };

    let deficit = 0;
    const annees = [];
    for (let a = 1; a <= 5; a++) {
      const ca = num(pf['ca_' + a]), autresProduits = num(pf['autres_produits_' + a]);
      const achats = num(pf['achats_' + a]), salaires = num(pf['salaires_' + a]);
      const chargesExternes = num(pf['loyers_' + a]) + num(pf['marketing_charge_' + a]) + num(pf['autres_charges_' + a]);
      const produits = ca + autresProduits;
      const va = produits - achats - chargesExternes;
      const ebe = va - salaires;
      const resExploitation = ebe - amort;
      const interetsAn = interets[a] || 0;
      const avantImpot = resExploitation - interetsAn;
      let impot = 0;
      if (regime === 'micro') impot = produits > 0 ? produits * tauxImpot / 100 : 0;
      else if (regime === 'is' || regime === 'ir') {
        let base = avantImpot;
        if (reportDeficit) {
          if (base < 0) { deficit += -base; base = 0; }
          else if (deficit > 0) { const imputation = Math.min(deficit, base); deficit -= imputation; base -= imputation; }
        }
        impot = impotSur(base);
      }
      const tvaCollectee = tvaOn ? ca * tvaTaux / 100 : 0;
      const tvaDeductible = tvaOn ? (achats + chargesExternes) * tvaTaux / 100 * tvaPartDeductible / 100 : 0;
      annees.push({
        a, ca, autresProduits, produits, achats, chargesExternes, personnel: salaires, va, ebe,
        amortissements: amort, interets: interetsAn, resExploitation, avantImpot, impot, net: avantImpot - impot,
        tvaCollectee, tvaDeductible, tvaSolde: tvaCollectee - tvaDeductible, caTTC: tvaOn ? ca * (1 + tvaTaux / 100) : ca,
      });
    }
    return { regime, tauxImpot, tauxReduit, seuilReduit, reportDeficit, tvaOn, tvaTaux, tvaPartDeductible, annees };
  }

  /* Échéancier MENSUEL d'un emprunt sur `nbMois` mois : tableau [mois 1..nbMois] de
     { interets, capital }. Même convention que calcEcheancierEmprunt (aucune échéance pendant le
     différé ; la mensualité saisie prime sur le calcul PMT). */
  function calcEcheancierMensuel(dette, nbMois) {
    const n = Math.max(0, Math.floor(num(nbMois)));
    const sortie = Array.from({ length: n + 1 }, () => ({ interets: 0, capital: 0 }));
    const montant = num(dette && dette.montant), tauxAnnuel = num(dette && dette.taux);
    const dureeMois = num(dette && dette.duree), differe = Math.max(0, num(dette && dette.differe));
    if (!montant || !dureeMois || dureeMois <= differe) return sortie;
    const mensualite = num(dette.mensualite) > 0 ? num(dette.mensualite) : calcMensualite(montant, tauxAnnuel, dureeMois - differe);
    const tauxMensuel = tauxAnnuel ? tauxAnnuel / 100 / 12 : 0;
    let restant = montant;
    for (let mois = differe + 1; mois <= Math.min(dureeMois, n); mois++) {
      const interet = restant * tauxMensuel;
      const capital = Math.min(restant, Math.max(0, mensualite - interet));
      restant -= capital;
      sortie[mois] = { interets: interet, capital };
    }
    return sortie;
  }

  /* Trésorerie mensuelle sur 36 mois (par défaut), calculée à partir du compte de résultat annuel.
     Hypothèses (toutes réglables dans l'éditeur) :
     - chaque année est répartie sur 12 mois selon la saisonnalité (saison_M1..M12, 1 = mois normal)
       et, en année 1, une montée en charge linéaire sur `montee_en_charge_mois` mois ;
     - les achats suivent les ventes, les autres charges sont lissées sur 12 mois ;
     - les clients règlent après `delai_paiement_clients`, les fournisseurs après
       `delai_paiement_fournisseurs` (jours → mois arrondis) ; loyers et salaires sont payés le mois même ;
     - la TVA du mois est reversée le mois suivant (un crédit de TVA se reporte) ;
     - l'impôt d'une année est payé au 3e mois de l'année suivante ;
     - au mois 1 : encaissement des ressources du plan de financement (les emprunts détaillés
       remplacent le poste « Banque »), décaissement des emplois — sauf le poste « Trésorerie »,
       qui reste en caisse ; puis remboursement mensuel exact des emprunts. */
  function calcTresorerie(pf, nbMois) {
    pf = pf || {};
    const N = Math.max(1, Math.floor(num(nbMois)) || 36);
    const modele = calcModeleFinancier(pf);
    const t = modele.tvaTaux / 100, ded = modele.tvaPartDeductible / 100;
    const dc = Math.max(0, Math.round(parseJours(pf.delai_paiement_clients) / 30));
    const df = Math.max(0, Math.round(parseJours(pf.delai_paiement_fournisseurs) / 30));
    const montee = Math.max(0, Math.round(num(pf.montee_en_charge_mois)));
    const poids = Array.from({ length: 12 }, (_, i) => (has(pf['saison_M' + (i + 1)]) && num(pf['saison_M' + (i + 1)]) >= 0) ? num(pf['saison_M' + (i + 1)]) : 1);
    const parts = annee => {
      const w = poids.map((x, i) => x * (annee === 1 && montee > 0 ? Math.min(1, (i + 1) / montee) : 1));
      const somme = w.reduce((s, x) => s + x, 0);
      return w.map(x => somme > 0 ? x / somme : 1 / 12);
    };
    const tab = () => new Array(N + 1).fill(0);
    const clients = tab(), autresProduits = tab(), apports = tab(), emprunts = tab(), fournisseurs = tab(), loyers = tab(), salaires = tab(),
      tva = tab(), impots = tab(), remboursements = tab(), investissements = tab();
    const tvaDue = tab(); // TVA à régler, mois par mois (avant décalage)

    for (let m = 1; m <= N; m++) {
      const an = Math.ceil(m / 12), idx = (m - 1) % 12;
      const y = modele.annees[an - 1];
      if (!y) continue;
      const part = parts(an)[idx];
      const ventesHT = y.ca * part, achats = y.achats * part;
      const flat = v => v / 12;
      const loyer = num(pf['loyers_' + an]) / 12, marketing = num(pf['marketing_charge_' + an]) / 12, autre = num(pf['autres_charges_' + an]) / 12;
      if (m + dc <= N) clients[m + dc] += ventesHT * (1 + t);
      autresProduits[m] += flat(y.autresProduits);
      const fournisseursHT = achats + marketing + autre;
      if (m + df <= N) fournisseurs[m + df] += fournisseursHT * (1 + t * ded);
      loyers[m] += loyer * (1 + t * ded);
      salaires[m] += flat(y.personnel);
      tvaDue[m] = ventesHT * t - (fournisseursHT + loyer) * t * ded;
    }
    let credit = 0;
    for (let m = 1; m < N; m++) {
      const solde = tvaDue[m] + credit;
      if (solde > 0) { tva[m + 1] += solde; credit = 0; } else credit = solde;
    }
    for (let an = 1; an <= Math.floor(N / 12); an++) {
      const mois = an * 12 + 3;
      if (mois <= N && modele.annees[an - 1]) impots[mois] += modele.annees[an - 1].impot;
    }
    // Mois 1 : ressources et emplois du plan de financement.
    const dettes = pf.dettes || [];
    const totalDettes = dettes.reduce((s, d) => s + num(d.montant), 0);
    const ressources = RESSOURCES_PF.filter(k => !(k === 'pf_banque' && totalDettes > 0)).reduce((s, k) => s + num(pf[k]), 0);
    const emplois = EMPLOIS_PF.filter(k => k !== 'pf_tresorerie').reduce((s, k) => s + num(pf[k]), 0);
    const planVide = RESSOURCES_PF.concat(EMPLOIS_PF).every(k => !num(pf[k]));
    apports[1] += planVide ? num(pf.apport_personnel) + (totalDettes > 0 ? 0 : num(pf.financement_recherche)) : ressources;
    investissements[1] += planVide ? num(pf.investissement_initial) : emplois;
    dettes.forEach(d => {
      emprunts[1] += num(d.montant);
      const ech = calcEcheancierMensuel(d, N);
      for (let m = 1; m <= N; m++) remboursements[m] += ech[m].capital + ech[m].interets;
    });

    const mois = [];
    let cumul = 0, min = Infinity, moisMin = 0, premierNegatif = 0;
    for (let m = 1; m <= N; m++) {
      const encaissements = clients[m] + autresProduits[m] + apports[m] + emprunts[m];
      const decaissements = fournisseurs[m] + loyers[m] + salaires[m] + tva[m] + impots[m] + remboursements[m] + investissements[m];
      const flux = encaissements - decaissements;
      cumul += flux;
      if (cumul < min) { min = cumul; moisMin = m; }
      if (!premierNegatif && cumul < -0.5) premierNegatif = m;
      mois.push({
        m, annee: Math.ceil(m / 12), clients: clients[m], autresProduits: autresProduits[m], apports: apports[m], emprunts: emprunts[m],
        encaissements, fournisseurs: fournisseurs[m], loyers: loyers[m], salaires: salaires[m], tva: tva[m], impots: impots[m],
        remboursements: remboursements[m], investissements: investissements[m], decaissements, flux, tresorerie: cumul,
      });
    }
    return {
      mois, delaiClientsMois: dc, delaiFournisseursMois: df,
      minimum: min, moisMinimum: moisMin, premierMoisNegatif: premierNegatif,
      besoinComplementaire: Math.max(0, -min),
      finAn1: mois[Math.min(11, N - 1)].tresorerie, finAn2: N >= 24 ? mois[23].tresorerie : null, fin: cumul,
    };
  }

  return { calcAmortissementAnnuel, calcInteretsParAnnee, calcMensualite, calcEcheancierEmprunt, calcDilution, calcScenariosFinancement, calcBFR, detecterIncoherences,
    parseJours, calcModeleFinancier, calcEcheancierMensuel, calcTresorerie, REGIMES, TAUX_IMPOT_DEFAUT };
});

/* ═══════════════════════════════════════════════════════════════════
   business-plan-excel.js — Diaspo'Actif (2026-10-18)
   Export et import Excel du modèle financier d'un business plan.

   - construireClasseur(XLSX, pf, opts) : fabrique le classeur (une feuille par partie du modèle,
     avec de vraies formules pour les totaux et les résultats).
   - lireClasseur(XLSX, wb, pf, opts)   : relit un classeur du même format et renvoie ce qu'il faut
     écrire dans `plan_financier`, sans rien modifier lui-même.

   Les feuilles « Hypothèses », « Compte de résultat », « Plan de financement »,
   « Immobilisations », « Emprunts » et « Trésorerie 12 mois » sont réimportables (la colonne A,
   masquée, porte la clé technique de chaque ligne). « Trésorerie 36 mois » est calculée : exportée
   pour lecture, jamais relue. Seules les clés connues sont lues (liste blanche) ; une valeur qui
   n'est pas un nombre valide est ignorée et signalée.

   La bibliothèque SheetJS (XLSX) est passée en paramètre : chargée à la demande côté navigateur,
   injectée par le test côté Node. opts : { PF_RESSOURCES, PF_EMPLOIS, CF_ENTREES, CF_SORTIES,
   BPCalc, nomProjet, devise } — les listes de libellés viennent de l'éditeur pour n'exister
   qu'à un seul endroit.
   ═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPExcel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  const norm = s => String(s === undefined || s === null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  const MOIS12 = Array.from({ length: 12 }, (_, i) => 'M' + (i + 1));
  const LIGNES_CR = [['ca', "Chiffre d'affaires"], ['autres_produits', 'Autres produits'], ['achats', 'Achats & matières'], ['salaires', 'Salaires & charges'],
    ['loyers', 'Loyers & immobilier'], ['marketing_charge', 'Marketing & communication'], ['autres_charges', 'Autres charges']];

  // [clé, libellé, aide, type] — type : 'nombre' | 'texte' | 'jours' | 'regime' | 'ouinon'
  const HYPOTHESES = [
    ['regime_fiscal', 'Régime fiscal', 'is = impôt sur les sociétés · ir = impôt sur le revenu · micro = micro-entreprise · exonere = exonéré (association…) · vide = pas d\'impôt calculé', 'regime'],
    ['taux_impot', 'Taux d\'impôt (%)', 'Vide = taux indicatif du régime (IS 25 %, IR 15 %, micro 12,3 %)', 'nombre'],
    ['is_taux_reduit', 'IS : taux réduit (%)', 'Facultatif — taux réduit jusqu\'au plafond ci-dessous', 'nombre'],
    ['is_seuil_reduit', 'IS : plafond du taux réduit (bénéfice)', 'Facultatif', 'nombre'],
    ['report_deficit', 'Report des déficits', 'oui (par défaut) ou non', 'ouinon'],
    ['tva_assujetti', 'Assujetti à la TVA', 'oui ou non — les montants saisis sont HORS TAXE', 'ouinon'],
    ['tva_taux', 'Taux de TVA (%)', 'Vide = 20 %', 'nombre'],
    ['tva_part_deductible', 'Part des achats et charges ouvrant droit à déduction de TVA (%)', 'Vide = 100 %', 'nombre'],
    ['delai_paiement_clients', 'Délai de paiement des clients (jours)', 'Décale les encaissements', 'jours'],
    ['delai_paiement_fournisseurs', 'Délai de paiement des fournisseurs (jours)', 'Décale les décaissements', 'jours'],
    ['montee_en_charge_mois', 'Montée en charge de l\'année 1 (mois)', 'Les ventes montent progressivement pendant N mois (0 = aucune)', 'nombre'],
  ].concat(MOIS12.map(m => ['saison_' + m, 'Saisonnalité : poids du mois ' + m.slice(1), '1 = mois normal, 2 = deux fois plus de ventes, 0,5 = deux fois moins', 'nombre']))
    .concat([
      ['investissement_initial', 'Investissement total requis', '', 'nombre'],
      ['apport_personnel', 'Apport personnel / fonds propres', '', 'nombre'],
      ['financement_recherche', 'Financement externe recherché', '', 'nombre'],
      ['stock_moyen_valeur', 'Stock moyen (valeur)', '', 'nombre'],
      ['creances_clients', 'Créances clients', '', 'nombre'],
      ['dettes_fournisseurs', 'Dettes fournisseurs', '', 'nombre'],
      ['point_mort', 'Point mort (nombre de mois)', '', 'nombre'],
      ['seuil_rentabilite', 'Seuil de rentabilité (CA)', '', 'nombre'],
    ]);

  const IMMOBILISATIONS = [['nom', 'Désignation', 'texte'], ['montant', 'Montant', 'nombre'], ['date_achat', "Date d'achat (AAAA-MM-JJ)", 'date'],
    ['duree_amortissement', "Durée d'amortissement (ans)", 'nombre'], ['valeur_residuelle', 'Valeur résiduelle', 'nombre']];
  const EMPRUNTS = [['nom', 'Désignation', 'texte'], ['montant', 'Montant', 'nombre'], ['taux', 'Taux (%)', 'nombre'], ['duree', 'Durée (mois)', 'nombre'],
    ['differe', 'Différé (mois)', 'nombre'], ['mensualite', 'Mensualité', 'nombre'], ['date_debut', 'Date de début (AAAA-MM-JJ)', 'date'], ['date_fin', 'Date de fin (AAAA-MM-JJ)', 'date']];

  const colLettre = i => { let s = '', n = i + 1; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
  const arrondi = v => Math.round(v * 100) / 100;
  const cellule = (v, f) => (f ? { t: 'n', v: arrondi(v), f } : v);

  function valeurHypothese(pf, cle, type, BPCalc) {
    const v = pf[cle];
    if (!has(v)) return '';
    if (type === 'jours') { const j = BPCalc ? BPCalc.parseJours(v) : num(v); return j || ''; }
    if (type === 'nombre') return num(v);
    return String(v);
  }

  function construireClasseur(XLSX, pf, opts) {
    pf = pf || {}; opts = opts || {};
    const { PF_RESSOURCES = [], PF_EMPLOIS = [], CF_ENTREES = [], CF_SORTIES = [], BPCalc } = opts;
    const wb = XLSX.utils.book_new();
    const modele = BPCalc ? BPCalc.calcModeleFinancier(pf) : null;
    const ajouter = (nom, rows, largeurs, cacherA) => {
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = (largeurs || []).map((w, i) => (i === 0 && cacherA ? { hidden: true, wch: 8 } : { wch: w }));
      XLSX.utils.book_append_sheet(wb, ws, nom);
      return ws;
    };

    ajouter('Lisez-moi', [
      ['Modèle financier — ' + (opts.nomProjet || 'Business plan')],
      ['Exporté depuis Diaspo\'Actif. Montants en ' + (opts.devise || 'devise du projet') + ', hors taxe.'],
      [''],
      ['Comment l\'utiliser'],
      ['1. Modifiez les cellules de saisie des feuilles : Hypothèses, Compte de résultat, Plan de financement, Immobilisations, Emprunts, Trésorerie 12 mois.'],
      ['2. Les lignes de totaux et de résultats sont des formules : ne les écrasez pas.'],
      ['3. De retour dans Diaspo\'Actif (Plan financier), cliquez sur « Importer un fichier Excel » : les valeurs saisies sont relues.'],
      ['4. La feuille « Trésorerie 36 mois » est calculée par Diaspo\'Actif : elle sert à la lecture et n\'est pas relue.'],
      ['5. Une colonne A masquée contient les clés techniques : ne la supprimez pas et ne changez pas l\'ordre des feuilles saisies.'],
      ['6. Une cellule laissée vide n\'efface rien dans le plan ; tapez 0 pour mettre un montant à zéro.'],
    ], [120], false);

    // ── Hypothèses ──
    ajouter('Hypothèses', [['Clé', 'Paramètre', 'Valeur', 'Aide']].concat(
      HYPOTHESES.map(([k, l, aide, type]) => [k, l, valeurHypothese(pf, k, type, BPCalc), aide])), [8, 62, 18, 90], true);

    // ── Compte de résultat ──
    const cr = [['Clé', 'Ligne', 'An 1', 'An 2', 'An 3', 'An 4', 'An 5']];
    LIGNES_CR.forEach(([k, l]) => cr.push([k, l].concat([1, 2, 3, 4, 5].map(a => (has(pf[k + '_' + a]) ? num(pf[k + '_' + a]) : '')))));
    // lignes 2..8 = saisie ; 10.. = calculé
    const ligne = (label, fn, formule) => ['', label].concat([1, 2, 3, 4, 5].map((_, i) => {
      const y = modele ? modele.annees[i] : null;
      return cellule(y ? fn(y) : 0, formule ? formule(colLettre(i + 2)) : null);
    }));
    cr.push([''], ['', 'Calculé — ne pas modifier']);
    cr.push(ligne('Total produits', y => y.produits, c => `${c}2+${c}3`));              // ligne 11
    cr.push(ligne('Total charges d\'exploitation', y => y.achats + y.chargesExternes + y.personnel, c => `SUM(${c}4:${c}8)`)); // 12
    cr.push(ligne('Amortissements (depuis Immobilisations)', y => y.amortissements));  // 13
    cr.push(ligne('Intérêts d\'emprunt (depuis Emprunts)', y => y.interets));          // 14
    cr.push(ligne('Résultat avant impôt', y => y.avantImpot, c => `${c}11-${c}12-${c}13-${c}14`)); // 15
    cr.push(ligne('Impôt ou cotisations forfaitaires', y => y.impot));                 // 16
    cr.push(ligne('RÉSULTAT NET', y => y.net, c => `${c}15-${c}16`));                  // 17
    cr.push(['']);
    cr.push(ligne('TVA collectée', y => y.tvaCollectee));
    cr.push(ligne('TVA déductible', y => y.tvaDeductible));
    cr.push(ligne('TVA à reverser (solde)', y => y.tvaSolde));
    cr.push(ligne('Chiffre d\'affaires TTC', y => y.caTTC));
    ajouter('Compte de résultat', cr, [8, 48, 16, 16, 16, 16, 16], true);

    // ── Plan de financement ──
    const pfRows = [['Clé', 'Poste', 'Montant'], ['', 'RESSOURCES', '']];
    PF_RESSOURCES.forEach(([k, l]) => pfRows.push([k, l, has(pf[k]) ? num(pf[k]) : '']));
    const r1 = 3, r2 = 2 + PF_RESSOURCES.length;
    const totalRess = PF_RESSOURCES.reduce((s, [k]) => s + num(pf[k]), 0);
    pfRows.push(['', 'Total ressources', cellule(totalRess, `SUM(C${r1}:C${r2})`)]);
    const idxTotRess = pfRows.length;
    pfRows.push(['', 'EMPLOIS', '']);
    const e1 = pfRows.length + 1;
    PF_EMPLOIS.forEach(([k, l]) => pfRows.push([k, l, has(pf[k]) ? num(pf[k]) : '']));
    const e2 = pfRows.length;
    const totalEmp = PF_EMPLOIS.reduce((s, [k]) => s + num(pf[k]), 0);
    pfRows.push(['', 'Total emplois', cellule(totalEmp, `SUM(C${e1}:C${e2})`)]);
    pfRows.push(['', 'Écart (ressources − emplois, doit être 0)', cellule(totalRess - totalEmp, `C${idxTotRess}-C${pfRows.length}`)]);
    ajouter('Plan de financement', pfRows, [8, 48, 18], true);

    // ── Immobilisations / Emprunts ──
    const listeVersLignes = (liste, def) => (liste || []).filter(x => x && Object.keys(x).some(k => has(x[k]))).map(x => def.map(([k, , type]) => (type === 'nombre' ? (has(x[k]) ? num(x[k]) : '') : (x[k] || ''))));
    const immo = [IMMOBILISATIONS.map(d => d[1]).concat(['Amortissement annuel (calculé)'])];
    listeVersLignes(pf.immobilisations_liste, IMMOBILISATIONS).forEach((l, i) => {
      const montant = num(l[1]), duree = num(l[3]), residuel = num(l[4]);
      immo.push(l.concat([cellule(duree > 0 ? Math.max(0, montant - residuel) / duree : 0, `IF(D${i + 2}>0,MAX(0,B${i + 2}-E${i + 2})/D${i + 2},0)`)]));
    });
    ajouter('Immobilisations', immo, [40, 16, 24, 26, 18, 28], false);
    const emp = [EMPRUNTS.map(d => d[1])];
    listeVersLignes(pf.dettes, EMPRUNTS).forEach(l => emp.push(l));
    ajouter('Emprunts', emp, [40, 16, 12, 14, 14, 16, 26, 26], false);

    // ── Trésorerie 12 mois (saisie) ──
    const t12 = [['Clé', 'Poste'].concat(MOIS12), ['', 'ENTRÉES']];
    const ligneCF = ([k, l]) => ['cf_' + k, l].concat(MOIS12.map(m => (has(pf['cf_' + k + '_' + m]) ? num(pf['cf_' + k + '_' + m]) : '')));
    const eDeb = t12.length + 1;
    CF_ENTREES.forEach(c => t12.push(ligneCF(c)));
    const eFin = t12.length;
    t12.push(['', 'SORTIES']);
    const sDeb = t12.length + 1;
    CF_SORTIES.forEach(c => t12.push(ligneCF(c)));
    const sFin = t12.length;
    const fluxM = m => CF_ENTREES.reduce((s, [k]) => s + num(pf['cf_' + k + '_' + m]), 0) - CF_SORTIES.reduce((s, [k]) => s + num(pf['cf_' + k + '_' + m]), 0);
    const rFlux = t12.length + 1;
    t12.push(['', 'Flux net du mois'].concat(MOIS12.map((m, i) => { const c = colLettre(i + 2); return cellule(fluxM(m), `SUM(${c}${eDeb}:${c}${eFin})-SUM(${c}${sDeb}:${c}${sFin})`); })));
    let cumul = 0;
    t12.push(['', 'Trésorerie finale'].concat(MOIS12.map((m, i) => {
      cumul += fluxM(m); const c = colLettre(i + 2), p = colLettre(i + 1);
      return cellule(cumul, i === 0 ? `${c}${rFlux}` : `${p}${rFlux + 1}+${c}${rFlux}`);
    })));
    ajouter('Trésorerie 12 mois', t12, [8, 28].concat(MOIS12.map(() => 12)), true);

    // ── Trésorerie 36 mois (calculée, non relue) ──
    if (BPCalc) {
      const tr = BPCalc.calcTresorerie(pf, 36);
      const mois = tr.mois;
      const rows = [['Poste (calculé par Diaspo\'Actif — non réimporté)'].concat(mois.map(m => 'M' + m.m))];
      const L = (label, cle) => rows.push([label].concat(mois.map(m => arrondi(m[cle]))));
      L('Encaissements clients', 'clients'); L('Autres produits', 'autresProduits'); L('Apports et ressources', 'apports'); L('Emprunts encaissés', 'emprunts');
      L('TOTAL ENCAISSEMENTS', 'encaissements');
      L('Fournisseurs et charges', 'fournisseurs'); L('Loyers', 'loyers'); L('Salaires et charges', 'salaires'); L('TVA reversée', 'tva'); L('Impôts', 'impots');
      L('Remboursement des emprunts', 'remboursements'); L('Investissements', 'investissements');
      L('TOTAL DÉCAISSEMENTS', 'decaissements'); L('Flux net du mois', 'flux'); L('TRÉSORERIE EN FIN DE MOIS', 'tresorerie');
      ajouter('Trésorerie 36 mois', rows, [44].concat(mois.map(() => 12)), false);
    }
    return wb;
  }

  // ── Lecture ──
  function nombreOuNull(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
    if (s === '' || !/^[-+]?\d*\.?\d+(e[-+]?\d+)?$/i.test(s)) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }
  const texteCourt = v => String(v).trim().slice(0, 200);
  function dateIso(v) {
    if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10); }
    const s = String(v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }

  function lireClasseur(XLSX, wb, pfActuel, opts) {
    pfActuel = pfActuel || {}; opts = opts || {};
    const { PF_RESSOURCES = [], PF_EMPLOIS = [], CF_ENTREES = [], CF_SORTIES = [], BPCalc } = opts;
    const valeurs = {}, avertissements = [], resume = {};
    const feuille = nom => { const n = (wb.SheetNames || []).find(x => norm(x) === norm(nom)); return n ? wb.Sheets[n] : null; };
    const lignes = ws => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
    const vide = v => v === '' || v === null || v === undefined;

    // Feuilles à clé en colonne A : valeurs en colonnes C…
    const lireCles = (nomFeuille, clesAutorisees, colonnes, cible) => {
      const ws = feuille(nomFeuille); if (!ws) return 0;
      let n = 0;
      lignes(ws).forEach((row, i) => {
        if (i === 0) return;
        const cle = String(row[0] || '').trim();
        if (!cle || !Object.prototype.hasOwnProperty.call(clesAutorisees, cle)) return;
        colonnes(row, cle).forEach(([cleFinale, brut, type]) => {
          if (vide(brut)) return;
          const v = lireValeur(brut, type, cleFinale, nomFeuille, i + 1);
          if (v !== undefined) { cible[cleFinale] = v; n++; }
        });
      });
      return n;
    };
    const lireValeur = (brut, type, cle, nomFeuille, ligneNum) => {
      if (type === 'nombre') {
        const n = nombreOuNull(brut);
        if (n === null) { avertissements.push(`${nomFeuille}, ligne ${ligneNum} : « ${texteCourt(brut)} » n'est pas un nombre — ignoré.`); return undefined; }
        return String(n);
      }
      if (type === 'jours') {
        const n = nombreOuNull(brut);
        if (n === null || n < 0) { avertissements.push(`${nomFeuille}, ligne ${ligneNum} : délai « ${texteCourt(brut)} » invalide — ignoré.`); return undefined; }
        const actuel = BPCalc ? BPCalc.parseJours(pfActuel[cle]) : null;
        return actuel === n ? undefined : `${n} jours`;
      }
      if (type === 'regime') {
        const s = norm(brut);
        const table = { is: 'is', societe: 'is', 'impot sur les societes': 'is', ir: 'ir', 'impot sur le revenu': 'ir', micro: 'micro', 'micro-entreprise': 'micro', exonere: 'exonere', exoneree: 'exonere', association: 'exonere', aucun: '' , non: '' };
        if (!Object.prototype.hasOwnProperty.call(table, s)) { avertissements.push(`${nomFeuille}, ligne ${ligneNum} : régime « ${texteCourt(brut)} » inconnu (is, ir, micro, exonere) — ignoré.`); return undefined; }
        return table[s];
      }
      if (type === 'ouinon') {
        const s = norm(brut);
        if (['oui', 'o', 'yes', '1', 'vrai', 'true'].includes(s)) return 'oui';
        if (['non', 'n', 'no', '0', 'faux', 'false'].includes(s)) return 'non';
        avertissements.push(`${nomFeuille}, ligne ${ligneNum} : « ${texteCourt(brut)} » — répondre oui ou non — ignoré.`); return undefined;
      }
      return texteCourt(brut);
    };
    const mapType = {}; HYPOTHESES.forEach(([k, , , t]) => { mapType[k] = t; });

    resume.hypotheses = lireCles('Hypothèses', mapType, (row, cle) => [[cle, row[2], mapType[cle]]], valeurs);
    const clesCR = {}; LIGNES_CR.forEach(([k]) => { clesCR[k] = 1; });
    resume.resultat = lireCles('Compte de résultat', clesCR, (row, cle) => [1, 2, 3, 4, 5].map(a => [cle + '_' + a, row[1 + a], 'nombre']), valeurs);
    const clesPF = {}; PF_RESSOURCES.concat(PF_EMPLOIS).forEach(([k]) => { clesPF[k] = 1; });
    resume.financement = lireCles('Plan de financement', clesPF, (row, cle) => [[cle, row[2], 'nombre']], valeurs);
    const clesCF = {}; CF_ENTREES.concat(CF_SORTIES).forEach(([k]) => { clesCF['cf_' + k] = 1; });
    resume.tresorerie = lireCles('Trésorerie 12 mois', clesCF, (row, cle) => MOIS12.map((m, i) => [cle + '_' + m, row[2 + i], 'nombre']), valeurs);

    const lireListe = (nomFeuille, def) => {
      const ws = feuille(nomFeuille); if (!ws) return null;
      const out = [];
      lignes(ws).forEach((row, i) => {
        if (i === 0) return;
        const item = {};
        def.forEach(([k, , type], c) => {
          const brut = row[c];
          if (vide(brut)) return;
          if (type === 'nombre') { const n = nombreOuNull(brut); if (n === null) avertissements.push(`${nomFeuille}, ligne ${i + 1} : « ${texteCourt(brut)} » n'est pas un nombre — ignoré.`); else item[k] = String(n); }
          else if (type === 'date') { const d = dateIso(brut); if (d === null) avertissements.push(`${nomFeuille}, ligne ${i + 1} : date « ${texteCourt(brut)} » invalide (AAAA-MM-JJ) — ignorée.`); else item[k] = d; }
          else item[k] = texteCourt(brut);
        });
        if (Object.keys(item).length) out.push(item);
      });
      return out;
    };
    const immobilisations = lireListe('Immobilisations', IMMOBILISATIONS);
    const dettes = lireListe('Emprunts', EMPRUNTS);
    resume.immobilisations = immobilisations ? immobilisations.length : 0;
    resume.emprunts = dettes ? dettes.length : 0;

    const total = Object.values(resume).reduce((s, n) => s + n, 0);
    return { valeurs, immobilisations, dettes, resume, avertissements, total };
  }

  return { construireClasseur, lireClasseur, HYPOTHESES, LIGNES_CR, IMMOBILISATIONS, EMPRUNTS };
});

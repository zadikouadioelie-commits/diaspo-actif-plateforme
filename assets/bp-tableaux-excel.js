/* ═══════════════════════════════════════════════════════════════════
   bp-tableaux-excel.js — Diaspo'Actif (2026-11-11)
   Excel pour TOUS les tableaux d'un business plan : modèle vide à remplir, export des données
   actuelles, import (remplacer ou ajouter à la suite).

   Un « tableau » = une liste de lignes saisies dans l'éditeur (concurrents, risques, postes RH,
   campagnes, objectifs SMART, etc.). Le registre est fabriqué ici pour les listes historiques et
   lu dans BPEnrichi pour les listes des rubriques enrichies ; le prévisionnel détaillé est un
   tableau « à plat » (une ligne = une ligne de section).

   Parties pures (testées sans Excel) : registre, lignesVersAoa, aoaVersLignes, appliquer.
   Parties qui touchent la bibliothèque SheetJS (passée en paramètre, chargée par l'éditeur) :
   construireClasseur, lireClasseur.

   Règles : liste blanche des colonnes (seules les colonnes connues sont lues) ; valeur invalide =
   cellule ignorée et signalée, jamais d'invention ; une cellule vide n'efface rien d'autre que
   la cellule elle-même ; 500 lignes maximum par tableau ; aucun calcul n'est importé (les
   colonnes calculées par l'éditeur ne figurent pas dans les modèles).
   Module UMD : window.BPTableauxExcel / require().
   ═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPTableauxExcel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_LIGNES = 500, MAX_TEXTE = 2000;
  const norm = s => String(s === undefined || s === null ? '' : s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const vide = v => v === undefined || v === null || String(v).trim() === '';
  const nombreOuNull = v => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (vide(v)) return null;
    const n = parseFloat(String(v).replace(/[\s  ]/g, '').replace('%', '').replace(',', '.'));
    return Number.isFinite(n) && /^[-+]?[\d.,\s  ]+%?$/.test(String(v).trim()) ? n : null;
  };
  const pad = n => String(n).padStart(2, '0');
  /* Date saisie dans Excel → « AAAA-MM-JJ » ; accepte ISO, JJ/MM/AAAA, numéro de série Excel, objet Date. */
  function dateIso(v) {
    if (vide(v)) return '';
    /* +12 h : les dates lues par SheetJS peuvent être décalées de quelques minutes ou heures selon le fuseau. */
    if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 12 * 3600000); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    if (typeof v === 'number' && v > 20000 && v < 80000) { const d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
    const s = String(v).trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/))) return m[3] + '-' + pad(m[2]) + '-' + pad(m[1]);
    return null;
  }

  /* ── Colonnes : N nombre, D date, T texte, C choix [[valeur, libellé], …] ── */
  const T = (k, l) => ({ k, l, t: 'texte' });
  const N = (k, l) => ({ k, l, t: 'nombre' });
  const D = (k, l) => ({ k, l, t: 'date' });
  const C = (k, l, opts) => ({ k, l, t: 'choix', opts: opts.map(o => (Array.isArray(o) ? o : [o, o])) });
  const NIV = [['faible', 'Faible'], ['moyen', 'Moyen'], ['eleve', 'Élevé'], ['critique', 'Critique']];
  const STAT_DONNEE = [['verifie', 'Vérifié'], ['a_verifier', 'À vérifier'], ['hypothese', 'Hypothèse']];

  /* Listes historiques de l'éditeur : [rubrique, clé du tableau dans la rubrique, titre, colonnes, options]. */
  const HISTORIQUES = [
    ['infos_generales', 'membres_equipe', 'Équipe fondatrice', [T('nom', 'Nom'), T('prenom', 'Prénom'), T('fonction', 'Fonction'), C('categorie', 'Catégorie', ['Dirigeant ou associé', 'Équipe', 'Conseil ou expert']), T('formation', 'Formation'), N('annees_experience', "Années d'expérience"),
      T('experience_secteur', 'Expérience dans le secteur'), T('competences_principales', 'Compétences principales'), T('experiences_entrepreneuriales', 'Expériences entrepreneuriales'), T('realisations', 'Réalisations'),
      C('disponibilite', 'Disponibilité', [['temps_plein', 'Temps plein'], ['temps_partiel', 'Temps partiel'], ['ponctuel', 'Ponctuel']]), T('temps_consacre', 'Temps consacré'), T('remuneration_prevue', 'Rémunération prévue'),
      N('participation_capital', 'Part du capital (%)'), T('responsabilites', 'Responsabilités'), T('linkedin', 'LinkedIn'), T('cv_url', 'CV (lien)'), T('competences_manquantes', 'Compétences manquantes')], { id: true }],
    ['marche', 'segments_clients', 'Segments de clientèle', [T('nom_segment', 'Segment'), N('nb_potentiel_clients', 'Clients potentiels'), T('profil', 'Profil'), T('age', 'Âge'), T('localisation', 'Localisation'),
      T('besoin', 'Besoin'), T('budget', 'Budget'), T('panier_moyen', 'Panier moyen'), T('frequence_achat', "Fréquence d'achat"), T('criteres_decision', 'Critères de décision'),
      T('comportement_achat', "Comportement d'achat"), T('canal_achat', "Canal d'achat"), N('priorite', 'Priorité (0 à 100)')]],
    ['marche', 'concurrents', 'Concurrents', [T('nom', 'Concurrent'), C('type', 'Type', [['direct', 'Concurrent direct'], ['indirect', 'Concurrent indirect'], ['substitut', 'Substitut']]), T('localisation', 'Localisation'),
      T('produits', 'Produits'), T('prix', 'Prix'), C('positionnement', 'Positionnement', [['low_cost', 'Low cost'], ['moyen', 'Moyen'], ['premium', 'Premium']]), T('forces', 'Forces'), T('faiblesses', 'Faiblesses'),
      T('parts_marche', 'Part de marché'), N('menace', 'Niveau de menace (0 à 100)'), T('nb_clients_estime', 'Clients estimés'), T('ca_estime', "CA estimé"), T('anciennete', 'Ancienneté'),
      T('presence_geographique', 'Présence géographique'), T('canaux_distribution', 'Canaux de distribution'), T('prix_kg', 'Prix au kg'), T('origine_produits', 'Origine des produits'),
      T('certifications', 'Certifications'), T('tracabilite', 'Traçabilité'), C('statut_donnee', 'Statut de la donnée', STAT_DONNEE), T('reputation', 'Réputation')]],
    ['business_model', 'partenaires_liste', 'Partenaires', [T('nom', 'Partenaire'), C('type', 'Type', [['institution', 'Institution'], ['entreprise', 'Entreprise'], ['banque', 'Banque'], ['ong', 'ONG'],
      ['investisseur', 'Investisseur'], ['association', 'Association'], ['autre', 'Autre']]), T('pays', 'Pays'), T('secteur', 'Secteur'), T('role', 'Rôle attendu'),
      C('niveau', 'Niveau', [['faible', 'Faible'], ['moyen', 'Moyen'], ['strategique', 'Stratégique']]), T('contact', 'Contact'), N('interet', 'Intérêt (0 à 100)'), T('commentaire', 'Commentaire')]],
    ['produits', 'items', 'Produits et services', [T('nom', 'Produit ou service'), T('description', 'Description'), N('cout_revient', 'Coût de revient'), N('prix_vente', 'Prix de vente'), T('cycle', 'Cycle de vie'),
      C('bcg_quadrant', 'Matrice BCG', [['vedette', 'Vedette'], ['dilemme', 'Dilemme'], ['vache_lait', 'Vache à lait'], ['poids_mort', 'Poids mort']])]],
    ['produits', 'capacite_exploitation', "Capacité d'exploitation", [T('produit', 'Produit'), T('capacite_actuelle', 'Capacité actuelle'), T('capacite_maximale', 'Capacité maximale'), T('volume_actuel', 'Volume actuel'),
      T('volume_prevu', 'Volume prévu'), T('delai_production', 'Délai de production'), N('cout_logistique', 'Coût logistique'), N('cout_distribution', 'Coût de distribution'), N('taux_marge_brute', 'Taux de marge brute (%)'),
      N('taux_marge_nette', 'Taux de marge nette (%)'), N('taux_retour', 'Taux de retour (%)'), N('taux_defaut', 'Taux de défaut (%)'), T('duree_vie', 'Durée de vie'), T('dependance_fournisseur', 'Dépendance fournisseur'),
      T('saisonnalite', 'Saisonnalité'), T('evolution_prevue', 'Évolution prévue'), N('utilisateurs', 'Utilisateurs'), N('utilisateurs_actifs', 'Utilisateurs actifs'), N('conversion_payant', 'Conversion vers payant (%)'),
      N('churn_numerique', 'Désabonnement (%)'), N('cout_serveur', 'Coût serveur'), N('cout_par_utilisateur', 'Coût par utilisateur'), N('cout_acquisition_numerique', "Coût d'acquisition"), N('arpu', 'Revenu moyen par utilisateur')]],
    ['strategie_marketing', 'campagnes', 'Campagnes et canaux marketing', [T('canal', 'Canal'), N('budget', 'Budget'), T('duree', 'Durée'), T('objectif', 'Objectif'), N('prospects', 'Prospects'),
      N('conversions', 'Conversions'), C('statut_donnee', 'Statut de la donnée', [['objectif', 'Objectif'], ['hypothese', 'Hypothèse'], ['constate', 'Constaté']])]],
    ['rh', 'postes', 'Postes et recrutements', [T('intitule', 'Poste'), N('nb_personnes', 'Nombre de personnes'), T('mission', 'Mission'), T('competences', 'Compétences'), T('niveau_experience', "Niveau d'expérience"),
      N('salaire_brut', 'Salaire brut annuel'), N('charges', 'Charges patronales'), D('date_recrutement', 'Date de recrutement'), C('temps', 'Temps de travail', [['plein', 'Temps plein'], ['partiel', 'Temps partiel']]),
      T('localisation', 'Localisation'), T('formation_necessaire', 'Formation nécessaire')]],
    ['calendrier', 'phases', 'Phases du calendrier', [T('nom', 'Phase'), D('debut', 'Début'), D('fin', 'Fin'), T('responsable', 'Responsable'),
      C('statut', 'Statut', [['planifie', 'Planifié'], ['en_cours', 'En cours'], ['termine', 'Terminé'], ['retard', 'En retard']]), N('budget', 'Budget'), T('dependances', 'Dépendances'), T('objectif', 'Objectif'),
      T('kpi', 'Indicateur clé'), T('livrable', 'Livrable'), T('risque_associe', 'Risque associé'), T('taches', 'Tâches')]],
    ['plan_financier', 'immobilisations_liste', 'Immobilisations', [T('nom', 'Investissement'), N('montant', 'Montant'), D('date_achat', "Date d'achat"), N('duree_amortissement', "Durée d'amortissement (ans)"), N('valeur_residuelle', 'Valeur résiduelle')]],
    ['plan_financier', 'dettes', 'Emprunts', [T('nom', 'Emprunt'), N('montant', 'Montant'), N('taux', 'Taux annuel (%)'), N('duree', 'Durée (mois)'), N('differe', 'Différé (mois)'), N('mensualite', 'Mensualité'),
      D('date_debut', 'Date de début'), D('date_fin', 'Date de fin')]],
    ['plan_financier', 'charges_detaillees', 'Détail des charges', [T('nom', 'Charge'), C('type', 'Type', [['fixe', 'Charge fixe'], ['variable', 'Charge variable']]), N('montant_annuel', 'Montant annuel'), T('commentaire', 'Commentaire')]],
    ['risques', 'items', 'Risques', [T('description', 'Risque'), C('probabilite', 'Probabilité', NIV), C('impact', 'Impact', NIV), T('prevention', 'Prévention'), T('urgence', 'Urgence'), T('responsable', 'Responsable'),
      N('cout_potentiel', 'Coût potentiel'), T('indicateur_alerte', "Indicateur d'alerte"), C('risque_residuel', 'Risque résiduel', NIV)]],
    ['impact', 'indicateurs', "Indicateurs d'impact", [T('nom', 'Indicateur'), T('situation_initiale', 'Situation initiale'), T('valeur_actuelle', 'Valeur actuelle'), T('objectif', 'Objectif'),
      T('valeur_cible', 'Valeur cible'), T('methode_mesure', 'Méthode de mesure'), T('frequence_mesure', 'Fréquence de mesure')]],
    ['financement', 'utilisation_postes', 'Utilisation des fonds', [T('poste', 'Poste'), N('montant', 'Montant'), N('pourcentage', 'Part (%)')]],
  ];

  /* Prévisionnel détaillé : tableau à plat, une ligne par ligne de section. */
  function tablePrevision(P) {
    const freq = (P && P.FREQUENCES || []).map(f => [f[0], f[1]]);
    const postes = [].concat((P && P.POSTES_RECETTE) || [], (P && P.POSTES_DEPENSE) || []).map(p => [p[0], p[1]]);
    return { id: 'plan_financier.prevision', rub: 'plan_financier', k: 'prevision', titre: 'Prévisionnel gains et dépenses', special: 'prevision',
      cols: [T('section', 'Section'), C('nature', 'Nature de la section', [['recette', 'Recette'], ['depense', 'Dépense']]), T('nom', 'Ligne'), C('poste', 'Poste', postes),
        C('frequence', 'Fréquence', freq), N('montant', 'Montant'), N('annee_debut', 'Année de début (1 à 5)'), N('mois_debut', 'Mois de début (1 à 12)'), N('annee_fin', 'Année de fin (1 à 5)'),
        N('croissance_pct', 'Hausse annuelle (%)'), N('v1', 'Année 1 (si « Année par année »)'), N('v2', 'Année 2'), N('v3', 'Année 3'), N('v4', 'Année 4'), N('v5', 'Année 5'), T('note', 'Note')] };
  }

  /* Registre complet des tableaux. BPEnrichi et BPPrevision sont facultatifs. */
  function registre(BPEnrichi, BPPrevision) {
    const out = HISTORIQUES.map(([rub, k, titre, cols, opt]) => ({ id: rub + '.' + k, rub, k, titre, cols, avecId: !!(opt && opt.id) }));
    const vus = new Set(out.map(t => t.id));
    if (BPEnrichi && BPEnrichi.rubriques) {
      BPEnrichi.rubriques().forEach(rub => {
        const key = typeof rub === 'string' ? rub : rub.k || rub.id || rub.cle;
        (BPEnrichi.listes(key) || []).forEach(l => {
          if (l.base || l.fixe || vus.has(key + '.' + l.k)) return;
          const cols = (l.cols || []).map(c => c.t === 'choix' ? C(c.k, c.l, c.opts || []) : c.t === 'nombre' ? N(c.k, c.l) : c.t === 'date' ? D(c.k, c.l) : T(c.k, c.l));
          if (!cols.length) return;
          out.push({ id: key + '.' + l.k, rub: key, k: l.k, titre: l.titre, cols, enrichi: true });
          vus.add(key + '.' + l.k);
        });
      });
    }
    if (BPPrevision) out.push(tablePrevision(BPPrevision));
    return out;
  }
  const deRubrique = (tables, rub) => tables.filter(t => t.rub === rub);

  /* ── Lecture des lignes actuelles ── */
  function lignesActuelles(sections, table) {
    sections = sections || {};
    if (table.special === 'prevision') {
      const prev = (sections.plan_financier || {}).prevision || {};
      const rows = [];
      (Array.isArray(prev.sections) ? prev.sections : []).forEach(s => (Array.isArray(s && s.lignes) ? s.lignes : []).forEach(l => rows.push(Object.assign({}, l, { section: s.nom || '', nature: s.nature === 'recette' ? 'recette' : 'depense' }))));
      return rows;
    }
    const r = sections[table.rub] || {};
    return (Array.isArray(r[table.k]) ? r[table.k] : []).filter(x => x && typeof x === 'object');
  }

  /* ── Lignes → tableau de cellules ── */
  function etiquette(col, v) { const o = (col.opts || []).find(x => x[0] === v); return o ? o[1] : v; }
  function cellule(col, v) {
    if (vide(v)) return '';
    if (col.t === 'choix') return etiquette(col, v);
    if (col.t === 'nombre') { const n = nombreOuNull(v); return n === null ? String(v) : n; }
    return String(v);
  }
  function lignesVersAoa(table, rows) {
    return [table.cols.map(c => c.l)].concat((rows || []).map(r => table.cols.map(c => cellule(c, r && r[c.k]))));
  }

  /* ── Tableau de cellules → lignes ── */
  function scoreEntete(table, cellules) {
    const labels = new Set(); table.cols.forEach(c => { labels.add(norm(c.l)); labels.add(norm(c.k)); });
    let n = 0; (cellules || []).forEach(x => { if (!vide(x) && labels.has(norm(x))) n++; });
    return n;
  }
  function indexColonnes(table, entete) {
    const idx = {};
    table.cols.forEach(c => {
      const cibles = [norm(c.l), norm(c.k)];
      const i = (entete || []).findIndex((x, j) => !vide(x) && cibles.includes(norm(x)) && !Object.values(idx).includes(j));
      if (i >= 0) idx[c.k] = i;
    });
    return idx;
  }
  function lireValeur(col, brut) {
    if (vide(brut)) return { v: '' };
    if (col.t === 'nombre') { const n = nombreOuNull(brut); return n === null ? { v: '', err: `« ${String(brut).slice(0, 30)} » n'est pas un nombre` } : { v: String(n) }; }
    if (col.t === 'date') { const d = dateIso(brut); return d === null ? { v: '', err: `« ${String(brut).slice(0, 30)} » n'est pas une date (JJ/MM/AAAA)` } : { v: d }; }
    if (col.t === 'choix') {
      const s = norm(brut), o = (col.opts || []).find(x => norm(x[0]) === s || norm(x[1]) === s);
      return o ? { v: o[0] } : { v: '', err: `« ${String(brut).slice(0, 30)} » n'est pas une valeur autorisée (${(col.opts || []).map(x => x[1]).join(', ')})` };
    }
    return { v: String(brut).trim().slice(0, MAX_TEXTE) };
  }
  /* aoa : tableau de lignes de cellules (première ligne utile = en-têtes). Renvoie { rows, ignorees, lues, entete }. */
  function aoaVersLignes(table, aoa) {
    const out = { rows: [], ignorees: [], lues: 0, entete: false, tronque: false };
    aoa = Array.isArray(aoa) ? aoa : [];
    let h = -1, meilleur = 0;
    for (let i = 0; i < Math.min(6, aoa.length); i++) { const s = scoreEntete(table, aoa[i]); if (s > meilleur) { meilleur = s; h = i; } }
    if (h < 0) return out;
    out.entete = true;
    const idx = indexColonnes(table, aoa[h]);
    for (let i = h + 1; i < aoa.length; i++) {
      const ligne = aoa[i] || [];
      const row = {}; let rempli = false;
      table.cols.forEach(c => {
        if (!(c.k in idx)) return;
        const r = lireValeur(c, ligne[idx[c.k]]);
        if (r.err) out.ignorees.push(`Ligne ${i + 1}, colonne « ${c.l} » : ${r.err}.`);
        if (r.v !== '') { row[c.k] = r.v; rempli = true; }
      });
      if (!rempli) continue;
      if (out.rows.length >= MAX_LIGNES) { out.tronque = true; break; }
      table.cols.forEach(c => { if (!(c.k in row)) row[c.k] = ''; });
      out.rows.push(row);
    }
    out.lues = out.rows.length;
    return out;
  }

  /* ── Écriture dans les sections (renvoie le nombre de lignes présentes après l'opération) ── */
  let cpt = 0;
  const nouvelId = p => { cpt += 1; return p + Date.now().toString(36) + cpt.toString(36) + Math.floor(Math.random() * 1296).toString(36); };
  function appliquer(sections, table, rows, mode, BPPrevision) {
    if (table.special === 'prevision') return appliquerPrevision(sections, rows, mode, BPPrevision);
    if (!sections[table.rub] || typeof sections[table.rub] !== 'object') sections[table.rub] = {};
    const lignes = rows.map(r => table.avecId ? Object.assign({ id: nouvelId('m') }, r) : Object.assign({}, r));
    const actuel = Array.isArray(sections[table.rub][table.k]) ? sections[table.rub][table.k] : [];
    sections[table.rub][table.k] = mode === 'ajouter' ? actuel.concat(lignes) : lignes;
    return sections[table.rub][table.k].length;
  }
  function appliquerPrevision(sections, rows, mode, P) {
    if (!sections.plan_financier || typeof sections.plan_financier !== 'object') sections.plan_financier = {};
    const pf = sections.plan_financier;
    if (!pf.prevision || typeof pf.prevision !== 'object') pf.prevision = { tresorerie_depart: '', sections: [] };
    if (!Array.isArray(pf.prevision.sections)) pf.prevision.sections = [];
    if (mode !== 'ajouter') pf.prevision.sections = [];
    const secs = pf.prevision.sections;
    rows.forEach(r => {
      const nom = String(r.section || '').trim() || (r.nature === 'recette' ? 'Recettes' : 'Dépenses');
      const nature = r.nature === 'recette' ? 'recette' : 'depense';
      let s = secs.find(x => norm(x.nom) === norm(nom) && x.nature === nature);
      if (!s) { s = P ? P.nouvelleSection(nom, nature) : { id: nouvelId('s'), nom, nature, lignes: [] }; s.nom = nom; secs.push(s); }
      const l = { id: nouvelId('l') };
      ['nom', 'poste', 'frequence', 'montant', 'annee_debut', 'mois_debut', 'annee_fin', 'croissance_pct', 'v1', 'v2', 'v3', 'v4', 'v5', 'note'].forEach(k => { l[k] = r[k] === undefined ? '' : r[k]; });
      if (!l.frequence) l.frequence = 'mensuel';
      if (!l.poste) l.poste = nature === 'recette' ? 'ca' : 'autres_charges';
      if (nature === 'recette' && !['ca', 'autres_produits'].includes(l.poste)) l.poste = 'ca';
      if (nature === 'depense' && ['ca', 'autres_produits'].includes(l.poste)) l.poste = 'autres_charges';
      s.lignes.push(l);
    });
    return secs.reduce((n, s) => n + s.lignes.length, 0);
  }

  /* ── Classeurs (SheetJS passé en paramètre) ── */
  const INTERDITS = /[\\\/\?\*\[\]:]/g;
  function nomFeuille(titre, pris) {
    let base = String(titre).replace(INTERDITS, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Tableau';
    let n = base, i = 2;
    while (pris.has(norm(n))) { n = base.slice(0, 28) + ' ' + i; i++; }
    pris.add(norm(n));
    return n;
  }
  /* options : { avecDonnees, sections, nomProjet, devise, titreFichier }. Renvoie { wb, feuilles }. */
  function construireClasseur(XLSX, tables, opts) {
    opts = opts || {};
    const wb = XLSX.utils.book_new();
    const pris = new Set(['lisez moi', 'valeurs autorisees']);
    const aide = [['Tableaux — ' + (opts.nomProjet || 'Business plan')],
      [opts.avecDonnees ? "Ce classeur contient les données actuelles du plan." : 'Ce classeur est un modèle vide à remplir.'],
      [''],
      ["Comment l'utiliser"],
      ["1. Une feuille par tableau. La première ligne porte les titres des colonnes : ne les modifiez pas et ne changez pas leur orthographe."],
      ['2. Remplissez ou corrigez les lignes sous les titres. Une ligne entièrement vide est ignorée. Montants en ' + (opts.devise || 'devise du projet') + ', sans symbole.'],
      ['3. Colonnes à valeurs imposées (Type, Statut, Niveau…) : voir la feuille « Valeurs autorisées ». Dates : JJ/MM/AAAA.'],
      ["4. Dans Diaspo'Actif, ouvrez la rubrique concernée et utilisez « Importer un fichier Excel » : les lignes lues remplacent le tableau ou s'ajoutent à la suite, au choix."],
      ['5. Les colonnes calculées par Diaspo\'Actif (marges, coûts totaux, retours) ne figurent pas ici : elles se recalculent toutes seules.'],
      [''], ['Feuilles de ce classeur']];
    const wsAide = XLSX.utils.aoa_to_sheet(aide);
    wsAide['!cols'] = [{ wch: 130 }];
    XLSX.utils.book_append_sheet(wb, wsAide, 'Lisez-moi');
    const listes = [['Tableau', 'Colonne', 'Valeurs autorisées']];
    const feuilles = [];
    tables.forEach(t => {
      const rows = opts.avecDonnees ? lignesActuelles(opts.sections, t) : [];
      const ws = XLSX.utils.aoa_to_sheet(lignesVersAoa(t, rows));
      ws['!cols'] = t.cols.map(c => ({ wch: Math.max(14, Math.min(40, c.l.length + 4)) }));
      const nom = nomFeuille(t.titre, pris);
      XLSX.utils.book_append_sheet(wb, ws, nom);
      feuilles.push({ id: t.id, feuille: nom });
      aide.push([nom + ' — ' + rows.length + ' ligne(s)']);
      t.cols.filter(c => c.t === 'choix').forEach(c => listes.push([t.titre, c.l, c.opts.map(o => o[1]).join(' · ')]));
    });
    XLSX.utils.sheet_add_aoa(wsAide, aide.slice(11), { origin: 'A12' });
    const wsListes = XLSX.utils.aoa_to_sheet(listes);
    wsListes['!cols'] = [{ wch: 40 }, { wch: 34 }, { wch: 100 }];
    XLSX.utils.book_append_sheet(wb, wsListes, 'Valeurs autorisées');
    return { wb, feuilles };
  }
  /* Lit un classeur : chaque feuille est rattachée au tableau dont les titres de colonnes correspondent le mieux. */
  function lireClasseur(XLSX, wb, tables) {
    const resultats = [], inconnues = [];
    (wb.SheetNames || []).forEach(nom => {
      if (['lisez moi', 'valeurs autorisees'].includes(norm(nom))) return;
      const ws = wb.Sheets[nom];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: false });
      let meilleur = null, score = 0;
      tables.forEach(t => {
        let s = 0; for (let i = 0; i < Math.min(6, aoa.length); i++) s = Math.max(s, scoreEntete(t, aoa[i]));
        if (norm(nom) === norm(t.titre).slice(0, 31).trim()) s += 0.5;
        if (s > score) { score = s; meilleur = t; }
      });
      if (!meilleur || score < Math.min(2, meilleur.cols.length)) { inconnues.push(nom); return; }
      const lu = aoaVersLignes(meilleur, aoa);
      resultats.push(Object.assign({ table: meilleur, feuille: nom }, lu));
    });
    return { resultats, inconnues };
  }

  return { MAX_LIGNES, norm, nombreOuNull, dateIso, registre, deRubrique, lignesActuelles, lignesVersAoa, aoaVersLignes, appliquer, construireClasseur, lireClasseur, nomFeuille };
});

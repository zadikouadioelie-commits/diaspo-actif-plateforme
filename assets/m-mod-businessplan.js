/* ============================================================
   Diaspo'Actif — Version téléphone : module « Business Plans »
   Équivalent téléphone de business-plan.html (liste, création, duplication, suppression),
   business-plan-view.html (consultation) et d'une partie de business-plan-edit.html
   (modification des champs TEXTE d'une étape, sauvegarde par étape).

   Routes : #/businessplan                 liste (mes plans · partagés · exemple de référence)
            #/businessplan/new             création
            #/businessplan/<id>            vue d'ensemble d'un plan
            #/businessplan/<id>/<étape>    consultation / modification d'une étape
            #/businessplan/<id>/score      score détaillé
            #/businessplan/<id>/finances   résumé financier

   Toutes les données viennent de la vraie API (/api/business-plans*). Le plan est stocké côté
   serveur (colonne sections_json) : rien n'est local au navigateur.
   Ce qui reste « sur ordinateur » : tableaux financiers détaillés, listes (produits, risques,
   phases, annexes, dettes, immobilisations…), outils stratégiques, génération du dossier
   PDF/PowerPoint, simulation de présentation et défense par l'IA, transmission à Diaspo'Actif,
   versions, collaborateurs, pièces jointes, médias.
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast } = A;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const MOD = 'Business Plans';
  const API = '/api/business-plans';
  const SKEL = '<div class="sk skc"></div><div class="sk skc"></div>';

  /* ---------- styles propres au module (injectés une seule fois) ---------- */
  if (!document.getElementById('m-mod-businessplan-css')) {
    const st = document.createElement('style');
    st.id = 'm-mod-businessplan-css';
    st.textContent = `
.bpm-f{margin:0 0 14px}.bpm-f:last-child{margin-bottom:0}
.bpm-f h4{margin:0 0 3px;font-size:11.5px;font-weight:800;letter-spacing:.03em;text-transform:uppercase;color:var(--muted)}
.bpm-f p{margin:0;font-size:15px;line-height:1.55;white-space:pre-line;overflow-wrap:anywhere}
.bpm-g{margin:18px 0 10px;font-size:13px;font-weight:800;color:var(--navy)}
.bpm-g:first-child{margin-top:0}
.bpm-mc{border:1px solid var(--border);border-radius:12px;padding:11px 13px;margin:0 0 9px}
.bpm-mc b{display:block;font-size:14.5px;margin-bottom:3px;overflow-wrap:anywhere}
.bpm-mc .bpm-r{font-size:13px;color:var(--muted);margin-top:2px;overflow-wrap:anywhere}
.bpm-mc .bpm-r span{font-weight:700;color:var(--text)}
.bpm-q{border-radius:12px;padding:12px 14px;margin:0 0 9px}
.bpm-q h4{margin:0 0 4px;font-size:12.5px;font-weight:800}
.bpm-q p{margin:0;font-size:14px;line-height:1.5;white-space:pre-line;overflow-wrap:anywhere}
.bpm-lbl{display:block;font-weight:700;font-size:14px;margin:0 0 5px;color:var(--navy)}
.bpm-in{display:block;width:100%;box-sizing:border-box;min-height:46px;padding:11px 13px;border:1px solid var(--border);border-radius:12px;font:inherit;font-size:16px;background:#fff;color:var(--text)}
textarea.bpm-in{min-height:96px;resize:vertical;line-height:1.45}
.bpm-in:focus{outline:2px solid var(--sky);outline-offset:1px}
.bpm-fld{margin:0 0 14px}
.bpm-err{color:var(--red);font-size:13px;min-height:18px;margin:4px 2px 0}
.bpm-tpl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 14px}
.bpm-tp{position:relative;display:block;border:1.5px solid var(--border);border-radius:12px;padding:11px 12px;background:#fff;cursor:pointer;min-height:64px}
.bpm-tp input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
.bpm-tp b{display:block;font-size:14px}.bpm-tp small{display:block;font-size:12px;color:var(--muted);margin-top:2px}
.bpm-tp.on{border-color:var(--navy2);background:var(--orange-l)}
.bpm-tp:focus-within{outline:2px solid var(--sky);outline-offset:1px}
.bpm-foot{display:flex;align-items:center;gap:10px;width:100%}
.bpm-st{flex:1;font-size:13px;color:var(--muted);min-width:0}
.bpm-st.ok{color:var(--green);font-weight:700}.bpm-st.ko{color:var(--red);font-weight:700}
.bpm-note{background:var(--orange-l);border-radius:12px;padding:12px 14px;margin:0 0 12px;font-size:13.5px;line-height:1.5}
.bpm-note b{color:var(--orange-d)}
.bpm-big{font-size:34px;font-weight:800;line-height:1;color:var(--navy)}
.bpm-kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bpm-kpi{background:var(--bg);border-radius:12px;padding:10px 12px;min-width:0}
.bpm-kpi span{display:block;font-size:11.5px;color:var(--muted);font-weight:700}
.bpm-kpi b{display:block;font-size:16px;margin-top:2px;overflow-wrap:anywhere}
.bpm-nav{display:flex;gap:10px;margin:14px 0 4px}.bpm-nav a{flex:1}
.bpm-danger{color:var(--red)!important;border-color:var(--red)!important}
.bpm-yr{border:1px solid var(--border);border-radius:12px;padding:10px 13px;margin:0 0 9px}
.bpm-yr>b{display:block;margin-bottom:4px}
`;
    document.head.appendChild(st);
  }

  /* ---------- petits outils ---------- */
  const has = v => v !== null && v !== undefined && typeof v !== 'object' && String(v).trim() !== '';
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  const isNum = v => has(v) && isFinite(Number(String(v).replace(/\s/g, '').replace(',', '.')));
  const dev = bp => (bp && bp.devise_config && bp.devise_config.reference) || 'EUR';
  const mny = (n, bp) => A.money(n, dev(bp));
  const amount = (v, bp) => isNum(v) ? mny(num(v), bp) : String(v);
  const obj = v => (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
  const arr = v => Array.isArray(v) ? v : [];
  function fdate(s) {
    const p = A.parseDay(s); if (!p) return String(s || '');
    return new Date(p.y, p.m - 1, p.d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }
  /* Date SQLite (UTC, « 2026-08-31 07:39:50 ») → « il y a 3 h » ou « 31 août 2026 ». */
  function since(d) {
    if (!d) return '';
    const t = new Date(String(d).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(d)) ? '' : 'Z'));
    if (isNaN(t)) return '';
    const s = Math.max(0, (Date.now() - t.getTime()) / 1000);
    if (s < 60) return 'à l’instant';
    if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
    if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
    if (s < 7 * 86400) return 'il y a ' + Math.floor(s / 86400) + ' j';
    return t.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  const TYPES = { startup: 'Startup', pme: 'PME', association: 'Association', ong: 'ONG', cooperative: 'Coopérative', social: 'Social', autre: 'Autre' };
  const STATUTS = { brouillon: 'Brouillon', complet: 'Complet', archive: 'Archivé' };
  const STADES = { idee: 'Idée', prototype: 'Prototype / MVP', lancement: 'Lancement', croissance: 'Croissance', expansion: 'Expansion' };
  const ROLES = { proprietaire: 'Propriétaire', lecteur: 'Lecteur', commentateur: 'Commentateur', editeur: 'Éditeur', validateur: 'Validateur' };
  const TRANSMISSION = {
    soumis: 'Transmis à Diaspo’Actif', en_analyse: 'En cours d’analyse', infos_demandees: 'En cours d’analyse',
    retenu: 'Orientation en cours', oriente_partenaire: 'Organisme identifié', mise_en_relation: 'Mise en relation',
    accompagnement: 'Accompagnement en cours', abouti: 'Dossier clôturé', sans_suite: 'Dossier clôturé'
  };
  const NIVEAUX = { faible: 'Faible', moyen: 'Moyen', eleve: 'Élevé', critique: 'Critique' };
  const SECTEURS = ['Agriculture & Agroalimentaire', 'Commerce & Distribution', 'Construction & BTP', 'Culture & Arts', 'Éducation & Formation', 'Énergie & Environnement', 'Finance & Investissement', 'Immobilier', 'Industrie & Manufacture', 'Numérique & Tech', 'Santé & Bien-être', 'Services aux entreprises', 'Social & Solidaire', 'Tourisme & Hôtellerie', 'Transport & Logistique', 'Autre'];
  const MODELES = [
    ['startup', 'Startup', 'Projet tech ou innovant'], ['pme', 'PME', 'Petite / moyenne entreprise'],
    ['association', 'Association', 'Sans but lucratif'], ['ong', 'ONG', 'Projet humanitaire'],
    ['cooperative', 'Coopérative', 'Agriculture, artisanat…'], ['social', 'Social', 'Impact social fort']
  ];

  /* Les 20 étapes du plan, dans l'ordre de l'éditeur du site. */
  const SECTIONS = [
    { key: 'infos_generales', icon: '🏷️', label: 'Informations générales' },
    { key: 'resume_executif', icon: '📄', label: 'Résumé exécutif' },
    { key: 'presentation', icon: '🏢', label: 'Présentation détaillée' },
    { key: 'probleme', icon: '🔍', label: 'Analyse du problème' },
    { key: 'solution', icon: '💡', label: 'Solution proposée' },
    { key: 'marche', icon: '📊', label: 'Étude de marché' },
    { key: 'swot', icon: '⚡', label: 'Analyse SWOT' },
    { key: 'business_model', icon: '🎯', label: 'Business Model Canvas' },
    { key: 'produits', icon: '📦', label: 'Produits et services' },
    { key: 'strategie_marketing', icon: '📢', label: 'Stratégie marketing' },
    { key: 'plan_commercial', icon: '💼', label: 'Plan commercial' },
    { key: 'plan_operationnel', icon: '⚙️', label: 'Plan opérationnel' },
    { key: 'organisation', icon: '🏗️', label: 'Organisation et gouvernance' },
    { key: 'rh', icon: '👥', label: 'Ressources humaines' },
    { key: 'calendrier', icon: '📅', label: 'Calendrier de mise en œuvre' },
    { key: 'plan_financier', icon: '💰', label: 'Plan financier' },
    { key: 'risques', icon: '⚠️', label: 'Analyse des risques' },
    { key: 'impact', icon: '🌱', label: 'Impact' },
    { key: 'financement', icon: '🏦', label: 'Recherche de financement' },
    { key: 'annexes', icon: '📎', label: 'Annexes' }
  ];
  const SEC = Object.fromEntries(SECTIONS.map(s => [s.key, s]));

  /* ---------- libellés des champs texte (repris de business-plan-view.html) ---------- */
  const LABELS = {
    resume_executif: { projet: 'Le projet en bref', probleme: 'Le problème identifié', solution: 'Notre solution', marche: 'Le marché visé', besoins: 'Besoins de financement', objectifs: 'Objectifs' },
    presentation: { vision: 'Vision', mission: 'Mission', valeurs: 'Valeurs', obj_court: 'Objectifs à 12 mois', obj_moyen: 'Objectifs à 1-3 ans', obj_long: 'Objectifs à 3-5 ans', historique: 'Historique du projet', motivations: 'Motivations de l’équipe' },
    probleme: {
      description: 'Le problème', pourquoi: 'Causes', qui_concerne: 'Qui est concerné', ampleur: 'Ampleur', consequences: 'Conséquences actuelles', pourquoi_pas_resolu: 'Pourquoi ce problème n’est pas déjà résolu', preuves: 'Preuves et sources',
      nb_personnes_concernees: 'Nombre de personnes concernées', frequence_probleme: 'Fréquence du problème', cout_probleme: 'Coût du problème', solutions_existantes: 'Solutions actuellement utilisées', cout_solutions_existantes: 'Coût des solutions existantes', limites_solutions_existantes: 'Limites des solutions existantes',
      consequences_financieres: 'Conséquences financières', consequences_sociales: 'Conséquences sociales', consequences_environnementales: 'Conséquences environnementales', resultats_entretiens_clients: 'Résultats d’entretiens clients', nb_personnes_interrogees: 'Nombre de personnes interrogées', resultats_enquetes: 'Résultats d’enquêtes', temoignages_probleme: 'Témoignages'
    },
    solution: {
      description: 'La solution', fonctionnement: 'Fonctionnement', innovation: 'Ce qui est innovant', avantages: 'Avantages pour le client', valeur_ajoutee: 'Valeur ajoutée', differenciants: 'Facteurs différenciants',
      niveau_developpement: 'Niveau de développement', date_prototype: 'Date du prototype', nb_tests: 'Nombre de tests réalisés', nb_utilisateurs_test: 'Utilisateurs testeurs', resultats_tests_solution: 'Résultats des tests', taux_satisfaction: 'Taux de satisfaction', ameliorations_prevues: 'Améliorations prévues',
      cout_developpement: 'Coût de développement', cout_production: 'Coût de production', certification_necessaire: 'Certification nécessaire', reglementation_solution: 'Réglementation applicable', propriete_intellectuelle_solution: 'Propriété intellectuelle de la solution', risques_technologiques: 'Risques technologiques', possibilite_reproduction: 'Possibilité de reproduction par un concurrent', ce_qui_empeche_copie: 'Ce qui empêche la copie'
    },
    marche: { taille_marche: 'Taille du marché', evolution: 'Évolution du marché', potentiel: 'Potentiel visé', saisonnalite: 'Saisonnalité', tendances: 'Tendances', facteurs_croissance: 'Facteurs de croissance', facteurs_baisse: 'Facteurs de baisse', barrieres_entree: 'Barrières à l’entrée', reglementation: 'Réglementation applicable', profil_client: 'Profil du client type', segmentation: 'Segmentation', besoins_clients: 'Besoins des clients', localisation_clients: 'Localisation des clients', opportunites: 'Opportunités', menaces_marche: 'Menaces', positionnement: 'Positionnement', avantage_concurrentiel: 'Avantage concurrentiel' },
    strategie_marketing: { identite_marque: 'Identité de marque', strategie_digitale: 'Stratégie digitale', communication: 'Communication', publicite: 'Publicité', partenariats: 'Partenariats marketing', evenements: 'Événements', fidelisation: 'Fidélisation' },
    plan_commercial: { objectifs_vente: 'Objectifs de vente', prospection: 'Prospection', tunnel_vente: 'Tunnel de vente', politique_tarifaire: 'Politique tarifaire', argumentaire: 'Argumentaire commercial', sav: 'Service après-vente', kpi_commerciaux: 'Indicateurs suivis', premiers_10_clients: 'Les 10 premiers clients', premiers_100_clients: 'Les 100 premiers clients' },
    plan_operationnel: { production: 'Production', logistique: 'Logistique', fournisseurs: 'Fournisseurs', equipements: 'Équipements', technologies: 'Technologies utilisées', qualite: 'Contrôle qualité', securite: 'Sécurité' },
    organisation: { dirigeants: 'Dirigeants et gouvernance', equipe: 'Composition de l’équipe', responsabilites: 'Répartition des responsabilités', consultants: 'Consultants externes', benevoles: 'Bénévoles', gouvernance_detail: 'Fonctionnement de la gouvernance', associes_gouvernance: 'Associés', droits_decision: 'Droits de décision' },
    rh: { effectif_actuel: 'Effectif actuel', effectif_prevu: 'Effectif prévu à 12 mois', recrutements: 'Recrutements prévus', competences: 'Compétences recherchées', formations: 'Formations prévues', politique_rh: 'Politique RH' },
    impact: { economique: 'Impact économique', social: 'Impact social', environnemental: 'Impact environnemental', territorial: 'Impact territorial', kpi_impact: 'Indicateurs d’impact', beneficiaires_directs: 'Bénéficiaires directs', beneficiaires_indirects: 'Bénéficiaires indirects', emplois_directs: 'Emplois directs créés', emplois_indirects: 'Emplois indirects créés' },
    infos_generales: { slogan: 'Slogan', secteur: 'Secteur d’activité', sous_secteur: 'Sous-secteur', pays: 'Pays', region: 'Région', ville: 'Ville', adresse: 'Adresse', email: 'E-mail', telephone: 'Téléphone', site_web: 'Site internet', responsable: 'Responsable', responsable_poste: 'Poste du responsable', nb_collaborateurs: 'Nombre de collaborateurs', equipe_fondatrice: 'Équipe fondatrice', organigramme: 'Organigramme', competences_manquantes_equipe: 'Compétences qui manquent à l’équipe', experience_entrepreneuriale: 'Expérience entrepreneuriale', experience_secteur: 'Expérience dans le secteur', actifs_deja_disponibles: 'Actifs déjà disponibles' },
    swot: { forces: 'Forces (internes)', faiblesses: 'Faiblesses (internes)', opportunites: 'Opportunités (externes)', menaces: 'Menaces (externes)', swot_action_forces: 'Comment consolider mes forces', swot_action_faiblesses: 'Comment réduire mes faiblesses', swot_action_opportunites: 'Comment saisir les opportunités', swot_facteurs_cles: 'Facteurs clés de succès' },
    business_model: { partenaires: 'Partenaires clés', activites: 'Activités clés', proposition: 'Proposition de valeur', relations: 'Relations clients', segments: 'Segments de clientèle', ressources: 'Ressources clés', canaux: 'Canaux', couts: 'Structure de coûts', revenus: 'Sources de revenus' },
    financement: { montant: 'Montant recherché', calendrier_decaissement: 'Calendrier de décaissement', utilisation: 'Utilisation des fonds', contreparties: 'Contreparties proposées', roi: 'Retour sur investissement estimé', recherche_active: 'Financeurs ciblés', financement_par_etapes: 'Financement par étapes', scenario_financement_50: 'Scénario à 50 % du financement', scenario_financement_100: 'Scénario à 100 % du financement', scenario_financement_150: 'Scénario à 150 % du financement', strategie_sortie: 'Stratégie de sortie', roi_sortie: 'Retour attendu à la sortie' }
  };

  /* Champs édités sur téléphone : uniquement du texte (une ligne = `court`, sinon zone de texte).
     Les nombres, listes, tableaux et menus déroulants restent consultables ici et modifiables
     sur ordinateur : on ne tronque ni ne reformate jamais ce qu'on n'édite pas, car la sauvegarde
     remplace l'étape entière (voir saveSection). */
  const COURT = new Set(['slogan', 'secteur', 'sous_secteur', 'pays', 'region', 'ville', 'adresse', 'email', 'telephone', 'site_web', 'responsable', 'responsable_poste',
    'frequence_probleme', 'cout_probleme', 'cout_solutions_existantes', 'taux_satisfaction', 'cout_developpement', 'cout_production', 'certification_necessaire',
    'taille_marche', 'evolution', 'potentiel', 'saisonnalite', 'localisation_clients', 'calendrier_decaissement']);
  const EDIT = {
    infos_generales: ['responsable', 'responsable_poste', 'pays', 'region', 'ville', 'adresse', 'secteur', 'sous_secteur', 'telephone', 'email', 'site_web', 'equipe_fondatrice', 'organigramme', 'competences_manquantes_equipe', 'experience_entrepreneuriale', 'experience_secteur', 'actifs_deja_disponibles'],
    resume_executif: ['projet', 'probleme', 'solution', 'marche', 'besoins', 'objectifs'],
    presentation: ['vision', 'mission', 'valeurs', 'obj_court', 'obj_moyen', 'obj_long', 'historique', 'motivations'],
    probleme: ['description', 'pourquoi', 'qui_concerne', 'ampleur', 'consequences', 'pourquoi_pas_resolu', 'preuves', 'frequence_probleme', 'cout_probleme', 'solutions_existantes', 'cout_solutions_existantes', 'limites_solutions_existantes', 'consequences_financieres', 'consequences_sociales', 'consequences_environnementales', 'resultats_entretiens_clients', 'resultats_enquetes', 'temoignages_probleme'],
    solution: ['description', 'fonctionnement', 'innovation', 'avantages', 'valeur_ajoutee', 'differenciants', 'resultats_tests_solution', 'taux_satisfaction', 'ameliorations_prevues', 'cout_developpement', 'cout_production', 'certification_necessaire', 'reglementation_solution', 'propriete_intellectuelle_solution', 'risques_technologiques', 'possibilite_reproduction', 'ce_qui_empeche_copie'],
    marche: ['taille_marche', 'evolution', 'potentiel', 'saisonnalite', 'tendances', 'facteurs_croissance', 'facteurs_baisse', 'barrieres_entree', 'reglementation', 'profil_client', 'segmentation', 'besoins_clients', 'localisation_clients', 'opportunites', 'menaces_marche', 'positionnement', 'avantage_concurrentiel'],
    swot: ['forces', 'faiblesses', 'opportunites', 'menaces', 'swot_action_forces', 'swot_action_faiblesses', 'swot_action_opportunites', 'swot_facteurs_cles'],
    business_model: ['proposition', 'segments', 'canaux', 'relations', 'revenus', 'ressources', 'activites', 'partenaires', 'couts'],
    strategie_marketing: ['identite_marque', 'strategie_digitale', 'communication', 'publicite', 'partenariats', 'evenements', 'fidelisation'],
    plan_commercial: ['objectifs_vente', 'prospection', 'tunnel_vente', 'politique_tarifaire', 'argumentaire', 'sav', 'kpi_commerciaux', 'premiers_10_clients', 'premiers_100_clients'],
    plan_operationnel: ['production', 'logistique', 'fournisseurs', 'equipements', 'technologies', 'qualite', 'securite'],
    organisation: ['dirigeants', 'equipe', 'responsabilites', 'consultants', 'benevoles', 'gouvernance_detail', 'associes_gouvernance', 'droits_decision'],
    rh: ['recrutements', 'competences', 'formations', 'politique_rh'],
    impact: ['economique', 'social', 'environnemental', 'territorial', 'kpi_impact'],
    financement: ['utilisation', 'contreparties', 'roi', 'recherche_active', 'calendrier_decaissement', 'financement_par_etapes', 'scenario_financement_50', 'scenario_financement_100', 'scenario_financement_150', 'strategie_sortie', 'roi_sortie']
  };
  /* Étapes dont une partie (listes, chiffres, outils) n'est pas modifiable sur téléphone. */
  const PARTIEL = new Set(['infos_generales', 'presentation', 'probleme', 'solution', 'marche', 'business_model', 'strategie_marketing', 'plan_commercial', 'plan_operationnel', 'organisation', 'rh', 'impact', 'financement']);
  const SEULEMENT_ORDI = new Set(['produits', 'calendrier', 'plan_financier', 'risques', 'annexes']);

  const PESTEL = { pestel_politique: 'Politique', pestel_economique: 'Économique', pestel_social: 'Social', pestel_technologique: 'Technologique', pestel_environnemental: 'Environnemental', pestel_legal: 'Légal' };
  const PERSONA = { persona_traits: 'Traits de personnalité', persona_canaux: 'Canaux préférés', persona_interets: 'Centres d’intérêt', persona_frustrations: 'Frustrations', persona_motivations: 'Motivations profondes', persona_citations: 'Citations de clients', persona_objections: 'Objections et freins' };
  const PF_RESS = { pf_apport: 'Apport personnel', pf_associes: 'Associés', pf_famille: 'Famille et proches', pf_business_angels: 'Business angels', pf_banque: 'Prêt bancaire', pf_subvention: 'Subvention', pf_investisseur: 'Investisseur', pf_crowdfunding: 'Crowdfunding', pf_diaspo_invest: 'Diaspo’Invest', pf_autres_ress: 'Autres ressources' };
  const PF_EMP = { pf_terrain: 'Terrain', pf_construction: 'Construction / aménagement', pf_materiel: 'Matériel', pf_vehicules: 'Véhicules', pf_logiciels: 'Logiciels et outils', pf_stocks: 'Stock initial', pf_tresorerie: 'Trésorerie de départ', pf_frais_admin: 'Frais administratifs', pf_communication: 'Communication', pf_recrutement: 'Recrutement' };

  /* ---------- navigation et garde-fous ---------- */
  let nav = 0;               // jeton : une réponse tardive ne doit jamais écraser l'écran suivant
  let listTab = 'mes';       // onglet mémorisé de la liste
  const alive = my => my === nav && !!S.pane && S.pane.k === 'businessplan';
  const go = h => { location.hash = h; };
  const SITE_LISTE = 'business-plan.html';
  const siteEdit = id => 'business-plan-edit.html?id=' + encodeURIComponent(id);
  const siteView = id => 'business-plan-view.html?id=' + encodeURIComponent(id);
  const siteDossier = id => 'business-plan-dossier.html?id=' + encodeURIComponent(id);
  const siteSimu = id => 'business-plan-simulation.html?bp=' + encodeURIComponent(id);

  const peutModifier = bp => !bp.is_public && ['proprietaire', 'editeur', 'validateur'].includes(bp.mon_role);

  /* Affiche l'erreur adaptée au code HTTP : connexion, Premium, accès, introuvable, réseau. */
  function fail(e, titre, retry) {
    if (e.status === 401) {
      setPane(titre, A.loginCard('Connectez-vous pour consulter vos business plans.'));
      const b = $('#go-login'); if (b) b.onclick = () => A.openLogin();
      return;
    }
    if (e.status === 402) {
      setPane(titre, `<div class="empty"><div class="ei">${ic('lock', 'l')}</div><b>Module Premium</b>Les business plans font partie de l’abonnement Premium. Renouvelez votre abonnement pour retrouver l’accès.<br><br><a class="btn" href="mon-abonnement.html">Voir mon abonnement</a></div>`);
      A.premiumSheet(MOD);
      return;
    }
    const msg = e.status === 403 ? 'Vous n’avez pas accès à ce business plan.'
      : e.status === 404 ? 'Ce business plan n’existe plus ou a été supprimé.'
        : e.message || 'Une erreur est survenue.';
    const acts = (e.status === 403 || e.status === 404)
      ? '<a class="btn" href="#/businessplan">Mes business plans</a>'
      : '<button class="btn" id="bpm-retry">Réessayer</button>';
    setPane(titre, `<div class="empty"><div class="ei">${ic('file', 'l')}</div><b>${e.status === 403 || e.status === 404 ? 'Business plan inaccessible' : 'Chargement impossible'}</b>${esc(msg)}<br><br>${acts}</div>`);
    const r = $('#bpm-retry'); if (r && retry) r.onclick = retry;
  }

  /* Vérifie connexion et type de compte ; renvoie true si on peut continuer. */
  function accesOk(titre) {
    if (!S.me) {
      setPane(titre, A.loginCard('Connectez-vous pour consulter et construire vos business plans.'));
      const b = $('#go-login'); if (b) b.onclick = () => A.openLogin();
      return false;
    }
    if (S.me.role !== 'utilisateur' && S.me.role !== 'initiative') {
      setPane(titre, `<div class="empty"><div class="ei">${ic('file', 'l')}</div><b>Réservé aux comptes Utilisateur et Initiative</b>Ce module n’est pas proposé pour votre type de compte.<br><br><a class="btn" href="${SITE_LISTE}">Ouvrir sur le site</a></div>`);
      return false;
    }
    return true;
  }

  /* ---------- rendus de blocs réutilisables ---------- */
  const field = (label, val) => has(val) ? `<div class="bpm-f"><h4>${esc(label)}</h4><p>${esc(val)}</p></div>` : '';
  const fields = (data, labels) => Object.keys(labels).map(k => field(labels[k], data[k])).join('');
  const group = (titre, inner) => inner ? `<div class="bpm-g">${esc(titre)}</div>${inner}` : '';
  const mini = (titre, rows) => `<div class="bpm-mc"><b>${esc(titre || 'Sans nom')}</b>${rows.filter(r => has(r[1])).map(r => `<div class="bpm-r"><span>${esc(r[0])} :</span> ${esc(r[1])}</div>`).join('')}</div>`;
  const wrap = inner => `<div class="card"><div class="pad">${inner}</div></div>`;
  const deskNote = (id, texte) => `<div class="bpm-note"><b>À finir sur ordinateur.</b> ${esc(texte)} <a href="${siteEdit(id)}" style="text-decoration:underline;font-weight:700">Ouvrir l’éditeur du site</a></div>`;
  const badge = (txt, cls) => `<span class="badge ${cls || ''}">${esc(txt)}</span>`;

  /* ---------- lecture d'une étape ---------- */
  function sectionHtml(key, bp) {
    const d = obj(obj(bp.sections)[key]);
    switch (key) {
      case 'infos_generales': {
        const x = Object.assign({}, d);
        let h = '';
        if (has(bp.type_initiative)) h += field('Type d’initiative', TYPES[bp.type_initiative] || bp.type_initiative);
        h += field('Stade du projet', STADES[x.stade] || x.stade);
        h += field('Date de création', has(x.date_creation) ? fdate(x.date_creation) : '');
        h += fields(x, LABELS.infos_generales);
        const eq = arr(x.membres_equipe).filter(m => has(m && m.nom) || has(m && m.prenom));
        if (eq.length) h += group('Équipe', eq.map(m => mini([m.prenom, m.nom].filter(has).join(' '), [['Fonction', m.fonction], ['Formation', m.formation], ['Expérience dans le secteur', m.experience_secteur], ['Années d’expérience', m.annees_experience], ['Compétences', m.competences_principales]])).join(''));
        return h;
      }
      case 'solution': {
        const x = Object.assign({}, d);
        const nv = { idee: 'Idée', prototype: 'Prototype', mvp: 'MVP (version minimale testable)', commercialise: 'Déjà commercialisé' };
        if (has(x.niveau_developpement)) x.niveau_developpement = nv[x.niveau_developpement] || x.niveau_developpement;
        return fields(x, LABELS.solution);
      }
      case 'marche': {
        let h = '';
        const chiffres = [['TAM — marché total', d.tam], ['SAM — marché accessible', d.sam], ['SOM — marché visé', d.som]].filter(r => has(r[1]));
        if (chiffres.length) h += `<div class="bpm-kpis" style="margin-bottom:14px">${chiffres.map(r => `<div class="bpm-kpi"><span>${esc(r[0])}</span><b>${esc(amount(r[1], bp))}</b></div>`).join('')}</div>`;
        h += fields(d, LABELS.marche);
        const conc = arr(d.concurrents).filter(c => has(c && c.nom));
        if (conc.length) h += group('Concurrents', conc.map(c => mini(c.nom, [['Type', c.type], ['Produits', c.produits], ['Prix', c.prix], ['Positionnement', c.positionnement], ['Menace', c.menace], ['Forces', c.forces], ['Faiblesses', c.faiblesses]])).join(''));
        h += group('Matrice PESTEL (consultation)', fields(d, PESTEL));
        h += group('Persona du client (consultation)', fields(d, PERSONA));
        return h;
      }
      case 'swot': {
        const blocs = [['forces', 'Forces', '#d1fae5'], ['faiblesses', 'Faiblesses', '#fee2e2'], ['opportunites', 'Opportunités', '#dbeafe'], ['menaces', 'Menaces', '#fef3c7']];
        let h = blocs.filter(b => has(d[b[0]])).map(b => `<div class="bpm-q" style="background:${b[2]}"><h4>${esc(b[1])}</h4><p>${esc(d[b[0]])}</p></div>`).join('');
        const plan = fields(d, { swot_action_forces: LABELS.swot.swot_action_forces, swot_action_faiblesses: LABELS.swot.swot_action_faiblesses, swot_action_opportunites: LABELS.swot.swot_action_opportunites, swot_facteurs_cles: LABELS.swot.swot_facteurs_cles });
        if (plan) h += group('Du diagnostic au plan d’action', plan);
        return h;
      }
      case 'business_model': {
        let h = fields(d, LABELS.business_model);
        const ue = [['Prix moyen', d.prix_moyen, 1], ['Coût variable par client', d.cout_variable_client, 1], ['Marge brute', d.marge_brute_pct, 0, ' %'], ['Coût d’acquisition client (CAC)', d.cac, 1], ['Valeur vie client (LTV)', d.ltv, 1], ['Taux de conversion', d.taux_conversion_ue, 0, ' %'], ['Taux de rétention', d.taux_retention, 0, ' %'], ['Taux d’attrition', d.taux_churn_ue, 0, ' %'], ['Fréquence d’achat', d.frequence_achat_ue], ['Durée moyenne de relation', d.duree_moyenne_relation], ['Délai pour rentabiliser un client', d.delai_rentabilisation]].filter(r => has(r[1]));
        if (ue.length) h += group('Chiffres par client', ue.map(r => field(r[0], r[2] === 1 ? amount(r[1], bp) : String(r[1]) + (r[3] || ''))).join(''));
        const par = arr(d.partenaires_liste).filter(p => has(p && p.nom));
        if (par.length) h += group('Partenaires potentiels', par.map(p => mini(p.nom, [['Type', p.type], ['Pays', p.pays], ['Rôle attendu', p.role], ['Niveau', p.niveau], ['Contact', p.contact]])).join(''));
        return h;
      }
      case 'produits': {
        let h = '';
        const items = arr(d.items).filter(i => has(i && i.nom));
        if (items.length) h += items.map(i => mini(i.nom, [['Description', i.description], ['Coût de revient', has(i.cout_revient) ? amount(i.cout_revient, bp) : ''], ['Prix de vente', has(i.prix_vente) ? amount(i.prix_vente, bp) : ''], ['Marge', has(i.marge) ? i.marge + ' %' : ''], ['Cycle', i.cycle]])).join('');
        const ep = arr(d.etude_prix).filter(e => has(e && e.produit));
        if (ep.length) h += group('Étude de prix', ep.map(e => mini(e.produit, [['Prix des concurrents', e.prix_concurrents], ['Positionnement', e.positionnement], ['Volume estimé', e.volume_estime], ['Stratégie', e.strategie]])).join(''));
        return h;
      }
      case 'calendrier': {
        const ST = { planifie: 'Planifié', en_cours: 'En cours', termine: 'Terminé', retard: 'En retard' };
        return arr(d.phases).filter(p => has(p && p.nom)).map(p => mini(p.nom, [
          ['Dates', [p.debut ? fdate(p.debut) : '', p.fin ? fdate(p.fin) : ''].filter(Boolean).join(' → ')], ['Statut', ST[p.statut] || p.statut], ['Responsable', p.responsable], ['Objectif', p.objectif], ['Tâches', p.taches], ['Livrable', p.livrable], ['Indicateur', p.kpi], ['Risque associé', p.risque_associe]])).join('');
      }
      case 'risques':
        return arr(d.items).filter(r => has(r && r.description)).map(r => mini(r.description, [['Probabilité', NIVEAUX[r.probabilite] || r.probabilite], ['Impact', NIVEAUX[r.impact] || r.impact], ['Mesures préventives', r.prevention], ['Si le risque survient', r.urgence], ['Responsable', r.responsable], ['Signal d’alerte', r.indicateur_alerte], ['Risque restant', NIVEAUX[r.risque_residuel] || r.risque_residuel]])).join('');
      case 'annexes':
        return arr(d.items).filter(a => has(a && a.nom)).map(a => `<div class="bpm-mc"><b>${esc(a.nom)}</b>${has(a.description) ? `<div class="bpm-r">${esc(a.description)}</div>` : ''}${a.url && A.safeUrl(a.url) ? `<div class="bpm-r"><a href="${A.attrUrl(a.url)}" target="_blank" rel="noopener" style="color:var(--navy2);font-weight:700;text-decoration:underline">Ouvrir le document</a></div>` : ''}</div>`).join('');
      case 'plan_financier':
        return financeHtml(bp);
      case 'financement': {
        let h = '';
        if (has(d.montant)) h += `<div class="bpm-kpis" style="margin-bottom:14px"><div class="bpm-kpi"><span>Montant recherché</span><b>${esc(amount(d.montant, bp))}</b></div>${has(d.montant_minimum_necessaire) ? `<div class="bpm-kpi"><span>Montant minimum</span><b>${esc(amount(d.montant_minimum_necessaire, bp))}</b></div>` : ''}</div>`;
        const lab = Object.assign({}, LABELS.financement); delete lab.montant;
        h += fields(d, lab);
        const postes = arr(d.utilisation_postes).filter(p => has(p && p.poste));
        if (postes.length) h += group('Utilisation des fonds par poste', postes.map(p => mini(p.poste, [['Montant', has(p.montant) ? amount(p.montant, bp) : ''], ['Part', has(p.pourcentage) ? p.pourcentage + ' %' : '']])).join(''));
        const lev = [['Valorisation avant investissement', d.valorisation_avant, 1], ['Valorisation après investissement', d.valorisation_apres, 1], ['Pourcentage proposé', d.pourcentage_propose, 0, ' %'], ['Dilution maximale acceptée', d.dilution_maximale_acceptee, 0, ' %']].filter(r => has(r[1]));
        if (lev.length) h += group('Levée de fonds', lev.map(r => field(r[0], r[2] === 1 ? amount(r[1], bp) : r[1] + r[3])).join(''));
        return h;
      }
      case 'rh': {
        const x = Object.assign({}, d);
        return fields(x, LABELS.rh);
      }
      default:
        return LABELS[key] ? fields(d, LABELS[key]) : '';
    }
  }

  /* ---------- résumé financier (lecture seule) ---------- */
  const CR_LIGNES = ['ca', 'autres_produits', 'achats', 'salaires', 'loyers', 'marketing_charge', 'autres_charges'];
  /* Résultat estimé d'une année : produits − charges d'exploitation saisies. Amortissements et
     intérêts d'emprunt ne sont pas inclus (ils demandent les tableaux d'immobilisations et de
     dettes) : on l'indique toujours clairement à côté du chiffre. */
  function anneesFinancieres(pf) {
    const out = [];
    for (let a = 1; a <= 5; a++) {
      if (!CR_LIGNES.some(k => has(pf[k + '_' + a]))) continue;
      const ca = num(pf['ca_' + a]) + num(pf['autres_produits_' + a]);
      const cles = ['achats', 'salaires', 'loyers', 'marketing_charge', 'autres_charges'];
      const charges = cles.reduce((s, k) => s + num(pf[k + '_' + a]), 0);
      // Sans aucune charge saisie, un « résultat » égal au chiffre d'affaires serait trompeur : on ne l'affiche pas.
      out.push({ a, ca, charges, avecCharges: cles.some(k => has(pf[k + '_' + a])), resultat: ca - charges });
    }
    return out;
  }
  function financeHtml(bp) {
    const pf = obj(obj(bp.sections).plan_financier);
    let h = '';
    const cles = [['Investissement initial', pf.investissement_initial], ['Apport personnel', pf.apport_personnel], ['Financement recherché', pf.financement_recherche], ['Seuil de rentabilité', pf.seuil_rentabilite], ['Point mort', has(pf.point_mort) ? (isNum(pf.point_mort) ? pf.point_mort + ' mois' : pf.point_mort) : '']].filter(r => has(r[1]));
    if (cles.length) h += `<div class="bpm-kpis" style="margin-bottom:14px">${cles.map(r => `<div class="bpm-kpi"><span>${esc(r[0])}</span><b>${esc(r[0] === 'Point mort' ? r[1] : amount(r[1], bp))}</b></div>`).join('')}</div>`;
    const ans = anneesFinancieres(pf);
    if (ans.length) {
      h += `<div class="bpm-g">Chiffre d’affaires et résultat estimé</div>` + ans.map(y => `<div class="bpm-yr"><b>Année ${y.a}</b>
        <div class="kv"><span>Chiffre d’affaires</span><span>${esc(mny(y.ca, bp))}</span></div>
        ${y.avecCharges ? `<div class="kv"><span>Charges saisies</span><span>${esc(mny(y.charges, bp))}</span></div>
        <div class="kv"><span>Résultat estimé</span><span style="font-weight:800;color:${y.resultat >= 0 ? 'var(--green)' : 'var(--red)'}">${esc(mny(y.resultat, bp))}</span></div>` : '<div class="small muted">Charges non renseignées</div>'}</div>`).join('')
        + (ans.some(y => y.avecCharges) ? `<p class="small muted" style="margin:0 0 12px">Résultat estimé avant amortissements et intérêts d’emprunt : le calcul complet se fait sur ordinateur.</p>` : '');
    }
    const ress = Object.keys(PF_RESS).filter(k => has(pf[k]));
    const emp = Object.keys(PF_EMP).filter(k => has(pf[k]));
    if (ress.length || emp.length) {
      const tr = Object.keys(PF_RESS).reduce((s, k) => s + num(pf[k]), 0), te = Object.keys(PF_EMP).reduce((s, k) => s + num(pf[k]), 0);
      const eq = Math.abs(tr - te) < Math.max(1, Math.max(tr, te) * 0.01);
      const bloc = (titre, ks, map, total) => ks.length ? `<div class="bpm-g">${esc(titre)}</div>${ks.map(k => `<div class="kv"><span>${esc(map[k])}</span><span>${esc(amount(pf[k], bp))}</span></div>`).join('')}<div class="kv"><span><b>Total</b></span><span><b>${esc(mny(total, bp))}</b></span></div>` : '';
      h += bloc('Plan de financement — ressources', ress, PF_RESS, tr) + bloc('Plan de financement — emplois', emp, PF_EMP, te);
      if (ress.length && emp.length) h += `<p class="small" style="margin:8px 0 12px;font-weight:700;color:${eq ? 'var(--green)' : 'var(--orange-d)'}">${eq ? 'Équilibré : ressources et emplois sont égaux.' : 'Écart de ' + esc(mny(Math.abs(tr - te), bp)) + ' entre ressources et emplois.'}</p>`;
    }
    h += field('Besoin en fonds de roulement', pf.bfr) + field('Scénario optimiste', pf.scenario_optimiste) + field('Scénario réaliste', pf.scenario_realiste) + field('Scénario prudent', pf.scenario_prudent);
    h += field('Immobilisations', pf.immobilisations) + field('Amortissements', pf.amortissements);
    return h;
  }

  /* ============================================================
     LISTE
     ============================================================ */
  function transmissionBadge(bp, partage) {
    const t = TRANSMISSION[bp.transmission_statut];
    if (t) return badge(t, 'g');
    return partage || bp.is_public ? '' : badge('Non transmis');
  }
  /* Couverture d'une carte cliquable : comme A.mediaBlock mais SANS data-zoom, sinon le clic
     ouvrirait le visualiseur d'image au lieu de suivre le lien de la carte. */
  function cover(url) {
    const u = A.attrUrl(url); if (!u) return '';
    return `<div class="media"><img class="bg" src="${u}" alt="" aria-hidden="true"><img class="fg" loading="lazy" src="${u}" alt=""></div>`;
  }
  function planCard(bp, mode) {
    const prog = Math.max(0, Math.min(100, Number(bp.progression) || 0));
    const proprio = [bp.owner_prenom, bp.owner_nom].filter(Boolean).join(' ');
    return `<a class="card" href="#/businessplan/${bp.id}" style="display:block;color:inherit;text-decoration:none">
      ${bp.photo_principale_url ? cover(bp.photo_principale_url) : ''}
      <div class="pad">
        <h3 style="margin:0 0 2px;font-size:17px;line-height:1.25;overflow-wrap:anywhere">${esc(bp.nom_projet || 'Sans titre')}</h3>
        ${has(bp.slogan) ? `<div class="small muted" style="font-style:italic;margin-bottom:6px">« ${esc(bp.slogan)} »</div>` : ''}
        <div class="tags" style="margin:6px 0 10px">
          ${badge(TYPES[bp.type_initiative] || bp.type_initiative || 'Plan')}
          ${has(bp.secteur) ? badge(bp.secteur) : ''}
          ${badge(STATUTS[bp.statut] || 'Brouillon', bp.statut === 'complet' ? 'g' : (bp.statut === 'archive' ? '' : 'o'))}
          ${mode === 'exemple' ? badge('Exemple de référence · lecture seule', 'o') : ''}
          ${mode === 'partage' ? badge('Partagé · ' + (ROLES[bp.mon_role] || 'Lecteur'), 'o') : ''}
          ${transmissionBadge(bp, mode !== 'mes')}
        </div>
        <div class="bar" role="progressbar" aria-label="Avancement" aria-valuenow="${prog}" aria-valuemin="0" aria-valuemax="100"><i style="width:${prog}%"></i></div>
        <div class="row small" style="margin-top:6px"><span><b>${prog} %</b> complété</span><span class="sp"></span><span class="muted">Modifié ${esc(since(bp.updated_at))}</span></div>
        ${mode === 'partage' && proprio ? `<div class="small muted" style="margin-top:4px">Plan de ${esc(proprio)}</div>` : ''}
      </div></a>`;
  }

  async function listScreen() {
    const my = ++nav;
    const T = 'Business Plans';
    if (!accesOk(T)) return;
    setPane(T, SKEL);
    let r;
    try { r = await api(API); } catch (e) { if (alive(my)) fail(e, T, listScreen); return; }
    if (!alive(my)) return;
    const mes = arr(r.mes_plans), part = arr(r.partages), ex = arr(r.exemples);
    const tabs = [['mes', 'Mes plans', mes.length], ['partages', 'Partagés avec moi', part.length], ['exemple', 'Exemple de référence', ex.length]];
    if (!tabs.some(t => t[0] === listTab)) listTab = 'mes';
    const corps = () => {
      if (listTab === 'mes') {
        return mes.length ? mes.map(b => planCard(b, 'mes')).join('')
          : `<div class="empty"><div class="ei">${ic('file', 'l')}</div><b>Aucun business plan</b>Créez votre premier plan pour structurer votre projet et convaincre vos partenaires.<br><br><a class="btn" href="#/businessplan/new">Créer mon premier plan</a>${ex.length ? '<br><br><button class="btn out" id="bpm-goex">Voir l’exemple de référence</button>' : ''}</div>`;
      }
      if (listTab === 'partages') {
        return part.length ? part.map(b => planCard(b, 'partage')).join('')
          : `<div class="empty"><div class="ei">${ic('people', 'l')}</div><b>Aucun plan partagé</b>Les plans dont un autre membre vous donne l’accès apparaîtront ici.</div>`;
      }
      return `<p class="small muted" style="margin:0 4px 10px">Un plan complet, rempli avec tous les outils de la plateforme, pour s’en inspirer. Consultable par tous, non modifiable : vous pouvez le dupliquer comme point de départ.</p>`
        + (ex.length ? ex.map(b => planCard(b, 'exemple')).join('')
          : `<div class="empty"><div class="ei">${ic('star', 'l')}</div><b>Pas encore d’exemple</b>Aucun exemple de référence n’est publié pour le moment.</div>`);
    };
    const draw = () => {
      setPane(T, `<div class="chips" role="tablist">${tabs.map(t => `<button class="chip ${listTab === t[0] ? 'on' : ''}" role="tab" aria-selected="${listTab === t[0]}" data-t="${t[0]}">${esc(t[1])}${t[2] ? ' (' + t[2] + ')' : ''}</button>`).join('')}</div>${corps()}
        <div class="bpm-note" style="margin-top:14px">Transmission à Diaspo’Actif, dossier investisseur (PDF et PowerPoint), simulation de présentation et aide de l’IA : <a href="${SITE_LISTE}" style="text-decoration:underline;font-weight:700">à faire sur ordinateur</a>.</div>`,
        `<a class="btn block" href="#/businessplan/new">${ic('plus', 's')} Nouveau business plan</a>`);
      $$('#pane-body .chip').forEach(c => c.onclick = () => { listTab = c.dataset.t; draw(); });
      const g = $('#bpm-goex'); if (g) g.onclick = () => { listTab = 'exemple'; draw(); };
    };
    draw();
  }

  /* ============================================================
     CRÉATION
     ============================================================ */
  async function createScreen() {
    const my = ++nav;
    const T = 'Nouveau business plan';
    if (!accesOk(T)) return;
    setPane(T, `<div class="card"><div class="pad">
      <form id="bpm-cf" novalidate>
        <div class="bpm-fld"><label class="bpm-lbl" for="bpm-nom">Nom du projet *</label>
          <input class="bpm-in" id="bpm-nom" maxlength="150" autocomplete="off" placeholder="Mon projet innovant…" aria-describedby="bpm-nom-err">
          <div class="bpm-err" id="bpm-nom-err" role="alert"></div></div>
        <div class="bpm-fld"><label class="bpm-lbl" for="bpm-sec">Secteur d’activité</label>
          <select class="bpm-in" id="bpm-sec"><option value="">Choisir…</option>${SECTEURS.map(s => `<option>${esc(s)}</option>`).join('')}</select></div>
        <div class="bpm-lbl" id="bpm-tpl-l">Modèle de business plan</div>
        <div class="bpm-tpl" role="radiogroup" aria-labelledby="bpm-tpl-l">${MODELES.map((m, i) => `<label class="bpm-tp ${i === 0 ? 'on' : ''}"><input type="radio" name="bpm-tpl" value="${m[0]}" ${i === 0 ? 'checked' : ''}><b>${esc(m[1])}</b><small>${esc(m[2])}</small></label>`).join('')}</div>
        <p class="small muted" style="margin:0 0 4px">Vous pourrez ensuite remplir chaque étape ici, sur téléphone, ou continuer sur ordinateur.</p>
      </form></div></div>`,
      `<button class="btn block" id="bpm-create">Créer le business plan</button>`);
    if (!alive(my)) return;
    $$('.bpm-tp input').forEach(i => i.onchange = () => $$('.bpm-tp').forEach(l => l.classList.toggle('on', l.querySelector('input').checked)));
    let busy = false;
    const submit = async () => {
      if (busy) return;
      const nom = $('#bpm-nom').value.trim(), err = $('#bpm-nom-err');
      if (!nom) { err.textContent = 'Donnez un nom à votre projet pour continuer.'; $('#bpm-nom').focus(); return; }
      err.textContent = '';
      const tpl = ($('input[name="bpm-tpl"]:checked') || {}).value || 'startup';
      busy = true; const b = $('#bpm-create'); b.disabled = true; b.textContent = 'Création…';
      try {
        const r = await api(API, { method: 'POST', body: { nom_projet: nom, secteur: $('#bpm-sec').value, type_initiative: tpl, template: tpl } });
        toast('Business plan créé');
        location.replace('#/businessplan/' + r.id);
      } catch (e) {
        busy = false; b.disabled = false; b.textContent = 'Créer le business plan';
        if (e.status === 402) { A.premiumSheet(MOD); return; }
        if (e.status === 401) { A.openLogin(); return; }
        err.textContent = (e.message || 'La création a échoué.') + ' Vérifiez votre connexion et réessayez.';
      }
    };
    $('#bpm-create').onclick = submit;
    $('#bpm-cf').onsubmit = ev => { ev.preventDefault(); submit(); };
    setTimeout(() => { const f = $('#bpm-nom'); if (f) f.focus(); }, 80);
  }

  /* ============================================================
     VUE D'ENSEMBLE D'UN PLAN
     ============================================================ */
  const sectionRemplie = d => { d = obj(d); return Object.values(d).some(v => (Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : has(v)))); };

  async function planScreen(id) {
    const my = ++nav;
    const T = 'Business plan';
    if (!accesOk(T)) return;
    setPane(T, SKEL);
    let bp, score = null;
    try {
      const rb = api(`${API}/${id}`);
      // Le score est facultatif : refusé pour un exemple de référence ou un lecteur sans accès.
      const rs = api(`${API}/${id}/score`).catch(() => null);
      bp = await rb; score = await rs;
    } catch (e) { if (alive(my)) fail(e, T, () => planScreen(id)); return; }
    if (!alive(my)) return;

    const modif = peutModifier(bp), proprio = bp.mon_role === 'proprietaire' && !bp.is_public;
    const prog = Math.max(0, Math.min(100, Number(bp.progression) || 0));
    const compl = Object.fromEntries(arr(bp.completude).map(c => [c.key, c.ok]));
    const s = obj(bp.sections), pf = obj(s.plan_financier);
    const an = anneesFinancieres(pf)[0];
    const hasFin = !!financeHtml(bp);
    const kp = [];
    if (an && an.a === 1) kp.push(['Chiffre d’affaires, année 1', mny(an.ca, bp)]);
    else if (has(pf.ca_1)) kp.push(['Chiffre d’affaires, année 1', amount(pf.ca_1, bp)]);
    if (has(pf.investissement_initial)) kp.push(['Investissement initial', amount(pf.investissement_initial, bp)]);
    const recherche = has(pf.financement_recherche) ? pf.financement_recherche : obj(s.financement).montant;
    if (has(recherche)) kp.push(['Financement recherché', amount(recherche, bp)]);
    if (has(pf.seuil_rentabilite)) kp.push(['Seuil de rentabilité', amount(pf.seuil_rentabilite, bp)]);

    // Points à améliorer en priorité, d'après le score explicable du serveur.
    const priorites = score && Array.isArray(score.detail)
      ? score.detail.filter(c => c.pts < c.max && c.action && SEC[String(c.action.href || '').slice(1)]).sort((a, b) => (a.pts / a.max) - (b.pts / b.max)).slice(0, 3) : [];

    const trans = modif ? arr(bp.transmissions) : [];
    const html = `
      ${bp.is_public ? `<div class="bpm-note"><b>Exemple de référence, en lecture seule.</b> Dupliquez-le pour en faire votre propre plan et le modifier.</div>` : ''}
      ${bp.mon_role !== 'proprietaire' && !bp.is_public ? `<div class="bpm-note">Plan partagé avec vous · votre rôle : <b>${esc(ROLES[bp.mon_role] || 'Lecteur')}</b>${modif ? '' : ' (lecture seule)'}</div>` : ''}
      <div class="card">${bp.photo_principale_url ? A.mediaBlock(bp.photo_principale_url, { alt: '' }) : ''}<div class="pad">
        <h2 style="margin:0 0 2px;font-size:21px;line-height:1.25;overflow-wrap:anywhere">${esc(bp.nom_projet || 'Sans titre')}</h2>
        ${has(bp.slogan) ? `<div class="muted" style="font-style:italic;margin-bottom:8px">« ${esc(bp.slogan)} »</div>` : ''}
        <div class="tags" style="margin:8px 0 12px">${badge(TYPES[bp.type_initiative] || bp.type_initiative || 'Plan')}${has(bp.secteur) ? badge(bp.secteur) : ''}${badge(STATUTS[bp.statut] || 'Brouillon', bp.statut === 'complet' ? 'g' : (bp.statut === 'archive' ? '' : 'o'))}${transmissionBadge(bp, !proprio)}</div>
        <div class="bar" role="progressbar" aria-label="Avancement" aria-valuenow="${prog}" aria-valuemin="0" aria-valuemax="100"><i style="width:${prog}%"></i></div>
        <div class="row small" style="margin-top:6px"><span><b>${prog} %</b> des étapes commencées</span><span class="sp"></span><span class="muted">Modifié ${esc(since(bp.updated_at))}</span></div>
        ${modif ? `<button class="btn out sm" id="bpm-rename" style="margin-top:12px">Renommer le plan</button>` : ''}
      </div></div>

      ${(kp.length || score) ? `<div class="h2">CHIFFRES CLÉS</div><div class="card"><div class="pad">
        <div class="bpm-kpis">
          ${score ? `<a class="bpm-kpi" href="#/businessplan/${id}/score" style="text-decoration:none;color:inherit"><span>Score de solidité</span><b>${esc(score.score)} / 100</b></a>` : ''}
          ${kp.map(k => `<div class="bpm-kpi"><span>${esc(k[0])}</span><b>${esc(k[1])}</b></div>`).join('')}
        </div>
        ${hasFin ? `<a class="btn out block sm" style="margin-top:12px" href="#/businessplan/${id}/finances">Voir le résumé financier</a>` : ''}
      </div></div>` : ''}

      ${priorites.length ? `<div class="h2">À AMÉLIORER EN PRIORITÉ</div><div class="lst">${priorites.map(c => `<a class="li" href="#/businessplan/${id}/${esc(String(c.action.href).slice(1))}"><span class="ic" style="font-size:20px">${esc(c.icon || '•')}</span><span class="sp"><span class="t">${esc(c.action.texte)}</span><br><span class="d">${esc(c.label)} · ${esc(c.pts)} / ${esc(c.max)} points</span></span><span class="ch">${ic('chev', 's')}</span></a>`).join('')}</div>` : ''}

      <div class="h2">LES ÉTAPES DU PLAN</div>
      <div class="lst">${SECTIONS.map(sc => {
        const rempli = sectionRemplie(s[sc.key]);
        const etat = compl[sc.key] ? badge('Complète', 'g') : (rempli ? badge('À compléter', 'o') : badge('Vide'));
        return `<a class="li" href="#/businessplan/${id}/${sc.key}"><span class="ic" style="font-size:20px">${sc.icon}</span><span class="sp"><span class="t">${esc(sc.label)}</span> ${etat}</span><span class="ch">${ic('chev', 's')}</span></a>`;
      }).join('')}</div>

      ${trans.length ? `<div class="h2">TRANSMISSIONS À DIASPO’ACTIF</div><div class="card"><div class="pad">${trans.map(t => `<div class="kv"><span>${esc(TRANSMISSION[t.statut] || t.statut)}</span><span class="muted">${esc(fdate(String(t.date_soumission_da || t.updated_at || '').slice(0, 10)))}</span></div>`).join('')}</div></div>` : ''}

      <div class="h2">ACTIONS</div>
      <div class="card"><div class="pad">
        <button class="btn out block" id="bpm-dup">${ic('doc', 's')} ${bp.is_public ? 'Dupliquer comme point de départ' : 'Dupliquer ce plan'}</button>
        ${proprio ? `<button class="btn out block bpm-danger" id="bpm-del" style="margin-top:10px">Supprimer ce plan</button>` : ''}
      </div></div>

      <div class="bpm-note"><b>À finir sur ordinateur.</b> Tableaux financiers détaillés, listes (produits, risques, phases, annexes), outils stratégiques, versions, collaborateurs, pièces jointes et médias.</div>
      <div class="lst">
        <a class="li" href="${siteDossier(id)}"><span class="ic">${ic('file')}</span><span class="sp"><span class="t">Dossier investisseur</span><br><span class="d">Génération PDF et PowerPoint</span></span><span class="ch">${ic('out', 's')}</span></a>
        ${modif ? `<a class="li" href="${siteEdit(id)}"><span class="ic">${ic('desk')}</span><span class="sp"><span class="t">Éditeur complet</span><br><span class="d">Toutes les étapes, aide de l’IA, versions</span></span><span class="ch">${ic('out', 's')}</span></a>` : ''}
        ${proprio ? `<a class="li" href="${siteSimu(id)}"><span class="ic">${ic('people')}</span><span class="sp"><span class="t">Simulation de présentation</span><br><span class="d">S’entraîner à défendre son projet</span></span><span class="ch">${ic('out', 's')}</span></a>
        <a class="li" href="${SITE_LISTE}"><span class="ic">${ic('send')}</span><span class="sp"><span class="t">Transmettre à Diaspo’Actif</span><br><span class="d">Depuis la page « Mes business plans »</span></span><span class="ch">${ic('out', 's')}</span></a>` : ''}
        <a class="li" href="${siteView(id)}"><span class="ic">${ic('doc')}</span><span class="sp"><span class="t">Version document complète</span><br><span class="d">Mise en page du site, impression</span></span><span class="ch">${ic('out', 's')}</span></a>
      </div>`;
    setPane(bp.nom_projet || 'Business plan', html);

    const rn = $('#bpm-rename'); if (rn) rn.onclick = () => renameSheet(bp, () => planScreen(id));
    $('#bpm-dup').onclick = async ev => {
      if (!confirm(bp.is_public ? 'Créer une copie de cet exemple dans vos business plans ?' : 'Créer une copie de « ' + (bp.nom_projet || 'ce plan') + ' » dans vos business plans ?')) return;
      const b = ev.currentTarget; b.disabled = true;
      try { const r = await api(`${API}/${id}/duplicate`, { method: 'POST', body: {} }); toast('Copie créée'); go('#/businessplan/' + r.id); }
      catch (e) { b.disabled = false; if (e.status === 402) A.premiumSheet(MOD); else toast(e.message || 'La copie a échoué.', true); }
    };
    const dl = $('#bpm-del'); if (dl) dl.onclick = async () => {
      if (!confirm('Supprimer le business plan « ' + (bp.nom_projet || 'Sans titre') + ' » ? Cette action est irréversible.')) return;
      dl.disabled = true;
      try { await api(`${API}/${id}`, { method: 'DELETE' }); toast('Business plan supprimé'); location.replace('#/businessplan'); }
      catch (e) { dl.disabled = false; toast(e.message || 'La suppression a échoué.', true); }
    };
  }

  /* Renommer le plan (champ nom_projet de la fiche, comme le titre de l'éditeur du site). */
  function renameSheet(bp, after) {
    const close = A.openSheet(`<h2 style="margin:4px 0 12px;font-size:19px">Renommer le plan</h2>
      <label class="bpm-lbl" for="bpm-rn">Nom du projet</label>
      <input class="bpm-in" id="bpm-rn" maxlength="150" value="${esc(bp.nom_projet || '')}" autocomplete="off">
      <div class="bpm-err" id="bpm-rn-err" role="alert"></div>
      <button class="btn block" id="bpm-rn-ok" style="margin-top:8px">Enregistrer</button>
      <button class="btn out block" id="bpm-rn-no" style="margin-top:10px">Annuler</button>`);
    $('#bpm-rn-no').onclick = close;
    $('#bpm-rn-ok').onclick = async () => {
      const nom = $('#bpm-rn').value.trim(), err = $('#bpm-rn-err');
      if (!nom) { err.textContent = 'Le nom ne peut pas être vide.'; return; }
      const b = $('#bpm-rn-ok'); b.disabled = true; b.textContent = 'Enregistrement…';
      try { await api(`${API}/${bp.id}`, { method: 'PUT', body: { nom_projet: nom } }); close(); toast('Nom enregistré'); after(); }
      catch (e) { b.disabled = false; b.textContent = 'Enregistrer'; err.textContent = (e.message || 'L’enregistrement a échoué.') + ' Réessayez.'; }
    };
    setTimeout(() => { const f = $('#bpm-rn'); if (f) { f.focus(); f.select(); } }, 80);
  }

  /* ============================================================
     SCORE DÉTAILLÉ
     ============================================================ */
  async function scoreScreen(id) {
    const my = ++nav;
    const T = 'Score de solidité';
    if (!accesOk(T)) return;
    setPane(T, SKEL);
    let r;
    try { r = await api(`${API}/${id}/score`); }
    catch (e) {
      if (!alive(my)) return;
      if (e.status === 403) return setPane(T, `<div class="empty"><div class="ei">${ic('star', 'l')}</div><b>Score non disponible</b>Le score n’est calculé que pour vos propres plans et ceux partagés avec vous.<br><br><a class="btn" href="#/businessplan/${esc(id)}">Retour au plan</a></div>`);
      return fail(e, T, () => scoreScreen(id));
    }
    if (!alive(my)) return;
    const det = arr(r.detail);
    const aSuivre = det.filter(c => c.pts < c.max).sort((a, b) => (a.pts / a.max) - (b.pts / b.max));
    setPane(T, `<div class="card"><div class="pad" style="text-align:center">
        <div class="bpm-big">${esc(r.score)}<span style="font-size:18px;color:var(--muted)"> / 100</span></div>
        <div class="bar" style="margin:12px 0 8px" role="progressbar" aria-label="Score" aria-valuenow="${esc(r.score)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.max(0, Math.min(100, Number(r.score) || 0))}%"></i></div>
        <p class="small muted" style="margin:0">${esc(r.avertissement || 'Repère de complétude qualitative, jamais une notation financière certifiée.')}</p>
      </div></div>
      <div class="h2">DÉTAIL PAR THÈME</div>
      <div class="lst">${det.map(c => {
        const sec = String((c.action && c.action.href) || '').slice(1);
        const lien = SEC[sec] ? `href="#/businessplan/${esc(id)}/${esc(sec)}"` : '';
        const pct = c.max ? Math.round(c.pts * 100 / c.max) : 0;
        return `<a class="li" ${lien} style="align-items:flex-start;height:auto;min-height:56px;padding-top:10px;padding-bottom:10px"><span class="ic" style="font-size:20px">${esc(c.icon || '•')}</span><span class="sp"><span class="t">${esc(c.label)}</span> ${c.pts >= c.max ? badge('Complet', 'g') : ''}<br><span class="d" style="white-space:normal">${esc(c.aide || '')}</span>
          <span class="bar" style="display:block;margin:6px 0 2px" role="progressbar" aria-label="${esc(c.label)}" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></span><span class="d">${esc(c.pts)} / ${esc(c.max)} points</span></span>${lien ? `<span class="ch">${ic('chev', 's')}</span>` : ''}</a>`;
      }).join('')}</div>
      ${aSuivre.length ? `<div class="h2">POUR PROGRESSER</div><div class="card"><div class="pad">${aSuivre.slice(0, 5).map(c => `<div class="kv"><span>${esc((c.action && c.action.texte) || c.label)}</span><span class="muted">${esc(c.pts)}/${esc(c.max)}</span></div>`).join('')}</div></div>` : ''}
      <a class="btn out block" href="#/businessplan/${esc(id)}">Retour au plan</a>`);
  }

  /* ============================================================
     RÉSUMÉ FINANCIER
     ============================================================ */
  async function financesScreen(id) {
    const my = ++nav;
    const T = 'Résumé financier';
    if (!accesOk(T)) return;
    setPane(T, SKEL);
    let bp;
    try { bp = await api(`${API}/${id}`); } catch (e) { if (alive(my)) fail(e, T, () => financesScreen(id)); return; }
    if (!alive(my)) return;
    const corps = financeHtml(bp);
    setPane(T, `<div class="small muted" style="margin:0 4px 10px">${esc(bp.nom_projet || 'Sans titre')} · montants en ${esc(dev(bp))}</div>
      ${corps ? wrap(corps) : `<div class="empty"><div class="ei">${ic('card', 'l')}</div><b>Aucun chiffre pour l’instant</b>Le plan financier n’est pas encore rempli.</div>`}
      ${peutModifier(bp) ? deskNote(id, 'Le compte de résultat détaillé, la trésorerie mois par mois, les dettes, les immobilisations et les ratios se saisissent sur grand écran.') : ''}
      <a class="btn out block" href="#/businessplan/${esc(id)}">Retour au plan</a>`);
  }

  /* ============================================================
     ÉTAPE : CONSULTATION ET MODIFICATION
     ============================================================ */
  async function sectionScreen(id, key) {
    const my = ++nav;
    const def = SEC[key];
    if (!accesOk(def.label)) return;
    setPane(def.label, SKEL);
    let bp;
    try { bp = await api(`${API}/${id}`); } catch (e) { if (alive(my)) fail(e, def.label, () => sectionScreen(id, key)); return; }
    if (!alive(my)) return;
    const modif = peutModifier(bp);
    const editable = modif && !!EDIT[key];
    const idx = SECTIONS.findIndex(s => s.key === key);
    const prev = SECTIONS[idx - 1], next = SECTIONS[idx + 1];
    const contenu = sectionHtml(key, bp);

    const html = `<div class="small muted" style="margin:0 4px 10px">${esc(bp.nom_projet || 'Sans titre')} · étape ${idx + 1} sur ${SECTIONS.length}</div>
      ${bp.is_public ? `<div class="bpm-note"><b>Exemple de référence, en lecture seule.</b></div>` : ''}
      ${contenu ? wrap(contenu) : `<div class="empty"><div class="ei">${ic('file', 'l')}</div><b>Étape non renseignée</b>${editable ? 'Touchez « Modifier cette étape » pour commencer à la rédiger.' : (SEULEMENT_ORDI.has(key) && modif ? 'Cette étape se remplit sur ordinateur.' : 'Rien n’a encore été saisi ici.')}</div>`}
      ${modif && SEULEMENT_ORDI.has(key) ? deskNote(id, key === 'plan_financier' ? 'Le plan financier se saisit sur ordinateur (tableaux, trésorerie, dettes…). Le résumé ci-dessus reprend ce qui est déjà renseigné.' : 'Cette étape est faite de listes et de tableaux : elle se complète sur ordinateur.') : ''}
      ${modif && PARTIEL.has(key) ? deskNote(id, 'Les nombres, listes et outils de cette étape (tableaux, matrices) se complètent sur ordinateur.') : ''}
      ${key === 'plan_financier' ? `<a class="btn out block" style="margin-bottom:12px" href="#/businessplan/${esc(id)}/finances">Voir le résumé financier</a>` : ''}
      <div class="bpm-nav">
        ${prev ? `<a class="btn out sm" href="#/businessplan/${esc(id)}/${prev.key}" aria-label="Étape précédente : ${esc(prev.label)}">‹ Précédente</a>` : '<span style="flex:1"></span>'}
        ${next ? `<a class="btn out sm" href="#/businessplan/${esc(id)}/${next.key}" aria-label="Étape suivante : ${esc(next.label)}">Suivante ›</a>` : '<span style="flex:1"></span>'}
      </div>`;
    setPane(def.label, html, editable ? `<button class="btn block" id="bpm-edit">Modifier cette étape</button>` : null);
    const e = $('#bpm-edit'); if (e) e.onclick = () => editScreen(id, key, bp, my);
  }

  /* ---------- édition d'une étape (champs texte) ---------- */
  function editScreen(id, key, bp, my) {
    const def = SEC[key], d = obj(obj(bp.sections)[key]), labels = LABELS[key] || {};
    const st = { id, key, dirty: {}, busy: false, chain: Promise.resolve(), timer: null, closed: false };
    const champs = EDIT[key].map(k => {
      const lab = labels[k] || k, v = has(d[k]) ? String(d[k]) : '';
      const type = k === 'email' ? 'email' : k === 'telephone' ? 'tel' : k === 'site_web' ? 'url' : 'text';
      return `<div class="bpm-fld"><label class="bpm-lbl" for="bpm-k-${esc(k)}">${esc(lab)}</label>${COURT.has(k)
        ? `<input class="bpm-in" id="bpm-k-${esc(k)}" data-k="${esc(k)}" type="${type}" value="${esc(v)}" autocomplete="off">`
        : `<textarea class="bpm-in" id="bpm-k-${esc(k)}" data-k="${esc(k)}" rows="3">${esc(v)}</textarea>`}</div>`;
    }).join('');
    setPane(def.label, `<div class="small muted" style="margin:0 4px 10px">${esc(bp.nom_projet || 'Sans titre')} · modification</div>
      <div class="card"><div class="pad">${champs}
        <p class="small muted" style="margin:0">Vos modifications sont enregistrées automatiquement quelques secondes après la saisie.</p></div></div>`,
      `<div class="bpm-foot"><span class="bpm-st" id="bpm-st" role="status" aria-live="polite">Aucune modification</span><button class="btn out sm" id="bpm-done">Terminer</button><button class="btn" id="bpm-save" disabled>Enregistrer</button></div>`);

    /* Une fois l'écran quitté (st.closed), on ne touche plus au DOM : il appartient à l'écran suivant. */
    const status = (txt, cls) => { if (st.closed) return; const el = $('#bpm-st'); if (el) { el.textContent = txt; el.className = 'bpm-st' + (cls ? ' ' + cls : ''); } };
    const refreshBtn = () => { if (st.closed) return; const b = $('#bpm-save'); if (b) b.disabled = st.busy || !Object.keys(st.dirty).length; };

    /* Sauvegarde : on relit d'abord l'étape sur le serveur et on n'y change QUE les champs
       modifiés ici. L'API remplace l'étape entière : sans cela, une liste ou un nombre modifié
       entre-temps sur ordinateur serait écrasé par notre copie périmée.
       Les sauvegardes sont chaînées (jamais deux en parallèle) et chacune renvoie son résultat. */
    async function doSave() {
      const lot = Object.assign({}, st.dirty);
      if (!Object.keys(lot).length) return true;
      st.busy = true; status('Enregistrement…'); refreshBtn();
      let ok = false;
      try {
        const cur = await api(`${API}/${id}`);
        if (cur.is_public) throw new Error('Ce plan est un exemple en lecture seule.');
        const section = Object.assign({}, obj(obj(cur.sections)[key]), lot);
        await api(`${API}/${id}`, { method: 'PUT', body: { sections: { [key]: section } } });
        // On ne retire que ce qui n'a pas été retapé pendant l'envoi.
        Object.keys(lot).forEach(k => { if (st.dirty[k] === lot[k]) delete st.dirty[k]; });
        ok = true;
        if (st.closed) toast('Modifications enregistrées');
        else status('Enregistré à ' + new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }), 'ok');
      } catch (e) {
        if (e.status === 402) A.premiumSheet(MOD);
        if (st.closed) toast('Une modification n’a pas pu être enregistrée : ' + (e.message || 'erreur'), true);
        else status('Non enregistré : ' + (e.message || 'erreur') + ' Touchez « Enregistrer » pour réessayer.', 'ko');
      }
      st.busy = false; refreshBtn();
      return ok;
    }
    function save() { clearTimeout(st.timer); st.chain = st.chain.then(doSave); return st.chain; }

    $$('#pane-body [data-k]').forEach(el => {
      const grow = () => { if (el.tagName === 'TEXTAREA') { el.style.height = 'auto'; el.style.height = Math.max(96, el.scrollHeight + 2) + 'px'; } };
      grow();
      el.oninput = () => {
        st.dirty[el.dataset.k] = el.value; grow();
        status('● Modifications non enregistrées'); refreshBtn();
        clearTimeout(st.timer); st.timer = setTimeout(save, 3000);
      };
    });
    $('#bpm-save').onclick = () => { save(); };
    $('#bpm-done').onclick = async () => {
      const b = $('#bpm-done'); b.disabled = true;
      const ok = Object.keys(st.dirty).length ? await save() : true;
      if (!ok) { b.disabled = false; return; }
      st.closed = true; window.removeEventListener('hashchange', leave);
      sectionScreen(id, key);
    };
    /* Quitter l'écran (bouton retour, autre route) avec des modifications en attente :
       on les envoie quand même, comme l'enregistrement automatique de l'éditeur du site. */
    function leave() {
      window.removeEventListener('hashchange', leave);
      st.closed = true; clearTimeout(st.timer);
      if (Object.keys(st.dirty).length) save();
    }
    window.addEventListener('hashchange', leave);
  }

  /* ============================================================
     ROUTEUR DU MODULE
     ============================================================ */
  window.MMods.businessplan = function (b, c) {
    if (!b) return void listScreen();
    if (b === 'new') return void createScreen();
    if (!/^\d+$/.test(b)) { location.replace('#/businessplan'); return; }
    if (!c) return void planScreen(b);
    if (c === 'score') return void scoreScreen(b);
    if (c === 'finances') return void financesScreen(b);
    if (SEC[c]) return void sectionScreen(b, c);
    location.replace('#/businessplan/' + b);
  };
})();

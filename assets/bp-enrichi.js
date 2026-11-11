/* ═════════════════════════════════════════════════════════════════
   bp-enrichi.js — Diaspo'Actif (2026-11-11)
   « Cahier des charges enrichi » du Business Plan, rubriques 1 à 10 : source UNIQUE des champs,
   listes et calculs ajoutés. Partagée par l'éditeur (business-plan-edit.html), la vue
   (business-plan-view.html) et le dossier investisseur (business-plan-dossier.html). Chargé en
   <script> classique (window.BPEnrichi) ET en require() côté Node (tests/bp-enrichi.test.js).

   Principes :
   - Tout est FACULTATIF : un plan existant s'affiche exactement comme avant ; seuls les champs
     réellement remplis apparaissent. Rien n'est jamais inventé : les résumés et les calculs ne
     reprennent que ce que l'auteur a saisi, et signalent ce qui manque.
   - Les nouvelles données vivent dans sections_json, dans la rubrique concernée, sous des clés
     qui ne reprennent aucune clé existante.
   - Une « liste » est un tableau d'objets ; avec base:'items' elle PROLONGE les lignes d'un
     tableau existant (ex. les fiches détaillées des produits) au lieu d'en créer un autre.
   ═════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(root);
  else root.BPEnrichi = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  /* ── Fabriques de champs : T texte court, A texte long, N nombre, C choix ── */
  const T = (k, l, ph) => ({ k, l, t: 'texte', ph });
  const A = (k, l, ph) => ({ k, l, t: 'long', ph });
  const N = (k, l, ph) => ({ k, l, t: 'nombre', ph });
  const D = (k, l) => ({ k, l, t: 'date' });
  const C = (k, l, opts) => ({ k, l, t: 'choix', opts });
  const OUINON = ['Oui', 'Non'];
  const NIVEAU3 = ['Faible', 'Moyen', 'Élevé'];
  const NOTE5 = ['1', '2', '3', '4', '5'];

  /* ═══════════════ SPÉCIFICATION PAR RUBRIQUE ═══════════════ */
  const SPEC = {
    /* ── 1. Informations générales ── */
    infos_generales: {
      cartes: [
        { id: 'ident', titre: 'Identification officielle et nature de l\'activité', champs: [
          C('type_numero_immatriculation', "Type de numéro d'immatriculation", ['RCCM', 'SIREN', 'SIRET', 'RNA', 'IFU', 'NIF', 'Autre']),
          T('numero_immatriculation', "Numéro d'immatriculation (selon le pays)", 'Ex : CI-ABJ-2025-B-12345'),
          T('numero_identification_fiscale', "Numéro d'identification fiscale (si applicable)"),
          C('statut_entreprise', "Statut de l'entreprise", ['Idée', 'Création', 'Lancement', 'Croissance', 'Développement', 'Restructuration']),
          C('nature_activite', "Nature de l'activité", ['B2B', 'B2C', 'B2G', 'Économie sociale', 'Modèle hybride']),
        ] },
        { id: 'marches', titre: 'Marchés géographiques', champs: [
          A('marches_couverts', 'Marchés actuellement couverts', 'Pays, régions, villes déjà servis'),
          A('marches_envisages', 'Marchés envisagés', 'Pays ou régions visés dans les prochaines années'),
        ] },
        { id: 'autorisations', titre: 'Autorisations, licences et assurances', champs: [
          A('situation_autorisations', 'Situation des autorisations administratives et licences', 'Obtenues, en cours, à demander'),
          A('assurances_existantes', 'Assurances professionnelles existantes'),
          A('assurances_necessaires', 'Assurances professionnelles nécessaires'),
        ] },
        { id: 'fondateurs', titre: 'Disponibilité des fondateurs', champs: [
          A('disponibilite_fondateurs', 'Disponibilité des fondateurs sur le projet', 'Temps consacré, date de passage à temps plein'),
          A('activites_paralleles_fondateurs', 'Activités professionnelles parallèles', 'Emplois ou autres activités exercés en parallèle'),
        ] },
      ],
      listes: [
        { k: 'actionnariat', titre: 'Répartition détaillée du capital et bénéficiaires effectifs', nom: 'associe', ajout: 'Ajouter un détenteur', cols: [
          T('associe', 'Associé ou détenteur'), C('type_detenteur', 'Type', ['Personne physique', 'Société', 'Fonds ou investisseur', 'Autre']),
          N('part_pct', 'Part du capital (%)'), C('benef_effectif', 'Bénéficiaire effectif', OUINON) ] },
        { k: 'changements_juridiques', titre: 'Historique des changements de structure juridique', nom: 'changement', ajout: 'Ajouter un changement', cols: [
          D('date', 'Date'), T('changement', 'Changement (ex : passage en SARL)'), A('motif', 'Motif') ] },
        { k: 'chronologie', titre: 'Chronologie de la création', nom: 'jalon', viz: 'frise', ajout: 'Ajouter un jalon', cols: [
          D('date', 'Date'), T('jalon', 'Jalon'), A('detail', 'Détail') ] },
      ],
    },

    /* ── 2. Résumé exécutif ── */
    resume_executif: {
      cartes: [
        { id: 'elements', titre: 'Éléments du résumé enrichi', champs: [
          A('opportunite', 'Opportunité identifiée et justification du marché'),
          A('avantage_demontrable', 'Avantage concurrentiel démontrable', 'Une preuve concrète, pas une affirmation'),
          A('stade_realisations', 'Stade de développement et réalisations déjà obtenues'),
          A('marche_accessible_resume', 'Taille du marché réellement accessible'),
          A('modele_revenus_couts', 'Modèle de revenus et principaux coûts'),
          A('ca_realise_previsionnel', "Chiffre d'affaires réalisé et prévisionnel"),
          T('besoin_total_financement', 'Besoin total de financement'),
          T('montant_securise', 'Montant déjà sécurisé'),
          A('utilisation_fonds_resume', 'Utilisation précise des fonds recherchés'),
          A('rentabilite_tresorerie', 'Prévisions de rentabilité et de trésorerie'),
          A('risques_maitrise', 'Principaux risques et mesures de maîtrise'),
          A('proposition_financeurs', 'Proposition concrète adressée aux financeurs'),
        ] },
      ],
      listes: [
        { k: 'objectifs_prioritaires', titre: 'Objectifs prioritaires sur 12 à 36 mois (3 à 5)', nom: 'objectif', max: 5, ajout: 'Ajouter un objectif', cols: [
          T('objectif', 'Objectif'), T('echeance', 'Échéance'), T('indicateur', 'Indicateur') ] },
      ],
    },

    /* ── 3. Présentation détaillée ── */
    presentation: {
      cartes: [
        { id: 'origine', titre: 'Origine et évolution du projet', champs: [
          A('origine_opportunite', "Origine de l'opportunité entrepreneuriale"),
          A('probleme_constate_fondateurs', 'Problème constaté personnellement par les fondateurs'),
          A('etapes_franchies', 'Étapes déjà franchies et résultats mesurables'),
          A('evolution_concept', 'Évolution du concept depuis sa création'),
          A('hypotheses_initiales', 'Hypothèses initiales confirmées ou invalidées'),
        ] },
        { id: 'ambition', titre: 'Positionnement et ambition', champs: [
          A('positionnement_long_terme', 'Positionnement stratégique à long terme'),
          A('ambition_territoriale', 'Ambition territoriale'),
          A('ambition_internationale', 'Ambition internationale'),
          A('priorites_strategiques', 'Priorités stratégiques classées par importance', 'Une priorité par ligne, de la plus importante à la moins importante'),
          A('conditions_reussite', 'Conditions nécessaires à la réussite'),
          A('ecart_ambitions_ressources', 'Écart entre les ambitions et les ressources disponibles'),
        ] },
      ],
      listes: [
        { k: 'frise_projet', titre: 'Frise chronologique du projet', nom: 'etape', viz: 'frise', ajout: 'Ajouter une étape', cols: [
          D('date', 'Date'), T('etape', 'Étape'), A('resultat', 'Résultat obtenu') ] },
        { k: 'objectifs_smart', titre: 'Objectifs SMART et indicateurs de suivi', nom: 'objectif', calc: 'smart', ajout: 'Ajouter un objectif', cols: [
          T('objectif', 'Objectif (spécifique)'), T('indicateur', 'Indicateur de suivi (mesurable)'), T('valeur_cible', 'Valeur cible'),
          C('atteignable', 'Atteignable et réaliste ?', ['Oui', 'À vérifier', 'Non']), T('echeance', 'Échéance (temporel)'), T('responsable', 'Responsable'),
          C('horizon', 'Horizon', ['Court terme', 'Moyen terme', 'Long terme']), C('statut', 'Statut', ['À démarrer', 'En cours', 'Atteint', 'En retard']) ] },
      ],
    },

    /* ── 4. Analyse du problème ── */
    probleme: {
      cartes: [
        { id: 'population', titre: 'Population touchée et besoin', champs: [
          A('population_touchee', 'Description précise de la population touchée'),
          A('besoins_exprimes_observes', 'Différences entre besoins exprimés et besoins observés'),
          A('cout_economique_annuel', 'Coût économique annuel du problème'),
          A('consequences_par_beneficiaire', 'Conséquences pour chaque catégorie de bénéficiaires'),
          A('intensite_probleme', 'Intensité du problème'),
          A('raisons_insatisfaction', "Raisons de l'insatisfaction face aux solutions actuelles"),
          C('niveau_urgence', "Niveau d'urgence du besoin", ['Faible', 'Moyen', 'Élevé', 'Critique']),
          A('disposition_a_payer', 'Disposition à payer pour une solution'),
          A('sources_statistiques', 'Sources des statistiques et dates de publication', 'Source, organisme, année'),
          A('consequences_inaction', "Conséquences de l'inaction"),
        ] },
      ],
      listes: [
        { k: 'causes_profondes', titre: 'Causes profondes (arbre des causes)', nom: 'cause', ajout: 'Ajouter une cause', cols: [
          T('cause', 'Cause'), A('preuve', 'Preuve ou source') ] },
        { k: 'consequences_arbre', titre: 'Conséquences (arbre des conséquences)', nom: 'consequence', ajout: 'Ajouter une conséquence', cols: [
          T('consequence', 'Conséquence'), C('categorie', 'Catégorie', ['Économique', 'Sociale', 'Environnementale', 'Sanitaire', 'Autre']), T('beneficiaire', 'Bénéficiaires touchés') ] },
        { k: 'problemes_prioritaires', titre: 'Matrice de priorisation des problèmes', nom: 'probleme', viz: 'priorites', calc: 'priorite', ajout: 'Ajouter un problème', cols: [
          T('probleme', 'Problème'), C('gravite', 'Gravité (1-5)', NOTE5), C('frequence', 'Fréquence (1-5)', NOTE5), C('urgence', 'Urgence (1-5)', NOTE5) ] },
      ],
      viz: [{ k: 'arbre', titre: 'Arbre des causes et conséquences' }],
    },

    /* ── 5. Solution proposée ── */
    solution: {
      cartes: [
        { id: 'benefices', titre: 'Bénéfices et différenciation', champs: [
          A('benefices_mesurables', 'Bénéfices concrets et mesurables'),
          A('differences_concurrents', 'Différences avec les solutions concurrentes'),
          A('resultats_prototypes', 'Résultats des prototypes et expérimentations'),
          A('retours_clients_ameliorations', 'Retours clients et améliorations apportées'),
        ] },
        { id: 'economie', titre: 'Coûts et déploiement', champs: [
          A('cout_acquisition_solution', "Coût d'acquisition ou de développement de la solution"),
          A('cout_maintenance_evolution', "Coût de maintenance et d'évolution"),
          A('conditions_deploiement_echelle', 'Conditions de déploiement à grande échelle'),
          A('accessibilite_publics', 'Accessibilité et adaptation aux publics concernés'),
          A('contraintes_reglementaires_techniques', 'Contraintes réglementaires et techniques'),
          A('conditions_garantie_sav', 'Conditions de garantie et de service après-vente'),
          A('risques_dependance', 'Risques de dépendance à un fournisseur ou à une technologie'),
        ] },
      ],
      listes: [
        { k: 'parcours_etapes', titre: 'Parcours complet de l\'utilisateur ou du client', nom: 'etape', viz: 'flux', ajout: 'Ajouter une étape', cols: [
          T('etape', 'Étape'), A('description', 'Ce qui se passe'), T('acteur', 'Acteur (client, équipe…)') ] },
        { k: 'fonctionnalites', titre: 'Fonctionnalités ou caractéristiques principales', nom: 'fonctionnalite', ajout: 'Ajouter une caractéristique', cols: [
          T('fonctionnalite', 'Caractéristique'), A('besoin', 'Besoin auquel elle répond'), A('benefice', 'Bénéfice concret') ] },
        { k: 'avant_apres', titre: 'Comparaison avant / après', nom: 'aspect', ajout: 'Ajouter un critère', cols: [
          T('aspect', 'Critère'), A('avant', 'Avant (situation actuelle)'), A('apres', 'Après (avec la solution)') ] },
        { k: 'feuille_route_solution', titre: 'Feuille de route des améliorations', nom: 'amelioration', ajout: 'Ajouter une amélioration', cols: [
          T('amelioration', 'Amélioration'), T('echeance', 'Échéance'), T('responsable', 'Responsable'), C('statut', 'Statut', ['Prévue', 'En cours', 'Réalisée', 'Reportée']) ] },
      ],
    },

    /* ── 6. Étude de marché ── */
    marche: {
      cartes: [
        { id: 'methode', titre: 'Méthode, sources et croissance', champs: [
          T('annee_reference_marche', 'Année de référence des estimations', 'Ex : 2025'),
          A('methode_calcul_tam_sam_som', 'Méthode de calcul du TAM, du SAM et du SOM'),
          A('sources_verifiables_estimations', 'Sources vérifiables de chaque estimation', 'Une source par ligne : organisme, titre, année, lien'),
          T('volume_marche_unites', 'Volume du marché en unités'),
          T('volume_marche_valeur', 'Volume du marché en valeur'),
          A('previsions_croissance', 'Prévisions de croissance'),
          A('hypotheses_previsions', 'Hypothèses explicites des prévisions'),
        ] },
        { id: 'demande', titre: 'Demande et comportement d\'achat', champs: [
          A('demande_par_zone', 'Analyse de la demande par zone géographique'),
          A('segmentation_detaillee', 'Segmentation par âge, revenus, profession, habitudes et besoins'),
          A('frequence_achat_panier', "Fréquence d'achat et panier moyen"),
          A('sensibilite_prix_elasticite', 'Sensibilité au prix et élasticité de la demande'),
          A('criteres_decision_achat', "Critères déterminants dans la décision d'achat"),
          T('duree_cycle_achat', "Durée du cycle d'achat"),
          A('analyse_canaux_distribution', 'Analyse des canaux de distribution'),
          A('tendances_consommation', 'Tendances de consommation'),
        ] },
        { id: 'concurrence_plus', titre: 'Concurrence et comparaison des prix', champs: [
          A('solutions_substitution', 'Solutions de substitution'),
          A('fiabilite_parts_marche', 'Parts de marché estimées : niveau de fiabilité'),
          A('comparaison_prix_equivalents', 'Comparaison des prix à unité et qualité équivalentes'),
          A('barrieres_sortie', 'Barrières à la sortie'),
        ] },
        { id: 'risques_international', titre: 'Risques, croissance par segment et international', champs: [
          A('risques_reglementaires_geopolitiques', 'Risques réglementaires et géopolitiques'),
          A('opportunites_par_segment', 'Opportunités de croissance par segment'),
          A('conditions_acces_international', "Conditions d'accès au marché international"),
          A('synthese_attractivite_faisabilite', "Synthèse de l'attractivité et de la faisabilité commerciale"),
        ] },
      ],
      listes: [
        { k: 'historique_marche', titre: 'Historique de croissance du marché', nom: 'annee', viz: 'barres', barre: 'valeur', ajout: 'Ajouter une année', cols: [
          T('annee', 'Année'), N('valeur', 'Valeur du marché'), T('taux', 'Croissance (%)'), T('source', 'Source') ] },
        { k: 'pestel_detail', titre: 'Analyse PESTEL détaillée', nom: 'element', ajout: 'Ajouter un facteur', cols: [
          C('facteur', 'Facteur', ['Politique', 'Économique', 'Social', 'Technologique', 'Environnemental', 'Légal']), T('element', 'Élément'),
          C('impact', 'Impact sur le projet', ['Favorable', 'Neutre', 'Défavorable']), C('horizon', 'Horizon', ['Court terme', 'Moyen terme', 'Long terme']), T('source', 'Source') ] },
        { k: 'porter', titre: 'Les cinq forces de Porter', nom: 'force', viz: 'porter', fixe: true, cols: [
          T('force', 'Force'), C('intensite', 'Intensité', ['Faible', 'Moyenne', 'Forte']), A('analyse', 'Analyse') ],
          defaut: [{ force: 'Rivalité entre concurrents' }, { force: 'Menace des nouveaux entrants' }, { force: 'Menace des produits de substitution' }, { force: 'Pouvoir de négociation des clients' }, { force: 'Pouvoir de négociation des fournisseurs' }] },
      ],
    },

    /* ── 7. Analyse SWOT ── */
    swot: {
      cartes: [
        { id: 'tows', titre: 'Matrice TOWS — stratégies croisées', intro: 'Combinez les éléments de la SWOT. Le texte saisi ici est le vôtre : la proposition automatique n\'est qu\'une base à relire.', champs: [
          A('tows_so', 'Forces + opportunités : stratégies offensives'),
          A('tows_st', 'Forces + menaces : stratégies de protection'),
          A('tows_wo', 'Faiblesses + opportunités : stratégies d\'amélioration'),
          A('tows_wt', 'Faiblesses + menaces : stratégies de réduction des risques'),
        ] },
      ],
      listes: [
        { k: 'swot_actions', titre: 'Plan d\'action priorisé de la SWOT', nom: 'element', calc: 'swot_action', ajout: 'Ajouter une action', cols: [
          T('element', 'Élément concerné'), C('cat', 'Catégorie', ['Force', 'Faiblesse', 'Opportunité', 'Menace']),
          C('probabilite', 'Probabilité de matérialisation (1-5)', NOTE5), C('impact_note', 'Impact (1-5)', NOTE5),
          C('horizon', 'Horizon', ['Court terme', 'Moyen terme', 'Long terme']), C('capacite_agir', "Capacité réelle d'agir", NIVEAU3),
          C('maitrise', 'Niveau de maîtrise (faiblesses)', ['Faible', 'Partielle', 'Bonne']), A('justificatif', 'Justificatif'),
          A('action', 'Action corrective ou stratégique'), T('responsable', 'Responsable'), T('budget', 'Budget estimé'), D('date_mise_en_oeuvre', 'Date de mise en œuvre'),
          T('indicateur_reussite', 'Indicateur de réussite'), C('risque_apres', 'Niveau de risque après intervention', ['Faible', 'Moyen', 'Élevé', 'Critique']),
          C('validation', "Validation de l'utilisateur", ['À valider', 'Validée']) ] },
      ],
    },

    /* ── 8. Business Model Canvas ── */
    business_model: {
      cartes: [
        { id: 'valeur', titre: 'Justification, partenaires et coûts', champs: [
          A('justification_proposition_valeur', 'Justification de chaque proposition de valeur'),
          A('segments_rentables', 'Segments les plus rentables'),
          A('dependance_partenaires', 'Dépendance aux partenaires'),
          A('niveau_engagement_contractuel', "Niveau d'engagement contractuel"),
          A('conditions_commerciales_partenaires', 'Conditions commerciales des partenaires'),
          A('dependance_canal_distribution', 'Dépendance à un canal de distribution'),
          A('revenus_recurrents_ponctuels', 'Sources de revenus récurrents et ponctuels'),
          A('inducteurs_couts', 'Principaux inducteurs de coûts'),
          A('economies_echelle', "Économies d'échelle possibles"),
          A('avantages_difficiles_reproduire', 'Avantages concurrentiels difficiles à reproduire'),
          A('conditions_rentabilite_modele', 'Conditions de rentabilité du modèle'),
        ] },
      ],
      listes: [
        { k: 'segments_eco', titre: 'Rentabilité par segment', nom: 'segment', calc: 'ltv_cac', ajout: 'Ajouter un segment', cols: [
          T('segment', 'Segment'), N('cac_segment', "Coût d'acquisition (CAC)"), N('cout_service_client', 'Coût de service par client'),
          N('ltv_segment', 'Valeur vie client (LTV)'), N('marge_contributive_pct', 'Marge contributive (%)') ] },
        { k: 'ca_par_canal', titre: "Répartition prévisionnelle du chiffre d'affaires par canal", nom: 'canal', viz: 'barres', barre: 'part_pct', ajout: 'Ajouter un canal', cols: [
          T('canal', 'Canal'), N('part_pct', 'Part du CA (%)'), T('montant', 'Montant') ] },
        { k: 'hypotheses_modele', titre: 'Hypothèses critiques et validation commerciale', nom: 'hypothese', calc: 'validation', ajout: 'Ajouter une hypothèse', cols: [
          A('hypothese', 'Hypothèse'), C('critique', 'Critique ?', OUINON), C('statut_validation', 'Validation', ['Non testée', 'En test', 'Validée', 'Invalidée']), A('preuve', 'Preuve ou résultat du test') ] },
      ],
    },

    /* ── 9. Produits et services ── */
    produits: {
      listes: [
        { k: 'items', base: 'items', titre: 'Fiches détaillées des produits et services', nom: 'nom', calc: 'produit', cols: [
          T('sku', 'Référence commerciale ou SKU'), T('categorie', 'Catégorie'), T('sous_categorie', 'Sous-catégorie'), T('photo_url', 'Photographie ou illustration (lien)'),
          A('description_technique', 'Description technique et commerciale'), A('composition_conditionnement', 'Composition, caractéristiques, dimensions et conditionnement'),
          T('clientele_cible', 'Clientèle cible'), A('benefice_apporte', 'Problème résolu ou bénéfice apporté'),
          N('cout_matieres', 'Coût des matières premières (par unité)'), N('cout_main_oeuvre', 'Coût de main-d\'œuvre directe'), N('cout_emballage', 'Coût d\'emballage'),
          N('cout_logistique_unitaire', 'Coût logistique'), N('autres_couts_variables', 'Autres coûts variables'), T('methode_cout_revient', 'Méthode de calcul du coût de revient'),
          N('tva_pct', 'TVA applicable (%)'), T('prix_concurrents_comparable', 'Prix des concurrents à périmètre comparable'),
          N('volume_actuel_vendu', 'Volume vendu actuellement'), N('volume_mensuel_prevu', 'Volume prévisionnel mensuel'), N('volume_annuel_prevu', 'Volume prévisionnel annuel'),
          N('capacite_production_annuelle', 'Capacité de production annuelle (même unité que les volumes)'), T('taux_retour_defaut_pertes', 'Taux de retour, défauts et pertes'),
          T('duree_conservation', 'Durée de conservation ou de validité'), T('saisonnalite_disponibilite', 'Saisonnalité et disponibilité'), A('fournisseurs_dependances', 'Fournisseurs et dépendances'),
          A('certifications_necessaires', 'Certifications nécessaires'), T('canaux_vente', 'Canaux de vente'), T('conditions_garantie', 'Conditions de garantie'),
          A('potentiel_developpement', 'Potentiel de développement'), C('stade_cycle_vie', 'Stade du cycle de vie commercial', ['Lancement', 'Croissance', 'Maturité', 'Déclin']) ] },
      ],
    },

    /* ── 10. Stratégie marketing ── */
    strategie_marketing: {
      cartes: [
        { id: 'objectifs', titre: 'Objectifs, positionnement et messages', champs: [
          A('objectifs_marketing_quantifies', 'Objectifs marketing quantifiés'),
          A('positionnement_promesse', 'Positionnement et promesse de marque'),
          A('messages_cles_segment', 'Messages clés par segment de clientèle'),
          A('notoriete_actuelle', 'Analyse de la notoriété actuelle'),
        ] },
        { id: 'canaux', titre: 'Contenu et canaux', champs: [
          A('strategie_contenu', 'Stratégie de contenu'), A('seo', 'Référencement naturel (SEO)'), A('sea', 'Référencement payant (SEA)'),
          A('reseaux_sociaux_prioritaires', 'Réseaux sociaux prioritaires'), A('emailing_newsletter', 'E-mail marketing et newsletter'),
          A('marketing_influence', "Marketing d'influence"), A('relations_presse', 'Relations presse'),
          A('strategie_evenementielle', 'Stratégie événementielle'), A('recommandation_parrainage', 'Programmes de recommandation et de parrainage'),
        ] },
        { id: 'resultats', titre: 'Résultats attendus et pilotage', champs: [
          T('prospects_attendus', 'Nombre de prospects attendus'), T('taux_conversion_attendu', 'Taux de conversion attendu'), T('cout_par_prospect', 'Coût par prospect'),
          T('cout_acquisition_client', "Coût d'acquisition client"), T('taux_fidelisation_marketing', 'Taux de fidélisation'),
          A('methode_attribution_ventes', "Méthode d'attribution des ventes"), A('tests_ab_optimisation', 'Tests A/B et optimisation'), A('responsables_echeances', 'Responsables et échéances'),
        ] },
      ],
      listes: [
        { k: 'calendrier_editorial', titre: 'Calendrier éditorial', nom: 'contenu', ajout: 'Ajouter un contenu', cols: [
          D('date', 'Date'), T('canal', 'Canal'), T('contenu', 'Contenu ou thème'), T('format', 'Format'), T('responsable', 'Responsable'), C('statut', 'Statut', ['Prévu', 'En préparation', 'Publié']) ] },
        { k: 'plan_marketing_12_mois', titre: 'Plan marketing sur 12 mois', nom: 'action', ajout: 'Ajouter une action', cols: [
          T('mois', 'Mois'), T('action', 'Action'), T('canal', 'Canal'), T('budget', 'Budget'), T('resultat_attendu', 'Résultat attendu'), T('responsable', 'Responsable'), C('statut', 'Statut', ['Prévue', 'En cours', 'Réalisée', 'Reportée']) ] },
        { k: 'suivi_campagnes', titre: 'Tableau de bord des campagnes : attendu et réel', nom: 'campagne', calc: 'campagne', ajout: 'Ajouter une campagne', cols: [
          T('campagne', 'Campagne'), T('canal', 'Canal'), T('periode', 'Période'), N('budget_prevu', 'Budget prévu'), N('budget_reel', 'Budget réel'),
          N('prospects_prevus', 'Prospects attendus'), N('prospects_reels', 'Prospects obtenus'), N('conversions_prevues', 'Conversions attendues'), N('conversions_reelles', 'Conversions obtenues') ] },
      ],
    },

    /* ── 11. Plan commercial ── */
    plan_commercial: {
      cartes: [
        { id: 'clients', titre: 'Clients, décideurs et cycle de vente', champs: [
          T('clients_a_conquerir', 'Nombre de clients à conquérir'), T('clients_a_fideliser', 'Nombre de clients à fidéliser'),
          T('duree_contact_signature', 'Durée moyenne entre premier contact et signature'), T('montant_moyen_devis', 'Montant moyen des devis'), T('montant_moyen_contrats', 'Montant moyen des contrats'),
          A('qualification_prospects', 'Qualification des prospects et critères du score de priorité'),
        ] },
        { id: 'conditions', titre: 'Politique commerciale', champs: [
          A('politique_remises_commissions', 'Politique de remises, commissions et conditions de paiement'),
          A('delais_reglement_impayes', 'Délais de règlement et gestion des impayés'),
          A('strategie_vente_directe', 'Vente directe'), A('strategie_vente_indirecte', 'Vente indirecte'), A('strategie_vente_partenaires', 'Vente par partenaires'),
          A('premiers_1000_clients', 'Comment comptez-vous obtenir vos 1 000 premiers clients ?'),
          A('previsions_renouvellement', 'Prévisions de renouvellement et de ventes complémentaires'),
          A('indicateurs_satisfaction_reclamations', 'Indicateurs de satisfaction et de réclamations'),
          A('plan_developpement_commercial', 'Plan de développement commercial sur 12 à 36 mois'),
        ] },
      ],
      listes: [
        { k: 'objectifs_ca', titre: "Objectifs de chiffre d'affaires et performance commerciale", nom: 'libelle', calc: 'objectif_realise', ajout: 'Ajouter un objectif', cols: [
          C('axe', 'Axe', ['Mois', 'Trimestre', 'Année', 'Commercial', 'Produit', 'Territoire']), T('libelle', 'Période ou intitulé'), N('objectif', 'Objectif'), N('realise', 'Réalisé') ] },
        { k: 'decideurs', titre: 'Décideurs et interlocuteurs commerciaux', nom: 'organisation', ajout: 'Ajouter un interlocuteur', cols: [
          T('organisation', 'Organisation'), T('contact', 'Interlocuteur'), T('fonction', 'Fonction'), C('role_decision', 'Rôle dans la décision', ['Décideur', 'Prescripteur', 'Utilisateur', 'Acheteur', 'Influenceur']) ] },
        { k: 'entonnoir', titre: 'Entonnoir de conversion', nom: 'etape', calc: 'entonnoir', viz: 'barres', barre: 'nb', ajout: 'Ajouter une étape', cols: [
          T('etape', 'Étape du cycle'), N('nb', 'Nombre à cette étape'), N('probabilite', 'Probabilité de conversion attendue (%)'), N('duree_jours', 'Durée moyenne (jours)') ] },
        { k: 'pipeline', titre: 'CRM prévisionnel : pipeline pondéré', nom: 'prospect', calc: 'pipeline', ajout: 'Ajouter une opportunité', cols: [
          T('prospect', 'Prospect ou client'), T('etape', 'Étape'), N('montant', 'Montant potentiel'), N('probabilite', 'Probabilité de signature (%)'), C('priorite', 'Priorité', ['Haute', 'Moyenne', 'Basse']), T('echeance', 'Échéance prévue') ] },
      ],
    },

    /* ── 12. Plan opérationnel ── */
    plan_operationnel: {
      cartes: [
        { id: 'prod', titre: 'Production, approvisionnement et stocks', champs: [
          A('description_etapes_production', 'Description des étapes de production ou de prestation'),
          T('temps_production_unite', 'Temps de production par unité'), A('productivite', 'Productivité par collaborateur et par équipement'),
          A('besoins_matieres_consommables', 'Besoins en matières premières et consommables'), A('planification_approvisionnements', 'Planification des approvisionnements'),
          T('stock_minimum', 'Stock minimum'), T('stock_maximum', 'Stock maximum'), T('stock_securite', 'Stock de sécurité'), T('delai_reapprovisionnement', 'Délai de réapprovisionnement'),
          A('conditions_stockage', 'Conditions de stockage et de conservation'), T('taux_pertes_non_conformites', 'Taux de pertes et de non-conformités'), T('cout_logistique_commande', 'Coût logistique par produit ou commande'),
        ] },
        { id: 'continuite', titre: 'Maintenance, continuité, qualité et conformité', champs: [
          A('maintenance', 'Maintenance préventive et corrective'), A('continuite_activite', "Continuité d'activité en cas de panne"), A('fournisseurs_alternatifs', 'Fournisseurs alternatifs'),
          A('controle_qualite_tracabilite', 'Contrôle qualité et traçabilité'), A('obligations_reglementaires', 'Autorisations, certifications et obligations réglementaires'),
          A('prevention_risques_professionnels', 'Assurances et prévention des risques professionnels'), A('dechets_energie', 'Gestion des déchets et consommations énergétiques'),
          A('indicateurs_performance_operationnelle', 'Indicateurs de performance opérationnelle'),
        ] },
      ],
      listes: [
        { k: 'processus', titre: 'Cartographie des processus opérationnels', nom: 'etape', viz: 'flux', ajout: 'Ajouter une étape', cols: [
          T('etape', 'Étape'), A('description', 'Description'), T('acteur', 'Responsable ou équipe') ] },
        { k: 'capacites', titre: 'Tableau des capacités', nom: 'ressource', calc: 'capacite', ajout: 'Ajouter une ressource', cols: [
          T('ressource', 'Ressource (atelier, équipement, équipe…)'), T('unite', 'Unité (par mois, par jour…)'), N('theorique', 'Capacité théorique'), N('reelle', 'Capacité réelle'), N('disponible', 'Capacité disponible') ] },
        { k: 'dependances_operationnelles', titre: 'Matrice des dépendances opérationnelles', nom: 'element', ajout: 'Ajouter une dépendance', cols: [
          T('element', 'Activité ou ressource'), T('depend_de', 'Dépend de'), C('criticite', 'Criticité', ['Faible', 'Moyenne', 'Élevée', 'Critique']), A('alternative', 'Solution de repli') ] },
      ],
    },

    /* ── 13. Organisation et gouvernance ── */
    organisation: {
      cartes: [
        { id: 'regles', titre: 'Règles de gouvernance', champs: [
          A('forme_composition_organes', 'Forme et composition des organes de gouvernance'), A('pouvoirs_dirigeants', 'Pouvoirs et responsabilités de chaque dirigeant'),
          A('nomination_revocation', 'Procédures de nomination et de révocation'), T('frequence_reunions', 'Fréquence des réunions de gouvernance'),
          A('modalites_decision', 'Modalités de prise de décision'), A('regles_signature_contrats', 'Règles de signature des contrats'),
          A('separation_fonctions', 'Séparation des fonctions de décision, exécution et contrôle'), A('gestion_conflits_interets', "Gestion des conflits d'intérêts"),
        ] },
        { id: 'conformite', titre: 'Confidentialité, contrôle et transparence', champs: [
          A('confidentialite_donnees', 'Politique de confidentialité et de protection des données'), A('gestion_documentaire', 'Gestion documentaire et archivage'),
          A('plan_succession', 'Plan de succession des dirigeants'), A('controle_interne', 'Dispositifs de contrôle interne'), A('comite_suivi_strategique', 'Comité de suivi stratégique'),
          A('reporting_indicateurs_frequence', 'Indicateurs et fréquence du reporting'), A('gestion_litiges', 'Gestion des litiges'), A('transparence_financeurs', 'Règles de transparence envers les financeurs'),
        ] },
      ],
      listes: [
        { k: 'droits_vote', titre: 'Répartition des droits de vote', nom: 'detenteur', calc: 'vote', ajout: 'Ajouter un détenteur', cols: [ T('detenteur', 'Détenteur'), N('voix_pct', 'Droits de vote (%)') ] },
        { k: 'seuils_depenses', titre: "Seuils d'autorisation des dépenses", nom: 'niveau', ajout: 'Ajouter un seuil', cols: [ T('niveau', 'Niveau ou fonction'), T('seuil', 'Seuil'), T('approbation', 'Approbation requise') ] },
        { k: 'decisions_responsabilites', titre: 'Tableau des responsabilités décisionnelles', nom: 'decision', calc: 'decisions', ajout: 'Ajouter une décision', cols: [ T('decision', 'Décision'), T('decide', 'Qui décide'), T('execute', 'Qui exécute'), T('controle', 'Qui contrôle') ] },
      ],
    },

    /* ── 14. Ressources humaines ── */
    rh: {
      cartes: [
        { id: 'politique', titre: 'Politique et pilotage RH', champs: [
          A('primes_avantages', 'Primes et avantages sociaux'), T('budget_recrutement', 'Budget de recrutement'), T('budget_formation_annuel', 'Budget annuel de formation'),
          A('plan_developpement_competences', 'Plan de développement des compétences'), A('processus_integration', "Processus d'intégration des nouveaux collaborateurs"),
          A('evaluation_annuelle', 'Évaluation annuelle des performances'), A('absenteisme_rotation', "Indicateurs d'absentéisme et de rotation"),
          A('sante_securite_travail', 'Politique de santé et sécurité au travail'), A('productivite_par_poste', 'Productivité par poste'),
          A('risques_postes_strategiques', 'Risques liés aux postes stratégiques'), A('plan_remplacement_cles', 'Plan de remplacement des collaborateurs clés'),
        ] },
      ],
      listes: [
        { k: 'effectifs_detail', titre: 'Effectifs par service, fonction et localisation', nom: 'service', calc: 'etp', ajout: 'Ajouter une ligne d\'effectif', cols: [
          T('service', 'Service'), T('fonction', 'Fonction'), T('localisation', 'Localisation'), C('categorie', 'Catégorie', ['Salarié', 'Prestataire', 'Bénévole']),
          C('statut_contrat', 'Statut contractuel', ['CDI', 'CDD', 'Intérim', 'Apprentissage', 'Stage', 'Prestation', 'Bénévolat']), N('nb', 'Nombre de personnes'), N('etp', 'Équivalents temps plein (ETP)') ] },
        { k: 'besoins_recrutement', titre: 'Besoins de recrutement à 12, 24 et 36 mois', nom: 'poste', calc: 'plan_rh', ajout: 'Ajouter un besoin', cols: [
          C('horizon', 'Horizon', ['12 mois', '24 mois', '36 mois']), T('poste', 'Poste'), N('nb', 'Nombre'), N('budget', 'Budget de recrutement') ] },
        { k: 'fiches_poste', titre: 'Fiches de poste détaillées', nom: 'poste', ajout: 'Ajouter une fiche de poste', cols: [
          T('poste', 'Poste'), A('missions', 'Missions'), T('qualification', 'Niveau de qualification requis'), A('competences_techniques', 'Compétences techniques'), A('competences_comportementales', 'Compétences comportementales') ] },
      ],
    },

    /* ── 15. Calendrier de mise en œuvre ── */
    calendrier: {
      listes: [
        { k: 'phases', base: 'phases', nom: 'nom', calc: 'gantt', titre: 'Suivi détaillé de chaque phase', cols: [
          D('debut_reel', 'Date de démarrage réelle'), D('fin_reelle', 'Date de fin réelle'), A('jalons_strategiques', 'Jalons stratégiques'), C('priorite', 'Priorité', ['Haute', 'Moyenne', 'Basse']),
          T('duree_estimee', 'Durée estimée'), T('duree_reelle', 'Durée réelle'), A('ressources_necessaires', 'Ressources nécessaires'), C('chemin_critique', 'Sur le chemin critique ?', OUINON),
          N('avancement_physique', 'Avancement physique (%)'), N('avancement_financier', 'Avancement financier (%)'), N('budget_revise', 'Budget révisé'),
          A('causes_retard', 'Causes des retards'), A('mesures_correctives', 'Mesures correctives'), A('points_decision', 'Points de décision et validations obligatoires'),
          A('conditions_passage', 'Conditions de passage à la phase suivante'), A('echeances_reglementaires', 'Échéances réglementaires'), T('calendrier_decaissement_phase', 'Calendrier de décaissement'),
          A('indicateurs_reussite_phase', 'Indicateurs de réussite de la phase') ] },
      ],
    },

    /* ── 16. Plan financier ── */
    plan_financier: {
      cartes: [
        { id: 'cadre', titre: 'Référentiel, change, fiscalité et cohérence', champs: [
          C('referentiel_resultat', 'Référentiel pour le résultat d\'exploitation', ['EBITDA', 'EBE (référentiel français)', 'Autre']), T('rotation_stocks', 'Rotation des stocks'),
          A('risque_change', 'Risques de change pour les projets internationaux'), A('fiscalite_par_pays', 'Fiscalité applicable par pays'),
          A('dividendes', 'Distribution éventuelle de dividendes'), A('simulation_retard_financement', 'Simulation de retards de financement'),
          A('coherence_financement_besoins', 'Cohérence entre financement recherché et besoins réels'),
        ] },
      ],
      listes: [
        { k: 'hypotheses_financieres', titre: 'Hypothèses financières documentées', nom: 'hypothese', calc: 'fiabilite', ajout: 'Ajouter une hypothèse', cols: [
          T('hypothese', 'Hypothèse'), T('valeur', 'Valeur'), T('source', 'Source ou justification'), D('date', 'Date'), C('fiabilite', 'Fiabilité', ['Vérifiée', 'Estimée', 'Déclarative']) ] },
        { k: 'sensibilite', titre: 'Analyse de sensibilité', nom: 'variable', ajout: 'Ajouter un test', cols: [
          C('variable', 'Variable', ['Prix', 'Volumes', 'Coûts', 'Délais de paiement', 'Autre']), T('variation', 'Variation testée (%)'), T('impact_ca', 'Effet sur le chiffre d\'affaires'), T('impact_resultat', 'Effet sur le résultat'), A('commentaire', 'Commentaire') ] },
        { k: 'service_dette', titre: 'Couverture du service de la dette (DSCR)', nom: 'annee', calc: 'dscr', ajout: 'Ajouter une année', cols: [
          T('annee', 'Année'), N('flux_disponible', 'Flux de trésorerie disponible'), N('service_dette', 'Service de la dette (capital + intérêts)') ] },
      ],
    },

    /* ── 17. Analyse des risques ── */
    risques: {
      listes: [
        { k: 'items', base: 'items', nom: 'description', calc: 'risque', titre: 'Registre détaillé et cartographie des risques', cols: [
          C('categorie', 'Catégorie', ['Financier', 'Commercial', 'Juridique', 'Humain', 'Technique', 'Climatique', 'Informatique', 'Réputationnel']),
          A('causes_declencheurs', 'Causes et événements déclencheurs'), C('horizon', 'Horizon', ['Court terme', 'Moyen terme', 'Long terme']), A('justification_probabilite', 'Probabilité justifiée'),
          T('impact_financier', 'Impact financier estimé'), A('impact_operationnel', 'Impact opérationnel'), A('mesures_limitation', 'Mesures de limitation des conséquences'),
          A('plan_continuite', "Plan de continuité d'activité"), T('budget_prevention', 'Budget de prévention'), D('date_reevaluation', 'Date de réévaluation'),
          A('assurance_transfert', 'Assurance ou dispositif de transfert du risque'), A('scenario_extreme', 'Scénario extrême et test de résistance') ] },
      ],
    },

    /* ── 18. Impact ── */
    impact: {
      cartes: [
        { id: 'theorie', titre: 'Théorie du changement', champs: [
          A('theorie_changement', 'Théorie du changement'), A('probleme_societal', 'Problème sociétal ou environnemental ciblé'), A('activites_realisees', 'Activités réalisées'), A('resultats_directs', 'Résultats directs'),
          A('changements_moyen_long_terme', 'Changements attendus à moyen et long terme'), A('caracteristiques_publics', 'Caractéristiques des publics bénéficiaires (uniquement si pertinent et collecté légalement)'),
        ] },
        { id: 'emploi_local', titre: 'Emploi, ancrage local et inclusion', champs: [
          T('emplois_crees', 'Emplois créés'), T('emplois_maintenus', 'Emplois maintenus'), A('qualite_durabilite_emplois', 'Qualité et durabilité des emplois'), T('revenus_locaux', 'Revenus générés localement'),
          T('part_achats_locaux', 'Part des achats auprès des fournisseurs locaux (%)'), A('formation_professionnelle', 'Contribution à la formation professionnelle'), A('inclusion_emploi', "Inclusion des populations éloignées de l'emploi"),
        ] },
        { id: 'environnement', titre: 'Environnement et durabilité', champs: [
          T('consommation_energetique', 'Consommation énergétique'), T('emissions_ges', 'Émissions de gaz à effet de serre'), A('eau_dechets', "Gestion de l'eau et des déchets"), A('economie_circulaire', 'Économie circulaire'),
          A('effets_negatifs', 'Effets négatifs potentiels'), A('odd', 'Contribution aux Objectifs de développement durable (ODD)'), T('cout_production_impact', "Coût de production des résultats d'impact"),
          A('perennite_effets', 'Pérennité des effets après la fin du financement'),
        ] },
      ],
      listes: [
        { k: 'indicateurs', base: 'indicateurs', nom: 'nom', calc: 'impact_ind', titre: "Tableau de bord d'impact", cols: [
          T('cible_annuelle', 'Cible annuelle'), T('collecte_verification', 'Méthode de collecte et de vérification'), C('niveau_preuve', 'Niveau de preuve', ['Vérifié', 'Estimé', 'Déclaratif']), T('odd_lie', 'ODD concerné') ] },
      ],
    },

    /* ── 19. Recherche de financement ── */
    financement: {
      cartes: [
        { id: 'besoin', titre: 'Besoin, apports et coût', champs: [
          T('besoin_total', 'Besoin total de financement'), T('apports_numeraire', 'Apports en numéraire'), T('apports_nature', 'Apports en nature'),
          A('conditions_eligibilite', "Conditions d'éligibilité aux financements"), A('garanties_propose', 'Garanties et sûretés éventuellement proposées'),
          A('capacite_remboursement', 'Capacité de remboursement'), A('ratios_couverture', 'Ratios de couverture'), A('scenarios_dilution', 'Scénarios de dilution du capital'),
        ] },
        { id: 'investisseurs', titre: 'Conditions et risques', champs: [
          T('methode_valorisation', 'Méthode de valorisation utilisée'), A('conditions_investisseurs', 'Conditions proposées aux investisseurs'), A('rentabilite_attendue_hypotheses', 'Rentabilité attendue et hypothèses associées'),
          T('duree_mobilisation_fonds', 'Durée de mobilisation des fonds'), A('risques_financement_partiel', 'Risques en cas de financement partiel'), A('plan_financement_alternatif', 'Plan de financement alternatif'),
          A('calendrier_reporting_financeurs', 'Calendrier de reporting aux financeurs'),
        ] },
      ],
      listes: [
        { k: 'sources_financement', titre: 'Sources de financement', nom: 'organisme', calc: 'sources_fin', ajout: 'Ajouter une source', cols: [
          C('type_source', 'Type', ['Prêt', 'Subvention', 'Don', 'Capital', 'Quasi-fonds propres', 'Financement participatif', 'Autre']), T('organisme', 'Organisme ou financeur'), N('montant', 'Montant'),
          C('statut', 'Statut', ['Obtenu', 'En cours', 'Envisagé']), N('cout_total', 'Coût total du financement'), A('eligibilite', 'Conditions d\'éligibilité') ] },
        { k: 'tranches_financement', titre: 'Étapes déclenchées par chaque tranche', nom: 'tranche', ajout: 'Ajouter une tranche', cols: [
          T('tranche', 'Tranche'), N('montant', 'Montant'), D('date', 'Date prévue'), A('etape_declenchee', 'Étape déclenchée') ] },
        { k: 'justificatifs_financement', titre: 'Justificatifs nécessaires', nom: 'piece', ajout: 'Ajouter un justificatif', cols: [
          T('piece', 'Justificatif'), T('financeur', 'Demandé par'), C('statut_piece', 'Statut', ['À fournir', 'Fourni', 'Vérifié']) ] },
      ],
    },

    /* ── 20. Annexes ── */
    annexes: {
      listes: [
        { k: 'items', base: 'items', nom: 'nom', calc: 'annexe', titre: 'Registre documentaire', cols: [
          C('categorie', 'Catégorie', ['CV et diplômes', 'Juridique et immatriculation', 'Capital', 'Étude de marché', 'Enquête', 'Devis fournisseur', 'Contrat ou lettre d\'intention', 'Propriété intellectuelle', 'Certification ou autorisation', 'Photographie', 'Plan technique', 'Bilan et comptes', 'Financement', 'Tableau financier', 'Organigramme et fiche de poste', 'Calendrier', 'Assurance', 'Impact', 'Audit', 'Bibliographie', 'Autre']),
          D('date_document', 'Date du document'), T('version', 'Version'), C('statut_verification', 'Statut de vérification', ['Vérifié', 'À vérifier', 'Non vérifié']), T('rubriques_liees', 'Rubriques concernées') ] },
      ],
    },
  };

  /* ═══════════════ OUTILS ═══════════════ */
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  const liste = v => (Array.isArray(v) ? v : []);
  const nombre = v => { if (typeof v === 'number') return isFinite(v) ? v : null; if (!has(v)) return null; const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; };
  const fmtNb = (n, d) => (n === null || n === undefined || !isFinite(n)) ? '' : n.toLocaleString('fr-FR', { maximumFractionDigits: d === undefined ? 1 : d });
  const rubriques = () => Object.keys(SPEC);
  const cartes = r => (SPEC[r] && SPEC[r].cartes) || [];
  const listes = r => (SPEC[r] && SPEC[r].listes) || [];
  const aDesAjouts = r => !!SPEC[r];
  const ligneVide = (l, ligne) => !l.cols.some(c => has(ligne && ligne[c.k]));

  /* Libellés des champs texte d'une rubrique : {clé: libellé} — pour les schémas de lecture. */
  function libelles(r) { const o = {}; cartes(r).forEach(c => c.champs.forEach(f => { o[f.k] = f.l; })); return o; }

  /* Lignes utiles d'une liste (vides écartées). Une liste « base » prolonge un tableau existant : ses lignes sont celles de ce tableau. */
  function lignes(data, l) {
    const src = liste((data || {})[l.k]).filter(x => x && typeof x === 'object');
    return l.base ? src : src.filter(x => !ligneVide(l, x));
  }

  /* Y a-t-il quelque chose d'enrichi à afficher pour cette rubrique ? */
  function contientDonnees(r, data) {
    data = data || {};
    if (cartes(r).some(c => c.champs.some(f => has(data[f.k])))) return true;
    return listes(r).some(l => {
      if (l.base) {
        if (lignes(data, l).some(x => l.cols.some(c => has(x[c.k])))) return true;
        if (l.calc === 'risque') return risquesCalcules(data.items).some(x => x.score !== null);                       // cartographie calculable
        if (l.calc === 'gantt') return liste(data.phases).some(p => p && has(p.nom) && temps(p.debut) !== null && temps(p.fin) !== null);   // diagramme de Gantt
        if (l.calc === 'impact_ind') return indicateursImpact(data.indicateurs).some(x => x.progression !== null);
        return false;
      }
      return lignes(data, l).length > 0 && !(l.defaut && lignes(data, l).every(x => !l.cols.some(c => c.k !== l.nom && has(x[c.k]))));
    });
  }

  /* ═══════════════ CALCULS (aucun chiffre n'est inventé : tout vient de la saisie) ═══════════════ */

  /* Objectifs SMART : S = objectif, M = indicateur + cible, A = atteignable renseigné, R = atteignable ≠ Non, T = échéance. */
  function smart(o) {
    const s = has(o.objectif), m = has(o.indicateur) && has(o.valeur_cible), a = has(o.atteignable), r = a && o.atteignable !== 'Non', t = has(o.echeance);
    const manquants = []; if (!s) manquants.push('objectif'); if (!m) manquants.push('indicateur et valeur cible'); if (!a) manquants.push('réalisme'); if (!t) manquants.push('échéance');
    return { s, m, a, r, t, complet: s && m && a && r && t, manquants };
  }

  /* Matrice de priorisation : score = gravité × fréquence × urgence, ramené sur 100. */
  function prioriser(rows) {
    return rows.filter(r => has(r.probleme)).map(r => {
      const g = nombre(r.gravite), f = nombre(r.frequence), u = nombre(r.urgence);
      const ok = g && f && u;
      return { probleme: r.probleme, gravite: g, frequence: f, urgence: u, score: ok ? Math.round(g * f * u / 125 * 100) : null };
    }).sort((a, b) => (b.score === null ? -1 : b.score) - (a.score === null ? -1 : a.score));
  }

  /* Plan d'action SWOT : priorité = probabilité × impact (sur 25) ; niveau déduit. Le risque « après » est celui que l'auteur déclare. */
  function niveauPriorite(score) { if (score === null) return null; return score >= 15 ? 'Critique' : score >= 10 ? 'Élevée' : score >= 5 ? 'Moyenne' : 'Faible'; }
  function planSwot(rows) {
    return rows.filter(r => has(r.element)).map(r => {
      const p = nombre(r.probabilite), i = nombre(r.impact_note), score = p && i ? p * i : null;
      return Object.assign({}, r, { score, priorite: niveauPriorite(score) });
    }).sort((a, b) => (b.score === null ? -1 : b.score) - (a.score === null ? -1 : a.score));
  }

  /* Base de matrice TOWS à partir des éléments de la SWOT (à relire et réécrire par l'auteur). */
  function proposerTows(elements) {
    const par = k => liste(elements).filter(e => e && has(e.titre) && e.cat === k).map(e => e.titre).slice(0, 3);
    const F = par('forces'), W = par('faiblesses'), O = par('opportunites'), M = par('menaces');
    const croise = (a, b, verbe) => a.length && b.length ? a.map((x, i) => `${verbe} « ${x} » pour ${verbe === 'S\'appuyer sur' ? 'saisir' : 'traiter'} « ${b[i % b.length]} » → action à définir.`).join('\n') : '';
    return {
      tows_so: croise(F, O, "S'appuyer sur"), tows_st: F.length && M.length ? F.map((x, i) => `S'appuyer sur « ${x} » pour se protéger de « ${M[i % M.length]} » → action à définir.`).join('\n') : '',
      tows_wo: W.length && O.length ? W.map((x, i) => `Corriger « ${x} » pour pouvoir saisir « ${O[i % O.length]} » → action à définir.`).join('\n') : '',
      tows_wt: W.length && M.length ? W.map((x, i) => `Réduire « ${x} » pour limiter l'effet de « ${M[i % M.length]} » → action à définir.`).join('\n') : '',
    };
  }

  /* Rentabilité par segment : LTV / CAC ; un ratio ≥ 3 est le repère courant. Jamais calculé sans les deux valeurs. */
  function ltvCac(rows) {
    return rows.filter(r => has(r.segment)).map(r => {
      const cac = nombre(r.cac_segment), ltv = nombre(r.ltv_segment);
      const ratio = cac && ltv ? ltv / cac : null;
      return Object.assign({}, r, { ratio, lecture: ratio === null ? '' : ratio >= 3 ? 'Rentable' : ratio >= 1 ? 'À surveiller' : 'Non rentable' });
    });
  }

  /* Hypothèses : part des hypothèses critiques validées / invalidées. */
  function validation(rows) {
    const l = rows.filter(r => has(r.hypothese)), crit = l.filter(r => r.critique === 'Oui');
    const compte = (a, s) => a.filter(r => r.statut_validation === s).length;
    return { total: l.length, critiques: crit.length, critiquesValidees: compte(crit, 'Validée'), critiquesInvalidees: compte(crit, 'Invalidée'), critiquesNonTestees: crit.filter(r => !has(r.statut_validation) || r.statut_validation === 'Non testée').length,
      pctCritiquesValidees: crit.length ? Math.round(compte(crit, 'Validée') / crit.length * 100) : null };
  }

  /* Campagnes : écarts réel − prévu et coût par prospect, uniquement quand les deux valeurs existent. */
  function campagnes(rows) {
    return rows.filter(r => has(r.campagne)).map(r => {
      const bp = nombre(r.budget_prevu), br = nombre(r.budget_reel), pp = nombre(r.prospects_prevus), pr = nombre(r.prospects_reels), cp = nombre(r.conversions_prevues), cr = nombre(r.conversions_reelles);
      return Object.assign({}, r, {
        ecart_budget: bp !== null && br !== null ? br - bp : null,
        cout_prospect_prevu: bp !== null && pp ? bp / pp : null, cout_prospect_reel: br !== null && pr ? br / pr : null,
        taux_conv_prevu: pp && cp !== null ? cp / pp * 100 : null, taux_conv_reel: pr && cr !== null ? cr / pr * 100 : null,
        realise: has(r.budget_reel) || has(r.prospects_reels) || has(r.conversions_reelles),
      });
    });
  }

  /* Objectif / réalisé : écart en %, uniquement quand les deux valeurs existent. */
  function objectifsRealises(rows) {
    return rows.filter(r => has(r.libelle) || has(r.objectif)).map(r => {
      const o = nombre(r.objectif), re = nombre(r.realise);
      return Object.assign({}, r, { atteinte: o && re !== null ? re / o * 100 : null });
    });
  }
  /* Entonnoir : taux de transformation d'une étape = effectif ÷ effectif de l'étape précédente. */
  function entonnoir(rows) {
    const l = rows.filter(r => has(r.etape));
    return l.map((r, i) => { const n = nombre(r.nb), p = i ? nombre(l[i - 1].nb) : null; return Object.assign({}, r, { taux: n !== null && p ? n / p * 100 : null }); });
  }
  /* Pipeline pondéré : montant × probabilité, uniquement pour les lignes qui ont les deux valeurs. */
  function pipeline(rows) {
    const l = rows.filter(r => has(r.prospect)).map(r => { const m = nombre(r.montant), p = nombre(r.probabilite); return Object.assign({}, r, { pondere: m !== null && p !== null ? m * p / 100 : null }); });
    const somme = k => l.reduce((a, r) => a + (nombre(r[k]) || 0), 0);
    return { lignes: l, total: somme('montant'), pondere: l.reduce((a, r) => a + (r.pondere || 0), 0), incomplets: l.filter(r => r.pondere === null).length };
  }
  /* Capacités : taux de réalisation = réelle ÷ théorique. */
  function capacites(rows) {
    return rows.filter(r => has(r.ressource)).map(r => { const t = nombre(r.theorique), re = nombre(r.reelle); return Object.assign({}, r, { taux: t && re !== null ? re / t * 100 : null }); });
  }
  /* Droits de vote : total attendu 100 %. */
  function votes(rows) { const l = rows.filter(r => has(r.detenteur)); return { lignes: l, total: l.reduce((a, r) => a + (nombre(r.voix_pct) || 0), 0) }; }
  /* Décisions : alerte quand une même personne décide ET contrôle, ou exécute ET contrôle. */
  const norm = s => String(s || '').trim().toLowerCase();
  function decisions(rows) {
    return rows.filter(r => has(r.decision)).map(r => {
      const alertes = []; if (has(r.controle) && norm(r.controle) === norm(r.decide)) alertes.push('décide et contrôle'); if (has(r.controle) && norm(r.controle) === norm(r.execute)) alertes.push('exécute et contrôle');
      return Object.assign({}, r, { alertes });
    });
  }
  /* Effectifs : totaux de personnes et d'ETP par catégorie (ETP uniquement quand il est saisi). */
  function effectifs(rows) {
    const l = rows.filter(r => has(r.service) || has(r.fonction)), cat = {};
    l.forEach(r => { const k = r.categorie || 'Non précisé'; cat[k] = cat[k] || { nb: 0, etp: 0, etpSaisi: false }; cat[k].nb += nombre(r.nb) || 0; if (nombre(r.etp) !== null) { cat[k].etp += nombre(r.etp); cat[k].etpSaisi = true; } });
    return { lignes: l, parCategorie: cat, nb: l.reduce((a, r) => a + (nombre(r.nb) || 0), 0), etp: l.reduce((a, r) => a + (nombre(r.etp) || 0), 0), etpComplet: l.length > 0 && l.every(r => nombre(r.etp) !== null) };
  }
  /* Plan RH sur trois ans : effectif de départ (somme des « nombre de personnes » saisis) + recrutements cumulés aux horizons 12, 24 et 36 mois. */
  function planRh(besoins, effectifsRows) {
    const b = besoins.filter(r => has(r.poste) || has(r.horizon)), depart = effectifsRows.filter(r => nombre(r.nb) !== null).length ? effectifs(effectifsRows).nb : null;
    const annees = [['12 mois', 'Année 1'], ['24 mois', 'Année 2'], ['36 mois', 'Année 3']];
    let cumulNb = 0, cumulBudget = 0;
    return annees.map(([h, lab]) => {
      const lh = b.filter(r => r.horizon === h); const nb = lh.reduce((a, r) => a + (nombre(r.nb) || 0), 0), bud = lh.reduce((a, r) => a + (nombre(r.budget) || 0), 0);
      cumulNb += nb; cumulBudget += bud;
      return { annee: lab, horizon: h, recrutements: nb, budget: bud, cumulRecrutements: cumulNb, cumulBudget, effectifFin: depart !== null ? depart + cumulNb : null, postes: lh.map(r => r.poste).filter(has) };
    });
  }
  /* Calendrier : décalages et alertes de retard. `maintenant` est injectable (tests). */
  const jourMs = 86400000;
  const temps = s => { if (!has(s)) return null; const t = Date.parse(String(s).length <= 7 ? s + '-01' : s); return isNaN(t) ? null : t; };
  function alertesRetard(phases, maintenant) {
    const now = typeof maintenant === 'number' ? maintenant : Date.now(), out = [];
    phases.filter(p => has(p.nom)).forEach(p => {
      const fin = temps(p.fin), reel = temps(p.fin_reelle), av = nombre(p.avancement_physique); let msg = '';
      if (fin !== null && reel !== null && reel > fin) msg = `terminée avec ${Math.round((reel - fin) / jourMs)} jour(s) de retard`;
      else if (fin !== null && reel === null && p.statut !== 'termine' && now > fin) msg = `échéance dépassée de ${Math.round((now - fin) / jourMs)} jour(s)` + (av !== null ? ` — avancement ${fmtNb(av, 0)} %` : '');
      else if (p.statut === 'retard') msg = 'marquée en retard par l\'auteur';
      if (msg) out.push({ nom: p.nom, message: msg });
    });
    return out;
  }
  /* Hypothèses : sans statut de fiabilité, la donnée est comptée comme déclarative — jamais comme vérifiée. */
  function fiabilites(rows) { const l = rows.filter(r => has(r.hypothese)); const c = { 'Vérifiée': 0, 'Estimée': 0, 'Déclarative': 0 }; l.forEach(r => { c[has(r.fiabilite) ? r.fiabilite : 'Déclarative']++; }); return { total: l.length, comptes: c }; }
  /* DSCR = flux disponible ÷ service de la dette ; repère courant ≥ 1,2. Calculé seulement avec les deux valeurs saisies. */
  function dscr(rows) {
    return rows.filter(r => has(r.annee)).map(r => { const f = nombre(r.flux_disponible), s = nombre(r.service_dette), ratio = f !== null && s ? f / s : null;
      return Object.assign({}, r, { ratio, lecture: ratio === null ? '' : ratio >= 1.2 ? 'Couverture confortable' : ratio >= 1 ? 'Couverture juste' : 'Couverture insuffisante' }); });
  }
  /* Risques : niveaux faible/moyen/eleve/critique → 1 à 4 ; criticité = probabilité × impact (sur 16). */
  const NIVEAU_RISQUE = { faible: 1, moyen: 2, eleve: 3, critique: 4, 'élevé': 3 };
  const LABEL_RISQUE = { 1: 'Faible', 2: 'Moyen', 3: 'Élevé', 4: 'Critique' };
  const niveauRisque = v => NIVEAU_RISQUE[norm(v)] || null;
  function risquesCalcules(items) {
    return liste(items).filter(r => r && has(r.description)).map((r, i) => {
      const p = niveauRisque(r.probabilite), im = niveauRisque(r.impact), score = p && im ? p * im : null;
      return Object.assign({}, r, { num: i + 1, p, im, score, criticite: score === null ? null : score >= 12 ? 'Critique' : score >= 8 ? 'Élevée' : score >= 4 ? 'Moyenne' : 'Faible', residuel: LABEL_RISQUE[niveauRisque(r.risque_residuel)] || '' });
    });
  }
  /* Indicateurs d'impact : progression = (actuelle − initiale) ÷ (cible − initiale), si les trois valeurs sont numériques. */
  function indicateursImpact(rows) {
    return liste(rows).filter(r => r && has(r.nom)).map(r => {
      const i0 = nombre(r.situation_initiale), a = nombre(r.valeur_actuelle), c = nombre(r.valeur_cible);
      return Object.assign({}, r, { progression: i0 !== null && a !== null && c !== null && c !== i0 ? Math.round((a - i0) / (c - i0) * 100) : null, preuve: has(r.niveau_preuve) ? r.niveau_preuve : 'Non précisé' });
    });
  }
  /* Sources de financement : obtenu, en cours, envisagé ; reste à mobiliser = besoin total − obtenu (si le besoin est saisi). */
  function sourcesFinancement(rows, besoinTotal) {
    const l = rows.filter(r => has(r.organisme) || has(r.type_source)), somme = (st) => l.filter(r => r.statut === st).reduce((a, r) => a + (nombre(r.montant) || 0), 0);
    const besoin = nombre(besoinTotal), obtenu = somme('Obtenu'), enCours = somme('En cours'), envisage = somme('Envisagé');
    return { lignes: l, obtenu, enCours, envisage, sansStatut: l.filter(r => !has(r.statut)).length, coutTotal: l.reduce((a, r) => a + (nombre(r.cout_total) || 0), 0), besoin,
      reste: besoin !== null ? Math.max(0, besoin - obtenu) : null, couverture: besoin ? Math.round((obtenu + enCours + envisage) / besoin * 100) : null };
  }

  /* Produits : fiche calculée à partir du tableau « produits » (nom, prix_vente, cout_revient) et des champs de la fiche. */
  function produitsCalcules(items) {
    const lst = liste(items).filter(it => it && has(it.nom)).map(it => {
      const prix = nombre(it.prix_vente), tva = nombre(it.tva_pct);
      const comps = ['cout_matieres', 'cout_main_oeuvre', 'cout_emballage', 'cout_logistique_unitaire', 'autres_couts_variables'].map(k => nombre(it[k]));
      const aDesComps = comps.some(c => c !== null), variables = aDesComps ? comps.reduce((a, c) => a + (c || 0), 0) : null;
      const coutRevient = variables !== null ? variables : nombre(it.cout_revient);
      const margeBrute = prix !== null && coutRevient !== null ? prix - coutRevient : null;
      const volAn = nombre(it.volume_annuel_prevu) !== null ? nombre(it.volume_annuel_prevu) : (nombre(it.volume_mensuel_prevu) !== null ? nombre(it.volume_mensuel_prevu) * 12 : null);
      const cap = nombre(it.capacite_production_annuelle);
      const margeContrib = prix !== null && variables !== null ? prix - variables : null;
      const base = margeContrib !== null ? margeContrib : margeBrute;
      return { nom: it.nom, sku: it.sku || '', prix, prixTtc: prix !== null && tva !== null ? prix * (1 + tva / 100) : null, coutRevient,
        methodeCout: variables !== null ? 'Somme des coûts saisis dans la fiche' : (coutRevient !== null ? 'Coût de revient du catalogue' : ''),
        margeBrute, tauxMarque: margeBrute !== null && prix ? margeBrute / prix * 100 : null, margeContrib, volAn,
        ca: prix !== null && volAn !== null ? prix * volAn : null, margeTotale: base !== null && volAn !== null ? base * volAn : null,
        utilisation: cap && volAn !== null ? volAn / cap * 100 : null, stade: it.stade_cycle_vie || '' };
    });
    const totalMarge = lst.reduce((a, p) => a + (p.margeTotale || 0), 0);
    lst.forEach(p => { p.contribution = p.margeTotale !== null && totalMarge > 0 ? p.margeTotale / totalMarge * 100 : null; });
    return lst;
  }
  function classement(prods, cle) { return prods.filter(p => p[cle] !== null && p[cle] !== undefined).slice().sort((a, b) => b[cle] - a[cle]); }

  /* ═══════════════ FICHE D'IDENTITÉ, ORGANIGRAMME AUTOMATIQUE, RÉSUMÉ ═══════════════ */
  function ficheIdentite(bp) {
    bp = bp || {}; const s = bp.sections || {}, g = s.infos_generales || {};
    const lieu = [g.ville, g.region, g.pays].filter(has).join(', ');
    const immat = [g.type_numero_immatriculation, g.numero_immatriculation || g.numero_siren_siret].filter(has).join(' ');
    const paires = [
      ['Nom du projet', bp.nom_projet || g.nom_projet], ['Accroche', bp.slogan || g.slogan], ['Secteur', [bp.secteur || g.secteur, g.sous_secteur].filter(has).join(' — ')],
      ['Forme juridique', g.forme_juridique_actuelle], ['Immatriculation', immat], ['Identification fiscale', g.numero_identification_fiscale],
      ['Statut de l\'entreprise', g.statut_entreprise || g.stade], ['Nature de l\'activité', g.nature_activite], ['Implantation', lieu], ['Date de création', g.date_creation],
      ['Responsable', [g.responsable, g.responsable_poste].filter(has).join(' — ')], ['Équipe', has(g.nb_collaborateurs) ? g.nb_collaborateurs + ' collaborateur(s)' : ''],
      ['Marchés couverts', g.marches_couverts], ['Marchés envisagés', g.marches_envisages], ['Site internet', g.site_web],
    ];
    return paires.filter(p => has(p[1]));
  }
  function noeudsOrganigrammeAuto(g) {
    g = g || {}; const membres = liste(g.membres_equipe).filter(m => m && (has(m.nom) || has(m.prenom)));
    if (!membres.length && !has(g.responsable)) return [];
    const nom = m => [m.prenom, m.nom].filter(has).join(' ');
    const racine = { id: 'r', nom: has(g.responsable) ? g.responsable : nom(membres[0]), fonction: has(g.responsable_poste) ? g.responsable_poste : (membres[0] && membres[0].fonction) || '', detail: '', parent_id: '' };
    const autres = membres.filter((m, i) => !(i === 0 && !has(g.responsable)) && nom(m) !== racine.nom);
    return [racine].concat(autres.map((m, i) => ({ id: 'm' + (i + 1), nom: nom(m), fonction: m.fonction || '', detail: m.disponibilite === 'temps_partiel' ? 'Temps partiel' : '', parent_id: 'r' })));
  }

  const coupe = (t, n) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
  /* Résumé exécutif généré : reprend UNIQUEMENT la saisie (champ enrichi, sinon champ d'origine de la rubrique) ;
     ce qui manque est listé, jamais comblé. mode 'court' (1 page) ou 'long' (2 pages). */
  function resume(bp, mode) {
    bp = bp || {}; const s = bp.sections || {}, r = s.resume_executif || {}, pb = s.probleme || {}, so = s.solution || {}, ma = s.marche || {}, bm = s.business_model || {}, pr = s.presentation || {}, fi = s.financement || {};
    const premier = (...v) => { for (const x of v) if (has(x)) return String(x).trim(); return ''; };
    const objectifs = lignes(r, listes('resume_executif')[0]).map(o => '• ' + [o.objectif, o.echeance && '(' + o.echeance + ')', o.indicateur && '— ' + o.indicateur].filter(has).join(' ')).join('\n');
    const montantFin = premier(r.besoin_total_financement, fi.montant);
    const items = [
      ['Opportunité', premier(r.opportunite)], ['Problème prioritaire', premier(r.probleme, pb.description)], ['Solution proposée', premier(r.solution, so.description)],
      ['Avantage concurrentiel', premier(r.avantage_demontrable, ma.avantage_concurrentiel)], ['Stade et réalisations', premier(r.stade_realisations, pr.etapes_franchies)],
      ['Marché accessible', premier(r.marche_accessible_resume, has(ma.sam) ? 'SAM : ' + ma.sam : '', r.marche)],
      ['Modèle de revenus et coûts', premier(r.modele_revenus_couts, [bm.revenus, bm.couts].filter(has).join('\n'))],
      ["Chiffre d'affaires", premier(r.ca_realise_previsionnel, has((s.presentation || {}).ca_realise_a_ce_jour) ? 'Réalisé à ce jour : ' + s.presentation.ca_realise_a_ce_jour : '')],
      ['Besoin de financement', [montantFin && 'Besoin total : ' + montantFin, has(r.montant_securise) && 'Déjà sécurisé : ' + r.montant_securise].filter(Boolean).join(' · ') || premier(r.besoins)],
      ['Utilisation des fonds', premier(r.utilisation_fonds_resume, fi.utilisation)], ['Rentabilité et trésorerie', premier(r.rentabilite_tresorerie)],
      ['Risques et maîtrise', premier(r.risques_maitrise)], ['Objectifs prioritaires (12 à 36 mois)', objectifs || premier(r.objectifs)], ['Proposition aux financeurs', premier(r.proposition_financeurs)],
    ];
    const n = mode === 'court' ? 230 : 900;
    return { mode: mode === 'court' ? 'court' : 'long', blocs: items.filter(i => i[1]).map(i => ({ titre: i[0], texte: i[0].startsWith('Objectifs') ? i[1] : coupe(i[1], n) })), manquants: items.filter(i => !i[1]).map(i => i[0]) };
  }

  /* ═══════════════ RENDU HTML (lecture : vue + dossier) ═══════════════ */
  const escDefaut = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const CSS = `.ench-g{display:grid;grid-template-columns:1fr 1fr;gap:6px 22px;margin:0 0 8px}.ench-g .ench-f{min-width:0}.ench-g .ench-f.full{grid-column:1/-1}
.ench-l{font-size:.78em;text-transform:uppercase;letter-spacing:.04em;opacity:.65;margin:0 0 2px}.ench-v{margin:0;white-space:pre-wrap;line-height:1.5;overflow-wrap:anywhere}
.ench-t{width:100%;border-collapse:collapse;font-size:.88em;margin:0 0 8px}.ench-t th,.ench-t td{border-bottom:1px solid rgba(128,128,128,.3);padding:5px 7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.ench-t th{font-size:.8em;opacity:.7}
.ench-fr{margin:0 0 8px;padding:0 0 0 14px;border-left:2px solid rgba(128,128,128,.45)}.ench-fr .p{position:relative;padding:0 0 9px 8px}.ench-fr .p:before{content:"";position:absolute;left:-20px;top:4px;width:9px;height:9px;border-radius:50%;background:currentColor;opacity:.75}
.ench-fr .d{font-size:.8em;opacity:.65;margin:0}.ench-fr .t{margin:0;font-weight:600}.ench-fr .x{margin:1px 0 0;font-size:.9em;opacity:.85}
.ench-ar{display:grid;grid-template-columns:1fr 26px 1.1fr 26px 1fr;align-items:stretch;gap:6px;margin:0 0 8px}.ench-ar .col{display:flex;flex-direction:column;gap:5px}.ench-ar .bx{border:1px solid rgba(128,128,128,.45);border-radius:4px;padding:5px 7px;font-size:.85em}.ench-ar .tronc{justify-content:center}.ench-ar .tronc .bx{font-weight:700;text-align:center;border-width:2px}.ench-ar .ar{align-self:center;text-align:center;opacity:.6}.ench-ar h5{margin:0 0 2px;font-size:.78em;text-transform:uppercase;letter-spacing:.04em;opacity:.65}
.ench-fl{display:flex;flex-wrap:wrap;gap:6px;align-items:stretch;margin:0 0 8px}.ench-fl .e{flex:1 1 130px;border:1px solid rgba(128,128,128,.45);border-radius:4px;padding:6px 8px;font-size:.85em}.ench-fl .e b{display:block}.ench-fl .e span{opacity:.75}
.ench-b{display:grid;grid-template-columns:minmax(90px,1.1fr) 3fr auto;gap:4px 8px;align-items:center;margin:0 0 8px;font-size:.88em}.ench-b i{display:block;height:9px;border-radius:5px;background:currentColor;opacity:.55}.ench-b span.v{font-variant-numeric:tabular-nums}
.ench-tows{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:0 0 8px}.ench-tows>div{border:1px solid rgba(128,128,128,.45);border-radius:4px;padding:7px 9px;font-size:.88em}.ench-tows h5{margin:0 0 3px;font-size:.82em}.ench-tows p{margin:0;white-space:pre-wrap}
.ench-n{font-size:.8em;opacity:.7;margin:0 0 8px}.ench-w{font-size:.85em;margin:0 0 8px;font-weight:600}.ench-pill{display:inline-block;border:1px solid rgba(128,128,128,.5);border-radius:10px;padding:0 7px;font-size:.78em}
.ench-gt{display:grid;grid-template-columns:minmax(110px,1fr) 4fr;gap:4px 8px;align-items:center;font-size:.85em;margin:0 0 8px}.ench-gt .tr{position:relative;height:14px;background:rgba(128,128,128,.16);border-radius:3px}.ench-gt .br{position:absolute;top:1px;bottom:1px;border-radius:3px;background:rgba(128,128,128,.35);overflow:hidden}.ench-gt .br i{display:block;height:100%;background:currentColor;opacity:.75}.ench-gt .br.cr{outline:2px solid currentColor;outline-offset:0}.ench-gt .now{position:absolute;top:-2px;bottom:-2px;width:1px;background:currentColor;opacity:.8}.ench-gt .ax{display:flex;justify-content:space-between;font-size:.8em;opacity:.65}
.ench-carte td,.ench-carte th{text-align:center;min-width:46px}.ench-h{margin:12px 0 4px;font-size:1em}
@media (max-width:640px){.ench-g,.ench-tows{grid-template-columns:1fr}.ench-ar{grid-template-columns:1fr}.ench-ar .ar{display:none}}`;
  function ensureCss() {
    if (typeof document === 'undefined' || document.getElementById('bp-enrichi-css')) return;
    const st = document.createElement('style'); st.id = 'bp-enrichi-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  const lib = (col, v) => v;   // les choix sont stockés avec leur libellé
  function cellule(col, v, esc) { if (!has(v)) return '—'; if (col.t === 'nombre') { const n = nombre(v); return esc(n === null ? v : fmtNb(n, 2)); } return esc(v); }
  function champsHtml(carte, data, esc) {
    const f = carte.champs.filter(c => has((data || {})[c.k]));
    if (!f.length) return '';
    return `<div class="ench-g">${f.map(c => `<div class="ench-f${c.t === 'long' ? ' full' : ''}"><p class="ench-l">${esc(c.l)}</p><p class="ench-v">${esc(data[c.k])}</p></div>`).join('')}</div>`;
  }
  function tableHtml(cols, rows, esc, cls) {
    return `<table class="${cls || 'ench-t'}"><thead><tr>${cols.map(c => `<th>${esc(c.l)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td>${c.html ? c.html(r) : cellule(c, r[c.k], esc)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  /* Tri chronologique si les dates sont lisibles (AAAA-MM-JJ, AAAA-MM ou AAAA), sinon ordre saisi. */
  function cleDate(s) { const m = String(s || '').match(/(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/); return m ? Number(m[1]) * 10000 + Number(m[2] || 0) * 100 + Number(m[3] || 0) : null; }
  function triChrono(rows) { const ok = rows.every(r => cleDate(r.date) !== null); return ok ? rows.slice().sort((a, b) => cleDate(a.date) - cleDate(b.date)) : rows; }

  function friseHtml(l, rows, esc) {
    const r = triChrono(rows);
    return `<div class="ench-fr">${r.map(x => `<div class="p"><p class="d">${esc(x.date || '')}</p><p class="t">${esc(x[l.nom] || '')}</p>${has(x.detail || x.resultat) ? `<p class="x">${esc(x.detail || x.resultat)}</p>` : ''}</div>`).join('')}</div>`;
  }
  function fluxHtml(rows, esc) {
    return `<div class="ench-fl">${rows.map((x, i) => `<div class="e"><b>${i + 1}. ${esc(x.etape)}</b>${has(x.description) ? `<span>${esc(x.description)}</span>` : ''}${has(x.acteur) ? `<span class="ench-pill">${esc(x.acteur)}</span>` : ''}</div>`).join('')}</div>`;
  }
  function barresHtml(l, rows, esc) {
    const vals = rows.map(r => nombre(r[l.barre])), max = Math.max.apply(null, vals.filter(v => v !== null).concat([0]));
    if (!(max > 0)) return '';
    return `<div class="ench-b">${rows.map((r, i) => vals[i] === null ? '' : `<span>${esc(r[l.nom])}</span><i style="width:${Math.max(2, Math.round(vals[i] / max * 100))}%"></i><span class="v">${esc(fmtNb(vals[i], 2))}${l.barre === 'part_pct' ? ' %' : ''}</span>`).join('')}</div>`;
  }
  function arbreHtml(data, esc) {
    const causes = liste(data.causes_profondes).filter(c => has(c.cause)), cons = liste(data.consequences_arbre).filter(c => has(c.consequence));
    if (!causes.length && !cons.length) return '';
    const tronc = has(data.description) ? coupe(data.description, 120) : 'Problème à résoudre';
    return `<div class="ench-ar"><div class="col"><h5>Causes</h5>${causes.map(c => `<div class="bx">${esc(c.cause)}</div>`).join('')}</div><div class="ar">▶</div><div class="col tronc"><div class="bx">${esc(tronc)}</div></div><div class="ar">▶</div><div class="col"><h5>Conséquences</h5>${cons.map(c => `<div class="bx">${esc(c.consequence)}${has(c.categorie) ? ` <span class="ench-pill">${esc(c.categorie)}</span>` : ''}</div>`).join('')}</div></div>`;
  }
  function porterHtml(rows, esc) {
    const niv = { Faible: 1, Moyenne: 2, Forte: 3 };
    const r = rows.filter(x => has(x.intensite) || has(x.analyse));
    if (!r.length) return '';
    return `<table class="ench-t"><thead><tr><th>Force</th><th>Intensité</th><th>Analyse</th></tr></thead><tbody>${r.map(x => `<tr><td><strong>${esc(x.force)}</strong></td><td>${has(x.intensite) ? '●'.repeat(niv[x.intensite] || 1) + '○'.repeat(3 - (niv[x.intensite] || 1)) + ' ' + esc(x.intensite) : '—'}</td><td>${esc(x.analyse || '—')}</td></tr>`).join('')}</tbody></table>`;
  }

  /* Blocs de lecture d'une liste ; retourne du HTML (ou '' s'il n'y a rien à montrer). */
  function listeLecture(rub, l, data, esc, ctx) {
    const rows = lignes(data, l); if (!rows.length) return '';
    if (l.k === 'porter') return porterHtml(rows, esc);
    if (l.viz === 'frise') return friseHtml(l, rows, esc);
    if (l.viz === 'flux') return fluxHtml(rows, esc);
    const cls = ctx && ctx.tbClass;
    if (l.calc === 'smart') {
      const cols = l.cols.filter(c => c.k !== 'horizon').concat([{ l: 'SMART', html: o => { const s = smart(o); return s.complet ? '✔ complet' : 'À compléter : ' + esc(s.manquants.join(', ')); } }]);
      const complets = rows.filter(o => smart(o).complet).length;
      return tableHtml(cols, rows, esc, cls) + `<p class="ench-n">${complets} objectif(s) sur ${rows.length} répondent aux cinq critères SMART.</p>`;
    }
    if (l.calc === 'priorite') {
      const p = prioriser(rows);
      return `<div class="ench-b">${p.map(x => `<span>${esc(x.probleme)}</span><i style="width:${Math.max(2, x.score || 0)}%"></i><span class="v">${x.score === null ? 'non évalué' : x.score + ' / 100'}</span>`).join('')}</div><p class="ench-n">Score = gravité × fréquence × urgence, ramené sur 100. Les notes sont celles de l'auteur du plan.</p>`;
    }
    if (l.calc === 'swot_action') {
      const p = planSwot(rows);
      const cols = [{ l: 'Élément', html: x => `<strong>${esc(x.element)}</strong><br><span class="ench-pill">${esc(x.cat || '—')}</span>` }, { l: 'Priorité', html: x => x.priorite ? esc(x.priorite) + ' (' + x.score + '/25)' : '—' },
        { l: 'Horizon', html: x => esc(x.horizon || '—') }, { l: 'Action', html: x => esc(x.action || '—') + (has(x.indicateur_reussite) ? '<br><span class="ench-n">Indicateur : ' + esc(x.indicateur_reussite) + '</span>' : '') },
        { l: 'Responsable · budget · date', html: x => esc([x.responsable, x.budget, x.date_mise_en_oeuvre].filter(has).join(' · ') || '—') }, { l: 'Risque après', html: x => esc(x.risque_apres || '—') }, { l: 'Statut', html: x => esc(x.validation || 'À valider') }];
      return tableHtml(cols, p, esc, cls) + `<p class="ench-n">Priorité = probabilité × impact (sur 25) : critique à partir de 15, élevée à partir de 10, moyenne à partir de 5.</p>`;
    }
    if (l.calc === 'ltv_cac') {
      const p = ltvCac(rows);
      const cols = [{ l: 'Segment', html: x => '<strong>' + esc(x.segment) + '</strong>' }, ...l.cols.slice(1).map(c => ({ l: c.l, html: x => cellule(c, x[c.k], esc) })), { l: 'LTV / CAC', html: x => x.ratio === null ? '—' : esc(fmtNb(x.ratio, 1)) + ' · ' + esc(x.lecture) }];
      return tableHtml(cols, p, esc, cls) + `<p class="ench-n">Repère courant : une valeur vie client au moins trois fois supérieure au coût d'acquisition.</p>`;
    }
    if (l.calc === 'validation') {
      const v = validation(rows);
      return tableHtml(l.cols, rows, esc, cls) + `<p class="ench-n">${v.critiques} hypothèse(s) critique(s) : ${v.critiquesValidees} validée(s), ${v.critiquesInvalidees} invalidée(s), ${v.critiquesNonTestees} non testée(s).${v.pctCritiquesValidees === null ? '' : ' Soit ' + v.pctCritiquesValidees + ' % de validation.'}</p>`;
    }
    if (l.calc === 'campagne') {
      const p = campagnes(rows);
      const f = (a, d) => a === null ? '—' : esc(fmtNb(a, d));
      const cols = [{ l: 'Campagne', html: x => '<strong>' + esc(x.campagne) + '</strong><br><span class="ench-n">' + esc([x.canal, x.periode].filter(has).join(' · ')) + '</span>' },
        { l: 'Budget prévu → réel', html: x => f(nombre(x.budget_prevu)) + ' → ' + f(nombre(x.budget_reel)) + (x.ecart_budget === null ? '' : '<br><span class="ench-n">écart ' + (x.ecart_budget > 0 ? '+' : '') + esc(fmtNb(x.ecart_budget, 0)) + '</span>') },
        { l: 'Prospects attendus → obtenus', html: x => f(nombre(x.prospects_prevus), 0) + ' → ' + f(nombre(x.prospects_reels), 0) },
        { l: 'Conversions attendues → obtenues', html: x => f(nombre(x.conversions_prevues), 0) + ' → ' + f(nombre(x.conversions_reelles), 0) },
        { l: 'Coût par prospect', html: x => f(x.cout_prospect_prevu, 2) + ' → ' + f(x.cout_prospect_reel, 2) }];
      return tableHtml(cols, p, esc, cls) + `<p class="ench-n">« Attendu » vient du plan, « obtenu » des résultats saisis : une campagne sans résultat saisi reste marquée « — ».</p>`;
    }
    const f = (a, d) => a === null || a === undefined ? '—' : esc(fmtNb(a, d === undefined ? 1 : d));
    const nom = x => '<strong>' + esc(x[l.nom] || '') + '</strong>';
    if (l.calc === 'objectif_realise') {
      const p = objectifsRealises(rows);
      return tableHtml([{ l: 'Axe · période', html: x => nom({ [l.nom]: x.libelle || '—' }) + (has(x.axe) ? '<br><span class="ench-n">' + esc(x.axe) + '</span>' : '') }, { l: 'Objectif', html: x => f(nombre(x.objectif), 0) }, { l: 'Réalisé', html: x => f(nombre(x.realise), 0) }, { l: 'Atteinte', html: x => x.atteinte === null ? '—' : f(x.atteinte, 0) + ' %' }], p, esc, cls)
        + '<p class="ench-n">L\'atteinte n\'est calculée que lorsque l\'objectif et le réalisé sont saisis.</p>';
    }
    if (l.calc === 'entonnoir') {
      const p = entonnoir(rows);
      return barresHtml({ nom: 'etape', barre: 'nb' }, p, esc) + tableHtml([{ l: 'Étape', html: nom }, { l: 'Nombre', html: x => f(nombre(x.nb), 0) }, { l: 'Taux de transformation depuis l\'étape précédente', html: x => x.taux === null ? '—' : f(x.taux, 0) + ' %' }, { l: 'Probabilité attendue', html: x => has(x.probabilite) ? f(nombre(x.probabilite), 0) + ' %' : '—' }, { l: 'Durée moyenne', html: x => has(x.duree_jours) ? f(nombre(x.duree_jours), 0) + ' j' : '—' }], p, esc, cls);
    }
    if (l.calc === 'pipeline') {
      const p = pipeline(rows);
      return tableHtml([{ l: 'Prospect', html: x => nom({ [l.nom]: x.prospect }) + (has(x.etape) ? '<br><span class="ench-n">' + esc(x.etape) + '</span>' : '') }, { l: 'Montant', html: x => f(nombre(x.montant), 0) }, { l: 'Probabilité', html: x => has(x.probabilite) ? f(nombre(x.probabilite), 0) + ' %' : '—' }, { l: 'Pondéré', html: x => f(x.pondere, 0) }, { l: 'Priorité · échéance', html: x => esc([x.priorite, x.echeance].filter(has).join(' · ') || '—') }], p.lignes, esc, cls)
        + `<p class="ench-w">Pipeline : ${esc(fmtNb(p.total, 0))} au total, ${esc(fmtNb(p.pondere, 0))} pondéré par les probabilités saisies.</p>${p.incomplets ? `<p class="ench-n">${p.incomplets} ligne(s) sans montant ou sans probabilité : non comptées dans le montant pondéré.</p>` : ''}`;
    }
    if (l.calc === 'capacite') {
      const p = capacites(rows);
      return tableHtml([{ l: 'Ressource', html: x => nom({ [l.nom]: x.ressource }) + (has(x.unite) ? '<br><span class="ench-n">' + esc(x.unite) + '</span>' : '') }, { l: 'Théorique', html: x => f(nombre(x.theorique), 0) }, { l: 'Réelle', html: x => f(nombre(x.reelle), 0) }, { l: 'Disponible', html: x => f(nombre(x.disponible), 0) }, { l: 'Réelle / théorique', html: x => x.taux === null ? '—' : f(x.taux, 0) + ' %' }], p, esc, cls);
    }
    if (l.calc === 'vote') {
      const v = votes(rows);
      return tableHtml(l.cols, v.lignes, esc, cls) + (Math.abs(v.total - 100) > 0.5 ? `<p class="ench-w">Attention : les droits de vote saisis totalisent ${esc(fmtNb(v.total, 1))} % au lieu de 100 %.</p>` : '');
    }
    if (l.calc === 'decisions') {
      const p = decisions(rows), al = p.filter(x => x.alertes.length);
      return tableHtml([{ l: 'Décision', html: nom }, { l: 'Décide', html: x => esc(x.decide || '—') }, { l: 'Exécute', html: x => esc(x.execute || '—') }, { l: 'Contrôle', html: x => esc(x.controle || '—') + (x.alertes.length ? '<br><span class="ench-n">⚠ ' + esc(x.alertes.join(', ')) + '</span>' : '') }], p, esc, cls)
        + (al.length ? `<p class="ench-w">Séparation des fonctions à revoir : ${esc(al.map(x => x.decision).join(', '))}.</p>` : '');
    }
    if (l.calc === 'etp') {
      const e = effectifs(rows);
      const cats = Object.keys(e.parCategorie).map(k => `${esc(k)} : ${esc(fmtNb(e.parCategorie[k].nb, 1))} personne(s)${e.parCategorie[k].etpSaisi ? ', ' + esc(fmtNb(e.parCategorie[k].etp, 2)) + ' ETP' : ''}`).join(' · ');
      return tableHtml(l.cols, e.lignes, esc, cls) + `<p class="ench-w">${esc(fmtNb(e.nb, 1))} personne(s)${e.etp ? ', ' + esc(fmtNb(e.etp, 2)) + ' ETP' : ''} — ${cats}</p>${!e.etpComplet ? '<p class="ench-n">Les ETP ne sont additionnés que pour les lignes où ils sont saisis.</p>' : ''}`;
    }
    if (l.calc === 'plan_rh') {
      const p = planRh(liste(data.besoins_recrutement), liste(data.effectifs_detail));
      return tableHtml(l.cols, rows, esc, cls) + '<p class="ench-w">Plan RH sur trois ans</p>' + tableHtml([{ l: 'Année', html: x => '<strong>' + esc(x.annee) + '</strong> (horizon ' + esc(x.horizon) + ')' }, { l: 'Recrutements', html: x => f(x.recrutements, 0) + (x.postes.length ? '<br><span class="ench-n">' + esc(x.postes.join(', ')) + '</span>' : '') }, { l: 'Budget de recrutement', html: x => f(x.budget, 0) }, { l: 'Recrutements cumulés', html: x => f(x.cumulRecrutements, 0) }, { l: 'Effectif en fin de période', html: x => x.effectifFin === null ? '—' : f(x.effectifFin, 1) }], p, esc, cls)
        + '<p class="ench-n">Effectif de fin de période = effectifs saisis + recrutements cumulés. Les coûts salariaux détaillés restent ceux du plan financier et des postes prévus.</p>';
    }
    if (l.calc === 'fiabilite') {
      const fb = fiabilites(rows);
      return tableHtml(l.cols.map(c => c.k === 'fiabilite' ? { l: c.l, html: x => esc(has(x.fiabilite) ? x.fiabilite : 'Déclarative (non précisée)') } : c), rows, esc, cls) + `<p class="ench-n">${fb.comptes['Vérifiée']} vérifiée(s), ${fb.comptes['Estimée']} estimée(s), ${fb.comptes['Déclarative']} déclarative(s) : une hypothèse sans statut n'est jamais présentée comme vérifiée.</p>`;
    }
    if (l.calc === 'dscr') {
      const p = dscr(rows);
      return tableHtml([{ l: 'Année', html: nom }, { l: 'Flux disponible', html: x => f(nombre(x.flux_disponible), 0) }, { l: 'Service de la dette', html: x => f(nombre(x.service_dette), 0) }, { l: 'DSCR', html: x => x.ratio === null ? '—' : esc(x.ratio.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ' · ' + esc(x.lecture) }], p, esc, cls) + '<p class="ench-n">DSCR = flux de trésorerie disponible ÷ service de la dette. Repère courant des banques : au moins 1,2.</p>';
    }
    if (l.calc === 'sources_fin') {
      const s = sourcesFinancement(rows, data.besoin_total);
      return tableHtml([{ l: 'Source', html: x => nom({ [l.nom]: x.organisme || x.type_source }) + (has(x.type_source) && has(x.organisme) ? '<br><span class="ench-n">' + esc(x.type_source) + '</span>' : '') }, { l: 'Montant', html: x => f(nombre(x.montant), 0) }, { l: 'Statut', html: x => esc(x.statut || 'Non précisé') }, { l: 'Coût total', html: x => f(nombre(x.cout_total), 0) }, { l: 'Éligibilité', html: x => esc(x.eligibilite || '—') }], s.lignes, esc, cls)
        + `<p class="ench-w">Obtenu : ${esc(fmtNb(s.obtenu, 0))} · en cours : ${esc(fmtNb(s.enCours, 0))} · envisagé : ${esc(fmtNb(s.envisage, 0))}${s.reste !== null ? ' · reste à mobiliser : ' + esc(fmtNb(s.reste, 0)) : ''}${s.couverture !== null ? ' · couverture du besoin : ' + s.couverture + ' %' : ''}</p><p class="ench-n">Seul un financement « Obtenu » est présenté comme acquis ; les autres restent des pistes. Ces totaux ne modifient pas les données financières de référence.${s.besoin === null ? ' Renseignez le besoin total pour calculer le reste à mobiliser.' : ''}</p>`;
    }
    if (l.calc === 'gantt') {
      const ph = liste(data.phases).filter(p => p && has(p.nom)); const al = alertesRetard(ph);
      const ext = ph.filter(p => l.cols.some(c => has(p[c.k])));
      let out = ganttHtml(ph, esc);
      if (al.length) out += `<p class="ench-w">Alertes de retard</p><ul class="ench-n">${al.map(a => `<li><strong>${esc(a.nom)}</strong> : ${esc(a.message)}</li>`).join('')}</ul>`;
      if (ext.length) out += tableHtml([{ l: 'Phase', html: x => '<strong>' + esc(x.nom) + '</strong>' + (x.chemin_critique === 'Oui' ? '<br><span class="ench-pill">Chemin critique</span>' : '') }, { l: 'Réel', html: x => esc([x.debut_reel, x.fin_reelle].filter(has).join(' → ') || '—') }, { l: 'Avancement', html: x => (has(x.avancement_physique) ? 'physique ' + f(nombre(x.avancement_physique), 0) + ' %' : '') + (has(x.avancement_financier) ? '<br>financier ' + f(nombre(x.avancement_financier), 0) + ' %' : '') || '—' }, { l: 'Budget initial → révisé', html: x => f(nombre(x.budget), 0) + ' → ' + f(nombre(x.budget_revise), 0) }, { l: 'Retard et mesures', html: x => esc([x.causes_retard, x.mesures_correctives].filter(has).join(' — ') || '—') }, { l: 'Décisions, conditions, échéances', html: x => esc([x.points_decision, x.conditions_passage, x.echeances_reglementaires].filter(has).join(' — ') || '—') }], ext, esc, cls);
      return out;
    }
    if (l.calc === 'risque') {
      const r = risquesCalcules(data.items), ext = r.filter(x => l.cols.some(c => has(x[c.k])) || x.criticite);
      if (!ext.length) return '';
      return risquesCarteHtml(r, esc) + tableHtml([{ l: 'Rang', html: (x) => 'R' + x.num }, { l: 'Risque', html: x => '<strong>' + esc(x.description) + '</strong>' + (has(x.categorie) ? '<br><span class="ench-pill">' + esc(x.categorie) + '</span>' : '') + (has(x.causes_declencheurs) ? '<br><span class="ench-n">Cause : ' + esc(x.causes_declencheurs) + '</span>' : '') }, { l: 'Criticité initiale', html: x => x.criticite ? esc(x.criticite) + ' (' + x.score + '/16)' : '—' }, { l: 'Résiduel', html: x => esc(x.residuel || '—') }, { l: 'Prévention', html: x => esc([x.prevention, x.mesures_limitation, x.plan_continuite].filter(has).join(' — ') || '—') }, { l: 'Suivi', html: x => esc([x.responsable, has(x.budget_prevention) && 'budget ' + x.budget_prevention, has(x.date_reevaluation) && 'réévaluation ' + x.date_reevaluation].filter(has).join(' · ') || '—') }], r.slice().sort((a, b) => (b.score === null ? -1 : b.score) - (a.score === null ? -1 : a.score)), esc, cls)
        + '<p class="ench-n">Criticité = probabilité × impact (échelle de 1 à 4 chacun) : critique à partir de 12, élevée à partir de 8, moyenne à partir de 4. Le registre est trié du plus critique au moins critique.</p>';
    }
    if (l.calc === 'impact_ind') {
      const p = indicateursImpact(data.indicateurs).filter(x => l.cols.some(c => has(x[c.k])) || x.progression !== null);
      if (!p.length) return '';
      return barresProgression(p, esc) + tableHtml([{ l: 'Indicateur', html: x => '<strong>' + esc(x.nom) + '</strong>' }, { l: 'Départ → actuel → cible', html: x => esc([x.situation_initiale, x.valeur_actuelle, x.valeur_cible].map(v => has(v) ? v : '—').join(' → ')) }, { l: 'Cible annuelle', html: x => esc(x.cible_annuelle || '—') }, { l: 'Collecte et vérification', html: x => esc(x.collecte_verification || '—') }, { l: 'Niveau de preuve', html: x => esc(x.preuve) }, { l: 'ODD', html: x => esc(x.odd_lie || '—') }], p, esc, cls)
        + '<p class="ench-n">Progression = (valeur actuelle − situation initiale) ÷ (cible − situation initiale), calculée seulement si les trois valeurs sont numériques. Un indicateur sans niveau de preuve est signalé « Non précisé ».</p>';
    }
    if (l.calc === 'annexe') {
      const it = liste(data.items).filter(x => x && has(x.nom) && l.cols.some(c => has(x[c.k])));
      if (!it.length) return '';
      return tableHtml([{ l: 'Pièce', html: x => '<strong>' + esc(x.nom) + '</strong>' + (has(x.url) ? '<br><span class="ench-n">' + esc(x.url) + '</span>' : '') }, { l: 'Catégorie', html: x => esc(x.categorie || x.type || '—') }, { l: 'Date · version', html: x => esc([x.date_document, x.version].filter(has).join(' · ') || '—') }, { l: 'Vérification', html: x => esc(x.statut_verification || 'Non vérifié') }, { l: 'Rubriques liées', html: x => esc(x.rubriques_liees || '—') }], it, esc, cls);
    }
    if (l.calc === 'produit') return '';   // rendu séparément (fiches + classement)
    return tableHtml(l.cols.map(c => ({ k: c.k, l: c.l, t: c.t })), rows, esc, cls);
  }

  /* Diagramme de Gantt (HTML) : barre = début → fin prévue ; trait plein = avancement physique ; contour = chemin critique. */
  function ganttHtml(phases, esc) {
    const ph = phases.map(p => ({ p, d: temps(p.debut), f: temps(p.fin) })).filter(x => has(x.p.nom) && x.d !== null && x.f !== null && x.f >= x.d);
    if (!ph.length) return '';
    const min = Math.min.apply(null, ph.map(x => x.d)), max = Math.max.apply(null, ph.map(x => x.f)), span = Math.max(1, max - min), now = Date.now();
    const pos = t => Math.max(0, Math.min(100, (t - min) / span * 100));
    const annee = t => new Date(t).toISOString().slice(0, 7);
    return `<div class="ench-gt">${ph.map(x => { const av = nombre(x.p.avancement_physique), crit = x.p.chemin_critique === 'Oui', l = pos(x.d), w = Math.max(1.5, pos(x.f) - l);
      return `<span class="n">${esc(x.p.nom)}</span><div class="tr"><div class="br${crit ? ' cr' : ''}" style="left:${l.toFixed(1)}%;width:${w.toFixed(1)}%"><i style="width:${av === null ? 0 : Math.min(100, Math.max(0, av))}%"></i></div>${now >= min && now <= max ? `<b class="now" style="left:${pos(now).toFixed(1)}%"></b>` : ''}</div>`; }).join('')}<span></span><div class="ax"><span>${esc(annee(min))}</span><span>${esc(annee(max))}</span></div></div><p class="ench-n">Barre : période prévue · remplissage : avancement physique saisi · contour épais : chemin critique · trait vertical : aujourd'hui.</p>`;
  }
  /* Cartographie des risques : grille probabilité × impact (1 à 4). */
  function risquesCarteHtml(r, esc) {
    const cell = (p, i) => { const l = r.filter(x => x.p === p && x.im === i); return `<td style="background:rgba(192,57,43,${(p * i / 16 * 0.55).toFixed(2)});text-align:center">${l.map(x => 'R' + x.num).join(' ')}</td>`; };
    const rows = [4, 3, 2, 1].map(i => `<tr><th>${esc(LABEL_RISQUE[i])}</th>${[1, 2, 3, 4].map(p => cell(p, i)).join('')}</tr>`).join('');
    return `<table class="ench-t ench-carte"><thead><tr><th>Impact ↓ · Probabilité →</th>${[1, 2, 3, 4].map(p => `<th>${esc(LABEL_RISQUE[p])}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`;
  }
  function barresProgression(p, esc) {
    const v = p.filter(x => x.progression !== null); if (!v.length) return '';
    return `<div class="ench-b">${v.map(x => `<span>${esc(x.nom)}</span><i style="width:${Math.max(2, Math.min(100, x.progression))}%"></i><span class="v">${x.progression} %</span>`).join('')}</div>`;
  }

  function fichesProduitsHtml(items, esc, cls) {
    const p = produitsCalcules(items), parNom = {}; liste(items).forEach(it => { if (it && has(it.nom)) parNom[it.nom] = it; });
    if (!p.length) return '';
    const f = (a, d) => a === null ? '—' : esc(fmtNb(a, d === undefined ? 2 : d));
    const cols = [{ l: 'Produit', html: x => '<strong>' + esc(x.nom) + '</strong>' + (x.sku ? '<br><span class="ench-n">' + esc(x.sku) + '</span>' : '') },
      { l: 'Prix HT · TTC', html: x => f(x.prix) + ' · ' + f(x.prixTtc) }, { l: 'Coût de revient', html: x => f(x.coutRevient) + (x.methodeCout ? '<br><span class="ench-n">' + esc(x.methodeCout) + '</span>' : '') },
      { l: 'Marge brute · taux de marque', html: x => f(x.margeBrute) + ' · ' + (x.tauxMarque === null ? '—' : f(x.tauxMarque, 0) + ' %') }, { l: 'Marge contributive', html: x => f(x.margeContrib) },
      { l: 'Volume annuel · CA prévu', html: x => f(x.volAn, 0) + ' · ' + f(x.ca, 0) }, { l: 'Utilisation capacité', html: x => x.utilisation === null ? '—' : f(x.utilisation, 0) + ' %' },
      { l: 'Part du résultat', html: x => x.contribution === null ? '—' : f(x.contribution, 0) + ' %' }];
    let out = tableHtml(cols, p, esc, cls);
    const rk = (titre, cle, fmt) => { const c = classement(p, cle); return c.length > 1 || (c.length === 1 && p.length > 1) ? `<div class="ench-f"><p class="ench-l">${esc(titre)}</p><p class="ench-v">${c.map((x, i) => `${i + 1}. ${esc(x.nom)} (${fmt(x)})`).join('\n')}</p></div>` : ''; };
    const rangs = rk("Classement par chiffre d'affaires prévu", 'ca', x => fmtNb(x.ca, 0)) + rk('Classement par marge brute unitaire', 'margeBrute', x => fmtNb(x.margeBrute, 2)) + rk('Classement par rentabilité (taux de marque)', 'tauxMarque', x => fmtNb(x.tauxMarque, 0) + ' %');
    if (rangs) out += `<div class="ench-g">${rangs}</div>`;
    const cartesDet = p.map(x => { const it = parNom[x.nom]; const champs = [['description_technique', 'Description'], ['composition_conditionnement', 'Composition et conditionnement'], ['clientele_cible', 'Clientèle cible'], ['benefice_apporte', 'Bénéfice apporté'], ['canaux_vente', 'Canaux de vente'], ['certifications_necessaires', 'Certifications'], ['duree_conservation', 'Conservation'], ['fournisseurs_dependances', 'Fournisseurs et dépendances'], ['potentiel_developpement', 'Potentiel de développement'], ['stade_cycle_vie', 'Cycle de vie']].filter(([k]) => has(it[k]));
      return champs.length ? `<p class="ench-w">${esc(x.nom)}</p><div class="ench-g">${champs.map(([k, l]) => `<div class="ench-f"><p class="ench-l">${esc(l)}</p><p class="ench-v">${esc(it[k])}</p></div>`).join('')}</div>` : ''; }).join('');
    return out + cartesDet + `<p class="ench-n">Calculs faits à partir des seules valeurs saisies ; un champ vide laisse la case à « — ». Le coût de revient est la somme des coûts de la fiche lorsqu'ils sont renseignés, sinon celui du catalogue.</p>`;
  }

  function towsHtml(data, esc) {
    const q = [['tows_so', 'Forces + opportunités', 'Stratégies offensives'], ['tows_st', 'Forces + menaces', 'Stratégies de protection'], ['tows_wo', 'Faiblesses + opportunités', "Stratégies d'amélioration"], ['tows_wt', 'Faiblesses + menaces', 'Stratégies de réduction des risques']];
    if (!q.some(([k]) => has(data[k]))) return '';
    return `<div class="ench-tows">${q.map(([k, a, b]) => `<div><h5>${esc(a)} — ${esc(b)}</h5><p>${esc(data[k] || '—')}</p></div>`).join('')}</div>`;
  }

  /* Tous les blocs de lecture d'une rubrique : [{ titre, html }] — le dossier les met en pages, la vue les empile. */
  function blocs(rub, bp, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || escDefaut, data = ((bp && bp.sections) || {})[rub] || {}, out = [];
    const ajoute = (titre, html) => { if (html && String(html).trim()) out.push({ titre, html }); };
    if (rub === 'infos_generales') {
      const fiche = ficheIdentite(bp);
      if (fiche.length) ajoute("Fiche d'identité du projet", `<div class="ench-g">${fiche.map(([l, v]) => `<div class="ench-f"><p class="ench-l">${esc(l)}</p><p class="ench-v">${esc(v)}</p></div>`).join('')}</div>`);
      const act = lignes(data, listes(rub)[0]); const tot = act.reduce((a, x) => a + (nombre(x.part_pct) || 0), 0);
      const org = noeudsOrganigrammeAuto(data); const BPOrga = root && root.BPOrga;
      if (org.length > 1 && BPOrga && BPOrga.organigrammeHtml) { if (BPOrga.ensureCss) BPOrga.ensureCss(); ajoute("Organigramme (généré depuis les membres de l'équipe)", BPOrga.organigrammeHtml(org, esc)); }
      /* La fiche d'identité reprend déjà l'immatriculation, la nature de l'activité et les marchés : on ne les répète pas dans leurs cartes. */
      cartes(rub).forEach(c => { if (fiche.length && (c.id === 'ident' || c.id === 'marches')) return; ajoute(c.titre, champsHtml(c, data, esc)); });
      listes(rub).forEach(l => {
        let h = listeLecture(rub, l, data, esc, ctx);
        if (l.k === 'actionnariat' && h) h += act.length && Math.abs(tot - 100) > 0.5 ? `<p class="ench-w">Attention : les parts saisies totalisent ${esc(fmtNb(tot, 1))} % au lieu de 100 %.</p>` : '';
        ajoute(l.titre, h);
      });
      return out;
    }
    if (rub === 'resume_executif') {
      (ctx.modes || ['court', 'long']).forEach(m => { const r = resume(bp, m); if (r.blocs.length) ajoute(m === 'court' ? 'Résumé d\'une page' : 'Version développée (deux pages)', `<div class="ench-g">${r.blocs.map(b => `<div class="ench-f full"><p class="ench-l">${esc(b.titre)}</p><p class="ench-v">${esc(b.texte)}</p></div>`).join('')}</div>${r.manquants.length ? `<p class="ench-n">Non renseigné, donc absent du résumé : ${esc(r.manquants.join(', '))}.</p>` : ''}`); });
      return out;
    }
    cartes(rub).forEach(c => { if (c.id === 'tows') { ajoute(c.titre, towsHtml(data, esc)); return; } ajoute(c.titre, champsHtml(c, data, esc)); });
    if (rub === 'probleme') ajoute((SPEC.probleme.viz[0] || {}).titre, arbreHtml(Object.assign({ description: (((bp || {}).sections || {}).probleme || {}).description }, data), esc));
    listes(rub).forEach(l => { if (l.calc === 'produit') ajoute(l.titre, fichesProduitsHtml(data.items, esc, ctx.tbClass)); else ajoute(l.titre, listeLecture(rub, l, data, esc, ctx)); });
    return out;
  }
  const blocsHtml = (rub, bp, ctx) => blocs(rub, bp, ctx).map(b => `<h4 class="ench-h">${(ctx && ctx.esc || escDefaut)(b.titre)}</h4>${b.html}`).join('');

  /* ═══════════════ RENDU HTML (éditeur) ═══════════════ */
  /* Les gestionnaires (enrChamp, enrLigne, enrAjouter, enrRetirer…) sont définis par l'éditeur. */
  function champEditeur(rub, f, val, esc, ro, ctx) {
    const a = `data-enr="${esc(rub)}:${esc(f.k)}"`, dis = ro ? 'readonly' : '';
    const label = `<label>${esc(f.l)}</label>`;
    if (f.t === 'long') return `<div class="full">${label}<textarea rows="3" ${a} placeholder="${esc(f.ph || '')}" ${dis} oninput="enrChamp('${rub}','${f.k}',this.value)">${esc(val)}</textarea></div>`;
    if (f.t === 'choix') return `<div>${label}<select ${a} ${ro ? 'disabled' : ''} onchange="enrChamp('${rub}','${f.k}',this.value)"><option value=""${has(val) ? '' : ' selected'}>—</option>${f.opts.map(o => `<option value="${esc(o)}"${val === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
    const type = f.t === 'nombre' ? 'number' : f.t === 'date' ? 'date' : 'text';
    return `<div>${label}<input type="${type}" ${f.t === 'nombre' ? 'step="any"' : ''} ${a} value="${esc(val)}" placeholder="${esc(f.ph || '')}" ${dis} oninput="enrChamp('${rub}','${f.k}',this.value)"></div>`;
  }
  function ligneEditeur(rub, l, ligne, i, esc, ro) {
    const titre = has(ligne[l.nom]) ? ligne[l.nom] : (l.base ? 'Produit ' + (i + 1) : 'Élément ' + (i + 1));
    const champs = l.cols.map(c => { const val = ligne[c.k] === undefined ? '' : ligne[c.k]; const a = `data-enrl="${esc(rub)}:${esc(l.k)}:${i}:${esc(c.k)}"`, dis = ro ? 'readonly' : '';
      if (c.t === 'long') return `<div class="full"><label>${esc(c.l)}</label><textarea rows="2" ${a} ${dis} oninput="enrLigne('${rub}','${l.k}',${i},'${c.k}',this.value)">${esc(val)}</textarea></div>`;
      if (c.t === 'choix') return `<div><label>${esc(c.l)}</label><select ${a} ${ro ? 'disabled' : ''} onchange="enrLigne('${rub}','${l.k}',${i},'${c.k}',this.value)"><option value=""${has(val) ? '' : ' selected'}>—</option>${c.opts.map(o => `<option value="${esc(o)}"${val === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
      const type = c.t === 'nombre' ? 'number' : c.t === 'date' ? 'date' : 'text';
      return `<div><label>${esc(c.l)}</label><input type="${type}" ${c.t === 'nombre' ? 'step="any"' : ''} ${a} value="${esc(val)}" ${dis} oninput="enrLigne('${rub}','${l.k}',${i},'${c.k}',this.value)"></div>`; }).join('');
    return `<div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:8px;background:var(--bg);"><div style="display:flex;justify-content:space-between;margin-bottom:8px;"><strong style="font-size:13px;">${esc(titre)}</strong>${(ro || l.base || l.fixe) ? '' : `<button type="button" onclick="enrRetirer('${rub}','${l.k}',${i})" style="background:none;border:none;cursor:pointer;color:var(--muted);" title="Retirer">✕</button>`}</div><div class="fg">${champs}</div></div>`;
  }
  function listeEditeur(rub, l, data, esc, ro) {
    let rows = liste(data[l.k]).filter(x => x && typeof x === 'object');
    if (!rows.length && l.defaut) rows = l.defaut.map(x => Object.assign({}, x));
    if (l.base) { if (!rows.length) return `<p class="ench-n">Ajoutez d'abord des produits dans le catalogue ci-dessus : une fiche détaillée apparaît pour chacun.</p>`; }
    const peutAjouter = !ro && !l.base && !l.fixe && (!l.max || rows.length < l.max);
    return `<div id="enr-liste-${esc(rub)}-${esc(l.k)}">${rows.map((x, i) => ligneEditeur(rub, l, x, i, esc, ro)).join('')}${peutAjouter ? `<button type="button" class="btn btn-outline btn-sm" onclick="enrAjouter('${rub}','${l.k}')">+ ${esc(l.ajout || 'Ajouter')}</button>` : ''}</div>`;
  }
  function listeEditeurHtml(rub, k, data, ctx) { const l = listeSpec(rub, k); return l ? listeEditeur(rub, l, data || {}, (ctx && ctx.esc) || escDefaut, !!(ctx && ctx.ro)) : ''; }
  function editeurHtml(rub, data, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || escDefaut, ro = !!ctx.ro; data = data || {};
    const sp = SPEC[rub]; if (!sp) return '';
    let h = `<div class="bp-card-inner" style="border-top:3px solid var(--orange,#E8A33D);"><h3 style="margin-top:0;">Compléments de la rubrique <span style="font-weight:400;font-size:12px;color:var(--muted);">— facultatifs, n'apparaissent dans le dossier que s'ils sont remplis</span></h3></div>`;
    cartes(rub).forEach(c => {
      h += `<div class="bp-card-inner"><h3>${esc(c.titre)}</h3>${c.intro ? `<p style="font-size:12px;color:var(--muted);margin:0 0 8px;">${esc(c.intro)}</p>` : ''}<div class="fg">${c.champs.map(f => champEditeur(rub, f, has(data[f.k]) ? data[f.k] : '', esc, ro, ctx)).join('')}</div>${c.id === 'tows' && !ro ? `<button type="button" class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="enrProposerTows()">Proposer une base à partir de ma SWOT</button>` : ''}</div>`;
    });
    listes(rub).forEach(l => {
      h += `<div class="bp-card-inner"><h3>${esc(l.titre)}</h3>${l.k === 'swot_actions' && !ro ? `<button type="button" class="btn btn-outline btn-sm" style="margin-bottom:8px;" onclick="enrProposerActionsSwot()">Créer une ligne par élément de ma SWOT</button>` : ''}${listeEditeur(rub, l, data, esc, ro)}</div>`;
    });
    if (rub === 'resume_executif') h += `<div class="bp-card-inner"><h3>Versions générées du résumé</h3><p style="font-size:12px;color:var(--muted);margin:0 0 8px;">Elles reprennent uniquement ce que vous avez saisi dans le plan ; ce qui manque est signalé, jamais inventé.</p><div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;"><button type="button" class="btn btn-outline btn-sm" onclick="enrApercuResume('court')">Résumé d'une page</button><button type="button" class="btn btn-outline btn-sm" onclick="enrApercuResume('long')">Version développée (2 pages)</button></div><div id="enr-apercu-resume"></div></div>`;
    return h;
  }

  /* Mise à jour des données (éditeur) — fonctions pures renvoyant la nouvelle valeur. */
  function nouvelleLigne(l) { const o = {}; l.cols.forEach(c => { o[c.k] = ''; }); return o; }
  function listeSpec(rub, k) { return listes(rub).find(l => l.k === k); }

  return { SPEC, rubriques, cartes, listes, aDesAjouts, libelles, lignes, contientDonnees, listeSpec, nouvelleLigne,
    smart, prioriser, planSwot, niveauPriorite, proposerTows, ltvCac, validation, campagnes, produitsCalcules, classement,
    objectifsRealises, entonnoir, pipeline, capacites, votes, decisions, effectifs, planRh, alertesRetard, fiabilites, dscr, risquesCalcules, indicateursImpact, sourcesFinancement,
    ficheIdentite, noeudsOrganigrammeAuto, resume, triChrono, cleDate, nombre, fmtNb, blocs, blocsHtml, editeurHtml, listeEditeurHtml, ensureCss, CSS };
});

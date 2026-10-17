/* Tester mon business plan (2026-10-17, demande explicite) — générateur de questions ADAPTÉES au plan.
   4 interlocuteurs × 30 questions : investisseurs / clients / collaborateurs / inconnus qui demandent de parler du projet.
   Aucune IA : chaque question est un gabarit rempli avec les données réelles du plan (nom, secteur, cible, prix, montant recherché, concurrents…),
   avec un vocabulaire qui change selon la nature de la structure (entreprise : clients, investisseurs, chiffre d'affaires ;
   association / ONG / coopérative : bénéficiaires, financeurs, subventions et dons).
   Chaque question porte : « ce qu'on écoute » (pour l'interlocuteur), la rubrique du plan qui doit y répondre, et un drapeau « votre plan n'y répond pas encore »
   quand les champs correspondants sont vides — ce sont les questions à travailler en priorité.
   Usage : BPTest.generer(bp, sections) -> { investisseurs:[…30], clients:[…30], collaborateurs:[…30], inconnus:[…30] } */
(function () {
  'use strict';

  var PROFILS = {
    investisseurs: { icone: '💼', titre: 'Investisseurs & financeurs', court: 'Ils décident de financer ou non', desc: "Un investisseur, un banquier ou un bailleur vous challenge sur le marché, les chiffres, l'équipe et l'usage des fonds.", chrono: 90 },
    clients: { icone: '🛍️', titre: 'Clients & bénéficiaires', court: 'Ils décident d\'acheter ou d\'adhérer', desc: "Un client (ou un bénéficiaire) veut savoir pourquoi vous plutôt qu'un autre, combien, quelles garanties et que se passe-t-il si ça ne va pas.", chrono: 60 },
    collaborateurs: { icone: '🤝', titre: 'Collaborateurs & partenaires', court: 'Ils décident de s\'engager à vos côtés', desc: "Un futur salarié, un bénévole ou un partenaire veut comprendre la vision, son rôle, l'organisation, la rémunération et la pérennité.", chrono: 75 },
    inconnus: { icone: '🗣️', titre: 'Inconnus curieux', court: 'Ils vous demandent de parler de votre projet', desc: "Une personne que vous rencontrez ne connaît rien de votre projet : elle veut comprendre simplement, sans jargon, en quelques phrases.", chrono: 45 }
  };

  function nettoie(v) {
    if (v == null) return '';
    return String(v).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function court(v, n) {
    v = nettoie(v);
    if (!v) return '';
    if (v.length <= n) return v;
    return v.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
  }
  function plein(v) { return nettoie(v).length > 0; }

  function contexte(bp, s) {
    s = s || {};
    var inf = s.infos_generales || {}, res = s.resume_executif || {}, pb = s.probleme || {}, sol = s.solution || {}, mar = s.marche || {},
      pro = s.produits || {}, fin = s.financement || {}, pf = s.plan_financier || {}, pres = s.presentation || {}, imp = s.impact || {}, rh = s.rh || {}, org = s.organisation || {};
    function pick(obj, re) {
      if (!obj) return '';
      var ks = Object.keys(obj);
      for (var i = 0; i < ks.length; i++) { if (re.test(ks[i]) && typeof obj[ks[i]] !== 'object' && plein(obj[ks[i]])) return nettoie(obj[ks[i]]); }
      return '';
    }
    var type = String((bp && bp.type_initiative) || inf.type_initiative || '').toLowerCase();
    var social = /asso|ong|coop/.test(type);
    var items = Array.isArray(pro.items) ? pro.items : [];
    var p0 = items[0] || {};
    var concurrents = (Array.isArray(mar.concurrents) ? mar.concurrents : []).map(function (c) { return nettoie(c && (c.nom || c.name)); }).filter(Boolean);
    var nom = nettoie((bp && bp.nom_projet) || inf.nom_projet) || 'votre projet';
    var c = {
      s: s, bp: bp || {}, type: type, social: social,
      nom: nom,
      secteur: nettoie((bp && bp.secteur) || inf.secteur || inf.sous_secteur),
      lieu: [inf.ville, inf.pays].filter(Boolean).join(', '),
      stade: nettoie(inf.stade),
      cible: court(pick(mar, /cible|segment|client/) || pick(pb, /qui_concerne/) || pick(res, /marche/), 110),
      probleme: court(pick(pb, /^description$/) || pick(res, /^probleme$/), 130),
      solution: court(pick(sol, /^description$/) || pick(res, /^solution$/), 130),
      produit: court(nettoie(p0.nom || p0.titre) || pick(sol, /^description$/), 80),
      prix: nettoie(p0.prix || p0.prix_vente || p0.tarif),
      montant: nettoie(pick(fin, /^montant/) || pick(pf, /financement_recherche/) || pick(res, /^besoins$/)),
      ca1: nettoie(pf.ca_1),
      seuil: nettoie(pf.seuil_rentabilite),
      concurrents: concurrents,
      concurrent: concurrents[0] || '',
      responsable: nettoie(inf.responsable),
      equipeNb: nettoie(inf.nb_collaborateurs || rh.effectif_actuel),
      vision: court(pick(pres, /^vision$/), 110),
      mission: court(pick(pres, /^mission$/), 110),
      impactSocial: court(pick(imp, /social/), 110),
      avantage: court(pick(sol, /differenci|avantage|innovation/), 110),
      // vocabulaire qui change selon la nature de la structure
      benef: social ? 'bénéficiaires' : 'clients',
      benefs: social ? 'vos bénéficiaires' : 'vos clients',
      offre: social ? 'vos actions' : 'votre offre',
      financeurs: social ? 'financeurs et bailleurs' : 'investisseurs',
      revenus: social ? 'subventions, dons et cotisations' : "chiffre d'affaires",
      equipeMot: social ? "l'équipe (salariés et bénévoles)" : "l'équipe"
    };
    c.dit = function (v, repli) { return v ? v : repli; };
    return c;
  }

  function chemin(s, p) {
    var parts = p.split('.'), o = s;
    for (var i = 0; i < parts.length; i++) { if (o == null) return ''; o = o[parts[i]]; }
    if (Array.isArray(o)) return o.length ? 'x' : '';
    return plein(o) ? 'x' : '';
  }
  function repond(s, paths) {
    if (!paths || !paths.length) return true;
    for (var i = 0; i < paths.length; i++) { if (chemin(s, paths[i])) return true; }
    return false;
  }

  /* [rubrique, niveau, question(c), ce qu'on écoute, champs du plan qui y répondent] */
  var Q = {};

  Q.investisseurs = [
    ['probleme', 'facile', function (c) { return "En deux phrases : quel problème résolvez-vous avec " + c.nom + (c.probleme ? " — « " + c.probleme + " » ?" : " ?"); }, "Un problème réel, précis, vécu par des personnes identifiables — pas une généralité.", ['probleme.description', 'resume_executif.probleme']],
    ['probleme', 'moyen', function (c) { return "Combien de personnes ont ce problème" + (c.lieu ? " à " + c.lieu + " et ailleurs" : "") + ", et comment le savez-vous ?"; }, "Un chiffre sourcé (étude, enquête, observation terrain), pas une estimation en l'air.", ['probleme.ampleur', 'probleme.nb_personnes_concernees', 'marche.taille_marche']],
    ['solution', 'facile', function (c) { return "Concrètement, que faites-vous" + (c.produit ? " avec « " + c.produit + " »" : "") + " et pourquoi est-ce meilleur que ce qui existe ?"; }, "Une solution simple à expliquer et un avantage net par rapport aux solutions actuelles.", ['solution.description', 'solution.valeur_ajoutee', 'solution.avantages']],
    ['marche', 'moyen', function (c) { return "Quelle est la taille du marché que vous visez" + (c.secteur ? " dans le secteur « " + c.secteur + " »" : "") + ", et quelle part pouvez-vous réellement en prendre ?"; }, "Distinguer marché total, marché accessible et part réaliste à 3 ans ; une méthode de calcul claire.", ['marche.taille_marche', 'marche.potentiel']],
    ['marche', 'moyen', function (c) { return "Qui est votre " + (c.social ? "bénéficiaire" : "client") + " type" + (c.cible ? " (« " + c.cible + " »)" : "") + " ? Pouvez-vous le décrire comme une vraie personne ?"; }, "Une cible précise, pas « tout le monde » ; idéalement un exemple réel rencontré.", ['marche.persona_traits', 'marche.cible', 'probleme.qui_concerne']],
    ['marche', 'difficile', function (c) { return c.concurrents.length ? "Pourquoi un " + (c.social ? "bénéficiaire" : "client") + " vous choisirait-il plutôt que " + c.concurrents.slice(0, 2).join(' ou ') + " ?" : "Qui sont vos concurrents directs et indirects ? Si vous pensez ne pas en avoir, que fait aujourd'hui votre cible à la place ?"; }, "Une connaissance honnête de la concurrence et un avantage défendable (prix, qualité, proximité, savoir-faire).", ['marche.concurrents', 'solution.differenciants']],
    ['solution', 'difficile', function (c) { return "Qu'est-ce qui empêche un concurrent plus gros de copier " + c.nom + " dans six mois ?"; }, "Des barrières réelles : savoir-faire, réseau local, contrats, marque, propriété intellectuelle, vitesse.", ['solution.differenciants', 'solution.innovation', 'marche.barrieres_entree']],
    ['presentation', 'moyen', function (c) { return "Où en êtes-vous aujourd'hui" + (c.stade ? " (stade : " + c.stade + ")" : "") + " ? Qu'avez-vous déjà prouvé : tests, ventes, premiers " + c.benefs.replace('vos ', '') + " ?"; }, "De la traction concrète : chiffres, témoignages, pilotes. Ce qui est déjà fait compte plus que les promesses.", ['presentation.historique', 'solution.nb_tests', 'solution.resultats_tests_solution']],
    ['plan_financier', 'moyen', function (c) { return c.social ? "Comment votre structure se finance-t-elle aujourd'hui (" + c.revenus + ") et quelle part est récurrente ?" : "Comment gagnez-vous de l'argent exactement" + (c.prix ? " (prix : " + c.prix + ")" : "") + " ?"; }, "Un modèle économique lisible : qui paie, combien, à quelle fréquence.", ['produits.items', 'plan_financier.ca_1', 'business_model.revenus']],
    ['plan_financier', 'moyen', function (c) { return "Quel chiffre " + (c.social ? "de financements" : "d'affaires") + " visez-vous la première année" + (c.ca1 ? " (" + c.ca1 + ")" : "") + " et sur quelles hypothèses ?"; }, "Des hypothèses explicites (volumes × prix) et réalistes, vérifiables.", ['plan_financier.ca_1']],
    ['plan_financier', 'difficile', function (c) { return "À partir de quand êtes-vous rentable" + (c.seuil ? " (seuil annoncé : " + c.seuil + ")" : "") + " et que se passe-t-il si les ventes sont deux fois plus lentes ?"; }, "Un seuil de rentabilité chiffré et un scénario prudent crédible.", ['plan_financier.seuil_rentabilite']],
    ['financement', 'facile', function (c) { return "De combien avez-vous besoin" + (c.montant ? " (vous parlez de " + c.montant + ")" : "") + " et pour quoi, euro par euro ?"; }, "Un montant précis et une répartition détaillée (équipement, stock, salaires, marketing…).", ['financement.montant', 'plan_financier.financement_recherche', 'resume_executif.besoins']],
    ['financement', 'difficile', function (c) { return "Que va-t-on obtenir avec cet argent dans 12 mois, et quel sera le prochain palier ?"; }, "Des jalons mesurables liés aux fonds ; une vision de la suite (nouveau financement, rentabilité).", ['financement.usage', 'presentation.obj_court']],
    ['financement', 'difficile', function (c) { return c.social ? "Que devient votre action si un financeur principal se retire ?" : "Quelle part de l'entreprise proposez-vous en échange, et sur quelle valorisation ?"; }, function (c) { return c.social ? "Une dépendance maîtrisée et des alternatives." : "Une valorisation justifiée et une répartition du capital claire."; }, ['financement.part_cedee', 'financement.valorisation', 'financement.diversification']],
    ['organisation', 'moyen', function (c) { return "Pourquoi " + (c.responsable ? c.responsable + " et " : "") + "votre équipe êtes-vous les bonnes personnes pour réussir ce projet ?"; }, "Une expérience pertinente, des compétences complémentaires, de l'engagement visible.", ['infos_generales.equipe_fondatrice', 'organisation.equipe', 'infos_generales.responsable']],
    ['organisation', 'moyen', function (c) { return "Quelles compétences vous manquent aujourd'hui, et comment comptez-vous les trouver ?"; }, "De la lucidité sur les manques et un plan de recrutement ou de partenariat.", ['rh.recrutements', 'rh.competences', 'organisation.consultants']],
    ['risques', 'difficile', function (c) { return "Quels sont les trois principaux risques de " + c.nom + " et que faites-vous concrètement pour les réduire ?"; }, "Des risques identifiés sans les minimiser, avec une réponse actionnable pour chacun.", ['risques.items']],
    ['risques', 'difficile', function (c) { return "Et si votre hypothèse la plus importante se révèle fausse, quel est votre plan B ?"; }, "Une capacité d'adaptation ; un point de décision clair pour pivoter ou s'arrêter.", ['risques.items']],
    ['plan_commercial', 'moyen', function (c) { return "Comment allez-vous trouver vos " + (c.social ? "premiers bénéficiaires" : "dix premiers clients") + " et combien cela vous coûtera-t-il ?"; }, "Un canal d'acquisition concret, un coût estimé, déjà testé si possible.", ['plan_commercial.prospection', 'plan_commercial.tunnel_vente', 'strategie_marketing.communication']],
    ['plan_operationnel', 'moyen', function (c) { return "Qui produit ou livre " + c.offre.replace('votre ', 'votre ') + " au quotidien, avec quels fournisseurs, et que se passe-t-il s'ils font défaut ?"; }, "Une chaîne opérationnelle maîtrisée et des fournisseurs alternatifs.", ['plan_operationnel.production', 'plan_operationnel.fournisseurs', 'plan_operationnel.logistique']],
    ['impact', 'moyen', function (c) { return "Quel impact social, économique ou environnemental " + c.nom + " produit-il, et comment le mesurez-vous ?" + (c.impactSocial ? " (vous écrivez : « " + c.impactSocial + " »)" : ""); }, "Des indicateurs d'impact mesurables, pas seulement de bonnes intentions.", ['impact.kpi_impact', 'impact.social', 'impact.economique']],
    ['presentation', 'facile', function (c) { return "Pourquoi maintenant ? Qu'est-ce qui a changé pour que ce projet soit possible ou nécessaire aujourd'hui" + (c.lieu ? " à " + c.lieu : "") + " ?"; }, "Un moment favorable expliqué : tendance, réglementation, technologie, besoin urgent.", ['marche.tendances', 'marche.evolution']],
    ['marche', 'moyen', function (c) { return "Comment " + c.nom + " peut-il grandir sans perdre en qualité : nouveaux lieux, nouveaux produits, partenaires ?"; }, "Une trajectoire de croissance réaliste et maîtrisée.", ['presentation.obj_moyen', 'presentation.obj_long', 'calendrier.phases']],
    ['plan_financier', 'difficile', function (c) { return "Quelle est votre marge sur " + (c.produit || "votre produit principal") + " après tous les coûts ?"; }, "Une marge calculée avec les vrais coûts, comparée à celle du secteur.", ['produits.items', 'plan_financier.marge_brute']],
    ['plan_financier', 'difficile', function (c) { return "Combien de mois de trésorerie avez-vous devant vous, et quel est votre besoin en fonds de roulement ?"; }, "Une gestion de trésorerie prudente ; la conscience des décalages entre dépenses et encaissements.", ['plan_financier.tresorerie', 'plan_financier.bfr']],
    ['plan_commercial', 'moyen', function (c) { return "Avez-vous déjà des engagements : commandes, lettres d'intention, partenariats signés ?"; }, "Des preuves de demande : documents, contrats, pré-commandes.", ['plan_commercial.objectifs_vente', 'presentation.historique']],
    ['organisation', 'moyen', function (c) { return "Qui décide quoi chez vous, et comment gérez-vous un désaccord entre associés ?"; }, "Une gouvernance claire, un pacte d'associés ou des règles écrites.", ['organisation.dirigeants', 'organisation.responsabilites']],
    ['financement', 'moyen', function (c) { return "Qu'avez-vous déjà investi vous-même (argent, temps) et qui d'autre vous soutient ?"; }, "Un engagement personnel réel et des soutiens existants.", ['financement.apport_personnel', 'financement.apport_fondateurs', 'plan_financier.pf_apport']],
    ['impact', 'facile', function (c) { return c.social ? "Comment garantissez-vous que l'argent reçu sert bien les bénéficiaires et comment rendez-vous des comptes ?" : "Comment un investisseur sort-il de ce projet, et en combien de temps peut-il espérer récupérer sa mise ?"; }, function (c) { return c.social ? "Transparence, comptes publiés, suivi des fonds." : "Une stratégie de sortie ou de remboursement claire."; }, ['financement.strategie_sortie', 'financement.roi_sortie']],
    ['presentation', 'facile', function (c) { return "Si je ne devais retenir qu'une chose de " + c.nom + ", ce serait quoi ?"; }, "Un message mémorable, résumé en une phrase, qui donne envie d'en savoir plus.", ['resume_executif.projet', 'presentation.mission']]
  ];

  Q.clients = [
    ['solution', 'facile', function (c) { return "Expliquez-moi simplement ce que vous proposez" + (c.produit ? " avec « " + c.produit + " »" : "") + ". En quoi ça m'aide, moi ?"; }, "Un bénéfice direct pour la personne en face, pas une liste de caractéristiques.", ['solution.description', 'solution.avantages']],
    ['probleme', 'facile', function (c) { return "Pourquoi devrais-je changer mes habitudes ? Aujourd'hui je me débrouille autrement."; }, "Le déclencheur du changement : gain de temps, d'argent, de qualité, de confiance.", ['probleme.solutions_existantes', 'probleme.consequences']],
    ['marche', 'moyen', function (c) { return c.concurrent ? "Pourquoi irais-je chez vous plutôt que chez " + c.concurrent + " ?" : "Je connais déjà d'autres solutions. Pourquoi vous ?"; }, "Une différence concrète et crédible, exprimée du point de vue du client.", ['marche.concurrents', 'solution.differenciants']],
    ['produits', 'facile', function (c) { return "Combien ça coûte exactement" + (c.prix ? " (vous annoncez " + c.prix + ")" : "") + " et qu'est-ce qui est compris dans ce prix ?"; }, "Un prix clair, justifié, sans mauvaise surprise ; ce qui est inclus ou non.", ['produits.items', 'plan_commercial.politique_tarifaire']],
    ['produits', 'moyen', function (c) { return "C'est plus cher qu'ailleurs / moins cher que les autres : comment l'expliquez-vous ?"; }, "Une justification de la valeur (qualité, origine, service) plutôt qu'une défense du prix.", ['plan_commercial.politique_tarifaire', 'produits.etude_prix']],
    ['solution', 'moyen', function (c) { return "Qu'est-ce qui me prouve que ça marche ? Avez-vous des témoignages ou des résultats ?"; }, "Des preuves : avis, chiffres, références, démonstration possible.", ['solution.resultats_tests_solution', 'presentation.historique']],
    ['solution', 'moyen', function (c) { return "Puis-je essayer avant de m'engager ?"; }, "Une offre d'essai, d'échantillon ou de première étape à faible risque.", ['plan_commercial.tunnel_vente', 'plan_commercial.argumentaire']],
    ['plan_operationnel', 'moyen', function (c) { return "Quand serai-je " + (c.social ? "accompagné" : "livré") + " et comment ça se passe concrètement ?"; }, "Des délais tenables et un parcours simple, étape par étape.", ['plan_operationnel.logistique', 'plan_operationnel.production']],
    ['plan_operationnel', 'moyen', function (c) { return "Que se passe-t-il si je ne suis pas satisfait ? Est-ce que je peux être remboursé ou repris en charge ?"; }, "Une politique de garantie / réclamation claire qui rassure.", ['plan_operationnel.qualite', 'plan_commercial.argumentaire']],
    ['plan_operationnel', 'difficile', function (c) { return "Comment puis-je être sûr de la qualité" + (c.secteur ? " dans le secteur « " + c.secteur + " »" : "") + " ? Qui contrôle ?"; }, "Des contrôles qualité, certifications, normes ou labels, et une responsabilité identifiable.", ['plan_operationnel.qualite', 'solution.certification_necessaire']],
    ['strategie_marketing', 'facile', function (c) { return "Comment avez-vous connu " + c.nom + "… ou comment vais-je vous trouver ? Où êtes-vous présent ?"; }, "Des canaux cohérents avec là où la cible se trouve vraiment.", ['strategie_marketing.communication', 'strategie_marketing.strategie_digitale']],
    ['plan_commercial', 'moyen', function (c) { return "Comment je commande / je m'inscris ? Combien de temps ça prend ?"; }, "Un parcours d'achat ou d'inscription simple et rapide.", ['plan_commercial.tunnel_vente']],
    ['plan_commercial', 'moyen', function (c) { return "Quels moyens de paiement acceptez-vous" + (c.lieu ? " à " + c.lieu : "") + " ?"; }, "Des moyens de paiement adaptés au contexte local de la cible.", ['plan_commercial.tunnel_vente', 'plan_financier.paiements']],
    ['solution', 'difficile', function (c) { return "Est-ce adapté à ma situation particulière ? Pouvez-vous le personnaliser ?"; }, "Une capacité à s'adapter ou à orienter honnêtement quand ce n'est pas adapté.", ['solution.fonctionnement', 'produits.items']],
    ['presentation', 'moyen', function (c) { return "Qui êtes-vous ? Pourquoi vous ferais-je confiance" + (c.responsable ? " plutôt qu'à quelqu'un d'autre que " + c.responsable : "") + " ?"; }, "Une histoire personnelle crédible, de la transparence, des références.", ['infos_generales.equipe_fondatrice', 'presentation.historique']],
    ['presentation', 'moyen', function (c) { return "Depuis combien de temps existez-vous ? Allez-vous encore être là dans deux ans ?"; }, "La solidité et la durabilité de la structure.", ['infos_generales.date_creation', 'presentation.obj_moyen']],
    ['plan_commercial', 'difficile', function (c) { return "Je suis une " + (c.social ? "personne en difficulté" : "petite entreprise") + " avec peu de moyens : avez-vous des conditions adaptées ?"; }, "Une politique tarifaire inclusive ou des solutions échelonnées.", ['plan_commercial.politique_tarifaire']],
    ['plan_operationnel', 'moyen', function (c) { return "À qui je m'adresse si j'ai un souci après " + (c.social ? "l'accompagnement" : "l'achat") + " ? Comment vous joindre ?"; }, "Un service après-vente joignable, des délais de réponse annoncés.", ['plan_operationnel.qualite', 'infos_generales.telephone', 'infos_generales.email']],
    ['marche', 'moyen', function (c) { return "Mes proches ou mes collègues en ont-ils besoin aussi ? Faites-vous des conditions pour plusieurs personnes ?"; }, "Une logique de recommandation, de groupe ou de parrainage.", ['strategie_marketing.partenariats', 'plan_commercial.prospection']],
    ['impact', 'moyen', function (c) { return "Est-ce responsable ? Quel effet cela a-t-il sur les gens et sur l'environnement ?"; }, "Des engagements concrets et vérifiables, sans effet d'annonce.", ['impact.social', 'impact.environnemental']],
    ['solution', 'facile', function (c) { return "Qu'est-ce qui vous rend différent, en une phrase que je peux répéter à quelqu'un d'autre ?"; }, "Un message simple, spécifique et facile à transmettre.", ['solution.valeur_ajoutee', 'solution.differenciants']],
    ['probleme', 'moyen', function (c) { return "Combien de temps ou d'argent vais-je réellement économiser" + (c.probleme ? " par rapport à « " + court(c.probleme, 70) + " »" : "") + " ?"; }, "Un gain chiffré, même approximatif, sur un cas concret.", ['probleme.cout_probleme', 'solution.valeur_ajoutee']],
    ['solution', 'difficile', function (c) { return "Que faites-vous de mes données personnelles et de ma confidentialité ?"; }, "Un traitement des données clair et respectueux de la loi (information, sécurité).", ['solution.reglementation_solution', 'marche.reglementation']],
    ['plan_commercial', 'moyen', function (c) { return "Avez-vous des conditions de vente écrites (durée, résiliation, engagement) que je peux lire ?"; }, "Des conditions transparentes ; pas de piège.", ['plan_commercial.argumentaire', 'plan_commercial.politique_tarifaire']],
    ['solution', 'moyen', function (c) { return "Et si votre offre évolue ou s'arrête, que devient ce que j'ai déjà pris ?"; }, "Une continuité de service ou une reprise pour le client.", ['plan_operationnel.qualite', 'solution.fonctionnement']],
    ['marche', 'facile', function (c) { return "D'autres personnes comme moi vous ont-elles déjà choisi ? Lesquelles ?"; }, "Des références comparables à l'interlocuteur.", ['presentation.historique', 'solution.nb_utilisateurs_test']],
    ['produits', 'moyen', function (c) { return "Quelles sont les options ou formules, et laquelle me conseillez-vous ?" + (c.produit ? " (autour de « " + c.produit + " »)" : ""); }, "Une gamme claire et un conseil honnête adapté au besoin.", ['produits.items']],
    ['plan_commercial', 'moyen', function (c) { return "Pourquoi cela vaut-il la peine d'agir maintenant plutôt que plus tard ?"; }, "Une raison naturelle d'agir (délai, rareté, urgence réelle) sans pression artificielle.", ['plan_commercial.argumentaire', 'plan_commercial.objectifs_vente']],
    ['presentation', 'facile', function (c) { return "En conclusion, pourquoi " + c.nom + " ?"; }, "Un dernier argument fort, personnel et sincère.", ['presentation.mission', 'resume_executif.projet']],
    ['produits', 'difficile', function (c) { return "Ce prix va-t-il changer bientôt ? Y a-t-il des frais ou des évolutions de tarif que je dois connaître dès maintenant ?"; }, "Une transparence totale sur l'évolution des prix et les frais éventuels.", ['plan_commercial.politique_tarifaire', 'produits.etude_prix']]
  ];

  Q.collaborateurs = [
    ['presentation', 'facile', function (c) { return "Quelle est la vision de " + c.nom + " et où voyez-vous le projet dans cinq ans ?" + (c.vision ? " (votre plan : « " + c.vision + " »)" : ""); }, "Une vision claire et inspirante, cohérente avec les actions décrites.", ['presentation.vision', 'presentation.obj_long']],
    ['presentation', 'facile', function (c) { return "Quelle est votre mission et à quoi servirait mon travail concrètement ?" + (c.mission ? " (« " + c.mission + " »)" : ""); }, "Un lien direct entre la mission et le poste proposé.", ['presentation.mission', 'rh.recrutements']],
    ['presentation', 'moyen', function (c) { return "Quelles sont vos valeurs et comment se voient-elles dans le quotidien de l'équipe ?"; }, "Des valeurs illustrées par des comportements réels, pas des slogans.", ['presentation.valeurs']],
    ['organisation', 'moyen', function (c) { return "Quel serait précisément mon rôle et mes responsabilités ?"; }, "Un rôle défini, avec des objectifs mesurables.", ['rh.recrutements', 'organisation.responsabilites']],
    ['organisation', 'moyen', function (c) { return "Comment est organisée " + c.equipeMot + " aujourd'hui ?" + (c.equipeNb ? " (vous mentionnez " + c.equipeNb + " personnes)" : "") + " Qui rend compte à qui ?"; }, "Un organigramme simple et compris de tous.", ['organisation.equipe', 'infos_generales.organigramme', 'rh.effectif_actuel']],
    ['organisation', 'difficile', function (c) { return "Comment les décisions sont-elles prises ? Aurai-je mon mot à dire ?"; }, "Un mode de décision transparent, avec une place pour l'avis des équipes.", ['organisation.dirigeants', 'organisation.responsabilites']],
    ['rh', 'moyen', function (c) { return c.social ? "Y a-t-il une rémunération ou une indemnisation, et comment sont reconnus les bénévoles ?" : "Quelle rémunération proposez-vous, avec quels avantages, et comment évolue-t-elle ?"; }, "Une proposition claire et honnête, adaptée aux moyens réels de la structure.", ['rh.recrutements', 'rh.masse_salariale', 'plan_financier.salaires']],
    ['rh', 'moyen', function (c) { return "Quel type de contrat, quelle durée, et quelle sécurité pour moi ?"; }, "Un cadre contractuel clair ; l'équilibre entre engagement et stabilité.", ['rh.recrutements']],
    ['rh', 'difficile', function (c) { return "Comment pourrai-je évoluer dans " + c.nom + " ? Y a-t-il des formations prévues ?"; }, "Des perspectives d'évolution et un plan de formation concret.", ['rh.formations', 'rh.competences']],
    ['plan_operationnel', 'moyen', function (c) { return "Avec quels outils et quels moyens vais-je travailler au quotidien ?"; }, "Des moyens matériels et numériques suffisants et identifiés.", ['plan_operationnel.equipements', 'plan_operationnel.technologies']],
    ['plan_operationnel', 'moyen', function (c) { return "À quoi ressemble une semaine type ? Quelle charge de travail dois-je attendre ?"; }, "Une charge de travail réaliste et la capacité de la décrire sans fard.", ['plan_operationnel.production', 'calendrier.phases']],
    ['calendrier', 'moyen', function (c) { return "Quels sont les objectifs des prochains mois et comment mesure-t-on le succès ?"; }, "Des objectifs précis, partagés et suivis.", ['calendrier.phases', 'presentation.obj_court']],
    ['financement', 'difficile', function (c) { return "Le projet est-il financé assez longtemps pour que mon engagement ait du sens ?" + (c.montant ? " (vous cherchez " + c.montant + ")" : ""); }, "De la transparence sur la situation financière et la durée de vie assurée.", ['financement.montant', 'plan_financier.tresorerie']],
    ['risques', 'difficile', function (c) { return "Quels sont les risques principaux et que ferez-vous pour protéger l'équipe en cas de difficulté ?"; }, "Honnêteté sur les risques et engagement envers l'équipe.", ['risques.items']],
    ['organisation', 'moyen', function (c) { return "Comment gérez-vous un conflit dans l'équipe ou un désaccord avec la direction ?"; }, "Un processus de médiation et une culture du dialogue.", ['organisation.responsabilites', 'presentation.valeurs']],
    ['rh', 'moyen', function (c) { return "Quel est le profil des personnes déjà dans l'équipe ? Qu'est-ce que j'apporterais de complémentaire ?"; }, "Une équipe complémentaire ; une place claire pour la nouvelle personne.", ['infos_generales.equipe_fondatrice', 'infos_generales.membres_equipe', 'rh.competences']],
    ['infos_generales', 'facile', function (c) { return "Où et comment travaille-t-on" + (c.lieu ? " à " + c.lieu : "") + " : sur place, à distance, en déplacement ?"; }, "Un cadre de travail concret et cohérent avec l'activité.", ['infos_generales.adresse', 'plan_operationnel.logistique']],
    ['presentation', 'moyen', function (c) { return "Pourquoi " + (c.responsable || "vous") + " avez-vous créé ce projet, et qu'est-ce qui vous a poussé à continuer malgré les difficultés ?"; }, "Une motivation sincère et incarnée.", ['presentation.historique', 'presentation.motivations']],
    ['impact', 'moyen', function (c) { return "Quel sens ce projet a-t-il pour la communauté et pour vous ?" + (c.impactSocial ? " (« " + c.impactSocial + " »)" : ""); }, "Un impact concret qui donne envie de s'engager.", ['impact.social', 'impact.territorial']],
    ['marche', 'moyen', function (c) { return "Qui sont vos partenaires et comment travaillerai-je avec eux ?"; }, "Un réseau de partenaires réel et déjà actif.", ['strategie_marketing.partenariats', 'plan_operationnel.fournisseurs']],
    ['plan_commercial', 'moyen', function (c) { return "Comment mesure-t-on ma contribution aux résultats ? Y a-t-il des objectifs individuels ?"; }, "Des indicateurs de contribution clairs et justes.", ['plan_commercial.objectifs_vente', 'impact.kpi_impact']],
    ['organisation', 'difficile', function (c) { return "Qu'attendez-vous de moi en termes de disponibilité, d'initiative et d'engagement dans le temps ?"; }, "Des attentes explicites, réciproques et équilibrées.", ['rh.competences', 'rh.recrutements']],
    ['presentation', 'moyen', function (c) { return "Comment communiquez-vous en interne : réunions, retours, transparence sur les résultats ?"; }, "Une communication régulière, ouverte et organisée.", ['organisation.responsabilites']],
    ['risques', 'moyen', function (c) { return "Qu'est-ce qui pourrait me faire regretter de vous avoir rejoint ?"; }, "La capacité à reconnaître les points faibles du projet avec franchise.", ['risques.items', 'swot.faiblesses']],
    ['rh', 'difficile', function (c) { return "Y a-t-il une période d'essai, un cadre légal ou une assurance qui me protègent ?"; }, "Un cadre légal respecté et connu.", ['rh.recrutements', 'infos_generales.statut_juridique']],
    ['solution', 'moyen', function (c) { return "Quelle est la plus grande réussite du projet jusqu'ici ?"; }, "Un succès concret, raconté avec des faits.", ['presentation.historique', 'solution.resultats_tests_solution']],
    ['calendrier', 'moyen', function (c) { return "Quelle est la prochaine étape importante et qu'attendez-vous de moi pour l'atteindre ?"; }, "Une feuille de route immédiate et un lien clair avec le rôle.", ['calendrier.phases']],
    ['presentation', 'facile', function (c) { return "Si je rejoins " + c.nom + ", quel sera mon premier mois ? Comment m'accueillerez-vous ?"; }, "Un accueil organisé et une intégration préparée.", ['rh.formations', 'rh.recrutements']],
    ['impact', 'facile', function (c) { return "Pourquoi devrais-je choisir " + c.nom + " plutôt qu'une autre opportunité ?"; }, "Une proposition de valeur pour les collaborateurs : sens, apprentissage, perspectives.", ['presentation.valeurs', 'presentation.vision']],
    ['organisation', 'moyen', function (c) { return "Sur qui pourrai-je compter au quotidien pour apprendre et être soutenu dans mon travail ?"; }, "Un tutorat ou un accompagnement identifié, des personnes référentes.", ['rh.formations', 'organisation.equipe']]
  ];

  Q.inconnus = [
    ['resume_executif', 'facile', function (c) { return "Bonjour ! On m'a dit que vous aviez un projet. Vous pouvez me le présenter en trente secondes ?"; }, "Un pitch clair, sans jargon, avec un début, une idée et une raison d'être.", ['resume_executif.projet']],
    ['resume_executif', 'facile', function (c) { return "C'est quoi exactement " + c.nom + " ? Expliquez-moi comme si j'avais dix ans."; }, "Une explication très simple, imagée ; pas de termes techniques.", ['resume_executif.projet', 'solution.description']],
    ['probleme', 'facile', function (c) { return "D'où vous est venue l'idée ? Qu'est-ce qui s'est passé ?"; }, "Une histoire personnelle, un déclic ; ce qui rend le projet authentique.", ['presentation.historique', 'probleme.description']],
    ['probleme', 'facile', function (c) { return "Quel problème ça résout, et pour qui ?" + (c.cible ? " (vous pensez à : " + c.cible + ")" : ""); }, "Un problème précis et une cible bien identifiée.", ['probleme.description', 'probleme.qui_concerne']],
    ['solution', 'facile', function (c) { return "Et comment ça marche, concrètement ?"; }, "Un fonctionnement décrit en trois étapes simples.", ['solution.fonctionnement', 'solution.description']],
    ['solution', 'moyen', function (c) { return "Il y a déjà des gens qui font ça, non ? Qu'est-ce qui est différent chez vous ?"; }, "Une différence nette, honnête, et la connaissance de ce qui existe déjà.", ['solution.differenciants', 'marche.concurrents']],
    ['marche', 'facile', function (c) { return "C'est pour qui ? Ça pourrait me servir, à moi ?"; }, "Savoir à qui ça s'adresse et reconnaître quand ce n'est pas pour la personne.", ['marche.cible', 'probleme.qui_concerne']],
    ['presentation', 'moyen', function (c) { return "Et vous, qui êtes-vous ? Pourquoi c'est vous qui portez ce projet ?"; }, "Légitimité : parcours, expérience, motivation.", ['infos_generales.equipe_fondatrice', 'infos_generales.responsable']],
    ['presentation', 'moyen', function (c) { return "Vous êtes seul ou il y a une équipe ? Qui fait quoi ?"; }, "Une équipe décrite simplement, avec les rôles.", ['infos_generales.equipe_fondatrice', 'organisation.equipe']],
    ['presentation', 'facile', function (c) { return "Où en êtes-vous aujourd'hui ? Vous avez déjà commencé ?"; }, "Un état d'avancement honnête avec des faits (date de création, premiers résultats).", ['infos_generales.stade', 'presentation.historique']],
    ['presentation', 'moyen', function (c) { return "Qu'avez-vous déjà réussi à faire ? Une fierté ?"; }, "Un succès concret, chiffré ou raconté.", ['presentation.historique', 'solution.resultats_tests_solution']],
    ['produits', 'moyen', function (c) { return "Ça coûte combien ? Et qui paie : vous, les gens, des aides ?"; }, "Un modèle économique expliqué simplement.", ['produits.items', 'plan_financier.ca_1']],
    ['plan_financier', 'difficile', function (c) { return "Vous en vivez ? Ça rapporte de l'argent ou c'est surtout un engagement ?"; }, "Honnêteté sur la situation financière actuelle et la perspective.", ['plan_financier.ca_1', 'plan_financier.seuil_rentabilite']],
    ['financement', 'moyen', function (c) { return "De quoi avez-vous besoin pour avancer ?" + (c.montant ? " (vous parlez de " + c.montant + ")" : "") + " Comment est-ce que je pourrais vous aider ?"; }, "Une demande claire et concrète : argent, contacts, compétences, visibilité.", ['financement.montant', 'resume_executif.besoins']],
    ['presentation', 'moyen', function (c) { return "Quel est votre rêve pour ce projet, dans cinq ans ?"; }, "Une ambition forte et réaliste.", ['presentation.vision', 'presentation.obj_long']],
    ['impact', 'moyen', function (c) { return "En quoi c'est utile pour la société ou pour la communauté ?" + (c.lieu ? " (ici, à " + c.lieu + ")" : ""); }, "Un impact simple à expliquer, avec un exemple concret.", ['impact.social', 'impact.economique']],
    ['risques', 'difficile', function (c) { return "Qu'est-ce qui pourrait mal tourner ? Qu'est-ce qui vous fait peur ?"; }, "Une lucidité sur les risques, sans dramatiser.", ['risques.items']],
    ['presentation', 'moyen', function (c) { return "Qu'est-ce qui a été le plus dur jusqu'ici, et comment l'avez-vous surmonté ?"; }, "Une anecdote sincère montrant la persévérance.", ['presentation.historique']],
    ['marche', 'moyen', function (c) { return "Vous avez déjà des gens qui vous suivent ou vous soutiennent ?"; }, "Des soutiens, des premiers utilisateurs, une communauté.", ['presentation.historique', 'solution.nb_utilisateurs_test']],
    ['strategie_marketing', 'moyen', function (c) { return "Comment faites-vous pour faire connaître " + c.nom + " ? Je pourrais en parler autour de moi, vous diriez quoi ?"; }, "Un message simple que les autres peuvent répéter.", ['strategie_marketing.communication', 'strategie_marketing.identite_marque']],
    ['presentation', 'moyen', function (c) { return "Si je devais le raconter à un ami, je dirais quoi en une phrase ?"; }, "Une phrase-clé mémorable, que l'interlocuteur retient et répète.", ['resume_executif.projet']],
    ['presentation', 'facile', function (c) { return "Vous faites ça depuis longtemps ? Pourquoi vous n'avez pas choisi un métier plus simple ?"; }, "Un engagement personnel authentique.", ['presentation.historique', 'infos_generales.date_creation']],
    ['plan_operationnel', 'moyen', function (c) { return "Concrètement, que faites-vous de vos journées pour ce projet" + (c.lieu ? " à " + c.lieu : "") + " ?"; }, "Un quotidien décrit avec des actions concrètes.", ['plan_operationnel.production', 'calendrier.phases']],
    ['marche', 'moyen', function (c) { return "Pourquoi ça marcherait ici" + (c.lieu ? ", à " + c.lieu : "") + " plutôt qu'ailleurs ?"; }, "Une connaissance du contexte local et de ses atouts.", ['marche.potentiel', 'marche.tendances']],
    ['presentation', 'moyen', function (c) { return "Qu'est-ce qui vous distingue des autres porteurs de projet que je rencontre ?"; }, "Une singularité sincère, sans arrogance.", ['solution.differenciants', 'presentation.valeurs']],
    ['resume_executif', 'moyen', function (c) { return "Et si je vous dis que je n'y crois pas, vous me répondez quoi ?"; }, "Calme, écoute, argument factuel plutôt que défensif.", ['solution.valeur_ajoutee', 'risques.items']],
    ['impact', 'facile', function (c) { return "Comment je peux suivre votre projet ou y participer ?"; }, "Une invitation simple à agir : site, réseaux, événement, contact.", ['infos_generales.site_web', 'infos_generales.email']],
    ['calendrier', 'moyen', function (c) { return "Quelle est la prochaine étape, et quand ?"; }, "Un prochain jalon précis avec une échéance.", ['calendrier.phases', 'presentation.obj_court']],
    ['presentation', 'facile', function (c) { return "Qu'est-ce que vous aimeriez que je retienne de ce que vous venez de me dire ?"; }, "Un message final clair, simple et personnel.", ['resume_executif.projet', 'presentation.mission']],
    ['resume_executif', 'facile', function (c) { return "Vous pouvez me redonner le nom du projet et en résumer l'essentiel en une phrase ?"; }, "La répétition du nom et d'une phrase synthétique qui reste en tête.", ['resume_executif.projet']]
  ];

  var ORDRE = { facile: 1, moyen: 2, difficile: 3 };

  function generer(bp, sections) {
    var c = contexte(bp, sections);
    var out = {};
    Object.keys(Q).forEach(function (aud) {
      out[aud] = Q[aud].map(function (e, i) {
        return {
          id: aud.slice(0, 3) + (i + 1),
          audience: aud,
          section: e[0],
          niveau: e[1],
          q: e[2](c),
          indice: typeof e[3] === 'function' ? e[3](c) : e[3],
          lacune: !repond(c.s, e[4]),   // le plan ne contient encore aucune réponse à cette question
          champs: e[4]
        };
      });
    });
    return out;
  }

  window.BPTest = { generer: generer, PROFILS: PROFILS, ORDRE: ORDRE };
})();

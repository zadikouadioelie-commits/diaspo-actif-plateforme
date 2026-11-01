/* ═════════════════════════════════════════════════
   server/kofi-competences.js — « QUE SAIS-TU FAIRE ? » (2026-10-31)

   Demande explicite : Koffi doit pouvoir dire TOUT ce qu'il sait faire, et toute question qui l'interroge sur ses compétences ne doit PAS compter dans les crédits.
   Ces questions reçoivent donc une réponse FIXE (aucun appel à l'IA : aucun coût, aucun débit, aucune invention possible), construite d'après les vrais réglages
   (nombre de questions offertes, forfait, durée de conservation…). Deux rôles : « eleve » (tuteur d'une formation) et « createur » (assistant du formateur).

   Toute fonctionnalité qui change doit être corrigée ICI (comme dans server/kofi-createur-guide.js) : c'est la liste que Koffi donne à l'utilisateur.
   ═════════════════════════════════════════════════ */
"use strict";

/* Texte ramené à l'essentiel : minuscules, sans accents ni ponctuation, sans formule de politesse. */
function normaliser(texte) {
  return String(texte || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[’`´]/g, "'").replace(/[^a-z0-9' ]/g, " ")
    .replace(/\b(s'?\s?il (te|vous) plait|stp|svp|please|merci)\b/g, " ")
    .replace(/\s+/g, " ").trim()
    .replace(/^(bonjour|bonsoir|salut|hello|hi|hey) /, "")
    .replace(/^(dis|dites)( moi)? /, "")
    .replace(/^(koffi|kofi|ko fi|coffee|coffe|cofi) /, "")
    .replace(/^(explique moi|peux tu me dire|pouvez vous me dire) /, "").trim();
}

const MOTIFS = [
  /^(que|qu est ce que|qu'est ce que|quoi) (tu |vous )?(sais|peux|fais|savez|pouvez|faites|sait|peut|fait)( tu| vous| koffi| il)?( faire| aider| offrir| proposer| m'apporter| m'aider| pour moi| d'autre| encore| comme aide)*$/,
  /^(tu |vous )?(sais|peux|fais|savez|pouvez|faites) (faire )?(quoi|quoi d'autre)$/,
  /^ce que (tu|vous) (sais|peux|fais|savez|pouvez|faites)( faire)?$/,
  /^a quoi (tu )?(sers?|sert|servez)( tu| vous| koffi)?$/,
  /^a quoi sert koffi$/,
  /\b(tes|vos|ses) (competences|capacites|fonctionnalites|possibilites|talents|limites|pouvoirs|services)\b/,
  /^(presente toi|presentez vous|qui es tu|qui etes vous|tu es qui|vous etes qui|c'est quoi koffi|qu'est ce que koffi|qu'est ce que c'est koffi|qui est koffi|parle moi de toi|parlez moi de vous)$/,
  /^comment (tu )?(fonctionnes?|marches?|travailles?)( tu)?$/,
  /^comment (ca )?(marche|fonctionne) koffi$/,
  /^comment (je peux|puis je|peut on|on peut) (t'|vous )?(utiliser|parler)( koffi)?$/,
  /^(comment t'utiliser|comment utiliser koffi|mode d'emploi)$/,
  /^(en quoi|dans quoi|comment) (peux tu|pouvez vous|tu peux|vous pouvez) (m'aider|aider)$/,
  /^que (peux tu|pouvez vous) m'(apporter|offrir)$/,
  /^(aide|help)$/,
  /^(what can you do|what are you able to do|what do you do|what can koffi do|what are you capable of|what are you good at|what can you do for me|who are you|introduce yourself|tell me about yourself|how do you work|how can you help( me)?|what can you help me with|how do i use you|how can i use you|what do you know how to do|what are your (skills|capabilities|features|limits|abilities))$/,
];

/* Vrai si le message est UNE question sur ce que sait faire Koffi (courte, sans autre sujet) : les questions de contenu ne sont jamais prises pour cela. */
function estQuestionCompetences(texte) {
  const brut = String(texte || "");
  if (!brut.trim() || brut.length > 120) return false;
  const n = normaliser(brut);
  if (!n || n.length > 90) return false;
  return MOTIFS.some(re => re.test(n));
}

const euros = v => Number(v).toFixed(v % 1 ? 2 : 0).replace(".", ",") + " €";
const pluriel = (n, un, plusieurs) => `${n} ${Number(n) > 1 ? plusieurs : un}`;

/* Le portefeuille (2026-10-31) : UN solde en euros pour tout Koffi. Phrase donnée à la fin de chaque réponse « Que sais-tu faire ? ». */
function phraseCredit(lg, r) {
  r = r || {};
  const num = (v, d) => (v == null ? d : Number(v));
  const mensuel = num(r.credit_mensuel_utilisateur_eur, 0.5), offertes = num(r.gratuit_questions, 15);
  const min = num(r.recharge_min_eur, 3), ratio = num(r.recharge_ratio, 3);
  if (lg === "en") {
    const e = v => euros(v).replace(",", ".");
    return `Credit: one single balance in euros for all of Koffi (course tutor, course-creation assistant, Directory advisor). Premium accounts receive ${e(mensuel)} of Koffi use every month; other accounts get ${pluriel(offertes, "question", "questions")} once, for good. After that you can top up from ${e(min)} (${e(min)} paid = ${e(min / ratio)} of use). This question — like any question about what I can do — is free and takes nothing from your balance.`;
  }
  return `Crédit : un seul solde en euros pour tout Koffi (tuteur des formations, assistant de création, conseiller de l'Annuaire). Les comptes Premium reçoivent ${euros(mensuel)} d'utilisation Koffi chaque mois ; les autres comptes ont ${pluriel(offertes, "question offerte", "questions offertes")}, une seule fois. Ensuite, vous rechargez à partir de ${euros(min)} (${euros(min)} payés = ${euros(min / ratio)} d'utilisation). Cette question — comme toute question sur ce que je sais faire — est gratuite et ne retire rien de votre solde.`;
}

function reponseEleve(lg, r) {
  r = r || {};
  if (lg === "en") {
    return [
      "Here is everything I can do to help you in this course:",
      "• Answer your questions about the course — only from the materials you have access to, with the source cited like [1] (one click takes you to it).",
      "• Explain an idea in simpler words, or put it another way.",
      "• Summarise the lesson you are on: write “summarise this chapter”.",
      "• Help you revise: I can end with a short check question.",
      "• Answer in French or in English (FR / EN buttons).",
      "• In the Directory (Premium accounts), I am also an advisor: describe who you are looking for and I suggest at least three profiles with a match percentage.",
      "• Keep your conversations for " + (r.retention_jours || 60) + " days — you can delete them whenever you want. You can also tell me whether an answer was helpful, or report a mistake.",
      "",
      "What I do not do: give the answers to a quiz or an exam (I am switched off during an assessment), talk about content you cannot access, or give personalised legal, medical or financial advice. If I cannot find the answer in the materials, I will tell you and suggest asking your trainer.",
      "",
      phraseCredit(lg, r),
    ].join("\n");
  }
  return [
    "Voici tout ce que je sais faire pour vous aider dans cette formation :",
    "• Répondre à vos questions sur le cours — uniquement à partir des supports auxquels vous avez accès, avec la source citée, par exemple [1] (un clic vous y amène).",
    "• Vous expliquer une notion autrement, en langage simple, ou la reformuler.",
    "• Résumer la leçon en cours : écrivez « résume ce chapitre ».",
    "• Vous aider à réviser : je peux terminer par une courte question de vérification.",
    "• Répondre en français ou en anglais (boutons FR / EN).",
    "• Dans l'Annuaire (comptes Premium), je suis aussi conseiller d'orientation : décrivez la personne que vous cherchez et je vous propose au moins trois profils, avec un pourcentage de correspondance.",
    "• Garder vos conversations " + (r.retention_jours || 60) + " jours — vous pouvez les supprimer quand vous voulez. Vous pouvez aussi me dire si une réponse vous a servi, ou signaler une erreur.",
    "",
    "Ce que je ne fais pas : donner les réponses d'un quiz ou d'un examen (je suis coupé pendant une évaluation), parler d'un contenu auquel vous n'avez pas accès, ni donner un conseil juridique, médical ou financier personnalisé. Si je ne trouve pas la réponse dans les supports, je vous le dis et je vous propose de demander à votre formateur.",
    "",
    phraseCredit(lg, r),
  ].join("\n");
}

function reponseCreateur(r) {
  r = r || {};
  return [
    "Je suis votre assistant de création de formation. Voici tout ce que je sais faire :",
    "",
    "1) Vous guider dans tous les outils de l'éditeur : Infos générales, Catégorie, Tarification, Accès, Modules & Leçons, Studio, Quiz & Évaluations, Certificat, Carte mentale, Prérequis, Aperçu, Koffi, Soumission. Je vous dis quel outil utiliser, où cliquer et dans quel ordre, et je vous explique le parcours d'une formation (brouillon → soumise → publiée).",
    "",
    "2) Faire des petites missions à votre place. Je les PROPOSE, vous cliquez « Appliquer » : sans votre clic, rien n'est modifié.",
    "• Remplir les Infos générales (titre, sous-titre, descriptions, objectifs, public, prérequis, compétences acquises, niveau, durée, mots-clés).",
    "• Créer un module.",
    "• Créer un chapitre dans un module.",
    "• Créer une leçon de texte dans un chapitre.",
    "• Créer une carte mentale et, si vous indiquez un chapitre, l'intégrer à ce chapitre (« crée une carte mentale du module 1 et intègre-la au chapitre 3 »).",
    "• Organiser un long texte que vous collez : je le découpe en chapitres et en leçons sans changer un seul mot.",
    "",
    "3) Vous aider à structurer et à rédiger : proposer un plan, des titres, des objectifs, reformuler un passage, en restant fidèle à ce que vous m'avez donné.",
    "",
    "4) Ranger votre travail : vos discussions peuvent être classées dans des dossiers (par exemple « Module 3 »), chacune avec son propre fil.",
    "",
    "5) Dans l'Annuaire (comptes Premium), je suis aussi conseiller d'orientation : décrivez la personne que vous cherchez et je vous propose au moins trois profils, avec un pourcentage de correspondance.",
    "",
    "Ce que je ne peux pas faire : publier ou soumettre la formation, fixer ou changer un prix, rien supprimer, créer ou modifier des quiz et des questions, ajouter vos images ou vos vidéos (vous les ajoutez dans le Studio), envoyer des messages, ni voir vos apprenants. Pour tout cela, je vous indique l'onglet et les étapes.",
    "",
    phraseCredit("fr", r),
  ].join("\n");
}

function reponseAnnuaire(r) {
  return [
    "Je suis votre conseiller d'orientation dans l'Annuaire. Voici tout ce que je sais faire :",
    "• Comprendre ce que vous cherchez et votre situation, en quelques phrases (activité, compétence, projet, besoin).",
    "• Vous poser les questions utiles pour préciser : ville, pays, type de profil (personne, initiative, collectivité), domaine d'activité.",
    "• Parcourir les profils publics de l'Annuaire et vous en proposer au moins trois, avec un pourcentage de correspondance et la raison en une phrase. Le pourcentage est calculé par la plateforme d'après vos critères, il n'est pas inventé.",
    "• Établir une LISTE (jusqu'à 30 profils) quand vous la demandez, avec vos propres mots : « fais-moi la liste des… », « montre-moi tous les comptes que tu peux lister », « et la suite ? ». Sans thème précis, je montre les profils les plus complets ; avec un thème, je les classe par pourcentage de correspondance. Elle ne contient que les comptes proposables ; un nombre limité de listes est possible chaque jour.",
    "• Comprendre le sens de votre demande sans formule précise, et tenir compte de la conversation : « plutôt à Lyon », « seulement les associations », « ma ville » (lue dans votre profil par la plateforme, pas par moi).",
    "• Vous mener en un clic sur le profil public de la personne qui vous intéresse.",
    "• Vous dire honnêtement quand je ne trouve pas trois bons profils, plutôt que d'en inventer.",
    "",
    "Ce que je ne fais pas : lire des informations privées (e-mail, téléphone, messages), contacter quelqu'un à votre place, ni proposer les comptes qui ont choisi de ne pas être proposés par Koffi. Je ne propose que les comptes Premium qui ont une photo de profil et un descriptif rempli ; pour les autres, utilisez la recherche manuelle et les filtres de l'Annuaire.",
    "",
    "Le conseiller est réservé aux comptes Premium qui acceptent eux-mêmes d'être proposés (réciprocité : cochez « Ne pas être proposé par Koffi » dans vos paramètres et vous ne pouvez plus l'utiliser).",
    "",
    phraseCredit("fr", r),
  ].join("\n");
}

function reponseEvenements(r) {
  return [
    "Je suis votre guide des événements. Voici tout ce que je sais faire :",
    "• Comprendre ce qui vous intéresse : un thème (conférence, entrepreneuriat, culture…), une ville ou un pays, une période (aujourd'hui, ce week-end, cette semaine, le mois prochain…), gratuit ou payant, en ligne ou sur place.",
    "• Répondre à des questions comme « quels sont les événements de ma ville cette semaine ? » : « ma ville » est lue dans votre profil par la plateforme, pas par moi.",
    "• Chercher dans les événements publics à venir et vous en montrer les plus proches dans le temps, avec la date, le lieu et la mention gratuit / payant ; un clic ouvre la fiche de l'événement pour vous inscrire.",
    "• Vous expliquer comment fonctionnent les événements (événement complet, événement flash, qui peut en publier…).",
    "• Pour les comptes Initiative, Collectivité et Administrateur avec abonnement Premium : CRÉER un événement flash avec vous. Je vous pose les questions qui manquent (titre, date, lieu, image…), je rédige la description, je prépare un brouillon, et je ne le publie que quand vous confirmez (bouton « Publier » ou « oui »).",
    "• Pour tout compte : ÉCRIRE une publication pour votre fil d'actualité avec vous, la publier tout de suite ou la PROGRAMMER (un jour et une heure précis, heure de Paris), avec une image si vous le souhaitez. Je rédige le texte avec vous, je vous montre l'aperçu et je ne publie qu'après votre accord. Pour une publication programmée, je vous préviens que l'heure est approximative : elle ne part jamais avant, mais peut avoir quelques minutes de retard.",
    "• Vous dire honnêtement quand je ne trouve rien, plutôt que d'inventer.",
    "",
    "Ce que je ne fais pas : vous inscrire à votre place, ni montrer les événements privés, réservés aux abonnés ou en brouillon, ni publier quoi que ce soit sans votre confirmation. Les filtres de la page restent disponibles pour tout parcourir.",
    "",
    phraseCredit("fr", r),
  ].join("\n");
}

function reponseBusinessPlan(r) {
  return [
    "Je peux jouer un interlocuteur pour tester la solidité de votre business plan. Voici comment cela se passe :",
    "• Vous choisissez mon rôle : investisseur (ou financeur), banquier, client (ou bénéficiaire).",
    "• Je lis un résumé de votre plan, rubrique par rubrique, puis je vous pose UNE question à la fois, adaptée à ce que vous avez écrit.",
    "• Vous répondez ; je réagis comme le ferait mon personnage, puis je pose la question suivante.",
    "• À tout moment, « Comment répondre ? » vous donne des conseils pour bien répondre à la question en cours.",
    "• À la fin (ou quand vous le demandez), je fais un bilan : vos forces, vos points faibles avec la rubrique du plan à retravailler, et des pistes concrètes.",
    "",
    "Ce que je ne fais pas : modifier votre plan, donner un conseil juridique, fiscal ou d'investissement, ni garantir qu'un vrai investisseur réagira de la même façon. Seul vous pouvez lancer l'exercice sur votre plan, après avoir autorisé la lecture de son résumé.",
    "",
    phraseCredit("fr", r),
  ].join("\n");
}

/* Assistant de l'administrateur : « Que sais-tu faire ? » — réponse fixe, gratuite. */
function reponseAdmin() {
  return [
    "Je suis votre assistant d'administrateur. Voici tout ce que je sais faire :",
    "• Vous donner les chiffres de la plateforme : comptes par type, nouveaux inscrits, comptes actifs, pays les plus représentés, formations, événements, cagnottes, publications.",
    "• Ouvrir un module du tableau de bord (par exemple « ouvre les Finances » ou « va dans la Modération »).",
    "• Préparer une notification à des membres (tous, ou seulement un type de compte, un pays, ou un compte précis) : je rédige, vous voyez à combien de comptes elle ira, et rien ne part sans votre choix.",
    "• Programmer un rappel pour vous, ou programmer une de ces tâches à une heure précise (aujourd'hui, demain…, heure de Paris).",
    "",
    "À chaque tâche, vous choisissez : « Je valide moi-même » (j'attends votre clic, ou je vous préviens à l'heure dite) ou « Autonomie » (je l'exécute seul, maintenant ou à l'heure programmée). Dites-le directement dans votre demande (« sans moi », « prépare, je validerai ») ou utilisez les boutons.",
    "",
    "Ce que je ne fais pas encore : suspendre ou supprimer un compte, publier à votre place, modifier des contenus ou des paiements. Pour cela, je vous ouvre le bon module. Une tâche programmée s'exécute dans les 5 minutes qui suivent l'heure choisie.",
    "",
    "Pour vous, aucune limite de crédit : cette question est de toute façon toujours gratuite.",
  ].join("\n");
}

/* Le MÊME Koffi partout (2026-11-01, demande explicite) : chaque réponse « Que sais-tu faire ? » rappelle aussi ce que Koffi sait faire ailleurs (carte commune : server/kofi-comprehension.js) et qu'aucune formule n'est nécessaire. */
const Comprehension = require("./kofi-comprehension");
function ailleurs(lg, lieu) {
  return "\n" + [
    "",
    lg === "en" ? "I am the same Koffi everywhere on Diaspo'Actif. Elsewhere on the platform I can also:" : "Je suis le même Koffi partout sur Diaspo'Actif. Ailleurs sur la plateforme, je sais aussi :",
    ...Comprehension.carteLignes(lg, lieu),
    "",
    lg === "en" ? "Talk to me in your own words: no special phrase is needed, I work out what you mean from your sentence and from our conversation." : "Parlez-moi avec vos propres mots : aucune formule n'est nécessaire, je comprends le sens de votre demande et de notre conversation.",
  ].join("\n");
}
const LIEU_FORMATION = "Formations (FORMATION DIASPORA)";
module.exports = {
  estQuestionCompetences,
  reponseEleve: (lg, r) => reponseEleve(lg, r) + ailleurs(lg === "en" ? "en" : "fr", LIEU_FORMATION),
  reponseCreateur: r => reponseCreateur(r) + ailleurs("fr", LIEU_FORMATION),
  reponseAnnuaire: r => reponseAnnuaire(r) + ailleurs("fr", "Annuaire"),
  reponseEvenements: r => reponseEvenements(r) + ailleurs("fr", "Événements"),
  reponseBusinessPlan: r => reponseBusinessPlan(r) + ailleurs("fr", "Business Plan"),
  reponseAdmin: () => reponseAdmin() + ailleurs("fr", "Espace administrateur"),
  phraseCredit, normaliser,
};

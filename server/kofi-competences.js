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
      "• Keep your conversations for " + (r.retention_jours || 60) + " days — you can delete them whenever you want. You can also tell me whether an answer was helpful, or report a mistake.",
      "",
      "What I do not do: give the answers to a quiz or an exam (I am switched off during an assessment), talk about content you cannot access, or give personalised legal, medical or financial advice. If I cannot find the answer in the materials, I will tell you and suggest asking your trainer.",
      "",
      `Questions: ${pluriel(r.gratuit_questions == null ? 5 : r.gratuit_questions, "question is", "questions are")} offered, then a pack of ${r.forfait_questions || 100} questions for ${euros(r.forfait_prix_eur == null ? 5 : r.forfait_prix_eur)}. This question — like any question about what I can do — is free and does not use any of your questions.`,
    ].join("\n");
  }
  return [
    "Voici tout ce que je sais faire pour vous aider dans cette formation :",
    "• Répondre à vos questions sur le cours — uniquement à partir des supports auxquels vous avez accès, avec la source citée, par exemple [1] (un clic vous y amène).",
    "• Vous expliquer une notion autrement, en langage simple, ou la reformuler.",
    "• Résumer la leçon en cours : écrivez « résume ce chapitre ».",
    "• Vous aider à réviser : je peux terminer par une courte question de vérification.",
    "• Répondre en français ou en anglais (boutons FR / EN).",
    "• Garder vos conversations " + (r.retention_jours || 60) + " jours — vous pouvez les supprimer quand vous voulez. Vous pouvez aussi me dire si une réponse vous a servi, ou signaler une erreur.",
    "",
    "Ce que je ne fais pas : donner les réponses d'un quiz ou d'un examen (je suis coupé pendant une évaluation), parler d'un contenu auquel vous n'avez pas accès, ni donner un conseil juridique, médical ou financier personnalisé. Si je ne trouve pas la réponse dans les supports, je vous le dis et je vous propose de demander à votre formateur.",
    "",
    `Questions : ${pluriel(r.gratuit_questions == null ? 5 : r.gratuit_questions, "question offerte", "questions offertes")}, puis un forfait de ${r.forfait_questions || 100} questions à ${euros(r.forfait_prix_eur == null ? 5 : r.forfait_prix_eur)}. Cette question — comme toute question sur ce que je sais faire — est gratuite et ne décompte aucune de vos questions.`,
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
    "Ce que je ne peux pas faire : publier ou soumettre la formation, fixer ou changer un prix, rien supprimer, créer ou modifier des quiz et des questions, ajouter vos images ou vos vidéos (vous les ajoutez dans le Studio), envoyer des messages, ni voir vos apprenants. Pour tout cela, je vous indique l'onglet et les étapes.",
    "",
    `Messages : ${pluriel(r.createur_gratuit_jour == null ? 20 : r.createur_gratuit_jour, "message offert", "messages offerts")} par jour, puis un forfait de ${r.createur_forfait_messages || 1000} messages à ${euros(r.createur_forfait_prix_eur == null ? 5 : r.createur_forfait_prix_eur)}. Cette question — comme toute question sur ce que je sais faire — est gratuite et ne décompte aucun de vos messages.`,
  ].join("\n");
}

module.exports = { estQuestionCompetences, reponseEleve, reponseCreateur, normaliser };

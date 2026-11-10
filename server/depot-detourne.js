/* ===========================================================
   server/depot-detourne.js — Lot F (2026-11-10) : un seul module de dépôt de projet,
   « Soumettre à Diaspo'Actif ».
   ===========================================================
   Une boutique (vitrine) n'a AUCUN formulaire ni appel à « déposer / soumettre / envoyer son projet,
   son dossier de financement… ». Ce fichier détecte, dans les TEXTES saisis par le propriétaire d'une
   boutique (présentation, services, FAQ, brouillon…), les formulations qui détourneraient le dépôt de
   projet hors du module central, et permet de refuser l'enregistrement avec un message clair.

   Choix de conception :
     - le test porte sur des mots entiers, sans accents ni casse (« Déposez » = « deposez ») ;
     - une mention du module central lui-même (« Soumettre à Diaspo'Actif ») est neutralisée avant l'analyse :
       renvoyer vers le module central est précisément ce qu'on veut ;
     - il faut un VERBE de dépôt à l'impératif ou à l'infinitif, suivi (≤ 5 mots) d'un NOM de projet
       (« votre projet », « un dossier de financement », « votre business plan »…), ou la locution nominale
       « dépôt de projet / de dossier de financement ». Décrire ce qu'on fait (« nous accompagnons vos
       projets ») n'est jamais refusé ;
     - aucune donnée personnelle n'est lue ni conservée : la fonction ne renvoie qu'un résultat.
   Lancer les tests : node --test tests/depot-detourne.test.js
   =========================================================== */
'use strict';

const NOM_MODULE = "Soumettre à Diaspo'Actif";

const MESSAGE_REFUS =
  "Ce texte invite à déposer un projet ou un dossier de financement directement depuis une boutique. " +
  "Tout dépôt de projet passe par un seul module : « " + NOM_MODULE + " ». " +
  "Reformulez en renvoyant vers ce module, ou retirez cette phrase. Rien n'a été enregistré.";

/* Mention autorisée du module central, retirée avant l'analyse. */
const MENTION_MODULE = /\b(?:soumettre|soumettez|deposer|deposez|depot|soumission)\s+(?:un\s+projet\s+)?a\s+diaspo'?\s*actif\b/g;

/* Verbes de dépôt, à l'impératif ou à l'infinitif (jamais « nous déposons » décrivant une activité). */
const VERBE = "(?:deposer|deposez|soumettre|soumettez|envoyer|envoyez|transmettre|transmettez|postuler|postulez|candidater|candidatez)";
/* Noms visés : le projet porté par le visiteur, ou son dossier de financement. */
const NOM = "(?:projets?|dossiers? (?:de |d')?(?:financement|candidature|projet)|demandes? (?:de |d')?(?:financement|pret|credit)|business plans?|plans? d'affaires)";
/* Déterminants qui désignent le projet du visiteur (et non un projet de la boutique). */
const DET = "(?:votre|vos|ton|tes|un|une|son|ses|le|ce|cette|tout|tous|toute|vous|nous)";

const MOTIFS = [
  new RegExp("\\b" + VERBE + "\\b(?:\\W+\\w+){0,4}?\\W+" + DET + "\\W+(?:\\w+\\W+){0,2}?" + NOM + "\\b"),
  new RegExp("\\b" + VERBE + "\\b(?:\\W+\\w+){0,3}?\\W+" + NOM + "\\b"),
  new RegExp("\\bdepots?\\s+(?:de |d')\\s*(?:votre |vos |un |des )?" + NOM + "\\b"),
  /\bformulaire\s+de\s+(?:depot|soumission)\b/,
];

function normaliser(texte) {
  return String(texte == null ? "" : texte)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/<[^>]*>/g, " ")      /* texte riche : on ignore les balises */
    .replace(/\s+/g, " ");
}

/** true si le texte ressemble à un dépôt de projet détourné hors du module central. */
function detecterDepotDetourne(texte) {
  /* Une phrase qui renvoie vers le module central (« Pour soumettre un projet, utilisez Soumettre à
     Diaspo'Actif. ») est le comportement voulu : on l'écarte avant l'analyse des autres phrases. */
  const t = normaliser(texte)
    .split(/(?<=[.!?;])\s+|\n+/)
    .filter((phrase) => !new RegExp(MENTION_MODULE.source).test(phrase))
    .join(" ");
  if (t.length < 12) return false;
  return MOTIFS.some((re) => re.test(t));
}

/* Aplatit une valeur quelconque (chaîne, JSON sérialisé, tableau, objet) en liste de chaînes. */
function aplatir(v, sortie, profondeur) {
  if (v == null || profondeur > 6) return sortie;
  if (typeof v === "string") { sortie.push(v); return sortie; }
  if (Array.isArray(v)) { v.forEach((x) => aplatir(x, sortie, profondeur + 1)); return sortie; }
  if (typeof v === "object") { Object.values(v).forEach((x) => aplatir(x, sortie, profondeur + 1)); }
  return sortie;
}

/** Renvoie le message de refus si l'une des valeurs contient un dépôt détourné, sinon null. */
function controlerTextes(valeurs) {
  const textes = aplatir(valeurs, [], 0);
  for (const t of textes) {
    if (typeof t !== "string" || t.length < 12 || /^data:/i.test(t)) continue; /* images en base64 : jamais du texte */
    if (detecterDepotDetourne(t.slice(0, 20000))) return MESSAGE_REFUS;        /* borne le coût sur les très longs contenus */
  }
  return null;
}

module.exports = { detecterDepotDetourne, controlerTextes, MESSAGE_REFUS, NOM_MODULE };

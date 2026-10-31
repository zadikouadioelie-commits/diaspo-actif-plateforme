/* ═════════════════════════════════════════════════
   server/kofi-ia.js — Koffi : ADAPTATEUR DU FOURNISSEUR D'IA (2026-10-30)

   Seul fichier qui parle à l'IA. Tout est côté serveur : la clé (ANTHROPIC_API_KEY, variable d'environnement) n'est jamais envoyée au navigateur,
   et le navigateur ne choisit jamais le modèle (verrouillé dans les réglages, par défaut Claude Haiku 5.5).

   - Kit officiel @anthropic-ai/sdk. Haiku 5.5 : réflexion adaptative (toujours active), maîtrisée par un effort FAIBLE (output_config.effort) ;
     pas de budget de réflexion (400), pas de température (400).
   - Un refus de sécurité (stop_reason « refusal ») n'est pas une erreur : il est renvoyé tel quel (Haiku 5.5 n'a pas de repli côté serveur).
   - Les erreurs du fournisseur sont ramenées à quelques codes stables (KofiIAErreur.code) pour que l'appelant rende le crédit et réponde clairement.
   - FAUX FOURNISSEUR : KOFI_IA_FAUSSE=1 (refusé en production) — réponses déterministes pour les tests locaux, sans réseau ni clé.
   ═════════════════════════════════════════════════ */
"use strict";
const fs = require("node:fs");

const MODELE_PAR_DEFAUT = "claude-haiku-5-5";
/* Modèles que les réglages ont le droit de désigner (liste blanche : une valeur fantaisiste ne part jamais chez le fournisseur). */
const MODELES_AUTORISES = ["claude-haiku-5-5", "claude-sonnet-5-5"];
const EN_PRODUCTION = !!process.env.VERCEL || process.env.NODE_ENV === "production";

class KofiIAErreur extends Error {
  constructor(code, message) { super(message); this.name = "KofiIAErreur"; this.code = code; }
}

const fausse = () => process.env.KOFI_IA_FAUSSE === "1" && !EN_PRODUCTION;
const configure = () => fausse() || !!process.env.ANTHROPIC_API_KEY;

let _client = null;
function client() {
  if (_client) return _client;
  const Anthropic = require("@anthropic-ai/sdk");
  /* Vercel coupe à 30 s : on abandonne avant, et un seul nouvel essai (le SDK gère le 429 / 5xx). */
  _client = new Anthropic({ timeout: 24000, maxRetries: 1 });
  return _client;
}

/* Assistant du formateur (système marqué ASSISTANT_FORMATEUR) : réponses déterministes selon un mot-clé du message, avec ou sans missions <actions>. */
function reponseFausseCreateur({ systeme, messages }) {
  const dernier = String((messages[messages.length - 1] || {}).content || "");
  const q = (dernier.split("<message_du_formateur>")[1] || dernier).split("</message_du_formateur>")[0];
  const entree = Math.ceil((String(systeme).length + messages.reduce((a, m) => a + String(m.content).length, 0)) / 4);
  if (/PANNEFAUSSE/.test(q)) throw new KofiIAErreur("indisponible", "Panne simulée.");
  if (/LIMITEFAUSSE/.test(q)) throw new KofiIAErreur("limite", "Limite simulée.");
  if (/REFUSFAUX/.test(q)) return { texte: "", entree, sortie: 5, lecture_cache: 0, refus: true, arret: "refusal" };
  const chap = (/\[chapitre_id=(\d+)\]/.exec(dernier) || [])[1];
  const mod = (/\[module_id=(\d+)\]/.exec(dernier) || [])[1];
  const nbP = Math.max(0, ...[...dernier.matchAll(/\[P(\d+)\]/g)].map(m => Number(m[1])));
  let texte;
  if (/CARTEFAUSSE/.test(q)) texte = `Voici une carte mentale pour le module. Vérifiez-la, puis cliquez sur « Appliquer ». <actions>[{"type":"creer_carte_mentale","titre":"Carte du module 1","centre":"Module 1","branches":[{"titre":"Idée A","enfants":["a1","a2"]},{"titre":"Idée B","enfants":["b1"]}]${chap ? `,"chapitre_id":${chap}` : ""}}]</actions>`;
  else if (/PLANFAUX/.test(q)) { const mid = Math.max(1, Math.floor(nbP / 2)); texte = `Je vous propose ce plan. <actions>[{"type":"importer_texte","nouveau_module":"Module importé","plan":[{"chapitre":"Chapitre un","lecons":[{"titre":"Première leçon","de":1,"a":${mid}},{"titre":"Seconde leçon","de":${mid + 1},"a":${nbP}}]}]}]</actions>`; }
  else if (/IDFAUX/.test(q)) texte = 'Je vous propose ceci. <actions>[{"type":"ajouter_chapitre","module_id":999999,"titre":"Chapitre fantôme"},{"type":"ajouter_chapitre","module_id":' + (mod || 0) + ',"titre":"Chapitre réel"}]</actions>';
  else if (/INFOSFAUX/.test(q)) texte = 'Voici les infos que je vous propose. <actions>[{"type":"renseigner_infos","champs":{"titre":"Formation sur la gestion financière","niveau":"Débutant","duree_heures":4,"public_concerne":"Les entrepreneurs","description":"<p>Une formation <strong>pratique</strong>.</p><script>alert(1)</script>","inconnu":"ignoré"}}]</actions>';
  else if (/MODULEFAUX/.test(q)) texte = 'Je vous propose de créer ce module. <actions>[{"type":"ajouter_module","titre":"Module test","description":"Créé par Koffi"}]</actions>';
  else if (/LECONFAUSSE/.test(q)) texte = `Voici une leçon. <actions>[{"type":"ajouter_lecon","chapitre_id":${chap || 0},"titre":"Leçon test","contenu_html":"<p>Un paragraphe.</p><script>alert(1)</script>","duree_minutes":3}]</actions>`;
  else texte = "Pour cela, utilisez l'onglet « Quiz & Évaluations » de l'éditeur de formation.";
  return { texte, entree, sortie: Math.ceil(texte.length / 4), lecture_cache: 0, refus: false, arret: "end_turn" };
}

/* Réponse déterministe pour les tests : cite le premier extrait, ou se comporte selon un mot-clé de la question. */
function reponseFausse({ systeme, messages }) {
  if (/ASSISTANT_FORMATEUR/.test(String(systeme))) return reponseFausseCreateur({ systeme, messages });
  if (process.env.KOFI_FAUX_LOG) { try { fs.appendFileSync(process.env.KOFI_FAUX_LOG, JSON.stringify({ systeme, messages }) + "\n"); } catch (e) { /* sans importance */ } }
  const dernier = String((messages[messages.length - 1] || {}).content || "");
  const question = (dernier.split("<question>")[1] || dernier).split("</question>")[0];
  const entree = Math.ceil((String(systeme).length + messages.reduce((a, m) => a + String(m.content).length, 0)) / 4);
  if (/PANNEFAUSSE/.test(question)) throw new KofiIAErreur("indisponible", "Panne simulée.");
  if (/LIMITEFAUSSE/.test(question)) throw new KofiIAErreur("limite", "Limite simulée.");
  if (/REFUSFAUX/.test(question)) return { texte: "", entree, sortie: 5, lecture_cache: 0, refus: true, arret: "refusal" };
  const extraits = [...dernier.matchAll(/\[S(\d+)\] \(([^)]*)\)\n([^\n]*)/g)];
  let texte;
  if (/SANSSOURCE/.test(question)) texte = "Voici une réponse sans aucune référence.";
  else if (/FAUSSEREF/.test(question)) texte = "Une affirmation avec une référence inventée [S99] et une vraie [S1].";
  else if (/AILLEURS/.test(question)) texte = "Je ne trouve pas cette information dans les supports auxquels vous avez accès.";
  else if (extraits.length) texte = `D'après le cours : ${extraits[0][3].slice(0, 140)} [S${extraits[0][1]}]`;
  else texte = "Je ne trouve pas cette information dans les supports auxquels vous avez accès.";
  return { texte, entree, sortie: Math.ceil(texte.length / 4), lecture_cache: 0, refus: false, arret: "end_turn" };
}

/* repondre({ modele, systeme, messages, maxSortie }) → { texte, entree, sortie, lecture_cache, refus, arret } — ou lève KofiIAErreur. */
async function repondre({ modele, systeme, messages, maxSortie }) {
  if (fausse()) return reponseFausse({ systeme, messages });
  if (!process.env.ANTHROPIC_API_KEY) throw new KofiIAErreur("non_configure", "Le service d'IA n'est pas configuré.");
  const nom = MODELES_AUTORISES.includes(modele) ? modele : MODELE_PAR_DEFAUT;
  const Anthropic = require("@anthropic-ai/sdk");
  let rep;
  try {
    rep = await client().messages.create({
      model: nom,
      max_tokens: Math.min(Math.max(Number(maxSortie) || 1200, 200), 4000),
      system: systeme,
      output_config: { effort: "low" },
      messages,
    });
  } catch (e) {
    /* Du plus précis au plus général ; jamais de comparaison de messages. Le détail du fournisseur n'est pas exposé à l'élève. */
    if (e instanceof Anthropic.RateLimitError) throw new KofiIAErreur("limite", "Limite du fournisseur atteinte.");
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) throw new KofiIAErreur("auth", "Accès au fournisseur refusé.");
    if (e instanceof Anthropic.BadRequestError) throw new KofiIAErreur("requete", "Requête refusée par le fournisseur.");
    if (e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.InternalServerError) throw new KofiIAErreur("indisponible", "Fournisseur injoignable.");
    if (e instanceof Anthropic.APIError) throw new KofiIAErreur("indisponible", "Erreur du fournisseur (" + e.status + ").");
    throw e;
  }
  const texte = (rep.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
  const u = rep.usage || {};
  return {
    texte, entree: Number(u.input_tokens) || 0, sortie: Number(u.output_tokens) || 0, lecture_cache: Number(u.cache_read_input_tokens) || 0,
    refus: rep.stop_reason === "refusal", arret: rep.stop_reason || "",
  };
}

module.exports = { repondre, configure, fausse, KofiIAErreur, MODELE_PAR_DEFAUT, MODELES_AUTORISES };

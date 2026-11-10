/* ═════════════════════════════════════════════════
   server/kofi-sondages.js — KOFFI DES SONDAGES : CRÉE UN SONDAGE À PARTIR D'UN PDF OU D'UNE PHOTO (2026-11-10)

   Demande du titulaire : dans l'onglet Sondages, on joint un PDF (ou une photo JPEG/PNG) à Koffi et on lui dit « fais-en un sondage ». Koffi repère le titre, la description,
   les questions et la forme des réponses (oui/non, choix multiple avec la liste des choix, échelle, texte libre…), demande l'image de couverture, propose lui-même où afficher
   le sondage (onglet Sondages, fil d'actualité, profil public, boutique, événements du compte) et le crée — par EXACTEMENT les mêmes contrôles que le formulaire de création.
   Règles :
   - Lecture des fichiers : server/kofi-fichiers.js (commun à tous les Koffi). Le fichier part à l'IA pour CE message seulement ; ensuite seul le brouillon est conservé.
   - Le modèle ne propose qu'un BROUILLON ; le SERVEUR le revalide champ par champ (types de question, nombre de choix, dates, durée de 30 jours au plus, événements du compte),
     écrit LUI-MÊME l'aperçu et ne crée rien avant l'accord de la personne (bouton « Créer le sondage » ou « oui »).
   - Création : sondageCreer() de server/index.js — la fonction de la route POST /api/sondages (droit de créer, 30 jours, événements du créateur, lieux d'affichage, alerte aux abonnés).
   - L'image de couverture est envoyée par la personne, enregistrée sur le CDN par le serveur et rattachée au brouillon par le serveur : le modèle ne la voit pas.
   - Le modèle voit les TITRES et dates des événements du compte (pour les lier), jamais leurs inscrits ni leurs réponses ; aucun autre sondage, aucune réponse de sondage.
   - Crédit : UN SONDAGE ENTIER, de la lecture du document jusqu'à sa publication, = UNE action = UN crédit (forfait ACTION_EUR, ou une question offerte pour les comptes sans Premium).
     Le crédit est pris au premier échange réussi du sondage ; les échanges suivants, les boutons et la création sont compris. Un échange raté (panne, refus, réponse illisible) ne coûte rien.
   ═════════════════════════════════════════════════ */
"use strict";
const IA = require("./kofi-ia");
const Competences = require("./kofi-competences");
const Fichiers = require("./kofi-fichiers");
const SansReponse = require("./kofi-sans-reponse");
const { norm } = require("./kofi-annuaire");

const MARQUEUR = "ASSISTANT_SONDAGES";
const ROLES_CREATION_INFO = "Initiative, Collectivité, Administrateur ou Premium";
/* Un sondage entier = une action = un crédit. Forfait en euros pour les comptes qui ont un solde ; modifiable sans toucher au code par KOFI_ACTION_SONDAGE_EUR. */
const ACTION_EUR = Number(process.env.KOFI_ACTION_SONDAGE_EUR) > 0 ? Number(process.env.KOFI_ACTION_SONDAGE_EUR) : 0.02;
/* Garde-fou : au-delà de ce nombre d'échanges pour un même sondage, un nouveau crédit est pris (évite une conversation sans fin pour un seul crédit). */
const MAX_ECHANGES_PAR_CREDIT = 30;
const MAX_QUESTIONS = 40, MAX_OPTIONS = 12, MAX_MESSAGE = 12000;
const CATS_ECHANGE = ["sondages_mensuel", "sondages_achat", "sondages_illimite", "sondages_offert", "sondages_inclus"];

const TYPES_QUESTION = {
  choix_unique: "Choix unique", choix_multiple: "Choix multiple", oui_non: "Oui / Non", texte_libre: "Réponse libre (courte)", texte_long: "Réponse libre (longue)",
  echelle_5: "Échelle de 1 à 5", echelle_10: "Échelle de 1 à 10", etoiles: "Étoiles (1 à 5)", nombre: "Nombre", date: "Date",
};
const AVEC_OPTIONS = ["choix_unique", "choix_multiple"];
const CATEGORIES = {
  consultation_citoyenne: "Consultation citoyenne", projet: "Projet", emploi: "Emploi", formation: "Formation", culture: "Culture", tourisme: "Tourisme",
  investissement: "Investissement", sante: "Santé", numerique: "Numérique", education: "Éducation", environnement: "Environnement", autre: "Autre",
};
const RESULTATS = { apres_cloture: "Visibles après la clôture", temps_reel: "Visibles en temps réel", createur: "Visibles du créateur seul", public: "Publics" };
const LIEUX = { onglet: "Onglet Sondages", fil: "Fil d'actualité", profil: "Profil public", boutique: "Boutique" };

const nettoyer = s => require("./kofi-interdits").masquerSecrets(String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\r\n/g, "\n").trim());
const court = (s, max) => nettoyer(s).replace(/\s+/g, " ").slice(0, max);
const parseJson = s => { try { return JSON.parse(s); } catch (_) { return null; } };
const sqlDate = d => d.toISOString().slice(0, 19).replace("T", " ");
const z = n => String(n).padStart(2, "0");
const oui = v => v === true || v === 1 || v === "1" || v === "true" || v === "oui";
const nombre = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : null; };
const euros = n => Number(n).toFixed(Number(n) % 1 ? 2 : 0).replace(".", ",") + " €";

/* ── Dates (heure de Paris) ── */
function aujourdhuiParis(ms) {
  const p = {};
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms == null ? Date.now() : ms)).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}
const dateUTC = ymd => new Date(ymd + "T00:00:00Z");
const versYmd = d => `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
const ymdValide = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && versYmd(dateUTC(s)) === s;
const dateLongue = ymd => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dateUTC(ymd));
const plusJours = (ymd, n) => { const d = dateUTC(ymd); d.setUTCDate(d.getUTCDate() + n); return versYmd(d); };
const DUREE_MAX = 30;   /* jours, premier et dernier compris (même règle que le formulaire) */

/* ── Le brouillon : ce que le modèle a le droit de proposer, revalidé ici ── */
function validerQuestion(q) {
  q = q && typeof q === "object" ? q : {};
  const texte = court(q.texte, 300);
  const type = TYPES_QUESTION[q.type] ? q.type : (q.type === "texte_court" || q.type === "texte" ? "texte_libre" : "choix_unique");
  const inconnu = !!q.type && !TYPES_QUESTION[q.type] && q.type !== "texte_court" && q.type !== "texte";
  const options = AVEC_OPTIONS.includes(type)
    ? (() => { const vus = new Set(); return (Array.isArray(q.options) ? q.options : []).map(o => court(o, 120)).filter(o => o && !vus.has(norm(o)) && vus.add(norm(o))).slice(0, MAX_OPTIONS); })() : [];
  const sortie = { texte, type, options, obligatoire: q.obligatoire === undefined ? true : oui(q.obligatoire) };
  if (["echelle_5", "echelle_10", "etoiles"].includes(type)) {
    const a = court(q.min_label, 40), b = court(q.max_label, 40);
    if (a) sortie.min_label = a; if (b) sortie.max_label = b;
  }
  return { question: sortie, inconnu };
}
/* brut = ce que le modèle (ou le brouillon précédent) a produit ; ctx = { permis:Set(ids d'événements du compte), auj:'AAAA-MM-JJ' }.
   Renvoie { champs, problemes } : `champs` est toujours un brouillon cohérent. */
function validerBrouillon(brut, ctx) {
  const b = brut && typeof brut === "object" && !Array.isArray(brut) ? brut : {};
  ctx = ctx || {};
  const problemes = [];
  const vus = new Set(), questions = [];
  for (const q of (Array.isArray(b.questions) ? b.questions : []).slice(0, MAX_QUESTIONS + 6)) {
    const v = validerQuestion(q);
    if (!v.question.texte || vus.has(norm(v.question.texte))) continue;
    if (questions.length >= MAX_QUESTIONS) { problemes.push("trop_de_questions"); break; }
    vus.add(norm(v.question.texte)); questions.push(v.question);
    if (v.inconnu) problemes.push("type_inconnu:" + v.question.texte);
  }
  const auj = ctx.auj || aujourdhuiParis();
  let debut = ymdValide(b.date_debut) ? b.date_debut : "", fin = ymdValide(b.date_cloture) ? b.date_cloture : "";
  if (fin && fin < auj) { fin = ""; problemes.push("fin_passee"); }
  if (debut && debut < auj) debut = "";
  const depart = debut || auj;
  if (fin && fin < depart) { const t = fin; fin = depart; debut = ""; problemes.push("dates_inversees"); void t; }
  if (fin && Math.round((dateUTC(fin) - dateUTC(depart)) / 86400000) + 1 > DUREE_MAX) { fin = plusJours(depart, DUREE_MAX - 1); problemes.push("duree_reduite"); }
  const lx = b.lieux && typeof b.lieux === "object" ? b.lieux : {};
  const lieux = { onglet: oui(lx.onglet), fil: oui(lx.fil), profil: oui(lx.profil), boutique: oui(lx.boutique) };
  const permis = ctx.permis instanceof Set ? ctx.permis : new Set();
  const ids = [...new Set((Array.isArray(b.evenement_ids) ? b.evenement_ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0))].slice(0, 20);
  const evenement_ids = ids.filter(i => permis.has(i));
  if (evenement_ids.length < ids.length) problemes.push("evenement_inconnu");
  const lieuxChoisis = oui(b.lieux_choisis) || Object.values(lieux).some(Boolean) || evenement_ids.length > 0;
  const url = /^(https:\/\/|\/(?!\/))/.test(String(b.couverture_url || "")) ? String(b.couverture_url).slice(0, 500) : "";
  const anonyme = oui(b.anonyme);
  return {
    champs: {
      titre: court(b.titre, 150), description: nettoyer(b.description).slice(0, 800), objectif: nettoyer(b.objectif).slice(0, 300),
      categorie: CATEGORIES[b.categorie] ? b.categorie : "autre", questions, anonyme,
      resultats_visibles: RESULTATS[b.resultats_visibles] ? b.resultats_visibles : "apres_cloture",
      date_debut: debut, date_cloture: fin, lieux, evenement_ids, lieux_choisis: lieuxChoisis,
      publier: oui(b.publier) && lieuxChoisis, couverture_url: url, couverture_choix: url ? "avec" : (b.couverture_choix === "sans" ? "sans" : ""),
    },
    problemes,
  };
}
/* Ce qui manque encore pour pouvoir créer le sondage : [{ cle, libelle }]. */
function manquants(f) {
  const m = [];
  if (!f || !f.titre) m.push({ cle: "titre", libelle: "le titre du sondage" });
  if (!f || !f.questions || !f.questions.length) m.push({ cle: "questions", libelle: "au moins une question" });
  (f && f.questions || []).forEach(q => { if (AVEC_OPTIONS.includes(q.type) && q.options.length < 2) m.push({ cle: "options", libelle: `les choix proposés pour « ${q.texte} » (au moins 2)` }); });
  if (f && !f.couverture_url && f.couverture_choix !== "sans") m.push({ cle: "couverture", libelle: "l'image de couverture (ou « sans image »)" });
  if (f && !f.lieux_choisis) m.push({ cle: "lieux", libelle: "où afficher le sondage (ou le garder en brouillon)" });
  return m;
}
/* Deux brouillons identiques une fois revalidés : « oui » ne vaut accord que pour l'aperçu que la personne a vu. */
const memeBrouillon = (a, b, ctx) => JSON.stringify(validerBrouillon(a, ctx).champs) === JSON.stringify(validerBrouillon(b, ctx).champs);

const ligneQuestion = (q, i) => `${i + 1}. ${q.texte} — ${TYPES_QUESTION[q.type].toLowerCase()}${q.options.length ? " : " + q.options.join(", ") : ""}${q.obligatoire ? "" : " (facultative)"}`;
function quand(f, auj) {
  const debut = f.date_debut || (f.publier ? auj : "");
  const fin = f.date_cloture || (debut ? plusJours(debut, DUREE_MAX - 1) : "");
  if (debut && fin) return `Du ${dateLongue(debut)} au ${dateLongue(fin)} inclus`;
  return fin ? `Jusqu'au ${dateLongue(fin)} inclus` : `Pendant ${DUREE_MAX} jours à partir de la publication`;
}
/* Aperçu écrit par le serveur (jamais par le modèle) : c'est exactement ce qui sera créé. `titresEvt` : Map(id → titre) des événements du compte. */
function vue(f, manq, titresEvt, auj) {
  manq = manq || manquants(f);
  titresEvt = titresEvt || new Map();
  const lieux = [...Object.keys(LIEUX).filter(k => f.lieux[k]).map(k => LIEUX[k]), ...f.evenement_ids.map(i => "Événement : " + (titresEvt.get(i) || "n°" + i))];
  return {
    type: "sondage", titre: f.titre, description: f.description.slice(0, 300), categorie: CATEGORIES[f.categorie], questions: f.questions.map(ligneQuestion),
    quand: quand(f, auj || aujourdhuiParis()), repondants: f.anonyme ? "Réponses anonymes" : "Les répondants indiquent leur nom, prénom et e-mail", resultats: RESULTATS[f.resultats_visibles],
    couverture: f.couverture_url || null, couverture_texte: f.couverture_url ? "Image de couverture reçue" : (f.couverture_choix === "sans" ? "Sans image de couverture" : "Image de couverture à choisir"),
    lieux, statut: f.publier && lieux.length ? "Le sondage sera publié tout de suite dans ces lieux." : "Le sondage sera enregistré en brouillon : personne ne le verra tant que vous ne le publiez pas.",
    pret: manq.length === 0, manquants: manq.map(x => x.libelle),
  };
}
/* Corps envoyé à sondageCreer() (le serveur applique ses propres contrôles). */
function corpsSondage(f) {
  return {
    titre: f.titre, description: f.description || null, objectif: f.objectif || null, categorie: f.categorie, type: "sondage", rayon_publication: "national",
    date_debut: f.date_debut || null, date_cloture: f.date_cloture || null, anonyme: f.anonyme, confidentialite: f.anonyme ? "anonyme" : "nominatif",
    resultats_visibles: f.resultats_visibles, photos_json: f.couverture_url ? [f.couverture_url] : [], statut: f.publier ? "ouvert" : "brouillon",
    diffusion: f.lieux, evenement_ids: f.evenement_ids,
    questions: f.questions.map(q => ({ texte: q.texte, type: q.type, options: q.options, obligatoire: q.obligatoire, min_label: q.min_label, max_label: q.max_label })),
  };
}

/* Le modèle répond en JSON (éventuellement entouré de ```). Renvoie null si illisible. */
function lireSortie(texte) {
  let t = String(texte || "").trim();
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(t); if (m) t = m[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  const o = parseJson(t.slice(a, b + 1));
  if (!o || !["question", "repondre", "sondage", "abandonner", "sans_reponse"].includes(o.action)) return null;
  if (o.action === "sans_reponse") return { action: "sans_reponse", message: "" };
  const message = court(o.message, o.action === "repondre" ? 1100 : 800);
  if (o.action === "question" || o.action === "repondre") return message ? { action: o.action, message } : null;
  if (o.action === "abandonner") return { action: "abandonner", message };
  return { action: "sondage", message, brouillon: o.brouillon && typeof o.brouillon === "object" && !Array.isArray(o.brouillon) ? o.brouillon : {}, confirme: o.confirme === true };
}

/* ── Le prompt système ── */
function systemePour() {
  return [
    `${MARQUEUR} — Tu es Koffi, l'assistant des sondages de Diaspo'Actif, plateforme de la diaspora africaine. Tu es dans l'onglet « Sondages & consultations » : tu aides à CRÉER un sondage, notamment à partir d'un document (PDF ou photo) que la personne te joint, et tu expliques comment fonctionnent les sondages.`,
    "",
    "RÈGLES ABSOLUES :",
    "1. Tu ne vois AUCUN sondage existant, AUCUNE réponse de sondage, aucune donnée de compte : tu ne connais que ce que la personne t'écrit, les fichiers qu'elle te joint, la liste <evenements> de SES propres événements et les FAITS ci-dessous. Tu n'inventes jamais le contenu d'un sondage : ce que le document ne dit pas, tu le demandes.",
    "2. Tu réponds UNIQUEMENT par un objet JSON, sans autre texte, de l'une de ces formes :",
    '   {"action":"question","message":"<une seule question courte>"}',
    '   {"action":"repondre","message":"<ta réponse en 1 à 8 phrases>"}',
    '   {"action":"sondage","message":"<la prochaine question, ou une phrase qui présente l\'aperçu>","brouillon":{"titre":"","description":"","objectif":"","categorie":"autre","questions":[{"texte":"","type":"choix_unique","options":[],"obligatoire":true}],"anonyme":false,"resultats_visibles":"apres_cloture","date_debut":"","date_cloture":"","lieux":{"onglet":false,"fil":false,"profil":false,"boutique":false},"evenement_ids":[],"lieux_choisis":false,"publier":false,"couverture_choix":""},"confirme":false}',
    '   {"action":"abandonner","message":"<court message>"}',
    '   {"action":"sans_reponse"}   (UNIQUEMENT quand la demande concerne les sondages ou la plateforme et que tu n\'as vraiment pas l\'information : le serveur répond alors lui-même par le message officiel et transmet la demande à l\'équipe)',
    "",
    "COMPRENDRE LA DEMANDE :",
    "3. La personne parle comme à un humain, avec ses propres mots : aucune formule à connaître. « Fais-en un sondage », « utilise ce document pour créer un formulaire », « crée-moi ça » = préparer un sondage. Déduis le sens de la phrase, de la conversation et du document.",
    "4. « repondre » sert à EXPLIQUER les sondages (durée, lieux d'affichage, résultats, anonymat, qui peut créer…) d'après les FAITS. Pour une demande qui relève d'un autre endroit de la plateforme (événements, formations, annuaire…), dis où aller.",
    "",
    "PRÉPARER UN SONDAGE (seulement si <droits> indique creer_sondage: oui ; sinon explique que seuls les comptes " + ROLES_CREATION_INFO + " peuvent créer un sondage) :",
    "5. Reprends <brouillon_precedent> et ne change QUE ce que la personne change. Si elle te joint un document, c'est la SOURCE : repère le titre, la description (ou l'objectif), chaque question numérotée ou à puce, et la forme de la réponse attendue pour chacune.",
    `6. "questions" : au plus ${MAX_QUESTIONS}. "type" vaut l'un de : ${Object.keys(TYPES_QUESTION).join(", ")}. Déduis-le du document : « oui / non », cases à cocher « plusieurs réponses possibles » = choix_multiple, une seule réponse parmi une liste = choix_unique, « notez de 1 à 5 » = echelle_5 (ou etoiles), question ouverte = texte_libre (courte) ou texte_long. Pour choix_unique et choix_multiple, recopie la LISTE DES CHOIX telle qu'elle figure dans le document (2 au moins, ${MAX_OPTIONS} au plus). Si le document ne donne pas les choix, demande-les. "obligatoire" vaut true sauf si le document dit « facultatif ».`,
    "7. \"categorie\" vaut l'une de : " + Object.keys(CATEGORIES).join(", ") + ". \"resultats_visibles\" vaut apres_cloture (par défaut), temps_reel, createur ou public. \"anonyme\" vaut false (les répondants donnent nom, prénom, e-mail) sauf si la personne ou le document veut des réponses anonymes. Le sondage dure 30 jours au plus.",
    "8. Pose UNE seule question à la fois, en tenant compte de <etat_brouillon>, dans cet ordre : (a) ce qui manque dans le document (titre, choix…) ; (b) L'IMAGE DE COUVERTURE : demande-la en une phrase (« Quelle image de couverture souhaitez-vous ? Joignez-la avec le bouton « Image de couverture », ou dites-moi « sans image » ») — quand <image_recue> vaut oui, la couverture est enregistrée, ne la redemande pas ; si elle ne veut pas d'image, mets \"couverture_choix\":\"sans\" ; (c) LES LIEUX D'AFFICHAGE : propose-lui TOI-MÊME la liste et demande où afficher le sondage : « Onglet Sondages », « Fil d'actualité », « Profil public », « Boutique », et chacun de ses événements listés dans <evenements> (cite leur titre). Elle peut en choisir plusieurs, ou aucun (le sondage reste alors en brouillon) : mets \"lieux_choisis\":true dès qu'elle a répondu ; (d) la date de fin si elle en veut une (sinon 30 jours).",
    "9. LIEUX : coche dans \"lieux\" ceux qu'elle choisit. Pour lier le sondage à un événement, mets son numéro (le champ id de <evenements>) dans \"evenement_ids\" — uniquement des numéros de <evenements>, jamais d'autres. Un sondage lié à un événement reste indépendant des inscriptions à cet événement. \"publier\" vaut true si elle veut le publier tout de suite dans les lieux choisis, false pour un brouillon.",
    "10. Tu ne dis JAMAIS que le sondage est créé ni publié : c'est le serveur qui le crée, après l'accord de la personne, et qui l'annonce lui-même. Mets \"confirme\":true UNIQUEMENT si la personne vient de confirmer ce qu'elle a vu dans l'aperçu (« oui », « c'est bon », « crée-le »). Tu n'écris jamais toi-même l'aperçu complet.",
    "11. Si la personne renonce, utilise \"abandonner\".",
    "",
    Fichiers.CONSIGNE_FICHIERS,
    "",
    "FAITS SUR LES SONDAGES (réponds d'après eux, n'invente rien) :",
    "- Les sondages et consultations servent à recueillir l'avis de la communauté. On peut y répondre sans compte (nom, prénom, e-mail demandés sauf sondage anonyme). Un sondage dure 30 jours au maximum ; à l'échéance il est clôturé (réponses impossibles, résultats consultables) et peut être republié.",
    "- Créer un sondage est ouvert aux comptes Initiative, Collectivité, Administrateur et aux comptes Premium.",
    "- Un sondage s'affiche seulement dans les lieux choisis : l'onglet Sondages, le fil d'actualité (une publication d'annonce est créée), le profil public, la boutique, et les événements du créateur auxquels il est lié. Sans aucun lieu, il reste un brouillon visible de son seul créateur.",
    "- Types de questions : choix unique, choix multiple, oui/non, réponse libre courte ou longue, échelles de 1 à 5 ou de 1 à 10, étoiles, nombre, date.",
    "- Les résultats peuvent être visibles après la clôture (par défaut), en temps réel, par le créateur seul ou publics. Les abonnés à l'alerte « Être informé des prochains sondages » sont prévenus à la publication.",
    "- Un sondage complet, de la préparation avec Koffi jusqu'à sa publication, compte pour UN crédit Koffi.",
    "",
    ...require("./kofi-comprehension").bloc("fr", "Sondages"),
  ].join("\n");
}

module.exports = {
  MARQUEUR, ACTION_EUR, MAX_ECHANGES_PAR_CREDIT, TYPES_QUESTION, CATEGORIES, RESULTATS, LIEUX, CATS_ECHANGE,
  validerBrouillon, manquants, memeBrouillon, vue, quand, lireSortie, systemePour, corpsSondage,
};

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, sondageCreer, sondageAccesCreation } = deps;
  const K = require("./kofi");
  const P = K.Portefeuille;

  async function exiger(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    return user;
  }
  const contexte = (user, req) => K.contexteKoffi(db, deps, user, req);
  const refuser = (res, ctx) => {
    if (ctx.etat === "pays") { sendJSON(res, 403, { error: "Koffi n'est pas disponible dans votre pays pour le moment. Les sondages restent utilisables sans lui.", code: "pays_non_pris_en_charge" }); return true; }
    if (ctx.etat === "mineur") { sendJSON(res, 403, { error: "Koffi est réservé aux personnes majeures (18 ans ou plus).", code: "mineur" }); return true; }
    if (ctx.etat === "majorite") { sendJSON(res, 403, { error: "Confirmez avoir 18 ans ou plus pour utiliser Koffi.", code: "majorite_requise", texte: K.TEXTE_MAJORITE }); return true; }
    if (ctx.etat === "desactive") { sendJSON(res, 403, { error: "Koffi est désactivé pour le moment.", code: "desactive" }); return true; }
    if (ctx.etat === "indisponible") { sendJSON(res, 503, { error: "Koffi est épuisé pour le moment : l'équipe le recharge. Réessayez plus tard.", code: "indisponible" }); return true; }
    return false;
  };
  const MSG_ROLE = `Seuls les comptes ${ROLES_CREATION_INFO} peuvent créer un sondage. Je peux en revanche vous expliquer comment fonctionnent les sondages.`;
  const peutCreer = async user => !!(typeof sondageAccesCreation === "function" ? await sondageAccesCreation(user) : false);

  /* Les événements DU COMPTE (titre et date seulement) : ce que le modèle voit pour les lier, et la liste des numéros autorisés. */
  async function evenementsDuCompte(userId) {
    try {
      const l = await db.prepare("SELECT id, titre, date_evt FROM evenements WHERE owner_user_id=? ORDER BY date_evt DESC, id DESC LIMIT 30").all(userId);
      return l.map(e => ({ id: Number(e.id), titre: court(e.titre, 80), date: String(e.date_evt || "").slice(0, 10) })).filter(e => e.titre);
    } catch (e) { return []; }
  }
  const ctxValidation = (evts, auj) => ({ permis: new Set(evts.map(e => e.id)), auj });

  /* ── Création : par sondageCreer(), la fonction de la route habituelle ── */
  async function creerSondage(user, f) {
    if (typeof sondageCreer !== "function") return { ok: false, message: "La création n'est pas disponible pour le moment." };
    if (!(await peutCreer(user))) return { ok: false, message: MSG_ROLE };
    let rep;
    try { rep = await sondageCreer(user, corpsSondage(f)); }
    catch (e) { console.error("[Koffi sondages] création :", e.message); return { ok: false, message: "La création a échoué. Réessayez dans un instant." }; }
    const id = rep && rep.status === 201 && rep.data && rep.data.id ? Number(rep.data.id) : 0;
    if (!id) return { ok: false, message: rep && rep.status === 403 ? MSG_ROLE : (rep && rep.data && rep.data.error) || "La création a échoué. Réessayez dans un instant." };
    return { ok: true, id, statut: rep.data.statut, note: rep.data.message || "" };
  }
  const messageCree = (f, c) => c.statut === "ouvert"
    ? `C'est fait : le sondage « ${f.titre} » est publié, avec ${f.questions.length} question${f.questions.length > 1 ? "s" : ""}.${c.note ? " " + c.note : ""}`
    : `C'est fait : le sondage « ${f.titre} » est enregistré en brouillon, avec ${f.questions.length} question${f.questions.length > 1 ? "s" : ""}. ${c.note || "Personne ne le voit tant que vous ne le publiez pas : ouvrez-le depuis « Mes sondages » pour choisir où l'afficher et le publier."}`;
  const lienSondage = id => ({ url: `sondage.html?id=${encodeURIComponent(id)}`, tel: "#/sondages", texte: "Voir le sondage" });

  /* ── Conversations ── */
  const dto = m => {
    const meta = parseJson(m.citations_json) || {};
    const out = { id: Number(m.id), role: m.role, contenu: m.contenu, gratuit: /competences/.test(String(m.flags || "")), date: m.created_at };
    if (meta.montrer && meta.brouillon && meta.brouillon.champs && meta.vue) out.brouillon = meta.vue;
    if (meta.sondage_id) { out.cree = true; out.lien = lienSondage(meta.sondage_id); }
    if (meta.attend) out.attend = meta.attend;
    return out;
  };
  async function derniereConversation(user, r) {
    const limite = sqlDate(new Date(Date.now() - r.retention_jours * 86400000));
    const c = await db.prepare("SELECT * FROM kofi_conversations WHERE user_id=? AND contexte='sondages' AND derniere_activite>=? ORDER BY derniere_activite DESC, id DESC LIMIT 1").get(user.id, limite);
    if (!c) return null;
    const msgs = await db.prepare("SELECT id, role, contenu, citations_json, flags, created_at FROM kofi_messages WHERE conversation_id=? AND created_at>=? ORDER BY id").all(c.id, limite);
    return { id: Number(c.id), messages: msgs.map(dto) };
  }
  /* Le brouillon en cours : celui du DERNIER message de Koffi, tant qu'il n'a été ni créé ni abandonné. */
  async function brouillonEnCours(convId) {
    const m = await db.prepare("SELECT citations_json FROM kofi_messages WHERE conversation_id=? AND role='assistant' ORDER BY id DESC LIMIT 1").get(convId);
    const meta = m ? parseJson(m.citations_json) : null;
    return meta && meta.brouillon && meta.brouillon.champs ? meta : null;
  }
  /* Un sondage = un crédit. `paye` : le sondage en cours (depuis le dernier sondage créé ou abandonné) a déjà son crédit, et n'a pas dépassé le garde-fou d'échanges. */
  async function creditDuSondage(convId) {
    if (!convId) return { paye: false };
    const rows = await db.prepare("SELECT flags, citations_json FROM kofi_messages WHERE conversation_id=? AND role='assistant' ORDER BY id DESC LIMIT 80").all(convId);
    let echanges = 0;
    for (const m of rows) {
      const meta = parseJson(m.citations_json) || {};
      if (meta.sondage_id || meta.abandonne) break;
      const fl = String(m.flags || "");
      if (/(^|,)ia(,|$)/.test(fl)) echanges++;
      if (/(^|,)credit_pris(,|$)/.test(fl)) return { paye: echanges < MAX_ECHANGES_PAR_CREDIT, echanges };
    }
    return { paye: false, echanges };
  }

  route("GET", "/api/kofi/sondages/etat", async (req, res) => {
    const user = await exiger(req, res); if (!user) return;
    const ctx = await contexte(user, req);
    const r = ctx.r;
    const bloque = ["pays", "mineur", "majorite", "desactive", "indisponible"].includes(ctx.etat);
    const pf = (ctx.etat === "desactive" || ctx.etat === "pays") ? null : await K.portefeuilleDe(db, user, ctx);
    let etat = ctx.etat;
    if (etat === "utilisable" && !P.peutUtiliser(pf)) etat = "recharge";
    sendJSON(res, 200, {
      nom: K.NOM, etat, majorite: ctx.etat === "majorite" ? { texte: K.TEXTE_MAJORITE, version: K.VERSION_MAJORITE } : null,
      avertissement: "Joignez un PDF ou une photo (JPEG, PNG) : Koffi le lit pour préparer le sondage. Le fichier n'est envoyé qu'une fois et n'est pas conservé. Koffi voit aussi les titres de vos événements pour pouvoir les lier. Rien n'est créé sans votre accord.",
      credit: { action: "Un sondage complet, de la préparation à sa publication, compte pour un crédit.", prix_eur: ACTION_EUR },
      fichiers: { max: Fichiers.MAX_FICHIERS, octets: Fichiers.MAX_OCTETS_TOTAL, pages: Fichiers.MAX_PAGES_PDF },
      portefeuille: pf, recharge: { achetable: !["indisponible", "desactive", "mineur", "majorite", "pays"].includes(ctx.etat), texte: P.TEXTE_RECHARGE_NON_REMBOURSABLE, retractation: P.TEXTE_RECHARGE_RETRACTATION },
      max_message: MAX_MESSAGE, retention_jours: r.retention_jours,
      creation: { disponible: !bloque && await peutCreer(user) },
      conversation: bloque ? null : await derniereConversation(user, r),
    });
  });

  route("POST", "/api/kofi/sondages/messages", async (req, res, params, body) => {
    const user = await exiger(req, res); if (!user) return;
    const lim = SEC.rateLimit(`kofi-sondages-msg:${user.id}`, 12, 60000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Doucement : réessayez dans ${lim.retryAfter}s.`, code: "trop_vite" });
    const ctx = await contexte(user, req);
    if (refuser(res, ctx)) return;
    const r = ctx.r;
    let texte = nettoyer(body && body.texte);
    const envoyes = Array.isArray(body && body.fichiers) ? body.fichiers.slice(0, Fichiers.MAX_FICHIERS + 1) : [];
    if (!texte && envoyes.length) texte = "Voici le document joint.";
    if (!texte) return sendJSON(res, 400, { error: "Écrivez votre message." });
    if (texte.length > MAX_MESSAGE) return sendJSON(res, 400, { error: `Message trop long (${MAX_MESSAGE} caractères au maximum).`, code: "trop_long" });

    /* Fichiers : la couverture (une image, marquée « couverture ») va au CDN ; les autres sont LUS par l'IA, pour ce message seulement. */
    const aLire = [], couvertures = [];
    for (const f of envoyes) { if (f && f.role === "couverture") couvertures.push(f); else aLire.push(f); }
    if (envoyes.length && couvertures.length > 1) return sendJSON(res, 400, { error: "Une seule image de couverture à la fois.", code: "fichiers" });
    const lu = Fichiers.analyser(aLire, { dangereux: b => !!(SEC && SEC.isDangerousFile && SEC.isDangerousFile(b)) });
    if (!lu.ok) return sendJSON(res, 400, { error: lu.message, code: lu.code });
    let couvertureData = "";
    if (couvertures.length) {
      const c = Fichiers.analyser(couvertures);
      if (!c.ok) return sendJSON(res, 400, { error: c.message, code: c.code });
      if (c.liste[0].type === "pdf") return sendJSON(res, 400, { error: "L'image de couverture doit être une photo JPEG ou PNG.", code: "format" });
      const brut = String(couvertures[0].data);
      couvertureData = brut.startsWith("data:") ? brut : `data:image/${c.liste[0].type === "png" ? "png" : "jpeg"};base64,${brut}`;
    }
    if (lu.blocs.length && !SEC.rateLimit(`kofi-sondages-fichiers:${user.id}`, 10, 3600000).allowed) return sendJSON(res, 429, { error: "Vous avez joint beaucoup de documents : réessayez dans quelques minutes.", code: "trop_vite" });

    const debutJour = sqlDate(new Date(Date.now() - 24 * 3600 * 1000));
    const nbJour = Number((await db.prepare(`SELECT COUNT(*) AS n FROM kofi_usage WHERE user_id=? AND categorie IN (${CATS_ECHANGE.map(() => "?").join(",")}) AND created_at>=?`).get(user.id, ...CATS_ECHANGE, debutJour) || {}).n) || 0;
    if (!(await P.estIllimite(db, { userId: user.id, role: user.role, r })) && nbJour >= r.plafond_jour_inscriptions) return sendJSON(res, 429, { error: "Vous avez atteint la limite de messages pour aujourd'hui. Revenez demain.", code: "plafond_jour" });

    let conv = null;
    if (body && body.conversation_id) {
      conv = await db.prepare("SELECT * FROM kofi_conversations WHERE id=? AND user_id=? AND contexte='sondages'").get(Number(body.conversation_id), user.id);
      if (!conv) return sendJSON(res, 404, { error: "Conversation introuvable." });
    }
    const nomsFichiers = [...lu.liste.map(x => x.nom), ...(couvertures.length ? ["image de couverture"] : [])];
    const texteStocke = nomsFichiers.length ? `${texte}\n[Fichier joint : ${nomsFichiers.join(", ")}]` : texte;
    const ouvrir = async () => {
      if (conv) { if (!conv.titre) await db.prepare("UPDATE kofi_conversations SET titre=? WHERE id=?").run(court(texte, 60), conv.id); return conv; }
      const x = await db.prepare("INSERT INTO kofi_conversations (user_id, formation_id, contexte, langue, titre) VALUES (?,?,?,?,?)").run(user.id, 0, "sondages", "fr", court(texte, 60));
      conv = { id: Number(x.lastInsertRowid) };
      return conv;
    };
    const enregistrerEchange = async (reponse, extra) => {
      extra = extra || {};
      await ouvrir();
      await db.prepare("INSERT INTO kofi_messages (conversation_id, role, contenu) VALUES (?,?,?)").run(conv.id, "user", texteStocke);
      const x = await db.prepare("INSERT INTO kofi_messages (conversation_id, role, contenu, citations_json, modele, jetons_entree, jetons_sortie, flags) VALUES (?,?,?,?,?,?,?,?)")
        .run(conv.id, "assistant", reponse, extra.meta ? JSON.stringify(extra.meta) : null, extra.modele || null, extra.entree || 0, extra.sortie || 0, (extra.flags || []).join(",") || null);
      await db.prepare("UPDATE kofi_conversations SET derniere_activite=datetime('now') WHERE id=?").run(conv.id);
      return Number(x.lastInsertRowid);
    };
    const reponse = async (id, contenu, gratuit, extra) => {
      const message = { id, role: "assistant", contenu, gratuit: !!gratuit };
      if (extra && extra.vue) message.brouillon = extra.vue;
      if (extra && extra.cree) { message.cree = true; message.lien = lienSondage(extra.cree); }
      if (extra && extra.attend) message.attend = extra.attend;
      return { conversation_id: conv.id, message, portefeuille: await K.portefeuilleDe(db, user, ctx) };
    };

    /* « Que sais-tu faire ? » : réponse fixe, sans IA, JAMAIS décomptée. */
    if (!envoyes.length && Competences.estQuestionCompetences(texte)) {
      const rep = Competences.reponseSondages(r);
      const id = await enregistrerEchange(rep, { flags: ["competences"] });
      return sendJSON(res, 200, await reponse(id, rep, true));
    }

    const droit = await peutCreer(user);
    if (!droit && envoyes.length) {
      const id = await enregistrerEchange(MSG_ROLE, { flags: ["role"] });
      return sendJSON(res, 200, await reponse(id, MSG_ROLE, true));
    }

    /* Crédit : un sondage entier = un crédit, pris au premier échange réussi du sondage. Question offerte (compte sans Premium) retirée tout de suite et rendue si l'échange échoue ;
       sinon le forfait est débité APRÈS l'échange. Les échanges suivants du même sondage sont compris. */
    const pf = await K.portefeuilleDe(db, user, ctx);
    const credit = await creditDuSondage(conv ? conv.id : 0);
    let lot = null;
    if (!credit.paye) {
      if (P.offertesDispo(pf)) {
        if (!pf.offertes.accorde) await K.accorderGratuit(db, user.id, r);
        lot = await K.debiterGratuit(db, user.id);
      }
      if (!lot && !pf.illimite && !(pf.solde_eur >= ACTION_EUR && P.peutAppeler(pf))) return sendJSON(res, 402, { error: "Votre crédit Koffi est épuisé.", code: "credits_epuises", portefeuille: pf });
    }   /* sondage déjà payé : on le laisse finir, même si le solde est tombé à zéro entre-temps (garde-fous : plafond du jour, réserve d'IA, 30 échanges) */

    const auj = aujourdhuiParis();
    const evts = droit ? await evenementsDuCompte(user.id) : [];
    const cv = ctxValidation(evts, auj);
    const prevMeta = conv ? await brouillonEnCours(conv.id) : null;
    const prev = prevMeta ? prevMeta.brouillon : null;

    /* Image de couverture : enregistrée par le serveur (CDN) AVANT l'appel ; le modèle ne la voit pas. Une image jointe sans le marqueur « couverture » est lue par l'IA, sauf si Koffi vient de la demander. */
    let couvertureUrl = "", couvertureEchec = false;
    if (!couvertureData && prevMeta && prevMeta.attend === "couverture" && !prev.champs.couverture_url && lu.liste.length === 1 && lu.liste[0].type !== "pdf") {
      const b0 = String(aLire[0].data);
      couvertureData = b0.startsWith("data:") ? b0 : `data:image/${lu.liste[0].type === "png" ? "png" : "jpeg"};base64,${b0}`;
      lu.blocs.length = 0;
    }
    if (couvertureData && droit) {
      /* En test (fausse IA), pas de CDN : une adresse factice prouve que l'image a bien été reçue, contrôlée et rattachée par le serveur. */
      const u = IA.fausse() ? `https://cdn.test/koffi-couverture-${user.id}.jpg` : await require("./images-cdn").imageVersCdn(couvertureData, user.id);
      if (/^https:\/\//.test(String(u))) couvertureUrl = u; else couvertureEchec = true;
    }

    const messages = [];
    if (conv) {
      const limite = sqlDate(new Date(Date.now() - r.retention_jours * 86400000));
      const hist = (await db.prepare("SELECT role, contenu FROM kofi_messages WHERE conversation_id=? AND created_at>=? ORDER BY id DESC LIMIT 8").all(conv.id, limite)).reverse();
      hist.forEach(m => {
        const role = m.role === "assistant" ? "assistant" : "user";
        if (messages.length && messages[messages.length - 1].role === role) messages.pop();
        messages.push({ role, content: String(m.contenu).slice(0, role === "user" ? MAX_MESSAGE : 1500) });
      });
      while (messages.length && messages[0].role !== "user") messages.shift();
      if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
    }
    let contexteIA = `<contexte>Date du jour à Paris : ${auj} (${dateLongue(auj)})</contexte>\n<droits>creer_sondage: ${droit ? "oui" : "non"}</droits>\n`;
    if (droit) contexteIA += `<evenements>${JSON.stringify(evts)}</evenements>\n`;
    if (prev && droit) {
      const { couverture_url: _c, ...sansUrl } = prev.champs;
      const manqP = manquants(prev.champs);
      contexteIA += `<brouillon_precedent>${JSON.stringify(sansUrl)}</brouillon_precedent>\n<etat_brouillon>${JSON.stringify({ manquants: manqP.map(x => x.libelle), pret: manqP.length === 0, image_recue: !!prev.champs.couverture_url })}</etat_brouillon>\n`;
    }
    if (couvertureUrl) contexteIA += "<image_recue>oui</image_recue>\n";
    if (lu.blocs.length) contexteIA += `<fichiers_joints>${lu.resume}</fichiers_joints>\n`;
    messages.push({ role: "user", content: Fichiers.contenuIA(lu.blocs, `${contexteIA}<demande>\n${texte}\n</demande>`) });

    let rep;
    try { rep = await IA.repondre({ modele: r.modele, systeme: systemePour(), messages, maxSortie: Math.max(r.inscriptions_max_sortie_tokens, 1200) + (droit ? 5800 : 0) }); }
    catch (e) {
      if (lot) await K.rendre(db, lot.id);
      if (e instanceof IA.KofiIAErreur) {
        if (e.code !== "limite") console.error("[Koffi sondages] IA :", e.code, e.message);
        return sendJSON(res, e.code === "limite" ? 429 : 503, { error: "Koffi est momentanément indisponible. Votre crédit n'a pas été décompté : réessayez dans un instant.", code: e.code === "limite" ? "limite" : "indisponible" });
      }
      throw e;
    }
    const cout = K.coutEstime(rep.entree, rep.sortie, r);
    const noterUsage = (cat, msgId) => db.prepare("INSERT INTO kofi_usage (user_id, formation_id, conversation_id, message_id, categorie, jetons_entree, jetons_sortie, cout_eur, modele) VALUES (?,?,?,?,?,?,?,?,?)").run(user.id, null, conv ? conv.id : null, msgId || null, cat, rep.entree, rep.sortie, cout, r.modele);
    /* Le brouillon en cours survit aux messages qui n'en parlent pas ; la couverture reçue y est rattachée par le SERVEUR. */
    const avecCouverture = (b) => {
      if (!b) return b;
      const champs = { ...b.champs };
      if (couvertureUrl) { champs.couverture_url = couvertureUrl; champs.couverture_choix = "avec"; }
      return { ...b, champs };
    };
    const meta0 = () => (prev && droit ? { brouillon: avecCouverture(prev), attend: prevMeta.attend } : null);
    if (rep.refus) {
      if (lot) await K.rendre(db, lot.id);
      const refus = "Je ne peux pas répondre à cette demande. Reformulez-la, ou utilisez le formulaire de création du sondage.";
      const id = await enregistrerEchange(refus, { flags: ["refus"], modele: r.modele, meta: meta0() });
      await noterUsage("sondages_refus", id);
      return sendJSON(res, 200, await reponse(id, refus));
    }
    const sortie = lireSortie(rep.texte);
    if (!sortie) {
      if (lot) await K.rendre(db, lot.id);
      const msg = lu.blocs.length
        ? "Je n'ai pas réussi à tirer un sondage de ce document. Pouvez-vous me dire en quelques mots ce que le sondage doit contenir, ou joindre une version plus lisible ?"
        : "Je n'ai pas bien compris votre demande. Pouvez-vous la reformuler en quelques mots (une question sur les sondages, ou ce que vous voulez y mettre) ?";
      const id = await enregistrerEchange(msg, { flags: ["illisible"], modele: r.modele, meta: meta0() });
      await noterUsage("sondages_illisible", id);
      return sendJSON(res, 200, await reponse(id, msg));
    }

    let contenu = sortie.message, meta = meta0(), vueBrouillon = null, flags = ["ia"], creeId = 0, attend = null, remonter = false;
    if (sortie.action === "abandonner") {
      meta = { abandonne: true };
      if (!contenu) contenu = "D'accord, j'abandonne ce brouillon. Dites-moi si vous voulez recommencer ou si vous avez une question sur les sondages.";
    } else if (sortie.action === "sans_reponse") {
      /* Pas l'information : message officiel, et la demande est vraiment remontée à l'équipe (sans identifiant de compte). */
      contenu = SansReponse.phrase("fr"); flags.push("sans_reponse"); remonter = true;
    } else if (sortie.action === "sondage") {
      if (!droit) { contenu = MSG_ROLE; meta = null; }
      else {
        const base = prev ? { ...prev.champs } : {};
        const brut = { ...base, ...sortie.brouillon, questions: Array.isArray(sortie.brouillon.questions) ? sortie.brouillon.questions : base.questions, lieux: sortie.brouillon.lieux && typeof sortie.brouillon.lieux === "object" ? sortie.brouillon.lieux : base.lieux, evenement_ids: Array.isArray(sortie.brouillon.evenement_ids) ? sortie.brouillon.evenement_ids : base.evenement_ids, couverture_url: couvertureUrl || base.couverture_url || "" };
        const v = validerBrouillon(brut, cv);
        const champs = v.champs, manq = manquants(champs), pret = manq.length === 0;
        const notes = [];
        if (couvertureEchec) notes.push("Je n'ai pas pu enregistrer l'image de couverture : rejoignez-la à nouveau.");
        if (v.problemes.includes("dates_inversees")) notes.push("Les dates étaient inversées : j'ai ajusté la fin. Dites-moi si ce n'est pas bon.");
        if (v.problemes.includes("fin_passee")) notes.push("La date de fin était déjà passée : je l'ai retirée. Quelle fin souhaitez-vous ?");
        if (v.problemes.includes("duree_reduite")) notes.push(`Un sondage dure ${DUREE_MAX} jours au plus : j'ai ramené la fin à ${DUREE_MAX} jours.`);
        if (v.problemes.includes("trop_de_questions")) notes.push(`Je ne peux préparer que ${MAX_QUESTIONS} questions ici : vous pourrez en ajouter dans le sondage.`);
        if (v.problemes.includes("evenement_inconnu")) notes.push("Je n'ai pas retrouvé l'un des événements parmi les vôtres : je ne l'ai pas lié.");
        v.problemes.filter(p => p.startsWith("type_inconnu:")).forEach(p => notes.push(`Je n'ai pas reconnu le type de la question « ${p.slice(13)} » : je l'ai mise en choix unique, vérifiez-la.`));
        const confirmeVu = sortie.confirme && pret && prev && manquants(prev.champs).length === 0 && memeBrouillon(prev.champs, champs, cv);
        let cree = null;
        if (confirmeVu) {
          const c = await creerSondage(user, champs);
          if (c.ok) cree = c; else notes.push(c.message);
        }
        if (cree) {
          contenu = messageCree(champs, cree); creeId = cree.id;
          meta = { sondage_id: cree.id }; flags.push("sondage_cree");
        } else {
          const base_msg = sortie.message || (pret ? "Votre sondage est prêt à être créé." : `Il me manque encore : ${manq.map(x => x.libelle).join(", ")}.`);
          contenu = [base_msg, ...notes].join("\n\n");
          if (pret) contenu += "\n\nVérifiez l'aperçu ci-dessous : touchez « Créer le sondage » si vous êtes d'accord, ou dites-moi ce qu'il faut changer.";
          attend = manq.some(x => x.cle === "couverture") && !manq.some(x => ["titre", "questions", "options"].includes(x.cle)) ? "couverture" : null;
          const vv = vue(champs, manq, new Map(evts.map(e => [e.id, e.titre])), auj);
          meta = { brouillon: { champs }, montrer: true, vue: vv, attend: attend || undefined };
          vueBrouillon = vv;
          flags.push("sondage_brouillon");
        }
      }
    } else if (couvertureUrl && prev && droit) {
      /* L'image est arrivée alors que Koffi répondait par une simple question : on la rattache quand même au brouillon. */
      meta = { brouillon: avecCouverture(prev), montrer: false };
    }
    /* Crédit : pris une seule fois par sondage, au premier échange réussi. */
    let debite = null;
    if (!credit.paye) {
      flags.push("credit_pris");
      if (pf.illimite) debite = "sondages_illimite";
      else if (lot) debite = "sondages_offert";
      else { const d = await P.debiter(db, user.id, ACTION_EUR, { avecMensuel: pf.premium && !pf.reserve_basse }); debite = d.depuis_achat ? "sondages_achat" : "sondages_mensuel"; }
    }
    const id = await enregistrerEchange(contenu, { meta, flags, modele: r.modele, entree: rep.entree, sortie: rep.sortie });
    await noterUsage(debite || "sondages_inclus", id);
    if (remonter) await SansReponse.remonter(db, { question: texte, source: "koffi_sondages", role: user.role, langue: "fr" });
    sendJSON(res, 200, await reponse(id, contenu, false, { vue: vueBrouillon, cree: creeId, attend }));
  });

  /* Boutons de l'aperçu : « Créer le sondage » et « Abandonner » — sans IA, donc compris dans le crédit du sondage. Le brouillon doit être celui du DERNIER message de Koffi et complet. */
  async function messageBrouillon(user, body) {
    const m = await db.prepare("SELECT m.id, m.conversation_id, m.citations_json FROM kofi_messages m JOIN kofi_conversations c ON c.id=m.conversation_id WHERE m.id=? AND m.role='assistant' AND c.user_id=? AND c.contexte='sondages'").get(Number(body && body.message_id), user.id);
    if (!m) return { code: 404, error: "Brouillon introuvable." };
    const dernier = await db.prepare("SELECT id FROM kofi_messages WHERE conversation_id=? AND role='assistant' ORDER BY id DESC LIMIT 1").get(m.conversation_id);
    const meta = parseJson(m.citations_json);
    if (!dernier || Number(dernier.id) !== Number(m.id) || !meta || !meta.brouillon || !meta.brouillon.champs) return { code: 409, error: "Ce brouillon n'est plus d'actualité : utilisez le dernier aperçu de la conversation." };
    return { m, meta };
  }
  const ajouterMessageKoffi = async (convId, contenu, meta, flags) => {
    const x = await db.prepare("INSERT INTO kofi_messages (conversation_id, role, contenu, citations_json, flags) VALUES (?,?,?,?,?)").run(convId, "assistant", contenu, meta ? JSON.stringify(meta) : null, flags || null);
    await db.prepare("UPDATE kofi_conversations SET derniere_activite=datetime('now') WHERE id=?").run(convId);
    const row = await db.prepare("SELECT id, role, contenu, citations_json, flags, created_at FROM kofi_messages WHERE id=?").get(Number(x.lastInsertRowid));
    return dto(row);
  };

  route("POST", "/api/kofi/sondages/sondage/creer", async (req, res, params, body) => {
    const user = await exiger(req, res); if (!user) return;
    const lim = SEC.rateLimit(`kofi-sondages-creer:${user.id}`, 10, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Doucement : réessayez dans ${lim.retryAfter}s.`, code: "trop_vite" });
    const ctx = await contexte(user, req);
    if (refuser(res, ctx)) return;
    const b = await messageBrouillon(user, body);
    if (b.error) return sendJSON(res, b.code, { error: b.error });
    if (!(await peutCreer(user))) return sendJSON(res, 403, { error: MSG_ROLE });
    const evts = await evenementsDuCompte(user.id);
    const cv = ctxValidation(evts, aujourdhuiParis());
    const { champs } = validerBrouillon(b.meta.brouillon.champs, cv);
    const manq = manquants(champs);
    if (manq.length) return sendJSON(res, 409, { error: `Le brouillon n'est pas complet : il manque ${manq.map(x => x.libelle).join(", ")}.` });
    /* Un seul sondage par aperçu, même en cas de double clic : le premier appel réserve le message (atomique), les suivants sont refusés. */
    const pris = await db.prepare("UPDATE kofi_messages SET flags=? WHERE id=? AND (flags IS NULL OR flags NOT LIKE '%creation_en_cours%')").run("creation_en_cours", b.m.id);
    if (!Number(pris && pris.changes)) return sendJSON(res, 409, { error: "La création de ce sondage est déjà en cours." });
    const c = await creerSondage(user, champs);
    if (!c.ok) {
      await db.prepare("UPDATE kofi_messages SET flags=NULL WHERE id=?").run(b.m.id);   /* l'aperçu redevient utilisable */
      return sendJSON(res, 422, { error: c.message });
    }
    const message = await ajouterMessageKoffi(b.m.conversation_id, messageCree(champs, c), { sondage_id: c.id }, "sondage_cree");
    sendJSON(res, 201, { conversation_id: Number(b.m.conversation_id), message, sondage_id: c.id });
  });

  route("POST", "/api/kofi/sondages/sondage/abandonner", async (req, res, params, body) => {
    const user = await exiger(req, res); if (!user) return;
    const b = await messageBrouillon(user, body);
    if (b.error) return sendJSON(res, b.code, { error: b.error });
    const message = await ajouterMessageKoffi(b.m.conversation_id, "D'accord, j'abandonne ce brouillon. Dites-moi si vous voulez recommencer ou si vous avez une question sur les sondages.", { abandonne: true });
    sendJSON(res, 200, { conversation_id: Number(b.m.conversation_id), message });
  });

  route("DELETE", "/api/kofi/sondages/conversations/:id", async (req, res, params) => {
    const user = await exiger(req, res); if (!user) return;
    const c = await db.prepare("SELECT id FROM kofi_conversations WHERE id=? AND user_id=? AND contexte='sondages'").get(Number(params.id), user.id);
    if (!c) return sendJSON(res, 404, { error: "Conversation introuvable." });
    await db.prepare("DELETE FROM kofi_feedback WHERE message_id IN (SELECT id FROM kofi_messages WHERE conversation_id=?)").run(c.id);
    await db.prepare("DELETE FROM kofi_messages WHERE conversation_id=?").run(c.id);
    await db.prepare("DELETE FROM kofi_conversations WHERE id=?").run(c.id);
    sendJSON(res, 200, { ok: true });
  });
};

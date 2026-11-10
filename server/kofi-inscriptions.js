/* ═════════════════════════════════════════════════
   server/kofi-inscriptions.js — KOFFI, GUIDE DES FICHES D'INSCRIPTION (2026-11-04)

   Chaque Koffi reste dans son module (décision du 2026-11-04 : pas de mémoire commune, pour garder l'usage simple et le coût maîtrisé). Celui-ci vit dans le module
   « Formulaires de réponse et d'inscription » : il explique à quoi sert chaque partie d'une fiche (types d'inscription, champs, validation, QR…) et il aide à PRÉPARER une fiche.
   Règles (toutes appliquées ICI) :
   - Le modèle ne voit AUCUNE fiche existante, AUCUN inscrit, AUCUNE réponse : il ne connaît que ce que la personne lui dit dans la conversation et les faits du module écrits dans le prompt.
   - Il propose un BROUILLON de fiche (nom, dates, types d'inscription, champs) ; le SERVEUR le revalide champ par champ, écrit LUI-MÊME l'aperçu et ne crée rien avant l'accord de la personne
     (bouton « Créer la fiche » ou « oui »).
   - La création passe par les routes habituelles du module (POST /api/insc/fiches, …/types, …/champs) avec la session de la personne : mêmes droits, mêmes garde-fous (Initiative,
     Collectivité, Administrateur). La fiche est créée en BROUILLON : Koffi ne publie jamais, ne lie aucun événement, ne partage rien, ne touche à aucun inscrit.
   - Crédit : le portefeuille unique de Koffi (questions offertes aux comptes sans Premium, puis crédit mensuel ou acheté), débité au coût réel ; « que sais-tu faire ? » reste gratuit.
   - Conversations conservées 60 jours, comme le reste de Koffi.
   ═════════════════════════════════════════════════ */
"use strict";
const IA = require("./kofi-ia");
const Competences = require("./kofi-competences");
const { norm } = require("./kofi-annuaire");

const MARQUEUR = "ASSISTANT_INSCRIPTIONS";
const ROLES_CREATION = ["administrateur", "initiative", "collectivite"];   /* même règle que inscBetaAutorise() dans server/index.js */
const MAX_TYPES = 6, MAX_CHAMPS = 25, MAX_OPTIONS = 12, PRIX_MIN = 0.5;   /* 0,50 € : minimum accepté par le paiement en ligne */

const VISIBILITES = { public: "Publique (tout le monde)", membres: "Réservée aux membres connectés", prive: "Privée (vous seul)" };
const TYPES_CHAMP = {
  texte_court: "Texte court", texte_long: "Texte long", nombre: "Nombre", email: "E-mail", telephone: "Téléphone", date: "Date", heure: "Heure", adresse: "Adresse",
  liste_deroulante: "Liste déroulante", choix_unique: "Choix unique", choix_multiple: "Choix multiple", oui_non: "Oui / Non", case_a_cocher: "Case à cocher",
  upload_photo: "Photo à envoyer", upload_fichier: "Fichier à envoyer", url: "Lien (adresse web)",
};
const AVEC_OPTIONS = ["liste_deroulante", "choix_unique", "choix_multiple"];
/* Libellés déjà demandés d'office à chaque inscription (même liste que INSC_LIBELLES_RESERVES dans server/index.js). */
const RESERVES = new Set(["nom", "prenom", "email", "e mail", "adresse e mail", "adresse email", "telephone", "numero de telephone"]);
const libelleReserve = l => RESERVES.has(String(l || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());

const nettoyer = s => require("./kofi-interdits").masquerSecrets(String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\r\n/g, "\n").trim());   /* mots de passe, codes et jetons masqués dès l'entrée */
const court = (s, max) => nettoyer(s).replace(/\s+/g, " ").slice(0, max);
const parseJson = s => { try { return JSON.parse(s); } catch (_) { return null; } };
const sqlDate = d => d.toISOString().slice(0, 19).replace("T", " ");
const z = n => String(n).padStart(2, "0");
const oui = v => v === true || v === 1 || v === "1" || v === "true" || v === "oui";
const nombre = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(",", ".").replace(/[^\d.\-]/g, "")); return Number.isFinite(n) ? n : null; };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const euros = n => Number(n).toFixed(Number(n) % 1 ? 2 : 0).replace(".", ",") + " €";

/* ── Dates (heure de Paris) ─────────────────────────────────────────────────────────────────────────── */
function aujourdhuiParis(ms) {
  const p = {};
  new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms == null ? Date.now() : ms)).forEach(x => { p[x.type] = x.value; });
  return `${p.year}-${p.month}-${p.day}`;
}
const dateUTC = ymd => new Date(ymd + "T00:00:00Z");
const versYmd = d => `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
const ymdValide = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && versYmd(dateUTC(s)) === s;
const dateLongue = ymd => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dateUTC(ymd));

/* ── Le brouillon : ce que le modèle a le droit de proposer, revalidé ici ───────────────────────────── */
function validerType(t) {
  t = t && typeof t === "object" ? t : {};
  const label = court(t.label, 60);
  let prix = nombre(t.prix);
  const notes = [];
  if (prix != null) { prix = Math.round(prix * 100) / 100; if (prix <= 0) prix = null; else if (prix > 100000) prix = null; }
  const payant = t.gratuit === false || oui(t.payant) || prix != null;
  if (payant && prix != null && prix < PRIX_MIN) { notes.push("prix_trop_bas"); prix = null; }
  let places = nombre(t.places_max); places = places != null && places >= 1 && places <= 100000 ? Math.floor(places) : null;
  return { type: { label, gratuit: !payant, prix: payant ? prix : null, places_max: places, liste_attente_active: oui(t.liste_attente) || oui(t.liste_attente_active), validation_auto: !(oui(t.validation_manuelle) || t.validation_auto === false) }, notes };
}
function validerChamp(c) {
  c = c && typeof c === "object" ? c : {};
  const libelle = court(c.libelle, 120);
  const type_champ = TYPES_CHAMP[c.type_champ] ? c.type_champ : "texte_court";
  const options = AVEC_OPTIONS.includes(type_champ)
    ? (() => { const vus = new Set(); return (Array.isArray(c.options) ? c.options : []).map(o => court(o, 60)).filter(o => o && !vus.has(norm(o)) && vus.add(norm(o))).slice(0, MAX_OPTIONS); })() : [];
  return { libelle, type_champ, obligatoire: oui(c.obligatoire), options, typeInconnu: !!c.type_champ && !TYPES_CHAMP[c.type_champ] };
}
/* brut = ce que le modèle (ou le brouillon précédent) a produit. Renvoie { champs, problemes } : `champs` est toujours un brouillon cohérent. */
function validerBrouillon(brut) {
  const b = brut && typeof brut === "object" && !Array.isArray(brut) ? brut : {};
  const problemes = [];
  let ouverture = ymdValide(b.ouverture) ? b.ouverture : "", fermeture = ymdValide(b.fermeture) ? b.fermeture : "";
  if (ouverture && fermeture && fermeture < ouverture) { const t = ouverture; ouverture = fermeture; fermeture = t; problemes.push("dates_inversees"); }
  const vus = new Set(), types = [];
  for (const t of (Array.isArray(b.types) ? b.types : []).slice(0, MAX_TYPES + 4)) {
    const v = validerType(t);
    if (!v.type.label || vus.has(norm(v.type.label))) continue;
    if (types.length >= MAX_TYPES) { problemes.push("trop_de_types"); break; }
    vus.add(norm(v.type.label)); types.push(v.type); v.notes.forEach(n => problemes.push(n));
  }
  if (!types.length) types.push({ label: "Participant", gratuit: true, prix: null, places_max: null, liste_attente_active: false, validation_auto: true });
  const vuc = new Set(), formulaire = [];
  for (const c of (Array.isArray(b.formulaire) ? b.formulaire : []).slice(0, MAX_CHAMPS + 8)) {
    const v = validerChamp(c);
    if (!v.libelle) continue;
    if (libelleReserve(v.libelle)) { problemes.push("libelle_reserve:" + v.libelle); continue; }
    if (vuc.has(norm(v.libelle))) continue;
    if (formulaire.length >= MAX_CHAMPS) { problemes.push("trop_de_champs"); break; }
    vuc.add(norm(v.libelle)); formulaire.push({ libelle: v.libelle, type_champ: v.type_champ, obligatoire: v.obligatoire, options: v.options });
    if (v.typeInconnu) problemes.push("type_champ_inconnu:" + v.libelle);
  }
  return {
    champs: {
      nom: court(b.nom, 120), description: nettoyer(b.description).slice(0, 1500), organisateur: court(b.organisateur, 120),
      visibilite: VISIBILITES[b.visibilite] ? b.visibilite : "public", ouverture, fermeture, types, formulaire,
    },
    problemes,
  };
}
/* Ce qui manque encore pour pouvoir créer la fiche : [{ cle, libelle }]. */
function manquants(f) {
  const m = [];
  if (!f || !f.nom) m.push({ cle: "nom", libelle: "le nom de la fiche" });
  (f && f.types || []).forEach(t => { if (!t.gratuit && !(t.prix >= PRIX_MIN)) m.push({ cle: "prix", libelle: `le prix de « ${t.label} » (au moins ${euros(PRIX_MIN)})` }); });
  (f && f.formulaire || []).forEach(c => { if (AVEC_OPTIONS.includes(c.type_champ) && c.options.length < 2) m.push({ cle: "options", libelle: `les choix proposés pour « ${c.libelle} » (au moins 2)` }); });
  return m;
}
/* Deux brouillons identiques une fois revalidés : « oui » ne vaut accord que pour l'aperçu que la personne a vu. */
const memeBrouillon = (a, b) => JSON.stringify(validerBrouillon(a).champs) === JSON.stringify(validerBrouillon(b).champs);

function quand(f) {
  if (f.ouverture && f.fermeture) return `Inscriptions du ${dateLongue(f.ouverture)} au ${dateLongue(f.fermeture)} inclus`;
  if (f.ouverture) return `Inscriptions à partir du ${dateLongue(f.ouverture)}`;
  if (f.fermeture) return `Inscriptions jusqu'au ${dateLongue(f.fermeture)} inclus`;
  return "";
}
const ligneType = t => `${t.label} — ${t.gratuit ? "gratuit" : euros(t.prix || 0)}${t.places_max ? ` · ${t.places_max} place${t.places_max > 1 ? "s" : ""}` : ""}${t.liste_attente_active ? " · liste d'attente" : ""}${t.validation_auto ? "" : " · validation manuelle"}`;
const ligneChamp = c => `${c.libelle} (${TYPES_CHAMP[c.type_champ].toLowerCase()}${c.options.length ? " : " + c.options.join(", ") : ""}${c.obligatoire ? ", obligatoire" : ""})`;
/* Aperçu écrit par le serveur (jamais par le modèle) : c'est exactement ce qui sera créé. */
function vue(f, manq) {
  manq = manq || manquants(f);
  return {
    type: "fiche", nom: f.nom, description: f.description.slice(0, 300), organisateur: f.organisateur, visibilite: VISIBILITES[f.visibilite], quand: quand(f),
    types: f.types.map(ligneType), formulaire: f.formulaire.map(ligneChamp),
    rappel: "Le nom, le prénom, l'e-mail et le téléphone sont déjà demandés à chaque inscrit : inutile de les ajouter.",
    statut: "La fiche sera créée en brouillon : rien n'est publié, et vous pourrez tout modifier ensuite.",
    pret: manq.length === 0, manquants: manq.map(x => x.libelle),
  };
}

/* Corps envoyés aux routes habituelles du module (le serveur de la fiche applique ses propres contrôles). */
function corpsFiche(f) {
  return {
    nom: f.nom, organisateur: f.organisateur || undefined, visibilite: f.visibilite,
    description: f.description ? f.description.split(/\n{2,}/).map(p => "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>").join("") : undefined,
    /* La fermeture court jusqu'à la fin du jour choisi (la route compare avec l'instant présent : une date seule fermerait la fiche dès le matin de ce jour). */
    date_ouverture_inscriptions: f.ouverture ? f.ouverture + "T00:00" : undefined, date_fermeture_inscriptions: f.fermeture ? f.fermeture + "T23:59" : undefined,
  };
}
const corpsType = t => ({ label: t.label, gratuit: t.gratuit, prix: t.gratuit ? undefined : t.prix, places_max: t.places_max || undefined, liste_attente_active: t.liste_attente_active, validation_auto: t.validation_auto });
const corpsChamp = c => ({ libelle: c.libelle, type_champ: c.type_champ, obligatoire: c.obligatoire, options: c.options });

/* Le modèle répond en JSON (éventuellement entouré de ```). Renvoie null si illisible. */
function lireSortie(texte) {
  let t = String(texte || "").trim();
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(t); if (m) t = m[1].trim();
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  const o = parseJson(t.slice(a, b + 1));
  if (!o || !["question", "repondre", "fiche", "abandonner"].includes(o.action)) return null;
  const message = court(o.message, o.action === "repondre" ? 1100 : 700);
  if (o.action === "question" || o.action === "repondre") return message ? { action: o.action, message } : null;
  if (o.action === "abandonner") return { action: "abandonner", message };
  return { action: "fiche", message, brouillon: o.brouillon && typeof o.brouillon === "object" && !Array.isArray(o.brouillon) ? o.brouillon : {}, confirme: o.confirme === true };
}

/* ── Le prompt système ────────────────────────────────────────────────────────────────────────────────── */
function systemePour() {
  return [
    `${MARQUEUR} — Tu es Koffi, le guide des fiches d'inscription de Diaspo'Actif, plateforme de la diaspora africaine. Tu es dans le module « Formulaires de réponse et d'inscription » : tu aides l'organisateur à comprendre ce module (à quoi sert chaque partie) et, s'il en a le droit, à préparer une fiche d'inscription.`,
    "",
    "RÈGLES ABSOLUES :",
    "1. Tu ne vois AUCUNE fiche existante, AUCUN inscrit, AUCUNE réponse d'inscrit, aucun paiement : tu ne connais que ce que la personne t'écrit ici et les FAITS ci-dessous. Tu n'inventes jamais le fonctionnement d'une partie du module : si ce n'est pas dans les FAITS, dis-le franchement (« je n'ai pas cette information ») et renvoie vers le bouton « 🎥 Tutoriel » en haut de la fiche ou vers l'onglet concerné.",
    "2. Tu réponds UNIQUEMENT par un objet JSON, sans autre texte, de l'une de ces formes :",
    '   {"action":"question","message":"<une seule question courte>"}',
    '   {"action":"repondre","message":"<ta réponse en 1 à 8 phrases>"}',
    '   {"action":"fiche","message":"<la prochaine question, ou une phrase qui présente l\'aperçu>","brouillon":{"nom":"","description":"","organisateur":"","visibilite":"public","ouverture":"","fermeture":"","types":[{"label":"","gratuit":true,"prix":0,"places_max":0,"liste_attente":false,"validation_manuelle":false}],"formulaire":[{"libelle":"","type_champ":"texte_court","obligatoire":false,"options":[]}]},"confirme":false}',
    '   {"action":"abandonner","message":"<court message>"}',
    "",
    "COMPRENDRE LA DEMANDE :",
    "3. La personne parle comme à un humain, avec ses propres mots : elle n'a AUCUNE formule précise à connaître. Déduis ce qu'elle veut du SENS de sa phrase et de la conversation en cours (messages précédents, <brouillon_precedent>). Ne lui demande jamais de reformuler avec un mot particulier.",
    "4. « repondre » sert à EXPLIQUER le module (« à quoi sert tel champ, tel onglet, tel réglage ? », « comment ça marche ? »). Réponds d'après les FAITS, simplement, avec des exemples concrets, sans jargon.",
    "5. Tu n'as aucun accès au reste de la plateforme (événements, formations, Business Plan, Annuaire, messages…) : pour une demande qui relève d'un autre endroit, dis dans quel module aller (un autre Koffi y répond) au lieu de deviner une réponse.",
    "",
    "PRÉPARER UNE FICHE (seulement si <droits> indique creer_fiche: oui ; sinon explique que seuls les comptes Initiative, Collectivité et Administrateur peuvent créer une fiche) :",
    "6. Reprends <brouillon_precedent> et ne change QUE ce que la personne change. Pose UNE seule question à la fois pour ce qui manque, en commençant par le nom de la fiche. Propose toi-même des idées utiles (types d'inscription, questions pertinentes pour son événement) plutôt que d'attendre que tout soit dit.",
    "7. Ne demande JAMAIS le nom, le prénom, l'e-mail ni le téléphone de l'inscrit : ils sont déjà demandés à chacun. Pour demander le nom d'un accompagnant, un second contact, etc., donne un libellé distinct (« Nom de l'accompagnant »).",
    `8. "types" : au moins un (sans précision, mets un seul type « Participant » gratuit), au plus ${MAX_TYPES}. "gratuit": true ou false ; un type payant exige un "prix" en euros d'au moins ${PRIX_MIN} — ne l'invente jamais, demande-le. "places_max": 0 si illimité. "liste_attente": true seulement si la personne la veut. "validation_manuelle": true si elle veut approuver chaque inscription elle-même.`,
    `9. "formulaire" : les questions posées à l'inscrit (au plus ${MAX_CHAMPS}). "type_champ" vaut l'un de : ${Object.keys(TYPES_CHAMP).join(", ")}. Pour liste_deroulante, choix_unique et choix_multiple, "options" liste au moins 2 choix. "obligatoire": true seulement si la personne le veut.`,
    "10. \"visibilite\" vaut public (par défaut), membres ou prive. \"ouverture\" et \"fermeture\" sont des dates AAAA-MM-JJ (heure de Paris, la fermeture inclut ce jour-là) à partir de la date du jour fournie dans <contexte> ; laisse vide si la personne n'en parle pas.",
    "11. Tu ne PUBLIES jamais la fiche, tu ne la lies à aucun événement, tu ne la partages pas, tu ne touches à aucun inscrit : tu prépares un brouillon de fiche. Dis-le si on te le demande, et indique que la liaison à un événement et la publication se font ensuite dans la fiche.",
    "12. Tu ne dis JAMAIS que la fiche est créée : c'est le serveur qui la crée, après l'accord de la personne, et qui l'annonce lui-même. Mets \"confirme\":true UNIQUEMENT si la personne vient de dire clairement oui à un aperçu complet que le serveur lui a montré ; sinon false.",
    "13. Si la personne renonce, utilise \"abandonner\".",
    "",
    "FAITS SUR LE MODULE (réponds d'après eux, n'invente rien) :",
    "- Le module « Formulaires de réponse et d'inscription » est réservé aux comptes Initiative, Collectivité et Administrateur. Une fiche d'inscription sert à recevoir des inscriptions (à un événement, une formation, une candidature…) avec un formulaire que l'organisateur compose lui-même.",
    "- Une fiche passe par les statuts : Brouillon, Programmée, Publiée, Suspendue, Fermée, Archivée. Tant qu'elle est en brouillon, personne ne peut s'inscrire.",
    "- La création se fait en 3 étapes : « Vue d'ensemble » (nom, description, organisateur, contact, dates d'ouverture et de fermeture des inscriptions, visibilité), « Types d'inscription », « Formulaire » (qui se termine par la liaison à un ou plusieurs événements). Une même fiche peut couvrir plusieurs événements.",
    "- Visibilité d'une fiche : Publique, Réservée aux membres, Privée ou Sur invitation.",
    "- Un TYPE d'inscription est un profil d'inscrit (Participant, Exposant, Bénévole, Invité…), gratuit ou payant (un prix supérieur à 0 €), avec ou sans limite de places, avec ou sans liste d'attente. Chaque type peut avoir son propre prix ; la validation peut être automatique ou manuelle (onglet « Validation »).",
    "- Le FORMULAIRE est la liste des questions posées à l'inscrit. Le nom, le prénom, l'e-mail et le téléphone sont TOUJOURS demandés d'office : il est interdit de les ajouter une seconde fois. Chaque question a un type (texte court, texte long, nombre, e-mail, téléphone, date, heure, adresse, liste déroulante, choix unique, choix multiple, oui/non, case à cocher, photo, fichier, lien) et peut être obligatoire ou non.",
    "- Le bouton d'ajout de champ propose une banque de questions prêtes à l'emploi, rangées par catégories : Identité (nom de l'organisme, genre, date de naissance, nombre d'enfants, nationalité), Contact (e-mail ou téléphone en plus, WhatsApp, site internet, LinkedIn, adresse postale…), Profession (fonction, secteur, entreprise, années d'expérience, statut professionnel), Diaspora (pays d'origine, pays de résidence, ville, région d'origine, année d'arrivée), Événement, Médias (photo, pièce d'identité, CV, vidéo, documents) et Personnalisé (une question libre).",
    "- La catégorie « Événement » propose : « Attentes pour cet événement » (texte long), « Comment avez-vous connu cet événement ? » (choix unique : réseaux sociaux, bouche à oreille, e-mail, autre), « Régime alimentaire particulier » et « Besoin d'accessibilité ». Il n'existe PAS de question toute faite « Accompagnant(e) » : pour savoir si l'inscrit vient accompagné, ou connaître le nom de son accompagnant, l'organisateur ajoute une question personnalisée avec son propre libellé (par exemple « Nom de l'accompagnant », en texte court). Une inscription correspond à une seule personne : aucune seconde fiche n'est créée pour l'accompagnant.",
    "- Les onglets de gestion d'une fiche sont : Vue d'ensemble, Types d'inscription, Formulaire, Validation (acceptation automatique ou manuelle), Aperçu public (la fiche telle que la verront les visiteurs, avant publication), Communication (e-mails envoyés aux inscrits : confirmation, rappels…), Contrôle QR (billets et QR codes scannés le jour de l'événement), Présences (liste des inscrits et leur présence), Finances (paiements des types payants), Statistiques, Historique (qui a changé quoi).",
    "- Le bouton « 🎥 Tutoriel » en haut d'une fiche fait découvrir les onglets pas à pas.",
    "",
    ...require("./kofi-comprehension").bloc("fr", "Fiches d'inscription"),
  ].join("\n");
}

module.exports = { MARQUEUR, ROLES_CREATION, MAX_TYPES, MAX_CHAMPS, TYPES_CHAMP, VISIBILITES, validerBrouillon, manquants, memeBrouillon, vue, quand, lireSortie, systemePour, corpsFiche, corpsType, corpsChamp, aujourdhuiParis, libelleReserve };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, SEC, appelerRoute } = deps;
  const K = require("./kofi");
  const P = K.Portefeuille;

  async function exiger(req, res) {
    const user = await getCurrentUser(req);
    if (!user) { sendJSON(res, 401, { error: "Connexion requise." }); return null; }
    return user;
  }
  const contexte = (user, req) => K.contexteKoffi(db, deps, user, req);
  const refuser = (res, ctx) => {
    if (ctx.etat === "pays") { sendJSON(res, 403, { error: "Koffi n'est pas disponible dans votre pays pour le moment. Les fiches restent utilisables sans lui.", code: "pays_non_pris_en_charge" }); return true; }
    if (ctx.etat === "mineur") { sendJSON(res, 403, { error: "Koffi est réservé aux personnes majeures (18 ans ou plus).", code: "mineur" }); return true; }
    if (ctx.etat === "majorite") { sendJSON(res, 403, { error: "Confirmez avoir 18 ans ou plus pour utiliser Koffi.", code: "majorite_requise", texte: K.TEXTE_MAJORITE }); return true; }
    if (ctx.etat === "desactive") { sendJSON(res, 403, { error: "Koffi est désactivé pour le moment.", code: "desactive" }); return true; }
    if (ctx.etat === "indisponible") { sendJSON(res, 503, { error: "Koffi est épuisé pour le moment : l'équipe le recharge. Réessayez plus tard.", code: "indisponible" }); return true; }
    return false;
  };
  const MSG_ROLE = "Seuls les comptes Initiative, Collectivité et Administrateur peuvent créer une fiche d'inscription. Je peux en revanche vous expliquer comment fonctionne le module.";
  const peutCreer = user => ROLES_CREATION.includes(user.role);

  /* ── Création : par les routes habituelles du module, avec la session de la personne ── */
  async function creerFiche(user, req, f) {
    if (typeof appelerRoute !== "function") return { ok: false, message: "La création n'est pas disponible pour le moment." };
    if (!peutCreer(user)) return { ok: false, message: MSG_ROLE };
    const appel = async (m, chemin, corps) => { const r = await appelerRoute(m, chemin, req, corps); return r; };
    let rep;
    try { rep = await appel("POST", "/api/insc/fiches", corpsFiche(f)); }
    catch (e) { console.error("[Koffi inscriptions] création :", e.message); return { ok: false, message: "La création a échoué. Réessayez dans un instant." }; }
    const ficheId = rep.status === 201 && rep.data && rep.data.fiche ? Number(rep.data.fiche.id) : 0;
    if (!ficheId) return { ok: false, message: rep.status === 403 ? MSG_ROLE : (rep.data && rep.data.error) || "La création a échoué. Réessayez dans un instant." };
    const echecs = [];
    let nbTypes = 0, nbChamps = 0;
    for (const t of f.types) {
      let r;
      try { r = await appel("POST", `/api/insc/fiches/${ficheId}/types`, corpsType(t)); } catch (e) { r = { status: 500, data: {} }; }
      const typeId = r.status === 201 && r.data && r.data.id ? Number(r.data.id) : 0;
      if (!typeId) { echecs.push(`le type « ${t.label} »`); continue; }
      nbTypes++;
      for (const c of f.formulaire) {
        let rc;
        try { rc = await appel("POST", `/api/insc/types/${typeId}/champs`, corpsChamp(c)); } catch (e) { rc = { status: 500, data: {} }; }
        if (rc.status === 201) nbChamps++; else echecs.push(`la question « ${c.libelle} » du type « ${t.label} »`);
      }
    }
    /* Trace durable dans l'historique de la fiche : qui, quoi, quand (la date est celle de l'insertion). */
    try {
      const acteur = `${user.prenom || ""} ${user.nom || ""}`.trim() || "Compte";
      await db.prepare("INSERT INTO insc_historique (fiche_id, acteur_id, acteur_nom, action, details) VALUES (?,?,?,?,?)")
        .run(ficheId, user.id, acteur, "creation_koffi", `Fiche préparée avec Koffi à la demande de ${acteur} : ${nbTypes} type(s) d'inscription, ${f.formulaire.length} question(s).`);
    } catch (e) { console.error("[Koffi inscriptions] journal :", e.message); }
    return { ok: true, id: ficheId, echecs: [...new Set(echecs)].slice(0, 6) };
  }
  const messageCree = (f, c) => c.echecs.length
    ? `La fiche « ${f.nom} » est créée en brouillon ✅, mais je n'ai pas pu ajouter : ${c.echecs.join(", ")}. Ouvrez-la pour terminer ces éléments à la main.`
    : `C'est fait ✅ La fiche « ${f.nom} » est créée en brouillon, avec ${f.types.length} type${f.types.length > 1 ? "s" : ""} d'inscription et ${f.formulaire.length} question${f.formulaire.length > 1 ? "s" : ""}. Rien n'est publié : ouvrez-la pour relier un événement, relire l'aperçu public, puis la publier.`;
  const lienFiche = id => ({ url: `inscriptions-admin.html?fiche=${encodeURIComponent(id)}`, tel: `#/inscriptions/${encodeURIComponent(id)}`, texte: "Ouvrir la fiche" });

  /* ── Conversations ─────────────────────────────────────────────────────────────────────────────── */
  const dto = m => {
    const meta = parseJson(m.citations_json) || {};
    const out = { id: Number(m.id), role: m.role, contenu: m.contenu, gratuit: /competences/.test(String(m.flags || "")), date: m.created_at };
    if (meta.montrer && meta.brouillon && meta.brouillon.champs) out.brouillon = vue(meta.brouillon.champs);
    if (meta.fiche_id) { out.cree = true; out.lien = lienFiche(meta.fiche_id); }
    return out;
  };
  async function derniereConversation(user, r) {
    const limite = sqlDate(new Date(Date.now() - r.retention_jours * 86400000));
    const c = await db.prepare("SELECT * FROM kofi_conversations WHERE user_id=? AND contexte='inscriptions' AND derniere_activite>=? ORDER BY derniere_activite DESC, id DESC LIMIT 1").get(user.id, limite);
    if (!c) return null;
    const msgs = await db.prepare("SELECT id, role, contenu, citations_json, flags, created_at FROM kofi_messages WHERE conversation_id=? AND created_at>=? ORDER BY id").all(c.id, limite);
    return { id: Number(c.id), messages: msgs.map(dto) };
  }
  /* Le brouillon en cours : celui du DERNIER message de Koffi, tant qu'il n'a été ni créé ni abandonné. */
  async function brouillonEnCours(convId) {
    const m = await db.prepare("SELECT citations_json FROM kofi_messages WHERE conversation_id=? AND role='assistant' ORDER BY id DESC LIMIT 1").get(convId);
    const meta = m ? parseJson(m.citations_json) : null;
    return meta && meta.brouillon && meta.brouillon.champs ? meta.brouillon : null;
  }

  route("GET", "/api/kofi/inscriptions/etat", async (req, res) => {
    const user = await exiger(req, res); if (!user) return;
    const ctx = await contexte(user, req);
    const r = ctx.r;
    const bloque = ["pays", "mineur", "majorite", "desactive", "indisponible"].includes(ctx.etat);
    const pf = (ctx.etat === "desactive" || ctx.etat === "pays") ? null : await K.portefeuilleDe(db, user, ctx);
    let etat = ctx.etat;
    if (etat === "utilisable" && !P.peutUtiliser(pf)) etat = "recharge";
    sendJSON(res, 200, {
      nom: K.NOM, etat, majorite: ctx.etat === "majorite" ? { texte: K.TEXTE_MAJORITE, version: K.VERSION_MAJORITE } : null,
      avertissement: "Koffi ne voit aucune fiche existante ni aucun inscrit : il explique le module et prépare une fiche avec vous. Rien n'est créé sans votre accord.",
      portefeuille: pf, recharge: { achetable: !["indisponible", "desactive", "mineur", "majorite", "pays"].includes(ctx.etat), texte: P.TEXTE_RECHARGE_NON_REMBOURSABLE, retractation: P.TEXTE_RECHARGE_RETRACTATION },
      max_message: r.inscriptions_max_message_caracteres, retention_jours: r.retention_jours,
      creation: { disponible: !bloque && peutCreer(user) },
      conversation: bloque ? null : await derniereConversation(user, r),
    });
  });

  route("POST", "/api/kofi/inscriptions/messages", async (req, res, params, body) => {
    const user = await exiger(req, res); if (!user) return;
    const lim = SEC.rateLimit(`kofi-inscriptions-msg:${user.id}`, 12, 60000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Doucement : réessayez dans ${lim.retryAfter}s.`, code: "trop_vite" });
    const ctx = await contexte(user, req);
    if (refuser(res, ctx)) return;
    const r = ctx.r;
    const texte = nettoyer(body && body.texte);
    if (!texte) return sendJSON(res, 400, { error: "Écrivez votre message." });
    if (texte.length > r.inscriptions_max_message_caracteres) return sendJSON(res, 400, { error: `Message trop long (${r.inscriptions_max_message_caracteres} caractères au maximum).`, code: "trop_long" });
    const debutJour = sqlDate(new Date(Date.now() - 24 * 3600 * 1000));
    const nbJour = Number((await db.prepare("SELECT COUNT(*) AS n FROM kofi_usage WHERE user_id=? AND categorie IN ('inscriptions_mensuel','inscriptions_achat','inscriptions_illimite','inscriptions_offert') AND created_at>=?").get(user.id, debutJour)).n) || 0;
    if (!(await P.estIllimite(db, { userId: user.id, role: user.role, r })) && nbJour >= r.plafond_jour_inscriptions) return sendJSON(res, 429, { error: "Vous avez atteint la limite de messages pour aujourd'hui. Revenez demain.", code: "plafond_jour" });

    let conv = null;
    if (body && body.conversation_id) {
      conv = await db.prepare("SELECT * FROM kofi_conversations WHERE id=? AND user_id=? AND contexte='inscriptions'").get(Number(body.conversation_id), user.id);
      if (!conv) return sendJSON(res, 404, { error: "Conversation introuvable." });
    }
    const ouvrir = async () => {
      if (conv) { if (!conv.titre) await db.prepare("UPDATE kofi_conversations SET titre=? WHERE id=?").run(court(texte, 60), conv.id); return conv; }
      const x = await db.prepare("INSERT INTO kofi_conversations (user_id, formation_id, contexte, langue, titre) VALUES (?,?,?,?,?)").run(user.id, 0, "inscriptions", "fr", court(texte, 60));
      conv = { id: Number(x.lastInsertRowid) };
      return conv;
    };
    const enregistrerEchange = async (reponse, extra) => {
      extra = extra || {};
      await ouvrir();
      await db.prepare("INSERT INTO kofi_messages (conversation_id, role, contenu) VALUES (?,?,?)").run(conv.id, "user", texte);
      const x = await db.prepare("INSERT INTO kofi_messages (conversation_id, role, contenu, citations_json, modele, jetons_entree, jetons_sortie, flags) VALUES (?,?,?,?,?,?,?,?)")
        .run(conv.id, "assistant", reponse, extra.meta ? JSON.stringify(extra.meta) : null, extra.modele || null, extra.entree || 0, extra.sortie || 0, (extra.flags || []).join(",") || null);
      await db.prepare("UPDATE kofi_conversations SET derniere_activite=datetime('now') WHERE id=?").run(conv.id);
      return Number(x.lastInsertRowid);
    };
    const reponse = async (id, contenu, gratuit, brouillon, cree) => {
      const message = { id, role: "assistant", contenu, gratuit: !!gratuit };
      if (brouillon) message.brouillon = brouillon;
      if (cree) { message.cree = true; message.lien = lienFiche(cree); }
      return { conversation_id: conv.id, message, portefeuille: await K.portefeuilleDe(db, user, ctx) };
    };

    /* « Que sais-tu faire ? » : réponse fixe, sans IA, JAMAIS décomptée. */
    if (Competences.estQuestionCompetences(texte)) {
      const rep = Competences.reponseInscriptions(r);
      const id = await enregistrerEchange(rep, { flags: ["competences"] });
      return sendJSON(res, 200, await reponse(id, rep, true));
    }

    /* Décompte : questions offertes (comptes sans Premium) retirées tout de suite et rendues si l'IA échoue ; sinon le portefeuille, débité APRÈS l'appel au coût réel. */
    const pf = await K.portefeuilleDe(db, user, ctx);
    let lot = null;
    if (P.offertesDispo(pf)) {
      if (!pf.offertes.accorde) await K.accorderGratuit(db, user.id, r);
      lot = await K.debiterGratuit(db, user.id);
    }
    if (!lot && !P.peutAppeler(pf)) return sendJSON(res, 402, { error: "Votre crédit Koffi est épuisé.", code: "credits_epuises", portefeuille: pf });

    const droit = peutCreer(user);
    const auj = aujourdhuiParis();
    const prev = conv ? await brouillonEnCours(conv.id) : null;

    const messages = [];
    if (conv) {
      const limite = sqlDate(new Date(Date.now() - r.retention_jours * 86400000));
      const hist = (await db.prepare("SELECT role, contenu FROM kofi_messages WHERE conversation_id=? AND created_at>=? ORDER BY id DESC LIMIT 8").all(conv.id, limite)).reverse();
      hist.forEach(m => {
        const role = m.role === "assistant" ? "assistant" : "user";
        if (messages.length && messages[messages.length - 1].role === role) messages.pop();
        messages.push({ role, content: String(m.contenu).slice(0, 1500) });
      });
      while (messages.length && messages[0].role !== "user") messages.shift();
      if (messages.length && messages[messages.length - 1].role === "user") messages.pop();
    }
    let contexteIA = `<contexte>Date du jour à Paris : ${auj} (${dateLongue(auj)})</contexte>\n<droits>creer_fiche: ${droit ? "oui" : "non"}</droits>\n`;
    if (prev && droit) {
      const manqP = manquants(prev.champs);
      contexteIA += `<brouillon_precedent>${JSON.stringify(prev.champs)}</brouillon_precedent>\n<etat_brouillon>${JSON.stringify({ manquants: manqP.map(x => x.libelle), pret: manqP.length === 0 })}</etat_brouillon>\n`;
    }
    messages.push({ role: "user", content: `${contexteIA}<demande>\n${texte}\n</demande>` });

    let rep;
    try { rep = await IA.repondre({ modele: r.modele, systeme: systemePour(), messages, maxSortie: r.inscriptions_max_sortie_tokens + (droit ? 900 : 0) }); }
    catch (e) {
      if (lot) await K.rendre(db, lot.id);
      if (e instanceof IA.KofiIAErreur) {
        if (e.code !== "limite") console.error("[Koffi inscriptions] IA :", e.code, e.message);
        return sendJSON(res, e.code === "limite" ? 429 : 503, { error: "Koffi est momentanément indisponible. Votre crédit n'a pas été décompté : réessayez dans un instant.", code: e.code === "limite" ? "limite" : "indisponible" });
      }
      throw e;
    }
    const cout = K.coutEstime(rep.entree, rep.sortie, r);
    const noterUsage = (cat, msgId) => db.prepare("INSERT INTO kofi_usage (user_id, formation_id, conversation_id, message_id, categorie, jetons_entree, jetons_sortie, cout_eur, modele) VALUES (?,?,?,?,?,?,?,?,?)").run(user.id, null, conv ? conv.id : null, msgId || null, cat, rep.entree, rep.sortie, cout, r.modele);
    /* Le brouillon en cours survit aux messages qui n'en parlent pas (une explication entre deux questions, par exemple). */
    const meta0 = () => (prev && droit ? { brouillon: prev } : null);
    if (rep.refus) {
      if (lot) await K.rendre(db, lot.id);
      const refus = "Je ne peux pas répondre à cette demande. Reformulez-la, ou utilisez le tutoriel de la fiche.";
      const id = await enregistrerEchange(refus, { flags: ["refus"], modele: r.modele, meta: meta0() });
      await noterUsage("inscriptions_refus", id);
      return sendJSON(res, 200, await reponse(id, refus));
    }
    const sortie = lireSortie(rep.texte);
    if (!sortie) {
      if (lot) await K.rendre(db, lot.id);
      const msg = "Je n'ai pas bien compris votre demande. Pouvez-vous la reformuler en quelques mots (une question sur la fiche, ou ce que vous voulez y mettre) ?";
      const id = await enregistrerEchange(msg, { flags: ["illisible"], modele: r.modele, meta: meta0() });
      await noterUsage("inscriptions_illisible", id);
      return sendJSON(res, 200, await reponse(id, msg));
    }

    let contenu = sortie.message, meta = meta0(), brouillonVue = null, flags = [], creeId = 0;
    if (sortie.action === "abandonner") {
      meta = { abandonne: true };
      if (!contenu) contenu = "D'accord, j'abandonne ce brouillon. Dites-moi si vous voulez recommencer ou si vous avez une question sur les fiches.";
    } else if (sortie.action === "fiche") {
      if (!droit) { contenu = MSG_ROLE; meta = null; }
      else {
        const base = prev ? { ...prev.champs } : {};
        const v = validerBrouillon({ ...base, ...sortie.brouillon, types: Array.isArray(sortie.brouillon.types) ? sortie.brouillon.types : base.types, formulaire: Array.isArray(sortie.brouillon.formulaire) ? sortie.brouillon.formulaire : base.formulaire });
        const champs = v.champs, manq = manquants(champs), pret = manq.length === 0;
        const notes = [];
        if (v.problemes.includes("dates_inversees")) notes.push("Les dates étaient inversées : j'ai remis l'ouverture avant la fermeture. Dites-moi si ce n'est pas bon.");
        if (v.problemes.includes("prix_trop_bas")) notes.push(`Un prix payant doit être d'au moins ${euros(PRIX_MIN)} : pouvez-vous me donner le bon prix ?`);
        if (v.problemes.includes("trop_de_types")) notes.push(`Je ne peux préparer que ${MAX_TYPES} types d'inscription ici : vous pourrez en ajouter d'autres dans la fiche.`);
        if (v.problemes.includes("trop_de_champs")) notes.push(`Je ne peux préparer que ${MAX_CHAMPS} questions ici : vous pourrez en ajouter d'autres dans la fiche.`);
        v.problemes.filter(p => p.startsWith("libelle_reserve:")).forEach(p => notes.push(`« ${p.slice(16)} » est déjà demandé à chaque inscrit : je ne l'ai pas ajouté.`));
        v.problemes.filter(p => p.startsWith("type_champ_inconnu:")).forEach(p => notes.push(`Je n'ai pas reconnu le type de la question « ${p.slice(19)} » : je l'ai mise en texte court.`));
        const confirmeVu = sortie.confirme && pret && prev && manquants(prev.champs).length === 0 && memeBrouillon(prev.champs, champs);
        let cree = null;
        if (confirmeVu) {
          const c = await creerFiche(user, req, champs);
          if (c.ok) cree = c; else notes.push(c.message);
        }
        if (cree) {
          contenu = messageCree(champs, cree); creeId = cree.id;
          meta = { fiche_id: cree.id }; flags = ["fiche_creee"];
        } else {
          const base_msg = sortie.message || (pret ? "Votre fiche est prête à être créée." : `Il me manque encore : ${manq.map(x => x.libelle).join(", ")}.`);
          contenu = [base_msg, ...notes].join("\n\n");
          if (pret) contenu += "\n\nVérifiez l'aperçu ci-dessous : touchez « Créer la fiche » si vous êtes d'accord, ou dites-moi ce qu'il faut changer.";
          meta = { brouillon: { champs }, montrer: true };
          brouillonVue = vue(champs, manq);
          flags = ["fiche_brouillon"];
        }
      }
    }
    /* « repondre » et « question » : simple réponse, le brouillon éventuel est conservé tel quel. */
    const id = await enregistrerEchange(contenu, { meta, flags, modele: r.modele, entree: rep.entree, sortie: rep.sortie });
    if (pf.illimite) await noterUsage("inscriptions_illimite", id);
    else if (lot) await noterUsage("inscriptions_offert", id);
    else {
      const d = await P.debiter(db, user.id, cout * r.coefficient_cout, { avecMensuel: pf.premium && !pf.reserve_basse });
      await noterUsage(d.depuis_achat ? "inscriptions_achat" : "inscriptions_mensuel", id);
    }
    sendJSON(res, 200, await reponse(id, contenu, false, brouillonVue, creeId));
  });

  /* Boutons de l'aperçu : « Créer la fiche » et « Abandonner » — sans IA, donc gratuits. Le brouillon doit être celui du DERNIER message de Koffi et complet. */
  async function messageBrouillon(user, body) {
    const m = await db.prepare("SELECT m.id, m.conversation_id, m.citations_json FROM kofi_messages m JOIN kofi_conversations c ON c.id=m.conversation_id WHERE m.id=? AND m.role='assistant' AND c.user_id=? AND c.contexte='inscriptions'").get(Number(body && body.message_id), user.id);
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

  route("POST", "/api/kofi/inscriptions/fiche/creer", async (req, res, params, body) => {
    const user = await exiger(req, res); if (!user) return;
    const lim = SEC.rateLimit(`kofi-inscriptions-creer:${user.id}`, 10, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Doucement : réessayez dans ${lim.retryAfter}s.`, code: "trop_vite" });
    const ctx = await contexte(user, req);
    if (refuser(res, ctx)) return;
    const b = await messageBrouillon(user, body);
    if (b.error) return sendJSON(res, b.code, { error: b.error });
    if (!peutCreer(user)) return sendJSON(res, 403, { error: MSG_ROLE });
    const { champs } = validerBrouillon(b.meta.brouillon.champs);
    const manq = manquants(champs);
    if (manq.length) return sendJSON(res, 409, { error: `Le brouillon n'est pas complet : il manque ${manq.map(x => x.libelle).join(", ")}.` });
    /* Une seule création par aperçu, même en cas de double clic : le premier appel réserve le message (atomique), les suivants sont refusés. */
    const pris = await db.prepare("UPDATE kofi_messages SET flags=? WHERE id=? AND (flags IS NULL OR flags NOT LIKE '%creation_en_cours%')").run("creation_en_cours", b.m.id);
    if (!Number(pris && pris.changes)) return sendJSON(res, 409, { error: "La création de cette fiche est déjà en cours." });
    const c = await creerFiche(user, req, champs);
    if (!c.ok) {
      await db.prepare("UPDATE kofi_messages SET flags=NULL WHERE id=?").run(b.m.id);   /* l'aperçu redevient utilisable */
      return sendJSON(res, 422, { error: c.message });
    }
    const message = await ajouterMessageKoffi(b.m.conversation_id, messageCree(champs, c), { fiche_id: c.id }, "fiche_creee");
    sendJSON(res, 201, { conversation_id: Number(b.m.conversation_id), message, fiche_id: c.id });
  });

  route("POST", "/api/kofi/inscriptions/fiche/abandonner", async (req, res, params, body) => {
    const user = await exiger(req, res); if (!user) return;
    const b = await messageBrouillon(user, body);
    if (b.error) return sendJSON(res, b.code, { error: b.error });
    const message = await ajouterMessageKoffi(b.m.conversation_id, "D'accord, j'abandonne ce brouillon. Dites-moi si vous voulez recommencer ou si vous avez une question sur les fiches.", { abandonne: true });
    sendJSON(res, 200, { conversation_id: Number(b.m.conversation_id), message });
  });

  route("DELETE", "/api/kofi/inscriptions/conversations/:id", async (req, res, params) => {
    const user = await exiger(req, res); if (!user) return;
    const c = await db.prepare("SELECT id FROM kofi_conversations WHERE id=? AND user_id=? AND contexte='inscriptions'").get(Number(params.id), user.id);
    if (!c) return sendJSON(res, 404, { error: "Conversation introuvable." });
    await db.prepare("DELETE FROM kofi_feedback WHERE message_id IN (SELECT id FROM kofi_messages WHERE conversation_id=?)").run(c.id);
    await db.prepare("DELETE FROM kofi_messages WHERE conversation_id=?").run(c.id);
    await db.prepare("DELETE FROM kofi_conversations WHERE id=?").run(c.id);
    sendJSON(res, 200, { ok: true });
  });
};

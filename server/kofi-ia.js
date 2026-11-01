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

/* Brouillon de correction d'un devoir (système marqué ASSISTANT_CORRECTION) : JSON déterministe selon un mot-clé du dépôt. Le contenu peut être une liste de blocs (texte + fichier joint). */
function reponseFausseCorrection({ systeme, messages }) {
  const c = (messages[messages.length - 1] || {}).content;
  const dernier = Array.isArray(c) ? c.filter(b => b.type === "text").map(b => b.text).join("\n") : String(c || "");
  const entree = Math.ceil((String(systeme).length + dernier.length) / 4);
  if (process.env.KOFI_FAUX_LOG) { try { fs.appendFileSync(process.env.KOFI_FAUX_LOG, JSON.stringify({ systeme, texte: dernier, blocs: Array.isArray(c) ? c.map(b => b.type) : [] }) + "\n"); } catch (e) { /* sans importance */ } }
  if (/PANNEFAUSSE/.test(dernier)) throw new KofiIAErreur("indisponible", "Panne simulée.");
  if (/LIMITEFAUSSE/.test(dernier)) throw new KofiIAErreur("limite", "Limite simulée.");
  if (/REFUSFAUX/.test(dernier)) return { texte: "", entree, sortie: 5, lecture_cache: 0, refus: true, arret: "refusal" };
  const en = /<langue_du_brouillon>en</.test(dernier);
  let texte;
  if (/JSONFAUX/.test(dernier)) texte = "Voici mon avis, sans structure.";
  else if (/NOTEHORS/.test(dernier)) texte = JSON.stringify({ debrief: "Note hors limites.", note_pct: 250, avis: "Bon travail." });
  else if (/SANSNOTE/.test(dernier)) texte = JSON.stringify({ debrief: "Dépôt trop court pour être noté.", note_pct: null, avis: en ? "Good start. Please add more detail." : "Bon début. Ajoutez plus de détails." });
  else texte = "```json\n" + JSON.stringify({
    debrief: "L'apprenant a répondu à la consigne" + (/fichier de l.apprenant est joint/.test(dernier) ? " et joint un fichier lu par Koffi" : "") + ". Points à vérifier : les dates.",
    note_pct: 70,
    avis: en ? "Good work: your plan is clear. Please add your dates and one concrete example, then send a new version." : "Bon travail : votre plan est clair. Ajoutez vos dates et un exemple concret, puis renvoyez une nouvelle version.",
  }) + "\n```";
  return { texte, entree, sortie: Math.ceil(texte.length / 4), lecture_cache: 0, refus: false, arret: "end_turn" };
}

/* Assistant de l'administrateur (système marqué ASSISTANT_ADMIN) : JSON déterministe d'après des marqueurs de la demande — OUVRIR:section, RAPPEL:texte_avec_tirets_bas, NOTIF:titre CORPS:texte ROLES:utilisateur,initiative PAYS:France,
   AUTO:oui|non, QUAND:AAAA-MM-JJ_HH:MM (heure de Paris), STATS. Sans marqueur : une simple réponse. */
function reponseFausseAdmin({ systeme, messages }) {
  if (process.env.KOFI_FAUX_LOG) { try { fs.appendFileSync(process.env.KOFI_FAUX_LOG, JSON.stringify({ systeme, messages }) + "\n"); } catch (e) { /* sans importance */ } }
  const dernier = String((messages[messages.length - 1] || {}).content || "");
  const q = (dernier.split("<demande>")[1] || dernier).split("</demande>")[0];
  const entree = Math.ceil((String(systeme).length + messages.reduce((a, m) => a + String(m.content).length, 0)) / 4);
  if (/PANNEFAUSSE/.test(q)) throw new KofiIAErreur("indisponible", "Panne simulée.");
  if (/LIMITEFAUSSE/.test(q)) throw new KofiIAErreur("limite", "Limite simulée.");
  if (/REFUSFAUX/.test(q)) return { texte: "", entree, sortie: 5, lecture_cache: 0, refus: true, arret: "refusal" };
  const prise = re => (re.exec(q) || [])[1] || "";
  const mots = s => s.replace(/_/g, " ");
  let texte;
  if (/JSONFAUX/.test(q)) texte = "Voici ma réponse sans structure.";
  else {
    const auto = /AUTO:oui/.test(q) ? true : /AUTO:non/.test(q) ? false : null;
    const quand = prise(/QUAND:(\S+)/).replace("_", " ") || null;
    const sortie = { action: "repondre", message: "Voici ma réponse.", ouvrir: null, taches: [] };
    if (/STATS/.test(q)) sortie.message = "Il y a " + ((/comptes_total[^:]*: (\d+)/.exec(dernier) || [])[1] || "?") + " comptes.";
    if (prise(/OUVRIR:(\S+)/)) { sortie.ouvrir = prise(/OUVRIR:(\S+)/); sortie.message = "Je vous ouvre le module."; }
    if (prise(/RAPPEL:(\S+)/)) { sortie.action = "proposer"; sortie.message = "Je prépare ce rappel."; sortie.taches.push({ type: "rappel", libelle: "Rappel", params: { texte: mots(prise(/RAPPEL:(\S+)/)) }, autonomie: auto, quand }); }
    if (prise(/NOTIF:(\S+)/)) {
      const cible = { roles: prise(/ROLES:(\S+)/) ? prise(/ROLES:(\S+)/).split(",") : [] };
      if (prise(/PAYS:(\S+)/)) cible.pays = mots(prise(/PAYS:(\S+)/));
      if (prise(/USER:(\d+)/)) cible.user_id = Number(prise(/USER:(\d+)/));
      sortie.action = "proposer"; sortie.message = "Je prépare cette notification.";
      sortie.taches.push({ type: "envoyer_notification", libelle: "Notification", params: { titre: mots(prise(/NOTIF:(\S+)/)), contenu: mots(prise(/CORPS:(\S+)/)), cible }, autonomie: auto, quand });
    }
    texte = "```json\n" + JSON.stringify(sortie) + "\n```";
  }
  return { texte, entree, sortie: Math.ceil(texte.length / 4), lecture_cache: 0, refus: false, arret: "end_turn" };
}

/* Conseiller de l'Annuaire (système marqué ASSISTANT_ANNUAIRE) : JSON déterministe d'après des marqueurs de la demande — KW:mot (un concept), KW2:mot, VILLE:xxx, PAYS:xxx, TYPE:xxx. */
function reponseFausseAnnuaire({ systeme, messages }) {
  if (process.env.KOFI_FAUX_LOG) { try { fs.appendFileSync(process.env.KOFI_FAUX_LOG, JSON.stringify({ systeme, messages }) + "\n"); } catch (e) { /* sans importance */ } }
  const dernier = String((messages[messages.length - 1] || {}).content || "");
  const q =(dernier.split("<demande>")[1] || dernier).split("</demande>")[0];
  const entree = Math.ceil((String(systeme).length + messages.reduce((a, m) => a + String(m.content).length, 0)) / 4);
  if (/PANNEFAUSSE/.test(q)) throw new KofiIAErreur("indisponible", "Panne simulée.");
  if (/LIMITEFAUSSE/.test(q)) throw new KofiIAErreur("limite", "Limite simulée.");
  if (/REFUSFAUX/.test(q)) return { texte: "", entree, sortie: 5, lecture_cache: 0, refus: true, arret: "refusal" };
  let texte;
  if (/JSONFAUX/.test(q)) texte = "Voici ma réponse sans structure.";
  else if (/VAGUEFAUX/.test(q)) texte = JSON.stringify({ action: "question", message: "Quel domaine ou quel type de compétence recherchez-vous ?" });
  else if (/EXPLIQUEFAUX/.test(q)) texte = JSON.stringify({ action: "repondre", message: "Je ne propose que les comptes Premium qui ont une photo et un descriptif." });
  else if (/TOUSFAUX/.test(q)) {
    /* « montre-moi les comptes » : aucun thème — le modèle renvoie des critères vides (type facultatif : TYPE:xxx), et SUITE:oui pour « la suite ». */
    const prise = re => (re.exec(q) || [])[1] || "";
    texte = "```json\n" + JSON.stringify({ action: "chercher", message: "Je vous montre les comptes de l'Annuaire.", criteres: { concepts: [], ville: prise(/VILLE:(\S+)/), pays: "", type: prise(/TYPE:(\S+)/), liste: true, suite: /SUITE:oui/.test(q) } }) + "\n```";
  } else {
    const prise = re => (re.exec(q) || [])[1] || "";
    const concepts = [prise(/KW:(\S+)/), prise(/KW2:(\S+)/)].filter(Boolean).map(m => [m.replace(/_/g, " ")]);
    const prec = (/<criteres_precedents>([\s\S]*?)<\/criteres_precedents>/.exec(dernier) || [])[1];
    let base = {}; try { base = prec ? JSON.parse(prec) : {}; } catch (e) { base = {}; }
    const crit = { concepts: concepts.length ? concepts : (base.concepts || []), ville: prise(/VILLE:(\S+)/) || (/SANSVILLE/.test(q) ? "" : base.ville || ""), pays: prise(/PAYS:(\S+)/) || base.pays || "", type: prise(/TYPE:(\S+)/) || base.type || "" };
    if (/LISTE/.test(q)) crit.liste = true;
    texte = "```json\n" + JSON.stringify({ action: "chercher", message: "Je cherche des profils correspondant à votre demande.", criteres: crit }) + "\n```";
  }
  return { texte, entree, sortie: Math.ceil(texte.length / 4), lecture_cache: 0, refus: false, arret: "end_turn" };
}

/* Guide des événements (système marqué ASSISTANT_EVENEMENTS) : JSON déterministe d'après des marqueurs de la demande —
   KW:theme_avec_tirets_bas, VILLE:Lyon ou VILLE:@moi, PAYS:France, PERIODE:cette_semaine, DU:AAAA-MM-JJ AU:AAAA-MM-JJ, GRATUIT:gratuit|payant, MODE:en_ligne. */
function reponseFausseEvenements({ systeme, messages }) {
  if (process.env.KOFI_FAUX_LOG) { try { fs.appendFileSync(process.env.KOFI_FAUX_LOG, JSON.stringify({ systeme, messages }) + "\n"); } catch (e) { /* sans importance */ } }
  const dernier = String((messages[messages.length - 1] || {}).content || "");
  const q = (dernier.split("<demande>")[1] || dernier).split("</demande>")[0];
  const entree = Math.ceil((String(systeme).length + messages.reduce((a, m) => a + String(m.content).length, 0)) / 4);
  if (/PANNEFAUSSE/.test(q)) throw new KofiIAErreur("indisponible", "Panne simulée.");
  if (/LIMITEFAUSSE/.test(q)) throw new KofiIAErreur("limite", "Limite simulée.");
  if (/REFUSFAUX/.test(q)) return { texte: "", entree, sortie: 5, lecture_cache: 0, refus: true, arret: "refusal" };
  let texte;
  if (/JSONFAUX/.test(q)) texte = "Voici ma réponse sans structure.";
  else if (/ABANDONFAUX/.test(q)) texte = JSON.stringify({ action: "abandonner", message: "" });
  else if (/EXPLIQUEFAUX/.test(q)) texte = JSON.stringify({ action: "repondre", message: "Les événements sont publiés par les comptes Initiative, Collectivité et Administrateur." });
  else if (/FLASHFAUX/.test(q)) {
    /* Événement flash : brouillon COMPLET (comme le vrai modèle) = brouillon précédent + champs donnés par marqueurs
       F_TITRE:, F_DATE:AAAA-MM-JJ ou +N (jours après la date du jour), F_LIEU:, F_VILLE:, F_PAYS:, F_DESC:, F_HEURE:HH:MM, F_ENLIGNE, F_SANSIMAGE, F_AVECIMAGE ; CONFIRMEFAUX → confirme:true. Les _ valent des espaces. */
    const prise = re => { const v = (re.exec(q) || [])[1]; return v == null ? null : v.replace(/_/g, " "); };
    const prec = (/<brouillon_precedent>([\s\S]*?)<\/brouillon_precedent>/.exec(dernier) || [])[1];
    let b = {}; try { b = prec ? JSON.parse(prec) : {}; } catch (e) { b = {}; }
    const auj = (/Date du jour à Paris : (\d{4}-\d{2}-\d{2})/.exec(dernier) || [])[1] || "2026-01-01";
    const set = (cle, v) => { if (v !== null) b[cle] = v; };
    set("titre", prise(/F_TITRE:(\S+)/)); set("lieu", prise(/F_LIEU:(\S+)/)); set("ville", prise(/F_VILLE:(\S+)/)); set("pays", prise(/F_PAYS:(\S+)/)); set("description", prise(/F_DESC:(\S+)/)); set("heure_debut", prise(/F_HEURE:(\S+)/));
    const d = prise(/F_DATE:(\S+)/);
    if (d) { if (/^\+\d+$/.test(d)) { const x = new Date(auj + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + Number(d.slice(1))); b.date_evt = x.toISOString().slice(0, 10); } else b.date_evt = d; }
    if (/F_ENLIGNE/.test(q)) b.en_ligne = true;
    if (/F_SANSIMAGE/.test(q)) b.image_choix = "sans";
    if (/F_AVECIMAGE/.test(q)) b.image_choix = "avec";
    texte = JSON.stringify({ action: "flash", message: "", brouillon: b, confirme: /CONFIRMEFAUX/.test(q) });
  }
  else {
    const prise = re => (re.exec(q) || [])[1] || "";
    const concepts = [prise(/KW:(\S+)/), prise(/KW2:(\S+)/)].filter(Boolean).map(m => [m.replace(/_/g, " ")]);
    const prec = (/<criteres_precedents>([\s\S]*?)<\/criteres_precedents>/.exec(dernier) || [])[1];
    let base = {}; try { base = prec ? JSON.parse(prec) : {}; } catch (e) { base = {}; }
    const crit = { concepts: concepts.length ? concepts : (base.concepts || []), ville: prise(/VILLE:(\S+)/) || base.ville || "", pays: prise(/PAYS:(\S+)/) || base.pays || "", periode: prise(/PERIODE:(\S+)/) || base.periode || "",
      du: prise(/DU:(\S+)/) || base.du || "", au: prise(/AU:(\S+)/) || base.au || "", gratuit: prise(/GRATUIT:(\S+)/) || base.gratuit || "", mode: prise(/MODE:(\S+)/) || base.mode || "" };
    texte = "```json\n" + JSON.stringify({ action: "chercher", message: "Je cherche les événements correspondant à votre demande.", criteres: crit }) + "\n```";
  }
  return { texte, entree, sortie: Math.ceil(texte.length / 4), lecture_cache: 0, refus: false, arret: "end_turn" };
}

/* Guide de navigation (système marqué ASSISTANT_NAVIGATION) : JSON déterministe — PAGE:cle1,cle2 dans la demande → ces destinations ; sinon aucune. */
function reponseFausseNavigation({ systeme, messages }) {
  if (process.env.KOFI_FAUX_LOG) { try { fs.appendFileSync(process.env.KOFI_FAUX_LOG, JSON.stringify({ systeme, messages }) + "\n"); } catch (e) { /* sans importance */ } }
  const dernier = String((messages[messages.length - 1] || {}).content || "");
  const q = (dernier.split("<demande>")[1] || dernier).split("</demande>")[0];
  const entree = Math.ceil((String(systeme).length + messages.reduce((a, m) => a + String(m.content).length, 0)) / 4);
  if (/PANNEFAUSSE/.test(q)) throw new KofiIAErreur("indisponible", "Panne simulée.");
  if (/LIMITEFAUSSE/.test(q)) throw new KofiIAErreur("limite", "Limite simulée.");
  if (/REFUSFAUX/.test(q)) return { texte: "", entree, sortie: 5, lecture_cache: 0, refus: true, arret: "refusal" };
  let texte;
  if (/JSONFAUX/.test(q)) texte = "Voici ma réponse sans structure.";
  else {
    const m = /PAGE:(\S+)/.exec(q);
    const dest = m ? m[1].split(",").filter(Boolean) : [];
    texte = "```json\n" + JSON.stringify({ message: "Voici où aller.", destinations: dest }) + "\n```";
  }
  return { texte, entree, sortie: Math.ceil(texte.length / 4), lecture_cache: 0, refus: false, arret: "end_turn" };
}

/* Business Plan (système marqué ASSISTANT_BUSINESSPLAN) : réponses déterministes d'après l'<action> et la <progression> du dernier message.
   Marqueurs dans la réponse de la personne : PANNEFAUSSE, LIMITEFAUSSE, REFUSFAUX, JSONFAUX. Le plan lu (balises <plan>) est écrit en clair dans la réponse « question » pour que les tests vérifient ce qui est transmis. */
function reponseFausseBusinessPlan({ systeme, messages }) {
  if (process.env.KOFI_FAUX_LOG) { try { fs.appendFileSync(process.env.KOFI_FAUX_LOG, JSON.stringify({ systeme, messages }) + "\n"); } catch (e) { /* sans importance */ } }
  const dernier = String((messages[messages.length - 1] || {}).content || "");
  const prise = nom => ((new RegExp("<" + nom + ">([\\s\\S]*?)</" + nom + ">")).exec(dernier) || [])[1] || "";
  const action = prise("action").trim(), progression = prise("progression").trim(), reponse = prise("reponse").trim();
  const entree = Math.ceil((String(systeme).length + messages.reduce((a, m) => a + String(m.content).length, 0)) / 4);
  if (/PANNEFAUSSE/.test(dernier)) throw new KofiIAErreur("indisponible", "Panne simulée.");
  if (/LIMITEFAUSSE/.test(dernier)) throw new KofiIAErreur("limite", "Limite simulée.");
  if (/REFUSFAUX/.test(dernier)) return { texte: "", entree, sortie: 5, lecture_cache: 0, refus: true, arret: "refusal" };
  let texte;
  if (/JSONFAUX/.test(dernier)) texte = "Je vous réponds sans structure.";
  else if (action === "bilan") texte = JSON.stringify({ type: "bilan", message: "Dans l'ensemble, un projet cohérent mais des chiffres à consolider.", forces: ["Problème clair"], faiblesses: [{ texte: "Chiffres peu étayés", rubrique: "plan_financier" }, { texte: "Concurrence peu traitée", rubrique: "inexistante" }], pistes: ["Documenter les hypothèses de ventes"] });
  else if (action === "conseil") texte = JSON.stringify({ type: "conseil", message: "Citez un chiffre vérifiable et un exemple concret tirés de votre plan." });
  else {
    const n = (/question (\d+) sur/.exec(progression) || [])[1] || "1";
    const role = (/Tu joues un (INVESTISSEUR|BANQUIER|CLIENT)/.exec(String(systeme)) || [])[1] || "INVESTISSEUR";
    texte = JSON.stringify({ type: "question", reaction: action === "commencer" ? "" : "Merci, c'est noté : " + reponse.slice(0, 60), message: "(" + role + ") Question " + n + " : parlez-moi de votre marché." });
  }
  return { texte, entree, sortie: Math.ceil(texte.length / 4), lecture_cache: 0, refus: false, arret: "end_turn" };
}

/* Réponse déterministe pour les tests : cite le premier extrait, ou se comporte selon un mot-clé de la question. */
function reponseFausse({ systeme, messages }) {
  if (/ASSISTANT_ANNUAIRE/.test(String(systeme))) return reponseFausseAnnuaire({ systeme, messages });
  if (/ASSISTANT_ADMIN/.test(String(systeme))) return reponseFausseAdmin({ systeme, messages });
  if (/ASSISTANT_EVENEMENTS/.test(String(systeme))) return reponseFausseEvenements({ systeme, messages });
  if (/ASSISTANT_BUSINESSPLAN/.test(String(systeme))) return reponseFausseBusinessPlan({ systeme, messages });
  if (/ASSISTANT_NAVIGATION/.test(String(systeme))) return reponseFausseNavigation({ systeme, messages });
  if (/ASSISTANT_FORMATEUR/.test(String(systeme))) return reponseFausseCreateur({ systeme, messages });
  if (/ASSISTANT_CORRECTION/.test(String(systeme))) return reponseFausseCorrection({ systeme, messages });
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

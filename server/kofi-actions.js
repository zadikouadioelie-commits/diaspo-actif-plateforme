/* ═════════════════════════════════════════════════
   server/kofi-actions.js — KOFFI AJOUTE UN ADHÉRENT À LA PLACE DE LA PERSONNE (2026-11-03) : fonctions pures
   (le branchement, les droits et la trace sont dans server/kofi-navigation.js)

   Première action que Koffi (guide de navigation) EXÉCUTE au lieu de seulement montrer la page : « ajouter un adhérent » au registre d'une association (compte Initiative).
   Règles (toutes appliquées par le serveur, jamais par le modèle) :
   - Le modèle remplit un brouillon (JSON) que ce fichier REVALIDE champ par champ (longueurs, e-mail, dates, durée, listes fermées).
   - Le serveur écrit LUI-MÊME le résumé de ce qui sera fait, et n'exécute qu'après un « oui » de la personne (bouton ou réponse dans la conversation).
   - L'ajout passe par la route habituelle POST /api/initiatives/:id/adhesion-membres, avec la session de la personne : mêmes droits, mêmes contrôles, rien de plus.
   - Aucun paiement enregistré, aucun message envoyé à l'adhérent, aucune suppression.
   ═════════════════════════════════════════════════ */
"use strict";

const UNITES = ["jours", "semaines", "mois", "annees"];
const LIB_UNITE = { jours: "jour(s)", semaines: "semaine(s)", mois: "mois", annees: "an(s)" };
const MAX_PAR_JOUR = 30;   /* anti-abus : ajouts par Koffi et par compte, sur 24 h */

const masquer = s => require("./kofi-interdits").masquerSecrets(s);
const nettoyer = s => masquer(String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/<[^>]*>/g, "").replace(/\r\n/g, "\n").trim());
const court = (s, max) => nettoyer(s).replace(/\s+/g, " ").slice(0, max);
const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const z = n => String(n).padStart(2, "0");
const ymdValide = s => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
};
const dateLongue = ymd => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(new Date(ymd + "T00:00:00Z"));

/* Brouillon d'adhérent : tout ce que le modèle a le droit de remplir, revalidé ici. `maintenant` = ms. Renvoie { champs, problemes }. */
function validerAdherent(brut, maintenant) {
  const b = brut && typeof brut === "object" ? brut : {};
  const problemes = [];
  const champs = {
    nom: court(b.nom, 120), prenom: court(b.prenom, 120), email: court(b.email, 200).toLowerCase(),
    telephone: court(b.telephone, 40).replace(/[^0-9+()\-. ]/g, "").trim(), adresse: court(b.adresse, 300), ville: court(b.ville, 100), pays: court(b.pays, 100),
    observations: court(b.observations, 500), formule: court(b.formule, 120),
    date_adhesion: "", date_fin: "", duree_valeur: 0, duree_unite: "mois",
  };
  if (champs.telephone && !/\d/.test(champs.telephone)) champs.telephone = "";
  if (champs.email && !EMAIL_RE.test(champs.email)) { problemes.push("email_invalide"); champs.email = ""; }
  const limiteHaute = (maintenant || Date.now()) + 366 * 86400000;
  const date = v => { const s = court(v, 10); return s ? (ymdValide(s) && s >= "1950-01-01" && Date.parse(s + "T00:00:00Z") <= limiteHaute ? s : null) : ""; };
  const da = date(b.date_adhesion);
  if (da === null) problemes.push("date_adhesion_invalide"); else champs.date_adhesion = da;
  const df = date(b.date_fin);
  if (df === null) problemes.push("date_fin_invalide");
  else if (df && champs.date_adhesion && df < champs.date_adhesion) problemes.push("fin_avant_debut");
  else champs.date_fin = df;
  const dv = Math.floor(Number(b.duree_valeur));
  if (!champs.date_fin && dv >= 1 && dv <= 120) {
    champs.duree_valeur = dv;
    champs.duree_unite = UNITES.includes(String(b.duree_unite)) ? String(b.duree_unite) : "mois";
  }
  return { champs, problemes };
}

/* Formule d'adhésion : la personne dit un nom, le serveur le rapproche des formules DE SON association (le modèle ne les voit jamais).
   formules = [{ id, nom }]. Renvoie { statut: "ok", formule } | { statut: "manquante" | "inconnue" | "ambigue", choix: [noms] }. */
function choisirFormule(texte, formules) {
  const liste = Array.isArray(formules) ? formules : [];
  const noms = liste.map(f => f.nom);
  if (!liste.length) return { statut: "inconnue", choix: [] };
  if (liste.length === 1) return { statut: "ok", formule: liste[0] };   /* une seule formule : c'est elle (le résumé la nomme, la personne peut annuler) */
  const n = norm(texte);
  if (!n) return { statut: "manquante", choix: noms };
  const exact = liste.filter(f => norm(f.nom) === n);
  if (exact.length === 1) return { statut: "ok", formule: exact[0] };
  const proche = liste.filter(f => { const m = norm(f.nom); return m && (m.includes(n) || n.includes(m)); });
  if (proche.length === 1) return { statut: "ok", formule: proche[0] };
  return { statut: proche.length > 1 ? "ambigue" : "inconnue", choix: noms };
}

/* Ce qu'il manque encore pour pouvoir proposer l'ajout. formuleRes = résultat de choisirFormule. */
function manquants(champs, formuleRes) {
  const m = [];
  if (!champs.nom) m.push({ cle: "nom", libelle: "le nom de l'adhérent" });
  if (!formuleRes || formuleRes.statut !== "ok") m.push({ cle: "formule", libelle: "la formule d'adhésion" });
  if ((champs.duree_valeur || champs.date_fin) && !champs.date_adhesion) m.push({ cle: "date_adhesion", libelle: "la date de début de l'adhésion" });
  return m;
}

/* Corps de la requête envoyée à la route habituelle du formulaire « Ajouter un adhérent ». */
function corps(champs, formuleId) {
  const c = {
    formule_id: Number(formuleId), nom: champs.nom, prenom: champs.prenom || null, email: champs.email || null, telephone: champs.telephone || null,
    adresse: champs.adresse || null, pays: champs.pays || null, ville: champs.ville || null, observations: champs.observations || null,
  };
  if (champs.date_adhesion) {
    c.date_adhesion = champs.date_adhesion;
    if (champs.date_fin) { c.mode_validite = "collectif"; c.periode_collective_fin = champs.date_fin; }
    else if (champs.duree_valeur) { c.mode_validite = "individuel"; c.duree_valeur = champs.duree_valeur; c.duree_unite = champs.duree_unite; }
  }
  return c;
}

const nomComplet = c => [c.prenom, c.nom].filter(Boolean).join(" ");

/* Résumé écrit par le serveur, montré AVANT toute exécution. doublons = [{ nom, prenom }] (fiches déjà présentes avec le même e-mail ou le même nom). */
function resume(champs, formule, doublons) {
  const l = ["Je m'apprête à ajouter cet adhérent à votre registre :", `• Nom : ${nomComplet(champs)}`, `• Formule d'adhésion : ${formule.nom}`];
  if (champs.email) l.push(`• E-mail : ${champs.email}`);
  if (champs.telephone) l.push(`• Téléphone : ${champs.telephone}`);
  const lieu = [champs.adresse, champs.ville, champs.pays].filter(Boolean).join(", ");
  if (lieu) l.push(`• Adresse : ${lieu}`);
  if (champs.observations) l.push(`• Observations : ${champs.observations}`);
  if (champs.date_adhesion && champs.date_fin) l.push(`• Adhésion : du ${dateLongue(champs.date_adhesion)} au ${dateLongue(champs.date_fin)} (fiche « à jour »)`);
  else if (champs.date_adhesion && champs.duree_valeur) l.push(`• Adhésion : à partir du ${dateLongue(champs.date_adhesion)}, pour ${champs.duree_valeur} ${LIB_UNITE[champs.duree_unite]} (fiche « à jour »)`);
  else if (champs.date_adhesion) l.push(`• Adhésion : à partir du ${dateLongue(champs.date_adhesion)}, sans date de fin (fiche « à jour »)`);
  else l.push("• Adhésion : aucune date donnée, la fiche sera « en attente »");
  (Array.isArray(doublons) ? doublons : []).slice(0, 2).forEach(d => l.push(`⚠️ Une fiche existe déjà à ce nom ou avec cet e-mail (${nomComplet(d) || "sans nom"}). Confirmez seulement s'il s'agit bien d'une autre personne.`));
  l.push("Aucun paiement n'est enregistré et aucun message n'est envoyé à cette personne.");
  l.push("Confirmez-vous ? Touchez « Oui, ajouter », ou répondez « oui » ici.");
  return l.join("\n");
}

/* Réponse tapée dans la conversation à une action en attente : "oui", "non" ou null (autre message : l'action en attente est abandonnée). */
function ouiNon(texte) {
  const t = norm(texte);
  if (!t || t.length > 50) return null;
  /* Le message ne doit être QUE l'accord (ou le refus), éventuellement suivi de politesses : « oui mais l'e-mail est faux » n'est pas un « oui » (c'est une correction, traitée par le modèle). */
  const politesse = "(?: (?:merci|svp|s il vous plait|s il te plait|ajoute|ajoutez|vas y|allez y|c est bon|je confirme|confirme|bien sur|tout a fait|parfait))*";
  if (new RegExp("^(?:oui|ok|okay|d accord|yes|vas y|allez y|go|confirme|je confirme|c est bon|c est ok|tout a fait|parfait)" + politesse + "$").test(t)) return "oui";
  if (new RegExp("^(?:non|annule|annuler|stop|laisse tomber|abandonne|pas maintenant|nope)(?: (?:merci|svp|finalement|laisse tomber|annule))*$").test(t)) return "non";
  return null;
}

module.exports = { UNITES, MAX_PAR_JOUR, validerAdherent, choisirFormule, manquants, corps, resume, ouiNon, nomComplet, norm };

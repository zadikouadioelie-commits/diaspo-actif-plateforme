/* ═════════════════════════════════════════════════
   server/kofi-evenements-flash.js — KOFFI CRÉE UN ÉVÉNEMENT FLASH (2026-11-01)

   Dans l'onglet Événements, une personne dit à Koffi « fais-moi un événement flash » ; Koffi pose les questions qui manquent (titre, date, lieu, description, image…),
   rédige la description et prépare un BROUILLON. La publication, elle, passe par la route habituelle POST /api/evenements (mêmes droits, même Premium, mêmes notifications
   aux abonnés) et n'a lieu que sur confirmation de la personne : bouton « Publier » ou « oui » à un brouillon complet qu'elle a vu.
   Règles (toutes appliquées ICI et dans kofi-evenements.js, jamais par le modèle) :
   - Le modèle ne publie rien : il remplit un brouillon (JSON) que ce fichier REVALIDE champ par champ (longueurs, dates, heures, adresses web, listes fermées).
   - Le modèle ne voit jamais l'image ni son adresse : l'image est envoyée par la personne, enregistrée sur le CDN par le serveur, et rattachée au brouillon par le serveur.
   - Réservé aux comptes autorisés à publier un événement (Initiative, Collectivité, Administrateur) et, comme ailleurs, à l'abonnement Premium.
   ═════════════════════════════════════════════════ */
"use strict";

const ROLES_PUBLICATION = ["initiative", "collectivite", "administrateur"];
const TYPES = ["evenement", "forum", "atelier", "webinaire", "conference", "gala", "marche", "networking", "debat", "concours", "autre"];
const LIB_TYPE = { evenement: "Événement", forum: "Forum", atelier: "Atelier", webinaire: "Webinaire", conference: "Conférence", gala: "Gala / Soirée", marche: "Marché / Foire", networking: "Networking", debat: "Débat", concours: "Concours", autre: "Autre" };
const DOMAINES = ["Entrepreneuriat", "Formation", "Culture", "Sante", "Agriculture", "Technologie", "Sport", "Action Sociale", "Business", "Diaspora", "Gastronomie", "Economique", "Politique", "Panafricanisme", "Autre"];
const VISIBILITES = ["both", "public", "boutique"];
const LIB_VISIBILITE = { both: "Visible dans le calendrier public et sur votre boutique", public: "Visible dans le calendrier public uniquement", boutique: "Visible uniquement sur votre boutique" };
const MAX_DESCRIPTION = 500;
const HORIZON_JOURS = 548;
const MAX_JOURS_PROGRAMME = 7, MAX_ETAPES = 12;

const nettoyer = s => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\r\n/g, "\n").trim();
const court = (s, max) => nettoyer(s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
const z = n => String(n).padStart(2, "0");
const dateUTC = ymd => new Date(ymd + "T00:00:00Z");
const versYmd = d => `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
const addJours = (ymd, n) => { const d = dateUTC(ymd); d.setUTCDate(d.getUTCDate() + n); return versYmd(d); };
const ymdValide = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && versYmd(dateUTC(s)) === s;
const dateLongueAn = ymd => new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(dateUTC(ymd));

function heure(v) {
  const t = String(v == null ? "" : v).trim().toLowerCase();
  const m = /^([01]?\d|2[0-3])\s*(?::|h)\s*([0-5]\d)?$/.exec(t);
  return m ? `${z(m[1])}:${m[2] || "00"}` : "";
}
/* Adresse web : sans schéma → https:// ; seuls http et https ; un point obligatoire dans le nom de domaine (même règle que le « Plus d'informations » des événements). */
function adresseWeb(v) {
  let t = nettoyer(v).replace(/\s+/g, "");
  if (!t) return "";
  if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) t = "https://" + t.replace(/^\/+/, "");
  if (t.length > 500) return "";
  try { const u = new URL(t); return (u.protocol === "http:" || u.protocol === "https:") && u.hostname.includes(".") ? u.toString() : ""; } catch (_) { return ""; }
}
const sansBalises = s => nettoyer(s).replace(/<[^>]*>/g, "").replace(/\n{3,}/g, "\n\n");
const choixListe = (v, liste, defaut) => { const t = String(v == null ? "" : v).trim().toLowerCase(); const x = liste.find(l => l.toLowerCase() === t); return x || defaut; };

function validerProgramme(p) {
  if (!Array.isArray(p)) return [];
  return p.slice(0, MAX_JOURS_PROGRAMME).map(j => {
    j = j && typeof j === "object" ? j : {};
    const etapes = (Array.isArray(j.etapes) ? j.etapes : []).slice(0, MAX_ETAPES).map(e => { e = e && typeof e === "object" ? e : {}; return { titre: court(e.titre, 80), heure_debut: heure(e.heure_debut), heure_fin: heure(e.heure_fin) }; }).filter(e => e.titre);
    const debut = ymdValide(j.date_debut) ? j.date_debut : "", fin = ymdValide(j.date_fin) && j.date_fin >= debut ? j.date_fin : "";
    return { date_debut: debut, date_fin: fin, etapes };
  }).filter(j => j.date_debut || j.date_fin || j.etapes.length);
}

/* Brouillon : tout ce que le modèle a le droit de remplir, revalidé ici. `auj` = AAAA-MM-JJ (Paris). Renvoie { champs, problemes }. */
function validerBrouillon(b, auj) {
  b = b && typeof b === "object" ? b : {};
  const problemes = [];
  let date_evt = ymdValide(b.date_evt) ? b.date_evt : "";
  if (date_evt && date_evt < auj) { problemes.push("date_passee"); date_evt = ""; }
  else if (date_evt && date_evt > addJours(auj, HORIZON_JOURS)) { problemes.push("date_lointaine"); date_evt = ""; }
  const date_fin = date_evt && ymdValide(b.date_fin) && b.date_fin > date_evt && b.date_fin <= addJours(date_evt, 60) ? b.date_fin : "";
  const en_ligne = b.en_ligne === true;
  const heure_debut = heure(b.heure_debut);
  let heure_fin = heure(b.heure_fin);
  if (heure_fin && heure_debut && !date_fin && heure_fin < heure_debut) { heure_fin = ""; problemes.push("heure_fin_avant_debut"); }
  const champs = {
    titre: court(b.titre, 120), date_evt, date_fin, heure_debut, heure_fin, en_ligne,
    lieu: court(b.lieu, 200), ville: court(b.ville, 60), pays: court(b.pays, 60), lien_visio: adresseWeb(b.lien_visio),
    type_evt: choixListe(b.type_evt, TYPES, "evenement"), domaine: choixListe(b.domaine, DOMAINES, ""),
    public_concerne: court(b.public_concerne, 100), description: sansBalises(b.description).slice(0, MAX_DESCRIPTION),
    lien_plus_info: adresseWeb(b.lien_plus_info), organisateur_externe_nom: court(b.organisateur_externe_nom, 80),
    insc_rapide: b.insc_rapide === true, visibilite: choixListe(b.visibilite, VISIBILITES, "both"),
    image_choix: b.image_choix === "sans" ? "sans" : b.image_choix === "avec" ? "avec" : "",
    image_url: /^(https:\/\/|\/(?!\/))/.test(String(b.image_url || "")) ? String(b.image_url).slice(0, 500) : "",
    programme: validerProgramme(b.programme),
  };
  if (champs.image_url) champs.image_choix = "avec"; else if (champs.image_choix === "avec") champs.image_choix = "";
  return { champs, problemes };
}

/* Ce qui manque encore pour pouvoir publier (libellés au féminin/masculin déjà accordés, prêts à être dits). */
function manquants(c) {
  const m = [];
  if (!c.titre) m.push({ cle: "titre", libelle: "le titre" });
  if (!c.date_evt) m.push({ cle: "date", libelle: "la date" });
  if (!c.en_ligne) {
    if (!c.lieu) m.push({ cle: "lieu", libelle: "l'adresse du lieu" });
    if (!c.ville || !c.pays) m.push({ cle: "ville", libelle: "la ville et le pays" });
  }
  if (!c.description) m.push({ cle: "description", libelle: "la description" });
  if (!c.image_url && c.image_choix !== "sans") m.push({ cle: "image", libelle: "l'image (ou « sans image »)" });
  return m;
}

/* Deux brouillons identiques (pour savoir si « oui » confirme bien ce que la personne a vu). */
function memeBrouillon(a, b) {
  const cle = c => JSON.stringify(Object.keys(c).sort().map(k => [k, c[k]]));
  return cle(a) === cle(b);
}

function quand(c) {
  if (!c.date_evt) return "";
  const h = c.heure_debut ? ` à ${Number(c.heure_debut.slice(0, 2))} h ${c.heure_debut.slice(3)}` : "";
  const hf = c.heure_fin ? ` jusqu'à ${Number(c.heure_fin.slice(0, 2))} h ${c.heure_fin.slice(3)}` : "";
  if (c.date_fin) return `du ${dateLongueAn(c.date_evt)} au ${dateLongueAn(c.date_fin)}`;
  return dateLongueAn(c.date_evt) + h + hf;
}
/* Ce que le widget affiche : l'aperçu du brouillon. */
function vue(c, manq) {
  manq = manq || manquants(c);
  const nbEtapes = c.programme.reduce((n, j) => n + j.etapes.length, 0);
  return {
    titre: c.titre, quand: quand(c), type: LIB_TYPE[c.type_evt] || "", domaine: c.domaine,
    lieu: c.en_ligne ? "En ligne" + (c.lien_visio ? " (lien de visioconférence renseigné)" : "") : [c.lieu, [c.ville, c.pays].filter(Boolean).join(", ")].filter(Boolean).join(" · "),
    public_concerne: c.public_concerne, description: c.description, lien_plus_info: c.lien_plus_info, organisateur: c.organisateur_externe_nom,
    image_url: c.image_url || "", visibilite: LIB_VISIBILITE[c.visibilite] || "",
    inscription: c.insc_rapide ? "Inscription rapide activée : les personnes confirment leur venue." : "Événement informatif : aucune inscription proposée.",
    programme: c.programme.length ? `${c.programme.length} journée${c.programme.length > 1 ? "s" : ""}, ${nbEtapes} étape${nbEtapes > 1 ? "s" : ""}` : "",
    manquants: manq.map(x => x.libelle), pret: manq.length === 0,
  };
}

/* Corps de POST /api/evenements — le même que le parcours « ⚡ Événement flash » de l'appli téléphone. */
function corpsPublication(c) {
  const corps = {
    titre: c.titre, date_evt: c.date_evt, date_fin: c.date_fin || null, heure_debut: c.heure_debut || null, heure_fin: c.heure_fin || null,
    pays: c.pays || null, ville: c.ville || null, lieu: c.en_ligne ? null : (c.lieu || c.ville || null), lien_visio: c.lien_visio || null,
    description: c.description, public_concerne: c.public_concerne || null, type_evt: c.type_evt, domaine: c.domaine || null,
    statut: "ouvert", inscription_ouverte: false, appliquer_fiche_standard: false,
    visibilite: c.visibilite === "boutique" ? "boutique" : "public", masquer_boutique: c.visibilite === "public",
    image_couverture: c.image_url || null, galerie_photos: [],
    organisateur_externe_nom: c.organisateur_externe_nom || null, lien_plus_info: c.lien_plus_info || null,
    programme: c.programme, inscription_rapide_active: !!c.insc_rapide,
  };
  if (c.en_ligne && !c.lieu) corps.mode_participation = "distanciel";
  return corps;
}

/* Les règles du prompt système propres à la création (ajoutées par systemePour de kofi-evenements.js). */
const REGLES_PROMPT = [
  "CRÉER UN ÉVÉNEMENT FLASH (annonce informative, sans fiche d'inscription) :",
  "F1. Si <droits> indique publier_evenement_flash: non, tu ne peux pas créer d'événement : réponds avec « repondre » en expliquant que seuls les comptes Initiative, Collectivité et Administrateur, avec abonnement Premium, publient des événements, et propose de chercher des événements à la place. Si <droits> indique oui, tu peux le faire.",
  "F2. Dès que la personne veut créer, publier, poster ou annoncer un événement (« fais-moi un événement flash », « poste mon concert de samedi », « annonce ma conférence »), passe en action « flash », même avec très peu d'éléments. Remplis dans \"brouillon\" tout ce que tu peux déduire de ses phrases, et renvoie TOUJOURS le brouillon COMPLET (tous les champs connus), pas seulement ce qui change. Pour effacer un champ, mets-le à \"\".",
  "F3. Pose UNE seule question à la fois, la plus utile, en tenant compte de <etat_brouillon>. Il faut au minimum : le titre, la date (jour ; propose l'heure), le lieu (adresse, ville, pays) ou « en ligne », la description, et l'image. Ne redemande jamais ce que la personne a déjà dit, ni ce que tu peux déduire ou proposer toi-même (type d'événement, domaine, public concerné).",
  "F4. DESCRIPTION : rédige-la toi-même à partir de ses réponses (français clair et chaleureux, 2 à 4 phrases, 500 caractères au plus, texte simple sans mise en forme) et fais-la valider. N'invente AUCUN fait : ni prix, ni intervenant, ni adresse, ni heure. Si une information manque, demande-la.",
  "F5. IMAGE : demande à la personne de joindre une image avec le bouton trombone du bas de la fenêtre. Elle peut aussi dire qu'elle n'en veut pas : mets alors \"image_choix\":\"sans\". Quand <image_recue>oui</image_recue> apparaît, l'image est bien enregistrée (tu ne la vois pas) : passe à la suite, sans toucher à image_choix.",
  "F6. FACULTATIF (ne le demande pas un par un : propose-le en une phrase quand le reste est prêt, ou prends-le si la personne le dit) : heure de fin, date de fin, public concerné, lien « Plus d'informations », organisateur si ce n'est pas elle (\"organisateur_externe_nom\"), programme, inscription rapide (\"insc_rapide\": les personnes confirment leur venue), visibilité (\"both\" calendrier public + boutique, \"public\", \"boutique\").",
  "F7. DATES : tu reçois la date du jour. « samedi » = le prochain samedi ; « mardi 15 décembre » = la prochaine fois que le 15 décembre tombe un mardi. Écris les dates au format AAAA-MM-JJ et les heures HH:MM. Une date passée est refusée par le serveur.",
  "F8. QUAND TOUT EST PRÊT (<etat_brouillon> pret: true) : résume en une ou deux phrases et demande à la personne de confirmer ; le serveur affiche l'aperçu et le bouton « Publier ». Mets \"confirme\":true UNIQUEMENT si <etat_brouillon> pret est true et que la personne vient de répondre oui / ok / publie / vas-y SANS rien changer ; dès qu'elle modifie quelque chose, \"confirme\":false. Tu ne dis JAMAIS que c'est publié : c'est le serveur qui l'annonce.",
  "F9. Si la personne renonce (« laisse tomber », « annule »), réponds avec l'action \"abandonner\" et un court message.",
];

module.exports = { ROLES_PUBLICATION, TYPES, DOMAINES, VISIBILITES, MAX_DESCRIPTION, REGLES_PROMPT, validerBrouillon, manquants, memeBrouillon, vue, corpsPublication, quand, heure, adresseWeb };

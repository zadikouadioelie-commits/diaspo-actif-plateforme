/* ═════════════════════════════════════════════════
   server/kofi-publication.js — KOFFI RÉDIGE ET PUBLIE (OU PROGRAMME) UNE PUBLICATION DU FIL (2026-11-01)

   Dans l'onglet Événements, une personne dit à Koffi « écris une publication sur… et programme-la demain à 9 h » ; Koffi pose les questions qui manquent, rédige le texte et prépare un
   BROUILLON. La mise en ligne passe par la route habituelle POST /api/fil, avec la session de la personne : mêmes droits, mêmes limites (par exemple une seule photo pour un compte
   Utilisateur), mêmes notifications. Elle n'a lieu que sur confirmation de la personne : bouton « Publier » / « Programmer », ou « oui » à un brouillon complet qu'elle a vu.
   Règles (appliquées ICI et dans kofi-evenements.js, jamais par le modèle) :
   - Koffi ne fait jamais plus que la personne ne pourrait faire elle-même : tout compte peut publier sur le fil, rien d'autre n'est ouvert (voir kofi-interdits.js).
   - Le modèle remplit un brouillon (JSON) que ce fichier REVALIDE champ par champ (longueurs, listes fermées, dates, heures).
   - Le modèle ne voit jamais l'image ni son adresse : l'image est envoyée par la personne, enregistrée sur le CDN par le serveur et rattachée au brouillon par le serveur.
   - Publication programmée : la plateforme ne peut pas publier à la seconde près (voir server/fil-programmes.js). Koffi PRÉVIENT toujours que l'heure est approximative (AVERTISSEMENT,
     ajouté par le serveur à chaque brouillon programmé) et ne programme qu'après l'accord de la personne.
   ═════════════════════════════════════════════════ */
"use strict";

const CATEGORIES = ["Actualité", "Projet", "Investissement", "Emploi", "Formation", "Événement", "Succès", "Témoignage", "Appel à bénévoles", "Culture", "Diaspora", "Innovation", "Autre"];
const VISIBILITES = ["public", "membres", "abonnes", "prive"];
const LIB_VISIBILITE = { public: "Public (tout le monde)", membres: "Membres de Diaspo'Actif", abonnes: "Mes abonnés", prive: "Privé (vous seul·e)" };
const MAX_TEXTE = 1500;
const MARGE_MINUTES = 5;        /* une publication programmée doit l'être au moins 5 minutes à l'avance */
const HORIZON_JOURS = 90;

const AVERTISSEMENT = "⏰ Important : l'heure sera approximative. Je ne peux pas publier à la seconde près : votre publication sera mise en ligne dès que possible après l'heure choisie (en général dans les minutes qui suivent, parfois un peu plus tard), mais jamais avant. Si l'heure exacte est indispensable, publiez-la vous-même à ce moment-là.";

const nettoyer = s => String(s == null ? "" : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/\r\n/g, "\n").trim();
const court = (s, max) => nettoyer(s).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, max);
/* Texte de la publication : on garde les retours à la ligne, on retire les balises et les mentions « @[Nom](u:1) » (Koffi ne mentionne personne). */
const texteLong = (s, max) => nettoyer(s).replace(/<[^>]*>/g, "").replace(/@\[([^\]]*)\]\([ui]:\d+\)/g, "$1").replace(/@\[/g, "@").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, max);
const z = n => String(n).padStart(2, "0");
const dateUTC = ymd => new Date(ymd + "T00:00:00Z");
const versYmd = d => `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
const ymdValide = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && versYmd(dateUTC(s)) === s;

function heure(v) {
  const t = String(v == null ? "" : v).trim().toLowerCase();
  const m = /^([01]?\d|2[0-3])\s*(?::|h)\s*([0-5]\d)?$/.exec(t);
  return m ? `${z(m[1])}:${m[2] || "00"}` : "";
}

/* ── Heure de Paris ⇄ UTC (même règle que les autres Koffi : toutes les heures dites à Koffi sont des heures de Paris) ── */
const FMT_PARIS = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function partiesParis(ms) { const o = {}; FMT_PARIS.formatToParts(new Date(ms)).forEach(p => { o[p.type] = Number(p.value); }); return o; }
const decalageParis = ms => { const p = partiesParis(ms); return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000; };
/* AAAA-MM-JJ + HH:MM (Paris) → Date UTC, ou null (heure inexistante, par exemple lors du passage à l'heure d'été). */
function parisVersDate(ymd, hhmm) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd), h = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m || !h) return null;
  const naif = Date.UTC(+m[1], +m[2] - 1, +m[3], +h[1], +h[2]);
  let ms = naif - decalageParis(naif);
  ms = naif - decalageParis(ms);
  const p = partiesParis(ms);
  if (p.year !== +m[1] || p.month !== +m[2] || p.day !== +m[3] || p.hour !== +h[1] || p.minute !== +h[2]) return null;
  return new Date(ms);
}
const dateLongue = d => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);
const heureLongue = d => { const p = partiesParis(d.getTime()); return `${p.hour} h ${z(p.minute)}`; };

/* Brouillon : tout ce que le modèle a le droit de remplir, revalidé ici. `maintenant` = ms. Renvoie { champs, problemes }. */
function validerBrouillon(b, maintenant) {
  b = b && typeof b === "object" ? b : {};
  maintenant = maintenant == null ? Date.now() : maintenant;
  const problemes = [];
  let mode = b.mode === "programme" ? "programme" : b.mode === "maintenant" ? "maintenant" : "";
  let date = ymdValide(b.date) ? b.date : "", hh = heure(b.heure);
  if (mode === "maintenant") { date = ""; hh = ""; }
  if (mode === "programme" && date && hh) {
    const dt = parisVersDate(date, hh);
    if (!dt) { problemes.push("heure_inexistante"); hh = ""; }
    else if (dt.getTime() < maintenant + MARGE_MINUTES * 60000) { problemes.push("date_passee"); date = ""; hh = ""; }
    else if (dt.getTime() > maintenant + HORIZON_JOURS * 86400000) { problemes.push("date_lointaine"); date = ""; hh = ""; }
  }
  const champs = {
    texte: texteLong(b.texte, MAX_TEXTE), titre: court(b.titre, 120),
    categorie: CATEGORIES.includes(b.categorie) ? b.categorie : "Actualité",
    visibilite: VISIBILITES.includes(b.visibilite) ? b.visibilite : "public",
    mode, date, heure: hh,
    image_choix: b.image_choix === "sans" ? "sans" : b.image_choix === "avec" ? "avec" : "",
    image_url: /^(https:\/\/|\/(?!\/))/.test(String(b.image_url || "")) ? String(b.image_url).slice(0, 500) : "",
  };
  if (champs.image_url) champs.image_choix = "avec"; else if (champs.image_choix === "avec") champs.image_choix = "";
  return { champs, problemes };
}

/* Ce qui manque encore pour pouvoir publier ou programmer. */
function manquants(c) {
  const m = [];
  if (!c.texte) m.push({ cle: "texte", libelle: "le texte de la publication" });
  if (!c.mode) m.push({ cle: "mode", libelle: "le moment (tout de suite, ou le jour et l'heure)" });
  else if (c.mode === "programme") {
    if (!c.date) m.push({ cle: "date", libelle: "le jour de publication" });
    if (!c.heure) m.push({ cle: "heure", libelle: "l'heure de publication (heure de Paris)" });
  }
  if (!c.image_url && c.image_choix !== "sans") m.push({ cle: "image", libelle: "l'image (ou « sans image »)" });
  return m;
}

/* Deux brouillons identiques (pour savoir si « oui » confirme bien ce que la personne a vu). */
function memeBrouillon(a, b) {
  const cle = c => JSON.stringify(Object.keys(c).sort().map(k => [k, c[k]]));
  return cle(a) === cle(b);
}

/* Date de publication prévue (Date UTC) d'un brouillon programmé, ou null. */
const dateProgrammee = c => (c && c.mode === "programme" && c.date && c.heure ? parisVersDate(c.date, c.heure) : null);
const quand = c => {
  if (c.mode === "maintenant") return "Tout de suite";
  const d = dateProgrammee(c);
  return d ? `${dateLongue(d)} à ${heureLongue(d)} (heure de Paris)` : "";
};

/* Ce que le widget affiche : l'aperçu du brouillon. `type` permet au widget de le distinguer de l'événement flash. */
function vue(c, manq) {
  manq = manq || manquants(c);
  return {
    type: "publication", titre: c.titre, texte: c.texte, categorie: c.categorie, visibilite: LIB_VISIBILITE[c.visibilite] || "",
    quand: quand(c), avertissement: c.mode === "programme" ? AVERTISSEMENT : "", image_url: c.image_url || "",
    manquants: manq.map(x => x.libelle), pret: manq.length === 0, bouton: c.mode === "programme" ? "Programmer" : "Publier",
  };
}

/* Corps de POST /api/fil — le même que celui de la fenêtre « Publier » du fil (assets/posts.js). */
function corpsPublication(c) {
  const dt = dateProgrammee(c);
  return {
    contenu: c.texte, titre: c.titre || "", categorie: c.categorie, visibilite: c.visibilite,
    medias: JSON.stringify(c.image_url ? [{ type: "image", url: c.image_url }] : []),
    statut: dt ? "programme" : "publie", programmed_at: dt ? dt.toISOString() : null,
  };
}

/* Les règles du prompt système propres aux publications (ajoutées par systemePour de kofi-evenements.js). */
const REGLES_PROMPT = [
  "ÉCRIRE ET PUBLIER (OU PROGRAMMER) UNE PUBLICATION DU FIL D'ACTUALITÉ :",
  "P1. Dès que la personne veut écrire, rédiger, poster, publier ou programmer une publication, un post, un message pour son fil (« écris une publication sur… », « poste ça demain à 9 h »), passe en action « publication ». Tout compte peut publier : <droits> contient publier_sur_le_fil: oui.",
  "P2. Pose UNE seule question à la fois, la plus utile, en tenant compte de <etat_brouillon>. Il faut : le sujet ou le texte, le MOMENT (tout de suite ou un jour et une heure précis) et l'image (ou « sans image »). Ne redemande jamais ce qui est déjà dans le brouillon.",
  "P3. TEXTE : rédige-le toi-même à partir de ses réponses (français clair, chaleureux, 1 500 caractères au plus, hashtags autorisés) et fais-le valider. N'invente AUCUN fait (prix, date, nom, chiffre, adresse). Ne mentionne personne avec @. Si la personne te donne son texte, reprends-le tel quel.",
  "P4. MOMENT : \"mode\" vaut \"maintenant\" (publier tout de suite) ou \"programme\" (jour et heure à préciser dans \"date\" AAAA-MM-JJ et \"heure\" HH:MM, heure de Paris). Tu reçois la date et l'heure actuelles à Paris : « demain » = le lendemain, « lundi » = le prochain lundi. Si la personne ne dit pas quand, demande-le : ne choisis jamais « maintenant » à sa place.",
  "P5. HEURE APPROXIMATIVE (obligatoire) : pour une publication programmée, tu ne peux pas garantir l'heure exacte. Le serveur ajoute lui-même l'avertissement à l'aperçu ; ne promets JAMAIS une heure à la seconde ou à la minute près, dis plutôt « vers 9 h ». Ne demande pas à la personne de confirmer tant que l'aperçu n'a pas été affiché.",
  "P6. IMAGE : demande à la personne de joindre l'image avec le bouton trombone du bas de la fenêtre, ou de dire qu'elle n'en veut pas (\"image_choix\":\"sans\"). Quand <image_recue>oui</image_recue> apparaît, l'image est bien reçue : ne la redemande pas. Tu ne vois jamais l'image.",
  "P7. FACULTATIF : \"titre\" (court), \"categorie\" (l'une des catégories du fil : " + CATEGORIES.join(", ") + "), \"visibilite\" (public, membres, abonnes, prive ; public par défaut). Ne les demande pas un par un : prends-les si la personne les dit.",
  "P8. QUAND TOUT EST PRÊT (<etat_brouillon> pret: true) : résume en une phrase et demande à la personne de confirmer ; le serveur affiche l'aperçu et le bouton « Publier » ou « Programmer ». Mets \"confirme\":true UNIQUEMENT si <etat_brouillon> pret est vrai ET que la personne vient d'accepter explicitement cet aperçu (« oui », « publie », « programme-la »). Tu ne publies rien toi-même : c'est le serveur qui le fait, avec les droits de la personne.",
  "P9. Tu ne fais que ce que la personne pourrait faire elle-même sur le fil : tu ne publies pas au nom d'un autre compte, tu ne supprimes ni ne modifies aucune publication existante.",
];

module.exports = { CATEGORIES, VISIBILITES, MAX_TEXTE, MARGE_MINUTES, HORIZON_JOURS, AVERTISSEMENT, REGLES_PROMPT, validerBrouillon, manquants, memeBrouillon, vue, corpsPublication, quand, dateProgrammee, parisVersDate, heure };

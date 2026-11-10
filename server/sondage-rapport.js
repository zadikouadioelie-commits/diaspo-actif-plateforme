"use strict";
/* ===========================================================
   server/sondage-rapport.js — RAPPORT DE RÉSULTATS D'UN SONDAGE (2026-11-10)
   ===========================================================
   Agrégats ANONYMES destinés à être montrés à des tiers (autorités, partenaires, financeurs) : effectifs et pourcentages par question,
   évolution des réponses par jour, réponses libres nettoyées. Rien d'identifiant n'en sort : ni nom, ni e-mail, ni téléphone, ni identifiant de
   compte, ni date précise attachée à une réponse libre. Les informations demandées aux répondants (nom, e-mail…) ne sont JAMAIS lues ici.
   Règles de protection :
   - une réponse libre n'est citée que si la question a reçu au moins SEUIL_VERBATIMS réponses (en dessous, une citation pourrait désigner quelqu'un) ;
   - e-mails, adresses de sites et numéros de téléphone écrits dans une réponse libre sont remplacés par [e-mail], [lien], [numéro] ;
   - chaque question porte son effectif : sous SEUIL_EFFECTIF_FAIBLE réponses, le rapport la signale comme indicative.
   Le calcul est pur (aucune écriture) ; la route qui l'appelle réserve le rapport au créateur du sondage et à l'administrateur.
   =========================================================== */
const SEUIL_VERBATIMS = 5;
const SEUIL_EFFECTIF_FAIBLE = 5;
const MAX_VERBATIMS = 40;

const lire = v => { try { return JSON.parse(v); } catch (_) { return v; } };
const arrondi = (x, d) => { const f = Math.pow(10, d === undefined ? 1 : d); return Math.round(x * f) / f; };
const pct = (n, base) => (base > 0 ? arrondi((n / base) * 100, 1) : 0);
const mediane = tab => { if (!tab.length) return null; const t = [...tab].sort((a, b) => a - b), m = Math.floor(t.length / 2); return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2; };
const moyenne = tab => (tab.length ? tab.reduce((a, b) => a + b, 0) / tab.length : null);

/* Retire ce qui pourrait identifier quelqu'un dans un texte libre. */
function masquer(texte) {
  return String(texte == null ? "" : texte)
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[e-mail]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[lien]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[numéro]")
    .replace(/\s+/g, " ").trim().slice(0, 400);
}

const ECHELLES = { echelle_5: 5, etoiles: 5, echelle_10: 10 };
const LIBELLE_OUINON = { oui: "Oui", non: "Non" };

function agregerQuestion(q, lignes, nbRepondants) {
  let options = []; const brut = lire(q.options_json || "[]"); if (Array.isArray(brut)) options = brut.map(String);
  const n = lignes.length;
  const sortie = {
    id: Number(q.id), ordre: Number(q.ordre) || 0, texte: String(q.texte || ""), description: q.description || "", type: q.type,
    obligatoire: !(q.obligatoire === 0 || q.obligatoire === false || q.obligatoire === "0"),
    n, taux_reponse: pct(n, nbRepondants), effectif_faible: n > 0 && n < SEUIL_EFFECTIF_FAIBLE,
  };
  const valeurs = lignes.map(l => lire(l.reponse));
  if (q.type === "choix_unique" || q.type === "oui_non" || q.type === "choix_multiple") {
    const multiple = q.type === "choix_multiple";
    const ordre = q.type === "oui_non" ? ["Oui", "Non"] : options.slice();
    const compte = new Map(ordre.map(o => [o, 0]));
    for (const v of valeurs) {
      const liste = multiple ? (Array.isArray(v) ? v : [v]) : [v];
      for (let x of liste) {
        x = String(x == null ? "" : x).trim(); if (!x) continue;
        if (q.type === "oui_non") x = LIBELLE_OUINON[x.toLowerCase()] || x;
        compte.set(x, (compte.get(x) || 0) + 1);
      }
    }
    sortie.famille = multiple ? "multiple" : "choix";
    sortie.modalites = [...compte.entries()].map(([libelle, c]) => ({ libelle: masquer(libelle), n: c, pct: pct(c, n) }));
    return sortie;
  }
  if (ECHELLES[q.type]) {
    const max = ECHELLES[q.type];
    const nums = valeurs.map(Number).filter(x => Number.isFinite(x) && x >= 1 && x <= max);
    const compte = Array.from({ length: max }, () => 0); nums.forEach(x => { compte[Math.round(x) - 1]++; });
    sortie.famille = "echelle"; sortie.max = max; sortie.min_label = q.min_label || ""; sortie.max_label = q.max_label || "";
    sortie.modalites = compte.map((c, i) => ({ libelle: String(i + 1), n: c, pct: pct(c, nums.length) }));
    sortie.stats = { moyenne: nums.length ? arrondi(moyenne(nums), 2) : null, mediane: nums.length ? mediane(nums) : null };
    return sortie;
  }
  if (q.type === "nombre") {
    const nums = valeurs.map(Number).filter(Number.isFinite);
    sortie.famille = "nombre";
    sortie.stats = nums.length ? { moyenne: arrondi(moyenne(nums), 2), mediane: mediane(nums), min: Math.min(...nums), max: Math.max(...nums) } : null;
    return sortie;
  }
  if (q.type === "date") {
    const jours = valeurs.map(v => String(v || "").slice(0, 7)).filter(v => /^\d{4}-\d{2}$/.test(v));
    const compte = new Map(); jours.forEach(j => compte.set(j, (compte.get(j) || 0) + 1));
    sortie.famille = "date";
    sortie.modalites = [...compte.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([libelle, c]) => ({ libelle, n: c, pct: pct(c, jours.length) }));
    return sortie;
  }
  /* texte_libre, texte_long : citations nettoyées, seulement si la question a assez de réponses. */
  sortie.famille = "texte";
  if (n >= SEUIL_VERBATIMS) {
    const vus = new Set(); const cites = [];
    for (const v of valeurs) { const t = masquer(Array.isArray(v) ? v.join(", ") : v); const cle = t.toLowerCase(); if (t.length >= 2 && !vus.has(cle)) { vus.add(cle); cites.push(t); } }
    sortie.verbatims = cites.slice(0, MAX_VERBATIMS); sortie.verbatims_total = cites.length; sortie.verbatims_masques = false;
  } else { sortie.verbatims = []; sortie.verbatims_total = 0; sortie.verbatims_masques = n > 0; }
  return sortie;
}

/* db : l'accès base ; s : la ligne `sondages`. Renvoie le rapport complet. */
async function construire(db, s) {
  const questions = await db.prepare("SELECT * FROM sondage_questions WHERE sondage_id=? ORDER BY ordre, id").all(s.id);
  const rep = await db.prepare("SELECT question_id, user_id, reponse, repondant_id, created_at FROM sondage_reponses WHERE sondage_id=? ORDER BY id").all(s.id);
  /* Une personne = un envoi : repondant_id, à défaut le compte et la minute (anciens envois). */
  const cleDe = r => (r.repondant_id ? "r" + r.repondant_id : (r.user_id ? "u" + r.user_id : "a") + "_" + String(r.created_at || "").slice(0, 16));
  const personnes = new Map();
  for (const r of rep) { const k = cleDe(r); if (!personnes.has(k)) personnes.set(k, String(r.created_at || "").slice(0, 10)); }
  const nbRepondants = personnes.size;
  const parQuestion = new Map(); for (const r of rep) { if (!parQuestion.has(r.question_id)) parQuestion.set(r.question_id, []); parQuestion.get(r.question_id).push(r); }
  const qs = questions.map(q => agregerQuestion(q, parQuestion.get(q.id) || [], nbRepondants));
  const jours = new Map(); for (const j of personnes.values()) if (j) jours.set(j, (jours.get(j) || 0) + 1);
  const evolution = [...jours.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([jour, n]) => ({ jour, n }));
  const createur = s.createur_id ? await db.prepare("SELECT nom FROM users WHERE id=?").get(s.createur_id) : null;
  let periodes = []; try { periodes = JSON.parse(s.periodes_json || "[]"); } catch (_) { periodes = []; }
  const derniere = periodes[periodes.length - 1] || null;
  const avecReponses = qs.filter(q => q.n > 0);
  return {
    sondage: {
      id: Number(s.id), titre: s.titre, description: s.description || "", categorie: s.categorie || "autre", statut: s.statut, anonyme: !!Number(s.anonyme),
      organisateur: createur && createur.nom ? createur.nom : "", date_debut: String(s.date_debut || "").slice(0, 10), date_fin: String(s.date_cloture || "").slice(0, 10),
      nb_periodes: periodes.length, periode: derniere,
    },
    repondants: nbRepondants,
    nb_questions: qs.length,
    taux_reponse_moyen: avecReponses.length ? arrondi(avecReponses.reduce((a, q) => a + q.taux_reponse, 0) / qs.length, 1) : 0,
    premiere_reponse: evolution.length ? evolution[0].jour : null,
    derniere_reponse: evolution.length ? evolution[evolution.length - 1].jour : null,
    evolution,
    questions: qs,
    seuils: { verbatims: SEUIL_VERBATIMS, effectif_faible: SEUIL_EFFECTIF_FAIBLE },
  };
}

module.exports = { construire, masquer, SEUIL_VERBATIMS, SEUIL_EFFECTIF_FAIBLE };

/* ═════════════════════════════════════════════════
   server/kofi-sans-reponse.js — QUAND KOFFI N'A PAS L'INFORMATION (2026-11-10, texte dicté par le titulaire)
   ═════════════════════════════════════════════════
   Message unique, mot pour mot : « Pour le moment, je ne peux pas répondre à votre demande. Cependant, je remonte l'information pour que nous puissions y travailler.
   Merci pour votre compréhension. »
   Koffi ne dit « je remonte l'information » que si c'est VRAI : chaque demande restée sans réponse est versée dans la file « Questions sans réponse » de l'administration
   (table faq_sans_reponse, déjà exploitée par l'écran de l'administrateur : regroupement des questions semblables, priorité selon la fréquence, conversion en entrée de FAQ).
   Vie privée : la file ne reçoit AUCUN identifiant de compte — seulement le texte de la demande (e-mails, adresses web et numéros de téléphone effacés, 400 signes au plus),
   le type de Koffi qui l'a reçue (source) et le type de compte. Une demande qui n'a « aucun rapport avec la plateforme », un refus de sécurité ou une panne ne sont PAS versés ici.
   ═════════════════════════════════════════════════ */
"use strict";

const PHRASES = {
  fr: "Pour le moment, je ne peux pas répondre à votre demande. Cependant, je remonte l'information pour que nous puissions y travailler. Merci pour votre compréhension.",
  en: "For now, I'm unable to answer your request. However, I'm passing the information on so that we can work on it. Thank you for your understanding.",
};
/* Pour reconnaître le message (historique, drapeaux) quelle que soit la langue. */
const RECONNAIT = /je ne peux pas répondre à votre demande|i'?m unable to answer your request/i;

const phrase = (lg) => PHRASES[lg === "en" ? "en" : "fr"];

/* Langue probable d'une demande libre (navigation) : anglais seulement si le début ressemble nettement à de l'anglais ; sinon français. */
function langueDe(texte) {
  return /^\s*(what|where|how|can|could|do|does|is|are|i\b|my\b|please|show|find|help|why|when|who)\b/i.test(String(texte || "")) ? "en" : "fr";
}

function nettoyer(q) {
  return String(q || "")
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "[lien]")
    .replace(/(\+?\d[\d\s().-]{6,}\d)/g, "[numéro]")
    .replace(/\s+/g, " ").trim().slice(0, 400);
}
function normaliser(q) {
  return String(q || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function priorite(n) { return n >= 20 ? "critique" : n > 10 ? "elevee" : n >= 3 ? "moyenne" : "faible"; }

/* Verse la demande dans la file de l'administration. Ne lève JAMAIS d'erreur : la réponse faite à la personne ne dépend pas de cet enregistrement.
   Renvoie true si la demande est enregistrée (ou regroupée avec une identique), false sinon. */
async function remonter(db, { question, source, role, langue }) {
  try {
    const q = nettoyer(question);
    if (q.length < 5) return false;
    const norm = normaliser(q);
    if (!norm) return false;
    const deja = await db.prepare("SELECT id, count FROM faq_sans_reponse WHERE question_norm=? AND statut NOT IN ('resolu','ignore')").get(norm);
    if (deja) {
      const n = Number(deja.count || 1) + 1;
      await db.prepare("UPDATE faq_sans_reponse SET count=?, priorite=?, last_asked_at=datetime('now'), updated_at=datetime('now') WHERE id=?").run(n, priorite(n), deja.id);
      return true;
    }
    await db.prepare("INSERT INTO faq_sans_reponse (question, question_norm, source, compte_type, langue, priorite) VALUES (?,?,?,?,?,?)")
      .run(q, norm, String(source || "koffi").slice(0, 40), String(role || "tous").slice(0, 30), langue === "en" ? "en" : "fr", "faible");
    return true;
  } catch (e) {
    console.error("[Koffi] remontée d'une demande sans réponse impossible :", e.message);
    return false;
  }
}

module.exports = { PHRASES, RECONNAIT, phrase, langueDe, nettoyer, normaliser, priorite, remonter };

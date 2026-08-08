/* ── Transfert de gestionnaire de compte — moteur (2026-08-08) ──
   Logique pure (quota mensuel alterné, hachage de codes) séparée des routes HTTP
   (server/index.js) pour garder ce chantier volumineux isolé du fichier principal — même
   pattern que stripe-client.js/mailer.js. Cahier des charges complet dans la mémoire de
   session (project_transfert_gestionnaire.md) : protocole de transfert sécurisé en plusieurs
   étapes verrouillées, jamais de suppression de données, transaction finale atomique.

   Ce module ne connaît PAS la base de données — il expose des fonctions pures/déterministes,
   appelées par les routes dans server/index.js qui, elles, font les lectures/écritures SQL. */
const crypto = require("node:crypto");

/* ── Quota mensuel alterné ──
   Règle exacte du cahier des charges : août 2026 est le "mois de référence" à 2 tentatives
   (+ 3h minimum entre les deux). L'alternance est PERMANENTE et se calcule par la parité du
   nombre de mois écoulés depuis cette référence — jamais recalculée à partir de l'historique
   des tentatives déjà consommées (règle explicite : pas de logique "si 1 déjà utilisée alors
   2e mois = X", uniquement le calendrier réel). */
const MOIS_REFERENCE_ANNEE = 2026, MOIS_REFERENCE_MOIS = 8; // août 2026 → quota 2
const DELAI_ENTRE_TENTATIVES_MS = 3 * 60 * 60 * 1000; // 3h, uniquement les mois à quota 2

function indexMois(annee, mois) { return annee * 12 + (mois - 1); }
const INDEX_REFERENCE = indexMois(MOIS_REFERENCE_ANNEE, MOIS_REFERENCE_MOIS);

/* Retourne le quota du mois calendaire contenant `date` (UTC — le calendrier réel, jamais une
   fenêtre glissante de 30 jours, conformément à la règle §3 du cahier des charges). */
function quotaDuMois(date = new Date()) {
  const annee = date.getUTCFullYear(), mois = date.getUTCMonth() + 1;
  const diff = indexMois(annee, mois) - INDEX_REFERENCE;
  const pair = ((diff % 2) + 2) % 2 === 0; // modulo toujours positif même pour un diff négatif
  return {
    annee, mois,
    quota: pair ? 2 : 1,
    delaiEntreTentativesMs: pair ? DELAI_ENTRE_TENTATIVES_MS : null,
  };
}

/* ── Codes de vérification (e-mail ancien/nouveau) ──
   6 chiffres, générés par crypto (jamais Math.random), jamais stockés en clair — seul le
   hash SHA-256 est persisté, conformément à la règle explicite du cahier des charges. */
function genererCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}
function hashCode(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}
/* IP/user-agent : uniquement à des fins de détection complémentaire d'abus (règle §13 —
   jamais le critère principal du quota, qui reste initiative_id), donc hachées et non
   exploitées pour bloquer quoi que ce soit à elles seules. */
function hashIdentifiant(str) {
  return crypto.createHash("sha256").update(String(str || "")).digest("hex");
}

/* Formate un delta de millisecondes en "Xh Ymin" pour l'affichage du délai restant. */
function formatDureeRestante(ms) {
  if (ms <= 0) return "0 min";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60), m = totalMin % 60;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

module.exports = {
  quotaDuMois, genererCode, hashCode, hashIdentifiant, formatDureeRestante,
  indexMois, INDEX_REFERENCE, DELAI_ENTRE_TENTATIVES_MS,
};

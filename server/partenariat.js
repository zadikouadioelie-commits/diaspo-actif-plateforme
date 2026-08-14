/* ===========================================================
   DIASPO'ACTIF — Module "Partenariat" : logique pure (invitations à usage
   unique). Séparée des routes HTTP, même organisation que
   server/transfert-gestionnaire.js.

   Sécurité du lien d'invitation (cahier des charges Partie 3 + Partie 6,
   règles 1-4) :
   - Génération via crypto.randomBytes — jamais Math.random.
   - Seul le hash SHA-256 est stocké en base — jamais le token en clair
     (contrairement au reset_token de la réinitialisation de mot de passe,
     un anti-pattern connu de ce projet, volontairement non reproduit ici).
   - Expiration paresseuse à la lecture (voir chargerInvitation ci-dessous),
     même modèle que tgChargerTransfert (server/index.js, module Transfert
     de gestionnaire) et asChargerSession (module Support Pilote) : pas de
     cron dédié pour ça, juste un contrôle systématique à chaque lecture.
   =========================================================== */
const crypto = require("node:crypto");

function genererToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/* Même convention que tgMaintenant() (server/index.js) : chaîne
   "YYYY-MM-DD HH:MM:SS" (espace, pas de 'T'/'Z'), comparable lexicographi-
   quement aux colonnes datetime('now') — ne jamais faire new Date(chaîne)
   directement (réinterprétée comme heure locale, bug déjà rencontré et
   corrigé sur ce projet). */
function maintenant() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function plusJours(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

/* Charge une invitation en appliquant l'expiration paresseuse : si le statut est
   encore 'disponible' mais que expire_at est dépassé, on bascule 'expiree' à la
   volée avant de renvoyer la ligne — jamais besoin d'un cron pour ça. */
async function chargerInvitation(db, id) {
  const inv = await db.prepare("SELECT * FROM partenariat_invitations WHERE id=?").get(id);
  if (!inv) return null;
  inv.id = Number(inv.id);
  if (inv.statut === "disponible" && inv.expire_at < maintenant()) {
    await db.prepare("UPDATE partenariat_invitations SET statut='expiree' WHERE id=?").run(inv.id);
    inv.statut = "expiree";
  }
  return inv;
}

/* Même chose mais par token (utilisé côté inscription publique) — le token
   fourni est haché puis comparé au hash stocké, jamais l'inverse. */
async function chargerInvitationParToken(db, tokenBrut) {
  const hash = hashToken(tokenBrut);
  const inv = await db.prepare("SELECT * FROM partenariat_invitations WHERE token_hash=?").get(hash);
  if (!inv) return null;
  inv.id = Number(inv.id);
  if (inv.statut === "disponible" && inv.expire_at < maintenant()) {
    await db.prepare("UPDATE partenariat_invitations SET statut='expiree' WHERE id=?").run(inv.id);
    inv.statut = "expiree";
  }
  return inv;
}

module.exports = { genererToken, hashToken, maintenant, plusJours, chargerInvitation, chargerInvitationParToken };

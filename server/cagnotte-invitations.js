/* ===========================================================
   DIASPO'ACTIF — Module "Invitation par e-mail à une cagnotte" : logique
   pure, même organisation que server/partenariat.js.

   Sécurité du lien d'invitation (même standard que le module Partenariat) :
   - Génération via crypto.randomBytes — jamais Math.random.
   - Seul le hash SHA-256 est stocké en base — jamais le token en clair
     (contrairement au reset_token de la réinitialisation de mot de passe,
     un anti-pattern connu de ce projet, volontairement non reproduit ici).
   - Expiration paresseuse à la lecture (chargerInvitationParToken) : pas de
     cron dédié, juste un contrôle systématique à chaque lecture.

   Statuts : 'envoyee' (e-mail parti, pas encore ouverte) → 'ouverte' (le
   lien a été cliqué au moins une fois) → 'participee' (une contribution
   payée a été rattachée à cette invitation) ; ou 'expiree' à tout moment
   si expire_at est dépassé. Une invitation reste utilisable pour ouvrir la
   page/participer même après être passée 'ouverte' — seule l'expiration
   bloque réellement (contrairement au module Partenariat où l'invitation
   est à usage unique, ici plusieurs visites/tentatives doivent rester
   possibles avant le paiement réel). */
const crypto = require("node:crypto");

function genererToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

/* Même convention que ailleurs sur le projet (server/partenariat.js,
   tgMaintenant()) : chaîne "YYYY-MM-DD HH:MM:SS", comparable
   lexicographiquement aux colonnes datetime('now') — ne jamais faire
   new Date(chaîne) directement (réinterprétée en heure locale). */
function maintenant() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function plusJours(n) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace("T", " ");
}

/* Applique l'expiration paresseuse sur une ligne déjà chargée : ne modifie
   jamais 'participee' (une invitation honorée reste honorée même si le
   délai est dépassé depuis). */
async function appliquerExpiration(db, inv) {
  if (inv.statut !== "participee" && inv.statut !== "expiree" && inv.expire_at < maintenant()) {
    await db.prepare("UPDATE cagnotte_invitations SET statut='expiree' WHERE id=?").run(inv.id);
    inv.statut = "expiree";
  }
  return inv;
}

async function chargerInvitation(db, id) {
  const inv = await db.prepare("SELECT * FROM cagnotte_invitations WHERE id=?").get(id);
  if (!inv) return null;
  inv.id = Number(inv.id);
  return appliquerExpiration(db, inv);
}

/* Utilisé côté page publique de la cagnotte (?invitation=<token>) — le
   token fourni est haché puis comparé au hash stocké, jamais l'inverse. */
async function chargerInvitationParToken(db, tokenBrut) {
  const hash = hashToken(tokenBrut);
  const inv = await db.prepare("SELECT * FROM cagnotte_invitations WHERE token_hash=?").get(hash);
  if (!inv) return null;
  inv.id = Number(inv.id);
  return appliquerExpiration(db, inv);
}

module.exports = { genererToken, hashToken, maintenant, plusJours, chargerInvitation, chargerInvitationParToken };

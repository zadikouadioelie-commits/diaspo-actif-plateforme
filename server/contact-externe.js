/* ═════════════════════════════════════════════════
   server/contact-externe.js — « Contact » pour les personnes SANS compte Diaspo'Actif (2026-11-09, demande explicite)

   Une personne non connectée qui consulte l'annuaire (ou un profil public) ne pouvait joindre personne : la demande de contact
   (demandes_contact) exige un compte. Ici, elle remplit une petite fiche — nom, prénom, motif (300 caractères maximum), adresse
   e-mail OBLIGATOIRE, téléphone facultatif — et le destinataire :
     • reçoit une notification (cloche) « Message hors Diaspo'Actif » ;
     • retrouve le message dans Messagerie → rubrique « Hors Diaspo'Actif » (nom, motif, e-mail, téléphone) ;
     • répond lui-même, par e-mail ou téléphone, hors plateforme (aucune conversation interne avec une personne sans compte).

   Règles :
     - le visiteur n'apprend RIEN sur le destinataire (réponse identique que le compte existe ou non, sauf comptes inexistants → 404 générique) ;
     - la notification ne contient ni le motif ni les coordonnées : elles ne se lisent que dans la rubrique, connecté ;
     - consentement explicite exigé (les coordonnées sont transmises au destinataire) ;
     - anti-abus sans service externe : champ piège invisible, délai minimum de remplissage, limites par IP / par adresse e-mail /
       par destinataire ;
     - jamais vers un compte masqué, supprimé, invisible de l'annuaire, ni vers l'administration.
   ═════════════════════════════════════════════════ */
"use strict";

const MOTIF_MAX = 300;
const NOM_MAX = 80;
const EMAIL_MAX = 120;
const ROLES_FERMES = ["administrateur", "administrateur_junior"];
const RE_EMAIL = /^[^\s@<>"',;:]+@[^\s@<>"',;:]+\.[A-Za-z]{2,}$/;
const RE_TEL = /^[0-9+().\-\s]{6,24}$/;

/* Retire les caractères de contrôle, rabote les blancs : le texte reste du texte brut (le client l'échappe à l'affichage). */
function propre(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

module.exports = { MOTIF_MAX };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, creerNotif, SEC } = deps;

  /* POST /api/contact-externe — public (aucune connexion). Corps : destinataire_id, nom, prenom, motif, email, telephone?, consentement, site_perso (piège), _form_ts. */
  route("POST", "/api/contact-externe", async (req, res, params, body) => {
    const ip = SEC.clientIp(req);
    body = body || {};
    if (body.site_perso) { SEC.logSecurity("contact_externe_honeypot", { ip }); return sendJSON(res, 400, { error: "Requête invalide." }); }
    const rendu = Number(body._form_ts) || 0;
    if (rendu && (Date.now() - rendu) < 3000) return sendJSON(res, 400, { error: "Veuillez réessayer dans quelques secondes." });

    const destId = Number(body.destinataire_id);
    const nom = propre(body.nom, NOM_MAX);
    const prenom = propre(body.prenom, NOM_MAX);
    const motif = propre(body.motif, MOTIF_MAX + 1);
    const email = propre(body.email, EMAIL_MAX + 1).toLowerCase();
    const telephone = propre(body.telephone, 40);

    if (!destId) return sendJSON(res, 400, { error: "Destinataire invalide." });
    if (!nom) return sendJSON(res, 400, { error: "Indiquez votre nom." });
    if (!prenom) return sendJSON(res, 400, { error: "Indiquez votre prénom." });
    if (!motif) return sendJSON(res, 400, { error: "Écrivez le motif de votre demande." });
    if (motif.length > MOTIF_MAX) return sendJSON(res, 400, { error: `Le motif est limité à ${MOTIF_MAX} caractères.` });
    if (!email || email.length > EMAIL_MAX || !RE_EMAIL.test(email)) return sendJSON(res, 400, { error: "Indiquez une adresse e-mail valide : c'est ainsi que cette personne pourra vous répondre." });
    if (telephone && !RE_TEL.test(telephone)) return sendJSON(res, 400, { error: "Le numéro de téléphone n'est pas valide (chiffres, +, espaces uniquement)." });
    if (!body.consentement) return sendJSON(res, 400, { error: "Cochez la case pour autoriser la transmission de vos coordonnées." });

    /* Limites : par connexion (5 / heure), par adresse e-mail (3 / jour), par destinataire depuis une même connexion (2 / heure). */
    const limIp = SEC.rateLimit(`contact-ext:ip:${ip}`, 5, 3600000);
    if (!limIp.allowed) return sendJSON(res, 429, { error: `Trop de messages envoyés depuis cette connexion. Réessayez dans ${limIp.retryAfter}s.` });
    const limMail = SEC.rateLimit(`contact-ext:mail:${email}`, 3, 24 * 3600000);
    if (!limMail.allowed) return sendJSON(res, 429, { error: "Cette adresse e-mail a déjà envoyé plusieurs messages aujourd'hui. Réessayez demain." });
    const limDest = SEC.rateLimit(`contact-ext:dest:${ip}:${destId}`, 2, 3600000);
    if (!limDest.allowed) return sendJSON(res, 429, { error: "Vous avez déjà écrit à cette personne. Attendez sa réponse." });

    const dest = await db.prepare(
      "SELECT id, role, nom, compte_masque, invisible_annuaire_definitif, invisible_annuaire_jusqu_au FROM users WHERE id=?"
    ).get(destId);
    const invisible = dest && (dest.invisible_annuaire_definitif || (dest.invisible_annuaire_jusqu_au && new Date(dest.invisible_annuaire_jusqu_au) > new Date()));
    if (!dest || dest.nom === "Compte supprimé" || dest.compte_masque || invisible || ROLES_FERMES.includes(dest.role)) {
      return sendJSON(res, 404, { error: "Cette personne ne peut pas être contactée pour le moment." });
    }

    const id = (await db.prepare(
      "INSERT INTO messages_hors_diaspo (destinataire_id, nom, prenom, motif, email, telephone) VALUES (?,?,?,?,?,?)"
    ).run(destId, nom, prenom, motif, email, telephone || null)).lastInsertRowid;

    creerNotif(destId, "message_externe", "Message hors Diaspo'Actif",
      "Vous avez reçu un message d'une personne sans compte Diaspo'Actif. Il est dans Messagerie → « Hors Diaspo'Actif ».",
      { message_externe_id: Number(id), lien: "messagerie.html?rubrique=hors" });

    sendJSON(res, 201, { ok: true });
  });

  /* GET /api/messages-hors-diaspo — les messages reçus par le compte connecté, du plus récent au plus ancien. */
  route("GET", "/api/messages-hors-diaspo", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const rows = await db.prepare(
      "SELECT id, nom, prenom, motif, email, telephone, lu, created_at FROM messages_hors_diaspo WHERE destinataire_id=? ORDER BY id DESC LIMIT 200"
    ).all(user.id);
    sendJSON(res, 200, { messages: rows, non_lus: rows.filter(r => !r.lu).length });
  });

  /* POST /api/messages-hors-diaspo/:id/lu — { lu: true|false }. */
  route("POST", "/api/messages-hors-diaspo/:id/lu", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const r = await db.prepare("UPDATE messages_hors_diaspo SET lu=? WHERE id=? AND destinataire_id=?")
      .run((body && body.lu === false) ? 0 : 1, Number(params.id), user.id);
    if (!r.changes) return sendJSON(res, 404, { error: "Message introuvable." });
    sendJSON(res, 200, { ok: true });
  });

  /* DELETE /api/messages-hors-diaspo/:id — suppression définitive (les coordonnées d'un tiers ne sont pas gardées au-delà du besoin). */
  route("DELETE", "/api/messages-hors-diaspo/:id", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const r = await db.prepare("DELETE FROM messages_hors_diaspo WHERE id=? AND destinataire_id=?").run(Number(params.id), user.id);
    if (!r.changes) return sendJSON(res, 404, { error: "Message introuvable." });
    sendJSON(res, 200, { ok: true });
  });
};

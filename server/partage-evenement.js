/* ═══════════════════════════════════════════════════════
   server/partage-evenement.js — Envoyer un événement par e-mail + texte d'aperçu (2026-10-13, demande explicite :
   « quand on envoie un événement à une personne, la cartouche apparaît bien avec les informations »).

   - descriptionApercu(evt) : « 📅 samedi 7 novembre 2026 · 18:00 — 📍 Lieu, Ville — début de la description » : le texte d'aperçu du lien partagé
     (WhatsApp, réseaux) porte la date et le lieu, pas seulement la description.
   - POST /api/evenements/:id/envoyer-email { emails } : carte HTML (affiche, titre, organisateur, date, lieu, extrait, bouton) au nom du compte connecté.
     Connecté obligatoire, 5 destinataires max, 10 envois/heure/compte ; seuls les événements publics et publiés sont envoyables.
   ═══════════════════════════════════════════════════════ */
const brut = s => String(s == null ? "" : s).replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

function dateLongue(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return "";
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}
/* « samedi 7 novembre 2026 · 18:00 » (et « du … au … » si l'événement dure plusieurs jours). */
function quand(evt) {
  const debut = dateLongue(evt.date_evt);
  if (!debut) return "";
  const fin = evt.date_fin && String(evt.date_fin).slice(0, 10) !== String(evt.date_evt).slice(0, 10) ? dateLongue(evt.date_fin) : "";
  return fin ? `du ${debut}${evt.heure_debut ? " · " + evt.heure_debut : ""} au ${fin}` : `${debut}${evt.heure_debut ? " · " + evt.heure_debut : ""}`;
}
const ou = evt => [evt.lieu, evt.ville, evt.pays].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(", ");

function descriptionApercu(evt) {
  const q = quand(evt), o = ou(evt), d = brut(evt.description);
  const tete = [q ? "📅 " + q : "", o ? "📍 " + o : ""].filter(Boolean).join(" — ");
  return (tete ? (d ? tete + " — " + d : tete) : d).slice(0, 200) || "La plateforme mondiale de la diaspora engagée — actions locales, impact global.";
}

module.exports = { descriptionApercu, quand, ou };
module.exports.register = function register({ route, db, sendJSON, getCurrentUser, SEC, nomCompteAffichage, getOrigin, urlImagePartageEvenement }) {
  route("POST", "/api/evenements/:id/envoyer-email", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connectez-vous pour envoyer cet événement par e-mail." });
    const liste = Array.isArray(body && body.emails) ? body.emails : String((body && body.emails) || "").split(/[,;\s]+/);
    const emails = [...new Set(liste.map(x => String(x || "").trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) return sendJSON(res, 400, { error: "Indiquez au moins une adresse e-mail." });
    if (emails.length > 5) return sendJSON(res, 400, { error: "5 adresses au maximum par envoi." });
    const invalide = emails.find(x => !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(x) || x.length > 254);
    if (invalide) return sendJSON(res, 400, { error: `Adresse e-mail invalide : ${invalide}` });
    const limite = SEC.rateLimit(`evt-email:${user.id}`, 10, 3600000);
    if (!limite.allowed) return sendJSON(res, 429, { error: `Trop d'envois. Réessayez dans ${limite.retryAfter}s.` });
    const evt = await db.prepare("SELECT * FROM evenements WHERE id=?").get(params.id);
    if (!evt || evt.statut === "brouillon" || evt.visibilite === "prive") return sendJSON(res, 404, { error: "Cet événement n'est pas disponible." });
    const origin = getOrigin(req);
    const lien = `${origin}/evenements.html?evt=${evt.id}&via=${user.id}`;
    const image = await urlImagePartageEvenement(evt);
    const auteurNom = (await nomCompteAffichage(user.id)) || "Un membre de Diaspo'Actif";
    const { emailPartageEvenement } = require("./mailer");
    const fiche = { auteurNom, titre: evt.titre, organisateur: evt.organisateur, quand: quand(evt), ou: ou(evt), description: brut(evt.description).slice(0, 240), imageUrl: image, lien };
    const resultats = await Promise.all(emails.map(email => emailPartageEvenement({ email, ...fiche })));
    const envoyes = resultats.filter(r => r && r.ok).length;
    if (!envoyes) return sendJSON(res, 502, { error: "L'envoi a échoué. Réessayez dans un instant." });
    sendJSON(res, 200, { ok: true, envoyes, echecs: emails.length - envoyes });
  });
};

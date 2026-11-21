/* ═════════════════════════════════════════════════
   server/ida-contenus.js — Influenceur Diaspo'Actif (IDA) : publication de contenus (2026-11-21, demande explicite)

   Remplace l'ancienne demande d'accès créateur (server/ida-demandes-createur.js, désormais retirée) :
   plus de passage par l'administration — qui peut publier se décide automatiquement, à chaque envoi :
     - Administrateur : toujours.
     - Initiative ou Collectivité : seulement si Premium actif (estPremiumActif, vrai statut, qui ignore
       volontairement le mode observation PREMIUM_APPLICATION — ici la règle doit s'appliquer pour de
       vrai dès aujourd'hui, pas seulement si cet interrupteur global est un jour activé).
     - Utilisateur : jamais, même Premium.
   Si un compte Initiative/Collectivité perd son Premium ensuite, il ne peut plus PUBLIER de nouveau
   contenu, mais tout ce qu'il a déjà publié reste visible — cette table n'est jamais filtrée sur le
   Premium de l'auteur à la lecture (GET). Lui seul (ou l'administrateur) peut SUPPRIMER son contenu,
   à tout moment, qu'il ait encore Premium ou non : DELETE ne vérifie que la propriété, jamais le Premium.

   Deux types de contenu, mêmes champs (titre, description, thème, format, image de couverture) :
   vidéo (podcasts vidéo de 30 min à 1 h) et podcast audio (MP3/M4A/WAV). Le fichier média transite
   par l'hébergement existant des vidéos (server/reels-upload.js, Bunny Stream, envoi direct
   navigateur → Bunny, voir assets/reels-upload.js) avec deux nouveaux usages ("ida_video",
   "ida_podcast") : ce module ne fait que vérifier, une fois l'envoi terminé, que le média appartient
   bien à ce compte et qu'il est prêt, puis enregistre la fiche. ═════════════════════════════════════════════════ */
"use strict";

const ReelsUpload = require("./reels-upload");

const THEMES = ["Entrepreneuriat & Business", "Développement & Impact", "Culture & Identité", "Innovation & Technologie", "Éducation & Formation", "Diaspora & Mobilité", "Leadership & Inspiration", "Société & Citoyenneté"];
const FORMATS = ["Podcast Diaspo'Actif", "Interview", "Débat", "Webinaire", "Récit inspirant"];
const MEDIA_TYPES = ["video", "podcast"];

/* Point de contrôle UNIQUE pour « qui peut publier sur Influenceur Diaspo'Actif ». Toute route qui
   crée ou republie un contenu doit passer par ici — exactement le même principe que exigerPremium()
   pour les autres modules Premium de la plateforme (server/index.js, ~l.18275). */
async function idaPeutPublier(user, estPremiumActif) {
  if (!user) return false;
  if (user.role === "administrateur") return true;
  if (!["initiative", "collectivite"].includes(user.role)) return false;
  return estPremiumActif(user.id, user.role);
}

module.exports = { THEMES, FORMATS, MEDIA_TYPES, idaPeutPublier };

module.exports.register = function register(deps) {
  const { route, db, sendJSON, getCurrentUser, estPremiumActif, nomCompteAffichage, SEC } = deps;

  async function peutPublier(user) { return idaPeutPublier(user, estPremiumActif); }

  function formatContenu(c, connecteId) {
    return {
      id: Number(c.id),
      media_type: c.media_type,
      titre: c.titre,
      description: c.description || "",
      theme: c.theme || "",
      format: c.format || "",
      image_couverture: c.image_couverture || null,
      media_url: c.media_url || null,
      duree_secondes: Number(c.duree_secondes) || 0,
      vues: Number(c.vues) || 0,
      created_at: c.created_at,
      user_id: Number(c.user_id),
      peut_supprimer: !!connecteId && (Number(connecteId) === Number(c.user_id)),
    };
  }

  /* GET /api/ida/eligibilite — état de ce compte vis-à-vis de la publication (pour afficher le bon
     bandeau : « Publier », « Réservé à... », « Reprenez votre Premium pour publier à nouveau »...).
     Jamais 401 : un visiteur non connecté reçoit juste connecte:false, ce n'est pas une route protégée. */
  route("GET", "/api/ida/eligibilite", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 200, { connecte: false, peut_publier: false, role: null });
    const role_admissible = user.role === "administrateur" || ["initiative", "collectivite"].includes(user.role);
    let premium_actif = user.role === "administrateur" ? true : null;
    if (role_admissible && user.role !== "administrateur") premium_actif = await estPremiumActif(user.id, user.role);
    sendJSON(res, 200, {
      connecte: true, role: user.role, role_admissible,
      premium_actif: premium_actif === null ? null : !!premium_actif,
      peut_publier: user.role === "administrateur" ? true : (role_admissible && !!premium_actif),
    });
  });

  /* GET /api/ida/contenus?media_type=video|podcast&theme=...&q=...&tri=populaires|nouvelles — liste
     publique (aucune condition d'auteur à la lecture : voir l'en-tête de ce fichier). */
  route("GET", "/api/ida/contenus", async (req, res, params, body, query) => {
    const mediaType = MEDIA_TYPES.includes(query && query.media_type) ? query.media_type : "video";
    const user = await getCurrentUser(req).catch(() => null);
    const rows = await db.prepare("SELECT * FROM ida_contenus WHERE media_type=? ORDER BY id DESC LIMIT 300").all(mediaType);
    let liste = rows.map(c => formatContenu(c, user && user.id));
    const theme = String((query && query.theme) || "").trim();
    if (theme) liste = liste.filter(c => c.theme === theme);
    const q = String((query && query.q) || "").trim().toLowerCase();
    if (q) liste = liste.filter(c => (c.titre + " " + c.description + " " + c.theme + " " + c.format).toLowerCase().includes(q));
    const tri = String((query && query.tri) || "");
    if (tri === "populaires") liste.sort((a, b) => b.vues - a.vues);
    else liste.sort((a, b) => b.id - a.id);
    const auteurs = {};
    for (const c of liste) {
      if (!(c.user_id in auteurs)) auteurs[c.user_id] = (await nomCompteAffichage(c.user_id)) || "Un compte";
      c.auteur = auteurs[c.user_id];
    }
    sendJSON(res, 200, { contenus: liste });
  });

  /* GET /api/ida/contenus/:id — une fiche (lecteur), compte une vue à chaque appel. */
  route("GET", "/api/ida/contenus/:id", async (req, res, params) => {
    const c = await db.prepare("SELECT * FROM ida_contenus WHERE id=?").get(Number(params.id));
    if (!c) return sendJSON(res, 404, { error: "Contenu introuvable." });
    await db.prepare("UPDATE ida_contenus SET vues = vues + 1 WHERE id=?").run(Number(params.id));
    const user = await getCurrentUser(req).catch(() => null);
    const out = formatContenu(c, user && user.id);
    out.auteur = (await nomCompteAffichage(out.user_id)) || "Un compte";
    sendJSON(res, 200, out);
  });

  /* POST /api/ida/contenus — publie une fiche. Le fichier média a déjà été envoyé directement à
     Bunny Stream (assets/reels-upload.js, usage "ida_video" ou "ida_podcast") avant cet appel : on ne
     fait ici que vérifier que ce guid appartient bien à ce compte et qu'il est prêt (jamais confiance
     en une adresse fournie par le navigateur), puis on enregistre l'adresse de lecture RÉELLE. */
  route("POST", "/api/ida/contenus", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (!(await peutPublier(user))) {
      if (user.role === "administrateur") return sendJSON(res, 403, { error: "Erreur interne : l'administrateur devrait toujours pouvoir publier." });
      if (!["initiative", "collectivite"].includes(user.role)) return sendJSON(res, 403, { error: "Publier sur Influenceur Diaspo'Actif est réservé aux comptes Initiative et Collectivité (ou à l'administration)." });
      return sendJSON(res, 402, { error: "Publier sur Influenceur Diaspo'Actif est réservé aux comptes Premium. Votre abonnement n'est plus actif : vos contenus déjà publiés restent visibles, mais il faut un Premium actif pour en publier de nouveaux." });
    }
    const mediaType = MEDIA_TYPES.includes(body && body.media_type) ? body.media_type : null;
    if (!mediaType) return sendJSON(res, 400, { error: "Type de contenu invalide (vidéo ou podcast)." });
    const titre = String((body && body.titre) || "").trim().slice(0, 200);
    if (!titre) return sendJSON(res, 400, { error: "Le titre est requis." });
    const description = String((body && body.description) || "").trim().slice(0, 3000);
    const theme = THEMES.includes(body && body.theme) ? body.theme : null;
    const format = FORMATS.includes(body && body.format) ? body.format : null;
    const imageCouverture = /^https?:\/\//i.test((body && body.image_couverture) || "") ? body.image_couverture : null;
    const guid = String((body && body.guid) || "");
    const jeton = String((body && body.jeton) || "");
    if (!guid || !jeton) return sendJSON(res, 400, { error: "Média manquant : envoyez d'abord le fichier." });

    const verif = await ReelsUpload.verifierVideoIda(user.id, guid, jeton, mediaType);
    if (verif.erreur) return sendJSON(res, verif.code || 400, { error: verif.erreur });

    try {
      const r = await db.prepare(`INSERT INTO ida_contenus (user_id, media_type, titre, description, theme, format, image_couverture, media_guid, media_url, duree_secondes)
        VALUES (?,?,?,?,?,?,?,?,?,?)`).run(Number(user.id), mediaType, titre, description, theme, format, imageCouverture, guid, verif.url, Math.round(verif.duree) || null);
      const id = Number(r && (r.lastInsertRowid || r.lastID || r.id)) || null;
      sendJSON(res, 201, { ok: true, id });
    } catch (e) { sendJSON(res, 500, SEC.safeError(e, "ida contenus create")); }
  });

  /* DELETE /api/ida/contenus/:id — auteur ou administrateur, SANS AUCUNE condition de Premium : on
     doit toujours pouvoir retirer son propre contenu, que son Premium soit actif ou non (demande
     explicite). Supprime aussi le média chez Bunny Stream. */
  route("DELETE", "/api/ida/contenus/:id", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const c = await db.prepare("SELECT * FROM ida_contenus WHERE id=?").get(Number(params.id));
    if (!c) return sendJSON(res, 404, { error: "Contenu introuvable." });
    if (Number(c.user_id) !== Number(user.id) && user.role !== "administrateur") return sendJSON(res, 403, { error: "Vous ne pouvez supprimer que votre propre contenu." });
    await db.prepare("DELETE FROM ida_contenus WHERE id=?").run(Number(params.id));
    if (c.media_guid) ReelsUpload.supprimerVideo(c.media_guid).catch(() => {});
    sendJSON(res, 200, { ok: true });
  });
};

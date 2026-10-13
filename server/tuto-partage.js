/* ═══════════════════════════════════════════════════════
   server/tuto-partage.js — Partager un tuto vidéo sur le fil (2026-10-12, demande explicite)

   « Les tutos de l'accueil : une option pour les partager directement, la cartouche telle qu'elle, avec juste le nom du compte qui
     fait le transfert — Move to Learn vous invite à voir le tuto <titre> — et une image pour que ce soit attrayant. »

   Le partage crée une PUBLICATION ordinaire du fil (photo = l'affiche du tuto, réactions/commentaires/partage comme toute publication)
   marquée fil_posts.tuto_video_id : la carte du tuto (titre, affiche, durée, lien) est jointe à la publication pour afficher le bouton
   « Voir le tuto ». Texte : « <nom du compte> vous invite à voir le tuto « <titre> » », sans aucun autre texte inventé.
   Une publication partagée disparaît du fil si le tuto est dépublié ou supprimé (clause tutoClause, reprise par tous les modes du fil).
   ═══════════════════════════════════════════════════════ */
const YOUTUBE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/;
const TITRE_MAX = 140;

/* Affiche d'un tuto : sa miniature, sinon l'image YouTube, sinon l'affiche « Bientôt disponible » ; null si aucune (le texte seul suffit). */
function imageTuto(v) {
  if (v.miniature_url) return v.miniature_url;
  const m = String(v.url || "").match(YOUTUBE);
  if (v.type_source === "youtube" && m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
  if (v.type_source === "bientot") return "/assets/videos-bientot-disponible.jpg";
  return null;
}

/* Gmail/Outlook (et certains aperçus de lien) n'affichent PAS les images SVG : si l'affiche d'un tuto est un .svg et qu'une version .jpg/.png du même nom
   existe dans le dépôt, c'est elle qu'il faut envoyer ; sinon null (le texte seul vaut mieux qu'une image cassée). */
function imageRaster(u) {
  if (!u || !/\.svg(\?|$)/i.test(u) || /^https?:/i.test(u)) return u;
  for (const ext of [".jpg", ".png"]) { const alt = u.replace(/\.svg(\?.*)?$/i, ext); if (require("fs").existsSync(require("path").join(__dirname, "..", alt.split("?")[0]))) return alt; }
  return null;
}

/* Carte du tuto jointe aux publications partagées (null si le tuto n'est plus publié).
   type_source/url/miniature_url exposés depuis le 2026-10-13 (demande explicite : "rester dans
   le fil, pas besoin d'aller sur la page de la vidéo") — nécessaires au front pour lancer la
   lecture directement dans la publication (assets/posts.js), sans navigation. `lien` reste pour
   le repli (WhatsApp, lien copié, navigateur sans JS). */
async function carteTutoPost(db, videoId) {
  const v = await db.prepare("SELECT id, titre, categorie, duree_secondes, type_source, url, miniature_url, statut FROM da_videos_tutoriels WHERE id=?").get(videoId);
  if (!v || v.statut !== "publie") return null;
  return { id: Number(v.id), titre: v.titre, categorie: v.categorie || null, duree_secondes: v.duree_secondes || null, type_source: v.type_source || null, url: v.url || null, miniature_url: v.miniature_url || null, image: imageTuto(v), lien: `videos-tutoriels.html?v=${v.id}` };
}

/* Clause SQL reprise par tous les modes du fil : une publication de tuto n'apparaît que si le tuto existe et est publié. */
const tutoClause = " AND (p.tuto_video_id IS NULL OR EXISTS (SELECT 1 FROM da_videos_tutoriels tv WHERE tv.id=p.tuto_video_id AND tv.statut='publie'))";

/* Texte de la publication : le nom du compte qui partage et le titre du tuto, rien d'autre. */
const texteInvitation = (nom, titre) => `${nom} vous invite à voir le tuto « ${String(titre || "").trim().slice(0, TITRE_MAX)} »`;

module.exports = { imageRaster, imageTuto, carteTutoPost, tutoClause, texteInvitation };
module.exports.register = function register({ route, db, sendJSON, getCurrentUser, SEC, nomCompteAffichage, getOrigin }) {
  /* GET /api/videos-tutoriels/:id/partager — aperçu avant partage : la carte du tuto et le texte exact qui sera publié (nom du compte
     qui partage compris). Ouvert à tous : un visiteur non connecté peut quand même copier le lien / l'envoyer par WhatsApp. */
  route("GET", "/api/videos-tutoriels/:id/partager", async (req, res, params) => {
    const carte = await carteTutoPost(db, params.id);
    if (!carte) return sendJSON(res, 404, { error: "Ce tuto n'est pas disponible." });
    const user = await getCurrentUser(req);
    const nom = user ? await nomCompteAffichage(user.id) : null;
    sendJSON(res, 200, { carte, connecte: !!user, nom, texte: nom ? texteInvitation(nom, carte.titre) : null });
  });

  /* POST /api/videos-tutoriels/:id/partager — publie le tuto dans le fil au nom du compte connecté.
     Idempotent sur 24 h : partager deux fois le même tuto renvoie la publication existante (pas de doublon dans le fil). */
  route("POST", "/api/videos-tutoriels/:id/partager", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connectez-vous pour partager ce tuto sur votre fil." });
    const limite = SEC.rateLimit(`tuto-partage:${user.id}`, 12, 3600000);
    if (!limite.allowed) return sendJSON(res, 429, { error: `Trop de partages. Réessayez dans ${limite.retryAfter}s.` });
    const carte = await carteTutoPost(db, params.id);
    if (!carte) return sendJSON(res, 404, { error: "Ce tuto n'est pas disponible." });

    const deja = await db.prepare("SELECT id FROM fil_posts WHERE auteur_id=? AND tuto_video_id=? AND COALESCE(statut,'publie')='publie' AND created_at >= datetime('now','-1 day') ORDER BY id DESC LIMIT 1").get(user.id, carte.id);
    if (deja) return sendJSON(res, 200, { ok: true, deja: true, post_id: Number(deja.id), lien: `fil-actualite.html?post=${deja.id}` });

    const nom = await nomCompteAffichage(user.id);
    /* L'affiche n'est enregistrée QUE dans la liste « medias » (comme une publication photo normale) : media_url en plus la ferait
       apparaître deux fois dans la visionneuse. */
    const medias = carte.image ? JSON.stringify([{ type: "image", url: carte.image }]) : "[]";
    const pub = carte.image ? "photo" : "texte";
    const id = (await db.prepare(`INSERT INTO fil_posts
      (auteur_id, auteur_nom, type, pub_type, categorie, contenu, media_url, media_type, visibilite, medias, hashtags, statut, tuto_video_id)
      VALUES (?, ?, ?, ?, 'Tuto', ?, ?, ?, 'public', ?, '[]', 'publie', ?)`)
      .run(user.id, nom, pub, pub, texteInvitation(nom, carte.titre), null, carte.image ? "image" : null, medias, carte.id)).lastInsertRowid;
    try { await db.prepare("UPDATE users SET premiere_publication_le=datetime('now') WHERE id=? AND premiere_publication_le IS NULL").run(user.id); } catch (e) { /* jamais bloquant */ }
    sendJSON(res, 201, { ok: true, deja: false, post_id: Number(id), lien: `fil-actualite.html?post=${id}` });
  });

  /* POST /api/videos-tutoriels/:id/envoyer-email { emails: [..] } — envoie la carte du tuto (titre, affiche, durée, bouton) par e-mail, au nom du
     compte connecté. Connecté obligatoire + 10 envois / heure / compte + 5 destinataires maximum par demande : ce n'est jamais un relais de spam. */
  route("POST", "/api/videos-tutoriels/:id/envoyer-email", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connectez-vous pour envoyer ce tuto par e-mail." });
    const brut = Array.isArray(body && body.emails) ? body.emails : String((body && body.emails) || "").split(/[,;\s]+/);
    const emails = [...new Set(brut.map(x => String(x || "").trim().toLowerCase()).filter(Boolean))];
    if (!emails.length) return sendJSON(res, 400, { error: "Indiquez au moins une adresse e-mail." });
    if (emails.length > 5) return sendJSON(res, 400, { error: "5 adresses au maximum par envoi." });
    const invalide = emails.find(x => !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(x) || x.length > 254);
    if (invalide) return sendJSON(res, 400, { error: `Adresse e-mail invalide : ${invalide}` });
    const limite = SEC.rateLimit(`tuto-email:${user.id}`, 10, 3600000);
    if (!limite.allowed) return sendJSON(res, 429, { error: `Trop d'envois. Réessayez dans ${limite.retryAfter}s.` });
    const carte = await carteTutoPost(db, params.id);
    if (!carte) return sendJSON(res, 404, { error: "Ce tuto n'est pas disponible." });
    const desc = (await db.prepare("SELECT description FROM da_videos_tutoriels WHERE id=?").get(carte.id) || {}).description || "";
    const origin = getOrigin(req);
    const absolu = u => !u ? null : (/^https?:\/\//i.test(u) ? u : origin + (u.startsWith("/") ? "" : "/") + u);
    const d = Number(carte.duree_secondes) || 0;
    const dureeTxt = !d ? "" : (d >= 60 ? `${Math.floor(d / 60)} min${d % 60 ? ` ${String(d % 60).padStart(2, "0")} s` : ""}` : `${d} s`);
    const auteurNom = (await nomCompteAffichage(user.id)) || "Un membre de Diaspo'Actif";
    const { emailPartageTuto } = require("./mailer");
    const lien = `${origin}/${carte.lien}`;
    const resultats = await Promise.all(emails.map(email => emailPartageTuto({ email, auteurNom, titre: String(carte.titre || "").slice(0, TITRE_MAX), description: desc, categorie: carte.categorie, imageUrl: absolu(imageRaster(carte.image)), dureeTxt, lien })));
    const envoyes = resultats.filter(r => r && r.ok).length;
    if (!envoyes) return sendJSON(res, 502, { error: "L'envoi a échoué. Réessayez dans un instant." });
    sendJSON(res, 200, { ok: true, envoyes, echecs: emails.length - envoyes });
  });
};

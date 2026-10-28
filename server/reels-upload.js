/* ════════════════════════════════════════════════════════════════════════════════════════
   server/reels-upload.js — Réception des vidéos des REELS (2026-10-13, demande explicite)

   POURQUOI UN ENVOI DIRECT. En production le site tourne sur des fonctions Vercel : toute requête de plus de 4,5 Mo est refusée
   AVANT d'atteindre le code (erreur 413 FUNCTION_PAYLOAD_TOO_LARGE, vérifiée le 2026-10-13 sur diaspoactif.com avec un envoi de 6 Mo).
   Aucune configuration ne lève cette limite. Une vidéo de reel pèse de 10 à 150 Mo : elle ne peut donc PAS transiter par notre serveur.
   Les routes /api/upload/video-* existantes (150 / 300 Mo) ne fonctionnent qu'en local pour cette raison.

   SOLUTION. Le navigateur envoie la vidéo DIRECTEMENT à Bunny Stream (protocole TUS : reprise automatique en cas de coupure, idéal
   sur réseau mobile). Notre serveur ne voit jamais le fichier : il (1) vérifie que le compte est connecté, (2) crée l'objet vidéo chez
   Bunny, (3) renvoie une signature à durée limitée (SHA-256 de bibliothèque + clé + expiration + identifiant vidéo) qui n'expose jamais la
   clé, (4) contrôle ensuite la durée / les dimensions RÉELLES mesurées par Bunny (le contrôle du navigateur seul se contourne).
   Bunny transcode en plusieurs qualités (lecture HLS adaptative), génère la miniature et l'aperçu animé.

   SPÉCIFICATION DES REELS DIASPO'ACTIF (inspirée des Reels Facebook : cadre vertical 9:16, 1080×1920, MP4/MOV H.264 + AAC, 30 i/s,
   courts ; Facebook accepte jusqu'à 4 Go) :
     • durée   : 3 s minimum, 90 s maximum (idéal 15-45 s) ;
     • cadre   : vertical 9:16 recommandé (1080×1920) ; 4:5, carré 1:1 et horizontal 16:9 acceptés, affichés sans déformation ;
     • poids   : 1 Go maximum (un reel de 90 s en 1080p fait ~100 Mo) ; formats MP4 et MOV (iPhone) ;
     • définition minimale : 480 px sur le plus petit côté.

   ACTIVATION. Tant que les trois variables ci-dessous ne sont pas renseignées, /api/reels/config répond actif:false et l'envoi est
   refusé proprement (503) — rien d'autre ne casse :
     BUNNY_STREAM_LIBRARY_ID   identifiant de la bibliothèque vidéo (Bunny → Stream → bibliothèque → « API »)
     BUNNY_STREAM_API_KEY      clé d'API DE LA BIBLIOTHÈQUE (pas la clé du stockage)
     BUNNY_STREAM_HOSTNAME     nom d'hôte de diffusion, du type vz-xxxxxxxx-xxx.b-cdn.net
   (BUNNY_STREAM_API_BASE : uniquement pour les tests, remplace https://video.bunnycdn.com.)

   Utilisé par le futur « univers des Reels » : voir assets/reels-upload.js (côté navigateur) et les fonctions exportées
   (etatVideo, supprimerVideo, urlsLecture) pour enregistrer un reel une fois la vidéo prête.
   ════════════════════════════════════════════════════════════════════════════════════════ */
const crypto = require("crypto");
const SEC = require("./security");

const SPEC = Object.freeze({
  duree_min: 3,
  duree_max: 90,
  duree_ideale: [15, 45],
  taille_max_mo: 1024,
  cote_min_px: 480,
  cadre_recommande: "9:16",
  resolution_recommandee: "1080x1920",
  cadres_acceptes: ["9:16", "4:5", "1:1", "16:9"],
  /* MP4 et MOV seulement, comme Facebook : un WebM produit par un navigateur (sans durée dans l'en-tête) est resté bloqué en analyse chez Bunny
     lors du test réel du 2026-10-13, alors que le MP4 a été traité en moins de 6 minutes. */
  formats: ["video/mp4", "video/quicktime"],
  extensions: ["mp4", "mov"],
  zone_sure: { bas_pct: 20, droite_pct: 12 },   // le texte reste hors de ces zones (boutons de réaction superposés)
});

const cfg = () => ({
  lib: String(process.env.BUNNY_STREAM_LIBRARY_ID || "").trim(),
  cle: String(process.env.BUNNY_STREAM_API_KEY || "").trim(),
  hote: String(process.env.BUNNY_STREAM_HOSTNAME || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, ""),
  base: String(process.env.BUNNY_STREAM_API_BASE || "https://video.bunnycdn.com").replace(/\/+$/, ""),
});
/* Vidéo courte d'un ÉVÉNEMENT (2026-10-28, demande explicite : « une vidéo courte, 2 minutes maximum ») : même hébergement et même envoi direct que les Reels,
   seule la durée change. Règles distinctes, jamais modifiables par le navigateur : c'est le serveur qui choisit quelle règle s'applique. */
const SPEC_EVENEMENT = Object.freeze({ ...SPEC, duree_min: 1, duree_max: 120, duree_ideale: [30, 90], taille_max_mo: 600, cadre_recommande: "16:9", resolution_recommandee: "1280x720" });
const specDe = usage => (usage === "evenement" ? SPEC_EVENEMENT : SPEC);
const actif = () => { const c = cfg(); return !!(c.lib && c.cle && c.hote); };

const secret = () => process.env.AUTH_SECRET || "diaspo-actif-2026-secret";
/* Preuve qu'un compte est bien celui qui a ouvert cet envoi : évite d'avoir à stocker quoi que ce soit en base avant la publication. */
const jetonPour = (userId, guid) => crypto.createHmac("sha256", secret()).update("reel|" + Number(userId) + "|" + guid).digest("base64url").slice(0, 32);
const jetonValide = (userId, guid, jeton) => {
  const a = Buffer.from(jetonPour(userId, guid)), b = Buffer.from(String(jeton || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const guidValide = g => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(g || ""));

async function appelBunny(methode, chemin, corps) {
  const c = cfg();
  const r = await fetch(`${c.base}/library/${encodeURIComponent(c.lib)}${chemin}`, {
    method: methode,
    headers: { AccessKey: c.cle, Accept: "application/json", ...(corps ? { "Content-Type": "application/json" } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const txt = await r.text();
  let j = null; try { j = JSON.parse(txt); } catch (e) { /* réponse vide ou non JSON */ }
  if (!r.ok) { const e = new Error(`Bunny Stream ${methode} ${chemin} : ${r.status} ${txt.slice(0, 160)}`); e.status = r.status; throw e; }
  return j;
}

/* Adresses publiques d'une vidéo prête. HLS = lecture adaptative (hls.js hors Safari/iOS) ; mp4 = repli direct (nécessite l'option
   « MP4 Fallback » de la bibliothèque) ; miniature et aperçu animé sont générés par Bunny. */
function urlsLecture(guid, qualites) {
  const h = cfg().hote; if (!h || !guidValide(guid)) return null;
  /* MP4 de repli : seules les qualités ≤ à celle de la vidéo d'origine existent (test réel : une source 540×960 n'a pas de play_720p.mp4).
     On prend 720p si elle existe, sinon la plus haute disponible. */
  const hauteurs = (qualites || []).map(q => parseInt(q, 10)).filter(Boolean).sort((a, b) => b - a);
  const q = hauteurs.includes(720) ? 720 : (hauteurs[0] || 720);
  return { hls: `https://${h}/${guid}/playlist.m3u8`, mp4: `https://${h}/${guid}/play_${q}p.mp4`, miniature: `https://${h}/${guid}/thumbnail.jpg`, apercu: `https://${h}/${guid}/preview.webp`, embed: `https://iframe.mediadelivery.net/embed/${cfg().lib}/${guid}` };
}

const cadreDe = (l, h) => { if (!l || !h) return null; const r = l / h; return r < 0.7 ? "vertical" : r < 0.9 ? "4:5" : r <= 1.15 ? "carre" : "horizontal"; };

/* État d'une vidéo envoyée. Codes Bunny : 0 créée · 1 envoyée · 2 analyse · 3 encodage · 4 terminée · 5 erreur · 6 envoi échoué.
   Les règles de durée / définition sont appliquées ici sur les mesures de Bunny ; une vidéo hors règle est SUPPRIMÉE. */
async function etatVideo(guid, regles) {
  const SPEC = regles || module.exports.SPEC;
  const v = await appelBunny("GET", `/videos/${encodeURIComponent(guid)}`);
  const duree = Math.round((Number(v.length) || 0) * 10) / 10, largeur = Number(v.width) || 0, hauteur = Number(v.height) || 0;
  const base = { guid, duree, largeur, hauteur, cadre: cadreDe(largeur, hauteur), statut_bunny: v.status };
  if (v.status === 5 || v.status === 6) return { ...base, etat: "erreur", erreur: "La vidéo n’a pas pu être traitée. Essayez un autre fichier (MP4 ou MOV)." };
  if (duree > 0) {
    if (duree > SPEC.duree_max + 0.5) { await supprimerVideo(guid); return { ...base, etat: "refuse", erreur: `Vidéo trop longue : ${Math.round(duree)} s (maximum ${SPEC.duree_max} s).` }; }
    if (duree < SPEC.duree_min) { await supprimerVideo(guid); return { ...base, etat: "refuse", erreur: `Vidéo trop courte : ${duree} s (minimum ${SPEC.duree_min} s).` }; }
  }
  if (largeur && hauteur && Math.min(largeur, hauteur) < SPEC.cote_min_px) { await supprimerVideo(guid); return { ...base, etat: "refuse", erreur: `Définition trop faible (${largeur}×${hauteur}). Minimum ${SPEC.cote_min_px} px sur le plus petit côté.` }; }
  /* Lisible dès qu'une première qualité est encodée (statut 3 avec au moins une définition disponible) : inutile d'attendre la fin. */
  if (v.status === 4 || (v.status === 3 && String(v.availableResolutions || "").trim())) {
    const qualites = String(v.availableResolutions || "").split(",").map(s => s.trim()).filter(Boolean);
    return { ...base, etat: "pret", urls: urlsLecture(guid, qualites), qualites };
  }
  return { ...base, etat: v.status <= 1 ? "envoi" : "traitement", progression: Number(v.encodeProgress) || 0 };
}

async function supprimerVideo(guid) {
  if (!actif() || !guidValide(guid)) return false;
  try { await appelBunny("DELETE", `/videos/${encodeURIComponent(guid)}`); return true; } catch (e) { return false; }
}

function registerReelsUpload({ route, sendJSON, getCurrentUser }) {
  /* Règles publiques : lues par le navigateur (écran d'envoi) et par l'univers des Reels. */
  route("GET", "/api/reels/config", async (req, res, params, body, query) => {
    const sp = specDe(query && query.usage);
    sendJSON(res, 200, { actif: actif(), ...sp, taille_max_octets: sp.taille_max_mo * 1024 * 1024 });
  });

  /* Ouvre un envoi : crée l'objet vidéo chez Bunny et renvoie de quoi envoyer le fichier directement (jamais la clé d'API). */
  route("POST", "/api/reels/upload-session", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (!actif()) return sendJSON(res, 503, { error: "L’envoi de reels sera disponible très bientôt.", code: "reels_inactif" });
    const lim = SEC.rateLimit(`reels-session:${user.id}`, 12, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: "Trop d’envois en peu de temps. Réessayez dans un moment." });
    const SP = specDe(body && body.usage);
    const taille = Number(body && body.taille), type = String((body && body.type) || "").toLowerCase();
    if (!Number.isFinite(taille) || taille <= 0) return sendJSON(res, 400, { error: "Taille du fichier inconnue." });
    if (taille > SP.taille_max_mo * 1024 * 1024) return sendJSON(res, 400, { error: `Fichier trop volumineux (maximum ${SP.taille_max_mo} Mo). ${SP === SPEC ? "Exportez la vidéo en 1080×1920 : un reel de 90 s dépasse rarement 150 Mo." : "Réduisez la définition (720p suffit) ou la durée de la vidéo."}` });
    if (type && !SPEC.formats.includes(type)) return sendJSON(res, 400, { error: "Format non pris en charge. Utilisez une vidéo MP4 ou MOV." });
    const titre = String((body && body.titre) || "Reel").replace(/[\r\n]+/g, " ").trim().slice(0, 80) || "Reel";
    try {
      const c = cfg();
      const v = await appelBunny("POST", "/videos", { title: `u${Number(user.id)} · ${titre}` });
      if (!v || !v.guid) throw new Error("Réponse Bunny sans identifiant vidéo");
      const expire = Math.floor(Date.now() / 1000) + 6 * 3600;   // 6 h : laisse le temps d'une reprise après coupure
      const signature = crypto.createHash("sha256").update(c.lib + c.cle + expire + v.guid).digest("hex");
      sendJSON(res, 200, {
        guid: v.guid, jeton: jetonPour(user.id, v.guid),
        tus: { endpoint: `${c.base}/tusupload`, entetes: { AuthorizationSignature: signature, AuthorizationExpire: String(expire), VideoId: v.guid, LibraryId: c.lib }, metadonnees: { filetype: type || "video/mp4", title: titre } },
      });
    } catch (e) { sendJSON(res, 500, SEC.safeError(e, "reels upload-session")); }
  });

  /* Suivi : « envoi » → « traitement » → « pret » (avec les adresses de lecture) ou « refuse » / « erreur ». */
  route("GET", "/api/reels/upload/:guid/statut", async (req, res, params, body, query) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (!actif()) return sendJSON(res, 503, { error: "Indisponible.", code: "reels_inactif" });
    if (!guidValide(params.guid) || !jetonValide(user.id, params.guid, query && query.jeton)) return sendJSON(res, 403, { error: "Envoi inconnu." });
    try { sendJSON(res, 200, await etatVideo(params.guid, specDe(query && query.usage))); }
    catch (e) { if (e.status === 404) return sendJSON(res, 404, { error: "Vidéo introuvable." }); sendJSON(res, 500, SEC.safeError(e, "reels statut")); }
  });

  /* Abandon d'un envoi (l'utilisateur annule ou change de fichier) : la vidéo est retirée de l'hébergement. */
  route("POST", "/api/reels/upload/:guid/annuler", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (!guidValide(params.guid) || !jetonValide(user.id, params.guid, body && body.jeton)) return sendJSON(res, 403, { error: "Envoi inconnu." });
    sendJSON(res, 200, { ok: await supprimerVideo(params.guid) });
  });
}

/* Vérifie l'envoi d'une vidéo d'ÉVÉNEMENT (preuve guid + jeton du compte, vidéo prête, durée réelle ≤ 2 min mesurée par Bunny) et renvoie l'adresse de lecture
   construite par le serveur — le navigateur ne fournit jamais l'adresse. → { url } ou { erreur, code }. */
async function verifierVideoEvenement(userId, guid, jeton) {
  if (!actif()) return { erreur: "L’envoi de vidéos n’est pas encore activé.", code: 503 };
  if (!guidValide(guid) || !jetonValide(userId, guid, jeton)) return { erreur: "Envoi de vidéo inconnu.", code: 403 };
  let e;
  try { e = await etatVideo(guid, SPEC_EVENEMENT); } catch (err) { return { erreur: "La vidéo n’a pas pu être vérifiée. Réessayez.", code: 502 }; }
  if (!e || e.etat !== "pret") return { erreur: e && e.erreur ? e.erreur : "Votre vidéo n’est pas encore prête. Patientez quelques instants puis réessayez.", code: 409 };
  return { url: e.urls.mp4 };
}
/* Supprime de l'hébergement une vidéo d'événement remplacée ou retirée (seulement si l'adresse est bien celle de NOTRE bibliothèque). */
async function supprimerVideoParUrl(url) {
  const h = cfg().hote; if (!h || !url) return false;
  const pref = "https://" + h + "/"; if (!String(url).startsWith(pref)) return false;
  return supprimerVideo(String(url).slice(pref.length).split("/")[0]);
}

module.exports = { verifierVideoEvenement, supprimerVideoParUrl, SPEC_EVENEMENT, registerReelsUpload, SPEC, actif, urlsLecture, etatVideo, supprimerVideo, jetonValide, jetonPour, guidValide };

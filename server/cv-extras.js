/* ══════════════════════════════════════════════════════════════════════════
   server/cv-extras.js — Module CV : médias, page publique, partage (2026-10-09)

   • Bibliothèque de médias par compte : une vidéo de 30 s OU une galerie de 1 à 4 images, liable au CV n°1,
     au CV n°2, aux deux ou à aucun (tables cv_medias / cv_media_liens, voir db.js).
   • Page publique d'un CV (cv-public.html) lue par jeton NON devinable : le CV + ses médias liés. C'est ce
     que le QR code, le bouton « Accéder aux médias », les messages WhatsApp / e-mail / messagerie ouvrent.
   • Partage du PDF par e-mail (pièce jointe + bouton « Accéder aux médias »). L'envoi vers un compte
     Diaspo'Actif réutilise la messagerie existante (mêmes règles de contact) : aucune route ici.
   • Nettoyage serveur des champs de texte enrichi du CV à l'enregistrement (jamais confiance au client).
   Enregistré par registerCvExtras() depuis server/index.js — ce fichier ne dépend de rien d'autre.
   ══════════════════════════════════════════════════════════════════════════ */
const crypto = require("crypto");
const https = require("https");
const http = require("http");
const SEC = require("./security");
const { sendEmail } = require("./mailer");

const CDN = (process.env.BUNNY_CDN_URL || "https://diaspoactif-media.b-cdn.net").replace(/\/+$/, "");
const SITE = (process.env.PUBLIC_BASE_URL || "https://diaspoactif.com").replace(/\/+$/, "");

const MAX_VIDEO = 25 * 1024 * 1024;   // une vidéo de 30 s ne dépasse pas ce poids ; refus au-delà
const MAX_IMAGES_PAR_GALERIE = 4;
const MAX_MEDIAS_PAR_COMPTE = 30;
const MAX_EMAILS_PAR_JOUR = 8;
const MAX_PDF = 15 * 1024 * 1024;

/* Un fichier n'est accepté que s'il est hébergé chez nous (CDN) : jamais une URL arbitraire dans la bibliothèque. */
function urlHebergee(u) {
  const s = String(u || "").trim();
  if (s.startsWith(CDN + "/")) return s;
  if (/^\/uploads\/[\w.\-\/]+$/.test(s)) return s;
  return null;
}
function jetonNeuf() { return crypto.randomBytes(16).toString("base64url"); }
function lienPublic(jeton) { return `${SITE}/cv-public.html?t=${encodeURIComponent(jeton)}`; }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

/* Supprime un fichier de l'hébergement Bunny (best-effort : un échec n'empêche jamais la suppression de la fiche).
   Limité aux dossiers autorisés : on ne supprime JAMAIS un fichier qui n'a pas été déposé par ce module. */
function supprimerFichierCDN(url, dossiers = ["cv-medias"]) {
  return new Promise(resolve => {
    try {
      const cle = process.env.BUNNY_API_KEY, zone = process.env.BUNNY_STORAGE_ZONE || "diaspoactif-media";
      const m = String(url || "").startsWith(CDN + "/") ? String(url).slice(CDN.length + 1).match(/^([\w-]+)\/([\w.\-]+)$/) : null;
      if (!cle || !m || !dossiers.includes(m[1])) return resolve(false);
      const rq = https.request({ method: "DELETE", hostname: "storage.bunnycdn.com", path: `/${zone}/${m[1]}/${m[2]}`, headers: { AccessKey: cle } },
        r => { r.resume(); r.on("end", () => resolve(r.statusCode === 200)); });
      rq.on("error", () => resolve(false)); rq.setTimeout(8000, () => { rq.destroy(); resolve(false); }); rq.end();
    } catch (e) { resolve(false); }
  });
}

/* ── Nettoyage du contenu d'un CV avant stockage ou affichage public ── */
function nettoyerDataCV(data) {
  const d = (data && typeof data === "object") ? data : {};
  const riche = v => SEC.sanitizeRichHtml(String(v == null ? "" : v).slice(0, 12000));
  if (typeof d.resume === "string") d.resume = riche(d.resume);
  for (const k of ["experiences", "formations"]) {
    if (Array.isArray(d[k])) d[k] = d[k].slice(0, 40).map(e => (e && typeof e === "object") ? { ...e, description: riche(e.description) } : e);
  }
  if (Array.isArray(d.blocs)) {
    d.blocs = d.blocs.slice(0, 12).filter(b => b && typeof b === "object").map(b => ({
      id: b.id, titre: String(b.titre || "").slice(0, 120), texte: riche(b.texte),
    }));
  }
  return d;
}

/* Version publique : sans les médias enregistrés localement (liens « blob: » inutilisables hors de la page
   d'origine) ni rien qui ne soit un affichage. La photo et la signature doivent être des images. */
function dataPublique(data) {
  const d = nettoyerDataCV(JSON.parse(JSON.stringify(data || {})));
  const imgOk = u => typeof u === "string" && (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(u) || /^https?:\/\//i.test(u));
  if (d.photo && !imgOk(d.photo.url)) d.photo = { ...d.photo, url: "", show: false };
  d.media = {
    signature: imgOk(d.media?.signature) ? d.media.signature : null,
    audio: /^https?:\/\//i.test(d.media?.audio || "") ? d.media.audio : null,
    video: /^https?:\/\//i.test(d.media?.video || "") ? d.media.video : null,
    qr: { enabled: false },
  };
  return d;
}

function lireMedia(m) {
  let urls = []; try { urls = JSON.parse(m.urls_json || "[]"); } catch (e) {}
  return { id: Number(m.id), kind: m.kind, titre: m.titre || "", urls: urls.filter(urlHebergee), duree_s: m.duree_s == null ? null : Number(m.duree_s) };
}

/* Garantit qu'un CV a son jeton de partage (créé au premier besoin) et le renvoie. */
async function assurerJetonCV(db, cvId) {
  const row = await db.prepare("SELECT partage_token FROM cv_profiles WHERE id=?").get(cvId);
  if (row && row.partage_token) return row.partage_token;
  const j = jetonNeuf();
  await db.prepare("UPDATE cv_profiles SET partage_token=? WHERE id=? AND (partage_token IS NULL OR partage_token='')").run(j, cvId);
  return (await db.prepare("SELECT partage_token FROM cv_profiles WHERE id=?").get(cvId))?.partage_token || j;
}

module.exports.nettoyerDataCV = nettoyerDataCV;
module.exports.jetonNeuf = jetonNeuf;
module.exports.lienPublic = lienPublic;
module.exports.assurerJetonCV = assurerJetonCV;
module.exports.supprimerFichierCDN = supprimerFichierCDN;

module.exports.registerCvExtras = function registerCvExtras(deps) {
  const { route, db, sendJSON, getCurrentUser, nomCompteAffichage } = deps;

  const assurerJeton = cvId => assurerJetonCV(db, cvId);

  async function mediasDuCV(userId, numero) {
    const rows = await db.prepare(`SELECT m.* FROM cv_medias m JOIN cv_media_liens l ON l.media_id=m.id
      WHERE m.user_id=? AND l.cv_numero=? ORDER BY m.id ASC`).all(userId, numero);
    return rows.map(lireMedia);
  }

  /* ───────────── Envoi de fichiers : images (galerie) et vidéos (30 s) ───────────── */
  route("POST", "/api/upload/cv-media", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Non authentifié" });
    const lim = SEC.rateLimit(`cvmedia-up:${user.id}`, 40, 3600000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Trop d'envois. Réessayez dans ${lim.retryAfter}s.` });
    const contentType = req.headers["content-type"] || "";
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) return sendJSON(res, 400, { error: "Format invalide" });
    const chunks = []; req.on("data", c => chunks.push(c));
    await new Promise(r => req.on("end", r));
    const body = Buffer.concat(chunks);
    const { uploadToBunny, parseMultipart, uniqueFilename, compressImage } = require("./upload");
    const { files } = parseMultipart(body, boundaryMatch[1]);
    const file = files["cv-media"] || files["file"] || files[Object.keys(files)[0]];
    if (!file) return sendJSON(res, 400, { error: "Aucun fichier reçu" });
    const b = file.buffer;
    const vid = SEC.isSafeVideo(b);
    const img = vid ? null : SEC.isSafeRasterImage(b);
    if (!vid && !img) return sendJSON(res, 400, { error: "Format non valide : une vidéo MP4/WebM ou des images JPEG, PNG, WebP." });
    if (vid && b.length > MAX_VIDEO) return sendJSON(res, 400, { error: "Vidéo trop lourde (max 25 Mo pour 30 secondes)." });
    if (img && b.length > 8 * 1024 * 1024) return sendJSON(res, 400, { error: "Image trop lourde (max 8 Mo)." });
    try {
      let url;
      if (vid) {
        url = await uploadToBunny(b, `${user.id}-${Date.now()}.${vid.split("/")[1]}`, "cv-medias");
      } else {
        const comp = await compressImage(b, "post");
        url = await uploadToBunny(comp, uniqueFilename(file.filename, user.id), "cv-medias");
      }
      SEC.logSecurity("upload", { uid: Number(user.id), kind: "cv_media", type: vid || img, size: b.length });
      sendJSON(res, 200, { url, kind: vid ? "video" : "image" });
    } catch (e) { sendJSON(res, 500, SEC.safeError(e, "upload cv-media")); }
  });

  /* ───────────── Bibliothèque de médias ───────────── */
  route("GET", "/api/cv-medias", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const rows = await db.prepare("SELECT * FROM cv_medias WHERE user_id=? ORDER BY id DESC").all(user.id);
    const liens = await db.prepare(`SELECT l.media_id, l.cv_numero FROM cv_media_liens l JOIN cv_medias m ON m.id=l.media_id WHERE m.user_id=?`).all(user.id);
    const medias = rows.map(m => ({
      ...lireMedia(m),
      numeros: liens.filter(l => Number(l.media_id) === Number(m.id)).map(l => Number(l.cv_numero)).sort(),
    }));
    sendJSON(res, 200, { medias, max: MAX_MEDIAS_PAR_COMPTE });
  });

  async function poserLiens(mediaId, numeros) {
    await db.prepare("DELETE FROM cv_media_liens WHERE media_id=?").run(mediaId);
    for (const n of numeros) await db.prepare("INSERT INTO cv_media_liens (media_id, cv_numero) VALUES (?,?)").run(mediaId, n);
  }
  const numerosValides = v => [...new Set((Array.isArray(v) ? v : []).map(Number).filter(n => n === 1 || n === 2))];

  route("POST", "/api/cv-medias", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const kind = body?.kind === "video" ? "video" : (body?.kind === "galerie" ? "galerie" : null);
    if (!kind) return sendJSON(res, 400, { error: "Type de média invalide (vidéo ou images)." });
    const urls = (Array.isArray(body.urls) ? body.urls : []).map(urlHebergee).filter(Boolean);
    if (kind === "video" && urls.length !== 1) return sendJSON(res, 400, { error: "Une vidéo : un seul fichier." });
    if (kind === "galerie" && (urls.length < 1 || urls.length > MAX_IMAGES_PAR_GALERIE)) return sendJSON(res, 400, { error: `Une galerie contient de 1 à ${MAX_IMAGES_PAR_GALERIE} images.` });
    const dejaLa = (await db.prepare("SELECT COUNT(*) n FROM cv_medias WHERE user_id=?").get(user.id))?.n || 0;
    if (Number(dejaLa) >= MAX_MEDIAS_PAR_COMPTE) return sendJSON(res, 400, { error: `Limite de ${MAX_MEDIAS_PAR_COMPTE} médias atteinte : supprimez-en avant d'en ajouter.` });
    const duree = kind === "video" ? Math.max(0, Math.min(30, Math.round(Number(body.duree_s) || 0))) : null;
    if (kind === "video" && Number(body.duree_s) > 31) return sendJSON(res, 400, { error: "Une vidéo de CV dure 30 secondes au maximum." });
    const titre = String(body.titre || "").trim().slice(0, 80) || (kind === "video" ? "Ma vidéo" : "Mes images");
    const id = Number((await db.prepare("INSERT INTO cv_medias (user_id, kind, titre, urls_json, duree_s) VALUES (?,?,?,?,?)")
      .run(user.id, kind, titre, JSON.stringify(urls), duree)).lastInsertRowid);
    await poserLiens(id, numerosValides(body.numeros));
    sendJSON(res, 201, { id });
  });

  route("PUT", "/api/cv-medias/:id", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const m = await db.prepare("SELECT id FROM cv_medias WHERE id=? AND user_id=?").get(params.id, user.id);
    if (!m) return sendJSON(res, 404, { error: "Média introuvable." });
    if (body && typeof body.titre === "string") {
      await db.prepare("UPDATE cv_medias SET titre=? WHERE id=?").run(body.titre.trim().slice(0, 80), m.id);
    }
    if (body && Array.isArray(body.numeros)) await poserLiens(m.id, numerosValides(body.numeros));
    sendJSON(res, 200, { ok: true });
  });

  /* Supprimer = retirer de TOUS les CV (le délier d'un seul CV passe par PUT avec la liste des numéros). */
  route("DELETE", "/api/cv-medias/:id", async (req, res, params) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const m = await db.prepare("SELECT id, urls_json FROM cv_medias WHERE id=? AND user_id=?").get(params.id, user.id);
    if (!m) return sendJSON(res, 404, { error: "Média introuvable." });
    await db.prepare("DELETE FROM cv_media_liens WHERE media_id=?").run(m.id);
    await db.prepare("DELETE FROM cv_medias WHERE id=?").run(m.id);
    /* Les fichiers disparaissent aussi de l'hébergement : un média supprimé ne reste pas lisible par son adresse. */
    let urls = []; try { urls = JSON.parse(m.urls_json || "[]"); } catch (e) {}
    await Promise.all(urls.map(u => supprimerFichierCDN(u)));
    sendJSON(res, 200, { deleted: true });
  });

  /* ───────────── Page publique d'un CV ───────────── */
  route("GET", "/api/cv-public/:token", async (req, res, params) => {
    const ip = SEC.clientIp(req);
    const lim = SEC.rateLimit(`cvpub:${ip}`, 120, 60000);
    if (!lim.allowed) return sendJSON(res, 429, { error: "Trop de requêtes. Réessayez dans un instant." });
    const jeton = String(params.token || "");
    if (!/^[\w-]{16,64}$/.test(jeton)) return sendJSON(res, 404, { error: "Ce CV n'est pas disponible." });
    const cv = await db.prepare("SELECT * FROM cv_profiles WHERE partage_token=?").get(jeton);
    if (!cv || Number(cv.partage_actif) === 0) return sendJSON(res, 404, { error: "Ce CV n'est pas disponible." });
    let data = {}; try { data = JSON.parse(cv.data_json || "{}"); } catch (e) {}
    const medias = await mediasDuCV(cv.user_id, Number(cv.numero));
    const moi = await getCurrentUser(req).catch(() => null);
    sendJSON(res, 200, {
      titre: cv.titre || "CV", numero: Number(cv.numero), theme: cv.theme || "bleu",
      data: dataPublique(data), medias,
      proprietaire: !!(moi && Number(moi.id) === Number(cv.user_id)),
      mis_a_jour: cv.updated_at || null,
    });
  });

  /* Liste de MES CV avec leur lien de partage (écran de lecture sur téléphone). */
  route("GET", "/api/cv-lecture", async (req, res) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const cvs = await db.prepare("SELECT id, numero, titre, updated_at, partage_actif FROM cv_profiles WHERE user_id=? ORDER BY numero").all(user.id);
    const out = [];
    for (const c of cvs) {
      const jeton = await assurerJeton(c.id);
      const nb = (await mediasDuCV(user.id, Number(c.numero))).length;
      out.push({ id: Number(c.id), numero: Number(c.numero), titre: c.titre || "Mon CV", mis_a_jour: c.updated_at, actif: Number(c.partage_actif) !== 0, jeton, lien: lienPublic(jeton), medias: nb });
    }
    sendJSON(res, 200, { cvs: out });
  });

  /* Régénérer le lien (l'ancien QR / lien cesse de fonctionner) ou couper / rétablir la page publique. */
  route("POST", "/api/cv/partage", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const numero = Number(body?.numero);
    if (numero !== 1 && numero !== 2) return sendJSON(res, 400, { error: "Numéro de CV invalide." });
    const cv = await db.prepare("SELECT id FROM cv_profiles WHERE user_id=? AND numero=?").get(user.id, numero);
    if (!cv) return sendJSON(res, 404, { error: "Enregistrez d'abord ce CV." });
    const action = String(body?.action || "");
    if (action === "regenerer") {
      const j = jetonNeuf();
      await db.prepare("UPDATE cv_profiles SET partage_token=?, partage_actif=1 WHERE id=?").run(j, cv.id);
      return sendJSON(res, 200, { jeton: j, lien: lienPublic(j), actif: true });
    }
    if (action === "desactiver" || action === "activer") {
      await db.prepare("UPDATE cv_profiles SET partage_actif=? WHERE id=?").run(action === "activer" ? 1 : 0, cv.id);
      const j = await assurerJeton(cv.id);
      return sendJSON(res, 200, { jeton: j, lien: lienPublic(j), actif: action === "activer" });
    }
    sendJSON(res, 400, { error: "Action invalide." });
  });

  /* ───────────── Envoi du PDF par e-mail ───────────── */
  function telecharger(url) {
    return new Promise((resolve, reject) => {
      const lib = url.startsWith("https:") ? https : http;
      const rq = lib.get(url, r => {
        if (r.statusCode !== 200) { r.resume(); return reject(new Error("PDF illisible (" + r.statusCode + ")")); }
        const parts = []; let n = 0;
        r.on("data", c => { n += c.length; if (n > MAX_PDF) { rq.destroy(); return reject(new Error("PDF trop volumineux")); } parts.push(c); });
        r.on("end", () => resolve(Buffer.concat(parts)));
      });
      rq.on("error", reject);
      rq.setTimeout(15000, () => { rq.destroy(); reject(new Error("Délai dépassé")); });
    });
  }

  route("POST", "/api/cv/partager-email", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    if (user.email_verifie != null && !Number(user.email_verifie)) {
      return sendJSON(res, 403, { error: "Confirmez d'abord votre adresse e-mail pour pouvoir envoyer un CV par e-mail." });
    }
    const email = SEC.normalizeEmail(body?.email || "");
    if (!email || !SEC.isValidEmail(email)) return sendJSON(res, 400, { error: "Adresse e-mail du destinataire invalide." });
    const pdf = urlHebergee(body?.pdf_url);
    if (!pdf || !/\.pdf$/i.test(pdf)) return sendJSON(res, 400, { error: "Le PDF doit d'abord être généré." });
    const numero = Number(body?.numero) === 2 ? 2 : 1;
    const message = String(body?.message || "").trim().slice(0, 600);

    const deja = Number((await db.prepare("SELECT COUNT(*) n FROM cv_partages WHERE user_id=? AND canal='email' AND created_at >= datetime('now','-1 day')").get(user.id))?.n) || 0;
    if (deja >= MAX_EMAILS_PAR_JOUR) return sendJSON(res, 429, { error: `Limite de ${MAX_EMAILS_PAR_JOUR} CV envoyés par e-mail par jour atteinte.` });
    const lim = SEC.rateLimit(`cvmail:${user.id}`, 5, 10 * 60000);
    if (!lim.allowed) return sendJSON(res, 429, { error: `Un peu de patience : réessayez dans ${lim.retryAfter}s.` });

    const cv = await db.prepare("SELECT id, titre, partage_actif FROM cv_profiles WHERE user_id=? AND numero=?").get(user.id, numero);
    let lienMedias = null, nbMedias = 0;
    if (cv && Number(cv.partage_actif) !== 0) {
      lienMedias = lienPublic(await assurerJeton(cv.id));
      nbMedias = (await mediasDuCV(user.id, numero)).length;
    }

    let buf;
    try { buf = await telecharger(pdf.startsWith("/") ? SITE + pdf : pdf); }
    catch (e) { return sendJSON(res, 502, { error: "Impossible de joindre le PDF : " + e.message }); }
    if (buf.slice(0, 4).toString() !== "%PDF") return sendJSON(res, 400, { error: "Ce fichier n'est pas un PDF." });

    const expediteur = (await nomCompteAffichage(user.id)) || "Un membre de Diaspo'Actif";
    const titre = (cv?.titre || "CV").replace(/[^\w À-ÿ'’.\-]+/g, "").trim() || "CV";
    const bouton = (href, texte, plein) => `<a href="${esc(href)}" style="display:inline-block;margin:6px 6px 0 0;padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px;text-decoration:none;${plein ? "background:#1a3a5c;color:#ffffff;" : "background:#ffffff;color:#1a3a5c;border:2px solid #1a3a5c;"}">${texte}</a>`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2b4a;line-height:1.55;">
      <h2 style="margin:0 0 10px;font-size:20px;">${esc(expediteur)} vous envoie son CV</h2>
      ${message ? `<p style="margin:0 0 14px;padding:10px 14px;background:#f3f6fb;border-radius:8px;white-space:pre-wrap;">${esc(message)}</p>` : ""}
      <p style="margin:0 0 12px;">Son CV « ${esc(titre)} » est joint à ce message au format PDF.</p>
      <div>${lienMedias ? bouton(lienMedias + (nbMedias > 0 ? "&vue=medias" : ""), nbMedias > 0 ? "▶ Accéder aux médias" : "Voir le CV en ligne", true) : ""}${bouton(pdf.startsWith("/") ? SITE + pdf : pdf, "📄 Télécharger le PDF", !lienMedias)}</div>
      ${nbMedias > 0 ? `<p style="margin:12px 0 0;font-size:13px;color:#52606d;">Le bouton « Accéder aux médias » ouvre sa vidéo et ses images, avec son CV.</p>` : ""}
      <p style="margin:22px 0 0;font-size:12px;color:#8a97a8;">Envoyé via Diaspo'Actif au nom de ${esc(expediteur)}. Vous pouvez répondre à ce message : votre réponse lui sera adressée.</p>
    </div>`;
    const r = await sendEmail({
      to: email, subject: `${expediteur} vous envoie son CV`, html,
      attachments: [{ filename: `${titre.replace(/\s+/g, "_")}.pdf`, content: buf.toString("base64") }],
      replyTo: user.email || undefined,
    });
    if (!r.ok) return sendJSON(res, 502, { error: r.reason === "no_key" ? "L'envoi d'e-mails n'est pas disponible pour le moment." : "L'e-mail n'a pas pu être envoyé. Réessayez plus tard." });
    await db.prepare("INSERT INTO cv_partages (user_id, cv_numero, canal, destinataire) VALUES (?,?,?,?)").run(user.id, numero, "email", email);
    sendJSON(res, 200, { ok: true, medias: nbMedias, lien: lienMedias });
  });

  /* Journalisation des autres canaux (WhatsApp, messagerie) : pas d'effet, seulement le décompte. */
  route("POST", "/api/cv/partage-journal", async (req, res, params, body) => {
    const user = await getCurrentUser(req);
    if (!user) return sendJSON(res, 401, { error: "Connexion requise." });
    const canal = ["whatsapp", "diaspoactif"].includes(body?.canal) ? body.canal : null;
    if (!canal) return sendJSON(res, 400, { error: "Canal invalide." });
    await db.prepare("INSERT INTO cv_partages (user_id, cv_numero, canal, destinataire) VALUES (?,?,?,?)")
      .run(user.id, Number(body?.numero) === 2 ? 2 : 1, canal, String(body?.destinataire || "").slice(0, 80) || null);
    sendJSON(res, 200, { ok: true });
  });
};

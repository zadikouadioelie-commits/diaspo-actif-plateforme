/* ===========================================================
   DIASPO'ACTIF — Module de sécurité, validation & résilience
   Sans dépendance externe (Node natif uniquement), à UNE exception
   volontaire : sanitize-html (section 7 ci-dessous) — la sanitisation
   anti-XSS d'un contenu HTML riche saisi par l'utilisateur est un
   domaine où une librairie éprouvée (des années de cas limites/
   contournements corrigés) l'emporte largement sur du code maison,
   contrairement au reste de ce fichier (détection de type de
   fichier, validation, rate-limiting...) qui reste par nature
   suffisamment simple pour rester en Node natif. Décision actée
   avec l'utilisateur (2026-09-25, demande explicite "éditeur de
   texte enrichi réutilisable").
   Regroupe : en-têtes HTTP de sécurité, rate-limiting,
   validation/nettoyage des entrées, détection de type de
   fichier, messages d'erreur sûrs, journalisation, sanitisation
   HTML riche.
   =========================================================== */
const crypto = require("node:crypto");
const sanitizeHtml = require("sanitize-html");

/* ---------------------------------------------------------------
   1. EN-TÊTES HTTP DE SÉCURITÉ
   Appliqués à CHAQUE réponse via le handler central.
   CSP adaptée : le site a 1378 handlers inline → 'unsafe-inline'
   obligatoire pour scripts/styles. On restreint le reste.
--------------------------------------------------------------- */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
  /* jsdelivr : uniquement pour charger les contours réels des continents (world-atlas,
     carte animée du hero — 2026-08-19). Le script d3-geo/topojson lui-même était déjà
     autorisé via script-src ci-dessus ; connect-src devait l'être aussi pour le fetch()
     des données topojson elles-mêmes. */
  "connect-src 'self' https://diaspoactif-media.b-cdn.net https://cdn.jsdelivr.net",
  "media-src 'self' data: blob: https:",
  /* frame-src : lecteur YouTube intégré dans la modale des vidéos tutoriels (2026-09-18) —
     sans cette directive, "default-src 'self'" bloque silencieusement tout <iframe> vers un
     domaine externe, y compris youtube.com. */
  "frame-src 'self' https://www.youtube.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

function applySecurityHeaders(res) {
  try {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    res.setHeader("Permissions-Policy", "geolocation=(self), microphone=(self), camera=(self), payment=()");
    res.setHeader("X-XSS-Protection", "0"); // obsolète, désactivé au profit de CSP
    if (res.removeHeader) res.removeHeader("X-Powered-By");
  } catch (_) { /* headers déjà envoyés — on ignore */ }
}

/* ---------------------------------------------------------------
   2. RATE-LIMITING (fenêtre glissante en mémoire)
   Note : sur Vercel serverless la mémoire n'est pas partagée
   entre invocations → protection best-effort. Le login utilise
   EN PLUS un suivi persistant en base (voir index.js).
--------------------------------------------------------------- */
const _buckets = new Map();

function rateLimit(key, maxRequests, windowMs) {
  const now = Date.now();
  let hits = _buckets.get(key);
  if (!hits) { hits = []; _buckets.set(key, hits); }
  while (hits.length && hits[0] <= now - windowMs) hits.shift();
  if (hits.length >= maxRequests) {
    const retryAfter = Math.ceil((hits[0] + windowMs - now) / 1000);
    return { allowed: false, retryAfter };
  }
  hits.push(now);
  return { allowed: true, remaining: maxRequests - hits.length };
}

const _cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, hits] of _buckets) {
    while (hits.length && hits[0] <= now - 3600000) hits.shift();
    if (!hits.length) _buckets.delete(key);
  }
}, 600000);
if (_cleanup.unref) _cleanup.unref();

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

/* ---------------------------------------------------------------
   3. VALIDATION & NETTOYAGE DES ENTRÉES
--------------------------------------------------------------- */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE   = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;
const PHONE_RE = /^[+]?[0-9\s().-]{6,20}$/;

function isValidEmail(s)  { return typeof s === "string" && s.length <= 254 && EMAIL_RE.test(s); }
function isValidUrl(s)    { return typeof s === "string" && s.length <= 2048 && URL_RE.test(s); }
function isValidPhone(s)  { return typeof s === "string" && PHONE_RE.test(s); }
function normalizeEmail(s){ return typeof s === "string" ? s.trim().toLowerCase() : ""; }

/* Retire les caractères de contrôle, limite la longueur, trim. */
function sanitizeString(s, maxLen = 5000) {
  if (typeof s !== "string") return "";
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").slice(0, maxLen).trim();
}

/* Échappement HTML (défense en profondeur contre XSS côté rendu). */
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/* ---------------------------------------------------------------
   4. DÉTECTION DE TYPE DE FICHIER PAR SIGNATURE (magic bytes)
   Empêche de faire passer un exécutable/HTML pour une image.
--------------------------------------------------------------- */
function sniffImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return "image/png";
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  const head = b.slice(0, 1024).toString("utf8").toLowerCase();
  if (head.includes("<svg")) return "image/svg+xml";
  return null;
}

/* Un SVG peut contenir du JS → refusé par défaut pour avatars/bannières. */
const SAFE_RASTER = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
function isSafeRasterImage(buffer) {
  const t = sniffImageType(buffer);
  return t && SAFE_RASTER.has(t) ? t : null;
}

/* Détecte les formats intrinsèquement dangereux à héberger/servir (HTML actif, exécutables),
   pour les endpoints qui acceptent volontairement "tout type de fichier" (ex. pièces jointes
   libres) mais ne doivent pas devenir un vecteur XSS stocké ou de distribution de malware. */
function isDangerousFile(buffer) {
  if (!buffer || !buffer.length) return false;
  const head = buffer.slice(0, 512).toString("utf8").toLowerCase();
  if (/<!doctype\s+html|<html[\s>]|<script[\s>]/.test(head)) return true; // HTML/JS actif
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) return true; // MZ — exécutable Windows (PE)
  if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) return true; // ELF — exécutable Linux
  if (buffer[0] === 0x23 && buffer[1] === 0x21) return true; // #! — script shebang
  return false;
}

/* Vérifie que le fichier est bien une vidéo MP4/WebM par ses magic bytes (pas juste l'extension). */
function isSafeVideo(buffer) {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "video/mp4"; // ftyp
  if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return "video/webm";
  return null;
}

/* ---------------------------------------------------------------
   5. MESSAGES D'ERREUR SÛRS
   Renvoie un message générique au client, journalise le détail.
--------------------------------------------------------------- */
function safeError(e, context = "") {
  const id = crypto.randomBytes(4).toString("hex");
  const detail = e && e.message ? e.message : String(e);
  console.error(`[erreur ${id}]${context ? " " + context : ""}: ${detail}`);
  return { error: "Une erreur interne est survenue. Réessayez.", ref: id };
}

/* ---------------------------------------------------------------
   6. JOURNALISATION D'ÉVÉNEMENTS DE SÉCURITÉ
--------------------------------------------------------------- */
function logSecurity(event, data = {}) {
  const line = { t: new Date().toISOString(), event, ...data };
  console.log("[security]", JSON.stringify(line));
}

/* ---------------------------------------------------------------
   7. SANITISATION HTML RICHE (assets/rich-editor.js, 2026-09-25)
   Point de passage OBLIGATOIRE avant toute écriture en base d'un
   champ édité par le composant d'édition riche — jamais fait
   confiance au HTML envoyé par le client, même pour un compte admin
   (voir faq.reponse, corrigé le même jour : affiché SANS échappement
   depuis le début, donc un vecteur XSS stocké tant que la sauvegarde
   elle-même n'est pas nettoyée ici). Liste blanche stricte, calée
   sur la barre d'outils demandée — rien de plus (pas d'images, pas
   d'iframes, pas de tableaux) : ce que l'éditeur ne sait pas
   produire, le nettoyeur ne doit pas l'accepter non plus.
--------------------------------------------------------------- */
const RICH_HTML_OPTIONS = {
  allowedTags: ["p", "br", "strong", "b", "em", "i", "u", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "a"],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    // `style` doit être explicitement listé ici pour que allowedStyles (ci-dessous) ait quoi
    // que ce soit à filtrer — sans ça, sanitize-html retire l'attribut style en entier avant
    // même de regarder son contenu (vérifié en testant : "text-align:center" disparaissait
    // silencieusement malgré allowedStyles seul). Tous les blocs pouvant recevoir un alignement
    // (execCommand justifyLeft/Center/Right agit sur le bloc englobant le curseur, quel qu'il
    // soit parmi ceux-ci).
    p: ["style"], h2: ["style"], h3: ["style"], h4: ["style"], blockquote: ["style"], li: ["style"],
  },
  // http(s)/mailto uniquement — bloque javascript:/data: et autres schémas actifs.
  allowedSchemes: ["http", "https", "mailto"],
  // Alignement (execCommand justifyLeft/Center/Right) : seule propriété de style tolérée,
  // et seulement ces 3 valeurs — jamais de style arbitraire (fuite de mise en page/exfiltration
  // via des sélecteurs CSS exotiques).
  allowedStyles: { "*": { "text-align": [/^left$/, /^center$/, /^right$/] } },
  // Un lien fabriqué par l'éditeur n'a jamais target/rel — ajoutés systématiquement ici plutôt
  // que de faire confiance à ce que le client aurait pu envoyer (rel manquant = vulnérable au
  // tabnabbing ; voir la CSP déjà en place pour le reste du site, même logique de défense
  // "jamais confiance dans ce qui vient du client").
  transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
  disallowedTagsMode: "discard",
};
function sanitizeRichHtml(html) {
  if (typeof html !== "string" || !html.trim()) return "";
  return sanitizeHtml(html, RICH_HTML_OPTIONS).trim();
}

module.exports = {
  applySecurityHeaders,
  rateLimit,
  clientIp,
  isValidEmail, isValidUrl, isValidPhone, normalizeEmail,
  sanitizeString, escapeHtml,
  sniffImageType, isSafeRasterImage, isSafeVideo, isDangerousFile,
  safeError, logSecurity,
  sanitizeRichHtml,
};

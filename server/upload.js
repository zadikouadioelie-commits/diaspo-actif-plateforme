/* ── Upload Bunny.net — Diaspo'Actif ── */
const https = require("https");
const { URL } = require("url");
const sharp = require("sharp");

/* Compression/redimensionnement à l'upload (2026-09-17, demande explicite : "compresser
   partout pareil"). Avant ceci, chaque route d'upload stockait le fichier reçu tel quel sur
   Bunny CDN, quelle que soit sa résolution d'origine — un avatar uploadé en 4000x3000 était
   par exemple servi intégralement pour un cercle de 40 à 90px affiché partout sur la
   plateforme (bandeau, posts, annuaire...). Choix délibérés pour ne JAMAIS changer le rendu
   visuel :
   - fit:"inside" partout (jamais "cover") : l'image est seulement réduite si elle dépasse la
     taille max, en conservant tout son cadrage d'origine — aucun recadrage serveur qui
     pourrait différer du object-fit:cover déjà appliqué côté client sur certaines vignettes.
   - withoutEnlargement:true : une image déjà plus petite que la limite n'est jamais agrandie.
   - qualité 85 (JPEG/WebP) : seuil standard où la perte est imperceptible à l'usage normal
     (zoom raisonnable inclus), pour un gain de poids substantiel.
   - GIF jamais retouché : sharp ne préserve l'animation qu'avec un traitement dédié plus
     lourd (option animated:true) — un GIF statique reste petit par nature, donc on privilégie
     ici la sûreté (ne jamais casser une animation) à un gain marginal.
   - Échec de compression (fichier corrompu, format exotique...) → on stocke l'original tel
     quel plutôt que de faire échouer tout l'upload : cette étape ne doit jamais être un point
     de blocage supplémentaire. */
const IMAGE_MAX_DIMENSION = {
  avatar: 600, banner: 1600, "vitrine-banniere": 1600, logo: 800,
  post: 1600, produit: 1600, evenement: 1600, cagnotte: 1600, document: 1600, invitation: 1600,
};

async function compressImage(buffer, kind) {
  const maxDim = IMAGE_MAX_DIMENSION[kind];
  if (!maxDim) return buffer; // kind inconnu : on ne touche à rien plutôt que de deviner
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.format === "gif") return buffer;
    let img = sharp(buffer).rotate(); // applique l'orientation EXIF puis la retire (photos prises verticalement au téléphone)
    img = img.resize({ width: maxDim, height: maxDim, fit: "inside", withoutEnlargement: true });
    if (meta.format === "png") img = img.png({ quality: 85, palette: true, compressionLevel: 9 });
    else if (meta.format === "webp") img = img.webp({ quality: 85 });
    else img = img.jpeg({ quality: 85, mozjpeg: true });
    const out = await img.toBuffer();
    // Filet de sécurité : si le résultat est plus lourd que l'original (arrive sur de petites
    // images déjà bien compressées), on garde l'original plutôt que d'empirer les choses.
    return out.length < buffer.length ? out : buffer;
  } catch (e) {
    console.error("[compressImage]", kind, e.message);
    return buffer;
  }
}

const BUNNY_API_KEY    = process.env.BUNNY_API_KEY;
const BUNNY_ZONE       = process.env.BUNNY_STORAGE_ZONE || "diaspoactif-media";
const BUNNY_CDN_URL    = process.env.BUNNY_CDN_URL || "https://diaspoactif-media.b-cdn.net";
const BUNNY_REGION_URL = "storage.bunnycdn.com";

/* Upload un buffer vers Bunny.net et retourne l'URL CDN publique */
async function uploadToBunny(buffer, filename, folder = "avatars") {
  if (!BUNNY_API_KEY) throw new Error("BUNNY_API_KEY manquant");

  const path = `/${BUNNY_ZONE}/${folder}/${filename}`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: BUNNY_REGION_URL,
      path,
      method: "PUT",
      headers: {
        "AccessKey": BUNNY_API_KEY,
        "Content-Type": "application/octet-stream",
        "Content-Length": buffer.length
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", d => data += d);
      res.on("end", () => {
        if (res.statusCode === 201) {
          resolve(`${BUNNY_CDN_URL}/${folder}/${filename}`);
        } else {
          reject(new Error(`Bunny upload failed: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on("error", reject);
    req.write(buffer);
    req.end();
  });
}

/* Parse un multipart/form-data simple et retourne { fields, files } */
function parseMultipart(body, boundary) {
  const parts = [];
  const boundaryBuf = Buffer.from("--" + boundary);
  let start = 0;

  while (true) {
    const idx = body.indexOf(boundaryBuf, start);
    if (idx === -1) break;
    const end = body.indexOf(boundaryBuf, idx + boundaryBuf.length);
    if (end === -1) break;
    const part = body.slice(idx + boundaryBuf.length + 2, end - 2);
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd === -1) { start = end; continue; }
    const headerStr = part.slice(0, headerEnd).toString();
    const content = part.slice(headerEnd + 4);
    parts.push({ headers: headerStr, content });
    start = end;
  }

  const fields = {};
  const files = {};

  for (const p of parts) {
    const nameMatch = p.headers.match(/name="([^"]+)"/);
    const filenameMatch = p.headers.match(/filename="([^"]+)"/);
    if (!nameMatch) continue;
    const name = nameMatch[1];
    if (filenameMatch) {
      const contentTypeMatch = p.headers.match(/Content-Type:\s*(\S+)/i);
      files[name] = {
        filename: filenameMatch[1],
        contentType: contentTypeMatch ? contentTypeMatch[1] : "application/octet-stream",
        buffer: p.content
      };
    } else {
      fields[name] = p.content.toString().trim();
    }
  }

  return { fields, files };
}

/* Génère un nom de fichier unique */
function uniqueFilename(originalName, userId) {
  const ext = originalName.split(".").pop().toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const safe = ["jpg","jpeg","png","gif","webp"].includes(ext) ? ext : "jpg";
  return `${userId}-${Date.now()}.${safe}`;
}

module.exports = { uploadToBunny, parseMultipart, uniqueFilename, compressImage };

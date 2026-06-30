/* ── Upload Bunny.net — Diaspo'Actif ── */
const https = require("https");
const { URL } = require("url");

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

module.exports = { uploadToBunny, parseMultipart, uniqueFilename };

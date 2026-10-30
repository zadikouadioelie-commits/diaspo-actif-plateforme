/* Images d'événement → CDN (2026-10-30, demande explicite : « occupe-toi des images sur le CDN »).
   Avant, le formulaire d'événement envoyait les photos en base64 (data:image/…) et elles étaient écrites TELLES QUELLES dans la base : la liste des événements
   pesait déjà 1,6 Mo (dont 1,1 Mo pour un seul événement) alors que l'hébergeur refuse toute réponse de plus de 4,5 Mo — la page des événements se serait
   un jour arrêtée de charger. Désormais, toute image reçue en base64 est envoyée sur le CDN (même dossier « evenements » que /api/upload/evenement) et seule
   son ADRESSE est enregistrée.

   Règle de sûreté : on ne perd JAMAIS une image. Si l'envoi échoue (clé du CDN absente en local, hébergeur indisponible, fichier suspect), la valeur d'origine
   est conservée telle quelle — l'événement s'enregistre comme avant et la migration (server/migrer-images-cdn.js) la reprendra plus tard.

   rognerBandesLaterales : réservé à la migration des anciennes affiches, enfermées avant le 30/10 dans un cadre fixe 2:1 (1200×600) avec des bandes unies
   à gauche et à droite. Mêmes garde-fous que le rognage d'affichage d'evenements-app.html (daRognerBandes) : format ≈ 2:1, bandes symétriques de la couleur
   des coins, bord net de l'affiche — une affiche à fond uni n'est jamais touchée. */
const crypto = require("crypto");
const sharp = require("sharp");
const SEC = require("./security");
const { uploadToBunny, compressImage } = require("./upload");

const MAX_OCTETS = 8 * 1024 * 1024;

function lireDataUri(v) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(v || ""));
  if (!m) return null;
  return { type: m[1].toLowerCase(), buffer: Buffer.from(m[2].replace(/\s/g, ""), "base64") };
}

async function rognerBandesLaterales(buffer) {
  const { data, info } = await sharp(buffer).rotate().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  if (!W || !H || Math.abs(W / H - 2) > 0.06) return buffer;
  const px = (x, y) => { const o = (y * W + x) * 3; return [data[o], data[o + 1], data[o + 2]]; };
  const k = px(1, 1), seuil = 36;
  const ecart = a => Math.abs(a[0] - k[0]) + Math.abs(a[1] - k[1]) + Math.abs(a[2] - k[2]);
  for (const [a, b] of [[W - 2, 1], [1, H - 2], [W - 2, H - 2]]) if (ecart(px(a, b)) >= seuil) return buffer;
  const diff = x => { let n = 0, t = 0; for (let y = 0; y < H; y += 2) { t++; if (ecart(px(x, y)) >= seuil) n++; } return n / t; };
  let g = 0, d = W - 1;
  while (g < W / 2 && diff(g) === 0) g++;
  while (d > W / 2 && diff(d) === 0) d--;
  const gauche = g, droite = W - 1 - d;
  if (gauche < W * 0.03 || Math.abs(gauche - droite) > W * 0.04) return buffer;
  const bord = Math.min(Math.max(diff(g), diff(g + 1), diff(g + 2)), Math.max(diff(d), diff(d - 1), diff(d - 2)));
  if (bord < 0.25) return buffer;
  const cw = d - g + 1;
  if (cw < W * 0.4) return buffer;
  return sharp(buffer).rotate().extract({ left: g, top: 0, width: cw, height: H }).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}

/* data:image/…;base64,… → adresse CDN. Toute autre valeur (adresse déjà publique, vide, format inconnu) est rendue inchangée. */
async function imageVersCdn(valeur, ownerId, opts) {
  if (typeof valeur !== "string" || !valeur.startsWith("data:image/")) return valeur;
  const p = lireDataUri(valeur);
  if (!p || !p.buffer.length || p.buffer.length > MAX_OCTETS || !SEC.isSafeRasterImage(p.buffer)) return valeur;
  try {
    let buf = p.buffer;
    if (opts && opts.rogner) buf = await rognerBandesLaterales(buf);
    const final = await compressImage(buf, "evenement");
    const mime = SEC.isSafeRasterImage(final) || p.type;
    const ext = mime.split("/")[1].replace("jpeg", "jpg");
    const nom = `${Number(ownerId) || 0}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`;
    return await uploadToBunny(final, nom, (opts && opts.dossier) || "evenements");
  } catch (e) {
    console.error("[images-cdn]", e.message);
    return valeur; // jamais de perte : on garde l'image d'origine
  }
}

/* Galerie : tableau (ou JSON de tableau) de 2 photos au plus, chaque entrée convertie. Rend la chaîne JSON à stocker. */
async function galerieVersCdn(galerie, ownerId, opts) {
  let liste = galerie;
  if (typeof liste === "string") { try { liste = JSON.parse(liste); } catch (e) { return galerie || "[]"; } }
  if (!Array.isArray(liste)) return "[]";
  const sortie = [];
  for (const g of liste.slice(0, 2)) sortie.push(await imageVersCdn(g, ownerId, opts));
  return JSON.stringify(sortie);
}

module.exports = { imageVersCdn, galerieVersCdn, rognerBandesLaterales, lireDataUri };

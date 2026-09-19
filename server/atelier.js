/* ══════════════════════════════════════════════════════════════════════════
   Utilitaires ffprobe partagés — survivance du moteur "Atelier audiovisuel"
   (module retiré en totalité le 2026-09-19). Les seules fonctions encore
   utilisées ailleurs sur la plateforme sont outPath() et probeVideoInfo(),
   réutilisées par la validation d'upload vidéo des Formulaires & Inscriptions
   (POST /api/insc/fiches/:id/medias, server/index.js) — ne pas supprimer ce
   fichier sans adapter cette route.
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const FILES_DIR = path.join(__dirname, "atelier-files");     // fichiers temporaires ffprobe
fs.mkdirSync(FILES_DIR, { recursive: true });

/* ── Détection du binaire ffprobe (installé dans /tools) ── */
function findBin(name) {
  const toolsDir = path.join(ROOT, "tools");
  try {
    const stack = [toolsDir];
    while (stack.length) {
      const d = stack.pop();
      let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.name.toLowerCase() === name + ".exe" || e.name === name) return full;
      }
    }
  } catch {}
  return name; // repli : suppose le binaire dans le PATH
}
const FFPROBE = findBin("ffprobe");

/* ── Exécution d'une commande ffprobe ── */
function run(bin, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let out = "", err = "";
    if (capture && p.stdout) p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (err += d));
    p.on("error", reject);
    p.on("close", code => code === 0 ? resolve(out) : reject(new Error(`ffprobe (${code}) : ${err.slice(-400)}`)));
  });
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function outPath(ext) { return path.join(FILES_DIR, uid() + "." + ext); }

/* Durée + résolution en un seul appel ffprobe — réutilisé pour valider un upload vidéo
   (Formulaires & Inscriptions, 2026-09-09) : durée max, largeur/hauteur max, et le simple
   fait que ffprobe arrive à lire le fichier prouve qu'il s'agit d'une vidéo décodable, pas
   d'un fichier renommé. Retourne null si ffprobe est indisponible ou échoue — jamais de
   valeur déduite ou acceptée sans preuve. */
async function probeVideoInfo(file) {
  try {
    const out = await run(FFPROBE, [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=duration",
      "-of", "default=nw=1", file
    ], { capture: true });
    const info = {};
    for (const line of out.split("\n")) {
      const [k, v] = line.split("=");
      if (k === "width") info.width = parseInt(v);
      else if (k === "height") info.height = parseInt(v);
      else if (k === "duration") info.duration = parseFloat(v);
    }
    if (!Number.isFinite(info.duration)) return null;
    return info;
  } catch { return null; }
}

module.exports = { FILES_DIR, outPath, probeVideoInfo };

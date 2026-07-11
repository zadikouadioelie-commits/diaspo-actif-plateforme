/* ══════════════════════════════════════════════════════════════════════════
   Atelier audiovisuel — moteur de traitement réel via ffmpeg.
   Opérations SANS IA (faisables en local) : découpe, fusion, format, extraction
   audio, ajout de musique, export MP4/WebM. Les fonctions IA restent hors scope
   (elles nécessitent des modèles ML/GPU ou des API externes).
   ══════════════════════════════════════════════════════════════════════════ */
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const FILES_DIR = path.join(__dirname, "atelier-files");     // médias & rendus des utilisateurs
const ASSETS_DIR = path.join(__dirname, "assets");
const LIB_DIRS = {
  musiques:    path.join(ASSETS_DIR, "musiques"),
  sons:        path.join(ASSETS_DIR, "sons"),
  generiques:  path.join(ASSETS_DIR, "generiques"),
  animations:  path.join(ASSETS_DIR, "animations"),
};
const MUSIC_DIR = LIB_DIRS.musiques; // compat
fs.mkdirSync(FILES_DIR, { recursive: true });
Object.values(LIB_DIRS).forEach(d => fs.mkdirSync(d, { recursive: true }));

/* Police pour les génériques (drawtext) */
function findFont() {
  const cands = ["C:/Windows/Fonts/arialbd.ttf", "C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"];
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch {} }
  return null;
}
const FONT = findFont();
const escFont = p => p ? p.replace(/\\/g, "/").replace(/:/g, "\\:") : null;

/* ── Détection du binaire ffmpeg / ffprobe (installés dans /tools) ── */
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
const FFMPEG = findBin("ffmpeg");
const FFPROBE = findBin("ffprobe");
let FFMPEG_OK = false;
try { FFMPEG_OK = fs.existsSync(FFMPEG) || FFMPEG === "ffmpeg"; } catch {}

function ffmpegAvailable() { return FFMPEG_OK; }

/* ── Exécution d'une commande ffmpeg/ffprobe ── */
function run(bin, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let out = "", err = "";
    if (capture && p.stdout) p.stdout.on("data", d => (out += d));
    p.stderr.on("data", d => (err += d));
    p.on("error", reject);
    p.on("close", code => code === 0 ? resolve(out) : reject(new Error(`ffmpeg (${code}) : ${err.slice(-400)}`)));
  });
}

async function probeDuration(file) {
  try {
    const out = await run(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file], { capture: true });
    const d = parseFloat(out.trim());
    return Number.isFinite(d) ? d : null;
  } catch { return null; }
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function outPath(ext) { return path.join(FILES_DIR, uid() + "." + ext); }

/* ── Écrit un data-URL base64 sur disque, renvoie le chemin ── */
function writeDataUrl(dataUrl) {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("Format de média invalide.");
  const mime = m[1];
  const ext = mime.startsWith("video") ? (mime.includes("webm") ? "webm" : "mp4")
            : mime.startsWith("image") ? (mime.includes("png") ? "png" : "jpg")
            : mime.startsWith("audio") ? (mime.includes("mpeg") ? "mp3" : "m4a") : "bin";
  const file = outPath(ext);
  fs.writeFileSync(file, Buffer.from(m[2], "base64"));
  return { file, mime, ext };
}

/* ── Filtre de mise au format (ratio) : recadre puis complète (letterbox) ── */
function formatFilter(ratio) {
  const dims = { "16/9": [1280, 720], "9/16": [720, 1280], "1/1": [1080, 1080], "4/5": [1080, 1350] };
  const [w, h] = dims[ratio] || dims["16/9"];
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
}

/* ════════════════ OPÉRATIONS ════════════════ */

async function opTrim(input, start, end) {
  const out = outPath("mp4");
  const args = ["-y", "-ss", String(Math.max(0, +start || 0))];
  if (end != null && +end > +start) args.push("-to", String(+end));
  args.push("-i", input, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", out);
  await run(FFMPEG, args);
  return out;
}

async function opFormat(input, ratio) {
  const out = outPath("mp4");
  await run(FFMPEG, ["-y", "-i", input, "-vf", formatFilter(ratio), "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", out]);
  return out;
}

async function opConcat(inputs) {
  // Ré-encode chaque entrée à un format commun puis concatène (robuste)
  const normalized = [];
  for (const f of inputs) {
    const n = outPath("mp4");
    await run(FFMPEG, ["-y", "-i", f, "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-ar", "44100", n]);
    normalized.push(n);
  }
  const listFile = outPath("txt");
  // Échappe les apostrophes du chemin (le format concat utilise des quotes simples)
  fs.writeFileSync(listFile, normalized.map(f => `file '${f.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const out = outPath("mp4");
  await run(FFMPEG, ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", out]);
  try { fs.unlinkSync(listFile); normalized.forEach(f => fs.unlinkSync(f)); } catch {}
  return out;
}

async function opExtractAudio(input) {
  const out = outPath("mp3");
  await run(FFMPEG, ["-y", "-i", input, "-vn", "-c:a", "libmp3lame", "-q:a", "2", out]);
  return out;
}

async function opAddMusic(video, music, volVideo = 1, volMusic = 0.5) {
  const out = outPath("mp4");
  // Mixe l'audio d'origine (volVideo) avec la musique (volMusic), coupe à la durée de la vidéo
  await run(FFMPEG, ["-y", "-i", video, "-i", music,
    "-filter_complex", `[0:a]volume=${volVideo}[a0];[1:a]volume=${volMusic},afade=t=in:st=0:d=1[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[a]`,
    "-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-shortest", out]);
  return out;
}

async function opSpeed(input, factor) {
  const f = Math.min(4, Math.max(0.25, +factor || 1));
  const out = outPath("mp4");
  // vidéo : setpts=1/f ; audio : atempo (borné 0.5–2, chaîné si besoin)
  let atempo = f; const parts = [];
  while (atempo > 2) { parts.push("atempo=2"); atempo /= 2; }
  while (atempo < 0.5) { parts.push("atempo=0.5"); atempo *= 2; }
  parts.push("atempo=" + atempo.toFixed(3));
  await run(FFMPEG, ["-y", "-i", input, "-filter_complex",
    `[0:v]setpts=${(1 / f).toFixed(4)}*PTS[v];[0:a]${parts.join(",")}[a]`,
    "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", out]);
  return out;
}
async function opBlur(input) {
  const out = outPath("mp4");
  await run(FFMPEG, ["-y", "-i", input, "-vf", "boxblur=6:1", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy", out]);
  return out;
}
const FILTERS = {
  nb:      "hue=s=0",
  sepia:   "colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131",
  vintage: "curves=preset=vintage",
  vif:     "eq=saturation=1.6:contrast=1.15",
  froid:   "colorbalance=bs=0.3:ms=0.1",
  chaud:   "colorbalance=rs=0.25:rm=0.1",
};
async function opFilter(input, preset) {
  const vf = FILTERS[preset] || FILTERS.vif;
  const out = outPath("mp4");
  await run(FFMPEG, ["-y", "-i", input, "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy", out]);
  return out;
}
async function opColor(input, { brightness = 0, contrast = 1, saturation = 1 } = {}) {
  const b = Math.max(-0.5, Math.min(0.5, +brightness || 0));
  const c = Math.max(0.5, Math.min(2, +contrast || 1));
  const s = Math.max(0, Math.min(3, +saturation || 1));
  const out = outPath("mp4");
  await run(FFMPEG, ["-y", "-i", input, "-vf", `eq=brightness=${b}:contrast=${c}:saturation=${s}`, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy", out]);
  return out;
}
async function opEnhance(input) {
  // Amélioration auto (sans IA) : netteté + léger boost contraste/saturation + réduction de bruit doux
  const out = outPath("mp4");
  await run(FFMPEG, ["-y", "-i", input, "-vf", "hqdn3d=2:1:2:2,unsharp=5:5:0.9,eq=contrast=1.08:saturation=1.12:brightness=0.02",
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k", out]);
  return out;
}
async function opReplaceAudio(input, music) {
  const out = outPath("mp4");
  await run(FFMPEG, ["-y", "-i", input, "-i", music, "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-shortest", out]);
  return out;
}
async function opVolume(input, vol) {
  const v = Math.max(0, Math.min(4, +vol || 1));
  const out = outPath("mp4");
  await run(FFMPEG, ["-y", "-i", input, "-af", `volume=${v}`, "-c:v", "copy", "-c:a", "aac", out]);
  return out;
}
async function opTitle(input, texte, position = "bas") {
  if (!FONT) throw new Error("Police introuvable pour le texte.");
  const y = position === "haut" ? "60" : position === "centre" ? "(h-th)/2" : "h-th-60";
  const txt = String(texte || "").replace(/[:\\']/g, " ").slice(0, 120);
  const out = outPath("mp4");
  const draw = `drawtext=fontfile='${escFont(FONT)}':text='${txt}':fontcolor=white:fontsize=48:box=1:boxcolor=black@0.5:boxborderw=12:x=(w-tw)/2:y=${y}`;
  await run(FFMPEG, ["-y", "-i", input, "-vf", draw, "-c:v", "libx264", "-preset", "veryfast", "-c:a", "copy", out]);
  return out;
}

async function opExport(input, format = "mp4") {
  const out = outPath(format === "webm" ? "webm" : "mp4");
  const args = format === "webm"
    ? ["-y", "-i", input, "-c:v", "libvpx-vp9", "-b:v", "1M", "-c:a", "libopus", out]
    : ["-y", "-i", input, "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-c:a", "aac", "-b:a", "192k", out];
  await run(FFMPEG, args);
  return out;
}

/* ════════════════ BIBLIOTHÈQUES (générées par ffmpeg = 100 % libres de droits) ════════════════ */

/* ── 15 musiques de fond (boucles synthétisées) ── */
const MUSIC_TRACKS = [
  ["ambiance-douce","Ambiance douce","0.18*sin(2*PI*220*t)+0.12*sin(2*PI*277*t)+0.10*sin(2*PI*330*t)"],
  ["corporate-clair","Corporate clair","0.16*sin(2*PI*(330+40*sin(2*PI*0.5*t))*t)+0.10*sin(2*PI*440*t)"],
  ["afro-groove","Afro groove","0.22*sin(2*PI*165*t)*(0.6+0.4*sin(2*PI*2*t))+0.10*sin(2*PI*220*t)"],
  ["inspiration","Inspiration","0.15*sin(2*PI*392*t)+0.12*sin(2*PI*494*t)+0.08*sin(2*PI*587*t)"],
  ["lo-fi-calme","Lo-fi calme","0.16*sin(2*PI*196*t)+0.10*sin(2*PI*261*t)*(0.7+0.3*sin(2*PI*1*t))"],
  ["energie-pop","Énergie pop","0.18*sin(2*PI*(440+60*sin(2*PI*4*t))*t)+0.08*sin(2*PI*660*t)"],
  ["cinematique","Cinématique","0.14*sin(2*PI*110*t)+0.12*sin(2*PI*164*t)+0.08*sin(2*PI*220*t)"],
  ["voyage","Voyage","0.15*sin(2*PI*294*t)+0.10*sin(2*PI*370*t)*(0.6+0.4*sin(2*PI*0.7*t))"],
  ["celebration","Célébration","0.18*sin(2*PI*523*t)+0.12*sin(2*PI*392*t)+0.08*sin(2*PI*659*t)"],
  ["meditation","Méditation","0.16*sin(2*PI*136*t)+0.10*sin(2*PI*210*t)"],
  ["afro-percussion","Afro percussion","0.20*sin(2*PI*98*t)*(0.5+0.5*sin(2*PI*3*t))+0.10*sin(2*PI*147*t)"],
  ["urbain","Urbain","0.18*sin(2*PI*82*t)*(0.6+0.4*sin(2*PI*2*t))+0.10*sin(2*PI*245*t)"],
  ["espoir","Espoir","0.15*sin(2*PI*349*t)+0.12*sin(2*PI*440*t)+0.08*sin(2*PI*523*t)"],
  ["nature","Nature douce","0.14*sin(2*PI*246*t)+0.09*sin(2*PI*311*t)*(0.7+0.3*sin(2*PI*0.4*t))"],
  ["motivation","Motivation","0.18*sin(2*PI*(392+50*sin(2*PI*3*t))*t)+0.09*sin(2*PI*587*t)"],
].map(([id, nom, expr]) => ({ id, nom, expr, dur: 20 }));

/* ── 15 effets sonores (courts) ── */
const SFX_TRACKS = [
  ["ding","Ding","0.5*sin(2*PI*880*t)*exp(-6*t)","0.6"],
  ["clic","Clic","0.4*sin(2*PI*1200*t)*exp(-40*t)","0.15"],
  ["pop","Pop","0.5*sin(2*PI*(400+2000*t)*t)*exp(-18*t)","0.3"],
  ["whoosh","Whoosh","0.4*(random(0)-0.5)*exp(-4*t)","0.8"],
  ["bip-haut","Bip montant","0.4*sin(2*PI*(600+800*t)*t)","0.4"],
  ["bip-bas","Bip descendant","0.4*sin(2*PI*(1400-800*t)*t)","0.4"],
  ["notification","Notification","0.4*sin(2*PI*(700+500*t)*t)*exp(-3*t)","0.6"],
  ["succes","Succès","0.4*sin(2*PI*(500+450*t)*t)","0.5"],
  ["erreur","Erreur","0.35*sin(2*PI*300*t)+0.35*sin(2*PI*220*t)","0.5"],
  ["swoosh","Swoosh doux","0.4*(random(0)-0.5)*sin(2*PI*3*t)*exp(-3*t)","0.9"],
  ["boom","Boom","0.6*sin(2*PI*60*t)*exp(-4*t)","0.7"],
  ["blip","Blip","0.4*sin(2*PI*1500*t)*exp(-30*t)","0.2"],
  ["carillon","Carillon","0.3*sin(2*PI*1047*t)*exp(-4*t)+0.2*sin(2*PI*1319*t)*exp(-4*t)","0.9"],
  ["tic","Tic","0.4*(random(0)-0.5)*exp(-60*t)","0.1"],
  ["alerte","Alerte","0.4*sin(2*PI*770*t)*(0.5+0.5*sin(2*PI*8*t))","0.7"],
].map(([id, nom, expr, dur]) => ({ id, nom, expr, dur: +dur }));

/* ── 15 génériques (cartons titre intro/outro, texte personnalisable) ── */
const GEN_TEMPLATES = [
  ["intro-sobre","Intro sobre","0x0D1B2A","0xFFFFFF"], ["intro-bordeaux","Intro bordeaux","0x5E0E1C","0xF4E9C1"],
  ["intro-vert","Intro nature","0x0F6E56","0xFFFFFF"], ["intro-orange","Intro énergie","0xB85042","0xFFF3E6"],
  ["intro-violet","Intro créatif","0x4C1D95","0xEDE9FE"], ["intro-bleu","Intro pro","0x0C447C","0xE6F1FB"],
  ["intro-noir","Intro cinéma","0x000000","0xF5C518"], ["intro-diaspora","Intro Diaspora","0x1E2761","0xCADCFC"],
  ["outro-merci","Outro merci","0x0D1B2A","0xFFFFFF"], ["outro-abonnez","Outro abonnez-vous","0x5E0E1C","0xFFFFFF"],
  ["outro-suivez","Outro suivez-nous","0x0F6E56","0xFFFFFF"], ["outro-contact","Outro contact","0x0C447C","0xFFFFFF"],
  ["titre-simple","Titre simple","0x2C3E50","0xECF0F1"], ["titre-gala","Titre gala","0x111111","0xD4AF37"],
  ["titre-terracotta","Titre chaleureux","0xB85042","0xE7E8D1"],
].map(([id, nom, bg, fg]) => ({ id, nom, bg, fg, texte: id.startsWith("outro") ? "MERCI" : "VOTRE TITRE" }));

/* ── 15 animations (fonds animés via sources lavfi) ── */
const ANIM_TEMPLATES = [
  ["grad-bleu","Dégradé bleu","gradients=s=1280x720:c0=0x0C447C:c1=0x1D9E75:x0=0:y0=0:x1=1280:y1=720:d=5"],
  ["grad-coucher","Dégradé coucher","gradients=s=1280x720:c0=0xB85042:c1=0xF9E795:d=5"],
  ["grad-violet","Dégradé violet","gradients=s=1280x720:c0=0x4C1D95:c1=0xDB2777:d=5"],
  ["grad-vert","Dégradé forêt","gradients=s=1280x720:c0=0x2C5F2D:c1=0x97BC62:d=5"],
  ["grad-nuit","Dégradé nuit","gradients=s=1280x720:c0=0x0D1B2A:c1=0x185FA5:d=5"],
  ["mandelbrot","Fractale Mandelbrot","mandelbrot=s=1280x720:rate=25"],
  ["life","Cellules vivantes","life=s=1280x720:rate=15:mold=10:life_color=0x1D9E75:death_color=0x0D1B2A"],
  ["cellauto","Automate cellulaire","cellauto=s=1280x720:rate=25:pattern=random"],
  ["testsrc2","Mire animée","testsrc2=s=1280x720:rate=25"],
  ["rgbtest","RGB test","rgbtestsrc=s=1280x720:rate=25"],
  ["plasma","Plasma","gradients=s=1280x720:c0=0xFF6B00:c1=0x4C1D95:x0=640:y0=360:x1=0:y1=0:d=4:speed=0.05"],
  ["ondes","Ondes chaudes","gradients=s=1280x720:c0=0x993C1D:c1=0xF0997B:d=6:speed=0.08"],
  ["neon","Néon","gradients=s=1280x720:c0=0x02C39A:c1=0x1E2761:d=4:speed=0.1"],
  ["sable","Sable doux","gradients=s=1280x720:c0=0xE7E8D1:c1=0xA7BEAE:d=7"],
  ["braise","Braise","gradients=s=1280x720:c0=0x000000:c1=0xB85042:d=5:speed=0.06"],
].map(([id, nom, src]) => ({ id, nom, src }));

/* ── Génération ── */
async function genMusic(t) {
  const f = path.join(LIB_DIRS.musiques, t.id + ".mp3");
  if (fs.existsSync(f)) return;
  await run(FFMPEG, ["-y", "-f", "lavfi", "-i", `aevalsrc=${t.expr}:s=44100:d=${t.dur}`,
    "-af", `afade=t=in:st=0:d=1,afade=t=out:st=${t.dur - 1}:d=1`, "-c:a", "libmp3lame", "-q:a", "4", f]);
}
async function genSfx(t) {
  const f = path.join(LIB_DIRS.sons, t.id + ".mp3");
  if (fs.existsSync(f)) return;
  await run(FFMPEG, ["-y", "-f", "lavfi", "-i", `aevalsrc=${t.expr}:s=44100:d=${t.dur}`, "-c:a", "libmp3lame", "-q:a", "5", f]);
}
async function genGenerique(t) {
  const f = path.join(LIB_DIRS.generiques, t.id + ".mp4");
  if (fs.existsSync(f)) return;
  const draw = FONT ? `,drawtext=fontfile='${escFont(FONT)}':text='${t.texte}':fontcolor=${"0x" + t.fg.slice(2)}:fontsize=72:x=(w-tw)/2:y=(h-th)/2:alpha='min(1\\,t)'` : "";
  await run(FFMPEG, ["-y", "-f", "lavfi", "-i", `color=c=${t.bg}:s=1280x720:d=4:r=30`,
    "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-vf", `format=yuv420p${draw}`, "-t", "4", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-shortest", f]);
}
async function genAnimation(t) {
  const f = path.join(LIB_DIRS.animations, t.id + ".mp4");
  if (fs.existsSync(f)) return;
  await run(FFMPEG, ["-y", "-f", "lavfi", "-i", t.src, "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
    "-t", "5", "-vf", "format=yuv420p", "-c:v", "libx264", "-preset", "veryfast", "-c:a", "aac", "-shortest", f]);
}

let _libReady = false;
async function ensureLibraries() {
  if (!FFMPEG_OK || _libReady) return;
  const tasks = [
    ...MUSIC_TRACKS.map(t => () => genMusic(t)),
    ...SFX_TRACKS.map(t => () => genSfx(t)),
    ...GEN_TEMPLATES.map(t => () => genGenerique(t)),
    ...ANIM_TEMPLATES.map(t => () => genAnimation(t)),
  ];
  for (const task of tasks) { try { await task(); } catch (e) { /* piste ignorée */ } }
  _libReady = true;
}
const ensureMusicLibrary = ensureLibraries; // compat

/* ── Listing ── */
function fileFor(folder, id) {
  const ext = (folder === "musiques" || folder === "sons") ? "mp3" : "mp4";
  const f = path.join(LIB_DIRS[folder], id + "." + ext);
  return fs.existsSync(f) ? f : null;
}
function listLibrary() {
  const map = (folder, defs) => defs
    .filter(t => fileFor(folder, t.id))
    .map(t => ({ id: t.id, nom: t.nom, folder, url: `/api/atelier/asset/${folder}/${t.id}`, libre: true }));
  return {
    musiques:   map("musiques", MUSIC_TRACKS),
    sons:       map("sons", SFX_TRACKS),
    generiques: map("generiques", GEN_TEMPLATES),
    animations: map("animations", ANIM_TEMPLATES),
  };
}
function listMusic() { return listLibrary().musiques.map(m => ({ ...m, url: "/api/atelier/musique/" + m.id })); }
function musicPath(id) { return fileFor("musiques", id); }
function assetPath(folder, id) { return LIB_DIRS[folder] ? fileFor(folder, id) : null; }

module.exports = {
  ffmpegAvailable, FILES_DIR,
  probeDuration, writeDataUrl, outPath,
  opTrim, opFormat, opConcat, opExtractAudio, opAddMusic, opExport,
  opSpeed, opBlur, opFilter, opColor, opEnhance, opReplaceAudio, opVolume, opTitle,
  ensureLibraries, ensureMusicLibrary, listLibrary, listMusic, musicPath, assetPath,
};

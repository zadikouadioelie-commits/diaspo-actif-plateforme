/* Fabrique de fichiers de test (aucun fichier tiers) : classeurs .xlsx et PDF écrits à la main, pour les tests de la visionneuse de documents. */
const zlib = require('node:zlib');

/* ── ZIP minimal (méthode « deflate » ou « stockée ») ── */
function zip(entrees, { stocke } = {}) {
  const locaux = [], centraux = []; let off = 0;
  for (const [nom, contenu] of Object.entries(entrees)) {
    const data = Buffer.isBuffer(contenu) ? contenu : Buffer.from(String(contenu), 'utf8');
    const comp = stocke ? data : zlib.deflateRawSync(data);
    const n = Buffer.from(nom, 'utf8'), crc = zlib.crc32(data);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0, 6); l.writeUInt16LE(stocke ? 0 : 8, 8);
    l.writeUInt32LE(crc >>> 0, 14); l.writeUInt32LE(comp.length, 18); l.writeUInt32LE(data.length, 22); l.writeUInt16LE(n.length, 26);
    locaux.push(l, n, comp);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(stocke ? 0 : 8, 10);
    c.writeUInt32LE(crc >>> 0, 16); c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    centraux.push(c, n); off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(centraux), fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(Object.keys(entrees).length, 8); fin.writeUInt16LE(Object.keys(entrees).length, 10); fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(off, 16);
  return Buffer.concat([...locaux, cd, fin]);
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const colL = i => { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

/* classeur({ feuilles: [{ nom, lignes: [[valeur | { v, f, s, t }]], merges: ['A1:C1'], largeurs: [20] }], styles, macros, masquee }) */
function classeur(def) {
  const partages = []; const idxPartage = t => { let i = partages.indexOf(t); if (i < 0) { i = partages.length; partages.push(t); } return i; };
  const feuillesXml = def.feuilles.map(f => {
    const rows = (f.lignes || []).map((cells, r) => {
      const cs = cells.map((c, k) => {
        if (c === null || c === undefined || c === '') return '';
        const o = typeof c === 'object' ? c : { v: c }; const ref = colL(k) + (r + 1); const s = o.s != null ? ` s="${o.s}"` : '';
        const f2 = o.f ? `<f>${esc(o.f)}</f>` : '';
        if (typeof o.v === 'number') return `<c r="${ref}"${s}>${f2}<v>${o.v}</v></c>`;
        if (typeof o.v === 'boolean') return `<c r="${ref}"${s} t="b">${f2}<v>${o.v ? 1 : 0}</v></c>`;
        if (o.f) return `<c r="${ref}"${s} t="str">${f2}<v>${esc(o.v == null ? '' : o.v)}</v></c>`;
        if (o.inline) return `<c r="${ref}"${s} t="inlineStr"><is><t>${esc(o.v)}</t></is></c>`;
        return `<c r="${ref}"${s} t="s"><v>${idxPartage(String(o.v))}</v></c>`;
      }).join('');
      return `<row r="${r + 1}">${cs}</row>`;
    }).join('');
    const cols = f.largeurs ? `<cols>${f.largeurs.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
    const merges = f.merges && f.merges.length ? `<mergeCells count="${f.merges.length}">${f.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    return `<?xml version="1.0" encoding="UTF-8"?><worksheet ${NS}>${cols}<sheetData>${rows}</sheetData>${merges}</worksheet>`;
  });
  const entrees = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook ${NS}>${def.date1904 ? '<workbookPr date1904="1"/>' : ''}<sheets>${def.feuilles.map((f, i) => `<sheet name="${esc(f.nom)}" sheetId="${i + 1}"${f.masquee ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${def.feuilles.map((f, i) => `<Relationship Id="rId${i + 1}" Type="x" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
  };
  def.feuilles.forEach((f, i) => { entrees[`xl/worksheets/sheet${i + 1}.xml`] = feuillesXml[i]; });
  entrees['xl/sharedStrings.xml'] = `<?xml version="1.0"?><sst ${NS} count="${partages.length}" uniqueCount="${partages.length}">${partages.map(t => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')}</sst>`;
  if (def.styles) entrees['xl/styles.xml'] = def.styles;
  if (def.macros) entrees['xl/vbaProject.bin'] = Buffer.from('MACROS');
  return zip(entrees, { stocke: !!def.stocke });
}

/* Feuille de styles : 0 général · 1 gras sur fond bleu · 2 nombre « # ##0,00 » · 3 pourcentage · 4 date jj/mm/aaaa · 5 euros · 6 centré rouge italique */
const STYLES = `<?xml version="1.0"?><styleSheet ${NS}>
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;€&quot;"/></numFmts>
<fonts count="3"><font><sz val="11"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/></font><font><i/><color rgb="FFC00000"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E79"/></patternFill></fill></fills>
<cellXfs count="7"><xf numFmtId="0" fontId="0" fillId="0"/><xf numFmtId="0" fontId="1" fillId="2"/><xf numFmtId="4" fontId="0" fillId="0"/><xf numFmtId="10" fontId="0" fillId="0"/><xf numFmtId="14" fontId="0" fillId="0"/><xf numFmtId="164" fontId="0" fillId="0"/><xf numFmtId="0" fontId="2" fillId="0"><alignment horizontal="center" wrapText="1"/></xf></cellXfs></styleSheet>`;

/* ── PDF écrit à la main : une page par texte, objets numérotés, table xref exacte ── */
function pdf(pages) {
  const objets = []; const ajouter = c => { objets.push(c); return objets.length; };
  const cat = ajouter(''), arbre = ajouter(''), police = ajouter('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  pages.forEach((txt, i) => {
    const flux = `BT /F1 24 Tf 60 740 Td (${String(txt).replace(/[()\\]/g, '\\$&')}) Tj ET\nBT /F1 12 Tf 60 700 Td (Page ${i + 1} sur ${pages.length}) Tj ET`;
    const c = ajouter(`<< /Length ${Buffer.byteLength(flux)} >>\nstream\n${flux}\nendstream`);
    const p = ajouter(`<< /Type /Page /Parent ${arbre} 0 R /MediaBox [0 0 595 842] /Contents ${c} 0 R /Resources << /Font << /F1 ${police} 0 R >> >> >>`);
    kids.push(p);
  });
  objets[cat - 1] = `<< /Type /Catalog /Pages ${arbre} 0 R >>`;
  objets[arbre - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const offs = [];
  objets.forEach((o, i) => { offs.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objets.length + 1} /Root ${cat} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

module.exports = { zip, classeur, STYLES, pdf, colL };

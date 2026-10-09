/**
 * Diaspo'Actif — Moteur de templates CV
 * Architecture extensible : chaque template est une fonction render(data, style) → HTML
 * Pour ajouter un template : CV_TEMPLATES[id] = { name, category, preview, render }
 */

window.CV_TEMPLATES = {};

/* ─── Utilitaires partagés ─── */
function _e(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _fmtDate(d) {
  if (!d) return '';
  const [y, m] = d.split('-');
  const mois = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  return (mois[parseInt(m)] || m) + ' ' + y;
}
function _photoHTML(photo, style) {
  if (!photo?.url || !photo?.show) return '';
  const sz = photo.size || 80;
  const shape = photo.shape === 'square' ? '8px' : photo.shape === 'round' ? '50%' : '50%';
  return `<img src="${photo.url}" style="width:${sz}px;height:${sz}px;border-radius:${shape};object-fit:cover;border:3px solid ${style.couleur2};" alt="Photo">`;
}
/* ─── Texte enrichi (résumé, descriptions, zones de texte) — 2026-10-09 ───
   Le HTML saisi dans RichEditor est TOUJOURS re-nettoyé ici avant affichage : la page publique du CV
   (cv-public.html) affiche le contenu d'un autre compte, la liste blanche ci-dessous est donc une barrière
   de sécurité à part entière (le serveur nettoie aussi à l'enregistrement). Un ancien texte brut (sans
   balise) reste affiché tel quel, retours à la ligne conservés. */
const _RICH_OK = { P:1, BR:1, B:1, STRONG:1, I:1, EM:1, U:1, UL:1, OL:1, LI:1, H2:1, H3:1, BLOCKQUOTE:1, A:1, DIV:1, SPAN:1 };
const _RICH_DROP = { SCRIPT:1, STYLE:1, IFRAME:1, OBJECT:1, EMBED:1, SVG:1, MATH:1, LINK:1, META:1, NOSCRIPT:1, TEMPLATE:1, FORM:1, INPUT:1, TEXTAREA:1, BUTTON:1, IMG:1, VIDEO:1, AUDIO:1 };
function _hasText(v) {
  return String(v == null ? '' : v).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
}
function _rich(v) {
  const s = String(v == null ? '' : v);
  if (!_hasText(s)) return '';
  if (!/<\/?[a-z][\s\S]*?>/i.test(s)) return _e(s).replace(/\r?\n/g, '<br>');
  if (typeof document === 'undefined') return _e(s.replace(/<[^>]*>/g, ''));
  const tpl = document.createElement('template');
  tpl.innerHTML = s;
  const out = document.createElement('div');
  (function copie(src, dst) {
    src.childNodes.forEach(n => {
      if (n.nodeType === 3) { dst.appendChild(document.createTextNode(n.textContent)); return; }
      if (n.nodeType !== 1) return;
      const tag = n.tagName.toUpperCase();
      if (_RICH_DROP[tag]) return;
      if (!_RICH_OK[tag]) { copie(n, dst); return; }
      const el = document.createElement(tag.toLowerCase());
      if (tag === 'A') {
        const h = (n.getAttribute('href') || '').trim();
        if (/^(https?:|mailto:)/i.test(h)) { el.setAttribute('href', h); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
      }
      const m = (n.getAttribute('style') || '').match(/text-align:\s*(left|right|center|justify)/i);
      if (m) el.setAttribute('style', 'text-align:' + m[1].toLowerCase());
      copie(n, el);
      dst.appendChild(el);
    });
  })(tpl.content, out);
  return out.innerHTML;
}
(function injecterStyleRich() {
  if (typeof document === 'undefined' || document.getElementById('cv-rich-style')) return;
  const st = document.createElement('style');
  st.id = 'cv-rich-style';
  st.textContent = '.cv-rich p{margin:0 0 5px}.cv-rich p:last-child{margin-bottom:0}.cv-rich ul,.cv-rich ol{margin:2px 0 5px 18px;padding:0}'
    + '.cv-rich h2,.cv-rich h3{margin:6px 0 3px;font-size:1.05em;line-height:1.3}.cv-rich blockquote{margin:4px 0;padding:2px 10px;border-left:3px solid #c9d3e0;color:#555}'
    + '.cv-rich a{color:inherit;text-decoration:underline}';
  document.head.appendChild(st);
})();

/* Emplacement photo : la photo si elle existe ; sinon, DANS L'ÉDITEUR SEULEMENT (d._edit), une
   proposition « Ajouter ma photo » cliquable. Elle porte data-nopdf : elle est retirée de tout PDF, de la
   page publique et de l'export Word — jamais de case vide dans le document final. */
function _photoSlot(photo, style, edit, opts) {
  opts = opts || {};
  if (photo?.url && photo?.show) return _photoHTML(photo, style);
  if (!edit) return '';
  const sz = photo?.size || 80;
  const col = opts.dark ? 'rgba(255,255,255,.9)' : '#4a6a96';
  const brd = opts.dark ? 'rgba(255,255,255,.6)' : '#9db4d3';
  return `<button type="button" data-nopdf="1" onclick="openPhotoPicker()" title="Ajouter une photo de CV" style="display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;width:${sz}px;height:${sz}px;border-radius:${photo?.shape === 'square' ? '8px' : '50%'};border:2px dashed ${brd};background:transparent;color:${col};font-size:7.5pt;font-weight:700;cursor:pointer;padding:4px;line-height:1.15;font-family:inherit;"><span style="font-size:16pt;line-height:1;">＋</span><span>Ajouter ma photo</span></button>`;
}
/* Zones de texte libres (rectangle avec titre + texte) */
function _blocsHTML(blocs, s) {
  const liste = (blocs || []).filter(b => b && (_hasText(b.titre) || _hasText(b.texte)));
  if (!liste.length) return '';
  return liste.map(b => `<div style="border:1.5px solid ${s.couleur2};background:${s.couleur3 || '#f8f9ff'};border-radius:8px;padding:9px 13px;margin:12px 0;break-inside:avoid;">
    ${_hasText(b.titre) ? `<div style="font-weight:800;font-size:10pt;color:${s.couleur1};margin-bottom:${_hasText(b.texte) ? '4px' : '0'};">${_e(b.titre)}</div>` : ''}
    ${_hasText(b.texte) ? `<div class="cv-rich" style="font-size:9pt;color:#333;line-height:1.55;">${_rich(b.texte)}</div>` : ''}
  </div>`).join('');
}
function _contactLine(icon, val) {
  if (!val) return '';
  return `<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;font-size:9pt;">${icon} ${_e(val)}</span>`;
}
function _skillBars(items, accent) {
  return items.map(s => `<div style="margin-bottom:5px;">
    <div style="font-size:8.5pt;margin-bottom:2px;">${_e(s)}</div>
    <div style="height:4px;background:rgba(255,255,255,.2);border-radius:2px;"><div style="height:100%;width:75%;background:${accent};border-radius:2px;"></div></div>
  </div>`).join('');
}
function _tags(items, bg, color) {
  return items.map(s => `<span style="display:inline-block;background:${bg};color:${color};padding:2px 8px;border-radius:12px;font-size:8pt;margin:2px 2px 2px 0;">${_e(s)}</span>`).join('');
}
function _expBlock(e) {
  return `<div style="margin-bottom:12px;">
    <div style="font-weight:700;font-size:10pt;">${_e(e.poste || 'Poste')}</div>
    <div style="font-size:9pt;color:#666;margin:.5px 0;">${_e(e.entreprise || '')}${(e.ville||e.pays)?' · '+[e.ville,e.pays].filter(Boolean).join(', '):''}</div>
    <div style="font-size:8.5pt;color:#999;margin-bottom:3px;">${_fmtDate(e.date_debut)}${e.actuel?' — Présent':e.date_fin?' — '+_fmtDate(e.date_fin):''}</div>
    ${_hasText(e.description) ? `<div class="cv-rich" style="font-size:9pt;color:#444;line-height:1.5;">${_rich(e.description)}</div>` : ''}
  </div>`;
}
function _eduBlock(e) {
  return `<div style="margin-bottom:10px;">
    <div style="font-weight:700;font-size:10pt;">${_e(e.diplome || 'Diplôme')}</div>
    <div style="font-size:9pt;color:#666;">${_e(e.etablissement || '')}${(e.pays)?' · '+_e(e.pays):''}</div>
    ${e.annee ? `<div style="font-size:8.5pt;color:#999;">${e.annee}</div>` : ''}
    ${_hasText(e.description) ? `<div class="cv-rich" style="font-size:9pt;color:#444;">${_rich(e.description)}</div>` : ''}
  </div>`;
}
function _sectionTitle(label, style, dark = false) {
  const c = dark ? 'rgba(255,255,255,.8)' : style.couleur1;
  const bc = dark ? 'rgba(255,255,255,.3)' : style.couleur2;
  return `<div style="font-size:8pt;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${c};border-bottom:2px solid ${bc};padding-bottom:3px;margin:14px 0 8px;">${label}</div>`;
}
function _audioWidget(url) {
  if (!url) return '';
  return `<div style="margin-top:6px;">
    <div style="font-size:8pt;color:#999;margin-bottom:3px;">🎙 Présentation audio</div>
    <audio controls style="width:100%;height:28px;" src="${url}"></audio>
  </div>`;
}
function _videoWidget(url) {
  if (!url) return '';
  return `<div style="margin-top:6px;">
    <div style="font-size:8pt;color:#999;margin-bottom:3px;">🎬 Présentation vidéo</div>
    <video controls style="width:100%;border-radius:6px;max-height:120px;" src="${url}"></video>
  </div>`;
}
function _sigWidget(url) {
  if (!url) return '';
  return `<img src="${url}" style="max-height:50px;margin-top:8px;display:block;" alt="Signature">`;
}
/* QR code (2026-10-09) : TOUJOURS centré. Deux emplacements :
   - _qrWidget : dans une colonne latérale, juste sous l'identité/la photo (le QR « remonte » : il ne laisse
     plus de vide quand il n'y a pas de photo) ;
   - _qrFooter : pour les gabarits sans colonne, centré en bas du document.
   Il ouvre la page publique du CV (le CV + ses médias liés), voir cv-public.html. */
/* Le QR est dessiné DANS le navigateur (qr.img = image en data:, voir CvX.qrDataUrl) : l'adresse privée du CV
   n'est jamais transmise à un service tiers, et l'image est toujours présente dans le PDF. */
function _qrImg(qr, px) {
  if (!qr.img) return '';
  return `<img src="${qr.img}" style="width:${px}px;height:${px}px;border-radius:4px;background:#fff;padding:3px;" alt="QR code vers mon CV et mes médias">`;
}
/* Bouton « Accéder aux médias » (2026-10-09) : un QR code ne se « flashe » pas depuis l'écran où le CV est lu
   (envoi par e-mail, WhatsApp ou messagerie Diaspo'Actif). Dès qu'au moins un média est lié à ce CV
   (qr.medias > 0), le document porte donc aussi un lien cliquable vers la même page publique — y compris
   quand le QR est retiré du PDF. Le PDF est produit avec enableLinks : le lien reste cliquable. */
function _mediaBtn(qr, dark) {
  if (!qr?.url || !(Number(qr.medias) > 0)) return '';
  const bg = dark ? '#ffffff' : '#1a3a5c', fg = dark ? '#1a3a5c' : '#ffffff';
  return `<div style="margin-top:6px;"><a href="${_e(qr.url)}&amp;vue=medias" target="_blank" rel="noopener" style="display:inline-block;background:${bg};color:${fg};font-size:8pt;font-weight:700;padding:5px 14px;border-radius:14px;text-decoration:none;">▶ Accéder aux médias</a></div>`;
}
function _qrWidget(qr, dark = false) {
  if (!qr?.url) return '';
  const c = dark ? 'rgba(255,255,255,.85)' : '#666';
  if (!qr.enabled || !qr.img) { const b = _mediaBtn(qr, dark); return b ? `<div style="text-align:center;margin:12px auto 4px;">${b}</div>` : ''; }
  return `<div style="text-align:center;margin:14px auto 4px;">
    ${_qrImg(qr, 78)}
    <div style="font-size:7pt;color:${c};margin:3px auto 0;max-width:150px;line-height:1.3;">Scannez pour voir mon CV et mes médias</div>
    ${_mediaBtn(qr, dark)}
  </div>`;
}
function _qrFooter(qr) {
  if (!qr?.url) return '';
  /* margin:auto en haut : dans les gabarits « colonne flex », le pied se colle en bas de la feuille A4. */
  if (!qr.enabled || !qr.img) { const b = _mediaBtn(qr, false); return b ? `<div style="text-align:center;margin:auto auto 16px;padding-top:22px;break-inside:avoid;">${b}</div>` : ''; }
  return `<div style="text-align:center;margin:auto auto 16px;padding-top:22px;break-inside:avoid;">
    ${_qrImg(qr, 84)}
    <div style="font-size:7.5pt;color:#666;margin:3px auto 0;max-width:220px;line-height:1.3;">Scannez pour voir mon CV et mes médias</div>
    ${_mediaBtn(qr, false)}
  </div>`;
}

/* ══════════════════════════════════
   TEMPLATE 1 — MODERNE (sidebar)
══════════════════════════════════ */
CV_TEMPLATES['moderne'] = {
  name: 'Moderne', category: 'Professionnel',
  preview: 'linear-gradient(135deg,#1a3a5c 0%,#1a3a5c 35%,#fff 35%)',
  render(d, s) {
    const inf = d.infos || {};
    const contacts = [
      _contactLine('✉', inf.email), _contactLine('📞', inf.telephone),
      _contactLine('📍', [inf.ville, inf.pays_residence].filter(Boolean).join(', ')),
      _contactLine('🔗', inf.linkedin), _contactLine('🌐', inf.site)
    ].filter(Boolean).join('');
    return `
<div style="display:grid;grid-template-columns:220px 1fr;min-height:297mm;font-family:${s.font || 'Segoe UI'};font-size:${s.fontSize || 11}pt;">
  <!-- SIDEBAR -->
  <div style="background:${s.couleur1};color:#fff;padding:24px 16px;">
    <div style="text-align:center;margin-bottom:16px;">
      ${_photoSlot(d.photo, s, d._edit, {dark:true})}
      <div style="font-size:16pt;font-weight:800;margin-top:8px;line-height:1.2;">${_e([inf.prenom,inf.nom].filter(Boolean).join(' ')||'Votre Nom')}</div>
      ${inf.titre_pro ? `<div style="font-size:9pt;opacity:.8;margin-top:4px;">${_e(inf.titre_pro)}</div>` : ''}
    </div>
    ${_qrWidget(d.media?.qr, true)}
    ${d.media?.audio ? _audioWidget(d.media.audio) : ''}
    ${d.media?.video ? _videoWidget(d.media.video) : ''}
    ${(d.competences?.tech?.length||d.competences?.metier?.length||d.competences?.num?.length) ? `
      ${_sectionTitle('Compétences', s, true)}
      ${d.competences.tech?.length ? `<div style="font-size:7.5pt;opacity:.6;margin-bottom:3px;">TECHNIQUES</div>${_skillBars(d.competences.tech, s.couleur2)}` : ''}
      ${d.competences.metier?.length ? `<div style="font-size:7.5pt;opacity:.6;margin:6px 0 3px;">MÉTIERS</div>${_skillBars(d.competences.metier, s.couleur2)}` : ''}
      ${d.competences.num?.length ? `<div style="font-size:7.5pt;opacity:.6;margin:6px 0 3px;">NUMÉRIQUES</div>${_skillBars(d.competences.num, s.couleur2)}` : ''}
    ` : ''}
    ${d.langues?.length ? `
      ${_sectionTitle('Langues', s, true)}
      ${d.langues.map(l => `<div style="display:flex;justify-content:space-between;font-size:9pt;margin-bottom:4px;"><span>${_e(l.langue)}</span><span style="opacity:.7;font-size:8pt;">${_e(l.niveau)}</span></div>`).join('')}
    ` : ''}
    ${d.certifications?.length ? `
      ${_sectionTitle('Certifications', s, true)}
      ${d.certifications.map(c => `<div style="margin-bottom:5px;font-size:8.5pt;"><strong>${_e(c.nom)}</strong>${c.organisme?'<br><span style="opacity:.7">'+_e(c.organisme)+'</span>':''}</div>`).join('')}
    ` : ''}
    ${d.interests?.length ? `
      ${_sectionTitle("Centres d'intérêt", s, true)}
      <div style="display:flex;flex-wrap:wrap;gap:3px;">${d.interests.map(i=>`<span style="background:rgba(255,255,255,.15);padding:2px 8px;border-radius:10px;font-size:8pt;">${_e(i)}</span>`).join('')}</div>
    ` : ''}
    ${inf.nationalite ? `<div style="margin-top:12px;font-size:8.5pt;opacity:.7;">🌍 ${_e(inf.nationalite)}</div>` : ''}
  </div>
  <!-- MAIN -->
  <div style="padding:24px 20px;background:#fff;">
    ${contacts ? `<div style="margin-bottom:14px;border-bottom:1px solid #f0f0f0;padding-bottom:10px;">${contacts}</div>` : ''}
    ${_hasText(d.resume) ? `${_sectionTitle('Profil', s)}<div class="cv-rich" style="font-size:9.5pt;color:#333;line-height:1.6;margin:0 0 8px;">${_rich(d.resume)}</div>` : ''}
    ${d.experiences?.length ? `${_sectionTitle('Expériences professionnelles', s)}${d.experiences.map(_expBlock).join('')}` : ''}
    ${d.formations?.length ? `${_sectionTitle('Formations', s)}${d.formations.map(_eduBlock).join('')}` : ''}
    ${_blocsHTML(d.blocs, s)}
    ${d.media?.signature ? `<div style="margin-top:20px;">${_sigWidget(d.media.signature)}</div>` : ''}
  </div>
</div>`;
  }
};

/* ══════════════════════════════════
   TEMPLATE 2 — CLASSIQUE (full-width)
══════════════════════════════════ */
CV_TEMPLATES['classique'] = {
  name: 'Classique', category: 'Traditionnel',
  preview: 'linear-gradient(180deg,#f0f0f0 80px,#fff 80px)',
  render(d, s) {
    const inf = d.infos || {};
    const allComps = [...(d.competences?.tech||[]),...(d.competences?.metier||[]),...(d.competences?.num||[])];
    return `
<div style="display:flex;flex-direction:column;font-family:${s.font||'Georgia,serif'};font-size:${s.fontSize||11}pt;padding:${s.margins?.top||20}mm ${s.margins?.right||20}mm ${s.margins?.bottom||20}mm ${s.margins?.left||20}mm;background:#fff;min-height:297mm;">
  <!-- HEADER -->
  <div style="text-align:center;padding-bottom:16px;border-bottom:3px solid ${s.couleur1};margin-bottom:16px;">
    ${_photoSlot(d.photo, s, d._edit)}
    <div style="font-size:22pt;font-weight:800;color:${s.couleur1};letter-spacing:2px;margin-top:${(d.photo?.url&&d.photo?.show)||d._edit?'8px':'0'}">${_e([inf.prenom,inf.nom].filter(Boolean).join(' ')||'VOTRE NOM')}</div>
    ${inf.titre_pro ? `<div style="font-size:12pt;color:${s.couleur2};margin-top:4px;font-style:italic;">${_e(inf.titre_pro)}</div>` : ''}
    <div style="margin-top:10px;font-size:9pt;color:#555;">
      ${[inf.email&&`✉ ${inf.email}`,inf.telephone&&`📞 ${inf.telephone}`,[inf.ville,inf.pays_residence].filter(Boolean).join(', ')&&`📍 ${[inf.ville,inf.pays_residence].filter(Boolean).join(', ')}`,inf.linkedin&&`🔗 ${inf.linkedin}`].filter(Boolean).join(' &nbsp;·&nbsp; ')}
    </div>
  </div>
  ${d.media?.audio ? _audioWidget(d.media.audio) : ''}
  ${d.media?.video ? _videoWidget(d.media.video) : ''}
  ${_hasText(d.resume) ? `<div class="cv-rich" style="background:${s.couleur3||'#f8f9ff'};border-left:4px solid ${s.couleur2};padding:10px 14px;margin-bottom:16px;font-size:9.5pt;color:#333;line-height:1.6;">${_rich(d.resume)}</div>` : ''}
  <!-- 2 colonnes -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
    <div>
      ${d.experiences?.length ? `${_sectionTitle('Expériences', s)}${d.experiences.map(_expBlock).join('')}` : ''}
    </div>
    <div>
      ${d.formations?.length ? `${_sectionTitle('Formations', s)}${d.formations.map(_eduBlock).join('')}` : ''}
      ${allComps.length ? `${_sectionTitle('Compétences', s)}<div>${_tags(allComps, s.couleur3||'#f0f0f0', s.couleur1)}</div>` : ''}
      ${d.langues?.length ? `${_sectionTitle('Langues', s)}${d.langues.map(l=>`<div style="display:flex;justify-content:space-between;font-size:9pt;margin-bottom:4px;"><span>${_e(l.langue)}</span><span style="color:${s.couleur2};font-size:8pt;">${_e(l.niveau)}</span></div>`).join('')}` : ''}
      ${d.certifications?.length ? `${_sectionTitle('Certifications', s)}${d.certifications.map(c=>`<div style="font-size:9pt;margin-bottom:5px;"><strong>${_e(c.nom)}</strong>${c.organisme?'<span style="color:#666;"> — '+_e(c.organisme)+'</span>':''}</div>`).join('')}` : ''}
      ${d.interests?.length ? `${_sectionTitle("Centres d'intérêt", s)}<div>${_tags(d.interests, s.couleur3||'#f0f7ff', s.couleur1)}</div>` : ''}
    </div>
  </div>
  ${_blocsHTML(d.blocs, s)}
  ${d.media?.signature ? `<div style="margin-top:16px;">${_sigWidget(d.media.signature)}</div>` : ''}
  ${_qrFooter(d.media?.qr)}
</div>`;
  }
};

/* ══════════════════════════════════
   TEMPLATE 3 — ÉLÉGANT
══════════════════════════════════ */
CV_TEMPLATES['elegant'] = {
  name: 'Élégant', category: 'Premium',
  preview: 'linear-gradient(180deg,#2c3e50 120px,#fff 120px)',
  render(d, s) {
    const inf = d.infos || {};
    return `
<div style="display:flex;flex-direction:column;font-family:${s.font||'Segoe UI'};font-size:${s.fontSize||11}pt;background:#fff;min-height:297mm;">
  <!-- HEADER BAND -->
  <div style="background:${s.couleur1};color:#fff;padding:28px 28px 20px;display:flex;align-items:center;gap:20px;">
    ${_photoSlot(d.photo, {...s, couleur2:'rgba(255,255,255,.5)'}, d._edit, {dark:true})}
    <div style="flex:1;">
      <div style="font-size:20pt;font-weight:300;letter-spacing:3px;">${_e((inf.prenom||'').toUpperCase())}</div>
      <div style="font-size:22pt;font-weight:800;letter-spacing:2px;margin-top:-4px;">${_e((inf.nom||'VOTRE NOM').toUpperCase())}</div>
      ${inf.titre_pro ? `<div style="font-size:10pt;opacity:.8;margin-top:6px;border-top:1px solid rgba(255,255,255,.3);padding-top:6px;">${_e(inf.titre_pro)}</div>` : ''}
    </div>
    <div style="text-align:right;font-size:8.5pt;opacity:.85;line-height:1.9;">
      ${inf.email?`✉ ${_e(inf.email)}<br>`:''}${inf.telephone?`📞 ${_e(inf.telephone)}<br>`:''}${(inf.ville||inf.pays_residence)?`📍 ${_e([inf.ville,inf.pays_residence].filter(Boolean).join(', '))}<br>`:''}${inf.linkedin?`🔗 ${_e(inf.linkedin)}`:''}
    </div>
  </div>
  <!-- ACCENT BAR -->
  <div style="height:6px;background:${s.couleur2};"></div>
  <!-- BODY -->
  <div style="display:grid;grid-template-columns:1fr 260px;gap:0;">
    <div style="padding:20px 24px;border-right:1px solid #eee;">
      ${d.media?.audio ? _audioWidget(d.media.audio) : ''}
      ${d.media?.video ? _videoWidget(d.media.video) : ''}
      ${_hasText(d.resume) ? `${_sectionTitle('À propos', s)}<div class="cv-rich" style="font-size:9.5pt;line-height:1.65;color:#333;margin:0 0 6px;">${_rich(d.resume)}</div>` : ''}
      ${d.experiences?.length ? `${_sectionTitle('Parcours professionnel', s)}${d.experiences.map(_expBlock).join('')}` : ''}
      ${d.formations?.length ? `${_sectionTitle('Formation', s)}${d.formations.map(_eduBlock).join('')}` : ''}
      ${_blocsHTML(d.blocs, s)}
      ${d.media?.signature ? `<div style="margin-top:20px;">${_sigWidget(d.media.signature)}</div>` : ''}
    </div>
    <div style="padding:20px 16px;background:#fafafa;">
      ${(d.competences?.tech?.length||d.competences?.metier?.length||d.competences?.num?.length) ? `
        ${_sectionTitle('Compétences', s)}
        ${d.competences.tech?.length ? `<div style="font-size:7.5pt;color:#999;margin-bottom:3px;font-weight:700;">TECHNIQUES</div><div style="margin-bottom:6px;">${_tags(d.competences.tech, s.couleur1+'22', s.couleur1)}</div>` : ''}
        ${d.competences.metier?.length ? `<div style="font-size:7.5pt;color:#999;margin-bottom:3px;font-weight:700;">MÉTIERS</div><div style="margin-bottom:6px;">${_tags(d.competences.metier, s.couleur2+'22', s.couleur1)}</div>` : ''}
        ${d.competences.num?.length ? `<div style="font-size:7.5pt;color:#999;margin-bottom:3px;font-weight:700;">NUMÉRIQUES</div><div>${_tags(d.competences.num, '#f0f0f0', '#333')}</div>` : ''}
      ` : ''}
      ${d.langues?.length ? `${_sectionTitle('Langues', s)}${d.langues.map(l=>`<div style="margin-bottom:6px;"><div style="font-size:9pt;font-weight:600;">${_e(l.langue)}</div><div style="height:3px;background:#eee;border-radius:2px;margin-top:2px;"><div style="height:100%;background:${s.couleur2};border-radius:2px;width:${{Débutant:'20%',Intermédiaire:'40%',Courant:'65%',Professionnel:'85%','Natif / Bilingue':'100%'}[l.niveau]||'50%'};"></div></div><div style="font-size:7.5pt;color:#999;margin-top:1px;">${_e(l.niveau)}</div></div>`).join('')}` : ''}
      ${d.certifications?.length ? `${_sectionTitle('Certifications', s)}${d.certifications.map(c=>`<div style="margin-bottom:6px;font-size:8.5pt;"><strong style="color:${s.couleur1};">${_e(c.nom)}</strong><br>${c.organisme?`<span style="color:#666;">${_e(c.organisme)}</span>`:''}</div>`).join('')}` : ''}
      ${d.interests?.length ? `${_sectionTitle("Intérêts", s)}<div>${_tags(d.interests, s.couleur2+'18', '#333')}</div>` : ''}
      ${inf.nationalite ? `${_sectionTitle('Nationalité', s)}<div style="font-size:9pt;">🌍 ${_e(inf.nationalite)}</div>` : ''}
    </div>
  </div>
  ${_qrFooter(d.media?.qr)}
</div>`;
  }
};

/* ══════════════════════════════════
   TEMPLATE 4 — MINIMALISTE
══════════════════════════════════ */
CV_TEMPLATES['minimaliste'] = {
  name: 'Minimaliste', category: 'Épuré',
  preview: 'linear-gradient(135deg,#fff 0%,#f5f5f5 100%)',
  render(d, s) {
    const inf = d.infos || {};
    const allComps = [...(d.competences?.tech||[]),...(d.competences?.metier||[]),...(d.competences?.num||[])];
    return `
<div style="display:flex;flex-direction:column;font-family:${s.font||'Arial'};font-size:${s.fontSize||10}pt;padding:${s.margins?.top||25}mm ${s.margins?.right||25}mm;background:#fff;min-height:297mm;">
  <!-- EN-TÊTE minimal -->
  <div style="display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:12px;border-bottom:2px solid ${s.couleur1};">
    <div>
      <div style="font-size:26pt;font-weight:900;color:${s.couleur1};letter-spacing:-1px;line-height:1;">${_e([inf.prenom,inf.nom].filter(Boolean).join(' ')||'Votre Nom')}</div>
      ${inf.titre_pro ? `<div style="font-size:11pt;color:${s.couleur2};margin-top:4px;">${_e(inf.titre_pro)}</div>` : ''}
    </div>
    ${_photoSlot(d.photo, s, d._edit)}
  </div>
  <div style="font-size:8.5pt;color:#666;margin:8px 0 16px;display:flex;flex-wrap:wrap;gap:0;">
    ${inf.email?_contactLine('✉',inf.email):''}${inf.telephone?_contactLine('📞',inf.telephone):''}${(inf.ville||inf.pays_residence)?_contactLine('📍',[inf.ville,inf.pays_residence].filter(Boolean).join(', ')):''}${inf.linkedin?_contactLine('🔗',inf.linkedin):''}
  </div>
  ${d.media?.audio ? _audioWidget(d.media.audio) : ''}
  ${d.media?.video ? _videoWidget(d.media.video) : ''}
  ${_hasText(d.resume) ? `<div class="cv-rich" style="font-size:9.5pt;color:#333;line-height:1.7;margin-bottom:16px;border-left:3px solid ${s.couleur2};padding-left:10px;">${_rich(d.resume)}</div>` : ''}
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;">
    <div>
      ${d.experiences?.length ? `${_sectionTitle('Expériences', s)}${d.experiences.map(_expBlock).join('')}` : ''}
    </div>
    <div>
      ${d.formations?.length ? `${_sectionTitle('Formations', s)}${d.formations.map(_eduBlock).join('')}` : ''}
      ${allComps.length ? `${_sectionTitle('Compétences', s)}<div>${allComps.map(c=>`<span style="display:inline-block;font-size:8pt;border:1px solid ${s.couleur1};color:${s.couleur1};padding:1px 8px;border-radius:3px;margin:2px;">${_e(c)}</span>`).join('')}</div>` : ''}
      ${d.langues?.length ? `${_sectionTitle('Langues', s)}${d.langues.map(l=>`<div style="font-size:9pt;margin-bottom:3px;">${_e(l.langue)} <span style="color:#999;">— ${_e(l.niveau)}</span></div>`).join('')}` : ''}
      ${d.interests?.length ? `${_sectionTitle("Intérêts", s)}<div style="font-size:9pt;color:#555;">${d.interests.join(' · ')}</div>` : ''}
    </div>
  </div>
  ${_blocsHTML(d.blocs, s)}
  <div style="height:24px;flex:none;"></div>
  <div style="margin-top:auto;border-top:1px solid #eee;padding-top:12px;display:flex;flex-direction:column;">
    ${d.media?.signature ? _sigWidget(d.media.signature) : ''}
    ${_qrFooter(d.media?.qr)}
  </div>
</div>`;
  }
};

/* ══════════════════════════════════
   TEMPLATE 5 — DIASPORA (couleurs Afrique)
══════════════════════════════════ */
CV_TEMPLATES['diaspora'] = {
  name: 'Diaspora', category: 'Identitaire',
  preview: 'linear-gradient(135deg,#e67e22 0%,#2980b9 50%,#27ae60 100%)',
  render(d, s) {
    const inf = d.infos || {};
    const ac = s.couleur1 || '#e67e22';
    return `
<div style="display:flex;flex-direction:column;font-family:${s.font||'Segoe UI'};font-size:${s.fontSize||11}pt;background:#fff;min-height:297mm;">
  <div style="background:${ac};padding:4px 0;"></div>
  <div style="background:#1a2b4a;color:#fff;padding:20px 24px;display:flex;align-items:center;gap:16px;">
    ${_photoSlot(d.photo, {...s, couleur2: ac}, d._edit, {dark:true})}
    <div style="flex:1;">
      <div style="font-size:18pt;font-weight:800;">${_e([inf.prenom,inf.nom].filter(Boolean).join(' ')||'Votre Nom')}</div>
      ${inf.titre_pro ? `<div style="font-size:10pt;color:${ac};margin-top:3px;">${_e(inf.titre_pro)}</div>` : ''}
      <div style="font-size:8.5pt;opacity:.75;margin-top:8px;">
        ${[inf.email,inf.telephone,[inf.ville,inf.pays_residence].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
      </div>
    </div>
    ${inf.nationalite ? `<div style="text-align:center;background:rgba(255,255,255,.1);padding:10px;border-radius:8px;font-size:8.5pt;"><div style="font-size:20px;">🌍</div>${_e(inf.nationalite)}</div>` : ''}
  </div>
  <div style="background:${ac};height:4px;"></div>
  ${d.media?.audio ? `<div style="padding:8px 24px 0;">${_audioWidget(d.media.audio)}</div>` : ''}
  ${d.media?.video ? `<div style="padding:8px 24px 0;">${_videoWidget(d.media.video)}</div>` : ''}
  <div style="display:grid;grid-template-columns:240px 1fr;">
    <div style="background:#f8f9ff;padding:16px;border-right:3px solid ${ac};">
      ${_hasText(d.resume) ? `<div class="cv-rich" style="font-size:9pt;color:#333;line-height:1.6;margin-bottom:12px;font-style:italic;">${_rich(d.resume)}</div>` : ''}
      ${(d.competences?.tech?.length||d.competences?.metier?.length) ? `
        <div style="font-size:8pt;font-weight:800;color:${ac};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${ac};padding-bottom:2px;margin-bottom:6px;">Compétences</div>
        ${[...(d.competences.tech||[]),...(d.competences.metier||[])].map(c=>`<div style="font-size:8.5pt;padding:3px 0;border-bottom:1px solid #eee;">${_e(c)}</div>`).join('')}
      ` : ''}
      ${d.langues?.length ? `
        <div style="font-size:8pt;font-weight:800;color:${ac};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${ac};padding-bottom:2px;margin:12px 0 6px;">Langues</div>
        ${d.langues.map(l=>`<div style="display:flex;justify-content:space-between;font-size:9pt;margin-bottom:4px;"><span>${_e(l.langue)}</span><span style="color:#999;font-size:8pt;">${_e(l.niveau)}</span></div>`).join('')}
      ` : ''}
      ${d.interests?.length ? `
        <div style="font-size:8pt;font-weight:800;color:${ac};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${ac};padding-bottom:2px;margin:12px 0 6px;">Intérêts</div>
        <div>${d.interests.map(i=>`<span style="display:inline-block;background:${ac}22;color:${ac};padding:2px 7px;border-radius:10px;font-size:8pt;margin:2px;">${_e(i)}</span>`).join('')}</div>
      ` : ''}
    </div>
    <div style="padding:16px 20px;">
      ${d.experiences?.length ? `
        <div style="font-size:8pt;font-weight:800;color:${ac};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${ac};padding-bottom:2px;margin-bottom:10px;">Expériences professionnelles</div>
        ${d.experiences.map(e=>`<div style="margin-bottom:12px;padding-left:10px;border-left:3px solid ${ac}44;">${_expBlock(e)}</div>`).join('')}
      ` : ''}
      ${d.formations?.length ? `
        <div style="font-size:8pt;font-weight:800;color:${ac};text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid ${ac};padding-bottom:2px;margin:14px 0 10px;">Formations</div>
        ${d.formations.map(_eduBlock).join('')}
      ` : ''}
      ${_blocsHTML(d.blocs, s)}
      ${d.media?.signature ? `<div style="margin-top:20px;">${_sigWidget(d.media.signature)}</div>` : ''}
    </div>
  </div>
  ${_qrFooter(d.media?.qr)}
</div>`;
  }
};

/* ══════════════════════════════════
   TEMPLATE 6 — CORPORATE (sobre, entreprise)
══════════════════════════════════ */
CV_TEMPLATES['corporate'] = {
  name: 'Corporate', category: 'Entreprise',
  preview: 'linear-gradient(180deg,#22314a 60px,#fff 60px)',
  render(d, s) {
    const inf = d.infos || {};
    const allComps = [...(d.competences?.tech||[]),...(d.competences?.metier||[]),...(d.competences?.num||[])];
    return `
<div style="display:flex;flex-direction:column;font-family:${s.font||'Arial'};font-size:${s.fontSize||10.5}pt;background:#fff;min-height:297mm;">
  <div style="background:${s.couleur1};color:#fff;padding:16px 28px;display:flex;justify-content:space-between;align-items:center;">
    <div style="display:flex;align-items:center;gap:14px;">
      ${_photoSlot(d.photo, {...s, couleur2:'#fff'}, d._edit, {dark:true})}
      <div>
        <div style="font-size:17pt;font-weight:700;">${_e([inf.prenom,inf.nom].filter(Boolean).join(' ')||'Votre Nom')}</div>
        ${inf.titre_pro ? `<div style="font-size:9.5pt;color:${s.couleur2};font-weight:600;">${_e(inf.titre_pro)}</div>` : ''}
      </div>
    </div>
    <div style="text-align:right;font-size:8pt;opacity:.85;line-height:1.7;">
      ${inf.email?`${_e(inf.email)}<br>`:''}${inf.telephone?`${_e(inf.telephone)}<br>`:''}${(inf.ville||inf.pays_residence)?_e([inf.ville,inf.pays_residence].filter(Boolean).join(', ')):''}
    </div>
  </div>
  <div style="padding:20px 28px;flex:1;display:flex;flex-direction:column;">
    ${_hasText(d.resume) ? `<div class="cv-rich" style="font-size:9.5pt;color:#333;line-height:1.6;padding:10px 14px;background:#f5f6f9;border-radius:4px;margin-bottom:16px;">${_rich(d.resume)}</div>` : ''}
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:24px;">
      <div>
        ${d.experiences?.length ? `${_sectionTitle('Expérience professionnelle', s)}${d.experiences.map(_expBlock).join('')}` : ''}
        ${d.formations?.length ? `${_sectionTitle('Formation', s)}${d.formations.map(_eduBlock).join('')}` : ''}
        ${_blocsHTML(d.blocs, s)}
      </div>
      <div>
        ${allComps.length ? `${_sectionTitle('Compétences clés', s)}${allComps.map(c=>`<div style="font-size:8.5pt;padding:4px 0;border-bottom:1px solid #eee;">${_e(c)}</div>`).join('')}` : ''}
        ${d.langues?.length ? `${_sectionTitle('Langues', s)}${d.langues.map(l=>`<div style="display:flex;justify-content:space-between;font-size:9pt;margin-bottom:4px;"><span>${_e(l.langue)}</span><span style="color:#999;font-size:8pt;">${_e(l.niveau)}</span></div>`).join('')}` : ''}
        ${d.certifications?.length ? `${_sectionTitle('Certifications', s)}${d.certifications.map(c=>`<div style="font-size:8.5pt;margin-bottom:5px;"><strong>${_e(c.nom)}</strong></div>`).join('')}` : ''}
      </div>
    </div>
    ${d.media?.signature ? `<div style="margin-top:20px;">${_sigWidget(d.media.signature)}</div>` : ''}
    ${_qrFooter(d.media?.qr)}
  </div>
</div>`;
  }
};

/* ══════════════════════════════════
   TEMPLATE 7 — CRÉATIF (formes, couleurs vives)
══════════════════════════════════ */
CV_TEMPLATES['creatif'] = {
  name: 'Créatif', category: 'Design',
  preview: 'linear-gradient(135deg,#ff6b6b 0%,#4ecdc4 50%,#ffe66d 100%)',
  render(d, s) {
    const inf = d.infos || {};
    return `
<div style="display:flex;flex-direction:column;font-family:${s.font||'Poppins,Segoe UI'};font-size:${s.fontSize||11}pt;background:#fff;min-height:297mm;position:relative;overflow:hidden;">
  <div style="position:absolute;top:-60px;right:-60px;width:220px;height:220px;border-radius:50%;background:${s.couleur2}22;"></div>
  <div style="position:absolute;top:100px;right:-30px;width:100px;height:100px;border-radius:50%;background:${s.couleur1}18;"></div>
  <div style="position:relative;padding:28px;display:flex;align-items:center;gap:18px;">
    ${_photoSlot({...d.photo, shape:'round'}, s, d._edit)}
    <div>
      <div style="font-size:24pt;font-weight:900;color:${s.couleur1};line-height:1;">${_e(inf.prenom||'Votre')}</div>
      <div style="font-size:24pt;font-weight:900;color:${s.couleur2};line-height:1.1;">${_e(inf.nom||'Nom')}</div>
      ${inf.titre_pro ? `<div style="display:inline-block;margin-top:8px;background:${s.couleur1};color:#fff;padding:4px 12px;border-radius:20px;font-size:9pt;font-weight:700;">${_e(inf.titre_pro)}</div>` : ''}
    </div>
  </div>
  <div style="position:relative;padding:0 28px 28px;font-size:8.5pt;color:#666;display:flex;flex-wrap:wrap;gap:12px;margin-bottom:6px;">
    ${inf.email?_contactLine('✉',inf.email):''}${inf.telephone?_contactLine('📞',inf.telephone):''}${(inf.ville||inf.pays_residence)?_contactLine('📍',[inf.ville,inf.pays_residence].filter(Boolean).join(', ')):''}
  </div>
  <div style="position:relative;padding:0 28px;display:grid;grid-template-columns:1fr 1fr;gap:20px;">
    <div>
      ${_hasText(d.resume) ? `<div class="cv-rich" style="background:${s.couleur3||'#fef9e7'};border-radius:14px;padding:12px 16px;font-size:9.5pt;color:#333;line-height:1.6;margin-bottom:14px;">${_rich(d.resume)}</div>` : ''}
      ${d.experiences?.length ? `${_sectionTitle('Expériences', s)}${d.experiences.map(_expBlock).join('')}` : ''}
    </div>
    <div>
      ${d.formations?.length ? `${_sectionTitle('Formations', s)}${d.formations.map(_eduBlock).join('')}` : ''}
      ${[...(d.competences?.tech||[]),...(d.competences?.metier||[]),...(d.competences?.num||[])].length ? `${_sectionTitle('Compétences', s)}<div>${_tags([...(d.competences?.tech||[]),...(d.competences?.metier||[]),...(d.competences?.num||[])], s.couleur2+'22', s.couleur1)}</div>` : ''}
      ${d.interests?.length ? `${_sectionTitle("Passions", s)}<div>${_tags(d.interests, s.couleur1+'18', s.couleur2)}</div>` : ''}
    </div>
  </div>
  <div style="position:relative;padding:0 28px;">${_blocsHTML(d.blocs, s)}</div>
  ${d.media?.signature ? `<div style="position:relative;padding:16px 28px 0;">${_sigWidget(d.media.signature)}</div>` : ''}
  <div style="position:relative;padding:0 28px 20px;margin-top:auto;display:flex;flex-direction:column;">${_qrFooter(d.media?.qr)}</div>
</div>`;
  }
};

/* ══════════════════════════════════
   TEMPLATE 8 — INTERNATIONAL (bilingue, format universel)
══════════════════════════════════ */
CV_TEMPLATES['international'] = {
  name: 'International', category: 'Universel',
  preview: 'linear-gradient(90deg,#fff 0%,#fff 70%,#0a3d62 70%,#0a3d62 100%)',
  render(d, s) {
    const inf = d.infos || {};
    return `
<div style="font-family:${s.font||'Arial'};font-size:${s.fontSize||10}pt;background:#fff;min-height:297mm;display:grid;grid-template-columns:1fr 200px;">
  <div style="padding:26px 24px;">
    <div style="border-bottom:3px solid ${s.couleur1};padding-bottom:12px;margin-bottom:14px;">
      <div style="font-size:20pt;font-weight:800;color:${s.couleur1};">${_e([inf.prenom,inf.nom].filter(Boolean).join(' ')||'Full Name')}</div>
      ${inf.titre_pro ? `<div style="font-size:11pt;color:#555;margin-top:2px;">${_e(inf.titre_pro)}</div>` : ''}
    </div>
    ${_hasText(d.resume) ? `${_sectionTitle('Profile / Profil', s)}<div class="cv-rich" style="font-size:9.5pt;color:#333;line-height:1.6;">${_rich(d.resume)}</div>` : ''}
    ${d.experiences?.length ? `${_sectionTitle('Work Experience / Expériences', s)}${d.experiences.map(_expBlock).join('')}` : ''}
    ${d.formations?.length ? `${_sectionTitle('Education / Formations', s)}${d.formations.map(_eduBlock).join('')}` : ''}
    ${_blocsHTML(d.blocs, s)}
    ${d.media?.signature ? `<div style="margin-top:20px;">${_sigWidget(d.media.signature)}</div>` : ''}
  </div>
  <div style="background:${s.couleur1};color:#fff;padding:26px 16px;">
    ${_photoSlot(d.photo, {...s, couleur2:'#fff'}, d._edit, {dark:true})}
    ${_qrWidget(d.media?.qr, true)}
    ${_sectionTitle('Contact', s, true)}
    <div style="font-size:8.5pt;line-height:1.9;">
      ${inf.email?`✉ ${_e(inf.email)}<br>`:''}${inf.telephone?`📞 ${_e(inf.telephone)}<br>`:''}${(inf.ville||inf.pays_residence)?`📍 ${_e([inf.ville,inf.pays_residence].filter(Boolean).join(', '))}<br>`:''}${inf.linkedin?`🔗 ${_e(inf.linkedin)}`:''}
    </div>
    ${inf.nationalite ? `${_sectionTitle('Nationality / Nationalité', s, true)}<div style="font-size:9pt;">${_e(inf.nationalite)}</div>` : ''}
    ${d.langues?.length ? `${_sectionTitle('Languages / Langues', s, true)}${d.langues.map(l=>`<div style="display:flex;justify-content:space-between;font-size:8.5pt;margin-bottom:4px;"><span>${_e(l.langue)}</span><span style="opacity:.7;">${_e(l.niveau)}</span></div>`).join('')}` : ''}
    ${[...(d.competences?.tech||[]),...(d.competences?.metier||[]),...(d.competences?.num||[])].length ? `${_sectionTitle('Skills / Compétences', s, true)}${[...(d.competences?.tech||[]),...(d.competences?.metier||[]),...(d.competences?.num||[])].map(c=>`<div style="font-size:8pt;margin-bottom:3px;">• ${_e(c)}</div>`).join('')}` : ''}
    ${d.certifications?.length ? `${_sectionTitle('Certifications', s, true)}${d.certifications.map(c=>`<div style="font-size:8pt;margin-bottom:4px;">${_e(c.nom)}</div>`).join('')}` : ''}
  </div>
</div>`;
  }
};

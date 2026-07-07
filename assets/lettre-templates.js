/**
 * Diaspo'Actif — Moteur de templates Lettre de motivation
 * Chaque template est { name, category, preview, render(data, style) → HTML }
 */
window.LETTRE_TEMPLATES = {};

function _le(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _leQr(qr) {
  if (!qr?.enabled || !qr?.url) return '';
  const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(qr.url)}`;
  return `<div style="text-align:center;margin-top:24pt;">
    <img src="${apiUrl}" style="width:48px;height:48px;border-radius:4px;" alt="QR profil">
    <div style="font-size:6.5pt;color:#888;margin-top:2px;">Scanner pour voir mon profil complet</div>
  </div>`;
}

/* ══ TEMPLATE 1 — CLASSIQUE ══ */
LETTRE_TEMPLATES['classique'] = {
  name: 'Classique', category: 'Traditionnel',
  preview: 'linear-gradient(180deg,#fff 0%,#f4f4f4 100%)',
  render(d, s) {
    return `
<div style="font-family:${s.font||'Georgia,serif'};font-size:${s.fontSize||11}pt;line-height:1.7;color:#222;">
  <div style="margin-bottom:20pt;font-size:10pt;">
    <strong style="font-size:12pt;color:${s.couleur1};">${_le(d.prenom)} ${_le(d.nom)}</strong><br>
    ${d.adresse?_le(d.adresse)+'<br>':''}${d.ville?_le(d.ville)+'<br>':''}${d.tel?_le(d.tel)+'<br>':''}${d.email?_le(d.email):''}
  </div>
  ${d.destNom||d.destEntreprise ? `<div style="margin-bottom:20pt;text-align:right;font-size:10pt;color:#333;">
    ${d.destNom?_le(d.destNom)+'<br>':''}${d.destFonction?_le(d.destFonction)+'<br>':''}${d.destEntreprise?'<strong>'+_le(d.destEntreprise)+'</strong><br>':''}${d.destAdresse?_le(d.destAdresse):''}
  </div>` : ''}
  ${d.lieuDate?`<div style="margin-bottom:20pt;font-size:10pt;color:#555;">${_le(d.lieuDate)}</div>`:''}
  ${d.objet?`<div style="margin-bottom:20pt;font-size:10.5pt;"><strong style="color:${s.couleur1};">Objet :</strong> ${_le(d.objet)}</div>`:''}
  <div style="font-size:11pt;color:#222;white-space:pre-wrap;">${_le(d.corps)}</div>
  <div style="margin-top:30pt;font-size:10.5pt;">
    ${d.sigTexte?_le(d.sigTexte):_le((d.prenom+' '+d.nom).trim())}
    ${d.sigData?`<img src="${d.sigData}" style="max-height:60px;margin-top:8px;display:block;" alt="Signature">`:''}
  </div>
  ${_leQr(d.qr)}
</div>`;
  }
};

/* ══ TEMPLATE 2 — MODERNE ══ */
LETTRE_TEMPLATES['moderne'] = {
  name: 'Moderne', category: 'Professionnel',
  preview: 'linear-gradient(180deg,#1a3a5c 30px,#fff 30px)',
  render(d, s) {
    return `
<div style="font-family:${s.font||'Segoe UI'};font-size:${s.fontSize||11}pt;line-height:1.7;color:#222;">
  <div style="background:${s.couleur1};color:#fff;padding:14pt 18pt;margin:-30mm -25mm 20pt;">
    <div style="font-size:15pt;font-weight:800;">${_le(d.prenom)} ${_le(d.nom)}</div>
    <div style="font-size:8.5pt;opacity:.85;margin-top:4px;">${[d.email,d.tel,d.ville].filter(Boolean).map(_le).join(' · ')}</div>
  </div>
  ${d.destNom||d.destEntreprise ? `<div style="margin-bottom:16pt;font-size:10pt;color:#333;border-left:3px solid ${s.couleur2};padding-left:10px;">
    ${d.destNom?_le(d.destNom)+'<br>':''}${d.destFonction?_le(d.destFonction)+'<br>':''}${d.destEntreprise?'<strong>'+_le(d.destEntreprise)+'</strong><br>':''}${d.destAdresse?_le(d.destAdresse):''}
  </div>` : ''}
  <div style="display:flex;justify-content:space-between;margin-bottom:16pt;font-size:10pt;color:#555;">
    <span>${d.lieuDate?_le(d.lieuDate):''}</span>
  </div>
  ${d.objet?`<div style="margin-bottom:18pt;font-size:10.5pt;background:${s.couleur3||'#eef4fb'};padding:8pt 12pt;border-radius:6px;"><strong style="color:${s.couleur1};">Objet :</strong> ${_le(d.objet)}</div>`:''}
  <div style="font-size:11pt;color:#222;white-space:pre-wrap;">${_le(d.corps)}</div>
  <div style="margin-top:28pt;font-size:10.5pt;color:${s.couleur1};font-weight:700;">
    ${d.sigTexte?_le(d.sigTexte):_le((d.prenom+' '+d.nom).trim())}
    ${d.sigData?`<img src="${d.sigData}" style="max-height:60px;margin-top:8px;display:block;" alt="Signature">`:''}
  </div>
  ${_leQr(d.qr)}
</div>`;
  }
};

/* ══ TEMPLATE 3 — ÉLÉGANT ══ */
LETTRE_TEMPLATES['elegant'] = {
  name: 'Élégant', category: 'Premium',
  preview: 'linear-gradient(90deg,#2c3e50 8px,#fff 8px)',
  render(d, s) {
    return `
<div style="font-family:${s.font||'Georgia,serif'};font-size:${s.fontSize||11}pt;line-height:1.75;color:#222;border-left:5px solid ${s.couleur1};padding-left:20pt;">
  <div style="margin-bottom:22pt;">
    <div style="font-size:17pt;font-weight:300;letter-spacing:1px;color:${s.couleur1};">${_le(d.prenom)} <strong>${_le(d.nom)}</strong></div>
    <div style="font-size:9pt;color:#777;margin-top:4px;">${[d.adresse,d.ville].filter(Boolean).map(_le).join(' · ')}${(d.tel||d.email)?' — ':''}${[d.tel,d.email].filter(Boolean).map(_le).join(' · ')}</div>
  </div>
  ${d.destNom||d.destEntreprise ? `<div style="margin-bottom:20pt;font-size:10pt;color:#333;font-style:italic;">
    ${d.destNom?_le(d.destNom)+'<br>':''}${d.destFonction?_le(d.destFonction)+'<br>':''}${d.destEntreprise?'<strong>'+_le(d.destEntreprise)+'</strong><br>':''}${d.destAdresse?_le(d.destAdresse):''}
  </div>` : ''}
  ${d.lieuDate?`<div style="margin-bottom:18pt;font-size:9.5pt;color:#999;font-style:italic;">${_le(d.lieuDate)}</div>`:''}
  ${d.objet?`<div style="margin-bottom:20pt;font-size:11pt;color:${s.couleur2};font-weight:700;letter-spacing:.5px;">${_le(d.objet)}</div>`:''}
  <div style="font-size:11pt;color:#222;white-space:pre-wrap;">${_le(d.corps)}</div>
  <div style="margin-top:30pt;font-size:11pt;font-style:italic;color:${s.couleur1};">
    ${d.sigTexte?_le(d.sigTexte):_le((d.prenom+' '+d.nom).trim())}
    ${d.sigData?`<img src="${d.sigData}" style="max-height:60px;margin-top:8px;display:block;" alt="Signature">`:''}
  </div>
  ${_leQr(d.qr)}
</div>`;
  }
};

/* ══ TEMPLATE 4 — MINIMALISTE ══ */
LETTRE_TEMPLATES['minimaliste'] = {
  name: 'Minimaliste', category: 'Épuré',
  preview: 'linear-gradient(135deg,#fff 0%,#f7f7f7 100%)',
  render(d, s) {
    return `
<div style="font-family:${s.font||'Arial'};font-size:${s.fontSize||10.5}pt;line-height:1.8;color:#222;">
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24pt;padding-bottom:10pt;border-bottom:1px solid #ddd;">
    <div>
      <div style="font-size:14pt;font-weight:700;letter-spacing:-.3px;">${_le(d.prenom)} ${_le(d.nom)}</div>
      <div style="font-size:8.5pt;color:#888;margin-top:3px;">${[d.email,d.tel].filter(Boolean).map(_le).join('  ·  ')}</div>
    </div>
    ${d.lieuDate?`<div style="font-size:9pt;color:#999;">${_le(d.lieuDate)}</div>`:''}
  </div>
  ${d.destNom||d.destEntreprise ? `<div style="margin-bottom:18pt;font-size:9.5pt;color:#555;">
    ${d.destNom?_le(d.destNom)+' — ':''}${d.destEntreprise?_le(d.destEntreprise):''}${d.destFonction?' ('+_le(d.destFonction)+')':''}
  </div>` : ''}
  ${d.objet?`<div style="margin-bottom:18pt;font-size:10pt;border-bottom:2px solid ${s.couleur1};display:inline-block;padding-bottom:2px;">${_le(d.objet)}</div>`:''}
  <div style="font-size:10.5pt;color:#222;white-space:pre-wrap;">${_le(d.corps)}</div>
  <div style="margin-top:26pt;font-size:10pt;">
    ${d.sigTexte?_le(d.sigTexte):_le((d.prenom+' '+d.nom).trim())}
    ${d.sigData?`<img src="${d.sigData}" style="max-height:50px;margin-top:8px;display:block;" alt="Signature">`:''}
  </div>
  ${_leQr(d.qr)}
</div>`;
  }
};

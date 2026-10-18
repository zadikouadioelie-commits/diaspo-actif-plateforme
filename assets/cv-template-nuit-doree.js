/**
 * Diaspo'Actif — Modèle de CV « Nuit dorée » (PROPOSITION, 2026-10-12)
 * Même ADN que le nouveau design du site : bandeau d'en-tête nuit, filets et repères or, titres en Bodoni, papier ivoire.
 * S'enregistre comme les autres modèles (CV_TEMPLATES[id] = { name, category, preview, render }) ; chargé APRÈS cv-templates.js.
 * Couleurs : couleur1 = nuit (bandeau), couleur2 = or (repères), couleur3 = ivoire (colonne latérale). Préréglage « Nuit dorée » fourni.
 * Impression / PDF : le papier reste clair, seul le bandeau est sombre (peu d'encre, lisible sur tout lecteur).
 */
(function () {
  if (typeof CV_TEMPLATES === 'undefined') return;
  if (typeof document !== 'undefined' && !document.getElementById('cv-nd-fonts')) {
    const l = document.createElement('link');
    l.id = 'cv-nd-fonts'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Bodoni+Moda:opsz,wght@6..96,500;6..96,600&family=Manrope:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(l);
  }
  /* Guillemets simples : ces piles de polices sont insérées dans des attributs style="…" (des guillemets doubles les couperaient). */
  const TITRES = "'Bodoni Moda','Didot','Georgia',serif";
  const CORPS = "'Manrope','Segoe UI',system-ui,sans-serif";

  function titre(label, s) {
    return `<div style="display:flex;align-items:center;gap:8px;margin:16px 0 9px;">
      <span style="font-family:${TITRES};font-size:12.5pt;font-weight:600;color:${s.couleur1};letter-spacing:.01em;white-space:nowrap;">${label}</span>
      <span style="flex:1;height:1px;background:linear-gradient(90deg,${s.couleur2},rgba(185,137,58,0));"></span>
    </div>`;
  }
  function exp(e, s) {
    const lieu = [e.ville, e.pays].filter(Boolean).join(', ');
    const dates = _fmtDate(e.date_debut) + (e.actuel ? ' — Présent' : e.date_fin ? ' — ' + _fmtDate(e.date_fin) : '');
    return `<div style="position:relative;margin:0 0 12px;padding-left:15px;break-inside:avoid;">
      <span style="position:absolute;left:0;top:4px;width:7px;height:7px;border-radius:50%;background:${s.couleur2};box-shadow:0 0 0 3px rgba(185,137,58,.18);"></span>
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;">
        <div style="font-weight:800;font-size:10.5pt;color:var(--cv-txt,#101827);">${_e(e.poste || 'Poste')}</div>
        <div style="font-size:8pt;font-weight:700;letter-spacing:.04em;color:${s.couleur2};white-space:nowrap;">${dates}</div>
      </div>
      <div style="font-size:9pt;color:var(--cv-txt,#4a5468);margin:1px 0 3px;font-weight:600;">${_e(e.entreprise || '')}${lieu ? ' · ' + _e(lieu) : ''}</div>
      ${_hasText(e.description) ? `<div class="cv-rich" style="font-size:9pt;color:var(--cv-txt,#2d3648);line-height:1.55;">${_rich(e.description)}</div>` : ''}
    </div>`;
  }
  function edu(e, s) {
    return `<div style="position:relative;margin:0 0 10px;padding-left:15px;break-inside:avoid;">
      <span style="position:absolute;left:0;top:4px;width:7px;height:7px;border-radius:50%;background:${s.couleur2};box-shadow:0 0 0 3px rgba(185,137,58,.18);"></span>
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline;">
        <div style="font-weight:800;font-size:10pt;color:var(--cv-txt,#101827);">${_e(e.diplome || 'Diplôme')}</div>
        ${e.annee ? `<div style="font-size:8pt;font-weight:700;letter-spacing:.04em;color:${s.couleur2};">${_e(e.annee)}</div>` : ''}
      </div>
      <div style="font-size:9pt;color:var(--cv-txt,#4a5468);font-weight:600;">${_e(e.etablissement || '')}${e.pays ? ' · ' + _e(e.pays) : ''}</div>
      ${_hasText(e.description) ? `<div class="cv-rich" style="font-size:9pt;color:var(--cv-txt,#2d3648);line-height:1.5;margin-top:2px;">${_rich(e.description)}</div>` : ''}
    </div>`;
  }
  function pastilles(items, s) {
    return items.map(t => `<span style="display:inline-block;margin:0 4px 5px 0;padding:2px 9px;border-radius:999px;border:1px solid ${s.couleur2};color:var(--cv-txt,#1b2233);font-size:8pt;font-weight:600;background:#fffdf7;">${_e(t)}</span>`).join('');
  }
  function points(niveau) {
    const n = Math.max(1, Math.min(5, niveau));
    return Array.from({ length: 5 }, (_, i) => `<span style="display:inline-block;width:6px;height:6px;border-radius:50%;margin-left:3px;background:${i < n ? '#B9893A' : '#d9cfb6'};"></span>`).join('');
  }
  const NIV = { 'débutant': 1, 'notions': 1, 'a1': 1, 'a2': 2, 'élémentaire': 2, 'intermédiaire': 3, 'b1': 3, 'b2': 4, 'avancé': 4, 'courant': 4, 'c1': 4, 'c2': 5, 'bilingue': 5, 'natif': 5, 'langue maternelle': 5, 'maternelle': 5 };
  function niveauLangue(txt) {
    const k = String(txt || '').trim().toLowerCase();
    return NIV[k] || (Object.keys(NIV).find(x => k.includes(x)) ? NIV[Object.keys(NIV).find(x => k.includes(x))] : 3);
  }

  CV_TEMPLATES['nuit-doree'] = {
    name: 'Nuit dorée', category: 'Prestige',
    preview: 'linear-gradient(180deg,#0B1226 0,#0B1226 34%,#B9893A 34%,#B9893A 36%,#F3EDDC 36%)',
    render(d, s) {
      const inf = d.infos || {};
      const nom = [inf.prenom, inf.nom].filter(Boolean).join(' ') || 'Votre Nom';
      const lieu = [inf.ville, inf.pays_residence].filter(Boolean).join(', ');
      const contacts = [
        inf.email && `✉ ${_e(inf.email)}`, inf.telephone && `☎ ${_e(inf.telephone)}`, lieu && `⌖ ${_e(lieu)}`,
        inf.linkedin && `${_logoLien('linkedin')} ${_e(inf.linkedin)}`, inf.site && `🌐 ${_e(inf.site)}`, inf.diasporactif && `${_logoLien('da')} ${_e(inf.diasporactif)}`
      ].filter(Boolean).map(x => `<span style="display:inline-flex;align-items:center;gap:5px;margin:0 14px 3px 0;white-space:nowrap;">${x}</span>`).join('');
      const comps = [['Techniques', d.competences?.tech], ['Métiers', d.competences?.metier], ['Numériques', d.competences?.num]].filter(c => c[1]?.length);
      const lateral = (comps.length || d.langues?.length || d.certifications?.length || d.interests?.length || inf.nationalite);
      const petit = t => `<div style="font-size:7pt;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#8a6a2c;margin:8px 0 4px;">${t}</div>`;
      const ph = _photoSlot(d.photo, s, d._edit, { dark: true });
      return `
<div style="display:flex;flex-direction:column;min-height:297mm;background:#fffdf7;font-family:${CORPS};font-size:${s.fontSize || 11}pt;color:var(--cv-txt,#101827);${_txtVar(s)}">
  <div style="background:linear-gradient(135deg,${s.couleur1} 0%,#060A14 100%);color:#F4F1E8;padding:${s.margins?.top || 15}mm ${s.margins?.right || 15}mm 12mm ${s.margins?.left || 15}mm;display:flex;gap:20px;align-items:center;">
    <div style="flex:1;min-width:0;">
      <div style="font-size:7.5pt;font-weight:800;letter-spacing:.3em;text-transform:uppercase;color:#E3C06E;margin-bottom:6px;">Curriculum vitæ</div>
      <div style="font-family:${TITRES};font-size:27pt;font-weight:500;line-height:1.05;color:var(--cv-nom,#fff);letter-spacing:-.005em;">${_e(nom)}</div>
      ${inf.titre_pro ? `<div style="font-size:11.5pt;color:var(--cv-nom,#E3C06E);margin-top:7px;font-weight:600;">${_e(inf.titre_pro)}</div>` : ''}
      ${contacts ? `<div style="margin-top:12px;font-size:8.5pt;color:var(--cv-coord,#CBD3E4);display:flex;flex-wrap:wrap;">${contacts}</div>` : ''}
    </div>
    ${ph ? `<div style="flex:none;padding:3px;border-radius:${d.photo?.shape === 'square' ? '12px' : '50%'};background:linear-gradient(135deg,#F3DC9B,#B9893A);line-height:0;">${ph}</div>` : ''}
  </div>
  <div style="height:3px;background:linear-gradient(90deg,#F3DC9B,#E3C06E 40%,#B9893A);"></div>
  <div style="display:grid;grid-template-columns:${lateral ? '1fr 62mm' : '1fr'};flex:1;">
    <div style="padding:7mm ${lateral ? '9mm' : (s.margins?.right || 15) + 'mm'} 8mm ${s.margins?.left || 15}mm;">
      ${d.media?.audio ? _audioWidget(d.media.audio) : ''}
      ${d.media?.video ? _videoWidget(d.media.video) : ''}
      ${_hasText(d.resume) ? `${titre('Profil', s)}<div class="cv-rich" style="font-size:9.5pt;color:var(--cv-txt,#2d3648);line-height:1.65;">${_rich(d.resume)}</div>` : ''}
      ${d.experiences?.length ? `${titre('Expériences professionnelles', s)}${d.experiences.map(e => exp(e, s)).join('')}` : ''}
      ${d.formations?.length ? `${titre('Formations', s)}${d.formations.map(e => edu(e, s)).join('')}` : ''}
      ${_blocsHTML(d.blocs, s)}
      ${d.media?.signature ? `<div style="margin-top:18px;">${_sigWidget(d.media.signature)}</div>` : ''}
    </div>
    ${lateral ? `<div style="background:${s.couleur3 || '#F3EDDC'};padding:7mm 8mm 8mm 8mm;border-left:1px solid rgba(185,137,58,.35);">
      ${comps.length ? `${titre('Compétences', s)}${comps.map(c => `${petit(c[0])}<div>${pastilles(c[1], s)}</div>`).join('')}` : ''}
      ${d.langues?.length ? `${titre('Langues', s)}${d.langues.map(l => `<div style="display:flex;justify-content:space-between;align-items:center;font-size:9pt;margin-bottom:5px;"><span style="font-weight:700;">${_e(l.langue)}</span><span style="display:inline-flex;align-items:center;" title="${_e(l.niveau)}">${points(niveauLangue(l.niveau))}</span></div>`).join('')}` : ''}
      ${d.certifications?.length ? `${titre('Certifications', s)}${d.certifications.map(c => `<div style="font-size:8.5pt;margin-bottom:6px;line-height:1.35;"><strong>${_e(c.nom)}</strong>${c.organisme ? `<br><span style="color:var(--cv-txt,#4a5468);">${_e(c.organisme)}</span>` : ''}</div>`).join('')}` : ''}
      ${d.interests?.length ? `${titre("Centres d'intérêt", s)}<div>${pastilles(d.interests, s)}</div>` : ''}
      ${inf.nationalite ? `<div style="margin-top:12px;font-size:8.5pt;color:var(--cv-coord,var(--cv-txt,#4a5468));">🌍 ${_e(inf.nationalite)}</div>` : ''}
      ${_qrWidget(d.media?.qr, false)}
    </div>` : ''}
  </div>
  ${!lateral ? _qrFooter(d.media?.qr) : ''}
</div>`;
    }
  };

  /* Préréglage de couleurs « Nuit dorée » dans le panneau Design (si le constructeur le propose). */
  if (typeof COLOR_THEMES !== 'undefined' && Array.isArray(COLOR_THEMES) && !COLOR_THEMES.some(t => t.name === 'Nuit dorée')) {
    COLOR_THEMES.unshift({ name: 'Nuit dorée', couleur1: '#0B1226', couleur2: '#B9893A', couleur3: '#F3EDDC' });
  }

  /* Choisir ce modèle avec les couleurs bleues par défaut : on bascule sur la palette nuit/or/ivoire (sinon l'or devient bleu
     ciel). Un CV qui a déjà des couleurs personnalisées les garde. Sans effet hors de l'éditeur. */
  if (typeof window.selectTemplate === 'function' && !window.selectTemplate.__nd) {
    const choisir = window.selectTemplate;
    window.selectTemplate = function (id) {
      try {
        /* CVB est un « let » de cv-builder.js : pas une propriété de window. */
        const st = (typeof CVB !== 'undefined' && CVB.data) ? CVB.data.style : null;
        if (id === 'nuit-doree' && st && st.couleur1 === '#1a3a5c' && st.couleur2 === '#4a90d9') {
          st.couleur1 = '#0B1226'; st.couleur2 = '#B9893A'; st.couleur3 = '#F3EDDC';
          if (typeof renderDesignPanel === 'function') renderDesignPanel();
        }
      } catch (e) { /* on choisit quand même le modèle */ }
      return choisir.apply(this, arguments);
    };
    window.selectTemplate.__nd = true;
  }
})();

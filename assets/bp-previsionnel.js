/* ═══════════════════════════════════════════════════════════════════
   bp-previsionnel.js — Diaspo'Actif (2026-11-11)
   Prévisionnel détaillé des gains et des dépenses sur 5 ans.

   Le porteur crée librement des SECTIONS (recettes ou dépenses) et, dans chacune, des LIGNES :
   un montant, une fréquence (mensuel, trimestriel, semestriel, annuel, ponctuel, ou année par année),
   une année et un mois de début, une année de fin, une hausse annuelle. Tout le reste est calculé :
   montant de chaque ligne pour chaque année, totaux par section, recettes, dépenses (récurrentes
   et ponctuelles), solde annuel, cumul de trésorerie, marge, besoin de financement.

   Donnée stockée : plan_financier.prevision = { tresorerie_depart, sections:[{ id, nom, nature,
   lignes:[{ id, nom, poste, frequence, montant, annee_debut, mois_debut, annee_fin, croissance_pct,
   v1..v5, note }] }] }. Aucune colonne en base : tout vit dans sections_json.

   Règles : aucun chiffre inventé (une ligne sans montant vaut zéro) ; rien n'est ajouté au compte
   de résultat sans demande explicite (reporterCompteResultat ne fait que CALCULER ce qui serait
   écrit, l'éditeur demande confirmation avant d'écrire).
   Module UMD : window.BPPrevision côté navigateur, require() côté tests.
   ═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPPrevision = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NB_ANS = 5;
  const AN = [1, 2, 3, 4, 5];

  const FREQUENCES = [
    ['mensuel', 'Chaque mois', 12],
    ['trimestriel', 'Chaque trimestre', 4],
    ['semestriel', 'Chaque semestre', 2],
    ['annuel', 'Chaque année', 1],
    ['ponctuel', 'Une seule fois', 1],
    ['personnalise', 'Année par année', 0],
  ];
  const POSTES_RECETTE = [['ca', "Chiffre d'affaires"], ['autres_produits', 'Autres produits']];
  const POSTES_DEPENSE = [['achats', 'Achats & matières'], ['salaires', 'Salaires & charges'], ['loyers', 'Loyers & immobilier'],
    ['marketing_charge', 'Marketing & communication'], ['autres_charges', 'Autres charges'], ['investissement', 'Investissement (hors compte de résultat)']];

  /* Nombre tolérant : « 1 200,50 » → 1200.5 ; tout le reste → 0. */
  function nombre(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v === undefined || v === null) return 0;
    const n = parseFloat(String(v).replace(/[\s  ]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  const a_ = v => v !== undefined && v !== null && String(v).trim() !== '';
  const borne = (v, min, max, defaut) => { const n = Math.round(nombre(v)); return a_(v) && n >= min && n <= max ? n : defaut; };
  const facteur = f => { const x = FREQUENCES.find(r => r[0] === f); return x ? x[2] : 12; };

  let compteur = 0;
  function nouvelId(prefixe) { compteur += 1; return (prefixe || 'p') + Date.now().toString(36) + compteur.toString(36) + Math.floor(Math.random() * 1296).toString(36); }

  function nouvelleLigne(nature) {
    return { id: nouvelId('l'), nom: '', poste: nature === 'recette' ? 'ca' : 'autres_charges', frequence: nature === 'recette' ? 'mensuel' : 'mensuel', montant: '', annee_debut: '1', mois_debut: '', annee_fin: '', croissance_pct: '', note: '' };
  }
  function nouvelleSection(nom, nature) { return { id: nouvelId('s'), nom: nom || '', nature: nature === 'recette' ? 'recette' : 'depense', lignes: [] }; }
  /* Sections proposées au départ (vides : aucun montant n'est inventé). */
  function modeleParDefaut() {
    return { tresorerie_depart: '', sections: [
      nouvelleSection('Recettes', 'recette'),
      nouvelleSection('Dépenses récurrentes', 'depense'),
      nouvelleSection('Investissements et dépenses ponctuelles', 'depense'),
    ] };
  }

  /* Montants d'une ligne pour les années 1 à 5. Une ligne sans montant vaut zéro. */
  function ligneParAn(l) {
    l = l || {};
    const out = [0, 0, 0, 0, 0];
    if (l.frequence === 'personnalise') { AN.forEach((a, i) => { out[i] = nombre(l['v' + a]); }); return out; }
    const m = nombre(l.montant);
    if (!m) return out;
    const debut = borne(l.annee_debut, 1, NB_ANS, 1);
    if (l.frequence === 'ponctuel') { out[debut - 1] = m; return out; }
    const fin = a_(l.annee_fin) ? Math.max(debut, borne(l.annee_fin, 1, NB_ANS, NB_ANS)) : NB_ANS;
    const moisDebut = borne(l.mois_debut, 1, 12, 1);
    const g = nombre(l.croissance_pct) / 100;
    const base = m * facteur(l.frequence);
    for (let a = debut; a <= fin; a++) {
      const part = a === debut ? (13 - moisDebut) / 12 : 1;
      out[a - 1] = base * part * Math.pow(1 + g, a - debut);
    }
    return out;
  }

  const somme = (t, f) => AN.map((_, i) => t.reduce((s, x) => s + f(x)[i], 0));
  const arrondi = n => Math.round(n * 100) / 100;

  /* Calcul complet. `prev` peut être vide ou absent : le résultat est alors « vide ». */
  function calculer(prev) {
    prev = prev || {};
    const secs = (Array.isArray(prev.sections) ? prev.sections : []).map(s => {
      const nature = s && s.nature === 'recette' ? 'recette' : 'depense';
      const lignes = (Array.isArray(s && s.lignes) ? s.lignes : []).map(l => {
        const parAn = ligneParAn(l);
        const poncPoste = l && l.poste === 'investissement';
        const ponctuelle = nature === 'depense' && (l && l.frequence === 'ponctuel' || poncPoste);
        return { id: l && l.id, nom: (l && l.nom) || '', poste: (l && l.poste) || '', frequence: (l && l.frequence) || 'mensuel', parAn, total: parAn.reduce((x, y) => x + y, 0), ponctuelle };
      });
      return { id: s && s.id, nom: (s && s.nom) || '', nature, lignes, parAn: somme(lignes, l => l.parAn), total: lignes.reduce((x, l) => x + l.total, 0) };
    });
    const rec = secs.filter(s => s.nature === 'recette'), dep = secs.filter(s => s.nature === 'depense');
    const recettes = somme(rec, s => s.parAn), depenses = somme(dep, s => s.parAn);
    const ponctuelles = AN.map((_, i) => dep.reduce((s, sec) => s + sec.lignes.filter(l => l.ponctuelle).reduce((x, l) => x + l.parAn[i], 0), 0));
    const recurrentes = AN.map((_, i) => depenses[i] - ponctuelles[i]);
    const depart = nombre(prev.tresorerie_depart);
    let cumul = depart;
    const annees = AN.map((a, i) => {
      const solde = recettes[i] - depenses[i];
      cumul += solde;
      return { a, recettes: recettes[i], depenses: depenses[i], recurrentes: recurrentes[i], ponctuelles: ponctuelles[i],
        recurrentesParMois: recurrentes[i] / 12, solde, cumul, marge: recettes[i] > 0 ? solde / recettes[i] * 100 : null };
    });
    const nbLignes = secs.reduce((n, s) => n + s.lignes.length, 0);
    const vide = !secs.some(s => s.total !== 0);
    const cumulMin = Math.min(depart, ...annees.map(y => y.cumul));
    const premiereRentable = annees.find(y => y.recettes > 0 && y.solde >= 0);
    let anneeRetablie = null;
    const kNeg = annees.findIndex(y => y.cumul < 0);
    if (kNeg >= 0) { const apres = annees.slice(kNeg).find(y => y.cumul >= 0); anneeRetablie = apres ? apres.a : null; }
    const totalRecettes = recettes.reduce((x, y) => x + y, 0), totalDepenses = depenses.reduce((x, y) => x + y, 0);
    const alertes = [];
    if (!vide && !rec.some(s => s.total > 0)) alertes.push('Aucune recette saisie : le solde ne peut être que négatif.');
    if (!vide && rec.some(s => s.total > 0) && dep.every(s => s.total === 0)) alertes.push('Aucune dépense saisie : le solde affiché est donc égal aux recettes.');
    (Array.isArray(prev.sections) ? prev.sections : []).forEach(s => (Array.isArray(s && s.lignes) ? s.lignes : []).forEach(l => {
      if (l && a_(l.annee_fin) && a_(l.annee_debut) && nombre(l.annee_fin) < nombre(l.annee_debut) && l.frequence !== 'ponctuel') alertes.push(`« ${l.nom || 'Ligne sans nom'} » : l'année de fin précède l'année de début, la fin a été alignée sur le début.`);
      if (l && nombre(l.montant) !== 0 && !String(l.nom || '').trim() && l.frequence !== 'personnalise') alertes.push('Une ligne a un montant mais pas de nom.');
    }));
    return { sections: secs, annees, tresorerieDepart: depart, vide, nbLignes,
      totalRecettes, totalDepenses, soldeTotal: totalRecettes - totalDepenses, cumulFinal: annees[NB_ANS - 1].cumul,
      cumulMin, besoinFinancement: Math.max(0, -cumulMin), premiereAnneeRentable: premiereRentable ? premiereRentable.a : null,
      anneeRetablie, alertes };
  }

  /* Ce qui serait écrit dans le compte de résultat (ca_N, achats_N…) : somme des lignes par poste.
     Les investissements ne sont jamais reportés (ils relèvent des immobilisations). Arrondis à l'unité. */
  function reporterCompteResultat(prev) {
    const c = calculer(prev);
    const valeurs = {}; let investissements = 0;
    c.sections.forEach(s => s.lignes.forEach(l => {
      if (s.nature === 'depense' && l.poste === 'investissement') { investissements += l.total; return; }
      const poste = s.nature === 'recette' ? (l.poste === 'autres_produits' ? 'autres_produits' : 'ca')
        : (['achats', 'salaires', 'loyers', 'marketing_charge', 'autres_charges'].includes(l.poste) ? l.poste : 'autres_charges');
      AN.forEach((a, i) => { const k = poste + '_' + a; valeurs[k] = (valeurs[k] || 0) + l.parAn[i]; });
    }));
    Object.keys(valeurs).forEach(k => { valeurs[k] = Math.round(valeurs[k]); });
    return { valeurs, investissements: Math.round(investissements) };
  }

  /* Remplace, pour une lecture simple, les clés manquantes d'une ligne. */
  function normaliserLigne(l, nature) { return Object.assign(nouvelleLigne(nature), l || {}); }

  /* ═══ Affichage partagé (éditeur, vue de lecture, dossier) ═══
     Chaînes HTML/SVG pures. Couleurs par variables CSS (--pv-rec, --pv-dep, --pv-cum, --pv-grille) avec
     valeurs de repli ; tout le texte venant de l'utilisateur passe par ctx.esc. */
  const ECHAPPE = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const compact = n => {
    const a = Math.abs(n), s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' M' : a >= 1e3 ? Math.round(a / 1e3) + ' k' : String(Math.round(a));
    return (n < 0 ? '−' : '') + s;
  };
  const fmtParDefaut = n => (Math.round(n) < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('fr-FR').replace(/ | /g, ' ');

  function svgGraphique(c, ctx) {
    ctx = ctx || {};
    if (!c || c.vide) return '';
    const W = 620, H = 236, pl = 50, pr = 14, pt = 26, pb = 30;
    const vals = [0].concat(c.annees.map(y => y.recettes), c.annees.map(y => y.depenses), c.annees.map(y => y.cumul));
    let max = Math.max(...vals), min = Math.min(...vals);
    if (max === min) return '';
    const marge = (max - min) * 0.06; max += marge; if (min < 0) min -= marge;
    const y = v => pt + (max - v) / (max - min) * (H - pt - pb);
    const nA = c.annees.length, gw = (W - pl - pr) / nA, bw = Math.min(30, gw * 0.3);
    const ticks = Array.from(new Set([Math.round(max - marge), 0, min < 0 ? Math.round(min + marge) : 0]));
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Recettes, dépenses et ${(ctx.libCumul || 'trésorerie cumulée').toLowerCase()} sur ${nA} ans" style="max-width:${W}px;display:block;font-family:inherit;">`;
    ticks.forEach(t => { s += `<line x1="${pl}" y1="${y(t).toFixed(1)}" x2="${W - pr}" y2="${y(t).toFixed(1)}" style="stroke:var(--pv-grille,#cfd6e2)" stroke-width="${t === 0 ? 1.2 : 0.6}"/><text x="${pl - 6}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" style="fill:var(--pv-texte,currentColor)" opacity=".75">${compact(t)}</text>`; });
    const pts = [];
    c.annees.forEach((a, i) => {
      const x0 = pl + gw * (i + 0.5);
      const barre = (v, dx, couleur, nom) => { if (!v) return ''; const top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0)); return `<rect x="${(x0 + dx).toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" rx="2" style="fill:${couleur}"><title>${nom} an ${a.a} : ${fmtParDefaut(v)}</title></rect>`; };
      s += barre(a.recettes, -bw - 1, 'var(--pv-rec,#0F7B5F)', 'Recettes') + barre(a.depenses, 1, 'var(--pv-dep,#C2610C)', 'Dépenses');
      s += `<text x="${x0.toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10.5" style="fill:var(--pv-texte,currentColor)" opacity=".85">An ${a.a}</text>`;
      pts.push([x0, y(a.cumul), a.cumul]);
    });
    s += `<polyline fill="none" style="stroke:var(--pv-cum,#2E74E0)" stroke-width="2" points="${pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}"/>`;
    pts.forEach(p => { s += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.4" style="fill:var(--pv-cum,#2E74E0)"><title>${ctx.libCumul || 'Trésorerie cumulée'} : ${fmtParDefaut(p[2])}</title></circle>`; });
    const lg = [['Recettes', 'var(--pv-rec,#0F7B5F)'], ['Dépenses', 'var(--pv-dep,#C2610C)'], [ctx.libCumul || 'Trésorerie cumulée', 'var(--pv-cum,#2E74E0)']];
    let lx = pl; lg.forEach(([t, col]) => { s += `<rect x="${lx}" y="6" width="10" height="10" rx="2" style="fill:${col}"/><text x="${lx + 14}" y="15" font-size="10.5" style="fill:var(--pv-texte,currentColor)">${t}</text>`; lx += 14 + t.length * 6.2 + 16; });
    return s + '</svg>';
  }

  /* Tableau de synthèse : recettes, dépenses, solde, cumul, marge. ctx : { esc, fmt, cls } */
  function tableauSynthese(c, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || ECHAPPE, fmt = ctx.fmt || fmtParDefaut, cls = ctx.cls ? ` class="${ctx.cls}"` : '';
    if (!c || c.vide) return '';
    const An = c.annees, tot = f => An.reduce((s, y) => s + f(y), 0);
    const ligne = (lib, f, o) => { o = o || {}; return `<tr${o.gras ? ' class="pv-total"' : ''}><td${o.retrait ? ' style="padding-left:22px;opacity:.85"' : ''}>${lib}</td>${An.map(y => { const v = f(y); const n = v === null ? '—' : o.pct ? Math.round(v) + ' %' : fmt(v); return `<td class="num${!o.pct && v !== null && v < 0 ? ' pv-neg' : ''}">${n}</td>`; }).join('')}<td class="num">${o.total === false ? '' : o.pct ? '' : fmt(tot(f))}</td></tr>`; };
    return `<table${cls}><thead><tr><th>Gains et dépenses</th>${An.map(y => `<th class="num">An ${y.a}</th>`).join('')}<th class="num">Total ${An.length} ans</th></tr></thead><tbody>
      ${ligne('Recettes (gains)', y => y.recettes, { gras: true })}
      ${ligne('Dépenses totales', y => y.depenses, { gras: true })}
      ${ctx.sansDetail ? '' : ligne('dont dépenses récurrentes', y => y.recurrentes, { retrait: true })}
      ${ctx.sansDetail ? '' : ligne('dont dépenses ponctuelles et investissements', y => y.ponctuelles, { retrait: true })}
      ${ligne(ctx.libSolde ? esc(ctx.libSolde) : 'Solde de l\'année (gain ou perte)', y => y.solde, { gras: true })}
      ${ligne((ctx.libCumul ? esc(ctx.libCumul) : 'Trésorerie cumulée') + (c.tresorerieDepart ? ' (départ ' + esc(fmt(c.tresorerieDepart)) + ')' : ''), y => y.cumul, { total: false })}
      ${ligne('Marge (part des recettes conservée)', y => y.marge, { pct: true })}
      ${ctx.sansDetail ? '' : ligne('Dépenses récurrentes par mois', y => y.recurrentesParMois, { total: false })}
    </tbody></table>`;
  }

  /* Détail par section et par ligne, avec les montants calculés pour chaque année. */
  function tableauSections(c, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || ECHAPPE, fmt = ctx.fmt || fmtParDefaut, cls = ctx.cls ? ` class="${ctx.cls}"` : '';
    if (!c || c.vide) return '';
    const fr = new Map(FREQUENCES.map(f => [f[0], f[1]]));
    const cellules = (arr, total) => arr.map(v => `<td class="num">${v ? fmt(v) : '—'}</td>`).join('') + `<td class="num">${total ? fmt(total) : '—'}</td>`;
    const corps = c.sections.filter(s => s.total !== 0 || s.lignes.length).map(s => `<tr class="pv-section"><td colspan="7">${esc(s.nom || 'Section sans nom')} — ${s.nature === 'recette' ? 'recettes' : 'dépenses'}</td></tr>`
      + s.lignes.filter(l => l.total !== 0 || l.nom).map(l => `<tr><td style="padding-left:18px">${esc(l.nom || 'Ligne sans nom')} <small style="opacity:.7">· ${esc(fr.get(l.frequence) || '')}</small></td>${cellules(l.parAn, l.total)}</tr>`).join('')
      + `<tr class="pv-total"><td>Total ${esc(s.nom || 'section')}</td>${cellules(s.parAn, s.total)}</tr>`).join('');
    return `<table${cls}><thead><tr><th>Section et ligne</th>${c.annees.map(y => `<th class="num">An ${y.a}</th>`).join('')}<th class="num">Total 5 ans</th></tr></thead><tbody>${corps}</tbody></table>`;
  }

  /* Phrases de lecture (jamais d'invention : seulement ce que les chiffres disent). */
  function lecture(c, ctx) {
    ctx = ctx || {}; const fmt = ctx.fmt || fmtParDefaut;
    if (!c || c.vide) return [];
    const m = [];
    if (c.premiereAnneeRentable) m.push(`Les recettes couvrent les dépenses dès l'année ${c.premiereAnneeRentable}.`); else m.push('Dans ce prévisionnel, les dépenses restent supérieures aux recettes sur les 5 ans.');
    if (c.besoinFinancement > 0) m.push(`Besoin de financement maximal : ${fmt(c.besoinFinancement)} (point bas de la trésorerie cumulée)${c.anneeRetablie ? ", comblé à partir de l'année " + c.anneeRetablie : ", non comblé sur 5 ans"}.`);
    else m.push('La trésorerie cumulée reste positive sur les 5 ans.');
    m.push(`Solde cumulé sur 5 ans : ${fmt(c.soldeTotal)}.`);
    return m;
  }

  const CSS = '.pv-t{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}.pv-t th,.pv-t td{padding:6px 8px;border-bottom:1px solid var(--pv-grille,#cfd6e2);text-align:left}.pv-t th.num,.pv-t td.num{text-align:right;white-space:nowrap}.pv-t .pv-total td{font-weight:800}.pv-t .pv-section td{font-weight:800;background:var(--pv-fond,rgba(120,140,170,.12));padding-top:8px}.pv-t .pv-neg{color:var(--pv-negatif,#c2410c)}';

  return { NB_ANS, FREQUENCES, POSTES_RECETTE, POSTES_DEPENSE, nombre, arrondi, nouvelId, nouvelleLigne, nouvelleSection, modeleParDefaut,
    ligneParAn, calculer, reporterCompteResultat, normaliserLigne, svgGraphique, tableauSynthese, tableauSections, lecture, compact, CSS };
});

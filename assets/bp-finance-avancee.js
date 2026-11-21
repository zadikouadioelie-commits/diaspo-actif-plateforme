/* ═══════════════════════════════════════════════════════════════════
   bp-finance-avancee.js — Diaspo'Actif (2026-11-12)
   Portefeuille clients sur 60 mois, rentabilité par offre, seuil de rentabilité, délai de retour sur
   investissement, scénarios (prudent / central / optimiste) et tableau de bord du plan financier.

   Données lues (plan_financier) :
   - offres_portefeuille : lignes { nom, prix_mensuel, cout_mensuel (coût estimé par client et par mois),
     clients_depart, clients_a1..clients_a5 (clients actifs EN FIN d'année), resiliation_pct (par an) }
   - portefeuille_part_charges_pct : part (en %) des charges fixes et de l'investissement supportée par ces offres
     (100 par défaut ; à réduire si l'entreprise a d'autres activités)
   - scenario_prudent_clients_pct / scenario_prudent_charges_pct / scenario_optimiste_clients_pct /
     scenario_optimiste_charges_pct : coefficients de test (en % du scénario central)
   - charges fixes de l'année N : salaires_N + loyers_N + marketing_charge_N + autres_charges_N du compte de
     résultat ; à défaut, ce que le prévisionnel libre (plan_financier.prevision) produirait (BPPrevision)
   - investissement_initial : investissement de départ (champ existant du plan financier)

   Règles : rien n'est inventé (offre sans prix = ignorée) ; les clients évoluent linéairement d'une fin
   d'année à l'autre ; « résultat » = marge sur coûts variables − charges fixes, AVANT amortissements,
   intérêts et impôts (le résultat net complet reste celui du compte de résultat).
   Module UMD : window.BPFinanceAvancee côté navigateur, require() côté tests.
   ═══════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BPFinanceAvancee = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const AN = [1, 2, 3, 4, 5];
  const NB_MOIS = 60;
  const a_ = v => v !== undefined && v !== null && String(v).trim() !== '';
  function nombre(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v === undefined || v === null) return 0;
    const n = parseFloat(String(v).replace(/[\s  ]/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  const ECHAPPE = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmtParDefaut = n => (Math.round(n) < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('fr-FR').replace(/ | /g, ' ');
  const compact = n => { const a = Math.abs(n), s = a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace('.', ',') + ' M' : a >= 1e3 ? Math.round(a / 1e3) + ' k' : String(Math.round(a)); return (n < 0 ? '−' : '') + s; };
  const COULEURS = ['#2E74E0', '#0F7B5F', '#E8A33D', '#C2410C', '#7C5CBF', '#0E8FA0', '#B5476B', '#5B6B82'];

  const COLONNES = [
    ['nom', "Nom de l'offre"], ['prix_mensuel', 'Prix par client et par mois'], ['cout_mensuel', 'Coût estimé par client et par mois'],
    ['clients_depart', 'Clients au départ'], ['clients_a1', 'Clients fin année 1'], ['clients_a2', 'Clients fin année 2'],
    ['clients_a3', 'Clients fin année 3'], ['clients_a4', 'Clients fin année 4'], ['clients_a5', 'Clients fin année 5'], ['resiliation_pct', 'Résiliation (% par an)'],
  ];
  const SCENARIOS_DEFAUT = { prudent: { clients: 80, charges: 110 }, central: { clients: 100, charges: 100 }, optimiste: { clients: 120, charges: 100 } };

  /* Charges fixes de chaque année : compte de résultat saisi, sinon prévisionnel libre (si fourni). */
  function chargesFixes(pf, prevision) {
    pf = pf || {};
    let repli = {};
    if (prevision && typeof prevision.reporterCompteResultat === 'function' && pf.prevision) { try { repli = prevision.reporterCompteResultat(pf.prevision).valeurs || {}; } catch (e) { repli = {}; } }
    return AN.map(a => ['salaires', 'loyers', 'marketing_charge', 'autres_charges'].reduce((s, p) => { const k = p + '_' + a; return s + (a_(pf[k]) ? nombre(pf[k]) : nombre(repli[k])); }, 0));
  }

  function lireOffres(pf) {
    const lignes = Array.isArray(pf && pf.offres_portefeuille) ? pf.offres_portefeuille : [];
    return lignes.filter(o => o && nombre(o.prix_mensuel) > 0).map((o, i) => {
      const fin = []; let prec = nombre(o.clients_depart);
      AN.forEach(a => { const v = a_(o['clients_a' + a]) ? Math.max(0, nombre(o['clients_a' + a])) : prec; fin.push(v); prec = v; });
      return { nom: String(o.nom || '').trim() || 'Offre ' + (i + 1), prix: nombre(o.prix_mensuel), cout: Math.max(0, nombre(o.cout_mensuel)), depart: Math.max(0, nombre(o.clients_depart)), fin,
        resiliation: Math.min(100, Math.max(0, nombre(o.resiliation_pct))), coutRenseigne: a_(o.cout_mensuel), nbClientsSaisis: a_(o.clients_depart) || AN.some(a => a_(o['clients_a' + a])) };
    });
  }

  /* Série mensuelle de clients actifs (60 mois) d'une offre, multipliée par `coef`. */
  function serieMois(o, coef) {
    const s = []; let prec = o.depart * coef;
    AN.forEach((a, i) => { const f = o.fin[i] * coef; for (let m = 1; m <= 12; m++) s.push(prec + (f - prec) * m / 12); prec = f; });
    return s;
  }

  function calculScenario(offres, fixes, investissement, coefClients, coefCharges) {
    const serie = offres.map(o => serieMois(o, coefClients));
    const parAn = AN.map((a, i) => {
      const mois = serie.map(s => s.slice(i * 12, i * 12 + 12));
      const ca = offres.map((o, k) => o.prix * mois[k].reduce((x, y) => x + y, 0));
      const cv = offres.map((o, k) => o.cout * mois[k].reduce((x, y) => x + y, 0));
      const CA = ca.reduce((x, y) => x + y, 0), CV = cv.reduce((x, y) => x + y, 0);
      const fx = fixes[i] * coefCharges;
      return { a, ca, cv, CA, CV, marge: CA - CV, fixes: fx, resultat: CA - CV - fx, clientsFin: serie.reduce((s, x) => s + x[i * 12 + 11], 0) };
    });
    let cumul = -investissement, premierMois = null, moisCumul = -investissement;
    for (let m = 0; m < NB_MOIS; m++) {
      const i = Math.floor(m / 12);
      const caM = offres.reduce((s, o, k) => s + o.prix * serie[k][m], 0), cvM = offres.reduce((s, o, k) => s + o.cout * serie[k][m], 0);
      moisCumul += caM - cvM - fixes[i] * coefCharges / 12;
      if (premierMois === null && moisCumul >= 0 && (investissement > 0 || caM > 0)) premierMois = m + 1;
    }
    cumul = -investissement; const cumuls = parAn.map(y => (cumul += y.resultat));
    parAn.forEach((y, i) => { y.cumul = cumuls[i]; });
    return { parAn, delaiRetourMois: investissement > 0 ? premierMois : null, serie };
  }

  function coefDepuis(pf, nom, cle, defaut) { const v = pf && pf['scenario_' + nom + '_' + cle + '_pct']; return a_(v) && nombre(v) > 0 ? nombre(v) : defaut; }

  /* Calcul complet. `pf` = plan_financier. `prevision` (facultatif) = module BPPrevision. */
  function calculer(pf, prevision) {
    pf = pf || {};
    const offres = lireOffres(pf);
    const vide = !offres.length || !offres.some(o => o.nbClientsSaisis);
    /* Part des charges fixes et de l'investissement supportée par ces offres (100 % si l'entreprise n'a que ces offres). */
    const part = a_(pf.portefeuille_part_charges_pct) ? Math.min(100, Math.max(0, nombre(pf.portefeuille_part_charges_pct))) : 100;
    const fixes = chargesFixes(pf, prevision).map(f => f * part / 100);
    const invest = Math.max(0, nombre(pf.investissement_initial)) * part / 100;
    const sc = {
      prudent: { clients: coefDepuis(pf, 'prudent', 'clients', SCENARIOS_DEFAUT.prudent.clients), charges: coefDepuis(pf, 'prudent', 'charges', SCENARIOS_DEFAUT.prudent.charges) },
      central: SCENARIOS_DEFAUT.central,
      optimiste: { clients: coefDepuis(pf, 'optimiste', 'clients', SCENARIOS_DEFAUT.optimiste.clients), charges: coefDepuis(pf, 'optimiste', 'charges', SCENARIOS_DEFAUT.optimiste.charges) },
    };
    if (vide) return { vide: true, offres, fixes, investissement: invest, scenarios: sc, alertes: [] };
    const central = calculScenario(offres, fixes, invest, 1, 1);
    const scenarios = {};
    ['prudent', 'central', 'optimiste'].forEach(n => { scenarios[n] = n === 'central' ? central : calculScenario(offres, fixes, invest, sc[n].clients / 100, sc[n].charges / 100); });

    const annees = central.parAn.map((y, i) => {
      const debut = i === 0 ? offres.reduce((s, o) => s + o.depart, 0) : central.parAn[i - 1].clientsFin;
      const resilies = offres.reduce((s, o, k) => s + o.resiliation / 100 * (i === 0 ? o.depart : o.fin[i - 1]), 0);
      const moyenne = y.clientsFin > 0 || debut > 0 ? (central.serie.reduce((s, x) => s + x.slice(i * 12, i * 12 + 12).reduce((p, q) => p + q, 0), 0)) / 12 : 0;
      const margeParClient = moyenne > 0 ? y.marge / moyenne : 0;
      return Object.assign({}, y, { debut, resilies, acquisitions: Math.max(0, y.clientsFin - debut + resilies), moyenne, seuilClients: margeParClient > 0 ? y.fixes / margeParClient : null,
        margePct: y.CA > 0 ? y.marge / y.CA * 100 : null, margeContribPct: y.CA > 0 ? y.resultat / y.CA * 100 : null });
    });
    const parOffre = offres.map((o, k) => ({ nom: o.nom, prix: o.prix, cout: o.cout, marge: o.prix - o.cout, tauxMarge: o.prix > 0 ? (o.prix - o.cout) / o.prix * 100 : null, coutRenseigne: o.coutRenseigne,
      ca: central.parAn.map(y => y.ca[k]), caTotal: central.parAn.reduce((s, y) => s + y.ca[k], 0), fin: o.fin, depart: o.depart, resiliation: o.resiliation,
      partCaAn1: central.parAn[0].CA > 0 ? central.parAn[0].ca[k] / central.parAn[0].CA * 100 : null }));
    const alertes = [];
    offres.forEach(o => {
      if (!o.coutRenseigne) alertes.push(`« ${o.nom} » : aucun coût estimé par client : la marge de cette offre est comptée à 100 %.`);
      if (o.cout > o.prix) alertes.push(`« ${o.nom} » : le coût estimé dépasse le prix, chaque client fait perdre de l'argent.`);
    });
    if (fixes.every(f => f === 0)) alertes.push('Aucune charge fixe trouvée (salaires, loyers, marketing, autres charges) : le seuil de rentabilité ne peut pas être calculé.');
    const total5 = central.parAn.reduce((s, y) => s + y.resultat, 0);
    const premiereRentable = annees.find(y => y.resultat >= 0 && y.CA > 0);
    const caTotal = central.parAn.reduce((s, y) => s + y.CA, 0);
    return { vide: false, offres, fixes, investissement: invest, partChargesPct: part, annees, parOffre, scenarios, parametresScenarios: sc, alertes, total5,
      premiereAnneeRentable: premiereRentable ? premiereRentable.a : null, delaiRetourMois: central.delaiRetourMois, serie: central.serie,
      clientsMois: central.serie[0].map((_, m) => central.serie.reduce((s, x) => s + x[m], 0)), caTotal,
      margeMoyennePct: caTotal > 0 ? central.parAn.reduce((s, y) => s + y.marge, 0) / caTotal * 100 : null,
      panierMoyen: annees[4].moyenne > 0 ? annees[4].CA / annees[4].moyenne / 12 : null };
  }

  /* Ce que le portefeuille écrirait dans le compte de résultat : ca_N (chiffre d'affaires) et achats_N (coûts
     variables). Rien n'est écrit ici : l'éditeur demande confirmation. Arrondis à l'unité. */
  function reporterCompteResultat(c) {
    const v = {}; if (!c || c.vide) return v;
    c.annees.forEach(y => { v['ca_' + y.a] = Math.round(y.CA); if (y.CV > 0) v['achats_' + y.a] = Math.round(y.CV); });
    return v;
  }

  /* Les 60 mois : clients actifs à la fin de chaque mois, et CA mensuel. */
  function tableau60Mois(c) {
    if (!c || c.vide) return [];
    return c.clientsMois.map((n, m) => ({ mois: m + 1, annee: Math.floor(m / 12) + 1, clients: n,
      ca: c.offres.reduce((s, o, k) => s + o.prix * c.serie[k][m], 0) }));
  }

  /* ═══ Affichage partagé — chaînes HTML/SVG pures ; ctx : { esc, fmt, cls } ═══ */
  const kpi = (lib, val, note) => `<div class="fa-kpi"><div class="fa-kpi-v">${val}</div><div class="fa-kpi-l">${lib}</div>${note ? `<div class="fa-kpi-n">${note}</div>` : ''}</div>`;

  function indicateurs(c, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || ECHAPPE, fmt = ctx.fmt || fmtParDefaut, nb = ctx.fmtNb || fmtParDefaut;
    if (!c || c.vide) return '';
    const a1 = c.annees[0], a5 = c.annees[4], k = [];
    k.push(kpi('Clients actifs en fin d\'année 5', nb(a5.clientsFin), 'contre ' + nb(a1.debut) + ' au départ'));
    k.push(kpi('Chiffre d\'affaires année 5', fmt(a5.CA)));
    k.push(kpi('Résultat année 5', fmt(a5.resultat), 'avant amortissements, intérêts, impôts'));
    k.push(kpi('Seuil de rentabilité (année 1)', a1.seuilClients !== null && a1.fixes > 0 ? '≈ ' + nb(Math.ceil(a1.seuilClients)) + ' clients' : '—', a1.fixes > 0 ? 'pour couvrir ' + fmt(a1.fixes) + ' de charges fixes' + (c.partChargesPct < 100 ? ' (part de ' + Math.round(c.partChargesPct) + ' % supportée par ces offres)' : '') : 'charges fixes non saisies'));
    k.push(kpi('Délai de retour sur investissement', c.delaiRetourMois ? '≈ ' + c.delaiRetourMois + ' mois' : (c.investissement > 0 ? 'au-delà de 60 mois' : '—'), c.investissement > 0 ? 'investissement initial : ' + fmt(c.investissement) : 'investissement initial non saisi'));
    k.push(kpi('Taux de marge moyen', c.margeMoyennePct === null ? '—' : Math.round(c.margeMoyennePct) + ' %', c.panierMoyen ? 'panier moyen ≈ ' + fmt(c.panierMoyen) + ' / mois' : ''));
    return `<div class="fa-kpis">${k.join('')}</div>`;
  }

  function tableauClients(c, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || ECHAPPE, nb = ctx.fmtNb || fmtParDefaut, cls = ctx.cls ? ` class="${ctx.cls}"` : '';
    if (!c || c.vide) return '';
    const cel = v => `<td class="num">${nb(v)}</td>`;
    return `<table${cls}><thead><tr><th>Clients actifs</th><th class="num">Départ</th>${c.annees.map(y => `<th class="num">Fin an ${y.a}</th>`).join('')}</tr></thead><tbody>
      ${c.parOffre.map(o => `<tr><td>${esc(o.nom)}</td>${cel(o.depart)}${o.fin.map(cel).join('')}</tr>`).join('')}
      <tr class="pv-total"><td>Total clients actifs</td>${cel(c.annees[0].debut)}${c.annees.map(y => cel(y.clientsFin)).join('')}</tr>
      <tr><td style="padding-left:18px;opacity:.85">Résiliations de l'année (estimées)</td><td></td>${c.annees.map(y => cel(y.resilies)).join('')}</tr>
      <tr><td style="padding-left:18px;opacity:.85">Nouveaux clients à gagner dans l'année</td><td></td>${c.annees.map(y => cel(y.acquisitions)).join('')}</tr>
    </tbody></table>`;
  }

  function tableauCA(c, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || ECHAPPE, fmt = ctx.fmt || fmtParDefaut, nb = ctx.fmtNb || fmtParDefaut, cls = ctx.cls ? ` class="${ctx.cls}"` : '';
    if (!c || c.vide) return '';
    const cel = v => `<td class="num${v < 0 ? ' pv-neg' : ''}">${fmt(v)}</td>`, tot = f => c.annees.reduce((s, y) => s + f(y), 0);
    const ligne = (lib, f, o) => `<tr${o && o.gras ? ' class="pv-total"' : ''}><td${o && o.retrait ? ' style="padding-left:18px;opacity:.85"' : ''}>${lib}</td>${c.annees.map(y => cel(f(y))).join('')}${o && o.sansTotal ? '<td></td>' : cel(tot(f))}</tr>`;
    return `<table${cls}><thead><tr><th>Chiffre d'affaires et résultat</th>${c.annees.map(y => `<th class="num">An ${y.a}</th>`).join('')}<th class="num">Total 5 ans</th></tr></thead><tbody>
      ${c.parOffre.map((o, k) => ligne(esc(o.nom), y => y.ca[k], { retrait: true })).join('')}
      ${ligne('Chiffre d\'affaires', y => y.CA, { gras: true })}
      ${ligne('Coûts variables (coût estimé × clients)', y => -y.CV, { retrait: true })}
      ${ligne('Marge sur coûts variables', y => y.marge, { gras: true })}
      ${ligne('Charges fixes', y => -y.fixes, { retrait: true })}
      ${ligne('Résultat (avant amortissements, intérêts, impôts)', y => y.resultat, { gras: true })}
      ${ligne('Résultat cumulé' + (c.investissement ? ' (après investissement initial de ' + esc(fmt(c.investissement)) + ')' : ''), y => y.cumul, { sansTotal: true })}
      <tr><td>Seuil de rentabilité (clients)</td>${c.annees.map(y => `<td class="num">${y.seuilClients !== null && y.fixes > 0 ? '≈ ' + nb(Math.ceil(y.seuilClients)) : '—'}</td>`).join('')}<td></td></tr>
    </tbody></table>`;
  }

  function tableauRentabiliteOffres(c, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || ECHAPPE, fmt = ctx.fmt || fmtParDefaut, cls = ctx.cls ? ` class="${ctx.cls}"` : '';
    if (!c || c.vide) return '';
    return `<table${cls}><thead><tr><th>Offre</th><th class="num">Prix / mois</th><th class="num">Coût estimé</th><th class="num">Marge</th><th class="num">Taux de marge</th><th class="num">Part du CA an 1</th></tr></thead><tbody>
      ${c.parOffre.map(o => `<tr><td>${esc(o.nom)}</td><td class="num">${fmt(o.prix)}</td><td class="num">${o.coutRenseigne ? fmt(o.cout) : '—'}</td><td class="num${o.marge < 0 ? ' pv-neg' : ''}">${o.coutRenseigne ? fmt(o.marge) : '—'}</td><td class="num">${o.coutRenseigne && o.tauxMarge !== null ? Math.round(o.tauxMarge) + ' %' : '—'}</td><td class="num">${o.partCaAn1 === null ? '—' : Math.round(o.partCaAn1) + ' %'}</td></tr>`).join('')}
    </tbody></table>`;
  }

  function tableauScenarios(c, ctx) {
    ctx = ctx || {}; const fmt = ctx.fmt || fmtParDefaut, cls = ctx.cls ? ` class="${ctx.cls}"` : '';
    if (!c || c.vide) return '';
    const noms = [['prudent', 'Prudent'], ['central', 'Central'], ['optimiste', 'Optimiste']], p = c.parametresScenarios;
    const cel = v => `<td class="num${v < 0 ? ' pv-neg' : ''}">${fmt(v)}</td>`;
    return `<table${cls}><thead><tr><th>Scénario</th><th class="num">Clients</th><th class="num">Charges</th><th class="num">CA an 5</th><th class="num">Résultat an 1</th><th class="num">Résultat an 5</th><th class="num">Cumul 5 ans</th><th class="num">Retour sur invest.</th></tr></thead><tbody>
      ${noms.map(([k, lib]) => { const s = c.scenarios[k], y1 = s.parAn[0], y5 = s.parAn[4]; return `<tr><td>${lib}</td><td class="num">${p[k].clients} %</td><td class="num">${p[k].charges} %</td>${cel(y5.CA)}${cel(y1.resultat)}${cel(y5.resultat)}${cel(y5.cumul)}<td class="num">${s.delaiRetourMois ? s.delaiRetourMois + ' mois' : (c.investissement > 0 ? '> 60 mois' : '—')}</td></tr>`; }).join('')}
    </tbody></table>`;
  }

  /* Histogramme du nombre de clients actifs en fin d'année (départ + 5 ans). */
  function svgClients(c, ctx) {
    ctx = ctx || {}; if (!c || c.vide) return '';
    const W = 420, H = 210, pl = 16, pr = 16, pt = 24, pb = 30;
    const vals = [c.annees[0].debut].concat(c.annees.map(y => y.clientsFin)), labs = ['Départ'].concat(c.annees.map(y => 'An ' + y.a));
    const max = Math.max(...vals, 1), gw = (W - pl - pr) / vals.length, bw = gw * 0.56;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Évolution du portefeuille clients" style="max-width:${W}px;display:block;font-family:inherit;">`;
    vals.forEach((v, i) => {
      const h = v / max * (H - pt - pb), x = pl + gw * i + (gw - bw) / 2, y = H - pb - h;
      s += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" rx="2" style="fill:var(--pv-cum,#2E74E0)"><title>${labs[i]} : ${fmtParDefaut(v)} clients</title></rect>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" style="fill:var(--pv-texte,currentColor)">${fmtParDefaut(v)}</text>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10.5" style="fill:var(--pv-texte,currentColor)" opacity=".85">${labs[i]}</text>`;
    });
    return s + '</svg>';
  }

  /* Histogramme du résultat de chaque année (vert si positif, orange si négatif). */
  function svgResultat(c, ctx) {
    ctx = ctx || {}; if (!c || c.vide) return '';
    const W = 420, H = 210, pl = 16, pr = 16, pt = 24, pb = 30;
    const vals = c.annees.map(y => y.resultat);
    let max = Math.max(0, ...vals), min = Math.min(0, ...vals); if (max === min) return '';
    const y = v => pt + (max - v) / (max - min) * (H - pt - pb), gw = (W - pl - pr) / vals.length, bw = gw * 0.56;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Évolution du résultat" style="max-width:${W}px;display:block;font-family:inherit;"><line x1="${pl}" y1="${y(0).toFixed(1)}" x2="${W - pr}" y2="${y(0).toFixed(1)}" style="stroke:var(--pv-grille,#cfd6e2)" stroke-width="1.2"/>`;
    vals.forEach((v, i) => {
      const x = pl + gw * i + (gw - bw) / 2, top = Math.min(y(v), y(0)), h = Math.abs(y(v) - y(0));
      s += `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(h, 0.5).toFixed(1)}" rx="2" style="fill:${v >= 0 ? 'var(--pv-rec,#0F7B5F)' : 'var(--pv-dep,#C2610C)'}"><title>An ${i + 1} : ${fmtParDefaut(v)}</title></rect>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${(v >= 0 ? top - 5 : top + h + 12).toFixed(1)}" text-anchor="middle" font-size="10.5" font-weight="700" style="fill:var(--pv-texte,currentColor)">${compact(v)}</text>`;
      s += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="10.5" style="fill:var(--pv-texte,currentColor)" opacity=".85">An ${i + 1}</text>`;
    });
    return s + '</svg>';
  }

  /* Répartition du chiffre d'affaires de l'année 1 par offre (anneau + légende). */
  function svgRepartition(c, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || ECHAPPE;
    if (!c || c.vide || !(c.annees[0].CA > 0)) return '';
    const W = 420, H = 170, cx = 84, cy = 85, R = 66, r = 38, tot = c.annees[0].CA;
    let a0 = -Math.PI / 2, s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Répartition du chiffre d'affaires de l'année 1 par offre" style="max-width:${W}px;display:block;font-family:inherit;">`;
    c.parOffre.forEach((o, k) => {
      const part = c.annees[0].ca[k] / tot; if (part <= 0) return;
      const a1 = a0 + part * 2 * Math.PI, grand = part > 0.5 ? 1 : 0, col = COULEURS[k % COULEURS.length];
      const p = (ang, rr) => (cx + rr * Math.cos(ang)).toFixed(2) + ',' + (cy + rr * Math.sin(ang)).toFixed(2);
      s += part >= 0.9999 ? `<circle cx="${cx}" cy="${cy}" r="${(R + r) / 2}" fill="none" stroke="${col}" stroke-width="${R - r}"/>`
        : `<path d="M${p(a0, R)} A${R},${R} 0 ${grand} 1 ${p(a1, R)} L${p(a1, r)} A${r},${r} 0 ${grand} 0 ${p(a0, r)} Z" fill="${col}"><title>${esc(o.nom)} : ${Math.round(part * 100)} %</title></path>`;
      a0 = a1;
    });
    c.parOffre.forEach((o, k) => { const part = c.annees[0].ca[k] / tot; s += `<rect x="176" y="${22 + k * 22}" width="11" height="11" rx="2" fill="${COULEURS[k % COULEURS.length]}"/><text x="194" y="${32 + k * 22}" font-size="11.5" style="fill:var(--pv-texte,currentColor)">${esc(o.nom)} — ${Math.round(part * 100)} %</text>`; });
    return s + '</svg>';
  }

  function lecture(c, ctx) {
    ctx = ctx || {}; const fmt = ctx.fmt || fmtParDefaut, nb = ctx.fmtNb || fmtParDefaut;
    if (!c || c.vide) return [];
    const m = [], a1 = c.annees[0], a5 = c.annees[4];
    m.push(`Le portefeuille passe de ${nb(a1.debut)} client(s) au départ à ${nb(a5.clientsFin)} en fin d'année 5.`);
    if (c.premiereAnneeRentable) m.push(`Le résultat (avant amortissements, intérêts et impôts) devient positif dès l'année ${c.premiereAnneeRentable}.`); else m.push('Le résultat reste négatif sur les 5 ans dans ce scénario central.');
    if (a1.fixes > 0 && a1.seuilClients !== null) m.push(`Il faut environ ${nb(Math.ceil(a1.seuilClients))} clients pour couvrir les charges fixes de l'année 1.`);
    if (c.investissement > 0) m.push(c.delaiRetourMois ? `L'investissement initial est récupéré en environ ${c.delaiRetourMois} mois.` : "L'investissement initial n'est pas récupéré dans les 60 mois.");
    return m;
  }

  /* ═══ Bilan prévisionnel simplifié, besoin en fonds de roulement et ratios ═══
     Méthode indirecte, à partir du compte de résultat du plan (BPCalc.calcModeleFinancier), des
     immobilisations (amortissement linéaire uniforme, comme le compte de résultat), des emprunts
     (échéancier) et des apports. Hypothèses lues dans plan_financier :
       - délais de paiement clients et fournisseurs (delai_paiement_clients / _fournisseurs, en jours) ;
       - rotation des stocks (rotation_stocks, nombre de jours) ;
       - fonds propres = pf_apport + pf_associes + pf_business_angels + pf_investisseur + pf_crowdfunding
         + pf_diaspo_invest + pf_subvention + pf_autres_ress ; emprunts = liste « dettes ».
     La trésorerie de fin d'année est DÉDUITE des flux (pas des deux côtés du bilan) : l'égalité
     actif = passif est donc un vrai contrôle de cohérence. Aucun chiffre n'est inventé. */
  const FONDS_PROPRES = ['pf_apport', 'pf_associes', 'pf_business_angels', 'pf_investisseur', 'pf_crowdfunding', 'pf_diaspo_invest', 'pf_subvention', 'pf_autres_ress'];
  function jours(v) { const m = String(v === undefined || v === null ? '' : v).match(/\d+(?:[.,]\d+)?/); return m ? parseFloat(m[0].replace(',', '.')) : 0; }

  function bilan(pf, calc) {
    pf = pf || {};
    if (!calc || typeof calc.calcModeleFinancier !== 'function') return { vide: true, annees: [], alertes: [] };
    const mod = calc.calcModeleFinancier(pf);
    const ca = mod.annees.reduce((s, y) => s + y.ca + y.autresProduits, 0);
    if (!(ca > 0)) return { vide: true, annees: [], alertes: [] };
    const immos = Array.isArray(pf.immobilisations_liste) ? pf.immobilisations_liste : [];
    const brut = immos.reduce((s, i) => s + Math.max(0, nombre(i && i.montant)), 0);
    const amort = calc.calcAmortissementAnnuel(immos);
    const capital = FONDS_PROPRES.reduce((s, k) => s + Math.max(0, nombre(pf[k])), 0);
    const dettes = (Array.isArray(pf.dettes) ? pf.dettes : []).map(d => ({ d, e: calc.calcEcheancierEmprunt(d) })).filter(x => x.e);
    const recus = dettes.reduce((s, x) => s + nombre(x.d.montant), 0);
    const dso = jours(pf.delai_paiement_clients), dpo = jours(pf.delai_paiement_fournisseurs), dst = jours(pf.rotation_stocks);
    const annees = []; let cumulNet = 0, rembCum = 0;
    const restantDu = (x, a) => {
      const ans = Object.keys(x.e.parAnnee || {}).map(Number).filter(n => isFinite(n)); if (!ans.length) return nombre(x.d.montant);
      if (a < Math.min(...ans)) return nombre(x.d.montant);                  /* avant la première année de remboursement */
      if (a > Math.max(...ans)) return 0;                                      /* après la dernière : soldé */
      const p = x.e.parAnnee[a]; return p ? p.capitalRestantFin : 0;
    };
    mod.annees.forEach((y, i) => {
      const a = i + 1;
      cumulNet += y.net;
      /* Capital restant dû de chaque prêt à la fin de l'année a ; remboursement = variation de ce capital. Ainsi le bilan
         reste cohérent même si l'échéancier laisse un solde (mensualité trop faible : solde réputé remboursé à l'échéance). */
      const reste = dettes.reduce((s, x) => s + restantDu(x, a), 0);
      const rembAn = dettes.reduce((s, x) => s + restantDu(x, a - 1) - restantDu(x, a), 0);
      const rembSuiv = dettes.reduce((s, x) => s + restantDu(x, a) - restantDu(x, a + 1), 0);
      rembCum += rembAn;
      const interets = y.interets, produits = y.ca + y.autresProduits;
      const creances = y.ca * dso / 365, stocks = y.achats * dst / 365, fournisseurs = (y.achats + y.chargesExternes) * dpo / 365;
      const bfr = creances + stocks - fournisseurs;
      const immosNettes = brut - amort * a;
      const tresorerie = capital + recus + cumulNet + amort * a - brut - rembCum - bfr;
      const actif = immosNettes + creances + stocks + tresorerie;
      const capitauxPropres = capital + cumulNet, passif = capitauxPropres + reste + fournisseurs;
      const caf = y.net + amort, serviceDette = interets + rembAn;
      annees.push({ a, immosNettes, creances, stocks, tresorerie, actif, capital, resultatsCumules: cumulNet, capitauxPropres, dettes: reste, fournisseurs, passif, bfr,
        bfrJoursCA: y.ca > 0 ? bfr / y.ca * 365 : null, ecart: actif - passif, resultat: y.net, caf,
        margeBrutePct: produits > 0 ? (produits - y.achats) / produits * 100 : null, ebePct: produits > 0 ? y.ebe / produits * 100 : null, netPct: produits > 0 ? y.net / produits * 100 : null,
        endettement: capitauxPropres > 0 ? reste / capitauxPropres : null, liquidite: fournisseurs + rembSuiv > 0 ? (creances + stocks + Math.max(0, tresorerie)) / (fournisseurs + rembSuiv) : null,
        capaciteRemboursementAns: caf > 0 && reste > 0 ? reste / caf : (reste === 0 ? 0 : null), couvertureDette: serviceDette > 0 ? caf / serviceDette : null });
    });
    const alertes = [];
    if (!(brut > 0)) alertes.push('Aucune immobilisation saisie : le bilan ne montre aucun actif immobilisé.');
    if (!(capital > 0)) alertes.push('Aucun apport en fonds propres saisi (apport, associés, investisseurs…) : le capital du bilan est nul.');
    if (annees.some(y => y.immosNettes < -0.5)) alertes.push("Les immobilisations nettes deviennent négatives : le compte de résultat applique l'amortissement chaque année, y compris au-delà de la durée d'amortissement.");
    const neg = annees.find(y => y.tresorerie < 0);
    if (neg) alertes.push(`La trésorerie de fin d'année ${neg.a} est négative : un financement complémentaire est nécessaire.`);
    if (!dso && !dpo && !dst) alertes.push("Aucun délai de paiement ni rotation de stock saisi : le besoin en fonds de roulement est nul.");
    dettes.forEach(x => {
      const ans = Object.keys(x.e.parAnnee || {}).map(Number).filter(n => isFinite(n)), der = ans.length ? x.e.parAnnee[Math.max(...ans)] : null;
      if (der && der.capitalRestantFin > 1) alertes.push(`Le prêt « ${x.d.nom || 'sans nom'} » n'est pas entièrement remboursé par son échéancier (il reste environ ${Math.round(der.capitalRestantFin)} € à la fin de la dernière année d'échéancier) : le bilan le considère soldé l'année suivante. Vérifiez la mensualité ou la durée.`);
    });
    return { vide: false, annees, alertes, hypotheses: { immobilisations: brut, capital, empruntsRecus: recus, dso, dpo, dst, amortissementAnnuel: amort }, equilibre: annees.every(y => Math.abs(y.ecart) < 1) };
  }

  function tableauBilan(b, ctx) {
    ctx = ctx || {}; const esc = ctx.esc || ECHAPPE, fmt = ctx.fmt || fmtParDefaut, cls = ctx.cls ? ` class="${ctx.cls}"` : '';
    if (!b || b.vide) return '';
    const cel = v => `<td class="num${v < -0.5 ? ' pv-neg' : ''}">${fmt(v)}</td>`;
    const l = (lib, f, gras, retrait) => `<tr${gras ? ' class="pv-total"' : ''}><td${retrait ? ' style="padding-left:18px"' : ''}>${lib}</td>${b.annees.map(y => cel(f(y))).join('')}</tr>`;
    return `<table${cls}><thead><tr><th>Bilan prévisionnel (fin d'année)</th>${b.annees.map(y => `<th class="num">An ${y.a}</th>`).join('')}</tr></thead><tbody>
      <tr class="pv-section"><td colspan="6">Actif</td></tr>
      ${l('Immobilisations nettes', y => y.immosNettes, 0, 1)}${l('Créances clients', y => y.creances, 0, 1)}${l('Stocks', y => y.stocks, 0, 1)}${l('Trésorerie', y => y.tresorerie, 0, 1)}${l('Total actif', y => y.actif, 1)}
      <tr class="pv-section"><td colspan="6">Passif</td></tr>
      ${l('Capital et apports', y => y.capital, 0, 1)}${l('Résultats cumulés', y => y.resultatsCumules, 0, 1)}${l('Capitaux propres', y => y.capitauxPropres, 1)}${l('Dettes financières (emprunts)', y => y.dettes, 0, 1)}${l('Dettes fournisseurs', y => y.fournisseurs, 0, 1)}${l('Total passif', y => y.passif, 1)}
    </tbody></table>`;
  }

  function tableauBFR(b, ctx) {
    ctx = ctx || {}; const fmt = ctx.fmt || fmtParDefaut, cls = ctx.cls ? ` class="${ctx.cls}"` : '';
    if (!b || b.vide) return '';
    const cel = v => `<td class="num${v < -0.5 ? ' pv-neg' : ''}">${fmt(v)}</td>`;
    return `<table${cls}><thead><tr><th>Besoin en fonds de roulement</th>${b.annees.map(y => `<th class="num">An ${y.a}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Créances clients</td>${b.annees.map(y => cel(y.creances)).join('')}</tr><tr><td>Stocks</td>${b.annees.map(y => cel(y.stocks)).join('')}</tr><tr><td>Dettes fournisseurs</td>${b.annees.map(y => cel(-y.fournisseurs)).join('')}</tr>
      <tr class="pv-total"><td>Besoin en fonds de roulement</td>${b.annees.map(y => cel(y.bfr)).join('')}</tr>
      <tr><td>… en jours de chiffre d'affaires</td>${b.annees.map(y => `<td class="num">${y.bfrJoursCA === null ? '—' : Math.round(y.bfrJoursCA) + ' j'}</td>`).join('')}</tr></tbody></table>`;
  }

  function tableauRatios(b, ctx) {
    ctx = ctx || {}; const cls = ctx.cls ? ` class="${ctx.cls}"` : '';
    if (!b || b.vide) return '';
    const p = v => (v === null || v === undefined ? '—' : Math.round(v) + ' %'), x = v => (v === null || v === undefined ? '—' : v.toFixed(2).replace('.', ','));
    const l = (lib, f) => `<tr><td>${lib}</td>${b.annees.map(y => `<td class="num">${f(y)}</td>`).join('')}</tr>`;
    return `<table${cls}><thead><tr><th>Ratios financiers</th>${b.annees.map(y => `<th class="num">An ${y.a}</th>`).join('')}</tr></thead><tbody>
      ${l('Marge brute (produits − achats)', y => p(y.margeBrutePct))}${l('Marge d\'exploitation (EBE / produits)', y => p(y.ebePct))}${l('Marge nette', y => p(y.netPct))}
      ${l('Endettement (dettes / capitaux propres)', y => x(y.endettement))}${l('Liquidité générale', y => x(y.liquidite))}
      ${l('Capacité de remboursement (années de CAF)', y => (y.capaciteRemboursementAns === null ? '—' : y.capaciteRemboursementAns === 0 ? 'aucune dette' : y.capaciteRemboursementAns.toFixed(1).replace('.', ',') + ' ans'))}
      ${l('Couverture du service de la dette (CAF / annuités)', y => x(y.couvertureDette))}</tbody></table>`;
  }

  const CSS = 'table td.num,table th.num{white-space:nowrap}.fa-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin:0 0 12px}.fa-kpi{border:1px solid var(--pv-grille,#cfd6e2);border-radius:10px;padding:10px 12px}.fa-kpi-v{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums}.fa-kpi-l{font-size:12px;font-weight:700;margin-top:2px}.fa-kpi-n{font-size:11px;opacity:.75;margin-top:2px}.fa-graphs{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin:10px 0}.fa-graphs h4{margin:0 0 4px;font-size:12.5px}';

  return { AN, NB_MOIS, COLONNES, SCENARIOS_DEFAUT, nombre, chargesFixes, lireOffres, calculer, reporterCompteResultat, tableau60Mois,
    bilan, tableauBilan, tableauBFR, tableauRatios, jours,
    indicateurs, tableauClients, tableauCA, tableauRentabiliteOffres, tableauScenarios, svgClients, svgResultat, svgRepartition, lecture, CSS, fmtParDefaut };
});

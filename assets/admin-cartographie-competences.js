/* ═══════════════════════════════════════════════════════
   assets/admin-cartographie-competences.js — Cartographie des compétences (2026-10-11)
   Tableau de bord administrateur : domaines d'activité des comptes de la diaspora, ventilés par diaspora
   (origine), zone de vie, pays de résidence et type de compte. Données agrégées et anonymisées fournies par
   GET /api/admin/cartographie-competences (server/cartographie-competences.js) ; aucun nom, e-mail ni identifiant.
   Dépend de la fonction globale api() du tableau de bord. Un clic sur une barre ou une ligne filtre la vue.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const FILTRES = ['role', 'origine', 'zone', 'pays', 'domaine'];
  const ROLES = { utilisateur: 'Utilisateurs', initiative: 'Initiatives', collectivite: 'Collectivités' };
  const COULEURS = ['#2563EB', '#E87C3E', '#059669', '#7C3AED', '#DC2626', '#0891B2', '#D97706', '#DB2777', '#4B5563', '#65A30D', '#1B3A6B'];
  let DATA = null, CROISE = 'zone', DOMAINES_TOUT = false;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = id => document.getElementById(id);
  const libDomaine = cle => { const d = DATA && DATA.domaines_libelles && DATA.domaines_libelles[cle]; return d ? d.label : (cle === 'autre' ? 'Autre' : cle); };
  const icoDomaine = cle => { const d = DATA && DATA.domaines_libelles && DATA.domaines_libelles[cle]; return d ? d.icone : '🏢'; };
  const libRole = r => ROLES[r] || r;
  const pct = (n, t) => t ? Math.round(n / t * 100) : 0;

  /* ───── Style (injecté une fois) ───── */
  function style() {
    if (el('cc-style')) return;
    const s = document.createElement('style'); s.id = 'cc-style';
    s.textContent = `
      .cc-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:16px}
      .cc-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px}
      .cc-kpi{border-left:4px solid var(--cc,#2563EB);padding:12px 14px}
      .cc-kpi b{display:block;font-size:22px;margin-top:2px}.cc-kpi span{font-size:12px;color:var(--muted);font-weight:700}
      .cc-filtres{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;align-items:end}
      .cc-filtres label{font-size:12px;font-weight:700;color:var(--muted)}
      .cc-filtres select{width:100%;margin-top:4px;padding:8px;border:1px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface,#fff);color:inherit}
      .cc-barre{display:block;width:100%;text-align:left;background:none;border:0;padding:0;margin:0 0 9px;cursor:pointer;font:inherit;color:inherit}
      .cc-barre:hover .cc-nom,.cc-barre:focus-visible .cc-nom{text-decoration:underline}
      .cc-barre:focus-visible,.cc-ligne:focus-visible,.cc-onglet:focus-visible{outline:2px solid #2563EB;outline-offset:2px;border-radius:6px}
      .cc-barre-t{display:flex;justify-content:space-between;gap:8px;font-size:13px;margin-bottom:3px}
      .cc-nom{font-weight:600;min-width:0;overflow-wrap:anywhere}.cc-val{font-weight:700;white-space:nowrap}.cc-val i{font-style:normal;color:var(--muted);font-weight:500}
      .cc-piste{display:block;background:#eef2ff;border-radius:6px;height:10px;overflow:hidden}.cc-piste>i{display:block;height:100%;border-radius:6px}
      .cc-tab{width:100%;border-collapse:collapse;font-size:13px}
      .cc-tab th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--border)}
      .cc-tab td{padding:8px;border-bottom:1px solid var(--border);vertical-align:top}
      .cc-ligne{cursor:pointer}.cc-ligne:hover td{background:rgba(37,99,235,.06)}
      .cc-puce{display:inline-block;background:#eef2ff;color:#1e3a8a;border-radius:99px;padding:2px 9px;margin:0 4px 4px 0;font-size:12px;font-weight:600;white-space:nowrap}
      .cc-tag{display:inline-block;border:1px solid var(--border);border-radius:99px;padding:3px 10px;margin:0 6px 6px 0;font-size:12.5px}.cc-tag b{color:#1d4ed8;margin-left:4px}
      .cc-donut{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.cc-leg{flex:1;min-width:180px;font-size:13px}
      .cc-leg button{display:flex;gap:8px;align-items:center;width:100%;background:none;border:0;padding:3px 0;font:inherit;color:inherit;cursor:pointer;text-align:left}
      .cc-leg button:hover span.t{text-decoration:underline}.cc-pastille{width:12px;height:12px;border-radius:3px;flex:0 0 auto}
      .cc-chaleur{overflow-x:auto}.cc-chaleur table{border-collapse:separate;border-spacing:3px;font-size:12.5px;min-width:520px}
      .cc-chaleur th{font-weight:700;padding:4px 6px;text-align:center;color:var(--muted);max-width:110px}.cc-chaleur th.l{text-align:left;color:inherit;max-width:230px}
      .cc-chaleur td{text-align:center;border-radius:6px;padding:7px 6px;font-weight:700;min-width:54px}
      .cc-onglets{display:inline-flex;gap:6px;flex-wrap:wrap}.cc-onglet{border:1px solid var(--border);background:transparent;border-radius:99px;padding:5px 12px;font-size:12.5px;cursor:pointer;font-weight:600;color:inherit}
      .cc-onglet[aria-pressed="true"]{background:#2563EB;border-color:#2563EB;color:#fff}
      .cc-vide{color:var(--muted);font-size:13px;margin:0}
      @media (max-width:640px){.cc-grille{grid-template-columns:1fr}}`;
    document.head.appendChild(s);
  }

  /* ───── Briques de rendu ───── */
  function barres(rows, { cleDe, nomDe, vide, couleur, onClic, max }) {
    if (!rows || !rows.length) return `<p class="cc-vide">${esc(vide || 'Aucune donnée pour ces critères.')}</p>`;
    const m = Math.max(...rows.map(r => r.n), 1);
    return rows.slice(0, max || rows.length).map(r => `
      <button type="button" class="cc-barre" onclick="${onClic}(${esc(JSON.stringify(cleDe(r)))})" title="Filtrer sur « ${esc(nomDe(r))} »">
        <span class="cc-barre-t"><span class="cc-nom">${nomDe(r)}</span><span class="cc-val">${r.n} <i>· ${r.pct != null ? r.pct : pct(r.n, DATA.total)} %</i></span></span>
        <span class="cc-piste" role="img" aria-label="${esc(String(r.n))} comptes"><i style="width:${Math.max(r.n / m * 100, 2)}%;background:${couleur}"></i></span>
      </button>`).join('');
  }

  function donut(rows) {
    const t = rows.reduce((s, r) => s + r.n, 0);
    if (!t) return '<p class="cc-vide">Aucune donnée pour ces critères.</p>';
    const R = 52, C = 2 * Math.PI * R; let off = 0;
    const arcs = rows.map((r, i) => {
      const len = r.n / t * C;
      const a = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${COULEURS[i % COULEURS.length]}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"><title>${esc(r.cle)} : ${r.n}</title></circle>`;
      off += len; return a;
    }).join('');
    const leg = rows.map((r, i) => `<button type="button" onclick="ccFiltrer('zone',${esc(JSON.stringify(r.cle))})" title="Filtrer sur cette zone">
        <span class="cc-pastille" style="background:${COULEURS[i % COULEURS.length]}"></span><span class="t" style="flex:1">${esc(r.cle)}</span><b>${r.n}</b><i style="color:var(--muted);font-style:normal">${pct(r.n, t)} %</i></button>`).join('');
    return `<div class="cc-donut"><svg width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Répartition des comptes par zone de vie">${arcs}
      <text x="70" y="66" text-anchor="middle" font-size="22" font-weight="800" fill="currentColor">${t}</text><text x="70" y="84" text-anchor="middle" font-size="10" fill="currentColor" opacity=".65">comptes</text></svg>
      <div class="cc-leg">${leg}</div></div>`;
  }

  function puces(top) {
    if (!top || !top.length) return '<span class="cc-vide">—</span>';
    return top.map(d => `<span class="cc-puce">${icoDomaine(d.cle)} ${esc(libDomaine(d.cle))} · ${d.n}</span>`).join('');
  }

  function tableau(rows, { colonne, filtre, vide }) {
    if (!rows || !rows.length) return `<p class="cc-vide">${esc(vide || 'Aucune donnée.')}</p>`;
    return `<div style="overflow-x:auto"><table class="cc-tab"><thead><tr><th>${esc(colonne)}</th><th>Comptes</th><th>Domaine renseigné</th><th>Domaines dominants</th></tr></thead><tbody>${
      rows.map(r => `<tr class="cc-ligne" tabindex="0" role="button" onclick="ccFiltrer('${filtre}',${esc(JSON.stringify(r.cle))})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();ccFiltrer('${filtre}',${esc(JSON.stringify(r.cle))})}" title="Filtrer sur « ${esc(r.cle)} »">
        <td><b>${esc(filtre === 'role' ? libRole(r.cle) : r.cle)}</b>${r.pays && r.pays.length ? `<div style="font-size:11.5px;color:var(--muted);margin-top:2px">${r.pays.map(p => esc(p.cle) + ' (' + p.n + ')').join(' · ')}</div>` : ''}</td>
        <td><b>${r.n}</b></td><td>${pct(r.renseignes, r.n)} %</td><td>${puces(r.top_domaines)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function chaleur(dim) {
    const x = DATA.croisements[dim];
    if (!x || !x.colonnes.length || !x.lignes.length) return '<p class="cc-vide">Pas assez de données pour croiser ces dimensions.</p>';
    const max = Math.max(...x.lignes.flatMap(l => l.valeurs), 1);
    const nomCol = c => dim === 'role' ? libRole(c) : c;
    return `<div class="cc-chaleur"><table><thead><tr><th class="l" scope="col">Domaine d'activité</th>${x.colonnes.map(c => `<th scope="col">${esc(nomCol(c))}</th>`).join('')}</tr></thead><tbody>${
      x.lignes.map(l => `<tr><th class="l" scope="row">${icoDomaine(l.cle)} ${esc(libDomaine(l.cle))}</th>${l.valeurs.map(v => {
        const a = v ? 0.12 + 0.78 * (v / max) : 0;
        return `<td style="background:${v ? `rgba(37,99,235,${a.toFixed(2)})` : 'rgba(148,163,184,.12)'};color:${a > 0.5 ? '#fff' : 'inherit'}">${v || '·'}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* ───── Filtres ───── */
  function remplir(id, valeurs, actif, libelle) {
    const s = el(id); if (!s) return;
    const toutes = s.dataset.toutes || 'Tous';
    s.innerHTML = `<option value="">${esc(toutes)}</option>` + (valeurs || []).map(v => `<option value="${esc(v)}"${v === actif ? ' selected' : ''}>${esc(libelle ? libelle(v) : v)}</option>`).join('');
    if (actif && !(valeurs || []).includes(actif)) s.insertAdjacentHTML('beforeend', `<option value="${esc(actif)}" selected>${esc(libelle ? libelle(actif) : actif)}</option>`);
  }

  function rendre(r) {
    DATA = r;
    const actifs = k => (el('cc-f-' + k) || {}).value || '';
    // Les listes proposent toutes les valeurs de la plateforme, pas seulement celles du filtre courant
    remplir('cc-f-role', r.filtres.roles, actifs('role'), libRole);
    remplir('cc-f-origine', r.filtres.diasporas, actifs('origine'));
    remplir('cc-f-zone', r.filtres.zones, actifs('zone'));
    remplir('cc-f-pays', r.filtres.pays, actifs('pays'));
    remplir('cc-f-domaine', r.filtres.domaines, actifs('domaine'), libDomaine);

    const k = r.kpis;
    el('cc-kpis').innerHTML = [
      ['👥 Comptes analysés', r.total, '#2563EB'], ['🎯 Domaine renseigné', `${k.taux_domaine} %`, '#059669'], ['🧩 Domaines représentés', k.nb_domaines, '#7C3AED'],
      ['🌍 Diasporas (origines)', k.nb_diasporas, '#E87C3E'], ['📍 Pays de résidence', k.nb_pays_residence, '#0891B2'], ['🛠️ Compétences citées', k.nb_competences, '#D97706'],
    ].map(([l, v, c]) => `<div class="card cc-kpi" style="--cc:${c}"><span>${l}</span><b>${v}</b></div>`).join('');

    if (!r.total) {
      ['cc-domaines', 'cc-zones', 'cc-diasporas', 'cc-pays', 'cc-roles', 'cc-chaleur', 'cc-competences'].forEach(i => { const e = el(i); if (e) e.innerHTML = '<p class="cc-vide">Aucun compte ne correspond à ces filtres.</p>'; });
      el('cc-note').textContent = ''; return;
    }

    const doms = r.par_domaine;
    const visibles = DOMAINES_TOUT ? doms : doms.slice(0, 12);
    el('cc-domaines').innerHTML = barres(visibles, { cleDe: d => d.cle, nomDe: d => `${icoDomaine(d.cle)} ${esc(libDomaine(d.cle))}`, couleur: 'linear-gradient(90deg,#2563EB,#1d4ed8)', onClic: 'ccFiltrerDomaine', vide: 'Aucun domaine renseigné pour ces critères.' })
      + (doms.length > 12 ? `<button type="button" class="btn btn-outline btn-sm" onclick="ccToutDomaines()">${DOMAINES_TOUT ? 'Réduire' : `Voir les ${doms.length - 12} autres domaines`}</button>` : '');
    el('cc-zones').innerHTML = donut(r.par_zone);
    el('cc-diasporas').innerHTML = tableau(r.par_diaspora, { colonne: 'Diaspora (origine)', filtre: 'origine' });
    el('cc-pays').innerHTML = tableau(r.par_pays, { colonne: 'Pays de résidence', filtre: 'pays' });
    el('cc-roles').innerHTML = tableau(r.par_role, { colonne: 'Type de compte', filtre: 'role' });
    el('cc-chaleur').innerHTML = chaleur(CROISE);
    document.querySelectorAll('.cc-onglet').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dim === CROISE)));
    el('cc-competences').innerHTML = r.top_competences.length
      ? r.top_competences.map(c => `<span class="cc-tag">${esc(c.cle)}<b>${c.n}</b></span>`).join('')
      : '<p class="cc-vide">Aucune compétence ou spécialité saisie pour ces critères.</p>';

    const sans = r.total - k.avec_domaine;
    el('cc-note').textContent = `${sans} compte${sans > 1 ? 's' : ''} sur ${r.total} n'ont pas encore renseigné leur domaine d'activité (${100 - k.taux_domaine} %). `
      + `${r.non_reconnus.origines} compte${r.non_reconnus.origines > 1 ? 's' : ''} de la plateforme sans diaspora (origine) reconnue, ${r.non_reconnus.pays} sans pays de résidence reconnu : ils figurent sous « Non renseigné ».`;
  }

  /* ───── API publique (appelée par les gestionnaires inline du tableau de bord) ───── */
  async function loadCartoCompetences() {
    style();
    const qs = new URLSearchParams();
    FILTRES.forEach(k => { const v = (el('cc-f-' + k) || {}).value; if (v) qs.set(k, v); });
    let r = null;
    try { r = await api('GET', '/admin/cartographie-competences' + (qs.toString() ? '?' + qs.toString() : '')); } catch (e) { r = null; }
    if (!r) { el('cc-kpis').innerHTML = '<p style="color:#dc2626">Erreur de chargement de la cartographie.</p>'; return; }
    rendre(r);
  }
  function ccFiltrer(cle, valeur) { const s = el('cc-f-' + cle); if (!s) return; if (![...s.options].some(o => o.value === valeur)) s.insertAdjacentHTML('beforeend', `<option value="${esc(valeur)}">${esc(valeur)}</option>`); s.value = valeur; loadCartoCompetences(); el('cc-filtres').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function ccFiltrerDomaine(cle) { ccFiltrer('domaine', cle); }
  function ccReset() { FILTRES.forEach(k => { const s = el('cc-f-' + k); if (s) s.value = ''; }); loadCartoCompetences(); }
  function ccCroiser(dim) { CROISE = dim; if (DATA) { el('cc-chaleur').innerHTML = chaleur(dim); document.querySelectorAll('.cc-onglet').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.dim === dim))); } }
  function ccToutDomaines() { DOMAINES_TOUT = !DOMAINES_TOUT; if (DATA) rendre(DATA); }
  function ccExportCSV() {
    if (!DATA) return;
    const L = ['Dimension;Valeur;Comptes;Domaine renseigné (%);Domaines dominants'];
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    DATA.par_domaine.forEach(d => L.push(['Domaine d\'activité', q(libDomaine(d.cle)), d.n, d.pct, ''].join(';')));
    const bloc = (nom, rows, f) => rows.forEach(r => L.push([nom, q(f ? f(r.cle) : r.cle), r.n, pct(r.renseignes, r.n), q(r.top_domaines.map(d => `${libDomaine(d.cle)} (${d.n})`).join(', '))].join(';')));
    bloc('Diaspora (origine)', DATA.par_diaspora); bloc('Zone de vie', DATA.par_zone); bloc('Pays de résidence', DATA.par_pays); bloc('Type de compte', DATA.par_role, libRole);
    DATA.top_competences.forEach(c => L.push(['Compétence / spécialité', q(c.cle), c.n, '', ''].join(';')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    a.download = 'cartographie-competences.csv'; a.click(); URL.revokeObjectURL(a.href);
  }

  Object.assign(window, { loadCartoCompetences, ccFiltrer, ccFiltrerDomaine, ccReset, ccCroiser, ccToutDomaines, ccExportCSV });
  /* Ouverture directe par l'adresse (#cartographie-competences) : le clic du menu peut précéder le chargement de ce script ;
     la section est alors déjà affichée mais vide — on lance le chargement ici. */
  const section = el('section-cartographie-competences');
  if (section && section.style.display !== 'none') loadCartoCompetences();
})();

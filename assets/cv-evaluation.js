/* ============================================================
   DIASPO'ACTIF — Évaluer un CV reçu, depuis sa page (cv-public.html) — 2026-10-12, demande explicite
   Le destinataire d'un CV peut : donner un VERDICT en un geste (vert « Candidat idéal », orange « Candidat intéressant », rouge « Ne correspond
   pas »), le NOTER de 0 à 10, le COMMENTER, l'ENREGISTRER dans un dossier de candidatures (existant, ou créé à la volée — ex. « Candidature —
   Poste de manager principal »), puis le REPARTAGER avec ou sans ses notes. Tout est privé à son compte (server/recrutement.js).
   Pensé téléphone d'abord : cibles tactiles de 44 px, une colonne. Autonome : injecte son style.
   ============================================================ */
(function () {
  'use strict';
  if (window.CvEval) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const VERDICTS = [['ideal', 'Candidat idéal', '🟢', '#16a34a'], ['interessant', 'Candidat intéressant', '🟠', '#ea580c'], ['non', 'Ne correspond pas', '🔴', '#dc2626']];
  async function api(methode, url, corps) {
    const r = await fetch(url, { method: methode, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
    const j = await r.json().catch(() => ({})); j._s = r.status; return j;
  }
  function css() {
    if (document.getElementById('cve-css')) return;
    const s = document.createElement('style'); s.id = 'cve-css';
    s.textContent = `
.cve{background:#fff;border:2px solid #0D2B4E;border-radius:16px;margin:0 0 14px;overflow:hidden;box-shadow:0 4px 18px rgba(13,43,78,.12);color:#14213a;font-family:inherit}
.cve-hd{display:flex;align-items:center;gap:10px;width:100%;padding:12px 14px;background:linear-gradient(135deg,#1E4F8A,#0D2B4E);color:#fff;border:0;font:inherit;font-weight:800;font-size:15px;text-align:left;cursor:pointer;min-height:48px}
.cve-hd small{margin-left:auto;font-weight:600;opacity:.9;font-size:12px;text-align:right}
.cve-bd{padding:14px}
.cve-bd[hidden]{display:none}
.cve-l{display:block;font-weight:800;font-size:13px;color:#0D2B4E;margin:14px 0 6px}
.cve-l:first-child{margin-top:0}
.cve-verd{display:grid;gap:8px}
@media(min-width:620px){.cve-verd{grid-template-columns:repeat(3,1fr)}}
.cve-v{display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:0 12px;border-radius:12px;border:2.5px solid var(--c);background:#fff;color:var(--c);font:inherit;font-weight:800;font-size:15px;cursor:pointer;transition:transform .12s}
.cve-v:active{transform:scale(.97)}
.cve-v[aria-pressed="true"]{background:var(--c);color:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 28%,transparent)}
.cve-note{display:grid;grid-template-columns:repeat(11,1fr);gap:4px}
.cve-n{min-height:44px;border-radius:10px;border:2px solid #dfe6f0;background:#fff;color:#0D2B4E;font:inherit;font-weight:800;font-size:15px;cursor:pointer;padding:0}
.cve-n[aria-pressed="true"]{background:#0D2B4E;border-color:#0D2B4E;color:#fff}
.cve-n:active{transform:scale(.95)}
@media(max-width:420px){.cve-note{grid-template-columns:repeat(6,1fr)}}
.cve-ech{display:flex;justify-content:space-between;font-size:11.5px;color:#56637a;margin-top:3px}
.cve textarea,.cve select,.cve input[type=text]{width:100%;font:inherit;font-size:16px;padding:10px 12px;border:1.5px solid #dfe6f0;border-radius:10px;background:#fff;color:#14213a}
.cve textarea{min-height:76px;resize:vertical}
.cve :focus-visible{outline:3px solid #F26422;outline-offset:2px}
.cve-act{display:grid;gap:8px;margin-top:14px}
@media(min-width:620px){.cve-act{grid-template-columns:2fr 1fr 1fr}}
.cve-b{display:flex;align-items:center;justify-content:center;gap:6px;min-height:48px;border-radius:12px;border:2px solid #0D2B4E;background:#fff;color:#0D2B4E;font:inherit;font-weight:800;font-size:15px;cursor:pointer;padding:0 14px;text-decoration:none}
.cve-b.p{background:#0D2B4E;color:#fff}
.cve-b:disabled{opacity:.5;cursor:not-allowed}
.cve-msg{min-height:22px;margin:10px 2px 0;font-size:13.5px;font-weight:600}
.cve-msg.ok{color:#1e7a3f}.cve-msg.ko{color:#b42318}
.cve-msg a{color:#0D2B4E}
.cve-prem{display:flex;align-items:center;gap:10px;background:#fff;border:2px dashed #0D2B4E;border-radius:14px;padding:12px 14px;margin:0 0 14px;font-size:14px}
.cve-prem a{margin-left:auto;white-space:nowrap;font-weight:800;color:#0D2B4E}
@media print{.cve,.cve-prem{display:none !important}}`;
    document.head.appendChild(s);
  }

  /* monter({ jeton, cv }) : insère le panneau avant les onglets de la page. */
  async function monter(o) {
    if (o.cv && o.cv.proprietaire) return;            // son propre CV : rien à évaluer
    css();
    const jeton = o.jeton, ancre = document.querySelector('.onglets'); if (!ancre) return;
    const retour = '/login.html?redirect=' + encodeURIComponent(location.pathname + location.search);
    const me = await fetch('/api/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : {}).catch(() => ({}));
    if (!me.user) {
      const p = document.createElement('div'); p.className = 'cve-prem';
      p.innerHTML = `<span>🗂 <b>Vous recrutez ?</b> Connectez-vous pour noter ce CV, le commenter et l’enregistrer dans vos dossiers de candidatures.</span><a href="${esc(retour)}">Se connecter</a>`;
      ancre.parentNode.insertBefore(p, ancre); return;
    }
    const pre = await api('GET', '/api/recrutement/jeton/' + encodeURIComponent(jeton));
    const dossiers = pre.dossiers || [], evals = pre.evaluations || [];
    let verdict = null, note = null, candidatId = null, dossierId = dossiers.length ? dossiers[0].id : 'nouveau';
    const evalDe = d => evals.find(e => Number(e.dossier_id) === Number(d));
    if (evals.length) { dossierId = evals[0].dossier_id; }
    const e0 = evalDe(dossierId); if (e0) { verdict = e0.verdict; note = e0.note; candidatId = e0.id; }

    const sec = document.createElement('section'); sec.className = 'cve'; sec.id = 'cv-eval'; sec.setAttribute('aria-label', 'Évaluer ce CV');
    sec.innerHTML = `<button type="button" class="cve-hd" aria-expanded="true" id="cve-tog"><span aria-hidden="true">🗂</span><span>Évaluer ce candidat</span><small id="cve-resume"></small></button>
      <div class="cve-bd" id="cve-bd">
        <span class="cve-l">Votre verdict</span>
        <div class="cve-verd" role="group" aria-label="Verdict">${VERDICTS.map(v => `<button type="button" class="cve-v" data-v="${v[0]}" style="--c:${v[3]}" aria-pressed="false"><span aria-hidden="true">${v[2]}</span>${v[1]}</button>`).join('')}</div>
        <span class="cve-l">Votre note sur 10</span>
        <div class="cve-note" role="group" aria-label="Note de 0 à 10">${Array.from({ length: 11 }, (_, i) => `<button type="button" class="cve-n" data-n="${i}" aria-pressed="false" aria-label="${i} sur 10">${i}</button>`).join('')}</div>
        <div class="cve-ech"><span>0 · ne convient pas</span><span>10 · parfait</span></div>
        <label class="cve-l" for="cve-com">Un commentaire (visible par vous seul)</label>
        <textarea id="cve-com" maxlength="2000" placeholder="Points forts, réserves, questions à poser en entretien…"></textarea>
        <label class="cve-l" for="cve-dos">Dossier de candidatures</label>
        <select id="cve-dos">${dossiers.map(d => `<option value="${d.id}">${esc(d.titre)}</option>`).join('')}<option value="nouveau">＋ Nouveau dossier…</option></select>
        <input type="text" id="cve-new" maxlength="120" placeholder="Ex. Candidature — Poste de manager principal" style="margin-top:8px" hidden>
        <div class="cve-act">
          <button type="button" class="cve-b p" id="cve-save">💾 Enregistrer dans mes candidatures</button>
          <button type="button" class="cve-b" id="cve-share" disabled title="Enregistrez d’abord ce CV dans un dossier">📤 Repartager</button>
          <a class="cve-b" id="cve-dossiers" href="/dossiers-candidatures.html">📁 Mes dossiers</a>
        </div>
        <div class="cve-msg" id="cve-msg" role="status" aria-live="polite"></div>
      </div>`;
    ancre.parentNode.insertBefore(sec, ancre);
    const $ = id => document.getElementById(id);
    const sel = $('cve-dos'); sel.value = String(dossierId);
    const majNew = () => { $('cve-new').hidden = sel.value !== 'nouveau'; if (sel.value === 'nouveau') $('cve-new').focus(); };
    const lib = v => (VERDICTS.find(x => x[0] === v) || [])[1] || '';
    const resume = () => {
      const bits = [verdict ? lib(verdict) : '', note !== null ? note + '/10' : ''].filter(Boolean);
      $('cve-resume').textContent = bits.length ? bits.join(' · ') : (candidatId ? 'Enregistré' : 'Pas encore évalué');
      sec.querySelectorAll('.cve-v').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === verdict)));
      sec.querySelectorAll('.cve-n').forEach(b => b.setAttribute('aria-pressed', String(note !== null && Number(b.dataset.n) === note)));
      $('cve-share').disabled = !candidatId; $('cve-share').title = candidatId ? '' : 'Enregistrez d’abord ce CV dans un dossier';
      if (candidatId) $('cve-dossiers').href = `/dossiers-candidatures.html?dossier=${encodeURIComponent(sel.value)}&candidat=${candidatId}`;
    };
    sel.addEventListener('change', () => {
      majNew(); const e = evalDe(sel.value);                      // le dossier choisi connaît-il déjà ce CV ? on reprend sa note et son verdict
      verdict = e ? e.verdict : null; note = e ? e.note : null; candidatId = e ? e.id : null; resume();
    });
    sec.querySelectorAll('.cve-v').forEach(b => b.addEventListener('click', () => { verdict = verdict === b.dataset.v ? null : b.dataset.v; resume(); }));
    sec.querySelectorAll('.cve-n').forEach(b => b.addEventListener('click', () => { const n = Number(b.dataset.n); note = note === n ? null : n; resume(); }));
    $('cve-tog').addEventListener('click', () => { const ferme = !$('cve-bd').hidden; $('cve-bd').hidden = ferme; $('cve-tog').setAttribute('aria-expanded', String(!ferme)); });
    const msg = (t, ok, html) => { const m = $('cve-msg'); m.className = 'cve-msg' + (ok === true ? ' ok' : ok === false ? ' ko' : ''); if (html) m.innerHTML = t; else m.textContent = t; };
    $('cve-save').addEventListener('click', async () => {
      const b = $('cve-save'); b.disabled = true; msg('Enregistrement…');
      const corps = { jeton, note, verdict, commentaire: $('cve-com').value.trim() };
      if (sel.value === 'nouveau') { const t = $('cve-new').value.trim(); if (t.length < 3) { msg('Donnez un titre au nouveau dossier (3 caractères au moins).', false); $('cve-new').focus(); b.disabled = false; return; } corps.nouveau_dossier = t; }
      else corps.dossier_id = Number(sel.value);
      const r = await api('POST', '/api/recrutement/evaluations', corps);
      b.disabled = false;
      if (!r.ok) { msg(r.error || 'Enregistrement impossible.', false); return; }
      candidatId = r.candidat_id;
      if (corps.nouveau_dossier) {                                  // le nouveau dossier rejoint la liste
        dossiers.unshift({ id: r.dossier_id, titre: r.dossier_titre });
        sel.insertBefore(Object.assign(document.createElement('option'), { value: String(r.dossier_id), textContent: r.dossier_titre }), sel.firstChild);
        sel.value = String(r.dossier_id); majNew(); $('cve-new').value = '';
      }
      const k = evals.findIndex(e => Number(e.dossier_id) === Number(r.dossier_id)); const fiche = { id: r.candidat_id, dossier_id: r.dossier_id, dossier_titre: r.dossier_titre, note, verdict };
      if (k >= 0) evals[k] = fiche; else evals.push(fiche);
      $('cve-com').value = ''; resume();
      msg(`✅ Enregistré dans « ${esc(r.dossier_titre)} » — <a href="/dossiers-candidatures.html?dossier=${r.dossier_id}&candidat=${r.candidat_id}">voir la fiche</a>`, true, true);
    });
    $('cve-share').addEventListener('click', () => {
      if (!candidatId) return;
      const inf = (o.cv && o.cv.data && o.cv.data.infos) || {};
      if (window.RecrutPartage) window.RecrutPartage.ouvrir({ candidatId, nom: [inf.prenom, inf.nom].filter(Boolean).join(' ') });
    });
    majNew(); resume();
  }
  window.CvEval = { monter };
})();

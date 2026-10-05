/* Comptes à l'honneur — section « Mon barème » des Paramètres du compte (2026-10-05).
   Chaque compte ne voit QUE ses propres décomptes (GET /api/honneur/mon-bareme). Le coup de pouce
   éventuel de l'administrateur est fondu dans le total : il n'est jamais affiché ni détaillé. */
(function () {
  const cible = document.getElementById('honneur-bloc');
  if (!cible || typeof api !== 'function') return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateFr = iso => { try { return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }); } catch (_) { return iso; } };
  const nb = n => String(n).replace('.', ',');

  const css = document.createElement('style');
  css.textContent = `
  .hn-total{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:6px 0 14px}
  .hn-pct{font-size:38px;font-weight:900;line-height:1;font-variant-numeric:tabular-nums}
  .hn-pill{display:inline-block;font-size:12px;font-weight:800;padding:4px 12px;border-radius:99px}
  .hn-pill.haut{background:#FEF3C7;color:#92400E}.hn-pill.ok{background:#DCFCE7;color:#166534}.hn-pill.bas{background:#E8F0FD;color:#1E40AF}
  .hn-barre{height:10px;border-radius:99px;background:var(--border);overflow:hidden;position:relative}
  .hn-barre i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#2E74E0,#F26422)}
  .hn-ligne{padding:11px 0;border-top:1px solid var(--border)}
  .hn-ligne:first-of-type{border-top:none}
  .hn-ligne .l1{display:flex;justify-content:space-between;gap:10px;font-weight:700;font-size:13.5px}
  .hn-ligne .l2{font-size:12px;color:var(--muted);margin:2px 0 6px}
  .hn-ligne .l3{font-size:12px;color:var(--muted);margin-top:5px;font-variant-numeric:tabular-nums}
  .hn-note{font-size:12px;color:var(--muted);line-height:1.55;margin-top:12px}
  .hn-etat{background:var(--bg);border-radius:10px;padding:10px 12px;font-size:13px;margin-bottom:12px;line-height:1.5}
  .hn-etat.or{background:linear-gradient(135deg,#FFF8E1,#FDECB4);color:#7A5200;border:1.5px solid #E3B84A}
  @media(max-width:520px){.hn-pct{font-size:32px}}`;
  document.head.appendChild(css);

  (async function () {
    let d;
    try { d = await api('GET', '/honneur/mon-bareme'); }
    catch (e) { return; }
    if (!d || !d.concerne) { cible.innerHTML = ''; return; }

    const lauriers = (d.historique || []);
    const pill = d.statut === 'au_dessus' ? '<span class="hn-pill haut">Au-dessus du barème</span>'
      : d.statut === 'bareme' ? '<span class="hn-pill ok">Barème atteint</span>' : '<span class="hn-pill bas">En progression</span>';
    const cat = d.categorie === 'initiative' ? 'initiatives' : 'membres';
    let intro;
    if (d.apercu) intro = `Le programme démarre le <b>${esc(dateFr(d.debut_programme))}</b>. D'ici là, voici un <b>aperçu</b> de votre activité sur les deux derniers mois, calculé comme le sera le premier cycle.`;
    else if (d.phase === 'mesure') intro = `Cycle en cours : vos deux mois sont mesurés du <b>${esc(dateFr(d.fenetre.debut))}</b> au <b>${esc(dateFr(d.fenetre.fin))}</b> (exclu).`;
    else intro = `Le dernier cycle mesuré va du <b>${esc(dateFr(d.fenetre.debut))}</b> au <b>${esc(dateFr(d.fenetre.fin))}</b> (exclu). Le troisième mois n'est mesuré pour personne.`;

    let etat = '';
    if (!d.premium.actif) etat = '<div class="hn-etat">Le programme est réservé aux comptes <b>Premium</b>. Passez au Premium pour participer au Trophée de la Diaspora.</div>';
    else if (!d.premium.eligible) etat = `<div class="hn-etat">Votre Premium (${esc(d.premium.libelle)}) ne permet pas encore de concourir : seuls les abonnements réellement payants participent.</div>`;
    else etat = `<div class="hn-etat">✓ Votre Premium (${esc(d.premium.libelle)}) vous permet de participer.</div>`;

    const lignes = (d.parametres || []).map(p => {
      const w = Math.min(100, Math.round(p.pct / 2));
      return `<div class="hn-ligne"><div class="l1"><span>${esc(p.titre)}</span><span>${p.pct} %</span></div><div class="l2">${esc(p.desc)}</div><div class="hn-barre" aria-hidden="true"><i style="width:${w}%"></i></div><div class="l3">Vous : ${nb(p.valeur)}${esc(p.unite || '')} · repère à 100 % : ${nb(p.seuil)}${esc(p.unite || '')}</div></div>`;
    }).join('');

    const histo = lauriers.length
      ? `<div class="hn-etat or">🏆 Votre compte a déjà été à l'honneur : ${lauriers.map(l => esc(l.cycle_cle)).join(', ')}.</div>` : '';

    cible.innerHTML = `<div class="pc-card" id="honneur">
      <h2>🏆 Mon barème — Compte à l'honneur</h2>
      <p class="pc-desc">${intro}</p>
      ${histo}${etat}
      <div class="hn-total"><span class="hn-pct">${d.pct} %</span>${pill}</div>
      <div class="hn-barre" style="height:12px" aria-hidden="true"><i style="width:${Math.min(100, Math.round(d.pct / 2))}%"></i></div>
      <div class="hn-note" style="margin:6px 0 14px">100 % = une activité régulière et saine. Les lauréats sont choisis parmi les ${cat} au-dessus de 100 %.</div>
      ${lignes}
      <p class="hn-note">Ces chiffres sont privés : personne d'autre que vous n'y a accès. Publiquement, seuls les comptes mis à l'honneur sont présentés, sans aucun chiffre ni classement.</p>
    </div>`;
    if (location.hash === '#honneur') { const el = document.getElementById('honneur'); if (el) el.scrollIntoView(); }
  })();
})();

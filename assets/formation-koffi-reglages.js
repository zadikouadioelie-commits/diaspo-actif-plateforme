/* ═══════════════════════════════════════════════════════
   assets/formation-koffi-reglages.js — Onglet « Koffi » de l'éditeur de formation (2026-10-30)
   Le formateur (ou l'administrateur) règle Koffi pour SA formation : activer/désactiver, couper pendant les évaluations,
   consignes de ton, et voit ce que Koffi sait du cours (état de l'index par leçon) avec une remise à jour manuelle.
   Routes : GET|PUT /api/formations/:id/kofi-reglages · GET /api/formations/:id/kofi/index · POST /api/formations/:id/kofi/reindexer (server/kofi.js).
   Dépend de la fonction globale api() de la page. Usage : FormateurKoffi.monter(élément, idFormation).
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const MAX_CONSIGNES = 600;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  /* Dates de la base en UTC → heure de Paris. */
  const dateParis = s => {
    if (!s) return '—';
    const t = String(s).replace(' ', 'T'), d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z');
    return isNaN(d) ? esc(s) : d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const RAISONS = {
    video_sans_transcription: 'Vidéo sans texte : Koffi ne peut pas encore la lire. Ajoutez un résumé ou la transcription dans la description de la leçon.',
    pdf_non_lu: 'Document PDF : Koffi ne le lit pas encore. Recopiez l\'essentiel dans la description ou le texte de la leçon.',
    vide: 'Leçon sans texte : rien à lire pour Koffi.',
  };
  const STATUTS = {
    pret: ['✅ Lue par Koffi', '#22c55e'],
    non_exploitable: ['⚠️ Non lisible', '#f59e0b'],
    a_indexer: ['⏳ À mettre à jour', '#9ca3af'],
  };

  function style() {
    if (document.getElementById('fk-style')) return;
    const s = document.createElement('style'); s.id = 'fk-style';
    s.textContent = `
      .fk-opt{display:flex;gap:10px;align-items:flex-start;padding:10px 0;border-top:1px solid var(--border)}
      .fk-opt:first-of-type{border-top:0}.fk-opt input{margin-top:3px;flex:0 0 auto}.fk-opt b{display:block;font-size:14px}
      .fk-opt span{display:block;font-size:12.5px;color:var(--muted);line-height:1.45;margin-top:2px}
      .fk-msg{font-size:13px;margin-top:10px;min-height:18px}.fk-msg.ok{color:#22c55e;font-weight:700}.fk-msg.ko{color:#f87171;font-weight:700}
      .fk-resume{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
      .fk-pastille{border:1px solid var(--border);border-radius:99px;padding:4px 12px;font-size:12.5px;font-weight:700}
      .fk-tab{width:100%;border-collapse:collapse;font-size:13px}
      .fk-tab th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--border)}
      .fk-tab td{padding:8px;border-bottom:1px solid var(--border);vertical-align:top}
      .fk-aide{background:rgba(127,127,127,.12);border:1px solid var(--border);border-radius:8px;padding:10px 12px;font-size:12.5px;line-height:1.55;color:inherit;margin:0 0 12px}
      .fk-consignes{width:100%;box-sizing:border-box;min-height:90px;padding:9px;border:1px solid var(--border);border-radius:8px;font:inherit;font-size:13px;resize:vertical}
    `;
    document.head.appendChild(s);
  }

  function dire(zone, id, texte, ok) { const m = zone.querySelector('#' + id); if (m) { m.textContent = texte || ''; m.className = 'fk-msg ' + (texte ? (ok ? 'ok' : 'ko') : ''); } }

  function blocReglages(r, id) {
    return '<div class="card" style="margin-bottom:16px">'
      + '<h3 style="margin:0 0 6px">🤖 Koffi, le tuteur IA de cette formation</h3>'
      + '<p class="fk-aide" style="margin-top:8px">Koffi répond aux questions de vos apprenants <b>uniquement à partir du contenu de cette formation</b>, et seulement sur les modules auxquels leur compte donne accès (jamais sur un module qu\'ils n\'ont pas obtenu). Il cite les passages du cours qui lui servent de source, ne modifie jamais les notes ni les attestations, et n\'a <b>aucun coût pour vous</b>. Il est réservé aux comptes Premium.</p>'
      + '<label class="fk-opt"><input type="checkbox" id="fk-actif"' + (r.actif ? ' checked' : '') + '><div><b>Koffi est actif dans cette formation</b><span>Décoché, le bouton Koffi disparaît pour vos apprenants ; vous le réactivez quand vous voulez.</span></div></label>'
      + '<label class="fk-opt"><input type="checkbox" id="fk-eval"' + (r.desactive_evaluation ? ' checked' : '') + '><div><b>Couper Koffi pendant les évaluations</b><span>Recommandé : pendant un quiz ou un examen, Koffi ne répond pas. Il redevient disponible juste après.</span></div></label>'
      + '<div style="margin-top:10px"><label for="fk-consignes" style="font-size:13px;font-weight:700;display:block;margin-bottom:4px">Consignes pour Koffi <span style="font-weight:400;color:var(--muted)">(facultatif)</span></label>'
      + '<textarea id="fk-consignes" class="fk-consignes" maxlength="' + MAX_CONSIGNES + '" placeholder="ex : Tutoie l\'apprenant. Utilise le vocabulaire des cours (« tontine », pas « épargne rotative »). Reste concis.">' + esc(r.consignes) + '</textarea>'
      + '<span style="display:block;font-size:12px;color:var(--muted);margin-top:4px">Ton, vocabulaire, niveau de détail. Ces consignes ne peuvent pas lever les règles de sécurité de Koffi (rester dans le cours, ne rien inventer). <span id="fk-compteur">' + (r.consignes || '').length + '</span>/' + MAX_CONSIGNES + '.</span></div>'
      + '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;align-items:center"><button type="button" class="btn btn-orange" id="fk-save">Enregistrer</button>'
      + (r.publiee ? '<a class="btn btn-outline" href="suivre-formation.html?id=' + encodeURIComponent(id) + '" target="_blank" rel="noopener">Essayer Koffi dans la formation ↗</a>'
        : '<span style="font-size:12.5px;color:var(--muted)">Koffi n\'est proposé qu\'aux formations publiées : vous pourrez l\'essayer dès la publication.</span>') + '</div>'
      + '<div id="fk-msg-reg" class="fk-msg" role="status"></div></div>';
  }

  function blocIndex(idx) {
    const l = idx.lecons || [];
    const n = { pret: 0, non_exploitable: 0, a_indexer: 0 };
    l.forEach(x => { n[x.statut] = (n[x.statut] || 0) + 1; });
    const pastille = (k, lib) => '<span class="fk-pastille" style="color:' + STATUTS[k][1] + '">' + STATUTS[k][0].split(' ')[0] + ' ' + n[k] + ' ' + lib + '</span>';
    const lignes = l.map(x => {
      const st = STATUTS[x.statut] || STATUTS.a_indexer;
      return '<tr><td>' + esc(x.titre || 'Sans titre') + '</td><td style="white-space:nowrap"><b style="color:' + st[1] + '">' + st[0] + '</b>'
        + (x.raison ? '<div style="color:var(--muted);font-size:12px;max-width:340px;white-space:normal">' + esc(RAISONS[x.raison] || x.raison) + '</div>' : '') + '</td>'
        + '<td style="text-align:right">' + (x.extraits || '—') + '</td><td style="white-space:nowrap">' + (x.indexe_le ? dateParis(x.indexe_le) : '—') + '</td></tr>';
    }).join('');
    return '<div class="card"><h3 style="margin:0 0 6px">📚 Ce que Koffi sait de votre formation</h3>'
      + '<p class="fk-aide" style="margin-top:8px">Koffi lit le <b>texte</b> de vos leçons : description, texte, pages du Studio <b>publiées</b>. Il ne lit pas (encore) le contenu des vidéos ni des PDF, et jamais les questions ni les réponses des quiz. La mise à jour est automatique quand vous modifiez une leçon ; le bouton ci-dessous la force.</p>'
      + (l.length ? '<div class="fk-resume">' + pastille('pret', 'lue(s)') + pastille('non_exploitable', 'non lisible(s)') + pastille('a_indexer', 'à mettre à jour') + '</div>'
        + '<div style="overflow-x:auto"><table class="fk-tab"><thead><tr><th>Leçon</th><th>État</th><th style="text-align:right">Extraits</th><th>Mise à jour (Paris)</th></tr></thead><tbody>' + lignes + '</tbody></table></div>'
        : '<p style="color:var(--muted);font-size:13px;margin:0 0 6px">Cette formation n\'a pas encore de leçon : Koffi n\'a rien à lire.</p>')
      + '<div style="margin-top:14px"><button type="button" class="btn btn-sm btn-outline" id="fk-reindex">↻ Mettre à jour maintenant</button></div>'
      + '<div id="fk-msg-idx" class="fk-msg" role="status"></div></div>';
  }

  async function monter(zone, id) {
    if (!zone || !id) return;
    style();
    zone.innerHTML = '<div class="notice">Chargement…</div>';
    let r, idx;
    try {
      [r, idx] = await Promise.all([api('GET', '/formations/' + encodeURIComponent(id) + '/kofi-reglages'), api('GET', '/formations/' + encodeURIComponent(id) + '/kofi/index')]);
    } catch (e) { zone.innerHTML = '<div class="notice" style="color:#b91c1c">Impossible de charger les réglages de Koffi : ' + esc(e.message || 'erreur') + '</div>'; return; }
    zone.innerHTML = blocReglages(r, id) + blocIndex(idx);

    const consignes = zone.querySelector('#fk-consignes');
    consignes.addEventListener('input', () => { zone.querySelector('#fk-compteur').textContent = consignes.value.length; });
    zone.querySelector('#fk-save').addEventListener('click', async ev => {
      const b = ev.currentTarget; b.disabled = true; dire(zone, 'fk-msg-reg', '');
      try {
        await api('PUT', '/formations/' + encodeURIComponent(id) + '/kofi-reglages', { actif: zone.querySelector('#fk-actif').checked, desactive_evaluation: zone.querySelector('#fk-eval').checked, consignes: consignes.value });
        dire(zone, 'fk-msg-reg', 'Réglages enregistrés.', true);
      } catch (e) { dire(zone, 'fk-msg-reg', e.message || 'Échec de l\'enregistrement.', false); }
      b.disabled = false;
    });
    brancherIndex(zone, id);
  }

  /* Bouton « Mettre à jour » : réindexe, puis redessine SEULEMENT la carte d'index (les réglages en cours de saisie restent intacts) et rebranche le nouveau bouton. */
  function brancherIndex(zone, id) {
    zone.querySelector('#fk-reindex').addEventListener('click', async ev => {
      const b = ev.currentTarget; b.disabled = true; dire(zone, 'fk-msg-idx', 'Mise à jour en cours…', true);
      try {
        const res = await api('POST', '/formations/' + encodeURIComponent(id) + '/kofi/reindexer', {});
        const idx = await api('GET', '/formations/' + encodeURIComponent(id) + '/kofi/index');
        zone.querySelector('#fk-msg-idx').closest('.card').outerHTML = blocIndex(idx);
        brancherIndex(zone, id);
        const n = res.refaites || 0;
        dire(zone, 'fk-msg-idx', 'Mise à jour terminée (' + n + ' leçon' + (n > 1 ? 's' : '') + ' relue' + (n > 1 ? 's' : '') + ').', true);
      } catch (e) { dire(zone, 'fk-msg-idx', e.message || 'Échec de la mise à jour.', false); b.disabled = false; }
    });
  }

  window.FormateurKoffi = { monter };
})();

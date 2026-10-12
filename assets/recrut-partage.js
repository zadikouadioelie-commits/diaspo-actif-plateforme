/* ============================================================
   DIASPO'ACTIF — Repartager un CV reçu, avec ou sans ses notes (2026-10-12, demande explicite)
   Fenêtre unique, utilisée par la page du CV (assets/cv-evaluation.js) et par la page des dossiers de candidatures.
   Destinataire : un compte Diaspo'Actif (messagerie, mêmes règles de contact que le reste de la plateforme), une adresse e-mail extérieure,
   WhatsApp ou simple copie. Le texte vient du serveur (GET /api/recrutement/candidats/:id/texte-partage) : lien du CV, et — si on le
   choisit — la note, le verdict et les commentaires. Fonctionne sur téléphone (fenêtre pleine largeur). Autonome : injecte son style.
   ============================================================ */
(function () {
  'use strict';
  if (window.RecrutPartage) return;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  async function api(methode, url, corps) {
    const r = await fetch(url, { method: methode, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined });
    const j = await r.json().catch(() => ({})); j._s = r.status; return j;
  }
  function css() {
    if (document.getElementById('rcp-css')) return;
    const s = document.createElement('style'); s.id = 'rcp-css';
    s.textContent = `
.rcp-ov{position:fixed;inset:0;background:rgba(13,27,42,.62);z-index:9000;display:flex;align-items:flex-end;justify-content:center;padding:0}
@media(min-width:640px){.rcp-ov{align-items:center;padding:16px}}
.rcp-box{background:#fff;color:#14213a;width:100%;max-width:480px;max-height:92vh;overflow:auto;border-radius:18px 18px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:'Segoe UI',system-ui,-apple-system,Roboto,sans-serif;font-size:15px;line-height:1.45}
@media(min-width:640px){.rcp-box{border-radius:18px}}
.rcp-ov [hidden]{display:none !important}
.rcp-box h2{margin:0 0 4px;font-size:18px;color:#0D2B4E}
.rcp-box .rcp-sub{margin:0 0 12px;color:#56637a;font-size:13px}
.rcp-box label.rcp-l{display:block;font-weight:700;font-size:13px;margin:12px 0 5px;color:#0D2B4E}
.rcp-box input[type=text],.rcp-box textarea{width:100%;font:inherit;font-size:16px;padding:10px 12px;border:1.5px solid #dfe6f0;border-radius:10px;background:#fff;color:#14213a}
.rcp-box textarea{min-height:70px;resize:vertical}
.rcp-box input:focus,.rcp-box textarea:focus{outline:3px solid #F26422;outline-offset:1px}
.rcp-chip{display:flex;align-items:center;gap:8px;background:#E6EBFA;color:#13369C;border-radius:99px;padding:6px 6px 6px 12px;font-weight:700;font-size:14px;width:max-content;max-width:100%}
.rcp-chip button{border:0;background:#fff;color:#13369C;width:26px;height:26px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1}
.rcp-sugg{border:1.5px solid #dfe6f0;border-radius:10px;margin-top:4px;overflow:hidden}
.rcp-sugg button{display:block;width:100%;text-align:left;padding:9px 12px;border:0;border-bottom:1px solid #eef2f8;background:#fff;font:inherit;font-size:14px;cursor:pointer;color:#14213a}
.rcp-sugg button:last-child{border-bottom:0}
.rcp-sugg button:hover{background:#f3f6fb}
.rcp-sugg small{display:block;color:#56637a;font-size:12px}
.rcp-notes{display:grid;gap:8px;margin-top:4px}
.rcp-notes label{display:flex;gap:10px;align-items:flex-start;border:1.5px solid #dfe6f0;border-radius:12px;padding:10px 12px;cursor:pointer}
.rcp-notes input{margin-top:3px;width:18px;height:18px;accent-color:#0D2B4E;flex:none}
.rcp-notes label.on{border-color:#0D2B4E;background:#f3f6fb}
.rcp-notes b{display:block;font-size:14px}
.rcp-notes span{font-size:12.5px;color:#56637a}
.rcp-av{background:#fff7ed;border:1px solid #fdba74;color:#7a3a0f;border-radius:10px;padding:8px 12px;font-size:12.5px;margin-top:10px}
.rcp-act{display:grid;gap:8px;margin-top:14px}
.rcp-b{display:flex;align-items:center;justify-content:center;gap:6px;min-height:46px;border-radius:12px;border:2px solid #0D2B4E;background:#fff;color:#0D2B4E;font:inherit;font-weight:800;font-size:15px;cursor:pointer;padding:0 14px}
.rcp-b.p{background:#0D2B4E;color:#fff}
.rcp-b.wa{background:#25D366;border-color:#25D366;color:#0b2a14}
.rcp-b:disabled{opacity:.55;cursor:progress}
.rcp-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.rcp-etat{min-height:20px;margin:10px 2px 0;font-size:13.5px;font-weight:600}
.rcp-etat.ok{color:#1e7a3f}.rcp-etat.ko{color:#b42318}`;
    document.head.appendChild(s);
  }

  /* ouvrir({ candidatId, nom })  : repartage d'un candidat enregistré dans un dossier (avec ou sans notes).
     ouvrir({ monCv: { numero, nom, lien } }) : envoi de SON PROPRE CV (lien) à un compte, par e-mail ou WhatsApp — depuis la page du CV et le téléphone ;
     pas de notes dans ce mode. */
  function ouvrir(opts) {
    css();
    const mon = opts.monCv || null;
    const id = Number(opts.candidatId); if (!id && !mon) return;
    let dest = { compte: null }, avecNotes = false, timer = null;
    const ov = document.createElement('div'); ov.className = 'rcp-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Repartager ce CV');
    ov.innerHTML = `<div class="rcp-box">
      <h2>${mon ? '📤 Envoyer mon CV' : '📤 Repartager ce CV'}</h2>
      <p class="rcp-sub">${mon ? 'Votre CV' : 'CV de'} <b>${esc((mon && mon.nom) || opts.nom || 'ce candidat')}</b> — vers un compte Diaspo’Actif ou vers l’extérieur.</p>
      <label class="rcp-l" for="rcp-dest">Destinataire</label>
      <input type="text" id="rcp-dest" autocomplete="off" placeholder="Tapez @ puis un nom, ou une adresse e-mail">
      <div class="rcp-chip" id="rcp-chip" hidden></div>
      <div class="rcp-sugg" id="rcp-sugg" hidden></div>
      ${mon ? '' : '<label class="rcp-l">Avec ou sans vos notes ?</label>'}
      <div class="rcp-notes" id="rcp-notes"${mon ? ' hidden' : ''}>
        <label class="on"><input type="radio" name="rcp-n" value="0" checked><div><b>Sans mes notes</b><span>Seulement le CV, sans votre appréciation.</span></div></label>
        <label><input type="radio" name="rcp-n" value="1"><div><b>Avec mes notes</b><span>Joint votre note, votre verdict et vos commentaires.</span></div></label>
      </div>
      <div class="rcp-av" id="rcp-av" hidden>Vos notes et commentaires sont des appréciations personnelles : ne les transmettez qu’à des personnes habilitées à les connaître.</div>
      <label class="rcp-l" for="rcp-msg">Petit mot (facultatif)</label>
      <textarea id="rcp-msg" maxlength="600" placeholder="Bonjour, je vous transmets ce profil qui pourrait vous intéresser."></textarea>
      <div class="rcp-etat" id="rcp-etat" role="status" aria-live="polite"></div>
      <div class="rcp-act">
        <button type="button" class="rcp-b p" id="rcp-send">Envoyer</button>
        <div class="rcp-row"><button type="button" class="rcp-b wa" id="rcp-wa">WhatsApp</button><button type="button" class="rcp-b" id="rcp-copy">🔗 Copier</button></div>
        <button type="button" class="rcp-b" id="rcp-x">Fermer</button>
      </div></div>`;
    document.body.appendChild(ov);
    const $ = s => ov.querySelector(s);
    const etat = (t, ok) => { const e = $('#rcp-etat'); e.textContent = t || ''; e.className = 'rcp-etat' + (ok === true ? ' ok' : ok === false ? ' ko' : ''); };
    const fermer = () => { document.removeEventListener('keydown', echap); ov.remove(); };
    const echap = e => { if (e.key === 'Escape') fermer(); };
    document.addEventListener('keydown', echap);
    ov.addEventListener('click', e => { if (e.target === ov) fermer(); });
    $('#rcp-x').onclick = fermer;
    const emailOk = v => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);
    const maj = () => { const v = $('#rcp-dest').value.trim(); $('#rcp-send').textContent = dest.compte ? 'Envoyer sur Diaspo’Actif' : emailOk(v) ? 'Envoyer par e-mail' : 'Envoyer'; };
    const nomCompte = u => u.role === 'utilisateur' ? [u.prenom, u.nom].filter(Boolean).join(' ') : (u.init_nom || u.nom);
    const roles = { utilisateur: 'Membre', initiative: 'Organisation', collectivite: 'Collectivité', administrateur: 'Admin' };
    function choisir(c) {
      dest.compte = c; $('#rcp-dest').value = ''; $('#rcp-dest').hidden = true; $('#rcp-sugg').hidden = true;
      const chip = $('#rcp-chip'); chip.hidden = false; chip.innerHTML = `<span>@${esc(c.nom)}</span><button type="button" aria-label="Retirer ce destinataire">×</button>`;
      chip.querySelector('button').onclick = () => { dest.compte = null; chip.hidden = true; $('#rcp-dest').hidden = false; $('#rcp-dest').focus(); maj(); };
      maj();
    }
    async function chercher() {
      const v = $('#rcp-dest').value.trim(), box = $('#rcp-sugg'); maj();
      const q = v.replace(/^@/, '');
      if (dest.compte || q.length < 2 || emailOk(v) || /\s{2,}/.test(v)) { box.hidden = true; return; }
      const j = await api('GET', '/api/users/search?q=' + encodeURIComponent(q));
      const liste = (j.users || []).slice(0, 6);
      box.hidden = false;
      if (!liste.length) { box.innerHTML = '<div style="padding:9px 12px;font-size:13px;color:#56637a">Aucun compte trouvé. Vous pouvez saisir une adresse e-mail.</div>'; return; }
      box.innerHTML = liste.map((u, i) => `<button type="button" data-i="${i}"><b>${esc(nomCompte(u))}</b><small>${esc(roles[u.role] || u.role || '')}${u.ville ? ' · ' + esc(u.ville) : ''}</small></button>`).join('');
      box.querySelectorAll('button').forEach(b => b.onclick = () => choisir({ id: liste[Number(b.dataset.i)].id, nom: nomCompte(liste[Number(b.dataset.i)]) }));
    }
    $('#rcp-dest').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(chercher, 250); });
    ov.querySelectorAll('input[name=rcp-n]').forEach(r => r.addEventListener('change', () => {
      avecNotes = ov.querySelector('input[name=rcp-n]:checked').value === '1';
      ov.querySelectorAll('.rcp-notes label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
      $('#rcp-av').hidden = !avecNotes;
    }));
    const texteServeur = async () => {
      if (mon) {                                       // son propre CV : le texte se compose ici (nom + lien), sans notes
        const msg = $('#rcp-msg').value.trim();
        return { texte: [msg, msg ? '' : null, 'CV de ' + (mon.nom || 'moi'), '👀 Voir le CV en ligne : ' + mon.lien].filter(x => x !== null).join('\n'), lien: mon.lien };
      }
      const j = await api('GET', `/api/recrutement/candidats/${id}/texte-partage?avec_notes=${avecNotes ? 1 : 0}&message=${encodeURIComponent($('#rcp-msg').value.trim())}`);
      if (!j.texte) throw new Error(j.error || 'Impossible de préparer le message.');
      return j;
    };
    $('#rcp-send').onclick = async () => {
      const b = $('#rcp-send'), v = $('#rcp-dest').value.trim();
      if (!dest.compte && !emailOk(v)) { etat('Choisissez un compte (tapez @ puis un nom) ou saisissez une adresse e-mail.', false); return; }
      b.disabled = true;
      try {
        if (dest.compte) {
          etat('Envoi à ' + dest.compte.nom + '…');
          const t = await texteServeur();
          const c = await api('POST', '/api/conversations', { user_id: dest.compte.id, origine: 'cv' });
          if (!c.conversation_id) { etat(c.code === 'contact_requis' ? 'Vous devez d’abord établir le contact avec ' + dest.compte.nom + ' (demande de contact depuis son profil).' : (c.error || 'Envoi impossible.'), false); return; }
          const r = await api('POST', '/api/conversations/' + c.conversation_id + '/messages', { contenu: t.texte, type: 'text' });
          if (!r.message) { etat(r.error || 'Envoi impossible.', false); return; }
          etat('✅ CV envoyé à ' + dest.compte.nom + ' dans sa messagerie' + (avecNotes ? ', avec vos notes.' : '.'), true);
        } else {
          etat('Envoi par e-mail…');
          const r = mon ? await api('POST', '/api/cv/partager-lien-email', { numero: mon.numero, email: v, message: $('#rcp-msg').value.trim() })
                        : await api('POST', `/api/recrutement/candidats/${id}/partager-email`, { email: v, avec_notes: avecNotes, message: $('#rcp-msg').value.trim() });
          if (!r.ok) { etat(r.error || 'E-mail non envoyé.', false); return; }
          etat('✅ CV envoyé à ' + v + (avecNotes ? ', avec vos notes.' : '.'), true);
        }
      } catch (e) { etat(e.message || 'Envoi impossible.', false); }
      finally { b.disabled = false; }
    };
    $('#rcp-wa').onclick = async () => {
      try { const t = await texteServeur(); etat('Ouverture de WhatsApp…', true); window.open('https://wa.me/?text=' + encodeURIComponent(t.texte), '_blank', 'noopener'); }
      catch (e) { etat(e.message, false); }
    };
    $('#rcp-copy').onclick = async () => {
      try {
        const t = await texteServeur();
        try { await navigator.clipboard.writeText(t.texte); etat('✅ Texte copié' + (avecNotes ? ' (avec vos notes).' : '.'), true); }
        catch (er) {                                   // copie automatique refusée par l'appareil : le texte est affiché pour être copié à la main
          let zone = $('#rcp-brut'); if (!zone) { zone = document.createElement('textarea'); zone.id = 'rcp-brut'; zone.readOnly = true; zone.style.marginTop = '8px'; $('#rcp-etat').after(zone); }
          zone.value = t.texte; zone.style.minHeight = '130px'; zone.focus(); zone.select(); etat('Copie automatique impossible ici : le texte est affiché ci-dessous, sélectionnez-le pour le copier.', false);
        }
      } catch (e) { etat(e.message, false); }
    };
    setTimeout(() => { const d = $('#rcp-dest'); if (d) d.focus(); }, 60);
  }
  window.RecrutPartage = { ouvrir };
})();

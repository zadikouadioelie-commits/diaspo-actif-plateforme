/* ============================================================
   Diaspo'Actif — Administration : notifications (2026-10-13, demande explicite)
   • notifAdminOuvrir(opts) : fenêtre « Envoyer une notification » — cible (type de compte, domaine d'activité, pays, compte
     précis), message, aperçu du nombre de comptes touchés, envoi. Appelée par la cloche 🔔 des publications, des vidéos
     tutoriels, et par la section « 🔔 Notifications ».
   • naOuvrir() : section « Notifications » (taux d'activation, historique, boutons d'envoi).
   API : POST /api/admin/notifications[/apercu|/:id/continuer] · GET /api/admin/notifications/[historique|comptes]
   Dépend de : api(method, path, body) du tableau de bord, window.DOMAINES_ACTIVITE (assets/domaines-activite.js).
   ============================================================ */
(function () {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const info = m => { try { if (window.showToast) return window.showToast(m); } catch (e) { /* repli */ } alert(m); };
  const TYPES = [['utilisateur', 'Utilisateurs'], ['initiative', 'Initiatives'], ['collectivite', 'Collectivités']];
  const dateFr = iso => { const d = new Date(String(iso || '').replace(' ', 'T') + (String(iso || '').includes('T') ? '' : 'Z')); return isNaN(d.getTime()) ? '' : d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

  /* ---------- fenêtre d'envoi ---------- */
  window.notifAdminOuvrir = function (opts) {
    opts = opts || {};
    if (document.getElementById('na-fond')) return;
    const domaines = window.DOMAINES_ACTIVITE || [];
    const etat = { roles: new Set(TYPES.map(t => t[0])), domaines: new Set(), pays: '', user: null, apercu: null, minuteur: null, envoi: false };
    const fond = document.createElement('div');
    fond.id = 'na-fond';
    fond.setAttribute('role', 'dialog'); fond.setAttribute('aria-modal', 'true'); fond.setAttribute('aria-labelledby', 'na-titre-fen');
    fond.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(6,18,36,.6);display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow:auto;';
    const champ = 'width:100%;box-sizing:border-box;border:1px solid var(--border,#d9e0ea);border-radius:10px;padding:10px 12px;font:inherit;font-size:14px;margin-top:4px;';
    const lbl = 'font-size:13px;font-weight:700;display:block;margin-top:14px;';
    fond.innerHTML = `<div style="background:#fff;color:#0D2B4E;border-radius:16px;max-width:620px;width:100%;padding:22px 22px 18px;box-shadow:0 24px 60px -12px rgba(0,0,0,.5);">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;"><h3 id="na-titre-fen" style="margin:0;">🔔 ${esc(opts.publication ? 'Nouvelle information pour tous' : 'Envoyer une notification')}</h3><button type="button" id="na-x" class="btn btn-sm btn-outline" aria-label="Fermer">✕</button></div>
      ${opts.publication ? `<label style="${lbl}" for="na-pub">Texte de la publication <span style="font-weight:400;color:#64748B;">(publié sur le fil, mis en avant par la notification)</span></label><textarea id="na-pub" rows="4" maxlength="2000" style="${champ}">${esc(opts.publicationTexte || '')}</textarea>` : ''}
      <label style="${lbl}" for="na-titre">Titre de la notification <span id="na-c1" style="font-weight:400;color:#64748B;"></span></label>
      <input id="na-titre" type="text" maxlength="80" style="${champ}" value="${esc(opts.titre || '')}" placeholder="Ex. 🎬 Nouveau tutoriel : créer votre boutique">
      <label style="${lbl}" for="na-msg">Message <span id="na-c2" style="font-weight:400;color:#64748B;"></span></label>
      <textarea id="na-msg" rows="3" maxlength="240" style="${champ}" placeholder="Une phrase claire : ce qui est nouveau et pourquoi y aller.">${esc(opts.contenu || '')}</textarea>
      <div id="na-lien" style="font-size:12.5px;color:#64748B;margin-top:6px;">${opts.lien ? '👉 Au clic, la notification ouvre la publication concernée.' : (opts.publication ? '👉 Au clic, la notification ouvre la publication créée.' : 'Notification seule : sans lien, elle ouvre l’accueil.')}</div>
      <span style="${lbl}">Qui est concerné ?</span>
      <div id="na-types" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;">${TYPES.map(t => `<label style="display:flex;align-items:center;gap:6px;border:1px solid var(--border,#d9e0ea);border-radius:20px;padding:6px 12px;font-size:13.5px;cursor:pointer;"><input type="checkbox" data-role="${t[0]}" checked> ${esc(t[1])}</label>`).join('')}</div>
      <details style="margin-top:12px;"><summary style="cursor:pointer;font-size:13.5px;font-weight:700;">Domaines d’activité <span id="na-nbdom" style="font-weight:400;color:#64748B;">(tous)</span></summary>
        <div style="max-height:180px;overflow:auto;border:1px solid var(--border,#d9e0ea);border-radius:10px;padding:8px 10px;margin-top:6px;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:4px 10px;">${domaines.length ? domaines.map(d => `<label style="font-size:13px;display:flex;gap:6px;align-items:center;"><input type="checkbox" data-dom="${esc(d[0])}"> ${esc(d[1])} ${esc(d[2])}</label>`).join('') : '<span style="color:#64748B;font-size:13px;">Liste des domaines indisponible.</span>'}</div>
        <div style="font-size:12px;color:#64748B;margin-top:4px;">Aucune case cochée = tous les domaines. Le domaine est celui du profil (ou de l’initiative).</div></details>
      <label style="${lbl}" for="na-pays">Pays de résidence <span style="font-weight:400;color:#64748B;">(facultatif)</span></label>
      <input id="na-pays" type="text" maxlength="80" style="${champ}" placeholder="Ex. France">
      <label style="${lbl}" for="na-q">… ou un compte précis <span style="font-weight:400;color:#64748B;">(remplace les choix ci-dessus)</span></label>
      <input id="na-q" type="search" autocomplete="off" style="${champ}" placeholder="Nom, prénom ou e-mail">
      <div id="na-res" style="margin-top:6px;"></div>
      <div id="na-apercu" style="margin-top:14px;background:#F1F5F9;border-radius:10px;padding:10px 12px;font-size:13.5px;line-height:1.5;">Calcul en cours…</div>
      <div style="font-size:12px;color:#64748B;margin-top:8px;">Au maximum une notification d’administration par compte et par 24 h. N’indiquez aucune information personnelle dans le message.</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;"><button type="button" class="btn btn-outline" id="na-annuler">Annuler</button><button type="button" class="btn btn-orange" id="na-envoyer" disabled>🔔 Envoyer</button></div></div>`;
    document.body.appendChild(fond);
    const $ = s => fond.querySelector(s);
    const fermer = () => { document.removeEventListener('keydown', echap); clearTimeout(etat.minuteur); fond.remove(); };
    const echap = ev => { if (ev.key === 'Escape' && !etat.envoi) fermer(); };
    document.addEventListener('keydown', echap);
    $('#na-x').onclick = $('#na-annuler').onclick = () => { if (!etat.envoi) fermer(); };

    const cible = () => etat.user ? { user_id: etat.user.id } : { roles: [...etat.roles], domaines: [...etat.domaines], pays: etat.pays.trim() };
    const compteurs = () => { $('#na-c1').textContent = `${$('#na-titre').value.length}/80`; $('#na-c2').textContent = `${$('#na-msg').value.length}/240`; };
    async function majApercu() {
      const zone = $('#na-apercu'), btn = $('#na-envoyer');
      if (!etat.user && !etat.roles.size) { etat.apercu = null; zone.textContent = 'Choisissez au moins un type de compte.'; btn.disabled = true; btn.textContent = '🔔 Envoyer'; return; }
      zone.textContent = 'Calcul en cours…';
      try {
        const r = await api('POST', '/admin/notifications/apercu', { cible: cible() });
        etat.apercu = r;
        zone.innerHTML = `<b>${r.cibles}</b> compte${r.cibles > 1 ? 's' : ''} ciblé${r.cibles > 1 ? 's' : ''}` + (r.ignores_plafond ? `, dont <b>${r.ignores_plafond}</b> déjà notifié${r.ignores_plafond > 1 ? 's' : ''} aujourd’hui (ignoré${r.ignores_plafond > 1 ? 's' : ''})` : '') + `.<br><b>${r.envoyables}</b> ${r.envoyables > 1 ? 'recevront' : 'recevra'} la notification dans ${r.envoyables > 1 ? 'leur' : 'sa'} cloche, dont <b>${r.sur_telephone}</b> aussi sur l’écran de ${r.sur_telephone > 1 ? 'leur téléphone' : 'son téléphone'} (notifications activées).`;
        btn.disabled = !r.envoyables; btn.textContent = r.envoyables ? `🔔 Envoyer à ${r.envoyables} compte${r.envoyables > 1 ? 's' : ''}` : 'Personne à notifier';
      } catch (e) { zone.textContent = 'Aperçu indisponible : ' + e.message; btn.disabled = true; }
    }
    const planifier = () => { clearTimeout(etat.minuteur); etat.minuteur = setTimeout(majApercu, 350); };
    fond.querySelectorAll('[data-role]').forEach(c => c.onchange = () => { c.checked ? etat.roles.add(c.dataset.role) : etat.roles.delete(c.dataset.role); planifier(); });
    fond.querySelectorAll('[data-dom]').forEach(c => c.onchange = () => { c.checked ? etat.domaines.add(c.dataset.dom) : etat.domaines.delete(c.dataset.dom); $('#na-nbdom').textContent = etat.domaines.size ? `(${etat.domaines.size} choisi${etat.domaines.size > 1 ? 's' : ''})` : '(tous)'; planifier(); });
    $('#na-pays').oninput = ev => { etat.pays = ev.target.value; planifier(); };
    $('#na-titre').oninput = $('#na-msg').oninput = compteurs; compteurs();
    let tq; $('#na-q').oninput = ev => {
      clearTimeout(tq); const q = ev.target.value.trim(); const res = $('#na-res');
      if (etat.user) { etat.user = null; planifier(); }
      if (q.length < 2) { res.innerHTML = ''; return; }
      tq = setTimeout(async () => {
        try {
          const r = await api('GET', '/admin/notifications/comptes?q=' + encodeURIComponent(q));
          res.innerHTML = (r.comptes || []).map(c => `<button type="button" class="btn btn-sm btn-outline" data-uid="${c.id}" style="display:block;width:100%;text-align:left;margin-bottom:4px;">${esc([c.prenom, c.nom].filter(Boolean).join(' '))} <span style="color:#64748B;">· ${esc(c.role)} · ${esc(c.email)}</span></button>`).join('') || '<span style="font-size:13px;color:#64748B;">Aucun compte trouvé.</span>';
          res.querySelectorAll('[data-uid]').forEach(b => b.onclick = () => { const c = (r.comptes || []).find(x => String(x.id) === b.dataset.uid); etat.user = c; res.innerHTML = `<div style="font-size:13.5px;">✓ Compte choisi : <b>${esc([c.prenom, c.nom].filter(Boolean).join(' '))}</b> (${esc(c.role)}). Les autres choix sont ignorés.</div>`; majApercu(); });
        } catch (e) { res.textContent = e.message; }
      }, 300);
    };

    $('#na-envoyer').onclick = async () => {
      const titre = $('#na-titre').value.trim(), contenu = $('#na-msg').value.trim();
      if (!titre || !contenu) return alert('Le titre et le message de la notification sont obligatoires.');
      const pubTexte = opts.publication ? ($('#na-pub').value || '').trim() : '';
      if (opts.publication && !pubTexte) return alert('Rédigez le texte de la publication (ou utilisez « Notification seule »).');
      const a = etat.apercu; if (!a || !a.envoyables) return;
      if (!confirm(`Envoyer cette notification à ${a.envoyables} compte${a.envoyables > 1 ? 's' : ''} (dont ${a.sur_telephone} sur l’écran de leur téléphone) ?`)) return;
      etat.envoi = true; const btn = $('#na-envoyer'); btn.disabled = true; btn.textContent = 'Envoi en cours…';
      try {
        let lien = opts.lien || null, lienM = opts.lien_m || null, sourceType = opts.source_type || null, sourceId = opts.source_id || null;
        if (pubTexte) {
          const p = await api('POST', '/fil', { type: 'officiel', categorie: 'annonce', contenu: pubTexte });
          lien = 'fil-actualite.html?post=' + p.id; lienM = '#/post/' + p.id; sourceType = 'fil_post'; sourceId = p.id;
        }
        const corps = { titre, contenu, lien, lien_m: lienM, source_type: sourceType, source_id: sourceId, cible: cible() };
        let r;
        try { r = await api('POST', '/admin/notifications', corps); }
        catch (e) {
          if (e.status === 409 || /déjà fait l.objet/.test(e.message || '')) {
            if (!confirm('Ce contenu a déjà été notifié. Envoyer de nouveau quand même ?')) throw new Error('Envoi annulé.');
            r = await api('POST', '/admin/notifications', Object.assign({ confirmer_doublon: true }, corps));
          } else throw e;
        }
        let tour = 0; while (r.restants > 0 && tour++ < 60) r = await api('POST', `/admin/notifications/${r.id}/continuer`, {});
        info(`✓ Notification envoyée à ${r.total_envoyes} compte${r.total_envoyes > 1 ? 's' : ''} (${r.push || 0} sur écran de téléphone).`);
        fermer(); if (typeof window.naOuvrir === 'function' && document.getElementById('na-contenu')) window.naOuvrir();
      } catch (e) { etat.envoi = false; btn.disabled = false; btn.textContent = '🔔 Envoyer'; if (e.message !== 'Envoi annulé.') alert('Erreur : ' + e.message); majApercu(); }
    };
    majApercu();
    setTimeout(() => { try { $('#na-titre').focus(); } catch (e) { /* sans conséquence */ } }, 50);
  };

  /* ---------- cloches des publications ---------- */
  const PUBS = {};
  window.naPubEnregistrer = list => { (list || []).forEach(p => { PUBS[p.id] = p; }); };
  window.naNotifierPublication = function (id) {
    const p = PUBS[id]; if (!p) return;
    const brut = String(p.contenu || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    window.notifAdminOuvrir({ titre: (p.titre || '📢 Nouvelle publication de Diaspo’Actif').slice(0, 80), contenu: brut.slice(0, 200), lien: 'fil-actualite.html?post=' + p.id, lien_m: '#/post/' + p.id, source_type: 'fil_post', source_id: p.id });
  };
  window.naNotifierVideo = function (id) {
    let v = null; try { v = (typeof _vtCache !== 'undefined' ? _vtCache : []).find(x => Number(x.id) === Number(id)); } catch (e) { /* cache indisponible */ }
    if (!v) return alert('Vidéo introuvable : rechargez la liste.');
    window.notifAdminOuvrir({ titre: ('🎬 Nouveau tutoriel : ' + v.titre).slice(0, 80), contenu: (String(v.description || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim() || 'Une nouvelle vidéo est disponible pour mieux utiliser Diaspo’Actif.').slice(0, 200), lien: 'videos-tutoriels.html?v=' + v.id, lien_m: '#/video/' + v.id, source_type: 'video_tutoriel', source_id: v.id });
  };
  /* « Publier et notifier » dans le formulaire de publication officielle : publie d'abord, puis ouvre la fenêtre. */
  window.naPublierEtNotifier = async function () {
    const contenu = (document.getElementById('pub-contenu').value || '').trim(), categorie = document.getElementById('pub-categorie').value;
    if (!contenu) return alert('Rédigez d’abord la publication.');
    try {
      const p = await api('POST', '/fil', { type: 'officiel', categorie, contenu });
      document.getElementById('pub-contenu').value = '';
      window.notifAdminOuvrir({ titre: '📢 Nouvelle publication de Diaspo’Actif', contenu: contenu.slice(0, 200), lien: 'fil-actualite.html?post=' + p.id, lien_m: '#/post/' + p.id, source_type: 'fil_post', source_id: p.id });
    } catch (e) { alert('Erreur : ' + e.message); }
  };

  /* ---------- section « Notifications » ---------- */
  window.naOuvrir = async function () {
    const box = document.getElementById('na-contenu'); if (!box) return;
    box.innerHTML = '<p style="color:var(--muted);font-size:13px;">Chargement…</p>';
    try {
      const r = await api('GET', '/admin/notifications/historique');
      const a = r.activation || { comptes: 0, actives: 0, pourcentage: 0, par_type: {} };
      const barre = (lib, n, t) => { const p = t ? Math.round(n * 100 / t) : 0; return `<div style="margin-bottom:8px;"><div style="display:flex;justify-content:space-between;font-size:13px;"><span>${esc(lib)}</span><span>${n} / ${t} (${p} %)</span></div><div style="height:10px;background:#E2E8F0;border-radius:6px;overflow:hidden;"><div style="height:100%;width:${p}%;background:linear-gradient(90deg,#E0AE24,#F7E08A);"></div></div></div>`; };
      const cibleTxt = c => { let o = {}; try { o = JSON.parse(c || '{}'); } catch (e) { /* ancien format */ } const p = []; if (o.user_id) p.push('compte #' + o.user_id); else { p.push((o.roles && o.roles.length ? o.roles.join(', ') : 'tous types')); if (o.domaines && o.domaines.length) p.push(o.domaines.length + ' domaine(s)'); if (o.pays) p.push(o.pays); } return p.join(' · '); };
      box.innerHTML = `<div class="card" style="margin-bottom:16px;"><h3 style="margin-top:0;">Notifications activées sur les appareils</h3>
        <p style="margin:0 0 10px;font-size:13px;color:var(--muted);">Part des comptes qui ont accepté de recevoir les notifications sur au moins un appareil. Plus elle monte, plus vous touchez de monde.</p>
        ${barre('Tous les comptes', a.actives, a.comptes)}${TYPES.map(t => barre(t[1], (a.par_type[t[0]] || {}).actives || 0, (a.par_type[t[0]] || {}).comptes || 0)).join('')}</div>
        <div class="card"><h3 style="margin-top:0;">Historique des envois</h3>${(r.historique || []).length ? `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;"><thead><tr style="text-align:left;color:#64748B;"><th style="padding:6px 4px;">Date</th><th style="padding:6px 4px;">Notification</th><th style="padding:6px 4px;">Cible</th><th style="padding:6px 4px;">Envoyés</th><th style="padding:6px 4px;">Écran</th><th style="padding:6px 4px;">Par</th></tr></thead><tbody>${r.historique.map(h => `<tr style="border-top:1px solid #E2E8F0;"><td style="padding:7px 4px;white-space:nowrap;">${esc(dateFr(h.created_at))}</td><td style="padding:7px 4px;"><b>${esc(h.titre)}</b><br><span style="color:#64748B;">${esc(h.contenu || '')}</span></td><td style="padding:7px 4px;">${esc(cibleTxt(h.cible_json))}</td><td style="padding:7px 4px;">${h.nb_envoyes}${h.nb_ignores_plafond ? `<br><span style="color:#64748B;">${h.nb_ignores_plafond} ignoré(s)</span>` : ''}${h.statut === 'en_cours' ? `<br><button class="btn btn-sm btn-outline" onclick="naReprendre(${h.id})">Reprendre</button>` : ''}</td><td style="padding:7px 4px;">${h.nb_push || 0}</td><td style="padding:7px 4px;">${esc([h.prenom, h.nom].filter(Boolean).join(' '))}</td></tr>`).join('')}</tbody></table></div>` : '<p style="color:var(--muted);font-size:13px;margin:0;">Aucun envoi pour le moment.</p>'}</div>`;
    } catch (e) { box.innerHTML = `<p style="color:#dc2626;font-size:13px;">Erreur : ${esc(e.message)}</p>`; }
  };
  window.naReprendre = async function (id) {
    try { let r = await api('POST', `/admin/notifications/${id}/continuer`, {}); let tour = 0; while (r.restants > 0 && tour++ < 60) r = await api('POST', `/admin/notifications/${id}/continuer`, {}); info('✓ Envoi terminé.'); window.naOuvrir(); }
    catch (e) { alert('Erreur : ' + e.message); }
  };
})();

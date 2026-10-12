/* ============================================================
   Diaspo'Actif — Version téléphone : module « Mes données et mes droits » (2026-10-12, demande explicite)
   Équivalent de la carte du même nom dans parametres-compte.html : documents légaux acceptés (avec leur version),
   acceptation d'une nouvelle version, exercice des droits sur ses données (accès, portabilité, rectification,
   opposition, limitation, retrait d'un consentement) avec suivi des demandes. Réponse sous 30 jours.

   Route :  #/droits
   API   :  GET /api/legal/mes-acceptations · POST /api/legal/accepter · GET/POST /api/droits/demandes
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, setPane, toast } = A;
  window.MMods = window.MMods || {};
  let jeton = 0;
  const TITRE = 'Mes données et mes droits';
  const dateFr = iso => { const d = new Date(String(iso || '').replace(' ', 'T')); return isNaN(d.getTime()) ? '' : d.toLocaleDateString('fr-FR'); };
  const STATUT = { nouvelle: ['Reçue', '#92400E', '#FEF3C7'], en_cours: ['En cours', '#1E40AF', '#DBEAFE'], traitee: ['Traitée', '#166534', '#DCFCE7'], refusee: ['Refusée', '#991B1B', '#FEE2E2'] };

  async function ecran() {
    const mon = ++jeton;
    if (!S.me) return setPane(TITRE, '<div class="empty"><b>Connexion requise</b>Connectez-vous pour consulter vos documents et exercer vos droits.</div>');
    setPane(TITRE, '<div class="sk" style="height:260px"></div>');
    let leg, dr;
    try { [leg, dr] = await Promise.all([api('/api/legal/mes-acceptations'), api('/api/droits/demandes')]); }
    catch (e) { if (mon !== jeton) return; return setPane(TITRE, `<div class="empty"><b>Indisponible</b>${esc(e.message || '')}</div>`); }
    if (mon !== jeton) return;

    const acc = {}; (leg.acceptations || []).forEach(a => { (acc[a.document] = acc[a.document] || []).push(a); });
    const doitAccepter = new Set((leg.a_accepter || []).map(d => d.cle));
    const docs = (leg.documents || []).filter(d => d.cle !== 'cgv' || (acc.cgv || []).length).map(d => {
      const dernier = (acc[d.cle] || [])[0];
      const etat = doitAccepter.has(d.cle) ? '<b style="color:#B45309">À accepter</b>' : (dernier ? 'Acceptée le ' + esc(dateFr(dernier.accepted_at)) + ' (version ' + esc(dernier.version) + ')' : 'Compte créé avant l’enregistrement des versions');
      return `<a class="li" href="${esc(d.url)}" target="_blank" rel="noopener"><span class="sp"><span class="t">${esc(d.titre)}</span><br><span class="d">Version ${esc(d.version)} · ${etat}</span></span></a>`;
    }).join('');
    const demandes = (dr.demandes || []).map(d => {
      const s = STATUT[d.statut] || [d.statut, '#334155', '#E2E8F0'], fini = ['traitee', 'refusee'].includes(d.statut);
      return `<div class="card pad" style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><b>${esc(d.libelle)}</b><span style="background:${s[2]};color:${s[1]};border-radius:99px;padding:1px 10px;font-size:11.5px;font-weight:700;white-space:nowrap">${esc(s[0])}</span></div>
        <div class="small muted" style="margin-top:2px">Envoyée le ${esc(dateFr(d.created_at))}${fini ? '' : ' · réponse attendue avant le ' + esc(dateFr(d.echeance))}</div>
        ${d.reponse ? `<div style="margin-top:8px;background:#F8FAFC;border-radius:8px;padding:8px 10px"><b>Réponse :</b> ${esc(d.reponse)}</div>` : ''}</div>`;
    }).join('');

    setPane(TITRE, `<p class="small muted" style="margin:2px 4px 12px;line-height:1.5">Les documents que vous avez acceptés, et la façon d’exercer vos droits sur vos données personnelles. Diaspo’Actif vous répond sous <b>${Number(dr.delai_jours) || 30} jours</b>.</p>
      <div class="h2">DOCUMENTS ACCEPTÉS</div><div class="lst">${docs}</div>
      ${doitAccepter.size ? '<button type="button" class="btn block" id="dr-accepter" style="margin-top:10px">J’ai lu et j’accepte les nouvelles versions</button>' : ''}
      <div class="h2" style="margin-top:18px">EXERCER UN DROIT</div>
      <form id="dr-form" class="card pad" novalidate>
        <label class="fl" for="dr-type">Votre demande</label>
        <select class="fi" id="dr-type">${Object.entries(dr.types || {}).map(([k, v]) => `<option value="${esc(k)}">${esc(v)}</option>`).join('')}</select>
        <label class="fl" for="dr-msg">Précisions <span class="muted" style="font-weight:400">(facultatif)</span></label>
        <textarea class="fi" id="dr-msg" rows="3" maxlength="2000" placeholder="Ce que vous souhaitez obtenir ou corriger…" style="min-height:90px"></textarea>
        <div class="row" style="gap:10px;margin-top:14px"><button type="submit" class="btn sp" id="dr-envoyer">Envoyer la demande</button></div>
        <p class="small" id="dr-msg-retour" role="status" style="margin:10px 2px 0"></p>
      </form>
      ${demandes ? '<div class="h2" style="margin-top:18px">MES DEMANDES</div>' + demandes : ''}
      <p class="small muted" style="margin:14px 4px;line-height:1.5">Pour masquer ou supprimer votre compte, ouvrez <a href="#/confidentialite">Confidentialité</a> (« Zone de danger »). Pour retirer un consentement facultatif, utilisez les notifications de <a href="#/confidentialite">Confidentialité</a>.</p>`);

    const b = document.getElementById('dr-accepter');
    if (b) b.onclick = async () => {
      b.disabled = true;
      try { const r = await api('/api/legal/accepter', { method: 'POST', body: { documents: [...doitAccepter] } }); if (S.me) S.me.legal_a_accepter = r.a_accepter || []; if (!(r.a_accepter || []).length) { const bd = document.getElementById('home-legal'); if (bd) bd.innerHTML = ''; } toast('Merci, c’est enregistré ✓'); ecran(); }
      catch (e) { toast(e.message || 'Erreur', true); b.disabled = false; }
    };
    document.getElementById('dr-form').onsubmit = async ev => {
      ev.preventDefault();
      const btn = document.getElementById('dr-envoyer'), msg = document.getElementById('dr-msg-retour'); btn.disabled = true; btn.textContent = 'Envoi…'; msg.textContent = '';
      try {
        await api('/api/droits/demandes', { method: 'POST', body: { type: document.getElementById('dr-type').value, message: document.getElementById('dr-msg').value } });
        toast('Demande envoyée ✓'); ecran();
      } catch (e) { msg.style.color = 'var(--danger, #b91c1c)'; msg.textContent = (e.message || 'Envoi impossible.') + ' Réessayez.'; btn.disabled = false; btn.textContent = 'Envoyer la demande'; }
    };
  }

  window.MMods.droits = function () { ecran(); };
})();

/* ============================================================
   Diaspo'Actif — Version téléphone : module « Structure et organisation » (2026-10-09, demande explicite)
   Équivalent de la carte « Structure et organisation » de parametres-compte.html : type de structure, forme juridique,
   taille de l'entreprise et organisme financier. Mêmes listes (assets/structures-initiative.js), mêmes règles :
   ce qui est déjà saisi est conservé et jamais remplacé tant que la personne ne le change pas ; les champs spécialisés
   n'apparaissent que lorsqu'ils ont un sens (type Entreprise/Startup → forme + taille ; domaine financier → organisme financier).

   Route :  #/structure
   API   :  GET /api/profil/:id (initiative_id, domaine_principal) · GET /api/initiatives/:id · PUT /api/initiatives/:id/structure
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, setPane, toast } = A;
  window.MMods = window.MMods || {};
  let jeton = 0;
  const TITRE = 'Structure et organisation';
  const opts = (liste, vide, sel) => '<option value="">' + esc(vide) + '</option>' + liste.map(l => `<option value="${esc(l)}"${l === sel ? ' selected' : ''}>${esc(l)}</option>`).join('');
  const vide = (titre, msg) => setPane(TITRE, `<div class="empty"><b>${esc(titre)}</b>${esc(msg || '')}</div>`);

  async function ecran() {
    const mon = ++jeton, SI = window.STRUCTURES_INITIATIVE;
    if (!S.me) return vide('Connexion requise', 'Connectez-vous pour modifier la structure de votre initiative.');
    if (!SI) return vide('Listes indisponibles', 'Rechargez la page puis réessayez.');
    setPane(TITRE, '<div class="sk" style="height:260px"></div>');
    let profil, ini;
    try {
      profil = (await api('/api/profil/' + encodeURIComponent(S.me.id))).profil || {};
      if (!profil.initiative_id) throw new Error('Cette page est réservée aux comptes Initiative.');
      ini = (await api('/api/initiatives/' + encodeURIComponent(profil.initiative_id))).initiative || {};
    } catch (e) { if (mon !== jeton) return; return vide('Indisponible', e.message); }
    if (mon !== jeton) return;

    const types = SI.TYPES.map(t => t[0]), formes = SI.FORMES.map(f => f[0]);
    const typeEnreg = ini.type || '', typeConnu = types.find(t => SI.typeIdentique(t, typeEnreg));
    const formeEnreg = ini.forme_juridique || '';
    const finOn = SI.estDomaineFinance(profil.domaine_principal);

    setPane(TITRE, `<p class="small muted" style="margin:2px 4px 12px;line-height:1.5">Ces informations servent aux filtres de l’annuaire. Ce que vous avez déjà saisi est conservé.</p>
      <form id="st-form" class="card pad" novalidate>
        <label class="fl" for="st-type">Type de structure</label>
        <select class="fi" id="st-type">${opts(typeConnu || !typeEnreg ? types : types.concat([typeEnreg]), 'Sélectionner…', typeConnu || typeEnreg)}</select>
        <label class="fl" for="st-forme-sel">Forme juridique</label>
        <select class="fi" id="st-forme-sel" style="display:none">${opts(formes.concat([SI.FORME_AUTRE]), 'Sélectionner…', formes.includes(formeEnreg) ? formeEnreg : (formeEnreg ? SI.FORME_AUTRE : ''))}</select>
        <input class="fi" id="st-forme" type="text" maxlength="120" placeholder="Association loi 1901, ONG…" value="${esc(formeEnreg)}" autocomplete="off">
        <div id="st-grp-ent" style="display:none">
          <label class="fl" for="st-taille">Taille de l’entreprise <span class="muted" style="font-weight:400">(facultatif)</span></label>
          <select class="fi" id="st-taille">${opts(SI.TAILLES.map(t => t[0]), 'Sélectionner…', ini.taille_entreprise || '')}</select>
          <p class="small muted" id="st-taille-aide" style="margin:6px 2px 0"></p>
        </div>
        ${finOn ? `<div id="st-grp-fin">
          <label class="fl" for="st-fam">Famille d’organisme financier <span class="muted" style="font-weight:400">(facultatif)</span></label>
          <select class="fi" id="st-fam">${opts(Object.keys(SI.FIN), 'Sélectionner…', ini.finance_famille || '')}</select>
          <label class="fl" for="st-tfin">Type d’organisme financier <span class="muted" style="font-weight:400">(facultatif)</span></label>
          <select class="fi" id="st-tfin"></select>
        </div>` : ''}
        <div class="row" style="gap:10px;margin-top:16px"><button type="submit" class="btn sp" id="st-save">Enregistrer</button></div>
        <p class="small" id="st-msg" role="status" style="margin:10px 2px 0"></p>
      </form>`);

    const $ = id => document.getElementById(id);
    const remplirTfin = (fam, sel) => { const t = $('st-tfin'); if (!t) return; t.disabled = !fam; t.innerHTML = fam ? opts(SI.FIN[fam] || [], 'Sélectionner…', sel || '') : '<option value="">Choisissez d’abord une famille</option>'; };
    const maj = () => {
      const ent = SI.estEntreprise($('st-type').value);
      $('st-forme-sel').style.display = ent ? '' : 'none';
      $('st-forme').style.display = (!ent || $('st-forme-sel').value === SI.FORME_AUTRE) ? '' : 'none';
      $('st-grp-ent').style.display = ent ? '' : 'none';
      const t = SI.TAILLES.find(x => x[0] === $('st-taille').value); $('st-taille-aide').textContent = t ? t[1] : '';
    };
    $('st-type').onchange = maj; $('st-forme-sel').onchange = maj; $('st-taille').onchange = maj;
    if (finOn) { $('st-fam').onchange = () => remplirTfin($('st-fam').value, ''); remplirTfin(ini.finance_famille || '', ini.finance_type || ''); }
    maj();

    $('st-form').onsubmit = async ev => {
      ev.preventDefault();
      const btn = $('st-save'), msg = $('st-msg'); btn.disabled = true; btn.textContent = 'Enregistrement…'; msg.textContent = '';
      try {
        const ent = SI.estEntreprise($('st-type').value);
        const forme = (ent && $('st-forme-sel').value && $('st-forme-sel').value !== SI.FORME_AUTRE) ? $('st-forme-sel').value : $('st-forme').value.trim();
        await api('/api/initiatives/' + encodeURIComponent(profil.initiative_id) + '/structure', { method: 'PUT', body: {
          type: $('st-type').value || null, forme_juridique: forme,
          taille_entreprise: ent ? $('st-taille').value : '',
          finance_famille: finOn ? $('st-fam').value : '', finance_type: finOn ? $('st-tfin').value : ''
        } });
        toast('Enregistré ✓');
      } catch (e) { msg.style.color = 'var(--danger, #b91c1c)'; msg.textContent = (e.message || 'Enregistrement impossible.') + ' Réessayez.'; }
      btn.disabled = false; btn.textContent = 'Enregistrer';
    };
  }

  window.MMods.structure = function () { ecran(); };
})();

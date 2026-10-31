/* ═════════════════════════════════════════════════════════════════════════════════
   Connexion à plusieurs endroits — fenêtre « Est-ce vous ? » (2026-10-31, demande explicite).
   Voir server/multi-connexion.js : tant que le compte est ouvert sur plusieurs appareils, le titulaire doit confirmer
   chaque heure que c'est bien lui (et non quelqu'un d'autre qui aurait récupéré son compte).
   Chargé à la demande par app.js (chargerMultiConnexionUI) et par m.html ; interroge /api/multi-connexion/etat une fois
   par page, et se déclenche aussi quand une requête d'API est refusée avec multi_connexion:true (fetch enveloppé).
   ═════════════════════════════════════════════════════════════════════════════════ */
(function () {
  if (window.__mcInit) return;
  window.__mcInit = true;

  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let ouvert = false;

  function injecterStyles() {
    if (document.getElementById('mc-style')) return;
    const st = document.createElement('style');
    st.id = 'mc-style';
    st.textContent = `
#mc-voile{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(3,6,14,.88);backdrop-filter:blur(6px);font-family:'Manrope','Segoe UI',system-ui,sans-serif}
#mc-boite{box-sizing:border-box;color-scheme:dark;width:100%;max-width:460px;max-height:calc(100vh - 32px);overflow:auto;background:linear-gradient(160deg,#101a36,#0B1226);color:#E8ECF6;border:1px solid rgba(227,192,110,.35);border-radius:22px;padding:26px 24px;box-shadow:0 30px 70px -30px rgba(0,0,0,.95)}
#mc-boite h2{margin:0 0 8px;font-family:'Bodoni Moda','Didot',Georgia,serif;font-weight:500;font-size:24px;line-height:1.2;color:#fff}
#mc-boite *{box-sizing:border-box}
#mc-boite p{margin:0 0 12px;font-size:14px;line-height:1.55;color:#C5CEE3}
#mc-boite .mc-rappel{font-size:12.5px;color:#AEB8D0;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 12px}
#mc-boite ul{margin:0 0 14px;padding:0;list-style:none;font-size:13px;color:#E8ECF6}
#mc-boite li{padding:7px 10px;margin-bottom:6px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px}
#mc-boite li small{display:block;color:#8F9BB8;font-size:11.5px}
#mc-boite label{display:block;margin:6px 0;font-size:13px;font-weight:700;color:#E6EAF5!important}
#mc-boite #mc-code{width:100%;box-sizing:border-box;height:46px;padding:0 14px;font-size:22px;letter-spacing:.5em;text-align:center;font-variant-numeric:tabular-nums;color:#fff!important;background:rgba(255,255,255,.07)!important;border:1px solid rgba(255,255,255,.25)!important;border-radius:12px;color-scheme:dark}
#mc-boite #mc-code:focus{outline:none;border-color:#E3C06E!important;box-shadow:0 0 0 3px rgba(227,192,110,.22)}
#mc-boite .mc-btns{display:flex;gap:10px;margin-top:16px;flex-wrap:wrap}
#mc-boite button{flex:1 1 150px;height:46px;border-radius:999px;font-size:14px;font-weight:800;cursor:pointer;border:1px solid rgba(227,192,110,.4);background:rgba(255,255,255,.06);color:#F3E3B5}
#mc-boite button.mc-oui{border:none;color:#1a1405;background:linear-gradient(135deg,#F3DC9B 0%,#E3C06E 38%,#B9893A 100%)}
#mc-boite button:disabled{opacity:.55;cursor:default}
#mc-boite button:focus-visible,#mc-boite a:focus-visible{outline:2px solid #fff;outline-offset:2px}
#mc-msg{min-height:20px;margin:10px 0 0;font-size:13px;font-weight:700;color:#FF9C9C}
#mc-msg.ok{color:#7BE87B}
#mc-boite a{color:#E3C06E}
@media (prefers-reduced-motion:reduce){#mc-voile{backdrop-filter:none}}`;
    document.head.appendChild(st);
  }

  async function appel(methode, chemin, corps) {
    const r = await window.__mcFetchOriginal(chemin, {
      method: methode, credentials: 'same-origin',
      headers: corps ? { 'Content-Type': 'application/json' } : undefined,
      body: corps ? JSON.stringify(corps) : undefined,
    });
    let j = {}; try { j = await r.json(); } catch (_) {}
    return { ok: r.ok, statut: r.status, json: j };
  }

  function rappelHoraire() {
    return `<p class="mc-rappel">Si vous êtes connecté à plus d'un endroit, chaque heure il vous sera demandé de reconfirmer qu'il s'agit de vous et que votre compte n'est pas passé entre les mains d'une autre personne.</p>`;
  }

  function afficher(etat) {
    if (ouvert) return;
    ouvert = true;
    injecterStyles();
    const v = document.createElement('div');
    v.id = 'mc-voile';
    v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-labelledby', 'mc-titre');
    const autres = (etat.autres || []).map(a => `<li>${esc(a.appareil)}<small>${esc([a.ville, a.pays].filter(Boolean).join(', ') || 'Lieu inconnu')}${a.vue ? ' · vu le ' + esc(String(a.vue).slice(0, 16).replace('T', ' ')) : ''}</small></li>`).join('');
    v.innerHTML = `<div id="mc-boite">
      <h2 id="mc-titre">Est-ce vous qui êtes connecté à plusieurs endroits ?</h2>
      <p>Votre compte est ouvert sur plusieurs appareils en même temps :</p>
      ${autres ? `<ul>${autres}</ul>` : ''}
      <div id="mc-zone">
        <div class="mc-btns">
          <button type="button" class="mc-oui" id="mc-btn-oui">Oui, c'est moi</button>
          <button type="button" id="mc-btn-non">Non, ce n'est pas moi</button>
        </div>
      </div>
      <p id="mc-msg" role="alert"></p>
      ${rappelHoraire()}
    </div>`;
    document.body.appendChild(v);
    const msg = (t, ok) => { const m = document.getElementById('mc-msg'); m.textContent = t || ''; m.className = ok ? 'ok' : ''; };

    document.getElementById('mc-btn-oui').addEventListener('click', () => {
      const premiere = !etat.code_existe;
      document.getElementById('mc-zone').innerHTML = `
        <label for="mc-code">${premiere ? 'Créez votre code secret multi-connexion (4 chiffres)' : 'Saisissez votre code secret multi-connexion'}</label>
        <input id="mc-code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••">
        ${premiere ? '<p class="mc-rappel" style="margin-top:10px">Ce code vous sera redemandé à chaque confirmation. Vous pourrez le voir et le modifier à tout moment dans Paramètres du compte → Code secret multi-connexion.</p>' : ''}
        <div class="mc-btns"><button type="button" class="mc-oui" id="mc-valider">${premiere ? 'Créer mon code et continuer' : 'Confirmer'}</button></div>`;
      const champ = document.getElementById('mc-code');
      champ.focus();
      champ.addEventListener('input', () => { champ.value = champ.value.replace(/\D/g, '').slice(0, 4); });
      champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('mc-valider').click(); });
      document.getElementById('mc-valider').addEventListener('click', async () => {
        const code = champ.value;
        if (!/^\d{4}$/.test(code)) { msg('Le code doit comporter exactement 4 chiffres.'); return; }
        const b = document.getElementById('mc-valider'); b.disabled = true; msg('');
        try {
          const r = await appel('POST', '/api/multi-connexion/repondre', { reponse: 'oui', code });
          if (r.ok) { msg('Merci, c\'est confirmé. Prochaine confirmation dans 1 heure.', true); setTimeout(() => location.reload(), 900); }
          else { msg(r.json.error || 'Erreur, réessayez.'); b.disabled = false; champ.select(); }
        } catch (e) { msg('Erreur réseau, réessayez.'); b.disabled = false; }
      });
    });

    document.getElementById('mc-btn-non').addEventListener('click', async () => {
      const b = document.getElementById('mc-btn-non'); b.disabled = true; document.getElementById('mc-btn-oui').disabled = true; msg('');
      try {
        const r = await appel('POST', '/api/multi-connexion/repondre', { reponse: 'non' });
        if (r.ok) {
          document.getElementById('mc-zone').innerHTML = `<p>Les autres connexions viennent d'être fermées. Par prudence, <a href="parametres-compte.html">changez votre mot de passe</a>.</p>
            <div class="mc-btns"><button type="button" class="mc-oui" id="mc-fin">Continuer</button></div>`;
          document.getElementById('mc-fin').addEventListener('click', () => location.reload());
        } else { msg(r.json.error || 'Erreur, réessayez.'); b.disabled = false; document.getElementById('mc-btn-oui').disabled = false; }
      } catch (e) { msg('Erreur réseau, réessayez.'); b.disabled = false; document.getElementById('mc-btn-oui').disabled = false; }
    });
  }

  async function verifier() {
    try {
      const r = await appel('GET', '/api/multi-connexion/etat');
      if (r.ok && r.json && r.json.requise) afficher(r.json);
    } catch (_) { /* hors ligne : on réessaiera à la page suivante */ }
  }

  /* Toute requête d'API refusée pour cause de multi-connexion déclenche la fenêtre, quelle que soit la page. */
  window.__mcFetchOriginal = window.fetch.bind(window);
  window.fetch = function () {
    return window.__mcFetchOriginal.apply(window, arguments).then((rep) => {
      try {
        if (rep.status === 403 && !ouvert) {
          rep.clone().json().then((j) => { if (j && j.multi_connexion) verifier(); }).catch(() => {});
        }
      } catch (_) {}
      return rep;
    });
  };

  window.DAMultiConnexion = { verifier };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', verifier); else verifier();
})();

/* ═══════════════════════════════════════════════════════════════════════════
   Connexion sans mot de passe : code provisoire à 4 chiffres envoyé par e-mail (2026-11-04).

   Historique : le 2026-10-05 une fenêtre « Confirmez que c'est bien vous » (DS-ID, code multi-connexion, code e-mail) pouvait s'intercaler après
   un bon mot de passe. Le titulaire du site a tranché : le mot de passe suffit. Cette fenêtre n'existe plus.
     • loginAvecConfirmation(email, mot de passe) : connexion par mot de passe (nom conservé pour les pages qui l'appellent déjà).
     • connexionParCodeEmail(emailInitial) : pour qui n'a pas son mot de passe — la personne saisit l'adresse e-mail DU COMPTE voulu (compte lié
       compris : chaque compte a sa propre adresse), reçoit un code à 4 chiffres (10 minutes, 3 essais) et est connectée à ce compte-là.
       Renvoie la réponse de connexion ({ user }) ; rejette avec une Error portant `annule = true` si la personne ferme la fenêtre.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function styles() {
    if (document.getElementById('ca-style')) return;
    const st = document.createElement('style');
    st.id = 'ca-style';
    st.textContent = `
.ca-overlay{position:fixed;inset:0;background:rgba(13,27,42,.7);z-index:5000;display:flex;align-items:center;justify-content:center;padding:16px;}
.ca-box{background:#fff;color:#111;color-scheme:light;border-radius:16px;width:100%;max-width:440px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.4);max-height:calc(100vh - 32px);overflow:auto;}
.ca-box h3{margin:0 0 6px;font-size:19px;}
.ca-box p{margin:0 0 14px;font-size:13.5px;color:#4b5563;line-height:1.5;}
.ca-box label{display:block;font-size:12.5px;font-weight:700;margin:0 0 6px;color:#111;}
.ca-box input{width:100%;box-sizing:border-box;padding:12px;font-size:16px;border:1.5px solid #d1d5db;border-radius:10px;letter-spacing:.06em;color:#111;background:#fff;}
.ca-box input:focus{outline:none;border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.15);}
.ca-err{color:#b91c1c;font-size:12.5px;font-weight:600;min-height:1.2em;margin:8px 0 0;}
.ca-ok{color:#15803d;font-size:12.5px;font-weight:600;margin:0 0 12px;line-height:1.45;}
.ca-actions{display:flex;gap:10px;margin-top:16px;}
.ca-btn{flex:1;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:14px;cursor:pointer;}
.ca-btn.principal{background:#2563eb;color:#fff;}
.ca-btn.principal:disabled{opacity:.6;cursor:default;}
.ca-btn.secondaire{background:#f3f4f6;color:#374151;}
.ca-lien{background:none;border:none;color:#2563eb;font-size:12.5px;font-weight:700;cursor:pointer;padding:0;margin-top:12px;text-decoration:underline;text-align:left;display:block;}
.ca-lien:disabled{color:#9ca3af;cursor:default;text-decoration:none;}
.ca-aide{font-size:12px;color:#6b7280;background:#f9fafb;border-radius:8px;padding:10px;margin-top:12px;line-height:1.5;}
`;
    document.head.appendChild(st);
  }

  function connexionParCodeEmail(emailInitial) {
    styles();
    return new Promise((resolve, reject) => {
      const ov = document.createElement('div');
      ov.className = 'ca-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-labelledby', 'ca-titre');
      ov.innerHTML = `<div class="ca-box">
        <h3 id="ca-titre">Se connecter avec un code reçu par e-mail</h3>
        <div id="ca-etape1">
          <p>Vous n'avez pas votre mot de passe ? Saisissez l'adresse e-mail de votre compte : nous y envoyons un code provisoire à 4 chiffres qui vous connecte, sans mot de passe.</p>
          <label for="ca-email">Adresse e-mail du compte</label>
          <input id="ca-email" type="email" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="vous@exemple.com" value="${esc(emailInitial || '')}">
          <div class="ca-aide">Vos comptes sont liés (par exemple Initiative et Utilisateur) ? Saisissez l'adresse du compte auquel vous voulez accéder : le code vous ouvre celui-là.</div>
        </div>
        <div id="ca-etape2" style="display:none;">
          <div class="ca-ok" id="ca-info"></div>
          <label for="ca-code">Code à 4 chiffres</label>
          <input id="ca-code" type="text" inputmode="numeric" maxlength="4" autocomplete="one-time-code" placeholder="0000" style="font-size:22px;">
          <button type="button" class="ca-lien" id="ca-renvoyer">Renvoyer le code</button>
          <button type="button" class="ca-lien" id="ca-autre">Changer d'adresse e-mail</button>
        </div>
        <div class="ca-err" id="ca-err" role="alert" aria-live="assertive"></div>
        <div class="ca-actions">
          <button type="button" class="ca-btn secondaire" id="ca-annuler">Annuler</button>
          <button type="button" class="ca-btn principal" id="ca-valider">Envoyer le code</button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      const $ = (id) => ov.querySelector('#' + id);
      let etape = 1, email = '';
      const err = (m) => { $('ca-err').textContent = m || ''; };
      const fermer = () => ov.remove();
      const montrer = (n) => {
        etape = n; err('');
        $('ca-etape1').style.display = n === 1 ? '' : 'none';
        $('ca-etape2').style.display = n === 2 ? '' : 'none';
        const b = $('ca-valider'); b.disabled = false; b.textContent = n === 1 ? 'Envoyer le code' : 'Me connecter';
        $(n === 1 ? 'ca-email' : 'ca-code').focus();
      };

      async function envoyerCode() {
        err('');
        email = $('ca-email').value.trim().toLowerCase();
        if (!email) { err("Saisissez l'adresse e-mail de votre compte."); return; }
        const b = $('ca-valider'), re = $('ca-renvoyer'); b.disabled = true; re.disabled = true; b.textContent = 'Envoi…';
        try {
          const r = await api('POST', '/auth/code-email/demander', { email });
          montrer(2);
          $('ca-info').textContent = (r.message || "Un code à 4 chiffres vient d'être envoyé (valable 10 minutes).") + ' Adresse : ' + email;
          setTimeout(() => { re.disabled = false; }, 30000);
        } catch (e) {
          err(e.message || 'Envoi impossible.');
          b.disabled = false; b.textContent = 'Envoyer le code'; re.disabled = false;
        }
      }

      $('ca-renvoyer').addEventListener('click', envoyerCode);
      $('ca-autre').addEventListener('click', () => montrer(1));
      $('ca-annuler').addEventListener('click', () => { fermer(); const e = new Error('Connexion annulée.'); e.annule = true; reject(e); });
      ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ca-valider').click(); });

      $('ca-valider').addEventListener('click', async () => {
        if (etape === 1) { await envoyerCode(); return; }
        err('');
        const code = $('ca-code').value.trim();
        if (!/^\d{4}$/.test(code)) { err('Saisissez le code à 4 chiffres reçu par e-mail.'); return; }
        const btn = $('ca-valider'); btn.disabled = true; btn.textContent = 'Vérification…';
        try {
          const r = await api('POST', '/auth/code-email/verifier', { email, code });
          fermer(); resolve(r);
        } catch (e) {
          const d = e.data || {};
          err(e.message + (typeof d.essais_restants === 'number' ? ` (${d.essais_restants} essai${d.essais_restants > 1 ? 's' : ''} restant${d.essais_restants > 1 ? 's' : ''})` : ''));
          if (d.bloque || e.status === 429 || e.status === 403) { btn.disabled = true; btn.textContent = 'Demandez un nouveau code'; $('ca-renvoyer').disabled = false; return; }
          btn.disabled = false; btn.textContent = 'Me connecter';
        }
      });
      montrer(1);
    });
  }

  window.connexionParCodeEmail = connexionParCodeEmail;
  window.loginAvecConfirmation = function (email, password) { return api('POST', '/auth/login', { email, password }); };
})();

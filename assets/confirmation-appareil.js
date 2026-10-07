/* ═══════════════════════════════════════════════════════════════════════════
   Confirmation d'un nouvel appareil à la connexion (2026-10-05, étape 2 du chantier sécurité).
   Utilisation : remplacer  api("POST", "/auth/login", { email, password })
                par         loginAvecConfirmation(email, password)
   Si le serveur répond « confirmation_requise » (compte déjà ouvert ailleurs, appareil inconnu), une
   fenêtre demande le Code de Sécurité (DS-ID) du compte — ou d'un compte lié — ou, à défaut, un code
   à 6 chiffres envoyé par e-mail. Une fois l'appareil autorisé, la connexion est rejouée
   automatiquement. Rejette avec une Error si la personne annule.
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
.ca-ok{color:#15803d;font-size:12.5px;font-weight:600;margin:8px 0 0;}
.ca-actions{display:flex;gap:10px;margin-top:16px;}
.ca-btn{flex:1;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:14px;cursor:pointer;}
.ca-btn.principal{background:#2563eb;color:#fff;}
.ca-btn.principal:disabled{opacity:.6;cursor:default;}
.ca-btn.secondaire{background:#f3f4f6;color:#374151;}
.ca-lien{background:none;border:none;color:#2563eb;font-size:12.5px;font-weight:700;cursor:pointer;padding:0;margin-top:12px;text-decoration:underline;text-align:left;}
.ca-lien:disabled{color:#9ca3af;cursor:default;text-decoration:none;}
.ca-aide{font-size:12px;color:#6b7280;background:#f9fafb;border-radius:8px;padding:10px;margin-top:12px;line-height:1.5;}
`;
    document.head.appendChild(st);
  }

  function demanderConfirmation(rep) {
    styles();
    return new Promise((resolve, reject) => {
      const ov = document.createElement('div');
      ov.className = 'ca-overlay';
      ov.setAttribute('role', 'dialog');
      ov.setAttribute('aria-modal', 'true');
      ov.setAttribute('aria-labelledby', 'ca-titre');
      const ouvert = (rep.deja_ouvert_sur || []).map(a => esc(a.libelle) + (a.il_y_a_min != null ? ' (actif ' + (a.il_y_a_min < 2 ? 'à l\'instant' : a.il_y_a_min < 90 ? 'il y a ' + a.il_y_a_min + ' min' : a.il_y_a_min < 2880 ? 'il y a ' + Math.round(a.il_y_a_min / 60) + ' h' : 'il y a plus de 2 jours') + ')' : '')).join(' · ');
      ov.innerHTML = `<div class="ca-box">
        <h3 id="ca-titre">🔐 Confirmez que c'est bien vous</h3>
        <p>Ce compte est déjà utilisé sur un autre appareil du même type (téléphone ou ordinateur). Pour votre sécurité, prouvez que vous en êtes le titulaire : une seule fois, cet appareil sera ensuite reconnu pendant 30 jours.</p>
        ${ouvert ? `<p><strong>Déjà connecté sur :</strong> ${ouvert}</p>` : ''}
        <div id="ca-mode-notif">
          <label for="ca-cn">Code à 3 chiffres affiché sur votre appareil déjà connecté</label>
          <input id="ca-cn" type="text" inputmode="numeric" maxlength="3" autocomplete="one-time-code" placeholder="000" style="font-size:22px;">
          <div class="ca-aide">Ouvrez les <strong>notifications</strong> (la cloche) de ce compte sur l'appareil déjà connecté : un code à 3 chiffres y est affiché, valable 10 minutes. Vous avez 3 essais.</div>
          <button type="button" class="ca-lien" id="ca-n-dsid">Utiliser mon DS-ID à la place</button>
          <button type="button" class="ca-lien" id="ca-n-email" style="display:block;">Recevoir un code par e-mail</button>
        </div>
        <div id="ca-mode-dsid" style="display:none;">
          <label for="ca-dsid">Votre Code de Sécurité (DS-ID)</label>
          <input id="ca-dsid" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="DS-ID de ce compte ou d'un compte lié">
          <div class="ca-aide">Vous le trouvez dans votre profil, section <strong>Confidentialité</strong>, sur l'appareil déjà connecté. Vous pouvez aussi saisir celui d'un de vos comptes liés.</div>
          <button type="button" class="ca-lien" id="ca-vers-email">Je n'ai pas mon DS-ID : m'envoyer un code par e-mail</button>
          <button type="button" class="ca-lien" id="ca-d-notif" style="display:block;">Utiliser le code affiché sur mon appareil connecté</button>
        </div>
        <div id="ca-mode-email" style="display:none;">
          <label for="ca-code">Code à 6 chiffres reçu par e-mail</label>
          <input id="ca-code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000">
          <div class="ca-ok" id="ca-email-info"></div>
          <button type="button" class="ca-lien" id="ca-renvoyer">Renvoyer le code</button>
          <button type="button" class="ca-lien" id="ca-vers-dsid" style="display:block;">Utiliser mon DS-ID à la place</button>
          <button type="button" class="ca-lien" id="ca-e-notif" style="display:block;">Utiliser le code affiché sur mon appareil connecté</button>
        </div>
        <div class="ca-err" id="ca-err" role="alert" aria-live="assertive"></div>
        <div class="ca-actions">
          <button type="button" class="ca-btn secondaire" id="ca-annuler">Annuler</button>
          <button type="button" class="ca-btn principal" id="ca-valider">Confirmer</button>
        </div>
      </div>`;
      document.body.appendChild(ov);
      const $ = (id) => ov.querySelector('#' + id);
      let mode = 'notif';
      const CHAMP = { notif: 'ca-cn', dsid: 'ca-dsid', email: 'ca-code' };
      const err = (m) => { $('ca-err').textContent = m || ''; };
      const fermer = () => ov.remove();
      const basculer = (m) => {
        mode = m; err('');
        $('ca-mode-notif').style.display = m === 'notif' ? '' : 'none';
        $('ca-mode-dsid').style.display = m === 'dsid' ? '' : 'none';
        $('ca-mode-email').style.display = m === 'email' ? '' : 'none';
        $(CHAMP[m]).focus();
      };

      async function envoyerCode() {
        err('');
        const b1 = $('ca-vers-email'), b2 = $('ca-renvoyer');
        b1.disabled = true; b2.disabled = true;
        try {
          const r = await api('POST', '/auth/confirmer-appareil/envoyer-code', { defi: rep.defi });
          basculer('email');
          $('ca-email-info').textContent = 'Un code vient d\'être envoyé à ' + (r.email_masque || rep.email_masque || 'votre adresse e-mail') + ' (valable 10 minutes).';
        } catch (e) { err(e.message || 'Envoi impossible.'); }
        finally { b1.disabled = false; setTimeout(() => { b2.disabled = false; }, 20000); }
      }

      $('ca-vers-email').addEventListener('click', envoyerCode);
      $('ca-n-email').addEventListener('click', envoyerCode);
      $('ca-n-dsid').addEventListener('click', () => basculer('dsid'));
      $('ca-d-notif').addEventListener('click', () => basculer('notif'));
      $('ca-e-notif').addEventListener('click', () => basculer('notif'));
      $('ca-renvoyer').addEventListener('click', envoyerCode);
      $('ca-vers-dsid').addEventListener('click', () => basculer('dsid'));
      $('ca-annuler').addEventListener('click', () => { fermer(); reject(new Error('Connexion annulée.')); });
      ov.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('ca-valider').click(); });

      $('ca-valider').addEventListener('click', async () => {
        err('');
        const saisie = $(CHAMP[mode]).value.trim();
        if (!saisie) { err(mode === 'notif' ? 'Saisissez le code à 3 chiffres affiché sur votre appareil connecté.' : mode === 'dsid' ? 'Saisissez votre Code de Sécurité.' : 'Saisissez le code reçu par e-mail.'); return; }
        const btn = $('ca-valider'); btn.disabled = true; btn.textContent = 'Vérification…';
        try {
          await api('POST', '/auth/confirmer-appareil', mode === 'notif' ? { defi: rep.defi, code_notif: saisie } : mode === 'dsid' ? { defi: rep.defi, ds_id: saisie } : { defi: rep.defi, code: saisie });
          fermer(); resolve();
        } catch (e) {
          const d = e.data || {};
          err(e.message + (typeof d.essais_restants === 'number' ? ` (${d.essais_restants} essai${d.essais_restants > 1 ? 's' : ''} restant${d.essais_restants > 1 ? 's' : ''})` : ''));
          if (d.bloque || e.status === 429 || e.status === 403 || e.status === 410) { btn.disabled = true; btn.textContent = 'Bloqué'; return; }
          btn.disabled = false; btn.textContent = 'Confirmer';
        }
      });
      setTimeout(() => $('ca-cn').focus(), 50);
    });
  }

  window.loginAvecConfirmation = async function (email, password) {
    let r = await api('POST', '/auth/login', { email, password });
    if (r && r.confirmation_requise) {
      await demanderConfirmation(r);
      // L'appareil est désormais reconnu : on rejoue la connexion normale (session, cookies, droits…).
      r = await api('POST', '/auth/login', { email, password });
    }
    return r;
  };
})();

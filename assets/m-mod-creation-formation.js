/* ============================================================
   Diaspo'Actif — Version téléphone : module « Création de formation » (2026-10-31, demande explicite)
   Module Premium du menu, soumis aux mêmes conditions que sur ordinateur (dashboard-initiative.html) :
     - Premium expiré → carte verrouillée (sauf formateur invité par Diaspo'Actif, que le serveur laisse créer sans Premium) ;
     - Premium actif mais compte pas encore autorisé par Diaspo'Actif → demande d'accès « Devenir formateur » ;
     - Premium actif et autorisé → renvoi vers l'espace de création sur ordinateur (l'éditeur de formation reste plus confortable sur grand écran).
   Route :  #/creationformation
   API   :  GET /api/premium/statut · GET /api/formateur/demande · POST /api/formateur/demande
   ============================================================ */
(function () {
  'use strict';
  const A = window.MApp;
  if (!A) return;
  const { S, api, esc, ic, setPane, toast } = A;
  window.MMods = window.MMods || {};
  const TITRE = 'Création de formation';
  const ESPACE_ORDI = 'dashboard-initiative.html?version=ordinateur#formations-gestion';
  let jeton = 0;

  const vide = (titre, msg, extra) => setPane(TITRE, `<div class="empty"><div class="ei">${ic('book', 'l')}</div><b>${esc(titre)}</b>${esc(msg || '')}${extra || ''}</div>`);

  async function ecran() {
    const mon = ++jeton;
    if (!S.me) { setPane(TITRE, A.loginCard('Connectez-vous pour accéder à la création de formation.')); const g = document.getElementById('go-login'); if (g) g.onclick = () => A.openLogin(); return; }
    if (S.me.role !== 'initiative') return vide('Réservé aux comptes Initiative', 'La création de formation est ouverte aux comptes Initiative Premium autorisés par Diaspo’Actif.');
    setPane(TITRE, '<div class="sk" style="height:160px"></div>');

    let etat = null;
    try { etat = await api('/api/formateur/demande'); } catch (e) { if (mon !== jeton) return; return vide('Indisponible', e.message || 'Réessayez dans un instant.'); }
    if (mon !== jeton) return;
    S.formateurInvite = etat.source === 'invite';

    /* Même règle que le tableau de bord : l'abonnement Premium est exigé, sauf pour un formateur invité par Diaspo'Actif. */
    if (!S.premium) { try { S.premium = await api('/api/premium/statut'); } catch (e) { /* statut inconnu : le serveur refusera à la création */ } }
    if (mon !== jeton) return;
    if (A.premiumLocked(2) && !S.formateurInvite) {
      setPane(TITRE, `<div class="card pad" style="text-align:center"><div class="ei" style="width:64px;height:64px;border-radius:50%;background:var(--orange-l);color:var(--orange-d);display:flex;align-items:center;justify-content:center;margin:4px auto 10px">${ic('lock', 'l')}</div>
        <h2 style="margin:0 0 6px;font-size:19px">Module Premium 👑</h2>
        <p class="muted" style="margin:0 0 14px">Le module Création de formation (créer et vendre vos propres formations) est réservé aux comptes Premium, avec l’autorisation de Diaspo’Actif. Votre abonnement est arrivé à expiration : renouvelez-le pour retrouver l’accès.</p>
        <a class="btn block" href="#/abonnement">Voir mon abonnement</a></div>`);
      return;
    }

    if (etat.peut_creer) {
      setPane(TITRE, `<div class="card pad"><b>🎓 Vous pouvez créer des formations</b>
        <p class="small muted" style="margin:6px 0 12px;line-height:1.5">Le contenu, les leçons, les inscriptions et le suivi de vos élèves se gèrent depuis l’espace de création, plus confortable sur grand écran.</p>
        <a class="btn block" href="${ESPACE_ORDI}">Ouvrir l’espace de création ${ic('out', 's')}</a></div>
        <a class="btn out block" style="margin-top:12px" href="#/formations">Voir le catalogue des formations</a>`);
      return;
    }

    const d = etat.demande, attente = d && d.statut === 'en_attente', refusee = d && d.statut === 'refusee';
    setPane(TITRE, `<div class="card pad"><b>🎓 Devenir formateur</b>
      <p class="small muted" style="margin:6px 0 12px;line-height:1.5">Créer des formations demande l’autorisation de Diaspo’Actif. Faites votre demande : l’équipe vous répond dans vos notifications.</p>
      ${attente ? '<div class="badge o">Demande envoyée, en attente de réponse</div>' : ''}
      ${refusee ? '<p class="small" style="margin:0 0 10px">Votre précédente demande n’a pas été retenue. Vous pouvez en faire une nouvelle.</p>' : ''}
      ${attente ? '' : '<button type="button" class="btn block" id="cf-demande">Demander l’accès formateur</button>'}
      <p class="small" id="cf-msg" role="status" style="margin:10px 2px 0"></p></div>`);
    const b = document.getElementById('cf-demande');
    if (b) b.onclick = async () => {
      b.disabled = true; b.textContent = 'Envoi…';
      try { await api('/api/formateur/demande', { method: 'POST', body: {} }); toast('Demande envoyée ✓'); ecran(); }
      catch (e) { b.disabled = false; b.textContent = 'Demander l’accès formateur'; const m = document.getElementById('cf-msg'); if (m) { m.style.color = 'var(--red)'; m.textContent = e.message || 'Envoi impossible. Réessayez.'; } }
    };
  }

  window.MMods.creationformation = function () { ecran(); };
})();

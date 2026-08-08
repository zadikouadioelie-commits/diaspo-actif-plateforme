/* ===========================================================
   PremiumPage — Diaspo'Actif
   Page Premium unique et réutilisable par type de compte.
   Tous les boutons "Voir les abonnements" des modules premium
   redirigent ici (premium.html?type=utilisateur&module=...).
   =========================================================== */
(function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtPrix(montant, devise) {
    const n = Number(montant) || 0;
    return `${n.toFixed(2).replace(/\.00$/, '')} ${devise === 'EUR' || !devise ? '€' : devise}`;
  }

  /* ── Configurations par type de compte (aujourd'hui : utilisateur uniquement) ── */
  const PREMIUM_CONFIGS = {
    utilisateur: {
      accredType: 'utilisateur_abonne',
      titre: "Compte Utilisateur Premium",
      sousTitre: "Un seul abonnement pour accéder à toutes les fonctionnalités Premium de votre compte.",
      texteEngageant: "Investissez dans votre avenir dès aujourd'hui. Développez votre carrière, élargissez votre réseau, valorisez vos compétences et profitez de tous les outils professionnels de Diaspo'Actif grâce à un seul abonnement Premium.",
      retourUrl: 'dashboard-utilisateur.html',
      fonctionnalites: [
        { icon: '💼', titre: 'Carrière', items: ["Recherche d'emploi", "Recherche de stage", "Recherche d'alternance", 'Postuler directement aux offres', 'Suivi des candidatures', 'Sauvegarde des offres', 'Alertes personnalisées'] },
        { icon: '📄', titre: 'CV & Lettres de motivation', items: ['Création de CV professionnel', 'Lettres de motivation', 'Export PDF', 'Candidature en un clic', 'Gestion de plusieurs versions'] },
        { icon: '🤝', titre: 'Réseau Professionnel', items: ['Développer son réseau', 'Rechercher des partenaires', 'Créer des listes professionnelles', 'Échanger avec des professionnels', 'Développer sa visibilité'] },
        { icon: '🚀', titre: 'Business Plan IA', items: ['Création assistée par IA', 'Modification', 'Export PDF', 'Accompagnement intelligent'] },
        { icon: '🎓', titre: 'Formations Premium', items: ['Accès aux formations Premium', 'Suivi de progression', 'Certifications', 'Recommandations personnalisées'] },
        { icon: '🤖', titre: 'Assistant IA OZ', items: ['Conseils personnalisés', 'Recommandations intelligentes', 'Assistance quotidienne', 'Automatisation de certaines tâches'] },
      ],
      pourquoi: [
        { icon: '📈', titre: 'Développez votre carrière' },
        { icon: '🤝', titre: 'Développez votre réseau' },
        { icon: '🚀', titre: 'Donnez vie à vos projets' },
        { icon: '🎯', titre: "Accédez aux meilleurs outils de Diaspo'Actif" },
      ],
      comparatif: [
        { label: "Recherche d'emploi & Stage", gratuit: false, premium: true },
        { label: 'CV & Lettres de motivation', gratuit: false, premium: true },
        { label: 'Réseau Professionnel', gratuit: false, premium: true },
        { label: 'Business Plan IA', gratuit: false, premium: true },
        { label: 'Formations Premium & Certifications', gratuit: false, premium: true },
        { label: 'Assistant IA OZ avancé', gratuit: false, premium: true },
        { label: 'Profil public', gratuit: true, premium: true },
        { label: 'Messagerie', gratuit: true, premium: true },
        { label: 'Visioconférence', gratuit: true, premium: true },
        { label: 'Mes Billets', gratuit: true, premium: true },
        { label: 'Annuaire', gratuit: true, premium: true },
        { label: 'Synchronisation réseaux sociaux', gratuit: true, premium: true },
        { label: 'Centre des tutos', gratuit: true, premium: true },
        { label: 'Agenda synchronisé', gratuit: true, premium: true },
      ],
      banniereTitre: "🚀 Rejoignez les membres Premium de Diaspo'Actif",
      banniereTexte: "Donnez un nouvel élan à votre parcours professionnel. Débloquez tous les outils Premium, développez votre réseau, trouvez plus facilement un emploi, valorisez vos compétences et profitez pleinement de tout le potentiel de Diaspo'Actif. Votre avenir commence aujourd'hui.",
    },
    initiative: {
      accredType: 'initiative_abonne',
      titre: "Compte Initiative Premium",
      sousTitre: "Un seul abonnement pour accéder à toutes les fonctionnalités Premium de votre initiative.",
      texteEngageant: "Donnez à votre initiative les moyens de ses ambitions. Développez votre visibilité, votre réseau de partenaires et professionnalisez votre gestion grâce à un seul abonnement Premium.",
      retourUrl: 'dashboard-initiative.html',
      fonctionnalites: [
        { icon: '🏬', titre: 'Vitrine & Visibilité', items: ['Vitrine publique personnalisée', 'Publications mises en avant', 'Statistiques de visibilité', 'Thèmes premium'] },
        { icon: '🎫', titre: 'Cotisations & Adhésions', items: ['Formules d’adhésion illimitées', 'Encaissement des cotisations', 'Registre des membres', 'Relances automatiques'] },
        { icon: '🗳️', titre: 'Votes sécurisés', items: ['Organisation de scrutins', 'Assemblées générales', 'Émargement QR code', 'Comptes rendus automatiques'] },
        { icon: '💼', titre: 'Recrutement', items: ['Publication d’offres illimitée', 'Suivi des candidatures', 'Mise en avant des offres'] },
        { icon: '🤝', titre: 'Partenaires & Réseau', items: ['Liste de partenaires', 'Mise en relation', 'Développement de la visibilité'] },
        { icon: '🤖', titre: 'Assistant IA OZ', items: ['Conseils personnalisés', 'Analyse de votre activité', 'Automatisation de certaines tâches'] },
      ],
      pourquoi: [
        { icon: '📈', titre: 'Développez votre visibilité' },
        { icon: '🤝', titre: 'Développez votre réseau' },
        { icon: '💰', titre: 'Professionnalisez votre gestion' },
        { icon: '🎯', titre: "Accédez aux meilleurs outils de Diaspo'Actif" },
      ],
      comparatif: [
        { label: 'Vitrine premium', gratuit: false, premium: true },
        { label: 'Cotisations & Adhésions', gratuit: false, premium: true },
        { label: 'Votes sécurisés', gratuit: false, premium: true },
        { label: 'Recrutement illimité', gratuit: false, premium: true },
        { label: 'Partenaires & Réseau', gratuit: false, premium: true },
        { label: 'Assistant IA OZ avancé', gratuit: false, premium: true },
        { label: 'Profil public', gratuit: true, premium: true },
        { label: 'Messagerie', gratuit: true, premium: true },
        { label: 'Visioconférence', gratuit: true, premium: true },
        { label: 'Annuaire', gratuit: true, premium: true },
        { label: 'Centre des tutos', gratuit: true, premium: true },
        { label: 'Agenda synchronisé', gratuit: true, premium: true },
      ],
      banniereTitre: "🚀 Rejoignez les initiatives Premium de Diaspo'Actif",
      banniereTexte: "Donnez un nouvel élan à votre initiative. Débloquez tous les outils Premium, développez votre réseau de partenaires, professionnalisez votre gestion et gagnez en visibilité. Votre développement commence aujourd'hui.",
    },
  };

  async function fetchFormules(accredType) {
    try {
      const [meRes, catRes] = await Promise.all([
        fetch('/api/auth/me', { credentials: 'same-origin' }),
        fetch('/api/accreditations/catalogue', { credentials: 'same-origin' }),
      ]);
      const me = meRes.ok ? (await meRes.json()).user : null;
      const data = await catRes.json();
      const def = (data.catalogue || []).find(d => d.type === accredType);
      if (!def) return { tarifs: [] };
      const role = (me && me.role) || 'utilisateur';
      const tarifRow = (def.tarifs || []).find(t => t.role === role);
      if (!tarifRow) return { tarifs: [] };
      const reduc = Number(tarifRow.reduction_annuelle_pct) || 0;
      const devise = tarifRow.devise || 'EUR';

      /* Préférer le tarif déjà calculé côté serveur (catégorie, palier de taille, promotion,
         tarif personnalisé, avantage d'adhésion D'A) — jamais le recalcul brut ci-dessous, qui
         ignorait jusqu'ici toute réduction et affichait donc un prix parfois faux à l'écran.
         Repli sur le recalcul brut uniquement quand absent (visiteur non connecté : la route
         catalogue ne renvoie tarif_calcule que pour un utilisateur authentifié). */
      const tc = def.tarif_calcule;
      if (tc) {
        return {
          tarifs: [
            { type_tarif: 'mensuel', montant: tc.montant_mensuel, devise: tc.devise || devise },
            { type_tarif: 'annuel', montant: tc.montant_annuel, devise: tc.devise || devise },
          ],
          reduc,
        };
      }

      let mensuel, annuel;
      if (tarifRow.type_tarif === 'mensuel') {
        mensuel = Number(tarifRow.montant);
        annuel = Math.round(mensuel * 12 * (1 - reduc / 100) * 100) / 100;
      } else {
        annuel = Number(tarifRow.montant);
        mensuel = Math.round((annuel * (1 - reduc / 100) / 12) * 100) / 100;
      }
      return { tarifs: [{ type_tarif: 'mensuel', montant: mensuel, devise }, { type_tarif: 'annuel', montant: annuel, devise }], reduc };
    } catch (e) { return { tarifs: [] }; }
  }

  async function souscrire(accredType, typeTarif, btn, codeDA) {
    if (btn) { btn.disabled = true; btn.textContent = 'Redirection…'; }
    try {
      const r = await fetch('/api/accreditations/' + accredType + '/payer', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        // code_da n'est qu'une indication : le serveur recalcule et revalide systématiquement,
        // jamais confiance dans un prix envoyé par le client.
        body: JSON.stringify({ type_tarif: typeTarif, code_da: codeDA || undefined }),
      }).then(async res => {
        const d = await res.json();
        if (!res.ok) throw Object.assign(new Error(d.error || 'Erreur'), { data: d });
        return d;
      });
      if (r.checkout_url) window.location.href = r.checkout_url;
    } catch (e) {
      alert((e.data && e.data.error) || e.message || 'Impossible de démarrer le paiement.');
      if (btn) { btn.disabled = false; btn.textContent = btn.dataset.origLabel || 'Choisir cette formule'; }
    }
  }

  window.PremiumPage = async function (container, { type = 'utilisateur', moduleOrigine = '' } = {}) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    const cfg = PREMIUM_CONFIGS[type] || PREMIUM_CONFIGS.utilisateur;

    el.innerHTML = `<div style="text-align:center;padding:80px 20px;color:var(--muted);">Chargement…</div>`;
    const { tarifs, reduc } = await fetchFormules(cfg.accredType);
    const mensuel = tarifs.find(t => t.type_tarif === 'mensuel');
    const annuel = tarifs.find(t => t.type_tarif === 'annuel');

    const contexteHtml = moduleOrigine ? `
      <div class="prm-contexte">
        <p>Vous souhaitiez accéder au module « <strong>${esc(moduleOrigine)}</strong> ».</p>
        <p>Le module que vous souhaitez utiliser est inclus dans l'abonnement Premium du ${esc(cfg.titre)}. En vous abonnant, vous débloquez également toutes les autres fonctionnalités Premium réservées à votre compte.</p>
      </div>` : '';

    const foncHtml = cfg.fonctionnalites.map(f => `
      <div class="prm-fonc-card">
        <div class="prm-fonc-icon">${f.icon}</div>
        <h3>${esc(f.titre)}</h3>
        <ul>${f.items.map(i => `<li>✔ ${esc(i)}</li>`).join('')}</ul>
      </div>`).join('');

    const pourquoiHtml = cfg.pourquoi.map(p => `
      <div class="prm-pourquoi-card">
        <div class="prm-pourquoi-icon">${p.icon}</div>
        <div class="prm-pourquoi-titre">${esc(p.titre)}</div>
      </div>`).join('');

    const comparatifHtml = `
      <table class="prm-comparatif">
        <thead><tr><th>Fonctionnalité</th><th>Gratuit</th><th>Premium</th></tr></thead>
        <tbody>
          ${cfg.comparatif.map(r => `
            <tr><td>${esc(r.label)}</td><td>${r.gratuit ? '✔' : '—'}</td><td class="prm-yes">✔</td></tr>`).join('')}
        </tbody>
      </table>`;

    el.innerHTML = `
      <div class="prm-wrap">
        <button class="btn btn-outline prm-retour-top" id="prm-btn-retour-top">← Retour</button>

        ${contexteHtml}

        <div class="prm-hero">
          <div class="prm-hero-crown">👑</div>
          <h1>${esc(cfg.titre)}</h1>
          <p class="prm-hero-sub">${esc(cfg.sousTitre)}</p>
          <p class="prm-hero-texte">${esc(cfg.texteEngageant)}</p>
        </div>

        <section class="prm-section">
          <h2 class="prm-section-title">Les fonctionnalités incluses</h2>
          <div class="prm-fonc-grid">${foncHtml}</div>
        </section>

        <section class="prm-section prm-section-alt">
          <h2 class="prm-section-title">Pourquoi devenir Premium ?</h2>
          <div class="prm-pourquoi-grid">${pourquoiHtml}</div>
        </section>

        <section class="prm-section">
          <h2 class="prm-section-title">Comparatif</h2>
          <div class="prm-comparatif-wrap">${comparatifHtml}</div>
        </section>

        <section class="prm-section prm-section-alt">
          <h2 class="prm-section-title">Tarifs</h2>

          <div class="prm-code-da">
            <label for="prm-code-da">Vous êtes adhérent officiel Diaspo'Actif ? Entrez votre code adhérent D'A pour bénéficier de votre réduction Premium.</label>
            <div class="prm-code-da-row">
              <input id="prm-code-da" maxlength="4" placeholder="A472" autocapitalize="characters" autocomplete="off">
              <button type="button" class="btn btn-outline" id="prm-code-da-btn">Vérifier mon code</button>
            </div>
            <div id="prm-code-da-msg"></div>
          </div>

          <div class="prm-tarifs-grid">
            <div class="prm-tarif-card">
              <div class="prm-tarif-icon">💳</div>
              <div class="prm-tarif-nom">Abonnement Mensuel</div>
              <div class="prm-tarif-prix" id="prm-prix-mensuel">${mensuel ? fmtPrix(mensuel.montant, mensuel.devise) : '—'}<span> / mois</span></div>
              <div class="prm-tarif-desc">Accès immédiat à toutes les fonctionnalités Premium du ${esc(cfg.titre)}.</div>
              <button class="btn prm-btn-gold" data-tarif="mensuel">Passer au Premium</button>
            </div>
            <div class="prm-tarif-card prm-tarif-reco">
              <div class="prm-tarif-badge">⭐ Le meilleur choix</div>
              <div class="prm-tarif-icon">⭐</div>
              <div class="prm-tarif-nom">Abonnement Annuel</div>
              <div class="prm-tarif-prix" id="prm-prix-annuel">${annuel ? fmtPrix(annuel.montant, annuel.devise) : '—'}<span> / an</span></div>
              <div class="prm-tarif-desc">🎁 Économisez ${reduc ? Math.round(reduc) : 15}&nbsp;% par rapport au paiement mensuel.</div>
              <button class="btn prm-btn-gold" data-tarif="annuel">Choisir l'offre annuelle</button>
            </div>
          </div>
        </section>

        <section class="prm-banniere">
          <h2>${esc(cfg.banniereTitre)}</h2>
          <p>${esc(cfg.banniereTexte)}</p>
          <div class="prm-banniere-ctas">
            <button class="btn prm-btn-navy" data-tarif="mensuel" id="prm-banniere-btn-mensuel">🟦 Devenir Premium – ${mensuel ? fmtPrix(mensuel.montant, mensuel.devise) : '—'}/mois</button>
            <button class="btn prm-btn-gold" data-tarif="annuel" id="prm-banniere-btn-annuel">⭐ Devenir Premium – ${annuel ? fmtPrix(annuel.montant, annuel.devise) : '—'}/an (Économisez ${reduc ? Math.round(reduc) : 15}%)</button>
            <button class="btn btn-outline" id="prm-btn-retour-bottom" style="background:#fff;">⬅️ Retour à la plateforme</button>
          </div>
        </section>
      </div>
    `;

    function goRetour() {
      if (window.history.length > 1) window.history.back();
      else window.location.href = cfg.retourUrl;
    }
    el.querySelector('#prm-btn-retour-top').addEventListener('click', goRetour);
    el.querySelector('#prm-btn-retour-bottom').addEventListener('click', goRetour);

    /* Code Adhésion D'A — lu depuis cette variable de fermeture par TOUS les boutons de
       paiement, y compris la seconde paire dupliquée de la bannière basse (un seul
       gestionnaire délégué wire les deux paires via [data-tarif]) : jamais depuis un
       attribut par bouton, sinon la bannière facturerait le plein tarif en silence. */
    let codeDAApplique = null;
    el.querySelectorAll('[data-tarif]').forEach(btn => {
      btn.dataset.origLabel = btn.textContent;
      btn.addEventListener('click', () => souscrire(cfg.accredType, btn.dataset.tarif, btn, codeDAApplique));
    });

    const codeDaBtn = el.querySelector('#prm-code-da-btn');
    const codeDaInput = el.querySelector('#prm-code-da');
    const codeDaMsg = el.querySelector('#prm-code-da-msg');
    const MESSAGES_CODE_DA = {
      inconnu: "Ce code n'existe pas.",
      suspendu: 'Ce code est actuellement suspendu.',
      expire: 'Ce code a expiré.',
      epuise: 'Ce code a déjà été utilisé par le nombre maximum de comptes autorisés.',
      adhesion_non_a_jour: "L'adhésion associée à ce code n'est plus à jour.",
      auto_utilisation_non_autorisee: 'Ce code ne peut pas être utilisé sur le compte qui l\'a reçu.',
      compte_non_identifiable: 'Impossible d\'identifier votre compte pour appliquer ce code.',
    };
    if (codeDaBtn && codeDaInput) {
      codeDaBtn.addEventListener('click', async () => {
        const code = (codeDaInput.value || '').trim().toUpperCase();
        if (!code) return;
        codeDaBtn.disabled = true; codeDaBtn.textContent = 'Vérification…';
        codeDaMsg.className = ''; codeDaMsg.textContent = '';
        try {
          const r = await fetch('/api/premium/code-adhesion/verifier', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, accred_type: cfg.accredType }),
          }).then(res => res.json());

          if (!r.valide) {
            codeDaMsg.className = 'prm-code-da-msg prm-code-da-err';
            codeDaMsg.textContent = '❌ ' + (MESSAGES_CODE_DA[r.raison] || "Ce code n'est pas valide.");
            codeDAApplique = null;
            codeDaBtn.disabled = false; codeDaBtn.textContent = 'Vérifier mon code';
            return;
          }

          codeDAApplique = code;
          const deviseAffichage = (mensuel && mensuel.devise) || (annuel && annuel.devise) || 'EUR';
          const prixMensuelEl = el.querySelector('#prm-prix-mensuel');
          const prixAnnuelEl = el.querySelector('#prm-prix-annuel');
          if (prixMensuelEl) prixMensuelEl.innerHTML = `${fmtPrix(r.montant_mensuel, deviseAffichage)}<span> / mois</span>`;
          if (prixAnnuelEl) prixAnnuelEl.innerHTML = `${fmtPrix(r.montant_annuel, deviseAffichage)}<span> / an</span>`;
          const btnMensuel = el.querySelector('#prm-banniere-btn-mensuel');
          const btnAnnuel = el.querySelector('#prm-banniere-btn-annuel');
          if (btnMensuel) btnMensuel.textContent = `🟦 Devenir Premium – ${fmtPrix(r.montant_mensuel, deviseAffichage)}/mois`;
          if (btnAnnuel) btnAnnuel.textContent = `⭐ Devenir Premium – ${fmtPrix(r.montant_annuel, deviseAffichage)}/an`;

          const dateFinTxt = r.date_fin_prevue ? new Date(r.date_fin_prevue.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR') : null;
          codeDaMsg.className = 'prm-code-da-msg prm-code-da-ok';
          codeDaMsg.innerHTML = `✅ Code adhérent D'A validé<br>Vous bénéficiez de ${r.reduction_pct}% de réduction Premium. ` +
            (r.premiere_utilisation
              ? `Cet avantage est valable jusqu'au ${dateFinTxt}.`
              : `Cet avantage sera valable ${r.duree_mois} mois à compter de son activation.`);
          codeDaBtn.disabled = false; codeDaBtn.textContent = '✅ Code appliqué';
          codeDaInput.disabled = true;
        } catch (e) {
          codeDaMsg.className = 'prm-code-da-msg prm-code-da-err';
          codeDaMsg.textContent = '❌ Impossible de vérifier ce code pour le moment.';
          codeDaBtn.disabled = false; codeDaBtn.textContent = 'Vérifier mon code';
        }
      });
    }
  };
})();

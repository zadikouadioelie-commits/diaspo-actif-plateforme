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

  async function souscrire(accredType, typeTarif, btn, codeDA, parrainageDsId) {
    if (btn) { btn.disabled = true; btn.textContent = 'Redirection…'; }
    try {
      const r = await fetch('/api/accreditations/' + accredType + '/payer', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        // code_da / parrainage_ds_id ne sont que des indications : le serveur recalcule et
        // revalide systématiquement, jamais confiance dans un prix envoyé par le client.
        body: JSON.stringify({ type_tarif: typeTarif, code_da: codeDA || undefined, parrainage_ds_id: parrainageDsId || undefined }),
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

    /* ── Écran préalable « Avez-vous déjà un compte ? » ──
       Parrainage Initiative -50% : réservé aux comptes du MÊME propriétaire (système
       « comptes liés » déjà existant) — la vérification d'éligibilité compare le groupe du
       compte de référence à celui de l'appelant, donc exige d'être connecté AVANT de saisir
       un DS-ID. "Non" (ou visiteur non connecté qui renonce) → comportement actuel
       inchangé, aucun bloc de parrainage n'est même affiché.
       Réservé aux visiteurs PAS ENCORE connectés : la question « avez-vous déjà un compte » n'a
       aucun sens pour quelqu'un déjà authentifié (il en a évidemment un, il l'utilise). Un
       utilisateur connecté passe directement aux tarifs — signalé le 2026-08-17. */
    let _mePremium = null;
    try { _mePremium = (await fetch('/api/auth/me', { credentials: 'same-origin' }).then(r => r.json())).user; } catch (e) {}
    if (_mePremium) renderTarifs(false); else renderGate();

    function renderGate() {
      el.innerHTML = `
        <div class="prm-wrap prm-gate">
          <div class="prm-gate-card">
            <div class="prm-hero-crown">👑</div>
            <h1>Avez-vous déjà un compte Diaspo'Actif ?</h1>
            <p class="prm-hero-sub">Si un de vos autres comptes est déjà Initiative Premium (payé au tarif plein), il peut vous faire bénéficier de -50% sur cet abonnement.</p>
            <div class="prm-gate-ctas">
              <button class="btn btn-outline" id="prm-gate-non">Non, je n'ai pas encore de compte</button>
              <button class="btn prm-btn-gold" id="prm-gate-oui">Oui, j'ai déjà un compte</button>
            </div>
          </div>
        </div>`;
      el.querySelector('#prm-gate-non').addEventListener('click', () => renderTarifs(false));
      el.querySelector('#prm-gate-oui').addEventListener('click', handleGateOui);
    }

    async function handleGateOui() {
      el.innerHTML = `<div style="text-align:center;padding:80px 20px;color:var(--muted);">Vérification…</div>`;
      let me = null;
      try { me = (await fetch('/api/auth/me', { credentials: 'same-origin' }).then(r => r.json())).user; } catch (e) {}
      if (!me) {
        el.innerHTML = `
          <div class="prm-wrap prm-gate">
            <div class="prm-gate-card">
              <div class="prm-hero-crown">🔐</div>
              <h1>Connectez-vous d'abord</h1>
              <p class="prm-hero-sub">Pour identifier un compte de référence, vous devez être connecté au compte qui va souscrire au Premium — la vérification compare vos comptes liés.</p>
              <div class="prm-gate-ctas">
                <a class="btn btn-outline" href="login.html?retour=${encodeURIComponent(location.pathname + location.search)}">Se connecter</a>
                <a class="btn prm-btn-gold" href="inscription.html">Créer un compte</a>
              </div>
              <p style="margin-top:14px"><a href="#" id="prm-gate-retour-non" style="font-size:13px;">← Continuer sans compte de référence</a></p>
            </div>
          </div>`;
        el.querySelector('#prm-gate-retour-non').addEventListener('click', e => { e.preventDefault(); renderTarifs(false); });
        return;
      }
      renderInfoObligatoire();
    }

    function renderInfoObligatoire() {
      el.innerHTML = `
        <div class="prm-wrap prm-gate">
          <div class="prm-gate-card">
            <div class="prm-hero-crown">ℹ️</div>
            <h1>Information importante</h1>
            <div class="prm-gate-info">
              <p>Cet avantage est exclusivement lié au compte Initiative Premium que vous allez identifier.</p>
              <p>La réduction de 50&nbsp;% est valable uniquement pendant la durée restante de son abonnement Premium au moment de l'activation de votre avantage.</p>
              <p>Un compte ayant lui-même bénéficié de cette réduction de 50&nbsp;% ne peut pas être utilisé pour obtenir la même réduction sur un autre compte.</p>
              <p>Le compte de référence doit appartenir au même propriétaire que le vôtre (comptes liés) et avoir payé son Premium au tarif plein, à 100&nbsp;%.</p>
              <p>La réduction est plafonnée à 50&nbsp;% et ne peut jamais être cumulée avec une autre réduction permettant de descendre sous 50&nbsp;% du tarif normal.</p>
            </div>
            <div class="prm-gate-ctas">
              <button class="btn prm-btn-gold" id="prm-gate-continuer">J'ai compris et je souhaite continuer</button>
            </div>
          </div>
        </div>`;
      el.querySelector('#prm-gate-continuer').addEventListener('click', () => renderTarifs(true));
    }

    async function renderTarifs(avecParrainage) {
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

          ${avecParrainage ? `
          <div class="prm-code-da prm-parrainage">
            <label for="prm-parrainage-dsid">Compte de référence identifié : entrez son Code de Sécurité Diaspo'Actif (DS-ID) pour appliquer -50% sur votre abonnement annuel.</label>
            <div class="prm-code-da-row">
              <input id="prm-parrainage-dsid" maxlength="10" placeholder="Code à 10 caractères" autocapitalize="characters" autocomplete="off">
              <button type="button" class="btn btn-outline" id="prm-parrainage-btn">Vérifier ce compte</button>
            </div>
            <div id="prm-parrainage-msg"></div>
            <p class="prm-parrainage-note">Cette réduction ne s'applique qu'à l'abonnement <strong>annuel</strong>.</p>
          </div>` : ''}

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

    /* Code Adhésion D'A / DS-ID de Parrainage — lus depuis ces DEUX variables de fermeture
       par TOUS les boutons de paiement, y compris la seconde paire dupliquée de la bannière
       basse (un seul gestionnaire délégué wire les deux paires via [data-tarif]) : jamais
       depuis un attribut par bouton, sinon la bannière facturerait le plein tarif en
       silence. Un seul avantage peut s'appliquer à la fois (non-cumul, cf. serveur) : dès
       que l'un des deux est validé, l'autre champ est désactivé côté UI pour éviter toute
       confusion sur le prix réellement affiché. */
    let codeDAApplique = null;
    let parrainageDsIdApplique = null;
    el.querySelectorAll('[data-tarif]').forEach(btn => {
      btn.dataset.origLabel = btn.textContent;
      btn.addEventListener('click', () => souscrire(cfg.accredType, btn.dataset.tarif, btn, codeDAApplique, parrainageDsIdApplique));
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
          // Non-cumul : un code D'A validé désactive le champ de parrainage, pour ne jamais
          // laisser croire à l'écran qu'un second avantage pourrait s'ajouter au premier.
          const parrainageInputApresDA = el.querySelector('#prm-parrainage-dsid');
          const parrainageBtnApresDA = el.querySelector('#prm-parrainage-btn');
          if (parrainageInputApresDA) parrainageInputApresDA.disabled = true;
          if (parrainageBtnApresDA) parrainageBtnApresDA.disabled = true;
        } catch (e) {
          codeDaMsg.className = 'prm-code-da-msg prm-code-da-err';
          codeDaMsg.textContent = '❌ Impossible de vérifier ce code pour le moment.';
          codeDaBtn.disabled = false; codeDaBtn.textContent = 'Vérifier mon code';
        }
      });
    }

    /* ── Parrainage Initiative -50% : vérification du DS-ID de référence ── */
    const parrainageBtn = el.querySelector('#prm-parrainage-btn');
    const parrainageInput = el.querySelector('#prm-parrainage-dsid');
    const parrainageMsg = el.querySelector('#prm-parrainage-msg');
    const MESSAGES_PARRAINAGE = {
      format_invalide: 'Le Code de Sécurité comporte 10 caractères.',
      offre_indisponible: "Aucune offre Premium n'est disponible pour votre type de compte.",
      ds_id_introuvable: "Ce Code de Sécurité ne correspond à aucun compte.",
      compte_actuel: "Vous ne pouvez pas utiliser le Code de Sécurité de votre propre compte.",
      role_non_eligible: "Seul un compte Initiative peut servir de compte de référence.",
      comptes_non_lies: "Ce compte n'est pas rattaché au vôtre (comptes liés). Seul un compte que vous possédez déjà peut servir de référence.",
      reference_non_active: "Ce compte n'a pas de Premium Initiative actif.",
      reference_deja_reduite: "Ce compte a lui-même bénéficié d'une réduction : il ne peut pas transmettre l'avantage à un autre compte.",
      duree_indeterminee: "Impossible de déterminer la durée restante de ce Premium pour le moment.",
      verification_indisponible: "Vérification momentanément indisponible. Réessayez dans un instant.",
      compte_non_identifiable: "Impossible d'identifier votre compte pour appliquer cet avantage.",
    };
    if (parrainageBtn && parrainageInput) {
      parrainageBtn.addEventListener('click', async () => {
        const dsId = (parrainageInput.value || '').trim().toUpperCase();
        if (!dsId) return;
        parrainageBtn.disabled = true; parrainageBtn.textContent = 'Vérification…';
        parrainageMsg.className = ''; parrainageMsg.textContent = '';
        try {
          const r = await fetch('/api/premium/parrainage/verifier', {
            method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ds_id: dsId }),
          }).then(res => res.json());

          if (!r.valide) {
            parrainageMsg.className = 'prm-code-da-msg prm-code-da-err';
            parrainageMsg.textContent = '❌ ' + (MESSAGES_PARRAINAGE[r.raison] || "Ce compte n'est pas éligible comme référence.");
            parrainageDsIdApplique = null;
            parrainageBtn.disabled = false; parrainageBtn.textContent = 'Vérifier ce compte';
            return;
          }

          parrainageDsIdApplique = dsId;
          const deviseAffichage = r.devise || (annuel && annuel.devise) || 'EUR';
          const prixAnnuelEl = el.querySelector('#prm-prix-annuel');
          if (prixAnnuelEl) prixAnnuelEl.innerHTML = `${fmtPrix(r.montant_annuel, deviseAffichage)}<span> / an</span>`;
          const btnAnnuel = el.querySelector('#prm-banniere-btn-annuel');
          if (btnAnnuel) btnAnnuel.textContent = `⭐ Devenir Premium – ${fmtPrix(r.montant_annuel, deviseAffichage)}/an`;

          const dureeMoisTxt = Math.max(1, Math.round(r.duree_jours / 30));
          parrainageMsg.className = 'prm-code-da-msg prm-code-da-ok';
          parrainageMsg.innerHTML = `✅ Avantage Premium Initiative activé<br>Vous bénéficiez de ${r.reduction_pct}% de réduction sur l'abonnement annuel, pendant environ ${dureeMoisTxt} mois (durée restante du Premium du compte de référence).`;
          parrainageBtn.disabled = false; parrainageBtn.textContent = '✅ Compte appliqué';
          parrainageInput.disabled = true;
          // Non-cumul : symétrique au cas D'A ci-dessus.
          if (codeDaInput) codeDaInput.disabled = true;
          if (codeDaBtn) codeDaBtn.disabled = true;
        } catch (e) {
          parrainageMsg.className = 'prm-code-da-msg prm-code-da-err';
          parrainageMsg.textContent = '❌ Impossible de vérifier ce compte pour le moment.';
          parrainageBtn.disabled = false; parrainageBtn.textContent = 'Vérifier ce compte';
        }
      });
    }
    }
  };
})();

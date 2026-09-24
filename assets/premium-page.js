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
        { icon: '🏬', titre: 'Boutique & Visibilité', items: ['Boutique publique personnalisée', 'Publications mises en avant', 'Statistiques de visibilité', 'Thèmes premium'] },
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
        { label: 'Boutique premium', gratuit: false, premium: true },
        { label: 'Cotisations & Adhésions', gratuit: false, premium: true },
        { label: 'Votes sécurisés', gratuit: false, premium: true },
        { label: 'Recrutement illimité', gratuit: false, premium: true },
        { label: 'Partenaires & Réseau', gratuit: false, premium: true },
        { label: 'Assistant IA OZ avancé', gratuit: false, premium: true },
        { label: 'Profil public', gratuit: true, premium: true },
        { label: 'Messagerie', gratuit: true, premium: true },
        { label: 'Annuaire', gratuit: true, premium: true },
        { label: 'Centre des tutos', gratuit: true, premium: true },
        { label: 'Agenda synchronisé', gratuit: true, premium: true },
      ],
      banniereTitre: "🚀 Rejoignez les initiatives Premium de Diaspo'Actif",
      banniereTexte: "Donnez un nouvel élan à votre initiative. Débloquez tous les outils Premium, développez votre réseau de partenaires, professionnalisez votre gestion et gagnez en visibilité. Votre développement commence aujourd'hui.",
    },
  };

  async function fetchFormules(accredType, pageRole) {
    try {
      /* forcer_type (2026-09-23, bug signalé par capture d'écran : prix affichés en tirets) —
         le rôle utilisé pour trouver le tarif est celui DE LA PAGE (pageRole, dérivé de
         ?type=... — "utilisateur" ou "initiative"), jamais celui de la session active : un
         compte Initiative consultant premium.html?type=utilisateur (ex. pour son compte
         personnel lié, système "comptes liés") a le rôle "initiative", absent des tarifs de
         l'accréditation "utilisateur_abonne" — l'ancien code cherchait le tarif de SON rôle au
         lieu de celui du type demandé, ne le trouvait jamais, et affichait un prix vide. Le
         serveur doit aussi recevoir forcer_type, sinon son propre filtre d'éligibilité par rôle
         retire carrément la définition de la réponse avant même d'arriver ici. */
      const [meRes, catRes] = await Promise.all([
        fetch('/api/auth/me', { credentials: 'same-origin' }),
        fetch('/api/accreditations/catalogue?forcer_type=' + encodeURIComponent(accredType), { credentials: 'same-origin' }),
      ]);
      const me = meRes.ok ? (await meRes.json()).user : null;
      const data = await catRes.json();
      const def = (data.catalogue || []).find(d => d.type === accredType);
      if (!def) return { tarifs: [] };
      const role = pageRole || (me && me.role) || 'utilisateur';
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

  async function souscrire(accredType, typeTarif, btn, parrainageDsId) {
    if (btn) { btn.disabled = true; btn.textContent = 'Redirection…'; }
    try {
      const r = await fetch('/api/accreditations/' + accredType + '/payer', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        // parrainage_ds_id n'est qu'une indication : le serveur recalcule et revalide
        // systématiquement, jamais confiance dans un prix envoyé par le client.
        body: JSON.stringify({ type_tarif: typeTarif, parrainage_ds_id: parrainageDsId || undefined }),
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
    let cfg = PREMIUM_CONFIGS[type] || PREMIUM_CONFIGS.utilisateur;

    /* Simulateur "Compte Utilisateur / Compte Initiative" (2026-09-24, demande explicite : "pour
       avoir les prix adaptés aux besoins du client") — bascule sur place, sans repasser par
       l'écran « avez-vous déjà un compte ? » ni recharger la page, pour comparer les deux
       tarifications en un clic. `type`/`cfg` doivent rester réassignables (let, pas const) :
       fetchFormules() utilise déjà `type` comme rôle de page (jamais celui de la session, voir
       commentaire plus bas) donc la bascule fonctionne quel que soit le rôle réel du visiteur. */
    function switchType(nouveauType) {
      if (nouveauType === type || !PREMIUM_CONFIGS[nouveauType]) return;
      type = nouveauType;
      cfg = PREMIUM_CONFIGS[type];
      try { window.history.replaceState(null, '', '?type=' + encodeURIComponent(type) + (moduleOrigine ? '&module=' + encodeURIComponent(moduleOrigine) : '')); } catch (e) {}
      renderTarifs(false);
    }

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
            <p class="prm-hero-sub">${type === 'initiative'
              ? "Si un de vos autres comptes est déjà Initiative Premium (payé au tarif plein), il peut vous faire bénéficier de -50% sur cet abonnement."
              : "Si un de vos autres comptes est déjà Premium à 100% (Initiative ou Utilisateur), il peut vous faire bénéficier de -50% sur cet abonnement."}</p>
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
              <p>Cet avantage est exclusivement lié au compte Premium que vous allez identifier.</p>
              <p>La réduction de 50&nbsp;% est valable uniquement pendant la durée restante de son abonnement Premium au moment de l'activation de votre avantage.</p>
              <p>Un compte ayant lui-même bénéficié de cette réduction de 50&nbsp;% ne peut pas être utilisé pour obtenir la même réduction sur un autre compte.</p>
              <p>Le compte de référence doit appartenir au même propriétaire que le vôtre (comptes liés) et avoir payé son Premium au tarif plein, à 100&nbsp;%. Un compte Initiative peut servir de référence pour un compte Initiative ou Utilisateur ; un compte Utilisateur ne peut servir de référence que pour un autre compte Utilisateur.</p>
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
    const { tarifs, reduc } = await fetchFormules(cfg.accredType, type);
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
          <div class="prm-type-switch" role="group" aria-label="Simuler un type de compte">
            <button type="button" class="prm-type-btn${type === 'utilisateur' ? ' active' : ''}" data-simuler-type="utilisateur">🙍 Compte Utilisateur</button>
            <button type="button" class="prm-type-btn${type === 'initiative' ? ' active' : ''}" data-simuler-type="initiative">🏢 Compte Initiative</button>
          </div>
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

          <!-- Bascule dupliquée ici (2026-09-24, demande explicite avec capture à l'appui :
               "ajoute ici un bouton de bascule compte utilisateur et initiative pour voir les
               prix") — celle du hero (tout en haut) n'est plus visible une fois qu'on a défilé
               jusqu'aux Tarifs ; même mécanique (switchType), variante de couleurs adaptée au
               fond clair de cette section (.prm-type-switch-light, voir premium-page.css) au
               lieu du fond navy du hero. Un seul gestionnaire délégué (plus bas,
               [data-simuler-type]) pilote déjà toutes les instances, celle-ci comme celle du
               hero, sans rien à ajouter côté JS. -->
          <div class="prm-type-switch prm-type-switch-light" role="group" aria-label="Simuler un type de compte">
            <button type="button" class="prm-type-btn${type === 'utilisateur' ? ' active' : ''}" data-simuler-type="utilisateur">🙍 Compte Utilisateur</button>
            <button type="button" class="prm-type-btn${type === 'initiative' ? ' active' : ''}" data-simuler-type="initiative">🏢 Compte Initiative</button>
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
          </div>` : `
          <!-- Entrée manquante pour un visiteur déjà connecté (2026-09-24, demande explicite :
               "ajoute un bouton [déjà un compte premium à 100%]") — avant, seul un visiteur PAS
               ENCORE connecté passait par renderGate() et pouvait tomber sur cette offre ; un
               visiteur déjà authentifié (cas de très loin le plus fréquent : il vient de cliquer
               "Devenir Premium" depuis son propre tableau de bord) filait droit vers ce
               renderTarifs(false) et ne voyait jamais cette possibilité. Réutilise handleGateOui()
               tel quel : il revérifie déjà l'état de connexion en temps réel et enchaîne
               correctement vers l'information obligatoire, sans dupliquer cette logique ici. -->
          <button type="button" class="btn prm-btn-gold prm-btn-deja-premium" id="prm-btn-deja-premium">🔑 J'ai déjà un compte Premium à 100% (-50%)</button>`}

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
    el.querySelectorAll('[data-simuler-type]').forEach(btn => {
      btn.addEventListener('click', () => switchType(btn.dataset.simulerType));
    });
    const btnDejaPremium = el.querySelector('#prm-btn-deja-premium');
    if (btnDejaPremium) btnDejaPremium.addEventListener('click', handleGateOui);

    /* DS-ID de Parrainage — lu depuis cette variable de fermeture par TOUS les boutons de
       paiement, y compris la seconde paire dupliquée de la bannière basse (un seul
       gestionnaire délégué wire les deux paires via [data-tarif]) : jamais depuis un
       attribut par bouton, sinon la bannière facturerait le plein tarif en silence.
       Le bouton "code adhérent D'A" qui vivait ici (A472) a été retiré (2026-09-24, demande
       explicite) — seul le parrainage -50% par compte lié (DS-ID) reste proposé. */
    let parrainageDsIdApplique = null;
    el.querySelectorAll('[data-tarif]').forEach(btn => {
      btn.dataset.origLabel = btn.textContent;
      btn.addEventListener('click', () => souscrire(cfg.accredType, btn.dataset.tarif, btn, parrainageDsIdApplique));
    });

    /* ── Parrainage Initiative -50% : vérification du DS-ID de référence ── */
    const parrainageBtn = el.querySelector('#prm-parrainage-btn');
    const parrainageInput = el.querySelector('#prm-parrainage-dsid');
    const parrainageMsg = el.querySelector('#prm-parrainage-msg');
    const MESSAGES_PARRAINAGE = {
      format_invalide: 'Le Code de Sécurité comporte 10 caractères.',
      offre_indisponible: "Aucune offre Premium n'est disponible pour votre type de compte.",
      ds_id_introuvable: "Ce Code de Sécurité ne correspond à aucun compte.",
      compte_actuel: "Vous ne pouvez pas utiliser le Code de Sécurité de votre propre compte.",
      role_non_eligible: "Un compte Utilisateur ne peut servir de référence que pour un autre compte Utilisateur, jamais pour un compte Initiative.",
      comptes_non_lies: "Ce compte n'est pas rattaché au vôtre (comptes liés). Seul un compte que vous possédez déjà peut servir de référence.",
      reference_non_active: "Ce compte n'a pas de Premium actif.",
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

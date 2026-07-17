/* ===========================================================
   SubscriptionRequiredPage — Diaspo'Actif
   Composant réutilisable affiché à la place d'une page blanche
   quand un module est réservé aux comptes Abonné.
   =========================================================== */
(function () {
  const DEFAULT_AVANTAGES = [
    { icon: '⏱️', titre: 'Gain de temps', texte: "Des outils prêts à l'emploi, sans perdre de temps à chercher ailleurs." },
    { icon: '🔓', titre: 'Outils exclusifs', texte: "Un accès à des fonctionnalités réservées aux membres Abonné." },
    { icon: '📈', titre: 'Développez votre activité', texte: "Des modules pensés pour faire avancer vos projets concrètement." },
    { icon: '🤝', titre: 'Accompagnement personnalisé', texte: "Un support Diaspo'Actif dédié à votre réussite." },
    { icon: '⚡', titre: 'Fonctionnalités avancées', texte: "Des capacités que la version gratuite ne propose pas." },
  ];

  const DEFAULT_FAQ = [
    { q: "Puis-je changer d'abonnement plus tard ?", r: "Oui, vous pouvez passer du mensuel à l'annuel (ou inversement) à tout moment depuis votre tableau de bord." },
    { q: "Puis-je résilier à tout moment ?", r: "Oui, la résiliation est possible à tout moment, sans engagement ni frais cachés. L'accès reste actif jusqu'à la fin de la période déjà payée." },
    { q: "Les paiements sont-ils sécurisés ?", r: "Oui, tous les paiements sont traités par Stripe, un prestataire de paiement certifié PCI-DSS. Diaspo'Actif ne stocke jamais vos données bancaires." },
    { q: "Quand l'accès est-il activé ?", r: "Immédiatement après confirmation du paiement — aucune validation manuelle n'est nécessaire pour ce module." },
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function fmtPrix(montant, devise) {
    const n = Number(montant) || 0;
    return n === 0 ? 'Gratuit' : `${n.toFixed(2).replace(/\.00$/, '')} ${devise === 'EUR' || !devise ? '€' : devise}`;
  }
  const DUREE_LABEL = { mensuel: '/ mois', annuel: '/ an', gratuit: '', payant: '' };

  async function fetchFormules(accredType) {
    try {
      const [meRes, catRes] = await Promise.all([
        fetch('/api/auth/me', { credentials: 'same-origin' }),
        fetch('/api/accreditations/catalogue', { credentials: 'same-origin' }),
      ]);
      const me = meRes.ok ? (await meRes.json()).user : null;
      const data = await catRes.json();
      const def = (data.catalogue || []).find(d => d.type === accredType);
      if (!def) return { def: null, tarifs: [] };
      const role = (me && me.role) || 'utilisateur';
      const tarifRow = (def.tarifs || []).find(t => t.role === role);
      if (!tarifRow) return { def, tarifs: [] };
      // Une seule ligne accred_tarifs par rôle : on synthétise mensuel + annuel via
      // reduction_annuelle_pct (même logique que le calcul serveur POST /accreditations/:type/payer).
      const reduc = Number(tarifRow.reduction_annuelle_pct) || 0;
      const devise = tarifRow.devise || 'EUR';
      let mensuel, annuel;
      if (tarifRow.type_tarif === 'mensuel') {
        mensuel = Number(tarifRow.montant);
        annuel = Math.round(mensuel * 12 * (1 - reduc / 100) * 100) / 100;
      } else {
        annuel = Number(tarifRow.montant);
        mensuel = Math.round((annuel * (1 - reduc / 100) / 12) * 100) / 100;
      }
      const tarifs = [
        { type_tarif: 'mensuel', montant: mensuel, devise },
        { type_tarif: 'annuel', montant: annuel, devise },
      ];
      return { def, tarifs };
    } catch (e) { return { def: null, tarifs: [] }; }
  }

  async function souscrire(accredType, typeTarif, btn) {
    if (btn) { btn.disabled = true; btn.textContent = 'Redirection…'; }
    try {
      const apiFn = window.api || (async (m, p, b) => {
        const r = await fetch('/api' + p, { method: m, credentials: 'same-origin', headers: b ? { 'Content-Type': 'application/json' } : {}, body: b ? JSON.stringify(b) : undefined });
        const d = await r.json();
        if (!r.ok) throw Object.assign(new Error(d.error || 'Erreur'), { status: r.status, data: d });
        return d;
      });
      const r = await apiFn('POST', `/accreditations/${accredType}/payer`, { type_tarif: typeTarif });
      if (r.checkout_url) window.location.href = r.checkout_url;
    } catch (e) {
      alert((e.data && e.data.error) || e.message || 'Impossible de démarrer le paiement.');
      if (btn) { btn.disabled = false; btn.textContent = "Choisir cette formule"; }
    }
  }

  /**
   * SubscriptionRequiredPage(container, config)
   * config: {
   *   moduleName, moduleIcon, moduleIllustration(emoji géant), moduleDescription,
   *   fonctionnalites: [string...],
   *   avantages: [{icon,titre,texte}...] (optionnel),
   *   accredType: 'utilisateur_abonne',
   *   retourUrl: string | function (optionnel, défaut history.back())
   * }
   */
  window.SubscriptionRequiredPage = async function (container, config) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    const {
      moduleName = 'Ce module', moduleIcon = '⭐', moduleIllustration = moduleIcon,
      moduleDescription = "Ce module fait partie des fonctionnalités premium de Diaspo'Actif.",
      fonctionnalites = [], avantages = DEFAULT_AVANTAGES, accredType = 'utilisateur_abonne',
      retourUrl = null,
    } = config || {};

    el.innerHTML = `<div class="src-loading" style="text-align:center;padding:80px 20px;color:var(--muted);">Chargement…</div>`;
    const { tarifs } = await fetchFormules(accredType);
    const recommandeIdx = tarifs.findIndex(t => t.type_tarif === 'annuel');
    const formuleRecommandee = recommandeIdx >= 0 ? recommandeIdx : 0;

    const featuresHtml = fonctionnalites.length ? fonctionnalites.map(f => `
      <div class="src-feature"><span class="src-check">✔</span><span>${esc(f)}</span></div>
    `).join('') : `<div style="color:var(--muted);font-size:13px;">Détails des fonctionnalités bientôt disponibles.</div>`;

    const avantagesHtml = avantages.map(a => `
      <div class="src-avantage">
        <div class="src-avantage-icon">${a.icon}</div>
        <div class="src-avantage-titre">${esc(a.titre)}</div>
        <div class="src-avantage-texte">${esc(a.texte)}</div>
      </div>
    `).join('');

    const formulesHtml = tarifs.length ? tarifs.map((t, i) => `
      <div class="src-formule ${i === formuleRecommandee ? 'src-formule-reco' : ''}">
        ${i === formuleRecommandee ? '<div class="src-reco-badge">⭐ Recommandé</div>' : ''}
        <div class="src-formule-nom">${t.type_tarif === 'annuel' ? 'Formule Annuelle' : t.type_tarif === 'mensuel' ? 'Formule Mensuelle' : t.type_tarif}</div>
        <div class="src-formule-prix">${fmtPrix(t.montant, t.devise)}<span class="src-formule-duree">${DUREE_LABEL[t.type_tarif] || ''}</span></div>
        <ul class="src-formule-inclus">
          <li>✔ Réseau Pro</li>
          <li>✔ Business Plans</li>
          <li>✔ Mes projets</li>
        </ul>
        <button class="btn btn-orange" style="width:100%;margin-top:14px;" onclick="SubscriptionRequiredPage._souscrire('${accredType}','${t.type_tarif}', this)">Choisir cette formule</button>
      </div>
    `).join('') : `<div style="color:var(--muted);font-size:13px;text-align:center;padding:20px;">Aucune formule disponible pour votre type de compte pour le moment.</div>`;

    const comparatifHtml = tarifs.length ? `
      <table class="src-comparatif">
        <thead><tr><th>Formule</th>${tarifs.map(t => `<th>${t.type_tarif === 'annuel' ? 'Annuelle' : 'Mensuelle'}</th>`).join('')}</tr></thead>
        <tbody>
          <tr><td>Prix</td>${tarifs.map(t => `<td>${fmtPrix(t.montant, t.devise)}${DUREE_LABEL[t.type_tarif] || ''}</td>`).join('')}</tr>
          <tr><td>Réseau Pro</td>${tarifs.map(() => `<td>✔</td>`).join('')}</tr>
          <tr><td>Business Plans</td>${tarifs.map(() => `<td>✔</td>`).join('')}</tr>
          <tr><td>Mes projets</td>${tarifs.map(() => `<td>✔</td>`).join('')}</tr>
          <tr><td>Résiliable à tout moment</td>${tarifs.map(() => `<td>✔</td>`).join('')}</tr>
        </tbody>
      </table>` : '';

    const faqHtml = DEFAULT_FAQ.map((f, i) => `
      <div class="src-faq-item">
        <button class="src-faq-q" onclick="this.parentElement.classList.toggle('open')">
          <span>${esc(f.q)}</span><span class="src-faq-chevron">›</span>
        </button>
        <div class="src-faq-a">${esc(f.r)}</div>
      </div>
    `).join('');

    el.innerHTML = `
      <div class="src-wrap">
        <button class="btn btn-outline src-retour" id="src-btn-retour">← Retour</button>

        <div class="src-hero">
          <div class="src-hero-illu">${moduleIllustration}</div>
          <div class="src-hero-icon">${moduleIcon}</div>
          <h1 class="src-hero-title">${esc(moduleName)}</h1>
          <p class="src-hero-desc">${esc(moduleDescription)}</p>
          <div class="src-hero-lock">🔒 Module réservé aux comptes Abonné</div>
          <div class="src-hero-ctas">
            <button class="btn btn-orange" id="src-btn-abonner">S'abonner</button>
            <button class="btn btn-outline" id="src-btn-comparer">Comparer les abonnements</button>
          </div>
        </div>

        <section class="src-section">
          <h2 class="src-section-title">Ce que permet ce module</h2>
          <div class="src-features-grid">${featuresHtml}</div>
        </section>

        <section class="src-section src-section-alt">
          <h2 class="src-section-title">Pourquoi s'abonner ?</h2>
          <div class="src-avantages-grid">${avantagesHtml}</div>
        </section>

        <section class="src-section" id="src-formules-anchor">
          <h2 class="src-section-title">Formules disponibles</h2>
          <div class="src-formules-grid">${formulesHtml}</div>
        </section>

        ${comparatifHtml ? `<section class="src-section src-section-alt" id="src-comparatif-anchor">
          <h2 class="src-section-title">Comparatif</h2>
          <div class="src-comparatif-wrap">${comparatifHtml}</div>
        </section>` : ''}

        <section class="src-section">
          <h2 class="src-section-title">Questions fréquentes</h2>
          <div class="src-faq">${faqHtml}</div>
        </section>
      </div>
    `;

    const retourBtn = el.querySelector('#src-btn-retour');
    retourBtn.addEventListener('click', () => {
      if (typeof retourUrl === 'function') retourUrl();
      else if (retourUrl) window.location.href = retourUrl;
      else if (window.history.length > 1) window.history.back();
      else window.location.href = 'dashboard-utilisateur.html';
    });
    el.querySelector('#src-btn-abonner').addEventListener('click', () => {
      el.querySelector('#src-formules-anchor').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    el.querySelector('#src-btn-comparer').addEventListener('click', () => {
      const target = el.querySelector('#src-comparatif-anchor') || el.querySelector('#src-formules-anchor');
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };
  window.SubscriptionRequiredPage._souscrire = souscrire;
})();

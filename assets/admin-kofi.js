/* ═══════════════════════════════════════════════════════
   assets/admin-kofi.js — Koffi · Budget IA (2026-10-30)
   Tableau de bord administrateur : réserve de crédits d'IA (recharges chez le fournisseur − coût estimé des questions),
   coût et volume des 30 derniers jours, forfaits vendus, journal des recharges et réglages de Koffi.
   Données : GET /api/admin/kofi/budget · GET|PUT /api/admin/kofi/reglages · POST /api/admin/kofi/budget/recharge (server/kofi.js).
   Dépend de la fonction globale api() du tableau de bord.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';
  let B = null, R = null;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = id => document.getElementById(id);
  const nb = n => Number(n || 0).toLocaleString('fr-FR');
  /* Un montant qui arrondit à zéro s'affiche « 0,00 € », jamais « -0,00 € ». */
  const eur = (n, d) => {
    d = d == null ? 2 : d; let x = Number(n || 0); if (Math.abs(x) < Math.pow(10, -d) / 2) x = 0;
    return x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
  };
  /* Les dates de la base sont en UTC (« AAAA-MM-JJ HH:MM:SS ») : on les affiche à l'heure de Paris. */
  const dateParis = s => {
    if (!s) return '—';
    const t = String(s).replace(' ', 'T'), d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : t + 'Z');
    return isNaN(d) ? esc(s) : d.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  const CATEGORIES = { gratuit: 'Questions offertes', forfait: 'Questions du forfait', apercu: 'Aperçu (formateurs et administration)', createur_gratuit: 'Assistant de création — messages offerts', createur_forfait: 'Assistant de création — messages du forfait', createur_refus: 'Assistant de création — refus du fournisseur' };
  const TYPES_BUDGET = { recharge: 'Recharge', ajustement: 'Ajustement' };

  /* Réglages affichés : { cle, lib, aide, unite?, step? } — les bornes et les valeurs par défaut viennent du serveur. */
  const GROUPES = [
    { titre: '⚙️ Fonctionnement', champs: [
      { cle: 'actif_global', lib: 'Koffi activé', type: 'bool', aide: 'Interrupteur général. Désactivé, Koffi répond « momentanément indisponible » dans toutes les formations ; rien n\'est supprimé.' },
      { cle: 'modele', lib: 'Modèle d\'IA', type: 'select', aide: 'Choisi côté serveur parmi une liste fermée ; jamais depuis le navigateur. Haiku 5.5 est le modèle prévu (le moins coûteux).' },
    ] },
    { titre: '🌍 Pays', champs: [
      { cle: 'pays_filtre_actif', lib: 'Fermer Koffi hors des pays pris en charge', type: 'bool', aide: 'Oui (recommandé) : une personne connectée depuis un pays absent de la liste du fournisseur d\'IA ne peut pas utiliser Koffi. Non : aucun contrôle (à ne faire que si la liste est périmée et en attendant sa mise à jour).' },
    ] },
    { titre: '🎁 Questions offertes', champs: [
      { cle: 'gratuit_questions', lib: 'Questions offertes par compte', unite: 'questions', aide: 'Accordées une seule fois par compte, à sa première question. Une modification ne concerne que les comptes pas encore servis.' },
      { cle: 'budget_seuil_gratuit_eur', lib: 'Seuil de réserve pour offrir', unite: '€', step: 0.5, aide: 'Sous ce seuil, plus aucun nouveau compte ne reçoit ses questions offertes, et les comptes qui les ont épuisées voient l\'offre de recharge. Réserve à zéro : Koffi est indisponible pour tous.' },
    ] },
    { titre: '🛒 Forfait de questions', note: 'S\'applique aux prochains achats ; les forfaits déjà achetés ne changent pas. Si vous modifiez ces valeurs, relisez l\'article 6 ter des CGV (cgv.html), qui cite le tarif.', champs: [
      { cle: 'forfait_questions', lib: 'Questions par forfait', unite: 'questions' },
      { cle: 'forfait_prix_eur', lib: 'Prix du forfait', unite: '€', step: 0.05, aide: 'Minimum 0,50 € (limite de Stripe). Aucune commission Diaspo\'Actif : seuls les frais Stripe s\'appliquent.' },
      { cle: 'forfait_validite_mois', lib: 'Validité', unite: 'mois' },
    ] },
    { titre: '🤖 Assistant de création (formateurs)', note: 'Koffi aide les formateurs à créer leur formation. Compteur séparé de celui des élèves ; un formateur reçoit des messages offerts chaque jour, puis peut acheter un forfait.', champs: [
      { cle: 'createur_gratuit_jour', lib: 'Messages offerts par jour et par formateur', unite: 'messages', aide: 'Fenêtre glissante de 24 h. À 0, seul le forfait permet d\'utiliser l\'assistant.' },
      { cle: 'createur_forfait_messages', lib: 'Messages par forfait', unite: 'messages' },
      { cle: 'createur_forfait_prix_eur', lib: 'Prix du forfait', unite: '€', step: 0.05, aide: 'Minimum 0,50 € (limite de Stripe). Aucune commission Diaspo\'Actif : seuls les frais Stripe s\'appliquent. Si vous modifiez ce prix, relisez l\'article 6 ter des CGV.' },
      { cle: 'createur_forfait_validite_mois', lib: 'Validité du forfait', unite: 'mois' },
      { cle: 'createur_max_message_caracteres', lib: 'Longueur maximale d\'un message', unite: 'caractères', aide: 'Permet de coller un module entier d\'un seul coup. Plus c\'est long, plus chaque message coûte.' },
      { cle: 'createur_max_sortie_tokens', lib: 'Longueur maximale d\'une réponse', unite: 'jetons' },
      { cle: 'plafond_jour_createur', lib: 'Messages par jour et par formateur (plafond absolu)', unite: 'messages', aide: 'Protège la réserve contre un usage abusif, forfait compris.' },
    ] },
    { titre: '🛡️ Plafonds et limites', champs: [
      { cle: 'plafond_jour_par_eleve', lib: 'Questions par jour et par élève', unite: 'questions', aide: 'Protège la réserve contre un usage abusif ou automatisé.' },
      { cle: 'plafond_jour_apercu', lib: 'Questions par jour en aperçu', unite: 'questions', aide: 'Formateurs et administrateurs qui testent Koffi sur une formation (sans consommer de questions).' },
      { cle: 'max_message_caracteres', lib: 'Longueur maximale d\'une question', unite: 'caractères' },
      { cle: 'max_sortie_tokens', lib: 'Longueur maximale d\'une réponse', unite: 'jetons', aide: 'Environ 0,75 mot par jeton. Plus c\'est long, plus chaque réponse coûte.' },
      { cle: 'nb_extraits', lib: 'Extraits de cours envoyés au modèle', unite: 'extraits', aide: 'Plus d\'extraits = réponses mieux sourcées, mais plus de jetons à payer.' },
    ] },
    { titre: '🗂️ Conservation', champs: [
      { cle: 'retention_jours', lib: 'Conservation des conversations', unite: 'jours', aide: 'Maximum 60 jours : c\'est la durée annoncée aux élèves (fenêtre Koffi, CGV). Vous pouvez la raccourcir, pas l\'allonger. Purge automatique chaque nuit.' },
    ] },
    { titre: '💱 Tarifs du fournisseur (estimation du coût)', note: 'Servent à estimer ce que coûte chaque question et donc à faire baisser la réserve. Comparez régulièrement avec le solde réel de votre compte Anthropic et corrigez l\'écart avec un « ajustement ».', champs: [
      { cle: 'prix_entree_usd_par_million', lib: 'Prix d\'un million de jetons lus', unite: '$', step: 0.01 },
      { cle: 'prix_sortie_usd_par_million', lib: 'Prix d\'un million de jetons écrits', unite: '$', step: 0.01 },
      { cle: 'taux_usd_eur', lib: 'Taux dollar → euro', unite: '€ pour 1 $', step: 0.01 },
    ] },
  ];

  function style() {
    if (el('kb-style')) return;
    const s = document.createElement('style'); s.id = 'kb-style';
    s.textContent = `
      .kb-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px}
      .kb-kpi{border-left:4px solid var(--kb,#2563EB);padding:12px 14px}
      .kb-kpi span{font-size:12px;color:var(--muted);font-weight:700}.kb-kpi b{display:block;font-size:22px;margin-top:2px}.kb-kpi small{display:block;color:var(--muted);font-size:11.5px;margin-top:2px}
      .kb-grille{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-bottom:16px}
      .kb-alerte{border-radius:10px;padding:12px 14px;margin-bottom:12px;font-size:13.5px;line-height:1.5;border:1px solid}
      .kb-alerte.rouge{background:#fef2f2;border-color:#fca5a5;color:#991b1b}.kb-alerte.orange{background:#fffbeb;border-color:#fcd34d;color:#92400e}.kb-alerte.vert{background:#ecfdf5;border-color:#6ee7b7;color:#065f46}
      .kb-form label{display:block;font-size:12px;font-weight:700;color:var(--muted);margin:10px 0 3px}
      .kb-form input,.kb-form select,.kb-form textarea{width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--border);border-radius:8px;font:inherit;font-size:13px;background:var(--surface,#fff);color:inherit}
      .kb-msg{font-size:13px;margin-top:10px;min-height:18px}.kb-msg.ok{color:#047857;font-weight:700}.kb-msg.ko{color:#b91c1c;font-weight:700}
      .kb-tab{width:100%;border-collapse:collapse;font-size:13px}
      .kb-tab th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);padding:6px 8px;border-bottom:1px solid var(--border)}
      .kb-tab td{padding:8px;border-bottom:1px solid var(--border);vertical-align:top}.kb-tab .d{text-align:right;white-space:nowrap}
      .kb-jours{display:flex;align-items:flex-end;gap:3px;height:120px;border-bottom:1px solid var(--border)}
      .kb-jours i{flex:1;min-width:4px;background:#93c5fd;border-radius:3px 3px 0 0;display:block}.kb-jours i.vide{background:#e5e7eb}
      .kb-jours-lgd{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-top:4px}
      .kb-barre{margin:0 0 10px;font-size:13px}.kb-barre-t{display:flex;justify-content:space-between;gap:8px;margin-bottom:3px}
      .kb-piste{display:block;background:#eef2ff;border-radius:6px;height:9px;overflow:hidden}.kb-piste>i{display:block;height:100%;border-radius:6px;background:#2563EB}
      .kb-champs{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:4px 16px}
      .kb-champ small{display:block;color:var(--muted);font-size:11.5px;line-height:1.4;margin-top:3px}
      .kb-champ .u{display:flex;align-items:center;gap:8px}.kb-champ .u em{font-style:normal;color:var(--muted);font-size:12px;white-space:nowrap}
      .kb-pays{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.kb-pays span{border:1px solid var(--border);border-radius:99px;padding:2px 10px;font-size:12px}
      .kb-note{background:#f8fafc;border:1px solid var(--border);border-radius:8px;padding:9px 11px;font-size:12.5px;color:#475569;margin:0 0 6px;line-height:1.5}
      .kb-groupe h4{margin:18px 0 4px;font-size:14px}
    `;
    document.head.appendChild(s);
  }

  function msg(id, texte, ok) { const m = el(id); if (m) { m.textContent = texte || ''; m.className = 'kb-msg ' + (texte ? (ok ? 'ok' : 'ko') : ''); } }

  /* ───── Rendu ───── */
  function alertes() {
    const a = [];
    if (!B.fournisseur_configure) a.push(['orange', '🔑 <b>Clé du fournisseur absente.</b> Les élèves voient « Koffi est momentanément indisponible ». Créez le compte Anthropic, rechargez-le, puis ajoutez la clé <code>ANTHROPIC_API_KEY</code> dans les variables d\'environnement de Vercel (Production) et redéployez.']);
    if (B.alerte === 'epuise') a.push(['rouge', '⛔ <b>Réserve épuisée.</b> Koffi est indisponible pour tous les comptes tant qu\'une recharge n\'est pas enregistrée ci-dessous (après avoir rechargé votre compte chez le fournisseur).']);
    else if (B.alerte === 'bas') a.push(['orange', '⚠️ <b>Réserve basse</b> (sous ' + eur(B.seuil_gratuit_eur) + '). Plus de nouvelles questions offertes ; les comptes qui ont épuisé les leurs voient l\'offre de recharge. Pensez à recharger votre compte chez le fournisseur, puis à l\'enregistrer ici.']);
    if (!a.length) a.push(['vert', '✅ Koffi est opérationnel : clé du fournisseur configurée et réserve suffisante.']);
    return a.map(x => '<div class="kb-alerte ' + x[0] + '">' + x[1] + '</div>').join('');
  }

  function kpis() {
    const j = B.trente_jours || [];
    const q = j.reduce((a, x) => a + x.questions, 0), c = j.reduce((a, x) => a + x.cout_eur, 0);
    const v = B.forfaits_vendus || { commandes: 0, questions: 0, encaisse_eur: 0 };
    const carte = (couleur, lib, val, sous) => '<div class="card kb-kpi" style="--kb:' + couleur + '"><span>' + lib + '</span><b>' + val + '</b>' + (sous ? '<small>' + sous + '</small>' : '') + '</div>';
    return '<div class="kb-kpis">'
      + carte(B.alerte === 'epuise' ? '#DC2626' : (B.alerte === 'bas' ? '#D97706' : '#059669'), 'Réserve d\'IA', eur(B.reserve_eur), 'recharges − coût estimé')
      + carte('#2563EB', 'Questions (30 jours)', nb(q))
      + carte('#7C3AED', 'Coût estimé (30 jours)', eur(c), q ? 'soit ' + eur(c / q, 4) + ' par question' : '')
      + carte('#E87C3E', 'Forfaits vendus', nb(v.commandes), nb(v.questions) + ' questions · ' + eur(v.encaisse_eur) + ' brut, avant frais Stripe')
      + carte('#0891B2', 'Comptes ayant reçu l\'essai', nb(B.comptes_avec_essai_gratuit))
      + '</div>';
  }

  function formRecharge() {
    return '<div class="card kb-form"><h3 style="margin:0 0 4px;font-size:15px;">💳 Enregistrer une recharge</h3>'
      + '<p style="margin:0;color:var(--muted);font-size:12.5px;line-height:1.5;">À faire <b>après</b> avoir rechargé votre compte chez le fournisseur (montant converti en euros). C\'est ce montant qui alimente la réserve.</p>'
      + '<label for="kb-type">Nature</label><select id="kb-type"><option value="recharge">Recharge (crédits achetés chez le fournisseur)</option><option value="ajustement">Ajustement (corriger l\'écart avec le solde réel)</option></select>'
      + '<label for="kb-montant">Montant en euros <span style="font-weight:400">(négatif possible pour un ajustement)</span></label><input id="kb-montant" type="number" step="0.01" placeholder="ex : 10">'
      + '<label for="kb-ref">Référence <span style="font-weight:400">(n° de facture, optionnel)</span></label><input id="kb-ref" type="text" maxlength="120">'
      + '<label for="kb-note">Note <span style="font-weight:400">(optionnel)</span></label><input id="kb-note" type="text" maxlength="300">'
      + '<div style="margin-top:12px"><button type="button" class="btn btn-orange" id="kb-btn-recharge">Enregistrer</button></div><div id="kb-msg-recharge" class="kb-msg" role="status"></div></div>';
  }

  function blocCategories() {
    const cats = B.par_categorie || [], tot = cats.reduce((a, c) => a + c.questions, 0);
    const lignes = cats.length ? cats.map(c => {
      const p = tot ? Math.round(c.questions / tot * 100) : 0;
      return '<div class="kb-barre"><div class="kb-barre-t"><b>' + esc(CATEGORIES[c.categorie] || c.categorie) + '</b><span>' + nb(c.questions) + ' · ' + eur(c.cout_eur, 4) + '</span></div><span class="kb-piste"><i style="width:' + p + '%"></i></span>'
        + '<small style="color:var(--muted);font-size:11.5px">' + nb(c.jetons_entree) + ' jetons lus · ' + nb(c.jetons_sortie) + ' jetons écrits</small></div>';
    }).join('') : '<p style="color:var(--muted);font-size:13px;margin:0">Aucune question posée pour l\'instant.</p>';
    return '<div class="card"><h3 style="margin:0 0 12px;font-size:15px;">📊 Répartition depuis le début</h3>' + lignes + '</div>';
  }

  function blocJours() {
    const map = {}; (B.trente_jours || []).forEach(j => { map[j.jour] = j; });
    const jours = [];
    for (let i = 29; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10); jours.push(map[d] || { jour: d, questions: 0, cout_eur: 0 }); }
    const max = Math.max(1, ...jours.map(j => j.questions));
    const barres = jours.map(j => '<i class="' + (j.questions ? '' : 'vide') + '" style="height:' + (j.questions ? Math.max(4, Math.round(j.questions / max * 100)) : 2) + '%" title="' + esc(j.jour) + ' : ' + nb(j.questions) + ' question(s) · ' + eur(j.cout_eur, 4) + '"></i>').join('');
    return '<div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 12px;font-size:15px;">📈 Questions par jour (30 derniers jours)</h3><div class="kb-jours">' + barres + '</div>'
      + '<div class="kb-jours-lgd"><span>' + esc(jours[0].jour) + '</span><span>jours en heure universelle (UTC) · maximum ' + nb(max) + '</span><span>' + esc(jours[29].jour) + '</span></div></div>';
  }

  function blocHistorique() {
    const rows = (B.recharges || []).map(r => '<tr><td>' + dateParis(r.created_at) + '</td><td>' + esc(TYPES_BUDGET[r.type] || r.type) + '</td><td class="d"><b style="color:' + (Number(r.montant_eur) < 0 ? '#b91c1c' : '#047857') + '">' + (Number(r.montant_eur) > 0 ? '+' : '') + eur(r.montant_eur) + '</b></td><td>' + esc(r.reference || '') + (r.note ? '<div style="color:var(--muted);font-size:12px">' + esc(r.note) + '</div>' : '') + '</td></tr>').join('');
    return '<div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 12px;font-size:15px;">🧾 Journal des recharges et ajustements</h3>'
      + (rows ? '<div style="overflow-x:auto"><table class="kb-tab"><thead><tr><th>Date (Paris)</th><th>Nature</th><th class="d">Montant</th><th>Référence / note</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
        : '<p style="color:var(--muted);font-size:13px;margin:0">Aucune recharge enregistrée. La réserve part de zéro : enregistrez la première recharge pour activer Koffi.</p>') + '</div>';
  }

  function champ(c) {
    const v = R.reglages[c.cle], d = R.defauts[c.cle], bornes = R.bornes[c.cle];
    let champ;
    if (c.type === 'bool') champ = '<select id="kbr-' + c.cle + '" data-cle="' + c.cle + '"><option value="1"' + (Number(v) ? ' selected' : '') + '>Oui</option><option value="0"' + (Number(v) ? '' : ' selected') + '>Non</option></select>';
    else if (c.type === 'select') champ = '<select id="kbr-' + c.cle + '" data-cle="' + c.cle + '">' + R.modeles_autorises.map(m => '<option value="' + esc(m) + '"' + (m === v ? ' selected' : '') + '>' + esc(m) + '</option>').join('') + '</select>';
    else champ = '<div class="u"><input id="kbr-' + c.cle + '" data-cle="' + c.cle + '" type="number" step="' + (c.step || 1) + '"' + (bornes ? ' min="' + bornes[0] + '" max="' + bornes[1] + '"' : '') + ' value="' + esc(v) + '">' + (c.unite ? '<em>' + esc(c.unite) + '</em>' : '') + '</div>';
    const defaut = c.type === 'select' || c.type === 'bool' ? '' : ' Par défaut : ' + String(d).replace('.', ',') + '.';
    return '<div class="kb-champ"><label for="kbr-' + c.cle + '">' + esc(c.lib) + '</label>' + champ + '<small>' + esc((c.aide || '') + defaut).trim() + '</small></div>';
  }

  /* Pays où le fournisseur d'IA est disponible (server/kofi-pays.js) : la liste en clair, le pays de la connexion actuelle, la source et la date du relevé. */
  function nomPays(c) { try { return new Intl.DisplayNames(['fr'], { type: 'region' }).of(c) || c; } catch (e) { return c; } }
  function blocPays() {
    const P = R && R.pays; if (!P) return '';
    const noms = P.codes.map(c => ({ c, n: nomPays(c) })).sort((a, b) => a.n.localeCompare(b.n, 'fr'));
    const jour = String(P.releve_le || '').split('-').reverse().join('/');
    const det = P.detecte
      ? 'Votre connexion actuelle est détectée depuis <b>' + esc(nomPays(P.detecte)) + ' (' + esc(P.detecte) + ')</b> : Koffi y est ' + (P.detecte_pris_en_charge ? '<b style="color:#22c55e">disponible</b>' : '<b style="color:#f87171">fermé</b>') + '.'
      : 'Pays de votre connexion : non détecté (normal en local ; en production l\'hébergeur le fournit). Un pays inconnu est autorisé.';
    return '<div class="card" style="margin-bottom:16px"><h3 style="margin:0 0 6px;font-size:15px;">🌍 Pays où Koffi est disponible</h3>'
      + '<p style="margin:0 0 8px;color:var(--muted);font-size:12.5px;line-height:1.55;">Le fournisseur d\'IA n\'est disponible que dans <b>' + nb(P.codes.length) + ' pays</b>. Le contrat interdit de l\'utiliser depuis un pays non listé, y compris par les élèves d\'un client. Koffi se ferme donc pour une personne connectée depuis un autre pays ; le reste de la plateforme reste ouvert partout. Le pays est déduit de l\'adresse IP par l\'hébergeur (il n\'est ni stocké ni journalisé) ; un VPN peut le contourner. Les territoires d\'un pays listé (Guadeloupe, Martinique, Guyane, La Réunion…) sont couverts.</p>'
      + '<p style="margin:0 0 8px;font-size:13px">' + det + '</p>'
      + '<details><summary style="cursor:pointer;font-weight:700;font-size:13px">Voir les ' + nb(P.codes.length) + ' pays</summary><div class="kb-pays">' + noms.map(x => '<span title="' + esc(x.c) + '">' + esc(x.n) + '</span>').join('') + '</div></details>'
      + '<p style="margin:10px 0 0;color:var(--muted);font-size:12px;line-height:1.5;">Liste relevée le ' + esc(jour) + ' sur <a href="' + esc(P.source) + '" target="_blank" rel="noopener">' + esc(P.source) + '</a>. ⚠️ La politique du fournisseur annonce une nouvelle version <b>le 12 novembre 2026</b> : relisez cette page à cette date et faites mettre la liste à jour si elle change.</p></div>';
  }

  function blocReglages() {
    const g = GROUPES.map(gr => '<div class="kb-groupe"><h4>' + gr.titre + '</h4>' + (gr.note ? '<p class="kb-note">' + esc(gr.note) + '</p>' : '') + '<div class="kb-champs">' + gr.champs.map(champ).join('') + '</div></div>').join('');
    return '<div class="card kb-form" style="margin-bottom:20px"><h3 style="margin:0;font-size:15px;">🎛️ Réglages de Koffi</h3>' + g
      + '<div style="margin-top:16px"><button type="button" class="btn btn-orange" id="kb-btn-reglages">Enregistrer les réglages</button> <button type="button" class="btn btn-outline" id="kb-btn-defauts" style="margin-left:6px">Revenir aux valeurs par défaut</button></div><div id="kb-msg-reglages" class="kb-msg" role="status"></div></div>';
  }

  function rendre() {
    const zone = el('kb-contenu'); if (!zone) return;
    zone.innerHTML = alertes() + kpis() + '<div class="kb-grille">' + formRecharge() + blocCategories() + '</div>' + blocJours() + blocHistorique() + blocPays() + blocReglages();
    el('kb-btn-recharge').onclick = recharger;
    el('kb-btn-reglages').onclick = enregistrerReglages;
    el('kb-btn-defauts').onclick = () => {
      document.querySelectorAll('#kb-contenu [data-cle]').forEach(i => { const d = R.defauts[i.dataset.cle]; if (d !== undefined) i.value = String(d); });
      msg('kb-msg-reglages', 'Valeurs par défaut remises dans les champs — cliquez sur « Enregistrer les réglages » pour les appliquer.', true);
    };
  }

  /* ───── Actions ───── */
  async function recharger() {
    const montant = Number(el('kb-montant').value);
    if (!Number.isFinite(montant) || montant === 0) return msg('kb-msg-recharge', 'Saisissez un montant en euros (différent de zéro).', false);
    const btn = el('kb-btn-recharge'); btn.disabled = true;
    try {
      await api('POST', '/admin/kofi/budget/recharge', { type: el('kb-type').value, montant_eur: montant, reference: el('kb-ref').value, note: el('kb-note').value });
      await charger(); msg('kb-msg-recharge', 'Enregistré. La réserve est à jour.', true);
    } catch (e) { msg('kb-msg-recharge', e.message || 'Échec de l\'enregistrement.', false); btn.disabled = false; }
  }

  async function enregistrerReglages() {
    const modif = {};
    document.querySelectorAll('#kb-contenu [data-cle]').forEach(i => {
      const cle = i.dataset.cle, avant = R.reglages[cle];
      if (cle === 'modele') { if (i.value !== avant) modif[cle] = i.value; }
      else if (i.value !== '' && Number(i.value) !== Number(avant)) modif[cle] = Number(i.value);
    });
    if (!Object.keys(modif).length) return msg('kb-msg-reglages', 'Aucun changement à enregistrer.', true);
    const btn = el('kb-btn-reglages'); btn.disabled = true;
    try {
      await api('PUT', '/admin/kofi/reglages', modif);
      await charger(); msg('kb-msg-reglages', 'Réglages enregistrés (' + Object.keys(modif).length + ' modifié' + (Object.keys(modif).length > 1 ? 's' : '') + ').', true);
    } catch (e) { msg('kb-msg-reglages', e.message || 'Échec de l\'enregistrement.', false); btn.disabled = false; }
  }

  async function charger() {
    [B, R] = await Promise.all([api('GET', '/admin/kofi/budget'), api('GET', '/admin/kofi/reglages')]);
    rendre();
  }

  window.loadKofiBudget = async function () {
    style();
    const zone = el('kb-contenu'); if (!zone) return;
    if (!B) zone.innerHTML = '<div class="card" style="padding:16px;color:var(--muted)">Chargement…</div>';
    try { await charger(); }
    catch (e) { zone.innerHTML = '<div class="kb-alerte rouge">Impossible de charger le budget de Koffi : ' + esc(e.message || 'erreur') + '</div>'; }
  };
})();

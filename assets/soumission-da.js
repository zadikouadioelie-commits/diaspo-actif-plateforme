/* ── Widget partagé "Soumettre un projet à Diaspo'Actif" ──────────────────────────────────
   Composant unique réutilisé À L'IDENTIQUE sur les 3 dashboards éligibles (Utilisateur,
   Initiative, Collectivité) — cahier des charges "Partenariat" Partie 1 : le bouton et le
   formulaire doivent être rigoureusement les mêmes partout. S'appuie sur le module Projets
   existant (table `projets`, type='soumission_da') sans dupliquer de logique métier côté
   serveur : ce fichier n'est que la vue.

   Utilisation dans chaque dashboard :
     <div id="da-sda-mount"></div>
     <script src="assets/soumission-da.js"></script>
     ...
     SoumissionDA.render(document.getElementById('da-sda-mount'));
     // puis, à chaque affichage de la section qui contient le mount :
     SoumissionDA.load();
*/
(function () {
  'use strict';

  const STATUT_LABELS = {
    brouillon: '📝 Brouillon',
    soumis: '📤 Soumis',
    en_analyse: '🔍 En analyse',
    infos_demandees: '❓ Infos demandées',
    retenu: '✅ Retenu',
    oriente_partenaire: '🤝 Orienté vers un partenaire',
    mise_en_relation: '🔗 Mise en relation',
    abouti: '🏆 Abouti',
    sans_suite: '⛔ Sans suite',
  };
  const STATUT_COLORS = {
    brouillon: '#f1f5f9;color:#475569',
    soumis: '#fef3c7;color:#92400e',
    en_analyse: '#dbeafe;color:#1e40af',
    infos_demandees: '#fee2e2;color:#991b1b',
    retenu: '#d1fae5;color:#065f46',
    oriente_partenaire: '#f3e8ff;color:#6b21a8',
    mise_en_relation: '#e0e7ff;color:#3730a3',
    abouti: '#d1fae5;color:#065f46',
    sans_suite: '#fee2e2;color:#991b1b',
  };
  const BESOINS_OPTIONS = [
    ['financement', '💰 Financement'],
    ['partenaires_techniques', '🔧 Partenaires techniques'],
    ['mise_en_reseau', '🌐 Mise en réseau'],
    ['visibilite_communication', '📣 Visibilité / communication'],
    ['accompagnement_juridique', '⚖️ Accompagnement juridique / administratif'],
    ['autre', '➕ Autre'],
  ];
  const NIVEAU_OPTIONS = [
    ['idee', 'Idée / en réflexion'],
    ['conception', 'En cours de conception'],
    ['demarre', 'Déjà démarré'],
    ['avance', 'Avancé'],
  ];

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function fmtDate(d) { if (!d) return ''; try { return new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return d; } }

  let _dossiers = [];
  let _filtre = '';
  let _current = null; // id du dossier en cours d'édition dans le modal, ou null si nouveau
  let _mount = null;
  let _opts = {};

  function modalHTML() {
    return `
    <div id="da-sda-modal-bg" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:600;align-items:flex-start;justify-content:center;overflow-y:auto;padding:24px;">
      <div style="background:var(--card);border-radius:18px;padding:28px;width:100%;max-width:680px;margin:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <h3 style="margin:0;">📤 Soumettre un projet à Diaspo'Actif</h3>
          <button onclick="SoumissionDA.fermer()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted);">✕</button>
        </div>
        <p id="da-sda-lock-note" style="display:none;background:#fef3c7;color:#92400e;border-radius:8px;padding:10px;font-size:13px;margin:10px 0;"></p>

        <div style="margin:14px 0 12px;"><label class="form-label">Titre du projet <span style="color:#2563EB">*</span></label><input id="da-sda-titre" class="input-field" style="width:100%;" placeholder="Ex : Centre de formation numérique à Bouaké"></div>
        <div style="margin-bottom:12px;"><label class="form-label">Présentation générale</label><textarea id="da-sda-presentation" class="input-field" rows="2" style="width:100%;resize:vertical;" placeholder="Résumé en quelques phrases"></textarea></div>
        <div style="margin-bottom:12px;"><label class="form-label">Description détaillée</label><textarea id="da-sda-description" class="input-field" rows="4" style="width:100%;resize:vertical;" placeholder="Décrivez le projet en détail…"></textarea></div>

        <div class="grid grid-2" style="gap:12px;margin-bottom:12px;">
          <div><label class="form-label">Catégorie</label>
            <select id="da-sda-categorie" class="input-field" style="width:100%;">
              <option>Général</option><option>Action sociale</option><option>Santé</option><option>Éducation</option><option>Agriculture</option><option>Technologie</option><option>Culture</option><option>Économie</option><option>Environnement</option>
            </select>
          </div>
          <div><label class="form-label">Niveau d'avancement</label>
            <select id="da-sda-niveau" class="input-field" style="width:100%;">
              ${NIVEAU_OPTIONS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}
            </select>
          </div>
          <div><label class="form-label">Pays</label><input id="da-sda-pays" class="input-field" style="width:100%;"></div>
          <div><label class="form-label">Ville</label><input id="da-sda-ville" class="input-field" style="width:100%;"></div>
          <div><label class="form-label">Territoire concerné</label><input id="da-sda-territoire" class="input-field" style="width:100%;" placeholder="Ex : national, régional, une commune…"></div>
          <div><label class="form-label">Budget estimé (€)</label><input id="da-sda-budget" type="number" class="input-field" style="width:100%;"></div>
          <div><label class="form-label">Date de début</label><input id="da-sda-debut" type="date" class="input-field" style="width:100%;"></div>
          <div><label class="form-label">Date de fin</label><input id="da-sda-fin" type="date" class="input-field" style="width:100%;"></div>
        </div>

        <div style="margin-bottom:12px;"><label class="form-label">Objectifs du projet</label><textarea id="da-sda-objectifs" class="input-field" rows="2" style="width:100%;resize:vertical;"></textarea></div>
        <div style="margin-bottom:12px;"><label class="form-label">Public concerné</label><textarea id="da-sda-public" class="input-field" rows="2" style="width:100%;resize:vertical;"></textarea></div>

        <div style="margin-bottom:12px;">
          <label class="form-label">Besoins exprimés</label>
          <div id="da-sda-besoins" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;">
            ${BESOINS_OPTIONS.map(([v, l]) => `
              <label style="display:flex;align-items:center;gap:6px;background:var(--bg);border:1px solid var(--border);border-radius:99px;padding:5px 12px;font-size:12.5px;cursor:pointer;">
                <input type="checkbox" value="${v}" class="da-sda-besoin-chk" onchange="SoumissionDA.majBesoinsAutres()"> ${esc(l)}
              </label>`).join('')}
          </div>
          <input id="da-sda-besoins-autres" class="input-field" style="width:100%;margin-top:8px;display:none;" placeholder="Précisez votre besoin…">
        </div>

        <div style="margin-bottom:16px;"><label class="form-label">Informations complémentaires</label><textarea id="da-sda-infos" class="input-field" rows="2" style="width:100%;resize:vertical;"></textarea></div>

        <div id="da-sda-docs-section" style="display:none;margin-bottom:16px;border-top:1px solid var(--border);padding-top:14px;">
          <label class="form-label">📎 Documents joints</label>
          <div id="da-sda-docs-list" style="margin:8px 0;font-size:13px;"></div>
          <input type="file" id="da-sda-docs-input" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.mp4,.webm" onchange="SoumissionDA.televerserDocument(this)">
          <p style="font-size:11.5px;color:var(--muted);margin:4px 0 0;">PDF, Word, Excel, PowerPoint ou vidéo.</p>
        </div>

        <div id="da-sda-error" style="display:none;background:#fef2f2;color:#B91C1C;border-radius:8px;padding:10px;font-size:13px;margin-bottom:12px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;">
          <button class="btn btn-outline" onclick="SoumissionDA.fermer()">Annuler</button>
          <button class="btn btn-outline" id="da-sda-btn-brouillon" onclick="SoumissionDA.enregistrerBrouillon()">💾 Enregistrer comme brouillon</button>
          <button class="btn btn-orange" id="da-sda-btn-soumettre" onclick="SoumissionDA.soumettre()">📤 Soumettre à Diaspo'Actif</button>
        </div>
      </div>
    </div>`;
  }

  function assurerModal() {
    if (document.getElementById('da-sda-modal-bg')) return;
    const div = document.createElement('div');
    div.innerHTML = modalHTML();
    document.body.appendChild(div.firstElementChild);
  }

  function render(mountEl, opts) {
    if (!mountEl) return;
    _mount = mountEl;
    _opts = opts || {};
    assurerModal();
    mountEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
        <div>
          <h2 style="margin:0;">📤 Soumettre un projet à Diaspo'Actif</h2>
          <p style="margin:4px 0 0;color:var(--muted);font-size:13px;">Diaspo'Actif étudie votre dossier et, si pertinent, vous oriente vers un partenaire de son réseau.</p>
        </div>
        <button class="btn btn-orange" onclick="SoumissionDA.ouvrirNouveau()">+ Nouveau dossier</button>
      </div>
      <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:6px;margin-bottom:20px;" id="da-sda-filters">
        <button class="da-sda-filter active" data-f="">Tous</button>
        ${Object.entries(STATUT_LABELS).map(([k, l]) => `<button class="da-sda-filter" data-f="${k}">${esc(l)}</button>`).join('')}
      </div>
      <div id="da-sda-list"><div style="text-align:center;padding:30px;color:var(--muted);">Chargement…</div></div>
      <style>
        .da-sda-filter { background:var(--bg);border:1px solid var(--border);border-radius:99px;padding:5px 14px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap; }
        .da-sda-filter.active { background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;border-color:#2563EB; }
        .da-sda-card { background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px; }
        .da-sda-card:hover { border-color:#2563EB; }
      </style>`;
    mountEl.querySelectorAll('.da-sda-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        _filtre = btn.dataset.f;
        mountEl.querySelectorAll('.da-sda-filter').forEach(b => b.classList.toggle('active', b === btn));
        renderListe();
      });
    });
  }

  async function load() {
    if (!_mount) return;
    try {
      const r = await api('GET', '/projets');
      _dossiers = (r.projets || []).filter(p => p.type === 'soumission_da');
      renderListe();
    } catch (e) {
      if (e.status === 402) { renderPaywall(e.data && e.data.accred_type); return; }
      const el = document.getElementById('da-sda-list');
      if (el) el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Impossible de charger vos dossiers.</p>';
    }
  }

  function renderPaywall(accredType) {
    const filtersEl = document.getElementById('da-sda-filters');
    if (filtersEl) filtersEl.style.display = 'none';
    const el = document.getElementById('da-sda-list');
    if (!el) return;
    if (typeof window.SubscriptionRequiredPage === 'function') {
      window.SubscriptionRequiredPage(el, {
        moduleName: "Soumettre un projet à Diaspo'Actif",
        moduleIcon: '📤', moduleIllustration: '📤',
        moduleDescription: "Soumettez votre dossier à l'équipe Diaspo'Actif, qui l'analyse et peut vous orienter vers un partenaire de son réseau.",
        fonctionnalites: [
          'Déposer un dossier complet avec pièces jointes',
          "Suivre en temps réel l'analyse de Diaspo'Actif",
          "Recevoir un retour détaillé et répondre aux demandes d'informations",
          'Être orienté vers un partenaire pertinent le cas échéant',
        ],
        accredType: accredType || _opts.accredType || 'utilisateur_abonne',
      });
    } else {
      el.innerHTML = `<div class="card" style="text-align:center;padding:30px;">
        <p style="margin:0 0 12px;">🔒 Ce module est réservé aux comptes Abonné.</p>
        <a href="premium.html" class="btn btn-orange">Découvrir les abonnements →</a>
      </div>`;
    }
  }

  function renderListe() {
    const el = document.getElementById('da-sda-list');
    if (!el) return;
    const rows = _filtre ? _dossiers.filter(p => p.statut === _filtre) : _dossiers;
    if (!rows.length) {
      el.innerHTML = '<p style="color:var(--muted);font-size:13px;text-align:center;padding:20px 0;">Aucun dossier pour l\'instant. <button class="btn btn-orange btn-sm" onclick="SoumissionDA.ouvrirNouveau()">Créer →</button></p>';
      return;
    }
    el.innerHTML = rows.map(p => `
      <div class="da-sda-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
          <div>
            <strong>${esc(p.titre)}</strong>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">${[p.pays, p.ville].filter(Boolean).map(esc).join(', ') || '—'} · Mis à jour le ${fmtDate(p.updated_at)}</div>
          </div>
          <span style="font-size:11px;font-weight:700;padding:2px 9px;border-radius:99px;background:${STATUT_COLORS[p.statut] || '#f1f5f9;color:#475569'};">${STATUT_LABELS[p.statut] || esc(p.statut)}</span>
        </div>
        <div style="display:flex;gap:8px;margin-top:10px;">
          <button class="btn btn-outline btn-sm" onclick="SoumissionDA.ouvrirEdition(${p.id})">Ouvrir</button>
          ${p.statut === 'brouillon' ? `<button class="btn btn-outline btn-sm" onclick="SoumissionDA.supprimer(${p.id})" style="color:#B91C1C;">Supprimer</button>` : ''}
        </div>
      </div>`).join('');
  }

  function viderFormulaire() {
    document.getElementById('da-sda-titre').value = '';
    document.getElementById('da-sda-presentation').value = '';
    document.getElementById('da-sda-description').value = '';
    document.getElementById('da-sda-categorie').value = 'Général';
    document.getElementById('da-sda-niveau').value = 'idee';
    document.getElementById('da-sda-pays').value = '';
    document.getElementById('da-sda-ville').value = '';
    document.getElementById('da-sda-territoire').value = '';
    document.getElementById('da-sda-budget').value = '';
    document.getElementById('da-sda-debut').value = '';
    document.getElementById('da-sda-fin').value = '';
    document.getElementById('da-sda-objectifs').value = '';
    document.getElementById('da-sda-public').value = '';
    document.getElementById('da-sda-infos').value = '';
    document.getElementById('da-sda-besoins-autres').value = '';
    document.getElementById('da-sda-besoins-autres').style.display = 'none';
    document.querySelectorAll('.da-sda-besoin-chk').forEach(c => c.checked = false);
    document.getElementById('da-sda-error').style.display = 'none';
    document.getElementById('da-sda-lock-note').style.display = 'none';
  }

  function remplirFormulaire(p) {
    document.getElementById('da-sda-titre').value = p.titre || '';
    document.getElementById('da-sda-presentation').value = p.presentation || '';
    document.getElementById('da-sda-description').value = p.description || '';
    document.getElementById('da-sda-categorie').value = p.categorie || 'Général';
    document.getElementById('da-sda-niveau').value = p.niveau_avancement || 'idee';
    document.getElementById('da-sda-pays').value = p.pays || '';
    document.getElementById('da-sda-ville').value = p.ville || '';
    document.getElementById('da-sda-territoire').value = p.territoire_concerne || '';
    document.getElementById('da-sda-budget').value = p.budget_estime || '';
    document.getElementById('da-sda-debut').value = (p.date_debut || '').slice(0, 10);
    document.getElementById('da-sda-fin').value = (p.date_fin || '').slice(0, 10);
    document.getElementById('da-sda-objectifs').value = p.objectifs || '';
    document.getElementById('da-sda-public').value = p.public_concerne || '';
    document.getElementById('da-sda-infos').value = p.infos_complementaires || '';
    let besoins = [];
    try { besoins = JSON.parse(p.besoins || '[]'); } catch (e) {}
    document.querySelectorAll('.da-sda-besoin-chk').forEach(c => c.checked = besoins.includes(c.value));
    document.getElementById('da-sda-besoins-autres').value = p.besoins_autres_precisions || '';
    document.getElementById('da-sda-besoins-autres').style.display = besoins.includes('autre') ? '' : 'none';
  }

  function majBesoinsAutres() {
    const autreCoche = Array.from(document.querySelectorAll('.da-sda-besoin-chk')).some(c => c.value === 'autre' && c.checked);
    document.getElementById('da-sda-besoins-autres').style.display = autreCoche ? '' : 'none';
  }

  function ouvrirNouveau() {
    assurerModal();
    _current = null;
    viderFormulaire();
    document.getElementById('da-sda-docs-section').style.display = 'none';
    document.getElementById('da-sda-btn-brouillon').style.display = '';
    document.getElementById('da-sda-btn-soumettre').style.display = '';
    document.getElementById('da-sda-modal-bg').style.display = 'flex';
  }

  async function ouvrirEdition(id) {
    assurerModal();
    document.getElementById('da-sda-modal-bg').style.display = 'flex';
    document.getElementById('da-sda-error').style.display = 'none';
    try {
      const r = await api('GET', '/projets/' + id);
      const p = r.projet;
      _current = id;
      remplirFormulaire(p);
      const modifiable = p.statut === 'brouillon' || p.statut === 'soumis';
      document.getElementById('da-sda-lock-note').style.display = modifiable ? 'none' : '';
      if (!modifiable) document.getElementById('da-sda-lock-note').textContent = "Ce dossier est en cours d'analyse par Diaspo'Actif : il n'est plus modifiable, mais reste consultable.";
      Array.from(document.querySelectorAll('#da-sda-modal-bg input, #da-sda-modal-bg textarea, #da-sda-modal-bg select')).forEach(f => { if (f.id !== 'da-sda-docs-input') f.disabled = !modifiable; });
      document.getElementById('da-sda-btn-brouillon').style.display = modifiable ? '' : 'none';
      document.getElementById('da-sda-btn-soumettre').style.display = (modifiable && p.statut === 'brouillon') ? '' : 'none';
      document.getElementById('da-sda-docs-section').style.display = '';
      renderDocuments(r.documents || [], modifiable);
    } catch (e) {
      document.getElementById('da-sda-error').textContent = e.message || 'Dossier introuvable.';
      document.getElementById('da-sda-error').style.display = 'block';
    }
  }

  function renderDocuments(docs, modifiable) {
    const el = document.getElementById('da-sda-docs-list');
    document.getElementById('da-sda-docs-input').style.display = modifiable ? '' : 'none';
    if (!docs.length) { el.innerHTML = '<p style="color:var(--muted);">Aucun document joint.</p>'; return; }
    el.innerHTML = docs.map(d => `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
        <a href="${esc(d.url_bunny)}" target="_blank" rel="noopener">📄 ${esc(d.nom_fichier)}</a>
        ${modifiable ? `<button onclick="SoumissionDA.supprimerDocument(${d.id})" style="background:none;border:none;color:#B91C1C;cursor:pointer;">✕</button>` : ''}
      </div>`).join('');
  }

  function collecterFormulaire() {
    const besoins = Array.from(document.querySelectorAll('.da-sda-besoin-chk')).filter(c => c.checked).map(c => c.value);
    return {
      titre: document.getElementById('da-sda-titre').value.trim(),
      type: 'soumission_da',
      presentation: document.getElementById('da-sda-presentation').value.trim(),
      description: document.getElementById('da-sda-description').value.trim(),
      categorie: document.getElementById('da-sda-categorie').value,
      niveau_avancement: document.getElementById('da-sda-niveau').value,
      pays: document.getElementById('da-sda-pays').value.trim(),
      ville: document.getElementById('da-sda-ville').value.trim(),
      territoire_concerne: document.getElementById('da-sda-territoire').value.trim(),
      budget_estime: document.getElementById('da-sda-budget').value || null,
      date_debut: document.getElementById('da-sda-debut').value || null,
      date_fin: document.getElementById('da-sda-fin').value || null,
      objectifs: document.getElementById('da-sda-objectifs').value.trim(),
      public_concerne: document.getElementById('da-sda-public').value.trim(),
      infos_complementaires: document.getElementById('da-sda-infos').value.trim(),
      besoins,
      besoins_autres_precisions: document.getElementById('da-sda-besoins-autres').value.trim(),
    };
  }

  async function enregistrerBrouillon(silencieux) {
    const errEl = document.getElementById('da-sda-error');
    errEl.style.display = 'none';
    const corps = collecterFormulaire();
    if (!corps.titre) { errEl.textContent = 'Le titre est obligatoire.'; errEl.style.display = 'block'; return false; }
    try {
      if (_current) {
        await api('PUT', '/projets/' + _current, corps);
      } else {
        const r = await api('POST', '/projets', corps);
        _current = r.id;
        document.getElementById('da-sda-docs-section').style.display = '';
        renderDocuments([], true);
      }
      if (!silencieux) { fermer(); await load(); }
      return true;
    } catch (e) {
      errEl.textContent = e.message || "Impossible d'enregistrer.";
      errEl.style.display = 'block';
      return false;
    }
  }

  async function soumettre() {
    const ok = await enregistrerBrouillon(true);
    if (!ok || !_current) return;
    try {
      await api('PUT', '/projets/' + _current + '/statut', { statut: 'soumis', commentaire: 'Soumission du dossier à Diaspo\'Actif' });
      fermer();
      await load();
    } catch (e) {
      const errEl = document.getElementById('da-sda-error');
      errEl.textContent = e.message || 'Impossible de soumettre le dossier.';
      errEl.style.display = 'block';
    }
  }

  async function televerserDocument(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!_current) { const ok = await enregistrerBrouillon(true); if (!ok) return; }
    const fd = new FormData();
    fd.append('document', file, file.name);
    fd.append('projet_id', String(_current));
    fd.append('categorie', 'dossier_initial');
    try {
      const res = await fetch((window.API_BASE || '/api') + '/projets/soumission-da/upload', { method: 'POST', credentials: 'same-origin', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erreur lors du téléversement.');
      input.value = '';
      const r = await api('GET', '/projets/' + _current);
      renderDocuments(r.documents || [], true);
    } catch (e) {
      const errEl = document.getElementById('da-sda-error');
      errEl.textContent = e.message; errEl.style.display = 'block';
    }
  }

  async function supprimerDocument(docId) {
    try {
      await api('DELETE', '/projets/documents/' + docId);
      const r = await api('GET', '/projets/' + _current);
      renderDocuments(r.documents || [], true);
    } catch (e) { alert(e.message || 'Suppression impossible.'); }
  }

  async function supprimer(id) {
    if (!confirm('Supprimer définitivement ce brouillon ?')) return;
    try { await api('DELETE', '/projets/' + id); await load(); } catch (e) { alert(e.message || 'Suppression impossible.'); }
  }

  function fermer() {
    const bg = document.getElementById('da-sda-modal-bg');
    if (bg) bg.style.display = 'none';
    _current = null;
  }

  window.SoumissionDA = {
    render, load, ouvrirNouveau, ouvrirEdition, fermer,
    enregistrerBrouillon, soumettre, televerserDocument, supprimerDocument, supprimer,
    majBesoinsAutres,
  };
})();

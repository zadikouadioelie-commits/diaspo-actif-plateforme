/* ===========================================================================
   RECHERCHE DE CONTACTS — barre "trouver une personne ou une initiative"
   façon recherche d'amis, visible uniquement sur son propre profil.
   Usage : RechercheContacts.mount(containerEl)
=========================================================================== */
(function () {
  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  const STATUT_BADGE = {
    contact: { label: "✅ Déjà en relation", cls: "background:#DCFCE7;color:#166534;" },
    envoyee: { label: "⏳ Demande envoyée", cls: "background:#FEF3C7;color:#92400E;" },
    recue: { label: "📩 Vous a contacté", cls: "background:#DBEAFE;color:#1E40AF;" },
    aucune: { label: "", cls: "" },
  };

  function card(r) {
    const badge = STATUT_BADGE[r.statut_relation] || STATUT_BADGE.aucune;
    const initiales = esc((r.nom || "?").trim().slice(0, 2).toUpperCase());
    const avatar = r.photo_url
      ? `<img src="${esc(r.photo_url)}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">`
      : `<div style="width:48px;height:48px;border-radius:50%;background:var(--border,#e2e2e2);display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--muted,#888);">${initiales}</div>`;

    const action = r.statut_relation === "contact"
      ? `<a href="${esc(r.lien)}" class="btn btn-outline btn-sm">Voir le profil</a>`
      : r.statut_relation === "envoyee"
      ? `<button type="button" class="btn btn-outline btn-sm" disabled>Demande envoyée</button>`
      : `<button type="button" class="btn btn-orange btn-sm" onclick="window.DemandeContact && window.DemandeContact.open(${Number(r.target_user_id)}, '${esc(r.nom).replace(/'/g, "\\'")}')">🤝 Mise en relation</button>`;

    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border,#eee);">
        <a href="${esc(r.lien)}" style="flex-shrink:0;">${avatar}</a>
        <div style="flex:1;min-width:0;">
          <a href="${esc(r.lien)}" style="font-weight:700;font-size:13.5px;color:var(--text,#111);text-decoration:none;">${esc(r.nom)}</a>
          <span style="font-size:11px;color:var(--muted,#888);margin-left:6px;">${esc(r.sous_titre)}</span>
          <div style="font-size:11.5px;color:var(--muted,#888);margin-top:1px;">${esc(r.lieu || "")}</div>
          ${badge.label ? `<span style="display:inline-block;margin-top:3px;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:99px;${badge.cls}">${badge.label}</span>` : ""}
        </div>
        <div style="flex-shrink:0;">${action}</div>
      </div>`;
  }

  let _debounce = null;
  async function doSearch(input, resultsEl) {
    const q = input.value.trim();
    if (q.length < 2) { resultsEl.innerHTML = ""; resultsEl.style.display = "none"; return; }
    resultsEl.style.display = "block";
    resultsEl.innerHTML = `<p style="color:var(--muted,#888);font-size:12.5px;padding:8px 0;">Recherche…</p>`;
    try {
      const data = await api("GET", "/recherche-contacts?q=" + encodeURIComponent(q));
      const results = data.results || [];
      const bandeauReseauVide = data.source === "global"
        ? `<p style="background:#FEF3C7;color:#92400E;font-size:11.5px;font-weight:600;padding:6px 10px;border-radius:8px;margin-bottom:6px;">Aucun résultat trouvé dans votre réseau. Voici les résultats disponibles sur Diaspo'Actif.</p>`
        : "";
      resultsEl.innerHTML = results.length
        ? bandeauReseauVide + results.map(card).join("")
        : `<p style="color:var(--muted,#888);font-size:12.5px;padding:8px 0;">Aucun résultat pour « ${esc(q)} ».</p>`;
    } catch (e) {
      resultsEl.innerHTML = `<p style="color:red;font-size:12.5px;">Erreur de recherche.</p>`;
    }
  }

  function mount(container) {
    if (!container || container.dataset.rcMounted) return;
    container.dataset.rcMounted = "1";
    container.innerHTML = `
      <div style="margin-bottom:8px;">
        <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">🔎 Trouver une personne ou une initiative</label>
        <input type="text" id="rc-input" class="input-field" placeholder="Chercher par nom…" style="width:100%;" autocomplete="off">
      </div>
      <div id="rc-results" style="display:none;max-height:340px;overflow:auto;"></div>
    `;
    const input = container.querySelector("#rc-input");
    const resultsEl = container.querySelector("#rc-results");
    input.addEventListener("input", () => {
      clearTimeout(_debounce);
      _debounce = setTimeout(() => doSearch(input, resultsEl), 350);
    });
  }

  window.RechercheContacts = { mount };
})();

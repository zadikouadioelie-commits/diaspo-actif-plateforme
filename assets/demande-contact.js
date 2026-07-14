/* ===========================================================================
   MISE EN RELATION — modal partagé, utilisé depuis tout profil public
   (membre, initiative, collectivité) pour remplacer le premier message privé
   par une demande de mise en relation soumise au consentement du destinataire.
=========================================================================== */
(function () {
  let _cfg = null;
  let _modal = null;

  async function getConfig() {
    if (_cfg) return _cfg;
    try { _cfg = await api("GET", "/demandes-contact/config"); }
    catch (e) { _cfg = { motifs: ["Demande d'informations", "Échange institutionnel", "Autre"], longueur_max_message: 600 }; }
    return _cfg;
  }

  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function buildModal() {
    if (document.getElementById("dc-modal")) return;
    const modal = document.createElement("div");
    modal.id = "dc-modal";
    modal.className = "modal-overlay";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="modal-box" style="max-width:480px;width:94%;max-height:88vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
          <h3 style="margin:0;">🤝 Mise en relation</h3>
          <button type="button" id="dc-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted,#888);">✕</button>
        </div>
        <p id="dc-dest" style="margin:0 0 14px;font-size:13px;color:var(--muted,#888);"></p>
        <div id="dc-step-form">
          <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">Objet *</label>
          <input id="dc-objet" class="input-field" maxlength="120" placeholder="Ex. Proposition de partenariat sur le projet X" style="width:100%;margin-bottom:10px;">
          <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">Motif *</label>
          <select id="dc-motif" class="input-field" style="width:100%;margin-bottom:4px;"></select>
          <input id="dc-motif-autre" class="input-field" placeholder="Précisez le motif…" style="width:100%;margin:6px 0 10px;display:none;">
          <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">Message de présentation *</label>
          <textarea id="dc-message" class="input-field" rows="5" style="width:100%;resize:vertical;" placeholder="Contexte, attentes, bénéfices éventuels pour le destinataire…"></textarea>
          <div id="dc-counter" style="text-align:right;font-size:11px;color:var(--muted,#888);margin:2px 0 10px;">0 / 600</div>
          <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">Image d'illustration (optionnel)</label>
          <div id="dc-image-wrap" style="margin-bottom:12px;">
            <input type="file" id="dc-image-input" accept="image/*" style="display:none;">
            <button type="button" id="dc-image-btn" class="btn btn-outline btn-sm">📷 Ajouter une image</button>
            <div id="dc-image-preview" style="display:none;margin-top:8px;position:relative;width:fit-content;">
              <img style="max-width:100%;max-height:140px;border-radius:10px;display:block;">
              <button type="button" id="dc-image-remove" style="position:absolute;top:4px;right:4px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:22px;height:22px;cursor:pointer;font-size:12px;">✕</button>
            </div>
          </div>
          <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">Niveau d'urgence (optionnel)</label>
          <select id="dc-urgence" class="input-field" style="width:100%;margin-bottom:14px;">
            <option value="faible">Faible</option>
            <option value="normal" selected>Normal</option>
            <option value="important">Important</option>
            <option value="urgent">Urgent</option>
          </select>
          <div id="dc-ia-remarques" style="display:none;background:#FFF7ED;border:1px solid #F9D9A8;border-radius:10px;padding:10px 12px;font-size:12.5px;margin-bottom:12px;"></div>
          <label style="font-size:12px;display:flex;gap:8px;align-items:flex-start;margin-bottom:14px;color:var(--muted,#888);">
            <input type="checkbox" id="dc-charte" style="margin-top:3px;">
            <span>Je confirme que cette demande respecte la Charte Diaspo'Actif, ne constitue pas un démarchage commercial abusif, et que les informations fournies sont exactes.</span>
          </label>
          <div style="display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" id="dc-cancel" class="btn btn-outline">Annuler</button>
            <button type="button" id="dc-submit" class="btn btn-orange">Envoyer la demande</button>
          </div>
        </div>
        <div id="dc-step-done" style="display:none;text-align:center;padding:20px 0;">
          <div style="font-size:38px;margin-bottom:10px;">✅</div>
          <div style="font-weight:700;margin-bottom:6px;">Demande envoyée</div>
          <div style="font-size:13px;color:var(--muted,#888);margin-bottom:16px;">La conversation ne s'ouvrira qu'après acceptation explicite du destinataire.</div>
          <button type="button" id="dc-done-close" class="btn btn-orange">Fermer</button>
        </div>
      </div>`;
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);
    _modal = modal;

    modal.querySelector("#dc-close").addEventListener("click", closeModal);
    modal.querySelector("#dc-cancel").addEventListener("click", closeModal);
    modal.querySelector("#dc-done-close").addEventListener("click", closeModal);
    modal.querySelector("#dc-motif").addEventListener("change", (e) => {
      modal.querySelector("#dc-motif-autre").style.display = e.target.value === "Autre" ? "block" : "none";
    });
    modal.querySelector("#dc-message").addEventListener("input", (e) => {
      const max = Number(modal.dataset.maxlen || 600);
      modal.querySelector("#dc-counter").textContent = `${e.target.value.length} / ${max}`;
    });
    modal.querySelector("#dc-image-btn").addEventListener("click", () => modal.querySelector("#dc-image-input").click());
    modal.querySelector("#dc-image-input").addEventListener("change", onImageSelected);
    modal.querySelector("#dc-image-remove").addEventListener("click", () => {
      modal.dataset.imageUrl = "";
      modal.querySelector("#dc-image-input").value = "";
      modal.querySelector("#dc-image-preview").style.display = "none";
      modal.querySelector("#dc-image-btn").style.display = "inline-flex";
    });
    modal.querySelector("#dc-submit").addEventListener("click", submit);
  }

  async function onImageSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    const modal = document.getElementById("dc-modal");
    const btn = modal.querySelector("#dc-image-btn");
    btn.disabled = true; btn.textContent = "Envoi de l'image…";
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/post", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec de l'envoi de l'image.");
      modal.dataset.imageUrl = data.url;
      const preview = modal.querySelector("#dc-image-preview");
      preview.querySelector("img").src = data.url;
      preview.style.display = "block";
      btn.style.display = "none";
    } catch (err) {
      alert("Erreur : " + err.message);
    } finally {
      btn.disabled = false; btn.textContent = "📷 Ajouter une image";
    }
  }

  function closeModal() { if (_modal) _modal.style.display = "none"; }

  let _destinataireId = null;
  async function open(destinataireId, destinataireNom) {
    buildModal();
    _destinataireId = destinataireId;
    const cfg = await getConfig();
    const modal = document.getElementById("dc-modal");
    modal.dataset.maxlen = cfg.longueur_max_message || 600;
    modal.dataset.imageUrl = "";
    modal.querySelector("#dc-dest").textContent = `Destinataire : ${destinataireNom || "ce compte"}`;
    modal.querySelector("#dc-objet").value = "";
    modal.querySelector("#dc-motif").innerHTML = (cfg.motifs || []).map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join("");
    modal.querySelector("#dc-motif-autre").style.display = "none";
    modal.querySelector("#dc-motif-autre").value = "";
    modal.querySelector("#dc-message").value = "";
    modal.querySelector("#dc-counter").textContent = `0 / ${cfg.longueur_max_message || 600}`;
    modal.querySelector("#dc-image-input").value = "";
    modal.querySelector("#dc-image-preview").style.display = "none";
    modal.querySelector("#dc-image-btn").style.display = "inline-flex";
    modal.querySelector("#dc-urgence").value = "normal";
    modal.querySelector("#dc-charte").checked = false;
    modal.querySelector("#dc-ia-remarques").style.display = "none";
    modal.querySelector("#dc-step-form").style.display = "block";
    modal.querySelector("#dc-step-done").style.display = "none";
    modal.style.display = "flex";
  }

  async function submit() {
    const modal = document.getElementById("dc-modal");
    const objet = modal.querySelector("#dc-objet").value.trim();
    const motif = modal.querySelector("#dc-motif").value;
    const motifAutre = modal.querySelector("#dc-motif-autre").value.trim();
    const message = modal.querySelector("#dc-message").value.trim();
    const urgence = modal.querySelector("#dc-urgence").value;
    const charte = modal.querySelector("#dc-charte").checked;
    const imageUrl = modal.dataset.imageUrl || undefined;

    if (!objet) { alert("Merci de préciser l'objet de la demande."); return; }
    if (!message) { alert("Merci de rédiger un message."); return; }
    if (motif === "Autre" && !motifAutre) { alert("Merci de préciser le motif."); return; }
    if (!charte) { alert("Merci de confirmer le respect de la Charte avant l'envoi."); return; }

    const btn = modal.querySelector("#dc-submit");
    btn.disabled = true; btn.textContent = "Analyse…";
    try {
      const avis = await api("POST", "/demandes-contact/analyser", { motif, message }).catch(() => null);
      const remEl = modal.querySelector("#dc-ia-remarques");
      if (avis && !avis.ok && !modal.dataset.iaConfirmed) {
        remEl.style.display = "block";
        remEl.innerHTML = `<strong>💡 Avant d'envoyer :</strong><ul style="margin:6px 0 0;padding-left:18px;">${avis.remarques.map(r => `<li>${esc(r)}</li>`).join("")}</ul>`;
        modal.dataset.iaConfirmed = "1";
        btn.disabled = false; btn.textContent = "Envoyer quand même";
        return;
      }
      delete modal.dataset.iaConfirmed;
      btn.textContent = "Envoi…";
      await api("POST", "/demandes-contact", { destinataire_id: _destinataireId, objet, motif, motif_autre: motifAutre || undefined, message, image_url: imageUrl, urgence });
      modal.querySelector("#dc-step-form").style.display = "none";
      modal.querySelector("#dc-step-done").style.display = "block";
    } catch (e) {
      alert("Erreur : " + (e.message || "impossible d'envoyer la demande."));
    } finally {
      btn.disabled = false; btn.textContent = "Envoyer la demande";
    }
  }

  window.DemandeContact = { open };
})();

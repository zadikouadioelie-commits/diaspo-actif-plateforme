/* ===========================================================================
   SUPPORT TECHNIQUE — bouton flottant présent sur toutes les pages (chargé
   dynamiquement par assets/app.js). Distinct du chatbot "Parler à
   Diaspo'Actif" : exclusivement pour signaler un dysfonctionnement.
=========================================================================== */
(function () {
  const CATEGORIES = ["Bug", "Erreur d'affichage", "Fonction indisponible", "Erreur lors d'un enregistrement", "Problème de connexion", "Paiement", "Notification", "Téléchargement", "Importation", "Performance", "Autre"];

  function esc(s) { const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  function detectBrowser() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua)) return "Edge";
    if (/OPR\//.test(ua)) return "Opera";
    if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
    if (/Firefox\//.test(ua)) return "Firefox";
    if (/Safari\//.test(ua) && !/Chrome/.test(ua)) return "Safari";
    return ua.slice(0, 60);
  }
  function detectOS() {
    const p = navigator.userAgent;
    if (/Windows/.test(p)) return "Windows";
    if (/Mac OS X/.test(p)) return "macOS";
    if (/Android/.test(p)) return "Android";
    if (/iPhone|iPad|iOS/.test(p)) return "iOS";
    if (/Linux/.test(p)) return "Linux";
    return "Inconnu";
  }
  function detectModule() {
    const seg = location.pathname.split("/").pop().replace(".html", "") || "accueil";
    const titre = document.title.replace(/Diaspo'Actif\s*—?\s*/i, "").trim();
    return titre || seg;
  }

  function buildButton() {
    if (document.getElementById("st-fab")) return;
    const btn = document.createElement("button");
    btn.id = "st-fab";
    btn.type = "button";
    btn.title = "Support technique";
    btn.innerHTML = "🛠️";
    btn.addEventListener("click", openModal);
    document.body.appendChild(btn);

    const style = document.createElement("style");
    style.textContent = `
      #st-fab{
        position:fixed;bottom:20px;left:20px;z-index:1098;
        width:48px;height:48px;border-radius:50%;border:none;
        background:linear-gradient(135deg,#DC2626,#991B1B);color:#fff;
        font-size:22px;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.28);
        display:flex;align-items:center;justify-content:center;
      }
      @media (max-width:600px){ #st-fab{ bottom:88px; left:14px; width:44px; height:44px; font-size:19px; } }
    `;
    document.head.appendChild(style);
  }

  function buildModal() {
    if (document.getElementById("st-modal")) return;
    const modal = document.createElement("div");
    modal.id = "st-modal";
    modal.className = "modal-overlay";
    modal.style.display = "none";
    modal.innerHTML = `
      <div class="modal-box" style="max-width:480px;width:94%;max-height:88vh;overflow:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
          <h3 style="margin:0;">🛠️ Support technique</h3>
          <button type="button" id="st-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted,#888);">✕</button>
        </div>
        <div id="st-step-form">
          <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;padding:10px 12px;font-size:12.5px;color:#7F1D1D;margin-bottom:14px;">
            <strong>Vous rencontrez un dysfonctionnement ?</strong><br>
            Ce formulaire est exclusivement destiné à signaler un problème technique concernant le fonctionnement de la plateforme Diaspo'Actif.<br>
            Pour une question générale, un partenariat ou un accompagnement, utilisez plutôt <strong>« Parler à Diaspo'Actif »</strong>.
          </div>
          <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">Catégorie *</label>
          <select id="st-categorie" class="input-field" style="width:100%;margin-bottom:10px;">
            ${CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
          </select>
          <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">Gravité</label>
          <select id="st-gravite" class="input-field" style="width:100%;margin-bottom:10px;">
            <option value="faible">Faible</option>
            <option value="moyenne" selected>Moyenne</option>
            <option value="importante">Importante</option>
            <option value="critique">Critique</option>
          </select>
          <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">Description *</label>
          <textarea id="st-description" class="input-field" rows="5" style="width:100%;resize:vertical;" placeholder="Ce que vous essayiez de faire, ce qui s'est passé, ce que vous attendiez…"></textarea>
          <div id="st-counter" style="text-align:right;font-size:11px;color:var(--muted,#888);margin:2px 0 10px;">0 / 3000</div>
          <label style="font-size:12.5px;font-weight:700;display:block;margin-bottom:4px;">Captures d'écran (optionnel, jusqu'à 5)</label>
          <input type="file" id="st-files-input" accept="image/*" multiple style="display:none;">
          <button type="button" id="st-files-btn" class="btn btn-outline btn-sm">📷 Ajouter des captures</button>
          <div id="st-files-preview" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;"></div>
          <div style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end;">
            <button type="button" id="st-cancel" class="btn btn-outline">Annuler</button>
            <button type="button" id="st-submit" class="btn btn-orange">Envoyer le signalement</button>
          </div>
        </div>
        <div id="st-step-done" style="display:none;text-align:center;padding:20px 0;">
          <div style="font-size:38px;margin-bottom:10px;">✅</div>
          <div style="font-weight:700;margin-bottom:6px;">Signalement envoyé</div>
          <div id="st-numero" style="font-size:20px;font-weight:800;color:#DC2626;margin-bottom:10px;"></div>
          <div style="font-size:13px;color:var(--muted,#888);margin-bottom:16px;">Notre équipe technique va analyser votre signalement.</div>
          <button type="button" id="st-done-close" class="btn btn-orange">Fermer</button>
        </div>
      </div>`;
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    document.body.appendChild(modal);

    modal.querySelector("#st-close").addEventListener("click", closeModal);
    modal.querySelector("#st-cancel").addEventListener("click", closeModal);
    modal.querySelector("#st-done-close").addEventListener("click", closeModal);
    modal.querySelector("#st-description").addEventListener("input", (e) => {
      modal.querySelector("#st-counter").textContent = `${e.target.value.length} / 3000`;
    });
    modal.querySelector("#st-files-btn").addEventListener("click", () => modal.querySelector("#st-files-input").click());
    modal.querySelector("#st-files-input").addEventListener("change", onFilesSelected);
    modal.querySelector("#st-submit").addEventListener("click", submit);
  }

  let _screenshots = [];
  async function onFilesSelected(e) {
    const modal = document.getElementById("st-modal");
    const preview = modal.querySelector("#st-files-preview");
    const files = [...e.target.files].slice(0, 5 - _screenshots.length);
    for (const file of files) {
      const thumb = document.createElement("div");
      thumb.style.cssText = "width:56px;height:56px;border-radius:8px;background:#eee;display:flex;align-items:center;justify-content:center;font-size:11px;overflow:hidden;position:relative;";
      thumb.textContent = "…";
      preview.appendChild(thumb);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/upload/post", { method: "POST", body: fd, credentials: "include" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Échec de l'envoi.");
        _screenshots.push(data.url);
        thumb.innerHTML = `<img src="${data.url}" style="width:100%;height:100%;object-fit:cover;">`;
      } catch (err) {
        thumb.textContent = "❌";
        thumb.title = err.message;
      }
    }
    e.target.value = "";
  }

  function closeModal() { const m = document.getElementById("st-modal"); if (m) m.style.display = "none"; }

  function openModal() {
    buildModal();
    _screenshots = [];
    const modal = document.getElementById("st-modal");
    modal.querySelector("#st-categorie").value = CATEGORIES[0];
    modal.querySelector("#st-gravite").value = "moyenne";
    modal.querySelector("#st-description").value = "";
    modal.querySelector("#st-counter").textContent = "0 / 3000";
    modal.querySelector("#st-files-preview").innerHTML = "";
    modal.querySelector("#st-step-form").style.display = "block";
    modal.querySelector("#st-step-done").style.display = "none";
    modal.style.display = "flex";
  }

  async function submit() {
    const modal = document.getElementById("st-modal");
    const categorie = modal.querySelector("#st-categorie").value;
    const gravite = modal.querySelector("#st-gravite").value;
    const description = modal.querySelector("#st-description").value.trim();
    if (!description) { alert("Merci de décrire le problème rencontré."); return; }

    const btn = modal.querySelector("#st-submit");
    btn.disabled = true; btn.textContent = "Envoi…";
    try {
      const r = await api("POST", "/support/tickets", {
        categorie, gravite, description,
        screenshots: _screenshots,
        module_concerne: detectModule(),
        page_url: location.href,
        navigateur: detectBrowser(),
        os: detectOS(),
        app_version: "v2",
      });
      modal.querySelector("#st-numero").textContent = r.numero;
      modal.querySelector("#st-step-form").style.display = "none";
      modal.querySelector("#st-step-done").style.display = "block";
    } catch (e) {
      alert("Erreur : " + (e.message || "impossible d'envoyer le signalement."));
    } finally {
      btn.disabled = false; btn.textContent = "Envoyer le signalement";
    }
  }

  function init() {
    buildButton();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();

/* ═════════════════════════════════════════════════
   assets/formation-diaspora.js — Module premium « Formation Diaspora » (2026-10-31)

   Monté dans le tableau de bord Initiative ET dans celui de l'Utilisateur :
     • « Mes formations » : toutes les formations suivies par ce compte en tant qu'élève (GET /api/mes-inscriptions) ;
     • « Formateur » : réservé aux comptes INITIATIVE — un compte Utilisateur n'a pas cet onglet (et le serveur refuse sa demande).
       L'accès à l'espace formateur s'obtient sur demande, autorisée par Diaspo'Actif (server/formation-demandes-formateur.js).

   Usage : FormationDiaspora.monter(document.getElementById('…'), { role: 'initiative' | 'utilisateur' })
   Dépend de api(method, path, body) défini dans assets/app.js.
   ═════════════════════════════════════════════════ */
(function () {
  "use strict";

  const STATUTS = {
    active: { label: "🟢 En cours", color: "#16a34a" },
    annulee: { label: "⚪ Annulée", color: "#6b7280" },
    expiree: { label: "🔴 Expirée", color: "#dc2626" },
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const dateFr = d => { try { return new Date(String(d).replace(" ", "T")).toLocaleDateString("fr-FR"); } catch (e) { return "—"; } };

  function monter(conteneur, opts) {
    if (!conteneur) return;
    const role = (opts && opts.role) || "utilisateur";
    const peutFormateur = role === "initiative";
    let onglet = "formations";

    conteneur.innerHTML = `
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:6px;">
        <div>
          <h3 style="margin:0;">🎓 Formation Diaspora</h3>
          <p style="margin:2px 0 0;font-size:12.5px;color:var(--muted);">Apprendre • Évoluer • Réussir</p>
        </div>
        <a class="btn btn-outline btn-sm" href="formations.html">Parcourir le catalogue →</a>
      </div>
      <div class="fd-onglets" style="display:flex;gap:6px;margin:14px 0;flex-wrap:wrap;">
        <button type="button" class="btn btn-sm" data-fd-onglet="formations">📚 Mes formations</button>
        ${peutFormateur ? `<button type="button" class="btn btn-sm" data-fd-onglet="formateur">🧑‍🏫 Formateur</button>` : ""}
      </div>
      <div class="fd-corps"></div>`;
    const corps = conteneur.querySelector(".fd-corps");

    function marquerOnglets() {
      conteneur.querySelectorAll("[data-fd-onglet]").forEach(b => {
        const actif = b.dataset.fdOnglet === onglet;
        b.classList.toggle("btn-orange", actif);
        b.classList.toggle("btn-outline", !actif);
      });
    }
    function ouvrir(nom) {
      onglet = nom; marquerOnglets();
      if (nom === "formateur") chargerFormateur(); else chargerFormations();
    }
    conteneur.querySelectorAll("[data-fd-onglet]").forEach(b => b.addEventListener("click", () => ouvrir(b.dataset.fdOnglet)));

    /* ── Mes formations ── */
    async function chargerFormations() {
      corps.innerHTML = `<p style="color:var(--muted);font-size:13px;">Chargement…</p>`;
      try {
        const { inscriptions } = await api("GET", "/mes-inscriptions");
        if (!inscriptions || !inscriptions.length) {
          corps.innerHTML = `<div style="text-align:center;padding:26px 8px;">
            <div style="font-size:34px;">📚</div>
            <p style="color:var(--muted);font-size:13.5px;margin:8px 0 14px;">Vous ne suivez encore aucune formation.</p>
            <a class="btn btn-orange" href="formations.html">Découvrir les formations</a></div>`;
          return;
        }
        corps.innerHTML = inscriptions.map(i => {
          const st = STATUTS[i.statut] || STATUTS.active;
          const pct = Number(i.avancement_pct) || 0;
          return `<div class="card" style="margin-bottom:10px;padding:12px 14px;display:flex;gap:12px;align-items:center;">
            ${i.image_url ? `<img src="${esc(i.image_url)}" alt="" style="width:64px;height:64px;border-radius:8px;object-fit:cover;flex:none;">` : `<div style="width:64px;height:64px;border-radius:8px;background:var(--bg);display:flex;align-items:center;justify-content:center;font-size:24px;flex:none;">🎓</div>`}
            <div style="flex:1;min-width:0;">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px;">
                <strong style="font-size:14px;">${esc(i.titre)}</strong>
                <span style="font-size:11px;font-weight:700;color:${st.color};">${st.label}</span>
              </div>
              <div style="height:5px;background:var(--bg);border-radius:99px;overflow:hidden;margin:5px 0;"><div style="height:100%;width:${pct}%;background:var(--orange);"></div></div>
              <div style="font-size:11.5px;color:var(--muted);display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;">
                <span>${pct}% complété · inscrit le ${i.date_inscription ? dateFr(i.date_inscription) : "—"}</span>
                <a href="suivre-formation.html?id=${Number(i.formation_id)}" style="font-weight:700;">Continuer →</a>
              </div>
            </div>
          </div>`;
        }).join("");
      } catch (e) {
        corps.innerHTML = `<p style="color:#dc2626;font-size:13px;">Impossible de charger vos formations pour le moment.</p>`;
      }
    }

    /* ── Formateur (Initiative seulement) ── */
    async function chargerFormateur() {
      corps.innerHTML = `<p style="color:var(--muted);font-size:13px;">Chargement…</p>`;
      let etat;
      try { etat = await api("GET", "/formateur/demande"); }
      catch (e) { corps.innerHTML = `<p style="color:#dc2626;font-size:13px;">Impossible de charger cet espace pour le moment.</p>`; return; }
      if (!etat.eligible) { corps.innerHTML = `<p style="color:var(--muted);font-size:13px;">L'espace formateur est réservé aux comptes Initiative.</p>`; return; }

      const carte = (icone, titre, texte, actions) => `<div class="card" style="padding:18px;">
        <div style="font-size:30px;margin-bottom:6px;">${icone}</div>
        <h4 style="margin:0 0 6px;">${titre}</h4>
        <p style="margin:0 0 14px;font-size:13.5px;color:var(--muted);line-height:1.55;">${texte}</p>
        <div class="fd-actions" style="display:flex;gap:8px;flex-wrap:wrap;">${actions || ""}</div></div>`;

      if (etat.peut_creer) {
        corps.innerHTML = carte("✅", "Vous êtes formateur",
          "Votre compte peut créer et animer des formations sur Diaspo'Actif.",
          `<button type="button" class="btn btn-orange" data-fd="espace">Ouvrir mon espace formateur</button>`);
        corps.querySelector('[data-fd="espace"]').addEventListener("click", () => {
          if (typeof window.initShowSection === "function") {
            window.initShowSection("formations-gestion");
            if (typeof window.loadMesFormations === "function") window.loadMesFormations();
          } else location.href = "dashboard-initiative.html#formations-gestion";
        });
        return;
      }
      const d = etat.demande;
      if (d && d.statut === "en_attente") {
        corps.innerHTML = carte("⏳", "Demande envoyée",
          `Votre demande du ${dateFr(d.cree_le)} est en attente. Diaspo'Actif vous répondra ici et par notification.`, "");
        return;
      }
      const refusee = d && d.statut === "refusee";
      corps.innerHTML = carte("🧑‍🏫", "Devenir formateur",
        (refusee ? "Votre dernière demande n'a pas été retenue. Vous pouvez en faire une nouvelle. " : "")
        + "L'espace formateur permet de créer et d'animer des formations. Il est ouvert par Diaspo'Actif, sur demande.",
        `<button type="button" class="btn btn-orange" data-fd="demander">Faire la demande pour devenir formateur</button>`);
      const zone = corps.querySelector(".fd-actions");
      corps.querySelector('[data-fd="demander"]').addEventListener("click", () => {
        /* Deuxième clic voulu : la demande ne part qu'après confirmation. */
        zone.innerHTML = `<span style="font-size:13px;align-self:center;">Envoyer votre demande à Diaspo'Actif ?</span>
          <button type="button" class="btn btn-orange" data-fd="confirmer">Oui, envoyer ma demande</button>
          <button type="button" class="btn btn-outline" data-fd="annuler">Annuler</button>`;
        zone.querySelector('[data-fd="annuler"]').addEventListener("click", chargerFormateur);
        zone.querySelector('[data-fd="confirmer"]').addEventListener("click", async (ev) => {
          ev.target.disabled = true;
          try { await api("POST", "/formateur/demande"); }
          catch (e) { alert((e && e.message) || "La demande n'a pas pu être envoyée."); }
          chargerFormateur();
        });
      });
    }

    ouvrir("formations");
    return { ouvrir };
  }

  window.FormationDiaspora = { monter };
})();

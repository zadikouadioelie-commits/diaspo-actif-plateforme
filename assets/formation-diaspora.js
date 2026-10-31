/* ═════════════════════════════════════════════════
   assets/formation-diaspora.js — Modules « Suivi de formation » et accès à « Création de formation » (2026-10-31)

   Deux modules séparés, chacun avec UNE seule fonction :
     • « Suivi de formation » (comptes Utilisateur ET Initiative) : toutes les formations suivies en tant qu'élève → FormationDiaspora.monterSuivi()
     • « Création de formation » (comptes Initiative seulement) : créer et gérer SES formations. Tant que Diaspo'Actif n'a pas autorisé le compte, ce module
       n'affiche que la demande d'accès formateur → FormationDiaspora.monterAccesFormateur() (server/formation-demandes-formateur.js).
       Un compte Utilisateur n'a pas ce module (et le serveur refuse sa demande).

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

  /* ── Suivi de formation : les formations suivies par ce compte ── */
  async function monterSuivi(conteneur) {
    if (!conteneur) return;
    conteneur.innerHTML = `
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px;">
        <div>
          <h3 style="margin:0;">🎓 Suivi de formation</h3>
          <p style="margin:2px 0 0;font-size:12.5px;color:var(--muted);">Toutes les formations que vous suivez · Apprendre • Évoluer • Réussir</p>
        </div>
        <a class="btn btn-outline btn-sm" href="formations.html">Parcourir le catalogue →</a>
      </div>
      <div class="fd-corps"><p style="color:var(--muted);font-size:13px;">Chargement…</p></div>`;
    const corps = conteneur.querySelector(".fd-corps");
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

  /* ── Accès formateur : la demande, tant que le compte n'est pas autorisé ──
     opts.onAutorise : rappelé si le compte se révèle déjà autorisé (le module affiche alors la création). */
  async function monterAccesFormateur(conteneur, opts) {
    if (!conteneur) return;
    conteneur.innerHTML = `<p style="color:var(--muted);font-size:13px;">Chargement…</p>`;
    let etat;
    try { etat = await api("GET", "/formateur/demande"); }
    catch (e) { conteneur.innerHTML = `<p style="color:#dc2626;font-size:13px;">Impossible de charger cet espace pour le moment.</p>`; return; }
    if (!etat.eligible) { conteneur.innerHTML = `<p style="color:var(--muted);font-size:13px;">La création de formations est réservée aux comptes Initiative.</p>`; return; }
    if (etat.peut_creer) { if (opts && typeof opts.onAutorise === "function") opts.onAutorise(); return; }

    const carte = (icone, titre, texte, actions) => `<div class="card" style="padding:18px;">
      <div style="font-size:30px;margin-bottom:6px;">${icone}</div>
      <h4 style="margin:0 0 6px;">${titre}</h4>
      <p style="margin:0 0 14px;font-size:13.5px;color:var(--muted);line-height:1.55;">${texte}</p>
      <div class="fd-actions" style="display:flex;gap:8px;flex-wrap:wrap;">${actions || ""}</div></div>`;

    const d = etat.demande;
    if (d && d.statut === "en_attente") {
      conteneur.innerHTML = carte("⏳", "Demande envoyée",
        `Votre demande du ${dateFr(d.cree_le)} est en attente. Diaspo'Actif vous répondra ici et par notification.`, "");
      return;
    }
    const refusee = d && d.statut === "refusee";
    conteneur.innerHTML = carte("🧑‍🏫", "Devenir formateur",
      (refusee ? "Votre dernière demande n'a pas été retenue. Vous pouvez en faire une nouvelle. " : "")
      + "Pour créer et animer des formations, votre compte doit y être autorisé par Diaspo'Actif : faites-en la demande.",
      `<button type="button" class="btn btn-orange" data-fd="demander">Faire la demande pour devenir formateur</button>`);
    const zone = conteneur.querySelector(".fd-actions");
    conteneur.querySelector('[data-fd="demander"]').addEventListener("click", () => {
      /* Deuxième clic voulu : la demande ne part qu'après confirmation. */
      zone.innerHTML = `<span style="font-size:13px;align-self:center;">Envoyer votre demande à Diaspo'Actif ?</span>
        <button type="button" class="btn btn-orange" data-fd="confirmer">Oui, envoyer ma demande</button>
        <button type="button" class="btn btn-outline" data-fd="annuler">Annuler</button>`;
      zone.querySelector('[data-fd="annuler"]').addEventListener("click", () => monterAccesFormateur(conteneur, opts));
      zone.querySelector('[data-fd="confirmer"]').addEventListener("click", async (ev) => {
        ev.target.disabled = true;
        try { await api("POST", "/formateur/demande"); }
        catch (e) { alert((e && e.message) || "La demande n'a pas pu être envoyée."); }
        monterAccesFormateur(conteneur, opts);
      });
    });
  }

  window.FormationDiaspora = { monterSuivi, monterAccesFormateur };
})();

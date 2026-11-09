/* ═════════════════════════════════════════════════
   assets/contact-externe.js — bouton « Contact » pour les personnes SANS compte (2026-11-09, demande explicite)

   Chargé au premier clic (voir window.ouvrirContactExterne dans assets/app.js).
     ContactExterne.ouvrir(userId, nom)
       → connecté : renvoie vers la messagerie habituelle ;
       → non connecté : « J'ai un compte : me connecter » OU « Je n'ai pas de compte : écrire un message » (formulaire).
   Formulaire : nom, prénom, motif (300 caractères maximum, compteur), e-mail OBLIGATOIRE, téléphone facultatif, consentement.
   Envoi : POST /api/contact-externe (server/contact-externe.js). Fond clair → texte NOIR, partout.
   ═════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (window.ContactExterne) return;

  var MOTIF_MAX = 300;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function injecterStyle() {
    if (document.getElementById("cex-style")) return;
    var st = document.createElement("style");
    st.id = "cex-style";
    st.textContent =
      ".cex-fond{position:fixed;inset:0;z-index:100050;background:rgba(3,6,14,.72);display:flex;align-items:center;justify-content:center;padding:16px;overflow-y:auto}" +
      ".cex-boite{background:#fff;color:#000;border-radius:18px;width:100%;max-width:520px;max-height:94vh;overflow-y:auto;box-shadow:0 30px 70px -20px #000;font-family:Manrope,system-ui,sans-serif}" +
      ".cex-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:20px 22px 6px}" +
      ".cex-titre{margin:0;font-size:20px;font-weight:800;color:#000;line-height:1.25}" +
      ".cex-x{border:0;background:#F1F5F9;color:#000;width:34px;height:34px;border-radius:50%;font-size:18px;cursor:pointer;flex:0 0 auto}" +
      ".cex-corps{padding:8px 22px 22px;color:#000;font-size:14.5px;line-height:1.5}" +
      ".cex-corps p{margin:0 0 14px;color:#000}" +
      ".cex-choix{display:flex;flex-direction:column;gap:10px;margin-top:6px}" +
      ".cex-btn{display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #C9971C;border-radius:12px;padding:13px 16px;font:800 14.5px Manrope,system-ui,sans-serif;cursor:pointer;text-decoration:none;color:#000;background:#fff}" +
      ".cex-btn.or{background:linear-gradient(135deg,#F6D879,#D9A82E);border-color:#C9971C}" +
      ".cex-btn:hover{filter:brightness(.97)}.cex-btn[disabled]{opacity:.65;cursor:progress}" +
      ".cex-lig{display:grid;grid-template-columns:1fr 1fr;gap:10px}" +
      "@media (max-width:480px){.cex-lig{grid-template-columns:1fr}}" +
      ".cex-champ{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}" +
      ".cex-champ label{font-size:13px;font-weight:800;color:#000}" +
      ".cex-champ .cex-opt{font-weight:600;color:#334155}" +
      ".cex-champ input,.cex-champ textarea{width:100%;box-sizing:border-box;border:1.5px solid #94A3B8;border-radius:10px;padding:10px 12px;font:600 15px Manrope,system-ui,sans-serif;color:#000;background:#fff}" +
      ".cex-champ textarea{min-height:110px;resize:vertical}" +
      ".cex-champ input:focus,.cex-champ textarea:focus{outline:2px solid #C9971C;border-color:#C9971C}" +
      ".cex-champ input::placeholder,.cex-champ textarea::placeholder{color:#64748B}" +
      ".cex-cpt{align-self:flex-end;font-size:12px;font-weight:700;color:#334155}.cex-cpt.max{color:#B91C1C}" +
      ".cex-consent{display:flex;gap:9px;align-items:flex-start;font-size:13px;color:#000;margin:4px 0 14px}" +
      ".cex-consent input{margin-top:3px;width:18px;height:18px;flex:0 0 auto}" +
      ".cex-err{background:#FEE2E2;color:#7F1D1D;border:1px solid #FCA5A5;border-radius:10px;padding:10px 12px;font-size:13.5px;font-weight:700;margin-bottom:12px}" +
      ".cex-ok{text-align:center;padding:10px 0 2px}.cex-ok .cex-coche{font-size:42px}" +
      ".cex-piege{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}";
    document.head.appendChild(st);
  }

  var fond = null, courant = null;

  function fermer() {
    if (fond) { fond.remove(); fond = null; }
    document.removeEventListener("keydown", surTouche);
  }
  function surTouche(e) { if (e.key === "Escape") fermer(); }

  function ouvrirBoite(titre, html) {
    injecterStyle();
    if (fond) fond.remove();
    fond = document.createElement("div");
    fond.className = "cex-fond";
    fond.setAttribute("role", "dialog");
    fond.setAttribute("aria-modal", "true");
    fond.setAttribute("aria-label", titre);
    fond.innerHTML = '<div class="cex-boite"><div class="cex-tete"><h2 class="cex-titre">' + esc(titre) +
      '</h2><button type="button" class="cex-x" aria-label="Fermer">✕</button></div><div class="cex-corps">' + html + "</div></div>";
    fond.addEventListener("mousedown", function (e) { if (e.target === fond) fermer(); });
    fond.querySelector(".cex-x").addEventListener("click", fermer);
    document.body.appendChild(fond);
    document.addEventListener("keydown", surTouche);
    return fond;
  }

  function etapeChoix() {
    var nom = courant.nom || "cette personne";
    var retour = location.pathname + location.search;
    var f = ouvrirBoite("Contacter " + nom,
      "<p>Pour écrire à <strong>" + esc(nom) + "</strong>, connectez-vous si vous avez un compte Diaspo'Actif. Sinon, laissez-lui un message : elle vous répondra directement par e-mail ou par téléphone.</p>" +
      '<div class="cex-choix">' +
      '<a class="cex-btn or" id="cex-co" href="login.html?redirect=' + encodeURIComponent(retour) + '">🔑 J\'ai un compte : me connecter</a>' +
      '<button type="button" class="cex-btn" id="cex-ecrire">✉️ Je n\'ai pas de compte : écrire un message</button>' +
      "</div>");
    f.querySelector("#cex-ecrire").addEventListener("click", etapeFormulaire);
  }

  function etapeFormulaire() {
    var nom = courant.nom || "cette personne";
    var f = ouvrirBoite("Écrire à " + nom,
      '<form id="cex-form" novalidate autocomplete="on">' +
      '<div id="cex-err"></div>' +
      '<div class="cex-lig">' +
      '<div class="cex-champ"><label for="cex-nom">Nom</label><input id="cex-nom" name="nom" maxlength="80" autocomplete="family-name" required></div>' +
      '<div class="cex-champ"><label for="cex-prenom">Prénom</label><input id="cex-prenom" name="prenom" maxlength="80" autocomplete="given-name" required></div>' +
      "</div>" +
      '<div class="cex-champ"><label for="cex-motif">Motif de votre demande</label>' +
      '<textarea id="cex-motif" name="motif" maxlength="' + MOTIF_MAX + '" placeholder="Écrivez ce que vous souhaitez dire (' + MOTIF_MAX + ' caractères maximum)" required></textarea>' +
      '<span class="cex-cpt" id="cex-cpt">0 / ' + MOTIF_MAX + "</span></div>" +
      '<div class="cex-champ"><label for="cex-email">Adresse e-mail</label><input id="cex-email" name="email" type="email" maxlength="120" autocomplete="email" placeholder="pour que cette personne puisse vous répondre" required></div>' +
      '<div class="cex-champ"><label for="cex-tel">Numéro de téléphone <span class="cex-opt">(facultatif)</span></label><input id="cex-tel" name="telephone" type="tel" maxlength="24" autocomplete="tel" placeholder="Ex : +33 6 12 34 56 78"></div>' +
      '<div class="cex-piege" aria-hidden="true"><label>Ne pas remplir<input type="text" name="site_perso" tabindex="-1" autocomplete="off"></label></div>' +
      '<label class="cex-consent"><input type="checkbox" id="cex-consent" required><span>J\'accepte que mes coordonnées (nom, prénom, e-mail, téléphone) soient transmises à cette personne pour qu\'elle me recontacte.</span></label>' +
      '<button type="submit" class="cex-btn or" id="cex-envoyer" style="width:100%">📨 Envoyer mon message</button>' +
      "</form>");
    var ts = Date.now();
    var motif = f.querySelector("#cex-motif"), cpt = f.querySelector("#cex-cpt");
    motif.addEventListener("input", function () {
      var n = motif.value.length;
      cpt.textContent = n + " / " + MOTIF_MAX;
      cpt.classList.toggle("max", n >= MOTIF_MAX);
    });
    f.querySelector("#cex-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var q = function (id) { return f.querySelector(id); };
      var err = q("#cex-err"), btn = q("#cex-envoyer");
      var donnees = {
        destinataire_id: Number(courant.userId),
        nom: q("#cex-nom").value.trim(),
        prenom: q("#cex-prenom").value.trim(),
        motif: motif.value.trim(),
        email: q("#cex-email").value.trim(),
        telephone: q("#cex-tel").value.trim(),
        consentement: q("#cex-consent").checked,
        site_perso: f.querySelector('[name="site_perso"]').value,
        _form_ts: ts
      };
      var montrer = function (m) { err.innerHTML = '<div class="cex-err" role="alert">' + esc(m) + "</div>"; err.scrollIntoView({ block: "nearest" }); };
      if (!donnees.nom) return montrer("Indiquez votre nom.");
      if (!donnees.prenom) return montrer("Indiquez votre prénom.");
      if (!donnees.motif) return montrer("Écrivez le motif de votre demande.");
      if (!donnees.email || !/^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test(donnees.email)) return montrer("Indiquez une adresse e-mail valide : c'est ainsi que cette personne pourra vous répondre.");
      if (!donnees.consentement) return montrer("Cochez la case pour autoriser la transmission de vos coordonnées.");
      err.innerHTML = "";
      btn.disabled = true; btn.textContent = "⏳ Envoi…";
      fetch("/api/contact-externe", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(donnees)
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
      }).then(function (x) {
        if (!x.ok) { btn.disabled = false; btn.textContent = "📨 Envoyer mon message"; return montrer(x.d.error || "L'envoi a échoué. Réessayez dans un instant."); }
        etapeMerci();
      }).catch(function () {
        btn.disabled = false; btn.textContent = "📨 Envoyer mon message";
        montrer("Connexion impossible. Vérifiez votre réseau et réessayez.");
      });
    });
    setTimeout(function () { var p = f.querySelector("#cex-nom"); if (p) p.focus(); }, 50);
  }

  function etapeMerci() {
    var f = ouvrirBoite("Message transmis",
      '<div class="cex-ok"><div class="cex-coche" aria-hidden="true">✅</div>' +
      "<p><strong>Votre message a bien été transmis.</strong><br>" + esc(courant.nom || "Cette personne") + " le recevra dans sa messagerie Diaspo'Actif et vous répondra à l'adresse e-mail indiquée.</p>" +
      '<button type="button" class="cex-btn or" id="cex-fin" style="width:100%">Fermer</button></div>');
    f.querySelector("#cex-fin").addEventListener("click", fermer);
  }

  function ouvrir(userId, nom) {
    courant = { userId: userId, nom: nom ? String(nom) : "" };
    /* Connecté : la messagerie habituelle suffit (le bouton Contact ne s'adresse qu'aux visiteurs). */
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        if (d && d.user) { window.location.href = "messagerie.html?with=" + encodeURIComponent(userId); return; }
        etapeChoix();
      })
      .catch(function () { etapeChoix(); });
  }

  window.ContactExterne = { ouvrir: ouvrir, fermer: fermer };
})();

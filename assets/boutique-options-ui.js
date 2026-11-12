/* ===========================================================
   assets/boutique-options-ui.js — Lot B4 : écran des OPTIONS d'une boutique (2026-11-12)
   ===========================================================
   Une option ajoute un autre type de boutique à la boutique principale, avec un nombre d'exemplaires.
   Aucun nombre, aucun libellé n'est écrit ici : le maximum d'options (types − 1), le maximum d'exemplaires et la liste des types
   viennent de la description du registre (types_v2). Les plafonds sont AUSSI contrôlés par le serveur (PUT vitrine-draft).
   Le Bonus de la boutique n'est pas une option et n'est pas compté.
   Utilisation : BoutiqueOptionsUI.rendre(zone, { desc, principal, options, onChanger })
     desc      = types_v2 de la réponse du registre (types, max_options, max_copies)
     principal = clé du registre du type principal (null si l'ancien type n'a pas d'équivalent)
     options   = liste actuelle [{ type, copies }]
     onChanger = fonction(nouvelleListe) → Promise ; refuser en lançant une erreur dont le message est affiché
   =========================================================== */
(function () {
  "use strict";
  var CSS_ID = "btopCss";

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function css() {
    if (document.getElementById(CSS_ID)) return;
    var s = document.createElement("style");
    s.id = CSS_ID;
    s.textContent =
      ".btop{margin-top:18px;border-top:1px solid var(--border,#e2e8f0);padding-top:16px}" +
      ".btop h4{margin:0 0 4px;font-size:14.5px;font-weight:800;color:var(--text,#0f172a)}" +
      ".btop-aide{font-size:12.5px;line-height:1.6;color:var(--muted,#475569);margin:0 0 10px}" +
      ".btop-compteur{display:inline-block;font-size:12.5px;font-weight:700;padding:4px 10px;border-radius:20px;border:1.5px solid var(--border,#e2e8f0);margin-bottom:10px;color:var(--text,#0f172a)}" +
      ".btop-liste{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))}" +
      ".btop-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;border:2px solid var(--border,#e2e8f0);border-radius:12px;padding:10px 12px;background:var(--card,#fff);color:var(--text,#0f172a)}" +
      ".btop-ligne.btop-on{border-color:var(--orange,#c2410c);background:rgba(194,65,12,.06)}" +
      ".btop-ligne.btop-off{opacity:.7}" +
      ".btop-ico{flex:none;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;border:1.5px solid currentColor;color:var(--orange,#c2410c)}" +
      ".btop-ico svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}" +
      ".btop-corps{flex:1 1 120px;min-width:0}" +
      ".btop-nom{font-size:13.5px;font-weight:800;line-height:1.3}" +
      ".btop-note{font-size:12px;color:var(--muted,#475569);line-height:1.4}" +
      ".btop-actions{flex:0 1 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto}" +
      ".btop-btn{min-height:40px;min-width:40px;padding:6px 14px;border-radius:10px;border:none;background:var(--orange,#c2410c);color:#fff;font-weight:700;font-size:13px;cursor:pointer}" +
      ".btop-btn.btop-sec{background:transparent;color:var(--text,#0f172a);border:1.5px solid var(--border,#e2e8f0)}" +
      ".btop-btn[disabled]{background:transparent;color:var(--muted,#475569);border:1.5px solid var(--border,#e2e8f0);cursor:default}" +
      ".btop-pas{display:inline-flex;align-items:center;gap:4px}" +
      ".btop-pas output{min-width:24px;text-align:center;font-weight:800;font-size:14px}" +
      ".btop-btn:focus-visible{outline:3px solid var(--orange,#c2410c);outline-offset:2px}" +
      ".btop-erreur{font-size:12.5px;line-height:1.5;margin-top:8px;padding:8px 12px;border-radius:10px;border:1px solid #dc2626;color:#991b1b;background:rgba(220,38,38,.07)}" +
      ".btop-vide{font-size:12.5px;line-height:1.6;border:1px solid var(--border,#e2e8f0);border-radius:10px;padding:10px 12px;background:rgba(100,116,139,.08)}";
    document.head.appendChild(s);
  }

  function icone(cle) {
    var ic = (window.BoutiqueTypesUI && window.BoutiqueTypesUI.icones) || {};
    return '<span class="btop-ico" aria-hidden="true"><svg viewBox="0 0 24 24">' + (ic[cle] || '<rect x="4" y="4" width="16" height="16" rx="3"/>') + '</svg></span>';
  }

  function copiesDe(options, cle) {
    for (var i = 0; i < options.length; i++) if (options[i].type === cle) return options[i].copies || 1;
    return 0;
  }

  function ligne(t, options, max, maxCopies) {
    var n = copiesDe(options, t.cle);
    var actif = n > 0;
    var plein = !actif && options.length >= max;
    var raison = !t.selectionnable ? "Bientôt disponible"
      : plein ? "Maximum atteint : retirez une option pour en ajouter une autre." : "";
    var action;
    if (actif) {
      action = '<span class="btop-pas" role="group" aria-label="Nombre d\'exemplaires de ' + esc(t.label) + '">' +
        '<button type="button" class="btop-btn btop-sec" data-btop-pas="-1" data-btop-type="' + esc(t.cle) + '" aria-label="Un exemplaire de moins"' + (n <= 1 ? " disabled" : "") + '>&minus;</button>' +
        '<output aria-live="polite">' + n + '</output>' +
        '<button type="button" class="btop-btn btop-sec" data-btop-pas="1" data-btop-type="' + esc(t.cle) + '" aria-label="Un exemplaire de plus"' + (n >= maxCopies ? " disabled" : "") + '>+</button></span>' +
        '<button type="button" class="btop-btn btop-sec" data-btop-retirer="' + esc(t.cle) + '">Retirer</button>';
    } else {
      action = '<button type="button" class="btop-btn" data-btop-ajouter="' + esc(t.cle) + '"' + (raison ? " disabled" : "") + '>Ajouter</button>';
    }
    return '<div class="btop-ligne ' + (actif ? "btop-on" : (raison ? "btop-off" : "")) + '">' + icone(t.cle) +
      '<div class="btop-corps"><div class="btop-nom">' + esc(t.label) + '</div>' +
      '<div class="btop-note">' + esc(actif ? (n + (n > 1 ? " exemplaires" : " exemplaire")) : (raison || t.desc)) + '</div></div>' +
      '<div class="btop-actions">' + action + '</div></div>';
  }

  function rendre(zone, opts) {
    if (!zone || !opts || !opts.desc) return;
    css();
    var desc = opts.desc;
    var max = desc.max_options, maxCopies = desc.max_copies;
    var options = (opts.options || []).filter(function (o) { return o && o.type && o.type !== opts.principal; });
    if (!opts.principal) {
      zone.innerHTML = '<div class="btop"><h4>Options de votre boutique</h4><div class="btop-vide">Choisissez d\'abord un des types ci-dessus comme type principal : les options s\'ajoutent à lui.</div></div>';
      return;
    }
    var autres = (desc.types || []).filter(function (t) { return t.cle !== opts.principal; });
    zone.innerHTML =
      '<div class="btop"><h4>Options de votre boutique</h4>' +
      '<p class="btop-aide">Une option ajoute un autre type de boutique à votre boutique principale. Vous pouvez en avoir <strong>' + max + '</strong> au plus, et chacune peut avoir jusqu\'à <strong>' + maxCopies + '</strong> exemplaires. Le Bonus de la boutique n\'est pas une option et ne compte pas dans cette limite.</p>' +
      '<span class="btop-compteur">Options actives : ' + options.length + ' sur ' + max + '</span>' +
      '<div class="btop-liste">' + autres.map(function (t) { return ligne(t, options, max, maxCopies); }).join("") + '</div>' +
      '<div class="btop-erreur" role="alert" hidden></div></div>';

    if (zone.__btopLie) { zone.__btopCtx = { opts: opts, options: options, max: max, maxCopies: maxCopies }; return; }
    zone.__btopLie = true;
    zone.__btopCtx = { opts: opts, options: options, max: max, maxCopies: maxCopies };
    zone.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b || b.disabled) return;
      var c = zone.__btopCtx, liste = c.options.map(function (o) { return { type: o.type, copies: o.copies || 1 }; });
      var cle;
      if ((cle = b.getAttribute("data-btop-ajouter"))) {
        if (liste.length >= c.max) return;
        liste.push({ type: cle, copies: 1 });
      } else if ((cle = b.getAttribute("data-btop-retirer"))) {
        liste = liste.filter(function (o) { return o.type !== cle; });
      } else if ((cle = b.getAttribute("data-btop-type"))) {
        var pas = Number(b.getAttribute("data-btop-pas"));
        liste.forEach(function (o) { if (o.type === cle) o.copies = Math.min(c.maxCopies, Math.max(1, o.copies + pas)); });
      } else return;
      Promise.resolve().then(function () { return c.opts.onChanger(liste); }).catch(function (err) {
        var z = zone.querySelector(".btop-erreur");
        if (z) { z.textContent = (err && err.message) || "Les options n'ont pas pu être enregistrées."; z.hidden = false; }
      });
    });
  }

  window.BoutiqueOptionsUI = { rendre: rendre };
})();

/* ===========================================================
   assets/boutique-assistant.js — Assistant de création d'une boutique (2026-11-13)
   ===========================================================
   Reprend la structure de la maquette « Paramètres vitrine » (exemples-boutiques/parametres-vitrine.html) sur la VRAIE plateforme :
   une liste d'étapes à gauche avec recherche et pastilles d'état, la barre « Étape X sur N » avec Précédent / Suivant, un panneau par étape.
   Il ne recrée aucun réglage : il range dans les panneaux les blocs déjà branchés sur les vraies données (ils gardent leurs identifiants).
   Utilisation : BoutiqueAssistant.monter(parent, { etapes, contenus, etat, onPublier })
     parent   = élément qui reçoit le menu (<nav>) et la zone centrale
     etapes   = [{ cle, titre, num?, sous?, mots? }]   (sous : entrée secondaire, hors parcours « Précédent / Suivant »)
     contenus = { cle: [élément, …] }                  (éléments déplacés dans le panneau de l'étape)
     etat     = function(cle) → 'ok' | 'afaire' | null (pastille)
     onPublier = fonction appelée par « Publier » à la dernière étape
   =========================================================== */
(function () {
  "use strict";

  /* ── Fonctions pures (testées sans navigateur) ── */
  function parcours(etapes) { return (etapes || []).filter(function (e) { return !e.sous; }); }
  function borner(i, n) { return Math.max(0, Math.min(n - 1, i)); }
  function libelleProgression(i, n, titre) { return "Étape " + (i + 1) + " sur " + n + " : " + titre; }
  function pourcentage(i, n) { return n <= 0 ? 0 : Math.round(((i + 1) / n) * 100); }
  function sansAccent(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  /* Étapes dont le titre ou les mots-clés contiennent la recherche (sans accents ni majuscules). Une recherche vide les garde toutes. */
  function filtrer(etapes, recherche) {
    var q = sansAccent(recherche).trim();
    if (!q) return (etapes || []).slice();
    return (etapes || []).filter(function (e) { return sansAccent(e.titre + " " + (e.mots || "")).indexOf(q) !== -1; });
  }
  var LIBELLE_ETAT = { ok: "Terminé", afaire: "À compléter" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function lireMemoire(c) { try { return window.sessionStorage.getItem(c); } catch (e) { return null; } }
  function ecrireMemoire(c, v) { try { window.sessionStorage.setItem(c, v); } catch (e) { /* mémoire indisponible : l'assistant fonctionne sans */ } }

  /* ── Montage ── */
  function monter(parent, cfg) {
    if (!parent || !cfg || !cfg.etapes) return null;
    var etapes = cfg.etapes, suite = parcours(etapes), n = suite.length;
    var courant = 0;

    var nav = document.createElement("nav");
    nav.className = "pvw-nav";
    nav.setAttribute("aria-label", "Étapes de création de la boutique");
    nav.innerHTML =
      '<input type="search" class="pvw-recherche" placeholder="Rechercher un paramètre…" aria-label="Rechercher un paramètre" autocomplete="off">' +
      '<ol class="pvw-liste">' + etapes.map(function (e) {
        return '<li class="' + (e.sous ? "pvw-sous" : "") + '" data-cle="' + esc(e.cle) + '"><button type="button" class="pvw-etape" data-etape="' + esc(e.cle) + '">' +
          '<span class="pvw-etape-texte">' + (e.num ? esc(e.num) + ". " : "") + esc(e.titre) + '</span>' +
          '<span class="pvw-pastille" data-pastille="' + esc(e.cle) + '"></span></button></li>';
      }).join("") + '</ol>' +
      '<p class="pvw-aucun" hidden>Aucun paramètre ne correspond à cette recherche.</p>';

    var centre = document.createElement("section");
    centre.className = "pvw-centre";
    centre.innerHTML =
      '<div class="pvw-barre">' +
      '<div class="pvw-progression"><span class="pvw-progression-texte" aria-live="polite"></span><div class="pvw-jauge" aria-hidden="true"><i></i></div></div>' +
      '<div class="pvw-boutons"><button type="button" class="pvw-btn pvw-sec" data-nav="prec">Précédent</button><button type="button" class="pvw-btn" data-nav="suiv">Suivant</button></div></div>' +
      '<div class="pvw-panneaux">' + etapes.map(function (e) {
        return '<section class="pvw-panneau" data-panneau="' + esc(e.cle) + '" hidden aria-labelledby="pvw-t-' + esc(e.cle) + '">' +
          '<h3 class="pvw-titre" id="pvw-t-' + esc(e.cle) + '" tabindex="-1">' + esc(e.titre) + '</h3></section>';
      }).join("") + '</div>';

    parent.insertBefore(nav, parent.firstChild);
    parent.insertBefore(centre, nav.nextSibling);

    /* Les blocs existants rejoignent leur panneau (leurs identifiants et leurs écouteurs ne changent pas). */
    etapes.forEach(function (e) {
      var panneau = centre.querySelector('[data-panneau="' + e.cle + '"]');
      ((cfg.contenus || {})[e.cle] || []).forEach(function (el) { if (el && panneau) panneau.appendChild(el); });
    });

    function indexDansParcours(cle) { for (var i = 0; i < n; i++) if (suite[i].cle === cle) return i; return -1; }

    function afficher(cle, deplacerFocus) {
      var etape = etapes.filter(function (e) { return e.cle === cle; })[0];
      if (!etape) return;
      var idx = indexDansParcours(cle);
      /* Une entrée secondaire (Bonus) se rattache visuellement à l'étape qui la précède dans la liste. */
      if (idx === -1) { var avant = etapes.indexOf(etape) - 1; while (avant > 0 && etapes[avant].sous) avant--; idx = Math.max(0, indexDansParcours(etapes[avant] && etapes[avant].cle)); }
      courant = borner(idx, n);
      centre.querySelectorAll(".pvw-panneau").forEach(function (p) { p.hidden = p.getAttribute("data-panneau") !== cle; });
      nav.querySelectorAll(".pvw-etape").forEach(function (b) {
        var actif = b.getAttribute("data-etape") === cle;
        b.classList.toggle("pvw-actif", actif);
        if (actif) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
      });
      centre.querySelector(".pvw-progression-texte").textContent = libelleProgression(courant, n, suite[courant].titre) + (etape.sous ? " — " + etape.titre : "");
      centre.querySelector(".pvw-jauge i").style.transform = "scaleX(" + (pourcentage(courant, n) / 100) + ")";
      var prec = centre.querySelector('[data-nav="prec"]'), suiv = centre.querySelector('[data-nav="suiv"]');
      prec.disabled = courant === 0 && !etape.sous;
      suiv.textContent = courant === n - 1 && !etape.sous ? "Publier" : "Suivant";
      ecrireMemoire("pvw-etape", cle);
      if (deplacerFocus) { var t = centre.querySelector('[data-panneau="' + cle + '"] .pvw-titre'); if (t) t.focus({ preventScroll: true }); }
      if (typeof cfg.onAfficher === "function") cfg.onAfficher(cle);
    }

    function rafraichir() {
      if (typeof cfg.etat !== "function") return;
      etapes.forEach(function (e) {
        var p = nav.querySelector('[data-pastille="' + e.cle + '"]');
        if (!p) return;
        var s = cfg.etat(e.cle);
        p.className = "pvw-pastille" + (s ? " pvw-" + s : "");
        p.innerHTML = s ? '<span class="pvw-sr">' + esc(LIBELLE_ETAT[s]) + '</span>' : "";
        p.title = s ? LIBELLE_ETAT[s] : "";
      });
    }

    nav.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-etape]") : null;
      if (b) afficher(b.getAttribute("data-etape"), true);
    });
    nav.querySelector(".pvw-recherche").addEventListener("input", function (ev) {
      var gardees = filtrer(etapes, ev.target.value).map(function (e) { return e.cle; });
      nav.querySelectorAll("li[data-cle]").forEach(function (li) { li.hidden = gardees.indexOf(li.getAttribute("data-cle")) === -1; });
      nav.querySelector(".pvw-aucun").hidden = gardees.length > 0;
    });
    centre.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-nav]") : null;
      if (!b || b.disabled) return;
      var sens = b.getAttribute("data-nav");
      if (sens === "suiv" && courant === n - 1) { if (typeof cfg.onPublier === "function") cfg.onPublier(); return; }
      var cible = suite[borner(courant + (sens === "suiv" ? 1 : -1), n)];
      afficher(cible.cle, true);
      if (typeof centre.scrollIntoView === "function") centre.scrollIntoView({ block: "start", behavior: "smooth" });
    });

    var memoire = lireMemoire("pvw-etape");
    afficher(etapes.some(function (e) { return e.cle === memoire; }) ? memoire : suite[0].cle, false);
    rafraichir();
    return { afficher: afficher, rafraichir: rafraichir, nav: nav, centre: centre };
  }

  window.BoutiqueAssistant = { monter: monter, parcours: parcours, borner: borner, libelleProgression: libelleProgression, pourcentage: pourcentage, filtrer: filtrer };
})();

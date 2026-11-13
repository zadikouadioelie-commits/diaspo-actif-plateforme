/* ===========================================================
   assets/boutique-reglages-ui.js — Formulaires des étapes 6, 7 et 10 de l'assistant de création (2026-11-13)
   ===========================================================
   Étape 6 « Paramètres commerciaux », étape 7 « Livraison et expéditions », étape 10 « Confiance et informations légales ».
   Les valeurs viennent du serveur (server/boutique-reglages.js) ; chaque changement est envoyé tel quel à onChanger({ section: { champ: valeur } }).
   Utilisation : BoutiqueReglagesUI.rendre(zone, { section, valeurs, onChanger })
     onChanger peut renvoyer une promesse : un rejet affiche son message sous le formulaire (le serveur reste seul juge des valeurs).
   Chaque champ dit s'il est APPLIQUÉ aux commandes ou seulement ENREGISTRÉ.
   =========================================================== */
(function () {
  "use strict";

  var PAYS = ["Afghanistan","Afrique du Sud","Albanie","Algérie","Allemagne","Andorre","Angola","Antigua-et-Barbuda","Arabie saoudite","Argentine","Arménie","Australie","Autriche","Azerbaïdjan","Bahamas","Bahreïn","Bangladesh","Barbade","Belgique","Belize","Bhoutan","Birmanie","Biélorussie","Bolivie","Bosnie-Herzégovine","Botswana","Brunei","Brésil","Bulgarie","Burkina Faso","Burundi","Bénin","Cambodge","Cameroun","Canada","Cap-Vert","Chili","Chine","Chypre","Colombie","Comores","Congo","Corée du Nord","Corée du Sud","Costa Rica","Croatie","Cuba","Côte d'Ivoire","Danemark","Djibouti","Dominique","Espagne","Estonie","Eswatini","Fidji","Finlande","France","Gabon","Gambie","Ghana","Grenade","Grèce","Guatemala","Guinée","Guinée équatoriale","Guinée-Bissau","Guyana","Géorgie","Haïti","Honduras","Hongrie","Inde","Indonésie","Irak","Iran","Irlande","Islande","Israël","Italie","Jamaïque","Japon","Jordanie","Kazakhstan","Kenya","Kirghizistan","Kiribati","Koweït","Laos","Lesotho","Lettonie","Liban","Liberia","Libye","Liechtenstein","Lituanie","Luxembourg","Macédoine du Nord","Madagascar","Malaisie","Malawi","Maldives","Mali","Malte","Maroc","Maurice","Mauritanie","Mexique","Micronésie","Moldavie","Monaco","Mongolie","Monténégro","Mozambique","Namibie","Nauru","Nicaragua","Niger","Nigeria","Norvège","Nouvelle-Zélande","Népal","Oman","Ouganda","Ouzbékistan","Pakistan","Palaos","Palestine","Panama","Papouasie-Nouvelle-Guinée","Paraguay","Pays-Bas","Philippines","Pologne","Portugal","Pérou","Qatar","Roumanie","Royaume-Uni","Russie","Rwanda","République centrafricaine","République démocratique du Congo","Saint-Christophe-et-Niévès","Saint-Marin","Saint-Vincent-et-les-Grenadines","Sainte-Lucie","Salvador","Samoa","Sao Tomé-et-Principe","Serbie","Seychelles","Sierra Leone","Singapour","Slovaquie","Slovénie","Somalie","Soudan","Soudan du Sud","Sri Lanka","Suisse","Suriname","Suède","Syrie","Sénégal","Tadjikistan","Tanzanie","Taïwan","Tchad","Tchéquie","Thaïlande","Timor oriental","Togo","Tonga","Trinité-et-Tobago","Tunisie","Turkménistan","Turquie","Tuvalu","Ukraine","Uruguay","Vanuatu","Vatican","Venezuela","Viêt Nam","Yémen","Zambie","Zimbabwe","Égypte","Émirats arabes unis","Équateur","Érythrée","États-Unis","Éthiopie","Îles Marshall","Îles Salomon"];
  var STATUTS = ["", "Auto-entrepreneur", "Entreprise (SAS, SARL…)", "Association", "Particulier (sans entreprise)", "Autre"];
  var APPLIQUE = '<span class="rgl-etat rgl-applique">Appliqué aux commandes</span>';
  var ENREGISTRE = '<span class="rgl-etat">Enregistré avec votre boutique</span>';

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function sansAccent(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-'’]/g, " ").replace(/\s+/g, " ").trim(); }
  /* Pays dont le nom contient la recherche (sans accents ni majuscules) ; une recherche vide les garde tous. */
  function filtrerPays(q) { var n = sansAccent(q); return PAYS.filter(function (p) { return !n || sansAccent(p).indexOf(n) !== -1; }); }

  /* ── Description des champs : une seule source pour le rendu et pour les tests ── */
  var CHAMPS = {
    commercial: [
      { f: "minimum_commande", t: "nombre", l: "Montant minimum de commande (€)", h: "Une commande dont les articles valent moins est refusée. 0 = aucun minimum.", etat: APPLIQUE, min: 0, max: 100000, pas: "0.01" },
      { f: "pays_vente", t: "pays", l: "Pays où vous expédiez", h: "Une commande avec expédition vers un autre pays est refusée. Aucune sélection = tous les pays. Le retrait sur place n'est pas concerné.", etat: APPLIQUE }
    ],
    livraison: [
      { f: "retrait", t: "case", l: "Proposer le retrait sur place", h: "Décoché : aucun client ne peut choisir le retrait, même pour un produit qui le propose.", etat: APPLIQUE },
      { f: "expedition", t: "case", l: "Proposer l'expédition", h: "Décoché : aucun client ne peut choisir l'expédition, même pour un produit qui la propose.", etat: APPLIQUE },
      { f: "frais_mode", t: "choix", l: "Frais de livraison", etat: APPLIQUE, options: [["produit", "Selon chaque produit"], ["gratuit", "Gratuits"], ["fixe", "Montant fixe par commande"]] },
      { f: "frais_montant", t: "nombre", l: "Montant fixe des frais (€)", etat: APPLIQUE, min: 0, max: 1000, pas: "0.01", si: function (v) { return v.frais_mode === "fixe"; } },
      { f: "preparation_jours", t: "nombre", l: "Délai de préparation (jours)", h: "Le temps dont vous avez besoin avant d'expédier ou de remettre la commande.", etat: ENREGISTRE, min: 0, max: 60, pas: "1" },
      { f: "delai_estime", t: "texte", l: "Délai de livraison estimé", h: "Par exemple : 3 à 5 jours ouvrés.", etat: ENREGISTRE, max: 80 }
    ],
    confiance: [
      { f: "raison_sociale", t: "texte", l: "Raison sociale (nom officiel)", h: "Le nom de votre entreprise ou association, tel qu'il figure sur vos papiers. Sans société : vos nom et prénom.", etat: ENREGISTRE, max: 120 },
      { f: "nom_commercial", t: "texte", l: "Nom commercial affiché au public (facultatif)", etat: ENREGISTRE, max: 120 },
      { f: "statut_juridique", t: "liste", l: "Statut juridique", etat: ENREGISTRE, options: STATUTS },
      { f: "siret", t: "texte", l: "Numéro SIRET ou équivalent", h: "En France : 14 chiffres. Association : numéro RNA. Ailleurs : le numéro officiel de votre pays.", etat: ENREGISTRE, max: 40 },
      { f: "email", t: "email", l: "E-mail de contact", etat: ENREGISTRE, max: 120 },
      { f: "tel", t: "texte", l: "Téléphone de contact", etat: ENREGISTRE, max: 40 },
      { f: "cgv", t: "document", l: "Conditions générales de vente", h: "Écrivez le texte, ou donnez le lien de la page en ligne.", etat: ENREGISTRE },
      { f: "retours", t: "document", l: "Politique de retour et de remboursement", h: "Les conditions dans lesquelles un client peut rendre un article ou être remboursé.", etat: ENREGISTRE },
      { f: "mentions", t: "document", l: "Mentions légales", h: "Nom et adresse de l'éditeur, nom de l'hébergeur.", etat: ENREGISTRE },
      { f: "confidentialite", t: "document", l: "Politique de confidentialité", h: "Ce que vous faites des données de vos clients (nom, adresse, e-mail, commandes).", etat: ENREGISTRE }
    ]
  };

  function valeurDe(valeurs, section, f) { return (valeurs && valeurs[section] && valeurs[section][f] !== undefined) ? valeurs[section][f] : undefined; }
  function aide(c) { return c.h ? '<small class="rgl-aide">' + esc(c.h) + '</small>' : ""; }

  function champHtml(section, c, valeurs, id) {
    var v = valeurDe(valeurs, section, c.f), cle = 'data-section="' + esc(section) + '" data-champ="' + esc(c.f) + '"';
    var tete = '<span class="rgl-lib">' + esc(c.l) + '</span> ' + (c.etat || "");
    if (c.t === "case") return '<div class="rgl-champ"><label class="rgl-case"><input type="checkbox" ' + cle + (v === false ? "" : " checked") + '> <span>' + esc(c.l) + '</span></label> ' + (c.etat || "") + aide(c) + '</div>';
    if (c.t === "nombre") return '<div class="rgl-champ" data-champ-bloc="' + esc(c.f) + '"><label for="' + id + '">' + tete + '</label>' + aide(c) + '<input id="' + id + '" type="number" inputmode="decimal" min="' + c.min + '" max="' + c.max + '" step="' + c.pas + '" ' + cle + ' value="' + esc(v == null ? 0 : v) + '"></div>';
    if (c.t === "texte" || c.t === "email") return '<div class="rgl-champ"><label for="' + id + '">' + tete + '</label>' + aide(c) + '<input id="' + id + '" type="' + (c.t === "email" ? "email" : "text") + '" maxlength="' + c.max + '" ' + cle + ' value="' + esc(v || "") + '"></div>';
    if (c.t === "liste") return '<div class="rgl-champ"><label for="' + id + '">' + tete + '</label><select id="' + id + '" ' + cle + '>' + c.options.map(function (o) { return '<option value="' + esc(o) + '"' + (o === (v || "") ? " selected" : "") + '>' + esc(o || "Non précisé") + '</option>'; }).join("") + '</select></div>';
    if (c.t === "choix") return '<fieldset class="rgl-champ"><legend>' + tete + '</legend>' + c.options.map(function (o) { return '<label class="rgl-case"><input type="radio" name="' + id + '" ' + cle + ' value="' + esc(o[0]) + '"' + (o[0] === (v || "produit") ? " checked" : "") + '> <span>' + esc(o[1]) + '</span></label>'; }).join("") + '</fieldset>';
    if (c.t === "document") {
      var d = v || {};
      return '<fieldset class="rgl-champ"><legend>' + tete + '</legend>' + aide(c) +
        '<label for="' + id + '-t">Texte</label><textarea id="' + id + '-t" rows="5" maxlength="8000" ' + cle + ' data-partie="texte">' + esc(d.texte || "") + '</textarea>' +
        '<label for="' + id + '-u">Lien vers la page en ligne (facultatif)</label><input id="' + id + '-u" type="url" maxlength="300" placeholder="https://…" ' + cle + ' data-partie="url" value="' + esc(d.url || "") + '"></fieldset>';
    }
    if (c.t === "pays") return '<div class="rgl-champ" data-pays-bloc="' + esc(c.f) + '"><span class="rgl-lib">' + esc(c.l) + '</span> ' + (c.etat || "") + aide(c) +
      '<div class="rgl-puces" data-puces></div><input type="search" class="rgl-q" placeholder="Rechercher un pays (ex. « sen », « côte »)" aria-label="Rechercher un pays" autocomplete="off">' +
      '<div class="rgl-compte" data-compte></div><div class="rgl-liste" data-liste role="group" aria-label="Pays"></div></div>';
    return "";
  }

  function rendre(zone, cfg) {
    if (!zone || !cfg || !CHAMPS[cfg.section]) return null;
    var section = cfg.section, etat = JSON.parse(JSON.stringify(cfg.valeurs || {}));
    etat[section] = etat[section] || {};
    var uid = "rgl-" + section;

    zone.innerHTML = '<div class="rgl" data-rgl="' + esc(section) + '">' + CHAMPS[section].map(function (c, i) { return champHtml(section, c, etat, uid + "-" + i); }).join("") +
      '<p class="rgl-erreur" role="alert" hidden></p><p class="rgl-ok" role="status" hidden></p></div>';
    var racine = zone.firstChild;

    function peindrePays() {
      var bloc = racine.querySelector("[data-pays-bloc]"); if (!bloc) return;
      var f = bloc.getAttribute("data-pays-bloc"), choisis = etat[section][f] || [], q = bloc.querySelector(".rgl-q").value;
      bloc.querySelector("[data-puces]").innerHTML = choisis.length
        ? choisis.map(function (p) { return '<span class="rgl-puce">' + esc(p) + ' <button type="button" data-retirer="' + esc(p) + '" aria-label="Retirer ' + esc(p) + '">×</button></span>'; }).join("")
        : '<span class="rgl-vide">Aucun pays choisi : tous les pays sont acceptés.</span>';
      bloc.querySelector("[data-compte]").textContent = choisis.length + " choisi(s) sur " + PAYS.length + " pays";
      var liste = filtrerPays(q);
      bloc.querySelector("[data-liste]").innerHTML = liste.length
        ? liste.map(function (p) { var on = choisis.indexOf(p) !== -1; return '<button type="button" class="rgl-pays' + (on ? " rgl-on" : "") + '" data-basculer="' + esc(p) + '" aria-pressed="' + on + '">' + esc(p) + (on ? " — choisi" : "") + '</button>'; }).join("")
        : '<span class="rgl-vide">Aucun pays ne correspond à « ' + esc(q) + ' ».</span>';
    }
    function majVisibilite() {
      CHAMPS[section].forEach(function (c) {
        if (!c.si) return;
        var b = racine.querySelector('[data-champ-bloc="' + c.f + '"]'); if (b) b.hidden = !c.si(etat[section]);
      });
    }
    function message(texte, erreur) {
      var e = racine.querySelector(".rgl-erreur"), o = racine.querySelector(".rgl-ok");
      e.hidden = !erreur; o.hidden = !!erreur || !texte; e.textContent = erreur ? texte : ""; o.textContent = erreur ? "" : (texte || "");
    }
    function envoyer(champ, valeur) {
      var corps = {}; corps[section] = {}; corps[section][champ] = valeur;
      var retour;
      try { retour = cfg.onChanger ? cfg.onChanger(corps) : null; } catch (e) { message(e.message || "Enregistrement impossible.", true); return; }
      if (retour && typeof retour.then === "function") retour.then(function () { message("Enregistré dans le brouillon. Il sera visible après « Publier ».", false); }, function (e) { message((e && e.message) || "Enregistrement impossible.", true); });
      else message("Enregistré dans le brouillon. Il sera visible après « Publier ».", false);
    }
    function lireChamp(el) {
      var champ = el.getAttribute("data-champ"), partie = el.getAttribute("data-partie");
      if (el.type === "checkbox") return [champ, !!el.checked];
      if (partie) { var cur = Object.assign({ texte: "", url: "" }, etat[section][champ] || {}); cur[partie] = el.value; return [champ, cur]; }
      if (el.type === "number") return [champ, el.value === "" ? 0 : Number(el.value)];
      return [champ, el.value];
    }

    racine.addEventListener("change", function (ev) {
      var el = ev.target;
      if (!el.getAttribute || !el.getAttribute("data-champ") || el.type === "search") return;
      if (el.type === "radio" && !el.checked) return;
      var lu = lireChamp(el);
      etat[section][lu[0]] = lu[1];
      majVisibilite();
      envoyer(lu[0], lu[1]);
    });
    racine.addEventListener("input", function (ev) { if (ev.target.classList && ev.target.classList.contains("rgl-q")) peindrePays(); });
    racine.addEventListener("click", function (ev) {
      var b = ev.target.closest ? ev.target.closest("[data-basculer],[data-retirer]") : null; if (!b) return;
      var bloc = racine.querySelector("[data-pays-bloc]"), f = bloc.getAttribute("data-pays-bloc"), cur = (etat[section][f] || []).slice();
      var nom = b.getAttribute("data-basculer") || b.getAttribute("data-retirer"), i = cur.indexOf(nom);
      if (i === -1) cur.push(nom); else cur.splice(i, 1);
      etat[section][f] = cur; peindrePays(); envoyer(f, cur);
    });
    peindrePays(); majVisibilite();
    return { etat: function () { return etat; }, peindre: peindrePays };
  }

  window.BoutiqueReglagesUI = { rendre: rendre, CHAMPS: CHAMPS, PAYS: PAYS, filtrerPays: filtrerPays, sansAccent: sansAccent };
})();

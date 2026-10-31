/* Prolonger une fiche d'inscription et sa candidature (2026-10-31, demande explicite : « pouvoir
   allonger le temps des candidatures », cas du Trophée Ngovu).
   Fenêtre partagée par les trois endroits d'où l'organisateur la déclenche : la page de
   l'événement (evenements-app.html), la page publique de la fiche quand elle est fermée
   (inscription-publique.html) et la liste des fiches (inscriptions-admin.html).
   Appel : ouvrirModaleProlongerFiche(ficheId, { onDone(resultat) }).
   Serveur : GET /api/insc/fiches/:id (état actuel) puis PATCH /api/insc/fiches/:id/prolonger. */
(function () {
  var DUREES = [['+7 jours', 7], ['+15 jours', 15], ['+1 mois', 30]];

  function pad(n) { return String(n).padStart(2, '0'); }
  /* Valeur d'un <input type="datetime-local"> : heure locale, sans fuseau — même convention que les dates de
     fermeture saisies ailleurs dans le module d'inscription. */
  function versChamp(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function ajouterJours(jours, base) {
    var d = base && !isNaN(base) && base > new Date() ? new Date(base) : new Date();
    d.setDate(d.getDate() + jours);
    d.setHours(23, 59, 0, 0);
    return d;
  }
  function lireDate(v) {
    if (!v) return null;
    var d = new Date(String(v).replace(' ', 'T'));
    return isNaN(d) ? null : d;
  }
  function texteDate(d) {
    return d.toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function etat(d, libelleOuvert, libelleFerme) {
    if (!d) return libelleOuvert + ' : aucune date de fermeture';
    return d > new Date() ? libelleOuvert + ' jusqu’au ' + texteDate(d) : libelleFerme + ' depuis le ' + texteDate(d);
  }
  function el(tag, style, texte) {
    var e = document.createElement(tag);
    if (style) e.style.cssText = style;
    if (texte != null) e.textContent = texte;
    return e;
  }
  function appeler(methode, chemin, corps) {
    if (typeof api === 'function') return api(methode, chemin, corps);
    return fetch('/api' + chemin, {
      method: methode, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Erreur.'); return j; }); });
  }
  function prevenir(texte) {
    if (typeof showToast === 'function') showToast(texte);
    else if (typeof ia_toast === 'function') ia_toast(texte, true);
  }

  window.ouvrirModaleProlongerFiche = function (ficheId, options) {
    options = options || {};
    var fond = el('div', 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:100000;display:flex;align-items:center;justify-content:center;padding:16px;');
    var boite = el('div', 'position:relative;width:100%;max-width:460px;max-height:92vh;overflow:auto;background:var(--card,#fff);color:var(--text,#1a1a1a);border:1px solid var(--border,#d8d8d8);border-radius:14px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4);font-family:inherit;');
    boite.setAttribute('role', 'dialog');
    boite.setAttribute('aria-label', 'Prolonger la fiche d’inscription');
    var fermer = el('button', 'position:absolute;top:10px;right:14px;background:none;border:none;font-size:22px;line-height:1;cursor:pointer;color:inherit;opacity:.7;', '×');
    fermer.type = 'button';
    fermer.setAttribute('aria-label', 'Fermer');
    fermer.onclick = function () { fond.remove(); };
    boite.appendChild(fermer);
    boite.appendChild(el('h3', 'margin:0 0 6px;font-size:17px;', '⏳ Prolonger les inscriptions'));
    var corps = el('div', 'font-size:13px;opacity:.8;', 'Chargement…');
    boite.appendChild(corps);
    fond.appendChild(boite);
    fond.addEventListener('click', function (e) { if (e.target === fond) fond.remove(); });
    document.body.appendChild(fond);

    appeler('GET', '/insc/fiches/' + ficheId).then(function (d) {
      var fiche = d.fiche || {};
      var config = d.candidature && d.candidature.config ? d.candidature.config : null;
      var avecCand = !!(config && config.actif);
      var finInsc = lireDate(fiche.date_fermeture_inscriptions);
      var finCand = config ? lireDate(config.date_fermeture) : null;
      corps.textContent = '';
      corps.style.opacity = '1';

      corps.appendChild(el('p', 'margin:0 0 12px;font-size:12.5px;opacity:.8;', fiche.nom ? '« ' + fiche.nom + ' »' : ''));
      var etats = el('div', 'font-size:12.5px;line-height:1.6;margin-bottom:14px;padding:10px 12px;border-radius:8px;background:rgba(127,127,127,.12);');
      etats.appendChild(el('div', '', fiche.statut === 'fermee' ? 'Fiche fermée manuellement : elle sera rouverte.' : etat(finInsc, 'Inscriptions ouvertes', 'Inscriptions fermées')));
      if (avecCand) etats.appendChild(el('div', '', etat(finCand, 'Candidatures ouvertes', 'Candidatures fermées')));
      corps.appendChild(etats);

      var champInsc = el('input', 'width:100%;height:38px;padding:0 10px;border:1px solid var(--border,#c9c9c9);border-radius:8px;font-size:13px;box-sizing:border-box;margin-bottom:12px;background:var(--bg,#fff);color:inherit;');
      champInsc.type = 'datetime-local';
      champInsc.id = 'pf-insc';
      var champCand = el('input', champInsc.style.cssText);
      champCand.type = 'datetime-local';
      champCand.id = 'pf-cand';
      var candModifiee = false;
      champCand.addEventListener('input', function () { candModifiee = true; });
      function poser(jours) {
        var d = ajouterJours(jours, finInsc);
        champInsc.value = versChamp(d);
        if (avecCand && !candModifiee) champCand.value = versChamp(d);
      }

      var l1 = el('label', 'display:block;font-size:12px;font-weight:600;margin-bottom:6px;', 'Inscriptions ouvertes jusqu’au');
      l1.setAttribute('for', 'pf-insc');
      corps.appendChild(l1);
      corps.appendChild(champInsc);
      if (avecCand) {
        var l2 = el('label', 'display:block;font-size:12px;font-weight:600;margin-bottom:6px;', 'Candidatures ouvertes jusqu’au');
        l2.setAttribute('for', 'pf-cand');
        corps.appendChild(l2);
        corps.appendChild(champCand);
      }

      var rapides = el('div', 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;');
      DUREES.forEach(function (x) {
        var b = el('button', 'padding:6px 11px;font-size:12px;border:1px solid var(--border,#c9c9c9);border-radius:20px;background:transparent;color:inherit;cursor:pointer;', x[0]);
        b.type = 'button';
        b.onclick = function () { poser(x[1]); };
        rapides.appendChild(b);
      });
      corps.appendChild(rapides);
      poser(7);

      var erreur = el('div', 'display:none;color:#dc2626;font-size:12.5px;margin-bottom:10px;');
      corps.appendChild(erreur);
      var valider = el('button', 'width:100%;padding:11px;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;background:#ff6b00;color:#fff;', 'Prolonger');
      valider.type = 'button';
      corps.appendChild(valider);
      corps.appendChild(el('p', 'margin:10px 0 0;font-size:11.5px;opacity:.7;', 'Les inscrits, les types d’inscription et les documents de candidature ne sont pas modifiés.'));

      valider.onclick = function () {
        erreur.style.display = 'none';
        if (!champInsc.value) { erreur.textContent = 'Choisissez une date.'; erreur.style.display = 'block'; return; }
        valider.disabled = true;
        valider.textContent = 'Enregistrement…';
        appeler('PATCH', '/insc/fiches/' + ficheId + '/prolonger', {
          inscriptions_jusquau: champInsc.value,
          candidatures_jusquau: avecCand && champCand.value ? champCand.value : null
        }).then(function (r) {
          fond.remove();
          prevenir(avecCand ? '⏳ Inscriptions et candidatures prolongées.' : '⏳ Inscriptions prolongées.');
          if (typeof options.onDone === 'function') options.onDone(r);
        }).catch(function (e) {
          valider.disabled = false;
          valider.textContent = 'Prolonger';
          erreur.textContent = (e && e.message) || 'Erreur.';
          erreur.style.display = 'block';
        });
      };
    }).catch(function (e) {
      corps.textContent = (e && e.message) || 'Impossible de charger la fiche.';
    });
  };
})();

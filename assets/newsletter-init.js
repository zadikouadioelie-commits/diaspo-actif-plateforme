/* Section « Newsletter » du tableau de bord Initiative (2026-11-11, étape N3).
   Données : uniquement celles du serveur (/api/initiatives/:id/newsletter/…). Aucune statistique individuelle, aucun pixel d'ouverture.
   Tant que l'envoi réel n'est pas activé sur la plateforme, les envois sont « à blanc » : le serveur le dit, et cet écran l'affiche. */
(function () {
  'use strict';
  var ETAT = { racine: null, initId: 0, onglet: 'campagnes', contenus: null, edition: null, apercu: '', occupe: false };
  var STATUT = { brouillon: ['Brouillon', ''], en_cours: ['Envoi en cours', 'cours'], envoyee: ['Envoyée', 'ok'] };
  var STATUT_AB = { actif: ['Actif', 'ok'], en_attente: ['En attente de confirmation', ''], desabonne: ['Désabonné', 'off'] };
  var ORIGINE = { formulaire: 'Formulaire de la boutique', suivi: 'Compte qui vous suit' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function jour(t) {
    if (!t) return '';
    var d = new Date(String(t).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(t)) ? '' : 'Z'));
    return isNaN(d) ? '' : d.toLocaleDateString('fr-FR');
  }
  function base() { return '/initiatives/' + ETAT.initId + '/newsletter'; }
  function dire(id, texte, erreur) { var el = document.getElementById(id); if (el) { el.textContent = texte || ''; el.className = 'rt-msg' + (erreur ? ' err' : ''); } }
  function tag(libelle, classe) { return '<span class="rt-tag ' + (classe || '') + '">' + esc(libelle) + '</span>'; }
  function erreurDe(e, defaut) { return e && e.message ? e.message : defaut; }

  /* ── Squelette ── */
  function entete() {
    var q = ETAT.contenus && ETAT.contenus.quota;
    return '<h3>Newsletter</h3>' +
      '<p class="rt-muet">Écrivez à vos abonnés : promotions, nouveaux produits, nouveaux services, événements. Seules les personnes qui l\'ont demandé et confirmé la reçoivent, et chacune peut se désabonner en un clic.</p>' +
      (q && q.mode === 'a_blanc' ? '<div class="rt-note"><b>Mode essai.</b> L\'envoi réel d\'e-mails n\'est pas encore activé sur la plateforme : vos envois sont préparés et comptés, mais aucun message ne part pour l\'instant.</div>' : '') +
      (q ? '<div class="nl-chiffres"><div><b>' + esc(ETAT.contenus.abonnes_actifs) + '</b><span>abonné(s) actif(s)</span></div><div><b>' + esc(q.restant) + '</b><span>e-mail(s) restant(s) ce mois-ci sur ' + esc(q.limite) + '</span></div></div>' : '') +
      '<div class="nl-onglets" role="tablist">' +
        '<button type="button" role="tab" class="nl-onglet' + (ETAT.onglet === 'campagnes' || ETAT.onglet === 'composer' ? ' actif' : '') + '" data-nl="onglet" data-o="campagnes">Newsletters</button>' +
        '<button type="button" role="tab" class="nl-onglet' + (ETAT.onglet === 'abonnes' ? ' actif' : '') + '" data-nl="onglet" data-o="abonnes">Abonnés</button>' +
      '</div><div id="nl-corps"></div>';
  }
  function corps() { return document.getElementById('nl-corps'); }

  /* ── Onglet Newsletters ── */
  function statsLigne(s) {
    if (!s) return '';
    var p = [];
    var envoyes = s.envoyes + s.a_blanc;
    p.push('<b>' + esc(s.destinataires) + '</b> destinataire(s)');
    if (s.a_blanc) p.push('<b>' + esc(s.a_blanc) + '</b> préparé(s) à blanc');
    if (s.envoyes) p.push('<b>' + esc(s.envoyes) + '</b> envoyé(s)');
    if (s.echecs) p.push('<b>' + esc(s.echecs) + '</b> échec(s)');
    if (s.restants) p.push('<b>' + esc(s.restants) + '</b> restant(s)');
    if (envoyes || s.restants) { p.push('<b>' + esc(s.desabonnes) + '</b> désabonné(s)'); p.push('<b>' + esc(s.clics) + '</b> clic(s)'); }
    if (s.signalements) p.push('<b>' + esc(s.signalements) + '</b> signalement(s)');
    return p.join(' · ');
  }
  function carteCampagne(c) {
    var st = STATUT[c.statut] || [c.statut, ''];
    var essai = c.mode_envoi === 'a_blanc' ? ' ' + tag('Essai', 'cours') : '';
    var id = c.id, h = '';
    h += '<button class="rt-bouton discret" type="button" data-nl="apercu" data-id="' + id + '">Aperçu</button>';
    if (c.statut === 'brouillon') {
      h += '<button class="rt-bouton discret" type="button" data-nl="modifier" data-id="' + id + '">Modifier</button>';
      h += '<button class="rt-bouton" type="button" data-nl="envoyer" data-id="' + id + '">Envoyer</button>';
      h += '<button class="rt-bouton danger" type="button" data-nl="supprimer" data-id="' + id + '">Supprimer</button>';
    }
    if (c.statut === 'en_cours') h += '<button class="rt-bouton" type="button" data-nl="continuer" data-id="' + id + '">Reprendre l\'envoi</button>';
    var details = '';
    if (c.stats && c.stats.liens && c.stats.liens.length && (c.stats.clics || c.statut !== 'brouillon')) {
      details = '<ul class="nl-liens">' + c.stats.liens.map(function (l) { return '<li><span>' + esc(l.libelle) + '</span><b>' + esc(l.clics) + ' clic(s)</b></li>'; }).join('') + '</ul>';
    }
    return '<li><div class="nl-ligne"><b>' + esc(c.sujet) + '</b> ' + tag(st[0], st[1]) + essai + '</div>' +
      '<div class="rt-muet">' + (c.envoye_le ? 'Lancée le ' + esc(jour(c.envoye_le)) : 'Créée le ' + esc(jour(c.created_at))) + '</div>' +
      (c.statut === 'brouillon' ? '' : '<div class="nl-stats">' + statsLigne(c.stats) + '</div>' + details) +
      '<div class="rt-actions">' + h + '</div><div class="rt-msg" id="nlm-' + id + '"></div></li>';
  }
  async function afficherCampagnes() {
    ETAT.onglet = 'campagnes';
    var el = corps(); if (!el) return;
    el.innerHTML = '<div class="rt-muet" style="padding:18px 0">Chargement…</div>';
    try {
      var r = await api('GET', base() + '/campagnes');
      var l = r.campagnes || [];
      el.innerHTML = '<p><button class="rt-bouton" type="button" data-nl="nouvelle">Nouvelle newsletter</button></p>' +
        (l.length ? '<ul class="rt-liste">' + l.map(carteCampagne).join('') + '</ul>' : '<div class="rt-note">Aucune newsletter pour l\'instant. Commencez par « Nouvelle newsletter » : des modèles de texte vous sont proposés.</div>') +
        '<div id="nl-apercu"></div>';
    } catch (e) { el.innerHTML = '<div class="rt-note">Impossible de charger vos newsletters pour le moment.</div>'; }
  }

  /* ── Rédaction ── */
  function caseElement(type, valeur, libelle, detail, coche) {
    return '<label class="nl-choix"><input type="checkbox" data-nl-el="1" data-type="' + type + '" data-valeur="' + esc(valeur) + '"' + (coche ? ' checked' : '') + '> <span><b>' + esc(libelle) + '</b>' + (detail ? ' <i>' + esc(detail) + '</i>' : '') + '</span></label>';
  }
  function estCoche(el, type, valeur) {
    return (el || []).some(function (x) { return x.type === type && (type === 'service' ? x.titre === valeur : (type === 'offre_flash' ? true : String(x.id) === String(valeur))); });
  }
  function rubrique(titre, contenu, vide) {
    return '<fieldset class="nl-rubrique"><legend>' + esc(titre) + '</legend>' + (contenu || '<p class="rt-muet">' + esc(vide) + '</p>') + '</fieldset>';
  }
  function composer(c) {
    var ct = ETAT.contenus, lim = ct.limites, el = c ? c.elements : [];
    ETAT.onglet = 'composer'; ETAT.edition = c ? c.id : null;
    var modeles = ct.modeles.map(function (m) { return '<option value="' + esc(m.cle) + '"' + (c && c.modele === m.cle ? ' selected' : '') + '>' + esc(m.label) + '</option>'; }).join('');
    var prod = ct.produits.map(function (p) { return caseElement('produit', p.id, p.nom, p.prix, estCoche(el, 'produit', p.id)); }).join('');
    var serv = ct.services.map(function (s) { return caseElement('service', s.titre, s.titre, s.description, estCoche(el, 'service', s.titre)); }).join('');
    var flash = ct.offre_flash ? caseElement('offre_flash', '1', ct.offre_flash.titre, ct.offre_flash.fin ? 'jusqu\'au ' + jour(ct.offre_flash.fin) : '', estCoche(el, 'offre_flash', '1')) : '';
    var evts = ct.evenements.map(function (e) { return caseElement('evenement', e.id, e.titre, [jour(e.date), e.ville].filter(Boolean).join(' · '), estCoche(el, 'evenement', e.id)); }).join('');
    var el2 = corps();
    el2.innerHTML =
      '<h4 class="nl-titre">' + (c ? 'Modifier la newsletter' : 'Nouvelle newsletter') + '</h4>' +
      '<label class="rt-lib" for="nl-modele">Modèle de départ</label><select id="nl-modele">' + modeles + '</select>' +
      '<label class="rt-lib" for="nl-sujet">Sujet de l\'e-mail</label><input id="nl-sujet" type="text" maxlength="' + lim.sujet + '" value="' + esc(c ? c.sujet : '') + '" placeholder="Ex. : Une promotion chez votre boutique">' +
      '<label class="rt-lib" for="nl-texte">Votre message</label><textarea id="nl-texte" maxlength="' + lim.texte + '" rows="8" placeholder="Écrivez votre message. Une ligne vide sépare deux paragraphes.">' + esc(c ? c.texte : '') + '</textarea>' +
      '<div class="rt-compteur" id="nl-compteur"></div>' +
      '<p class="rt-muet">Les adresses web tapées dans le message ne sont pas cliquables : utilisez les éléments ci-dessous, ils renvoient vers votre boutique.</p>' +
      '<h4 class="nl-titre">À insérer dans le message <span class="rt-muet">(' + lim.elements + ' au maximum)</span></h4>' +
      rubrique('Offre flash', flash, 'Aucune offre flash en cours sur votre boutique.') +
      rubrique('Produits', prod, 'Aucun produit disponible dans votre boutique.') +
      rubrique('Services', serv, 'Aucun service renseigné dans votre boutique.') +
      rubrique('Événements à venir', evts, 'Aucun événement publié à venir.') +
      '<div class="rt-actions">' +
        '<button class="rt-bouton" type="button" data-nl="enregistrer">Enregistrer le brouillon</button>' +
        '<button class="rt-bouton discret" type="button" data-nl="annuler">Retour</button>' +
      '</div><div class="rt-msg" id="nl-msg-composer"></div><div id="nl-apercu"></div>';
    compter();
  }
  function compter() {
    var t = document.getElementById('nl-texte'), c = document.getElementById('nl-compteur');
    if (t && c) c.textContent = t.value.length + ' / ' + ETAT.contenus.limites.texte + ' caractères';
    var coches = document.querySelectorAll('[data-nl-el]:checked').length, max = ETAT.contenus.limites.elements;
    document.querySelectorAll('[data-nl-el]:not(:checked)').forEach(function (i) { i.disabled = coches >= max; });
  }
  function lireFormulaire() {
    var elements = [];
    document.querySelectorAll('[data-nl-el]:checked').forEach(function (i) {
      var type = i.getAttribute('data-type'), v = i.getAttribute('data-valeur');
      if (type === 'service') elements.push({ type: type, titre: v });
      else if (type === 'offre_flash') elements.push({ type: type });
      else elements.push({ type: type, id: Number(v) });
    });
    return { modele: document.getElementById('nl-modele').value, sujet: document.getElementById('nl-sujet').value, texte: document.getElementById('nl-texte').value, elements: elements };
  }
  async function enregistrer() {
    var corpsF = lireFormulaire();
    var r = ETAT.edition ? await api('PUT', base() + '/campagnes/' + ETAT.edition, corpsF) : await api('POST', base() + '/campagnes', corpsF);
    ETAT.edition = r.campagne.id;
    return r.campagne;
  }
  function montrerApercu(zone, sujet, html) {
    var z = document.getElementById(zone); if (!z) return;
    z.innerHTML = '<div class="nl-apercu"><div class="nl-apercu-tete"><b>Aperçu</b> — sujet : ' + esc(sujet) + ' <button class="rt-bouton discret" type="button" data-nl="fermer-apercu" style="margin:0 0 0 auto">Fermer</button></div>' +
      '<iframe title="Aperçu de la newsletter" sandbox="" srcdoc="' + esc(html) + '"></iframe></div>';
    z.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── Envoi par lots : le serveur envoie 40 messages à la fois, l'écran rappelle jusqu'à la fin ── */
  async function envoyerCampagne(id, premier) {
    var etat = document.getElementById('nlm-' + id) ? 'nlm-' + id : 'nl-msg-composer';
    ETAT.occupe = true;
    try {
      var r = await api('POST', base() + '/campagnes/' + id + (premier ? '/envoyer' : '/continuer'));
      while (r.campagne.statut === 'en_cours') {
        dire(etat, 'Envoi en cours… ' + (r.stats.destinataires - r.stats.restants) + ' sur ' + r.stats.destinataires);
        r = await api('POST', base() + '/campagnes/' + id + '/continuer');
      }
      ETAT.occupe = false;
      await recharger();
      ETAT.onglet = 'campagnes';
      await afficherCampagnes();
      dire('nlm-' + id, r.campagne.mode_envoi === 'a_blanc' ? 'Envoi à blanc terminé : aucun e-mail n\'est réellement parti.' : 'Envoi terminé.');
    } catch (e) {
      ETAT.occupe = false;
      dire(etat, erreurDe(e, 'Envoi impossible pour le moment.'), true);
    }
  }

  /* ── Onglet Abonnés ── */
  async function afficherAbonnes() {
    ETAT.onglet = 'abonnes';
    var el = corps(); if (!el) return;
    el.innerHTML = '<div class="rt-muet" style="padding:18px 0">Chargement…</div>';
    try {
      var res = await Promise.all([api('GET', base() + '/abonnes'), api('GET', base() + '/suiveurs')]);
      var a = res[0], s = res[1], c = a.compteurs;
      var lignes = a.abonnes.map(function (x) {
        var st = STATUT_AB[x.statut] || [x.statut, ''];
        return '<tr><td>' + esc(x.email) + (x.nom ? '<br><span class="rt-muet">' + esc(x.nom) + '</span>' : '') + '</td><td>' + tag(st[0], st[1]) + '</td><td>' + esc(ORIGINE[x.source] || x.source) + '</td><td>' + esc(jour(x.created_at)) + '</td>' +
          '<td><button class="rt-bouton danger" type="button" data-nl="retirer" data-id="' + x.id + '" style="margin:0;min-height:36px;padding:6px 12px">Retirer</button></td></tr>';
      }).join('');
      el.innerHTML =
        '<div class="nl-chiffres"><div><b>' + esc(c.actifs) + '</b><span>actif(s)</span></div><div><b>' + esc(c.en_attente) + '</b><span>en attente de confirmation</span></div><div><b>' + esc(c.desabonnes) + '</b><span>désabonné(s)</span></div></div>' +
        '<p><a class="rt-bouton discret" style="display:inline-block;text-decoration:none;line-height:24px" href="/api' + base() + '/abonnes.csv" download>Exporter la liste (CSV)</a></p>' +
        '<div class="rt-note"><b>Inviter les personnes qui vous suivent.</b><br>' + (s.suiveurs ? esc(s.suiveurs) + ' compte(s) suivent votre boutique. ' : 'Aucun compte ne suit encore votre boutique. ') +
          (s.a_interroger ? '<b>' + esc(s.a_interroger) + '</b> n\'ont pas encore été interrogé(s). Ils recevront <b>une seule demande</b> (une notification) et ne seront abonnés que s\'ils répondent « Oui ».' : 'Personne de nouveau à interroger pour le moment.') +
          (s.reponses.acceptees + s.reponses.refusees + s.reponses.en_attente ? '<br><span class="rt-muet">Déjà interrogés : ' + esc(s.reponses.acceptees) + ' accepté(s), ' + esc(s.reponses.refusees) + ' refusé(s), ' + esc(s.reponses.en_attente) + ' sans réponse.</span>' : '') +
          (s.a_interroger ? '<div><button class="rt-bouton" type="button" data-nl="accord">Envoyer la demande</button></div>' : '') + '<div class="rt-msg" id="nl-msg-accord"></div></div>' +
        (a.abonnes.length
          ? '<div class="nl-tableau"><table><thead><tr><th>Adresse</th><th>Statut</th><th>Origine</th><th>Depuis le</th><th></th></tr></thead><tbody>' + lignes + '</tbody></table></div>'
          : '<div class="rt-note">Aucun abonné pour l\'instant. Le formulaire d\'inscription sur votre boutique n\'est pas encore disponible : en attendant, invitez les personnes qui vous suivent.</div>');
    } catch (e) { el.innerHTML = '<div class="rt-note">Impossible de charger vos abonnés pour le moment.</div>'; }
  }

  /* ── Chargement ── */
  async function recharger() { ETAT.contenus = await api('GET', base() + '/contenus'); }
  function monter(racine, initId) {
    ETAT.racine = racine; ETAT.initId = Number(initId) || 0;
    if (!racine) return;
    if (!ETAT.initId) { racine.innerHTML = '<p class="rt-muet">Aucune initiative liée.</p>'; return; }
    racine.innerHTML = '<div class="rt-muet" style="text-align:center;padding:24px">Chargement…</div>';
    recharger().then(function () {
      racine.innerHTML = entete();
      if (ETAT.onglet === 'abonnes') afficherAbonnes(); else afficherCampagnes();
    }).catch(function () { racine.innerHTML = '<p class="rt-muet">Impossible de charger la newsletter pour le moment.</p>'; });
  }

  /* ── Actions ── */
  async function trouverCampagne(id) { return (await api('GET', base() + '/campagnes/' + id)).campagne; }
  document.addEventListener('input', function (e) { if (ETAT.racine && ETAT.racine.contains(e.target)) compter(); });
  document.addEventListener('change', function (e) {
    if (!ETAT.racine || !ETAT.racine.contains(e.target)) return;
    if (e.target.id === 'nl-modele') {
      var m = ETAT.contenus.modeles.filter(function (x) { return x.cle === e.target.value; })[0];
      var s = document.getElementById('nl-sujet'), t = document.getElementById('nl-texte');
      if (m && m.cle !== 'libre' && (!s.value && !t.value || confirm('Remplacer le sujet et le message par le modèle choisi ?'))) { s.value = m.sujet; t.value = m.texte; compter(); }
    }
    if (e.target.matches('[data-nl-el]')) compter();
  });
  document.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-nl]');
    if (!b || !ETAT.racine || !ETAT.racine.contains(b) || ETAT.occupe) return;
    var act = b.getAttribute('data-nl'), id = b.getAttribute('data-id');
    try {
      if (act === 'onglet') {
        ETAT.onglet = b.getAttribute('data-o');
        ETAT.racine.innerHTML = entete();
        if (ETAT.onglet === 'abonnes') afficherAbonnes(); else afficherCampagnes();
      } else if (act === 'nouvelle') composer(null);
      else if (act === 'modifier') composer(await trouverCampagne(id));
      else if (act === 'annuler') { await recharger(); ETAT.racine.innerHTML = entete(); afficherCampagnes(); }
      else if (act === 'fermer-apercu') { var z = document.getElementById('nl-apercu'); if (z) z.innerHTML = ''; }
      else if (act === 'enregistrer') {
        b.disabled = true;
        try { await enregistrer(); dire('nl-msg-composer', 'Brouillon enregistré.'); }
        catch (err) { dire('nl-msg-composer', erreurDe(err, 'Enregistrement impossible.'), true); }
        b.disabled = false;
      } else if (act === 'apercu') {
        var r = await api('GET', base() + '/campagnes/' + id + '/apercu');
        montrerApercu('nl-apercu', r.sujet, r.html);
      } else if (act === 'supprimer') {
        if (!confirm('Supprimer ce brouillon ? Cette action est définitive.')) return;
        await api('DELETE', base() + '/campagnes/' + id); afficherCampagnes();
      } else if (act === 'envoyer') {
        var n = ETAT.contenus.abonnes_actifs;
        if (!confirm('Envoyer cette newsletter à ' + n + ' abonné(s) actif(s) ? Une fois lancée, elle ne peut plus être modifiée.')) return;
        envoyerCampagne(id, true);
      } else if (act === 'continuer') envoyerCampagne(id, false);
      else if (act === 'retirer') {
        if (!confirm('Retirer cette personne de votre liste ? Elle pourra se réinscrire d\'elle-même.')) return;
        await api('DELETE', base() + '/abonnes/' + id); afficherAbonnes();
      } else if (act === 'accord') {
        if (!confirm('Envoyer une seule demande d\'accord aux comptes qui vous suivent ? Chaque personne ne sera interrogée qu\'une fois.')) return;
        b.disabled = true;
        var rr = await api('POST', base() + '/demander-accord');
        await recharger(); await afficherAbonnes(); dire('nl-msg-accord', rr.message);
      }
    } catch (err) {
      var cible = id && document.getElementById('nlm-' + id) ? 'nlm-' + id : (document.getElementById('nl-msg-accord') ? 'nl-msg-accord' : 'nl-msg-composer');
      dire(cible, erreurDe(err, 'Action impossible pour le moment.'), true);
      b.disabled = false;
    }
  });

  window.NewsletterInit = { monter: monter };
})();

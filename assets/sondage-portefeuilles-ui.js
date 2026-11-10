/* ============================================================
   Diaspo'Actif — Portefeuilles de sondages, interface de la page Sondages (2026-11-10, demande explicite)
   Un portefeuille = un ensemble de sondages (titre, description, image de couverture) qui s'affiche aux mêmes lieux qu'un sondage et peut être lié à des événements.
   Boutons : « Créer un portefeuille » (barre, brouillons, Mes sondages), « Ajouter à un portefeuille » (chaque sondage), lieux et publication d'un portefeuille.
   Dépend des fonctions de sondages.html : api, DA.toast, closeMod, fmtDate, escH. Routes : server/sondage-portefeuilles.js.
   ============================================================ */
(function (root) {
  'use strict';
  var API = null;
  var PF = { liste: [], evts: [], mesSond: [], sel: [], edit: null, couv: '', couvRetiree: false, add: null };
  var E = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var STAT = { brouillon: 'Brouillon', ouvert: 'En cours', cloture: 'Terminé' };
  var BTN = 'btn btn-sm', BTN_OR = 'border-color:#2563EB;color:#2563EB;', BTN_ROUGE = 'border-color:#ef4444;color:#ef4444;';
  var toast = function (m, t) { try { DA.toast(m, { type: t || 'success' }); } catch (e) { /* toast indisponible */ } };
  var erreur = function (e) { toast((e && e.message) || 'Une erreur est survenue.', 'danger'); };

  async function charger() {
    try {
      var r = await api('GET', '/sondage-portefeuilles/mes');
      PF.liste = r.portefeuilles || []; PF.evts = r.mes_evenements || []; PF.mesSond = r.mes_sondages || [];
    } catch (e) { PF.liste = []; PF.evts = []; PF.mesSond = []; }
    /* Un sondage d'un portefeuille publié compte comme « affiché » : la liste des brouillons en tient compte (lieuxDe de sondages.html). */
    root.PF_PUB = new Set();
    PF.liste.forEach(function (p) { if (p.statut === 'publie') p.sondages.forEach(function (s) { root.PF_PUB.add(Number(s.id)); }); });
  }
  function modal(id, largeur) {
    var m = document.getElementById(id);
    if (!m) {
      m = document.createElement('div'); m.className = 'modal-bg'; m.id = id;
      m.setAttribute('onclick', "if(event.target===this)closeMod('" + id + "')");
      m.innerHTML = '<div class="modal" role="dialog" aria-modal="true" style="max-width:' + (largeur || 620) + 'px;max-height:90vh;overflow-y:auto;"></div>';
      document.body.appendChild(m);
    }
    return m;
  }
  function ouvrirModal(id, html, largeur) { var m = modal(id, largeur); m.firstChild.innerHTML = html; m.style.display = 'flex'; return m.firstChild; }
  function entete(titre, sous, id) {
    return '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:12px;"><div><h3 style="margin:0 0 4px;">' + titre + '</h3>' + (sous ? '<div style="font-size:13px;color:var(--muted);">' + E(sous) + '</div>' : '') +
      '</div><button onclick="closeMod(\'' + id + '\')" aria-label="Fermer" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--muted);">×</button></div>';
  }
  var vignette = function (u, t) { return u ? '<img src="' + E(u) + '" alt="" loading="lazy" style="width:64px;height:64px;object-fit:cover;border-radius:10px;flex:none;background:#0b1530;">' : '<div aria-hidden="true" style="width:64px;height:64px;border-radius:10px;flex:none;background:linear-gradient(135deg,#0d2b4e,#16457a);display:flex;align-items:center;justify-content:center;font-size:26px;">' + (t || '🗂️') + '</div>'; };
  var lieuxTexte = function (p) {
    var d = p.diffusion || {}, l = [];
    if (d.onglet) l.push('Onglet Sondages'); if (d.fil) l.push('Fil d’actualité'); if (d.profil) l.push('Profil public'); if (d.boutique) l.push('Boutique');
    var n = (p.evenement_ids || []).length; if (n) l.push(n + ' événement' + (n > 1 ? 's' : ''));
    return l;
  };
  var trouver = function (pid) { return PF.liste.filter(function (p) { return Number(p.id) === Number(pid); })[0]; };

  /* ── Mes portefeuilles (onglet « Mes sondages ») ── */
  async function chargerMes() {
    var el = document.getElementById('mes-portefeuilles'); if (!el) return;
    if (!ME_SOND || !PEUT_CREER) { el.innerHTML = ''; return; }
    await charger(); renderMes();
  }
  function renderMes() {
    var el = document.getElementById('mes-portefeuilles'); if (!el) return;
    if (!ME_SOND || !PEUT_CREER) { el.innerHTML = ''; return; }
    el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px;"><h3 style="margin:0;font-size:16px;">🗂️ Mes portefeuilles de sondages</h3>' +
      '<button type="button" class="' + BTN + '" style="' + BTN_OR + '" onclick="PF.creer()">＋ Créer un portefeuille</button></div>' +
      (PF.liste.length ? PF.liste.map(function (p) {
        var l = lieuxTexte(p);
        return '<div class="card" style="margin-bottom:10px;padding:12px 14px;"><div style="display:flex;gap:12px;align-items:center;">' + vignette(p.couverture) +
          '<div style="min-width:0;flex:1;"><strong style="font-size:15px;display:block;overflow-wrap:anywhere;">' + E(p.titre) + '</strong><div style="font-size:12px;color:var(--muted);margin-top:2px;">' + p.nb_sondages + ' sondage' + (p.nb_sondages > 1 ? 's' : '') + ' · ' +
          (p.statut === 'publie' ? '<span style="color:#16a34a;font-weight:700;">Publié</span>' : 'Brouillon (vous seul(e) le voyez)') + (l.length ? ' · ' + E(l.join(', ')) : '') + '</div></div></div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;"><button class="' + BTN + '" style="' + BTN_OR + '" onclick="PF.modifier(' + p.id + ')">✏️ Modifier</button>' +
          '<button class="' + BTN + '" style="' + BTN_OR + '" onclick="PF.lieux(' + p.id + ')">📣 Lieux et publication</button>' +
          '<a class="' + BTN + ' btn-outline" style="text-decoration:none;" href="portefeuille-sondages.html?id=' + p.id + '" target="_blank" rel="noopener">👁️ Voir</a>' +
          '<button class="' + BTN + '" style="' + BTN_ROUGE + '" onclick="PF.supprimer(' + p.id + ')">🗑️ Supprimer</button></div></div>';
      }).join('') : '<div class="notice" style="margin-bottom:10px;">Un portefeuille réunit plusieurs de vos sondages sous un titre et une image de couverture, pour les afficher ou les lier à un événement d’un seul bloc.</div>');
  }

  /* ── Création / modification ── */
  function listeSondagesEditeur() {
    var ids = PF.sel, par = {}; PF.mesSond.forEach(function (s) { par[s.id] = s; });
    var dedans = ids.map(function (id, i) {
      var s = par[id]; if (!s) return '';
      return '<div style="display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;"><span style="flex:1;min-width:0;overflow-wrap:anywhere;">' + E(s.titre) + ' <span style="color:var(--muted);font-size:12px;">· ' + E(STAT[s.statut] || s.statut) + '</span></span>' +
        '<button type="button" class="' + BTN + ' btn-outline" ' + (i ? '' : 'disabled') + ' onclick="PF.monter(' + i + ',-1)" aria-label="Monter">↑</button><button type="button" class="' + BTN + ' btn-outline" ' + (i < ids.length - 1 ? '' : 'disabled') + ' onclick="PF.monter(' + i + ',1)" aria-label="Descendre">↓</button>' +
        '<button type="button" class="' + BTN + '" style="' + BTN_ROUGE + '" onclick="PF.retirer(' + s.id + ')" aria-label="Retirer du portefeuille">✕</button></div>';
    }).join('');
    var autres = PF.mesSond.filter(function (s) { return ids.indexOf(s.id) < 0; }).map(function (s) {
      return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;"><span style="flex:1;min-width:0;overflow-wrap:anywhere;">' + E(s.titre) + ' <span style="color:var(--muted);font-size:12px;">· ' + E(STAT[s.statut] || s.statut) + '</span></span>' +
        '<button type="button" class="' + BTN + '" style="' + BTN_OR + '" onclick="PF.ajouterLocal(' + s.id + ')">＋ Ajouter</button></div>';
    }).join('');
    return '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:14px 0 6px;">Dans le portefeuille (' + ids.length + ')</div>' + (dedans || '<div style="font-size:13px;color:var(--muted);">Aucun sondage pour l’instant.</div>') +
      '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:14px 0 6px;">Mes autres sondages</div>' + (autres || '<div style="font-size:13px;color:var(--muted);">Tous vos sondages sont déjà dans ce portefeuille.</div>');
  }
  function majListeEditeur() { var z = document.getElementById('pf-sondages'); if (z) z.innerHTML = listeSondagesEditeur(); }
  function majCouverture() {
    var z = document.getElementById('pf-couv-zone'); if (!z) return;
    var u = PF.couvRetiree ? '' : PF.couv;
    z.innerHTML = (u ? '<img src="' + E(u) + '" alt="Couverture du portefeuille" style="display:block;width:100%;height:auto;max-height:300px;object-fit:contain;border-radius:10px;background:#0b1530;margin-bottom:8px;">' : '<div style="font-size:13px;color:var(--muted);margin-bottom:8px;">Aucune image de couverture.</div>') +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;"><label class="' + BTN + ' btn-outline" style="cursor:pointer;">🖼️ ' + (u ? 'Changer l’image' : 'Choisir une image') + '<input type="file" accept="image/jpeg,image/png,image/webp" id="pf-fichier" style="display:none" onchange="PF.choisirImage(this)"></label>' +
      (u ? '<button type="button" class="' + BTN + '" style="' + BTN_ROUGE + '" onclick="PF.retirerImage()">Retirer l’image</button>' : '') + '<span id="pf-couv-etat" style="font-size:12px;color:var(--muted);"></span></div>';
  }
  async function ouvrirEditeur(p, preselection) {
    await charger();
    PF.edit = p ? p.id : null; PF.couv = p ? (p.couverture || '') : ''; PF.couvRetiree = false;
    PF.sel = p ? p.sondages.map(function (s) { return Number(s.id); }) : (preselection ? [Number(preselection)] : []);
    var zone = ouvrirModal('modal-pf-bg', entete(p ? '✏️ Modifier le portefeuille' : '🗂️ Créer un portefeuille', p ? p.titre : 'Un ensemble de sondages avec un titre et une image de couverture.', 'modal-pf-bg') +
      '<div class="form-row"><label for="pf-titre">Titre du portefeuille *</label><input type="text" id="pf-titre" maxlength="150" value="' + E(p ? p.titre : '') + '" placeholder="Ex. : Consultation sur la santé mentale"></div>' +
      '<div class="form-row"><label for="pf-desc">Description</label><textarea id="pf-desc" rows="3" maxlength="1000" placeholder="Présentez le portefeuille en deux phrases.">' + E(p ? p.description : '') + '</textarea></div>' +
      '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:6px 0 6px;">Image de couverture</div><div id="pf-couv-zone"></div>' +
      '<div id="pf-sondages"></div>' +
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;"><button class="btn btn-outline" onclick="closeMod(\'modal-pf-bg\')">Annuler</button><button class="btn btn-orange" id="pf-save" onclick="PF.enregistrer()">' + (p ? 'Enregistrer' : 'Créer le portefeuille') + '</button></div>');
    majCouverture(); majListeEditeur(); return zone;
  }

  /* Image : réduite dans le navigateur (1600 px, JPEG) puis envoyée au serveur ; l'adresse obtenue sert de couverture. */
  function reduire(file) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onerror = function () { ko(new Error('Image illisible.')); };
      fr.onload = function () {
        var im = new Image();
        im.onerror = function () { ko(new Error('Image illisible.')); };
        im.onload = function () {
          var k = Math.min(1, 1600 / Math.max(im.width, im.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
          var g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/jpeg', 0.86));
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  API = {
    creer: function (pre) { return ouvrirEditeur(null, pre); },
    modifier: async function (pid) { await charger(); var p = trouver(pid); if (p) ouvrirEditeur(p); },
    choisirImage: async function (inp) {
      var f = inp.files && inp.files[0]; if (!f) return;
      var et = document.getElementById('pf-couv-etat'); if (et) et.textContent = 'Envoi de l’image…';
      try {
        var data = await reduire(f), r = await api('POST', '/upload', { data: data, nom: (f.name || 'couverture').replace(/\.[^.]+$/, '') + '.jpg' });
        PF.couv = r.url; PF.couvRetiree = false; majCouverture();
      } catch (e) { erreur(e); if (et) et.textContent = ''; }
    },
    retirerImage: function () { PF.couvRetiree = true; majCouverture(); },
    ajouterLocal: function (id) { if (PF.sel.indexOf(id) < 0) PF.sel.push(id); majListeEditeur(); },
    retirer: function (id) { PF.sel = PF.sel.filter(function (x) { return x !== id; }); majListeEditeur(); },
    monter: function (i, d) { var j = i + d; if (j < 0 || j >= PF.sel.length) return; var t = PF.sel[i]; PF.sel[i] = PF.sel[j]; PF.sel[j] = t; majListeEditeur(); },
    enregistrer: async function () {
      var titre = (document.getElementById('pf-titre').value || '').trim();
      if (!titre) { toast('Donnez un titre au portefeuille.', 'warning'); document.getElementById('pf-titre').focus(); return; }
      var btn = document.getElementById('pf-save'); btn.disabled = true;
      var corps = { titre: titre, description: document.getElementById('pf-desc').value.trim(), couverture: PF.couvRetiree ? '' : PF.couv };
      try {
        if (PF.edit) {
          await api('PUT', '/sondage-portefeuilles/' + PF.edit, corps);
          await api('PUT', '/sondage-portefeuilles/' + PF.edit + '/sondages', { sondage_ids: PF.sel });
          toast('Portefeuille enregistré.'); closeMod('modal-pf-bg'); await chargerMes();
        } else {
          var r = await api('POST', '/sondage-portefeuilles', Object.assign({ sondage_ids: PF.sel }, corps));
          toast('Portefeuille créé. Choisissez maintenant où l’afficher.'); closeMod('modal-pf-bg'); await chargerMes(); API.lieux(r.id);
        }
        try { if (root.loadMesSonds) root.loadMesSonds(); if (root.majBrouillons) root.majBrouillons(); } catch (e) { /* page sans ces listes */ }
      } catch (e) { erreur(e); btn.disabled = false; }
    },
    supprimer: async function (pid) {
      var p = trouver(pid); if (!p || !confirm('Supprimer le portefeuille « ' + p.titre + ' » ? Ses sondages sont conservés.')) return;
      try { await api('DELETE', '/sondage-portefeuilles/' + pid); toast('Portefeuille supprimé.'); await chargerMes(); } catch (e) { erreur(e); }
    },

    /* ── Ajouter UN sondage à un portefeuille ── */
    ajouterA: async function (sid) {
      PF.add = Number(sid); await charger();
      var rendre = function () {
        var h = entete('🗂️ Ajouter à un portefeuille', ((PF.mesSond.filter(function (s) { return s.id === PF.add; })[0]) || {}).titre, 'modal-pfadd-bg');
        if (!PF.liste.length) h += '<div class="notice" style="margin-bottom:12px;">Vous n’avez pas encore de portefeuille.</div>';
        h += PF.liste.map(function (p) {
          var dedans = p.sondages.some(function (s) { return Number(s.id) === PF.add; });
          return '<div style="display:flex;align-items:center;gap:12px;border:1px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:8px;">' + vignette(p.couverture) +
            '<div style="min-width:0;flex:1;"><strong style="font-size:14px;display:block;overflow-wrap:anywhere;">' + E(p.titre) + '</strong><div style="font-size:12px;color:var(--muted);">' + p.nb_sondages + ' sondage' + (p.nb_sondages > 1 ? 's' : '') + ' · ' + (p.statut === 'publie' ? 'Publié' : 'Brouillon') + '</div></div>' +
            (dedans ? '<button class="' + BTN + '" style="' + BTN_ROUGE + '" onclick="PF.basculer(' + p.id + ',false)">Retirer</button>' : '<button class="' + BTN + '" style="' + BTN_OR + '" onclick="PF.basculer(' + p.id + ',true)">＋ Ajouter</button>') + '</div>';
        }).join('');
        h += '<button class="btn btn-orange" style="width:100%;margin-top:6px;" onclick="closeMod(\'modal-pfadd-bg\');PF.creer(' + PF.add + ')">🗂️ Nouveau portefeuille avec ce sondage</button>';
        ouvrirModal('modal-pfadd-bg', h, 560);
      };
      API._rendreAjout = rendre; rendre();
    },
    basculer: async function (pid, ajouter) {
      try {
        if (ajouter) await api('POST', '/sondage-portefeuilles/' + pid + '/sondages', { sondage_id: PF.add });
        else await api('DELETE', '/sondage-portefeuilles/' + pid + '/sondages/' + PF.add);
        toast(ajouter ? 'Sondage ajouté au portefeuille.' : 'Sondage retiré du portefeuille.');
        await charger(); API._rendreAjout(); renderMes();
        try { if (root.majBrouillons) root.majBrouillons(); } catch (e) { /* ignoré */ }
      } catch (e) { erreur(e); }
    },

    /* ── Lieux d'affichage, événements liés, publication ── */
    lieux: async function (pid) {
      await charger(); var p = trouver(pid); if (!p) return;
      var d = p.diffusion || {}, lies = new Set((p.evenement_ids || []).map(Number)), pub = p.statut === 'publie';
      var lien = location.origin + '/portefeuille-sondages.html?id=' + p.id;
      var ligne = function (id, coche, titre, texte) { return '<label style="display:flex;gap:8px;align-items:flex-start;font-size:13px;margin-bottom:8px;cursor:pointer;"><input type="checkbox" id="' + id + '" ' + (coche ? 'checked' : '') + ' style="margin-top:2px;accent-color:#2563EB;"> <span><strong>' + titre + '</strong> — ' + texte + '</span></label>'; };
      ouvrirModal('modal-pflieux-bg', entete('📣 Lieux et publication', p.titre, 'modal-pflieux-bg') +
        '<div style="font-size:12px;line-height:1.5;border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:14px;">' + (pub ? '<strong style="color:#16a34a;">Portefeuille publié.</strong> Il s’affiche aux lieux cochés.' : 'Portefeuille <strong>brouillon</strong> : vous seul(e) le voyez. Choisissez où l’afficher, puis publiez-le.') +
        ' Seuls les sondages <strong>en cours ou terminés</strong> y sont visibles ; publier le portefeuille ne publie pas ses sondages.</div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin-bottom:8px;">Où l’afficher</div>' +
        ligne('pl-onglet', d.onglet, 'Onglet Sondages', 'le portefeuille figure en tête de la page publique des sondages.') +
        ligne('pl-fil', d.fil, 'Fil d’actualité', 'une publication annonce le portefeuille avec son lien' + (p.fil_post_id ? ' (déjà publiée)' : '') + '.') +
        ligne('pl-profil', d.profil, 'Mon profil public', 'un encart s’affiche sur votre page.') +
        ligne('pl-boutique', d.boutique, 'Ma boutique', 'un encart s’affiche sur votre vitrine.') +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:12px 0 6px;">Lier à un événement</div>' +
        '<div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:8px;">Sur la page de chaque événement coché, le portefeuille s’affiche dans le bloc « Sondage en cours ». Jamais dans le parcours d’inscription.</div>' +
        '<div style="max-height:170px;overflow-y:auto;border:1px solid var(--border);border-radius:10px;padding:6px 10px;margin-bottom:12px;">' +
        (PF.evts.length ? PF.evts.map(function (e) { return '<label style="display:flex;gap:8px;align-items:center;font-size:13px;padding:6px 0;cursor:pointer;"><input type="checkbox" class="pl-evt" value="' + e.id + '" ' + (lies.has(Number(e.id)) ? 'checked' : '') + ' style="accent-color:#2563EB;"> <span>' + E(e.titre) + (e.date_evt ? ' <span style="color:var(--muted);font-size:12px;">· ' + E(fmtDate(e.date_evt)) + '</span>' : '') + '</span></label>'; }).join('') : '<div style="font-size:13px;color:var(--muted);padding:6px 0;">Vous n’avez pas encore d’événement.</div>') + '</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-outline" id="pl-save" onclick="PF.sauverLieux(' + p.id + ')">Enregistrer les lieux</button>' +
        (pub ? '<button class="' + BTN + '" style="' + BTN_ROUGE + '" onclick="PF.depublier(' + p.id + ')">Retirer de l’affichage</button>' : '<button class="btn btn-orange" onclick="PF.publier(' + p.id + ')">🚀 Publier le portefeuille</button>') + '</div>' +
        '<div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;margin:18px 0 6px;border-top:1px solid var(--border);padding-top:14px;">Lien à partager</div>' +
        '<div style="display:flex;gap:6px;"><input type="text" readonly value="' + E(lien) + '" style="flex:1;min-width:0;height:36px;padding:0 10px;border:1px solid var(--border);border-radius:8px;font-size:12px;" onclick="this.select()"><button class="' + BTN + ' btn-outline" onclick="navigator.clipboard.writeText(\'' + E(lien) + '\');DA.toast(\'Lien copié !\',{type:\'success\'})">Copier</button></div>', 640);
    },
    sauverLieux: async function (pid, silencieux) {
      var btn = document.getElementById('pl-save'); if (btn) btn.disabled = true;
      var ids = [].slice.call(document.querySelectorAll('.pl-evt:checked')).map(function (c) { return Number(c.value); });
      try {
        await api('PUT', '/sondage-portefeuilles/' + pid + '/diffusion', { onglet: document.getElementById('pl-onglet').checked, fil: document.getElementById('pl-fil').checked, profil: document.getElementById('pl-profil').checked, boutique: document.getElementById('pl-boutique').checked, evenement_ids: ids });
        if (!silencieux) { toast('Lieux enregistrés.'); await chargerMes(); API.lieux(pid); }
        return true;
      } catch (e) { erreur(e); if (btn) btn.disabled = false; return false; }
    },
    publier: async function (pid) {
      if (!(await API.sauverLieux(pid, true))) return;
      try { var r = await api('POST', '/sondage-portefeuilles/' + pid + '/publier'); toast(r.message || 'Portefeuille publié.'); await chargerMes(); API.lieux(pid); try { if (root.loadSonds) root.loadSonds(); API.public(); } catch (e) { /* ignoré */ } } catch (e) { erreur(e); }
    },
    depublier: async function (pid) {
      try { var r = await api('POST', '/sondage-portefeuilles/' + pid + '/depublier'); toast(r.message || 'Portefeuille retiré.'); await chargerMes(); API.lieux(pid); try { API.public(); } catch (e) { /* ignoré */ } } catch (e) { erreur(e); }
    },

    /* ── Portefeuilles publiés, en tête de l'onglet Sondages ── */
    public: async function () {
      var el = document.getElementById('pf-public'); if (!el) return;
      try {
        var r = await api('GET', '/sondage-portefeuilles?onglet=1'), l = r.portefeuilles || [];
        if (!l.length) { el.innerHTML = ''; return; }
        el.innerHTML = '<h3 style="margin:0 0 10px;font-size:16px;">🗂️ Portefeuilles de sondages</h3><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">' + l.map(function (p) {
          return '<a href="' + E(p.lien) + '" class="card" style="display:block;text-decoration:none;color:inherit;overflow:hidden;padding:0;">' +
            (p.couverture ? '<img src="' + E(p.couverture) + '" alt="" loading="lazy" style="display:block;width:100%;height:130px;object-fit:cover;background:#0b1530;">' : '<div aria-hidden="true" style="height:130px;background:linear-gradient(135deg,#0d2b4e,#16457a);display:flex;align-items:center;justify-content:center;font-size:40px;">🗂️</div>') +
            '<div style="padding:12px 14px;"><strong style="display:block;font-size:15px;overflow-wrap:anywhere;">' + E(p.titre) + '</strong><div style="font-size:12px;color:var(--muted);margin-top:4px;">' + p.nb_sondages + ' sondage' + (p.nb_sondages > 1 ? 's' : '') + (p.nb_en_cours ? ' · ' + p.nb_en_cours + ' en cours' : '') + '</div></div></a>';
        }).join('') + '</div>';
      } catch (e) { el.innerHTML = ''; }
    },
    init: async function () {
      var b = document.getElementById('btn-creer-pf');
      if (b) b.style.display = (ME_SOND && PEUT_CREER) ? 'inline-flex' : 'none';
      if (ME_SOND && PEUT_CREER) await charger();
      API.public(); renderMes();
    },
    chargerMes: chargerMes
  };
  root.PF = API;
})(window);

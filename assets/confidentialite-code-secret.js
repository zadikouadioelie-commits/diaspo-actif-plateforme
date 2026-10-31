/* Carte « Code secret » en tête de la page Confidentialité (2026-10-31, demande explicite : « fais apparaître en
   premier le code secret dans un cadre doré »). Même code que celui des paramètres de sécurité
   (parametres-compte.html) : code à 4 chiffres de la confirmation multi-connexion, GET/PUT /api/multi-connexion/code.
   Le code ne permet pas de changer le mot de passe ; le modifier déconnecte les autres connexions.
   La carte s'insère dans #code-secret-zone (créé en premier dans <main> s'il manque) ; sans session, rien n'est affiché. */
(function () {
  function appeler(methode, chemin, corps) {
    if (typeof api === 'function') return api(methode, chemin, corps);
    return fetch('/api' + chemin, {
      method: methode, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }, body: corps ? JSON.stringify(corps) : undefined
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || 'Erreur.'); return j; }); });
  }

  function zone() {
    var z = document.getElementById('code-secret-zone');
    if (z) return z;
    var main = document.querySelector('main');
    if (!main) return null;
    z = document.createElement('div');
    z.id = 'code-secret-zone';
    main.insertBefore(z, main.firstChild);
    return z;
  }

  function monter(z) {
    z.innerHTML =
      '<section class="cs-carte" aria-labelledby="cs-titre">' +
        '<div class="cs-entete"><span class="cs-cle" aria-hidden="true">🔑</span>' +
          '<div><h4 id="cs-titre">Code secret</h4><p class="cs-sous">Votre code de confirmation à 4 chiffres</p></div></div>' +
        '<div class="cs-chiffres" id="cs-chiffres" aria-live="polite" aria-label="Code secret masqué">' +
          '<span>•</span><span>•</span><span>•</span><span>•</span></div>' +
        '<button type="button" class="cs-voir" id="cs-voir">👁 Rendre visible</button>' +
        '<p class="cs-aide">Si vous êtes connecté à plus d’un endroit, une confirmation vous est demandée chaque heure. Ce code sert à cela : il ne permet <b>pas</b> de changer votre mot de passe.</p>' +
        '<label class="cs-etiquette" for="cs-nouveau">Nouveau code (4 chiffres)</label>' +
        '<div class="cs-ligne"><input id="cs-nouveau" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" placeholder="••••">' +
          '<button type="button" class="cs-enregistrer" id="cs-enregistrer">Enregistrer</button></div>' +
        '<p class="cs-note">Modifier le code déconnecte vos autres connexions : elles devront se reconfirmer avec le nouveau code.</p>' +
        '<p class="cs-msg" id="cs-msg" role="status"></p>' +
      '</section>';

    var chiffres = z.querySelector('#cs-chiffres'), voir = z.querySelector('#cs-voir');
    var nouveau = z.querySelector('#cs-nouveau'), save = z.querySelector('#cs-enregistrer'), msg = z.querySelector('#cs-msg');
    var visible = false, code = null, charge = false;

    function dire(texte, ok) { msg.textContent = texte || ''; msg.className = 'cs-msg' + (texte ? (ok ? ' cs-ok' : ' cs-ko') : ''); }
    function maj() {
      var c = visible && code ? code.split('') : ['•', '•', '•', '•'];
      chiffres.innerHTML = c.map(function (x) { return '<span>' + x + '</span>'; }).join('');
      chiffres.classList.toggle('cs-vide', !code && charge);
      chiffres.setAttribute('aria-label', visible && code ? 'Code secret : ' + code.split('').join(' ') : 'Code secret masqué');
      voir.textContent = visible ? '🙈 Masquer' : '👁 Rendre visible';
    }

    voir.addEventListener('click', function () {
      var suite = function () {
        if (!code) { dire('Aucun code pour l’instant : créez-le ci-dessous.', false); return; }
        dire('');
        visible = !visible; maj();
      };
      if (charge) return suite();
      appeler('GET', '/multi-connexion/code').then(function (r) { code = (r && r.code) || null; charge = true; suite(); })
        .catch(function (e) { dire((e && e.message) || 'Erreur.', false); });
    });
    nouveau.addEventListener('input', function () { nouveau.value = nouveau.value.replace(/\D/g, '').slice(0, 4); });
    save.addEventListener('click', function () {
      if (!/^\d{4}$/.test(nouveau.value)) { dire('Le code doit comporter exactement 4 chiffres.', false); return; }
      save.disabled = true;
      appeler('PUT', '/multi-connexion/code', { code: nouveau.value }).then(function (r) {
        code = nouveau.value; charge = true; nouveau.value = ''; maj();
        dire('Code enregistré ✓' + (r && r.deconnectees ? ' — ' + r.deconnectees + ' autre(s) connexion(s) déconnectée(s).' : ''), true);
      }).catch(function (e) { dire((e && e.message) || 'Erreur.', false); })
        .then(function () { save.disabled = false; });
    });
  }

  function demarrer() {
    appeler('GET', '/auth/me').then(function (r) {
      if (!r || !r.user) return;
      var z = zone();
      if (z) monter(z);
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();

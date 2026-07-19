/* Affiche/masque le mot de passe — ajoute automatiquement un bouton "œil" à
   chaque champ <input type="password"> de la page. Réutilisable partout. */
(function () {
  function decorate(input) {
    if (!input || input.dataset.pwToggle) return;
    input.dataset.pwToggle = '1';

    // Enveloppe le champ dans un conteneur positionné (sans casser le style existant).
    const wrap = document.createElement('span');
    wrap.style.cssText = 'position:relative;display:block;width:100%;';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    // Laisse de la place à droite pour le bouton.
    const prevPadRight = getComputedStyle(input).paddingRight;
    input.style.paddingRight = 'calc(' + (prevPadRight && prevPadRight !== '0px' ? prevPadRight : '12px') + ' + 34px)';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Afficher le mot de passe');
    btn.textContent = '👁';
    btn.style.cssText = 'position:absolute;top:50%;right:8px;transform:translateY(-50%);background:none;border:none;cursor:pointer;font-size:16px;line-height:1;padding:4px;opacity:.6;';
    btn.addEventListener('click', function () {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? '🙈' : '👁';
      btn.setAttribute('aria-label', show ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      btn.style.opacity = show ? '1' : '.6';
      input.focus();
    });
    wrap.appendChild(btn);
  }

  function scan() { document.querySelectorAll('input[type="password"]').forEach(decorate); }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan);
  else scan();
  // Re-scan si des champs sont ajoutés dynamiquement plus tard.
  try {
    new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  } catch (_) {}
})();

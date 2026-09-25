/* ═══════════════════════════════════════════════════════════════════
   RichEditor — éditeur de texte enrichi réutilisable, Diaspo'Actif
   (2026-09-25, demande explicite : "éditeur de texte enrichi
   réutilisable dans toute la plateforme, pas uniquement pour les
   événements").

   Technique : contenteditable + document.execCommand() — même
   principe que les deux mini-éditeurs de lettre de motivation déjà
   existants (espace-candidat.html #lettre-editor, lettre-builder.html
   #corps-lettre), centralisé ici pour ne plus le réécrire à chaque
   nouveau module. execCommand est officiellement déprécié mais les
   commandes utilisées ici (bold, italic, underline, justifyLeft,
   justifyCenter, justifyRight, insertUnorderedList, insertOrderedList,
   formatBlock, createLink, removeFormat) restent pleinement supportées
   par tous les navigateurs à jour — pas d'alternative standard plus
   simple sans faire entrer une librairie tierce, ce que ce projet
   évite par ailleurs (voir server/security.js, même logique).

   Le HTML produit ici n'est JAMAIS la barrière de sécurité — seule la
   sanitisation serveur (SEC.sanitizeRichHtml, appelée à l'écriture)
   fait foi. Cet éditeur ne fait que produire du HTML propre à
   l'usage ; un utilisateur pourrait en théorie contourner l'UI (DevTools)
   et envoyer n'importe quoi à l'API — c'est exactement le cas que la
   sanitisation serveur couvre.

   Usage :
     <textarea id="mon-champ">...</textarea>
     <script>
       const ed = RichEditor.attach('mon-champ');
       // ed.getHTML() → HTML actuel (aussi tenu à jour en direct dans
       //   le <textarea> d'origine, .value — code de sauvegarde existant
       //   inchangé si le champ était déjà lu via .value).
       // ed.setHTML(html) → recharge un contenu (édition d'un élément existant).
       // ed.isEmpty() → true si aucun texte saisi.
     </script>
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  if (window.RichEditor) return; // déjà chargé sur cette page (plusieurs <script> possibles)

  const TOOLBAR = [
    { cmd: 'bold', label: '<b>G</b>', title: 'Gras (Ctrl+B)' },
    { cmd: 'italic', label: '<i>I</i>', title: 'Italique (Ctrl+I)' },
    { cmd: 'underline', label: '<u>S</u>', title: 'Souligné (Ctrl+U)' },
    { sep: true },
    { block: 'H2', label: 'Titre', title: 'Titre' },
    { block: 'H3', label: 'Sous-titre', title: 'Sous-titre' },
    { block: 'P', label: '¶', title: 'Paragraphe normal' },
    { block: 'BLOCKQUOTE', label: '❝', title: 'Citation' },
    { sep: true },
    { cmd: 'insertUnorderedList', label: '•⁠—', title: 'Liste à puces' },
    { cmd: 'insertOrderedList', label: '1.—', title: 'Liste numérotée' },
    { sep: true },
    { cmd: 'justifyLeft', label: '⇤', title: 'Aligner à gauche' },
    { cmd: 'justifyCenter', label: '⇔', title: 'Centrer' },
    { cmd: 'justifyRight', label: '⇥', title: 'Aligner à droite' },
    { sep: true },
    { action: 'link', label: '🔗', title: 'Insérer un lien' },
    { cmd: 'removeFormat', label: '⌫', title: 'Effacer la mise en forme' },
  ];

  function injectStyles() {
    if (document.getElementById('rich-editor-style')) return;
    const s = document.createElement('style');
    s.id = 'rich-editor-style';
    s.textContent = `
      .rich-editor-wrap{border:1.5px solid var(--border,#D6DEE8);border-radius:10px;overflow:hidden;background:#fff;}
      .rich-editor-toolbar{display:flex;flex-wrap:wrap;gap:2px;padding:6px;background:#F5F7FA;border-bottom:1.5px solid var(--border,#D6DEE8);}
      .rich-editor-toolbar button{border:none;background:transparent;border-radius:6px;padding:6px 9px;font-size:13px;cursor:pointer;color:#102A43;font-family:inherit;min-width:30px;}
      .rich-editor-toolbar button:hover{background:#E2E8F0;}
      .rich-editor-toolbar button.active{background:var(--navy,#0D2B4E);color:#fff;}
      .rich-editor-toolbar .rich-editor-sep{width:1px;background:var(--border,#D6DEE8);margin:4px 3px;}
      .rich-editor-area{min-height:140px;max-height:420px;overflow-y:auto;padding:12px 14px;font-size:14px;line-height:1.65;color:#102A43;outline:none;}
      .rich-editor-area p{margin:0 0 12px;}
      .rich-editor-area p:last-child{margin-bottom:0;}
      .rich-editor-area h2{font-size:19px;font-weight:800;margin:16px 0 8px;}
      .rich-editor-area h2:first-child{margin-top:0;}
      .rich-editor-area h3{font-size:16px;font-weight:700;margin:14px 0 6px;}
      .rich-editor-area h3:first-child{margin-top:0;}
      .rich-editor-area blockquote{margin:10px 0;padding:8px 14px;border-left:3px solid var(--orange,#B84C1A);background:#FFF8F3;color:#4A3B2E;font-style:italic;}
      .rich-editor-area ul,.rich-editor-area ol{margin:0 0 12px;padding-left:22px;}
      .rich-editor-area a{color:var(--orange,#B84C1A);text-decoration:underline;}
      .rich-editor-area:empty::before{content:attr(data-placeholder);color:#9AA5B1;}
    `;
    document.head.appendChild(s);
  }

  function attach(target, opts) {
    opts = opts || {};
    const textarea = typeof target === 'string' ? document.getElementById(target) : target;
    if (!textarea) return null;
    if (textarea.dataset.richEditorAttached) return textarea._richEditorInstance || null;
    textarea.dataset.richEditorAttached = '1';
    injectStyles();

    textarea.style.display = 'none';
    const wrap = document.createElement('div');
    wrap.className = 'rich-editor-wrap';
    const toolbarEl = document.createElement('div');
    toolbarEl.className = 'rich-editor-toolbar';
    const area = document.createElement('div');
    area.className = 'rich-editor-area';
    area.contentEditable = 'true';
    area.setAttribute('data-placeholder', opts.placeholder || 'Écrivez ici…');
    /* Contenu initial toujours enveloppé dans au moins un <p> (2026-09-25, bug réel constaté en
       testant) — un contenteditable vide au départ insère les tout premiers caractères tapés en
       texte nu, hors de tout paragraphe ; laissé tel quel, SEC.sanitizeRichHtml() le laisse
       passer (le texte nu n'est pas une balise interdite) mais il n'a alors ni les espacements
       ni la structure de paragraphe du reste du texte. */
    area.innerHTML = textarea.value || '<p><br></p>';
    // Force <p> (jamais <div>) pour chaque nouveau paragraphe créé par la touche Entrée — sans
    // ça, Chrome/les navigateurs à moteur Blink insèrent des <div>, absents de la liste blanche
    // du sanitizeur serveur : plusieurs paragraphes tapés à la suite (juste en appuyant sur
    // Entrée, sans cliquer sur aucun bouton) se retrouvaient TOUS FUSIONNÉS EN UN SEUL BLOC
    // après l'enregistrement — exactement ce que la demande interdisait explicitement.
    area.addEventListener('focus', () => { try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {} });

    TOOLBAR.forEach(item => {
      if (item.sep) { toolbarEl.appendChild(Object.assign(document.createElement('span'), { className: 'rich-editor-sep' })); return; }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = item.title;
      btn.innerHTML = item.label;
      btn.addEventListener('mousedown', e => e.preventDefault()); // ne pas perdre la sélection avant le clic
      btn.addEventListener('click', () => {
        area.focus();
        if (item.cmd) document.execCommand(item.cmd, false, null);
        else if (item.block) document.execCommand('formatBlock', false, item.block);
        else if (item.action === 'link') {
          const url = prompt('Adresse du lien (https://…) :');
          if (url && /^https?:\/\/|^mailto:/i.test(url.trim())) document.execCommand('createLink', false, url.trim());
          else if (url) alert("Le lien doit commencer par http://, https:// ou mailto:.");
        }
        sync();
      });
      toolbarEl.appendChild(btn);
    });

    function sync() { textarea.value = area.innerHTML; textarea.dispatchEvent(new Event('input', { bubbles: true })); }
    area.addEventListener('input', sync);
    area.addEventListener('blur', sync);

    wrap.appendChild(toolbarEl);
    wrap.appendChild(area);
    textarea.parentNode.insertBefore(wrap, textarea.nextSibling);
    sync();

    const instance = {
      getHTML: () => area.innerHTML,
      // Même repli que l'initialisation dans attach() ci-dessus, et pour la même raison — sinon
      // setHTML('') (rechargement à vide de la modale) écrasait le <p><br></p> déjà posé par
      // attach() juste avant, ramenant l'éditeur au cas bogué (bug réel constaté en testant).
      setHTML: html => { area.innerHTML = html || '<p><br></p>'; sync(); },
      isEmpty: () => !area.textContent.trim(),
      focus: () => area.focus(),
    };
    textarea._richEditorInstance = instance;
    return instance;
  }

  window.RichEditor = { attach };
})();

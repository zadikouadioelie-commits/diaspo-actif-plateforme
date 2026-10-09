/* Sélecteur « type de numéro d'immatriculation » (2026-10-08, demande explicite : « un bouton RCCM / SIREN / IFU : la personne clique sur ce qu'elle
   va noter, sinon on ne sait pas exactement ce qu'elle note »).

   Utilisé par l'inscription (inscription.html), le profil réseau (reseau.html) et la version téléphone (assets/m-mod-reseaupro.js) : un seul
   composant, jamais trois copies. Les règles de contrôle reprennent celles du serveur (server/immatriculation.js), qui revalide toujours.

   ImmatType.monter(zone, { inputId, typeId, type, numero, onInput })
     → dessine les boutons de type + le champ du numéro dans `zone` ; le type choisi est lisible dans <input type="hidden" id=typeId>.
   ImmatType.valider(typeId, inputId) → '' si la saisie est correcte, sinon le message à afficher.                                            */
(function () {
  'use strict';
  const TYPES = [
    { cle: 'RCCM',  libelle: 'RCCM',               exemple: 'CI-ABJ-2024-B-1234', max: 40, aide: 'Registre du commerce et du crédit mobilier (zone OHADA) : pays, ville, année, numéro. Vérifié par l’équipe sur justificatif.' },
    { cle: 'SIREN', libelle: 'SIREN',              exemple: '123 456 789',        max: 15, aide: '9 chiffres — entreprise ou association française. Confirmé automatiquement dans le registre officiel.' },
    { cle: 'SIRET', libelle: 'SIRET',              exemple: '123 456 789 00010',  max: 20, aide: '14 chiffres (SIREN + numéro d’établissement). Confirmé automatiquement dans le registre officiel.' },
    { cle: 'RNA',   libelle: 'RNA (association)',  exemple: 'W123456789',         max: 14, aide: 'W suivi de 9 chiffres — répertoire national des associations (France). Confirmé automatiquement.' },
    { cle: 'IFU',   libelle: 'IFU',                exemple: '3201900123456',      max: 30, aide: 'Identifiant fiscal unique. Vérifié par l’équipe sur justificatif.' },
    { cle: 'AUTRE', libelle: 'Autre',              exemple: 'NINEA, BCE, NIF…',   max: 60, aide: 'Indiquez le numéro officiel de votre pays. Vérifié par l’équipe sur justificatif.' },
  ];
  const par = cle => TYPES.find(t => t.cle === cle) || null;
  const compact = n => String(n || '').replace(/[\s.\-\/]/g, '').toUpperCase();
  const luhn = c => { let s = 0; for (let i = 0; i < c.length; i++) { let d = Number(c[c.length - 1 - i]); if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; } s += d; } return s % 10 === 0; };

  function detecter(numero) {
    const n = compact(numero);
    if (/^W\d{9}$/.test(n)) return 'RNA';
    if (/^\d{14}$/.test(n)) return 'SIRET';
    if (/^\d{9}$/.test(n)) return 'SIREN';
    if (/^RCCM\b/i.test(String(numero || '').trim()) || /^[A-Z]{2}[\s\-][A-Z]{2,4}[\s\-]\d{4}[\s\-][A-Z]/i.test(String(numero || '').trim())) return 'RCCM';
    return '';
  }

  function messageValidation(type, numero) {
    const brut = String(numero || '').trim(), n = compact(brut);
    if (!type) return 'Choisissez d’abord le type de votre numéro (RCCM, SIREN, SIRET, RNA, IFU ou Autre).';
    if (!brut) return 'Renseignez votre numéro d’immatriculation.';
    if (type === 'SIREN') { if (!/^\d{9}$/.test(n)) return 'Un SIREN comporte 9 chiffres.'; if (!luhn(n)) return 'Ce SIREN comporte une faute de frappe : vérifiez les chiffres.'; }
    if (type === 'SIRET') {
      if (!/^\d{14}$/.test(n)) return 'Un SIRET comporte 14 chiffres (SIREN + 5 chiffres).';
      const laPoste = n.startsWith('356000000') && n.split('').reduce((s, c) => s + Number(c), 0) % 5 === 0;
      if (!luhn(n) && !laPoste) return 'Ce SIRET comporte une faute de frappe : vérifiez les chiffres.';
    }
    if (type === 'RNA' && !/^W\d{9}$/.test(n)) return 'Un numéro RNA s’écrit W suivi de 9 chiffres (ex. W751234567).';
    if (type === 'RCCM' && (n.length < 6 || !/\d/.test(n))) return 'Un RCCM comporte le pays, la ville, l’année et un numéro (ex. CI-ABJ-2024-B-1234).';
    if (type === 'IFU' && (n.length < 5 || !/\d/.test(n))) return 'Ce numéro IFU paraît incomplet.';
    if (type === 'AUTRE' && n.length < 4) return 'Ce numéro paraît incomplet.';
    return '';
  }

  function styles() {
    if (document.getElementById('immat-type-css')) return;
    const st = document.createElement('style'); st.id = 'immat-type-css';
    st.textContent = `
.immat-t-lab{font-size:13px;font-weight:700;margin:0 0 6px}
.immat-t-pills{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px}
.immat-t-btn{border:1.5px solid var(--border,#cbd5e1);background:var(--card,#fff);color:var(--navy,#0D2B4E);border-radius:999px;padding:8px 15px;font:inherit;font-size:13px;font-weight:700;cursor:pointer;min-height:38px}
.immat-t-btn:hover{border-color:var(--navy,#0D2B4E)}
.immat-t-btn[aria-checked="true"]{background:var(--navy,#0D2B4E);border-color:var(--navy,#0D2B4E);color:#fff}
.immat-t-btn:focus-visible{outline:3px solid #F26422;outline-offset:2px}
.immat-t-aide{font-size:12px;color:var(--muted,#64748b);margin-top:6px;line-height:1.45}
.immat-t-zone input[type=text]:disabled{opacity:.55;cursor:not-allowed}
`;
    document.head.appendChild(st);
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function monter(zone, o) {
    if (!zone) return null;
    o = o || {};
    styles();
    const inputId = o.inputId || 'immat-numero', typeId = o.typeId || 'immat-type';
    let type = par(String(o.type || '').toUpperCase()) ? String(o.type).toUpperCase() : detecter(o.numero);
    zone.classList.add('immat-t-zone');
    zone.innerHTML =
      '<div class="immat-t-lab">' + esc(o.libelle || 'Quel numéro allez-vous saisir ?') + (o.obligatoire === false ? '' : ' <span style="color:#2563EB">*</span>') + '</div>' +
      '<div class="immat-t-pills" role="radiogroup" aria-label="Type de numéro">' +
        TYPES.map(t => '<button type="button" class="immat-t-btn" role="radio" data-type="' + t.cle + '" aria-checked="false">' + esc(t.libelle) + '</button>').join('') +
      '</div>' +
      '<input type="hidden" id="' + typeId + '" value="">' +
      '<input type="text" id="' + inputId + '" class="' + esc(o.classeInput || 'input-field') + '" style="width:100%;box-sizing:border-box" autocomplete="off" value="' + esc(o.numero || '') + '">' +
      '<div class="immat-t-aide" id="' + inputId + '-aide"></div>';
    const champ = zone.querySelector('#' + inputId), cache = zone.querySelector('#' + typeId), aide = zone.querySelector('#' + inputId + '-aide');
    const choisir = cle => {
      type = par(cle) ? cle : '';
      cache.value = type;
      zone.querySelectorAll('.immat-t-btn').forEach(b => b.setAttribute('aria-checked', String(b.dataset.type === type)));
      const t = par(type);
      champ.disabled = !t;
      champ.placeholder = t ? 'Ex : ' + t.exemple : 'Choisissez d’abord le type ci-dessus';
      champ.maxLength = t ? t.max : 60;
      aide.textContent = t ? t.aide : 'Cliquez sur ce que vous allez noter : cela nous permet de savoir de quel numéro il s’agit et de le vérifier correctement.';
      if (typeof o.onType === 'function') o.onType(type);
    };
    zone.querySelectorAll('.immat-t-btn').forEach(b => b.addEventListener('click', () => { choisir(b.dataset.type); if (!champ.disabled) champ.focus(); }));
    champ.addEventListener('input', () => { if (typeof o.onInput === 'function') o.onInput(champ.value); });
    choisir(type);
    // numéro déjà présent mais de forme inconnue : on laisse le champ modifiable, la personne doit alors préciser le type avant d'enregistrer
    if (!type && champ.value) { champ.disabled = false; aide.textContent = 'Précisez de quel type de numéro il s’agit en cliquant sur un des boutons ci-dessus.'; }
    return { choisir, lire: () => ({ type: cache.value, numero: champ.value.trim() }) };
  }

  function valider(typeId, inputId) {
    const t = document.getElementById(typeId), c = document.getElementById(inputId);
    return messageValidation(t ? t.value : '', c ? c.value : '');
  }

  window.ImmatType = { TYPES, detecter, monter, valider, messageValidation };
})();

/* ================================================================
   Diaspo'Actif — Géographie mondiale (autocomplete hiérarchique)
   Source : /api/geo/* (proxy CountriesNow API côté serveur)
   ================================================================ */
(function () {
  'use strict';

  const _cache = {};

  function _lang() {
    return (document.documentElement.lang || 'fr').slice(0, 5).toLowerCase();
  }

  async function geoFetch(path) {
    if (_cache[path]) return _cache[path];
    try {
      const r = await fetch('/api' + path);
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      _cache[path] = d;
      return d;
    } catch (e) {
      return {};
    }
  }

  window.geoGetCountries = async function () {
    const lang = _lang();
    const d = await geoFetch('/geo/countries?lang=' + lang);
    return d.countries || [];
  };

  window.geoGetStates = async function (country) {
    if (!country) return [];
    const lang = _lang();
    const d = await geoFetch('/geo/states?lang=' + lang + '&country=' + encodeURIComponent(country));
    return d.states || [];
  };

  window.geoGetCities = async function (country, state) {
    if (!country) return [];
    const lang = _lang();
    let path = '/geo/cities?lang=' + lang + '&country=' + encodeURIComponent(country);
    if (state) path += '&state=' + encodeURIComponent(state);
    const d = await geoFetch(path);
    return d.cities || [];
  };

  /*
   * GeoAutocomplete — composant réutilisable
   *
   * Usage :
   *   const comp = new GeoAutocomplete(document.getElementById('my-input'), {
   *     placeholder : 'Pays…',
   *     getList     : () => geoGetCountries(),
   *     onSelect    : (val) => { ... }
   *   });
   *
   * Si `anchor` est un <select> ou <input>, il est remplacé dans le DOM.
   * Si c'est un conteneur <div>, le composant est injecté dedans.
   */
  window.GeoAutocomplete = function (anchor, options) {
    const {
      placeholder = 'Rechercher…',
      getList     = async () => [],
      onSelect    = null,
      id          = null,
      inputClass  = '',
      initialValue= '',
    } = options;

    let _items   = [];
    let _loaded  = false;
    let _timer   = null;
    let _activeIdx = -1;

    /* ── Construire le DOM ── */
    const wrap = document.createElement('div');
    wrap.className = 'geo-wrap';

    const inputEl = document.createElement('input');
    inputEl.type        = 'text';
    inputEl.placeholder = placeholder;
    inputEl.className   = 'geo-input' + (inputClass ? ' ' + inputClass : '');
    inputEl.autocomplete = 'off';
    inputEl.spellcheck   = false;
    if (id) inputEl.id = id + '-text';

    const hiddenEl = document.createElement('input');
    hiddenEl.type = 'hidden';
    if (id) hiddenEl.id = id;
    hiddenEl.name = id || '';

    const clearBtn = document.createElement('button');
    clearBtn.type      = 'button';
    clearBtn.className = 'geo-clear';
    clearBtn.innerHTML = '&times;';
    clearBtn.style.display = 'none';
    clearBtn.setAttribute('aria-label', 'Effacer');

    const dropdown = document.createElement('ul');
    dropdown.className    = 'geo-dropdown';
    dropdown.style.display = 'none';
    dropdown.setAttribute('role', 'listbox');

    const loader = document.createElement('div');
    loader.className    = 'geo-loader';
    loader.style.display = 'none';
    loader.textContent  = 'Chargement…';

    wrap.append(inputEl, clearBtn, loader, dropdown, hiddenEl);

    /* Remplacer l'ancre dans le DOM */
    if (anchor.tagName === 'SELECT' || anchor.tagName === 'INPUT') {
      anchor.parentNode.replaceChild(wrap, anchor);
    } else {
      anchor.removeAttribute('id'); // évite le conflit avec l'id du hidden input
      anchor.innerHTML = '';
      anchor.appendChild(wrap);
    }

    /* ── Valeur ── */
    function _setValue(v) {
      inputEl.value    = v;
      hiddenEl.value   = v;
      clearBtn.style.display = v ? '' : 'none';
    }

    if (initialValue) _setValue(initialValue);

    /* ── Rendu dropdown ── */
    function _render(filtered, query) {
      _activeIdx = -1;
      dropdown.innerHTML = '';
      if (!filtered.length) { dropdown.style.display = 'none'; return; }

      const q = (query || '').trim().toLowerCase();
      filtered.slice(0, 60).forEach((item, i) => {
        const li = document.createElement('li');
        li.setAttribute('role', 'option');
        li.dataset.val = item;
        li.dataset.i   = i;
        if (q) {
          const idx = item.toLowerCase().indexOf(q);
          if (idx >= 0) {
            li.innerHTML =
              _esc(item.slice(0, idx)) +
              '<strong>' + _esc(item.slice(idx, idx + q.length)) + '</strong>' +
              _esc(item.slice(idx + q.length));
          } else {
            li.textContent = item;
          }
        } else {
          li.textContent = item;
        }
        li.addEventListener('mousedown', e => {
          e.preventDefault();
          _pick(item);
        });
        dropdown.appendChild(li);
      });
      dropdown.style.display = '';
    }

    function _pick(val) {
      _setValue(val);
      dropdown.style.display = 'none';
      _activeIdx = -1;
      if (onSelect) onSelect(val);
    }

    /* ── Chargement + filtre ── */
    async function _load(query) {
      if (!_loaded) {
        loader.style.display = '';
        try {
          _items  = await getList();
          _loaded = true;
        } catch (e) {
          _items = [];
        }
        loader.style.display = 'none';
      }
      const q = (query || '').trim().toLowerCase();
      const filtered = q
        ? _items.filter(it => it.toLowerCase().includes(q))
        : _items;
      _render(filtered, query);
    }

    /* ── Événements input ── */
    inputEl.addEventListener('input', () => {
      const q = inputEl.value;
      hiddenEl.value = '';
      clearBtn.style.display = q ? '' : 'none';
      _loaded = false; // force rechargement si getList dépend d'un parent
      clearTimeout(_timer);
      _timer = setTimeout(() => _load(q), 220);
    });

    inputEl.addEventListener('focus', () => _load(inputEl.value));

    inputEl.addEventListener('blur', () => {
      setTimeout(() => { dropdown.style.display = 'none'; }, 160);
    });

    inputEl.addEventListener('keydown', e => {
      const lis = dropdown.querySelectorAll('li');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _activeIdx = Math.min(_activeIdx + 1, lis.length - 1);
        lis.forEach((li, i) => li.classList.toggle('geo-active', i === _activeIdx));
        if (lis[_activeIdx]) lis[_activeIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _activeIdx = Math.max(_activeIdx - 1, 0);
        lis.forEach((li, i) => li.classList.toggle('geo-active', i === _activeIdx));
        if (lis[_activeIdx]) lis[_activeIdx].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (_activeIdx >= 0 && lis[_activeIdx]) _pick(lis[_activeIdx].dataset.val);
      } else if (e.key === 'Escape') {
        dropdown.style.display = 'none';
      }
    });

    clearBtn.addEventListener('click', () => {
      _setValue('');
      _loaded = false;
      dropdown.style.display = 'none';
      if (onSelect) onSelect('');
    });

    /* ── API publique ── */
    return {
      getValue  : () => hiddenEl.value,
      setValue  : _setValue,
      reset     : () => { _setValue(''); _loaded = false; },
      reloadList: () => { _loaded = false; },
      el        : wrap,
    };
  };

  /* ── Triplet pays → région → ville (helper de haut niveau) ── */
  window.GeoTriple = function ({
    countryAnchor, stateAnchor, cityAnchor,
    countryPlaceholder = 'Pays…',
    statePlaceholder   = 'Région / État…',
    cityPlaceholder    = 'Ville…',
    countryId, stateId, cityId,
    onCountrySelect, onStateSelect, onCitySelect,
  }) {
    let _country = '', _state = '';

    const country = new GeoAutocomplete(countryAnchor, {
      id         : countryId,
      placeholder: countryPlaceholder,
      getList    : () => geoGetCountries(),
      onSelect   : val => {
        _country = val;
        _state   = '';
        state.reset();
        city.reset();
        if (onCountrySelect) onCountrySelect(val);
      },
    });

    const state = new GeoAutocomplete(stateAnchor, {
      id         : stateId,
      placeholder: statePlaceholder,
      getList    : () => geoGetStates(_country),
      onSelect   : val => {
        _state = val;
        city.reset();
        if (onStateSelect) onStateSelect(val);
      },
    });

    const city = new GeoAutocomplete(cityAnchor, {
      id         : cityId,
      placeholder: cityPlaceholder,
      getList    : () => geoGetCities(_country, _state),
      onSelect   : val => { if (onCitySelect) onCitySelect(val); },
    });

    return { country, state, city };
  };

  /* ── Utilitaire ── */
  function _esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

})();

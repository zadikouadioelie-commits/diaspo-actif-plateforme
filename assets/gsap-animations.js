/* ===========================================================
   DIASPO'ACTIF — GSAP Animations
   GSAP 3 + ScrollTrigger | Vanilla JS | Zero dependencies
   =========================================================== */

(function () {
  'use strict';

  // Attendre que GSAP soit chargé
  if (typeof gsap === 'undefined') return;

  // Enregistrer les plugins
  if (typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);
  }

  /* ─────────────────────────────────────────
     1. PAGE ENTRANCE — Hero & topbar
  ───────────────────────────────────────── */
  function animatePageEntrance() {
    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    // Topbar glisse vers le bas
    tl.from('.topbar', {
      y: -60, opacity: 0, duration: 0.5
    });

    // Hero titre + sous-titre
    tl.from('.hero h1, .hero h2', {
      y: 28, opacity: 0, duration: 0.55, stagger: 0.12
    }, '-=0.25');

    tl.from('.hero p', {
      y: 18, opacity: 0, duration: 0.45
    }, '-=0.3');

    tl.from('.hero .btn, .hero button', {
      y: 14, opacity: 0, duration: 0.4, stagger: 0.1
    }, '-=0.25');

    // Badges / chips dans le hero
    tl.from('.hero [style*="badge"], .hero .tag', {
      scale: 0.8, opacity: 0, duration: 0.35, stagger: 0.07
    }, '-=0.3');
  }

  /* ─────────────────────────────────────────
     2. SCROLL REVEAL — Cards & sections
  ───────────────────────────────────────── */
  function animateScrollReveal() {
    if (typeof ScrollTrigger === 'undefined') return;

    // Toutes les cards
    gsap.utils.toArray('.card, .feed-post, .init-card, .stat-card, .price-card, .conf-card').forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: {
          trigger: el,
          start: 'top 88%',
          toggleActions: 'play none none none'
        },
        y: 30,
        opacity: 0,
        duration: 0.5,
        delay: (i % 4) * 0.07,
        ease: 'power2.out',
        clearProps: 'all'
      });
    });

    // Titres de sections
    gsap.utils.toArray('.section h2, .tuto-section-title, .content h1').forEach(el => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' },
        x: -20, opacity: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all'
      });
    });

    // Grilles — stagger enfants
    gsap.utils.toArray('.grid, .tuto-cards, .stat-row').forEach(grid => {
      const children = grid.children;
      if (children.length < 2) return;
      gsap.from(children, {
        scrollTrigger: { trigger: grid, start: 'top 85%', toggleActions: 'play none none none' },
        y: 24, opacity: 0, duration: 0.45, stagger: 0.08, ease: 'power2.out', clearProps: 'all'
      });
    });

    // Timeline items
    gsap.utils.toArray('.timeline-item').forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none none' },
        x: i % 2 === 0 ? -24 : 24,
        opacity: 0, duration: 0.45, ease: 'power2.out', clearProps: 'all'
      });
    });
  }

  /* ─────────────────────────────────────────
     3. COMPTEURS ANIMÉS — stat numbers
  ───────────────────────────────────────── */
  function animateCounters() {
    if (typeof ScrollTrigger === 'undefined') return;

    gsap.utils.toArray('.stat-card .num, #ai-stat-total, #ai-stat-vues, #ai-stat-publie').forEach(el => {
      const raw = el.textContent.replace(/[^0-9.]/g, '');
      const target = parseFloat(raw);
      if (isNaN(target) || target === 0) return;

      const suffix = el.textContent.replace(/[0-9.]/g, '').trim();
      const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;

      ScrollTrigger.create({
        trigger: el,
        start: 'top 88%',
        once: true,
        onEnter: () => {
          gsap.from({ val: 0 }, {
            val: target,
            duration: 1.4,
            ease: 'power2.out',
            onUpdate: function () {
              el.textContent = this.targets()[0].val.toFixed(decimals) + (suffix ? ' ' + suffix : '');
            }
          });
        }
      });
    });
  }

  /* ─────────────────────────────────────────
     4. BOUTONS — ripple effect au clic
  ───────────────────────────────────────── */
  function addRippleEffect() {
    document.querySelectorAll('.btn, button:not(.sidebar-close):not(.sidebar-toggle)').forEach(btn => {
      // Eviter double-bind
      if (btn.dataset.gsapRipple) return;
      btn.dataset.gsapRipple = '1';
      btn.style.position = btn.style.position || 'relative';
      btn.style.overflow = 'hidden';

      btn.addEventListener('click', function (e) {
        const rect = btn.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const ripple = document.createElement('span');
        ripple.style.cssText = `
          position:absolute;left:${x}px;top:${y}px;
          width:6px;height:6px;border-radius:50%;
          background:rgba(255,255,255,.35);
          pointer-events:none;transform:translate(-50%,-50%) scale(0);
        `;
        btn.appendChild(ripple);
        gsap.to(ripple, {
          scale: 30, opacity: 0, duration: 0.55, ease: 'power1.out',
          onComplete: () => ripple.remove()
        });
      });
    });
  }

  /* ─────────────────────────────────────────
     5. NAVIGATION — underline slide hover
  ───────────────────────────────────────── */
  function animateNavHover() {
    document.querySelectorAll('.nav a').forEach(link => {
      link.addEventListener('mouseenter', () => {
        gsap.to(link, { y: -1, duration: 0.18, ease: 'power2.out' });
      });
      link.addEventListener('mouseleave', () => {
        gsap.to(link, { y: 0, duration: 0.18, ease: 'power2.in' });
      });
    });
  }

  /* ─────────────────────────────────────────
     6. SIDEBAR — items stagger à l'ouverture
  ───────────────────────────────────────── */
  function animateSidebarOpen() {
    const toggle = document.querySelector('.sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', () => {
      if (sidebar.classList.contains('open')) {
        // Déjà géré par le CSS transition — on stagger quand même les liens
        const links = sidebar.querySelectorAll('a');
        gsap.from(links, {
          x: -16, opacity: 0, duration: 0.28, stagger: 0.04, ease: 'power2.out', clearProps: 'all'
        });
      }
    });
  }

  /* ─────────────────────────────────────────
     7. MODAUX — animation entrée/sortie
  ───────────────────────────────────────── */
  function watchModals() {
    const observer = new MutationObserver(mutations => {
      mutations.forEach(m => {
        if (m.type !== 'attributes' || m.attributeName !== 'style') return;
        const el = m.target;
        const isModal = el.id?.includes('modal') || el.style.position === 'fixed';
        if (!isModal) return;
        const isVisible = el.style.display === 'flex' || el.style.display === 'block';
        if (isVisible) {
          const inner = el.querySelector('div');
          if (inner) {
            gsap.from(inner, {
              scale: 0.92, opacity: 0, y: 16,
              duration: 0.3, ease: 'back.out(1.4)'
            });
          }
        }
      });
    });

    document.querySelectorAll('[id*="modal"], [id*="-modal"]').forEach(el => {
      observer.observe(el, { attributes: true });
    });
  }

  /* ─────────────────────────────────────────
     8. LOGO — animation au chargement
  ───────────────────────────────────────── */
  function animateLogo() {
    const logo = document.querySelector('.logo');
    if (!logo) return;
    gsap.from(logo, { x: -20, opacity: 0, duration: 0.5, ease: 'power2.out', delay: 0.1 });
  }

  /* ─────────────────────────────────────────
     9. FEED POSTS — stagger au chargement
  ───────────────────────────────────────── */
  function animateFeedOnLoad() {
    const feed = document.querySelectorAll('.feed-post');
    if (feed.length > 0) {
      gsap.from(feed, {
        y: 20, opacity: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out',
        delay: 0.3, clearProps: 'all'
      });
    }
  }

  /* ─────────────────────────────────────────
     10. INIT CARDS — hover scale subtil
  ───────────────────────────────────────── */
  function animateInitCards() {
    document.querySelectorAll('.init-card').forEach(card => {
      card.addEventListener('mouseenter', () => {
        gsap.to(card, { scale: 1.01, duration: 0.2, ease: 'power2.out' });
      });
      card.addEventListener('mouseleave', () => {
        gsap.to(card, { scale: 1, duration: 0.2, ease: 'power2.in' });
      });
    });
  }

  /* ─────────────────────────────────────────
     11. STAT CARDS — hover lift
  ───────────────────────────────────────── */
  function animateStatCards() {
    document.querySelectorAll('.stat-card').forEach(card => {
      card.addEventListener('mouseenter', () => {
        gsap.to(card, { y: -3, boxShadow: '0 8px 24px rgba(27,58,107,.14)', duration: 0.22, ease: 'power2.out' });
      });
      card.addEventListener('mouseleave', () => {
        gsap.to(card, { y: 0, boxShadow: '0 1px 3px rgba(27,58,107,.07)', duration: 0.22, ease: 'power2.in' });
      });
    });
  }

  /* ─────────────────────────────────────────
     12. TOAST HELPER global
  ───────────────────────────────────────── */
  window.showToast = function (message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    gsap.from(toast, { y: 20, opacity: 0, duration: 0.28, ease: 'back.out(1.4)' });

    setTimeout(() => {
      gsap.to(toast, {
        y: 10, opacity: 0, duration: 0.22, ease: 'power2.in',
        onComplete: () => toast.remove()
      });
    }, duration);
  };

  /* ─────────────────────────────────────────
     13. PAGE TRANSITION — fade out au clic
  ───────────────────────────────────────── */
  function addPageTransitions() {
    const overlay = document.createElement('div');
    overlay.id = 'page-transition-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:#fff;z-index:99999;
      pointer-events:none;opacity:0;
    `;
    document.body.appendChild(overlay);

    // Fade in depuis blanc au chargement de la page
    gsap.to(overlay, { opacity: 0, duration: 0.3, ease: 'power2.out', delay: 0.05 });

    // Intercepter les liens internes (pas les ancres, pas les nouvelles fenêtres)
    document.querySelectorAll('a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('http') || link.target === '_blank') return;

      link.addEventListener('click', e => {
        e.preventDefault();
        const dest = link.href;
        gsap.to(overlay, {
          opacity: 1, duration: 0.22, ease: 'power2.in',
          onComplete: () => { window.location.href = dest; }
        });
      });
    });
  }

  /* ─────────────────────────────────────────
     INIT — tout lancer au DOMContentLoaded
  ───────────────────────────────────────── */
  function init() {
    // Réduire les animations si l'utilisateur le préfère
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      gsap.globalTimeline.timeScale(100); // Tout à vitesse max = quasi invisible
      return;
    }

    animateLogo();
    animatePageEntrance();
    animateScrollReveal();
    animateCounters();
    addRippleEffect();
    animateNavHover();
    animateSidebarOpen();
    watchModals();
    animateFeedOnLoad();
    animateInitCards();
    animateStatCards();
    addPageTransitions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-appliquer ripple + hover aux éléments créés dynamiquement
  window._gsapRefresh = function () {
    addRippleEffect();
    animateInitCards();
    animateStatCards();
    if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
  };

})();

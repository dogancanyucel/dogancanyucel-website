/* ══ script.js ══
   Three behaviours, nothing else: the nav gains a hairline once the page
   scrolls, the small-screen menu opens, and sections fade in once.
   Every page on the site loads this file, so each lookup is optional —
   a missing element means that page simply doesn't have the behaviour. */

// ── Nav hairline on scroll ────────────────────────────────
const navbar = document.getElementById('navbar');
if (navbar) {
  const setScrolled = () => navbar.classList.toggle('scrolled', window.scrollY > 8);
  setScrolled();                                   // correct on a reload mid-page
  window.addEventListener('scroll', setScrolled, { passive: true });
}

// ── Small-screen menu ─────────────────────────────────────
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

if (hamburger && mobileMenu) {
  const setMenu = (open) => {
    mobileMenu.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
  };

  hamburger.addEventListener('click', () => {
    setMenu(!mobileMenu.classList.contains('open'));
  });

  mobileMenu.querySelectorAll('.mobile-link')
    .forEach(link => link.addEventListener('click', () => setMenu(false)));

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileMenu.classList.contains('open')) {
      setMenu(false);
      hamburger.focus();
    }
  });
}

// ── Reveal on scroll ──────────────────────────────────────
// The CSS already hides .reveal, so anything marked in the HTML must be
// shown again if this cannot run — otherwise a browser without
// IntersectionObserver would show a blank page.
const revealEls = document.querySelectorAll('.reveal');

if (revealEls.length) {
  if (!('IntersectionObserver' in window)) {
    revealEls.forEach(el => el.classList.add('visible'));
  } else {
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    revealEls.forEach(el => revealObserver.observe(el));
  }
}

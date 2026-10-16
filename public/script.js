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

// ── The glow under the cursor ─────────────────────────────
// Writes where the pointer is into two custom properties; the gradient that reads
// them lives in style.css. Two things keep it cheap: the value is only written once
// per frame no matter how many move events arrive, and it is written on <html>, so
// nothing in the page is invalidated — only the one fixed layer repaints.
//
// It stays off unless the device really has a pointer and the reader has not asked
// for less motion. A glow chasing a finger on a touchscreen is nothing but a
// repaint, and this is motion tied to input, which Reduce Motion covers.
{
  const pointer = matchMedia('(hover: hover) and (pointer: fine)');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let queued = false, x = 0, y = 0;

  const write = () => {
    queued = false;
    root.style.setProperty('--glow-x', x.toFixed(2) + '%');
    root.style.setProperty('--glow-y', y.toFixed(2) + '%');
  };

  const onMove = (e) => {
    x = (e.clientX / window.innerWidth) * 100;
    y = (e.clientY / window.innerHeight) * 100;
    if (!queued) { queued = true; requestAnimationFrame(write); }
    document.body.classList.add('glow-on');
  };

  // The glow follows a pointer, so it goes out when the pointer does.
  const onLeave = () => document.body.classList.remove('glow-on');

  const apply = () => {
    const on = pointer.matches && !still.matches;
    window.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerleave', onLeave);
    if (on) {
      window.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerleave', onLeave);
    } else {
      document.body.classList.remove('glow-on');
    }
  };

  apply();
  // A mouse can be plugged in, and Reduce Motion can be switched on, mid-visit.
  pointer.addEventListener('change', apply);
  still.addEventListener('change', apply);
}

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

// ── The screenshot strip walks itself ─────────────────────
// Only the Turquoise page has one. It starts stopped: the button is the whole contract
// (owner, 2026-11-14). It walks to the far end, then back, so nothing ever jumps; it stops
// when the strip leaves the screen, and the browser stops rAF in a hidden tab by itself.
const shotsStage = document.querySelector('.shots-stage');

if (shotsStage) {
  const strip = shotsStage.querySelector('.shot-strip');
  const button = shotsStage.querySelector('.shot-play');

  if (strip && button) {
    const SPEED = 90;          // px per second — about three seconds per screenshot
    let playing = false;       // what the owner asked for
    let onScreen = true;       // whether it is worth drawing
    let frame = 0;
    let last = 0;
    let dir = 1;               // 1 walks to the right, -1 comes back
    let at = 0;                // our own position, so fractions are not lost to rounding

    const limit = () => Math.max(0, strip.scrollWidth - strip.clientWidth);

    const step = (now) => {
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;   // a tab that was away does not leap
      last = now;
      const end = limit();
      if (end <= 0) { stop(); return; }                           // nothing to walk through
      at += dir * SPEED * dt;
      if (at >= end) { at = end; dir = -1; }
      else if (at <= 0) { at = 0; dir = 1; }
      strip.scrollLeft = at;
      frame = requestAnimationFrame(step);
    };

    const start = () => {
      if (frame) return;
      at = strip.scrollLeft;                                      // carry on from where it is
      last = 0;
      frame = requestAnimationFrame(step);
    };
    const stop = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    };

    const setPlaying = (on) => {
      playing = on;
      button.setAttribute('aria-pressed', String(on));
      button.setAttribute('aria-label', on ? 'Stop the screenshots' : 'Play the screenshots');
      if (on && onScreen) start(); else stop();
    };

    button.addEventListener('click', () => setPlaying(!playing));

    // A hand on the strip wins over the walk: dragging or scrolling it stops the machine.
    ['pointerdown', 'wheel', 'touchstart'].forEach((kind) =>
      strip.addEventListener(kind, () => { if (playing) setPlaying(false); }, { passive: true }));

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((entries) => {
        onScreen = entries[0].isIntersecting;
        if (playing && onScreen) start();
        if (!onScreen) stop();
      }, { threshold: 0.05 }).observe(strip);
    }
  }
}

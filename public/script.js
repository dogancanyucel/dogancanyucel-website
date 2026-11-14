/* ══ script.js ══
   Four behaviours, nothing else: the nav gains a hairline once the page
   scrolls, the small-screen menu opens, sections fade in once, and the
   Turquoise page's screenshot strip walks when its button is pressed.
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

    const SKIP = 100;          // ms: longer than this and the browser was not drawing us

    const step = (now) => {
      const gap = last ? now - last : 0;
      last = now;
      // A tab in the background, a hidden pane, a laptop lid: frames stop, then arrive in a
      // burst. Measured on the live site 2026-11-14: each caught-up frame took the clamped
      // maximum and the strip jumped 180px at once. A gap this long is not time the strip
      // walked through — it is time nobody saw, so it moves nothing.
      if (gap > SKIP) { frame = requestAnimationFrame(step); return; }
      const dt = gap / 1000;
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

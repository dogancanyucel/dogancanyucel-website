/* ══ script.js ══
   Five behaviours, nothing else: the page says it has a script, the nav gains
   a hairline once it scrolls, the small-screen panel opens, sections and the
   hero's marker arrive once, and the Turquoise page's screenshot strip walks
   when its button is pressed.
   Every page on the site loads this file, so each lookup is optional — a
   missing element means that page simply doesn't have the behaviour. */

// ── This page has a script ────────────────────────────────
// First line, and the one that arms everything else. Until it runs, the CSS
// leaves every .reveal finished and every marker plane drawn: a reader whose
// script is blocked, slow or broken gets the whole page, just without motion.
document.documentElement.classList.add('js');

// ── Nav hairline on scroll ────────────────────────────────
// A scroll event arrives many times a second; the class is only touched when
// the answer actually changes.
const navbar = document.getElementById('navbar');
if (navbar) {
  let hairline = null;
  const setScrolled = () => {
    const on = window.scrollY > 8;
    if (on === hairline) return;
    hairline = on;
    navbar.classList.toggle('scrolled', on);
  };
  setScrolled();                                   // correct on a reload mid-page
  window.addEventListener('scroll', setScrolled, { passive: true });
}

// ── Small-screen panel ────────────────────────────────────
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');

if (hamburger && mobileMenu) {
  const wide = matchMedia('(min-width: 761px)');    // the CSS breakpoint, said once

  const setMenu = (open) => {
    mobileMenu.classList.toggle('open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    // The panel covers the viewport, so the page behind it must not scroll
    // under the reader's finger. A class, not a style attribute: the policy is
    // `style-src 'self'`.
    document.documentElement.classList.toggle('menu-open', open);
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

  // A phone turned sideways, or a window dragged wide: the button that opens
  // the panel disappears at 761px, so the panel must not be left open behind
  // it, and nothing must be left claiming to be expanded.
  wide.addEventListener('change', (e) => { if (e.matches) setMenu(false); });
}

// ── Reveal, and the hero's one marker ─────────────────────
// The CSS only hides .reveal once `js` is on <html>, so this cannot leave a
// page blank — but a browser with no IntersectionObserver still gets
// everything shown at once rather than nothing.
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
    }, { threshold: 0.12, rootMargin: '0px 0px -12% 0px' });

    revealEls.forEach(el => revealObserver.observe(el));
  }
}

// The marker plane opens left to right, once, on load. The wait is a frame and
// not a timer: the clipped state has to be painted before the open state can
// be transitioned to, or the browser sees one style and animates nothing. The
// delay and the duration live in the stylesheet with the rest of the motion.
const wipe = document.querySelector('.mark-wipe');
if (wipe) requestAnimationFrame(() => requestAnimationFrame(() => wipe.classList.add('visible')));

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

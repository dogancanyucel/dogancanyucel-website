// app.dogancanyucel.com — the address that opens the Turquoise app from any browser (owner, 2026-09-16).
//
// Why a subdomain of its own: the reset page's "Turquoise ↗" used the app's URL scheme, which Safari opens and Microsoft Edge
// on iPhone silently ignores (the owner's Gmail opens links in Edge). A Universal Link is an ordinary https address the phone
// hands to the app instead of loading — but only when it is on a different host from the page it is tapped on, so it cannot
// live on dogancanyucel.com itself.
//
// Two things are served here: Apple's association file, which tells iOS this host belongs to the app (the app carries the
// matching `applinks:app.dogancanyucel.com` entitlement), and the page a link lands on when the app does not take it — no app
// installed, or a browser that will not hand links over — which offers the URL scheme as the way in that is left.

export const APP_LINKS_HOST = "app.dogancanyucel.com";
export const APPLE_APP_ID = "9V3ZFD8DXN.com.aistudio.fitai.trfity";
export const ANDROID_PACKAGE = "com.aistudio.fitai.trfity";
export const PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
export const OPEN_PATH = "/open/";

// Cairn's "Add to Cairn" links live here too (owner, 2026-11-10: "app.dogancanyucel.com olsun ama baska domainim yok"):
// the buttons stand on dogancanyucel.com/project/cairn/, and a link tapped on its own host stays in Safari. The link
// carries only a course's key; the course comes from inside the app (Cairn's `CourseLink`, SCAN_PLAN 27b). One file
// for two apps: a broken entry here breaks Turquoise's links too, which the test keeps watch on.
export const CAIRN_APP_ID = "9V3ZFD8DXN.com.dogancanyucel.cairn";
export const CAIRN_COURSE_PATH = "/cairn/course/";
export const CAIRN_PAGE = "https://dogancanyucel.com/project/cairn/";
// The app's own rule for a key (`CourseLink.isWellFormed`): lower-case words of letters and digits, single dashes.
const COURSE_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const APPLE_ASSOCIATION = {
  applinks: {
    details: [
      { appIDs: [APPLE_APP_ID], components: [{ "/": `${OPEN_PATH}*`, comment: "Opens the app" }] },
      { appIDs: [CAIRN_APP_ID], components: [{ "/": `${CAIRN_COURSE_PATH}*`, comment: "Adds a course to Cairn" }] },
    ],
  },
};

/** Where a course link goes when Cairn does not take it: the course on the project page, or the page itself. */
export function cairnCourseFallback(pathname) {
  let key = pathname.slice(CAIRN_COURSE_PATH.length);
  if (key.endsWith("/")) key = key.slice(0, -1);
  return key.length <= 64 && COURSE_KEY.test(key) ? `${CAIRN_PAGE}#course-${key}` : CAIRN_PAGE;
}

/**
 * The way into the app from this page, decided HERE and not in the browser.
 *
 * **It used to be decided by an inline `<script>`, and that script stopped running on 2026-11-06** — the day every
 * answer started carrying `script-src 'self'`. Measured on the live page 2026-11-14 (console, Chrome):
 * *"Executing inline script violates the following Content Security Policy directive 'script-src 'self''"*. So an
 * Android visitor without the app kept the URL-scheme href, which does nothing at all, and was left on the dead button
 * that `c1b510a` had been written on 2026-11-04 to get rid of. The fix is not an exception for the script: a page that
 * needs no script cannot have its script refused, and this one also works with JavaScript switched off.
 *
 * The cost is that the answer now depends on the request, so it must not be cached — see the `no-store` below.
 */
export function openHref(userAgent) {
  if (/Android/i.test(String(userAgent ?? ""))) {
    // browser_fallback_url is what Chrome loads when the package is not installed; before the app was on Google Play
    // (2026-11-04) there was nowhere to fall back to, so the link simply failed.
    return `intent://auth-done#Intent;scheme=${ANDROID_PACKAGE};package=${ANDROID_PACKAGE};` +
      `S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`;
  }
  // Everywhere else the URL scheme is the way in that is left; on iOS the Universal Link above has already had its turn.
  return `${ANDROID_PACKAGE}://auth-done`;
}

/**
 * The logo, drawn into the page rather than fetched.
 *
 * It used to be `<img src="https://dogancanyucel.com/assets/…">`, which `img-src 'self'` refuses from this host —
 * measured on the live page 2026-11-14: *"Loading the image … violates … img-src 'self'"*, and the button carried a
 * broken image. Copied from `public/assets/turquoise-ai-logo.svg`; `test/app-links.test.js` holds the two together, so
 * the copy cannot drift. Inline markup is not a subresource, so no directive has to make room for it.
 */
const LOGO = `<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" aria-hidden="true" focusable="false">
    <defs><linearGradient id="tq" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#80DEEA"/><stop offset="1" stop-color="#00ACC1"/></linearGradient></defs>
    <rect width="108" height="108" rx="24" fill="url(#tq)"/>
    <g transform="translate(30 30) scale(2)">
      <path fill="#1E293B" d="M12 21.35 10.55 20.03C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      <path fill="none" stroke="#00E5FF" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M4 12h2.5l2-3 3.5 7 2-4h4"/>
    </g>
  </svg>`;

/**
 * The page a link lands on when the app does not take it.
 *
 * The CSS stays inline for the reason Turquoise's account page keeps its own: this page is opened from a mail link on a
 * phone and must not flash unstyled while a stylesheet is fetched. It is allowed by **this request's nonce**, the way
 * /stats allows its one block — never `'unsafe-inline'`, and never a hash, because the page is built from a template
 * and a hash would be one more constant to keep in step with it.
 */
const landingHtml = (href, nonce) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>Turquoise</title>
  <style nonce="${nonce}">
    :root { color-scheme: light dark; --ground: #eef5f6; --accent: #00acc1; --ink: #00242b; }
    @media (prefers-color-scheme: dark) { :root { --ground: #0b1416; --accent: #00e5ff; } }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--ground); padding: 24px 16px;
      font: 17px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-sizing: border-box; }
    a { display: inline-flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 28px; border-radius: 16px;
      background: var(--accent); color: var(--ink); font-weight: 700; text-decoration: none; }
    a:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
    .logo { width: 32px; height: 32px; border-radius: 8px; }
  </style>
</head>
<body>
  <a id="open" href="${href}">${LOGO}<span>Turquoise</span><span aria-hidden="true">↗</span></a>
</body>
</html>
`;

/**
 * The policy this page is served with, in place of the site's.
 *
 * `index.js` adds the site's policy only to an answer that set none, so a route that needs its own says so here — the
 * pattern /stats already uses. The one difference from the site's is the nonce on `style-src`: everything else stays
 * `'self'` or `'none'`, and with the script and the foreign image gone there is nothing else to make room for.
 */
export function landingCsp(nonce) {
  return "default-src 'self'; script-src 'none'; " +
    `style-src 'self' 'nonce-${nonce}'; img-src 'self'; font-src 'self'; connect-src 'none'; ` +
    "base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'";
}

/** The answer for a request to app.dogancanyucel.com. */
export function appLinksResponse(request, url) {
  if (url.pathname === "/.well-known/apple-app-site-association" || url.pathname === "/apple-app-site-association") {
    // Apple fetches this through its own CDN: it must be JSON, answered directly, never a redirect.
    return new Response(JSON.stringify(APPLE_ASSOCIATION), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" },
    });
  }
  if (url.pathname.startsWith(CAIRN_COURSE_PATH)) {
    // Reached only when the app did not take the link (not installed, or a browser that keeps links). 302, not 301: a
    // permanent redirect is cached by the browser and would outlive a change of where the courses stand.
    return Response.redirect(cairnCourseFallback(url.pathname), 302);
  }
  if (url.pathname === OPEN_PATH.slice(0, -1) || url.pathname.startsWith(OPEN_PATH)) {
    const nonce = crypto.randomUUID();
    return new Response(landingHtml(openHref(request?.headers?.get("user-agent")), nonce), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        // Two reasons, both new with this version: the href is chosen from the request's own User-Agent, so one
        // visitor's answer must never be handed to another, and the nonce below is this request's alone.
        "Cache-Control": "no-store",
        "Content-Security-Policy": landingCsp(nonce),
      },
    });
  }
  return new Response("Not Found", { status: 404 });
}


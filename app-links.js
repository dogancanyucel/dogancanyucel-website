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

const LANDING = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="robots" content="noindex" />
  <title>Turquoise</title>
  <style>
    :root { color-scheme: light dark; --ground: #eef5f6; --accent: #00acc1; --ink: #00242b; }
    @media (prefers-color-scheme: dark) { :root { --ground: #0b1416; --accent: #00e5ff; } }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: var(--ground); padding: 24px 16px;
      font: 17px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; box-sizing: border-box; }
    a { display: inline-flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 28px; border-radius: 16px;
      background: var(--accent); color: var(--ink); font-weight: 700; text-decoration: none; }
    a:focus-visible { outline: 3px solid var(--ink); outline-offset: 3px; }
    img { width: 32px; height: 32px; border-radius: 8px; }
  </style>
</head>
<body>
  <a id="open" href="com.aistudio.fitai.trfity://auth-done"><img src="https://dogancanyucel.com/assets/turquoise-ai-logo.svg" alt="" /><span>Turquoise</span><span aria-hidden="true">↗</span></a>
  <script>
    if (/Android/i.test(navigator.userAgent)) {
      // browser_fallback_url is what Chrome loads when the package is not installed; before the app
      // was on Google Play (2026-11-04) there was nowhere to fall back to, so the link simply failed.
      document.getElementById("open").href = "intent://auth-done#Intent;scheme=${ANDROID_PACKAGE};package=${ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end";
    }
  </script>
</body>
</html>
`;

/** The answer for a request to app.dogancanyucel.com. */
export function appLinksResponse(url) {
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
    return new Response(LANDING, { headers: { "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "no-referrer" } });
  }
  return new Response("Not Found", { status: 404 });
}


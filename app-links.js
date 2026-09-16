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
export const OPEN_PATH = "/open/";

export const APPLE_ASSOCIATION = {
  applinks: {
    details: [{ appIDs: [APPLE_APP_ID], components: [{ "/": `${OPEN_PATH}*`, comment: "Opens the app" }] }],
  },
};

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
      document.getElementById("open").href = "intent://auth-done#Intent;scheme=com.aistudio.fitai.trfity;package=com.aistudio.fitai.trfity;end";
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
  if (url.pathname === OPEN_PATH.slice(0, -1) || url.pathname.startsWith(OPEN_PATH)) {
    return new Response(LANDING, { headers: { "Content-Type": "text/html; charset=utf-8", "Referrer-Policy": "no-referrer" } });
  }
  return new Response("Not Found", { status: 404 });
}


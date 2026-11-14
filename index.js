import { APP_LINKS_HOST, appLinksResponse } from "./app-links.js";
import { statsResponse } from "./site-stats.js";
import { clipsResponse } from "./clips.js";
import { apiRouteOf, countsAsVisit, recordApiCall, recordVisit } from "./traffic.js";

/**
 * The Work page is gone (owner, 2026-11-06: *"work tuşu farklı bir sayfa çıkıyor, orası ne
 * alaka ki, zaten home sayfasında var"*). It listed the same two projects as the row on the
 * home page, so "Work" now means that row. The address is answered rather than dropped: the
 * legal pages, the two project pages and anything that indexed it all pointed here.
 *
 * Only this one path. The project pages below it are real pages still, and Cairn's privacy
 * and terms are written into store listings — an exact-path lookup cannot swallow them.
 */
const WORK_PAGE_MOVED = "/project";

/** API routes nothing calls any more; they answer 410 — see the route below. */
const RETIRED_ROUTES = new Set(["/api/exercises", "/api/supplements", "/api/feedback"]);

/**
 * The headers every answer carries (2026-11-06, after the owner asked whether the site had ever been scanned:
 * *"peki web sitesinin aciklari var mi onun icin tarama yaptin mi"*). It had not. Measured, not copied from a list:
 * `curl -sI https://dogancanyucel.com/` returned `server: cloudflare` and nothing else — no policy of any kind, because
 * there is no `public/_headers` and the asset response below used to go out untouched.
 *
 * Why each value is this value, measured against what the site actually serves:
 *  - `connect-src` names **identitytoolkit.googleapis.com** because `public/turquoise/auth/action.js` calls Firebase's
 *    REST endpoint there; a plain `default-src 'self'` would have broken Turquoise's password reset, which is a live
 *    store-facing flow. The site makes no other outbound request — `play.google.com` and `app.dogancanyucel.com` are
 *    links a person clicks, which is navigation and not covered here.
 *  - `script-src`/`style-src` are bare `'self'`: measured 0 inline `<script>`, 0 inline `<style>` and 0 `on*=` handlers
 *    in every served page, so nothing needs an exception. /stats builds its own page with an inline `<style>` and
 *    therefore sets its own policy with a nonce — see site-stats.js.
 *  - `form-action 'self'`: there is no `<form>` on the site at all (the contact form went on 2026-09-21), and 'self'
 *    stays right the day one comes back.
 *  - `frame-ancestors`/`X-Frame-Options`: nothing here is meant to be embedded, and /stats sits behind a password the
 *    browser holds.
 *
 * **HSTS is deliberately absent**: `http://` already answers 301 to `https://`, but telling a browser "https only" for
 * a year is not freely reversible, so the max-age — and whether to preload — is the owner's call, not this file's.
 */
const BASE_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; " +
  "connect-src 'self' https://identitytoolkit.googleapis.com; " +
  "base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'";

/**
 * Turquoise's account page (`/turquoise/auth/`) is reached from a Firebase e-mail and carries its own 47 lines of CSS
 * **inline, on purpose**: it is the app's own turquoise palette rather than this site's, it must not flash unstyled on a
 * phone opening a mail link, and its header says nothing on the page loads from anywhere else — a property worth keeping
 * on a page whose address carries a one-time code.
 *
 * So the exception is the narrowest one that exists: the **hash of exactly that block**, not `'unsafe-inline'`. Any other
 * inline style, anywhere on the site, is still refused. Measured, not guessed: a plain `style-src 'self'` was about to
 * ship and would have stripped this live store-facing page of its styling (found 2026-11-06 while proving the policy
 * against every subresource the site really loads).
 *
 * **Editing that `<style>` block changes its hash and breaks the page.** `test/security-headers.test.js` computes the
 * hash from the file and fails with this constant's name when the two drift apart, so the suite says so before a visitor
 * does.
 */
const AUTH_PAGE_STYLE_HASH = "sha256-Sdn3ou9Fs2Rb1Kr+N+6sVPZCYNCjP51XE5DMr4BnrWw=";
const AUTH_PAGE_PREFIX = "/turquoise/auth";

/** The policy for one path: the site's, with the account page's one hashed block added. */
export function cspFor(pathname) {
  if (!pathname.startsWith(AUTH_PAGE_PREFIX)) return BASE_CSP;
  return BASE_CSP.replace("style-src 'self'", `style-src 'self' '${AUTH_PAGE_STYLE_HASH}'`);
}

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
};

/**
 * A status that must not carry a body; handing one a body throws `TypeError`.
 *
 * **This branch is not proved by a test, on purpose**: a `Response` with one of these statuses cannot be constructed
 * with a body, so the suite cannot build the input that would exercise it — a mock 304 already has a null body and
 * takes the other branch. It stays because ASSETS answers 304 for a conditional request (`If-None-Match`) on the real
 * platform, where the object it hands back is not built by this constructor. The test holds the part that can be held:
 * a 304 still comes out a 304 and still carries the policy.
 */
const BODYLESS = new Set([101, 103, 204, 205, 304]);

/**
 * The same answer with the site's security headers added. A header the route set itself is left alone, so /stats keeps
 * its own policy and its `no-store`.
 *
 * Wrapping here rather than in a `public/_headers` file: this is provable from the test suite, which drives the Worker
 * directly, and it covers the hand-written answers (404, 410, 500) as well as the static files. The cost is one Response
 * object per request.
 */
function hardened(response, pathname) {
  const out = new Response(BODYLESS.has(response.status) ? null : response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!out.headers.has(name)) out.headers.set(name, value);
  }
  if (!out.headers.has("Content-Security-Policy")) out.headers.set("Content-Security-Policy", cspFor(pathname));
  return out;
}

/** Everything the site answers. One return per route, counted by fetch below. */
async function handle(request, env, ctx, url) {

    // The app's own host answers nothing else — see app-links.js. The request goes in because the landing page's
    // one link is chosen from the User-Agent: the inline script that used to choose it in the browser was refused by
    // this file's own policy from the day it shipped.
    if (url.hostname === APP_LINKS_HOST) {
      return appLinksResponse(request, url);
    }

    // The owner's view of the tally. Answers 404 unless STATS_PASSWORD is set.
    const stats = await statsResponse(request, env, url);
    if (stats) return stats;

    // The exercise clips: App Check and sign-in, never public — see clips.js.
    const clips = await clipsResponse(request, env, url);
    if (clips) return clips;

    // Before ASSETS, so a stale link gets the row it was renamed to, not the 404 page.
    if (url.pathname.replace(/\/$/, "") === WORK_PAGE_MOVED) {
      return Response.redirect(new URL("/#work", url).toString(), 301);
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- ROTA 1, 1b, 2: /api/exercises, /api/supplements, /api/feedback — RETIRED (2026-10-24) ---
    // Nothing calls them. No version of either app ever called /api/exercises. Supplements and feedback were reached only
    // through Firebase callables holding the key server-side; the supplement lookup left the apps on 2026-08-20 and the
    // feedback callable files into Firestore itself since 2026-09-14 (Android repo 85d675bbd, 5c7611fd7). Left open, they
    // were D1 reads billed to the owner and an inbox anyone holding the key could fill. The D1 tables stay until the owner
    // decides; 410, not deletion, so a stale caller gets an answer and the tally in traffic.js still shows who knocks.
    if (RETIRED_ROUTES.has(url.pathname.replace(/\/$/, ""))) {
      return new Response(JSON.stringify({ error: "Gone." }), {
        status: 410, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // --- ROTA 3: POST /api/verify-email — RETIRED ---
    // It mailed any text to any address from noreply@dogancanyucel.com for whoever held the key: a phishing relay in the
    // owner's name, whose mail passes the domain's own checks (found 2026-09-16). Its only caller was the Firebase callable
    // workerVerifyEmail, the courier for a device-generated OTP that Android took out on 2026-08-14; that callable now refuses
    // too. Gone, not guarded: nothing sends anything from here, whatever the request carries.
    if (url.pathname === "/api/verify-email") {
      return new Response(JSON.stringify({ error: "Gone." }), {
        status: 410, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }
    // --- ROTA 4: POST /api/contact — RETIRED ---
    // The site's contact form was taken out on 2026-09-21 and this was its only caller. Whether the
    // route ever delivered was never established either way — its send() call matches the binding's
    // EmailMessageBuilder overload, so the failure, if there was one, was in Email Routing and not
    // in this code. What is certain is that it took no API key and no rate limit: a button anyone
    // could press, as often as they liked, to put mail in the owner's inbox from his own domain.
    // Retiring it costs nothing now that the page prints the address and lets the visitor's own
    // mail client do the work. 410 rather than deletion so a stale client gets an answer, not the
    // index page that ASSETS would otherwise hand a POST.
    if (url.pathname === "/api/contact") {
      return new Response(JSON.stringify({ error: "Gone." }), {
        status: 410, headers: { "Content-Type": "application/json", ...corsHeaders }
      });
    }

    // --- STATİK DOSYALAR İÇİN HATA KORUMASI ---
    try {
      if (env.ASSETS) {
        // After the response, never in front of it: waitUntil lets the page go out
        // first and the tally happen on the way.
        if (ctx?.waitUntil && countsAsVisit(request, url)) {
          ctx.waitUntil(recordVisit(request, env));
        }
        return await env.ASSETS.fetch(request);
      }
    } catch (assetsError) {
      // The reader is told nothing about the inside of the Worker: the message used to be interpolated into the body,
      // which hands a stranger its internals for free. The detail goes to the log, where only the owner reads it.
      console.error("ASSETS.fetch failed:", assetsError?.message);
      return new Response("Something went wrong.", { status: 500, headers: { "Content-Type": "text/plain" } });
    }

  return new Response("Not Found", { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = hardened(await handle(request, env, ctx, url), url.pathname);

    // After the answer, never in front of it. An API call is counted by route and
    // outcome and nothing else; where it came from is deliberately not recorded,
    // because those callers are people using the app.
    if (ctx?.waitUntil) {
      const route = apiRouteOf(url);
      if (route) ctx.waitUntil(recordApiCall(route, response.status, env));
    }
    return response;
  }
};
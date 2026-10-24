import { APP_LINKS_HOST, appLinksResponse } from "./app-links.js";
import { statsResponse } from "./site-stats.js";
import { clipsResponse } from "./clips.js";
import { apiRouteOf, countsAsVisit, recordApiCall, recordVisit } from "./traffic.js";

/** API routes nothing calls any more; they answer 410 — see the route below. */
const RETIRED_ROUTES = new Set(["/api/exercises", "/api/supplements", "/api/feedback"]);

/** Everything the site answers. One return per route, counted by fetch below. */
async function handle(request, env, ctx, url) {

    // The app's own host answers nothing else — see app-links.js.
    if (url.hostname === APP_LINKS_HOST) {
      return appLinksResponse(url);
    }

    // The owner's view of the tally. Answers 404 unless STATS_PASSWORD is set.
    const stats = await statsResponse(request, env, url);
    if (stats) return stats;

    // The exercise clips: App Check and sign-in, never public — see clips.js.
    const clips = await clipsResponse(request, env, url);
    if (clips) return clips;

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
      return new Response(`Static assets routing error: ${assetsError.message}`, { status: 500 });
    }

  return new Response("Not Found", { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const response = await handle(request, env, ctx, url);

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
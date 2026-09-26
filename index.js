import { APP_LINKS_HOST, appLinksResponse } from "./app-links.js";
import { statsResponse } from "./site-stats.js";
import { apiRouteOf, countsAsVisit, recordApiCall, recordVisit } from "./traffic.js";

/** Everything the site answers. One return per route, counted by fetch below. */
async function handle(request, env, ctx, url) {

    // The app's own host answers nothing else — see app-links.js.
    if (url.hostname === APP_LINKS_HOST) {
      return appLinksResponse(url);
    }

    // The owner's view of the tally. Answers 404 unless STATS_PASSWORD is set.
    const stats = await statsResponse(request, env, url);
    if (stats) return stats;

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- ROTA 1: GET /api/exercises ---
    if (url.pathname === "/api/exercises" && request.method === "GET") {
      try {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey || apiKey !== env.ANDROID_API_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing API Key." }), {
            status: 401, headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const target = url.searchParams.get("target");
        const bodyPart = url.searchParams.get("bodyPart");
        // Bounded the way /api/supplements already bounds itself. Unclamped, this took
        // whatever number the caller sent: SQLite reads a negative LIMIT as "no limit",
        // so ?limit=-1 returned the whole exercises table in a single request, and a
        // negative page seeked backwards. The rows are public data, but the D1 read is
        // billed to the owner, and one request should not be able to drag the table.
        // The ceiling is generous on purpose — shipped clients page through this and
        // must not start losing rows (found 2026-09-26; test/exercises-limit.test.js).
        const MAX_LIMIT = 500;
        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit")) || 20, 1), MAX_LIMIT);
        const page = Math.max(parseInt(url.searchParams.get("page")) || 1, 1);
        const offset = (page - 1) * limit;

        let query = "SELECT id, name, target, bodyPart, equipment, gifUrl, instructions FROM exercises WHERE 1=1";
        const queryParams = [];

        if (target) { query += " AND target = ?"; queryParams.push(target); }
        if (bodyPart) { query += " AND bodyPart = ?"; queryParams.push(bodyPart); }

        query += " LIMIT ? OFFSET ?";
        queryParams.push(limit, offset);

        const { results } = await env.DB.prepare(query).bind(...queryParams).all();

        return new Response(JSON.stringify({ page, limit, count: results.length, data: results }), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // --- ROTA 1b: GET /api/supplements?q=whey&limit=20 ---
    if (url.pathname === "/api/supplements" && request.method === "GET") {
      try {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey || apiKey !== env.ANDROID_API_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing API Key." }), {
            status: 401, headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const q = (url.searchParams.get("q") || "").trim();
        if (q.length < 2) {
          return new Response(JSON.stringify({ error: "Query 'q' must be at least 2 characters." }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit")) || 20, 1), 50);
        const tokens = q
          .toLowerCase()
          .split(/[\s,+]+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2)
          .slice(0, 6);

        if (tokens.length === 0) {
          return new Response(JSON.stringify({ error: "No usable search tokens." }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // Match all tokens against name OR brand; prefer on-market + products with macros
        let sql =
          "SELECT id, name, brand, serving, calories, protein, carbs, fat, ingredients, off_market " +
          "FROM supplements WHERE 1=1";
        const params = [];
        for (const token of tokens) {
          sql += " AND (LOWER(name) LIKE ? OR LOWER(brand) LIKE ?)";
          const like = `%${token}%`;
          params.push(like, like);
        }
        sql +=
          " ORDER BY off_market ASC, " +
          "(CASE WHEN calories > 0 OR protein > 0 OR carbs > 0 OR fat > 0 THEN 0 ELSE 1 END) ASC, " +
          "LENGTH(name) ASC LIMIT ?";
        params.push(limit);

        const { results } = await env.DB.prepare(sql).bind(...params).all();

        return new Response(
          JSON.stringify({
            q,
            count: results.length,
            data: results,
            source: "NIH DSLD (slim)",
          }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // --- ROTA 2: POST /api/feedback ---
    if (url.pathname === "/api/feedback" && request.method === "POST") {
      try {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey || apiKey !== env.ANDROID_API_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        const body = await request.json();
        const { email, message } = body;

        if (!message || message.trim() === "") {
          return new Response(JSON.stringify({ error: "Message required." }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        await env.DB.prepare("INSERT INTO feedbacks (user_email, message) VALUES (?, ?)").bind(email || "Anonymous", message).run();

        // Also forward to your personal inbox via Cloudflare Email Routing
        try {
          await env.EMAIL.send({
            to: "support@dogancanyucel.com",
            from: { email: "noreply@dogancanyucel.com", name: "Turquoise App Feedback" },
            subject: `App Feedback from ${email || "Anonymous"}`,
            text: `From: ${email || "Anonymous"}\n\n${message}`
          });
        } catch (emailErr) {
          console.warn("Feedback saved to DB but email forward failed:", emailErr.message);
        }

        return new Response(JSON.stringify({ success: true }), { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
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
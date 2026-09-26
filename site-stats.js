// /stats — where the website was read from, for the owner's eyes (2026-09-26).
//
// Its own file rather than another limb on index.js. Locked behind a password the
// worker never ships: STATS_PASSWORD is a Cloudflare secret, and when it is not set
// the route answers 404 rather than opening — an analytics page that fails open is
// worse than no analytics page.

const REALM = 'Basic realm="dogancanyucel.com stats - username is ignored, leave it blank", charset="UTF-8"';

/** Compares without leaking, through length or through timing, how far it matched. */
function sameSecret(given, expected) {
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  // Length is compared at the end so the loop cost does not reveal it.
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

/** The password out of an `Authorization: Basic` header, or "" when there is none. */
function passwordFrom(request) {
  const header = request.headers.get("authorization") || "";
  if (!/^Basic /i.test(header)) return "";
  try {
    const decoded = atob(header.slice(6).trim());
    return decoded.slice(decoded.indexOf(":") + 1);   // user part ignored
  } catch {
    return "";                                        // not valid base64
  }
}

const escape = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** PL -> 🇵🇱, built from the letters themselves so there is no country table. */
function flag(code) {
  if (!/^[A-Za-z]{2}$/.test(code)) return "";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function apiSection(api) {
  if (!api.length) {
    return `<p class="footnote">No API calls recorded yet. If the apps are live and this stays empty, the api_calls table is missing — see scripts/migrate-api-calls.sql.</p>`;
  }
  const rows = api.map((r) => {
    const rejected = Number(r.rejected) || 0;
    // Somebody without a valid key, in numbers worth looking at twice.
    const flag = rejected > 0 ? ` class="warn"` : "";
    return `<tr><td>${escape(r.day)}</td><td>${escape(r.route)}</td><td class="n">${r.ok || 0}</td><td class="n"${flag}>${rejected}</td></tr>`;
  }).join("");
  return `<table>
      <thead><tr><th>Day</th><th>Route</th><th class="n">Answered</th><th class="n">Rejected</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function page({ places, days, total, since, api }) {
  const placeRows = places.length
    ? places.map((r) => `<tr><td>${flag(r.country)} ${escape(r.country)}</td><td>${escape(r.city || "—")}</td><td class="n">${r.hits}</td></tr>`).join("")
    : `<tr><td colspan="3" class="empty">Nothing recorded yet. If the site is live and this stays empty, the site_visits table is missing — see scripts/migrate-site-visits.sql.</td></tr>`;
  const dayRows = days.map((r) => `<tr><td>${escape(r.day)}</td><td class="n">${r.hits}</td></tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta name="robots" content="noindex, nofollow" />
<title>Where the site is read</title>
<link rel="icon" href="/assets/dcy-icon.svg" type="image/svg+xml" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/style.css" />
<style>
  .stats { max-width: 820px; margin: 0 auto; padding: 64px var(--gutter) 96px; }
  .stats h1 { font-size: clamp(30px, 5vw, 42px); letter-spacing: -.03em; margin-bottom: 8px; }
  .stats .lead { margin: 0 0 32px; }
  .figure { font-size: clamp(40px, 8vw, 64px); font-weight: 600; letter-spacing: -.04em; line-height: 1; }
  .figure-label { color: var(--label-2); font-size: 15px; margin-top: 6px; }
  table { width: 100%; border-collapse: collapse; background: var(--surface); border-radius: var(--r-card); overflow: hidden; }
  th, td { text-align: left; padding: 11px 16px; border-bottom: 1px solid var(--hairline); font-size: 15px; }
  th { color: var(--label-2); font-weight: 500; font-size: 13px; letter-spacing: .02em; text-transform: uppercase; }
  tr:last-child td { border-bottom: 0; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  td.empty { color: var(--label-2); }
  td.warn { color: #9a3412; font-weight: 600; }
  .two { display: grid; gap: 20px; grid-template-columns: 1fr; margin-top: 20px; }
  @media (min-width: 720px) { .two { grid-template-columns: 1.4fr 1fr; align-items: start; } }
</style>
</head>
<body>
<main class="stats">
  <a href="/" class="back-link"><span aria-hidden="true">&larr;</span> Home</a>
  <h1>Where the site is read</h1>
  <p class="lead">Pages only — the app's API is never counted. A tally, not a trail: day, country, city, count.</p>
  <div class="figure">${total}</div>
  <div class="figure-label">page views${since ? ` since ${escape(since)}` : ""}</div>
  <div class="two">
    <table>
      <thead><tr><th>Country</th><th>City</th><th class="n">Views</th></tr></thead>
      <tbody>${placeRows}</tbody>
    </table>
    <table>
      <thead><tr><th>Day</th><th class="n">Views</th></tr></thead>
      <tbody>${dayRows}</tbody>
    </table>
  </div>

  <h2 class="title-2" style="margin: 48px 0 8px;">What the API answered</h2>
  <p class="footnote" style="margin: 0 0 16px;">How much, not who. Rejected means a request arrived without a valid key — the apps have one, so those are somebody else.</p>
  ${apiSection(api)}
</main>
</body>
</html>`;
}

/** The answer for /stats, or null when this request is not for it. */
export async function statsResponse(request, env, url) {
  if (url.pathname !== "/stats" && url.pathname !== "/stats/") return null;

  const secret = env?.STATS_PASSWORD;
  // No password configured: the page does not exist. Fail closed, not open.
  if (!secret) return new Response("Not Found", { status: 404 });

  if (!sameSecret(passwordFrom(request), secret)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": REALM, "Cache-Control": "no-store" },
    });
  }

  let places = [], days = [], total = 0, since = "", api = [];
  try {
    const [byPlace, byDay, sum, byRoute] = await Promise.all([
      env.DB.prepare("SELECT country, city, SUM(hits) AS hits FROM site_visits GROUP BY country, city ORDER BY hits DESC LIMIT 100").all(),
      env.DB.prepare("SELECT day, SUM(hits) AS hits FROM site_visits GROUP BY day ORDER BY day DESC LIMIT 30").all(),
      env.DB.prepare("SELECT SUM(hits) AS hits, MIN(day) AS since FROM site_visits").all(),
      env.DB.prepare(
        "SELECT day, route, " +
        "SUM(CASE WHEN outcome = 'ok' THEN hits ELSE 0 END) AS ok, " +
        "SUM(CASE WHEN outcome = 'rejected' THEN hits ELSE 0 END) AS rejected " +
        "FROM api_calls GROUP BY day, route ORDER BY day DESC, ok DESC LIMIT 60"
      ).all(),
    ]);
    places = byPlace.results ?? [];
    days = byDay.results ?? [];
    total = sum.results?.[0]?.hits ?? 0;
    since = sum.results?.[0]?.since ?? "";
    api = byRoute.results ?? [];
  } catch {
    // The table may not exist yet. The page says so rather than showing an error.
  }

  return new Response(page({ places, days, total, since, api }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}

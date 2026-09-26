import { APP_LINKS_HOST } from "./app-links.js";

// ── Where the site is read from ──────────────────────────────────────────────
// Counts pages, never the app. Owner, 2026-09-26: the API routes are called by
// Turquoise on people's phones, and recording where those calls come from would be
// collecting a new kind of data about app users — a privacy-policy and store-
// declaration change. Browsers reading the website are a different population, so
// only they are counted.
//
// What is kept is a tally, not a trail: day, country, city, count. No address, no
// user agent, no path, no time of day, nothing joining two requests together. A row
// reading "2026-09-26 · PL · Wroclaw · 14" cannot single anybody out, which is what
// keeps this out of consent territory rather than a promise that it is harmless.

/** True for a request that is a person opening a page of the site. */
export function countsAsVisit(request, url) {
  if (request.method !== "GET") return false;
  if (url.hostname === APP_LINKS_HOST) return false;        // the app's own host
  if (url.pathname.startsWith("/api/")) return false;       // the apps, not the site
  // Pages ask for HTML; stylesheets, scripts, icons and most crawlers do not.
  return (request.headers.get("accept") || "").includes("text/html");
}

/** Adds one to today's tally for the caller's city. Never throws at the caller. */
export async function recordVisit(request, env, now = new Date()) {
  const place = request.cf;
  if (!place || !env?.DB) return;                            // local dev has neither
  try {
    await env.DB.prepare(
      "INSERT INTO site_visits (day, country, city, hits) VALUES (?, ?, ?, 1) " +
      "ON CONFLICT(day, country, city) DO UPDATE SET hits = hits + 1"
    ).bind(
      now.toISOString().slice(0, 10),
      String(place.country || "??").slice(0, 2),
      String(place.city || "").slice(0, 64),
    ).run();
  } catch {
    // Swallowed on purpose: a counter must never cost someone the page they asked
    // for. The table may not exist yet, or D1 may be having a moment; either way the
    // visit is lost and the response is served. Nothing here is worth an error page.
  }
}

// ── How hard the API is being pulled ─────────────────────────────────────────
// Owner, 2026-09-26: "how do I see if others are pulling data from my site?"
//
// What this answers is how much, not who. Who would mean an address or something
// standing in for one, and that is personal data about the people using the app.
// How much is a number: day, route, outcome, count. The useful signal is the
// rejected column — the apps hold a valid key, so requests arriving without one are
// somebody trying the door, and a day with thousands of them says so plainly.
//
// It cannot tell one heavy caller from a hundred ordinary ones. That needs something
// per-caller, which is the line this stays on the safe side of. What it is for is
// noticing that the shape changed.

const API_ROUTES = new Set(["exercises", "supplements", "feedback", "verify-email", "contact"]);

/** The API route a request is for, or "" when it is not an API request at all. */
export function apiRouteOf(url) {
  if (url.hostname === APP_LINKS_HOST) return "";
  const match = /^\/api\/([a-z-]+)\/?$/.exec(url.pathname);
  return match && API_ROUTES.has(match[1]) ? match[1] : "";
}

/** ok / rejected / error, from the status the route answered with. */
export function outcomeOf(status) {
  if (status === 401 || status === 403) return "rejected";
  if (status >= 500) return "error";
  if (status >= 400) return "refused";
  return "ok";
}

/** Adds one to today's count for a route. Never throws at the caller. */
export async function recordApiCall(route, status, env, now = new Date()) {
  if (!route || !env?.DB) return;
  try {
    await env.DB.prepare(
      "INSERT INTO api_calls (day, route, outcome, hits) VALUES (?, ?, ?, 1) " +
      "ON CONFLICT(day, route, outcome) DO UPDATE SET hits = hits + 1"
    ).bind(now.toISOString().slice(0, 10), route, outcomeOf(status)).run();
  } catch {
    // Swallowed for the same reason the visit tally is: a counter must never cost
    // the caller the answer it came for. A missing table loses the count, nothing more.
  }
}

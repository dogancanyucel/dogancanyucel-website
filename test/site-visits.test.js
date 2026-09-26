// The visit tally counts pages and never the app, and keeps no trail (owner,
// 2026-09-26). Run: node test/site-visits.test.js
import assert from "node:assert";
import worker, { countsAsVisit, recordVisit } from "../index.js";

const HTML = { accept: "text/html,application/xhtml+xml" };
const page = (u, headers = HTML, method = "GET") => new Request(u, { method, headers });

// ── What gets counted ────────────────────────────────────────────────────────
const counted = [
  "https://dogancanyucel.com/",
  "https://dogancanyucel.com/project/",
  "https://dogancanyucel.com/privacy.html",
];
for (const u of counted) {
  assert.ok(countsAsVisit(page(u), new URL(u)), `${u} should count`);
}

const notCounted = [
  ["https://dogancanyucel.com/api/exercises", HTML, "GET"],      // the apps
  ["https://dogancanyucel.com/api/supplements", HTML, "GET"],
  ["https://dogancanyucel.com/api/feedback", HTML, "POST"],
  ["https://app.dogancanyucel.com/open/", HTML, "GET"],          // the app's own host
  ["https://dogancanyucel.com/style.css", { accept: "text/css" }, "GET"],
  ["https://dogancanyucel.com/script.js", { accept: "*/*" }, "GET"],
  ["https://dogancanyucel.com/assets/dcy-icon.svg", { accept: "image/*" }, "GET"],
  ["https://dogancanyucel.com/", HTML, "POST"],                  // not a page view
];
for (const [u, h, m] of notCounted) {
  assert.ok(!countsAsVisit(page(u, h, m), new URL(u)), `${u} (${m}) should NOT count`);
}

// ── What is written ──────────────────────────────────────────────────────────
let bound = null, sql = "";
const env = {
  DB: {
    prepare(q) {
      sql = q;
      return { bind: (...a) => { bound = a; return { run: async () => ({}) }; } };
    },
  },
};
const withPlace = new Request("https://dogancanyucel.com/", { headers: HTML });
Object.defineProperty(withPlace, "cf", { value: { country: "PL", city: "Wroclaw", latitude: "51.1", longitude: "17.0", asn: 5617 } });

await recordVisit(withPlace, env, new Date("2026-09-26T14:33:07Z"));
assert.deepStrictEqual(bound, ["2026-09-26", "PL", "Wroclaw"], "the tally is not day/country/city");
assert.ok(/ON CONFLICT\(day, country, city\) DO UPDATE SET hits = hits \+ 1/.test(sql), "not an upsert counter");

// Nothing that could follow one person around may reach the database.
const forbidden = ["latitude", "longitude", "asn", "51.1", "17.0", "5617"];
for (const f of forbidden) {
  assert.ok(!JSON.stringify(bound).includes(f), `"${f}" reached the database`);
  assert.ok(!sql.includes(f), `"${f}" is in the query`);
}
assert.ok(!/ip|user_agent|useragent|path|url/i.test(sql), "the query names something it should not keep");
assert.strictEqual(bound.length, 3, "more than day, country and city is being written");

// ── It must never cost anyone the page ───────────────────────────────────────
bound = null;
await recordVisit(withPlace, { DB: { prepare() { throw new Error("no such table: site_visits"); } } });
assert.strictEqual(bound, null, "a failing write should be swallowed");

await recordVisit(new Request("https://dogancanyucel.com/", { headers: HTML }), env); // no cf, as in local dev
await recordVisit(withPlace, {});                                                     // no DB binding

// ── And the worker still serves the page ─────────────────────────────────────
let served = 0;
const full = {
  ...env,
  ASSETS: { fetch: async () => { served++; return new Response("page", { status: 200 }); } },
};
const response = await worker.fetch(withPlace, full, { waitUntil: (p) => p });
assert.strictEqual(response.status, 200);
assert.strictEqual(served, 1, "the page was not served");

console.log("site-visits: pages counted, app routes never, only day/country/city kept, failures swallowed");

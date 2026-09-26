// The API tally counts how much, never who. Run: node test/api-calls.test.js
import assert from "node:assert";
import worker from "../index.js";
import { apiRouteOf, outcomeOf, recordApiCall } from "../traffic.js";

// ── Which requests are API requests ──────────────────────────────────────────
for (const [u, expected] of [
  ["https://dogancanyucel.com/api/exercises", "exercises"],
  ["https://dogancanyucel.com/api/exercises/", "exercises"],
  ["https://dogancanyucel.com/api/exercises?limit=5", "exercises"],
  ["https://dogancanyucel.com/api/supplements?q=whey", "supplements"],
  ["https://dogancanyucel.com/api/feedback", "feedback"],
  ["https://dogancanyucel.com/api/contact", "contact"],
  ["https://dogancanyucel.com/", ""],
  ["https://dogancanyucel.com/stats", ""],
  ["https://dogancanyucel.com/api/", ""],
  ["https://dogancanyucel.com/api/made-up", ""],          // unknown routes are not counted
  ["https://app.dogancanyucel.com/api/exercises", ""],     // the app's own host
]) {
  assert.strictEqual(apiRouteOf(new URL(u)), expected, `${u} -> ${apiRouteOf(new URL(u))}`);
}

// ── Outcomes ─────────────────────────────────────────────────────────────────
assert.strictEqual(outcomeOf(200), "ok");
assert.strictEqual(outcomeOf(201), "ok");
assert.strictEqual(outcomeOf(401), "rejected");   // no valid key: somebody else
assert.strictEqual(outcomeOf(403), "rejected");
assert.strictEqual(outcomeOf(400), "refused");
assert.strictEqual(outcomeOf(410), "refused");
assert.strictEqual(outcomeOf(500), "error");

// ── What is written ──────────────────────────────────────────────────────────
let bound = null, sql = "";
const DB = { prepare(q) { sql = q; return { bind: (...a) => { bound = a; return { run: async () => ({}) }; } }; } };

await recordApiCall("exercises", 401, { DB }, new Date("2026-09-26T09:12:00Z"));
assert.deepStrictEqual(bound, ["2026-09-26", "exercises", "rejected"]);
assert.ok(/ON CONFLICT\(day, route, outcome\) DO UPDATE SET hits = hits \+ 1/.test(sql), "not an upsert counter");
assert.strictEqual(bound.length, 3, "more than day, route and outcome is being written");
for (const forbidden of ["ip", "country", "city", "user_agent", "address"]) {
  assert.ok(!sql.toLowerCase().includes(forbidden), `the query names "${forbidden}"`);
}

// A failing write must never reach the caller.
bound = null;
await recordApiCall("exercises", 200, { DB: { prepare() { throw new Error("no such table: api_calls"); } } });
assert.strictEqual(bound, null);
await recordApiCall("", 200, { DB });        // not an API route
await recordApiCall("exercises", 200, {});   // no binding

// ── The worker counts through the wrapper, and still answers ─────────────────
const seen = [];
const env = {
  ANDROID_API_KEY: "the-key",
  ASSETS: { fetch: async () => new Response("asset") },
  DB: { prepare(q) { return { bind: (...a) => { if (q.includes("api_calls")) seen.push(a); return { run: async () => ({}), all: async () => ({ results: [] }) }; } }; } },
};
const ctx = { waitUntil: (p) => p };

const rejected = await worker.fetch(new Request("https://dogancanyucel.com/api/exercises"), env, ctx);
assert.strictEqual(rejected.status, 401, "an unkeyed call should still be refused");
await new Promise((r) => setTimeout(r, 0));
assert.deepStrictEqual(seen.at(-1)?.slice(1), ["exercises", "rejected"], "the rejection was not counted");

const before = seen.length;
await worker.fetch(new Request("https://dogancanyucel.com/", { headers: { accept: "text/html" } }), env, ctx);
await new Promise((r) => setTimeout(r, 0));
assert.strictEqual(seen.length, before, "a page view was counted as an API call");

console.log("api-calls: routes identified, outcomes classed, only day/route/outcome kept, pages never counted");

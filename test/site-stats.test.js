// /stats is the owner's and nobody else's. Run: node test/site-stats.test.js
import assert from "node:assert";
import worker from "../index.js";

const PASSWORD = "correct horse battery staple";
const basic = (pw, user = "owner") => ({ authorization: "Basic " + Buffer.from(`${user}:${pw}`).toString("base64") });

const rows = {
  "GROUP BY country, city": [{ country: "PL", city: "Wroclaw", hits: 14 }, { country: "TR", city: "Istanbul", hits: 9 }],
  "GROUP BY day": [{ day: "2026-09-26", hits: 23 }],
  "MIN(day)": [{ hits: 23, since: "2026-09-25" }],
};
const DB = {
  prepare(sql) {
    const key = Object.keys(rows).find((k) => sql.includes(k));
    return { all: async () => ({ results: rows[key] ?? [] }) };
  },
};
const ASSETS = { fetch: async () => new Response("asset") };
const get = (path, headers = {}) => new Request(`https://dogancanyucel.com${path}`, { headers });

// ── Closed when no password is configured ────────────────────────────────────
for (const env of [{ DB, ASSETS }, { DB, ASSETS, STATS_PASSWORD: "" }]) {
  const r = await worker.fetch(get("/stats"), env, {});
  assert.strictEqual(r.status, 404, "an unconfigured /stats must not exist");
}

const env = { DB, ASSETS, STATS_PASSWORD: PASSWORD };

// ── Closed to everyone without the password ──────────────────────────────────
for (const headers of [{}, basic(""), basic("wrong"), basic(PASSWORD + "x"), basic(PASSWORD.slice(0, -1)),
                       { authorization: "Bearer " + PASSWORD }, { authorization: "Basic !!!not-base64!!!" }]) {
  const r = await worker.fetch(get("/stats", headers), env, {});
  assert.strictEqual(r.status, 401, `got ${r.status} for ${JSON.stringify(headers)}`);
  assert.ok(/^Basic realm=/.test(r.headers.get("www-authenticate") || ""), "no challenge sent");
  assert.ok(!(await r.text()).includes("Wroclaw"), "a rejected request still saw the data");
}

// ── Open to the owner ────────────────────────────────────────────────────────
for (const path of ["/stats", "/stats/"]) {
  const r = await worker.fetch(get(path, basic(PASSWORD)), env, {});
  assert.strictEqual(r.status, 200, `${path} got ${r.status}`);
  const html = await r.text();
  for (const expected of ["Wroclaw", "Istanbul", "2026-09-26", "23", "🇵🇱", "🇹🇷"]) {
    assert.ok(html.includes(expected), `the page is missing ${expected}`);
  }
  assert.strictEqual(r.headers.get("cache-control"), "no-store", "the page may be cached");
  assert.ok(/noindex/.test(r.headers.get("x-robots-tag") || ""), "the page is indexable");
  assert.ok(/<meta name="robots" content="noindex/.test(html), "no robots meta");
}

// ── A broken table must not become an error page ─────────────────────────────
const broken = { DB: { prepare() { throw new Error("no such table: site_visits"); } }, ASSETS, STATS_PASSWORD: PASSWORD };
const r = await worker.fetch(get("/stats", basic(PASSWORD)), broken, {});
assert.strictEqual(r.status, 200, "a missing table should still render the page");
assert.ok((await r.text()).includes("Nothing recorded yet"), "the empty state is missing");

// ── It must not have taken over anything else ────────────────────────────────
const other = await worker.fetch(get("/statsomething"), env, {});
assert.strictEqual(other.status, 200, "an unrelated path was swallowed by /stats");
assert.strictEqual(await other.text(), "asset", "an unrelated path was not served from assets");

console.log("site-stats: 404 unconfigured, 401 without the password, renders for the owner, survives a missing table");

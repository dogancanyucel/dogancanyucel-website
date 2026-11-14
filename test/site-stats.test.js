// /stats is the owner's and nobody else's. Run: node test/site-stats.test.js
import assert from "node:assert";
import worker from "../index.js";

const PASSWORD = "correct horse battery staple";
const basic = (pw, user = "owner") => ({ authorization: "Basic " + Buffer.from(`${user}:${pw}`).toString("base64") });

// The api query also says "GROUP BY day", so its key comes first: with the page's own
// query matched to the day rows, the API table rendered from the wrong shape and the
// test still passed (found 2026-11-06).
const rows = {
  "FROM api_calls": [{ day: "2026-10-30", route: "exercises", total: 41, ok: 0, rejected: 2, refused: 39, err: 0 }],
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
  // Every outcome the table holds is on the page. A retired route answers 410, which is
  // "refused": showing only ok and rejected turned 39 calls from a caller nobody knows
  // about into a row of zeros — the very thing this page is read for (found 2026-11-06).
  for (const expected of ["exercises", "39", "41"]) {
    assert.ok(html.includes(expected), `the API table is missing ${expected}`);
  }
  for (const column of ["Answered", "Rejected", "Refused", "Failed"]) {
    assert.ok(html.includes(`>${column}<`), `the API table has no ${column} column`);
  }
  assert.ok(/switched off/.test(html), "the page does not say what a refused call means");
  // A table of seven columns is 629px at its narrowest, and a phone is 320-430: in normal flow
  // it drags the whole page sideways. It scrolls inside its own box instead, and that box can be
  // reached and scrolled from the keyboard (axe: scrollable-region-focusable).
  assert.match(html, /<div class="scroller" tabindex="0" role="region" aria-label="[^"]+">\s*<table>/,
    "the API table is not in a focusable scroll container");
  // The small print is given a colour of its own rather than the body's.
  //
  // This assertion used to name the token: `var(--label-2)`. That is how the 2026-11-14 redesign could delete
  // --label-2, --surface and --hairline from style.css and leave this page asking for all three with the suite
  // still green — the test proved the page agreed with ITSELF, never that the name existed. Whether the name is
  // real is test/worker-pages.test.js's job now, for every token on both pages the Worker builds.
  assert.match(html, /\.stats \.footnote \{ color: var\(--[\w-]+\)/, "the small print lost its own colour");
  assert.strictEqual(r.headers.get("cache-control"), "no-store", "the page may be cached");
  assert.ok(/noindex/.test(r.headers.get("x-robots-tag") || ""), "the page is indexable");
  assert.ok(/<meta name="robots" content="noindex/.test(html), "no robots meta");
}

// ── The username is not part of the secret ───────────────────────────────────
// Basic auth always asks for one and this page has none. Whatever is typed there must
// not matter, and the prompt says so — do not turn the user part into a second secret.
for (const user of ["", "owner", "admin", "a b c", "!@#$%^&*()", "türkçe", "1"]) {
  const ok = await worker.fetch(get("/stats", basic(PASSWORD, user)), env, {});
  assert.strictEqual(ok.status, 200, `username ${JSON.stringify(user)} was refused`);
  const no = await worker.fetch(get("/stats", basic("wrong", user)), env, {});
  assert.strictEqual(no.status, 401, `username ${JSON.stringify(user)} got in with a wrong password`);
}
assert.ok(
  /username is ignored/.test((await worker.fetch(get("/stats"), env, {})).headers.get("www-authenticate") || ""),
  "the prompt no longer tells the owner the username does not matter",
);

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

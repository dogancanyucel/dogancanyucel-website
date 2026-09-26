// /api/exercises must bound what one request can pull. The sibling route
// /api/supplements already clamps its limit; this one did not, and SQLite reads a
// negative LIMIT as "no limit" — so ?limit=-1 returned the whole table in one call.
// The data is public, but the D1 read is billed to the owner (found 2026-09-26).
// Run: node test/exercises-limit.test.js
import assert from "node:assert";
import worker from "../index.js";

const KEY = "test-key";
let lastBind = null;
let lastSql = "";

const env = {
  ANDROID_API_KEY: KEY,
  DB: {
    prepare(sql) {
      lastSql = sql;
      return {
        bind(...args) {
          lastBind = args;
          return { all: async () => ({ results: [] }) };
        },
      };
    },
  },
  ASSETS: { fetch: async () => new Response("asset") },
};

/** The LIMIT and OFFSET actually handed to D1 for a given query string. */
async function boundsFor(query) {
  lastBind = null;
  const request = new Request(`https://dogancanyucel.com/api/exercises${query}`, {
    headers: { "x-api-key": KEY },
  });
  const response = await worker.fetch(request, env);
  assert.strictEqual(response.status, 200, `${query} got ${response.status}`);
  assert.ok(lastBind, `${query} never reached the database`);
  assert.ok(/LIMIT \? OFFSET \?/.test(lastSql), "the query no longer binds LIMIT/OFFSET");
  const [limit, offset] = lastBind.slice(-2);
  return { limit, offset };
}

const CEILING = 500;

// A limit SQLite would read as "everything".
for (const q of ["?limit=-1", "?limit=-999", "?limit=0"]) {
  const { limit } = await boundsFor(q);
  assert.ok(limit >= 1, `${q} produced LIMIT ${limit}; a negative or zero limit is unbounded in SQLite`);
  assert.ok(limit <= CEILING, `${q} produced LIMIT ${limit}, above the ceiling ${CEILING}`);
}

// A limit nobody browsing a catalogue needs.
for (const q of ["?limit=100000", "?limit=999999999"]) {
  const { limit } = await boundsFor(q);
  assert.strictEqual(limit, CEILING, `${q} was not capped`);
}

// A page that would seek backwards.
for (const q of ["?page=-5", "?page=0"]) {
  const { offset } = await boundsFor(q);
  assert.ok(offset >= 0, `${q} produced OFFSET ${offset}`);
}

// What an ordinary client asks for must be untouched — shipped apps depend on it.
assert.deepStrictEqual(await boundsFor("?limit=20&page=2"), { limit: 20, offset: 20 }, "ordinary paging changed");
assert.deepStrictEqual(await boundsFor(""), { limit: 20, offset: 0 }, "the default page changed");
assert.deepStrictEqual(await boundsFor("?limit=50&page=3"), { limit: 50, offset: 100 }, "a 50-row page changed");
assert.deepStrictEqual(await boundsFor(`?limit=${CEILING}`), { limit: CEILING, offset: 0 }, "the ceiling itself is rejected");

console.log(`exercises-limit: LIMIT clamped to 1..${CEILING}, OFFSET never negative, ordinary paging unchanged`);

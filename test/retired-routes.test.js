// /api/exercises, /api/supplements and /api/feedback are retired (2026-10-24): nothing calls them. No version of either app
// ever called /api/exercises; supplements and feedback were reached only through Firebase callables, which stopped calling
// the Worker in August and September. They answer 410 whatever the request carries, and never reach D1 or the mail binding.
// Run: node test/retired-routes.test.js
import assert from "node:assert";
import worker from "../index.js";

let dbTouched = 0;
const sent = [];
const env = {
  ANDROID_API_KEY: "the-key",
  DB: { prepare() { dbTouched += 1; throw new Error("a retired route reached D1"); } },
  EMAIL: { send: async (mail) => { sent.push(mail); } },
  ASSETS: { fetch: async () => new Response("asset") },
};

const cases = [
  ["GET", "/api/exercises?limit=-1"],
  ["GET", "/api/exercises/"],
  ["GET", "/api/supplements?q=whey"],
  ["POST", "/api/feedback"],
  ["GET", "/api/feedback"],
];

for (const [method, path] of cases) {
  for (const key of ["the-key", "", "wrong"]) {
    const request = new Request(`https://dogancanyucel.com${path}`, {
      method,
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: method === "POST" ? JSON.stringify({ email: "a@example.com", message: "hello" }) : undefined,
    });
    const response = await worker.fetch(request, env);
    assert.strictEqual(response.status, 410, `${method} ${path} with key "${key}" got ${response.status}`);
  }
}

assert.strictEqual(dbTouched, 0, "a retired route read or wrote D1");
assert.deepStrictEqual(sent, [], "a retired route sent mail");
console.log("retired-routes: exercises, supplements and feedback answer 410 and touch nothing");

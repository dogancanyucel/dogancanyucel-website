// /api/exercises, /api/supplements and /api/feedback are retired (2026-10-24): nothing calls them. No version of either app
// ever called /api/exercises; supplements and feedback were reached only through Firebase callables, which stopped calling
// the Worker in August and September. They answer 410 whatever the request carries, and never reach D1 or the mail binding.
// Run: node test/retired-routes.test.js
import assert from "node:assert";
import { existsSync, readFileSync } from "node:fs";
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
// ── What the site no longer carries ─────────────────────────────────────────────────────────
// The ExerciseDB demo clips left both apps and this site on 2026-09-15 for their licence (owner:
// "tüm gifleri kaldır web sitemden de uygulamadan da"; iOS 5f0a977). The clips went; the map that
// pointed at them, public/exercise-media/overrides.json, stayed behind until 2026-11-06 — 55
// exercise names, in English and Turkish, mapped to 30 ExerciseDB media ids, served publicly from
// a repository that is public, for a file the site never had and no app has asked for since.
// The Android app deletes its cached copy of it (ExerciseMediaRemoval.kt) and asserts no source
// reaches /exercise-media/ (ExerciseDbMediaIsGoneTest.kt); no Swift file names it either.
assert.ok(!existsSync("public/exercise-media"), "the ExerciseDB media map is being served again");
for (const file of ["public/index.html", "public/script.js", "index.js", "clips.js"]) {
  assert.ok(!readFileSync(file, "utf8").includes("exercise-media"), `${file} reaches for the removed media map`);
}

console.log("retired-routes: exercises, supplements and feedback answer 410 and touch nothing; the removed media map is not served");

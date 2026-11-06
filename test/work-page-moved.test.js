// The Work page became the row on the home page. Its address must answer 301 — and nothing
// else under /project/ may, because those are real pages and two of them are in store listings.
import assert from "node:assert";
import worker from "../index.js";

const env = { ASSETS: { fetch: async (req) => new Response("asset:" + new URL(req.url).pathname) } };
const get = (address) => worker.fetch(new Request(address), env);
const home = "https://dogancanyucel.com";

for (const from of ["/project/", "/project"]) {
  const res = await get(home + from);
  assert.strictEqual(res.status, 301, `${from} is permanently moved`);
  assert.strictEqual(res.headers.get("Location"), home + "/#work", `${from} lands on the row`);
}
console.log("work-page-moved: /project/ answers 301 to the row on the home page");

for (const kept of [
  "/project/turquoise-ai-calorie-fitness/",
  "/project/cairn/",
  "/project/cairn/privacy/",      // written into Cairn's store listing
  "/project/cairn/terms/",        // written into Cairn's store listing
  "/privacy.html", "/terms.html", "/website-privacy.html", "/",
]) {
  const res = await get(home + kept);
  assert.strictEqual(res.status, 200, `${kept} is still served`);
  assert.strictEqual(await res.text(), "asset:" + kept, `${kept} comes from the files, not a redirect`);
}
console.log("work-page-moved: every other page keeps its address and is served, not redirected");

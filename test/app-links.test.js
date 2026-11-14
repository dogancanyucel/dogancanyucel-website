// app.dogancanyucel.com: Apple's association file and the landing page, and nothing of the main site's.
import assert from "node:assert";
import { readFile } from "node:fs/promises";
import worker from "../index.js";
import { ANDROID_PACKAGE, APPLE_APP_ID, CAIRN_APP_ID, PLAY_URL } from "../app-links.js";

const env = { ASSETS: { fetch: async () => new Response("asset") }, EMAIL: { send: async () => { throw new Error("no mail here"); } } };
const get = (address) => worker.fetch(new Request(address), env);

const association = await get("https://app.dogancanyucel.com/.well-known/apple-app-site-association");
assert.strictEqual(association.status, 200);
assert.strictEqual(association.headers.get("Content-Type"), "application/json", "Apple reads only JSON");
const body = await association.json();
assert.deepStrictEqual(body.applinks.details[0].appIDs, [APPLE_APP_ID]);
assert.strictEqual(APPLE_APP_ID, "9V3ZFD8DXN.com.aistudio.fitai.trfity", "team id and bundle id of the app");
assert.deepStrictEqual(body.applinks.details[0].components.map((c) => c["/"]), ["/open/*"]);
// Cairn beside Turquoise in the same file (owner, 2026-11-10); Turquoise's entry above is unchanged by it.
assert.strictEqual(body.applinks.details.length, 2);
assert.deepStrictEqual(body.applinks.details[1].appIDs, [CAIRN_APP_ID]);
assert.strictEqual(CAIRN_APP_ID, "9V3ZFD8DXN.com.dogancanyucel.cairn", "team id and bundle id of Cairn");
assert.deepStrictEqual(body.applinks.details[1].components.map((c) => c["/"]), ["/cairn/course/*"]);

// Without the app, a course link lands on the course in the project page; anything malformed on the page itself.
for (const [address, expected] of [
  ["https://app.dogancanyucel.com/cairn/course/python", "https://dogancanyucel.com/project/cairn/#course-python"],
  ["https://app.dogancanyucel.com/cairn/course/python-web/", "https://dogancanyucel.com/project/cairn/#course-python-web"],
  ["https://app.dogancanyucel.com/cairn/course/Python", "https://dogancanyucel.com/project/cairn/"],
  ["https://app.dogancanyucel.com/cairn/course/%3Cscript%3E", "https://dogancanyucel.com/project/cairn/"],
  ["https://app.dogancanyucel.com/cairn/course/", "https://dogancanyucel.com/project/cairn/"],
]) {
  const answer = await get(address);
  assert.strictEqual(answer.status, 302, address);
  assert.strictEqual(answer.headers.get("Location"), expected, address);
}

// ── The landing page, as a browser would really get it ──────────────────────────────────────
// The old test here asserted that both hrefs appeared somewhere in the HTML, and it stayed green for eight days while
// the page was broken on the live site: the Android one was inside an inline <script>, and the Worker's own
// `script-src 'self'` refused to run it. A string being present in a page proves nothing about a page under a policy.
// So: the href is asserted per User-Agent, and every inline thing the page carries is asserted against the policy the
// Worker serves it with (test/worker-pages.test.js holds that rule for both Worker-built pages).
const android = await worker.fetch(new Request("https://app.dogancanyucel.com/open/auth-done", {
  headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/131" } }), env);
const androidHtml = await android.text();
assert.strictEqual(android.status, 200);
assert.strictEqual(ANDROID_PACKAGE, "com.aistudio.fitai.trfity", "the package id of the app on Google Play");
assert.strictEqual(PLAY_URL, `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);
// A visitor on Android without the app installed: Chrome loads the fallback instead of failing.
assert.ok(androidHtml.includes(`href="intent://auth-done#Intent;scheme=${ANDROID_PACKAGE};`),
  "an Android visitor is not given the intent link");
assert.ok(androidHtml.includes(`S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`),
  "the Android intent falls back to the Play listing, encoded so the ; and ? do not end the intent");
assert.ok(!androidHtml.includes(`href="${ANDROID_PACKAGE}://auth-done"`),
  "Android was given the URL scheme, which does nothing when the app is not installed");

// Everywhere else — iPhone, a desktop, a crawler with no User-Agent at all — keeps the scheme.
for (const agent of ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", "Mozilla/5.0 (Macintosh)", undefined]) {
  const answer = await worker.fetch(new Request("https://app.dogancanyucel.com/open/auth-done",
    agent ? { headers: { "user-agent": agent } } : {}), env);
  const html = await answer.text();
  assert.ok(html.includes(`href="${ANDROID_PACKAGE}://auth-done"`), `${agent}: the scheme is the way in that is left`);
  assert.ok(!html.includes("intent://"), `${agent}: given Android's link`);
}

// The answer depends on the request, so it must never be handed to the next visitor.
assert.strictEqual(android.headers.get("Cache-Control"), "no-store",
  "the href is chosen from the User-Agent and the nonce is per-request: a cached copy would be the wrong one");

// The logo is drawn into the page, not fetched: `img-src 'self'` refuses dogancanyucel.com from this host, which is
// what left a broken image on the live page. This holds the inline copy to the file it was copied from.
assert.ok(!androidHtml.includes("<img"), "an <img> here is a subresource the policy has to make room for");
const logoFile = await readFile(new URL("../public/assets/turquoise-ai-logo.svg", import.meta.url), "utf8");
for (const path of logoFile.match(/ d="[^"]+"/g)) {
  assert.ok(androidHtml.includes(path.trim()), `the inline logo has drifted from the file: ${path.trim().slice(0, 40)}…`);
}

assert.strictEqual((await get("https://app.dogancanyucel.com/api/contact")).status, 404, "the main site's routes are not served here");
assert.strictEqual((await get("https://app.dogancanyucel.com/")).status, 404);
assert.strictEqual(await (await get("https://dogancanyucel.com/privacy.html")).text(), "asset", "the main site is untouched");
console.log("app-links: association and landing served, nothing else");

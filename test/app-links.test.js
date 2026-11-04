// app.dogancanyucel.com: Apple's association file and the landing page, and nothing of the main site's.
import assert from "node:assert";
import worker from "../index.js";
import { ANDROID_PACKAGE, APPLE_APP_ID, PLAY_URL } from "../app-links.js";

const env = { ASSETS: { fetch: async () => new Response("asset") }, EMAIL: { send: async () => { throw new Error("no mail here"); } } };
const get = (address) => worker.fetch(new Request(address), env);

const association = await get("https://app.dogancanyucel.com/.well-known/apple-app-site-association");
assert.strictEqual(association.status, 200);
assert.strictEqual(association.headers.get("Content-Type"), "application/json", "Apple reads only JSON");
const body = await association.json();
assert.deepStrictEqual(body.applinks.details[0].appIDs, [APPLE_APP_ID]);
assert.strictEqual(APPLE_APP_ID, "9V3ZFD8DXN.com.aistudio.fitai.trfity", "team id and bundle id of the app");
assert.deepStrictEqual(body.applinks.details[0].components.map((c) => c["/"]), ["/open/*"]);

const landing = await get("https://app.dogancanyucel.com/open/auth-done");
assert.strictEqual(landing.status, 200);
const landingHtml = await landing.text();
assert.match(landingHtml, /com\.aistudio\.fitai\.trfity:\/\/auth-done/, "the scheme is the way in that is left");
assert.strictEqual(ANDROID_PACKAGE, "com.aistudio.fitai.trfity", "the package id of the app on Google Play");
assert.strictEqual(PLAY_URL, `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`);
// A visitor on Android without the app installed: Chrome loads the fallback instead of failing.
assert.ok(
  landingHtml.includes(`S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`),
  "the Android intent falls back to the Play listing, encoded so the ; and ? do not end the intent"
);

assert.strictEqual((await get("https://app.dogancanyucel.com/api/contact")).status, 404, "the main site's routes are not served here");
assert.strictEqual((await get("https://app.dogancanyucel.com/")).status, 404);
assert.strictEqual(await (await get("https://dogancanyucel.com/privacy.html")).text(), "asset", "the main site is untouched");
console.log("app-links: association and landing served, nothing else");

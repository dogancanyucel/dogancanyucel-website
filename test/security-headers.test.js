// Every answer this site gives carries a security policy (2026-11-06). The owner asked whether the site had ever been
// scanned — *"peki web sitesinin aciklari var mi onun icin tarama yaptin mi"* — and it had not: `curl -sI` on the live
// site returned `server: cloudflare` and no policy of any kind, because the Worker handed back `env.ASSETS.fetch()`
// untouched and there is no `public/_headers`.
//
// What these tests hold down, each of which was measured against the pages the site really serves:
//   - the four headers are on a static page, on a hand-written answer (410) and on a 404;
//   - the policy still lets Turquoise's password reset reach identitytoolkit.googleapis.com — a plain
//     `default-src 'self'` would have broken a live, store-facing flow, which is the one way this change could have
//     done real harm;
//   - /stats keeps its own policy and its own no-store, with a per-request nonce for the one inline <style>,
//     and carries no `style="..."` attribute, which a nonce does not cover;
//   - a 304 is not handed a body (wrapping a bodyless status with one throws).
// Run: node test/security-headers.test.js
import assert from "node:assert";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import worker, { cspFor } from "../index.js";
import { apiRouteOf } from "../traffic.js";

const env = {
  ASSETS: { fetch: async () => new Response("<!DOCTYPE html><title>home</title>", {
    headers: { "Content-Type": "text/html; charset=utf-8" } }) },
  DB: { prepare: () => ({ bind: () => ({ run: async () => {} }) }) },
};

const get = (path, init) => worker.fetch(new Request(`https://dogancanyucel.com${path}`, init), env);

const REQUIRED = ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"];

// ── 1. On every kind of answer ──────────────────────────────────────────────────────────────
for (const path of ["/", "/index.html", "/privacy.html", "/api/feedback", "/no-such-page"]) {
  const response = await get(path);
  for (const header of REQUIRED) {
    assert.ok(response.headers.get(header), `${path} (${response.status}) has no ${header}`);
  }
  assert.strictEqual(response.headers.get("X-Content-Type-Options"), "nosniff", path);
}

// ── 2. The policy fits what the site actually serves ────────────────────────────────────────
const policy = (await get("/")).headers.get("Content-Security-Policy");
assert.match(policy, /default-src 'self'/);
assert.match(policy, /frame-ancestors 'none'/);
assert.match(policy, /base-uri 'none'/);
assert.match(policy, /object-src 'none'/);
// The one outbound call the site makes: public/turquoise/auth/action.js -> Firebase Auth REST.
assert.match(policy, /connect-src [^;]*https:\/\/identitytoolkit\.googleapis\.com/,
  "the policy would break Turquoise's password reset");
// Nothing inline was measured in the served pages, so no page needs an exception.
assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval/, "the site needs neither");

// ── 2b. The account page's inline <style> is allowed by its hash, and the hash is the file's ─
// Turquoise's /turquoise/auth/ page keeps 47 lines of CSS inline on purpose (its own palette, no flash on a mail link,
// nothing loaded from elsewhere). A plain `style-src 'self'` was about to ship and would have stripped a live,
// store-facing page — found by measuring every subresource the site really loads, not by reading the diff.
//
// This is the test that keeps it honest: the hash is computed from the file here, so editing that <style> block fails
// the suite instead of quietly breaking the page for whoever clicks a password-reset mail.
const authHtml = await readFile(new URL("../public/turquoise/auth/index.html", import.meta.url), "utf8");
const inlineStyle = /<style[^>]*>([\s\S]*?)<\/style>/.exec(authHtml);
assert.ok(inlineStyle, "the account page no longer has an inline <style> — the hash exception can go");
const liveHash = "sha256-" + createHash("sha256").update(inlineStyle[1], "utf8").digest("base64");

const authPolicy = cspFor("/turquoise/auth/");
assert.ok(authPolicy.includes(liveHash),
  `the account page's <style> was edited: AUTH_PAGE_STYLE_HASH in index.js must become ${liveHash}`);
assert.doesNotMatch(authPolicy, /style-src[^;]*unsafe-inline/, "a hash, not unsafe-inline");
// Everywhere else keeps the strict policy — the exception is that one page.
assert.ok(!cspFor("/").includes(liveHash), "the hash leaked onto the rest of the site");
assert.ok(!cspFor("/privacy.html").includes("sha256-"), "the hash leaked onto the rest of the site");
// And the header a visitor to that page really receives carries it.
const authResponse = await worker.fetch(new Request("https://dogancanyucel.com/turquoise/auth/?mode=resetPassword"), {
  ASSETS: { fetch: async () => new Response(authHtml, { headers: { "Content-Type": "text/html; charset=utf-8" } }) } });
assert.ok(authResponse.headers.get("Content-Security-Policy").includes(liveHash),
  "the account page is served without its own hash");

// ── 3. /stats keeps its own, stricter policy ────────────────────────────────────────────────
const stats = await worker.fetch(
  new Request("https://dogancanyucel.com/stats", { headers: { authorization: "Basic " + btoa(":right") } }),
  { ...env, STATS_PASSWORD: "right" });
assert.strictEqual(stats.status, 200);
const statsPolicy = stats.headers.get("Content-Security-Policy");
assert.match(statsPolicy, /script-src 'none'/, "/stats runs no script and should say so");
const nonce = /'nonce-([^']+)'/.exec(statsPolicy);
assert.ok(nonce, "/stats has an inline <style> and needs a nonce for it");
assert.doesNotMatch(statsPolicy, /unsafe-inline/, "a nonce, not unsafe-inline");
assert.strictEqual(stats.headers.get("Cache-Control"), "no-store", "index.js overwrote the route's own header");

const html = await stats.text();
assert.ok(html.includes(`<style nonce="${nonce[1]}">`), "the nonce in the header is not the one on the tag");
// Comments out first: the page explains in a comment why it carries no style attribute, and the words of the
// explanation are not an attribute. The markup is what is checked.
const markup = html.replace(/<!--[\s\S]*?-->/g, "");
assert.doesNotMatch(markup, /\sstyle="/, "a style attribute is not covered by a nonce");

// Two requests, two nonces — a fixed one is no better than 'unsafe-inline'.
const again = await worker.fetch(
  new Request("https://dogancanyucel.com/stats", { headers: { authorization: "Basic " + btoa(":right") } }),
  { ...env, STATS_PASSWORD: "right" });
assert.notStrictEqual(/'nonce-([^']+)'/.exec(again.headers.get("Content-Security-Policy"))[1], nonce[1],
  "the nonce is the same on two requests");

// ── 4. A bodyless status survives the wrapping ──────────────────────────────────────────────
// What this does NOT prove: the null-body branch in index.js. A Response with status 304 cannot be built with a body,
// so a mock 304 has a null body and takes the other branch — see the comment on BODYLESS. Held here: a 304 comes out a
// 304 and still carries the policy.
const notModified = await worker.fetch(new Request("https://dogancanyucel.com/style.css"), {
  ...env, ASSETS: { fetch: async () => new Response(null, { status: 304 }) } });
assert.strictEqual(notModified.status, 304);
assert.ok(notModified.headers.get("Content-Security-Policy"), "a 304 lost the policy");

// ── 5. A wrong password at /stats is counted, so a run at the door is visible ───────────────
assert.strictEqual(apiRouteOf(new URL("https://dogancanyucel.com/stats")), "stats");
assert.strictEqual(apiRouteOf(new URL("https://dogancanyucel.com/stats/")), "stats");

const counted = [];
const refused = await worker.fetch(
  new Request("https://dogancanyucel.com/stats", { headers: { authorization: "Basic " + btoa(":wrong") } }),
  {
    STATS_PASSWORD: "right",
    ASSETS: env.ASSETS,
    DB: { prepare: (sql) => ({ bind: (...args) => ({ run: async () => { counted.push({ sql, args }); } }) }) },
  },
  { waitUntil: (promise) => promise });
assert.strictEqual(refused.status, 401);
assert.ok(counted.some((c) => c.args.includes("stats") && c.args.includes("rejected")),
  `a wrong password was not counted: ${JSON.stringify(counted)}`);

console.log("security-headers: ok");

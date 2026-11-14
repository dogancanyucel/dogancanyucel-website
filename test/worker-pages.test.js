// The two pages the Worker BUILDS, held to the policy the Worker SERVES THEM WITH.
//
// Why this file exists (2026-11-14, the full scan of every site on the owner's domains). Every structural test the
// site had read `public/`, and both of them say so out loud: classes-have-rules — *"This only reads the files in
// public/: the pages the Worker builds (/stats, the app landing page) carry their own <style> block"* —
// and no-third-party, which walks the same folder. So the two pages nobody could see were the two pages that broke,
// and both breakages were live and silent:
//
//   · app.dogancanyucel.com/open/ carried an inline <style>, an inline <script> and an <img> from dogancanyucel.com,
//     and was served with `script-src 'self'; style-src 'self'; img-src 'self'`. Measured in the browser on the live
//     site: all three refused. The page was unstyled, the logo was broken, and — the one that cost something — the
//     script that turns the button into Android's intent link never ran, so every Android visitor without the app got
//     the dead button that was fixed on 2026-11-04 and silently un-fixed on 2026-11-06.
//   · /stats asked for --label-2, --surface and --hairline, three custom properties the 2026-11-14 redesign deleted
//     from style.css. An undefined var() makes the whole declaration invalid, so the table lost its background and
//     EVERY row rule, and the small print lost its colour.
//
// Neither is a kind of mistake; both are the same mistake, which is what this file holds down: a page is checked
// against what it is really served with, never against what its author meant.
// Run: node test/worker-pages.test.js
import assert from "node:assert";
import { readFileSync } from "node:fs";
import worker from "../index.js";

const env = {
  STATS_PASSWORD: "right",
  ASSETS: { fetch: async () => new Response("asset") },
  DB: { prepare: () => ({ all: async () => ({ results: [] }), bind: () => ({ run: async () => {} }) }) },
};

/** Every page this Worker writes itself, rather than handing over from public/. */
const PAGES = [
  {
    name: "/stats",
    request: new Request("https://dogancanyucel.com/stats", { headers: { authorization: "Basic " + btoa(":right") } }),
    // It links the site's stylesheet, so its var() names must be the stylesheet's names.
    usesSiteStylesheet: true,
  },
  {
    name: "app.dogancanyucel.com/open/",
    request: new Request("https://app.dogancanyucel.com/open/auth-done",
      { headers: { "user-agent": "Mozilla/5.0 (Linux; Android 14)" } }),
    usesSiteStylesheet: false,
  },
];

/** `style-src 'self' 'nonce-abc'` → ["'self'", "'nonce-abc'"]; a directive that is absent falls back to default-src. */
function sourcesFor(policy, directive) {
  const found = {};
  for (const part of policy.split(";")) {
    const [name, ...rest] = part.trim().split(/\s+/);
    if (name) found[name.toLowerCase()] = rest;
  }
  return found[directive] ?? found["default-src"] ?? [];
}

const siteCss = readFileSync("public/style.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, " ");
const defined = new Set([...siteCss.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

for (const page of PAGES) {
  const response = await worker.fetch(page.request, env);
  assert.strictEqual(response.status, 200, `${page.name} did not answer 200`);
  const policy = response.headers.get("Content-Security-Policy");
  assert.ok(policy, `${page.name} is served with no policy at all`);
  const html = await response.text();
  const markup = html.replace(/<!--[\s\S]*?-->/g, " ");   // a comment is not an instruction to a browser

  // ── 1. Inline <style>: allowed only by this request's own nonce ───────────────────────────
  const styleSources = sourcesFor(policy, "style-src");
  for (const [tag, body] of [...markup.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/gi)].map((m) => [m[1], m[2]])) {
    const nonce = /nonce="([^"]+)"/.exec(tag)?.[1];
    assert.ok(nonce, `${page.name}: an inline <style> with no nonce — ${styleSources.join(" ")} refuses it in silence`);
    assert.ok(styleSources.includes(`'nonce-${nonce}'`),
      `${page.name}: the <style> nonce is not the one in the header, so the block never applies`);
    assert.ok(body.trim().length, `${page.name}: an empty <style> block`);
  }

  // ── 2. A style ATTRIBUTE is never covered by a nonce ──────────────────────────────────────
  // (style-src-attr falls back to style-src, and a nonce does not reach an attribute. Measured in the browser on the
  // live site 2026-11-14: el.style.display = "grid" applies, el.setAttribute("style", …) is refused.)
  assert.deepStrictEqual([...markup.matchAll(/<[a-z][^>]*\sstyle=["']/gi)].map((m) => m[0].slice(0, 50)), [],
    `${page.name}: a style attribute is refused by every policy this site serves`);

  // ── 3. Inline <script> ────────────────────────────────────────────────────────────────────
  const scriptSources = sourcesFor(policy, "script-src");
  for (const tag of [...markup.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/gi)].map((m) => m[1])) {
    const nonce = /nonce="([^"]+)"/.exec(tag)?.[1];
    assert.ok(nonce && scriptSources.includes(`'nonce-${nonce}'`),
      `${page.name}: an inline <script> the policy refuses — this is exactly what killed the Android button`);
  }

  // ── 4. Every subresource is one the policy lets through ───────────────────────────────────
  // Same-origin is what 'self' means; anything else must be named in the directive for its kind.
  const origin = new URL(page.request.url).origin;
  const KIND = { img: "img-src", script: "script-src", link: "style-src", iframe: "frame-src" };
  for (const [, tag, attr, value] of markup.matchAll(/<(img|script|link|iframe)\b[^>]*?\b(src|href)=["']([^"']+)["']/gi)) {
    const target = new URL(value, origin);
    if (target.origin === origin) continue;
    const directive = KIND[tag.toLowerCase()] ?? "default-src";
    assert.ok(sourcesFor(policy, directive).includes(target.origin),
      `${page.name}: <${tag} ${attr}="${value}"> is refused by ${directive} — it would simply not load`);
  }

  // ── 5. Every var(--x) the page writes is a name the stylesheet defines ────────────────────
  if (page.usesSiteStylesheet) {
    const asked = new Set([...html.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]));
    const dead = [...asked].filter((name) => !defined.has(name));
    assert.deepStrictEqual(dead, [],
      `${page.name}: style.css defines none of these, so each declaration using one is thrown away whole`);
  }
}

console.log(`worker-pages: ${PAGES.length} pages the Worker builds agree with the policy it serves them with`);

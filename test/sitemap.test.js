// The sitemap must list every page a search engine should index, in the URL form that answers
// 200, and nothing else. Written 2026-11-14, when the site had had no sitemap at all since
// /project/ — the page that linked the two project pages together — became a 301 to /#work.
//
// A sitemap is the one file nobody notices going wrong: it is read by crawlers, never by a
// person, so a page added without a row here is simply never indexed and nothing says so. This
// test derives the list from public/ and fails if the two drift apart.
//
// It also holds the three things that were wrong when the file was written:
//   · /privacy.html, /terms.html and /website-privacy.html answer 307 to the extensionless
//     form (the asset layer's default html_handling; measured live 2026-11-14). The sitemap and
//     every canonical must carry the 200 form, or each crawl pays a hop and the indexed URL
//     is the redirect.
//   · /privacy.html and /terms.html carried no <link rel="canonical"> at all.
//   · /website-privacy.html's canonical pointed at its own redirecting .html address.
// Run: node test/sitemap.test.js
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import worker from "../index.js";
import { htmlUnder } from "./page-files.js";

const SITE = "https://dogancanyucel.com";

/**
 * The address a file in public/ is indexed under — the form that answers 200, measured live
 * 2026-11-14: index.html is its folder with a trailing slash, and any other .html loses its
 * extension (/privacy.html → 307 → /privacy). Pure, so the mapping is stated once.
 */
export function addressOf(file) {
  const path = "/" + relative("public", file).split("\\").join("/");
  if (path.endsWith("/index.html")) return path.slice(0, -"index.html".length);
  if (path === "/index.html") return "/";
  return path.slice(0, -".html".length);
}

// ── What should be in it ────────────────────────────────────────────────────
// A page that tells crawlers to stay away is not a search result: /turquoise/auth/ is the
// landing page for the links in Turquoise's own e-mails and carries robots=noindex.
const pages = htmlUnder("public").filter((f) => !/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(readFileSync(f, "utf8")));
const expected = new Set(pages.map((f) => SITE + addressOf(f)));
assert.ok(expected.size >= 8, `only ${expected.size} indexable pages found — did public/ move?`);

// ── What is in it ───────────────────────────────────────────────────────────
const sitemap = readFileSync("public/sitemap.xml", "utf8");
const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
assert.strictEqual(new Set(listed).size, listed.length, "a URL is listed twice");

const sitemapped = new Set(listed);
const unlisted = [...expected].filter((u) => !sitemapped.has(u));
const stale = listed.filter((u) => !expected.has(u));
assert.deepStrictEqual(unlisted, [], "indexable page(s) missing from public/sitemap.xml");
assert.deepStrictEqual(stale, [], "public/sitemap.xml lists URL(s) that are not pages any more");
console.log(`sitemap: all ${listed.length} indexable pages listed, in their 200 form, nothing stale`);

// ── Every listed URL really answers from the files, not a redirect ──────────
// The Worker's own routing runs: /project/ is a 301 and the retired API routes are 410, so a
// sitemap row that landed on one of them would be caught here rather than by a crawler.
const env = { ASSETS: { fetch: async (req) => new Response("asset:" + new URL(req.url).pathname) } };
for (const url of listed) {
  assert.ok(url.startsWith(SITE + "/"), `${url} is not an address on this site`);
  const res = await worker.fetch(new Request(url), env);
  assert.strictEqual(res.status, 200, `${url} does not answer 200`);
  assert.ok((await res.text()).startsWith("asset:"), `${url} is answered by the Worker, not by a file`);
}
console.log(`sitemap: every listed URL is served as a file, none is a redirect or a retired route`);

// ── The two files themselves are served ─────────────────────────────────────
// Both are new addresses on a Worker that answers several routes of its own before it reaches
// the files, and a sitemap nobody can fetch is worth nothing. The redirect that catches
// /project also catches /project/anything? No — but the only way to know is to ask the Worker.
for (const file of ["/sitemap.xml", "/robots.txt"]) {
  const res = await worker.fetch(new Request(SITE + file), env);
  assert.strictEqual(res.status, 200, `${file} is not served`);
  assert.strictEqual(await res.text(), "asset:" + file, `${file} is answered by a Worker route, not by the file`);
}
console.log("sitemap: /sitemap.xml and /robots.txt are served as files by the Worker");

// ── The canonical of each page agrees with the sitemap ──────────────────────
// Two files pointing at the same page is exactly the twin a crawler resolves by guessing.
const noCanonical = [];
for (const file of pages) {
  const html = readFileSync(file, "utf8");
  const found = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
  if (!found) { noCanonical.push(file); continue; }
  assert.strictEqual(found[1], SITE + addressOf(file), `${file}: canonical is not the address the sitemap lists`);
}
assert.deepStrictEqual(noCanonical, [], "indexable page(s) with no <link rel=\"canonical\">");
console.log(`sitemap: all ${pages.length} indexable pages carry a canonical equal to their sitemap row`);

// ── robots.txt points at it ─────────────────────────────────────────────────
// Without this line the sitemap is found only by hand in Search Console: a crawler reads
// robots.txt, it does not guess /sitemap.xml.
const robots = readFileSync("public/robots.txt", "utf8");
const sitemapLines = robots.split("\n").filter((line) => /^\s*Sitemap:/i.test(line));
assert.deepStrictEqual(sitemapLines.map((l) => l.trim()), [`Sitemap: ${SITE}/sitemap.xml`],
  "public/robots.txt must carry exactly one Sitemap: line, pointing at the sitemap");
// Nothing else: Cloudflare's managed robots.txt holds the owner's crawler and AI-training
// stance at the edge, and a copy of any of it here would be a second source of truth.
const directives = robots.split("\n").filter((line) => /^\s*[A-Za-z-]+\s*:/.test(line) && !/^\s*Sitemap:/i.test(line));
assert.deepStrictEqual(directives, [], "public/robots.txt carries a rule that belongs in Cloudflare's managed robots.txt");
console.log("sitemap: robots.txt points at the sitemap and claims nothing else");

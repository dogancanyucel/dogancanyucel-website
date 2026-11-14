// Nothing the site serves may make the reader's browser ask another company for anything
// (owner's decision, 2026-10-21: Google Fonts was removed because a <link> there hands every
// visitor's IP address to Google — LG München I, 20 Jan 2022, 3 O 17493/20 — and
// public/website-privacy.html now tells readers that opening a page reaches this site and
// nothing else). A clickable link is not a request; this looks only at what loads by itself.
//
// Found 2026-11-06: /stats, which the Worker builds in site-stats.js rather than a file in
// public/, still carried the Google Fonts stylesheet and two preconnects to Google. The pass
// that removed them went through public/ only.
// Run: node test/no-third-party.test.js
import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Every file under a folder with one of these endings (node 20 has no fs.globSync). */
function filesUnder(folder, endings) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return filesUnder(path, endings);
    return endings.some((end) => entry.name.endsWith(end)) ? [path] : [];
  });
}

const OWN = /^(https?:)?\/\/(dogancanyucel\.com|app\.dogancanyucel\.com)\//;

// The one request to another company a page of this site may make, because it IS the account
// flow: the reset/verify page asks Firebase Authentication to check the one-time code in the
// address. It is reached only from an e-mail Firebase sent, it is noindex, and it is named in
// public/website-privacy.html. Anything else added here needs that page changed first.
const ALLOWED = [{ file: "public/turquoise/auth/action.js", host: "https://identitytoolkit.googleapis.com/v1" }];

const files = [
  ...filesUnder("public", [".html", ".js", ".css"]),
  // The pages the Worker writes itself are pages of this site too.
  "site-stats.js", "app-links.js", "clips.js", "index.js",
];
assert.ok(files.length > 10, `only ${files.length} files found; this test would check nothing`);

// Everything that loads without a click: a stylesheet or preconnect, a script, an image, a
// frame, a font or background in CSS, and a request the page makes itself.
const AUTOMATIC = [
  /<link\b[^>]*\bhref=["']([^"']+)["']/gi,
  /<(?:script|img|iframe|source|video|audio|embed)\b[^>]*\bsrc=["']([^"']+)["']/gi,
  /url\(\s*["']?([^"')]+)["']?\s*\)/gi,
  /\bfetch\(\s*[`"']([^`"']+)[`"']/gi,
];

const offenders = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const pattern of AUTOMATIC) {
    for (const [, target] of text.matchAll(pattern)) {
      if (!/^(https?:)?\/\//.test(target)) continue;          // same-origin path, or a data: URI
      if (OWN.test(target)) continue;
      if (ALLOWED.some((a) => a.file === file && target.startsWith(a.host))) continue;
      offenders.push(`${file}: ${target}`);
    }
  }
}
assert.deepStrictEqual(offenders, [], "these make the reader's browser ask another company");

// The hosts the decision was about, by name, in anything the browser reads — an @import, a
// preconnect, a font src. Comments are left alone on purpose: style.css explains in a comment
// why Google Fonts is not used, and that explanation is what keeps it from coming back.
const withoutComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/<!--[\s\S]*?-->/g, " ")
  .split("\n").filter((line) => !/^\s*(\/\/|\*)/.test(line)).join("\n");

for (const file of files) {
  const code = withoutComments(readFileSync(file, "utf8"));
  for (const host of ["fonts.googleapis.com", "fonts.gstatic.com"]) {
    assert.ok(!code.includes(host), `${file} names ${host}; Inter is served from this site (style.css)`);
  }
}

console.log(`no-third-party: ${files.length} served files, nothing loads from another company`);

// ── Nothing inline, because the policy refuses it without a word ───────────
// The same policy that keeps other companies out (`style-src 'self'`, `script-src 'self'`) also
// refuses this site's OWN inline style and script — silently. Found 2026-11-14 by Lighthouse:
// six `style=` attributes on three pages had never applied on the live site, and the margins
// their author wrote were simply not there. Only the account page is exempt: its inline <style>
// is in the policy by hash, which test/security-headers.test.js holds.
const INLINE_EXEMPT = "public/turquoise/auth/";
for (const file of filesUnder("public", [".html"])) {
  if (file.startsWith(INLINE_EXEMPT)) continue;
  const html = readFileSync(file, "utf8");
  const styled = [...html.matchAll(/<[a-z][^>]*\sstyle=["'][^"']*["']/gi)].map((m) => m[0].slice(0, 60));
  assert.deepStrictEqual(styled, [], `${file}: inline style= is refused by the page's own CSP and never applies`);
  assert.ok(!/<style[\s>]/i.test(html), `${file}: an inline <style> block is refused by the page's own CSP`);
  const inlineScript = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>/gi)].map((m) => m[0]);
  assert.deepStrictEqual(inlineScript, [], `${file}: an inline <script> is refused by the page's own CSP`);
}
console.log("no-third-party: no inline style or script either — the policy would refuse them in silence");

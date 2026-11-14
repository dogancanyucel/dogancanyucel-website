// A page that declares twitter:card is asking X to draw a card for it. This test holds the
// three ways that card goes wrong silently — nobody sees a social card by using the site, only
// by sharing a link somewhere else. Written 2026-11-14, when both project pages carried
// twitter:card and neither carried twitter:creator, so a shared project link drew a card with
// no author on it while the home page's card had one.
//
//   · a card with no creator — the card renders, unattributed, and nothing looks broken;
//   · a creator handle typed a second time and typed wrong — two handles, one of them dead;
//   · a card with nothing to draw — X falls back to the Open Graph title, description and
//     image, so a card page missing any of them renders an empty box.
//
// The handle is not written here. It is read from the X profile link the site itself shows, so
// the tag and the link cannot drift apart; if the owner changes handle, one link changes and
// this test names every page still on the old one.
// Run: node test/social-cards.test.js
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { htmlUnder } from "./page-files.js";

const pages = htmlUnder("public").map((file) => ({ file, html: readFileSync(file, "utf8") }));
assert.ok(pages.length >= 9, `only ${pages.length} pages found — did public/ move?`);

const meta = (html, name) =>
  html.match(new RegExp(`<meta\\s+(?:name|property)=["']${name}["']\\s+content=["']([^"']*)["']`, "i"))?.[1];

// ── The handle, read from the site's own link ────────────────────────────────
const linked = new Set(
  pages.flatMap(({ html }) => [...html.matchAll(/https:\/\/x\.com\/([A-Za-z0-9_]+)/g)].map((m) => m[1])),
);
assert.strictEqual(linked.size, 1, `the site should show exactly one X profile, found: ${[...linked].join(", ") || "none"}`);
const handle = "@" + [...linked][0];

// ── Every card is attributed, and to that one handle ────────────────────────
const cards = pages.filter(({ html }) => meta(html, "twitter:card"));
assert.ok(cards.length >= 3, `only ${cards.length} pages declare twitter:card — did the social meta move?`);

const unattributed = cards.filter(({ html }) => !meta(html, "twitter:creator")).map(({ file }) => file);
assert.deepStrictEqual(unattributed, [], "page(s) declare twitter:card with no twitter:creator");

const wrong = cards.filter(({ html }) => meta(html, "twitter:creator") !== handle).map(({ file }) => file);
assert.deepStrictEqual(wrong, [], `page(s) name a creator other than the linked profile ${handle}`);

// A creator with no card is the same mistake from the other side: nothing is drawn at all.
const cardless = pages
  .filter(({ html }) => meta(html, "twitter:creator") && !meta(html, "twitter:card"))
  .map(({ file }) => file);
assert.deepStrictEqual(cardless, [], "page(s) name a twitter:creator but declare no twitter:card");
console.log(`social-cards: all ${cards.length} card pages are attributed to ${handle}, the profile the site links to`);

// ── Every card has something to draw ────────────────────────────────────────
// No twitter:title/description/image anywhere on this site: X reads the Open Graph tags when
// the twitter: ones are absent, and that is the deliberate choice — one set of tags, not two.
for (const { file, html } of cards) {
  for (const tag of ["og:title", "og:description", "og:image"]) {
    assert.ok(meta(html, tag), `${file}: declares twitter:card but has no ${tag} for the card to draw`);
  }
  assert.ok(
    /^https:\/\/dogancanyucel\.com\//.test(meta(html, "og:image")),
    `${file}: og:image must be an absolute address on this site — X does not resolve a relative one`,
  );
}
console.log(`social-cards: every card page carries the og:title, og:description and absolute og:image the card is drawn from`);

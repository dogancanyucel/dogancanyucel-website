// The colours of this site are a contract, not a taste. Written 2026-11-14 with the paper
// design, when six accents picked by eye had already failed a bar nobody could see.
//
// What it holds, and why each one is invisible until it is measured:
//
//   · the accent is a plane and a rule, never type. On paper it is 3.4:1 as a word — a reader
//     with ordinary eyes sees a readable teal, and a reader without does not. The darker
//     sibling exists for exactly that, and the day someone "simplifies" the two into one the
//     page still looks right.
//   · ink on the accent plane is the marker, the site's one signature. White on it is 3.67:1
//     and looks cleaner on a designer's screen; it fails.
//   · the sand band carries accent text with 0.01 to spare and must never carry an accent
//     hairline (3.01:1). A margin that thin is not a margin, so the band's numbers are held
//     here rather than remembered.
//   · `theme-color` is a twin of --paper, in every served page. It had no test until today,
//     and it spent the first hours of the paper design still set to the dark design's window
//     grey — the browser bar framed a paper page in near-black on Android.
//
// The ratios are computed here, in the suite, from the tokens in style.css. Nothing is typed
// twice: change a token and this test re-measures it.
// Run: node test/palette.test.js
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { htmlUnder } from "./page-files.js";

const css = readFileSync("public/style.css", "utf8");

/** One `--name: #rrggbb;` from :root. */
function token(name) {
  const hit = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9A-Fa-f]{6})`));
  assert.ok(hit, `--${name} is not defined in style.css`);
  return hit[1].toUpperCase();
}

/** WCAG 2.x relative luminance. */
function luminance(hex) {
  const channel = (n) => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, rounded the way a report quotes it. */
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

const paper = token("paper");
const sand = token("sand");
const ink = token("ink");
const ink2 = token("ink-2");
const accent = token("accent");
const accentInk = token("accent-ink");
const onAccent = token("on-accent");

// ── Text on its own ground ──────────────────────────────────────────────────
const AA = 4.5;          // normal text
const NON_TEXT = 3;      // a rule, a border, anything that is not a word

assert.ok(ratio(ink, paper) >= 7, `ink on paper is ${ratio(ink, paper)}:1, below AAA`);
assert.ok(ratio(ink2, paper) >= AA, `the second ink on paper is ${ratio(ink2, paper)}:1`);
assert.ok(ratio(ink2, sand) >= AA, `the second ink on sand is ${ratio(ink2, sand)}:1`);

// ── The accent, and why it has a sibling ────────────────────────────────────
assert.ok(
  ratio(accent, paper) < AA,
  `--accent reads ${ratio(accent, paper)}:1 on paper. If it now passes as text, the sibling may be ` +
    `redundant — but check the design record before using it as type.`,
);
assert.ok(ratio(accentInk, paper) >= AA, `--accent-ink on paper is ${ratio(accentInk, paper)}:1, under AA`);
assert.ok(ratio(accentInk, sand) >= AA, `--accent-ink on sand is ${ratio(accentInk, sand)}:1, under AA`);

// ── The marker: ink on the plane, never white ───────────────────────────────
assert.strictEqual(onAccent, ink, "--on-accent should be the ink itself");
assert.ok(ratio(onAccent, accent) >= AA, `the marker reads ${ratio(onAccent, accent)}:1`);
assert.ok(
  ratio("#FFFFFF", accent) < AA,
  "white on the accent now passes — the comment in style.css saying it never does is stale",
);

// ── A hairline is not a word, but it still has a bar ────────────────────────
assert.ok(ratio(accent, paper) >= NON_TEXT, `the accent as a rule on paper is ${ratio(accent, paper)}:1`);
// On sand it measures 3.01:1 — over the bar by 0.01, which this project does not count as a
// margin, since any nudge to either colour drops it under. The band draws its rules in --line.
const MARGIN = 3.2;
assert.ok(
  ratio(accent, sand) < MARGIN,
  `the accent as a rule on sand is now ${ratio(accent, sand)}:1, clear of the bar. The design record ` +
    `says it is not usable there; if that has really changed, change the record first.`,
);
const bandRules = css.match(/#studio[^}]*border[^;]*;/g) || [];
assert.deepStrictEqual(
  bandRules.filter((rule) => rule.includes("--accent")),
  [],
  "the Studio band draws a rule in the accent, which is 3.01:1 on sand",
);

console.log(
  `palette: ink ${ratio(ink, paper)}:1 on paper · second ink ${ratio(ink2, paper)}:1 · ` +
    `accent-ink ${ratio(accentInk, paper)}:1 on paper and ${ratio(accentInk, sand)}:1 on sand · ` +
    `marker ${ratio(onAccent, accent)}:1 · accent as a rule ${ratio(accent, paper)}:1 on paper, ` +
    `${ratio(accent, sand)}:1 on sand`,
);

// ── theme-color is a twin of the paper, on every page ───────────────────────
const pages = htmlUnder("public").map((file) => ({ file, html: readFileSync(file, "utf8") }));
assert.ok(pages.length >= 9, `only ${pages.length} pages found — did public/ move?`);

const wrong = pages
  .map(({ file, html }) => ({
    file,
    value: html.match(/<meta\s+name=["']theme-color["']\s+content=["']([^"']*)["']/i)?.[1],
  }))
  .filter(({ value }) => value && value.toUpperCase() !== paper);

assert.deepStrictEqual(
  wrong.map(({ file, value }) => `${file} says ${value}`),
  [],
  `theme-color should be ${paper}, the page's own background`,
);

const withTheme = pages.filter(({ html }) => /name=["']theme-color["']/i.test(html)).length;
console.log(`palette: theme-color matches --paper on all ${withTheme} pages that declare it`);

// The screenshot strip's play button. Written 2026-11-14, when the owner asked for the strip to
// walk sideways on its own and for one button in the middle to start it.
//
// None of this can be seen from a node suite — it is a browser behaviour — so the test holds the
// four things whose breakage is silent in a repository and loud on the page:
//   · the button sits in the stage, NOT inside the <ul>: put it in the list and it is a stray
//     list item that scrolls away with the pictures and lies to a screen reader;
//   · the page starts stopped (`aria-pressed="false"`): the owner asked for motion on a press,
//     and a strip that walks by itself is the thing nobody can turn off;
//   · the script and the markup agree on the three class names — a rename on one side leaves a
//     dead button that looks perfectly fine in the HTML;
//   · the walk is a requestAnimationFrame that is cancelled, not a timer: an interval keeps
//     running in a tab nobody is looking at, which is battery spent on nothing.
// Run: node test/shot-strip.test.js
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { htmlUnder } from "./page-files.js";

const pages = htmlUnder("public").map((file) => ({ file, html: readFileSync(file, "utf8") }));
const withStage = pages.filter(({ html }) => html.includes('class="shots-stage"'));
assert.strictEqual(withStage.length, 1, "exactly one page should carry the screenshot strip");
const { file, html } = withStage[0];
assert.ok(file.includes("turquoise"), `the strip belongs to the Turquoise page, found it in ${file}`);

// ── The stage holds the strip and the button, as siblings ───────────────────
const stage = html.match(/<div class="shots-stage">([\s\S]*?)<\/div>/);
assert.ok(stage, "the stage is not closed");
const inside = stage[1];
assert.strictEqual((inside.match(/<ul class="shot-strip"/g) || []).length, 1, "one strip in the stage");
assert.strictEqual((inside.match(/<button[^>]*class="shot-play"/g) || []).length, 1, "one play button in the stage");

const list = inside.match(/<ul class="shot-strip"[\s\S]*?<\/ul>/);
assert.ok(list, "the strip's list is not closed");
assert.ok(!/<button/.test(list[0]), "the button must not be inside the <ul> — it would scroll away with the pictures");
assert.strictEqual((list[0].match(/<li class="shot">/g) || []).length,
  (list[0].match(/<img /g) || []).length, "every item in the strip holds exactly one picture");

// ── It starts stopped, and it says what it is ───────────────────────────────
const button = inside.match(/<button[^>]*class="shot-play"[^>]*>/)[0];
assert.ok(/\btype="button"/.test(button), "the button must not submit anything");
assert.ok(/\baria-pressed="false"/.test(button), "the strip starts stopped: nothing moves until it is pressed");
assert.ok(/\baria-label="[^"]+"/.test(button), "a button with only an icon needs a label");
for (const icon of ["icon-play", "icon-pause"]) {
  assert.ok(inside.includes(`class="${icon}"`), `the button carries its ${icon} icon`);
}
console.log("shot-strip: the button is in the stage beside the strip, starts stopped and is labelled");

// ── The script drives exactly these names, with a cancellable loop ──────────
const script = readFileSync("public/script.js", "utf8");
for (const name of ["shots-stage", "shot-strip", "shot-play"]) {
  assert.ok(script.includes(name), `script.js never looks for .${name} — the button would be dead`);
}
assert.ok(script.includes("requestAnimationFrame") && script.includes("cancelAnimationFrame"),
  "the walk must be a cancellable animation frame");
assert.ok(!/setInterval|setTimeout\s*\([^)]*scrollLeft/.test(script),
  "a timer would keep scrolling a strip nobody is looking at");
assert.ok(script.includes("IntersectionObserver"), "the walk stops when the strip is off screen");

const css = readFileSync("public/style.css", "utf8");
assert.ok(/\.shot-play\[aria-pressed="true"\][\s\S]*icon-pause/.test(css),
  "the icon must follow the pressed state, or the button lies about what it will do");
console.log("shot-strip: the script drives those same names with a cancellable, off-screen-aware loop");

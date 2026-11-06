// Every class the pages ask for must exist in style.css.
//
// Found 2026-11-06: `pill-quiet` never existed. It was written into the Turquoise page on
// 2026-09-20 (ac24846), carried to the Cairn page and then to the home page's card, ten uses
// in all — and because a class with no rule is silent, Cairn's five "in development" platforms
// were drawn exactly like Turquoise's two shipped ones: the same accent wash, the same light
// blue type. The markup said "this one is quieter" for seven weeks and the page never said it.
//
// This only reads the files in public/: the pages the Worker builds (/stats, the app landing
// page) carry their own <style> block.
// Run: node test/classes-have-rules.test.js
import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function filesUnder(folder, ending) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return filesUnder(path, ending);
    return entry.name.endsWith(ending) ? [path] : [];
  });
}

const css = readFileSync("public/style.css", "utf8");
// Class names style.css has a rule for, from its selectors only — not from a comment.
const code = css.replace(/\/\*[\s\S]*?\*\//g, " ");
const styled = new Set([...code.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1]));

// Classes no stylesheet is expected to carry: the page that brings its own <style>.
const OWN_STYLE = new Set(filesUnder("public", ".html").filter((f) => readFileSync(f, "utf8").includes("<style")));

const missing = [];
for (const file of filesUnder("public", ".html")) {
  if (OWN_STYLE.has(file)) continue;
  for (const [, value] of readFileSync(file, "utf8").matchAll(/\bclass=["']([^"']+)["']/g)) {
    for (const name of value.split(/\s+/).filter(Boolean)) {
      if (!styled.has(name)) missing.push(`${file}: .${name}`);
    }
  }
}
assert.deepStrictEqual(missing, [], "these classes are asked for by a page and styled nowhere");

console.log(`classes-have-rules: every class the pages ask for has a rule (${styled.size} in style.css)`);

// Every picture a page asks for must exist, be served, be described, and be small enough to be
// worth its place. Written 2026-11-14, when the App Store screenshots were put on the Turquoise
// page: ten images at once, the first pictures the site has ever carried beyond two logos and
// an icon.
//
// A broken <img> is the loudest defect on a page and the quietest in a repo — nothing fails, no
// test turns red, the file is simply renamed or left out of a commit and a grey box appears on
// the live site. The same for an image that nobody weighed: a 2 MB PNG dropped in beside a 48 KB
// one costs every visitor on a phone, and the page looks identical from here.
//
// Run: node test/page-images.test.js
import assert from "node:assert";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import worker from "../index.js";
import { htmlUnder } from "./page-files.js";

// Measured 2026-11-14: the largest image on the site is 09-run-widgets.webp at 60 KB, and the
// ten screenshots together are 484 KB. The ceilings sit above today's numbers with room, and
// below the size at which a phone on a slow connection starts paying for them.
const MAX_ONE_KB = 120;
const MAX_PAGE_KB = 900;

const SITE = "https://dogancanyucel.com";
const env = { ASSETS: { fetch: async (req) => new Response("asset:" + new URL(req.url).pathname) } };

let checked = 0;
for (const page of htmlUnder("public")) {
  const html = readFileSync(page, "utf8");
  // The account page brings its own <style> block instead of the shared stylesheet, so it is
  // exempt from the layout rules the stylesheet assumes — the same exemption classes-have-rules
  // makes, for the same page and the same reason.
  const ownStyle = html.includes("<style");
  let pageBytes = 0;

  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    const src = tag.match(/\bsrc=["']([^"']+)["']/)?.[1];
    assert.ok(src, `${page}: an <img> with no src`);
    assert.ok(!/^https?:/i.test(src), `${page}: <img src="${src}"> loads from another site`);

    // Resolve the address the browser would ask for, then the file behind it.
    const urlPath = src.startsWith("/") ? src : "/" + normalize(join(relative("public", dirname(page)), src));
    const file = join("public", urlPath);
    assert.ok(existsSync(file), `${page}: <img src="${src}"> → ${file} does not exist`);

    // alt is required, "" included: an empty alt is a decision (decorative), a missing one is an omission.
    assert.ok(/\balt=["']/.test(tag), `${page}: <img src="${src}"> has no alt attribute`);

    if (!ownStyle) {
      assert.ok(/\bwidth=["']\d+["']/.test(tag) && /\bheight=["']\d+["']/.test(tag),
        `${page}: <img src="${src}"> has no width and height — the page jumps while it loads`);
    }

    const kb = statSync(file).size / 1024;
    assert.ok(kb <= MAX_ONE_KB, `${file} is ${Math.round(kb)} KB — over the ${MAX_ONE_KB} KB ceiling for one image`);
    pageBytes += statSync(file).size;

    // The Worker answers several routes of its own before it reaches the files; an image behind
    // one of them would 301 or 410 on the live site and nowhere else.
    const res = await worker.fetch(new Request(SITE + urlPath), env);
    assert.strictEqual(res.status, 200, `${urlPath} does not answer 200`);
    assert.ok((await res.text()).startsWith("asset:"), `${urlPath} is answered by a Worker route, not by the file`);
    checked++;
  }

  const pageKb = Math.round(pageBytes / 1024);
  assert.ok(pageKb <= MAX_PAGE_KB, `${page} asks for ${pageKb} KB of images — over the ${MAX_PAGE_KB} KB ceiling`);
}
assert.ok(checked >= 14, `only ${checked} images checked — did the pages lose their pictures?`);
console.log(`page-images: all ${checked} images exist, are served as files, are described, sized and under the weight ceilings`);

// The list of pages the site serves, read from public/ rather than restated. Two structural
// tests need it — the sitemap (every page must have a row) and the social cards (every page
// that claims a card must be able to render one) — and a list typed out twice is a list that
// stops agreeing with the folder the day a page is added.
import { readdirSync } from "node:fs";
import { join } from "node:path";

/** Every .html file under `folder`, at any depth, in readdir order. */
export function htmlUnder(folder) {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) return htmlUnder(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

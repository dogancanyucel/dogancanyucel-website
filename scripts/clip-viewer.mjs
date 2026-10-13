// Writes klipler.html into the Blender production folder: every approved clip playing, its name,
// whether the bucket holds the same bytes, and the drawing it replaces — or, while unpaired, the
// three drawings whose names come closest, for the owner to say which one is the same movement.
//
//   node scripts/clip-viewer.mjs --from ~/Desktop/Repo/blender-poc
//
// Local and owner-only on purpose (owner, 2026-10-13: the clips are to be sold, "calinmamasi
// lazim"): the page plays the files from disk and is never uploaded anywhere. The drawings it
// shows are the site's public ones.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { approvedClips, parseCsv } from "./upload-clips.mjs";

const ROOT = new URL("..", import.meta.url).pathname;
const SITE = "https://dogancanyucel.com/exercise-illustrations/";

// Lower case, punctuation out, a plural "s" off ("extensions" is "extension").
const words = (text) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean)
  .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word)));

/**
 * The drawings whose names share the most words with a clip's, best first. A guess for the owner
 * to judge — never a pairing (2026-10-13: "barbell bench press" scored closest to the decline press).
 */
export function closestDrawings(name, drawings, count = 3) {
  const mine = words(name);
  return drawings
    .map((drawing) => {
      const theirs = words(drawing.name);
      const shared = [...mine].filter((word) => theirs.has(word)).length;
      // Shared words over the shorter name, so "Bench Press" is not out-scored by a longer
      // name that happens to share one more word; ties go to the shorter name.
      return { ...drawing, score: shared / Math.min(mine.size, theirs.size), length: theirs.size };
    })
    .filter((drawing) => drawing.score > 0)
    .sort((a, b) => b.score - a.score || a.length - b.length)
    .slice(0, count);
}

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function bucketCatalogue() {
  const dir = mkdtempSync(join(tmpdir(), "clips-"));
  const file = join(dir, "catalogue.json");
  const run = spawnSync("npx", ["--yes", "wrangler@4", "r2", "object", "get", "turquoise-exercise-clips/clips/catalogue.json", "--file", file, "--remote"],
    { stdio: "ignore", cwd: ROOT });
  if (run.status !== 0 || !existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8"));
}

function main(argv) {
  const fromArg = argv[argv.indexOf("--from") + 1];
  if (!argv.includes("--from") || !fromArg) throw new Error("usage: node scripts/clip-viewer.mjs --from <blender-poc folder>");
  const from = resolve(fromArg.replace(/^~(?=$|\/)/, homedir()));
  const outDir = join(from, "pilot", "out");
  const log = parseCsv(readFileSync(join(from, "uretim-kaydi.csv"), "utf8"));
  const byId = new Map(log.map((row) => [row.medya_id, row]));
  const drawings = JSON.parse(readFileSync(join(ROOT, "public/exercise-illustrations/catalogue.json"), "utf8"))
    .map(({ slug, name }) => ({ slug, name }));
  const drawingName = new Map(drawings.map((d) => [d.slug, d.name]));
  const slugsFile = join(ROOT, "clip-slugs.json");
  const pairs = existsSync(slugsFile) ? JSON.parse(readFileSync(slugsFile, "utf8")) : {};
  const bucket = bucketCatalogue();
  const inBucket = new Map((bucket?.clips || []).map((clip) => [clip.id, clip]));

  const cards = [];
  for (const { id, name } of approvedClips(log)) {
    const folder = readdirSync(outDir).find((entry) => entry.split("_")[1] === id);
    const file = folder && join(outDir, folder, `${id}_1080_h264.mp4`);
    if (!file || !existsSync(file)) continue;
    const sha = createHash("sha256").update(readFileSync(file)).digest("hex");
    const stored = inBucket.get(id);
    const state = !stored ? "missing" : stored.sha256 === sha ? "same" : "different";
    const row = byId.get(id);
    const paired = pairs[id];
    cards.push({ id, name, order: Number(row.sira), date: row.tarih, src: `pilot/out/${folder}/${id}_1080_h264.mp4`, state, paired,
      candidates: paired ? [] : closestDrawings(name, drawings) });
  }
  cards.sort((a, b) => a.order - b.order);

  const badge = { same: ["ok", "In the bucket"], different: ["warn", "Bucket has an older file"], missing: ["bad", "Not in the bucket"] };
  const drawingFigure = (slug, label, chosen) => `
        <figure class="drawing${chosen ? " chosen" : ""}">
          <img loading="lazy" src="${SITE}${escape(slug)}/1.png" alt="${escape(label)} drawing">
          <figcaption>${escape(label)}<code>${escape(slug)}</code></figcaption>
        </figure>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Turquoise Clips</title>
<style>
  :root { --bg:#f3f6f8; --card:#ffffff; --ink:#0f2a33; --ink-2:#4b6570; --line:#dbe4e8; --accent:#007a87;
          --ok:#1f7f38; --warn:#b34d00; --bad:#d70015; --stage:#1c1f22; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0d1417; --card:#152126; --ink:#e6f2f5; --ink-2:#9fb6bd; --line:#24363c;
          --accent:#00e5ff; --ok:#30d158; --warn:#ff9f0a; --bad:#ff453a; --stage:#000; } }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, sans-serif; }
  header { position:sticky; top:0; z-index:1; background:color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter:blur(12px);
           border-bottom:1px solid var(--line); padding:14px 20px; display:flex; gap:16px; align-items:center; flex-wrap:wrap; }
  h1 { font-size:20px; margin:0; letter-spacing:-.01em; }
  .count { color:var(--ink-2); font-variant-numeric:tabular-nums; }
  input[type=search] { flex:1 1 220px; max-width:360px; padding:8px 12px; border-radius:10px; border:1px solid var(--line);
           background:var(--card); color:var(--ink); font:inherit; }
  label.filter { color:var(--ink-2); display:flex; gap:6px; align-items:center; }
  main { padding:20px; display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:16px; }
  article { background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; display:flex; flex-direction:column; }
  video { width:100%; aspect-ratio:1/1; object-fit:contain; background:var(--stage); display:block; }
  .body { padding:12px 14px 14px; display:flex; flex-direction:column; gap:8px; }
  .title { display:flex; gap:8px; align-items:baseline; }
  .order { color:var(--ink-2); font-variant-numeric:tabular-nums; min-width:2.5em; }
  .name { font-weight:600; text-transform:capitalize; overflow-wrap:anywhere; }
  .meta { color:var(--ink-2); font-size:13px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  code { font:12px ui-monospace, SFMono-Regular, Menlo, monospace; color:var(--ink-2); }
  .pill { font-size:12px; font-weight:600; padding:2px 8px; border-radius:999px; border:1px solid currentColor; }
  .pill.ok { color:var(--ok); } .pill.warn { color:var(--warn); } .pill.bad { color:var(--bad); }
  .label { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--ink-2); margin-top:4px; }
  .drawings { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
  .drawing { margin:0; border:1px solid var(--line); border-radius:10px; padding:6px; background:#fff; color:#0f2a33; }
  .drawing.chosen { border:2px solid var(--ok); grid-column:span 3; display:flex; gap:10px; align-items:center; }
  .drawing img { width:100%; aspect-ratio:1/1; object-fit:contain; display:block; }
  .drawing.chosen img { width:90px; }
  .drawing figcaption { font-size:11px; line-height:1.3; margin-top:4px; overflow-wrap:anywhere; }
  .drawing figcaption code { display:block; color:#4b6570; font-size:10px; }
  .hint { color:var(--ink-2); font-size:13px; padding:0 20px 24px; max-width:70ch; }
  @media (max-width:520px) { main { padding:12px; grid-template-columns:1fr; } header { padding:12px; } }
</style>
</head>
<body>
<header>
  <h1>Turquoise Clips</h1>
  <span class="count" id="count">${cards.length} approved · ${cards.filter((c) => c.state === "same").length} in the bucket · ${cards.filter((c) => c.paired).length} paired with a drawing</span>
  <input type="search" id="q" placeholder="Search by name or id" aria-label="Search clips">
  <label class="filter"><input type="checkbox" id="unpaired"> Unpaired only</label>
</header>
<p class="hint">Each unpaired clip shows the three site drawings whose names come closest. They are guesses: tell the agent which one, if any, is the same movement, and only then does the clip replace it in the apps. Generated ${escape(new Date().toISOString().slice(0, 16).replace("T", " "))} UTC · bucket catalogue ${bucket ? `version ${bucket.version}` : "not reachable"}.</p>
<main id="grid">
${cards.map((c) => `  <article data-text="${escape(`${c.name} ${c.id} ${c.order}`.toLowerCase())}" data-paired="${c.paired ? "1" : "0"}">
    <video src="${escape(c.src)}" muted loop playsinline preload="none" aria-label="${escape(c.name)}"></video>
    <div class="body">
      <div class="title"><span class="order">#${c.order}</span><span class="name">${escape(c.name)}</span></div>
      <div class="meta"><code>${escape(c.id)}</code><span>approved ${escape(c.date)}</span><span class="pill ${badge[c.state][0]}">${badge[c.state][1]}</span></div>
      ${c.paired
        ? `<div class="label">Replaces</div><div class="drawings">${drawingFigure(c.paired, drawingName.get(c.paired) || c.paired, true)}</div>`
        : `<div class="label">Closest drawings — not paired</div><div class="drawings">${c.candidates.map((d) => drawingFigure(d.slug, d.name, false)).join("")}</div>`}
    </div>
  </article>`).join("\n")}
</main>
<script>
  // Only the clips on screen play: 78 at once would hold every decoder the Mac has.
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const video = entry.target;
      if (entry.isIntersecting) { if (!matchMedia("(prefers-reduced-motion: reduce)").matches) video.play().catch(() => {}); else video.preload = "metadata"; }
      else video.pause();
    }
  }, { rootMargin: "200px" });
  document.querySelectorAll("video").forEach((v) => seen.observe(v));
  const q = document.getElementById("q"), unpaired = document.getElementById("unpaired");
  function filter() {
    const text = q.value.trim().toLowerCase();
    for (const card of document.querySelectorAll("article")) {
      card.hidden = (text && !card.dataset.text.includes(text)) || (unpaired.checked && card.dataset.paired === "1");
    }
  }
  q.addEventListener("input", filter); unpaired.addEventListener("change", filter);
</script>
</body>
</html>
`;
  const target = join(from, "klipler.html");
  writeFileSync(target, html);
  console.log(`${target}: ${cards.length} clips, ${cards.filter((c) => c.state === "same").length} in the bucket, ${cards.filter((c) => c.paired).length} paired`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

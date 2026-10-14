// Uploads the owner's approved exercise clips to the private R2 bucket and writes the catalogue
// the apps read (see clips.js). Clips never enter this public repository.
//
//   node scripts/upload-clips.mjs --from ~/Desktop/Repo/blender-poc            # upload
//   node scripts/upload-clips.mjs --from ~/Desktop/Repo/blender-poc --dry-run  # show what would happen
//
// Read straight from the Blender production folder: its log (uretim-kaydi.csv) says which clips
// the owner approved, and only those go up — the 1080p H.264 file of each (H.264 plays on every
// phone the apps support; HEVC does not on every Android).
//
// Which drawing a clip replaces is clip-slugs.json, kept on this machine only (owner, 2026-10-13;
// clip-slugs.example.json shows the shape). A clip not in it goes up with "slug": null — the
// owner pairs a clip with a drawing only when it is the same movement ("sadece urettiklerimle
// ayni ise"), so nothing here guesses one.
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";

const BUCKET = "turquoise-exercise-clips";
const ROOT = new URL("..", import.meta.url).pathname;

/** A clip id the Worker will serve — the same rule as clips.js's CLIP_ID. */
export const isServableId = (id) => /^[A-Za-z0-9_-]{1,32}$/.test(id);

/** The rows of a CSV file, quotes and commas inside quotes respected. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((cell) => cell !== "")) rows.push(row);
  const [head, ...body] = rows;
  return body.map((cells) => Object.fromEntries(head.map((name, i) => [name, cells[i] ?? ""])));
}

/** The approved clips of a production log: id and name, in the log's order. Pure, so it is tested. */
export function approvedClips(logRows) {
  return logRows
    .filter((row) => row.durum === "onaylandi" && isServableId(row.medya_id))
    .map((row) => ({ id: row.medya_id, name: row.egzersiz_adi }));
}

/** The catalogue for the clips found, in the shape clips.js serves. Pure, so it is tested. */
export function catalogueFor(found, version, updatedAt) {
  return {
    version,
    clips: found
      .map(({ id, name, slug, bytes, sha256 }) => ({ id, name, slug: slug ?? null, bytes, sha256, updatedAt }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** The clips whose bytes the bucket does not hold yet: new ids, or ids whose checksum changed. Pure, so it is tested. */
export function clipsToUpload(found, held) {
  const bucket = new Map((held?.clips || []).map((clip) => [clip.id, clip.sha256]));
  return found.filter((clip) => bucket.get(clip.id) !== clip.sha256);
}

/** The catalogue the bucket holds now, or null when it cannot be read (then everything is sent). */
function bucketCatalogue() {
  const dir = mkdtempSync(join(tmpdir(), "clips-"));
  const file = join(dir, "catalogue.json");
  const run = spawnSync("npx", ["--yes", "wrangler@4", "r2", "object", "get", `${BUCKET}/clips/catalogue.json`, "--file", file, "--remote"],
    { stdio: "ignore", cwd: ROOT });
  if (run.status !== 0 || !existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; }
}

/** The 1080p H.264 file of a clip in the production's out/ folder, or null. */
function clipFile(outDir, id) {
  const folder = readdirSync(outDir).find((name) => name.split("_")[1] === id);
  if (!folder) return null;
  const file = join(outDir, folder, `${id}_1080_h264.mp4`);
  return existsSync(file) ? file : null;
}

function put(key, file, contentType, dryRun) {
  const args = ["--yes", "wrangler@4", "r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", contentType, "--remote"];
  if (dryRun) {
    console.log(`would run: npx ${args.join(" ")}`);
    return;
  }
  const run = spawnSync("npx", args, { stdio: ["ignore", "ignore", "inherit"], cwd: ROOT });
  if (run.status !== 0) throw new Error(`upload of ${key} failed`);
}

function main(argv) {
  const fromArg = argv[argv.indexOf("--from") + 1];
  if (!argv.includes("--from") || !fromArg) throw new Error("usage: node scripts/upload-clips.mjs --from <blender-poc folder> [--dry-run]");
  const from = resolve(fromArg.replace(/^~(?=$|\/)/, homedir()));
  const dryRun = argv.includes("--dry-run");
  const outDir = join(from, "pilot", "out");
  const approved = approvedClips(parseCsv(readFileSync(join(from, "uretim-kaydi.csv"), "utf8")));

  const slugsFile = join(ROOT, "clip-slugs.json");
  const slugs = existsSync(slugsFile) ? JSON.parse(readFileSync(slugsFile, "utf8")) : {};
  for (const id of Object.keys(slugs)) {
    if (!isServableId(id)) throw new Error(`clip-slugs.json: ${id} is not an id the Worker serves`);
  }

  const found = [];
  const missing = [];
  for (const { id, name } of approved) {
    const file = clipFile(outDir, id);
    if (!file) { missing.push(id); continue; }
    const data = readFileSync(file);
    found.push({ id, name, slug: slugs[id] ?? null, file, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
  }
  if (missing.length) console.log(`approved but no 1080p H.264 file, skipped: ${missing.join(", ")}`);
  if (!found.length) throw new Error("no approved clip was found; nothing uploaded");

  // Only what the bucket does not already hold, byte for byte (owner, 2026-10-14: uploads run on their own when the production
  // log changes, so a run must cost nothing when nothing changed). The bucket's own catalogue is the record of what it holds.
  const held = bucketCatalogue();
  const changes = clipsToUpload(found, held);
  const sameSlugs = held && !changes.length && found.length === held.clips.length &&
    found.every((clip) => held.clips.some((h) => h.id === clip.id && (h.slug ?? null) === (clip.slug ?? null) && h.name === clip.name));
  if (sameSlugs && !argv.includes("--all")) {
    console.log(`nothing changed: ${found.length} approved clip(s), all in the bucket`);
    return;
  }
  const toSend = argv.includes("--all") ? found : changes;
  toSend.forEach((clip, i) => {
    put(`clips/${clip.id}.mp4`, clip.file, "video/mp4", dryRun);
    if (!dryRun) console.log(`${i + 1}/${toSend.length} ${clip.id} ${clip.name}`);
  });

  // Seconds since 1970 as the version: always larger than the last, with no state to keep. Kept dates for unchanged clips.
  const today = new Date().toISOString().slice(0, 10);
  const catalogue = catalogueFor(found, Math.floor(Date.now() / 1000), today);
  for (const clip of catalogue.clips) {
    const before = held?.clips.find((h) => h.id === clip.id && h.sha256 === clip.sha256);
    if (before?.updatedAt) clip.updatedAt = before.updatedAt;
  }
  const local = join(ROOT, "clips-catalogue.local.json"); // gitignored
  writeFileSync(local, JSON.stringify(catalogue, null, 2));
  put("clips/catalogue.json", local, "application/json", dryRun);
  const paired = found.filter((clip) => clip.slug).length;
  console.log(`${dryRun ? "would upload" : "uploaded"} ${found.length} clip(s), ${paired} paired with a drawing, catalogue version ${catalogue.version}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

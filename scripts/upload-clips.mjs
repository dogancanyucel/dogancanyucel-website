// Uploads the owner's exercise clips to the private R2 bucket and writes the catalogue
// the apps read (see clips.js). Clips never enter this public repository.
//
//   node scripts/upload-clips.mjs --dir ~/path/to/clips            # upload
//   node scripts/upload-clips.mjs --dir ~/path/to/clips --dry-run  # show what would happen
//
// Only the clips named in clip-slugs.json go up. That file stays on this machine, out of the public
// repository (owner, 2026-10-13); clip-slugs.example.json shows its shape. It pairs a clip's id (its file name,
// the media id from the owner's Blender list) with the drawing's slug it replaces in the
// apps — the owner confirms each pair (2026-10-13: a drawing is replaced "sadece
// urettiklerimle ayni ise"), so nothing here guesses one.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const BUCKET = "turquoise-exercise-clips";
const ROOT = new URL("..", import.meta.url).pathname;

/** A clip id the Worker will serve — the same rule as clips.js's CLIP_ID. */
export const isServableId = (id) => /^[A-Za-z0-9_-]{1,32}$/.test(id);

/** The catalogue for the clips found, in the shape clips.js serves. Pure, so it is tested. */
export function catalogueFor(found, version, updatedAt) {
  return {
    version,
    clips: found
      .map(({ id, slug, bytes, sha256 }) => ({ id, slug, bytes, sha256, updatedAt }))
      .sort((a, b) => a.slug.localeCompare(b.slug)),
  };
}

function put(key, file, contentType, dryRun) {
  const args = ["--yes", "wrangler@4", "r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", contentType, "--remote"];
  if (dryRun) {
    console.log(`would run: npx ${args.join(" ")}`);
    return;
  }
  const run = spawnSync("npx", args, { stdio: "inherit", cwd: ROOT });
  if (run.status !== 0) throw new Error(`upload of ${key} failed`);
}

function main(argv) {
  const dirArg = argv[argv.indexOf("--dir") + 1];
  if (!argv.includes("--dir") || !dirArg) throw new Error("usage: node scripts/upload-clips.mjs --dir <folder> [--dry-run]");
  const dir = resolve(dirArg.replace(/^~(?=$|\/)/, homedir()));
  const dryRun = argv.includes("--dry-run");
  const slugsFile = join(ROOT, "clip-slugs.json");
  if (!existsSync(slugsFile)) throw new Error("clip-slugs.json is missing: copy clip-slugs.example.json and fill in the pairs");
  const slugs = JSON.parse(readFileSync(slugsFile, "utf8"));

  const found = [];
  const missing = [];
  for (const [id, slug] of Object.entries(slugs)) {
    if (!isServableId(id)) throw new Error(`${id}: not an id the Worker serves (letters, digits, - and _ only)`);
    const file = join(dir, `${id}.mp4`);
    if (!existsSync(file)) { missing.push(id); continue; }
    const data = readFileSync(file);
    found.push({ id, slug, file, bytes: data.length, sha256: createHash("sha256").update(data).digest("hex") });
  }
  if (missing.length) console.log(`not in ${dir}, skipped: ${missing.join(", ")}`);
  if (!found.length) throw new Error("no clip from clip-slugs.json was found; nothing uploaded");

  for (const clip of found) put(`clips/${clip.id}.mp4`, clip.file, "video/mp4", dryRun);

  // Seconds since 1970 as the version: always larger than the last, with no state to keep.
  const catalogue = catalogueFor(found, Math.floor(Date.now() / 1000), new Date().toISOString().slice(0, 10));
  const local = join(ROOT, "clips-catalogue.local.json"); // gitignored
  writeFileSync(local, JSON.stringify(catalogue, null, 2));
  put("clips/catalogue.json", local, "application/json", dryRun);
  console.log(`${dryRun ? "would upload" : "uploaded"} ${found.length} clip(s) and catalogue version ${catalogue.version}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

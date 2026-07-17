/**
 * Import data/supplements_slim.json into Cloudflare D1 using large SQL files
 * (few wrangler uploads instead of hundreds of tiny batches).
 *
 * Usage:
 *   node scripts/import-supplements-d1.mjs          # remote
 *   node scripts/import-supplements-d1.mjs --local  # local D1
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SLIM = path.join(ROOT, "data", "supplements_slim.json");
const DB_NAME = "exercises_db";
/** Keep each uploaded SQL under ~4MB to stay within wrangler limits. */
const MAX_FILE_BYTES = 3.5 * 1024 * 1024;
const local = process.argv.includes("--local");

function esc(s) {
  return String(s ?? "").replace(/'/g, "''");
}

function runFile(filePath) {
  const args = ["d1", "execute", DB_NAME, "--file", filePath];
  if (local) args.push("--local");
  else args.push("--remote");
  const r = spawnSync("npx", ["wrangler", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    shell: true,
    maxBuffer: 30 * 1024 * 1024,
  });
  if (r.status !== 0) {
    console.error(r.stdout || "");
    console.error(r.stderr || "");
    throw new Error(`wrangler failed on ${path.basename(filePath)} (exit ${r.status})`);
  }
}

function main() {
  if (!fs.existsSync(SLIM)) {
    console.error(`Missing ${SLIM}. Run: node scripts/etl-dsld.mjs`);
    process.exit(1);
  }
  const rows = JSON.parse(fs.readFileSync(SLIM, "utf8"));
  console.log(`Importing ${rows.length} supplements (${local ? "local" : "remote"})…`);

  const schemaFile = path.join(ROOT, "data", "_supplements_schema.sql");
  fs.writeFileSync(
    schemaFile,
    `
DROP TABLE IF EXISTS supplements;
CREATE TABLE supplements (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  serving TEXT,
  calories INTEGER NOT NULL DEFAULT 0,
  protein REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  ingredients TEXT,
  off_market INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_supplements_name ON supplements(name);
CREATE INDEX IF NOT EXISTS idx_supplements_brand ON supplements(brand);
`,
    "utf8"
  );
  runFile(schemaFile);
  fs.unlinkSync(schemaFile);
  console.log("Schema ready.");

  let part = 0;
  let buf = "";
  let inPart = 0;
  const flush = () => {
    if (!buf) return;
    part += 1;
    const file = path.join(ROOT, "data", `_supplements_part_${part}.sql`);
    fs.writeFileSync(file, buf, "utf8");
    console.log(`  Uploading part ${part} (${inPart} rows, ${(buf.length / 1024 / 1024).toFixed(1)} MB)…`);
    runFile(file);
    fs.unlinkSync(file);
    buf = "";
    inPart = 0;
  };

  for (const r of rows) {
    const line =
      `INSERT OR REPLACE INTO supplements (id, name, brand, serving, calories, protein, carbs, fat, ingredients, off_market) VALUES (` +
      `${Number(r.id) || 0},` +
      `'${esc(r.name)}',` +
      `'${esc(r.brand)}',` +
      `'${esc(r.serving)}',` +
      `${Number(r.calories) || 0},` +
      `${Number(r.protein) || 0},` +
      `${Number(r.carbs) || 0},` +
      `${Number(r.fat) || 0},` +
      `'${esc(r.ingredients)}',` +
      `${Number(r.off_market) ? 1 : 0}` +
      `);\n`;
    if (buf.length + line.length > MAX_FILE_BYTES) flush();
    buf += line;
    inPart += 1;
  }
  flush();
  console.log(`✅ Import complete (${part} parts).`);
}

main();

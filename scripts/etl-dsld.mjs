/**
 * DSLD full JSON dump → slim supplements JSON for D1.
 *
 * Usage:
 *   node scripts/etl-dsld.mjs [path-to-DSLD-folder]
 *
 * Default input:
 *   C:/Users/black/OneDrive/Desktop/DSLD-full-database-JSON/DSLD-full-database-JSON
 *
 * Output:
 *   ./data/supplements_slim.json
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_SRC =
  "C:/Users/black/OneDrive/Desktop/DSLD-full-database-JSON/DSLD-full-database-JSON";
const OUT_DIR = path.join(ROOT, "data");
const OUT_FILE = path.join(OUT_DIR, "supplements_slim.json");

const srcDir = process.argv[2] || DEFAULT_SRC;

function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function qtyOf(row) {
  const q = row?.quantity?.[0];
  if (!q || q.quantity == null) return null;
  const n = Number(q.quantity);
  return Number.isFinite(n) ? n : null;
}

function extractMacros(ingredientRows) {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;

  for (const row of ingredientRows || []) {
    const n = normName(row.name);
    const qty = qtyOf(row);
    if (qty == null) continue;

    // Prefer kcal-style calorie rows; skip "calories from fat"
    if (
      (n === "calories" || n === "energy" || n === "energy (kcal)" || n === "calories (kcal)") &&
      !n.includes("from fat")
    ) {
      calories = Math.round(qty);
      continue;
    }
    if (n === "protein" || n === "total protein") {
      protein = Math.round(qty * 10) / 10;
      continue;
    }
    if (
      n === "total carbohydrate" ||
      n === "total carbohydrates" ||
      n === "carbohydrate" ||
      n === "carbohydrates" ||
      n === "carbs"
    ) {
      carbs = Math.round(qty * 10) / 10;
      continue;
    }
    if (n === "total fat" || n === "fat" || n === "total lipid") {
      fat = Math.round(qty * 10) / 10;
    }
  }
  return { calories, protein, carbs, fat };
}

function servingLabel(doc) {
  const s = doc.servingSizes?.[0];
  if (!s) return "";
  const qty = s.minQuantity ?? s.maxQuantity ?? "";
  const unit = s.unit || "";
  return `${qty} ${unit}`.trim();
}

function ingredientsSummary(doc) {
  const names = (doc.ingredientRows || [])
    .map((r) => r.name)
    .filter(Boolean)
    .filter((n) => {
      const x = normName(n);
      return !(
        x === "calories" ||
        x.startsWith("calories from") ||
        x === "protein" ||
        x === "total protein" ||
        x.includes("carbohydrate") ||
        x === "carbs" ||
        x === "total fat" ||
        x === "fat" ||
        x === "total lipid" ||
        x === "sodium" ||
        x === "cholesterol" ||
        x === "dietary fiber" ||
        x === "sugars" ||
        x === "total sugars"
      );
    })
    .slice(0, 8);
  return names.join(", ").slice(0, 240);
}

function slim(doc) {
  const macros = extractMacros(doc.ingredientRows);
  const fullName = String(doc.fullName || "").trim();
  if (!fullName) return null;
  return {
    id: Number(doc.id) || 0,
    name: fullName,
    brand: String(doc.brandName || "").trim(),
    serving: servingLabel(doc),
    calories: macros.calories,
    protein: macros.protein,
    carbs: macros.carbs,
    fat: macros.fat,
    ingredients: ingredientsSummary(doc),
    off_market: doc.offMarket ? 1 : 0,
  };
}

function main() {
  if (!fs.existsSync(srcDir)) {
    console.error(`Source folder not found: ${srcDir}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".json"));
  console.log(`Scanning ${files.length} JSON files from ${srcDir}...`);

  const out = [];
  let errors = 0;
  let withMacros = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    try {
      const raw = fs.readFileSync(path.join(srcDir, file), "utf8");
      const doc = JSON.parse(raw);
      const row = slim(doc);
      if (!row || !row.id) continue;
      if (row.calories > 0 || row.protein > 0 || row.carbs > 0 || row.fat > 0) {
        withMacros++;
      }
      out.push(row);
    } catch {
      errors++;
    }
    if ((i + 1) % 5000 === 0) {
      console.log(`  … ${i + 1}/${files.length}`);
    }
  }

  // Prefer on-market first when searching (stable sort by name)
  out.sort((a, b) => {
    if (a.off_market !== b.off_market) return a.off_market - b.off_market;
    return a.name.localeCompare(b.name);
  });

  fs.writeFileSync(OUT_FILE, JSON.stringify(out));
  const mb = (fs.statSync(OUT_FILE).size / (1024 * 1024)).toFixed(1);
  console.log(`✅ Wrote ${out.length} products → ${OUT_FILE} (${mb} MB)`);
  console.log(`   With any macro > 0: ${withMacros}`);
  console.log(`   Parse errors skipped: ${errors}`);
}

main();

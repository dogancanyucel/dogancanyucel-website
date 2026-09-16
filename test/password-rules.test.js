// The reset page's password rule gives what the app's Swift code gives, row for row.
// The vectors were printed by iOS PasswordStrength itself (2026-09-16); regenerate them there if the rule changes.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { characterClasses, characters, isAcceptable, isTrivialSequence, problem } from "../public/turquoise/auth/password-rules.js";

const vectors = JSON.parse(readFileSync(new URL("./fixtures/password-vectors.json", import.meta.url), "utf8"));
assert.ok(vectors.length >= 30, "the vectors are all there");
for (const row of vectors) {
  const label = JSON.stringify(row.password);
  assert.strictEqual(characters(row.password).length, row.length, `${label} length`);
  assert.strictEqual(characterClasses(row.password), row.classes, `${label} classes`);
  assert.strictEqual(isTrivialSequence(row.password), row.trivial, `${label} sequence`);
  assert.strictEqual(isAcceptable(row.password), row.acceptable, `${label} acceptable`);
}
assert.strictEqual(problem(""), null, "an empty box is not scolded");
assert.deepStrictEqual(problem("123456"), ["Passwords need at least %d characters.", 8], "Firebase's own page took this");
assert.strictEqual(problem("Password1"), null);
console.log(`password-rules: ${vectors.length} vectors match the app`);

// Writes public/turquoise/auth/strings/<language>.json — the reset page's words, from the iOS app's catalogue. One file per
// language, because the page needs one of them: all 106 together were 161 KB, one is a kilobyte or two.
//
// The app's approved translations are the source: the page says "New password" in the same words the app's Edit Profile
// does, in all 106 languages, and a sentence written for the page alone is added to the catalogue first (with a comment
// saying so), never here. Run after the catalogue changes:
//   node scripts/auth-page-strings.mjs [path/to/Localizable.xcstrings]
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const KEYS = [
  "Reset password",
  "New password",
  "Repeat it",
  "Save",
  "Passwords do not match.",
  "Passwords need at least %d characters.",
  "That is a sequence — try something less predictable.",
  "Mix at least %d of: lower case, upper case, digits, symbols.",
  "That password is too weak.",
  "Your password has been changed. Sign in with the new one.",
  "This link has expired or was already used. Ask for a new one in the app.",
  "This account has been disabled.",
  "Verified",
  "Done",
  "No connection. Try again when you're back online.",
  "Too many attempts. Wait a moment and try again.",
  "That didn't go through. Try again in a moment.",
];

export function build(catalogue) {
  const out = { en: {} };
  for (const key of KEYS) {
    const entry = catalogue.strings[key];
    if (!entry) throw new Error(`not in the catalogue: ${key}`);
    out.en[key] = key;
    for (const [language, localization] of Object.entries(entry.localizations ?? {})) {
      const value = localization.stringUnit?.value;
      if (!value) continue;
      (out[language] ??= {})[key] = value;
    }
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = process.argv[2]
    ?? new URL("../../../turquoise_-ai-calorie-fitness-ios/Turquoise/Localizable.xcstrings", import.meta.url).pathname;
  const strings = build(JSON.parse(readFileSync(source, "utf8")));
  const folder = new URL("../public/turquoise/auth/strings/", import.meta.url);
  mkdirSync(folder, { recursive: true });
  for (const [language, words] of Object.entries(strings)) {
    writeFileSync(new URL(`${language}.json`, folder), JSON.stringify(words) + "\n");
  }
  writeFileSync(new URL("languages.json", folder), JSON.stringify(Object.keys(strings).sort()) + "\n");
  console.log(`auth page strings: ${Object.keys(strings).length} languages, ${KEYS.length} keys`);
}

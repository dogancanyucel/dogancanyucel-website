// The reset page's decisions: language, sentences, the way back to the app, and what Firebase is asked.
import assert from "node:assert";
import { readdirSync, readFileSync } from "node:fs";
import { askFirebase, firstCall, openAppLink, pickLanguage, readLink, refusalKey } from "../public/turquoise/auth/action.js";
import { KEYS } from "../scripts/auth-page-strings.mjs";

const folder = new URL("../public/turquoise/auth/strings/", import.meta.url);
const languages = JSON.parse(readFileSync(new URL("languages.json", folder), "utf8"));

// Every language the app speaks, with every sentence the page can show.
assert.strictEqual(languages.length, 106, "the app's 106 languages");
for (const language of languages) {
  const words = JSON.parse(readFileSync(new URL(`${language}.json`, folder), "utf8"));
  for (const key of KEYS) assert.ok(words[key], `${language} is missing "${key}"`);
}
assert.strictEqual(readdirSync(folder).length, 107, "one file per language, and the list");

// Firebase's language on the link wins; its names become the catalogue's; a region falls back to its language.
assert.strictEqual(pickLanguage("tr", ["de-DE"], languages), "tr");
assert.strictEqual(pickLanguage("zh-TW", [], languages), "zh-Hant");
assert.strictEqual(pickLanguage("iw", [], languages), "he");
assert.strictEqual(pickLanguage("", ["pt-BR", "en"], languages), "pt");
assert.strictEqual(pickLanguage("", ["xx-YY"], languages), "en");

// Every sentence the page picks is one the strings carry.
for (const code of ["EXPIRED_OOB_CODE", "INVALID_OOB_CODE", "USER_DISABLED", "TOO_MANY_ATTEMPTS_TRY_LATER",
  "WEAK_PASSWORD : Password should be at least 6 characters", "SOMETHING_NEW", undefined]) {
  assert.ok(KEYS.includes(refusalKey(code)), `${code} has no translated sentence`);
}
assert.strictEqual(refusalKey("WEAK_PASSWORD : Password should be at least 6 characters"), "That password is too weak.");

// Back to the app on a phone; nothing to open on a computer.
assert.strictEqual(openAppLink("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), "https://app.dogancanyucel.com/open/auth-done",
  "a Universal Link on another host, which Edge hands to the app");
assert.match(openAppLink("Mozilla/5.0 (Linux; Android 15; Pixel 9)"), /package=com\.aistudio\.fitai\.trfity/);
assert.strictEqual(openAppLink("Mozilla/5.0 (Windows NT 10.0; Win64; x64)"), null);

// The link's parts, and which modes the page answers.
assert.deepStrictEqual(readLink("?mode=resetPassword&oobCode=abc&apiKey=AIza1&lang=tr"),
  { mode: "resetPassword", code: "abc", apiKey: "AIza1", language: "tr" });
assert.strictEqual(firstCall("resetPassword"), "accounts:resetPassword");
assert.strictEqual(firstCall("verifyEmail"), "accounts:update");
assert.strictEqual(firstCall("signIn"), null, "an email-link sign-in is not something this app sends");

// Firebase asked with the code in the body and the key in the query; refusals and lost connections become sentences.
const calls = [];
const answer = await askFirebase("accounts:resetPassword", "AIza1", { oobCode: "abc" }, async (url, init) => {
  calls.push({ url, init });
  return new Response(JSON.stringify({ email: "a@b.co" }), { status: 200 });
});
assert.strictEqual(answer.email, "a@b.co");
assert.strictEqual(calls[0].url, "https://identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=AIza1");
assert.deepStrictEqual(JSON.parse(calls[0].init.body), { oobCode: "abc" });
assert.strictEqual(calls[0].init.referrerPolicy, "origin", "the page's address, with its code, is never sent");
await assert.rejects(
  askFirebase("accounts:update", "k", {}, async () => new Response(JSON.stringify({ error: { message: "EXPIRED_OOB_CODE" } }), { status: 400 })),
  (e) => e.key === "This link has expired or was already used. Ask for a new one in the app.");
await assert.rejects(askFirebase("accounts:update", "k", {}, async () => { throw new TypeError("offline"); }),
  (e) => e.key === "No connection. Try again when you're back online.");

console.log(`auth-action: ${languages.length} languages, ${KEYS.length} sentences, decisions hold`);

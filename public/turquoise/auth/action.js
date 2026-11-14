// The reset page's decisions, apart from the page so they can be tested: which language, which sentence for which refusal,
// which link opens the app, and what Firebase is asked. See index.html for why this page exists.

const IDENTITY = "https://identitytoolkit.googleapis.com/v1";

/**
 * Firebase's and the browser's names for a language, as the app's catalogue names it.
 *
 * **A Map, not an object** (2026-11-14). As an object literal this table answered for every name on
 * Object.prototype as well: `?lang=constructor` returned the Object function, `?lang=__proto__` returned the
 * prototype, and the next line — `code.split(...)` — threw TypeError on a value that is not a string. The throw
 * was in pickLanguage, which start() calls outside its try, so the page stopped at its "…" and never drew the
 * form, the error or anything else. The language on the link is whatever is in the address bar, so the one page
 * a person reaches from a password-reset mail could be stopped dead by a word in a query string.
 * A Map holds only what was put in it.
 */
const ALIASES = new Map([
  ["zh-CN", "zh-Hans"], ["zh-SG", "zh-Hans"], ["zh-TW", "zh-Hant"], ["zh-HK", "zh-Hant"], ["zh-MO", "zh-Hant"],
  ["iw", "he"], ["no", "nb"], ["in", "id"],
]);

/**
 * The language to speak: the one Firebase put on the link (the app sets it from its own language before sending), then the
 * browser's, then English. A regional name falls back to its language — pt-BR to pt, en-US to en.
 */
export function pickLanguage(requested, preferred, available) {
  for (const raw of [requested, ...(preferred ?? [])]) {
    if (typeof raw !== "string" || !raw) continue;
    const code = ALIASES.get(raw) ?? raw;
    if (available.includes(code)) return code;
    const base = code.split(/[-_]/)[0].toLowerCase();
    if (base === "zh") return /TW|HK|MO|Hant/i.test(code) ? "zh-Hant" : "zh-Hans";
    const named = ALIASES.get(base) ?? base;
    if (available.includes(named)) return named;
  }
  return "en";
}

/** Languages written right to left, so the page turns with them. */
export function isRightToLeft(language) {
  return ["ar", "he", "fa", "ur", "ug", "sd", "yi"].includes(language);
}

/**
 * The catalogue key for a refusal from Firebase. Nothing names an account or says whether one exists; an unknown refusal is
 * not guessed at.
 */
export function refusalKey(firebaseMessage) {
  const code = String(firebaseMessage ?? "").split(":")[0].trim();
  switch (code) {
    case "EXPIRED_OOB_CODE":
    case "INVALID_OOB_CODE":
    case "MISSING_OOB_CODE":
      return "This link has expired or was already used. Ask for a new one in the app.";
    case "USER_DISABLED":
      return "This account has been disabled.";
    case "TOO_MANY_ATTEMPTS_TRY_LATER":
      return "Too many attempts. Wait a moment and try again.";
    case "WEAK_PASSWORD":
    case "PASSWORD_DOES_NOT_MEET_REQUIREMENTS":
      return "That password is too weak.";
    default:
      return "That didn't go through. Try again in a moment.";
  }
}

/** The app's own id, and where an Android visitor lands when the app is not installed. */
const ANDROID_PACKAGE = "com.aistudio.fitai.trfity";
const PLAY_URL = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;

/**
 * The link that opens the app on this device, or null where there is no app to open (a computer).
 * iOS: a Universal Link on app.dogancanyucel.com, which falls back to the URL scheme. Android: by package, through an intent link.
 *
 * **The Android link needs somewhere to fall to** (found 2026-11-06, reading this file against app-links.js): an intent link
 * with no `browser_fallback_url` does nothing at all when the package is not installed, so a reader who changed their password
 * in a browser and does not have the app was left on this page with a dead button. The landing page was given the fallback on
 * 2026-11-04 (`c1b510a`) once the app was on Google Play; this page, which has the same button, was missed.
 * The address is app-links.js's `PLAY_URL`. This file is served to the browser and cannot import from the Worker, so the
 * string is here twice in the repository and test/auth-action.test.js holds the two together.
 */
export function openAppLink(userAgent) {
  if (/Android/i.test(userAgent)) {
    return `intent://auth-done#Intent;scheme=${ANDROID_PACKAGE};package=${ANDROID_PACKAGE};` +
      `S.browser_fallback_url=${encodeURIComponent(PLAY_URL)};end`;
  }
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent))) {
    // A Universal Link, not the URL scheme: Edge on iPhone ignores the scheme (owner, 2026-09-16). See app-links.js.
    return "https://app.dogancanyucel.com/open/auth-done";
  }
  return null;
}

/** What the link asks for: the mode, the one-time code, the key Firebase put on it and the language. */
export function readLink(search) {
  const query = new URLSearchParams(search);
  return {
    mode: query.get("mode") ?? "",
    code: query.get("oobCode") ?? "",
    apiKey: query.get("apiKey") ?? "",
    language: query.get("lang") ?? "",
  };
}

/**
 * One call to Firebase Auth's REST API. Resolves to Firebase's answer, or throws { key } with the sentence to show.
 *
 * `referrerPolicy: "origin"` because the page's own address carries the one-time code: the page's policy sends no referrer at
 * all, and a key restricted by referrer still needs to see which site is asking.
 */
export async function askFirebase(path, apiKey, body, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`${IDENTITY}/${path}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      referrerPolicy: "origin",
    });
  } catch {
    throw { key: "No connection. Try again when you're back online." };
  }
  let answer = null;
  try { answer = await response.json(); } catch { answer = null; }
  if (!response.ok) throw { key: refusalKey(answer?.error?.message) };
  return answer ?? {};
}

/** The Firebase call behind each mode, before anything is typed. Unknown modes are an unusable link. */
export function firstCall(mode) {
  switch (mode) {
    case "resetPassword": return "accounts:resetPassword";
    case "verifyEmail":
    case "recoverEmail":
    case "verifyAndChangeEmail":
    case "revertSecondFactorAddition":
      return "accounts:update";
    default: return null;
  }
}

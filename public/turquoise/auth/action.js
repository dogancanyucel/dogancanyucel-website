// The reset page's decisions, apart from the page so they can be tested: which language, which sentence for which refusal,
// which link opens the app, and what Firebase is asked. See index.html for why this page exists.

const IDENTITY = "https://identitytoolkit.googleapis.com/v1";

/** Firebase's and the browser's names for a language, as the app's catalogue names it. */
const ALIASES = { "zh-CN": "zh-Hans", "zh-SG": "zh-Hans", "zh-TW": "zh-Hant", "zh-HK": "zh-Hant", "zh-MO": "zh-Hant", iw: "he", no: "nb", in: "id" };

/**
 * The language to speak: the one Firebase put on the link (the app sets it from its own language before sending), then the
 * browser's, then English. A regional name falls back to its language — pt-BR to pt, en-US to en.
 */
export function pickLanguage(requested, preferred, available) {
  for (const raw of [requested, ...(preferred ?? [])]) {
    if (!raw) continue;
    const code = ALIASES[raw] ?? raw;
    if (available.includes(code)) return code;
    const base = code.split(/[-_]/)[0].toLowerCase();
    if (base === "zh") return /TW|HK|MO|Hant/i.test(code) ? "zh-Hant" : "zh-Hans";
    const named = ALIASES[base] ?? base;
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

/**
 * The link that opens the app on this device, or null where there is no app to open (a computer).
 * iOS: a Universal Link on app.dogancanyucel.com, which falls back to the URL scheme. Android: by package, through an intent link.
 */
export function openAppLink(userAgent) {
  if (/Android/i.test(userAgent)) {
    return "intent://auth-done#Intent;scheme=com.aistudio.fitai.trfity;package=com.aistudio.fitai.trfity;end";
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

// ── Who is asking: Firebase App Check and Firebase sign-in, checked here ──────
// The exercise clips are the owner's own work and are for Turquoise alone (owner,
// 2026-10-13). A request must carry two tokens Google signed: App Check says it comes
// from the genuine app on a genuine device, the ID token says which signed-in person
// it is — the key the per-minute limit counts by. Neither is stored anywhere.
//
// Plain WebCrypto, no library: both are RS256 JWTs checked against Google's published
// keys, and a dependency for forty lines is a dependency to keep up to date.
// Facts read from Firebase's documentation on 2026-10-13; the project number is not a
// secret (it is in every app's configuration file).

export const FIREBASE_PROJECT_ID = "turquoiseaiapp";
export const FIREBASE_PROJECT_NUMBER = "709727665519";

export const APP_CHECK = {
  jwksUrl: "https://firebaseappcheck.googleapis.com/v1/jwks",
  issuer: `https://firebaseappcheck.googleapis.com/${FIREBASE_PROJECT_NUMBER}`,
  // App Check puts both spellings of the project in its audience; either one is ours.
  audiences: [`projects/${FIREBASE_PROJECT_NUMBER}`, `projects/${FIREBASE_PROJECT_ID}`],
};

export const ID_TOKEN = {
  jwksUrl: "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  issuer: `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`,
  audiences: [FIREBASE_PROJECT_ID],
};

/** A few minutes either way, for a phone whose clock is a little off. */
const CLOCK_SKEW_SECONDS = 300;
/** How long a key set is kept when Google's answer names no max-age. */
const DEFAULT_KEY_SECONDS = 3600;

const keyCache = new Map(); // jwksUrl → { keys: Map<kid, CryptoKey>, until: ms }

/** Forgets every cached key set. Tests only. */
export function clearKeyCache() {
  keyCache.clear();
}

function base64UrlBytes(text) {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "=");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlJson(text) {
  return JSON.parse(new TextDecoder().decode(base64UrlBytes(text)));
}

async function keysFor(jwksUrl, fetchImpl, nowMs) {
  const cached = keyCache.get(jwksUrl);
  if (cached && cached.until > nowMs) return cached.keys;
  const response = await fetchImpl(jwksUrl);
  if (!response.ok) throw new Error(`key set answered ${response.status}`);
  const body = await response.json();
  const keys = new Map();
  for (const jwk of body.keys || []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    const key = await crypto.subtle.importKey(
      "jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"],
    );
    keys.set(jwk.kid, key);
  }
  const maxAge = /max-age=(\d+)/.exec(response.headers.get("cache-control") || "");
  const seconds = maxAge ? Number(maxAge[1]) : DEFAULT_KEY_SECONDS;
  keyCache.set(jwksUrl, { keys, until: nowMs + seconds * 1000 });
  return keys;
}

/**
 * The token's claims when Google signed it for us and it is still good; null for anything else.
 *
 * Null, never a throw, for a bad token: a forged or stale token is the ordinary case of
 * somebody trying the door, and the caller answers it with 401. A key set that cannot be
 * fetched does throw — that is our trouble, not the caller's, and is answered 503.
 */
export async function verifiedClaims(token, expected, { fetchImpl = fetch, nowMs = Date.now() } = {}) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header, claims;
  try {
    header = base64UrlJson(parts[0]);
    claims = base64UrlJson(parts[1]);
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || !header.kid) return null;

  const keys = await keysFor(expected.jwksUrl, fetchImpl, nowMs);
  const key = keys.get(header.kid);
  if (!key) return null;

  let signature;
  try {
    signature = base64UrlBytes(parts[2]);
  } catch {
    return null;
  }
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  const genuine = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
  if (!genuine) return null;

  const now = Math.floor(nowMs / 1000);
  if (claims.iss !== expected.issuer) return null;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.some((aud) => expected.audiences.includes(aud))) return null;
  if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_SECONDS < now) return null;
  if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_SECONDS > now) return null;
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  return claims;
}

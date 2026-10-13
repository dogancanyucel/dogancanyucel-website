import { APP_CHECK, ID_TOKEN, verifiedClaims } from "./firebase-tokens.js";

// ── The exercise clips: the owner's own 3D renders, for Turquoise alone ───────
// Owner, 2026-10-13: "web sitesine yeni yapilan mp4 giftleri nasil yukleyecegiz
// calinmamasi lazim". The clips live in a private R2 bucket, never in public/: this
// repository is public on GitHub and everything in public/ is downloadable by anyone,
// in bulk. Here a clip goes only to a request carrying a genuine App Check token and a
// signed-in Firebase user, at most CLIP_LIMIT a minute per user.
//
// Nothing about the caller is kept (owner, same day: "Dakikalık, kayıtsız"). The
// per-minute limit is Cloudflare's own counter, held by them and forgotten after the
// window; a daily per-user count would have meant storing who asked, which is a new
// kind of data and a privacy-policy change.
//
// What this cannot stop is a screen recording of a clip playing. It stops the cheap
// theft: one script downloading all 2,500.
//
// The contract the apps code against (owner-approved 2026-10-13):
//   GET /api/clips/catalogue  → {"version", "clips": [{"id", "name", "slug", "bytes", "sha256", "updatedAt"}]}
//       "name" is the movement's English name; "slug" is the drawing the clip replaces in the apps,
//       null until the owner pairs them (only when it is the same movement).
//   GET /api/clips/<id>.mp4   → the clip, 206 for a Range request
//   both need  X-Firebase-AppCheck: <token>  and  Authorization: Bearer <ID token>
//   401 without them, 429 + Retry-After past the limit.

/** Where the objects sit in the bucket. */
export const CATALOGUE_KEY = "clips/catalogue.json";
export const clipKey = (id) => `clips/${id}.mp4`;

/**
 * A clip's id: the media id from the owner's Blender list ("EIeI8Vf"). Letters, digits,
 * dash and underscore only, so nothing can climb out of clips/.
 */
export const CLIP_ID = /^[A-Za-z0-9_-]{1,32}$/;

/** Seconds a 429 tells the app to wait — the length of Cloudflare's window. */
export const RETRY_AFTER_SECONDS = 60;

const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });

/** Which of the two clip routes a path is, with the clip's id; null for neither. */
export function clipRouteOf(pathname) {
  if (pathname === "/api/clips/catalogue") return { route: "catalogue" };
  const match = /^\/api\/clips\/([^/]+)\.mp4$/.exec(pathname);
  if (match) return { route: "clip", id: match[1] };
  if (pathname.startsWith("/api/clips/")) return { route: "unknown" };
  return null;
}

/**
 * The signed-in user behind a request, or null when either token is missing or not ours.
 * Throws only when Google's keys cannot be fetched — see `verifiedClaims`.
 */
export async function callerOf(request, deps = {}) {
  const appCheck = request.headers.get("x-firebase-appcheck");
  const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") || "");
  if (!appCheck || !bearer) return null;
  const app = await verifiedClaims(appCheck, APP_CHECK, deps);
  if (!app) return null;
  const user = await verifiedClaims(bearer[1], ID_TOKEN, deps);
  return user ? user.sub : null;
}

/**
 * Whether one more request from this user is allowed now.
 *
 * **A missing limiter lets the request through.** Cloudflare's pricing page does not say
 * whether the rate-limit binding is on every plan (read 2026-10-13); if it is not there,
 * the clips still go only to the genuine app, and nothing breaks or bills.
 */
async function withinLimit(limiter, user) {
  if (!limiter || typeof limiter.limit !== "function") return true;
  try {
    const { success } = await limiter.limit({ key: user });
    return success;
  } catch {
    // The limiter having a moment must not cost the reader their clip.
    return true;
  }
}

/** The response for /api/clips/…, or null when the path is not a clip route. */
export async function clipsResponse(request, env, url, deps = {}) {
  const which = clipRouteOf(url.pathname);
  if (!which) return null;
  if (request.method !== "GET") return json(405, { error: "Method not allowed." }, { Allow: "GET" });
  if (which.route === "unknown") return json(404, { error: "Not found." });
  if (which.route === "clip" && !CLIP_ID.test(which.id)) return json(400, { error: "Bad clip id." });

  let user;
  try {
    user = await callerOf(request, deps);
  } catch {
    return json(503, { error: "Sign-in check unavailable." }, { "Retry-After": String(RETRY_AFTER_SECONDS) });
  }
  if (!user) return json(401, { error: "Unauthorized." });

  const limiter = which.route === "catalogue" ? env.CATALOGUE_LIMIT : env.CLIP_LIMIT;
  if (!(await withinLimit(limiter, user))) {
    return json(429, { error: "Too many requests." }, { "Retry-After": String(RETRY_AFTER_SECONDS) });
  }

  if (!env.CLIPS) return json(503, { error: "Clips unavailable." });

  if (which.route === "catalogue") {
    const catalogue = await env.CLIPS.get(CATALOGUE_KEY);
    if (!catalogue) return json(404, { error: "No catalogue yet." });
    return new Response(catalogue.body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=3600" },
    });
  }

  // R2 reads the Range header itself and answers with the slice it asked for. A Range it cannot read is answered with the
  // whole clip, as if none had been sent — a guard, not a measured fault: what R2 does with a malformed one was not tried
  // against the real bucket (2026-10-13), and a 500 for a clip that exists is the worse answer either way.
  let clip;
  try {
    clip = await env.CLIPS.get(clipKey(which.id), { range: request.headers });
  } catch {
    clip = await env.CLIPS.get(clipKey(which.id));
  }
  if (!clip) return json(404, { error: "No such clip." });

  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Cache-Control": "private, no-store",
    "Accept-Ranges": "bytes",
  });
  // R2's own tag. The sha256 the app checks a download against is in the catalogue.
  if (clip.httpEtag) headers.set("ETag", clip.httpEtag);
  const range = clip.range;
  if (range && request.headers.has("range") && (range.offset != null || range.suffix != null || range.length != null)) {
    const offset = range.offset ?? (range.suffix != null ? clip.size - range.suffix : 0);
    const length = range.length ?? (range.suffix ?? clip.size - offset);
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${clip.size}`);
    headers.set("Content-Length", String(length));
    return new Response(clip.body, { status: 206, headers });
  }
  headers.set("Content-Length", String(clip.size));
  return new Response(clip.body, { status: 200, headers });
}

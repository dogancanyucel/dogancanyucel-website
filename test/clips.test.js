// The exercise clips go only to the genuine Turquoise app with a signed-in user, at most
// a set number a minute (owner, 2026-10-13: "calinmamasi lazim"). Every refusal is its
// own case here, with only the thing being refused wrong in it.
// Run: node test/clips.test.js
import assert from "node:assert";
import worker from "../index.js";
import { clipsResponse, clipRouteOf } from "../clips.js";
import { APP_CHECK, ID_TOKEN, clearKeyCache, verifiedClaims } from "../firebase-tokens.js";
import { apiRouteOf } from "../traffic.js";
import { approvedClips, catalogueFor, clipsToUpload, isServableId, parseCsv } from "../scripts/upload-clips.mjs";
import { readFileSync } from "node:fs";

// ── A signing key standing in for Google's ──────────────────────────────────
const { publicKey, privateKey } = await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"],
);
const publicJwk = { ...(await crypto.subtle.exportKey("jwk", publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const strangerKey = (await crypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true, ["sign", "verify"],
)).privateKey;

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64json = (value) => b64url(new TextEncoder().encode(JSON.stringify(value)));

async function token(claims, { key = privateKey, kid = "k1", alg = "RS256" } = {}) {
  const head = b64json({ alg, kid, typ: "JWT" });
  const body = b64json(claims);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(signature)}`;
}

const NOW = 1_800_000_000; // seconds
const nowMs = NOW * 1000;
const appCheckClaims = (over = {}) => ({
  iss: APP_CHECK.issuer, aud: APP_CHECK.audiences, sub: "1:709727665519:ios:app", exp: NOW + 3600, iat: NOW - 10, ...over,
});
const idClaims = (over = {}) => ({
  iss: ID_TOKEN.issuer, aud: ID_TOKEN.audiences[0], sub: "user-1", exp: NOW + 3600, iat: NOW - 10, ...over,
});

let keyFetches = 0;
const fetchImpl = async () => {
  keyFetches++;
  return new Response(JSON.stringify({ keys: [publicJwk] }), { headers: { "cache-control": "public, max-age=21600" } });
};
const deps = { fetchImpl, nowMs };

// ── A bucket and a limiter standing in for Cloudflare's ─────────────────────
const CLIP_BYTES = new Uint8Array(1000).map((_, i) => i % 256);
const CATALOGUE = { version: 1, clips: [{ id: "EIeI8Vf", name: "barbell bench press", slug: "bench-press", bytes: 1000, sha256: "abc", updatedAt: "2026-10-13" }] };

function bucket() {
  return {
    async get(key, options = {}) {
      if (key === "clips/catalogue.json") return { body: JSON.stringify(CATALOGUE), size: 0 };
      if (key !== "clips/EIeI8Vf.mp4") return null;
      const header = options.range?.get?.("range");
      let range;
      if (header) {
        const parsed = /bytes=(\d+)-(\d*)/.exec(header);
        if (!parsed) throw new RangeError("unreadable range");
        const [, from, to] = parsed;
        const offset = Number(from);
        const end = to ? Number(to) : CLIP_BYTES.length - 1;
        range = { offset, length: end - offset + 1 };
      }
      const slice = range ? CLIP_BYTES.slice(range.offset, range.offset + range.length) : CLIP_BYTES;
      return { body: slice, size: CLIP_BYTES.length, range, httpEtag: '"r2-etag"' };
    },
  };
}

function limiter(allowed) {
  let used = 0;
  const keys = [];
  return { keys, async limit({ key }) { keys.push(key); used++; return { success: used <= allowed }; } };
}

const envWith = (over = {}) => ({ CLIPS: bucket(), CLIP_LIMIT: limiter(20), CATALOGUE_LIMIT: limiter(5), ...over });

async function ask(path, { app, id, range, env = envWith(), method = "GET" } = {}) {
  const headers = new Headers();
  if (app !== null) headers.set("X-Firebase-AppCheck", app ?? await token(appCheckClaims()));
  if (id !== null) headers.set("Authorization", `Bearer ${id ?? await token(idClaims())}`);
  if (range) headers.set("Range", range);
  const url = new URL(`https://dogancanyucel.com${path}`);
  return clipsResponse(new Request(url, { method, headers }), env, url, deps);
}

let passed = 0;
async function test(name, body) {
  clearKeyCache();
  await body();
  passed++;
  console.log(`ok - ${name}`);
}

// ── Routing ──────────────────────────────────────────────────────────────────
await test("only /api/clips/ paths are clip routes", () => {
  assert.deepStrictEqual(clipRouteOf("/api/clips/catalogue"), { route: "catalogue" });
  assert.deepStrictEqual(clipRouteOf("/api/clips/EIeI8Vf.mp4"), { route: "clip", id: "EIeI8Vf" });
  assert.strictEqual(clipRouteOf("/api/exercises"), null);
  assert.strictEqual(clipRouteOf("/exercise-illustrations/bench-press/1.png"), null);
});

await test("the tally names the route, never the clip", () => {
  assert.strictEqual(apiRouteOf(new URL("https://dogancanyucel.com/api/clips/catalogue")), "clips-catalogue");
  assert.strictEqual(apiRouteOf(new URL("https://dogancanyucel.com/api/clips/EIeI8Vf.mp4")), "clips");
});

// ── Who may ask ──────────────────────────────────────────────────────────────
await test("no tokens at all: 401, through the real Worker", async () => {
  const response = await worker.fetch(new Request("https://dogancanyucel.com/api/clips/catalogue"), envWith(), {});
  assert.strictEqual(response.status, 401);
});

await test("App Check missing: 401", async () => {
  assert.strictEqual((await ask("/api/clips/catalogue", { app: null })).status, 401);
});

await test("sign-in missing: 401", async () => {
  assert.strictEqual((await ask("/api/clips/catalogue", { id: null })).status, 401);
});

await test("App Check signed by somebody else: 401", async () => {
  const forged = await token(appCheckClaims(), { key: strangerKey });
  assert.strictEqual((await ask("/api/clips/catalogue", { app: forged })).status, 401);
});

await test("App Check for another Firebase project: 401", async () => {
  const other = await token(appCheckClaims({ aud: ["projects/111", "projects/someone-else"] }));
  assert.strictEqual((await ask("/api/clips/catalogue", { app: other })).status, 401);
});

await test("App Check from the wrong issuer: 401", async () => {
  const other = await token(appCheckClaims({ iss: "https://firebaseappcheck.googleapis.com/111" }));
  assert.strictEqual((await ask("/api/clips/catalogue", { app: other })).status, 401);
});

await test("expired App Check: 401", async () => {
  const stale = await token(appCheckClaims({ exp: NOW - 3600 }));
  assert.strictEqual((await ask("/api/clips/catalogue", { app: stale })).status, 401);
});

await test("sign-in token for another project: 401", async () => {
  const other = await token(idClaims({ aud: "someone-else", iss: "https://securetoken.google.com/someone-else" }));
  assert.strictEqual((await ask("/api/clips/catalogue", { id: other })).status, 401);
});

await test("a token claiming no signature algorithm: 401", async () => {
  const none = await token(appCheckClaims(), { alg: "none" });
  assert.strictEqual((await ask("/api/clips/catalogue", { app: none })).status, 401);
});

await test("a key Google never published: 401", async () => {
  const unknownKid = await token(appCheckClaims(), { kid: "nope" });
  assert.strictEqual((await ask("/api/clips/catalogue", { app: unknownKid })).status, 401);
});

await test("Google's keys unreachable: 503, not 401", async () => {
  const response = await clipsResponse(
    new Request("https://dogancanyucel.com/api/clips/catalogue", {
      headers: { "X-Firebase-AppCheck": await token(appCheckClaims()), Authorization: `Bearer ${await token(idClaims())}` },
    }),
    envWith(), new URL("https://dogancanyucel.com/api/clips/catalogue"),
    { nowMs, fetchImpl: async () => new Response("down", { status: 500 }) },
  );
  assert.strictEqual(response.status, 503);
});

await test("the key set is fetched once and kept", async () => {
  keyFetches = 0;
  await verifiedClaims(await token(appCheckClaims()), APP_CHECK, deps);
  await verifiedClaims(await token(appCheckClaims()), APP_CHECK, deps);
  assert.strictEqual(keyFetches, 1);
});

await test("a key Google starts signing with is fetched, at most once a minute", async () => {
  const fresh = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true, ["sign", "verify"],
  );
  const freshJwk = { ...(await crypto.subtle.exportKey("jwk", fresh.publicKey)), kid: "k2", alg: "RS256" };
  let rotated = false;
  let fetches = 0;
  const rotating = async () => {
    fetches++;
    return new Response(JSON.stringify({ keys: rotated ? [publicJwk, freshJwk] : [publicJwk] }), { headers: { "cache-control": "max-age=21600" } });
  };
  assert.ok(await verifiedClaims(await token(appCheckClaims()), APP_CHECK, { fetchImpl: rotating, nowMs }));
  rotated = true;
  const signedWithNew = await token(appCheckClaims(), { key: fresh.privateKey, kid: "k2" });
  assert.strictEqual(await verifiedClaims(signedWithNew, APP_CHECK, { fetchImpl: rotating, nowMs: nowMs + 1000 }), null,
    "within the minute the set is not fetched again");
  assert.strictEqual(fetches, 1);
  assert.ok(await verifiedClaims(signedWithNew, APP_CHECK, { fetchImpl: rotating, nowMs: nowMs + 61_000 }),
    "after it, the new key is fetched and the token is good — not six hours later");
  assert.strictEqual(fetches, 2);
  for (const kid of ["x1", "x2", "x3"]) {
    await verifiedClaims(await token(appCheckClaims(), { kid }), APP_CHECK, { fetchImpl: rotating, nowMs: nowMs + 62_000 });
  }
  assert.strictEqual(fetches, 2, "made-up key ids cannot make the Worker call Google on every request");
});

// ── What a genuine caller gets ───────────────────────────────────────────────
await test("the catalogue, for the genuine app", async () => {
  const response = await ask("/api/clips/catalogue");
  assert.strictEqual(response.status, 200);
  assert.deepStrictEqual(await response.json(), CATALOGUE);
  assert.strictEqual(response.headers.get("cache-control"), "private, max-age=3600");
});

await test("a whole clip, private and never cached", async () => {
  const response = await ask("/api/clips/EIeI8Vf.mp4");
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers.get("content-type"), "video/mp4");
  assert.strictEqual(response.headers.get("cache-control"), "private, no-store");
  assert.strictEqual(response.headers.get("etag"), '"r2-etag"');
  assert.strictEqual((await response.arrayBuffer()).byteLength, 1000);
});

await test("a Range request: 206 with the slice and its place", async () => {
  const response = await ask("/api/clips/EIeI8Vf.mp4", { range: "bytes=100-199" });
  assert.strictEqual(response.status, 206);
  assert.strictEqual(response.headers.get("content-range"), "bytes 100-199/1000");
  assert.strictEqual((await response.arrayBuffer()).byteLength, 100);
});

await test("a Range the bucket cannot read: the whole clip, not a 500", async () => {
  const response = await ask("/api/clips/EIeI8Vf.mp4", { range: "bytes=nonsense" });
  assert.strictEqual(response.status, 200);
  assert.strictEqual((await response.arrayBuffer()).byteLength, 1000);
});

await test("an unknown clip: 404", async () => {
  assert.strictEqual((await ask("/api/clips/nothing.mp4")).status, 404);
});

await test("an id that would leave clips/: 400, before anything is read", async () => {
  assert.strictEqual((await ask("/api/clips/..%2Fsecret.mp4")).status, 400);
  assert.strictEqual((await ask("/api/clips/a.b.mp4")).status, 400);
});

await test("only GET", async () => {
  assert.strictEqual((await ask("/api/clips/catalogue", { method: "POST" })).status, 405);
});

// ── How many ─────────────────────────────────────────────────────────────────
await test("past the per-minute limit: 429 with Retry-After", async () => {
  const env = envWith({ CLIP_LIMIT: limiter(2) });
  assert.strictEqual((await ask("/api/clips/EIeI8Vf.mp4", { env })).status, 200);
  assert.strictEqual((await ask("/api/clips/EIeI8Vf.mp4", { env })).status, 200);
  const third = await ask("/api/clips/EIeI8Vf.mp4", { env });
  assert.strictEqual(third.status, 429);
  assert.strictEqual(third.headers.get("retry-after"), "60");
});

await test("the limit counts the signed-in user, not the device or the app", async () => {
  const env = envWith();
  await ask("/api/clips/EIeI8Vf.mp4", { env });
  assert.deepStrictEqual(env.CLIP_LIMIT.keys, ["user-1"]);
});

await test("the catalogue has its own, smaller limit", async () => {
  const env = envWith({ CATALOGUE_LIMIT: limiter(1) });
  assert.strictEqual((await ask("/api/clips/catalogue", { env })).status, 200);
  assert.strictEqual((await ask("/api/clips/catalogue", { env })).status, 429);
  assert.strictEqual((await ask("/api/clips/EIeI8Vf.mp4", { env })).status, 200, "clips are counted apart");
});

await test("no limiter on the account: the genuine app still gets its clip", async () => {
  const env = envWith({ CLIP_LIMIT: undefined });
  assert.strictEqual((await ask("/api/clips/EIeI8Vf.mp4", { env })).status, 200);
});

await test("no bucket bound yet: 503, after the caller was checked", async () => {
  assert.strictEqual((await ask("/api/clips/catalogue", { id: null, env: envWith({ CLIPS: undefined }) })).status, 401);
  assert.strictEqual((await ask("/api/clips/catalogue", { env: envWith({ CLIPS: undefined }) })).status, 503);
});

// ── The upload's catalogue ───────────────────────────────────────────────────
await test("the uploaded catalogue has the contract's shape, sorted by name, unpaired slugs null", () => {
  const made = catalogueFor(
    [{ id: "b", name: "barbell squat", bytes: 2, sha256: "y", file: "/x/b.mp4" },
     { id: "a", name: "barbell bench press", slug: "bench-press", bytes: 1, sha256: "x", file: "/x/a.mp4" }],
    7, "2026-10-13",
  );
  assert.deepStrictEqual(made, { version: 7, clips: [
    { id: "a", name: "barbell bench press", slug: "bench-press", bytes: 1, sha256: "x", updatedAt: "2026-10-13" },
    { id: "b", name: "barbell squat", slug: null, bytes: 2, sha256: "y", updatedAt: "2026-10-13" },
  ] });
});

await test("only the clips the owner approved go up, notes with commas and quotes kept apart", () => {
  const log = parseCsv(
    'sira,medya_id,egzersiz_adi,durum,tarih,exrx_referansi,not\n' +
    '1,7HcfMBP,assisted standing triceps extension (with towel),onaylandi,2026-09-26,X,"partnerli, kamera -60"\n' +
    '2,abc1234,cable curl,bekliyor,2026-10-13,Y,\n' +
    '3,../bad,evil,onaylandi,2026-10-13,Z,\n',
  );
  assert.strictEqual(log[0].not, "partnerli, kamera -60");
  assert.deepStrictEqual(approvedClips(log), [{ id: "7HcfMBP", name: "assisted standing triceps extension (with towel)" }]);
});

await test("a run sends only new clips and re-renders, nothing when the bucket already has them", () => {
  const found = [{ id: "a", sha256: "1" }, { id: "b", sha256: "2" }, { id: "c", sha256: "3" }];
  const held = { clips: [{ id: "a", sha256: "1" }, { id: "b", sha256: "old" }] };
  assert.deepStrictEqual(clipsToUpload(found, held).map((c) => c.id), ["b", "c"]);
  assert.deepStrictEqual(clipsToUpload(found, { clips: found }), []);
  assert.strictEqual(clipsToUpload(found, null).length, 3, "an unreadable bucket gets everything");
});

await test("the upload accepts exactly the ids the Worker serves", () => {
  for (const id of ["EIeI8Vf", "a_b-9"]) assert.ok(isServableId(id), id);
  for (const id of ["../x", "a.b", "", "x".repeat(33)]) assert.ok(!isServableId(id), id);
  const example = JSON.parse(readFileSync(new URL("../clip-slugs.example.json", import.meta.url), "utf8"));
  for (const id of Object.keys(example)) assert.ok(isServableId(id), id);
});

console.log(`clips: ${passed} passed`);

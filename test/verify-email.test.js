// /api/verify-email sends nothing, with or without the key (found 2026-09-16 — see the route in index.js).
// Run: node test/verify-email.test.js
import assert from "node:assert";
import worker from "../index.js";

const sent = [];
const env = {
  ANDROID_API_KEY: "the-key",
  EMAIL: { send: async (mail) => { sent.push(mail); } },
  ASSETS: { fetch: async () => new Response("asset") },
};

for (const key of ["the-key", "", "wrong"]) {
  const request = new Request("https://dogancanyucel.com/api/verify-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key },
    body: JSON.stringify({ email: "victim@example.com", message: "Your account is locked, sign in at evil.example" }),
  });
  const response = await worker.fetch(request, env);
  assert.strictEqual(response.status, 410, `key "${key}" got ${response.status}`);
}
assert.deepStrictEqual(sent, [], "a mail went out");
console.log("verify-email: retired, nothing sent");

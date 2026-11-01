import test from "node:test";
import assert from "node:assert/strict";
import {
  config,
  checkMutation,
  boundedJSON,
  allowedSubject,
  cookieName,
} from "../lib/security.ts";
import { seal, open } from "../lib/store.ts";
import { readFileSync } from "node:fs";
process.env.ADMIN_UI_ORIGIN = "https://admin.example.com";
process.env.ADMIN_UI_OIDC_ISSUER =
  "https://identity.example.com/realms/platform";
process.env.ADMIN_UI_OIDC_CLIENT_ID = "admin-console";
process.env.ADMIN_UI_OIDC_CLIENT_SECRET = "test-secret";
process.env.ADMIN_UI_ALLOWED_SUBJECTS = "operator-1";
process.env.ADMIN_UI_SESSION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.ADMIN_DATABASE_URL = "postgresql://unused";
test("console uses host-only secure cookies and explicit subject allowlist", () => {
  assert.equal(config().secure, true);
  assert.equal(cookieName(), "__Host-admin-console-session");
  assert.equal(allowedSubject("operator-1"), true);
  assert.equal(allowedSubject("admin@example.com"), false);
  const origin = process.env.ADMIN_UI_ORIGIN;
  process.env.ADMIN_UI_ORIGIN = "http://admin.example.com";
  assert.throws(config);
  process.env.ADMIN_UI_ORIGIN = origin;
});
test("mutation requires exact origin and the session CSRF token", () => {
  const request = (origin: string, token: string) =>
    new Request("https://admin.example.com/api/management", {
      headers: { origin, "x-csrf-token": token },
    });
  checkMutation(
    request("https://admin.example.com", "test-token"),
    "test-token",
  );
  for (const r of [
    request("https://evil.example.com", "test-token"),
    request("https://admin.example.com", "bad"),
    request("https://admin.example.com:443/", "test-token"),
  ])
    assert.throws(() => checkMutation(r, "test-token"));
});
test("encrypted sessions hide tokens and reject tampering", () => {
  const encoded = seal({ token: "server-only-secret" });
  assert.ok(!encoded.includes("server-only-secret"));
  assert.deepEqual(open(encoded), { token: "server-only-secret" });
  const bytes = Buffer.from(encoded, "base64");
  bytes[30] ^= 1;
  assert.throws(() => open(bytes.toString("base64")));
});
test("mutation JSON is bounded even without Content-Length", async () => {
  const request = (body: string) =>
    new Request("https://admin.example.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  assert.deepEqual(await boundedJSON(request('{"ok":true}')), { ok: true });
  await assert.rejects(() => boundedJSON(request("x".repeat(16385))));
  await assert.rejects(() => boundedJSON(request("{")));
});
test("Chinese and English message keys stay aligned", () => {
  const flat = (value: Record<string, unknown>, prefix = ""): string[] =>
    Object.entries(value)
      .flatMap(([k, v]) =>
        typeof v === "object"
          ? flat(v as Record<string, unknown>, prefix + k + ".")
          : [prefix + k],
      )
      .sort();
  const en = JSON.parse(
    readFileSync(new URL("../messages/en.json", import.meta.url), "utf8"),
  );
  const zh = JSON.parse(
    readFileSync(new URL("../messages/zh.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(flat(en), flat(zh));
});

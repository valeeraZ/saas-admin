import test from "node:test";
import assert from "node:assert/strict";
import { validateOrigin } from "../src/runtime.ts";
import { operation, suffix } from "../src/contracts.ts";
test("runtime egress policy admits subdomains only on approved HTTPS port", () => {
  process.env.ADMIN_APP_DNS_SUFFIXES = "apps.internal";
  process.env.ADMIN_ALLOWED_APP_ORIGINS = "http://127.0.0.1:59200";
  process.env.ADMIN_ALLOW_LOCAL_HTTP = "true";
  assert.equal(
    validateOrigin("https://reports.apps.internal"),
    "https://reports.apps.internal",
  );
  assert.equal(
    validateOrigin("http://127.0.0.1:59200"),
    "http://127.0.0.1:59200",
  );
  for (const value of [
    "https://apps.internal",
    "https://evilapps.internal",
    "https://reports.apps.internal.evil.test",
    "https://reports.apps.internal:8443",
    "http://reports.apps.internal",
    "https://reports.apps.internal/path",
    "https://user@reports.apps.internal",
    "http://169.254.169.254",
  ])
    assert.throws(() => validateOrigin(value));
});
test("operator schema reserves the public asset namespace and rejects unknown fields", () => {
  assert.equal(suffix.safeParse("/app-assets").success, false);
  assert.equal(
    operation.safeParse({
      kind: "deployment-status",
      deploymentId: "00000000-0000-4000-8000-000000000001",
      status: "pending",
    }).success,
    false,
  );
});

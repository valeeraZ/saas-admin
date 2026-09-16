import { test } from "node:test";
import assert from "node:assert/strict";
import { suffix, operation, catalog } from "../src/contracts.ts";
test("suffix rejects reserved, nested and external paths", () => {
  for (const s of [
    "/api",
    "/tenants",
    "/auth",
    "/a/b",
    "//evil.test",
    "https://evil.test",
    "/a?x",
    "/_next",
  ])
    assert.equal(suffix.safeParse(s).success, false);
  assert.equal(suffix.parse("/reports"), "/reports");
});
test("deployments require an immutable digest and a reviewer", () => {
  const base = {
    kind: "deployment",
    id: "00000000-0000-4000-8000-000000000001",
    appId: "00000000-0000-4000-8000-000000000002",
    digest: "latest",
    reviewer: "",
    ready: true,
  };
  assert.equal(operation.safeParse(base).success, false);
});
test("browser contract rejects internal routing fields", () => {
  assert.equal(
    catalog.safeParse({
      tenantId: "00000000-0000-4000-8000-000000000001",
      items: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Reports",
          description: "",
          suffix: "/reports",
          roles: ["viewer"],
          frontendTarget: "http://internal",
        },
      ],
      nextCursor: null,
    }).success,
    false,
  );
});

test("routes reject targets with credentials, paths or non-HTTP protocols", () => {
  for (const targetOrigin of [
    "file:///etc/passwd",
    "https://user:pass@app.test",
    "https://app.test/path",
    "https://app.test?token=x",
  ]) {
    assert.equal(
      operation.safeParse({
        kind: "route",
        deploymentId: "00000000-0000-4000-8000-000000000001",
        targetOrigin,
      }).success,
      false,
    );
  }
});

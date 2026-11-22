import assert from "node:assert/strict";
import test from "node:test";
import { buildApp } from "../src/app.ts";

test("Admin API preserves Portal authentication and uses the plugin pool", async (t) => {
  const key = "a".repeat(43);
  process.env.ADMIN_PORTAL_KEY = key;
  process.env.ADMIN_AUTH_URL = "https://auth.example.test";
  process.env.ADMIN_DATABASE_URL = "postgresql://unused@127.0.0.1/admin";

  const app = buildApp();
  t.after(() => app.close());
  await app.ready();
  const query = t.mock.method(
    app.pg.pool,
    "query",
    async (..._args: unknown[]) => ({ rows: [] }),
  );

  const ready = await app.inject("/health/ready");
  assert.equal(ready.statusCode, 200);
  assert.deepEqual(ready.json(), { status: "ready" });
  assert.equal(query.mock.callCount(), 3);

  const protectedRoutes = [
    "/v1/catalog",
    "/v1/discovery",
    "/v1/route?suffix=/reports",
    "/v1/runtime-route?suffix=/reports",
    "/v1/runtime/assets?suffix=/reports&version=build",
    "/unknown",
  ];
  for (const url of protectedRoutes) {
    const response = await app.inject(url);
    assert.equal(response.statusCode, 401, url);
    assert.deepEqual(response.json(), { code: "unauthenticated" }, url);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.headers["x-content-type-options"], "nosniff");
  }

  const headers = { "x-portal-key": key };
  const invalid = await app.inject({
    url: "/v1/route?suffix=/reports&suffix=/other",
    headers,
  });
  assert.equal(invalid.statusCode, 400);
  assert.deepEqual(invalid.json(), { code: "invalid_input" });

  const catalog = await app.inject({ url: "/v1/catalog", headers });
  assert.equal(catalog.statusCode, 401);
  assert.deepEqual(catalog.json(), { code: "unauthenticated" });

  const assets = await app.inject({
    url: "/v1/runtime/assets?suffix=/reports&version=build",
    headers,
  });
  assert.equal(assets.statusCode, 404);
  assert.deepEqual(assets.json(), { code: "access_denied" });
  assert.equal(query.mock.callCount(), 4);
  assert.deepEqual(query.mock.calls.at(-1)?.arguments[1], [
    "/reports",
    "build",
  ]);

  const wrongMethod = await app.inject({
    method: "HEAD",
    url: "/v1/catalog",
    headers,
  });
  assert.equal(wrongMethod.statusCode, 404);
});

/** Run against the real local Auth, Keycloak, Portal and Admin services. */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { apply, pool } from "../src/db.ts";
const portal = process.env.PORTAL_SOURCE!;
function envFile(path: string) {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .trim()
      .split("\n")
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}
Object.assign(process.env, envFile(portal + "/.env.local"));
const { chromium } = await import(
  pathToFileURL(portal + "/node_modules/playwright/index.mjs").href
);
const { get, close } = await import(
  pathToFileURL(portal + "/lib/store.ts").href
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PORTAL_CHROMIUM,
});
const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
const page = await ctx.newPage();
const errors: string[] = [];
page.on("pageerror", () => errors.push("runtime error"));
page.on("console", (message: { type: () => string }) => {
  if (["error", "warning"].includes(message.type()))
    errors.push("console issue");
});
const origin = process.env.PORTAL_ORIGIN!;
const tag = randomUUID().slice(0, 8);
const local = envFile(portal + "/.local/auth-config/.env");
async function command(body: unknown, key = randomUUID()) {
  await apply(body, key, "integration-test");
}
try {
  await page.goto(origin);
  await page.getByRole("link", { name: "登录 / 注册", exact: true }).click();
  await page.locator('input[name="username"]').fill("local-user");
  await page
    .locator('input[name="password"]')
    .fill(local.SAAS_LOCAL_USER_PASSWORD);
  await page.locator('button[type="submit"],input[type="submit"]').click();
  await page.waitForURL(origin + "/");
  await page.getByRole("heading", { name: /欢迎/ }).waitFor();
  const cookie = (await ctx.cookies()).find(
    (c: { name: string }) => c.name === "__Host-portal-session",
  );
  const s = await get(cookie.value);
  assert.ok(s);
  async function auth(
    path: string,
    method = "GET",
    body?: unknown,
    etag?: string,
  ) {
    const r = await fetch(process.env.PORTAL_AUTH_URL + path, {
      method,
      headers: {
        authorization: `Bearer ${s.accessToken}`,
        "content-type": "application/json",
        "Idempotency-Key": randomUUID(),
        ...(etag ? { "If-Match": etag } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    assert.ok(r.ok, `Auth ${method} failed ${r.status}`);
    return r.status === 204 ? null : r.json();
  }
  const me = await auth("/v1/me");
  const a = await auth("/v1/tenants", "POST", {
    name: "Catalog A " + tag,
    slug: "catalog-a-" + tag,
  });
  const b = await auth("/v1/tenants", "POST", {
    name: "Catalog B " + tag,
    slug: "catalog-b-" + tag,
  });
  const app = {
    kind: "app",
    id: randomUUID(),
    name: "Reports " + tag,
    description: "Tenant reports",
    suffix: "/reports-" + tag,
    active: true,
  };
  const deployment = {
    kind: "deployment",
    id: randomUUID(),
    appId: app.id,
    digest: "sha256:" + randomUUID().replaceAll("-", "").repeat(2),
    reviewer: "integration-reviewer",
    ready: true,
  };
  const install = {
    kind: "installation",
    tenantId: a.id,
    appId: app.id,
    deploymentId: deployment.id,
    enabled: true,
    entitled: true,
    validUntil: "2099-01-01T00:00:00Z",
  };
  const key = randomUUID();
  await Promise.all([command(app, key), command(app, key)]);
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) FROM catalog_operations WHERE key=$1",
          [key],
        )
      ).rows[0].count,
    ),
    1,
  );
  await assert.rejects(command({ ...app, name: "conflict" }, key));
  await command(deployment);
  const badKey = randomUUID();
  await assert.rejects(command({ ...install, appId: randomUUID() }, badKey));
  assert.equal(
    (
      await pool.query("SELECT 1 FROM catalog_operations WHERE key=$1", [
        badKey,
      ])
    ).rowCount,
    0,
  );
  await command(install);
  await assert.rejects(
    command({ ...deployment, digest: "sha256:" + "f".repeat(64) }),
  );
  async function catalog(tenant = a.id, withKey = true) {
    return fetch(`http://127.0.0.1:59100/v1/tenants/${tenant}/catalog`, {
      headers: {
        authorization: `Bearer ${s.accessToken}`,
        ...(withKey ? { "x-portal-key": process.env.ADMIN_PORTAL_KEY! } : {}),
      },
    });
  }
  async function items(tenant = a.id) {
    const r = await catalog(tenant);
    assert.equal(r.status, 200);
    return (await r.json()).items;
  }
  assert.equal((await catalog(a.id, false)).status, 401);
  assert.equal((await catalog(randomUUID())).status, 404);
  assert.deepEqual(await items(), []);
  const role = await auth(`/v1/tenants/${a.id}/apps/${app.id}/roles`, "POST", {
    key: "viewer",
    description: "View reports",
  });
  const assignment = await auth(
    `/v1/tenants/${a.id}/role-assignments`,
    "POST",
    { userId: me.user.id, roleId: role.id },
  );
  assert.equal((await items())[0].id, app.id);
  assert.deepEqual(await items(b.id), []);

  async function replica(authUrl = process.env.ADMIN_AUTH_URL!) {
    const child = spawn(process.execPath, ["src/server.ts"], {
      env: { ...process.env, PORT: "59102", ADMIN_AUTH_URL: authUrl },
      stdio: ["ignore", "pipe", "pipe"],
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Replica startup timeout")),
        10000,
      );
      child.once("exit", () => {
        clearTimeout(timer);
        reject(Error("Replica exited"));
      });
      child.stdout.once("data", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    return child;
  }
  for (let n = 0; n < 2; n++) {
    const child = await replica();
    try {
      const r = await fetch(
        `http://127.0.0.1:59102/v1/tenants/${a.id}/catalog`,
        {
          headers: {
            authorization: `Bearer ${s.accessToken}`,
            "x-portal-key": process.env.ADMIN_PORTAL_KEY!,
          },
        },
      );
      assert.equal(r.status, 200);
      assert.equal((await r.json()).items[0].id, app.id);
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    }
  }
  const broken = await replica("http://127.0.0.1:59998");
  try {
    const r = await fetch(`http://127.0.0.1:59102/v1/tenants/${a.id}/catalog`, {
      headers: {
        authorization: `Bearer ${s.accessToken}`,
        "x-portal-key": process.env.ADMIN_PORTAL_KEY!,
      },
    });
    assert.equal(r.status, 503);
    assert.equal((await r.json()).items, undefined);
  } finally {
    broken.kill("SIGTERM");
    await new Promise((resolve) => broken.once("exit", resolve));
  }
  console.log(
    "PASS restart persistence and Auth outage fails closed without stale catalog",
  );
  await page.goto(origin + "/tenants/" + a.id);
  await page.getByRole("heading", { name: app.name }).waitFor();
  assert.equal(await page.title(), "SaaS Portal");
  assert.ok(!(await page.content()).includes("frontendTarget"));
  await page.screenshot({
    path: "/private/tmp/portal-admin-catalog.png",
    fullPage: true,
  });
  assert.equal(await page.locator("nextjs-portal").count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/private/tmp/portal-admin-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.setViewportSize({ width: 1280, height: 720 });
  const tab = await ctx.newPage();
  await tab.goto(origin + "/tenants/" + b.id);
  await tab.getByText("暂无可用应用。", { exact: false }).waitFor();
  assert.ok(page.url().endsWith(a.id));
  const filler = [];
  for (let n = 1; n <= 50; n++) {
    const id = `00000000-0000-4000-8000-${tag + String(n).padStart(4, "0")}`;
    const fillerApp = {
      ...app,
      id,
      name: `No role ${n}`,
      suffix: `/no-role-${tag}-${n}`,
    };
    const fillerDeployment = {
      ...deployment,
      id: `00000000-0000-4000-9000-${tag + String(n).padStart(4, "0")}`,
      appId: id,
    };
    const entry = { ...install, appId: id, deploymentId: fillerDeployment.id };
    await command(fillerApp);
    await command(fillerDeployment);
    await command(entry);
    filler.push(entry);
  }
  const first = await (await catalog()).json();
  assert.deepEqual(first.items, []);
  assert.ok(first.nextCursor);
  await page.reload();
  await page.getByRole("button", { name: "加载更多应用" }).click();
  await page.getByRole("heading", { name: app.name }).waitFor();
  for (const entry of filler) await command({ ...entry, enabled: false });
  console.log(
    "PASS bounded pagination scans role-filtered pages and Portal loads authorized next page",
  );
  console.log(
    "PASS real Auth roles + Admin catalog + Portal render + tenant isolation + machine authentication",
  );
  for (const patch of [
    { enabled: false },
    { entitled: false },
    { validUntil: "2000-01-01T00:00:00Z" },
  ]) {
    await command({ ...install, ...patch });
    assert.deepEqual(await items(), []);
    await command(install);
  }
  await command({ ...deployment, ready: false });
  assert.deepEqual(await items(), []);
  await command(deployment);
  await command({ ...app, active: false });
  assert.deepEqual(await items(), []);
  await page.reload();
  await page.getByText("暂无可用应用。", { exact: false }).waitFor();
  await command(app);
  console.log(
    "PASS disabled app, unready deployment, disabled installation, expired/revoked entitlement deny immediately",
  );
  await auth(
    `/v1/tenants/${a.id}/role-assignments/${assignment.id}`,
    "DELETE",
    undefined,
    '"1"',
  );
  assert.deepEqual(await items(), []);
  await page.reload();
  await page.getByText("暂无可用应用。", { exact: false }).waitFor();
  console.log("PASS real Auth role revocation removes Portal application");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/private/tmp/portal-admin-empty-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS real PostgreSQL concurrent idempotency, immutable deployment review and responsive browser",
  );
  // Membership/tenant state is still required even when no installations remain visible.
  const latest = await auth(`/v1/tenants/${a.id}`);
  await auth(
    `/v1/tenants/${a.id}`,
    "PATCH",
    { status: "suspended" },
    JSON.stringify(String(latest.version)),
  );
  assert.equal((await catalog()).status, 403);
  console.log("PASS suspended tenant rejected by online Auth context");
} finally {
  await browser.close();
  await close();
  await pool.end();
}

/** Real Keycloak/PostgreSQL acceptance; run via integration/console.py. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { chromium } from "playwright";
import { withSession, remove } from "../lib/store.ts";
import { pool } from "../../src/db.ts";
const origin = process.env.ADMIN_UI_ORIGIN!,
  work = process.env.CONSOLE_TEST_WORK!;
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CONSOLE_CHROMIUM,
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage(),
  errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
let paused = false;
async function login(username: string, ctx = context) {
  const tab = await ctx.newPage();
  await tab.goto(origin + "/en/login");
  await tab.getByRole("link", { name: "Sign in with Keycloak" }).click();
  await tab.locator('input[name="username"]').fill(username);
  await tab
    .locator('input[name="password"]')
    .fill(process.env.CONSOLE_TEST_PASSWORD!);
  await tab.locator('button[type="submit"],input[type="submit"]').click();
  return tab;
}
try {
  assert.equal(
    (
      await context.request.get(
        origin + "/api/management?resource=applications",
      )
    ).status(),
    401,
  );
  const authenticated = await login("operator");
  await authenticated.waitForURL(origin + "/en/applications");
  await authenticated.close();
  await page.goto(origin + "/en/applications");
  await page
    .getByRole("heading", { name: "Applications", exact: true })
    .waitFor();
  await page.keyboard.press("Control+k");
  const navigationDialog = page.getByRole("dialog", { name: "Go to page" });
  await navigationDialog.getByRole("combobox").fill("audit");
  await navigationDialog.getByRole("option", { name: "Audit log" }).click();
  await page.getByRole("heading", { name: "Audit log", exact: true }).waitFor();
  await page
    .getByRole("link", { name: "Access requests", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Access requests", exact: true })
    .waitFor();
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  const filteredRequests = page.waitForResponse(
    (response) => response.url() === origin + "/api/requests?status=all",
  );
  await page.getByRole("option", { name: "All requests", exact: true }).click();
  assert.equal((await filteredRequests).status(), 200);
  await page.getByText("No access requests match this status.").waitFor();
  await page.getByRole("link", { name: "Applications", exact: true }).click();

  await page.getByRole("button", { name: "Navigation", exact: true }).click();
  const sidebar = page.locator('[data-slot="sidebar"][data-state]');
  assert.equal(await sidebar.getAttribute("data-state"), "collapsed");
  await page.reload();
  assert.equal(await sidebar.getAttribute("data-state"), "collapsed");
  await page.getByRole("button", { name: "Navigation", exact: true }).click();

  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).click();
  await page.locator("html.dark").waitFor();
  await page.reload();
  await page.locator("html.dark").waitFor();
  await page.screenshot({
    path: join(work, "applications-dark.png"),
    animations: "disabled",
  });
  await page.getByRole("button", { name: "Appearance", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Light", exact: true }).click();
  await page.locator("html.light").waitFor();
  console.log("PASS navigation search, persisted sidebar and appearance");
  const cookie = (await context.cookies()).find(
    (c) => c.name === "admin-console-session",
  )!;
  const session = await withSession(cookie.value, async (s) => s);
  assert.ok(session);
  await withSession(cookie.value, async (s) => ({ ...s, tokenExpires: 0 }));
  const refreshed = await Promise.all([
    context.request.get(origin + "/api/management?resource=applications"),
    context.request.get(origin + "/api/management?resource=applications"),
  ]);
  assert.ok(refreshed.every((r) => r.status() === 200));
  assert.ok(
    (await withSession(cookie.value, async (s) => s))!.tokenExpires >
      Date.now(),
  );
  const headers = {
    origin,
    "content-type": "application/json",
    "x-csrf-token": session.csrf,
    "idempotency-key": randomUUID(),
  };
  async function api(body: unknown, key = randomUUID()) {
    const r = await context.request.post(origin + "/api/management", {
      headers: { ...headers, "idempotency-key": key },
      data: body,
    });
    return { status: r.status(), body: await r.json() };
  }
  async function read(resource: string) {
    const r = await context.request.get(
      origin + "/api/management?resource=" + resource,
    );
    assert.equal(r.status(), 200);
    return (await r.json()).items;
  }
  for (const [name, description, mount] of [
    ["Reports", "Reporting for application activity and usage.", "/reports"],
    [
      "Next Reports",
      "Operational reports for the next platform.",
      "/next-reports",
    ],
    [
      "Next Metrics",
      "Metrics and insights for the next platform.",
      "/next-metrics",
    ],
  ]) {
    await page
      .getByRole("button", { name: "New application", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill(name);
    await dialog.locator("#field-description").fill(description);
    await dialog.getByLabel("Mount", { exact: true }).fill(mount);
    for (const key of ["viewer", "editor"]) {
      await dialog
        .getByRole("button", { name: "Add role", exact: true })
        .click();
      const i = key === "viewer" ? 0 : 1;
      await dialog.locator("#role-key-" + i).fill(key);
      await dialog
        .locator("#role-name-" + i)
        .fill(key === "viewer" ? "Viewer" : "Editor");
    }
    await dialog
      .getByRole("button", { name: "Create application", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByText(name, { exact: true }).waitFor();
  }
  const apps = await read("applications"),
    app = apps.find((r: { name: string }) => r.name === "Reports");
  assert.ok(app);
  const metrics = apps.find((r: { name: string }) => r.name === "Next Metrics");
  assert.equal(
    (
      await api({
        kind: "app",
        id: metrics.id,
        name: metrics.name,
        description: metrics.description,
        suffix: metrics.suffix,
        active: false,
      })
    ).status,
    200,
  );
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await page.getByText("Inactive", { exact: true }).waitFor();
  await page.screenshot({
    path: join(work, "applications-desktop.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "New application", exact: true })
    .click();
  await page.getByRole("dialog").screenshot({
    path: join(work, "application-dialog.png"),
    animations: "disabled",
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  const appRow = page
    .getByRole("row")
    .filter({ has: page.getByText("Reports", { exact: true }) });
  await appRow.getByRole("button", { name: "Edit", exact: true }).click();
  assert.equal(
    await page.getByLabel("Mount", { exact: true }).getAttribute("readonly"),
    "",
  );
  await page
    .locator("#field-description")
    .fill("Updated using the operator console.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const duplicateKey = randomUUID(),
    body = {
      kind: "app",
      id: app.id,
      name: app.name,
      description: "Idempotent update",
      suffix: app.suffix,
      active: true,
    };
  assert.equal((await api(body, duplicateKey)).status, 200);
  assert.equal((await api(body, duplicateKey)).status, 200);
  assert.equal(
    (
      await pool.query(
        "SELECT count(*)::int AS count FROM catalog_operations WHERE key=$1",
        [duplicateKey],
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (await api({ ...body, name: "Different" }, duplicateKey)).status,
    409,
  );
  assert.equal((await api({ ...body, suffix: "/changed" })).status, 409);
  assert.equal((await api({ ...body, actor: "forged-operator" })).status, 400);
  assert.equal(
    (
      await context.request.post(origin + "/api/management", {
        headers: { ...headers, "x-csrf-token": "bad" },
        data: body,
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await context.request.post(origin + "/api/management", {
        headers: { ...headers, origin: "https://evil.example.com" },
        data: body,
      })
    ).status(),
    403,
  );
  console.log(
    "PASS real operator login, bilingual-ready persisted applications, immutable mount, audit actor, CSRF and idempotency",
  );
  await appRow
    .getByRole("button", { name: "Manage access", exact: true })
    .click();
  let access = page.getByRole("dialog");
  await access.getByLabel("User", { exact: true }).click();
  await page
    .getByRole("option", { name: "Example Member · member@example.test" })
    .click();
  await access.getByLabel("Viewer", { exact: true }).check();
  await access.getByLabel("Editor", { exact: true }).check();
  await access
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await access
    .getByRole("row")
    .filter({ hasText: "Example Member" })
    .getByText("editor, viewer", { exact: true })
    .waitFor();
  const accessBody = {
    appId: app.id,
    userId: process.env.CONSOLE_TEST_USER_ID,
    roles: ["viewer"],
    enabled: false,
  };
  assert.equal(
    (
      await context.request.post(origin + "/api/access", {
        headers: { ...headers, "x-csrf-token": "bad" },
        data: accessBody,
      })
    ).status(),
    403,
  );
  assert.equal(
    (
      await context.request.post(origin + "/api/access", {
        headers: { ...headers, "idempotency-key": randomUUID() },
        data: { ...accessBody, actor: "forged" },
      })
    ).status(),
    400,
  );
  assert.equal(
    (
      await context.request.post(origin + "/api/access", {
        headers: { ...headers, "idempotency-key": randomUUID() },
        data: accessBody,
      })
    ).status(),
    200,
  );
  const accessResult = await context.request.get(
    origin + "/api/access?kind=grants&appId=" + app.id,
  );
  const savedGrant = (await accessResult.json()).items[0];
  assert.equal(savedGrant.enabled, false);
  assert.equal(
    (
      await context.request.get(
        origin + "/api/access?kind=users&appId=" + app.id,
      )
    ).status(),
    200,
  );
  await page.keyboard.press("Escape");
  console.log(
    "PASS real Auth user grant through console UI, revocation, CSRF and forged audit actor rejection",
  );
  await page.getByRole("link", { name: "Deployments", exact: true }).click();
  await page
    .getByRole("button", { name: "Register deployment", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Application ID", { exact: true }).fill(app.id);
  await dialog
    .getByLabel("Target origin", { exact: true })
    .fill("https://reports.apps.internal");
  await dialog
    .getByLabel("Artifact digest", { exact: true })
    .fill("sha256:" + "a".repeat(64));
  await dialog
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Pending", { exact: true }).waitFor();
  const deployment = (await read("deployments"))[0];
  const installation = {
    kind: "publication",
    appId: app.id,
    deploymentId: deployment.id,
    enabled: true,
    entitled: true,
    validUntil: "2030-01-01T00:00:00Z",
  };
  assert.equal((await api(installation)).status, 409);
  await page
    .getByRole("button", { name: "Approve deployment", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("switch").check();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Ready", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Publications", exact: true }).click();
  await page
    .getByRole("button", { name: "Add publication", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Application ID", { exact: true }).fill(app.id);
  await dialog.getByLabel("Deployment ID", { exact: true }).fill(deployment.id);
  await dialog
    .getByLabel("Access expires", { exact: true })
    .fill("2030-01-01T00:00");
  await dialog
    .getByLabel("I have verified this operation and its impact.")
    .check();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("cell", { name: deployment.id, exact: true }).waitFor();
  const replacement = randomUUID();
  assert.equal(
    (
      await api({
        kind: "runtime-deployment",
        id: replacement,
        appId: app.id,
        digest: "sha256:" + "b".repeat(64),
        targetOrigin: "https://reports.apps.internal",
        runtime: "http",
        assetVersion: null,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await api({
        kind: "deployment-status",
        deploymentId: replacement,
        status: "ready",
      })
    ).status,
    200,
  );
  await page.getByRole("link", { name: "Deployments", exact: true }).click();
  const oldRow = page.getByRole("row").filter({ hasText: deployment.id });
  await oldRow
    .getByRole("button", { name: "Replace deployment", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Replacement deployment", { exact: true })
    .fill(replacement);
  await dialog.getByRole("switch").check();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Retired", { exact: true }).waitFor();
  assert.equal((await read("publications"))[0].deploymentId, replacement);
  const nextRow = page.getByRole("row").filter({ hasText: replacement });
  await nextRow
    .getByRole("button", { name: "Revoke deployment", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("switch").check();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByText("Revoked", { exact: true }).waitFor();
  assert.equal(
    (
      await api({
        kind: "deployment-status",
        deploymentId: replacement,
        status: "ready",
      })
    ).status,
    409,
  );
  console.log(
    "PASS UI deployment registration/approval, publication, atomic replacement/retention and terminal revocation",
  );
  await page.getByRole("link", { name: "Audit log", exact: true }).click();
  await page.getByRole("heading", { name: "Audit log", exact: true }).waitFor();
  assert.ok(
    (await read("audit")).every(
      (r: { actor: string }) => r.actor === `oidc:${session.sub}`,
    ),
  );
  await page.getByRole("link", { name: "中文", exact: true }).click();
  await page.getByRole("heading", { name: "审计记录", exact: true }).waitFor();
  await page.getByRole("link", { name: "应用", exact: true }).click();
  await page.getByRole("heading", { name: "应用", exact: true }).waitFor();
  await page.getByRole("button", { name: "新建应用", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "取消", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: join(work, "applications-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  const mobileTable = page.getByRole("region", { name: "应用", exact: true });
  await mobileTable.focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('[data-slot="table-container"]')).some(
      (table) => table.scrollLeft > 0,
    ),
  );
  await page.getByRole("button", { name: "导航", exact: true }).click();
  await page.getByRole("link", { name: "部署", exact: true }).click();
  await page.getByRole("heading", { name: "部署", exact: true }).waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS English/Chinese switching, localized dialogs, desktop/mobile layout and no browser runtime errors",
  );
  const outsiderContext = await browser.newContext({ ignoreHTTPSErrors: true });
  const outsider = await login("outsider", outsiderContext);
  await outsider.waitForURL(/error=forbidden/);
  assert.equal(
    (
      await outsiderContext.request.get(
        origin + "/api/management?resource=applications",
      )
    ).status(),
    401,
  );
  await outsiderContext.close();
  execFileSync("docker", ["pause", process.env.CONSOLE_TEST_KEYCLOAK!], {
    stdio: "ignore",
  });
  paused = true;
  assert.equal(
    (
      await context.request.get(
        origin + "/api/management?resource=applications",
      )
    ).status(),
    503,
  );
  assert.equal((await api(body)).status, 503);
  execFileSync("docker", ["unpause", process.env.CONSOLE_TEST_KEYCLOAK!], {
    stdio: "ignore",
  });
  paused = false;
  assert.equal(
    (
      await context.request.get(
        origin + "/api/management?resource=applications",
      )
    ).status(),
    200,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: /账号菜单/ }).click();
  const logoutResponse = page.waitForResponse(
    (response) =>
      response.url() === origin + "/api/auth/logout?locale=zh" &&
      response.request().method() === "POST",
  );
  await page.getByRole("menuitem", { name: "退出登录", exact: true }).click();
  assert.equal((await logoutResponse).status(), 200);
  await page.waitForURL(origin + "/zh/login");
  await remove(cookie.value);
  assert.equal(
    (
      await context.request.get(
        origin + "/api/management?resource=applications",
      )
    ).status(),
    401,
  );
  console.log(
    "PASS unapproved identity, IdP outage/recovery and session revocation deny reads/writes",
  );
} finally {
  if (paused)
    execFileSync("docker", ["unpause", process.env.CONSOLE_TEST_KEYCLOAK!], {
      stdio: "ignore",
    });
  await browser.close();
  await pool.end();
}

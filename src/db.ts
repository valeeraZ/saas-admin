import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { applyRuntime } from "./runtime.ts";
import { operation } from "./contracts.ts";
export const pool = new Pool({
  connectionString: process.env.ADMIN_DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 3000,
  statement_timeout: 5000,
});
export async function migrate() {
  for (const file of [
    "001_catalog.sql",
    "002_routing.sql",
    "003_runtime_registry.sql",
    "004_console_sessions.sql",
  ])
    await pool.query(
      readFileSync(new URL("../migrations/" + file, import.meta.url), "utf8"),
    );
}
export async function apply(input: unknown, key: string, actor: string) {
  const body = operation.parse(input);
  if (
    !/^[A-Za-z0-9_-]{16,128}$/.test(key) ||
    !actor.trim() ||
    actor.length > 200
  )
    throw Error("Valid operation key and actor required");
  const hash = createHash("sha256")
    .update(JSON.stringify({ body, actor }))
    .digest("hex");
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const inserted = await c.query(
      "INSERT INTO catalog_operations(key,hash,actor,body) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING key",
      [key, hash, actor, body],
    );
    if (!inserted.rowCount) {
      const old = await c.query(
        "SELECT hash FROM catalog_operations WHERE key=$1",
        [key],
      );
      if (old.rows[0].hash !== hash) throw Error("Idempotency conflict");
      await c.query("COMMIT");
      return;
    }
    // Serialize operator mutations across replicas, including namespace ownership
    // and legacy operations. Reads continue under PostgreSQL MVCC.
    await c.query("SELECT pg_advisory_xact_lock(724193810)");
    await applyRuntime(c, body, actor);
    if (body.kind === "route" || body.kind === "deployment") {
      const managed = await c.query(
        "SELECT 1 FROM runtime_deployments WHERE deployment_id=$1",
        [body.kind === "route" ? body.deploymentId : body.id],
      );
      if (managed.rowCount)
        throw Error(
          "Use runtime deployment operations for managed deployments",
        );
    }
    if (body.kind === "app") {
      const existing = await c.query(
        "SELECT suffix FROM app_definitions WHERE id=$1",
        [body.id],
      );
      if (existing.rowCount && existing.rows[0].suffix !== body.suffix)
        throw Error("Application mount is immutable");
    }
    if (body.kind === "installation" && body.enabled) {
      const state = await c.query(
        "SELECT status FROM runtime_deployments WHERE deployment_id=$1",
        [body.deploymentId],
      );
      if (state.rowCount && state.rows[0].status !== "ready")
        throw Error("Deployment is not ready");
    }
    if (body.kind === "route") {
      const origin = new URL(body.targetOrigin).origin;
      const allowed = (process.env.ADMIN_ALLOWED_APP_ORIGINS ?? "")
        .split(",")
        .filter(Boolean);
      if (!allowed.includes(origin))
        throw Error("Target origin is not operator-allowlisted");
      const result = await c.query(
        "INSERT INTO deployment_routes(deployment_id,target_origin) VALUES($1,$2) ON CONFLICT(deployment_id) DO UPDATE SET target_origin=excluded.target_origin WHERE deployment_routes.target_origin=excluded.target_origin RETURNING deployment_id",
        [body.deploymentId, origin],
      );
      if (!result.rowCount)
        throw Error("Route is immutable; review a new deployment");
    }
    if (body.kind === "app")
      await c.query(
        "INSERT INTO app_definitions(id,name,description,suffix,active) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,suffix=excluded.suffix,active=excluded.active",
        [body.id, body.name, body.description, body.suffix, body.active],
      );
    if (body.kind === "deployment") {
      const r = await c.query(
        "INSERT INTO deployments(id,app_id,digest,reviewer,ready) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO UPDATE SET ready=excluded.ready WHERE deployments.app_id=excluded.app_id AND deployments.digest=excluded.digest AND deployments.reviewer=excluded.reviewer RETURNING id",
        [body.id, body.appId, body.digest, body.reviewer, body.ready],
      );
      if (!r.rowCount)
        throw Error("Deployment review is immutable; create a new deployment");
    }
    if (body.kind === "installation")
      await c.query(
        "INSERT INTO installations(tenant_id,app_id,deployment_id,enabled,entitled,valid_until) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(tenant_id,app_id) DO UPDATE SET deployment_id=excluded.deployment_id,enabled=excluded.enabled,entitled=excluded.entitled,valid_until=excluded.valid_until",
        [
          body.tenantId,
          body.appId,
          body.deploymentId,
          body.enabled,
          body.entitled,
          body.validUntil,
        ],
      );
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

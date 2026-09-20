import type { PoolClient } from "pg";
import type { z } from "zod";
import type { operation } from "./contracts.ts";

export function validateOrigin(value: string) {
  const u = new URL(value);
  const exact = (process.env.ADMIN_ALLOWED_APP_ORIGINS ?? "").split(",");
  const domains = (process.env.ADMIN_APP_DNS_SUFFIXES ?? "")
    .split(",")
    .filter(Boolean);
  const domainAllowed =
    u.protocol === "https:" &&
    !u.port &&
    domains.some(
      (d) =>
        /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(d) && u.hostname.endsWith("." + d),
    );
  if (
    (!exact.includes(u.origin) && !domainAllowed) ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash ||
    (u.protocol !== "https:" &&
      !(
        process.env.ADMIN_ALLOW_LOCAL_HTTP === "true" &&
        u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname)
      ))
  )
    throw Error("Origin violates infrastructure egress policy");
  return u.origin;
}
export async function applyRuntime(
  c: PoolClient,
  body: z.infer<typeof operation>,
  actor: string,
) {
  if (body.kind === "runtime-deployment") {
    if ((body.runtime === "nextjs") !== (body.assetVersion !== null))
      throw Error("Next.js requires an asset version; HTTP must not have one");
    const origin = validateOrigin(body.targetOrigin);
    const app = (
      await c.query(
        "SELECT suffix FROM app_definitions WHERE id=$1 FOR UPDATE",
        [body.appId],
      )
    ).rows[0];
    if (!app) throw Error("Unknown application");
    // A fresh immutable identity also prevents adoption of legacy, unreviewed routes.
    await c.query(
      "INSERT INTO deployments(id,app_id,digest,reviewer,ready) VALUES($1,$2,$3,$4,false)",
      [body.id, body.appId, body.digest, actor],
    );
    await c.query(
      "INSERT INTO deployment_routes(deployment_id,target_origin) VALUES($1,$2)",
      [body.id, origin],
    );
    await c.query(
      "INSERT INTO runtime_deployments(deployment_id,app_id,mount,runtime,asset_version) VALUES($1,$2,$3,$4,$5)",
      [body.id, body.appId, app.suffix, body.runtime, body.assetVersion],
    );
  }
  if (body.kind === "deployment-status") {
    const record = (
      await c.query(
        "SELECT status FROM runtime_deployments WHERE deployment_id=$1 FOR UPDATE",
        [body.deploymentId],
      )
    ).rows[0];
    if (
      !record ||
      (body.status === "ready" && !["pending", "ready"].includes(record.status))
    )
      throw Error(
        "Invalid deployment transition; retired/revoked identities cannot reactivate",
      );
    await c.query(
      "UPDATE runtime_deployments SET status=$2,assets_until=NULL WHERE deployment_id=$1",
      [body.deploymentId, body.status],
    );
    if (body.status === "ready" && record.status === "pending")
      await c.query(
        "UPDATE deployments SET reviewer=$2,reviewed_at=now() WHERE id=$1",
        [body.deploymentId, actor],
      );
    await c.query("UPDATE deployments SET ready=$2 WHERE id=$1", [
      body.deploymentId,
      body.status === "ready",
    ]);
  }
  if (body.kind === "replace-deployment") {
    const rows = (
      await c.query(
        "SELECT * FROM runtime_deployments WHERE deployment_id=ANY($1::uuid[]) ORDER BY deployment_id FOR UPDATE",
        [[body.deploymentId, body.replacementId]],
      )
    ).rows;
    const old = rows.find((r) => r.deployment_id === body.deploymentId);
    const next = rows.find((r) => r.deployment_id === body.replacementId);
    if (
      !old ||
      !next ||
      old === next ||
      old.status !== "ready" ||
      next.status !== "ready" ||
      old.app_id !== next.app_id ||
      old.mount !== next.mount
    )
      throw Error(
        "Replacement requires two ready deployments of the same application",
      );
    const future = await c.query("SELECT $1::timestamptz > now() AS valid", [
      body.assetsUntil,
    ]);
    if (!future.rows[0].valid)
      throw Error("Compatibility window must end in the future");
    await c.query(
      "UPDATE installations SET deployment_id=$2 WHERE deployment_id=$1",
      [body.deploymentId, body.replacementId],
    );
    await c.query(
      "UPDATE runtime_deployments SET status='retired',assets_until=$2 WHERE deployment_id=$1",
      [body.deploymentId, body.assetsUntil],
    );
    await c.query("UPDATE deployments SET ready=false WHERE id=$1", [
      body.deploymentId,
    ]);
  }
}

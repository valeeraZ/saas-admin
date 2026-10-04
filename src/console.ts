/** Operator-only read models. Never exposed by the Portal-facing service. */
import { z } from "zod";
import { pool } from "./db.ts";
export const resources = [
  "applications",
  "deployments",
  "installations",
  "audit",
] as const;
export type Resource = (typeof resources)[number];
export const consoleQuery = z.object({
  resource: z.enum(resources),
  q: z.string().max(200).default(""),
  cursor: z.string().max(300).default(""),
});
const models: Record<
  Resource,
  { select: string; from: string; key: string; search: string }
> = {
  applications: {
    select: `a.id,a.name,a.description,a.suffix,a.active,
      (SELECT count(*)::int FROM deployments WHERE app_id=a.id) AS "deploymentCount"`,
    from: "app_definitions a",
    key: "a.id::text",
    search: "a.name || ' ' || a.suffix || ' ' || a.id::text",
  },
  deployments: {
    select: `d.id,d.app_id AS "appId",a.name AS "appName",a.suffix,d.digest,
      d.reviewer,d.reviewed_at AS "reviewedAt",r.target_origin AS "targetOrigin",
      rt.runtime,rt.asset_version AS "assetVersion",rt.assets_until AS "assetsUntil",
      COALESCE(rt.status,CASE WHEN d.ready THEN 'ready' ELSE 'pending' END) AS status,
      (rt.deployment_id IS NOT NULL) AS managed`,
    from: "deployments d JOIN app_definitions a ON a.id=d.app_id LEFT JOIN runtime_deployments rt ON rt.deployment_id=d.id LEFT JOIN deployment_routes r ON r.deployment_id=d.id",
    key: "d.id::text",
    search: "d.id::text || ' ' || a.name || ' ' || d.app_id::text",
  },
  installations: {
    select: `i.tenant_id AS "tenantId",i.app_id AS "appId",i.deployment_id AS "deploymentId",
      a.name AS "appName",i.enabled,i.entitled,i.valid_until AS "validUntil",
      (i.valid_until>now()) AS current`,
    from: "installations i JOIN app_definitions a ON a.id=i.app_id",
    key: "i.tenant_id::text || ':' || i.app_id::text",
    search: "i.tenant_id::text || ' ' || a.name || ' ' || i.app_id::text",
  },
  audit: {
    select: `o.key,o.actor,o.body,o.created_at AS "createdAt"`,
    from: "catalog_operations o",
    key: "o.key",
    search: "o.actor || ' ' || (o.body->>'kind') || ' ' || o.key",
  },
};
export async function readConsole(input: unknown) {
  const { resource, q, cursor } = consoleQuery.parse(input);
  const m = models[resource];
  // SQL fragments come only from this static model map; all browser values are parameters.
  const rows = await pool.query(
    `SELECT ${m.select},${m.key} AS "rowKey" FROM ${m.from}
     WHERE (${m.key})>$1 AND (${m.search}) ILIKE $2
     ORDER BY (${m.key}) LIMIT 51`,
    [cursor, "%" + q + "%"],
  );
  return {
    items: rows.rows.slice(0, 50),
    nextCursor: rows.rows.length > 50 ? rows.rows[49].rowKey : null,
  };
}

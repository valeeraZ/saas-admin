import { pool } from "./db.ts";
import { settings } from "./config.ts";
import {
  context,
  permissions,
  catalog,
  resolvedRoute,
  runtimeRoute,
  runtimeMetadata,
} from "./contracts.ts";
export class ApiError extends Error {
  status: number;
  constructor(status: number) {
    super("Request rejected");
    this.status = status;
  }
}
async function auth(path: string, bearer: string, body?: unknown) {
  const r = await fetch(settings().auth + path, {
    method: body ? "POST" : "GET",
    headers: {
      authorization: bearer,
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok)
    throw new ApiError([401, 403, 404].includes(r.status) ? r.status : 503);
  if (!r.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(503);
  const reader = r.body!.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 262144) {
        await reader.cancel();
        throw new ApiError(503);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export async function list(bearer: string, after: string) {
  const ctx = context.parse(await auth("/v1/me", bearer));
  const rows = (
    await pool.query(
      `SELECT a.id,a.name,a.description,a.suffix FROM app_publications i JOIN app_definitions a ON a.id=i.app_id JOIN deployments d ON d.id=i.deployment_id AND d.app_id=i.app_id WHERE a.id>$1 AND a.active AND d.ready AND i.enabled AND i.entitled AND i.valid_until>now() ORDER BY a.id LIMIT 51`,
      [after],
    )
  ).rows;
  const candidates = rows.slice(0, 50);
  const items = [];
  // Bounded batches prevent a catalog with many applications from flooding Auth.
  for (let offset = 0; offset < candidates.length; offset += 5) {
    const batch = await Promise.all(
      candidates.slice(offset, offset + 5).map(async (row) => {
        const grant = permissions.parse(
          await auth(`/v1/apps/${row.id}/permissions`, bearer),
        );
        if (grant.appId !== row.id || grant.userId !== ctx.user.id)
          throw new ApiError(503);
        return grant.allowed && grant.roles.length
          ? { ...row, roles: grant.roles }
          : null;
      }),
    );
    items.push(...batch.filter(Boolean));
  }
  // Recheck mutable Admin eligibility after remote authorization; no stale allow cache.
  const eligible = new Set(
    (
      await pool.query(
        `SELECT i.app_id FROM app_publications i JOIN app_definitions a ON a.id=i.app_id JOIN deployments d ON d.id=i.deployment_id AND d.app_id=i.app_id WHERE i.app_id=ANY($1::uuid[]) AND a.active AND d.ready AND i.enabled AND i.entitled AND i.valid_until>now()`,
        [items.map((i) => i!.id)],
      )
    ).rows.map((r) => r.app_id),
  );
  return catalog.parse({
    items: items.filter((i) => eligible.has(i!.id)),
    nextCursor: rows.length > 50 ? candidates.at(-1)!.id : null,
  });
}

export async function resolve(
  bearer: string,
  mount: string,
  runtimeOnly = false,
) {
  const ctx = context.parse(await auth("/v1/me", bearer));
  const metadata = runtimeOnly
    ? `,rd.runtime,rd.asset_version AS "assetVersion",rd.status,rd.assets_until AS "assetsUntil",d.digest,d.reviewer,d.reviewed_at AS "reviewedAt"`
    : "";
  const runtimeJoin = runtimeOnly
    ? "JOIN runtime_deployments rd ON rd.deployment_id=d.id AND rd.status='ready' AND rd.mount=a.suffix"
    : "";
  const query = `SELECT a.id AS "appId",a.suffix,d.id AS "deploymentId",r.target_origin AS "targetOrigin"${metadata} FROM app_publications i JOIN app_definitions a ON a.id=i.app_id JOIN deployments d ON d.id=i.deployment_id AND d.app_id=i.app_id JOIN deployment_routes r ON r.deployment_id=d.id ${runtimeJoin} WHERE a.suffix=$1 AND a.active AND d.ready AND i.enabled AND i.entitled AND i.valid_until>now()`;
  const before = (await pool.query(query, [mount])).rows[0];
  if (!before) throw new ApiError(404);
  const grant = permissions.parse(
    await auth(`/v1/apps/${before.appId}/permissions`, bearer),
  );
  if (grant.userId !== ctx.user.id || grant.appId !== before.appId)
    throw new ApiError(503);
  if (!grant.allowed || !grant.roles.length) throw new ApiError(403);
  const current = (await pool.query(query, [mount])).rows[0];
  if (!current || current.deploymentId !== before.deploymentId)
    throw new ApiError(403);
  if (runtimeOnly) current.reviewedAt = current.reviewedAt.toISOString();
  return (runtimeOnly ? runtimeRoute : resolvedRoute).parse({
    ...current,
    user: ctx.user,
    userId: grant.userId,
    roles: grant.roles,
  });
}

// Public build files are application-independent; this service API is still Portal-only.
export async function resolveAsset(mount: string, version: string) {
  const row = (
    await pool.query(
      `SELECT a.id AS "appId",d.id AS "deploymentId",a.suffix,
    r.target_origin AS "targetOrigin",rd.runtime,rd.asset_version AS "assetVersion",
    rd.status,rd.assets_until AS "assetsUntil",d.digest,d.reviewer,d.reviewed_at AS "reviewedAt"
    FROM runtime_deployments rd JOIN deployments d ON d.id=rd.deployment_id
    JOIN app_definitions a ON a.id=rd.app_id AND a.suffix=rd.mount
    JOIN deployment_routes r ON r.deployment_id=d.id
    WHERE a.active AND rd.mount=$1 AND rd.asset_version=$2 AND rd.runtime='nextjs'
    AND ((rd.status='ready' AND d.ready) OR (rd.status='retired' AND rd.assets_until>now()))`,
      [mount, version],
    )
  ).rows[0];
  if (!row) throw new ApiError(404);
  return runtimeMetadata.parse({
    ...row,
    reviewedAt: row.reviewedAt.toISOString(),
    assetsUntil: row.assetsUntil?.toISOString() ?? null,
  });
}

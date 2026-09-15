import { pool } from "./db.ts";
import { settings } from "./config.ts";
import { context, permissions, catalog } from "./contracts.ts";
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
export async function list(tenant: string, bearer: string, after: string) {
  const ctx = context.parse(
    await auth("/v1/tenant-context", bearer, { tenantId: tenant }),
  );
  if (ctx.tenant.id !== tenant || ctx.membership.tenantId !== tenant)
    throw new ApiError(503);
  const rows = (
    await pool.query(
      `SELECT a.id,a.name,a.description,a.suffix FROM installations i JOIN app_definitions a ON a.id=i.app_id JOIN deployments d ON d.id=i.deployment_id AND d.app_id=i.app_id WHERE i.tenant_id=$1 AND a.id>$2 AND a.active AND d.ready AND i.enabled AND i.entitled AND i.valid_until>now() ORDER BY a.id LIMIT 51`,
      [tenant, after],
    )
  ).rows;
  const candidates = rows.slice(0, 50);
  const items = [];
  // Bounded batches prevent a tenant with many Apps from flooding Auth.
  for (let offset = 0; offset < candidates.length; offset += 5) {
    const batch = await Promise.all(
      candidates.slice(offset, offset + 5).map(async (row) => {
        const grant = permissions.parse(
          await auth(
            `/v1/tenants/${tenant}/apps/${row.id}/permissions`,
            bearer,
          ),
        );
        if (
          grant.tenantId !== tenant ||
          grant.appId !== row.id ||
          grant.userId !== ctx.membership.userId
        )
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
        `SELECT i.app_id FROM installations i JOIN app_definitions a ON a.id=i.app_id JOIN deployments d ON d.id=i.deployment_id AND d.app_id=i.app_id WHERE i.tenant_id=$1 AND i.app_id=ANY($2::uuid[]) AND a.active AND d.ready AND i.enabled AND i.entitled AND i.valid_until>now()`,
        [tenant, items.map((i) => i!.id)],
      )
    ).rows.map((r) => r.app_id),
  );
  return catalog.parse({
    tenantId: tenant,
    items: items.filter((i) => eligible.has(i!.id)),
    nextCursor: rows.length > 50 ? candidates.at(-1)!.id : null,
  });
}

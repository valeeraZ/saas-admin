import { pool } from "./db.ts";
import { operatorAuth } from "./operator-auth.ts";
import { z } from "zod";
const accessRequest = z
  .object({
    id: z.string().uuid(),
    appId: z.string().uuid(),
    userId: z.string().uuid(),
    roles: z.array(z.string()).min(1).max(100),
    reason: z.string().max(2000),
    status: z.enum(["pending", "approved", "rejected"]),
    reviewer: z.string().nullable(),
    comment: z.string().nullable(),
    createdAt: z.string(),
    reviewedAt: z.string().nullable(),
    displayName: z.string(),
    email: z.string(),
  })
  .strict();
export type ReviewRequest = z.infer<typeof accessRequest> & { appName: string };
export async function readRequests(
  actor: string,
  status = "pending",
  cursor?: string,
): Promise<{ items: ReviewRequest[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  if (status !== "all") params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  const page = z
    .object({
      items: z.array(accessRequest).max(50),
      nextCursor: z.string().uuid().nullable(),
    })
    .strict()
    .parse(await operatorAuth("/v1/operator/requests?" + params, actor));
  const names = (
    await pool.query(
      "SELECT id,name FROM app_definitions WHERE id=ANY($1::uuid[])",
      [page.items.map((r) => r.appId)],
    )
  ).rows;
  const lookup = new Map(names.map((r) => [r.id, r.name]));
  return {
    ...page,
    items: page.items.map((r) => ({
      ...r,
      appName: lookup.get(r.appId) ?? r.appId,
    })),
  };
}

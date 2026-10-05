import { z } from "zod";
import { NextResponse } from "next/server";
import { operatorAuth } from "../../../../src/operator-auth.ts";
import { pool } from "../../../../src/db.ts";
import { ApiError } from "../../../../src/service.ts";
import { requireSession } from "@/lib/auth";
import { boundedJSON, checkMutation, ConsoleError } from "@/lib/security";
import { failure } from "@/lib/api";
const uuid = z.string().uuid();
async function application(id: string) {
  if (
    !(await pool.query("SELECT 1 FROM app_definitions WHERE id=$1", [id]))
      .rowCount
  )
    throw new ConsoleError("invalid", 404);
}
function error(e: unknown) {
  if (e instanceof ApiError)
    return failure(
      new ConsoleError(
        e.status === 503 ? "unavailable" : "forbidden",
        e.status,
      ),
    );
  return failure(e);
}
export async function GET(request: Request) {
  try {
    const session = await requireSession(),
      url = new URL(request.url),
      appId = uuid.parse(url.searchParams.get("appId")),
      kind = z.enum(["users", "grants"]).parse(url.searchParams.get("kind")),
      cursor = url.searchParams.get("cursor");
    if (
      [...url.searchParams.keys()].some(
        (k) => !["appId", "kind", "cursor"].includes(k),
      )
    )
      throw new ConsoleError("invalid", 400);
    if (cursor) uuid.parse(cursor);
    await application(appId);
    const path =
      (kind === "users"
        ? "/v1/operator/users"
        : `/v1/operator/apps/${appId}/grants`) +
      (cursor ? "?cursor=" + cursor : "");
    return NextResponse.json(await operatorAuth(path, `oidc:${session.sub}`), {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    return error(e);
  }
}
export async function POST(request: Request) {
  try {
    const session = await requireSession();
    checkMutation(request, session.csrf);
    if (process.env.ADMIN_ENABLE_OPERATOR !== "true")
      throw new ConsoleError("writesDisabled", 403);
    const body = z
        .object({
          appId: uuid,
          userId: uuid,
          roles: z
            .array(z.string().regex(/^[a-z][a-z0-9_.-]{0,63}$/))
            .min(1)
            .max(100),
          enabled: z.boolean(),
        })
        .strict()
        .parse(await boundedJSON(request)),
      key = request.headers.get("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new ConsoleError("invalid", 400);
    await application(body.appId);
    const { appId, ...grant } = body;
    return NextResponse.json(
      await operatorAuth(
        `/v1/operator/apps/${appId}/grants`,
        `oidc:${session.sub}`,
        grant,
        key,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return error(e);
  }
}

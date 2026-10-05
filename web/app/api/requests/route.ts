import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { boundedJSON, checkMutation, ConsoleError } from "@/lib/security";
import { failure } from "@/lib/api";
import { operatorAuth } from "../../../../src/operator-auth.ts";
import { ApiError } from "../../../../src/service.ts";
import { readRequests } from "../../../../src/access-requests.ts";
function error(e: unknown) {
  return failure(
    e instanceof ApiError
      ? new ConsoleError(
          e.status === 409 ? "requestConflict" : "unavailable",
          e.status,
        )
      : e,
  );
}
export async function GET(request: Request) {
  try {
    const session = await requireSession(),
      url = new URL(request.url);
    const status = z
      .enum(["all", "pending", "approved", "rejected"])
      .parse(url.searchParams.get("status") ?? "pending");
    const cursor = url.searchParams.get("cursor");
    if (cursor) z.string().uuid().parse(cursor);
    if (
      [...url.searchParams.keys()].some(
        (k) => !["status", "cursor"].includes(k),
      )
    )
      throw new ConsoleError("invalid", 400);
    return NextResponse.json(
      await readRequests(`oidc:${session.sub}`, status, cursor ?? undefined),
      { headers: { "cache-control": "no-store" } },
    );
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
        id: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        comment: z.string().trim().min(1).max(2000),
      })
      .strict()
      .parse(await boundedJSON(request));
    const key = request.headers.get("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new ConsoleError("invalid", 400);
    const { id, ...decision } = body;
    return NextResponse.json(
      await operatorAuth(
        `/v1/operator/requests/${id}`,
        `oidc:${session.sub}`,
        decision,
        key,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return error(e);
  }
}

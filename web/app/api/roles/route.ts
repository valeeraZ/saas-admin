import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth";
import { ConsoleError } from "@/lib/security";
import { failure } from "@/lib/api";
import { operatorAuth } from "../../../../src/operator-auth.ts";
import { ApiError } from "../../../../src/service.ts";
import { pool } from "../../../../src/db.ts";
export async function GET(request: Request) {
  try {
    const session = await requireSession(),
      url = new URL(request.url),
      appId = z.string().uuid().parse(url.searchParams.get("appId"));
    if ([...url.searchParams.keys()].some((k) => k !== "appId"))
      throw new ConsoleError("invalid", 400);
    if (
      !(await pool.query("SELECT 1 FROM app_definitions WHERE id=$1", [appId]))
        .rowCount
    )
      throw new ConsoleError("invalid", 404);
    return NextResponse.json(
      await operatorAuth(
        `/v1/operator/apps/${appId}/roles`,
        `oidc:${session.sub}`,
      ),
      { headers: { "cache-control": "no-store" } },
    );
  } catch (e) {
    return failure(
      e instanceof ApiError
        ? new ConsoleError(
            e.status === 409 ? "conflict" : "unavailable",
            e.status,
          )
        : e,
    );
  }
}

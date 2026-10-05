import { createHash } from "node:crypto";
import { roleConfiguration } from "@/lib/access-contracts";
import { operatorAuth } from "../../../../src/operator-auth.ts";
import { ApiError } from "../../../../src/service.ts";
import { NextResponse } from "next/server";
import { readConsole, consoleQuery } from "../../../../src/console.ts";
import { apply, pool } from "../../../../src/db.ts";
import { operation } from "../../../../src/contracts.ts";
import { requireSession } from "@/lib/auth";
import { boundedJSON, checkMutation, ConsoleError } from "@/lib/security";
import { failure } from "@/lib/api";
export async function GET(request: Request) {
  try {
    await requireSession();
    const url = new URL(request.url);
    const input = consoleQuery.safeParse({
      resource: url.searchParams.get("resource"),
      q: url.searchParams.get("q") ?? "",
      cursor: url.searchParams.get("cursor") ?? "",
    });
    if (!input.success) throw new ConsoleError("invalid", 400);
    return NextResponse.json(await readConsole(input.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(
      e instanceof ApiError
        ? new ConsoleError(
            e.status === 409 ? "roleConflict" : "roleUnavailable",
            e.status,
          )
        : e,
    );
  }
}
export async function POST(request: Request) {
  try {
    const s = await requireSession();
    checkMutation(request, s.csrf);
    if (process.env.ADMIN_ENABLE_OPERATOR !== "true")
      throw new ConsoleError("writesDisabled", 403);
    const body = await boundedJSON(request, 1048576),
      key = request.headers.get("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new ConsoleError("invalid", 400);
    const { roleConfiguration: roleInput, ...metadata } = body;
    const roleConfig =
      roleInput === undefined ? undefined : roleConfiguration.parse(roleInput);
    const result = operation.safeParse(metadata);
    if (!result.success) throw new ConsoleError("invalid", 400);
    const parsed = result.data;
    if (roleConfig && parsed.kind !== "app")
      throw new ConsoleError("invalid", 400);
    if (parsed.kind === "deployment") {
      const old = await pool.query(
        "SELECT reviewer FROM deployments WHERE id=$1",
        [parsed.id],
      );
      // Preserve immutable legacy review metadata; never accept a browser-supplied reviewer.
      parsed.reviewer = old.rows[0]?.reviewer ?? `oidc:${s.sub}`;
    }
    try {
      await apply(parsed, key, `oidc:${s.sub}`);
      if (roleConfig && parsed.kind === "app")
        await operatorAuth(
          `/v1/operator/apps/${parsed.id}/roles`,
          `oidc:${s.sub}`,
          roleConfig,
          createHash("sha256")
            .update("roles:" + key)
            .digest("hex"),
        );
    } catch (e) {
      // Database/network failures remain 503; domain validation produces a localized conflict.
      const code = (e as { code?: string }).code;
      if (code?.startsWith("08") || code === "57P01") throw e;
      if (
        e instanceof Error &&
        e.name !== "ZodError" &&
        (code?.startsWith("23") ||
          /Idempotency conflict|immutable|not ready|Unknown application|operator-allowlisted|egress policy|Next.js requires|Invalid deployment transition|Replacement requires|Compatibility window|managed deployments/.test(
            e.message,
          ))
      )
        throw new ConsoleError("conflict", 409);
      throw e;
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(
      e instanceof ApiError
        ? new ConsoleError(
            e.status === 409 ? "roleConflict" : "roleUnavailable",
            e.status,
          )
        : e,
    );
  }
}

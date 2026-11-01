import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConsoleError } from "./security.ts";
export function failure(e: unknown) {
  if (e instanceof ConsoleError)
    return NextResponse.json(
      { error: e.code },
      { status: e.status, headers: { "Cache-Control": "no-store" } },
    );
  if (e instanceof ZodError)
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  return NextResponse.json({ error: "unavailable" }, { status: 503 });
}

import { pool } from "../../../../../src/db.ts";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    await pool.query("SELECT 1 FROM admin_console_sessions LIMIT 1");
    await pool.query("SELECT 1 FROM app_publications LIMIT 1");
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}

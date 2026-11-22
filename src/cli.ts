import { readFileSync } from "node:fs";

if (!process.env.ADMIN_DATABASE_URL) throw Error("ADMIN_DATABASE_URL required");

if (process.argv[2] === "migrate") {
  const { migrate } = await import("./migrate.ts");
  await migrate();
} else if (process.argv[2] === "apply") {
  if (process.env.ADMIN_ENABLE_OPERATOR !== "true")
    throw Error("Operator mode must be explicitly enabled");
  const { apply, pool } = await import("./db.ts");
  try {
    await apply(
      JSON.parse(readFileSync(process.argv[3], "utf8")),
      process.argv[4] ?? "",
      process.env.ADMIN_OPERATOR_ID ?? "",
    );
  } finally {
    await pool.end();
  }
} else {
  throw Error("Usage: migrate | apply FILE IDEMPOTENCY_KEY");
}

console.log("Operation completed");

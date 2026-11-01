// Run only with the deployment database owner after migrations.
import { pool } from "../src/db.ts";
try {
  const api = process.env.ADMIN_API_DATABASE_ROLE;
  const operator = process.env.ADMIN_CONSOLE_DATABASE_ROLE;
  if (
    !api ||
    !operator ||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(api) ||
    !/^[a-z_][a-z0-9_]{0,62}$/.test(operator)
  )
    throw Error("Explicit database role names required");
  // Identifiers are restricted above; the API must never read console sessions.
  await pool.query(`GRANT USAGE ON SCHEMA public TO "${api}", "${operator}"`);
  await pool.query(
    `GRANT SELECT ON app_definitions, deployments, app_publications, deployment_routes, runtime_deployments TO "${api}"`,
  );
  await pool.query(
    `GRANT SELECT, INSERT, UPDATE, DELETE ON app_definitions, deployments, app_publications, deployment_routes, runtime_deployments, catalog_operations, admin_console_sessions TO "${operator}"`,
  );
} finally {
  await pool.end();
}

import { fileURLToPath } from "node:url";
import { runner } from "node-pg-migrate";
import { Client } from "pg";
import { poolOptions } from "./config.ts";

const directory = new URL("../migrations/", import.meta.url);
// Checksums from the previous five-file migration layout.
const legacyHistory = [
  [
    "001_catalog.sql",
    "e786b3a0e820aaf2b115914816dc3ea4dfb06c795dde5cf1dda8de15c4fe87c8",
  ],
  [
    "002_routing.sql",
    "c95ed39263c962f48f1333352f2da4cc82b41ded4ff6a213c9822afc04e160c4",
  ],
  [
    "003_runtime_registry.sql",
    "f20cde57ebbdbc3ce21da2530cde75aea1c843b8d477d46b7d075d48fe5417b8",
  ],
  [
    "004_console_sessions.sql",
    "25c81c71799c3c544202102259cd42ca40c62c70bcb044b3230d45cc0f5b0ae8",
  ],
  [
    "005_app_publications.sql",
    "9cb41630fa239dba944ae1c59ea2f62a76106a10f4fef0e4e9b7dffd395f802f",
  ],
];

async function verifyLegacyHistory(client: Client) {
  const {
    rows: [status],
  } = await client.query<{ installed: boolean }>(
    "SELECT to_regclass('public.admin_schema_migrations') IS NOT NULL AS installed",
  );
  if (!status.installed) return;

  const { rows } = await client.query<{ name: string; sha256: string }>(
    "SELECT name, sha256 FROM public.admin_schema_migrations ORDER BY name",
  );
  for (const [index, entry] of rows.entries()) {
    const [name, checksum] = legacyHistory[index] ?? [];
    if (name !== entry.name)
      throw new Error(
        `Unexpected Admin migration history entry: ${entry.name}`,
      );
    if (checksum !== entry.sha256)
      throw new Error(`Applied migration checksum mismatch: ${entry.name}`);
  }
}

export async function migrate() {
  const client = new Client(poolOptions());
  try {
    await client.connect();
    // Use the old runner's lock while checking history and applying the baseline.
    await client.query("SELECT pg_advisory_lock(724193811)");
    await verifyLegacyHistory(client);
    await runner({
      dbClient: client,
      dir: fileURLToPath(directory),
      schema: "public",
      migrationsTable: "admin_schema_history",
      direction: "up",
      singleTransaction: true,
      noLock: true,
    });
  } finally {
    await client.end();
  }
}

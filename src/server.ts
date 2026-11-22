import { buildApp } from "./app.ts";

const app = buildApp();
try {
  await app.listen({
    port: Number(process.env.PORT ?? 59100),
    host: process.env.HOST ?? "127.0.0.1",
  });
} catch (error) {
  await app.close();
  throw error;
}

console.log("Admin catalog ready");
async function shutdown() {
  try {
    await app.close();
  } catch (error) {
    console.error("Admin shutdown failed", error);
    process.exitCode = 1;
  }
}
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => void shutdown());

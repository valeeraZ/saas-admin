/** Private operator delegation; never return this credential to the browser. */
import { ApiError } from "./service.ts";
export async function operatorAuth(
  path: string,
  actor: string,
  body?: unknown,
  key?: string,
) {
  const base = new URL(process.env.ADMIN_AUTH_URL ?? ""),
    secret = process.env.ADMIN_AUTH_OPERATOR_KEY ?? "";
  if (
    base.pathname !== "/" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    secret.length < 32 ||
    (base.protocol !== "https:" &&
      !(
        process.env.ADMIN_ALLOW_LOCAL_HTTP === "true" &&
        base.protocol === "http:" &&
        ["127.0.0.1", "localhost"].includes(base.hostname)
      ))
  )
    throw new ApiError(503);
  const r = await fetch(new URL(path, base), {
    method: body ? "PUT" : "GET",
    headers: {
      "x-auth-operator-key": secret,
      "x-auth-operator-actor": actor,
      accept: "application/json",
      ...(body
        ? { "content-type": "application/json", "idempotency-key": key ?? "" }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(5000),
  });
  if (!r.ok || !r.headers.get("content-type")?.startsWith("application/json"))
    throw new ApiError(r.status >= 500 ? 503 : r.status);
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = r.body!.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1048576) {
        await reader.cancel();
        throw new ApiError(503);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString());
}

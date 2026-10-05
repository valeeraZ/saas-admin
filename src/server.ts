import { createServer } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { settings } from "./config.ts";
import { pool } from "./db.ts";
import { entityId } from "./contracts.ts";
import { list, discover, resolve, resolveAsset, ApiError } from "./service.ts";
const config = settings();
const hash = (s: string) => createHash("sha256").update(s).digest();
const server = createServer(async (req, res) => {
  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      "content-type": "application/json",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    res.end(JSON.stringify(body));
  };
  try {
    const url = new URL(req.url ?? "/", "http://internal");
    if (req.method === "GET" && url.pathname === "/health/ready") {
      await pool.query("SELECT 1 FROM app_publications LIMIT 1");
      await pool.query("SELECT 1 FROM deployment_routes LIMIT 1");
      await pool.query("SELECT 1 FROM runtime_deployments LIMIT 1");
      return send(200, { status: "ready" });
    }
    if (
      !timingSafeEqual(
        hash(
          typeof req.headers["x-portal-key"] === "string"
            ? req.headers["x-portal-key"]
            : "",
        ),
        hash(config.key),
      )
    )
      throw new ApiError(401);
    if (req.method === "GET" && url.pathname === "/v1/runtime/assets") {
      const mount = url.searchParams.get("suffix") ?? "";
      const version = url.searchParams.get("version") ?? "";
      if (
        !/^\/[a-z][a-z0-9-]{0,62}$/.test(mount) ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(version) ||
        [...url.searchParams.keys()].some(
          (k) => !["suffix", "version"].includes(k),
        ) ||
        url.searchParams.getAll("suffix").length !== 1 ||
        url.searchParams.getAll("version").length !== 1
      )
        throw new ApiError(400);
      return send(200, await resolveAsset(mount, version));
    }
    const match = url.pathname.match(
      /^\/v1\/(catalog|discovery|route|runtime-route)$/,
    );
    if (!match || req.method !== "GET") throw new ApiError(404);
    if (match[1] === "route" || match[1] === "runtime-route") {
      const mount = url.searchParams.get("suffix");
      const bearer = req.headers.authorization;
      if (
        !mount ||
        url.searchParams.getAll("suffix").length !== 1 ||
        !/^\/[a-z][a-z0-9-]{0,62}$/.test(mount) ||
        [...url.searchParams.keys()].some((k) => k !== "suffix")
      )
        throw new ApiError(400);
      if (!bearer?.startsWith("Bearer ") || bearer.length > 16384)
        throw new ApiError(401);
      return send(
        200,
        await resolve(bearer, mount, match[1] === "runtime-route"),
      );
    }

    const cursor = entityId.safeParse(
      url.searchParams.get("cursor") ?? "00000000-0000-0000-0000-000000000000",
    );
    if (
      !cursor.success ||
      [...url.searchParams.keys()].some((k) => k !== "cursor")
    )
      throw new ApiError(400);
    const bearer = req.headers.authorization;
    if (!bearer?.startsWith("Bearer ") || bearer.length > 16384)
      throw new ApiError(401);
    return send(
      200,
      await (match[1] === "discovery" ? discover : list)(bearer, cursor.data),
    );
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 503;
    send(status, {
      code:
        status === 503
          ? "dependency_unavailable"
          : status === 401
            ? "unauthenticated"
            : status === 400
              ? "invalid_input"
              : "access_denied",
    });
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.listen(
  Number(process.env.PORT ?? 59100),
  process.env.HOST ?? "127.0.0.1",
  () => console.log("Admin catalog ready"),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.on(signal, () =>
    server.close(() => {
      void pool.end();
    }),
  );

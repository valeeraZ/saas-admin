import { createHash, timingSafeEqual } from "node:crypto";
import postgres from "@fastify/postgres";
import Fastify, { type FastifyRequest } from "fastify";
import { poolOptions, settings } from "./config.ts";
import { entityId } from "./contracts.ts";
import { list, discover, resolve, resolveAsset, ApiError } from "./service.ts";

const suffixPattern = /^\/[a-z][a-z0-9-]{0,62}$/;
const hash = (value: string) => createHash("sha256").update(value).digest();

function requestUrl(request: FastifyRequest) {
  return new URL(request.url, "http://internal");
}

function bearer(request: FastifyRequest) {
  const value = request.headers.authorization;
  if (!value?.startsWith("Bearer ") || value.length > 16384)
    throw new ApiError(401);
  return value;
}

export function buildApp() {
  const portalKey = hash(settings().key);
  const app = Fastify({ requestTimeout: 15000, exposeHeadRoutes: false });
  app.server.headersTimeout = 10000;

  app.addHook("onRequest", async (request, reply) => {
    reply.headers({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    if (
      request.method === "GET" &&
      requestUrl(request).pathname === "/health/ready"
    )
      return;
    const key = request.headers["x-portal-key"];
    if (!timingSafeEqual(hash(typeof key === "string" ? key : ""), portalKey))
      throw new ApiError(401);
  });

  app.setErrorHandler((error, _request, reply) => {
    const status = error instanceof ApiError ? error.status : 503;
    const code =
      status === 503
        ? "dependency_unavailable"
        : status === 401
          ? "unauthenticated"
          : status === 400
            ? "invalid_input"
            : "access_denied";
    return reply.code(status).send({ code });
  });

  app.setNotFoundHandler(async () => {
    throw new ApiError(404);
  });

  app.register(postgres, poolOptions());
  app.register(async (api) => {
    const { pool } = api.pg;
    api.get("/health/ready", async () => {
      await pool.query("SELECT 1 FROM app_publications LIMIT 1");
      await pool.query("SELECT 1 FROM deployment_routes LIMIT 1");
      await pool.query("SELECT 1 FROM runtime_deployments LIMIT 1");
      return { status: "ready" };
    });

    api.get("/v1/runtime/assets", async (request) => {
      const { searchParams } = requestUrl(request);
      const mount = searchParams.get("suffix") ?? "";
      const version = searchParams.get("version") ?? "";
      if (
        !suffixPattern.test(mount) ||
        !/^[a-zA-Z0-9-]{1,80}$/.test(version) ||
        [...searchParams.keys()].some(
          (key) => !["suffix", "version"].includes(key),
        ) ||
        searchParams.getAll("suffix").length !== 1 ||
        searchParams.getAll("version").length !== 1
      )
        throw new ApiError(400);
      return resolveAsset(pool, mount, version);
    });

    for (const [path, runtimeOnly] of [
      ["/v1/route", false],
      ["/v1/runtime-route", true],
    ] as const) {
      api.get(path, async (request) => {
        const { searchParams } = requestUrl(request);
        const mount = searchParams.get("suffix");
        if (
          !mount ||
          searchParams.getAll("suffix").length !== 1 ||
          !suffixPattern.test(mount) ||
          [...searchParams.keys()].some((key) => key !== "suffix")
        )
          throw new ApiError(400);
        return resolve(pool, bearer(request), mount, runtimeOnly);
      });
    }

    for (const [path, query] of [
      ["/v1/catalog", list],
      ["/v1/discovery", discover],
    ] as const) {
      api.get(path, async (request) => {
        const { searchParams } = requestUrl(request);
        const cursor = entityId.safeParse(
          searchParams.get("cursor") ?? "00000000-0000-0000-0000-000000000000",
        );
        if (
          !cursor.success ||
          [...searchParams.keys()].some((key) => key !== "cursor")
        )
          throw new ApiError(400);
        return query(pool, bearer(request), cursor.data);
      });
    }
  });

  return app;
}

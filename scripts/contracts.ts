import { writeFileSync } from "node:fs";
import { z } from "zod";
import {
  catalog,
  discovery,
  operation,
  resolvedRoute,
  runtimeRoute,
  runtimeMetadata,
  suffix,
} from "../src/contracts.ts";
const error = {
  type: "object",
  required: ["code"],
  properties: { code: { type: "string" } },
};
const spec = {
  openapi: "3.1.0",
  info: { title: "SaaS Admin Catalog", version: "0.2.0" },
  paths: {
    "/v1/runtime/assets": {
      get: {
        operationId: "resolveRuntimeAsset",
        security: [{ portalKey: [] }],
        description:
          "Private Portal-only immutable public asset lookup. No cache; expired or revoked versions are denied.",
        parameters: [
          {
            name: "suffix",
            in: "query",
            required: true,
            schema: z.toJSONSchema(suffix),
          },
          {
            name: "version",
            in: "query",
            required: true,
            schema: { type: "string", pattern: "^[a-zA-Z0-9-]{1,80}$" },
          },
        ],
        responses: {
          "200": {
            description: "Reviewed public build deployment",
            content: {
              "application/json": { schema: z.toJSONSchema(runtimeMetadata) },
            },
          },
          "400": { description: "Invalid input" },
          "401": { description: "Service credential required" },
          "404": { description: "Inactive or unknown version" },
          "503": { description: "Unavailable" },
        },
      },
    },
    "/v1/catalog": {
      get: {
        operationId: "listUserCatalog",
        description:
          "Portal BFF only. Auth bearer is forwarded exclusively to Auth for online identity and application grant verification; service credential authenticates Portal. No authorization cache.",
        security: [{ portalKey: [], authDelegation: [] }],
        parameters: [
          {
            name: "cursor",
            in: "query",
            schema: { type: "string", format: "uuid" },
            description:
              "Last scanned app ID; an empty page may still have nextCursor.",
          },
        ],
        responses: {
          "200": {
            description:
              "Only currently eligible Apps; no internal deployment target",
            content: {
              "application/json": { schema: z.toJSONSchema(catalog) },
            },
          },
          ...Object.fromEntries(
            [400, 401, 403, 404, 503].map((code) => [
              String(code),
              {
                description:
                  code === 503
                    ? "Dependency unavailable; no partial catalog"
                    : "Rejected",
                content: { "application/json": { schema: error } },
              },
            ]),
          ),
        },
      },
    },
    "/v1/route": {
      get: {
        operationId: "resolveUserApplication",
        description:
          "Private Portal-only route resolution; checks live Auth and Admin eligibility. Internal target must never be returned to browsers.",
        security: [{ portalKey: [], authDelegation: [] }],
        parameters: [
          {
            name: "suffix",
            in: "query",
            required: true,
            schema: z.toJSONSchema(suffix),
          },
        ],
        responses: {
          "200": {
            description: "Authorized route and user context",
            content: {
              "application/json": { schema: z.toJSONSchema(resolvedRoute) },
            },
          },
          ...Object.fromEntries(
            [400, 401, 403, 404, 503].map((code) => [
              String(code),
              {
                description: "Rejected; no route returned",
                content: { "application/json": { schema: error } },
              },
            ]),
          ),
        },
      },
    },
    "/health/ready": {
      get: {
        operationId: "readiness",
        responses: {
          "200": { description: "Database and catalog schema reachable" },
          "503": { description: "Unavailable" },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      portalKey: { type: "apiKey", in: "header", name: "X-Portal-Key" },
      authDelegation: {
        type: "http",
        scheme: "bearer",
        description:
          "Opaque Auth access token. Not an Admin audience token; accepted only with authenticated Portal service credential.",
      },
    },
  },
};
Object.assign(spec.paths, {
  "/v1/discovery": {
    get: {
      ...spec.paths["/v1/catalog"].get,
      operationId: "discoverPublishedApps",
      description:
        "Authenticated Portal-only discovery of all eligible publications, including apps without a user grant. No internal target or permission is returned.",
      responses: {
        ...spec.paths["/v1/catalog"].get.responses,
        "200": {
          description: "Published apps available for discovery",
          content: {
            "application/json": { schema: z.toJSONSchema(discovery) },
          },
        },
      },
    },
  },
  "/v1/runtime-route": {
    get: {
      ...spec.paths["/v1/route"].get,
      operationId: "resolveRuntimeApplication",
      description:
        "Online Auth and Admin checks with immutable reviewed runtime metadata. No authorization or route cache.",
      responses: {
        ...spec.paths["/v1/route"].get.responses,
        "200": {
          description: "Ready runtime route",
          content: {
            "application/json": { schema: z.toJSONSchema(runtimeRoute) },
          },
        },
      },
    },
  },
});
writeFileSync("contracts/openapi.json", JSON.stringify(spec, null, 2) + "\n");
writeFileSync(
  "contracts/operator.schema.json",
  JSON.stringify(z.toJSONSchema(operation), null, 2) + "\n",
);

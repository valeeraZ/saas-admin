import { writeFileSync } from "node:fs";
import { z } from "zod";
import { catalog, operation } from "../src/contracts.ts";
const error = {
  type: "object",
  required: ["code"],
  properties: { code: { type: "string" } },
};
const spec = {
  openapi: "3.1.0",
  info: { title: "SaaS Admin Catalog", version: "0.1.0" },
  paths: {
    "/v1/tenants/{tenantId}/catalog": {
      get: {
        operationId: "listTenantCatalog",
        description:
          "Portal BFF only. Auth bearer is forwarded exclusively to Auth for online membership and role verification; service credential authenticates Portal. No authorization cache.",
        security: [{ portalKey: [], authDelegation: [] }],
        parameters: [
          {
            name: "tenantId",
            in: "path",
            required: true,
            schema: { type: "string", format: "uuid" },
          },
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
writeFileSync("contracts/openapi.json", JSON.stringify(spec, null, 2) + "\n");
writeFileSync(
  "contracts/operator.schema.json",
  JSON.stringify(z.toJSONSchema(operation), null, 2) + "\n",
);

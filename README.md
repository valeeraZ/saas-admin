# Current platform

Single-cluster deployment: [Kubernetes / Helm guide](deploy/README.md), [executed validation](deploy/VALIDATION.md).

See [User/application administration](docs/USER-APP-PLATFORM.md). Historical tenant installation instructions below are superseded.

# SaaS Admin

Admin owns application definitions, reviewed deployments and tenant installation/entitlement facts. This first service exposes a real PostgreSQL-backed catalog consumed by Portal. Auth owns users, tenant membership and application roles; every catalog request checks them online.

## Run

Node >=24.10 and PostgreSQL 17 are required.

```sh
npm ci
# Inject environment variables described in .env.example.
npm run db:migrate
npm start
```

`GET /health/ready` verifies database/schema availability. `GET /v1/tenants/{tenantId}/catalog` requires both `X-Portal-Key` (Portal service credential) and `Authorization: Bearer ...` (opaque Auth token to delegate to Auth). This is a private BFF service endpoint: the browser never receives the service credential. HTTPS is required for Auth except the explicit loopback development exception; deploy Admin behind TLS/private ingress. Limit network access to Portal. Rotate the shared service credential with coordinated Portal/Admin configuration.

A user token is **not** interpreted as an Admin-audience identity token. Admin forwards it only to the configured Auth service, which validates issuer, audience, session and membership. Admin never decodes it or persists it. The separate service credential authenticates the calling BFF. A future general-purpose public Admin API must define its own audience/token exchange policy.

## Manage the catalog

The bilingual [Admin console](docs/ADMIN-CONSOLE.md) provides application, deployment, installation and audit management using Next.js, next-intl, shadcn/ui and Tailwind CSS. The CLI below remains available for automation and migrations. Keep the operator console separate from the private catalog API: the catalog API only needs SELECT privileges; the console requires a dedicated operator database account. Run schema migrations with a separate deployment account.

```sh
ADMIN_ENABLE_OPERATOR=true ADMIN_OPERATOR_ID=operator:alice \
  node src/cli.ts apply /path/to/operation.json unique-operation-key-0001
```

Operation JSON is validated by [operator.schema.json](contracts/operator.schema.json):

```json
{
  "kind": "app",
  "id": "00000000-0000-4000-8000-000000000001",
  "name": "Reports",
  "description": "Team reports",
  "suffix": "/reports",
  "active": true
}
```

```json
{
  "kind": "deployment",
  "id": "00000000-0000-4000-8000-000000000002",
  "appId": "00000000-0000-4000-8000-000000000001",
  "digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "reviewer": "reviewer:alice",
  "ready": true
}
```

```json
{
  "kind": "installation",
  "tenantId": "00000000-0000-4000-8000-000000000003",
  "appId": "00000000-0000-4000-8000-000000000001",
  "deploymentId": "00000000-0000-4000-8000-000000000002",
  "enabled": true,
  "entitled": true,
  "validUntil": "2027-01-01T00:00:00Z"
}
```

Use actual tenant IDs and reviewed artifact digests. These example IDs/digests do not deploy anything. `ready=true` is an explicit operator attestation after external verification, not an automated health check. Deployment digest, owning application and reviewer are immutable; create a new deployment ID for a new artifact. Readiness may be withdrawn. Every successful operation and its actor is committed atomically to `catalog_operations`; identical retries are no-ops and reusing a key for a different operation fails. A failed write rolls back its audit/idempotency record.

Repeat an installation operation with a new key and `enabled=false` or `entitled=false` to revoke availability. Entitlement expiry is evaluated using database time on each read. Entitlement here is an operator-maintained access grant, not a billing/subscription implementation.

## Access and pagination

An application appears only if Auth verifies active membership **and** grants at least one application role **and** Admin has an active definition, ready reviewed deployment, enabled installation and current entitlement. Owner/admin tenant roles alone do not grant application access. Tenant IDs scope installation queries and online Auth checks. Auth errors fail the whole request; no partial or cached allow response is returned.

Pages scan at most 50 eligible Admin candidates in UUID order; role filtering may produce an empty page with a non-null `nextCursor`. Continue until the cursor is null. Responses contain safe metadata and roles, never internal deployment targets or credentials. Every response is `no-store`. Directory visibility is not a substitute for authorization at application entry/backend; this increment does not implement application proxying or launch URLs.

[OpenAPI](contracts/openapi.json) is generated with `npm run contracts`. [Local integration](integration/README.md) reproduces real Auth/Keycloak/Portal tests. [Validation](docs/CATALOG-VALIDATION.md) records scope and limitations.

## Checks and image

```sh
npm test
npm run typecheck
npm run format:check
npm run contracts
docker build -t saas-admin:local .
```

The Docker runtime runs as a non-root user. Run `node src/cli.ts migrate` as a one-shot deployment job before starting API replicas. No credentials are embedded in the image.

## Tenant application routing (next increment)

Apply migration 002 before serving route requests. The private `GET /v1/tenants/{tenantId}/route?suffix=/reports` repeats online membership/role and Admin eligibility checks and returns an authorized deployment origin. It requires the same Portal service credential and delegated Auth bearer as the catalog. It is never exposed by a browser API.

Configure `ADMIN_ALLOWED_APP_ORIGINS` on the operator CLI, then bind an origin to an already reviewed deployment:

```json
{
  "kind": "route",
  "deploymentId": "00000000-0000-4000-8000-000000000002",
  "targetOrigin": "https://reports.internal.example"
}
```

Origin binding is immutable. Moving to another target requires a new reviewed deployment; switch the installation to that deployment. The Portal also requires the origin in its own allowlist. No browser input selects a target host. Deployment activation without a configured route yields 404 on application entry. The catalog remains a metadata listing; the route endpoint is the final per-request authorization boundary before forwarding.

## Runtime Application Registry

For new production onboarding use the [runtime Registry workflow](docs/RUNTIME-REGISTRY.md), migration 003 and the `runtime-deployment`, `deployment-status`, `replace-deployment` operations. The older examples above remain legacy catalog/environment-mode operations. Runtime Registry publishes reviewed origins, runtime type and immutable build namespaces without a Portal restart; old versions have explicit compatibility deadlines and terminal revocation. Operator approval remains manual.

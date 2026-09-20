# Runtime Application Registry

Implemented on `codex/runtime-application-registry`, based on Admin main `5219dc8` and Portal main `e0e177f`. Admin owns reviewed deployment facts. Portal owns an independent infrastructure egress boundary and performs online resolution for every business and public build-asset request. SDK/Auth protocols are unchanged.

## Operator workflow

Run migration 003 with `npm run db:migrate` before deploying the new API. The operator CLI is the existing privileged control boundary; the HTTP service exposes read-only private endpoints, not public management writes. Set `ADMIN_ENABLE_OPERATOR=true`, a real `ADMIN_OPERATOR_ID`, and a migration/operator database identity. The API database identity requires SELECT only. Retain `catalog_operations` as the audit/idempotency ledger.

Every operation below is applied with `node src/cli.ts apply FILE IDEMPOTENCY_KEY`. Use a new random key for a new operation and reuse exactly the same key/body/actor when retrying an uncertain response. All changes and audit entries commit in one transaction. Operator writes serialize across replicas using a PostgreSQL transaction advisory lock; reads remain available. IDs and digest below are illustrative, not deployable artifacts.

1. Create an `app` with a unique permanent suffix (mount). `/app-assets` and other platform paths are reserved. Mounts cannot be renamed or reused by another application.
2. Deploy and externally verify the artifact, its SDK signature enforcement, health and resource serving. Register the immutable runtime identity:

```json
{"kind":"runtime-deployment","id":"00000000-0000-4000-8000-000000000002","appId":"00000000-0000-4000-8000-000000000001","digest":"sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","targetOrigin":"https://reports.apps.internal.example","runtime":"nextjs","assetVersion":"release-20260920"}
```

Use `runtime:"http", assetVersion:null` for a normal HTTP app. Next.js requires a version. Registration always starts `pending`; its deployment cannot receive enabled installations or public asset traffic. Origin/runtime/version/app/digest are immutable. A mount/version collision is rejected even after expiry or revocation. Legacy deployment/route writes cannot mutate a runtime-managed record.

3. Approve readiness after the external checks:

```json
{"kind":"deployment-status","deploymentId":"00000000-0000-4000-8000-000000000002","status":"ready"}
```

The approving CLI actor and database timestamp become the review metadata. `ready` is a trusted operator attestation, not an automated probe. This feature does not implement the wider ADMIN-02 health-check worker or management UI.

4. Use the existing `installation` operation for each actual Auth tenant. It requires enabled/entitled/current grants and a ready deployment. Auth still checks live tenant membership and app roles on every business request. Changing Registry data does not grant an Auth role.
5. For a release, register and approve a new deployment with a new asset version, then atomically replace all installations pointing to the old deployment:

```json
{"kind":"replace-deployment","deploymentId":"00000000-0000-4000-8000-000000000002","replacementId":"00000000-0000-4000-8000-000000000004","assetsUntil":"2027-01-01T00:00:00Z"}
```

Choose a real, short compatibility deadline appropriate to the release. Both deployments must be ready and belong to the same app/mount. In one transaction, existing installations move to the replacement, the old deployment becomes `retired`, and its business readiness becomes false. Its public JS/CSS/font resources remain resolvable until the deadline, provided the app remains active. Keep the old upstream and immutable files available for that interval. Do not overwrite files behind an existing namespace. For compatible Next.js rolling releases, supply a stable application-specific `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` at build time to all retained versions; keep the secret in the application build/deployment secret store, never in Registry or Portal metadata. Independent random build keys change action identities. See [Next.js self-hosting guidance](https://nextjs.org/docs/app/guides/self-hosting#server-functions-encryption-key). The new application must preserve compatible action/API behavior for old clients; arbitrary breaking Server Action/API changes are not made compatible by retaining static files.
6. Revoke any pending, ready or retired deployment immediately:

```json
{"kind":"deployment-status","deploymentId":"00000000-0000-4000-8000-000000000002","status":"revoked"}
```

Revocation removes both business and public asset eligibility. Retired/revoked identities cannot return to ready; a fresh reviewed identity is required. Disabling the app removes all its versions. Disabling an installation removes that tenant's business access; immutable public files are intentionally not tenant-authorized content.

## Private read contracts

- `GET /v1/tenants/{tenantId}/runtime-route?suffix=/reports`: Portal service key plus delegated Auth bearer. Returns current authorized tenant/user/roles plus app/deployment/mount/origin/runtime/version/status/digest/reviewer/review time. Admin rechecks the installation after the remote role lookup so a concurrent replacement/revocation cannot silently reuse the prior deployment.
- `GET /v1/runtime/assets?suffix=/reports&version=release-20260920`: Portal service key only. Returns a reviewed ready Next.js deployment or an unexpired retired one. No Auth token is required because only immutable public JS/CSS/fonts are served. No tenant business path is admitted through this endpoint.
- `/catalog` and the legacy `/route` retain their shapes. Browser catalog responses still omit internal origins and deployment metadata. Portal Admin mode uses `/runtime-route`, never the legacy fallback.

Generated contracts: `contracts/openapi.json` and `contracts/operator.schema.json` (`npm run contracts`). Unknown/ineligible records return 404, invalid requests 400, missing service credentials 401, upstream/database/schema failures 503. All responses are `Cache-Control: no-store`.

## Egress and upgrade

On operator processes set `ADMIN_APP_DNS_SUFFIXES=apps.internal.example` to allow only strict subdomains over HTTPS/default port 443. The suffix root, deceptive suffixes and arbitrary ports are excluded. `ADMIN_ALLOWED_APP_ORIGINS` supplies exact exceptions. HTTP is restricted to explicitly listed loopback origins and `ADMIN_ALLOW_LOCAL_HTTP=true`. Portal separately enforces `PORTAL_APP_DNS_SUFFIXES` and `PORTAL_APP_EGRESS_ORIGINS`. Network/DNS ownership and egress firewall policy must maintain this infrastructure boundary; a Registry record does not bypass it.

Deploy Admin/migration first. Register fresh runtime identities for legacy applications, verify them, approve them and update installations. On Portal select `PORTAL_REGISTRY_MODE=admin` (the default), configure infrastructure policy, and remove `PORTAL_ALLOWED_APP_ORIGINS`, `PORTAL_NEXT_APP_ORIGINS` and `PORTAL_APP_ASSETS`. Admin mode rejects nonempty legacy projections, including `[]`, at startup and request time. Restart Portal once for this migration. Later onboarding/releases inside the approved network boundary need only Admin operations; no Portal rebuild/restart is required. Changing the infrastructure boundary itself still requires configuration rollout.

`PORTAL_REGISTRY_MODE=environment` explicitly retains the old local/emergency behavior. It requires the old projections and restart on changes. It does not automatically activate during Registry failures. Keep the new read API additive so an operator can roll Portal back without reverting database history.

## Freshness and failure semantics

Registry and authorization cache TTL is **zero**. Every Portal replica performs a new Admin request (`cache:no-store`, redirects forbidden, bounded response parsing); no positive, negative or last-good fallback exists. After a revoke/replace/expiry commits on the Admin primary database, subsequent resolution reads reject the obsolete record. Serve these APIs from the primary, not lagging read replicas.

A request already authorized before the commit may remain in flight until the Portal's existing 30-second application-response timeout. Revocation does not recall downloaded browser code or undo a previously accepted business operation. All asset and business responses are no-store at Portal; do not override this in an upstream CDN. Admin lookup timeouts are 5 seconds for assets and 10 seconds for business routes, within the 30-second response deadline. Clocks should be synchronized for Portal's additional retired-version deadline check; Admin also checks expiry using database time.

HTTP transport, response-header/Cookie filtering, confined HTTP/Server Action redirects, body-bound signed assertions, SDK audience/deployment verification and denial of unsigned direct business requests remain in force. Public assets are intentionally directly readable from the application; business requests are not.

## Validation

The reproducible multi-repository test is `saas-portal/integration/runtime-registry.test.ts`; run instructions and validation boundaries are in Portal `docs/RUNTIME-REGISTRY-VALIDATION.md`. It creates isolated databases and checks real PostgreSQL persistence/idempotency, two Admin and built Portal replicas, dynamic onboarding/replacement/revocation, two tenants, policy/collision failures, malformed responses and dependency failures. Auth is explicitly a protocol stub in this test. Optional packed-SDK Next.js browser coverage exercises actual compiled apps; it does not represent new real-Keycloak identity validation.

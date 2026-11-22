# Admin console

The console is a separate Next.js process in `web/`. It manages the same PostgreSQL records and transactional operator commands as the CLI. `/zh/applications` and `/en/applications` support application creation/editing, runtime deployment registration, manual approval, replacement with compatibility deadline, terminal revocation, installation grants and audit inspection. Existing legacy deployments retain route binding and readiness editing. Search and keyset pagination read 50 records per page.

All interface text lives in `web/messages/{zh,en}.json`; dates and counts use next-intl. Application names, descriptions, IDs and operator records are stored business data and are not translated. The console does not manage Auth tenant membership or application roles. Enter real Auth tenant IDs when granting installations; access still requires Auth membership and application roles. Deployment registration records reviewed infrastructure metadata; it does not deploy artifacts. Approval requires external verification.

## Run and configure

Install Node 24.10+, PostgreSQL 17 and the existing Admin dependencies, then:

```sh
npm ci
npm ci --prefix web
# Inject the variables in web/.env.example into the console process.
npm run db:migrate
npm run build --prefix web
npm run start --prefix web -- --port 3003
```

For development use `npm run dev --prefix web -- --port 3003`. Environment variables can be injected by your process manager or placed in ignored `web/.env.local`. Production must use HTTPS with `ADMIN_UI_ORIGIN` set to its exact public origin. The start script binds loopback; place a TLS reverse proxy on the same host. The existing root Docker image still runs the private catalog API. Deploy the console with its own Node process and install both root and web packages; root `pg` and `zod` are used by the shared operator code.

Use a dedicated confidential Keycloak client, Authorization Code + PKCE S256, with direct access grants and service accounts disabled. Configure:

- Exact redirect URI: `<ADMIN_UI_ORIGIN>/api/auth/callback`.
- Allowed post-logout redirects: `<ADMIN_UI_ORIGIN>/zh/login` and `/en/login`.
- Default basic/profile/email scopes, including subject in access tokens and introspection responses.
- Audience mapper with included client audience equal to `ADMIN_UI_OIDC_CLIENT_ID`, added to access tokens and token introspection. Keep audience checking enabled. Current Keycloak requires the introspecting client in the access token audience; see the [official upgrade guide](https://www.keycloak.org/docs/26.7.1/upgrading/).
- `ADMIN_UI_ALLOWED_SUBJECTS`: exact stable Keycloak subject IDs for operators, comma-separated. Emails and tenant owner/admin roles never grant console access.

Set the client secret only on the server. Generate `ADMIN_UI_SESSION_KEY` using `node -e 'console.log(require("node:crypto").randomBytes(32).toString("base64"))'`; inject the same key on every replica and keep it stable across restarts. Trust private identity CAs through `NODE_EXTRA_CA_CERTS`; do not disable TLS validation. Loopback development alone may use `ADMIN_UI_ALLOW_LOCAL_HTTP=true`. Remote HTTP is rejected.

## Database and security

Apply the schema migration with a migration account before starting the console. Use a dedicated operator database role with SELECT/INSERT/UPDATE on `app_definitions`, `deployments`, `app_publications`, `deployment_routes`, `runtime_deployments` and SELECT/INSERT on `catalog_operations`. Grant SELECT/INSERT/UPDATE/DELETE on `admin_console_sessions`. The catalog API account must retain its narrower read permissions. `ADMIN_ENABLE_OPERATOR=true` explicitly enables console writes. Origin/DNS policy variables are the same as the CLI.

Cookies contain only random opaque session IDs. Session IDs are hashed in PostgreSQL; identity tokens and CSRF secrets are encrypted with AES-256-GCM. Sessions expire after eight hours and after thirty idle minutes. Refresh is serialized per session. Every read/write verifies the subject whitelist and performs online token introspection; identity outages deny access. Production cookies use the `__Host-` prefix, Secure, HttpOnly and SameSite=Lax. Login transactions are one-use, ten-minute PKCE/state/nonce records.

Writes require the exact configured Origin, session CSRF token and idempotency key, and are limited to 16 KiB JSON. The server chooses the audit actor from the verified OIDC subject. Existing immutable metadata, readiness, replacement and revocation rules are enforced by the shared transaction implementation. No client-provided actor is accepted. Management responses are `no-store`; the private Portal catalog API remains separate.

Schedule deletion of expired login/session rows using an operator maintenance account:

```sql
DELETE FROM admin_console_sessions
WHERE expires_at < now()
   OR (kind = 'session' AND last_seen < now() - interval '30 minutes');
```

## Verification

```sh
npm test
npm run typecheck
npm test --prefix web
npm run typecheck --prefix web
npm run build --prefix web
../saas-auth/.venv/bin/python integration/console.py --auth ../saas-auth \
  --chromium /absolute/path/to/chromium
```

The browser harness uses real local Keycloak and PostgreSQL in a unique Docker Compose project, builds/runs the production console, exercises persistent mutations and identity failure cases, and removes only its own containers/volume on exit. It requires Auth's development virtualenv (TLS helpers), installed Chromium and a local Docker context. Screenshots and private logs remain in the printed temporary directory; they may contain test-only secrets and should not be published wholesale. No application workload is deployed by these tests.

Large-catalog browser pagination and legacy management UI are outside the current runtime workflow browser acceptance coverage. Remote console deployment and a separate console container remain optional infrastructure work.

Production dependency audit is clean (`npm audit --omit=dev`); seven high-severity upstream advisories remain in the shadcn CLI development-tool dependencies. The generated stylesheet uses the package at build time. Review upstream fixes separately; a forced audit downgrade would replace the chosen CLI version.

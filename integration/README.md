# Real catalog integration

Use the Portal identity integration environment first: real Keycloak at 59443, Auth at 59000, PostgreSQL at 55434, Portal HTTPS at 58999. Auth source used for validation: `1e71386c8ac535135e3c721a2478c2328feb32a2`. No Auth fixtures are used.

```sh
npm ci
export PORTAL_SOURCE=/absolute/path/to/saas-portal
# Use Auth's Python environment, which already has psycopg installed.
/absolute/path/to/saas-auth/.venv/bin/python integration/prepare.py
node --env-file=.env.local src/cli.ts migrate
node --env-file=.env.local src/server.ts
```

Preparation creates a **separate** saas_admin database and login on the disposable Portal PostgreSQL instance, writes ignored random credentials, and adds `PORTAL_ADMIN_URL` / `PORTAL_ADMIN_KEY` to Portal's ignored `.env.local`. It refuses to overwrite an existing Admin config. It does not read or write Auth-owned tables. Rebuild/restart Portal after adding configuration.

```sh
export PORTAL_SOURCE=/absolute/path/to/saas-portal
export NODE_EXTRA_CA_CERTS="$PORTAL_SOURCE/.local/auth-config/.local/tls.crt"
# Optional: existing Chromium executable, otherwise install via Portal's Playwright.
export PORTAL_CHROMIUM=/absolute/path/to/chromium
npm run test:integration
```

The test logs in through real Keycloak UI, creates two tenants via Auth, creates a role and assignment via Auth, writes Admin catalog facts through the operator service, and verifies Portal UI. It also starts temporary Admin replicas on 59102 for persistence and Auth-outage tests. No real email is sent. Test tenants and catalog audit records are retained; random IDs/names keep repeated runs independent. The integration harness imports Portal's test runtime and session store to access the test access token; **production services have no cross-repository source or database dependency**.

Screenshots are written outside the repositories to `/private/tmp/portal-admin-catalog.png` and `/private/tmp/portal-admin-mobile.png`. Do not commit `.env.local`, `.local`, credentials or tokens. For a fresh environment, stop this environment's processes/containers and explicitly dispose of only its test volume; never clear a business database.

The HTTP Admin listener is loopback-only for development. Set HOST for container ingress and terminate TLS in deployment. Production credentials, managed database roles, automated deployment verification and billing integration are separate operational work.

# User and application administration

Admin owns app definitions, deployments, reviewed routes, global publications and runtime lifecycle. Auth owns identities and direct user/application grants. The console's application rows expose **Manage access**, listing existing platform users and app grants with translated labels. Grants and revocations go through Auth's private operator API. The browser receives no operator key; the server records the verified OIDC subject as the audit actor. Exact origin and session CSRF checks protect writes, and `ADMIN_ENABLE_OPERATOR=true` is required.

Set server-only `ADMIN_AUTH_URL` and `ADMIN_AUTH_OPERATOR_KEY` (at least 32 random characters, matching Auth's `SAAS_APP_OPERATOR_KEY`). Keep this separate from `ADMIN_PORTAL_KEY`, which only authenticates read-only Portal catalog access. User JWTs do not imply operator privileges. Newly registered users must first establish identity through Portal before they appear in access management.

A **publication** selects a ready deployment and its availability/expiry. It is not a user permission. Catalog and routes intersect publication eligibility with online Auth identity and per-user grants. Disabled, expired or unready publications deny access immediately. Permissions are never cached as an allow decision.

Migration 005 archives previous tenant installations under private `legacy_tenancy` and starts with no global publications. It does not translate old tenant permissions into wider access. The new checksummed, transactionally locked migration ledger prevents repeated startup migrations from recreating archived active tables. Historical migrations remain immutable. Operators must explicitly republish and grant after reviewing intended access.

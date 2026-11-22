# User and application administration

Admin owns app definitions, deployments, reviewed routes, global publications and runtime lifecycle. Auth owns identities and direct user/application grants. The console's application rows expose **Manage access**, listing existing platform users and app grants with translated labels. Grants and revocations go through Auth's private operator API. The browser receives no operator key; the server records the verified OIDC subject as the audit actor. Exact origin and session CSRF checks protect writes, and `ADMIN_ENABLE_OPERATOR=true` is required.

Set server-only `ADMIN_AUTH_URL` and `ADMIN_AUTH_OPERATOR_KEY` (at least 32 random characters, matching Auth's `SAAS_APP_OPERATOR_KEY`). Keep this separate from `ADMIN_PORTAL_KEY`, which only authenticates read-only Portal catalog access. User JWTs do not imply operator privileges. Newly registered users must first establish identity through Portal before they appear in access management.

A **publication** selects a ready deployment and its availability/expiry. It is not a user permission. Catalog and routes intersect publication eligibility with online Auth identity and per-user grants. Disabled, expired or unready publications deny access immediately. Permissions are never cached as an allow decision.

The initial migration creates the publication schema and moves any pre-existing tenant installations to the private `legacy_tenancy` schema. It preserves existing publications and leaves application access for each user to Auth grants. Operators upgrading from tenant installations must review intended access before republishing and granting it.

# Application access management

The app create/edit dialog includes business role definitions: key, display name, description and active state. Definitions live in Auth and use optimistic versions. There are no default business roles; configure each application's own keys. Removing/renaming/disabling a role revokes that role from existing grants. Manual grant management selects these definitions rather than accepting arbitrary role names.

`/en/requests` and `/zh/requests` show pending, approved, rejected or all access requests, with cursor pagination. Each request includes user identity, app, requested role keys, reason, time, reviewer and review comment. Approvals and rejections require a comment. The reviewer is derived from the verified, allowlisted operator's OIDC subject. A business app role named `admin` does not grant console access.

The console BFF delegates role configuration and decisions with its server-held Auth operator credential. Browser writes use the exact console origin, session CSRF token, bounded strict JSON, and idempotency keys. Auth commits a decision, grant and audit in one transaction. Repeated decisions conflict; identical retries replay. Approval merges roles into the currently enabled grant. Rejection never changes access. If a requested role was retired, reject and ask for a new selection.

Registry metadata and Auth roles belong to separate databases. Editing an app performs two idempotent writes. A role failure explicitly reports that metadata may have saved and asks the operator to reopen and retry. The approval/grant transaction does not share this limitation.

The private Portal-facing `/v1/discovery` endpoint returns all eligible publications, including those without grants; it requires the Portal key and a live user token. It returns only id/name/description/suffix, never deployment origins. `/v1/catalog` retains its authorized-only contract.

Requires SAA-11 plus Auth migration 004 and the new role/request APIs. Console acceptance: `Auth/.venv/bin/python integration/console.py --auth ../saas-auth --chromium <path>`. Full user/operator/SDK acceptance is in Portal's `integration/local-rollout.py`, which creates disposable databases and launches real Keycloak, Auth, Admin API/console, Portal and two packed SDK apps.

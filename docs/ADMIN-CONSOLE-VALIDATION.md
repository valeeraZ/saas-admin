# Admin console acceptance

Validated against a production Next.js build, real Keycloak 26.7.3 over verified TLS and PostgreSQL 17 in an isolated local Docker project. The browser harness uses installed Chromium through Playwright because the Browser plugin skill is not available in this session. Test containers, network and volume were removed successfully; existing project services and databases were not touched.

| Check                                                                                                                            | Result            |
| -------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Existing catalog unit tests, typecheck, format and unchanged generated contracts                                                 | PASS (6 tests)    |
| Console security and bilingual message parity tests, typecheck, production build                                                 | PASS (5 tests)    |
| Real operator login, concurrent session refresh, exact subject whitelist, logout and session revocation                          | PASS              |
| Persisted application creation/editing, immutable mount, forged actor rejection, CSRF/Origin and idempotent retry/conflict       | PASS              |
| Deployment registration/approval, pending installation rejection, installation grant, atomic replacement and terminal revocation | PASS              |
| Identity provider pause denies reads/writes; recovery restores valid access                                                      | PASS              |
| English/Chinese navigation and dialogs; 1440×900 desktop and 390×844 mobile without page overflow                                | PASS              |
| Browser page/runtime errors during normal management flows                                                                       | None              |
| Production dependency audit                                                                                                      | 0 vulnerabilities |

Run `integration/console.py` as described in the runbook to reproduce the acceptance and save desktop, mobile and dialog PNGs. Credentials, realm imports and raw logs stay in the private temporary directory; only screenshots are suitable for review attachments. The harness validates migrations twice to cover repeat application.

## Visual comparison

Compared the generated primary applications concept and actual browser screenshots with image inspection. The implementation retains the light sidebar, white main surface, indigo primary actions, system typography, table separators, heading hierarchy and application description rows. Status variants use semantic green for active/ready and neutral gray for other states. The real creation modal has localized labels, focused input, description field, mount field, active switch and create/cancel actions. The mobile layout retains localized controls and scrolls wide tables within the table container.

Intentional differences: one shared application icon replaces illustrative per-row icons; the language selector displays two accessible links; refresh, explicit search submission and record details are added; a success notice reflects a completed operation. UUID ordering and deployment counts come from the test database, rather than concept sample values. The concept's inset dialog becomes an invoked modal. Screenshots disable animations so transitions cannot masquerade as incorrect status colors.

## Scope and remaining coverage

Deployment approval is an operator attestation, not an artifact scanner or deployer. Tests do not deploy application workloads or modify a production realm. Auth tenant membership/role administration remains outside this console. Legacy readiness/route editing uses the existing shared command path; the browser acceptance focuses on the runtime Registry workflow. Search and 50-row keyset pagination are implemented but large-catalog browser pagination has not been included in this acceptance run. A separate console container/remote deployment remains optional infrastructure work; the documented deployment runs a Node process behind HTTPS ingress.

The shadcn CLI is a development dependency used by the generated stylesheet and has upstream development-tool dependency advisories. Production `npm audit --omit=dev` is clean. Avoid a forced audit downgrade of the CLI; review upstream updates separately. No identity credentials or session keys are included in the repository or browser bundle.

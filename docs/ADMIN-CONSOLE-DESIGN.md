# Admin console design contract

The console uses Next.js App Router, next-intl locale paths (`/zh`, `/en`), Tailwind semantic tokens and shadcn/ui primitives. It is a separate operator process in `web/`; the existing Portal-facing read service keeps its privileges and API.

Visual reference: generated primary applications screen, `exec-db07ac21-2075-4595-8636-854f4cb8ad04.png`. White main surface; light neutral sidebar; charcoal text; indigo primary accent; system sans; 8px controls. Desktop sidebar 216px, header 56px, main padding 28px, 32px page title. Full-width tables with row separators, search and one primary action. Mobile navigation collapses and tables scroll inside their own container.

Navigation is Applications / Deployments / Installations / Audit log. Language switch, operator identity and sign out remain available. Applications have create/edit fields for name, description, immutable mount and active status. Other pages extend the same table/dialog system; forms use shadcn Field, inputs, selects and switches. No metrics or illustration assets. The concept's inset form is a design reference; the implementation shows a real accessible modal when invoked.

All labels, placeholders, action names, status descriptions, dates, empty states and error messages come from bilingual message resources. Stored application names/descriptions and operational identifiers remain user data. Audit bodies are displayed as recorded data, not translated.

Writes reuse `apply()` for transactional validation, idempotency and audit. The actor comes from an independently authenticated, subject-allowlisted operator, never from browser input. Every page/API request checks the live identity provider. Mutation requires exact configured Origin, session-bound CSRF and a bounded JSON body. OIDC state/nonce/PKCE and server-side encrypted PostgreSQL sessions protect sign-in. Approval, replacement, revocation and installation changes require a review dialog; approval remains manual, not a synthetic health assertion.

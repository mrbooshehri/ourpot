# Couples’ Household Money Planning App — MVP Architecture

**Status:** MVP architecture resolved for planning; implementation in progress

## 1. Stack and deployment

- **Runtime/language:** TypeScript on Bun, which the current application already uses.
- **HTTP layer:** Bun HTTP server with typed request/response validation at the adapter boundary.
- **Database:** PostgreSQL.
- **Database access/migrations:** Bun SQL adapter with explicit SQL migrations and PostgreSQL constraints.
- **Tests:** Bun test runner for unit tests and a disposable PostgreSQL database for integration tests.
- **Identity:** Bun Argon2id password hashing, optional authenticator-app TOTP, and WebAuthn passkeys verified by SimpleWebAuthn.
- **Sessions:** PostgreSQL-backed, revocable sessions represented by opaque, HTTP-only cookies.
- **Web surface:** Responsive, mobile-friendly web client served by the application. Flutter Android/iOS clients are explicitly deferred from MVP.
- **Packaging:** Docker image for the application and Docker Compose for local development with PostgreSQL and the worker.
- **Deployment shape:** One web/API container, one PostgreSQL container or managed PostgreSQL service, and one scheduled worker process/container. External notification delivery is not part of MVP.

## 2. Modular monolith

Build one deployable application with explicit internal module boundaries. Modules communicate through application services and typed interfaces. A module must not reach into another module’s tables arbitrarily. Cross-module writes that must be atomic run in one database transaction.

Modules:

- **Identity and sessions:** users, password verification, TOTP/recovery codes, passkey ceremonies and credentials, session revocation, current user context.
- **Households and membership:** households, at most two active members, roles, invitations, membership lifecycle, access context.
- **Accounts:** account lifecycle, one household currency, opening balances, archive rules.
- **Transactions:** income, expenses, adjustments, linked transfers, validation, soft deletion.
- **Categories and budgets:** default/custom categories, budget proposals, comments, dual agreement, revisions.
- **Goals and wishes:** goals, wishlist items, standalone contributions, progress.
- **Tasks:** one-time required financial tasks, assignees, due dates, completion.
- **Subscriptions and reminders:** monthly/yearly subscriptions, renewal dates, idempotent in-app reminders.
- **Reporting:** household-scoped read queries for balances, member-entered totals, category spend, and budget status.
- **Audit:** immutable financial mutation events and household-scoped readers.

## 3. Request and authorization flow

1. Authentication establishes the user identity from an unexpired, unrevoked database session. The browser cannot choose the user with an identity header.
2. The request resolves the target household from route/context.
3. The membership service verifies active membership and role.
4. The application service receives an authorized `HouseholdContext`, never only a raw user-supplied household ID.
5. The service validates the command, performs the mutation, and writes the audit event in the same database transaction.
6. The response returns only records scoped to the authorized household.

Every repository method requires household scope. Object IDs are not authorization. Cross-household lookups return a safe not-found/forbidden result without exposing whether a record exists. Both members can mutate shared financial records; only the owner can manage membership and invitations.

### 3.1 Identity and session design

The identity module owns registration, password sign-in, pending MFA challenges, TOTP enrollment and verification, recovery codes, WebAuthn ceremonies, passkey credentials, and sessions. The household module owns membership. On each protected request, the HTTP adapter resolves a session, then the household module derives `HouseholdContext` from current active membership. All existing demo identity headers and setup routes are removed from the running app.

Passwords are hashed with Argon2id. TOTP secrets are encrypted at rest with an application key supplied through configuration, never logged or returned after enrollment. Recovery codes are randomly generated, stored as hashes, consumed atomically, and shown only once. TOTP verification accepts a narrow clock window, prevents reuse of the same time step, and limits attempts. Enrollment is inactive until a valid code confirms it. Passkeys use discoverable credentials and require user verification. Registration and authentication verify the one-use challenge, configured origin and relying-party ID; credentials store public key, credential ID, counter, transports, and user association. Passkey login creates a full session without a password or TOTP step.

Sessions use a cryptographically random token in an HTTP-only, SameSite cookie; PostgreSQL stores only its hash. The cookie is Secure under HTTPS, with an explicit localhost development exception. Sessions have server-enforced idle and absolute expiry, creation and last-used timestamps, and user-agent metadata. The Settings query is scoped to the authenticated user; revocation updates the row and takes effect on the next request. Revoking the current session clears its cookie. Security-method changes require recent password/MFA or passkey verification. Mutating HTTP requests require a same-origin check and CSRF defense. Authentication endpoints have attempt limits and generic credential errors.

## 4. Relational data model

Core tables:

- `users`
- `sessions`
- `totp_credentials`
- `recovery_codes`
- `passkey_credentials`
- `auth_challenges`
- `security_events`
- `households`
- `household_members`
- `invitations`
- `accounts`
- `categories`
- `transactions`
- `transfer_pairs`
- `budget_proposals`
- `budget_agreements`
- `budget_comments`
- `savings_goals`
- `goal_contributions`
- `wishlist_items`
- `financial_tasks`
- `subscriptions`
- `reminders`
- `audit_events`

Constraints and indexes:

- Foreign keys enforce relationships; active membership is unique per user and household.
- A household has one currency code and an IANA timezone.
- Money columns are positive integer minor units; type/status check constraints reject invalid values.
- A transfer pair has exactly one source and one destination account in the same household and cannot self-transfer.
- Soft-deleted transactions are excluded from normal reports but retained for auditability.
- Rows carry household ID where practical for efficient authorization and indexing.
- Index `(household_id, transaction_date)`, `(household_id, renewal_date)`, and membership/session lookup keys.
- Reminder uniqueness covers subscription, renewal date, lead time, and recipient.

Timestamps are UTC. Calendar periods, due dates, and reminder windows use the household timezone.

## 5. Money and accounting invariants

- Never use floating-point types for money.
- Store positive integer minor units; transaction type supplies direction/meaning.
- Income increases account balance and income totals.
- Expense decreases account balance and expense totals.
- Adjustment changes account balance but does not enter income/expense totals.
- Transfers move value between accounts and do not enter income/expense totals.
- Refunds are income transactions in the Refund category.
- Account balance equals opening balance plus non-deleted movements.
- All reports use the same movement and deletion rules.

## 6. Audit design

The audit module exposes an append-only writer used by mutation services. Each event includes event ID, UTC timestamp, actor user ID, household ID, entity type and ID, action, structured before/after data, and request correlation ID.

The audit insert commits with the financial mutation. Application users cannot update or delete audit rows. Readers are household-scoped and redact credentials or other secrets. Events are retained for 12 months.

## 7. Background work

A scheduled worker generates in-app renewal reminders. Generation is idempotent, retries are safe, and cancelled subscriptions do not create future reminders. The worker does not send email or push notifications in MVP.

## 8. API and application boundaries

Commands mutate state: create account, create transaction, create transfer, propose/discuss/agree budget, contribute to goal, complete task, and confirm renewal. Queries return household-scoped views: dashboard totals, transaction lists, balances, budget status, goals, tasks, subscriptions, reminders, and audit history.

Service methods accept an authenticated `HouseholdContext` and typed input. They return domain/application errors that the transport layer maps to stable responses. Transport code does not implement accounting rules or authorization decisions.

## 9. Testing and verification strategy

Tests must cover integer money arithmetic, transfer atomicity, refund/adjustment reporting, household isolation, removed-member and role checks, audit before/after data, dual budget agreement, soft deletion, invitation idempotency, reminder idempotency, and household-timezone date boundaries.

Use unit tests for state transitions and accounting calculations. Use database-backed integration tests for constraints, transactions, repositories, and access checks. Add endpoint tests for safe cross-household errors.

Authentication tests also cover password hashing/verification, TOTP enrollment and replay rejection, recovery-code one-time use, passkey challenge expiry and user verification, revoked/expired sessions, CSRF rejection, active membership on each request, and one user's inability to inspect or revoke another user's sessions. Browser tests cover password, MFA, passkey, and session-management flows on desktop and narrow viewports.

## 10. Docker and local development

The repository must include a `Dockerfile` and `docker-compose.yml`. Compose provides the web/API service, PostgreSQL, and the reminder worker with environment-based configuration and a persistent database volume. The application image runs migrations as an explicit startup/deployment step rather than silently changing the schema.

The Docker image must serve the responsive web app and API on a configurable port. The mobile-friendly web experience is tested in a narrow viewport; Flutter clients are not built or tested in MVP.

## 11. Deferred infrastructure choices

Hosting provider, production region, key management service, backup retention, recovery targets, observability vendor, and exact frontend component library are deferred. They do not block the MVP domain implementation or local integration tests.

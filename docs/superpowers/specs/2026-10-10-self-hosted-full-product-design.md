# Ourpot Self-Hosted Full Product Design

**Status:** Draft for review  
**Target:** Single-server Docker Compose deployment  
**Audience:** Couples and small households running their own installation

## 1. Product direction

Ourpot will grow from an MVP household money planner into a dependable self-hosted product. The product remains centered on two partners sharing one household, with both partners able to see household financial data and participate in planning.

The full product must preserve these foundations:

- Household-scoped access checks on every read and write.
- Integer minor-unit money values; no floating-point financial arithmetic.
- Transfers modeled separately from income and expenses.
- Audit history for financial and shared-planning changes.
- Shared visibility with separate entrant and household totals.
- English LTR and Persian/Arabic RTL support.
- Manual entry remains available even when imports are used.
- Local authentication with password, passkey, and optional MFA.

The deployment target is a single server running Docker Compose. SaaS billing, hosted multi-tenancy, and external identity providers are not product dependencies.

## 2. Full-product outcomes

A self-hosted operator can install and upgrade the application, configure email and push delivery, schedule encrypted backups, verify system health, and restore a household database using documented commands.

A couple can:

- Use the web app and Flutter Android/iOS clients.
- Record, edit, delete, and audit all household financial activity.
- Import CSV, OFX, or QIF files through a review and duplicate-detection flow.
- Receive in-app, email, web-push, and mobile-push reminders.
- Plan budgets, savings goals, wishes, tasks, and subscriptions with durable history.
- Export their data and understand how it is protected.

## 3. Delivery phases

### Phase 1: Durable financial core

Move the runtime accounting and planning services from in-memory state to PostgreSQL repositories and application services. Persist accounts, transactions, transfer pairs, budgets, comments, agreements, goals, wishes, contributions, tasks, subscriptions, reminders, and audit events.

Add transaction edit and soft-delete APIs, durable filters, durable dashboard/report queries, and database transactions for all financial invariants. Preserve the existing household authorization boundary in repository methods and service inputs.

Acceptance criteria:

- Restarting the web container preserves all household data.
- A transfer either updates both sides or neither side.
- Every edit and deletion records before/after audit data.
- Cross-household IDs never reveal or mutate another household.
- Reports use the same inclusion rules as the dashboard.

### Phase 2: Self-hosted operations

Provide a production-oriented Compose profile with persistent PostgreSQL storage, health/readiness checks, a reminder/notification worker, and explicit migration versioning.

Provide an operator panel and CLI/container commands for:

- Installation validation and environment checks.
- Migration status and upgrade execution.
- Scheduled PostgreSQL backups with configurable time, retention, and encryption key.
- Backup listing, integrity checks, and restore into a stopped or disposable database.
- Application logs, worker status, database connectivity, and notification delivery status.

Backups are local by default and written to a configured host-mounted directory. Off-site storage remains an operator responsibility in the first full-product release. The system must clearly report when backups are stale or unavailable.

### Phase 3: Notification platform

Create a durable notification model and delivery worker. A notification has a household/user recipient, event type, title, body, channel, status, attempt count, timestamps, and deduplication key.

Channels:

- In-app notification center, always available.
- SMTP email configured by the operator.
- Web push for supported browsers.
- Mobile push through a provider configured by the operator, with device tokens owned by each user.

Delivery is asynchronous and idempotent. Failed deliveries retry with backoff and remain visible to operators. User preferences can disable non-security notifications per channel while shared household rules still control whether both partners are recipients. Security notifications cannot be silently disabled.

Initial events include subscription renewals, task due/overdue reminders, budget threshold warnings, invitation activity, sign-in/security events, backup failures, and restore/migration failures visible to administrators.

### Phase 4: File import and reconciliation

Imports are user-initiated and never write directly to the ledger without review.

Flow:

1. Upload a CSV, OFX, or QIF file.
2. Detect format and show a preview.
3. Map account, date, amount, description, payee, and category fields.
4. Normalize amounts into integer minor units using the household currency.
5. Detect likely duplicates using account, date, amount, and normalized description fingerprints.
6. Let the user accept, skip, edit, or categorize rows.
7. Commit accepted rows in one audited import operation.

Imported rows keep source-file and import-batch metadata. The import can be cancelled before commit. Duplicate decisions are preserved for later review. Direct bank synchronization is deferred until the import model proves reliable.

### Phase 5: Flutter clients

Build Flutter Android and iOS clients against the versioned HTTP API. The web app remains the primary self-hosted administration and recovery surface.

The mobile clients provide:

- Local password, passkey, and MFA sign-in.
- Household dashboard, accounts, transactions, and transfer entry.
- Budgets, goals, wishes, tasks, subscriptions, and reminders.
- Push-token registration and notification deep links.
- A read cache for previously loaded household data.
- A queued-write model for selected manual entries when offline.

Offline writes use client-generated idempotency keys and are reconciled by the server. The server remains authoritative. Conflicts are shown to the user rather than silently overwritten.

## 4. Architecture evolution

Keep the modular monolith and add explicit infrastructure modules:

- **Financial persistence:** PostgreSQL repositories for accounts, transactions, transfers, reports, and audit events.
- **Planning persistence:** repositories for budgets, goals, wishes, tasks, subscriptions, and reminders.
- **Notifications:** event creation, preference evaluation, channel adapters, retry worker, and delivery status.
- **Imports:** parsers, normalization, duplicate detection, review batches, and commit service.
- **Operations:** migrations, health checks, backup/restore commands, operator diagnostics, and configuration validation.
- **API versioning:** stable `/api/v1` resource contracts shared by web and Flutter clients.

Domain services continue to accept an authorized `HouseholdContext`. Repositories never trust user-supplied household IDs without membership predicates. Cross-module side effects use an outbox table so financial commits and notification events are durable together.

## 5. Data model additions

Add or extend these relational areas:

- `notification_preferences`, `notifications`, `notification_deliveries`, `device_push_tokens`
- `backup_runs`, `backup_artifacts`, `restore_runs`
- `import_batches`, `import_rows`, `import_matches`
- `idempotency_keys`, `outbox_events`
- `transaction_revisions` or equivalent structured audit projections
- `api_keys` only if an operator integration later requires them; not required for the first full-product phase

Every new household-owned table includes a household key or a direct path to one, foreign keys, active membership predicates in repository queries, timestamps, and appropriate indexes. Secrets such as SMTP credentials, push provider credentials, backup encryption keys, passkey material, and TOTP secrets are never stored in ordinary application logs.

## 6. Security and recovery

Local authentication remains the default. Passwords use Argon2id; passkeys and optional authenticator MFA remain supported. Add account recovery using operator-issued recovery codes or a deliberate administrator reset workflow; do not add an unaudited password bypass.

The operator must be able to rotate encryption and notification secrets with documented downtime or migration steps. Backup encryption keys are supplied through environment or mounted secret files and are never stored in the database unencrypted.

Push tokens are revocable per device. Email addresses are used for delivery but are not proof of household ownership unless the operator enables a future verification flow.

## 7. API and compatibility

Introduce `/api/v1` without breaking the current web client during migration. Responses use stable identifiers, ISO dates, integer amounts, explicit pagination, and consistent error objects. Mutating endpoints accept idempotency keys where retries can duplicate a financial operation.

Flutter and web clients share authentication/session semantics. Notifications contain deep-link targets that are authorized again when opened; a notification never grants access by itself.

## 8. Testing strategy

Add tests for:

- Durable repository persistence across application instances and restarts.
- PostgreSQL constraints, transactions, indexes, and household isolation.
- Idempotent financial writes and outbox processing.
- Backup creation, retention, encryption, integrity checks, and restore drills.
- SMTP, web-push, and mobile-push retry behavior with fake providers.
- Notification preference and both-partner recipient rules.
- CSV/OFX/QIF parsing, mapping, integer conversion, duplicate detection, cancellation, and audited commit.
- API version compatibility and pagination.
- Flutter authentication, offline queue retry, conflict display, and notification deep links.
- RTL, narrow layouts, accessibility, and mobile navigation.

A release is not complete until a disposable Compose deployment can be installed, migrated, backed up, restored, and exercised through web and API smoke tests.

## 9. Decisions made for this design

- Deployment: single-server Docker Compose.
- Client roadmap: responsive web plus Flutter Android/iOS.
- Authentication: local accounts, passwords, passkeys, optional MFA; no OIDC dependency.
- Notifications: in-app, SMTP email, web push, and mobile push.
- Backups: built-in scheduled PostgreSQL backups with retention and restore commands.
- Imports: CSV/OFX/QIF first; direct bank integrations later.
- SaaS billing and hosted multi-tenancy: out of scope for this product direction.

## 10. Decisions still required before implementation planning

1. Which SMTP and mobile-push provider configurations should be supported first: generic SMTP plus a generic Web Push/VAPID setup, or named providers with setup guides?
2. Should backup encryption use a passphrase entered by the operator, a mounted key file, or support both?
3. What default backup schedule and retention should a new installation use?
4. Should the operator panel be accessible only to the root administrator, or should a separate deployment administrator role exist?
5. Which import formats are required in the first import release: CSV only, CSV plus OFX, or CSV plus OFX plus QIF?
6. Should offline mobile writes be limited to transactions initially, or include accounts and planning records?
7. What data export formats should the product provide: JSON, CSV, or a complete PostgreSQL-compatible archive?

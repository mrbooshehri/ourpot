# Self-Hosted Full Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current household finance MVP into a durable self-hosted product with PostgreSQL persistence, operations tooling, multi-channel notifications, file imports, and Flutter clients.

**Architecture:** Keep the modular monolith, but make PostgreSQL the runtime source of truth for financial and planning data. Add an outbox-driven notification worker, operator backup/restore commands, reviewed import batches, and a versioned `/api/v1` boundary consumed by the web app and later Flutter clients.

**Tech Stack:** Bun, TypeScript, PostgreSQL, SQL migrations, Docker Compose, native responsive web UI, Flutter/Dart clients, SMTP, Web Push/VAPID, and provider-agnostic mobile push adapters.

**Spec:** `docs/superpowers/specs/2026-10-10-self-hosted-full-product-design.md`

## Global Constraints

- The product targets a single-server Docker Compose installation.
- Both partners can view household accounts and transactions; every household read and write requires active membership.
- Store money as integer minor units and never use floating-point arithmetic for financial values.
- Transfers remain separate from income and expenses.
- Every financial and shared-planning mutation creates an audit event.
- Local password, passkey, and optional MFA authentication remain supported; OIDC is not required.
- The responsive web app remains available; Flutter Android/iOS clients use the same versioned API.
- In-app, SMTP email, web push, and mobile push are supported through asynchronous, retryable delivery.
- Manual entry remains available when imports are enabled.
- English is LTR; Persian and Arabic are RTL.
- Use TDD, focused checks after each task, and a full suite before each phase commit.

## Planning Defaults

These defaults resolve the design document’s remaining implementation choices unless the user changes them during review:

- First notification integrations: generic SMTP and generic Web Push/VAPID configuration; mobile push uses an adapter interface with one provider implementation added after the device-token contract.
- Backup encryption accepts either `BACKUP_ENCRYPTION_PASSPHRASE` or a mounted `BACKUP_ENCRYPTION_KEY_FILE`.
- Default backup schedule: 02:00 server time daily; retention: 7 daily, 4 weekly, and 12 monthly artifacts.
- The existing root administrator is the initial operator role; a separate deployment-admin role is deferred.
- First import release supports CSV, OFX, and QIF.
- Offline mobile writes initially cover manual transactions and transfers only.
- First export release provides JSON and CSV; a full PostgreSQL archive remains an operator backup/restore function.

## Review Focus

- A restarted web container must see the same balances, planning records, and audit events; covered by Task 2 persistence restart tests.
- A retried transfer or mobile write must not duplicate money; covered by Task 3 idempotency and atomicity tests.
- A failed email/push delivery must retry without duplicate user-visible notifications; covered by Task 5 delivery tests.
- An import row with a date-boundary, refund, transfer, decimal amount, or duplicate fingerprint must be previewed correctly before commit; covered by Task 6 parser/import tests.
- A restore must reject an incorrect key or incompatible schema before replacing data; covered by Task 7 backup/restore tests.

## File Map

- `src/db/migrations.ts`, `migrations/0008+`: migration tracking and new relational tables.
- `src/modules/transactions/postgres-service.ts`, `src/modules/planning/postgres-service.ts`: runtime durable domain services.
- `src/modules/outbox/`, `src/modules/notifications/`: durable events, preferences, channel adapters, retries.
- `src/modules/operations/`: health, backups, restore, and operator diagnostics.
- `src/modules/imports/`: parsers, normalization, duplicate detection, review batches, and commit.
- `src/http/api-v1.ts`: versioned API adapter; existing routes remain during migration.
- `web/` or existing `src/http/web.*`: web updates and notification/import/operator views.
- `mobile/`: Flutter workspace, shared API models, auth, offline transaction queue, and push registration.
- `tests/unit`, `tests/integration`, `tests/http`, `tests/e2e`: focused tests for each module and full journeys.

---

### Task 1: Establish migration tracking and durable repository contracts

**Files:**
- Create: `src/db/migrations.ts`, `migrations/0008_migration_tracking.sql`
- Modify: `src/db/schema.ts`, `src/db/client.ts`, `docker-compose.yml`, `docs/operations.md`
- Test: `tests/integration/migrations.test.ts`, `tests/unit/repositories.test.ts`

**Interfaces:**
- `MigrationRunner.applyPending(db): Promise<MigrationResult[]>`
- Repository methods require `HouseholdContext` and return typed views.

- [ ] Write failing tests for ordered migration application, repeat-safe execution, and a repository query that requires a household predicate.
- [ ] Run focused migration/repository tests and confirm failure.
- [ ] Add migration tracking, explicit startup/deployment commands, and repository interfaces without switching runtime services yet.
- [ ] Run tests, typecheck, and migration SQL checks; commit `feat: establish durable migration contracts`.

### Task 2: Move accounts, transactions, transfers, and audit history to PostgreSQL

**Files:**
- Create: `migrations/0009_financial_runtime.sql`, `src/modules/transactions/postgres-service.ts`
- Modify: `src/http/api.ts`, `src/modules/transactions/service.ts`, `src/db/postgres-repositories.ts`
- Test: `tests/integration/financial-persistence.test.ts`, `tests/e2e/mvp-journey.test.ts`

**Interfaces:**
- `PostgresTransactionService.createIncome(context, input): Promise<TransactionView>`
- `PostgresTransactionService.createExpense(context, input): Promise<TransactionView>`
- `PostgresTransactionService.createTransfer(context, input): Promise<TransferView>`
- `PostgresTransactionService.updateTransaction(context, id, patch): Promise<TransactionView>`
- `PostgresTransactionService.deleteTransaction(context, id): Promise<void>`
- `PostgresTransactionService.getDashboard(context): Promise<DashboardLedgerView>`

- [ ] Add failing restart, edit, delete, negative-balance, transfer-atomicity, and cross-household tests.
- [ ] Run them against PostgreSQL and confirm the runtime service is not yet durable.
- [ ] Implement repository transactions, database constraints, audit inserts, and API wiring behind existing routes.
- [ ] Run the full financial and HTTP suites, then verify a fresh app instance reads prior data; commit `feat: persist household ledger`.

### Task 3: Persist budgets, goals, wishes, tasks, subscriptions, reminders, and rules

**Files:**
- Create: `migrations/0010_planning_runtime.sql`, `src/modules/planning/postgres-service.ts`, `src/modules/tasks/postgres-service.ts`
- Modify: `src/http/api.ts`, `src/modules/planning/service.ts`, `src/modules/tasks-subscriptions.ts`, `src/modules/rules.ts`
- Test: `tests/integration/planning-persistence.test.ts`, `tests/integration/reminders-persistence.test.ts`, `tests/e2e/mvp-journey.test.ts`

**Interfaces:**
- `PostgresPlanningService.listDashboard(context): Promise<PlanningDashboardView>`
- `PostgresTaskSubscriptionService.generateReminders(context, now): Promise<ReminderView[]>`
- `RulesService.get/update` remains household-scoped and audited.

- [ ] Add failing restart and agreement/reminder idempotency tests.
- [ ] Run focused tests and confirm in-memory planning is still being used.
- [ ] Implement durable repositories, dual approval transitions, task completion actor tracking, subscription ownership, and reminder uniqueness.
- [ ] Run full planning, reminder, rules, and end-to-end suites; commit `feat: persist household planning`.

### Task 4: Add outbox events and notification preferences

**Files:**
- Create: `migrations/0011_outbox_notifications.sql`, `src/modules/outbox/service.ts`, `src/modules/notifications/service.ts`
- Modify: `src/modules/transactions/postgres-service.ts`, `src/modules/planning/postgres-service.ts`, `src/modules/rules.ts`, `src/db/schema.ts`
- Test: `tests/unit/notifications.test.ts`, `tests/integration/outbox.test.ts`, `tests/http/notifications-api.test.ts`

**Interfaces:**
- `OutboxService.append(event): Promise<void>`
- `NotificationService.createForEvent(event): Promise<void>`
- `NotificationService.listForUser(userId, page): Promise<NotificationPage>`
- `NotificationService.markRead(userId, notificationId): Promise<void>`

- [ ] Add failing tests for transaction-commit/outbox atomicity, both-partner recipients, unread counts, and notification deduplication.
- [ ] Run focused tests and confirm the tables/services are absent.
- [ ] Implement outbox writes in the same transaction as domain mutations and user notification preferences.
- [ ] Run notification and financial suites; commit `feat: add notification outbox`.

### Task 5: Implement SMTP, web-push, mobile-push adapters and worker retries

**Files:**
- Create: `src/modules/notifications/smtp.ts`, `src/modules/notifications/web-push.ts`, `src/modules/notifications/mobile-push.ts`, `src/workers/notification-worker.ts`
- Modify: `docker-compose.yml`, `src/config.ts`, `src/server.ts`, `src/http/api-v1.ts`
- Test: `tests/unit/notification-adapters.test.ts`, `tests/integration/notification-worker.test.ts`

**Interfaces:**
- `NotificationChannel.send(message): Promise<DeliveryResult>`
- `NotificationWorker.processBatch(limit): Promise<WorkerResult>`
- `POST /api/v1/devices` and `DELETE /api/v1/devices/:id`

- [ ] Add failing fake-provider tests for retry backoff, permanent failures, provider timeouts, device revocation, and idempotent delivery.
- [ ] Implement generic SMTP/VAPID configuration and a mobile adapter boundary; keep credentials out of logs.
- [ ] Add worker health and delivery status to the operator API.
- [ ] Run worker, API, typecheck, and Compose checks; commit `feat: deliver household notifications`.

### Task 6: Add CSV, OFX, and QIF import review and commit

**Files:**
- Create: `migrations/0012_import_batches.sql`, `src/modules/imports/types.ts`, `src/modules/imports/parsers.ts`, `src/modules/imports/service.ts`
- Modify: `src/http/api-v1.ts`, `src/http/web.html`, `src/http/web.js`
- Test: `tests/unit/import-parsers.test.ts`, `tests/integration/imports.test.ts`, `tests/http/imports-api.test.ts`

**Interfaces:**
- `parseImport(file): ImportPreview`
- `ImportService.createBatch(context, input): Promise<ImportBatchView>`
- `ImportService.reviewRow(context, batchId, rowId, decision): Promise<ImportRowView>`
- `ImportService.commitBatch(context, batchId): Promise<ImportCommitResult>`

- [ ] Add failing parser tests for all three formats, integer conversion, refunds, transfers, timezone dates, malformed rows, and duplicate fingerprints.
- [ ] Run parser/API tests and confirm failure.
- [ ] Implement preview-only parsing, mapping, duplicate review, audited commit, cancellation, and source metadata.
- [ ] Run import, ledger, and end-to-end tests; commit `feat: add reviewed financial imports`.

### Task 7: Add self-hosted health, backups, retention, and restore tooling

**Files:**
- Create: `src/modules/operations/health.ts`, `src/modules/operations/backups.ts`, `src/cli/backup.ts`, `src/cli/restore.ts`, `migrations/0013_operations.sql`
- Modify: `docker-compose.yml`, `Dockerfile`, `src/http/api-v1.ts`, `docs/operations.md`
- Test: `tests/integration/backup-restore.test.ts`, `tests/http/operations-api.test.ts`, `tests/e2e/compose-smoke.test.ts`

**Interfaces:**
- `BackupService.create(options): Promise<BackupArtifact>`
- `BackupService.list(): Promise<BackupArtifact[]>`
- `BackupService.restore(artifact, key): Promise<RestoreResult>`
- `HealthService.readiness(): Promise<ReadinessReport>`

- [ ] Add failing tests for encrypted artifact creation, retention deletion, wrong-key rejection, incompatible schema rejection, and restore validation before replacement.
- [ ] Implement daily 02:00 schedule, 7/4/12 retention, passphrase or key-file encryption, restore CLI, and health/readiness endpoints.
- [ ] Add operator panel status and Compose volume/worker configuration.
- [ ] Run backup drills against a disposable PostgreSQL database; commit `feat: add self-hosted backup operations`.

### Task 8: Version the HTTP API and add JSON/CSV export

**Files:**
- Create: `src/http/api-v1.ts`, `src/modules/exports/service.ts`
- Modify: `src/http/api.ts`, `src/http/web.js`, `src/http/web.html`
- Test: `tests/http/api-v1.test.ts`, `tests/integration/exports.test.ts`

**Interfaces:**
- `GET /api/v1/dashboard`
- `GET /api/v1/reports`
- `GET /api/v1/notifications`
- `GET /api/v1/export?format=json|csv`

- [ ] Add failing contract tests for versioned responses, pagination, integer amounts, authorization, and JSON/CSV exports.
- [ ] Implement adapters over durable services without duplicating domain logic.
- [ ] Run API contract, export, and browser tests; commit `feat: version household API`.

### Task 9: Scaffold Flutter clients with shared auth and read flows

**Files:**
- Create: `mobile/pubspec.yaml`, `mobile/lib/`, `mobile/test/`, `mobile/README.md`
- Modify: `docs/architecture.md`, `docker-compose.yml` only if a mobile development profile is needed
- Test: Flutter unit/widget tests and API contract tests

**Interfaces:**
- `ApiClient` for `/api/v1` with cookie/token session handling.
- `AuthRepository` for password, MFA, and passkey flows.
- `HouseholdRepository` for dashboard, accounts, transactions, planning, and notifications.

- [ ] Add failing Dart tests for API decoding, auth states, RTL locale selection, and notification deep-link authorization.
- [ ] Implement login, household read cache, dashboard, account/transaction entry, and notification registration.
- [ ] Add offline transaction/transfer queue with idempotency keys and explicit conflict states.
- [ ] Run Flutter analyze/test and API contract tests; commit `feat: add Flutter household clients`.

### Task 10: Release hardening and operator documentation

**Files:**
- Modify: `README.md`, `docs/product-spec.md`, `docs/architecture.md`, `docs/operations.md`, `docs/security.md`
- Create: `docs/release-checklist.md`
- Test: full Bun suite, Flutter suite, Docker Compose install/upgrade/restore smoke tests

- [ ] Document environment variables, SMTP/VAPID/mobile-push setup, backup keys, import workflow, restore workflow, and upgrade order.
- [ ] Run migration application from an empty volume and upgrade from the previous schema.
- [ ] Run `bun test`, `bun run typecheck`, browser build, Flutter analyze/test, `docker compose build`, install, backup, restore, and smoke checks.
- [ ] Review `git diff --check`, secrets/log output, external references, and accessibility/RTL checks.
- [ ] Commit `docs: document full product operations`.

# Household Money MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive web MVP where two partners share household accounts, manually record money movements, plan budgets and goals, manage tasks and subscriptions, and trust household-scoped audit history.

**Architecture:** TypeScript/Fastify modular monolith backed by PostgreSQL and Drizzle migrations. Domain modules expose typed application services; every command receives an authorized household context and writes audit data in the same transaction.

**Tech Stack:** TypeScript, Node.js LTS, Fastify, PostgreSQL, Drizzle ORM/migrations, Vitest, secure cookie sessions.

**Spec:** `docs/product-spec.md` and `docs/architecture.md`

## Global Constraints

- Exactly two members per household; one household per user in MVP.
- Both members can view and mutate shared financial records; only the owner manages membership and invitations.
- Store positive integer minor-unit money; never use floating-point money.
- Transfers are atomic linked movements and excluded from income/expense totals.
- Refunds are income in the `Refund` category; adjustments affect balances only.
- Monthly budgets use household IANA timezone and require agreement from both members.
- Tasks are one-time; subscriptions are monthly or yearly with in-app reminders at 30 and 7 days.
- Every financial mutation writes an append-only, household-scoped audit event in the same transaction.
- Manual entry only; no bank/card integrations, external notifications, exports, reconciliation, or recurring transaction creation.
- MVP web UI must be responsive and mobile-friendly; Flutter Android/iOS clients are deferred.
- Package the app with a Dockerfile and Docker Compose for the web/API, PostgreSQL, and reminder worker.

## Review Focus

- Cross-household IDs must never return another household’s data; test this in each repository and endpoint owner.
- A transfer failure must leave both account balances unchanged; test transaction rollback in the ledger task.
- Repeated reminder or invitation requests must be idempotent; test unique constraints and retry behavior in their owning tasks.
- Household timezone boundaries must assign dates and reminder windows predictably; test daylight and month boundaries in reporting/reminder tasks.
- Soft-deleted and adjustment records must not distort income/expense totals; test report consistency in the ledger/reporting task.

---

### Task 1: Project foundation and shared primitives

**Files:**
- Create: `package.json`, `tsconfig.json`, `src/app.ts`, `src/config.ts`, `src/shared/errors.ts`, `src/shared/money.ts`, `src/shared/household-context.ts`
- Create: `src/db/client.ts`, `src/db/schema.ts`, `drizzle.config.ts`
- Create: `tests/unit/money.test.ts`, `tests/unit/household-context.test.ts`

**Interfaces:**
- Produces `MoneyMinorUnit` branded/type-safe value helpers, `HouseholdContext`, stable application error types, database client factory, and module registration point.

- [ ] **Step 1: Write failing money tests** for positive integer validation, zero, rejected negative/floating values, addition/subtraction, and currency precision.
- [ ] **Step 2: Run `npm test -- money.test.ts` and verify the tests fail because primitives are absent.**
- [ ] **Step 3: Implement the money value helpers and error types** with integer-only arithmetic and no floating-point conversion.
- [ ] **Step 4: Write and run household-context tests** proving an active member context is required and role checks distinguish owner/member.
- [ ] **Step 5: Add TypeScript/Fastify/Drizzle/Vitest configuration and database client wiring** without domain tables or feature routes.
- [ ] **Step 6: Run `npm test` and `npm run typecheck`; verify PASS.**

### Task 2: Identity, households, membership, and invitations

**Files:**
- Create: `src/modules/identity/*`, `src/modules/households/*`, `src/modules/households/household-repository.ts`
- Modify: `src/db/schema.ts`, `src/app.ts`
- Create: `tests/integration/identity-households.test.ts`, `tests/integration/access-control.test.ts`

**Interfaces:**
- Produces session authentication, `getHouseholdContext(sessionId, householdId)`, owner-only membership commands, invitation acceptance idempotency, and household-scoped repository patterns.

- [ ] **Step 1: Write failing integration tests** for registration/login, session revocation, household creation, seven-day invitation expiry, acceptance idempotency, exactly two members, owner/member permissions, and removed-member isolation.
- [ ] **Step 2: Run the integration tests against disposable PostgreSQL and verify schema/service failures.**
- [ ] **Step 3: Add identity, session, household, membership, and invitation tables with foreign keys and unique constraints.**
- [ ] **Step 4: Implement password hashing, secure cookie sessions, membership context loading, and owner-only membership commands.**
- [ ] **Step 5: Add audit events for household and membership mutations and safe cross-household error mapping.**
- [ ] **Step 6: Run the focused integration tests and typecheck; verify PASS.**

### Task 3: Accounts, categories, ledger, transfers, and audit

**Files:**
- Create: `src/modules/accounts/*`, `src/modules/transactions/*`, `src/modules/categories/*`, `src/modules/audit/*`
- Create: `src/modules/reporting/ledger-read-model.ts`
- Modify: `src/db/schema.ts`, `src/app.ts`
- Create: `tests/integration/ledger.test.ts`, `tests/integration/audit.test.ts`

**Interfaces:**
- Produces commands `createAccount`, `archiveAccount`, `createIncome`, `createExpense`, `createAdjustment`, `createTransfer`, `updateTransaction`, `softDeleteTransaction`; queries for account balances and transaction lists; append-only audit writer.

- [ ] **Step 1: Write failing tests** for account lifecycle, positive minor-unit validation, income/expense/refund/adjustment accounting, soft deletion, category filters, entrant totals, transfer atomicity, self-transfer rejection, and audit before/after data.
- [ ] **Step 2: Run the focused integration tests and verify failures.**
- [ ] **Step 3: Add account, category, transaction, transfer-pair, and audit tables with PostgreSQL constraints and indexes.**
- [ ] **Step 4: Implement ledger commands and atomic transfer transaction with household context on every repository call.**
- [ ] **Step 5: Implement account balance, transaction list, member-entered totals, and household totals read queries.**
- [ ] **Step 6: Run ledger, audit, access-control, and typecheck commands; verify PASS.**

### Task 4: Budgets, goals, and wishlist

**Files:**
- Create: `src/modules/budgets/*`, `src/modules/goals/*`, `src/modules/wishes/*`
- Modify: `src/db/schema.ts`, `src/app.ts`
- Create: `tests/integration/planning.test.ts`

**Interfaces:**
- Produces budget proposal/comment/agreement commands, agreed-budget read model, goal and standalone contribution commands, wishlist-to-goal conversion, and household-scoped planning queries.

- [ ] **Step 1: Write failing tests** for monthly period validation, proposed/discussed/agreed/rejected/withdrawn transitions, both-member agreement, revision preservation, budget spend status, goal progress, and wish conversion history.
- [ ] **Step 2: Run the focused tests and verify failures.**
- [ ] **Step 3: Add planning tables, status checks, agreement uniqueness, and revision constraints.**
- [ ] **Step 4: Implement budget and goal/wishlist services with audit events and household timezone period calculation.**
- [ ] **Step 5: Run the focused tests plus cross-household tests; verify PASS.**

### Task 5: Required tasks, subscriptions, reminders, and dashboard API

**Files:**
- Create: `src/modules/tasks/*`, `src/modules/subscriptions/*`, `src/modules/reminders/*`, `src/modules/reporting/*`
- Modify: `src/db/schema.ts`, `src/app.ts`
- Create: `tests/integration/tasks-subscriptions.test.ts`, `tests/integration/reporting.test.ts`

**Interfaces:**
- Produces one-time task commands and due/overdue queries; monthly/yearly subscription commands; idempotent reminder generator; dashboard query combining balances, totals, categories, budgets, goals, tasks, and reminders.

- [ ] **Step 1: Write failing tests** for task assignment/completion, due and overdue dates, subscription cadence validation, renewal confirmation, 30/7-day reminders, cancellation suppression, retry idempotency, and timezone boundaries.
- [ ] **Step 2: Run focused tests and verify failures.**
- [ ] **Step 3: Add task, subscription, reminder tables and uniqueness constraints.**
- [ ] **Step 4: Implement task and subscription services plus retry-safe reminder worker.**
- [ ] **Step 5: Implement household-scoped dashboard query and API routes with stable error responses.**
- [ ] **Step 6: Run all integration tests and typecheck; verify PASS.**

### Task 6: Responsive web surface and release verification

**Files:**
- Create: `src/web/*`, `Dockerfile`, `docker-compose.yml`, `tests/e2e/mvp-journey.test.ts`, `docs/operations.md`
- Modify: `src/app.ts`, `README.md`

**Interfaces:**
- Consumes the application services and dashboard query from Tasks 1–5; produces responsive screens for household setup, ledger entry, dashboard, budgets, goals, tasks, subscriptions, and audit visibility.

- [ ] **Step 1: Write an end-to-end test** covering invite, expense, transfer, budget agreement, goal contribution, task completion, and reminder appearance.
- [ ] **Step 2: Implement accessible responsive views and forms** with explicit entrant labels, totals labels, validation errors, and loading/error states.
- [ ] **Step 3: Run the end-to-end test and fix failures until PASS.**
- [ ] **Step 4: Add the Dockerfile and Docker Compose services** for the web/API, PostgreSQL, and reminder worker; document migration, backup, restore, and rollback instructions in `docs/operations.md`.
- [ ] **Step 5: Run the full test suite, typecheck, migration check, and production build; verify PASS.**

## Plan self-review

- Product features map to Tasks 2–6; accounting invariants map to Task 3; access and audit requirements map to Tasks 2–3 and the review focus tests.
- All cross-task interfaces are named in each task’s Interfaces block.
- Deferred integrations and infrastructure choices are excluded from the plan.
- No implementation step is authorized until the user approves this plan.

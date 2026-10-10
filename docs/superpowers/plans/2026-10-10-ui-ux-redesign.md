# Household Finance UI and Navigation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-panel authenticated web experience with a responsive, accessible household finance application containing Dashboard, Reports, Profile, Settings, and Rules pages using locally bundled Tabler icons.

**Architecture:** Keep the modular monolith and plain Bun-served web assets. Add page-oriented query methods at the HTTP boundary while keeping accounting, household authorization, profile security, and notification-rule decisions in domain services. Use shared report calculations for Dashboard and Reports so both pages apply identical inclusion rules.

**Tech Stack:** Bun, TypeScript, PostgreSQL, existing HTTP API, native HTML/CSS/JavaScript, local Tabler outline SVG assets, and the existing Bun test suite.

**Spec:** `docs/superpowers/specs/2026-10-10-ui-ux-redesign-design.md`

## Global Constraints

- Both active household members can view household financial data; every household read and write requires active membership checks.
- Store money as integer minor units; never use floating-point arithmetic for financial values.
- Household totals combine both partners; partner totals are grouped by transaction entrant and do not represent ownership, reimbursement, or debt.
- Transfers are excluded from income and expense totals; opening balances affect account balance but are not income.
- English uses LTR; Persian and Arabic use RTL; CSS uses logical properties.
- MVP notifications are in-app only; do not add email, push, bank, card, or automatic transaction integrations.
- Tabler icons are bundled locally as accessible SVGs; icon-only controls require an accessible name.
- Use test-first changes and run the full suite after each task group.

## Review Focus

- A one-member household must show a waiting-for-partner state while combined totals still work; covered in the dashboard query/UI task.
- A date range crossing month, timezone, or daylight-saving boundaries must include the correct transaction dates; covered in the reports query task.
- Transfers, opening balances, deleted transactions, adjustments, and refunds must retain the established reporting semantics; covered in the shared report-calculation task.
- A user must never read or mutate another household’s reports or rules, and personal security data must remain user-scoped; covered in API authorization tests for reports and rules/profile.
- RTL layouts must preserve icon alignment, chart labels, and accessible text at mobile widths; covered in responsive asset/UI checks and LTR/RTL browser asset tests.

## File Map

- Create `src/http/icons.ts` and `src/http/icons/*.svg`: local Tabler icon registry and selected SVG assets.
- Modify `src/http/web.html`, `src/http/web.js`, and `src/http/web.css`: navigation shell, page containers, responsive layout, accessible icon labels, and page rendering.
- Modify `src/http/api.ts`: page-oriented report, profile, settings, and rules endpoints.
- Create `src/modules/reports/service.ts` and `src/modules/reports/types.ts`: shared date-range and financial report calculations.
- Modify `src/modules/transactions/service.ts` and `src/db/postgres-repositories.ts`: transaction/category/account report query interfaces and durable implementations.
- Create `src/modules/rules/service.ts` and `migrations/0007_notification_rules.sql`: household reminder preferences and rule validation.
- Modify `src/modules/identity/repository.ts` and `src/modules/identity/service.ts`: profile display-name/password/security query boundaries where needed.
- Modify `docs/product-spec.md`, `docs/architecture.md`, and `docs/operations.md`: page behavior, rule semantics, icon assets, and migration/run instructions.
- Add focused tests under `tests/http`, `tests/integration`, and `tests/unit` for every new service and endpoint.

### Task 1: Add the local icon registry and responsive navigation shell

**Files:**
- Create: `src/http/icons.ts`
- Create: `src/http/icons/*.svg`
- Modify: `src/http/web.html`
- Modify: `src/http/web.js`
- Modify: `src/http/web.css`
- Test: `tests/http/api.test.ts`

**Interfaces:**
- `icon(name: IconName, label?: string): string` returns a safe inline SVG string with an accessible label when required.
- Navigation uses page keys `dashboard`, `reports`, `profile`, `settings`, and `rules`; root administrators retain `admin`.

- [ ] **Step 1: Write the failing asset and navigation tests** asserting the served page contains the five page targets, local Tabler SVG markup, visible labels, and no external icon CDN.
- [ ] **Step 2: Run `docker run --rm --network ourpot_default ... bun test tests/http/api.test.ts` and verify the new assertions fail.**
- [ ] **Step 3: Add the selected Tabler SVG assets and implement the registry.** Use `layout-dashboard`, `chart-bar`, `user-circle`, `settings`, and `bell-ringing`; keep `wallet`, `arrows-transfer-up-down`, and `calendar-dollar` ready for later navigation grouping.
- [ ] **Step 4: Replace the current button-only navigation with responsive page navigation and page containers.** Preserve auth, setup, admin, and logout behavior.
- [ ] **Step 5: Run the focused HTTP test and browser build; expect PASS and a successful Bun bundle.**
- [ ] **Step 6: Commit `feat: add responsive icon navigation`.**

### Task 2: Separate Profile and Settings while preserving security behavior

**Files:**
- Modify: `src/http/web.html`, `src/http/web.js`, `src/http/web.css`
- Modify: `src/http/api.ts`
- Modify: `src/modules/identity/repository.ts`, `src/modules/identity/service.ts`
- Test: `tests/http/auth-api.test.ts`, `tests/integration/auth-sessions.test.ts`

**Interfaces:**
- `GET /api/profile` returns the authenticated user’s `displayName`, `email`, and security summary.
- `PATCH /api/profile` updates only the authenticated user’s display name.
- Existing MFA, passkey, recovery-code, password, language, and session endpoints remain available under Profile/Settings with their current authorization.

- [ ] **Step 1: Add failing profile endpoint and navigation tests** for display-name retrieval, self-only update, and separate Profile/Settings page targets.
- [ ] **Step 2: Run the focused tests and confirm the endpoint/page assertions fail.**
- [ ] **Step 3: Implement the profile query/update service methods with validation and self-user scoping.**
- [ ] **Step 4: Render Profile security controls and move language/household preferences into Settings without duplicating security mutations.**
- [ ] **Step 5: Run focused auth tests, typecheck, and browser build; expect PASS.**
- [ ] **Step 6: Commit `feat: separate profile and settings`.**

### Task 3: Build shared report calculations and date-range queries

**Files:**
- Create: `src/modules/reports/types.ts`
- Create: `src/modules/reports/service.ts`
- Modify: `src/modules/transactions/service.ts`
- Modify: `src/db/postgres-repositories.ts`
- Modify: `src/http/api.ts`
- Test: `tests/unit/reports.test.ts`, `tests/integration/postgres-repositories.test.ts`, `tests/http/reports-api.test.ts`

**Interfaces:**
- `ReportRange = { from: string; to: string }` with inclusive ISO date-only bounds.
- `HouseholdReport = { range, household, byEntrant, byCategory, accountBalances, monthly, budgetComparison }` using integer minor units.
- `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` returns a household-scoped `HouseholdReport`.

- [ ] **Step 1: Write failing tests for inclusive date ranges, zero-result ranges, category totals, monthly totals, entrant totals, and exclusion of transfers/opening balances/deleted records.**
- [ ] **Step 2: Run the report tests and confirm they fail before implementation.**
- [ ] **Step 3: Implement the shared calculation service with integer arithmetic and strict date validation.** Reuse it for Dashboard query data rather than duplicating formulas.
- [ ] **Step 4: Add PostgreSQL repository queries with household predicates and transaction-date bounds; use the same projection for report and dashboard reads.**
- [ ] **Step 5: Add the authenticated report endpoint and cross-household authorization tests.**
- [ ] **Step 6: Run report, repository, auth, and full test suites; expect PASS.**
- [ ] **Step 7: Commit `feat: add household financial reports`.**

### Task 4: Persist and expose notification rules

**Files:**
- Create: `migrations/0007_notification_rules.sql`
- Create: `src/modules/rules/service.ts`
- Modify: `src/http/api.ts`
- Modify: `src/modules/tasks-subscriptions.ts`
- Test: `tests/integration/rules.test.ts`, `tests/http/rules-api.test.ts`

**Interfaces:**
- `NotificationRules = { subscriptionReminders: boolean; budgetWarningPercent: number | null; taskDueReminders: boolean; notifyBothPartners: boolean }`.
- `GET /api/rules` and `PUT /api/rules` are household-scoped and audited when shared behavior changes.

- [ ] **Step 1: Write failing tests for default rules, valid threshold values, invalid thresholds, household isolation, and both-partner reminder behavior.**
- [ ] **Step 2: Run the focused tests and confirm failure.**
- [ ] **Step 3: Add the relational rule table and migration application instructions.**
- [ ] **Step 4: Implement the rules service and connect reminder generation to the stored preferences without changing the existing idempotency keys.**
- [ ] **Step 5: Add the Rules page with clear in-app-only copy and save states.**
- [ ] **Step 6: Run rules, reminder, typecheck, and full tests; expect PASS.**
- [ ] **Step 7: Commit `feat: add notification rules`.**

### Task 5: Upgrade Dashboard with charts and useful visual summaries

**Files:**
- Modify: `src/http/api.ts`, `src/http/web.html`, `src/http/web.js`, `src/http/web.css`
- Test: `tests/http/api.test.ts`, `tests/http/dashboard-api.test.ts`

**Interfaces:**
- `GET /api/dashboard` adds the report-derived monthly series, category totals, and account balance series while preserving existing totals and planning fields.

- [ ] **Step 1: Write failing tests for chart data shape, household isolation, one-member waiting state, and accessible text summaries.**
- [ ] **Step 2: Run the dashboard tests and verify failure.**
- [ ] **Step 3: Extend the dashboard query to consume the shared report calculation service.**
- [ ] **Step 4: Render lightweight responsive SVG charts with text summaries and no new chart dependency unless the implementation proves SVG insufficient.**
- [ ] **Step 5: Verify LTR and RTL markup, mobile stacking, empty data, negative balances, and zero values.**
- [ ] **Step 6: Run focused tests and browser build; expect PASS.**
- [ ] **Step 7: Commit `feat: add dashboard financial visualizations`.**

### Task 6: Implement the Reports page and range controls

**Files:**
- Modify: `src/http/web.html`, `src/http/web.js`, `src/http/web.css`
- Test: `tests/http/api.test.ts`, `tests/http/reports-api.test.ts`

- [ ] **Step 1: Add failing page tests for date controls, report cards, charts, accessible summaries, loading, empty, and invalid-range states.**
- [ ] **Step 2: Run the focused page tests and verify failure.**
- [ ] **Step 3: Render the Reports page and request `/api/reports` with inclusive date-only bounds.**
- [ ] **Step 4: Add responsive report cards, category/account tables, and text summaries below charts.**
- [ ] **Step 5: Verify LTR/RTL layout, mobile widths, and no floating-point formatting.**
- [ ] **Step 6: Run the focused tests, browser build, and full suite; expect PASS.**
- [ ] **Step 7: Commit `feat: add reports page`.**

### Task 7: Documentation, migration verification, and release checks

**Files:**
- Modify: `docs/product-spec.md`
- Modify: `docs/architecture.md`
- Modify: `docs/operations.md`
- Modify: `README.md`
- Test: existing full suite and Docker verification commands

- [ ] **Step 1: Document page ownership, report semantics, rule defaults, Tabler asset policy, and migration `0007`.**
- [ ] **Step 2: Apply migrations `0001` through `0007` to a disposable PostgreSQL database and verify all constraints.**
- [ ] **Step 3: Run `bun test`, `bun run typecheck`, browser build, `docker compose build`, and live `/`, `/api/health`, CSS, and JS checks.**
- [ ] **Step 4: Review `git diff --check` and verify no untracked generated assets or external CDN references remain.**
- [ ] **Step 5: Commit `docs: document household UI redesign`.**

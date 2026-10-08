# Couples’ Household Money Planning App

A shared household money planning app for two partners. Both partners can view household accounts and transactions, manually record income, expenses, and transfers, see individual and household totals, agree on budgets, track goals and wishes, manage required financial tasks, and receive subscription renewal reminders.

## Project status

**Implementation in progress. Password sessions, optional authenticator MFA, passkeys, household membership checks, a responsive security Settings page, and focused PostgreSQL tests are present. Financial domain modules still need their approved PostgreSQL persistence work before the complete money MVP is release-ready.**

The MVP decisions required for implementation are resolved in [docs/product-spec.md](docs/product-spec.md). Product extensions and infrastructure choices that are not needed for the first release remain explicitly deferred.

The project intentionally uses manual transaction entry for MVP. Bank and card integrations are out of scope until a later approved change. The MVP web interface must be responsive and mobile-friendly. Flutter Android/iOS clients are a later phase, not MVP.

## Documents

- [Product specification](docs/product-spec.md) — product behavior, resolved MVP decisions, acceptance criteria, and deferred decisions.
- [Architecture](docs/architecture.md) — modular monolith boundaries, relational data model, authorization flow, accounting invariants, audit design, and testing strategy.
- [Implementation plan](docs/superpowers/plans/2026-10-06-household-money-mvp.md) — approved MVP plan; implementation is in progress.
- [Project instructions](AGENTS.md) — current workflow and non-negotiable technical constraints.
- [Operations](docs/operations.md) — local run, Docker/PostgreSQL setup, migrations, and remaining release validation.
- [Authentication design](docs/superpowers/specs/2026-10-08-authentication-design.md) — approved behavior for password and passkey sign-in, optional MFA, and active-session management.
- [Authentication implementation plan](docs/superpowers/plans/2026-10-08-authentication.md) — incremental tests, persistence, API, MFA, passkeys, Settings, and deployment verification.
- [Admin onboarding plan](docs/superpowers/plans/2026-10-08-admin-controlled-onboarding.md) — bootstrap root administration, forced password changes, and controlled user creation.

## Proposed small MVP

1. Identity, household creation, and email invitation for the second partner.
2. Household accounts with opening balances and archive state.
3. Manual income, expense, adjustment, and atomic transfer entry.
4. Dashboard with account balances, member-entered totals, household totals, and category spending.
5. Categories and monthly budget proposals with comments and both-partner agreement.
6. Savings goals, wishlist items, and manual goal contributions.
7. One-time required financial tasks with assignee, due date, and completion.
8. Subscriptions with in-app renewal reminders.
9. Household-scoped audit history and access checks throughout.

## Implementation plan

The detailed plan is in [docs/superpowers/plans/2026-10-06-household-money-mvp.md](docs/superpowers/plans/2026-10-06-household-money-mvp.md). It covers foundation, identity and access, the financial ledger, planning features, tasks and reminders, the responsive web surface, and release verification.

The MVP plan and authentication plan are approved. Work is continuing in small verified steps; Git history remains untouched because the repository's `.git` metadata is empty.

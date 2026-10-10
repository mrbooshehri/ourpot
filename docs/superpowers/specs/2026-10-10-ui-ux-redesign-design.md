# Household Finance UI and Navigation Redesign

**Status:** Draft for review

## Goal

Give the shared household money app a clear responsive navigation model and dedicated places for household overview, personal security, financial reports, application preferences, and notification rules.

## Navigation and pages

Authenticated household members see these pages:

- **Dashboard:** combined household overview, partner-entered activity, account balances, charts, upcoming reminders, open tasks, budget status, and recent audit activity.
- **Reports:** date-range financial analysis using the same accounting rules as the dashboard.
- **Profile:** display name, password, authenticator-app MFA, recovery codes, passkeys, active sessions, and sign-out controls.
- **Settings:** language/direction, household name, currency, timezone, and display preferences that are safe for the MVP.
- **Rules:** in-app reminder and notification preferences for subscriptions, budgets, and tasks.

The root administrator keeps a separate Administration view for user management. Root administration does not grant household financial access.

The mobile layout uses a compact navigation bar and stacked page sections. The desktop layout uses a sidebar or expanded navigation with the same labels and icons. Every page has a text label; icons support recognition and are not the only accessible name.

## Tabler icon system

Use local Tabler outline SVG assets from the official icon set. Keep icons in the application bundle rather than loading them from a CDN. Use a consistent 24px viewBox and 2px stroke unless a specific icon requires an exception.

Initial navigation mapping:

| Page | Icon |
| --- | --- |
| Dashboard | `layout-dashboard` |
| Reports | `chart-bar` |
| Accounts | `wallet` |
| Transactions | `arrows-transfer-up-down` |
| Planning | `calendar-dollar` |
| Rules | `bell-ringing` |
| Profile | `user-circle` |
| Settings | `settings` |

## Dashboard behavior

The first section is labeled **Combined household** and explicitly says **Both partners together**. It displays:

- Household income from income transactions entered by either partner.
- Household expenses from expense transactions entered by either partner.
- Net change as household income minus household expenses.
- Household account balance from opening balances and account movements.

Transfers are excluded from income and expense totals. Opening balances affect account balance and are not income.

The next section is labeled **Partner activity**. It renders one card for each active household member, including members with zero activity. Each card shows income entered, expenses entered, and net entered. The section states that these values describe who entered transactions and are not ownership, reimbursement, or debt calculations. A one-member household shows a waiting-for-partner card.

Dashboard charts are explanatory views of existing totals and report data. They do not introduce a second accounting calculation. The MVP chart set is:

- Monthly income versus expenses for the selected recent period.
- Expense totals grouped by category.
- Account balances grouped by account.

Charts have text summaries or accessible data tables for users who do not use visual graphics.

## Reports behavior

Reports provide a household-scoped date range with a default recent period. The page shows household income, expenses, net change, partner-entered totals, category spending, account movements, and agreed-budget versus actual spending when report persistence is available.

Reports use the same rules as the dashboard, preserve integer minor units, exclude deleted records, and exclude transfers from income and expense totals. Empty ranges show zero totals and a clear empty state. Export and forecasting remain deferred.

## Profile and Settings behavior

Profile owns personal identity and sign-in security. Settings owns household and presentation preferences. Language choices remain English, Persian, and Arabic; English sets `dir="ltr"`, while Persian and Arabic set `dir="rtl"`. CSS uses logical properties.

Household preferences are visible only to active household members and are protected by household access checks. Personal profile and security data are scoped to the signed-in user.

## Rules behavior

Rules are limited to in-app notification preferences in this phase:

- Subscription renewal reminders.
- Budget warning thresholds.
- Required-task due-date reminders.
- Whether household reminders are shown to both partners by default.

Rules do not create transactions, categorize transactions automatically, send external email or push notifications, or run arbitrary user scripts. Rule changes are auditable when they affect shared household behavior.

## Data and API boundaries

The HTTP layer exposes page-oriented query responses, but domain services remain responsible for accounting and household authorization. Report queries and dashboard queries use shared calculation functions so the same transaction inclusion rules apply everywhere.

Financial reporting and chart data must eventually come from PostgreSQL repositories. Until those repositories replace the current in-memory planning services, the UI may display planning data only for the current process lifetime and must not present it as durable storage.

## Acceptance criteria

1. An authenticated member can reach Dashboard, Reports, Profile, Settings, and Rules from the responsive navigation.
2. Dashboard labels distinguish combined household totals from partner-entered totals.
3. Dashboard includes chart data with accessible text summaries and no floating-point money arithmetic.
4. Reports accept a date range and return household-scoped totals using dashboard accounting rules.
5. Profile contains the existing password, MFA, passkey, and active-session controls.
6. Settings supports language direction and household preferences with access checks.
7. Rules can view and update the defined in-app reminder preferences.
8. Tabler icons are bundled locally, have text labels or accessible names, and render in both LTR and RTL layouts.
9. Existing authentication, invitation, household isolation, audit, and financial tests remain green.

## Deferred decisions

- Exact charting library versus lightweight SVG charts.
- Whether report export should be CSV or another format.
- Whether notification preferences are personal, household-wide, or both for each rule type.
- Persistence design for rules and report snapshots after the remaining financial repositories are complete.

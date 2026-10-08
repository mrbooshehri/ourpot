# Couples’ Household Money Planning App — MVP Product Specification

**Status:** Approved direction; MVP decisions below are resolved for planning.  
**Implementation:** In progress; the current HTTP app still uses demo identities and in-memory state.

## 1. Product goal

Help two partners manage household finances together with one shared source of truth. Each partner can see the household’s accounts and transactions, record manual activity, understand member-entered and household totals, and make explicit plans for budgets, savings, wishes, tasks, and subscriptions.

MVP success means a couple can create a household, invite the second partner, record ordinary income/expenses/transfers, understand where money went, agree on a category budget, and track upcoming financial obligations without importing bank data.

## 2. Resolved MVP decisions

These decisions are intentionally limited to behavior required to implement the MVP:

- A household has at most two active members. It may have only the owner until the invited partner joins. A user belongs to one active household.
- Accounts may be shared or personal, but both partners can view every account and every transaction. Personal-account ownership does not hide the account from the other partner.
- The creator is the owner; the invited partner is a member. Only the owner manages invitations and household membership. Both members can create, edit, archive, and soft-delete shared financial records; every mutation is audited.
- Reports show household totals plus two separate per-partner views: totals paid by each partner and totals entered by each partner. Neither view represents ownership, reimbursement, or a debt calculation.
- Transactions record both the partner who entered them and the partner who paid them when a payer applies.
- The household has one currency selected at creation. All accounts use it. Currency conversion is out of scope.
- Amounts are positive integer minor units. Transaction type carries meaning; negative money values are not accepted.
- Account balances are derived from opening balance plus non-deleted movements. Negative balances are allowed and clearly marked. Reconciliation is deferred; an explicit adjustment transaction is the correction mechanism.
- Budgets are monthly calendar periods using the household IANA timezone. Discussion uses proposals, comments, and a status field; it is not real-time chat. Agreement requires approval from both members. An agreed budget change creates a new revision.
- Wishes and savings goals are separate. Wishes describe desired purchases or experiences. Goals have a target amount and optional deadline; a wish may later be converted into a goal.
- Goal contributions are standalone manual records. They are not automatically linked to transactions.
- Required tasks are one-time tasks in MVP. Either partner may complete a task, and the assignee remains visible. Recurrence is deferred.
- Subscriptions may be shared or assigned to one partner, and both partners can view them. Subscription cadences are monthly and yearly.
- Renewal reminders go to both partners by default at 30 days and 7 days before renewal. Personal notification settings are deferred.
- Refunds are recorded as income with a `Refund` category. Chargebacks and other complex reversals are deferred.
- The first partner registers with email and password and creates the household. The second joins through a seven-day invitation addressed to their email; they register if they do not already have an account.
- Passwords use Argon2id. A partner may optionally enable authenticator-app MFA for password sign-in, with one-use recovery codes. A registered passkey provides an alternative to password sign-in and does not require a separate TOTP code.
- Sign-in creates a revocable, cookie-backed session. Settings shows each partner their own active sessions and lets them revoke any of them, including the current session.
- Upcoming reminders and audit activity appear on the shared dashboard. Audit history is retained for 12 months. Export is deferred.
- MVP is a responsive, mobile-friendly web app. Flutter Android/iOS apps are deferred and are not part of MVP.

## 3. Users and household access

- A user has an account and belongs to one active household.
- Every household resource is visible to both active members.
- An unauthenticated user, non-member, or removed member cannot read or mutate household data.
- The owner can invite the second partner, revoke a pending invitation, and remove the member. The system prevents removing the last owner.
- Invitations are email-addressed, expire after seven days, and produce audit events for creation, acceptance, revocation, and expiry.
- The invitation link is shared manually in MVP; outbound email is not provided. The invitation token and matching registered email are required to accept it. Email verification and self-service password reset are deferred.
- The app derives identity from the server-side session and checks active household membership on every household read and write. Client-supplied user or household identity headers do not grant access.

### 3.1 Sign-in and account security

- Registration requires an email address and password. Signing in with a password requires a valid authenticator-app code or one-use recovery code when the partner has enabled MFA. No full session is issued before that second step succeeds.
- Partners may add multiple passkeys after signing in and confirming a recent authentication. A passkey can sign in without a password, including when authenticator-app MFA is enabled. Passkey registration and sign-in require browser user verification such as a device PIN or biometric check.
- Settings can enable or disable authenticator-app MFA, show unused recovery-code count, regenerate recovery codes, list named passkeys, and remove a passkey. Changing these security methods requires recent authentication. Recovery codes are shown only when generated.
- Settings lists the partner's own active sessions with creation time, recent activity, device/browser description, and a current-session marker. The partner can revoke another session immediately or sign out the current session. One partner cannot view or revoke the other's sessions.
- Invalid credentials receive a generic error. Repeated sign-in, MFA, recovery-code, and passkey attempts are limited. Security events record actor or attempted identity, time, action, and outcome without passwords, session tokens, TOTP secrets, recovery codes, or passkey challenges.

## 4. MVP features

### 4.1 Accounts

Members can create, edit, archive, and view accounts such as checking, savings, cash, credit card, or loan.

An account has a name, type, ownership (`shared` or `personal`), optional owning partner for personal accounts, household currency, optional opening balance, note, active/archived state, creator, and timestamps. Both partners can view every account. Archived accounts remain available to historical reports but cannot receive new transactions.

### 4.2 Manual transactions

Members can create, edit, and soft-delete manual transactions. A transaction records:

- household and account;
- positive integer amount in minor units;
- type: `income`, `expense`, `transfer`, or `adjustment`;
- transaction date interpreted in the household timezone;
- category when applicable;
- payee/description and optional note;
- user who entered it;
- user who paid it, when a payer applies;
- created, updated, and deleted timestamps.

Transfers have one source account and one destination account and are committed atomically as a linked pair. They affect account balances but do not count as household income or expense. Cross-household, self-account, or one-sided transfers are rejected.

Either partner may edit or soft-delete any transaction. Every edit and deletion creates an audit event with the actor and before/after values. Transaction list filters are date range, account, category, type, entered-by member, and paid-by member.

### 4.3 Totals and dashboard

For a selected period, show:

- household income and expense totals;
- totals paid by each partner;
- totals entered by each partner;
- spending by category;
- account balances and total household balance;
- agreed budget status.

Transfers and deleted transactions are excluded from income/expense totals. Refund income is included in income totals and the Refund category. Adjustments affect account balances but are excluded from income/expense totals.

### 4.4 Budgets and agreement

A member can propose a category budget for a monthly period. A proposal includes category, positive integer amount, period, rationale, proposer, status, comments, and timestamps. Discussion uses comments and status changes; it is not real-time chat.

State flow:

`proposed → discussed → agreed`

Alternative terminal states are `rejected` and `withdrawn`. Both partners can comment and approve. Agreement requires an approval action from both members. Only an `agreed` proposal is active in reports. Changing an agreed budget creates a new revision and preserves the prior agreement.

Budget reports show agreed amount, spent amount, remaining amount, and over-budget state. Budgets never block transactions.

### 4.5 Savings goals and wishlist

A wish describes a desired purchase or experience. It has a name, estimated positive integer cost, priority, optional target date, note, and status.

A savings goal has a name, positive integer target amount, optional deadline, manually recorded contributions, priority, note, status, and progress history. A wish can be converted into a savings goal while retaining its history.

### 4.6 Required financial tasks

Members can create one-time tasks for financial obligations. A task has title, description, assignee (one member or both), due date, priority, status (`open`, `in_progress`, `done`, `dismissed`), and completion metadata.

Either partner may complete a task. The assignee remains visible, and completion records actor and time. The app provides due-soon and overdue views.

### 4.7 Subscriptions and renewal reminders

A subscription has merchant/name, positive integer price, monthly or yearly cadence, next renewal date, optional payment account, category, optional responsible partner, cancellation details, ownership (`shared` or `personal`), and active/cancelled state. Both partners can view it.

The app creates in-app reminders for both partners 30 days and 7 days before renewal. Reminder creation is idempotent for subscription, renewal date, lead time, and recipient. Personal notification settings are deferred. The next renewal date must be advanced after renewal confirmation.

## 5. Audit and trust requirements

Every financial mutation records actor, timestamp, entity, entity ID, action, and structured before/after data. This includes edits and deletions made by either partner. The shared dashboard shows audit activity, and the UI identifies who entered or changed a record and when.

Audit history is append-only for application users. Soft deletion preserves explainability. Audit queries are household-scoped and retain data for 12 months.

## 6. Out of scope

Bank/card integrations, automatic imports, recurring transaction creation, bill payment, investment advice, debt optimization, tax/legal advice, currency conversion, split settlement, external calendar sync, native mobile apps, email/push notifications, exports, reconciliation workflows, advanced forecasting, and AI recommendations.

## 7. Acceptance criteria

1. An invited second partner can join and see the same household resources.
2. A manually entered expense updates the correct account balance, entrant total, household total, category total, and audit history.
3. A transfer changes both account balances and changes neither income nor expense totals.
4. A budget proposal can be discussed and becomes active only after both partners agree.
5. A goal contribution updates progress and remaining amount.
6. A required task can be assigned, completed, and audited.
7. An active subscription produces one reminder at each configured lead time without duplicates.
8. A removed member and any cross-household request cannot read or mutate protected data.
9. A partner can sign in with a password, complete optional authenticator-app MFA, or sign in with a registered passkey, and then reach only households where they are an active member.
10. Revoking a session in Settings makes its cookie unusable on the next request; the partner cannot list or revoke another partner's sessions.

## 8. Remaining MVP decisions

These decisions still affect user-facing behavior and should be resolved before implementation of the corresponding flows:

1. For a personal account, may both partners create/edit transactions, or only the owning partner? Both partners can always view it.
2. Is the payer required on every income/expense transaction, optional, or inferred from the account?
3. Are budget comments append-only, or may their authors edit/delete them?
4. Does a task assigned to both partners require one completion or acknowledgement from both?
5. When a subscription renews, should the app advance the date automatically, ask for confirmation, or support both?
6. When a subscription price changes, should the change create an audit revision and apply immediately?
7. Are reminders dismissible/read separately for each partner, shared for the household, or both?
8. Which account and subscription fields, if any, are owner-only to change after creation?

## 9. Deferred decisions

Hosting region, a managed key service and key rotation, backup and recovery targets, observability vendor, deployment provider, future multi-household support, additional currencies, external notifications, email verification, self-service password reset, exports, recurring tasks, and reconciliation are intentionally deferred until after the MVP proves its core workflow. The MVP still requires a configured key to encrypt TOTP secrets.

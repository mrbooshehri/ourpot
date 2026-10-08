# Project Instructions

## Current phase

This project is in specification and planning. Do not write application code, install dependencies, create migrations, or scaffold a framework until the user explicitly approves both the MVP specification and implementation plan.

## Product constraints

- The product serves two partners managing one shared household.
- Both partners can view all household accounts and transactions.
- Every transaction records the user who entered it.
- MVP transaction entry is manual only. Do not add bank or card integrations.
- Support income, expenses, and transfers. Transfers are separate from income and expenses.
- Show individual and household totals. Individual totals mean totals grouped by the member who entered the transaction unless the approved specification changes that definition.
- Use a modular monolith backed by a relational database.
- Store money as integer minor units. Never use floating-point values for money.
- Enforce household-level access checks on every read and write.
- Keep an audit history for financial changes.

## Documentation workflow

1. Keep product behavior in `docs/product-spec.md`.
2. Keep system boundaries and data/access design in `docs/architecture.md`.
3. Keep the implementation sequence in `README.md` until an approved plan gets its own planning document.
4. List unresolved decisions explicitly. Do not silently choose behavior that changes product semantics.
5. Stop after documentation and wait for approval.

## Implementation expectations after approval

- Preserve module boundaries and service-level authorization.
- Use database constraints and transactions for financial invariants.
- Add meaningful tests for money arithmetic, transfers, household isolation, audit events, and budget agreement state transitions.
- Do not add integrations or features marked out of scope without updating the specification first.
- MVP is a responsive, mobile-friendly web app. Do not build Flutter Android/iOS clients in MVP.
- Provide a Dockerfile and Docker Compose configuration for the application, PostgreSQL, and reminder worker.

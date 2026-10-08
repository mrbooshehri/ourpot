# Admin-Controlled Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace open registration with an environment-bootstrapped root administrator who can create invited users and require a password change on first login.

**Architecture:** Add a global `root_admin` role and first-login password-change state to the persisted identity model. The server bootstraps exactly one root admin from environment variables when no root exists; normal users are created by that admin or through existing household invitation links. Protected API routes reject users who still need to change their password, except for password change and sign-out.

**Tech Stack:** TypeScript, Bun, PostgreSQL, Docker Compose, existing cookie sessions and responsive web UI.

**Spec:** `docs/superpowers/specs/2026-10-08-authentication-design.md`

## Global Constraints

- Public self-registration is disabled.
- `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` are deployment secrets; no default credentials are committed.
- The bootstrap password is Argon2id hashed and the root admin must change it after first login.
- Root administration does not grant household financial visibility.
- Existing household invitation links remain manual copy/share links for MVP.
- Disabled users cannot sign in and existing sessions stop authorizing requests.

## Review Focus

- A deployment with no root admin and missing bootstrap secrets must fail clearly rather than open registration.
- Re-running bootstrap must not replace or reset an existing root admin.
- A first-login user may only change their password or sign out until the change succeeds.
- A root admin cannot access household financial records without household membership.
- A normal user cannot call admin user-management endpoints by guessing URLs.

### Task 1: Identity schema and bootstrap configuration

**Files:** `migrations/0004_admin_onboarding.sql`, `src/config.ts`, `.env.example`, `docker-compose.yml`, `src/modules/identity/repository.ts`, `src/modules/identity/types.ts`, `tests/integration/auth-schema.test.ts`.

- [ ] Add role, first-login password-change, and disabled-user fields with safe defaults.
- [ ] Add optional bootstrap email/password config and validate that the pair is supplied together.
- [ ] Add repository methods to find/create root and users with role/state metadata.
- [ ] Test migration columns, config pairing, and idempotent root lookup.

### Task 2: Bootstrap, login state, and password change

**Files:** `src/modules/identity/service.ts`, `src/server.ts`, `src/http/api.ts`, `tests/integration/auth-sessions.test.ts`, `tests/http/auth-api.test.ts`.

- [ ] Implement `ensureBootstrapAdmin()` to create one forced-change root admin only when no root exists.
- [ ] Include role and `mustChangePassword` in session principal resolution.
- [ ] Reject disabled users and block all protected routes for forced-change users except password change/logout.
- [ ] Implement password change with current-session recent-auth refresh and clear the forced-change flag.
- [ ] Remove public registration behavior and test first-login gating, restart-safe bootstrap, and disabled sessions.

### Task 3: Root admin user management

**Files:** `src/http/api.ts`, `src/http/web.html`, `src/http/web.js`, `src/http/web.css`, `tests/http/auth-api.test.ts`, `tests/e2e/auth-journey.test.ts`.

- [ ] Add root-only endpoints to list users and create a user with a temporary password.
- [ ] Record admin security events without storing temporary credentials in events.
- [ ] Add an admin panel showing users and a create-user form; explain that the recipient must change the temporary password.
- [ ] Keep household invitations as copyable links and remove the public registration form.
- [ ] Test normal-user denial, root-only access, temporary-password login, and first-login completion.

### Task 4: Documentation and verification

**Files:** `docs/product-spec.md`, `docs/architecture.md`, `docs/operations.md`, `README.md`.

- [ ] Document environment bootstrap, forced password change, admin roles, and manual invitation behavior.
- [ ] Apply migration 0004 to the local Compose database and verify a disposable database migration chain.
- [ ] Run the full test suite, typecheck, browser bundle build, Docker build, and live health/auth checks.


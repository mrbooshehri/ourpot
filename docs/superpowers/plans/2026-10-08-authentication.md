# Authentication and Session Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give both partners real password or passkey sign-in, optional authenticator-app MFA, and a Settings page for viewing and revoking their own sessions, while removing client-supplied identity as authority.

**Architecture:** Keep the Bun HTTP modular monolith. Add a PostgreSQL-backed identity module and persisted household membership, resolve every protected request through a revocable cookie session, and keep the existing financial modules behind that context. Use SimpleWebAuthn for passkeys and a maintained TOTP library for codes. Financial-module persistence remains separate MVP work.

**Tech Stack:** TypeScript, Bun, Bun SQL, PostgreSQL, Bun test runner, `@simplewebauthn/server`, `@simplewebauthn/browser`, `otpauth`, Docker Compose.

**Spec:** [Authentication design](../specs/2026-10-08-authentication-design.md)

## Global Constraints

- Two partners at most per household; the owner may be alone before invitation acceptance.
- Password sign-in with enabled TOTP requires a code or one-use recovery code before a full session. Passkey sign-in is an alternative and requires user verification.
- TOTP steps are 30 seconds with one-step tolerance; pending password-MFA login expires after five minutes and permits five attempts. Generate ten recovery codes.
- Sessions have a 24-hour idle and 30-day absolute limit. Recent authentication lasts ten minutes. Store only a SHA-256 hash of each random session token.
- Each household read and write resolves active membership from PostgreSQL. `x-user-id`, `x-household-id`, and `/api/demo/setup` cannot authorize production requests.
- State-changing requests use same-origin protection; credentials, secrets, raw tokens, and challenges are not logged.
- Docker and localhost use an explicit HTTP development mode. Production requires HTTPS origin and TOTP encryption key.
- The current `.git` directory is empty and `git status` fails. Do not initialize or alter Git history during implementation; use filesystem checkpoints until the user resolves Git metadata.

## File map and interfaces

- `migrations/0002_authentication.sql`: identity/session schema additions and indexes, applied after `0001_initial.sql`.
- `src/modules/identity/repository.ts`: PostgreSQL user, credential, challenge, security-event, and session queries. All methods use `DatabaseClient` from `src/db/client.ts`.
- `src/modules/identity/types.ts`: shared `User`, `LoginResult`, `SessionIssue`, `SessionPrincipal`, `SessionView`, `PasskeyView`, and WebAuthn challenge result types used by the identity service and HTTP adapter.
- `src/modules/identity/password.ts`: Argon2id hash/verify and normalized-email validation.
- `src/modules/identity/totp.ts`: TOTP secret encryption/decryption, code verification, and recovery-code generation/hash checks.
- `src/modules/identity/passkeys.ts`: SimpleWebAuthn option generation and registration/authentication verification.
- `src/modules/identity/service.ts`: `IdentityService` orchestrates registration, login, MFA, passkeys, recent authentication, session lifecycle, and security events.
- `src/modules/households/postgres-service.ts`: durable household creation, invitation acceptance, membership lookup, and owner-only mutation; keep current in-memory service only for existing isolated domain tests until migrated.
- `src/http/auth-routes.ts`: auth endpoint parsing, cookies, error/status mapping, and CSRF/origin checks.
- `src/http/api.ts`: routes protected by `IdentityService.getSession` and persisted `PostgresHouseholdService.getContext`; no demo identity path.
- `src/http/web.ts`: responsive sign-in, MFA, and Settings UI, split from the current inline HTML in `api.ts`.
- `src/config.ts`, `src/server.ts`, `Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md`: required auth configuration and local run instructions.
- `tests/unit/identity-*.test.ts`, `tests/integration/auth-*.test.ts`, `tests/http/auth-api.test.ts`, `tests/e2e/auth-journey.test.ts`: domain, database, HTTP, and browser-flow checks.

## Review Focus

1. An unknown email and a wrong password must have indistinguishable public responses — pinned in Task 3.
2. A partner removed from a household must lose household access despite a live session — pinned in Task 3.
3. Two simultaneous uses of one recovery code or one WebAuthn challenge must yield at most one success — pinned in Tasks 4 and 5.
4. A partner must never see or revoke the other partner's session by guessing its ID — pinned in Task 3.
5. Passkey verification must reject a valid assertion from the wrong origin or RP ID — pinned in Task 5.

---

### Task 1: PostgreSQL identity foundation and configuration

**Files:** Create `migrations/0002_authentication.sql`, `.env.example`, `tests/integration/auth-schema.test.ts`; modify `src/config.ts`, `src/db/schema.ts`, `package.json`, `Dockerfile`, `docker-compose.yml`.

**Interfaces:** Produce `AuthConfig` from `loadConfig`: `publicOrigin`, `rpId`, `totpEncryptionKey`, `allowInsecureLocalhostCookie`, and existing config fields. Produce tables for password users, hashed-token sessions, TOTP credentials, recovery codes, passkeys, one-use challenges, rate-limit buckets, and security events. Preserve existing household foreign keys.

- [ ] **Step 1: Write failing tests** for production startup rejecting HTTP origins/missing key, localhost development configuration, migration application on a fresh database, unique credential IDs, and session/challenge indexes.
- [ ] **Step 2: Run `bun test tests/integration/auth-schema.test.ts`; confirm the missing config/schema failures.**
- [ ] **Step 3: Add configuration, dependencies, migration, and Compose environment.** Make migration additive so an existing `0001_initial.sql` database is retained; document the explicit migration command.
- [ ] **Step 4: Run `bun test tests/integration/auth-schema.test.ts && bun run typecheck`; confirm both pass.**
- [ ] **Step 5: Save a filesystem checkpoint; commit only if Git metadata has been safely restored by the user.**

### Task 2: Durable users, households, and invitations

**Files:** Create `src/modules/identity/password.ts`, `src/modules/identity/repository.ts`, `src/modules/households/postgres-service.ts`, `tests/integration/auth-household.test.ts`; modify `src/server.ts`.

**Interfaces:** `IdentityRepository.createUser(email, passwordHash): Promise<User>` and `findUserByEmail(email): Promise<User | null>`. `PostgresHouseholdService.createHousehold(userId, input): Promise<HouseholdView>`, `inviteMember(context, email): Promise<InvitationView>`, `acceptInvitation(token, userId): Promise<void>`, `getContext(userId, householdId): Promise<HouseholdContext>`.

- [ ] **Step 1: Write failing PostgreSQL tests** for normalized unique email, Argon2id verification, first-owner creation, one active household per user, seven-day single-use email-matched invitation, owner-only invitation revocation, two-member cap, removed-member denial, and security-event recording without invitation secrets.
- [ ] **Step 2: Run `bun test tests/integration/auth-household.test.ts`; confirm failures before implementation.**
- [ ] **Step 3: Implement password helpers and household queries.** Use transactions and row locks for invitation acceptance and membership limits; generate unguessable invitation tokens and store only their hash.
- [ ] **Step 4: Run the focused tests and `bun run typecheck`; confirm pass.**
- [ ] **Step 5: Save a filesystem checkpoint; commit only if Git metadata is restored.**

### Task 3: Password sessions, protected requests, and session Settings API

**Files:** Create `src/modules/identity/service.ts`, `src/http/auth-routes.ts`, `tests/integration/auth-sessions.test.ts`, `tests/http/auth-api.test.ts`; modify `src/http/api.ts`, `src/server.ts`, `tests/http/api.test.ts`.

**Interfaces:** `IdentityService.register(email, password): Promise<User>`, `loginPassword(email, password, userAgent): Promise<LoginResult>`, `getSession(rawToken): Promise<SessionPrincipal | null>`, `listSessions(userId): Promise<SessionView[]>`, `revokeSession(userId, sessionId): Promise<void>`, `logout(rawToken): Promise<void>`. Define `LoginResult` as a discriminated union of `{ kind: 'session'; issue: SessionIssue }` and `{ kind: 'mfa_required' }`; `SessionIssue` contains the raw token only for cookie issuance and a public session view. `ApiApp` receives database-backed services through its constructor; protected routes call `getContext(session.userId, householdId)` on every request.

- [ ] **Step 1: Write failing tests** for register/login, unknown-email versus wrong-password public responses, hashed token storage, 24-hour idle and 30-day absolute expiry, current/other session revocation, cross-user session isolation, session metadata and current marker, removed-member denial, CSRF/origin rejection, failed-attempt rate limiting, secret-free security events, and rejection of forged identity headers.
- [ ] **Step 2: Run `bun test tests/integration/auth-sessions.test.ts tests/http/auth-api.test.ts tests/http/api.test.ts`; confirm expected failures.**
- [ ] **Step 3: Implement session repository/service and HTTP adapter.** Use 32-byte random tokens, HTTP-only SameSite cookies, server-side expiry checks, and shared PostgreSQL rate-limit buckets; allow insecure cookies only for configured localhost. Remove demo setup and header authority. Keep household resource IDs subject to membership checks.
- [ ] **Step 4: Run focused tests, `bun run typecheck`, and a live curl check against Docker Compose: unauthenticated/forged-header household requests must return 401; signed-in requests must work.**
- [ ] **Step 5: Save a filesystem checkpoint; commit only if Git metadata is restored.**

### Task 4: TOTP MFA, recovery codes, and recent authentication

**Files:** Create `src/modules/identity/totp.ts`, `tests/unit/identity-totp.test.ts`, `tests/integration/auth-mfa.test.ts`; modify `src/modules/identity/service.ts`, `src/modules/identity/repository.ts`, `src/http/auth-routes.ts`.

**Interfaces:** `IdentityService.startTotpEnrollment(session): Promise<{ otpauthUri: string }>`, `confirmTotpEnrollment(session, code): Promise<{ recoveryCodes: string[] }>`, `completeMfa(pendingToken, codeOrRecovery, userAgent): Promise<SessionIssue>`, `reauthenticate(session, proof): Promise<void>`, `disableTotp(session): Promise<void>`, `regenerateRecoveryCodes(session): Promise<string[]>`.

- [ ] **Step 1: Write failing tests** for encrypted pending secret, enrollment confirmation, 30-second code with one-step tolerance, replay rejection, five-attempt/five-minute pending login limit, ten one-use recovery codes, concurrent recovery-code consumption, code regeneration, and ten-minute reauthentication requirement.
- [ ] **Step 2: Run `bun test tests/unit/identity-totp.test.ts tests/integration/auth-mfa.test.ts`; confirm failures.**
- [ ] **Step 3: Implement TOTP with `otpauth`, AES-256-GCM secret encryption, atomic code/recovery consumption, and pending-login flow.** Password success with enabled MFA must not issue a full session.
- [ ] **Step 4: Run focused tests, HTTP auth tests, and `bun run typecheck`; confirm pass.**
- [ ] **Step 5: Save a filesystem checkpoint; commit only if Git metadata is restored.**

### Task 5: Passkey registration and passwordless login

**Files:** Create `src/modules/identity/passkeys.ts`, `tests/integration/auth-passkeys.test.ts`; modify `src/modules/identity/service.ts`, `src/modules/identity/repository.ts`, `src/http/auth-routes.ts`.

**Interfaces:** `IdentityService.beginPasskeyRegistration(session): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; challengeToken: string }>`, `finishPasskeyRegistration(session, challengeToken, response, name): Promise<PasskeyView>`, `beginPasskeyLogin(): Promise<{ options: PublicKeyCredentialRequestOptionsJSON; challengeToken: string }>`, `finishPasskeyLogin(challengeToken, response, userAgent): Promise<SessionIssue>`, `listPasskeys(userId): Promise<PasskeyView[]>`, `renamePasskey(session, credentialId, name): Promise<PasskeyView>`, `removePasskey(session, credentialId): Promise<void>`. The HTTP adapter carries each challenge token in an HTTP-only cookie, not browser storage.

- [ ] **Step 1: Write failing tests** using valid WebAuthn test fixtures for user verification, origin/RP ID mismatch, expired/reused challenge, unknown credential, signature-counter update, concurrent challenge consumption, recent-authentication requirement, name change, and cross-user passkey removal denial.
- [ ] **Step 2: Run `bun test tests/integration/auth-passkeys.test.ts`; confirm failures.**
- [ ] **Step 3: Implement SimpleWebAuthn ceremonies and credential storage.** Bind registration to a recently authenticated session; store challenge tokens hashed with five-minute expiry; verify before issuing a passwordless session.
- [ ] **Step 4: Run focused tests, HTTP auth tests, and `bun run typecheck`; confirm pass.**
- [ ] **Step 5: Save a filesystem checkpoint; commit only if Git metadata is restored.**

### Task 6: Responsive sign-in and Settings experience

**Files:** Create `src/http/web.ts`, `tests/e2e/auth-journey.test.ts`; modify `src/http/api.ts`, `tests/http/api.test.ts`, `README.md`.

**Interfaces:** The web page calls the Task 3–5 JSON endpoints with same-origin credentials and CSRF header. Views: register, password sign-in, pending MFA, passkey sign-in, household invitation, Settings security methods, and active sessions.

- [ ] **Step 1: Write failing HTTP/browser-flow tests** for registration and household creation, invitation acceptance, form states, password-to-MFA transition, passkey availability fallback, recovery-code one-time display, passkey naming, current-session marker, revocation feedback, and narrow-viewport layout.
- [ ] **Step 2: Run `bun test tests/e2e/auth-journey.test.ts tests/http/api.test.ts`; confirm failures.**
- [ ] **Step 3: Implement responsive UI and remove the demo setup button/script.** Use `@simplewebauthn/browser`; state the no-self-service-recovery limit before MFA enrollment. Escape displayed user-controlled values.
- [ ] **Step 4: Run focused tests, `bun run typecheck`, and manually exercise registration, password login, TOTP, passkey, and session revocation through Docker Compose. Record any browser/device validation that cannot run in this environment.**
- [ ] **Step 5: Save a filesystem checkpoint; commit only if Git metadata is restored.**

### Task 7: End-to-end security and deployment verification

**Files:** Modify `tests/e2e/auth-journey.test.ts`, `docs/operations.md`, `README.md`; fix only defects found in Tasks 1–6.

**Interfaces:** No new API. The deployed Docker Compose stack must use migrated PostgreSQL and the same auth behavior as the test process.

- [x] **Step 1: Add failing regression tests** for two partners sharing a household while keeping separate sessions, app restart retaining login/session state, session revocation taking immediate effect, removed-partner denial, and all financial routes refusing identity headers.
- [x] **Step 2: Run the new journey tests and confirm any remaining failures.**
- [x] **Step 3: Resolve failures; run `bun test`, `bun run typecheck`, Docker image build, migration against a disposable PostgreSQL database, and `docker compose up -d --build` followed by health and auth-flow requests.**
- [x] **Step 4: Record exact commands/results and any unverified physical passkey or browser flow in `docs/operations.md`; do not claim full auth completion without an end-to-end user journey.**
- [x] **Step 5: Save the final checkpoint; commit only after Git metadata is safely restored.** (Filesystem checkpoint saved; Git commit unavailable because `.git` is absent.)

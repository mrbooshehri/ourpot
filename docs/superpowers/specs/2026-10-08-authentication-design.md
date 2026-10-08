# Authentication and session management design

**Status:** Approved design; implementation requires review of the dedicated plan.

## Purpose and scope

Ourpot is a shared money-planning app for two partners. Each partner needs a personal sign-in, access to the same household records, and control over their own active sessions. This design replaces the current demo identity headers with authenticated, database-backed identity. It adds optional authenticator-app MFA and passkeys as an alternative to password sign-in. It does not change financial rules or add bank integrations.

The current HTTP app creates demo users, trusts `x-user-id` and `x-household-id`, and keeps its household and financial state in memory. The schema has `users` and `sessions` tables, but the running API does not use them. Authentication cannot be considered complete while any household route still accepts those headers as authority. Identity, sessions, and membership must be persisted and wired to every protected route. Full persistence of the financial modules remains a separate MVP task; this design does not claim that sign-in makes their in-memory data durable.

## Product behavior

1. The first partner registers with email and password and creates a household. The owner invites the second partner with a seven-day, single-use link addressed to their email. The recipient registers if needed, then accepts the invitation. A household has at most two active partners; it may contain only the owner before acceptance.
2. A partner signs in with email and password. If authenticator-app MFA is enabled, a correct TOTP code or unused recovery code is required before a session is issued. A partner can choose to enable or disable this MFA in Settings.
3. A partner can add one or more passkeys in Settings. A registered passkey is a passwordless alternative for sign-in even when TOTP MFA is enabled. Registration and sign-in require the device to verify the user with a PIN, biometric, or equivalent mechanism. A partner retains their password as a fallback.
4. Settings shows only the signed-in partner's active sessions, including the current session, creation time, most recent activity, and browser/device description. Revoking another session makes it unusable on its next request. Revoking the current session signs out the browser.
5. Settings also lists the partner's passkeys, shows the count of unused recovery codes, supports recovery-code regeneration, and permits removing a passkey or disabling TOTP. Adding/removing security methods or regenerating codes requires recent reauthentication.
6. Both partners see all household accounts and transactions after sign-in. The server checks current active membership on every household read and write. A removed member's existing session remains valid for their own Settings and sign-out, but no longer grants household access.

Invitation links are shared manually in this MVP; the app does not send email. Registration does not verify email ownership. The secret invitation token and exact registered email match are both required for acceptance. Self-service password reset and external email delivery are deferred. A partner who loses all sign-in methods cannot recover access through the app in this version; this limit must be stated in the UI before MFA enrollment.

## Architecture and data flow

The identity module owns credentials and sessions. The household module owns membership. The HTTP adapter parses credentials and cookies, calls identity services, and asks the household service for an active `HouseholdContext`. Financial services never construct a context from raw request headers. The web UI uses same-origin cookie requests; it never stores a session token in local storage.

### Password and MFA

- Normalize email consistently and enforce uniqueness in PostgreSQL. Hash passwords with Bun's asynchronous Argon2id implementation; never store or log plaintext passwords.
- A valid password for an MFA-enabled account creates a short-lived pending login challenge, not a full session. A random pending-login token is held in an HTTP-only cookie and only its hash is stored with the user ID in PostgreSQL. It expires after five minutes, permits at most five code attempts, and is consumed once.
- Enrollment generates a random TOTP secret, encrypts it with a configured 32-byte application key, and remains pending until the partner enters a valid code. Codes use 30-second steps and a one-step clock tolerance. Store the latest accepted step to reject replay.
- Generate ten random recovery codes when MFA is enabled or codes are regenerated. Show them once, store only hashes, and consume one atomically when used with the password. Regeneration invalidates the old set.
- Rate-limit registration, password sign-in, pending MFA, recovery-code, and passkey verification attempts by IP address and account/credential where known. Start with five failed attempts per 15-minute window for each key and return a retryable limit error. Limits use server-side storage shared by all web processes; client-supplied forwarding headers are ignored unless a trusted proxy is explicitly configured. Responses do not disclose whether an email or credential exists.

### Passkeys

- Use SimpleWebAuthn's server and browser packages instead of implementing WebAuthn protocol parsing. Configure an exact public origin and relying-party ID; do not derive them from untrusted request headers.
- A signed-in partner with recent authentication starts registration. Store a random, expiring, single-use challenge server-side. Require a discoverable credential and user verification. Verify challenge, origin, relying-party ID, user verification, and returned registration data before saving the credential.
- Passkey sign-in starts an expiring, single-use challenge without requiring an email. Use the returned credential ID to find its user, then verify the assertion and update the stored signature counter where appropriate. Only then issue a full session. Multiple credentials per user are allowed.
- Store credential ID, public key, user ID, counter, transports, creation and last-used times, and a user-editable name. Never store a private key. Passkey removal requires recent reauthentication.

### Sessions and authorization

- Generate at least 32 random bytes for each session token. Send the token only in an HTTP-only, SameSite=Lax cookie. Use Secure cookies in HTTPS deployments; permit an explicit localhost-only HTTP development mode. Persist only a SHA-256 hash of the token.
- Enforce a 24-hour idle timeout and a 30-day absolute timeout on the server. Store creation, last-used, expiry, revocation, user agent, and sign-in method. Update last-used with write throttling so the Settings list is useful without writing on every request.
- Session listing and revocation queries are filtered by the authenticated user ID. Revocation is durable and takes effect on the next request. Clearing the current session also clears its cookie.
- Treat all state-changing requests, including login and Settings actions, as same-origin JSON requests. Reject unexpected Origin values and require an application-specific request header; do not enable wildcard credentialed CORS. Use generic authorization errors for cross-household resources.
- A recent authentication window is ten minutes. Reauthentication with password plus TOTP/recovery code when enabled, or a passkey, can refresh it for security-method changes. Session possession alone is insufficient for these changes.

## Storage and configuration

Extend PostgreSQL with TOTP credentials, hashed recovery codes, passkey credentials, one-use authentication challenges, and security events. Extend sessions with token hash, idle/absolute expiry, last-used, revocation, user-agent, sign-in method, and recent-authentication time. Add uniqueness and expiry indexes. Invitation acceptance and membership lookup use persisted household records. Database transactions protect challenge consumption, recovery-code consumption, session issuance, and credential changes.

Configuration includes `DATABASE_URL`, a canonical public origin, WebAuthn relying-party ID, a TOTP encryption key, and a development-only insecure-cookie switch restricted to localhost. Production startup fails if the origin is not HTTPS or the encryption key is missing. Secret rotation needs an explicit migration procedure and is outside this change.

Security events record registration, login success/failure, MFA enrollment/removal, recovery-code use/regeneration, passkey addition/removal, session creation/revocation, and invitation acceptance. They never contain passwords, raw tokens, TOTP secrets/codes, recovery codes, private keys, or full challenges. Financial audit events remain household-scoped and separate.

## UI and API behavior

The responsive web app has registration, password sign-in, MFA challenge, passkey sign-in, and Settings views. The passkey option appears only when the browser supports it, with password sign-in always available. Settings identifies the current session and gives each session a clear revoke control. Confirmation and error states explain whether a session was revoked or a code was invalid without exposing sensitive account details.

The API has separate unauthenticated endpoints for registration, password login, MFA completion, and passkey login ceremonies; authenticated endpoints for current user, household selection, logout, session listing/revocation, MFA setup/removal, recovery-code regeneration, and passkey registration/removal. Existing financial endpoints require a session and derive the user from it. `POST /api/demo/setup` and the identity headers are removed from the production flow.

## Failure handling and verification

Malformed input receives a stable validation error. Invalid credentials and unknown users share a generic sign-in error. Expired or consumed challenges require starting again. A revoked or expired session returns unauthorized and does not reach household services. A database failure fails closed; it never falls back to client-supplied identity. Cookie and credential secrets are excluded from logs and responses.

Meaningful tests cover registration and invitation acceptance, password hashing and login, TOTP enrollment and successful/failed/replayed codes, one-use recovery codes, passkey registration and sign-in with invalid-origin/challenge/user-verification cases, expired/revoked sessions, CSRF rejection, removed-member and cross-household denial, one user's inability to list or revoke another user's sessions, and current-session sign-out. Browser checks cover the main flows at desktop and narrow mobile widths. PostgreSQL-backed tests must verify durable session behavior across application restarts.

## References

- [Bun password hashing](https://bun.com/docs/runtime/hashing)
- [SimpleWebAuthn passkey guidance](https://simplewebauthn.dev/docs/advanced/passkeys)
- [SimpleWebAuthn server API](https://simplewebauthn.dev/docs/packages/server)
- [OWASP multifactor authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html)
- [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

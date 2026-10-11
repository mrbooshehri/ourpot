# Security notes

- Household reads and writes require a server-side session and active household membership. Client-supplied identity headers are ignored.
- Passwords use Argon2id. MFA secrets are encrypted at rest; recovery codes are one-use. Passkeys require verified user presence.
- Mutating requests enforce origin checks. Sessions can be revoked and are checked on each request.
- Financial, planning, import, membership, and security changes write audit events without credentials, tokens, secrets, or recovery codes.
- Set `PUBLIC_ORIGIN` to HTTPS in production, provide a 64-character hex `TOTP_ENCRYPTION_KEY`, and never use the development fallback key.
- `BACKUP_KEY` protects encrypted backup artifacts. Store it outside the Compose host and test restore before relying on it.
- CSV/OFX/QIF files are untrusted input. Review every row before commit; imports never call an external bank API.

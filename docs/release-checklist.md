# Release checklist

## Configuration

- Set `PUBLIC_ORIGIN`, `WEBAUTHN_RP_ID`, `TOTP_ENCRYPTION_KEY`, `BOOTSTRAP_ADMIN_EMAIL`, and `BOOTSTRAP_ADMIN_PASSWORD`.
- Set `BACKUP_KEY` and protect the key separately from the backup volume.
- Configure SMTP/VAPID/mobile-push providers only when those adapters are enabled; the local MVP uses in-app notifications and manual invitation links.

## Database and deployment

1. Start PostgreSQL with `docker compose up -d postgres` and wait for its health check.
2. Apply ordered files in `migrations/` to a new volume; for upgrades, apply only files newer than the recorded `schema_migrations` rows.
3. Build with `docker compose build` and start `docker compose up -d`.
4. Verify `GET /api/health` and `GET /api/ready`.

## Financial operations

- Preview and review every import row before committing a CSV, OFX, or QIF file.
- Run `BACKUP_KEY=... bun run src/cli/backup.ts` and verify an `.ourpot` artifact.
- Restore into a disposable PostgreSQL database with `bun run src/cli/restore.ts <artifact>` before a production restore.

## Verification

- `bun test` and `bun run typecheck` must pass.
- `docker compose build` and Compose install/upgrade/restore smoke tests must pass.
- On a Flutter-enabled machine, run `cd mobile && flutter pub get && flutter analyze && flutter test`.
- Check the responsive UI in English, Persian, and Arabic; verify LTR/RTL direction, keyboard focus, and negative balances.

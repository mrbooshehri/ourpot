# Operations

## Health

`GET /api/health` is a process liveness check. `GET /api/ready` probes PostgreSQL and returns `503` while the app is not ready.

## Backups

Set `BACKUP_DIR`, `BACKUP_KEY`, and `DATABASE_URL`, then run `bun run src/cli/backup.ts`. The command runs `pg_dump`, encrypts the SQL with AES-256-GCM, and writes an `.ourpot` artifact with mode `0600`.

Restore only after validating the artifact and key: `BACKUP_KEY=... bun run src/cli/restore.ts ./backups/file.ourpot`. Restore writes through `psql` with `ON_ERROR_STOP=1`; take a fresh backup before replacing a live database.

Keep daily, weekly, and monthly windows in the backup volume. The service's retention helper treats these windows as overlapping and retains the largest configured count.

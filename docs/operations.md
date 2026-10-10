# Ourpot MVP Operations

## Local run

The repository targets Bun for local execution and Docker Compose for the complete app stack.

```bash
bun install
bun test
bun run src/server.ts
```

## Docker Compose

Start the web app, PostgreSQL, and reminder worker:

```bash
docker compose up -d --build
```

Open `http://localhost:3000`. PostgreSQL is available at `localhost:5432` with the development credentials from `docker-compose.yml`. The migration directory is mounted into PostgreSQL's initialization directory for a fresh database volume.

Stop the stack with `docker compose down`. Add `-v` only when intentionally deleting the local PostgreSQL volume.

Then open `http://localhost:3000`. Set `PORT` to another port if 3000 is already occupied.

Before first startup, set `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_PASSWORD` in the environment. The web client supports administrator-controlled onboarding, password sign-in, optional authenticator MFA with recovery codes, passkey sign-in and registration, household creation, and active-session revocation. Financial endpoints are session-protected.

## PostgreSQL

For a new Compose volume, PostgreSQL applies `0001_initial.sql` through `0006_user_profile_preferences.sql` automatically. For an existing volume, apply new migrations explicitly:

```bash
docker compose exec -T postgres psql -U ourpot -d ourpot -f /docker-entrypoint-initdb.d/0002_authentication.sql
docker compose exec -T postgres psql -U ourpot -d ourpot -f /docker-entrypoint-initdb.d/0003_passkey_reauthentication.sql
docker compose exec -T postgres psql -U ourpot -d ourpot -f /docker-entrypoint-initdb.d/0004_admin_onboarding.sql
docker compose exec -T postgres psql -U ourpot -d ourpot -f /docker-entrypoint-initdb.d/0005_unique_account_names.sql
docker compose exec -T postgres psql -U ourpot -d ourpot -f /docker-entrypoint-initdb.d/0006_user_profile_preferences.sql
```

Set `DATABASE_URL`, `PUBLIC_ORIGIN`, `WEBAUTHN_RP_ID`, and a random 32-byte hex `TOTP_ENCRYPTION_KEY` for deployments. HTTP localhost mode is enabled only by the explicit development setting in Compose.

Required production checks before release:

1. Run the migrations against a disposable PostgreSQL instance.
2. Run the full database-backed test suite and typecheck.
3. Start the server and exercise bootstrap admin login, forced password change, user creation, password login, MFA, passkey, household, and session flows in a browser at desktop and narrow widths.
4. Exercise account, transaction, transfer, budget, goal, task, subscription, and reminder flows after financial persistence is complete.
5. Configure secrets, backups, restore testing, health checks, structured logs, and a rollback procedure.

The current financial services remain in-memory behind the authenticated API. Do not treat that part as production persistence until its PostgreSQL repositories and migration are implemented.

## Verification limits in this workspace

Docker PostgreSQL and the HTTP API were exercised locally. A browser surface was unavailable to the computer-use tool, so physical authenticator prompts and visual responsive layout remain unverified here. WebAuthn cryptographic registration, origin/RP checks, user verification, challenge replay, passkey reauthentication, and counter updates are covered by signed test fixtures.

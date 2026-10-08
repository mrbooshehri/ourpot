# SDD ledger — plan: docs/superpowers/plans/2026-10-06-household-money-mvp.md

Pre-flight: Tasks 2–6 consume Task 1's shared TypeScript types, database client, and app registration point; later tasks also consume Task 2's HouseholdContext and Task 3's audit writer. No conflicting names found in the plan.

Task 1: Ruling: use Bun commands (`bun install`, `bun run test`, `bun run typecheck`) because the environment has Bun but no Node/npm; package/runtime structure remains TypeScript/Fastify/PostgreSQL/Vitest as specified. Cost if wrong: CI commands may need a small adapter when Node/npm is available.

Task 1: complete (no git commits available; tests: `bun test` → 6/6 pass; source syntax checks → pass).

Task 2: Ruling: implement the household application service against an in-memory repository boundary while package downloads and PostgreSQL tooling are unavailable. Cost if wrong: persistence and HTTP adapters still need to be added before production use; domain authorization behavior remains testable now.

Task 2: complete (no git commits available; tests: `bun test` → 9/9 pass; source syntax checks → pass).
Task 3: complete (no git commits available; tests: `bun test` → 14/14 pass; source syntax checks → pass).
Task 4: complete (no git commits available; tests: `bun test` → 17/17 pass; source syntax checks → pass).

Task 5: domain portion complete (no git commits available; tests: `bun test` → 20/20 pass; source syntax checks → pass). HTTP/dashboard and PostgreSQL persistence remain pending because dependencies could not be downloaded.

Task 5: HTTP/domain completion (no git commits available; tests: `bun test` → 26/26 pass; source syntax checks → pass; server bundle → pass). The app remains in-memory at runtime; PostgreSQL repositories and migration are present but live DB validation is blocked.

Task 6: responsive client shell and in-process MVP journey complete (no git commits available; HTTP shell test and `tests/e2e/mvp-journey.test.ts` pass). Live socket/browser validation is blocked by sandbox `Operation not permitted`.

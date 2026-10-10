import type { DatabaseClient } from './client';

export type Migration = Readonly<{ id: string; sql: string }>;
export type MigrationResult = Readonly<{ id: string; applied: boolean }>;

const trackingSql = `CREATE TABLE IF NOT EXISTS schema_migrations (
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`;

export const defaultMigrations: Migration[] = [
  { id: '0008_migration_tracking', sql: 'CREATE TABLE IF NOT EXISTS schema_migrations (id text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());' },
];

export class MigrationRunner {
  constructor(private readonly migrations: readonly Migration[] = defaultMigrations) {}

  async applyPending(db: DatabaseClient): Promise<MigrationResult[]> {
    await db.query(trackingSql);
    const applied = await db.query<{ id: string }>('SELECT id FROM schema_migrations');
    const known = new Set(applied.rows.map((row) => row.id));
    const results: MigrationResult[] = [];
    for (const migration of [...this.migrations].sort((a, b) => a.id.localeCompare(b.id))) {
      if (known.has(migration.id)) continue;
      await db.transaction(async (tx) => {
        await tx.query(migration.sql);
        await tx.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
      });
      results.push({ id: migration.id, applied: true });
    }
    return results;
  }
}

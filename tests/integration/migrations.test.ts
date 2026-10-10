import { describe, expect, it } from 'bun:test';
import type { DatabaseClient, SqlResult, SqlValue } from '../../src/db/client';
import { MigrationRunner, type Migration } from '../../src/db/migrations';

class MigrationDb implements DatabaseClient {
  readonly calls: string[] = [];
  applied = new Set<string>();
  async query<Row extends object = Record<string, unknown>>(sql: string, values: readonly SqlValue[] = []): Promise<SqlResult<Row>> {
    this.calls.push(sql);
    if (sql.includes('SELECT id FROM schema_migrations')) return { rows: [...this.applied].map((id) => ({ id })) as Row[] };
    if (sql.startsWith('INSERT INTO schema_migrations')) this.applied.add(String(values[0]));
    return { rows: [] };
  }
  async transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> { return work(this); }
}

describe('migration runner', () => {
  it('applies migrations in filename order and skips applied migrations', async () => {
    const db = new MigrationDb();
    const migrations: Migration[] = [
      { id: '0002_second', sql: 'CREATE TABLE second ();' },
      { id: '0001_first', sql: 'CREATE TABLE first ();' },
    ];
    const runner = new MigrationRunner(migrations);
    expect((await runner.applyPending(db)).map((migration) => migration.id)).toEqual(['0001_first', '0002_second']);
    expect((await runner.applyPending(db))).toEqual([]);
    expect(db.calls.filter((sql) => sql === 'CREATE TABLE first ();' || sql === 'CREATE TABLE second ();')).toEqual(['CREATE TABLE first ();', 'CREATE TABLE second ();']);
  });
});

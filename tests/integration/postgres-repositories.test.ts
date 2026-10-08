import { describe, expect, it } from 'bun:test';
import { PostgresHouseholdRepository, PostgresLedgerRepository } from '../../src/db/postgres-repositories';
import type { DatabaseClient, SqlResult, SqlValue } from '../../src/db/client';
import type { HouseholdContext } from '../../src/shared/household-context';

class FakeDb implements DatabaseClient {
  readonly calls: { sql: string; values: readonly SqlValue[] }[] = [];
  async query<Row extends object = Record<string, unknown>>(sql: string, values: readonly SqlValue[] = []): Promise<SqlResult<Row>> {
    this.calls.push({ sql, values });
    if (sql.includes('household_members')) return { rows: [{ user_id: 'u1', household_id: 'h1', role: 'owner' }] as Row[] };
    if (sql.includes('household_income')) return { rows: [{ household_income: 500, household_expense: 200 }] as Row[] };
    return { rows: [] };
  }
  async transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> { return work(this); }
}

const context: HouseholdContext = { userId: 'u1', householdId: 'h1', role: 'owner' };

describe('PostgreSQL repository boundaries', () => {
  it('scopes membership and ledger writes by household', async () => {
    const db = new FakeDb();
    const households = new PostgresHouseholdRepository(db);
    const ledger = new PostgresLedgerRepository(db);
    expect(await households.getContext('u1', 'h1')).toEqual(context);
    await ledger.createAccount(context, { id: 'a1', name: 'Checking', type: 'checking', openingBalance: 0 });
    await ledger.createMovement(context, { id: 't1', accountId: 'a1', amount: 100, type: 'expense', categoryId: null, description: 'Coffee', transactionDate: '2026-10-06' });
    expect(db.calls[1]?.values).toContain('h1');
    expect(db.calls[2]?.sql).toContain('a.household_id = $2');
  });

  it('runs transfer writes through one database transaction and reads totals by household', async () => {
    const db = new FakeDb();
    const ledger = new PostgresLedgerRepository(db);
    await ledger.createTransfer(context, { id: 'x1', sourceAccountId: 'a1', destinationAccountId: 'a2', amount: 100, description: 'Move', transactionDate: '2026-10-06' });
    expect(db.calls).toHaveLength(3);
    expect((await ledger.totals(context))).toEqual({ householdIncome: 500, householdExpense: 200 });
  });
});

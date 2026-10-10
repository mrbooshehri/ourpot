import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../../src/db/client';
import { PostgresTransactionService } from '../../src/modules/transactions/postgres-service';
import type { HouseholdContext } from '../../src/shared/household-context';

const db = createDatabaseClient();
const context: HouseholdContext = { userId: 'persist-owner', householdId: 'persist-home', role: 'owner' };

describe('durable household ledger', () => {
  it('persists balances and transactions across service instances', async () => {
    const householdId = `financial-${randomUUID()}`;
    const userId = `user-${randomUUID()}`;
    await db.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [userId, `${userId}@example.com`, 'test-hash']);
    await db.query('INSERT INTO households (id, name, currency, timezone) VALUES ($1, $2, $3, $4)', [householdId, 'Persist Home', 'USD', 'UTC']);
    await db.query("INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')", [householdId, userId]);
    const authorized = { userId, householdId, role: 'owner' as const };
    const first = new PostgresTransactionService(db);
    const account = await first.createAccount(authorized, { name: 'Checking', type: 'checking', openingBalance: 100 });
    const income = await first.createIncome(authorized, { accountId: account.id, amount: 500, description: 'Salary', category: 'Work', transactionDate: '2026-01-01' });
    expect(income.amount).toBe(500);
    expect((await db.query<{ count: number }>('SELECT count(*)::int AS count FROM outbox_events WHERE household_id=$1', [householdId])).rows[0]?.count).toBe(1);
    const second = new PostgresTransactionService(db);
    const dashboard = await second.getDashboard(authorized);
    expect(dashboard.accounts[0]).toMatchObject({ id: account.id, balance: 600 });
    expect(dashboard.totals.householdIncome).toBe(500);
  });

  it('edits and deletes a transaction with audit history and preserves negative balances', async () => {
    const householdId = `financial-${randomUUID()}`; const userId = `user-${randomUUID()}`;
    await db.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [userId, `${userId}@example.com`, 'test-hash']);
    await db.query('INSERT INTO households (id, name, currency, timezone) VALUES ($1, $2, $3, $4)', [householdId, 'Edit Home', 'USD', 'UTC']);
    await db.query("INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')", [householdId, userId]);
    const authorized = { userId, householdId, role: 'owner' as const }; const ledger = new PostgresTransactionService(db);
    const account = await ledger.createAccount(authorized, { name: 'Cash', type: 'cash', openingBalance: 0 });
    const expense = await ledger.createExpense(authorized, { accountId: account.id, amount: 50, description: 'Bill', category: 'Bills', transactionDate: '2026-01-02' });
    const edited = await ledger.updateTransaction(authorized, expense.id, { amount: 75, description: 'Large bill' });
    expect(edited.amount).toBe(75);
    expect((await ledger.getDashboard(authorized)).accounts[0]?.balance).toBe(-75);
    await ledger.deleteTransaction(authorized, expense.id);
    expect((await ledger.getDashboard(authorized)).accounts[0]?.balance).toBe(0);
    expect((await ledger.getDashboard(authorized)).audits.filter((event) => event.entityId === expense.id).map((event) => event.action)).toEqual(['created', 'updated', 'deleted']);
  });

  it('rolls back a transfer when an account is outside the household', async () => {
    const householdId = `financial-${randomUUID()}`; const userId = `user-${randomUUID()}`;
    await db.query('INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)', [userId, `${userId}@example.com`, 'test-hash']);
    await db.query('INSERT INTO households (id, name, currency, timezone) VALUES ($1, $2, $3, $4)', [householdId, 'Transfer Home', 'USD', 'UTC']);
    await db.query("INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, 'owner')", [householdId, userId]);
    const authorized = { userId, householdId, role: 'owner' as const }; const ledger = new PostgresTransactionService(db);
    const account = await ledger.createAccount(authorized, { name: 'One', type: 'checking', openingBalance: 100 });
    await expect(ledger.createTransfer(authorized, { sourceAccountId: account.id, destinationAccountId: 'missing', amount: 40, description: 'Bad move', transactionDate: '2026-01-03' })).rejects.toThrow('Household access denied');
    expect((await ledger.getDashboard(authorized)).accounts[0]?.balance).toBe(100);
  });
});

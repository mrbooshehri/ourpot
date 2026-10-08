import { describe, expect, it } from 'bun:test';
import { LedgerService } from '../../src/modules/transactions/service';
import type { HouseholdContext } from '../../src/shared/household-context';

const owner: HouseholdContext = { userId: 'u1', householdId: 'h1', role: 'owner' };
const member: HouseholdContext = { userId: 'u2', householdId: 'h1', role: 'member' };
const outsider: HouseholdContext = { userId: 'u3', householdId: 'h2', role: 'owner' };

describe('household ledger', () => {
  it('records income and expense and reports entrant and household totals', () => {
    const ledger = new LedgerService();
    const account = ledger.createAccount(owner, 'Checking', 'checking', 10000);
    ledger.createIncome(owner, account.id, 5000, 'Salary', 'Income');
    ledger.createExpense(member, account.id, 1250, 'Groceries', 'Food');

    expect(ledger.getAccountBalance(owner, account.id)).toBe(13750);
    expect(ledger.getTotals(owner)).toEqual({
      householdIncome: 5000,
      householdExpense: 1250,
      byEntrant: {
        u1: { income: 5000, expense: 0 },
        u2: { income: 0, expense: 1250 },
      },
    });
  });

  it('keeps refunds as income and adjustments out of income and expense totals', () => {
    const ledger = new LedgerService();
    const account = ledger.createAccount(owner, 'Checking', 'checking', 0);
    ledger.createIncome(owner, account.id, 800, 'Returned item', 'Refund');
    ledger.createAdjustment(owner, account.id, 200, 'Statement correction');

    expect(ledger.getAccountBalance(owner, account.id)).toBe(1000);
    expect(ledger.getTotals(owner).householdIncome).toBe(800);
    expect(ledger.getTotals(owner).householdExpense).toBe(0);
  });

  it('moves transfers between accounts without affecting income or expense', () => {
    const ledger = new LedgerService();
    const source = ledger.createAccount(owner, 'Checking', 'checking', 1000);
    const destination = ledger.createAccount(owner, 'Savings', 'savings', 0);
    ledger.createTransfer(member, source.id, destination.id, 400, 'Move to savings');

    expect(ledger.getAccountBalance(owner, source.id)).toBe(600);
    expect(ledger.getAccountBalance(owner, destination.id)).toBe(400);
    expect(ledger.getTotals(owner)).toMatchObject({ householdIncome: 0, householdExpense: 0 });
  });

  it('soft-deletes a transaction and preserves an audit event', () => {
    const ledger = new LedgerService();
    const account = ledger.createAccount(owner, 'Checking', 'checking', 0);
    const transaction = ledger.createExpense(owner, account.id, 100, 'Coffee', 'Food');
    ledger.softDeleteTransaction(member, transaction.id);

    expect(ledger.getAccountBalance(owner, account.id)).toBe(0);
    expect(ledger.getAuditEvents(owner).map((event) => event.action)).toContain('deleted');
  });

  it('denies cross-household account access', () => {
    const ledger = new LedgerService();
    const account = ledger.createAccount(owner, 'Checking', 'checking', 0);
    expect(() => ledger.createExpense(outsider, account.id, 100, 'Intrusion', 'Other')).toThrow('Household access denied');
  });
});

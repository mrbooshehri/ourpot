import { describe, expect, it } from 'bun:test';
import { LedgerService } from '../../src/modules/transactions/service';
import { buildHouseholdReport } from '../../src/modules/reports/service';
import type { HouseholdContext } from '../../src/shared/household-context';

describe('household reports', () => {
  it('includes date bounds and groups financial activity without counting transfers or opening balances', () => {
    const ledger = new LedgerService();
    const one: HouseholdContext = { userId: 'one', householdId: 'home', role: 'owner' };
    const two: HouseholdContext = { userId: 'two', householdId: 'home', role: 'member' };
    const checking = ledger.createAccount(one, 'Checking', 'checking', 500);
    ledger.createIncome(one, checking.id, 1000, 'Salary', 'Work', '2026-01-01');
    ledger.createExpense(two, checking.id, 250, 'Rent', 'Housing', '2026-01-31');
    ledger.createExpense(one, checking.id, 90, 'Outside range', 'Other', '2026-02-01');
    const savings = ledger.createAccount(one, 'Savings', 'savings', 300);
    ledger.createTransfer(two, checking.id, savings.id, 50, 'Move', '2026-01-15');
    const report = buildHouseholdReport(ledger, one, { from: '2026-01-01', to: '2026-01-31' });
    expect(report.household).toEqual({ income: 1000, expense: 250, net: 750 });
    expect(report.byEntrant.one).toEqual({ income: 1000, expense: 0 });
    expect(report.byEntrant.two).toEqual({ income: 0, expense: 250 });
    expect(report.byCategory).toEqual({ Housing: 250 });
    expect(report.monthly).toEqual([{ month: '2026-01', income: 1000, expense: 250, net: 750 }]);
    expect(report.accountBalances).toEqual([{ accountId: checking.id, name: 'Checking', balance: 1110 }, { accountId: savings.id, name: 'Savings', balance: 350 }]);
  });
});

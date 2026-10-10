import type { HouseholdContext } from '../../shared/household-context';
import type { LedgerService } from '../transactions/service';
import type { HouseholdReport, ReportRange } from './types';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function validateRange(range: ReportRange): void {
  if (!DATE.test(range.from) || !DATE.test(range.to) || range.from > range.to) throw new Error('Invalid report date range');
}
export function buildHouseholdReport(ledger: Pick<LedgerService, 'listTransactions' | 'listAccounts'>, context: HouseholdContext, range: ReportRange): HouseholdReport {
  validateRange(range);
  const household = { income: 0, expense: 0, net: 0 };
  const byEntrant: HouseholdReport['byEntrant'] = {};
  const byCategory: HouseholdReport['byCategory'] = {};
  const monthly = new Map<string, { income: number; expense: number; net: number }>();
  for (const transaction of ledger.listTransactions(context)) {
    if (transaction.deleted || transaction.type === 'transfer' || transaction.type === 'adjustment' || transaction.transactionDate < range.from || transaction.transactionDate > range.to) continue;
    const entrant = byEntrant[transaction.enteredBy] ??= { income: 0, expense: 0 };
    const month = transaction.transactionDate.slice(0, 7);
    const series = monthly.get(month) ?? { income: 0, expense: 0, net: 0 };
    const category = transaction.category || 'Uncategorized';
    if (transaction.type === 'income') { household.income += transaction.amount; household.net += transaction.amount; entrant.income += transaction.amount; series.income += transaction.amount; series.net += transaction.amount; }
    else { household.expense += transaction.amount; household.net -= transaction.amount; entrant.expense += transaction.amount; series.expense += transaction.amount; series.net -= transaction.amount; byCategory[category] = (byCategory[category] ?? 0) + transaction.amount; }
    monthly.set(month, series);
  }
  return { range, household, byEntrant, byCategory, accountBalances: ledger.listAccounts(context).map((account) => ({ accountId: account.id, name: account.name, balance: account.balance })), monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, values]) => ({ month, ...values })) };
}

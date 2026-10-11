import type { HouseholdContext } from '../shared/household-context';
import type { PostgresTransactionService } from '../modules/transactions/postgres-service';
import { ExportService } from '../modules/exports/service';

export class ApiV1Adapter {
  readonly exports = new ExportService();
  constructor(private readonly ledger: PostgresTransactionService) {}
  async dashboard(context: HouseholdContext) { return this.ledger.getDashboard(context); }
  async report(context: HouseholdContext, from: string, to: string) {
    const { buildReportFromData } = await import('../modules/reports/service');
    return buildReportFromData(await this.ledger.listTransactions(context), (await this.ledger.getDashboard(context)).accounts, { from, to });
  }
  async export(context: HouseholdContext, format: 'json' | 'csv') {
    if (format !== 'json' && format !== 'csv') throw new Error('Unsupported export format');
    return this.exports.render(format, await this.ledger.listTransactions(context));
  }
}

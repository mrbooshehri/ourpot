import type { DatabaseClient, SqlValue } from './client';
import type { HouseholdContext } from '../shared/household-context';

export type QueryRecorder = Readonly<{ sql: string; values: readonly SqlValue[] }>;

export class PostgresHouseholdRepository {
  constructor(private readonly db: DatabaseClient) {}

  async getContext(userId: string, householdId: string): Promise<HouseholdContext> {
    const result = await this.db.query<{ user_id: string; household_id: string; role: 'owner' | 'member' }>(
      `SELECT user_id, household_id, role\n       FROM household_members\n       WHERE user_id = $1 AND household_id = $2 AND active = true`,
      [userId, householdId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Household access denied');
    return { userId: row.user_id, householdId: row.household_id, role: row.role };
  }
}

export class PostgresLedgerRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createAccount(context: HouseholdContext, input: { id: string; name: string; type: string; openingBalance: number }): Promise<void> {
    await this.db.query(
      `INSERT INTO accounts (id, household_id, name, type, opening_balance)\n       VALUES ($1, $2, $3, $4, $5)`,
      [input.id, context.householdId, input.name, input.type, input.openingBalance],
    );
  }

  async createMovement(context: HouseholdContext, input: { id: string; accountId: string; amount: number; type: string; categoryId: string | null; description: string; transactionDate: string }): Promise<void> {
    await this.db.query(
      `INSERT INTO transactions (id, household_id, account_id, amount_minor, type, category_id, description, transaction_date, entered_by)\n       SELECT $1, $2, a.id, $3, $4, $5, $6, $7, $8\n       FROM accounts a\n       WHERE a.id = $9 AND a.household_id = $2 AND a.archived = false`,
      [input.id, context.householdId, input.amount, input.type, input.categoryId, input.description, input.transactionDate, context.userId, input.accountId],
    );
  }

  async createTransfer(context: HouseholdContext, input: { id: string; sourceAccountId: string; destinationAccountId: string; amount: number; description: string; transactionDate: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO transfer_pairs (id, household_id, source_account_id, destination_account_id, amount_minor, description, created_by)\n         SELECT $1, $2, source.id, destination.id, $3, $4, $5\n         FROM accounts source\n         CROSS JOIN accounts destination\n         WHERE source.id = $6 AND destination.id = $7\n           AND source.household_id = $2 AND destination.household_id = $2\n           AND source.archived = false AND destination.archived = false`,
        [input.id, context.householdId, input.amount, input.description, context.userId, input.sourceAccountId, input.destinationAccountId],
      );
      await tx.query(
        `INSERT INTO transactions (id, household_id, account_id, amount_minor, type, description, transaction_date, entered_by)\n         SELECT $1, $2, id, $3, 'transfer', $4, $5, $6 FROM accounts\n         WHERE id = $7 AND household_id = $2 AND archived = false`,
        [`${input.id}:source`, context.householdId, input.amount, input.description, input.transactionDate, context.userId, input.sourceAccountId],
      );
      await tx.query(
        `INSERT INTO transactions (id, household_id, account_id, amount_minor, type, description, transaction_date, entered_by)\n         SELECT $1, $2, id, $3, 'transfer', $4, $5, $6 FROM accounts\n         WHERE id = $7 AND household_id = $2 AND archived = false`,
        [`${input.id}:destination`, context.householdId, input.amount, input.description, input.transactionDate, context.userId, input.destinationAccountId],
      );
    });
  }

  async totals(context: HouseholdContext): Promise<{ householdIncome: number; householdExpense: number }> {
    const result = await this.db.query<{ household_income: number; household_expense: number }>(
      `SELECT\n         COALESCE(SUM(amount_minor) FILTER (WHERE type = 'income'), 0)::bigint AS household_income,\n         COALESCE(SUM(amount_minor) FILTER (WHERE type = 'expense'), 0)::bigint AS household_expense\n       FROM transactions\n       WHERE household_id = $1 AND deleted_at IS NULL`,
      [context.householdId],
    );
    const row = result.rows[0] ?? { household_income: 0, household_expense: 0 };
    return { householdIncome: Number(row.household_income), householdExpense: Number(row.household_expense) };
  }
}

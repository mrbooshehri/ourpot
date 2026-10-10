import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import type { HouseholdContext } from '../../shared/household-context';
import type { AccountView, TransactionView, TransferView } from './service';

export type AccountInput = { name: string; type: 'checking' | 'savings' | 'cash' | 'credit_card' | 'loan'; openingBalance: number };
export type MovementInput = { accountId: string; amount: number; description: string; category?: string; transactionDate: string };
export type TransferInput = { sourceAccountId: string; destinationAccountId: string; amount: number; description: string; transactionDate: string };
export type DashboardLedgerView = { accounts: AccountView[]; totals: { householdIncome: number; householdExpense: number; byEntrant: Record<string, { income: number; expense: number }> }; audits: Array<{ id: string; householdId: string; actorUserId: string; entityType: string; entityId: string; action: string; before: unknown; after: unknown; createdAt: Date }> };

type AccountRow = { id: string; household_id: string; name: string; type: AccountInput['type']; opening_balance: number; archived: boolean; balance?: number };
type TransactionRow = { id: string; household_id: string; account_id: string; amount_minor: number; type: 'income'|'expense'|'adjustment'|'transfer'; description: string; category: string | null; entered_by: string; transaction_date: string; deleted_at: Date | null };
const positive = (value: number) => { if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Amount must be a positive integer'); };
const dateOnly = (value: string) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must be YYYY-MM-DD'); };
const accountView = (row: AccountRow): AccountView => ({ id: row.id, householdId: row.household_id, name: row.name, type: row.type, balance: Number(row.balance ?? row.opening_balance), archived: row.archived });
const transactionView = (row: TransactionRow): TransactionView => ({ id: row.id, householdId: row.household_id, accountId: row.account_id, amount: Number(row.amount_minor), type: row.type, description: row.description, ...(row.category ? { category: row.category } : {}), enteredBy: row.entered_by, deleted: !!row.deleted_at, transactionDate: row.transaction_date });

export class PostgresTransactionService {
  constructor(private readonly db: DatabaseClient) {}

  async createAccount(context: HouseholdContext, input: AccountInput): Promise<AccountView> {
    const name = input.name.trim(); if (!name) throw new Error('Account name is required');
    if (!Number.isSafeInteger(input.openingBalance) || input.openingBalance < 0) throw new Error('Opening balance must be a non-negative integer');
    const id = randomUUID();
    return this.db.transaction(async (tx) => {
      const result = await tx.query<AccountRow>('INSERT INTO accounts (id, household_id, name, type, opening_balance) VALUES ($1,$2,$3,$4,$5) RETURNING id, household_id, name, type, opening_balance, archived', [id, context.householdId, name, input.type, input.openingBalance]);
      const row = result.rows[0]; if (!row) throw new Error('Account creation failed');
      const account = accountView(row);
      await this.audit(tx, context, 'account', id, 'created', null, account);
      return account;
    });
  }

  createIncome(context: HouseholdContext, input: MovementInput): Promise<TransactionView> { return this.createMovement(context, input, 'income'); }
  createExpense(context: HouseholdContext, input: MovementInput): Promise<TransactionView> { return this.createMovement(context, input, 'expense'); }

  private async createMovement(context: HouseholdContext, input: MovementInput, type: 'income'|'expense'): Promise<TransactionView> {
    positive(input.amount); dateOnly(input.transactionDate); const id = randomUUID();
    return this.db.transaction(async (tx) => {
      const account = await this.requireAccount(tx, context, input.accountId, true);
      const categoryId = input.category?.trim() ? await this.categoryId(tx, context, input.category.trim()) : null;
      const inserted = await tx.query<TransactionRow>(`INSERT INTO transactions (id, household_id, account_id, amount_minor, type, category_id, description, transaction_date, entered_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, household_id, account_id, amount_minor, type, description, transaction_date::text, entered_by, deleted_at`, [id, context.householdId, account.id, input.amount, type, categoryId, input.description.trim(), input.transactionDate, context.userId]);
      const row = inserted.rows[0]; if (!row) throw new Error('Transaction creation failed');
      const view = transactionView({ ...row, category: input.category?.trim() || null });
      await this.audit(tx, context, 'transaction', id, 'created', null, view);
      return view;
    });
  }

  async createTransfer(context: HouseholdContext, input: TransferInput): Promise<TransferView> {
    positive(input.amount); dateOnly(input.transactionDate); if (input.sourceAccountId === input.destinationAccountId) throw new Error('Self-transfer is not allowed');
    const id = randomUUID();
    return this.db.transaction(async (tx) => {
      const source = await this.requireAccount(tx, context, input.sourceAccountId, true); const destination = await this.requireAccount(tx, context, input.destinationAccountId, true);
      await tx.query('INSERT INTO transfer_pairs (id, household_id, source_account_id, destination_account_id, amount_minor, description, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7)', [id, context.householdId, source.id, destination.id, input.amount, input.description.trim(), context.userId]);
      await tx.query('INSERT INTO transactions (id, household_id, account_id, amount_minor, type, description, transaction_date, entered_by) VALUES ($1,$2,$3,$4,\'transfer\',$5,$6,$7),($8,$2,$9,$4,\'transfer\',$5,$6,$7)', [`${id}:source`, context.householdId, source.id, input.amount, input.description.trim(), input.transactionDate, context.userId, `${id}:destination`, destination.id]);
      const view = { id, sourceAccountId: source.id, destinationAccountId: destination.id, amount: input.amount, description: input.description.trim() };
      await this.audit(tx, context, 'transfer', id, 'created', null, view);
      return view;
    });
  }

  async updateTransaction(context: HouseholdContext, id: string, patch: { amount?: number; description?: string; category?: string; transactionDate?: string }): Promise<TransactionView> {
    if (patch.amount !== undefined) positive(patch.amount); if (patch.transactionDate) dateOnly(patch.transactionDate);
    return this.db.transaction(async (tx) => {
      const old = await this.transaction(tx, context, id, true); if (!old) throw new Error('Transaction not found');
      if (old.type === 'transfer') throw new Error('Transfer edits are not supported');
      const categoryId = patch.category?.trim() ? await this.categoryId(tx, context, patch.category.trim()) : undefined;
      const result = await tx.query<TransactionRow>(`UPDATE transactions SET amount_minor = COALESCE($3, amount_minor), description = COALESCE($4, description), category_id = COALESCE($5, category_id), transaction_date = COALESCE($6, transaction_date), updated_at = now() WHERE id = $1 AND household_id = $2 AND deleted_at IS NULL RETURNING id, household_id, account_id, amount_minor, type, description, transaction_date::text, entered_by, deleted_at`, [id, context.householdId, patch.amount ?? null, patch.description?.trim() ?? null, categoryId ?? null, patch.transactionDate ?? null]);
      const row = result.rows[0]; if (!row) throw new Error('Transaction not found'); const view = transactionView({ ...row, category: patch.category ?? old.category ?? null }); await this.audit(tx, context, 'transaction', id, 'updated', old, view); return view;
    });
  }

  async deleteTransaction(context: HouseholdContext, id: string): Promise<void> {
    await this.db.transaction(async (tx) => { const old = await this.transaction(tx, context, id, true); if (!old) throw new Error('Transaction not found'); if (old.deleted) return; await tx.query('UPDATE transactions SET deleted_at = now(), updated_at = now() WHERE id = $1 AND household_id = $2', [id, context.householdId]); await this.audit(tx, context, 'transaction', id, 'deleted', old, { ...old, deleted: true }); });
  }

  async getDashboard(context: HouseholdContext): Promise<DashboardLedgerView> {
    const accounts = await this.db.query<AccountRow>(`SELECT a.id, a.household_id, a.name, a.type, a.opening_balance, a.archived, a.opening_balance + COALESCE(SUM(CASE WHEN t.deleted_at IS NULL AND t.type IN ('income','adjustment') THEN t.amount_minor WHEN t.deleted_at IS NULL AND t.type = 'expense' THEN -t.amount_minor WHEN t.deleted_at IS NULL AND t.type = 'transfer' AND t.id LIKE '%:destination' THEN t.amount_minor WHEN t.deleted_at IS NULL AND t.type = 'transfer' THEN -t.amount_minor ELSE 0 END),0) AS balance FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id AND t.household_id = $1 WHERE a.household_id = $1 GROUP BY a.id ORDER BY a.created_at`, [context.householdId]);
    const totals = await this.db.query<{ household_income:number; household_expense:number }>(`SELECT COALESCE(SUM(amount_minor) FILTER (WHERE type='income'),0) AS household_income, COALESCE(SUM(amount_minor) FILTER (WHERE type='expense'),0) AS household_expense FROM transactions WHERE household_id=$1 AND deleted_at IS NULL`, [context.householdId]);
    const entrants = await this.db.query<{ entered_by:string; income:number; expense:number }>(`SELECT entered_by, COALESCE(SUM(amount_minor) FILTER (WHERE type='income'),0) AS income, COALESCE(SUM(amount_minor) FILTER (WHERE type='expense'),0) AS expense FROM transactions WHERE household_id=$1 AND deleted_at IS NULL GROUP BY entered_by`, [context.householdId]);
    const audits = await this.db.query<{ id:string; household_id:string; actor_user_id:string; entity_type:string; entity_id:string; action:string; before_json:unknown; after_json:unknown; created_at:Date }>('SELECT id, household_id, actor_user_id, entity_type, entity_id, action, before_json, after_json, created_at FROM audit_events WHERE household_id=$1 ORDER BY created_at', [context.householdId]);
    const byEntrant: Record<string,{income:number;expense:number}> = {}; for (const row of entrants.rows) byEntrant[row.entered_by] = { income: Number(row.income), expense: Number(row.expense) };
    const total = totals.rows[0] ?? { household_income: 0, household_expense: 0 };
    return { accounts: accounts.rows.map(accountView), totals: { householdIncome: Number(total.household_income), householdExpense: Number(total.household_expense), byEntrant }, audits: audits.rows.map((row) => ({ id: row.id, householdId: row.household_id, actorUserId: row.actor_user_id, entityType: row.entity_type, entityId: row.entity_id, action: row.action, before: row.before_json, after: row.after_json, createdAt: row.created_at })) };
  }

  private async requireAccount(tx: DatabaseClient, context: HouseholdContext, id: string, lock: boolean): Promise<{ id:string }> { const result = await tx.query<{ id:string; archived:boolean }>(`SELECT id, archived FROM accounts WHERE id=$1 AND household_id=$2${lock ? ' FOR UPDATE' : ''}`, [id, context.householdId]); const row = result.rows[0]; if (!row) throw new Error('Household access denied'); if (row.archived) throw new Error('Archived account cannot receive transactions'); return row; }
  private async categoryId(tx: DatabaseClient, context: HouseholdContext, name: string): Promise<string> { const id = randomUUID(); const result = await tx.query<{ id:string }>('INSERT INTO categories (id, household_id, name) VALUES ($1,$2,$3) ON CONFLICT (household_id, name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [id, context.householdId, name]); return result.rows[0]!.id; }
  private async transaction(tx: DatabaseClient, context: HouseholdContext, id: string, lock: boolean): Promise<TransactionView | null> { const result = await tx.query<TransactionRow>(`SELECT t.id, t.household_id, t.account_id, t.amount_minor, t.type, t.description, c.name AS category, t.entered_by, t.transaction_date::text, t.deleted_at FROM transactions t LEFT JOIN categories c ON c.id=t.category_id WHERE t.id=$1 AND t.household_id=$2${lock ? ' FOR UPDATE OF t' : ''}`, [id, context.householdId]); const row=result.rows[0]; return row ? transactionView(row) : null; }
  private async audit(tx: DatabaseClient, context: HouseholdContext, entityType: string, entityId: string, action: string, before: unknown, after: unknown): Promise<void> { await tx.query('INSERT INTO audit_events (id, household_id, actor_user_id, entity_type, entity_id, action, before_json, after_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), context.householdId, context.userId, entityType, entityId, action, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after)]); }
}

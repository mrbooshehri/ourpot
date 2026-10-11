import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import type { HouseholdContext } from '../../shared/household-context';
import { parseImport } from './parsers';
import type { ImportBatchView, ImportCommitResult, ImportRow } from './types';

type ImportInput = { fileName: string; content: string; accountId: string };
type BatchRow = { account_id: string; status: string };
type StoredRow = {
  id: string; transaction_date: string; amount_minor: number; type: 'income' | 'expense';
  description: string; fingerprint: string; duplicate_of: string | null; decision: 'pending' | 'accept' | 'skip';
};

export class ImportService {
  constructor(private readonly db: DatabaseClient) {}

  async createBatch(context: HouseholdContext, input: ImportInput): Promise<ImportBatchView> {
    const preview = parseImport({ name: input.fileName, content: input.content });
    if (!preview.rows.length) throw new Error('Import file contains no transactions');
    const batchId = randomUUID();
    const rows = preview.rows.map((row) => ({ ...row, id: randomUUID() }));
    await this.db.transaction(async (tx) => {
      const account = await tx.query<{ id: string }>(
        'SELECT id FROM accounts WHERE id=$1 AND household_id=$2 AND archived=false',
        [input.accountId, context.householdId],
      );
      if (!account.rows[0]) throw new Error('Household access denied');
      await tx.query(
        "INSERT INTO import_batches (id,household_id,created_by,file_name,account_id,status) VALUES ($1,$2,$3,$4,$5,'review')",
        [batchId, context.householdId, context.userId, input.fileName, input.accountId],
      );
      for (const row of rows) {
        await tx.query(
          'INSERT INTO import_rows (id,batch_id,transaction_date,amount_minor,type,description,fingerprint,duplicate_of) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [row.id, batchId, row.transactionDate, row.amountMinor, row.type, row.description, row.fingerprint, row.duplicateOf ?? null],
        );
      }
    });
    return { id: batchId, status: 'review', rows };
  }

  async reviewRow(context: HouseholdContext, batchId: string, rowId: string, decision: 'accept' | 'skip'): Promise<ImportRow> {
    const result = await this.db.query<StoredRow>(
      `UPDATE import_rows AS row SET decision=$3 FROM import_batches AS batch
       WHERE row.id=$1 AND row.batch_id=$2 AND batch.id=row.batch_id
         AND batch.household_id=$4 AND batch.status='review'
       RETURNING row.id, row.transaction_date::text, row.amount_minor, row.type, row.description, row.fingerprint, row.duplicate_of, row.decision`,
      [rowId, batchId, decision, context.householdId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Import row not found');
    return this.viewRow(row);
  }

  async commitBatch(context: HouseholdContext, batchId: string): Promise<ImportCommitResult> {
    return this.db.transaction(async (tx) => {
      const batch = await tx.query<BatchRow>(
        "SELECT account_id,status FROM import_batches WHERE id=$1 AND household_id=$2 FOR UPDATE",
        [batchId, context.householdId],
      );
      const current = batch.rows[0];
      if (!current) throw new Error('Import batch not found');
      if (current.status !== 'review') throw new Error('Import batch has already been finalized');
      const rows = await tx.query<StoredRow>('SELECT id, transaction_date::text, amount_minor, type, description, fingerprint, duplicate_of, decision FROM import_rows WHERE batch_id=$1 ORDER BY id', [batchId]);
      if (rows.rows.some((row) => row.decision === 'pending')) throw new Error('Review every import row before committing');
      let accepted = 0;
      let skipped = 0;
      for (const row of rows.rows) {
        if (row.decision === 'skip') { skipped++; continue; }
        const transactionId = randomUUID();
        await tx.query(
          'INSERT INTO transactions (id,household_id,account_id,amount_minor,type,description,transaction_date,entered_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [transactionId, context.householdId, current.account_id, row.amount_minor, row.type, row.description, row.transaction_date, context.userId],
        );
        await tx.query(
          'INSERT INTO audit_events (id,household_id,actor_user_id,entity_type,entity_id,action,before_json,after_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [randomUUID(), context.householdId, context.userId, 'transaction', transactionId, 'imported', null,
            JSON.stringify({ batchId, rowId: row.id, amount: Number(row.amount_minor), type: row.type })],
        );
        accepted++;
      }
      await tx.query("UPDATE import_batches SET status='committed' WHERE id=$1 AND household_id=$2", [batchId, context.householdId]);
      await tx.query(
        'INSERT INTO audit_events (id,household_id,actor_user_id,entity_type,entity_id,action,before_json,after_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [randomUUID(), context.householdId, context.userId, 'import_batch', batchId, 'committed', null, JSON.stringify({ accepted, skipped })],
      );
      return { accepted, skipped };
    });
  }

  async cancelBatch(context: HouseholdContext, batchId: string): Promise<void> {
    const result = await this.db.query<{ id: string }>(
      "UPDATE import_batches SET status='cancelled' WHERE id=$1 AND household_id=$2 AND status='review' RETURNING id",
      [batchId, context.householdId],
    );
    if (!result.rows[0]) throw new Error('Import batch not found');
  }

  private viewRow(row: StoredRow): ImportRow {
    return { id: row.id, transactionDate: row.transaction_date, amountMinor: Number(row.amount_minor),
      type: row.type, description: row.description, fingerprint: row.fingerprint,
      ...(row.duplicate_of ? { duplicateOf: row.duplicate_of } : {}) };
  }
}

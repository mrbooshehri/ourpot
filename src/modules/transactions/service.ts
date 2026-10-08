import { assertHouseholdMember, type HouseholdContext } from '../../shared/household-context';
import { AuditService, type AuditEvent } from '../audit/service';

type AccountType = 'checking' | 'savings' | 'cash' | 'credit_card' | 'loan';
type TransactionType = 'income' | 'expense' | 'adjustment' | 'transfer';

type Account = {
  id: string;
  householdId: string;
  name: string;
  type: AccountType;
  balance: number;
  archived: boolean;
};

type Transaction = {
  id: string;
  householdId: string;
  accountId: string;
  amount: number;
  type: TransactionType;
  description: string;
  category?: string;
  enteredBy: string;
  deleted: boolean;
};

export type AccountView = Readonly<Omit<Account, 'balance' | 'archived'> & { balance: number; archived: boolean }>;
export type Totals = Readonly<{
  householdIncome: number;
  householdExpense: number;
  byEntrant: Record<string, { income: number; expense: number }>;
}>;

let nextId = 1;
function id(prefix: string): string { return `${prefix}_${nextId++}`; }
function assertPositiveAmount(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer');
}

export class LedgerService {
  private readonly accounts = new Map<string, Account>();
  private readonly transactions = new Map<string, Transaction>();
  private readonly audits = new AuditService();

  createAccount(context: HouseholdContext, name: string, type: AccountType, openingBalance: number): AccountView {
    if (!name.trim()) throw new Error('Account name is required');
    if (!Number.isSafeInteger(openingBalance) || openingBalance < 0) throw new Error('Opening balance must be a non-negative integer');
    const account: Account = { id: id('account'), householdId: context.householdId, name: name.trim(), type, balance: openingBalance, archived: false };
    this.accounts.set(account.id, account);
    this.audits.record(context, 'account', account.id, 'created', null, account);
    return { ...account };
  }

  createIncome(context: HouseholdContext, accountId: string, amount: number, description: string, category: string): TransactionView {
    return this.createMovement(context, accountId, amount, 'income', description, category);
  }

  createExpense(context: HouseholdContext, accountId: string, amount: number, description: string, category: string): TransactionView {
    return this.createMovement(context, accountId, amount, 'expense', description, category);
  }

  createAdjustment(context: HouseholdContext, accountId: string, amount: number, description: string): TransactionView {
    return this.createMovement(context, accountId, amount, 'adjustment', description);
  }

  createTransfer(context: HouseholdContext, sourceAccountId: string, destinationAccountId: string, amount: number, description: string): TransferView {
    assertPositiveAmount(amount);
    if (sourceAccountId === destinationAccountId) throw new Error('Self-transfer is not allowed');
    const source = this.requireAccount(context, sourceAccountId);
    const destination = this.requireAccount(context, destinationAccountId);
    if (source.archived || destination.archived) throw new Error('Archived account cannot receive transactions');
    const sourceBefore = { ...source };
    const destinationBefore = { ...destination };
    source.balance -= amount;
    destination.balance += amount;
    const transferId = id('transfer');
    this.audits.record(context, 'transfer', transferId, 'created', { source: sourceBefore, destination: destinationBefore }, { source: { ...source }, destination: { ...destination }, amount, description });
    return { id: transferId, sourceAccountId, destinationAccountId, amount, description };
  }

  softDeleteTransaction(context: HouseholdContext, transactionId: string): void {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) throw new Error('Transaction not found');
    assertHouseholdMember(context, transaction.householdId);
    if (transaction.deleted) return;
    const account = this.requireAccount(context, transaction.accountId);
    const before = { ...transaction };
    account.balance -= this.signedImpact(transaction);
    transaction.deleted = true;
    this.audits.record(context, 'transaction', transaction.id, 'deleted', before, { ...transaction });
  }

  getAccountBalance(context: HouseholdContext, accountId: string): number {
    return this.requireAccount(context, accountId).balance;
  }

  listAccounts(context: HouseholdContext): AccountView[] {
    return [...this.accounts.values()]
      .filter((account) => account.householdId === context.householdId)
      .map((account) => ({ ...account }));
  }


  getTotals(context: HouseholdContext): Totals {
    let householdIncome = 0;
    let householdExpense = 0;
    const byEntrant: Record<string, { income: number; expense: number }> = {};
    for (const transaction of this.transactions.values()) {
      if (transaction.householdId !== context.householdId || transaction.deleted || transaction.type === 'adjustment' || transaction.type === 'transfer') continue;
      const entrantTotals = byEntrant[transaction.enteredBy] ??= { income: 0, expense: 0 };
      if (transaction.type === 'income') {
        householdIncome += transaction.amount;
        entrantTotals.income += transaction.amount;
      } else {
        householdExpense += transaction.amount;
        entrantTotals.expense += transaction.amount;
      }
    }
    return { householdIncome, householdExpense, byEntrant };
  }

  getAuditEvents(context: HouseholdContext): AuditEvent[] {
    return this.audits.list(context.householdId);
  }

  private createMovement(context: HouseholdContext, accountId: string, amount: number, type: Exclude<TransactionType, 'transfer'>, description: string, category?: string): TransactionView {
    assertPositiveAmount(amount);
    const account = this.requireAccount(context, accountId);
    if (account.archived) throw new Error('Archived account cannot receive transactions');
    const transaction: Transaction = { id: id('transaction'), householdId: context.householdId, accountId, amount, type, description, ...(category ? { category } : {}), enteredBy: context.userId, deleted: false };
    const before = { ...account };
    account.balance += this.signedImpact(transaction);
    this.transactions.set(transaction.id, transaction);
    this.audits.record(context, 'transaction', transaction.id, 'created', null, { transaction: { ...transaction }, accountBefore: before, accountAfter: { ...account } });
    return { ...transaction };
  }

  private signedImpact(transaction: Transaction): number {
    return transaction.type === 'expense' ? -transaction.amount : transaction.type === 'income' ? transaction.amount : transaction.type === 'adjustment' ? transaction.amount : 0;
  }

  private requireAccount(context: HouseholdContext, accountId: string): Account {
    const account = this.accounts.get(accountId);
    if (!account) throw new Error('Household access denied');
    assertHouseholdMember(context, account.householdId);
    return account;
  }
}

export type TransactionView = Readonly<Transaction>;
export type TransferView = Readonly<{ id: string; sourceAccountId: string; destinationAccountId: string; amount: number; description: string }>;

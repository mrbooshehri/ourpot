export type CurrencyCode = string;

export type MoneyMinorUnit = Readonly<{
  amount: number;
  currency: CurrencyCode;
}>;

function assertCurrency(currency: CurrencyCode): void {
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Currency must be a three-letter uppercase code');
  }
}

export function createMoney(amount: number, currency: CurrencyCode): MoneyMinorUnit {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error('Money amount must be a non-negative integer');
  }
  assertCurrency(currency);
  return Object.freeze({ amount, currency });
}

function assertMatchingCurrency(left: MoneyMinorUnit, right: MoneyMinorUnit): void {
  if (left.currency !== right.currency) {
    throw new Error('Currency mismatch');
  }
}

export function addMoney(left: MoneyMinorUnit, right: MoneyMinorUnit): MoneyMinorUnit {
  assertMatchingCurrency(left, right);
  return createMoney(left.amount + right.amount, left.currency);
}

export function subtractMoney(left: MoneyMinorUnit, right: MoneyMinorUnit): MoneyMinorUnit {
  assertMatchingCurrency(left, right);
  if (right.amount > left.amount) {
    throw new Error('Money result cannot be negative');
  }
  return createMoney(left.amount - right.amount, left.currency);
}

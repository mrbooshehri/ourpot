import { describe, expect, it } from 'bun:test';
import { addMoney, createMoney, subtractMoney } from '../../src/shared/money';

describe('money minor units', () => {
  it('accepts non-negative integer minor units', () => {
    expect(createMoney(1250, 'USD')).toEqual({ amount: 1250, currency: 'USD' });
  });

  it('rejects negative and floating point values', () => {
    expect(() => createMoney(-1, 'USD')).toThrow('Money amount must be a non-negative integer');
    expect(() => createMoney(1.5, 'USD')).toThrow('Money amount must be a non-negative integer');
  });

  it('adds and subtracts matching currencies', () => {
    const left = createMoney(1000, 'USD');
    const right = createMoney(250, 'USD');
    expect(addMoney(left, right)).toEqual({ amount: 1250, currency: 'USD' });
    expect(subtractMoney(left, right)).toEqual({ amount: 750, currency: 'USD' });
  });

  it('rejects currency mismatches and negative results', () => {
    expect(() => addMoney(createMoney(1, 'USD'), createMoney(1, 'EUR'))).toThrow('Currency mismatch');
    expect(() => subtractMoney(createMoney(1, 'USD'), createMoney(2, 'USD'))).toThrow('Money result cannot be negative');
  });
});

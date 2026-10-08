import { describe, expect, it } from 'bun:test';
import { createDatabaseClient } from '../../src/db/client';

describe('Bun PostgreSQL client', () => {
  it('requires a database URL', () => {
    expect(() => createDatabaseClient('')).toThrow('Database connection string is required');
  });

  it('creates a database client without connecting until a query runs', () => {
    expect(createDatabaseClient('postgresql://ourpot:ourpot@localhost:5432/ourpot')).toBeTruthy();
  });
});

import { describe, expect, it } from 'bun:test';
import { createDatabaseClient } from '../../src/db/client';

describe('authentication PostgreSQL schema', () => {
  it('has durable credential, challenge, rate-limit, and session columns', async () => {
    const db = createDatabaseClient();
    const tables = await db.query<{ name: string }>(
      `SELECT table_name AS name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name IN
       ('totp_credentials', 'recovery_codes', 'passkey_credentials', 'auth_challenges', 'auth_rate_limits', 'security_events')`,
    );
    expect(tables.rows.map((row) => row.name).sort()).toEqual([
      'auth_challenges', 'auth_rate_limits', 'passkey_credentials', 'recovery_codes', 'security_events', 'totp_credentials',
    ]);
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'sessions' AND column_name IN ('token_hash', 'idle_expires_at', 'last_used_at')`,
    );
    expect(columns.rows.map((row) => row.column_name).sort()).toEqual(['idle_expires_at', 'last_used_at', 'token_hash']);
  });
});

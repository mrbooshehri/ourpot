import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';
import { IdentityService } from '../../src/modules/identity/service';

const config = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost:3000', AUTH_ALLOW_INSECURE_LOCALHOST: 'true' });

describe('password sessions', () => {
  it('issues hashed durable sessions and revokes only the caller-owned session', async () => {
    const db = createDatabaseClient();
    const identity = new IdentityService(db, config);
    const email = `session-${randomUUID()}@example.com`;
    const user = await identity.register(email, 'correct horse battery staple');
    const first = await identity.loginPassword(email, 'correct horse battery staple', 'Browser A');
    expect(first.kind).toBe('session');
    if (first.kind !== 'session') return;
    const second = await identity.loginPassword(email, 'correct horse battery staple', 'Browser B');
    if (second.kind !== 'session') throw new Error('Expected a session');
    expect(await identity.getSession(first.issue.token)).toMatchObject({ userId: user.id });
    const row = await db.query<{ token_hash: string }>('SELECT token_hash FROM sessions WHERE id = $1', [first.issue.session.id]);
    expect(row.rows[0]?.token_hash).not.toBe(first.issue.token);
    expect(await identity.listSessions(user.id)).toHaveLength(2);
    await identity.revokeSession(user.id, second.issue.session.id);
    expect(await identity.getSession(second.issue.token)).toBeNull();
    expect(await identity.getSession(first.issue.token)).not.toBeNull();
  });

  it('returns one generic error for unknown email and wrong password', async () => {
    const db = createDatabaseClient();
    const identity = new IdentityService(db, config);
    const email = `login-${randomUUID()}@example.com`;
    await identity.register(email, 'correct horse battery staple');
    await expect(identity.loginPassword(email, 'wrong password here', 'Browser')).rejects.toThrow('Invalid credentials');
    await expect(identity.loginPassword(`other-${randomUUID()}@example.com`, 'wrong password here', 'Browser')).rejects.toThrow('Invalid credentials');
  });

  it('enforces idle and absolute expiry and prevents cross-user revocation', async () => {
    const db = createDatabaseClient();
    const identity = new IdentityService(db, config);
    const firstEmail = `first-${randomUUID()}@example.com`;
    const secondEmail = `second-${randomUUID()}@example.com`;
    const firstUser = await identity.register(firstEmail, 'correct horse battery staple');
    const secondUser = await identity.register(secondEmail, 'correct horse battery staple');
    const login = await identity.loginPassword(firstEmail, 'correct horse battery staple', 'Browser');
    if (login.kind !== 'session') throw new Error('Expected session');
    await expect(identity.revokeSession(secondUser.id, login.issue.session.id)).rejects.toThrow('Session not found');
    expect(await identity.listSessions(secondUser.id)).toHaveLength(0);
    expect(await identity.getSession(login.issue.token)).toMatchObject({ userId: firstUser.id });
    await db.query("UPDATE sessions SET idle_expires_at = now() - interval '1 second' WHERE id = $1", [login.issue.session.id]);
    expect(await identity.getSession(login.issue.token)).toBeNull();
    await db.query("UPDATE sessions SET idle_expires_at = now() + interval '1 day', expires_at = now() - interval '1 second' WHERE id = $1", [login.issue.session.id]);
    expect(await identity.getSession(login.issue.token)).toBeNull();
  });

  it('limits repeated wrong passwords for the account', async () => {
    const db = createDatabaseClient();
    const identity = new IdentityService(db, config);
    const email = `limit-${randomUUID()}@example.com`;
    await identity.register(email, 'correct horse battery staple');
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(identity.loginPassword(email, 'wrong password here', 'Browser')).rejects.toThrow('Invalid credentials');
    }
    await expect(identity.loginPassword(email, 'correct horse battery staple', 'Browser')).rejects.toThrow('Too many attempts');
  });

  it('limits repeated invalid registration attempts for an email and socket IP', async () => {
    const identity = new IdentityService(createDatabaseClient(), config);
    const email = `registration-limit-${randomUUID()}@example.com`;
    const ip = `test-${randomUUID()}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(identity.register(email, 'short', ip)).rejects.toThrow('Password must be');
    }
    await expect(identity.register(email, 'correct horse battery staple', ip)).rejects.toThrow('Too many attempts');
  });
});

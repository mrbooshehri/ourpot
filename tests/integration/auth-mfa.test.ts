import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import * as OTPAuth from 'otpauth';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';
import { IdentityService } from '../../src/modules/identity/service';

const config = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost:3000', AUTH_ALLOW_INSECURE_LOCALHOST: 'true', TOTP_ENCRYPTION_KEY: 'a'.repeat(64) });

describe('authenticator MFA', () => {
  it('enrolls only after confirmation, requires code on password login, and consumes recovery codes once', async () => {
    const identity = new IdentityService(createDatabaseClient(), config);
    const email = `mfa-${randomUUID()}@example.com`;
    await identity.register(email, 'correct horse battery staple');
    const login = await identity.loginPassword(email, 'correct horse battery staple', 'Browser');
    if (login.kind !== 'session') throw new Error('Expected session');
    const principal = await identity.getSession(login.issue.token);
    if (!principal) throw new Error('Expected principal');
    const enrollment = await identity.startTotpEnrollment(principal);
    const secret = new URL(enrollment.otpauthUri).searchParams.get('secret');
    if (!secret) throw new Error('Missing secret');
    const code = OTPAuth.TOTP.generate({ secret: OTPAuth.Secret.fromBase32(secret), period: 30 });
    const confirmed = await identity.confirmTotpEnrollment(principal, code);
    expect(confirmed.recoveryCodes).toHaveLength(10);
    const passwordResult = await identity.loginPassword(email, 'correct horse battery staple', 'Browser B');
    expect(passwordResult.kind).toBe('mfa_required');
    if (passwordResult.kind !== 'mfa_required') return;
    expect(await identity.getSession(passwordResult.pendingToken)).toBeNull();
    await expect(identity.completeMfa(passwordResult.pendingToken, code, 'Browser B')).rejects.toThrow('Invalid code');
    const completed = await identity.completeMfa(passwordResult.pendingToken, confirmed.recoveryCodes[0]!, 'Browser B');
    expect(await identity.getSession(completed.token)).not.toBeNull();
    const next = await identity.loginPassword(email, 'correct horse battery staple', 'Browser C');
    if (next.kind !== 'mfa_required') throw new Error('Expected MFA');
    await expect(identity.completeMfa(next.pendingToken, confirmed.recoveryCodes[0]!, 'Browser C')).rejects.toThrow('Invalid code');
  });

  it('requires recent authentication for security changes and limits a pending challenge', async () => {
    const db = createDatabaseClient();
    const identity = new IdentityService(db, config);
    const email = `mfa-limit-${randomUUID()}@example.com`;
    await identity.register(email, 'correct horse battery staple');
    const login = await identity.loginPassword(email, 'correct horse battery staple', 'Browser');
    if (login.kind !== 'session') throw new Error('Expected session');
    const principal = (await identity.getSession(login.issue.token))!;
    await db.query("UPDATE sessions SET recent_auth_at = now() - interval '11 minutes' WHERE id = $1", [principal.sessionId]);
    const stale = (await identity.getSession(login.issue.token))!;
    await expect(identity.startTotpEnrollment(stale)).rejects.toThrow('Recent authentication required');
    await identity.reauthenticatePassword(stale, 'correct horse battery staple');
    const fresh = (await identity.getSession(login.issue.token))!;
    const uri = (await identity.startTotpEnrollment(fresh)).otpauthUri;
    const secret = new URL(uri).searchParams.get('secret')!;
    const code = OTPAuth.TOTP.generate({ secret: OTPAuth.Secret.fromBase32(secret), period: 30 });
    await identity.confirmTotpEnrollment(fresh, code);
    const pending = await identity.loginPassword(email, 'correct horse battery staple', 'Browser');
    if (pending.kind !== 'mfa_required') throw new Error('Expected MFA');
    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(identity.completeMfa(pending.pendingToken, '000000', 'Browser')).rejects.toThrow('Invalid code');
    }
    await expect(identity.completeMfa(pending.pendingToken, code, 'Browser')).rejects.toThrow('Invalid code');
  });
});

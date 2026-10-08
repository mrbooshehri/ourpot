import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';
import { IdentityService } from '../../src/modules/identity/service';
import { makeAuthenticator } from '../helpers/webauthn-fixture';

const config = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost:3000', AUTH_ALLOW_INSECURE_LOCALHOST: 'true' });

describe('passkey ceremonies', () => {
  it('requires a recent session and creates user-verified registration and login challenges', async () => {
    const db = createDatabaseClient();
    const identity = new IdentityService(db, config);
    const email = `passkey-${randomUUID()}@example.com`;
    await identity.register(email, 'correct horse battery staple');
    const login = await identity.loginPassword(email, 'correct horse battery staple', 'Browser');
    if (login.kind !== 'session') throw new Error('Expected session');
    const principal = (await identity.getSession(login.issue.token))!;
    const registration = await identity.beginPasskeyRegistration(principal);
    expect(registration.options.authenticatorSelection?.residentKey).toBe('required');
    expect(registration.options.authenticatorSelection?.userVerification).toBe('required');
    expect(registration.options.rp.id).toBe('localhost');
    const authentication = await identity.beginPasskeyLogin();
    expect(authentication.options.userVerification).toBe('required');
    expect(authentication.options.allowCredentials).toEqual([]);
    await expect(identity.finishPasskeyLogin('invalid-token', {} as never, 'Browser')).rejects.toThrow();
  });

  it('registers a verified credential, rejects the wrong origin, and signs in without a password', async () => {
    const db = createDatabaseClient();
    const identity = new IdentityService(db, config);
    const email = `passkey-valid-${randomUUID()}@example.com`;
    await identity.register(email, 'correct horse battery staple');
    const passwordLogin = await identity.loginPassword(email, 'correct horse battery staple', 'Browser');
    if (passwordLogin.kind !== 'session') throw new Error('Expected session');
    const principal = (await identity.getSession(passwordLogin.issue.token))!;
    const authenticator = makeAuthenticator();
    const registration = await identity.beginPasskeyRegistration(principal);
    await expect(identity.finishPasskeyRegistration(principal, registration.challengeToken, authenticator.registration(registration.options.challenge, 'https://attacker.example'), 'Phone')).rejects.toThrow('Invalid passkey response');
    await expect(identity.finishPasskeyRegistration(principal, registration.challengeToken, makeAuthenticator('attacker.example').registration(registration.options.challenge), 'Phone')).rejects.toThrow('Invalid passkey response');
    await expect(identity.finishPasskeyRegistration(principal, registration.challengeToken, authenticator.registration(registration.options.challenge, 'http://localhost:3000', false), 'Phone')).rejects.toThrow('Invalid passkey response');
    const saved = await identity.finishPasskeyRegistration(principal, registration.challengeToken, authenticator.registration(registration.options.challenge), 'Phone');
    expect(saved.name).toBe('Phone');
    const login = await identity.beginPasskeyLogin();
    await expect(identity.finishPasskeyLogin(login.challengeToken, authenticator.assertion(login.options.challenge, 'https://attacker.example'), 'Phone browser')).rejects.toThrow('Invalid passkey response');
    await expect(identity.finishPasskeyLogin(login.challengeToken, authenticator.assertion(login.options.challenge, 'http://localhost:3000', false), 'Phone browser')).rejects.toThrow('Invalid passkey response');
    const simultaneous = await Promise.allSettled([
      identity.finishPasskeyLogin(login.challengeToken, authenticator.assertion(login.options.challenge), 'Phone browser'),
      identity.finishPasskeyLogin(login.challengeToken, authenticator.assertion(login.options.challenge), 'Phone browser'),
    ]);
    expect(simultaneous.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const issue = (simultaneous.find((result) => result.status === 'fulfilled') as PromiseFulfilledResult<Awaited<ReturnType<typeof identity.finishPasskeyLogin>>>).value;
    expect(await identity.getSession(issue.token)).toMatchObject({ userId: principal.userId });
    await expect(identity.finishPasskeyLogin(login.challengeToken, authenticator.assertion(login.options.challenge), 'Phone browser')).rejects.toThrow('Invalid passkey response');
    const otherEmail = `passkey-other-${randomUUID()}@example.com`;
    await identity.register(otherEmail, 'correct horse battery staple');
    const otherLogin = await identity.loginPassword(otherEmail, 'correct horse battery staple', 'Other browser');
    if (otherLogin.kind !== 'session') throw new Error('Expected session');
    const otherPrincipal = (await identity.getSession(otherLogin.issue.token))!;
    await expect(identity.removePasskey(otherPrincipal, saved.id)).rejects.toThrow('Passkey not found');
    expect((await identity.renamePasskey(principal, saved.id, 'Laptop')).name).toBe('Laptop');
  });

  it('refreshes recent authentication with a passkey bound to the current session', async () => {
    const db = createDatabaseClient();
    const identity = new IdentityService(db, config);
    const email = `passkey-reauth-${randomUUID()}@example.com`;
    await identity.register(email, 'correct horse battery staple');
    const login = await identity.loginPassword(email, 'correct horse battery staple', 'Browser');
    if (login.kind !== 'session') throw new Error('Expected session');
    const principal = (await identity.getSession(login.issue.token))!;
    const authenticator = makeAuthenticator();
    const registration = await identity.beginPasskeyRegistration(principal);
    await identity.finishPasskeyRegistration(principal, registration.challengeToken, authenticator.registration(registration.options.challenge), 'Phone');
    await db.query("UPDATE sessions SET recent_auth_at = now() - interval '11 minutes' WHERE id = $1", [principal.sessionId]);
    const stale = (await identity.getSession(login.issue.token))!;
    await expect(identity.beginPasskeyRegistration(stale)).rejects.toThrow('Recent authentication required');
    const ceremony = await identity.beginPasskeyReauthentication(stale);
    expect(ceremony.options.allowCredentials?.map((credential) => credential.id)).toContain(authenticator.id);
    await expect(identity.finishPasskeyReauthentication(stale, ceremony.challengeToken, authenticator.assertion(ceremony.options.challenge, 'https://attacker.example'))).rejects.toThrow('Invalid passkey response');
    await identity.finishPasskeyReauthentication(stale, ceremony.challengeToken, authenticator.assertion(ceremony.options.challenge));
    await expect(identity.finishPasskeyReauthentication(stale, ceremony.challengeToken, authenticator.assertion(ceremony.options.challenge))).rejects.toThrow('Invalid passkey response');
    const fresh = (await identity.getSession(login.issue.token))!;
    expect(fresh.recentAuthAt!.getTime()).toBeGreaterThan(Date.now() - 60_000);
    const otherEmail = `passkey-reauth-other-${randomUUID()}@example.com`;
    await identity.register(otherEmail, 'correct horse battery staple');
    const otherLogin = await identity.loginPassword(otherEmail, 'correct horse battery staple', 'Other browser');
    if (otherLogin.kind !== 'session') throw new Error('Expected session');
    const other = (await identity.getSession(otherLogin.issue.token))!;
    const second = await identity.beginPasskeyReauthentication(fresh);
    await expect(identity.finishPasskeyReauthentication(other, second.challengeToken, authenticator.assertion(second.options.challenge))).rejects.toThrow('Invalid passkey response');
  });

  it('limits repeated failed passkey assertions across fresh challenges', async () => {
    const identity = new IdentityService(createDatabaseClient(), config);
    const ip = `test-${randomUUID()}`;
    for (let attempt = 0; attempt < 5; attempt++) {
      const ceremony = await identity.beginPasskeyLogin();
      await expect(identity.finishPasskeyLogin(ceremony.challengeToken, { id: `unknown-${randomUUID()}` } as never, 'Browser', ip)).rejects.toThrow('Invalid passkey response');
    }
    const ceremony = await identity.beginPasskeyLogin();
    await expect(identity.finishPasskeyLogin(ceremony.challengeToken, { id: `unknown-final-${randomUUID()}` } as never, 'Browser', ip)).rejects.toThrow('Too many attempts');
  });
});

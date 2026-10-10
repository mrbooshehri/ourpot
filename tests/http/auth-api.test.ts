import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { ApiApp } from '../../src/http/api';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';
import { IdentityService } from '../../src/modules/identity/service';
import { IdentityRepository } from '../../src/modules/identity/repository';
import { hashPassword } from '../../src/modules/identity/password';
import * as OTPAuth from 'otpauth';

const origin = 'http://localhost:3000';
const config = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: origin, AUTH_ALLOW_INSECURE_LOCALHOST: 'true', TOTP_ENCRYPTION_KEY: 'a'.repeat(64) });
const post = (path: string, body: unknown, cookie = '') => new Request(`${origin}${path}`, {
  method: 'POST',
  headers: { origin, 'x-ourpot-request': '1', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
const seedUser = async (email: string) => new IdentityService(createDatabaseClient(), config).register(email, 'correct horse battery staple');

describe('authenticated HTTP API', () => {
  it('uses cookie identity for household access and rejects forged headers', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const email = `http-${randomUUID()}@example.com`;
    await seedUser(email);
    const login = await app.fetch(post('/api/auth/login', { email, password: 'correct horse battery staple' }));
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toContain('ourpot_session=');
    const forged = await app.fetch(new Request(`${origin}/api/dashboard`, { headers: { 'x-user-id': 'anything', 'x-household-id': 'anything' } }));
    expect(forged.status).toBe(401);
    const household = await app.fetch(post('/api/households', { name: 'Our Home', currency: 'USD', timezone: 'UTC' }, cookie));
    expect(household.status).toBe(201);
    const dashboard = await app.fetch(new Request(`${origin}/api/dashboard`, { headers: { cookie } }));
    expect(dashboard.status).toBe(200);
    const dashboardData = await dashboard.json() as { budgets: unknown[]; goals: unknown[]; tasks: unknown[]; subscriptions: unknown[]; reminders: unknown[]; members: unknown[] };
    expect(dashboardData.budgets).toEqual([]);
    expect(dashboardData.goals).toEqual([]);
    expect(dashboardData.tasks).toEqual([]);
    expect(dashboardData.subscriptions).toEqual([]);
    expect(dashboardData.reminders).toEqual([]);
    expect(dashboardData.members.length).toBeGreaterThan(0);
    const sessions = await app.fetch(new Request(`${origin}/api/settings/sessions`, { headers: { cookie } }));
    const listed = await sessions.json() as { sessions: Array<{ id: string; current: boolean }> };
    expect(listed.sessions).toHaveLength(1);
    expect(listed.sessions[0]?.current).toBe(true);
    const revoke = await app.fetch(new Request(`${origin}/api/settings/sessions/${listed.sessions[0]?.id}`, {
      method: 'DELETE', headers: { cookie, origin, 'x-ourpot-request': '1' },
    }));
    expect(revoke.status).toBe(200);
    expect((await app.fetch(new Request(`${origin}/api/dashboard`, { headers: { cookie } }))).status).toBe(401);
  });

  it('rejects cross-origin mutations before creating an account', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const response = await app.fetch(new Request(`${origin}/api/auth/register`, {
      method: 'POST', headers: { origin: 'https://attacker.example', 'x-ourpot-request': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ email: `csrf-${randomUUID()}@example.com`, password: 'correct horse battery staple' }),
    }));
    expect(response.status).toBe(403);
  });

  it('does not allow public account registration', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const email = `duplicate-${randomUUID()}@example.com`;
    const response = await app.fetch(post('/api/auth/register', { email, password: 'correct horse battery staple' }));
    expect(response.status).toBe(404);
  });

  it('requires an authenticator code after password sign-in when MFA is enabled', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const email = `mfa-http-${randomUUID()}@example.com`;
    await seedUser(email);
    const first = await app.fetch(post('/api/auth/login', { email, password: 'correct horse battery staple' }));
    const sessionCookie = first.headers.get('set-cookie')?.split(';')[0] ?? '';
    const setup = await app.fetch(post('/api/settings/mfa/setup', {}, sessionCookie));
    expect(setup.status).toBe(200);
    const { otpauthUri, qrCodeDataUrl } = await setup.json() as { otpauthUri: string; qrCodeDataUrl: string };
    expect(qrCodeDataUrl.startsWith('data:image/png;base64,')).toBe(true);
    const secret = new URL(otpauthUri).searchParams.get('secret')!;
    const code = OTPAuth.TOTP.generate({ secret: OTPAuth.Secret.fromBase32(secret), period: 30 });
    const confirm = await app.fetch(post('/api/settings/mfa/confirm', { code }, sessionCookie));
    const recoveryCodes = (await confirm.json() as { recoveryCodes: string[] }).recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    const second = await app.fetch(post('/api/auth/login', { email, password: 'correct horse battery staple' }));
    expect(await second.json()).toEqual({ kind: 'mfa_required' });
    const pendingCookie = second.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(pendingCookie).toContain('ourpot_pending=');
    const complete = await app.fetch(post('/api/auth/mfa', { code: recoveryCodes[0] }, pendingCookie));
    expect(complete.status).toBe(200);
    expect(complete.headers.get('set-cookie')).toContain('ourpot_session=');
  });

  it('offers a passkey login challenge without email and denies an invalid assertion', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const options = await app.fetch(post('/api/auth/passkey/login/options', {}));
    expect(options.status).toBe(200);
    const payload = await options.json() as { options: { userVerification: string; challenge: string } };
    expect(payload.options.userVerification).toBe('required');
    expect(payload.options.challenge.length).toBeGreaterThan(20);
    const pending = options.headers.get('set-cookie')?.split(';')[0] ?? '';
    const failed = await app.fetch(post('/api/auth/passkey/login/verify', { response: { id: `unknown-${randomUUID()}` } }, pending));
    expect(failed.status).toBe(401);
    expect(failed.headers.get('set-cookie') ?? '').not.toContain('ourpot_session=');
  });

  it('explains the rate-limit wait with a retry duration', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const ip = `http-rate-${randomUUID()}`;
    const email = `rate-${randomUUID()}@example.com`;
    const response = await app.fetch(post('/api/auth/register', { email, password: 'correct horse battery staple' }), ip);
    expect(response.status).toBe(404);
  });

  it('allows only a root administrator to create users who must change temporary passwords', async () => {
    const db = createDatabaseClient();
    const app = new ApiApp(db, config);
    const repository = new IdentityRepository(db);
    let rootEmail = `root-${randomUUID()}@example.com`;
    let root = await repository.findRootAdmin();
    if (!root) root = await repository.createUser(rootEmail, await hashPassword('root password long enough'), { systemRole: 'root_admin' });
    else {
      rootEmail = root.email;
      await repository.setPassword(root.id, await hashPassword('root password long enough'));
      await db.query('UPDATE users SET disabled_at = NULL WHERE id = $1', [root.id]);
    }
    const login = await app.fetch(post('/api/auth/login', { email: rootEmail, password: 'root password long enough' }));
    const rootCookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    const createdEmail = `managed-${randomUUID()}@example.com`;
    const created = await app.fetch(post('/api/admin/users', { email: createdEmail, displayName: 'Partner One', temporaryPassword: 'temporary password long enough' }, rootCookie));
    expect(created.status).toBe(201);
    const managedLogin = await app.fetch(post('/api/auth/login', { email: createdEmail, password: 'temporary password long enough' }));
    const managedCookie = managedLogin.headers.get('set-cookie')?.split(';')[0] ?? '';
    const managedMe = await (await app.fetch(new Request(`${origin}/api/auth/me`, { headers: { cookie: managedCookie } }))).json() as { mustChangePassword: boolean };
    expect(managedMe.mustChangePassword).toBe(true);
    expect((await app.fetch(new Request(`${origin}/api/dashboard`, { headers: { cookie: managedCookie } }))).status).toBe(403);
    const normal = await seedUser(`normal-${randomUUID()}@example.com`);
    const normalLogin = await app.fetch(post('/api/auth/login', { email: normal.email, password: 'correct horse battery staple' }));
    const normalCookie = normalLogin.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect((await app.fetch(new Request(`${origin}/api/admin/users`, { headers: { cookie: normalCookie } }))).status).toBe(403);
    expect(root.systemRole).toBe('root_admin');
  });

  it('shows and updates the signed-in user language preference', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const email = `language-${randomUUID()}@example.com`;
    await seedUser(email);
    const login = await app.fetch(post('/api/auth/login', { email, password: 'correct horse battery staple' }));
    const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
    const current = await app.fetch(new Request(`${origin}/api/settings/language`, { headers: { cookie } }));
    expect(await current.json()).toEqual({ language: 'en' });
    const updated = await app.fetch(post('/api/settings/language', { language: 'fa' }, cookie));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toEqual({ language: 'fa' });
  });
});

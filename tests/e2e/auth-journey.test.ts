import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { ApiApp } from '../../src/http/api';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';

const origin = 'http://localhost:3000';
const config = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: origin, AUTH_ALLOW_INSECURE_LOCALHOST: 'true', TOTP_ENCRYPTION_KEY: 'a'.repeat(64) });
const db = createDatabaseClient();

async function post(app: ApiApp, path: string, body: unknown, cookie = ''): Promise<Response> {
  return app.fetch(new Request(origin + path, {
    method: 'POST', headers: { origin, 'x-ourpot-request': '1', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
}
async function user(app: ApiApp, label: string) {
  const email = `${label}-${randomUUID()}@example.com`;
  const register = await post(app, '/api/auth/register', { email, password: 'correct horse battery staple' });
  const id = ((await register.json()) as { user: { id: string } }).user.id;
  const login = await post(app, '/api/auth/login', { email, password: 'correct horse battery staple' });
  return { id, email, cookie: login.headers.get('set-cookie')?.split(';')[0] ?? '' };
}

describe('durable authentication journey', () => {
  it('keeps sessions across app instances and removes household access immediately when membership ends', async () => {
    const firstApp = new ApiApp(db, config);
    const owner = await user(firstApp, 'owner');
    const partner = await user(firstApp, 'partner');
    const created = await post(firstApp, '/api/households', { name: 'Our Home', currency: 'USD', timezone: 'UTC' }, owner.cookie);
    const householdId = ((await created.json()) as { household: { id: string } }).household.id;
    const invited = await post(firstApp, '/api/invitations', { email: partner.email }, owner.cookie);
    const token = ((await invited.json()) as { token: string }).token;
    expect((await post(firstApp, '/api/invitations/accept', { token }, partner.cookie)).status).toBe(200);
    const restartedApp = new ApiApp(db, config);
    expect((await restartedApp.fetch(new Request(origin + '/api/auth/me', { headers: { cookie: partner.cookie } }))).status).toBe(200);
    expect((await restartedApp.fetch(new Request(origin + '/api/dashboard', { headers: { cookie: partner.cookie } }))).status).toBe(200);
    await restartedApp.households.removeMember(await restartedApp.households.getContext(owner.id, householdId), partner.id);
    expect((await restartedApp.fetch(new Request(origin + '/api/dashboard', { headers: { cookie: partner.cookie } }))).status).toBe(403);
    expect((await restartedApp.fetch(new Request(origin + '/api/settings/sessions', { headers: { cookie: partner.cookie } }))).status).toBe(200);
  });

  it('refuses every financial mutation without a session even with forged identity headers', async () => {
    const app = new ApiApp(db, config);
    for (const path of ['/api/accounts', '/api/transactions', '/api/budgets', '/api/goals', '/api/tasks', '/api/subscriptions']) {
      const response = await app.fetch(new Request(origin + path, {
        method: 'POST',
        headers: { origin, 'x-ourpot-request': '1', 'content-type': 'application/json', 'x-user-id': 'owner', 'x-household-id': 'home' },
        body: '{}',
      }));
      expect(response.status).toBe(401);
    }
  });
});

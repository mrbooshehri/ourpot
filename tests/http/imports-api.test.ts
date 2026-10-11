import { expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { ApiApp } from '../../src/http/api';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';
import { IdentityService } from '../../src/modules/identity/service';

const origin = 'http://localhost:3000';
const config = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: origin, AUTH_ALLOW_INSECURE_LOCALHOST: 'true' });
const request = (path: string, method: string, body?: unknown, cookie = '') => new Request(origin + path, {
  method,
  headers: { origin, 'x-ourpot-request': '1', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

it('previews, reviews and commits an import through the authenticated API', async () => {
  const db = createDatabaseClient();
  const app = new ApiApp(db, config);
  const email = `import-${randomUUID()}@example.com`;
  await new IdentityService(db, config).register(email, 'correct horse battery staple');
  const login = await app.fetch(request('/api/auth/login', 'POST', { email, password: 'correct horse battery staple' }));
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  await app.fetch(request('/api/households', 'POST', { name: 'Home', currency: 'USD', timezone: 'UTC' }, cookie));
  const accountResponse = await app.fetch(request('/api/accounts', 'POST', { name: 'Checking', type: 'checking', openingBalance: 0 }, cookie));
  const account = await accountResponse.json() as { id: string };

  const previewResponse = await app.fetch(request('/api/v1/imports', 'POST', {
    fileName: 'statement.csv', accountId: account.id,
    content: 'date,amount,description\n2026-01-02,-12.34,Lunch',
  }, cookie));
  expect(previewResponse.status).toBe(201);
  const preview = await previewResponse.json() as { id: string; rows: Array<{ id: string }> };
  expect(preview.rows).toHaveLength(1);
  expect((await app.fetch(request(`/api/v1/imports/${preview.id}/commit`, 'POST', {}, cookie))).status).toBe(400);
  expect((await app.fetch(request(`/api/v1/imports/${preview.id}/rows/${preview.rows[0]!.id}`, 'PATCH', { decision: 'accept' }, cookie))).status).toBe(200);
  const commit = await app.fetch(request(`/api/v1/imports/${preview.id}/commit`, 'POST', {}, cookie));
  expect(commit.status).toBe(200);
  expect(await commit.json()).toEqual({ accepted: 1, skipped: 0 });
  const dashboard = await app.fetch(request('/api/dashboard', 'GET', undefined, cookie));
  expect((await dashboard.json() as { totals: { householdExpense: number } }).totals.householdExpense).toBe(1234);
});

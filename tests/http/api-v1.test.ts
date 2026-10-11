import { expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { ApiApp } from '../../src/http/api';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';
import { IdentityService } from '../../src/modules/identity/service';

const origin = 'http://localhost:3000'; const config = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: origin, AUTH_ALLOW_INSECURE_LOCALHOST: 'true' });
const req = (path: string, method: string, body?: unknown, cookie = '') => new Request(origin + path, { method, headers: { origin, 'x-ourpot-request': '1', ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });

it('serves versioned household dashboard and exports with integer amounts', async () => {
  const db = createDatabaseClient(); const app = new ApiApp(db, config); const email = `v1-${randomUUID()}@example.com`;
  await new IdentityService(db, config).register(email, 'correct horse battery staple'); const login = await app.fetch(req('/api/auth/login', 'POST', { email, password: 'correct horse battery staple' })); const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  await app.fetch(req('/api/households', 'POST', { name: 'Home', currency: 'USD', timezone: 'UTC' }, cookie)); const accountResponse = await app.fetch(req('/api/accounts', 'POST', { name: 'Checking', type: 'checking', openingBalance: 0 }, cookie)); const account = await accountResponse.json() as { id: string };
  await app.fetch(req('/api/transactions', 'POST', { type: 'income', accountId: account.id, amount: 2500, description: 'Pay', transactionDate: '2026-01-01' }, cookie));
  const dashboard = await app.fetch(req('/api/v1/dashboard', 'GET', undefined, cookie)); expect(dashboard.status).toBe(200); expect((await dashboard.json() as { totals: { householdIncome: number } }).totals.householdIncome).toBe(2500);
  const exportResponse = await app.fetch(req('/api/v1/export?format=csv', 'GET', undefined, cookie)); expect(exportResponse.status).toBe(200); expect(exportResponse.headers.get('content-type')).toContain('text/csv'); expect(await exportResponse.text()).toContain('2500');
  expect((await app.fetch(req('/api/v1/dashboard', 'GET'))).status).toBe(401);
});

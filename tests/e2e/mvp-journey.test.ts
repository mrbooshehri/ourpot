import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { ApiApp } from '../../src/http/api';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';

const origin = 'http://localhost:3000';
const config = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: origin, AUTH_ALLOW_INSECURE_LOCALHOST: 'true' });

async function post(app: ApiApp, path: string, cookie: string, body: unknown): Promise<any> {
  const response = await app.fetch(new Request(`${origin}${path}`, {
    method: 'POST', headers: { origin, 'x-ourpot-request': '1', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }));
  expect(response.status).toBeLessThan(300);
  return response.json();
}

async function signIn(app: ApiApp, email: string): Promise<string> {
  await post(app, '/api/auth/register', '', { email, password: 'correct horse battery staple' });
  const response = await app.fetch(new Request(`${origin}/api/auth/login`, {
    method: 'POST', headers: { origin, 'x-ourpot-request': '1', 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'correct horse battery staple' }),
  }));
  expect(response.status).toBe(200);
  return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

describe('MVP journey', () => {
  it('keeps both partners authenticated through shared planning flows', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const ownerEmail = `owner-${randomUUID()}@example.com`;
    const partnerEmail = `partner-${randomUUID()}@example.com`;
    const ownerCookie = await signIn(app, ownerEmail);
    const partnerCookie = await signIn(app, partnerEmail);
    await post(app, '/api/households', ownerCookie, { name: 'Our Home', currency: 'USD', timezone: 'UTC' });
    const invitation = await post(app, '/api/invitations', ownerCookie, { email: partnerEmail });
    await post(app, '/api/invitations/accept', partnerCookie, { token: invitation.token });
    const account = await post(app, '/api/accounts', ownerCookie, { name: 'Checking', type: 'checking', openingBalance: 10000 });
    await post(app, '/api/transactions', ownerCookie, { accountId: account.id, type: 'expense', amount: 1250, description: 'Groceries', category: 'Food' });
    const budget = await post(app, '/api/budgets', ownerCookie, { category: 'Food', amount: 5000, period: '2026-10', rationale: 'Plan groceries' });
    await post(app, '/api/budgets/discuss', partnerCookie, { budgetId: budget.id });
    await post(app, '/api/budgets/agree', ownerCookie, { budgetId: budget.id });
    expect((await post(app, '/api/budgets/agree', partnerCookie, { budgetId: budget.id })).status).toBe('agreed');
    const goal = await post(app, '/api/goals', ownerCookie, { name: 'Emergency fund', targetAmount: 5000 });
    expect((await post(app, '/api/goals/contributions', partnerCookie, { goalId: goal.id, amount: 1000, note: 'First deposit' })).remainingAmount).toBe(4000);
    const task = await post(app, '/api/tasks', ownerCookie, { title: 'Review insurance', dueDate: '2026-12-01' });
    expect((await post(app, '/api/tasks/complete', partnerCookie, { taskId: task.id })).status).toBe('done');
    expect((await post(app, '/api/subscriptions', ownerCookie, { name: 'Gym', price: 3000, cadence: 'monthly', nextRenewalDate: '2026-11-15' })).id).toBeTruthy();
  });
});

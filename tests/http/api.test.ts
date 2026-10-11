import { describe, expect, it } from 'bun:test';
import { ApiApp } from '../../src/http/api';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';

const config = loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost:3000', AUTH_ALLOW_INSECURE_LOCALHOST: 'true' });

describe('HTTP API', () => {
  it('serves a responsive page', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const response = await app.fetch(new Request('http://localhost:3000/'));
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('name="viewport"');
    expect(html).toContain('id="loginForm"');
    expect(html).toContain('id="sessionList"');
    expect(html).toContain('id="inviteJoinPanel"');
    expect(html).toContain('id="inviteSignupForm"');
    expect(html).toContain('id="languageForm"');
    expect(html).toContain('id="destinationField" hidden');
    expect(html).toContain('id="budgetList"');
    expect(html).toContain('id="subscriptionList"');
    expect(html).toContain('Combined household');
    expect(html).toContain('Partner activity');
    expect(html).toContain('id="sideNav"');
    expect(html).toContain('id="collapseNavButton"');
    expect(html).toContain('id="mobileMenuButton"');
    expect(html).toContain('id="avatarMenuButton"');
    expect(html).toContain('id="avatarMenu"');
    expect((await app.fetch(new Request('http://localhost:3000/assets/logo.svg'))).status).toBe(200);
    expect(html).toContain('id="recentTransactions"');
    expect(html).toContain('id="accountCards"');
    expect(html).toContain('data-visual="income-flow"');
    expect(html).toContain('Transfers are excluded from income and expenses');
    expect(html).toContain('totalsHelp');
    for (const page of ['dashboard', 'reports', 'profile', 'settings', 'rules']) expect(html).toContain(`data-page="${page}"`);
    expect(html).toContain('tabler-icon');
    expect(html).toContain('aria-label="Reports"');
    expect(html).not.toContain('cdn.jsdelivr.net');
    expect(html).not.toContain('/api/demo/setup');
    expect(html).not.toContain('x-user-id');
  });

  it('denies household data without authentication', async () => {
    const app = new ApiApp(createDatabaseClient(), config);
    const response = await app.fetch(new Request('http://localhost:3000/api/dashboard'));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });
});

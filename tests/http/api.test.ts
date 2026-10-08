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

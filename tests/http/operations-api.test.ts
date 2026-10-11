import { expect, it } from 'bun:test';
import { ApiApp } from '../../src/http/api';
import { createDatabaseClient } from '../../src/db/client';
import { loadConfig } from '../../src/config';

it('reports database readiness without requiring a household session', async () => {
  const app = new ApiApp(createDatabaseClient('postgresql://ourpot:ourpot@postgres:5432/ourpot'), loadConfig({ NODE_ENV: 'test', PUBLIC_ORIGIN: 'http://localhost:3000', AUTH_ALLOW_INSECURE_LOCALHOST: 'true' }));
  const response = await app.fetch(new Request('http://localhost:3000/api/ready'));
  expect([200, 503]).toContain(response.status);
  expect(await response.json()).toHaveProperty('database');
});

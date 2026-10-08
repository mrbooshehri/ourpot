import { ApiApp } from './http/api';
import { createDatabaseClient } from './db/client';
import { loadConfig } from './config';

const config = loadConfig();
const app = new ApiApp(createDatabaseClient(config.databaseUrl), config);
const port = config.port;
const server = Bun.serve({ port, fetch: (request, server) => app.fetch(request, server.requestIP(request)?.address ?? '') });
console.log(`Ourpot listening on http://localhost:${server.port}`);

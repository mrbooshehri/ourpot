import { createDatabaseClient } from '../db/client';
import { BackupService } from '../modules/operations/backups';

const directory = process.env.BACKUP_DIR ?? './backups';
const key = process.env.BACKUP_KEY;
if (!key) throw new Error('BACKUP_KEY is required');
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const dump = Bun.spawn(['pg_dump', '--format=plain', '--no-owner', databaseUrl], { stdout: 'pipe', stderr: 'inherit' });
const payload = await new Response(dump.stdout).text();
const exitCode = await dump.exited;
if (exitCode !== 0) throw new Error(`pg_dump failed with exit code ${exitCode}`);
const artifact = await new BackupService(directory, process.env.BACKUP_SCHEMA ?? 'db-schema-v1').create({ key, payload: { sql: payload } });
console.log(JSON.stringify(artifact));

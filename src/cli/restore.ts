import { writeFile, rm } from 'node:fs/promises';
import { BackupService } from '../modules/operations/backups';

const [artifactPath] = Bun.argv.slice(2); const key = process.env.BACKUP_KEY;
if (!artifactPath || !key) throw new Error('Usage: BACKUP_KEY=... bun run src/cli/restore.ts <artifact>');
const service = new BackupService(process.env.BACKUP_DIR ?? './backups', process.env.BACKUP_SCHEMA ?? 'db-schema-v1');
const artifact = { fileName: artifactPath.split('/').pop()!, path: artifactPath, createdAt: new Date(0).toISOString(), schemaVersion: process.env.BACKUP_SCHEMA ?? 'db-schema-v1', sizeBytes: 0 };
const restored = await service.restore(artifact, key); const sql = (restored.payload as { sql?: unknown }).sql;
if (typeof sql !== 'string') throw new Error('Backup does not contain a SQL dump');
const temporary = `${artifactPath}.restore.sql`; await writeFile(temporary, sql, { mode: 0o600 });
const databaseUrl = process.env.DATABASE_URL; if (!databaseUrl) throw new Error('DATABASE_URL is required');
const processResult = Bun.spawn(['psql', '--set', 'ON_ERROR_STOP=1', databaseUrl, '-f', temporary], { stdout: 'inherit', stderr: 'inherit' });
const exitCode = await processResult.exited; await rm(temporary, { force: true });
if (exitCode !== 0) throw new Error(`psql restore failed with exit code ${exitCode}`);
console.log(JSON.stringify({ restored: artifact.fileName }));

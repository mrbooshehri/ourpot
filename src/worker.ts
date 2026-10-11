import { createDatabaseClient } from './db/client';
import { NotificationWorker } from './workers/notification-worker';
import { BackupService } from './modules/operations/backups';
const intervalMs = Number(process.env.NOTIFICATION_INTERVAL_MS ?? process.env.REMINDER_INTERVAL_MS ?? 60_000);
const worker = new NotificationWorker(createDatabaseClient());
const backupDirectory = process.env.BACKUP_DIR ?? '/var/lib/ourpot/backups';
const backupKey = process.env.BACKUP_KEY;
const backupService = backupKey ? new BackupService(backupDirectory, process.env.BACKUP_SCHEMA ?? 'db-schema-v1') : null;
let lastBackupDay = '';
console.log(`Ourpot notification worker started; interval ${intervalMs}ms`);
const sweep = async () => {
  const result = await worker.processBatch(100); if (result.processed || result.failed) console.log(JSON.stringify({ notificationSweep: result }));
  const now = new Date(); const day = now.toISOString().slice(0, 10);
  if (backupService && now.getUTCHours() === 2 && now.getUTCMinutes() === 0 && day !== lastBackupDay) {
    const databaseUrl = process.env.DATABASE_URL; if (!databaseUrl) throw new Error('DATABASE_URL is required for backups');
    const dump = Bun.spawn(['pg_dump', '--format=plain', '--no-owner', databaseUrl], { stdout: 'pipe', stderr: 'inherit' });
    const payload = await new Response(dump.stdout).text(); const exitCode = await dump.exited;
    if (exitCode !== 0) throw new Error(`scheduled pg_dump failed with exit code ${exitCode}`);
    const artifact = await backupService.create({ key: backupKey!, payload: { sql: payload } }); await backupService.prune({ daily: 7, weekly: 4, monthly: 12 }); lastBackupDay = day;
    console.log(JSON.stringify({ backup: artifact.fileName }));
  }
};
await sweep();
setInterval(() => { void sweep(); }, intervalMs);

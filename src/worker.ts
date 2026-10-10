import { createDatabaseClient } from './db/client';
import { NotificationWorker } from './workers/notification-worker';
const intervalMs = Number(process.env.NOTIFICATION_INTERVAL_MS ?? process.env.REMINDER_INTERVAL_MS ?? 60_000);
const worker = new NotificationWorker(createDatabaseClient());
console.log(`Ourpot notification worker started; interval ${intervalMs}ms`);
const sweep = async () => { const result = await worker.processBatch(100); if (result.processed || result.failed) console.log(JSON.stringify({ notificationSweep: result })); };
await sweep();
setInterval(() => { void sweep(); }, intervalMs);

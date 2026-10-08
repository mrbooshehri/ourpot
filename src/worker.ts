/**
 * Reminder worker entrypoint. The first MVP worker keeps the process alive and
 * is intentionally replaceable by the PostgreSQL-backed scheduler.
 */
const intervalMs = Number(process.env.REMINDER_INTERVAL_MS ?? 60_000);
console.log(`Ourpot reminder worker started; interval ${intervalMs}ms`);
setInterval(() => {
  console.log('Reminder sweep pending PostgreSQL scheduler integration');
}, intervalMs);

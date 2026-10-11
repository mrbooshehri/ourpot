import type { DatabaseClient } from '../../db/client';

export type ReadinessReport = Readonly<{ ready: boolean; database: 'ok' | 'unavailable'; checkedAt: string }>;

export class HealthService {
  constructor(private readonly db: DatabaseClient) {}
  async readiness(): Promise<ReadinessReport> {
    try { await this.db.query('SELECT 1'); return { ready: true, database: 'ok', checkedAt: new Date().toISOString() }; }
    catch { return { ready: false, database: 'unavailable', checkedAt: new Date().toISOString() }; }
  }
}

import type { DatabaseClient } from '../../db/client';
import type { NotificationEvent } from '../notifications/service';
export class OutboxService { constructor(private readonly db: DatabaseClient) {} async append(event: NotificationEvent, db: DatabaseClient = this.db): Promise<void> { await db.query('INSERT INTO outbox_events (id, household_id, event_type, dedupe_key, payload_json) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING', [event.id,event.householdId,event.type,event.dedupeKey,JSON.stringify(event)]); } }

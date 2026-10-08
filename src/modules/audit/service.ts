import type { HouseholdContext } from '../../shared/household-context';

export type AuditEvent = Readonly<{
  id: string;
  householdId: string;
  actorUserId: string;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: Date;
}>;

export class AuditService {
  private readonly events: AuditEvent[] = [];
  private nextId = 1;

  record(context: HouseholdContext, entityType: string, entityId: string, action: string, before: unknown, after: unknown): AuditEvent {
    const event: AuditEvent = {
      id: `audit_${this.nextId++}`,
      householdId: context.householdId,
      actorUserId: context.userId,
      entityType,
      entityId,
      action,
      before,
      after,
      createdAt: new Date(),
    };
    this.events.push(event);
    return event;
  }

  list(householdId: string): AuditEvent[] {
    return this.events.filter((event) => event.householdId === householdId).map((event) => ({ ...event }));
  }
}

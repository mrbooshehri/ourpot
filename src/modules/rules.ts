import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../db/client';
import type { HouseholdContext } from '../shared/household-context';
export type NotificationRules = { subscriptionReminders: boolean; budgetWarningPercent: number | null; taskDueReminders: boolean; notifyBothPartners: boolean };
const defaults: NotificationRules = { subscriptionReminders: true, budgetWarningPercent: null, taskDueReminders: true, notifyBothPartners: true };
export class RulesService {
  constructor(private readonly db: DatabaseClient) {}
  async get(context: HouseholdContext): Promise<NotificationRules> {
    const result = await this.db.query<{ subscription_reminders:boolean; budget_warning_percent:number|null; task_due_reminders:boolean; notify_both_partners:boolean }>('SELECT subscription_reminders, budget_warning_percent, task_due_reminders, notify_both_partners FROM notification_rules WHERE household_id = $1', [context.householdId]);
    const row = result.rows[0]; if (!row) return defaults;
    return { subscriptionReminders: row.subscription_reminders, budgetWarningPercent: row.budget_warning_percent, taskDueReminders: row.task_due_reminders, notifyBothPartners: row.notify_both_partners };
  }
  async update(context: HouseholdContext, input: Partial<NotificationRules>): Promise<NotificationRules> {
    const current = await this.get(context); const next = { ...current, ...input };
    if (next.budgetWarningPercent !== null && (!Number.isInteger(next.budgetWarningPercent) || next.budgetWarningPercent < 1 || next.budgetWarningPercent > 100)) throw new Error('Budget warning percent must be between 1 and 100');
    await this.db.query(`INSERT INTO notification_rules (household_id, subscription_reminders, budget_warning_percent, task_due_reminders, notify_both_partners, updated_by) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (household_id) DO UPDATE SET subscription_reminders=EXCLUDED.subscription_reminders, budget_warning_percent=EXCLUDED.budget_warning_percent, task_due_reminders=EXCLUDED.task_due_reminders, notify_both_partners=EXCLUDED.notify_both_partners, updated_by=EXCLUDED.updated_by, updated_at=now()`, [context.householdId, next.subscriptionReminders, next.budgetWarningPercent, next.taskDueReminders, next.notifyBothPartners, context.userId]);
    await this.db.query('INSERT INTO audit_events (id, household_id, actor_user_id, entity_type, entity_id, action, before_json, after_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [randomUUID(), context.householdId, context.userId, 'notification_rules', context.householdId, 'updated', JSON.stringify(current), JSON.stringify(next)]);
    return next;
  }
}

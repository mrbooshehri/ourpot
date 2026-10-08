import { describe, expect, it } from 'bun:test';
import { TaskSubscriptionService } from '../../src/modules/tasks-subscriptions';
import type { HouseholdContext } from '../../src/shared/household-context';

const owner: HouseholdContext = { userId: 'u1', householdId: 'h1', role: 'owner' };
const member: HouseholdContext = { userId: 'u2', householdId: 'h1', role: 'member' };
const outsider: HouseholdContext = { userId: 'u3', householdId: 'h2', role: 'owner' };

describe('tasks and subscriptions', () => {
  it('creates and completes a one-time financial task', () => {
    const service = new TaskSubscriptionService();
    const task = service.createTask(owner, 'File taxes', 'u2', '2026-04-30');
    service.completeTask(member, task.id);
    expect(service.getTask(task.id)).toMatchObject({ status: 'done', completedBy: 'u2' });
  });

  it('creates monthly renewal reminders once for each lead time', () => {
    const service = new TaskSubscriptionService();
    const subscription = service.createSubscription(owner, 'Gym', 3000, 'monthly', '2026-11-15');
    const first = service.generateReminders(owner, new Date('2026-10-16T00:00:00Z'));
    const retry = service.generateReminders(owner, new Date('2026-10-16T00:00:00Z'));
    expect(first.filter((item) => item.subscriptionId === subscription.id)).toHaveLength(1);
    expect(retry).toHaveLength(0);
  });

  it('supports yearly subscriptions and rejects cross-household access', () => {
    const service = new TaskSubscriptionService();
    const subscription = service.createSubscription(owner, 'Insurance', 12000, 'yearly', '2026-12-31');
    service.cancelSubscription(member, subscription.id);
    expect(service.getSubscription(subscription.id).status).toBe('cancelled');
    const task = service.createTask(owner, 'Household task', 'u1', '2026-01-01');
    expect(() => service.completeTask(outsider, task.id)).toThrow('Household access denied');
  });
});

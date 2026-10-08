import { assertHouseholdMember, type HouseholdContext } from '../shared/household-context';

type Task = { id: string; householdId: string; title: string; assigneeId: string; dueDate: string; status: 'open' | 'done'; completedBy?: string };
type Subscription = { id: string; householdId: string; name: string; price: number; cadence: 'monthly' | 'yearly'; nextRenewalDate: string; status: 'active' | 'cancelled' };
type Reminder = { id: string; subscriptionId: string; renewalDate: string; leadDays: 30 | 7; recipientUserId: string };

let nextId = 1;
const id = (prefix: string) => `${prefix}_${nextId++}`;
const positive = (amount: number) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer');
};
const dateOnly = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) throw new Error('Date must be YYYY-MM-DD');
};

export class TaskSubscriptionService {
  private readonly tasks = new Map<string, Task>();
  private readonly subscriptions = new Map<string, Subscription>();
  private readonly reminders = new Map<string, Reminder>();

  createTask(context: HouseholdContext, title: string, assigneeId: string, dueDate: string): TaskView {
    if (!title.trim()) throw new Error('Task title is required');
    dateOnly(dueDate);
    const task: Task = { id: id('task'), householdId: context.householdId, title: title.trim(), assigneeId, dueDate, status: 'open' };
    this.tasks.set(task.id, task);
    return { ...task };
  }

  completeTask(context: HouseholdContext, taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');
    assertHouseholdMember(context, task.householdId);
    task.status = 'done';
    task.completedBy = context.userId;
  }

  getTask(taskId: string): TaskView {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error('Task not found');
    return { ...task };
  }

  createSubscription(context: HouseholdContext, name: string, price: number, cadence: Subscription['cadence'], nextRenewalDate: string): SubscriptionView {
    positive(price);
    dateOnly(nextRenewalDate);
    if (!name.trim()) throw new Error('Subscription name is required');
    const subscription: Subscription = { id: id('subscription'), householdId: context.householdId, name: name.trim(), price, cadence, nextRenewalDate, status: 'active' };
    this.subscriptions.set(subscription.id, subscription);
    return { ...subscription };
  }

  cancelSubscription(context: HouseholdContext, subscriptionId: string): void {
    const subscription = this.requireSubscription(context, subscriptionId);
    subscription.status = 'cancelled';
  }

  getSubscription(subscriptionId: string): SubscriptionView {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');
    return { ...subscription };
  }

  generateReminders(context: HouseholdContext, now: Date): ReminderView[] {
    const generated: Reminder[] = [];
    for (const subscription of this.subscriptions.values()) {
      if (subscription.householdId !== context.householdId || subscription.status !== 'active') continue;
      const renewal = Date.parse(`${subscription.nextRenewalDate}T00:00:00Z`);
      for (const leadDays of [30, 7] as const) {
        const days = Math.round((renewal - now.getTime()) / 86_400_000);
        if (days !== leadDays) continue;
        const key = `${subscription.id}:${subscription.nextRenewalDate}:${leadDays}:${context.userId}`;
        if (this.reminders.has(key)) continue;
        const reminder: Reminder = { id: id('reminder'), subscriptionId: subscription.id, renewalDate: subscription.nextRenewalDate, leadDays, recipientUserId: context.userId };
        this.reminders.set(key, reminder);
        generated.push({ ...reminder });
      }
    }
    return generated;
  }

  private requireSubscription(context: HouseholdContext, subscriptionId: string): Subscription {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) throw new Error('Subscription not found');
    assertHouseholdMember(context, subscription.householdId);
    return subscription;
  }
}

export type TaskView = Readonly<Task>;
export type SubscriptionView = Readonly<Subscription>;
export type ReminderView = Readonly<Reminder>;

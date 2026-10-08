import { assertHouseholdMember, type HouseholdContext } from '../../shared/household-context';

type BudgetStatus = 'proposed' | 'discussed' | 'agreed' | 'rejected' | 'withdrawn';
type Budget = {
  id: string; householdId: string; category: string; amount: number; period: string; rationale: string;
  proposerId: string; status: BudgetStatus; agreements: Set<string>; revisionOf?: string;
};
type Goal = { id: string; householdId: string; name: string; targetAmount: number; contributedAmount: number; status: 'active' | 'complete' };
type Wish = { id: string; householdId: string; name: string; estimatedCost: number; status: 'open' | 'converted' };

let nextId = 1;
const id = (prefix: string) => `${prefix}_${nextId++}`;
const positive = (amount: number) => {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('Amount must be a positive integer');
};

export class PlanningService {
  private readonly budgets = new Map<string, Budget>();
  private readonly goals = new Map<string, Goal>();
  private readonly wishes = new Map<string, Wish>();

  proposeBudget(context: HouseholdContext, category: string, amount: number, period: string, rationale: string): BudgetView {
    positive(amount);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Budget period must be YYYY-MM');
    if (!category.trim()) throw new Error('Budget category is required');
    const prior = [...this.budgets.values()].find((budget) => budget.householdId === context.householdId && budget.category === category && budget.period === period && budget.status === 'agreed');
    const budget: Budget = { id: id('budget'), householdId: context.householdId, category: category.trim(), amount, period, rationale, proposerId: context.userId, status: 'proposed', agreements: new Set(), ...(prior ? { revisionOf: prior.id } : {}) };
    this.budgets.set(budget.id, budget);
    return this.viewBudget(budget);
  }

  markDiscussed(context: HouseholdContext, budgetId: string): void {
    const budget = this.requireBudget(context, budgetId);
    if (budget.status !== 'proposed') throw new Error('Budget is not proposed');
    budget.status = 'discussed';
  }

  agreeBudget(context: HouseholdContext, budgetId: string): void {
    const budget = this.requireBudget(context, budgetId);
    if (budget.status !== 'discussed') throw new Error('Budget must be discussed before agreement');
    budget.agreements.add(context.userId);
    if (budget.agreements.size === 2) budget.status = 'agreed';
  }

  getBudget(budgetId: string): BudgetView {
    const budget = this.budgets.get(budgetId);
    if (!budget) throw new Error('Budget not found');
    return this.viewBudget(budget);
  }

  createGoal(context: HouseholdContext, name: string, targetAmount: number): GoalView {
    positive(targetAmount);
    if (!name.trim()) throw new Error('Goal name is required');
    const goal: Goal = { id: id('goal'), householdId: context.householdId, name: name.trim(), targetAmount, contributedAmount: 0, status: 'active' };
    this.goals.set(goal.id, goal);
    return this.viewGoal(goal);
  }

  addContribution(context: HouseholdContext, goalId: string, amount: number, note: string): GoalView {
    positive(amount);
    const goal = this.requireGoal(context, goalId);
    goal.contributedAmount += amount;
    if (goal.contributedAmount >= goal.targetAmount) goal.status = 'complete';
    void note;
    return this.viewGoal(goal);
  }

  getGoal(goalId: string): GoalView {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error('Goal not found');
    return this.viewGoal(goal);
  }

  createWish(context: HouseholdContext, name: string, estimatedCost: number): WishView {
    positive(estimatedCost);
    if (!name.trim()) throw new Error('Wish name is required');
    const wish: Wish = { id: id('wish'), householdId: context.householdId, name: name.trim(), estimatedCost, status: 'open' };
    this.wishes.set(wish.id, wish);
    return { ...wish };
  }

  convertWishToGoal(context: HouseholdContext, wishId: string): GoalView {
    const wish = this.wishes.get(wishId);
    if (!wish) throw new Error('Wish not found');
    assertHouseholdMember(context, wish.householdId);
    if (wish.status !== 'open') throw new Error('Wish already converted');
    wish.status = 'converted';
    return this.createGoal(context, wish.name, wish.estimatedCost);
  }

  getWish(wishId: string): WishView {
    const wish = this.wishes.get(wishId);
    if (!wish) throw new Error('Wish not found');
    return { ...wish };
  }

  private requireBudget(context: HouseholdContext, idValue: string): Budget {
    const budget = this.budgets.get(idValue);
    if (!budget) throw new Error('Budget not found');
    assertHouseholdMember(context, budget.householdId);
    return budget;
  }

  private requireGoal(context: HouseholdContext, idValue: string): Goal {
    const goal = this.goals.get(idValue);
    if (!goal) throw new Error('Goal not found');
    assertHouseholdMember(context, goal.householdId);
    return goal;
  }

  private viewBudget(budget: Budget): BudgetView {
    return { id: budget.id, householdId: budget.householdId, category: budget.category, amount: budget.amount, period: budget.period, rationale: budget.rationale, proposerId: budget.proposerId, status: budget.status, agreementCount: budget.agreements.size, ...(budget.revisionOf ? { revisionOf: budget.revisionOf } : {}) };
  }

  private viewGoal(goal: Goal): GoalView {
    return { ...goal, remainingAmount: Math.max(goal.targetAmount - goal.contributedAmount, 0) };
  }
}

export type BudgetView = Readonly<{ id: string; householdId: string; category: string; amount: number; period: string; rationale: string; proposerId: string; status: BudgetStatus; agreementCount: number; revisionOf?: string }>;
export type GoalView = Readonly<Goal & { remainingAmount: number }>;
export type WishView = Readonly<Wish>;

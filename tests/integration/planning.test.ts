import { describe, expect, it } from 'bun:test';
import { PlanningService } from '../../src/modules/planning/service';
import type { HouseholdContext } from '../../src/shared/household-context';

const owner: HouseholdContext = { userId: 'u1', householdId: 'h1', role: 'owner' };
const member: HouseholdContext = { userId: 'u2', householdId: 'h1', role: 'member' };
const outsider: HouseholdContext = { userId: 'u3', householdId: 'h2', role: 'owner' };

describe('household planning', () => {
  it('requires both partners to agree a monthly budget and preserves revisions', () => {
    const planning = new PlanningService();
    const proposal = planning.proposeBudget(owner, 'Food', 5000, '2026-10', 'Keep grocery spending predictable');
    planning.markDiscussed(member, proposal.id);
    planning.agreeBudget(owner, proposal.id);
    expect(planning.getBudget(proposal.id).status).toBe('discussed');
    planning.agreeBudget(member, proposal.id);
    expect(planning.getBudget(proposal.id).status).toBe('agreed');
    const revision = planning.proposeBudget(member, 'Food', 6000, '2026-10', 'Seasonal increase');
    expect(planning.getBudget(revision.id).revisionOf).toBe(proposal.id);
  });

  it('tracks standalone goal contributions and converts a wish', () => {
    const planning = new PlanningService();
    const goal = planning.createGoal(owner, 'Emergency fund', 10000);
    planning.addContribution(member, goal.id, 2500, 'Initial contribution');
    expect(planning.getGoal(goal.id)).toMatchObject({ targetAmount: 10000, contributedAmount: 2500, remainingAmount: 7500 });
    const wish = planning.createWish(owner, 'Weekend trip', 3000);
    const converted = planning.convertWishToGoal(member, wish.id);
    expect(converted.targetAmount).toBe(3000);
    expect(planning.getWish(wish.id).status).toBe('converted');
  });

  it('denies access to another household planning records', () => {
    const planning = new PlanningService();
    const goal = planning.createGoal(owner, 'Private goal', 1000);
    expect(() => planning.addContribution(outsider, goal.id, 100, 'Nope')).toThrow('Household access denied');
  });

  it('lists household planning items for the shared dashboard', () => {
    const planning = new PlanningService();
    const budget = planning.proposeBudget(owner, 'Food', 5000, '2026-10', 'Groceries');
    const goal = planning.createGoal(owner, 'Emergency fund', 10000);
    planning.createWish(owner, 'Weekend trip', 3000);
    expect(planning.listBudgets(owner)).toEqual([budget]);
    expect(planning.listGoals(owner)).toEqual([expect.objectContaining({ id: goal.id })]);
    expect(planning.listWishes(owner)).toHaveLength(1);
    expect(planning.listBudgets(outsider)).toHaveLength(0);
  });
});

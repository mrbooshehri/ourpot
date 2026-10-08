import { describe, expect, it } from 'bun:test';
import { assertOwner, assertHouseholdMember, type HouseholdContext } from '../../src/shared/household-context';

const owner: HouseholdContext = { userId: 'u1', householdId: 'h1', role: 'owner' };
const member: HouseholdContext = { userId: 'u2', householdId: 'h1', role: 'member' };

describe('household context', () => {
  it('allows active members and rejects another household', () => {
    expect(() => assertHouseholdMember(owner, 'h1')).not.toThrow();
    expect(() => assertHouseholdMember(member, 'h2')).toThrow('Household access denied');
  });

  it('distinguishes owner-only operations', () => {
    expect(() => assertOwner(owner)).not.toThrow();
    expect(() => assertOwner(member)).toThrow('Owner access required');
  });
});

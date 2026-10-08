export type HouseholdRole = 'owner' | 'member';

export type HouseholdContext = Readonly<{
  userId: string;
  householdId: string;
  role: HouseholdRole;
}>;

export function assertHouseholdMember(context: HouseholdContext, householdId: string): void {
  if (context.householdId !== householdId) {
    throw new Error('Household access denied');
  }
}

export function assertOwner(context: HouseholdContext): void {
  if (context.role !== 'owner') {
    throw new Error('Owner access required');
  }
}

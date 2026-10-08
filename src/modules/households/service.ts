import type { HouseholdContext, HouseholdRole } from '../../shared/household-context';
import { assertOwner } from '../../shared/household-context';

type User = Readonly<{ id: string; email: string }>;
type Member = { userId: string; role: HouseholdRole; active: boolean };
type Household = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  members: Member[];
};
type Invitation = {
  token: string;
  householdId: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
};

export type InvitationView = Readonly<{
  token: string;
  householdId: string;
  email: string;
  createdAt: Date;
  expiresAt: Date;
  status: Invitation['status'];
}>;

let nextId = 1;
function id(prefix: string): string {
  return `${prefix}_${nextId++}`;
}

export class HouseholdService {
  private readonly users = new Map<string, User>();
  private readonly households = new Map<string, Household>();
  private readonly invitations = new Map<string, Invitation>();

  registerUser(email: string): User {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new Error('Valid email is required');
    }
    if ([...this.users.values()].some((user) => user.email === normalizedEmail)) {
      throw new Error('Email already registered');
    }
    const user = { id: id('user'), email: normalizedEmail } as const;
    this.users.set(user.id, user);
    return user;
  }

  createHousehold(userId: string, name: string, currency: string, timezone: string): HouseholdView {
    this.requireUser(userId);
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw new Error('Currency must be a three-letter uppercase code');
    }
    if (!name.trim()) {
      throw new Error('Household name is required');
    }
    const household: Household = {
      id: id('household'),
      name: name.trim(),
      currency,
      timezone,
      members: [{ userId, role: 'owner', active: true }],
    };
    this.households.set(household.id, household);
    return this.viewHousehold(household);
  }

  inviteMember(householdId: string, actorUserId: string, email: string): InvitationView {
    const context = this.getContext(actorUserId, householdId);
    assertOwner(context);
    const household = this.requireHousehold(householdId);
    if (household.members.filter((member) => member.active).length >= 2) {
      throw new Error('Household already has two members');
    }
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new Error('Valid email is required');
    }
    const now = new Date();
    const invitation: Invitation = {
      token: id('invite'),
      householdId,
      email: normalizedEmail,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
    };
    this.invitations.set(invitation.token, invitation);
    return this.viewInvitation(invitation);
  }

  acceptInvitation(token: string, userId: string): void {
    const invitation = this.invitations.get(token);
    if (!invitation) throw new Error('Invitation not found');
    if (invitation.status !== 'pending') throw new Error('Invitation already accepted');
    if (invitation.expiresAt.getTime() <= Date.now()) {
      invitation.status = 'expired';
      throw new Error('Invitation expired');
    }
    const user = this.requireUser(userId);
    if (user.email !== invitation.email) throw new Error('Invitation email mismatch');
    const household = this.requireHousehold(invitation.householdId);
    if (household.members.filter((member) => member.active).length >= 2) {
      throw new Error('Household already has two members');
    }
    household.members.push({ userId, role: 'member', active: true });
    invitation.status = 'accepted';
  }

  removeMember(householdId: string, actorUserId: string, memberUserId: string): void {
    const context = this.getContext(actorUserId, householdId);
    assertOwner(context);
    const household = this.requireHousehold(householdId);
    const member = household.members.find((candidate) => candidate.userId === memberUserId && candidate.active);
    if (!member) throw new Error('Household member not found');
    if (member.role === 'owner') throw new Error('Cannot remove the last owner');
    member.active = false;
  }

  getContext(userId: string, householdId: string): HouseholdContext {
    const household = this.requireHousehold(householdId);
    const member = household.members.find((candidate) => candidate.userId === userId && candidate.active);
    if (!member) throw new Error('Household access denied');
    return { userId, householdId, role: member.role };
  }

  private requireUser(userId: string): User {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found');
    return user;
  }

  private requireHousehold(householdId: string): Household {
    const household = this.households.get(householdId);
    if (!household) throw new Error('Household access denied');
    return household;
  }

  private viewHousehold(household: Household): HouseholdView {
    return {
      id: household.id,
      name: household.name,
      currency: household.currency,
      timezone: household.timezone,
      members: household.members.filter((member) => member.active).map(({ userId, role }) => ({ userId, role })),
    };
  }

  private viewInvitation(invitation: Invitation): InvitationView {
    return { ...invitation };
  }
}

export type HouseholdView = Readonly<{
  id: string;
  name: string;
  currency: string;
  timezone: string;
  members: ReadonlyArray<Readonly<{ userId: string; role: HouseholdRole }>>;
}>;

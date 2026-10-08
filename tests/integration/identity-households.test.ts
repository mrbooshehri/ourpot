import { describe, expect, it } from 'bun:test';
import { HouseholdService } from '../../src/modules/households/service';

describe('identity and household membership', () => {
  it('creates a household with an owner and invites the second partner', () => {
    const service = new HouseholdService();
    const owner = service.registerUser('owner@example.com');
    const household = service.createHousehold(owner.id, 'Our Home', 'USD', 'Asia/Tehran');
    const invitation = service.inviteMember(household.id, owner.id, 'partner@example.com');

    expect(household.members).toEqual([{ userId: owner.id, role: 'owner' }]);
    expect(invitation.email).toBe('partner@example.com');
    expect(invitation.expiresAt > invitation.createdAt).toBe(true);
  });

  it('accepts an invitation once and enforces the two-member limit', () => {
    const service = new HouseholdService();
    const owner = service.registerUser('owner@example.com');
    const household = service.createHousehold(owner.id, 'Our Home', 'USD', 'UTC');
    const invitation = service.inviteMember(household.id, owner.id, 'partner@example.com');
    const partner = service.registerUser('partner@example.com');

    service.acceptInvitation(invitation.token, partner.id);
    expect(service.getContext(partner.id, household.id)).toMatchObject({ role: 'member' });
    expect(() => service.acceptInvitation(invitation.token, partner.id)).toThrow('Invitation already accepted');
    expect(() => service.inviteMember(household.id, owner.id, 'third@example.com')).toThrow('Household already has two members');
  });

  it('allows only the owner to manage membership and denies removed members', () => {
    const service = new HouseholdService();
    const owner = service.registerUser('owner@example.com');
    const household = service.createHousehold(owner.id, 'Our Home', 'USD', 'UTC');
    const invitation = service.inviteMember(household.id, owner.id, 'partner@example.com');
    const partner = service.registerUser('partner@example.com');
    service.acceptInvitation(invitation.token, partner.id);

    expect(() => service.inviteMember(household.id, partner.id, 'third@example.com')).toThrow('Owner access required');
    service.removeMember(household.id, owner.id, partner.id);
    expect(() => service.getContext(partner.id, household.id)).toThrow('Household access denied');
  });
});

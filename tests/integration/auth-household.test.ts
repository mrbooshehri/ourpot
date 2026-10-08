import { describe, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { createDatabaseClient } from '../../src/db/client';
import { IdentityRepository } from '../../src/modules/identity/repository';
import { hashPassword, normalizeEmail, verifyPassword } from '../../src/modules/identity/password';
import { PostgresHouseholdService } from '../../src/modules/households/postgres-service';

const email = (label: string) => `${label}-${randomUUID()}@example.com`;

describe('durable users and household membership', () => {
  it('normalizes unique emails and verifies Argon2id passwords', async () => {
    const db = createDatabaseClient();
    const users = new IdentityRepository(db);
    const address = email('owner');
    const hashed = await hashPassword('correct horse battery staple');
    const user = await users.createUser(` ${address.toUpperCase()} `, hashed);
    expect(user.email).toBe(normalizeEmail(address));
    expect(await verifyPassword('correct horse battery staple', hashed)).toBe(true);
    expect(await verifyPassword('wrong password', hashed)).toBe(false);
    expect(await users.findUserByEmail(address)).toMatchObject({ id: user.id });
    await expect(users.createUser(address, hashed)).rejects.toThrow();
  });

  it('creates an owner, accepts one email-matched invitation, and denies removed members', async () => {
    const db = createDatabaseClient();
    const users = new IdentityRepository(db);
    const households = new PostgresHouseholdService(db);
    const owner = await users.createUser(email('owner'), await hashPassword('owner secret long enough'));
    const partnerEmail = email('partner');
    const partner = await users.createUser(partnerEmail, await hashPassword('partner secret long enough'));
    const household = await households.createHousehold(owner.id, { name: 'Our Home', currency: 'USD', timezone: 'UTC' });
    expect(await households.getContext(owner.id, household.id)).toMatchObject({ role: 'owner' });
    const invitation = await households.inviteMember(await households.getContext(owner.id, household.id), partnerEmail);
    expect(invitation.expiresAt.getTime() - invitation.createdAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    await households.acceptInvitation(invitation.token, partner.id);
    expect(await households.getContext(partner.id, household.id)).toMatchObject({ role: 'member' });
    await expect(households.acceptInvitation(invitation.token, partner.id)).rejects.toThrow();
    await expect(households.inviteMember(await households.getContext(partner.id, household.id), email('third'))).rejects.toThrow();
    await households.removeMember(await households.getContext(owner.id, household.id), partner.id);
    await expect(households.getContext(partner.id, household.id)).rejects.toThrow('Household access denied');
  });

  it('rejects a mismatched or revoked invitation and records a secret-free event', async () => {
    const db = createDatabaseClient();
    const users = new IdentityRepository(db);
    const households = new PostgresHouseholdService(db);
    const owner = await users.createUser(email('owner'), await hashPassword('owner secret long enough'));
    const partnerEmail = email('partner');
    const partner = await users.createUser(partnerEmail, await hashPassword('partner secret long enough'));
    const stranger = await users.createUser(email('stranger'), await hashPassword('stranger secret long enough'));
    const household = await households.createHousehold(owner.id, { name: 'Our Home', currency: 'USD', timezone: 'UTC' });
    const context = await households.getContext(owner.id, household.id);
    const invitation = await households.inviteMember(context, partnerEmail);
    await expect(households.acceptInvitation(invitation.token, stranger.id)).rejects.toThrow('Invitation email mismatch');
    await households.revokeInvitation(context, invitation.token);
    await expect(households.acceptInvitation(invitation.token, partner.id)).rejects.toThrow();
    const events = await db.query<{ action: string; attempted_email: string | null }>(
      'SELECT action, attempted_email FROM security_events WHERE user_id = $1', [owner.id],
    );
    expect(events.rows.some((event) => event.action === 'invitation_created')).toBe(true);
    expect(events.rows.some((event) => event.action === 'invitation_revoked')).toBe(true);
    expect(JSON.stringify(events.rows)).not.toContain(invitation.token);
  });
});

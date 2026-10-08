import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import type { HouseholdContext } from '../../shared/household-context';
import { assertOwner } from '../../shared/household-context';
import { normalizeEmail } from '../identity/password';

export type PersistedHouseholdView = { id: string; name: string; currency: string; timezone: string };
export type PersistedInvitationView = { token: string; householdId: string; email: string; createdAt: Date; expiresAt: Date };
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class PostgresHouseholdService {
  constructor(private readonly db: DatabaseClient) {}

  async createHousehold(userId: string, input: { name: string; currency: string; timezone: string }): Promise<PersistedHouseholdView> {
    if (!input.name.trim()) throw new Error('Household name is required');
    if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('Currency must be a three-letter uppercase code');
    const id = randomUUID();
    await this.db.transaction(async (tx) => {
      await tx.query('INSERT INTO households (id, name, currency, timezone) VALUES ($1, $2, $3, $4)',
        [id, input.name.trim(), input.currency, input.timezone]);
      await tx.query('INSERT INTO household_members (household_id, user_id, role) VALUES ($1, $2, $3)',
        [id, userId, 'owner']);
    });
    return { id, name: input.name.trim(), currency: input.currency, timezone: input.timezone };
  }

  async getContext(userId: string, householdId: string): Promise<HouseholdContext> {
    const result = await this.db.query<{ role: 'owner' | 'member' }>(
      'SELECT role FROM household_members WHERE user_id = $1 AND household_id = $2 AND active = true',
      [userId, householdId],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Household access denied');
    return { userId, householdId, role: row.role };
  }

  async findActiveHousehold(userId: string): Promise<HouseholdContext | null> {
    const result = await this.db.query<{ household_id: string; role: 'owner' | 'member' }>(
      'SELECT household_id, role FROM household_members WHERE user_id = $1 AND active = true', [userId],
    );
    const row = result.rows[0];
    return row ? { userId, householdId: row.household_id, role: row.role } : null;
  }

  async inviteMember(context: HouseholdContext, email: string): Promise<PersistedInvitationView> {
    assertOwner(await this.getContext(context.userId, context.householdId));
    const normalized = normalizeEmail(email);
    const token = randomBytes(32).toString('base64url');
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    await this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM households WHERE id = $1 FOR UPDATE', [context.householdId]);
      const count = await tx.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM household_members WHERE household_id = $1 AND active = true', [context.householdId],
      );
      if ((count.rows[0]?.count ?? 0) >= 2) throw new Error('Household already has two members');
      await tx.query(
        `INSERT INTO invitations (token, household_id, email, created_at, expires_at, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')`,
        [hashToken(token), context.householdId, normalized, createdAt, expiresAt],
      );
      await tx.query(
        "INSERT INTO security_events (id, user_id, attempted_email, action, outcome) VALUES ($1, $2, $3, 'invitation_created', 'success')",
        [randomUUID(), context.userId, normalized],
      );
    });
    return { token, householdId: context.householdId, email: normalized, createdAt, expiresAt };
  }

  async acceptInvitation(token: string, userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const inviteResult = await tx.query<{ household_id: string; email: string; expires_at: Date; status: string }>(
        'SELECT household_id, email, expires_at, status FROM invitations WHERE token = $1 FOR UPDATE', [hashToken(token)],
      );
      const invite = inviteResult.rows[0];
      if (!invite || invite.status !== 'pending') throw new Error('Invitation not found or already used');
      if (invite.expires_at.getTime() <= Date.now()) throw new Error('Invitation expired');
      const userResult = await tx.query<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId]);
      if (userResult.rows[0]?.email.toLowerCase() !== invite.email.toLowerCase()) throw new Error('Invitation email mismatch');
      await tx.query('SELECT id FROM households WHERE id = $1 FOR UPDATE', [invite.household_id]);
      const count = await tx.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM household_members WHERE household_id = $1 AND active = true', [invite.household_id],
      );
      if ((count.rows[0]?.count ?? 0) >= 2) throw new Error('Household already has two members');
      await tx.query(
        `INSERT INTO household_members (household_id, user_id, role, active)
         VALUES ($1, $2, 'member', true)
         ON CONFLICT (household_id, user_id) DO UPDATE SET active = true, role = 'member'`,
        [invite.household_id, userId],
      );
      await tx.query("UPDATE invitations SET status = 'accepted' WHERE token = $1", [hashToken(token)]);
      await tx.query(
        "INSERT INTO security_events (id, user_id, attempted_email, action, outcome) VALUES ($1, $2, $3, 'invitation_accepted', 'success')",
        [randomUUID(), userId, invite.email],
      );
    });
  }

  async revokeInvitation(context: HouseholdContext, token: string): Promise<void> {
    assertOwner(await this.getContext(context.userId, context.householdId));
    const result = await this.db.query<{ token: string }>(
      "UPDATE invitations SET status = 'revoked' WHERE token = $1 AND household_id = $2 AND status = 'pending' RETURNING token",
      [hashToken(token), context.householdId],
    );
    if (!result.rows[0]) throw new Error('Invitation not found');
    await this.db.query(
      "INSERT INTO security_events (id, user_id, action, outcome) VALUES ($1, $2, 'invitation_revoked', 'success')",
      [randomUUID(), context.userId],
    );
  }

  async removeMember(context: HouseholdContext, userId: string): Promise<void> {
    assertOwner(await this.getContext(context.userId, context.householdId));
    const result = await this.db.query<{ user_id: string }>(
      "UPDATE household_members SET active = false WHERE household_id = $1 AND user_id = $2 AND role = 'member' AND active = true RETURNING user_id",
      [context.householdId, userId],
    );
    if (!result.rows[0]) throw new Error('Household member not found');
    await this.db.query(
      "INSERT INTO security_events (id, user_id, action, outcome) VALUES ($1, $2, 'member_removed', 'success')",
      [randomUUID(), context.userId],
    );
  }
}

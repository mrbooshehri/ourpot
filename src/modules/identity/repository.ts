import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import { normalizeEmail } from './password';
import type { SystemRole } from './types';

export type PreferredLanguage = 'en' | 'fa' | 'ar';
export type User = { id: string; email: string; displayName: string | null; preferredLanguage: PreferredLanguage; passwordHash: string; systemRole: SystemRole; mustChangePassword: boolean; disabledAt: Date | null };

export class IdentityRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createUser(email: string, passwordHash: string, options: { displayName?: string; systemRole?: SystemRole; mustChangePassword?: boolean } = {}): Promise<User> {
    const normalized = normalizeEmail(email);
    const id = randomUUID();
    const result = await this.db.query<UserRow>(
      'INSERT INTO users (id, email, display_name, password_hash, system_role, must_change_password) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, display_name, preferred_language, password_hash, system_role, must_change_password, disabled_at',
      [id, normalized, options.displayName?.trim() || null, passwordHash, options.systemRole ?? 'user', options.mustChangePassword ?? false],
    );
    const row = result.rows[0];
    if (!row) throw new Error('User creation failed');
    return toUser(row);
  }

  async createInvitedUser(invitationTokenHash: string, passwordHash: string, displayName: string): Promise<User> {
    return this.db.transaction(async (tx) => {
      const invitation = await tx.query<{ household_id: string; email: string; expires_at: Date; status: string }>(
        'SELECT household_id, email, expires_at, status FROM invitations WHERE token = $1 FOR UPDATE', [invitationTokenHash],
      );
      const invite = invitation.rows[0];
      if (!invite || invite.status !== 'pending') throw new Error('Invitation not found or already used');
      if (invite.expires_at.getTime() <= Date.now()) throw new Error('Invitation expired');
      const existing = await tx.query<{ id: string }>('SELECT id FROM users WHERE email = $1', [invite.email]);
      if (existing.rows[0]) throw new Error('An account already exists for this invitation email. Sign in first.');
      const count = await tx.query<{ count: number }>(
        'SELECT count(*)::int AS count FROM household_members WHERE household_id = $1 AND active = true', [invite.household_id],
      );
      if ((count.rows[0]?.count ?? 0) >= 2) throw new Error('Household already has two members');
      const id = randomUUID();
      const created = await tx.query<UserRow>(
        'INSERT INTO users (id, email, display_name, password_hash, system_role, must_change_password) VALUES ($1, $2, $3, $4, \'user\', false) RETURNING id, email, display_name, preferred_language, password_hash, system_role, must_change_password, disabled_at',
        [id, invite.email, displayName.trim() || null, passwordHash],
      );
      await tx.query(
        "INSERT INTO household_members (household_id, user_id, role, active) VALUES ($1, $2, 'member', true)",
        [invite.household_id, id],
      );
      await tx.query("UPDATE invitations SET status = 'accepted' WHERE token = $1", [invitationTokenHash]);
      await tx.query(
        "INSERT INTO security_events (id, user_id, attempted_email, action, outcome) VALUES ($1, $2, $3, 'invitation_accepted', 'success')",
        [randomUUID(), id, invite.email],
      );
      const row = created.rows[0];
      if (!row) throw new Error('User creation failed');
      return toUser(row);
    });
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = normalizeEmail(email);
    const result = await this.db.query<UserRow>(
      'SELECT id, email, display_name, preferred_language, password_hash, system_role, must_change_password, disabled_at FROM users WHERE email = $1', [normalized],
    );
    const row = result.rows[0];
    return row ? toUser(row) : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      'SELECT id, email, display_name, preferred_language, password_hash, system_role, must_change_password, disabled_at FROM users WHERE id = $1', [id],
    );
    const row = result.rows[0];
    return row ? toUser(row) : null;
  }

  async findRootAdmin(): Promise<User | null> {
    const result = await this.db.query<UserRow>(
      "SELECT id, email, display_name, preferred_language, password_hash, system_role, must_change_password, disabled_at FROM users WHERE system_role = 'root_admin' LIMIT 1",
    );
    const row = result.rows[0];
    return row ? toUser(row) : null;
  }

  async listUsers(): Promise<Array<{ id: string; email: string; systemRole: SystemRole; mustChangePassword: boolean; disabledAt: Date | null; createdAt: Date }>> {
    const result = await this.db.query<{ id: string; email: string; display_name: string | null; system_role: SystemRole; must_change_password: boolean; disabled_at: Date | null; created_at: Date }>(
      'SELECT id, email, display_name, system_role, must_change_password, disabled_at, created_at FROM users ORDER BY created_at',
    );
    return result.rows.map((row) => ({ id: row.id, email: row.email, displayName: row.display_name, systemRole: row.system_role, mustChangePassword: row.must_change_password, disabledAt: row.disabled_at, createdAt: row.created_at }));
  }

  async getLanguage(userId: string): Promise<PreferredLanguage> {
    const result = await this.db.query<{ preferred_language: PreferredLanguage }>('SELECT preferred_language FROM users WHERE id = $1', [userId]);
    return result.rows[0]?.preferred_language ?? 'en';
  }

  async setLanguage(userId: string, language: PreferredLanguage): Promise<void> {
    await this.db.query('UPDATE users SET preferred_language = $2 WHERE id = $1', [userId, language]);
  }

  async setDisplayName(userId: string, displayName: string): Promise<void> {
    await this.db.query('UPDATE users SET display_name = $2 WHERE id = $1', [userId, displayName]);
  }

  async setPassword(userId: string, passwordHash: string, mustChangePassword = false): Promise<void> {
    await this.db.query('UPDATE users SET password_hash = $2, must_change_password = $3 WHERE id = $1', [userId, passwordHash, mustChangePassword]);
  }
}

type UserRow = { id: string; email: string; display_name: string | null; preferred_language: PreferredLanguage; password_hash: string; system_role: SystemRole; must_change_password: boolean; disabled_at: Date | null };
const toUser = (row: UserRow): User => ({ id: row.id, email: row.email, displayName: row.display_name, preferredLanguage: row.preferred_language, passwordHash: row.password_hash, systemRole: row.system_role, mustChangePassword: row.must_change_password, disabledAt: row.disabled_at });

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

  async setPassword(userId: string, passwordHash: string, mustChangePassword = false): Promise<void> {
    await this.db.query('UPDATE users SET password_hash = $2, must_change_password = $3 WHERE id = $1', [userId, passwordHash, mustChangePassword]);
  }
}

type UserRow = { id: string; email: string; display_name: string | null; preferred_language: PreferredLanguage; password_hash: string; system_role: SystemRole; must_change_password: boolean; disabled_at: Date | null };
const toUser = (row: UserRow): User => ({ id: row.id, email: row.email, displayName: row.display_name, preferredLanguage: row.preferred_language, passwordHash: row.password_hash, systemRole: row.system_role, mustChangePassword: row.must_change_password, disabledAt: row.disabled_at });

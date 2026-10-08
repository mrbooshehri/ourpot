import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import { normalizeEmail } from './password';
import type { SystemRole } from './types';

export type User = { id: string; email: string; passwordHash: string; systemRole: SystemRole; mustChangePassword: boolean; disabledAt: Date | null };

export class IdentityRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createUser(email: string, passwordHash: string, options: { systemRole?: SystemRole; mustChangePassword?: boolean } = {}): Promise<User> {
    const normalized = normalizeEmail(email);
    const id = randomUUID();
    const result = await this.db.query<{ id: string; email: string; password_hash: string; system_role: SystemRole; must_change_password: boolean; disabled_at: Date | null }>(
      'INSERT INTO users (id, email, password_hash, system_role, must_change_password) VALUES ($1, $2, $3, $4, $5) RETURNING id, email, password_hash, system_role, must_change_password, disabled_at',
      [id, normalized, passwordHash, options.systemRole ?? 'user', options.mustChangePassword ?? false],
    );
    const row = result.rows[0];
    if (!row) throw new Error('User creation failed');
    return { id: row.id, email: row.email, passwordHash: row.password_hash, systemRole: row.system_role, mustChangePassword: row.must_change_password, disabledAt: row.disabled_at };
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = normalizeEmail(email);
    const result = await this.db.query<{ id: string; email: string; password_hash: string; system_role: SystemRole; must_change_password: boolean; disabled_at: Date | null }>(
      'SELECT id, email, password_hash, system_role, must_change_password, disabled_at FROM users WHERE email = $1', [normalized],
    );
    const row = result.rows[0];
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, systemRole: row.system_role, mustChangePassword: row.must_change_password, disabledAt: row.disabled_at } : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const result = await this.db.query<{ id: string; email: string; password_hash: string; system_role: SystemRole; must_change_password: boolean; disabled_at: Date | null }>(
      'SELECT id, email, password_hash, system_role, must_change_password, disabled_at FROM users WHERE id = $1', [id],
    );
    const row = result.rows[0];
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, systemRole: row.system_role, mustChangePassword: row.must_change_password, disabledAt: row.disabled_at } : null;
  }

  async findRootAdmin(): Promise<User | null> {
    const result = await this.db.query<{ id: string; email: string; password_hash: string; system_role: SystemRole; must_change_password: boolean; disabled_at: Date | null }>(
      "SELECT id, email, password_hash, system_role, must_change_password, disabled_at FROM users WHERE system_role = 'root_admin' LIMIT 1",
    );
    const row = result.rows[0];
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash, systemRole: row.system_role, mustChangePassword: row.must_change_password, disabledAt: row.disabled_at } : null;
  }

  async listUsers(): Promise<Array<{ id: string; email: string; systemRole: SystemRole; mustChangePassword: boolean; disabledAt: Date | null; createdAt: Date }>> {
    const result = await this.db.query<{ id: string; email: string; system_role: SystemRole; must_change_password: boolean; disabled_at: Date | null; created_at: Date }>(
      'SELECT id, email, system_role, must_change_password, disabled_at, created_at FROM users ORDER BY created_at',
    );
    return result.rows.map((row) => ({ id: row.id, email: row.email, systemRole: row.system_role, mustChangePassword: row.must_change_password, disabledAt: row.disabled_at, createdAt: row.created_at }));
  }

  async setPassword(userId: string, passwordHash: string, mustChangePassword = false): Promise<void> {
    await this.db.query('UPDATE users SET password_hash = $2, must_change_password = $3 WHERE id = $1', [userId, passwordHash, mustChangePassword]);
  }
}

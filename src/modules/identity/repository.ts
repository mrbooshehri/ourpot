import { randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import { normalizeEmail } from './password';

export type User = { id: string; email: string; passwordHash: string };

export class IdentityRepository {
  constructor(private readonly db: DatabaseClient) {}

  async createUser(email: string, passwordHash: string): Promise<User> {
    const normalized = normalizeEmail(email);
    const id = randomUUID();
    const result = await this.db.query<{ id: string; email: string; password_hash: string }>(
      'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email, password_hash',
      [id, normalized, passwordHash],
    );
    const row = result.rows[0];
    if (!row) throw new Error('User creation failed');
    return { id: row.id, email: row.email, passwordHash: row.password_hash };
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = normalizeEmail(email);
    const result = await this.db.query<{ id: string; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1', [normalized],
    );
    const row = result.rows[0];
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
  }

  async findUserById(id: string): Promise<User | null> {
    const result = await this.db.query<{ id: string; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE id = $1', [id],
    );
    const row = result.rows[0];
    return row ? { id: row.id, email: row.email, passwordHash: row.password_hash } : null;
  }
}

import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseClient } from '../../db/client';
import type { AppConfig } from '../../config';
import { IdentityRepository } from './repository';
import { hashPassword, normalizeEmail, verifyPassword } from './password';
import { createTotpSecret, decryptTotpSecret, encryptTotpSecret, verifyTotpCode } from './totp';
import * as OTPAuth from 'otpauth';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration } from './passkeys';
import type { PublicUser, LoginResult, SessionPrincipal, SessionView, SessionIssue, PasskeyView } from './types';

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const DAY = 24 * 60 * 60 * 1000;
const DUMMY_PASSWORD_HASH = '$argon2id$v=19$m=65536,t=2,p=1$loYQjtdHrGLPdI2DY4NCxP+yILUJs3IKo/Nc+NRTOIo$qgCz4dZPgHIm4rpLlCYG0lQYNriHawwDET8fp7b/mAE';
export class RateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super('Too many attempts. Try again later');
    this.name = 'RateLimitError';
  }
}
type SessionRow = { id: string; user_id: string; created_at: Date; last_used_at: Date; expires_at: Date; idle_expires_at: Date; revoked_at: Date | null; user_agent: string; sign_in_method: string; recent_auth_at: Date | null; system_role: 'root_admin' | 'user'; must_change_password: boolean; disabled_at: Date | null };
const sessionView = (row: SessionRow): SessionView => ({ id: row.id, createdAt: row.created_at, lastUsedAt: row.last_used_at, expiresAt: row.expires_at, userAgent: row.user_agent, signInMethod: row.sign_in_method });

export class IdentityService {
  private readonly users: IdentityRepository;
  constructor(private readonly db: DatabaseClient, private readonly config: AppConfig) {
    this.users = new IdentityRepository(db);
  }

  async ensureBootstrapAdmin(): Promise<void> {
    if (await this.users.findRootAdmin()) return;
    if (!this.config.bootstrapAdminEmail || !this.config.bootstrapAdminPassword) {
      throw new Error('No root administrator exists. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD before starting the server');
    }
    const hash = await hashPassword(this.config.bootstrapAdminPassword);
    try {
      const admin = await this.users.createUser(this.config.bootstrapAdminEmail, hash, { systemRole: 'root_admin', mustChangePassword: true });
      await this.event(admin.id, admin.email, 'bootstrap_admin_created', 'success');
    } catch (error) {
      if (error && typeof error === 'object' && 'errno' in error && String(error.errno) === '23505' && await this.users.findRootAdmin()) return;
      throw error;
    }
  }

  async createManagedUser(email: string, temporaryPassword: string): Promise<PublicUser> {
    const user = await this.users.createUser(email, await hashPassword(temporaryPassword), { mustChangePassword: true });
    await this.event(user.id, user.email, 'admin_user_created', 'success');
    return { id: user.id, email: user.email, systemRole: user.systemRole, mustChangePassword: true };
  }

  async listManagedUsers() {
    return this.users.listUsers();
  }

  async changePassword(session: SessionPrincipal, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.users.findUserById(session.userId);
    if (!user || user.disabledAt || !(await verifyPassword(currentPassword, user.passwordHash))) throw new Error('Invalid credentials');
    const hash = await hashPassword(newPassword);
    await this.db.transaction(async (tx) => {
      await tx.query('UPDATE users SET password_hash = $2, must_change_password = false WHERE id = $1', [session.userId, hash]);
      await tx.query('UPDATE sessions SET recent_auth_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [session.sessionId, session.userId]);
      await this.event(session.userId, user.email, 'password_changed', 'success', tx);
    });
  }

  async register(email: string, password: string, ip = ''): Promise<PublicUser> {
    const ipKeys = ip ? [tokenHash(`registration:ip:${ip}`)] : [];
    await this.assertNotRateLimited(ipKeys);
    let normalized: string;
    try { normalized = normalizeEmail(email); } catch (error) {
      await this.recordFailure(ipKeys);
      throw error;
    }
    const keys = [tokenHash(`registration:email:${normalized}`), ...ipKeys];
    await this.assertNotRateLimited(keys);
    try {
      const hash = await hashPassword(password);
      const user = await this.users.createUser(normalized, hash);
      await this.event(user.id, user.email, 'registration', 'success');
      return { id: user.id, email: user.email };
    } catch (error) {
      await this.recordFailure(keys);
      throw error;
    }
  }

  async loginPassword(email: string, password: string, userAgent: string, ip = ''): Promise<LoginResult> {
    let normalized: string;
    try { normalized = normalizeEmail(email); } catch { throw new Error('Invalid credentials'); }
    const keys = [`password:email:${normalized}`, ...(ip ? [`password:ip:${ip}`] : [])].map(tokenHash);
    await this.assertNotRateLimited(keys);
    const user = await this.users.findUserByEmail(normalized);
    if (user?.disabledAt) {
      await this.event(null, normalized, 'password_login', 'failure');
      throw new Error('Invalid credentials');
    }
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) {
      await this.recordFailure(keys);
      await this.event(user?.id ?? null, normalized, 'password_login', 'failure');
      throw new Error('Invalid credentials');
    }
    const enabled = await this.db.query<{ user_id: string }>('SELECT user_id FROM totp_credentials WHERE user_id = $1 AND enabled_at IS NOT NULL', [user.id]);
    if (enabled.rows[0]) {
      const pendingToken = randomBytes(32).toString('base64url');
      await this.db.query(
        "INSERT INTO auth_challenges (id, token_hash, user_id, kind, expires_at) VALUES ($1, $2, $3, 'password_mfa', $4)",
        [randomUUID(), tokenHash(pendingToken), user.id, new Date(Date.now() + 5 * 60 * 1000)],
      );
      return { kind: 'mfa_required', pendingToken };
    }
    const issue = await this.issueSession(user.id, userAgent, 'password');
    await this.event(user.id, normalized, 'password_login', 'success');
    return { kind: 'session', issue };
  }

  async issueSession(userId: string, userAgent: string, signInMethod: 'password' | 'passkey', db: DatabaseClient = this.db): Promise<SessionIssue> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date();
    const id = randomUUID();
    const expiresAt = new Date(now.getTime() + 30 * DAY);
    await db.query(
      `INSERT INTO sessions (id, user_id, token_hash, created_at, last_used_at, idle_expires_at, expires_at, user_agent, sign_in_method, recent_auth_at)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $4)`,
      [id, userId, tokenHash(token), now, new Date(now.getTime() + DAY), expiresAt, userAgent.slice(0, 512), signInMethod],
    );
    await this.event(userId, null, 'session_created', 'success', db);
    return { token, session: { id, createdAt: now, lastUsedAt: now, expiresAt, userAgent: userAgent.slice(0, 512), signInMethod } };
  }

  async getSession(rawToken: string): Promise<SessionPrincipal | null> {
    if (!/^[A-Za-z0-9_-]{40,100}$/.test(rawToken)) return null;
    const result = await this.db.query<SessionRow>(
      `SELECT s.id, s.user_id, s.created_at, s.last_used_at, s.idle_expires_at, s.expires_at, s.revoked_at, s.user_agent, s.sign_in_method, s.recent_auth_at,
              u.system_role, u.must_change_password, u.disabled_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1`, [tokenHash(rawToken)],
    );
    const row = result.rows[0];
    const now = new Date();
    if (!row || row.revoked_at || row.disabled_at || row.expires_at <= now || row.idle_expires_at <= now) return null;
    if (now.getTime() - row.last_used_at.getTime() >= 5 * 60 * 1000) {
      await this.db.query('UPDATE sessions SET last_used_at = $1, idle_expires_at = $2 WHERE id = $3 AND revoked_at IS NULL',
        [now, new Date(now.getTime() + DAY), row.id]);
    }
    return { userId: row.user_id, sessionId: row.id, recentAuthAt: row.recent_auth_at, systemRole: row.system_role, mustChangePassword: row.must_change_password };
  }

  async listSessions(userId: string): Promise<SessionView[]> {
    const result = await this.db.query<SessionRow>(
      `SELECT id, user_id, created_at, last_used_at, idle_expires_at, expires_at, revoked_at, user_agent, sign_in_method, recent_auth_at
       FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now() AND idle_expires_at > now()
       ORDER BY last_used_at DESC`, [userId],
    );
    return result.rows.map(sessionView);
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const result = await this.db.query<{ id: string }>(
      'UPDATE sessions SET revoked_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL RETURNING id',
      [sessionId, userId],
    );
    if (!result.rows[0]) throw new Error('Session not found');
    await this.event(userId, null, 'session_revoked', 'success');
  }

  async logout(rawToken: string): Promise<void> {
    const principal = await this.getSession(rawToken);
    if (principal) await this.revokeSession(principal.userId, principal.sessionId);
  }

  async startTotpEnrollment(session: SessionPrincipal): Promise<{ otpauthUri: string }> {
    this.requireRecent(session);
    const key = this.requireTotpKey();
    const existing = await this.db.query<{ enabled_at: Date | null }>('SELECT enabled_at FROM totp_credentials WHERE user_id = $1', [session.userId]);
    if (existing.rows[0]?.enabled_at) throw new Error('Authenticator MFA is already enabled');
    const user = await this.users.findUserById(session.userId);
    if (!user) throw new Error('User not found');
    const secret = createTotpSecret();
    const encrypted = encryptTotpSecret(secret, key);
    await this.db.query(
      `INSERT INTO totp_credentials (user_id, secret_ciphertext, secret_iv, secret_tag)
       VALUES ($1, decode($2, 'base64'), decode($3, 'base64'), decode($4, 'base64'))
       ON CONFLICT (user_id) DO UPDATE SET secret_ciphertext = EXCLUDED.secret_ciphertext,
         secret_iv = EXCLUDED.secret_iv, secret_tag = EXCLUDED.secret_tag, last_used_step = NULL
       WHERE totp_credentials.enabled_at IS NULL`,
      [session.userId, encrypted.ciphertext, encrypted.iv, encrypted.tag],
    );
    const totp = new OTPAuth.TOTP({ issuer: 'Ourpot', label: user.email, secret: OTPAuth.Secret.fromBase32(secret), period: 30, digits: 6 });
    return { otpauthUri: OTPAuth.URI.stringify(totp) };
  }

  async confirmTotpEnrollment(session: SessionPrincipal, code: string): Promise<{ recoveryCodes: string[] }> {
    this.requireRecent(session);
    const key = this.requireTotpKey();
    return this.db.transaction(async (tx) => {
      const row = await this.getTotpRow(tx, session.userId, true);
      if (!row || row.enabled_at) throw new Error('No pending authenticator enrollment');
      const secret = decryptTotpSecret(row, key);
      const step = verifyTotpCode(secret, code, null);
      if (step === null) throw new Error('Invalid code');
      await tx.query('UPDATE totp_credentials SET enabled_at = now(), last_used_step = $2 WHERE user_id = $1', [session.userId, step]);
      const recoveryCodes = await this.replaceRecoveryCodes(tx, session.userId);
      await this.event(session.userId, null, 'mfa_enabled', 'success', tx);
      return { recoveryCodes };
    });
  }

  async completeMfa(pendingToken: string, codeOrRecovery: string, userAgent: string): Promise<SessionIssue> {
    const result = await this.db.transaction(async (tx): Promise<SessionIssue | null> => {
      const pending = await tx.query<{ id: string; user_id: string; attempts: number; expires_at: Date; consumed_at: Date | null }>(
        "SELECT id, user_id, attempts, expires_at, consumed_at FROM auth_challenges WHERE token_hash = $1 AND kind = 'password_mfa' FOR UPDATE",
        [tokenHash(pendingToken)],
      );
      const challenge = pending.rows[0];
      if (!challenge || challenge.consumed_at || challenge.expires_at <= new Date() || challenge.attempts >= 5) return null;
      const row = await this.getTotpRow(tx, challenge.user_id, true);
      if (!row?.enabled_at) return null;
      let valid = false;
      const step = verifyTotpCode(decryptTotpSecret(row, this.requireTotpKey()), codeOrRecovery, row.last_used_step === null ? null : Number(row.last_used_step));
      if (step !== null) {
        const update = await tx.query<{ user_id: string }>(
          'UPDATE totp_credentials SET last_used_step = $2 WHERE user_id = $1 AND (last_used_step IS NULL OR last_used_step < $2) RETURNING user_id',
          [challenge.user_id, step],
        );
        valid = !!update.rows[0];
      } else {
        const used = await tx.query<{ code_hash: string }>(
          'UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING code_hash',
          [challenge.user_id, tokenHash(codeOrRecovery)],
        );
        valid = !!used.rows[0];
      }
      if (!valid) {
        await tx.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
        return null;
      }
      await tx.query('UPDATE auth_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);
      return this.issueSession(challenge.user_id, userAgent, 'password', tx);
    });
    if (!result) throw new Error('Invalid code');
    return result;
  }

  async regenerateRecoveryCodes(session: SessionPrincipal): Promise<string[]> {
    this.requireRecent(session);
    return this.db.transaction(async (tx) => {
      const row = await this.getTotpRow(tx, session.userId, true);
      if (!row?.enabled_at) throw new Error('Authenticator MFA is not enabled');
      const codes = await this.replaceRecoveryCodes(tx, session.userId);
      await this.event(session.userId, null, 'recovery_codes_regenerated', 'success', tx);
      return codes;
    });
  }

  async disableTotp(session: SessionPrincipal): Promise<void> {
    this.requireRecent(session);
    await this.db.transaction(async (tx) => {
      await tx.query('DELETE FROM recovery_codes WHERE user_id = $1', [session.userId]);
      await tx.query('DELETE FROM totp_credentials WHERE user_id = $1', [session.userId]);
      await this.event(session.userId, null, 'mfa_disabled', 'success', tx);
    });
  }

  async mfaStatus(userId: string): Promise<{ enabled: boolean; unusedRecoveryCodes: number }> {
    const row = await this.db.query<{ enabled: boolean; count: number }>(
      `SELECT EXISTS (SELECT 1 FROM totp_credentials WHERE user_id = $1 AND enabled_at IS NOT NULL) AS enabled,
              (SELECT count(*)::int FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL) AS count`, [userId],
    );
    return { enabled: row.rows[0]?.enabled ?? false, unusedRecoveryCodes: row.rows[0]?.count ?? 0 };
  }

  async beginPasskeyRegistration(session: SessionPrincipal): Promise<{ options: Awaited<ReturnType<typeof registrationOptions>>; challengeToken: string }> {
    this.requireRecent(session);
    const user = await this.users.findUserById(session.userId);
    if (!user) throw new Error('User not found');
    const existing = await this.db.query<{ id: string; transports: string[] }>(
      'SELECT id, transports FROM passkey_credentials WHERE user_id = $1', [session.userId],
    );
    const options = await registrationOptions({
      rpId: this.config.rpId, email: user.email, userId: user.id,
      excludeCredentials: existing.rows.map((row) => ({ id: row.id, transports: row.transports })),
    });
    const challengeToken = randomBytes(32).toString('base64url');
    await this.db.query(
      "INSERT INTO auth_challenges (id, token_hash, user_id, kind, challenge, expires_at) VALUES ($1, $2, $3, 'passkey_registration', $4, $5)",
      [randomUUID(), tokenHash(challengeToken), session.userId, options.challenge, new Date(Date.now() + 5 * 60 * 1000)],
    );
    return { options, challengeToken };
  }

  async finishPasskeyRegistration(session: SessionPrincipal, challengeToken: string, response: RegistrationResponseJSON, name: string): Promise<PasskeyView> {
    this.requireRecent(session);
    const safeName = this.passkeyName(name);
    const saved = await this.db.transaction(async (tx): Promise<PasskeyView | null> => {
      const result = await tx.query<{ id: string; user_id: string; challenge: string; expires_at: Date; consumed_at: Date | null; attempts: number }>(
        "SELECT id, user_id, challenge, expires_at, consumed_at, attempts FROM auth_challenges WHERE token_hash = $1 AND kind = 'passkey_registration' FOR UPDATE",
        [tokenHash(challengeToken)],
      );
      const challenge = result.rows[0];
      if (!challenge || challenge.user_id !== session.userId || challenge.consumed_at || challenge.expires_at <= new Date() || challenge.attempts >= 5) return null;
      try {
        const verified = await verifyRegistration({ response, challenge: challenge.challenge, origin: this.config.publicOrigin, rpId: this.config.rpId });
        if (!verified.verified || !verified.registrationInfo.userVerified) throw new Error('Unverified passkey');
        const credential = verified.registrationInfo.credential;
        const now = new Date();
        await tx.query(
          `INSERT INTO passkey_credentials (id, user_id, public_key, counter, transports, name, created_at)
           VALUES ($1, $2, decode($3, 'base64'), $4, $5::jsonb, $6, $7)`,
          [credential.id, session.userId, Buffer.from(credential.publicKey).toString('base64'), credential.counter, JSON.stringify(credential.transports ?? []), safeName, now],
        );
        await tx.query('UPDATE auth_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);
        await this.event(session.userId, null, 'passkey_added', 'success', tx);
        return { id: credential.id, name: safeName, createdAt: now, lastUsedAt: null };
      } catch {
        await tx.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
        return null;
      }
    });
    if (!saved) throw new Error('Invalid passkey response');
    return saved;
  }

  async beginPasskeyLogin(): Promise<{ options: Awaited<ReturnType<typeof authenticationOptions>>; challengeToken: string }> {
    const options = await authenticationOptions(this.config.rpId);
    const challengeToken = randomBytes(32).toString('base64url');
    await this.db.query(
      "INSERT INTO auth_challenges (id, token_hash, kind, challenge, expires_at) VALUES ($1, $2, 'passkey_login', $3, $4)",
      [randomUUID(), tokenHash(challengeToken), options.challenge, new Date(Date.now() + 5 * 60 * 1000)],
    );
    return { options, challengeToken };
  }

  async finishPasskeyLogin(challengeToken: string, response: AuthenticationResponseJSON, userAgent: string, ip = ''): Promise<SessionIssue> {
    const keys = [
      ...(response?.id ? [tokenHash(`passkey:credential:${response.id}`)] : []),
      ...(ip ? [tokenHash(`passkey:ip:${ip}`)] : []),
    ];
    await this.assertNotRateLimited(keys);
    const issue = await this.db.transaction(async (tx): Promise<SessionIssue | null> => {
      const result = await tx.query<{ id: string; challenge: string; expires_at: Date; consumed_at: Date | null; attempts: number }>(
        "SELECT id, challenge, expires_at, consumed_at, attempts FROM auth_challenges WHERE token_hash = $1 AND kind = 'passkey_login' FOR UPDATE",
        [tokenHash(challengeToken)],
      );
      const challenge = result.rows[0];
      if (!challenge || challenge.consumed_at || challenge.expires_at <= new Date() || challenge.attempts >= 5) return null;
      const credentialResult = await tx.query<{ id: string; user_id: string; public_key: string; counter: number; transports: string[] }>(
        "SELECT id, user_id, encode(public_key, 'base64') AS public_key, counter, transports FROM passkey_credentials WHERE id = $1 FOR UPDATE",
        [response?.id ?? ''],
      );
      const credential = credentialResult.rows[0];
      if (!credential) {
        await tx.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
        return null;
      }
      try {
        const verified = await verifyAuthentication({
          response, challenge: challenge.challenge, origin: this.config.publicOrigin, rpId: this.config.rpId,
          credential: { id: credential.id, publicKey: Buffer.from(credential.public_key, 'base64'), counter: Number(credential.counter), transports: credential.transports },
        });
        if (!verified.verified || !verified.authenticationInfo.userVerified) throw new Error('Unverified passkey');
        await tx.query('UPDATE passkey_credentials SET counter = $2, last_used_at = now() WHERE id = $1',
          [credential.id, verified.authenticationInfo.newCounter]);
        await tx.query('UPDATE auth_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);
        const session = await this.issueSession(credential.user_id, userAgent, 'passkey', tx);
        await this.event(credential.user_id, null, 'passkey_login', 'success', tx);
        return session;
      } catch {
        await tx.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
        return null;
      }
    });
    if (!issue) {
      await this.recordFailure(keys);
      await this.event(null, null, 'passkey_login', 'failure');
      throw new Error('Invalid passkey response');
    }
    return issue;
  }

  async beginPasskeyReauthentication(session: SessionPrincipal): Promise<{ options: Awaited<ReturnType<typeof authenticationOptions>>; challengeToken: string }> {
    const credentials = await this.db.query<{ id: string; transports: string[] }>(
      'SELECT id, transports FROM passkey_credentials WHERE user_id = $1', [session.userId],
    );
    if (!credentials.rows.length) throw new Error('No passkeys registered');
    const options = await authenticationOptions(this.config.rpId, credentials.rows);
    const challengeToken = randomBytes(32).toString('base64url');
    await this.db.query(
      "INSERT INTO auth_challenges (id, token_hash, user_id, session_id, kind, challenge, expires_at) VALUES ($1, $2, $3, $4, 'passkey_reauthentication', $5, $6)",
      [randomUUID(), tokenHash(challengeToken), session.userId, session.sessionId, options.challenge, new Date(Date.now() + 5 * 60 * 1000)],
    );
    return { options, challengeToken };
  }

  async finishPasskeyReauthentication(session: SessionPrincipal, challengeToken: string, response: AuthenticationResponseJSON): Promise<void> {
    const verified = await this.db.transaction(async (tx) => {
      const result = await tx.query<{ id: string; challenge: string; expires_at: Date; consumed_at: Date | null; attempts: number }>(
        "SELECT id, challenge, expires_at, consumed_at, attempts FROM auth_challenges WHERE token_hash = $1 AND kind = 'passkey_reauthentication' AND user_id = $2 AND session_id = $3 FOR UPDATE",
        [tokenHash(challengeToken), session.userId, session.sessionId],
      );
      const challenge = result.rows[0];
      if (!challenge || challenge.consumed_at || challenge.expires_at <= new Date() || challenge.attempts >= 5) return false;
      const found = await tx.query<{ id: string; public_key: string; counter: number; transports: string[] }>(
        "SELECT id, encode(public_key, 'base64') AS public_key, counter, transports FROM passkey_credentials WHERE id = $1 AND user_id = $2 FOR UPDATE",
        [response?.id ?? '', session.userId],
      );
      const credential = found.rows[0];
      if (!credential) {
        await tx.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
        return false;
      }
      try {
        const proof = await verifyAuthentication({
          response, challenge: challenge.challenge, origin: this.config.publicOrigin, rpId: this.config.rpId,
          credential: { id: credential.id, publicKey: Buffer.from(credential.public_key, 'base64'), counter: Number(credential.counter), transports: credential.transports },
        });
        if (!proof.verified || !proof.authenticationInfo.userVerified) throw new Error('Unverified passkey');
        await tx.query('UPDATE passkey_credentials SET counter = $2, last_used_at = now() WHERE id = $1',
          [credential.id, proof.authenticationInfo.newCounter]);
        const updated = await tx.query<{ id: string }>(
          'UPDATE sessions SET recent_auth_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL AND expires_at > now() AND idle_expires_at > now() RETURNING id',
          [session.sessionId, session.userId],
        );
        if (!updated.rows[0]) return false;
        await tx.query('UPDATE auth_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);
        await this.event(session.userId, null, 'passkey_reauthentication', 'success', tx);
        return true;
      } catch {
        await tx.query('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1', [challenge.id]);
        return false;
      }
    });
    if (!verified) throw new Error('Invalid passkey response');
  }

  async listPasskeys(userId: string): Promise<PasskeyView[]> {
    const result = await this.db.query<{ id: string; name: string; created_at: Date; last_used_at: Date | null }>(
      'SELECT id, name, created_at, last_used_at FROM passkey_credentials WHERE user_id = $1 ORDER BY created_at DESC', [userId],
    );
    return result.rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at }));
  }

  async renamePasskey(session: SessionPrincipal, credentialId: string, name: string): Promise<PasskeyView> {
    this.requireRecent(session);
    const result = await this.db.query<{ id: string; name: string; created_at: Date; last_used_at: Date | null }>(
      'UPDATE passkey_credentials SET name = $3 WHERE id = $1 AND user_id = $2 RETURNING id, name, created_at, last_used_at',
      [credentialId, session.userId, this.passkeyName(name)],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Passkey not found');
    return { id: row.id, name: row.name, createdAt: row.created_at, lastUsedAt: row.last_used_at };
  }

  async removePasskey(session: SessionPrincipal, credentialId: string): Promise<void> {
    this.requireRecent(session);
    const result = await this.db.query<{ id: string }>(
      'DELETE FROM passkey_credentials WHERE id = $1 AND user_id = $2 RETURNING id', [credentialId, session.userId],
    );
    if (!result.rows[0]) throw new Error('Passkey not found');
    await this.event(session.userId, null, 'passkey_removed', 'success');
  }

  private passkeyName(name: string): string {
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 100) throw new Error('Passkey name must be 1–100 characters');
    return trimmed;
  }

  async reauthenticatePassword(session: SessionPrincipal, password: string, codeOrRecovery?: string): Promise<void> {
    const user = await this.users.findUserById(session.userId);
    if (!user || !(await verifyPassword(password, user.passwordHash))) throw new Error('Invalid credentials');
    await this.db.transaction(async (tx) => {
      const row = await this.getTotpRow(tx, session.userId, true);
      if (row?.enabled_at) {
        if (!codeOrRecovery) throw new Error('Invalid code');
        const step = verifyTotpCode(decryptTotpSecret(row, this.requireTotpKey()), codeOrRecovery, row.last_used_step === null ? null : Number(row.last_used_step));
        if (step !== null) {
          await tx.query('UPDATE totp_credentials SET last_used_step = $2 WHERE user_id = $1', [session.userId, step]);
        } else {
          const consumed = await tx.query<{ code_hash: string }>(
            'UPDATE recovery_codes SET used_at = now() WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING code_hash',
            [session.userId, tokenHash(codeOrRecovery)],
          );
          if (!consumed.rows[0]) throw new Error('Invalid code');
        }
      }
      await tx.query('UPDATE sessions SET recent_auth_at = now() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL', [session.sessionId, session.userId]);
    });
  }

  private requireRecent(session: SessionPrincipal): void {
    if (!session.recentAuthAt || Date.now() - session.recentAuthAt.getTime() > 10 * 60 * 1000) {
      throw new Error('Recent authentication required');
    }
  }

  private requireTotpKey(): string {
    if (!this.config.totpEncryptionKey) throw new Error('TOTP encryption key is not configured');
    return this.config.totpEncryptionKey;
  }

  private async getTotpRow(db: DatabaseClient, userId: string, lock: boolean): Promise<({ ciphertext: string; iv: string; tag: string; enabled_at: Date | null; last_used_step: number | null }) | null> {
    const result = await db.query<{ ciphertext: string; iv: string; tag: string; enabled_at: Date | null; last_used_step: number | null }>(
      `SELECT encode(secret_ciphertext, 'base64') AS ciphertext, encode(secret_iv, 'base64') AS iv,
              encode(secret_tag, 'base64') AS tag, enabled_at, last_used_step
       FROM totp_credentials WHERE user_id = $1 ${lock ? 'FOR UPDATE' : ''}`, [userId],
    );
    return result.rows[0] ?? null;
  }

  private async replaceRecoveryCodes(db: DatabaseClient, userId: string): Promise<string[]> {
    await db.query('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
    const codes = Array.from({ length: 10 }, () => randomBytes(24).toString('base64url'));
    for (const code of codes) {
      await db.query('INSERT INTO recovery_codes (code_hash, user_id) VALUES ($1, $2)', [tokenHash(code), userId]);
    }
    return codes;
  }

  private async assertNotRateLimited(keys: string[]): Promise<void> {
    for (const key of keys) {
      const result = await this.db.query<{ window_started_at: Date }>(
        "SELECT window_started_at FROM auth_rate_limits WHERE key_hash = $1 AND attempts >= 5 AND window_started_at > now() - interval '15 minutes'",
        [key],
      );
      if (result.rows.length) {
        const retryAfterSeconds = Math.max(1, Math.ceil((result.rows[0]!.window_started_at.getTime() + 15 * 60 * 1000 - Date.now()) / 1000));
        throw new RateLimitError(retryAfterSeconds);
      }
    }
  }

  private async recordFailure(keys: string[]): Promise<void> {
    for (const key of keys) {
      await this.db.query(
        `INSERT INTO auth_rate_limits (key_hash, attempts, window_started_at) VALUES ($1, 1, now())
         ON CONFLICT (key_hash) DO UPDATE SET
           attempts = CASE WHEN auth_rate_limits.window_started_at < now() - interval '15 minutes' THEN 1 ELSE auth_rate_limits.attempts + 1 END,
           window_started_at = CASE WHEN auth_rate_limits.window_started_at < now() - interval '15 minutes' THEN now() ELSE auth_rate_limits.window_started_at END`,
        [key],
      );
    }
  }

  private async event(userId: string | null, attemptedEmail: string | null, action: string, outcome: string, db: DatabaseClient = this.db): Promise<void> {
    await db.query(
      'INSERT INTO security_events (id, user_id, attempted_email, action, outcome) VALUES ($1, $2, $3, $4, $5)',
      [randomUUID(), userId, attemptedEmail, action, outcome],
    );
  }
}

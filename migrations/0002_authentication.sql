-- Additive authentication migration. Existing sessions without token hashes are revoked.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS token_hash text;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_used_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS idle_expires_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent text NOT NULL DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS sign_in_method text NOT NULL DEFAULT 'password';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS recent_auth_at timestamptz;
UPDATE sessions SET revoked_at = now() WHERE token_hash IS NULL AND revoked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sessions_token_hash_unique ON sessions(token_hash) WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS sessions_user_active ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS totp_credentials (
  user_id text PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_ciphertext bytea NOT NULL,
  secret_iv bytea NOT NULL,
  secret_tag bytea NOT NULL,
  enabled_at timestamptz,
  last_used_step bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovery_codes (
  code_hash text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_codes_user_unused ON recovery_codes(user_id) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS passkey_credentials (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_key bytea NOT NULL,
  counter bigint NOT NULL DEFAULT 0 CHECK (counter >= 0),
  transports jsonb NOT NULL DEFAULT '[]'::jsonb,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
CREATE INDEX IF NOT EXISTS passkey_credentials_user ON passkey_credentials(user_id);

CREATE TABLE IF NOT EXISTS auth_challenges (
  id text PRIMARY KEY,
  token_hash text NOT NULL UNIQUE,
  user_id text REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('password_mfa', 'passkey_registration', 'passkey_login')),
  challenge text,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_challenges_expires ON auth_challenges(expires_at);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key_hash text PRIMARY KEY,
  attempts integer NOT NULL CHECK (attempts >= 0),
  window_started_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS security_events (
  id text PRIMARY KEY,
  user_id text REFERENCES users(id) ON DELETE SET NULL,
  attempted_email text,
  action text NOT NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS security_events_user_time ON security_events(user_id, created_at DESC);

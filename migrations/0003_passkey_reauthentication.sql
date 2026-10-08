-- Bind passkey reauthentication challenges to the session being refreshed.
ALTER TABLE auth_challenges ADD COLUMN IF NOT EXISTS session_id text REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE auth_challenges DROP CONSTRAINT IF EXISTS auth_challenges_kind_check;
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_kind_check
  CHECK (kind IN ('password_mfa', 'passkey_registration', 'passkey_login', 'passkey_reauthentication'));
CREATE INDEX IF NOT EXISTS auth_challenges_session_id ON auth_challenges(session_id) WHERE session_id IS NOT NULL;

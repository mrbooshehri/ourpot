-- Controlled onboarding and global administration state.
ALTER TABLE users ADD COLUMN IF NOT EXISTS system_role text NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_system_role_check;
ALTER TABLE users ADD CONSTRAINT users_system_role_check CHECK (system_role IN ('root_admin', 'user'));
CREATE UNIQUE INDEX IF NOT EXISTS one_root_admin ON users ((system_role)) WHERE system_role = 'root_admin';
CREATE INDEX IF NOT EXISTS users_active_login ON users(email) WHERE disabled_at IS NULL;

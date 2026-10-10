CREATE TABLE IF NOT EXISTS outbox_events (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  dedupe_key text NOT NULL,
  payload_json jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS outbox_unprocessed ON outbox_events(occurred_at) WHERE processed_at IS NULL;
CREATE TABLE IF NOT EXISTS notifications (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  recipient_user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  dedupe_key text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recipient_user_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS notifications_user_created ON notifications(recipient_user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS device_push_tokens (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('web', 'android', 'ios')),
  token text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (user_id, token)
);

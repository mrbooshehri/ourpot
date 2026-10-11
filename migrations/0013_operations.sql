CREATE TABLE IF NOT EXISTS backup_artifacts (
  id text PRIMARY KEY,
  file_name text NOT NULL,
  schema_version text NOT NULL,
  created_at timestamptz NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes >= 0)
);

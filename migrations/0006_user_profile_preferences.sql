-- User-facing labels and locale preferences are household-independent profile data.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_language text NOT NULL DEFAULT 'en';
ALTER TABLE users ADD CONSTRAINT users_preferred_language_check
  CHECK (preferred_language IN ('en', 'fa', 'ar'));

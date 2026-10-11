ALTER TABLE households ADD COLUMN IF NOT EXISTS currency_name text NOT NULL DEFAULT 'US Dollar';
ALTER TABLE households ADD COLUMN IF NOT EXISTS currency_icon text NOT NULL DEFAULT 'currency-dollar';

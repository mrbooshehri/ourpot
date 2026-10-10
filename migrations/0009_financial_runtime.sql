ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS transactions_household_active_date ON transactions(household_id, transaction_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS transactions_household_entrant ON transactions(household_id, entered_by);

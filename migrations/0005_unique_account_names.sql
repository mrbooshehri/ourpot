-- Account names identify an account within a household, independent of letter case.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_household_name_unique
  ON accounts (household_id, lower(btrim(name)));

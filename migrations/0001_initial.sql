-- Ourpot MVP PostgreSQL schema. All financial amounts are integer minor units.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
  id text PRIMARY KEY,
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE TABLE households (
  id text PRIMARY KEY,
  name text NOT NULL,
  currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE household_members (
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'member')),
  active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, user_id)
);
CREATE UNIQUE INDEX one_active_household_per_user ON household_members(user_id) WHERE active;
CREATE UNIQUE INDEX one_owner_per_household ON household_members(household_id) WHERE role = 'owner' AND active;
CREATE TABLE invitations (
  token text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  email citext NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'revoked', 'expired'))
);
CREATE TABLE accounts (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('checking', 'savings', 'cash', 'credit_card', 'loan')),
  opening_balance bigint NOT NULL CHECK (opening_balance >= 0),
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE categories (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  UNIQUE (household_id, name)
);
CREATE TABLE transactions (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  account_id text NOT NULL REFERENCES accounts(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  type text NOT NULL CHECK (type IN ('income', 'expense', 'adjustment', 'transfer')),
  category_id text REFERENCES categories(id),
  description text NOT NULL,
  transaction_date date NOT NULL,
  entered_by text NOT NULL REFERENCES users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE transfer_pairs (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  source_account_id text NOT NULL REFERENCES accounts(id),
  destination_account_id text NOT NULL REFERENCES accounts(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  description text NOT NULL,
  created_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (source_account_id <> destination_account_id)
);
CREATE TABLE budget_proposals (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  category_id text NOT NULL REFERENCES categories(id),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  period char(7) NOT NULL CHECK (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  rationale text NOT NULL,
  proposer_id text NOT NULL REFERENCES users(id),
  status text NOT NULL CHECK (status IN ('proposed', 'discussed', 'agreed', 'rejected', 'withdrawn')),
  revision_of text REFERENCES budget_proposals(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE budget_agreements (
  budget_id text NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  agreed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, user_id)
);
CREATE TABLE budget_comments (
  id text PRIMARY KEY,
  budget_id text NOT NULL REFERENCES budget_proposals(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE savings_goals (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount_minor bigint NOT NULL CHECK (target_amount_minor > 0),
  status text NOT NULL CHECK (status IN ('active', 'complete')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE goal_contributions (
  id text PRIMARY KEY,
  goal_id text NOT NULL REFERENCES savings_goals(id) ON DELETE CASCADE,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  note text NOT NULL,
  entered_by text NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE wishlist_items (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  estimated_cost_minor bigint NOT NULL CHECK (estimated_cost_minor > 0),
  status text NOT NULL CHECK (status IN ('open', 'converted'))
);
CREATE TABLE financial_tasks (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  title text NOT NULL,
  assignee_id text NOT NULL REFERENCES users(id),
  due_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'done', 'dismissed')),
  completed_by text REFERENCES users(id),
  completed_at timestamptz
);
CREATE TABLE subscriptions (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  name text NOT NULL,
  price_minor bigint NOT NULL CHECK (price_minor > 0),
  cadence text NOT NULL CHECK (cadence IN ('monthly', 'yearly')),
  next_renewal_date date NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'cancelled'))
);
CREATE TABLE reminders (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  subscription_id text NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  renewal_date date NOT NULL,
  lead_days integer NOT NULL CHECK (lead_days IN (30, 7)),
  recipient_user_id text NOT NULL REFERENCES users(id),
  UNIQUE (subscription_id, renewal_date, lead_days, recipient_user_id)
);
CREATE TABLE audit_events (
  id text PRIMARY KEY,
  household_id text NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  actor_user_id text NOT NULL REFERENCES users(id),
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transactions_household_date ON transactions(household_id, transaction_date);
CREATE INDEX subscriptions_household_renewal ON subscriptions(household_id, next_renewal_date);
CREATE INDEX audit_household_created ON audit_events(household_id, created_at);

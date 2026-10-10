CREATE TABLE IF NOT EXISTS notification_rules (
  household_id text PRIMARY KEY REFERENCES households(id) ON DELETE CASCADE,
  subscription_reminders boolean NOT NULL DEFAULT true,
  budget_warning_percent integer CHECK (budget_warning_percent IS NULL OR budget_warning_percent BETWEEN 1 AND 100),
  task_due_reminders boolean NOT NULL DEFAULT true,
  notify_both_partners boolean NOT NULL DEFAULT true,
  updated_by text REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

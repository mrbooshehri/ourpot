CREATE INDEX IF NOT EXISTS budget_household_period ON budget_proposals(household_id, period);
CREATE INDEX IF NOT EXISTS goals_household ON savings_goals(household_id);
CREATE INDEX IF NOT EXISTS tasks_household_due ON financial_tasks(household_id, due_date);

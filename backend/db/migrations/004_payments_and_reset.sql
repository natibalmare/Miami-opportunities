-- 004: columns needed by the Investor / Pro / Business payment flow and password recovery.
-- Safe to run more than once.

-- Where a report unlock came from: 'stripe' (single $15), 'membership' (plan allowance), 'overage'
ALTER TABLE report_purchases ADD COLUMN IF NOT EXISTS source TEXT;
CREATE INDEX IF NOT EXISTS idx_report_purchases_user_folio ON report_purchases(user_id, folio);
CREATE INDEX IF NOT EXISTS idx_report_purchases_session ON report_purchases(stripe_session_id);

-- One usage window per user per start date (prevents duplicate windows from repeated webhooks)
CREATE UNIQUE INDEX IF NOT EXISTS uq_usage_periods_user_start ON usage_periods(user_id, period_start);

-- Subscriptions: keep updated_at available for webhook updates
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Password recovery
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_attempts INTEGER NOT NULL DEFAULT 0;

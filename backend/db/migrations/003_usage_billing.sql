-- Extend subscriptions to track billing interval, seats, and the real Stripe price used.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS billing_interval TEXT;       -- 'month' | 'year'
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS seats_total INTEGER NOT NULL DEFAULT 1;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;

-- Internal usage windows — the source of truth for "how many reports has this user used."
-- For monthly plans this lines up 1:1 with the Stripe billing period.
-- For annual plans, Stripe only bills once a year, so a cron job (Phase 3) creates a
-- new row here every month on the subscription's monthly anniversary.
CREATE TABLE IF NOT EXISTS usage_periods (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES users(id) NOT NULL,
  plan              TEXT NOT NULL,               -- 'investor' | 'pro' | 'business'
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  reports_included  INTEGER NOT NULL,
  reports_used      INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_usage_periods_user ON usage_periods(user_id, period_start DESC);

-- One-time overage report purchases (Investor $3.99 / Pro $2.49 / Business $1.99 per report)
CREATE TABLE IF NOT EXISTS overage_purchases (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID REFERENCES users(id) NOT NULL,
  usage_period_id  UUID REFERENCES usage_periods(id),
  folio            TEXT,
  amount           NUMERIC NOT NULL,
  stripe_session_id TEXT UNIQUE,
  status           TEXT DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_overage_user ON overage_purchases(user_id);

-- Team seats for Pro (2) and Business (5). account_owner_id is whoever holds the subscription.
CREATE TABLE IF NOT EXISTS team_members (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_owner_id UUID REFERENCES users(id) NOT NULL,
  member_user_id   UUID REFERENCES users(id) NOT NULL,
  role             TEXT DEFAULT 'member',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(account_owner_id, member_user_id)
);
CREATE INDEX IF NOT EXISTS idx_team_owner ON team_members(account_owner_id);

-- Backfill: no real subscribers exist yet (confirmed 0 active subs in Stripe), so this is a no-op
-- safety net only, in case any test signups exist with the old plan values.
UPDATE users SET plan = 'free' WHERE plan IN ('member', 'gold', 'basic', 'pro') 
  AND id NOT IN (SELECT user_id FROM subscriptions WHERE status = 'active');

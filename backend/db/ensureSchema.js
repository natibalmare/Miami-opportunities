const fs = require('fs')
const path = require('path')
const { query } = require('./pool')

/* Adds tables and columns the app needs if they are missing.
   Runs automatically every time the backend starts. Safe to run more than once. */
async function ensureSchema() {
  const statements = [
    // Password recovery
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_code TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_attempts INTEGER NOT NULL DEFAULT 0`,
    // One active login per account
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS session_id TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip TEXT`,

    // County property records (Florida Department of Revenue tax roll + county enrichments)
    `CREATE TABLE IF NOT EXISTS parcels (
       county_no      SMALLINT NOT NULL,
       parcel_id      TEXT NOT NULL,
       phy_addr1      TEXT,
       phy_city       TEXT,
       phy_zip        TEXT,
       own_name       TEXT,
       own_addr1      TEXT,
       own_city       TEXT,
       own_state      TEXT,
       own_zip        TEXT,
       dor_uc         SMALLINT,
       just_value     BIGINT,
       land_sqft      INTEGER,
       living_sqft    INTEGER,
       year_built     SMALLINT,
       eff_year_built SMALLINT,
       res_units      INTEGER,
       buildings      INTEGER,
       homestead      BOOLEAN,
       absentee       BOOLEAN,
       sale_price1    BIGINT,
       sale_date1     DATE,
       sale_qual1     TEXT,
       sale_price2    BIGINT,
       sale_date2     DATE,
       beds           SMALLINT,
       baths          NUMERIC(4,1),
       subdivision    TEXT,
       roll_year      SMALLINT,
       roll_type      TEXT,
       import_id      INTEGER,
       updated_at     TIMESTAMPTZ DEFAULT NOW(),
       PRIMARY KEY (county_no, parcel_id)
     )`,
    // Very large parcels (e.g. agricultural land) exceed the normal integer range
    `ALTER TABLE parcels ALTER COLUMN land_sqft TYPE BIGINT`,
    `ALTER TABLE parcels ALTER COLUMN living_sqft TYPE BIGINT`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_zip ON parcels (county_no, phy_zip)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_city ON parcels (county_no, phy_city)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_use ON parcels (county_no, dor_uc)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_living ON parcels (living_sqft)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_value ON parcels (just_value)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_sale ON parcels (sale_date1)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_addr ON parcels (phy_addr1 text_pattern_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_owner ON parcels (own_name text_pattern_ops)`,

    // One map point per parcel (from the state parcel map files)
    `CREATE TABLE IF NOT EXISTS parcel_points (
       county_no  SMALLINT NOT NULL,
       parcel_id  TEXT NOT NULL,
       lat        REAL NOT NULL,
       lng        REAL NOT NULL,
       import_id  INTEGER,
       PRIMARY KEY (county_no, parcel_id)
     )`,
    `CREATE INDEX IF NOT EXISTS idx_parcel_points_latlng ON parcel_points (lat, lng)`,

    // History of each county load, so the app knows what is loaded and when
    `CREATE TABLE IF NOT EXISTS data_imports (
       id          SERIAL PRIMARY KEY,
       county_no   SMALLINT NOT NULL,
       source      TEXT NOT NULL,
       file_name   TEXT,
       file_modified TIMESTAMPTZ,
       status      TEXT NOT NULL DEFAULT 'running',
       rows_loaded INTEGER DEFAULT 0,
       error       TEXT,
       started_at  TIMESTAMPTZ DEFAULT NOW(),
       finished_at TIMESTAMPTZ
     )`,

    // Marketing preferences (email opt-out, SMS opt-in with consent record)
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opt_out BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_opt_in BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_opt_in_at TIMESTAMPTZ`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_opt_in_ip TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS license_number TEXT`,
    `ALTER TABLE users ADD COLUMN IF NOT EXISTS brokerage TEXT`,

    // Buyer / Seller board — FSBO property posts and buyer "wanted" posts
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS listing_type TEXT NOT NULL DEFAULT 'buyer'`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS title TEXT`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS address TEXT`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS city TEXT`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS zip TEXT`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS price BIGINT`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS beds SMALLINT`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS baths NUMERIC(4,1)`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS living_sqft INTEGER`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS property_type TEXT`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS agents_ok BOOLEAN NOT NULL DEFAULT true`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active'`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`,
    `CREATE INDEX IF NOT EXISTS idx_board_status ON board_listings (status, listing_type, created_at DESC)`,
    /* Did the seller find a buyer (or the buyer a home) through MO? */
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS outcome TEXT`,
    `ALTER TABLE board_listings ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ`,

    // In-app messages (contact details stay private)
    `CREATE TABLE IF NOT EXISTS conversations (
       id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       listing_id  UUID REFERENCES board_listings(id) ON DELETE SET NULL,
       starter_id  UUID REFERENCES users(id),
       owner_id    UUID REFERENCES users(id),
       last_message_at TIMESTAMPTZ DEFAULT NOW(),
       created_at  TIMESTAMPTZ DEFAULT NOW(),
       UNIQUE (listing_id, starter_id)
     )`,
    `CREATE TABLE IF NOT EXISTS messages (
       id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
       sender_id       UUID REFERENCES users(id),
       body            TEXT NOT NULL,
       read_at         TIMESTAMPTZ,
       created_at      TIMESTAMPTZ DEFAULT NOW()
     )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conversation_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_conv_users ON conversations (starter_id, owner_id)`,

    // Owner settings (e.g. mailing address shown in marketing emails)
    `CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`,

    // Email / text campaigns sent by the owner
    `CREATE TABLE IF NOT EXISTS campaigns (
       id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
       channel     TEXT NOT NULL,
       audience    TEXT NOT NULL,
       subject     TEXT,
       body        TEXT NOT NULL,
       recipients  INTEGER DEFAULT 0,
       sent        INTEGER DEFAULT 0,
       failed      INTEGER DEFAULT 0,
       created_by  UUID,
       created_at  TIMESTAMPTZ DEFAULT NOW()
     )`,
  ]
  /* Emergency cleanup: set DATA_RESET=parcels on Railway to empty the county property table and free disk space */
  if (process.env.DATA_RESET === 'parcels') {
    try {
      await query('TRUNCATE parcels')
      await query("UPDATE data_imports SET status='failed', error='Reset', finished_at=NOW() WHERE status='running'")
      console.log('[data] county property table emptied (DATA_RESET=parcels)')
    } catch (e) {
      console.error('[data] reset failed:', e.message)
    }
  }

  /* Billing and password-recovery migrations — written to be safe to run every start */
  for (const file of ['003_usage_billing.sql', '004_payments_and_reset.sql']) {
    try {
      await query(fs.readFileSync(path.join(__dirname, 'migrations', file), 'utf8'))
    } catch (e) {
      console.error(`Migration ${file} failed:`, e.message)
    }
  }

  for (const sql of statements) {
    try {
      await query(sql)
    } catch (e) {
      console.error('Schema update failed:', sql.slice(0, 80), e.message)
    }
  }
  console.log('Database tables ready')
}

module.exports = { ensureSchema }

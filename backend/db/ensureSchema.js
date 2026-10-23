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
    `CREATE INDEX IF NOT EXISTS idx_parcels_zip ON parcels (county_no, phy_zip)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_city ON parcels (county_no, phy_city)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_use ON parcels (county_no, dor_uc)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_living ON parcels (living_sqft)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_value ON parcels (just_value)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_sale ON parcels (sale_date1)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_addr ON parcels (phy_addr1 text_pattern_ops)`,
    `CREATE INDEX IF NOT EXISTS idx_parcels_owner ON parcels (own_name text_pattern_ops)`,

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

const { query } = require('./pool')

/* Adds the account-security columns if they are missing.
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
  ]
  for (const sql of statements) {
    try {
      await query(sql)
    } catch (e) {
      console.error('Schema update failed:', sql, e.message)
    }
  }
  console.log('Account security columns ready')
}

module.exports = { ensureSchema }

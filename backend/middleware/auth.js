const jwt = require('jsonwebtoken')
const { query } = require('../db/pool')

const REPLACED = {
  error: 'Your account was signed in on another device. Please sign in again.',
  code: 'SESSION_REPLACED',
}

/* Checks that this login is still the account's active login.
   A newer sign-in on another device replaces the older one. */
async function activeSession(payload) {
  if (!payload?.id || !payload?.sid) return false
  const r = await query('SELECT session_id FROM users WHERE id = $1', [payload.id])
  return !!r.rows[0] && r.rows[0].session_id === payload.sid
}

module.exports.requireAuth = async (req, res, next) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization required' })

  let payload
  try {
    payload = jwt.verify(h.slice(7), process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  try {
    if (!(await activeSession(payload))) return res.status(401).json(REPLACED)
  } catch (e) {
    console.error('Session check failed:', e.message)
    return res.status(500).json({ error: 'Could not verify your session' })
  }

  req.user = payload
  next()
}

/* Signed-in visitors get their account; guests continue as guests.
   A login that was replaced by a newer sign-in is told to sign in again. */
module.exports.optionalAuth = async (req, res, next) => {
  const h = req.headers.authorization
  if (!h?.startsWith('Bearer ')) return next()

  let payload
  try {
    payload = jwt.verify(h.slice(7), process.env.JWT_SECRET)
  } catch {
    return next()
  }

  try {
    if (!(await activeSession(payload))) return res.status(401).json(REPLACED)
  } catch (e) {
    console.error('Session check failed:', e.message)
    return next()
  }

  req.user = payload
  next()
}

/* Only MO administrators (ADMIN_EMAILS on Railway) */
module.exports.requireAdmin = (req, res, next) => {
  module.exports.requireAuth(req, res, () => {
    const admins = String(process.env.ADMIN_EMAILS || 'natibalma@gmail.com').toLowerCase().split(',').map(s => s.trim())
    if (!admins.includes(String(req.user?.email || '').toLowerCase())) return res.status(403).json({ error: 'Not available' })
    next()
  })
}

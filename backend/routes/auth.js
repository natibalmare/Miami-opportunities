const router  = require('express').Router()
const crypto  = require('crypto')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer')

const RESET_MINUTES = 15
const RESET_MAX_ATTEMPTS = 5

const sign = (user, sid) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, plan: user.plan, sid },
  process.env.JWT_SECRET,
  { expiresIn: '30d' }
)

const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex')

const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || null

/* Starts a new login. Any older login on another device stops working. */
async function startSession(req, userId) {
  const sid = crypto.randomUUID()
  await query(
    'UPDATE users SET session_id=$1, last_login_at=NOW(), last_login_ip=$2 WHERE id=$3',
    [sid, clientIp(req), userId]
  )
  return sid
}

const adminEmails = () => String(process.env.ADMIN_EMAILS || 'natibalma@gmail.com').toLowerCase().split(',').map(s => s.trim()).filter(Boolean)
const isAdmin = (email) => adminEmails().includes(String(email || '').toLowerCase())

const publicUser = (user) => ({
  id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, plan: user.plan,
  isAdmin: isAdmin(user.email),
})

/* POST /api/auth/register */
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, role = 'buyer', needsAgent = true } = req.body
    if (!email || !password || !firstName || !lastName)
      return res.status(400).json({ error: 'Required: email, password, firstName, lastName' })
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' })

    const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()])
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' })

    const hash = await bcrypt.hash(password, 12)
    const code = crypto.randomInt(100000, 1000000).toString()
    const expires = new Date(Date.now() + 10 * 60 * 1000)

    const result = await query(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, needs_agent, email_verify_code, email_verify_expires)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, email, first_name, last_name, phone, role, plan`,
      [email.toLowerCase(), hash, firstName, lastName, phone || null, role, needsAgent, code, expires]
    )
    const user = result.rows[0]
    const u = publicUser(user)
    const sid = await startSession(req, user.id)

    sendVerificationEmail(user.email, user.first_name, code).catch(() => {})

    res.status(201).json({ user: u, token: sign(u, sid), needsVerification: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Registration failed' })
  }
})

/* POST /api/auth/login */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' })

    const result = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()])
    const user = result.rows[0]
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(401).json({ error: 'Invalid email or password' })

    const u = publicUser(user)
    const sid = await startSession(req, user.id)
    res.json({ user: u, token: sign(u, sid) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Login failed' })
  }
})

/* POST /api/auth/logout — ends the active login */
router.post('/logout', requireAuth, async (req, res) => {
  try {
    await query('UPDATE users SET session_id=NULL WHERE id=$1 AND session_id=$2', [req.user.id, req.user.sid])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Logout failed' })
  }
})

/* POST /api/auth/forgot-password — emails a 6-digit reset code */
router.post('/forgot-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    if (!email) return res.status(400).json({ error: 'Email required' })

    const r = await query('SELECT id, first_name FROM users WHERE email = $1', [email])
    const user = r.rows[0]
    if (user) {
      const code = crypto.randomInt(100000, 1000000).toString()
      const expires = new Date(Date.now() + RESET_MINUTES * 60 * 1000)
      await query(
        'UPDATE users SET reset_code=$1, reset_expires=$2, reset_attempts=0 WHERE id=$3',
        [hashCode(code), expires, user.id]
      )
      sendPasswordResetEmail(email, user.first_name, code).catch(() => {})
    }

    /* Same answer whether or not the email exists, so accounts can't be guessed */
    res.json({ success: true, message: 'If that email has an account, a reset code is on its way.' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Could not send reset code' })
  }
})

/* POST /api/auth/reset-password — checks the code, sets the new password, signs in */
router.post('/reset-password', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase()
    const code = String(req.body.code || '').trim()
    const password = String(req.body.password || '')
    if (!email || !code || !password) return res.status(400).json({ error: 'Email, code and new password required' })
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

    const r = await query('SELECT * FROM users WHERE email = $1', [email])
    const user = r.rows[0]
    const invalid = { error: 'Incorrect or expired code. Request a new one.' }
    if (!user || !user.reset_code || !user.reset_expires) return res.status(400).json(invalid)

    if (new Date(user.reset_expires) < new Date() || user.reset_attempts >= RESET_MAX_ATTEMPTS) {
      await query('UPDATE users SET reset_code=NULL, reset_expires=NULL WHERE id=$1', [user.id])
      return res.status(400).json(invalid)
    }

    if (hashCode(code) !== user.reset_code) {
      await query('UPDATE users SET reset_attempts = reset_attempts + 1 WHERE id=$1', [user.id])
      return res.status(400).json({ error: 'Incorrect code' })
    }

    const hash = await bcrypt.hash(password, 12)
    await query(
      `UPDATE users SET password=$1, reset_code=NULL, reset_expires=NULL, reset_attempts=0,
              email_verified=true, updated_at=NOW()
       WHERE id=$2`,
      [hash, user.id]
    )

    const u = publicUser(user)
    const sid = await startSession(req, user.id)
    res.json({ user: u, token: sign(u, sid) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Password reset failed' })
  }
})

/* GET /api/auth/me */
router.get('/me', requireAuth, async (req, res) => {
  try {
    const r = await query(
      'SELECT id, email, first_name, last_name, phone, role, plan, email_verified FROM users WHERE id = $1',
      [req.user.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    const u = r.rows[0]
    res.json({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, phone: u.phone, role: u.role, plan: u.plan, emailVerified: u.email_verified, isAdmin: isAdmin(u.email) })
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

/* PATCH /api/auth/profile */
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const { firstName, lastName, phone } = req.body
    await query(
      'UPDATE users SET first_name=$1, last_name=$2, phone=$3, updated_at=NOW() WHERE id=$4',
      [firstName, lastName, phone, req.user.id]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Update failed' })
  }
})

/* POST /api/auth/verify-email */
router.post('/verify-email', requireAuth, async (req, res) => {
  try {
    const { code } = req.body
    if (!code) return res.status(400).json({ error: 'Code required' })

    const r = await query('SELECT email_verify_code, email_verify_expires FROM users WHERE id = $1', [req.user.id])
    const u = r.rows[0]
    if (!u) return res.status(404).json({ error: 'User not found' })
    if (!u.email_verify_code || new Date(u.email_verify_expires) < new Date())
      return res.status(400).json({ error: 'Code expired. Request a new one.' })
    if (u.email_verify_code !== code)
      return res.status(400).json({ error: 'Incorrect code' })

    await query(
      'UPDATE users SET email_verified = true, email_verify_code = NULL, email_verify_expires = NULL WHERE id = $1',
      [req.user.id]
    )
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Verification failed' })
  }
})

/* POST /api/auth/resend-code */
router.post('/resend-code', requireAuth, async (req, res) => {
  try {
    const r = await query('SELECT email, first_name FROM users WHERE id = $1', [req.user.id])
    const u = r.rows[0]
    if (!u) return res.status(404).json({ error: 'User not found' })

    const code = crypto.randomInt(100000, 1000000).toString()
    const expires = new Date(Date.now() + 10 * 60 * 1000)
    await query('UPDATE users SET email_verify_code = $1, email_verify_expires = $2 WHERE id = $3', [code, expires, req.user.id])
    sendVerificationEmail(u.email, u.first_name, code).catch(() => {})
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Failed to resend code' })
  }
})

module.exports = router
module.exports.isAdmin = isAdmin

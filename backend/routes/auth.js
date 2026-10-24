const router  = require('express').Router()
const crypto  = require('crypto')
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer')

const ROLES = ['buyer', 'seller', 'agent']
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
    const { email, password, firstName, lastName, phone, role = 'buyer', needsAgent = true, smsOptIn = false } = req.body
    const safeRole = ROLES.includes(role) ? role : 'buyer'
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
      `INSERT INTO users (email, password, first_name, last_name, phone, role, needs_agent, email_verify_code, email_verify_expires,
                          sms_opt_in, sms_opt_in_at, sms_opt_in_ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, email, first_name, last_name, phone, role, plan`,
      [email.toLowerCase(), hash, firstName, lastName, phone || null, safeRole, needsAgent, code, expires,
       !!(smsOptIn && phone), smsOptIn && phone ? new Date() : null, smsOptIn && phone ? clientIp(req) : null]
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
      'SELECT id, email, first_name, last_name, phone, role, plan, email_verified, sms_opt_in, email_opt_out, license_number, brokerage FROM users WHERE id = $1',
      [req.user.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    const u = r.rows[0]
    res.json({
      id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, phone: u.phone, role: u.role, plan: u.plan,
      emailVerified: u.email_verified, isAdmin: isAdmin(u.email),
      smsOptIn: u.sms_opt_in, emailOptOut: u.email_opt_out, licenseNumber: u.license_number, brokerage: u.brokerage,
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch user' })
  }
})

/* PATCH /api/auth/profile — name, phone, role, agent details, message preferences */
router.patch('/profile', requireAuth, async (req, res) => {
  try {
    const cur = (await query('SELECT first_name, last_name, phone, role, sms_opt_in, email_opt_out, license_number, brokerage FROM users WHERE id=$1', [req.user.id])).rows[0]
    if (!cur) return res.status(404).json({ error: 'User not found' })
    const b = req.body
    const txt = (v, old, max = 80) => v === undefined ? old : (String(v).trim().slice(0, max) || null)
    const firstName = txt(b.firstName, cur.first_name), lastName = txt(b.lastName, cur.last_name)
    if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required' })
    const phone = txt(b.phone, cur.phone, 30)
    const role = ROLES.includes(b.role) ? b.role : cur.role
    const smsOptIn = b.smsOptIn === undefined ? cur.sms_opt_in : !!(b.smsOptIn && phone)
    const newlyOptedIn = smsOptIn && !cur.sms_opt_in
    await query(
      `UPDATE users SET first_name=$1, last_name=$2, phone=$3, role=$4, license_number=$5, brokerage=$6,
              email_opt_out=$7, sms_opt_in=$8,
              sms_opt_in_at = CASE WHEN $9 THEN NOW() WHEN $8 THEN sms_opt_in_at ELSE NULL END,
              sms_opt_in_ip = CASE WHEN $9 THEN $10 WHEN $8 THEN sms_opt_in_ip ELSE NULL END,
              updated_at=NOW()
        WHERE id=$11`,
      [firstName, lastName, phone, role, txt(b.licenseNumber, cur.license_number, 30), txt(b.brokerage, cur.brokerage, 120),
       b.emailOptOut === undefined ? cur.email_opt_out : !!b.emailOptOut, smsOptIn, newlyOptedIn, clientIp(req), req.user.id])
    res.json({ success: true })
  } catch (e) {
    console.error('Profile update failed:', e.message)
    res.status(500).json({ error: 'Update failed' })
  }
})

/* GET|POST /api/auth/unsubscribe?u=&t= — one-click email unsubscribe link */
async function unsubscribe(req, res) {
  const u = String(req.query.u || ''), t = String(req.query.t || '')
  const expected = crypto.createHmac('sha256', process.env.JWT_SECRET || 'mo').update(`unsub:${u}`).digest('hex').slice(0, 32)
  const ok = /^[0-9a-f-]{36}$/i.test(u) && t.length === 32 && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(expected))
  if (ok) await query('UPDATE users SET email_opt_out=true, updated_at=NOW() WHERE id=$1', [u]).catch(() => {})
  if (req.method === 'POST') return res.status(ok ? 200 : 400).end()
  const site = (process.env.FRONTEND_URL || 'https://miamiopportunities.com').replace(/\/$/, '')
  res.set('Content-Type', 'text/html').send(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:460px;margin:80px auto;padding:0 20px;text-align:center;color:#1A2828">
      <div style="font-size:22px;letter-spacing:4px;color:#0A3D3A">MIAMI</div><div style="font-size:11px;letter-spacing:3px;color:#C4A46B;margin-bottom:28px">OPPORTUNITIES</div>
      <p style="font-size:16px">${ok ? 'You are unsubscribed from Miami Opportunities marketing emails.' : 'This unsubscribe link is not valid.'}</p>
      <p style="font-size:13px;color:#5A6A69">You will still receive account emails such as sign-in codes and receipts. You can change this anytime in My Account.</p>
      <p><a href="${site}" style="color:#A88C38">Back to Miami Opportunities</a></p></div>`)
}
router.get('/unsubscribe', unsubscribe)
router.post('/unsubscribe', unsubscribe)

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

const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')
const { sendVerificationEmail } = require('../utils/mailer')

const sign = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role, plan: user.plan },
  process.env.JWT_SECRET,
  { expiresIn: '30d' }
)

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
    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = new Date(Date.now() + 10 * 60 * 1000)

    const result = await query(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, needs_agent, email_verify_code, email_verify_expires)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, email, first_name, last_name, phone, role, plan`,
      [email.toLowerCase(), hash, firstName, lastName, phone || null, role, needsAgent, code, expires]
    )
    const user = result.rows[0]
    const u = { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, plan: user.plan }

    sendVerificationEmail(user.email, user.first_name, code).catch(() => {})

    res.status(201).json({ user: u, token: sign(u), needsVerification: true })
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

    const u = { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, plan: user.plan }
    res.json({ user: u, token: sign(u) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Login failed' })
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
    res.json({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, phone: u.phone, role: u.role, plan: u.plan, emailVerified: u.email_verified })
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

    const code = Math.floor(100000 + Math.random() * 900000).toString()
    const expires = new Date(Date.now() + 10 * 60 * 1000)
    await query('UPDATE users SET email_verify_code = $1, email_verify_expires = $2 WHERE id = $3', [code, expires, req.user.id])
    sendVerificationEmail(u.email, u.first_name, code).catch(() => {})
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Failed to resend code' })
  }
})

module.exports = router

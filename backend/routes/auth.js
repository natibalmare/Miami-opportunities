const router  = require('express').Router()
const bcrypt  = require('bcryptjs')
const jwt     = require('jsonwebtoken')
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')

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
    const result = await query(
      `INSERT INTO users (email, password, first_name, last_name, phone, role, needs_agent)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, email, first_name, last_name, phone, role, plan`,
      [email.toLowerCase(), hash, firstName, lastName, phone || null, role, needsAgent]
    )
    const user = result.rows[0]
    const u = { id: user.id, email: user.email, firstName: user.first_name, lastName: user.last_name, role: user.role, plan: user.plan }
    res.status(201).json({ user: u, token: sign(u) })
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
      'SELECT id, email, first_name, last_name, phone, role, plan FROM users WHERE id = $1',
      [req.user.id]
    )
    if (!r.rows.length) return res.status(404).json({ error: 'User not found' })
    const u = r.rows[0]
    res.json({ id: u.id, email: u.email, firstName: u.first_name, lastName: u.last_name, phone: u.phone, role: u.role, plan: u.plan })
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

module.exports = router

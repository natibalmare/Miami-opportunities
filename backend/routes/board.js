const router = require('express').Router()
const { query } = require('../db/pool')
const { requireAuth, optionalAuth } = require('../middleware/auth')

/* GET /api/board — contact info gated by auth */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT id, role, has_agent, target_area, budget, message,
              CASE WHEN $1 THEN show_phone ELSE false END as show_phone,
              CASE WHEN $1 THEN show_email ELSE false END as show_email,
              CASE WHEN $1 THEN u.first_name || ' ' || u.last_name ELSE 'Sign in to view' END as name,
              CASE WHEN $1 AND show_phone THEN u.phone ELSE null END as phone,
              CASE WHEN $1 AND show_email THEN u.email ELSE null END as email,
              b.created_at
       FROM board_listings b
       JOIN users u ON u.id = b.user_id
       WHERE b.active = true
       ORDER BY b.created_at DESC`,
      [!!req.user]
    )
    res.json(r.rows)
  } catch (e) {
    res.status(500).json({ error: 'Board fetch failed' })
  }
})

/* POST /api/board */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { role, hasAgent, targetArea, budget, message, showPhone, showEmail } = req.body
    await query(
      `INSERT INTO board_listings (user_id, role, has_agent, target_area, budget, message, show_phone, show_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [req.user.id, role, hasAgent, targetArea, budget, message, showPhone ?? true, showEmail ?? true]
    )
    res.status(201).json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Post failed' })
  }
})

module.exports = router

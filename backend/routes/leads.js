const router = require('express').Router()
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')

/* GET /api/leads */
router.get('/', requireAuth, async (req, res) => {
  try {
    const r = await query(
      `SELECT l.*, p.address, p.city, p.neighborhood, p.opportunity_score, p.financeability
       FROM leads l
       LEFT JOIN properties p ON p.folio = l.folio
       WHERE l.user_id = $1
       ORDER BY l.updated_at DESC`,
      [req.user.id]
    )
    res.json(r.rows)
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch leads' })
  }
})

/* POST /api/leads */
router.post('/', requireAuth, async (req, res) => {
  try {
    const { folio, address, status = 'new', tags = [], notes = [] } = req.body
    const r = await query(
      `INSERT INTO leads (user_id, folio, address, status, tags, notes)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.user.id, folio, address, status, tags, JSON.stringify(notes)]
    )
    res.status(201).json(r.rows[0])
  } catch (e) {
    res.status(500).json({ error: 'Failed to save lead' })
  }
})

/* PATCH /api/leads/:id */
router.patch('/:id', requireAuth, async (req, res) => {
  try {
    const { status, tags, reminder_date } = req.body
    await query(
      `UPDATE leads SET status=COALESCE($1,status), tags=COALESCE($2,tags),
       reminder_date=COALESCE($3,reminder_date), updated_at=NOW()
       WHERE id=$4 AND user_id=$5`,
      [status, tags, reminder_date, req.params.id, req.user.id]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Update failed' })
  }
})

/* DELETE /api/leads/:id */
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    await query('DELETE FROM leads WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Delete failed' })
  }
})

/* POST /api/leads/:id/notes */
router.post('/:id/notes', requireAuth, async (req, res) => {
  try {
    const { text } = req.body
    if (!text?.trim()) return res.status(400).json({ error: 'Note text required' })
    await query(
      `INSERT INTO notes (lead_id, user_id, text) VALUES ($1,$2,$3)`,
      [req.params.id, req.user.id, text.trim()]
    )
    /* Append to lead notes JSONB array too */
    await query(
      `UPDATE leads SET notes = notes || $1::jsonb, updated_at=NOW() WHERE id=$2 AND user_id=$3`,
      [JSON.stringify([{ text: text.trim(), date: new Date().toISOString() }]), req.params.id, req.user.id]
    )
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Note failed' })
  }
})

/* POST /api/leads/:id/contact */
router.post('/:id/contact', requireAuth, async (req, res) => {
  try {
    const { type, note, outcome } = req.body
    await query(
      `INSERT INTO contact_attempts (lead_id, type, note, outcome) VALUES ($1,$2,$3,$4)`,
      [req.params.id, type, note, outcome]
    )
    await query('UPDATE leads SET updated_at=NOW() WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id])
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: 'Contact log failed' })
  }
})

module.exports = router

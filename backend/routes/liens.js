const router = require('express').Router()
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')

/* GET /api/liens/:folio */
router.get('/:folio', requireAuth, async (req, res) => {
  try {
    const { folio } = req.params
    const r = await query(
      `SELECT * FROM liens WHERE folio=$1 ORDER BY recording_date DESC`,
      [folio]
    )
    const openTotal = r.rows
      .filter(l => l.status === 'open')
      .reduce((sum, l) => sum + parseFloat(l.amount || 0), 0)

    res.json({
      folio,
      liens: r.rows,
      summary: {
        total_count: r.rows.length,
        open_count: r.rows.filter(l => l.status === 'open').length,
        open_total: openTotal,
        has_mortgage: r.rows.some(l => l.lien_type === 'mortgage'),
        has_hoa:      r.rows.some(l => l.lien_type === 'hoa'),
        has_irs:      r.rows.some(l => l.lien_type === 'irs'),
        has_code:     r.rows.some(l => l.lien_type === 'code'),
        has_judgment: r.rows.some(l => l.lien_type === 'judgment'),
      },
      source: 'Miami-Dade Clerk Official Records',
      source_url: 'https://onlineservices.miamidadeclerk.gov/officialrecords',
      integration_status: r.rows.length ? 'live' : 'pending',
      note: 'Search units ($1 each) charged per record. Additional municipal liens may require separate city searches.'
    })
  } catch (e) {
    res.status(500).json({ error: 'Liens lookup failed' })
  }
})

module.exports = router

const router = require('express').Router()
const { query } = require('../db/pool')
const { optionalAuth } = require('../middleware/auth')

/* GET /api/tax/:folio */
router.get('/:folio', optionalAuth, async (req, res) => {
  try {
    const { folio } = req.params
    const [taxes, certs, deeds] = await Promise.all([
      query('SELECT * FROM taxes WHERE folio=$1 ORDER BY tax_year DESC LIMIT 3', [folio]),
      query('SELECT * FROM tax_certificates WHERE folio=$1', [folio]),
      query('SELECT * FROM tax_deeds WHERE folio=$1', [folio]),
    ])
    res.json({
      folio,
      taxes:        taxes.rows,
      certificates: certs.rows,
      tax_deeds:    deeds.rows,
      source: 'Miami-Dade Tax Collector',
      source_url: 'https://miamidade.county-taxes.com',
      integration_status: taxes.rows.length ? 'live' : 'pending',
      note: 'Verify current status directly with Miami-Dade Tax Collector'
    })
  } catch (e) {
    res.status(500).json({ error: 'Tax lookup failed' })
  }
})

module.exports = router

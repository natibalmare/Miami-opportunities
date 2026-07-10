const router = require('express').Router()
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')

/* GET /api/permits/:folio */
router.get('/:folio', requireAuth, async (req, res) => {
  try {
    const { folio } = req.params
    const [permits, violations] = await Promise.all([
      query('SELECT * FROM permits WHERE folio=$1 ORDER BY issue_date DESC', [folio]),
      query('SELECT * FROM code_violations WHERE folio=$1 ORDER BY date_filed DESC', [folio])
    ])

    const fhaFlags = []
    permits.rows.forEach(p => {
      if (p.status === 'open') fhaFlags.push(`Open permit: ${p.permit_type} (${p.permit_number})`)
      if (p.status === 'expired') fhaFlags.push(`Expired permit: ${p.permit_type} — may require resolution before FHA`)
    })
    violations.rows.forEach(v => {
      if (v.status === 'open') fhaFlags.push(`Open code violation: ${v.violation_type}`)
    })

    res.json({
      folio,
      permits: permits.rows,
      violations: violations.rows,
      fha_flags: fhaFlags,
      has_fha_issues: fhaFlags.length > 0,
      open_permit_count: permits.rows.filter(p => p.status === 'open').length,
      open_violation_count: violations.rows.filter(v => v.status === 'open').length,
      source: 'City of Miami Building Dept / Miami-Dade Permits',
      source_urls: {
        city_miami: 'https://www.miamigov.com/epermit',
        miami_dade: 'https://www.miamidade.gov/global/permits'
      },
      integration_status: 'pending',
      note: 'Permit source integration pending. Check manually at source URLs above.'
    })
  } catch (e) {
    res.status(500).json({ error: 'Permits lookup failed' })
  }
})

module.exports = router

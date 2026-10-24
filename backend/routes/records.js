// backend/routes/records.js
// County & city records for one property: permits, code cases, code liens, building violations, recertification.
// Everyone signed in sees the summary (counts and financing flags); the full list needs the report unlocked.

const router = require('express').Router()
const { pool } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')
const { isAdminEmail } = require('../utils/access')
const { alreadyOwned, normFolio } = require('./payments')
const { recordsFor, SOURCES } = require('../adapters/publicRecords')

/* GET /api/records/:county/:parcel */
router.get('/:county/:parcel', requireAuth, async (req, res) => {
  try {
    const countyNo = Number(req.params.county)
    const parcelId = normFolio(req.params.parcel)
    if (!countyNo || !parcelId) return res.status(400).json({ error: 'County and parcel required' })

    const covered = SOURCES.filter(s => s.county === countyNo)
    if (!covered.length) return res.json({ covered: false, summary: null, records: [], locked: false })

    const data = await recordsFor(countyNo, parcelId)
    if (!data.sources.some(x => x.ok)) return res.status(503).json({ error: 'County records did not respond. Please try again in a few minutes.' })
    const full = isAdminEmail(req.user.email) || await alreadyOwned(pool, req.user.id, parcelId)
    res.json({
      covered: true,
      checkedAt: data.checkedAt,
      summary: data.summary,
      coverage: covered.map(s => s.name),
      unavailable: data.sources.filter(s => !s.ok).map(s => s.name),
      locked: !full,
      records: full ? data.records : [],
    })
  } catch (e) {
    console.error('Records lookup failed:', e.message)
    res.status(500).json({ error: 'County records are temporarily unavailable' })
  }
})

module.exports = router

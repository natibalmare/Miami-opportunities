// backend/routes/records.js
// County & city records for one property: permits, code cases, code liens, building violations, recertification.
// Everyone signed in sees the summary (counts and financing flags); the full list needs the report unlocked.

const router = require('express').Router()
const { pool } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')
const { isAdminEmail } = require('../utils/access')
const { alreadyOwned, normFolio } = require('./payments')
const { recordsFor, SOURCES } = require('../adapters/publicRecords')
const { documentsFor } = require('../adapters/browardRecords')

/* GET /api/records/official/:county/:parcel — recorded documents (Broward for now).
   Signed-in users see counts; the full list needs the report unlocked. */
const DISTRESS = { LP: 'lisPendens', FJ: 'judgments', CFJ: 'judgments', J: 'judgments', LN: 'liens', L: 'liens', CL: 'liens', TL: 'liens', FTL: 'liens', CEL: 'liens', PRO: 'probate', TD: 'taxDeeds' }
router.get('/official/:county/:parcel', requireAuth, async (req, res) => {
  try {
    const countyNo = Number(req.params.county)
    if (countyNo !== 16) return res.json({ covered: false, documents: [], locked: false })
    const parcelId = String(req.params.parcel || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    const docs = await documentsFor(parcelId)
    const since = new Date(Date.now() - 2 * 365 * 24 * 3600 * 1000).toISOString().slice(0, 10)
    const summary = { total: docs.length, lisPendens: 0, judgments: 0, liens: 0, probate: 0, taxDeeds: 0, mortgages: 0, openMortgages: 0, lastDeed: null }
    for (const d of docs) {
      const t = String(d.type || '').toUpperCase()
      if (DISTRESS[t] && (d.date || '') >= since) summary[DISTRESS[t]]++
      if (t === 'M') { summary.mortgages++; if (!d.releasedBy.length) summary.openMortgages++ }
      if (!summary.lastDeed && /^(D|DED|WD|QCD|QC|TD|CT)$/.test(t)) summary.lastDeed = { date: d.date, type: d.typeLabel, amount: d.amount }
    }
    const full = isAdminEmail(req.user.email) || await alreadyOwned(pool, req.user.id, normFolio(parcelId))
    res.json({ covered: true, summary, locked: !full, documents: full ? docs : [], since })
  } catch (e) {
    console.error('Official records failed:', e.message)
    res.status(500).json({ error: 'Official records are temporarily unavailable' })
  }
})

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

const router = require('express').Router()
const { query } = require('../db/pool')
const { optionalAuth } = require('../middleware/auth')

/* GET /api/foreclosure/:folio */
router.get('/:folio', optionalAuth, async (req, res) => {
  try {
    const { folio } = req.params
    const r = await query(
      `SELECT fc.*, cc.case_type, cc.judge, cc.last_docket, cc.notes as case_notes
       FROM foreclosure_cases fc
       LEFT JOIN court_cases cc ON cc.folio = fc.folio AND cc.case_type = 'foreclosure'
       WHERE fc.folio = $1
       ORDER BY fc.filing_date DESC LIMIT 1`,
      [folio]
    )

    if (!r.rows.length) {
      return res.json({
        folio,
        active: false,
        lis_pendens: false,
        source: 'Miami-Dade Clerk Official Records',
        source_url: 'https://onlineservices.miamidadeclerk.gov/officialrecords',
        auction_url: 'https://miamidade.realforeclose.com',
        integration_status: 'pending',
        note: 'No active foreclosure case in current dataset. Source integration pending.'
      })
    }

    const fc = r.rows[0]
    res.json({
      folio,
      active: true,
      case_no: fc.case_no,
      filing_date: fc.filing_date,
      plaintiff: fc.plaintiff,
      defendant: fc.defendant,
      status: fc.status,
      final_judgment: fc.final_judgment,
      judgment_date: fc.judgment_date,
      auction_date: fc.auction_date,
      auction_url: fc.auction_url || `https://www.miamidade.realforeclose.com/index.cfm?zaction=AUCTION&Zmethod=PREVIEW&AUCTIONDATE=${fc.auction_date}`,
      opening_bid: fc.opening_bid,
      auction_status: fc.auction_status,
      urgency: fc.urgency,
      recommendation: fc.recommendation,
      judge: fc.judge,
      last_docket: fc.last_docket,
      source: 'Miami-Dade Clerk Official Records + realforeclose.com',
      source_urls: {
        clerk: 'https://onlineservices.miamidadeclerk.gov/officialrecords',
        civil_court: 'https://www.miamidadeclerk.gov/clerk/civil-court.page',
        auction: 'https://miamidade.realforeclose.com',
        registry: 'https://bldgappl.miamidade.gov/foreclosureregistry/default.aspx'
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Foreclosure lookup failed' })
  }
})

module.exports = router

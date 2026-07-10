const router = require('express').Router()
const { query } = require('../db/pool')
const { optionalAuth } = require('../middleware/auth')

/* Detect what kind of search this is */
function detectSearchType(q) {
  const clean = q.trim()
  if (/^\d{2}-\d{4}-\d{3}-\d{4}$/.test(clean)) return 'folio'
  if (/^\d{5}$/.test(clean)) return 'zip'
  if (/\bllc\b|\binc\b|\bcorp\b|\bltd\b/i.test(clean)) return 'company'
  if (/^\d+\s+[nwse]/i.test(clean) || /\b(st|ave|blvd|rd|dr|ct|ln|ter|pl|way)\b/i.test(clean)) return 'address'
  return 'owner'
}

/* GET /api/search?q=...&type=... */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q, type } = req.query
    if (!q || q.trim().length < 2) return res.status(400).json({ error: 'Query too short' })

    const searchType = type || detectSearchType(q)
    const term = q.trim().toLowerCase()

    let results = []

    if (searchType === 'address') {
      const r = await query(
        `SELECT p.folio, p.address, p.city, p.zip, p.neighborhood, p.property_type,
                p.beds, p.baths, p.living_area, p.opportunity_score, p.financeability,
                o.name as owner_name, o.owner_type, o.homestead, o.occupancy,
                v.as_is_value, fc.auction_date, fc.status as fc_status
         FROM properties p
         LEFT JOIN owners o ON o.folio = p.folio
         LEFT JOIN valuations v ON v.folio = p.folio
         LEFT JOIN foreclosure_cases fc ON fc.folio = p.folio
         WHERE LOWER(p.address_norm) LIKE $1
         ORDER BY p.opportunity_score DESC NULLS LAST LIMIT 20`,
        [`%${term}%`]
      )
      results = r.rows
    } else if (searchType === 'folio') {
      const r = await query('SELECT * FROM properties WHERE folio = $1', [q.trim()])
      results = r.rows
    } else if (searchType === 'zip') {
      const r = await query(
        `SELECT p.folio, p.address, p.city, p.zip, p.neighborhood,
                p.opportunity_score, p.financeability, o.name as owner_name
         FROM properties p LEFT JOIN owners o ON o.folio = p.folio
         WHERE p.zip = $1 ORDER BY p.opportunity_score DESC NULLS LAST LIMIT 50`,
        [q.trim()]
      )
      results = r.rows
    } else if (searchType === 'owner' || searchType === 'company') {
      const r = await query(
        `SELECT p.folio, p.address, p.city, p.zip, p.neighborhood,
                p.opportunity_score, o.name as owner_name, o.owner_type,
                o.mailing_address, fc.auction_date
         FROM owners o
         JOIN properties p ON p.folio = o.folio
         LEFT JOIN foreclosure_cases fc ON fc.folio = p.folio
         WHERE LOWER(o.name) LIKE $1
         ORDER BY p.opportunity_score DESC NULLS LAST LIMIT 20`,
        [`%${term}%`]
      )
      results = r.rows
    }

    /* Log to audit trail if user is authenticated */
    if (req.user) {
      query(
        `INSERT INTO audit_logs (user_id, action, resource, resource_id) VALUES ($1,'search',$2,$3)`,
        [req.user.id, searchType, q.trim()]
      ).catch(() => {})
    }

    res.json({
      query: q,
      type: searchType,
      count: results.length,
      results,
      note: results.length === 0
        ? 'No properties found in current dataset. Live source integrations pending.'
        : null
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Search failed', detail: e.message })
  }
})

module.exports = router

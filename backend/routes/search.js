const router = require('express').Router()
const { query } = require('../db/pool')
const { optionalAuth } = require('../middleware/auth')
const mdpa = require('../adapters/mdpa')

function detectType(q) {
  const c = q.trim()
  if (/^\d{2}-\d{4}-\d{3}-\d{4}$/.test(c)) return 'folio'
  if (/^\d{13}$/.test(c)) return 'folio'
  if (/^\d{5}$/.test(c)) return 'zip'
  if (/\bllc\b|\binc\b|\bcorp\b|\bltd\b/i.test(c)) return 'company'
  if (/^\d+\s+[nwse]/i.test(c) || /\b(st|ave|blvd|rd|dr|ct|ln|ter|pl|way)\b/i.test(c)) return 'address'
  return 'owner'
}

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q } = req.query
    if (!q || q.trim().length < 3) return res.status(400).json({ error: 'Query too short' })

    const type = detectType(q)
    let results = []
    let liveData = null

    /* ── LIVE: Miami-Dade Property Appraiser ── */
    if (type === 'address') {
      liveData = await mdpa.searchByAddress(q.trim())
    } else if (type === 'folio') {
      liveData = await mdpa.searchByFolio(q.trim())
    } else if (type === 'owner') {
      liveData = await mdpa.searchByOwnerName(q.trim())
    }

    if (liveData) {
      const items = Array.isArray(liveData) ? liveData : [liveData]
      results = items.slice(0, 20).map(item => mdpa.parse(item)).filter(Boolean)
    }

    /* ── FALLBACK: demo database ── */
    if (results.length === 0) {
      try {
        if (type === 'address') {
          const r = await query(
            `SELECT p.folio, p.address, p.city, p.zip, p.neighborhood,
                    p.property_type, p.beds, p.baths, p.living_area,
                    p.opportunity_score, p.financeability,
                    o.name as owner_name, o.owner_type,
                    v.as_is_value, fc.auction_date
             FROM properties p
             LEFT JOIN owners o ON o.folio = p.folio
             LEFT JOIN valuations v ON v.folio = p.folio
             LEFT JOIN foreclosure_cases fc ON fc.folio = p.folio
             WHERE LOWER(p.address_norm) LIKE $1
             ORDER BY p.opportunity_score DESC NULLS LAST LIMIT 20`,
            [`%${q.trim().toLowerCase()}%`]
          )
          results = r.rows
        } else if (type === 'folio') {
          const r = await query('SELECT * FROM properties WHERE folio = $1', [q.trim()])
          results = r.rows
        }
      } catch (dbErr) {
        console.log('DB fallback skipped:', dbErr.message)
      }
    }

    if (req.user) {
      query(`INSERT INTO audit_logs (user_id, action, resource, resource_id) VALUES ($1,'search',$2,$3)`,
        [req.user.id, type, q.trim()]).catch(() => {})
    }

    res.json({ query: q, type, count: results.length, results, source: liveData ? 'Miami-Dade PA (live)' : 'demo' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Search failed', detail: e.message })
  }
})

module.exports = router

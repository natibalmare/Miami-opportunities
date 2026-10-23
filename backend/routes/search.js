const router = require('express').Router()
const { query } = require('../db/pool')
const { optionalAuth } = require('../middleware/auth')
const mdpa = require('../adapters/mdpa')
const { COUNTIES } = require('../config/counties')
const { findParcel, parcelToReport } = require('./criteria')

function detectType(q) {
  const c = q.trim()
  if (/^parcel:\d+:.+$/i.test(c)) return 'parcel'
  if (/^\d{2}-\d{4}-\d{3}-\d{4}$/.test(c)) return 'folio'
  if (/^\d{13}$/.test(c)) return 'folio'
  if (/^\d{5}$/.test(c)) return 'zip'
  if (/\bllc\b|\binc\b|\bcorp\b|\bltd\b/i.test(c)) return 'company'
  if (/^\d+\s+[nwse]/i.test(c) || /\b(st|ave|blvd|rd|dr|ct|ln|ter|pl|way)\b/i.test(c)) return 'address'
  return 'owner'
}

const titleCase = (s) => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())

/* Broward / Palm Beach addresses from the loaded state tax roll */
async function suggestFromParcels(text, limit) {
  const norm = mdpa.normalizeAddress(text, { partial: true })
  if (norm.length < 3 || !/^\d/.test(norm)) return []
  try {
    const r = await query(
      `SELECT county_no, parcel_id, phy_addr1, phy_city, phy_zip FROM parcels
        WHERE county_no <> 23 AND phy_addr1 LIKE $1
        ORDER BY phy_addr1 LIMIT $2`,
      [`${norm.replace(/[%_]/g, '')}%`, limit]
    )
    return r.rows.map(p => {
      const city = titleCase(p.phy_city || COUNTIES[p.county_no]?.name || '')
      return {
        folio: `parcel:${p.county_no}:${p.parcel_id}`,
        address: p.phy_addr1,
        city,
        zip: p.phy_zip || '',
        county: COUNTIES[p.county_no]?.name,
        label: `${p.phy_addr1}, ${city} FL ${p.phy_zip || ''}`.trim(),
      }
    })
  } catch (e) {
    console.error('Parcel suggest failed:', e.message)
    return []
  }
}

/* GET /api/search/suggest?q=332 NW — real addresses as you type (Miami-Dade live + Broward + Palm Beach) */
router.get('/suggest', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    if (q.length < 3 || q.length > 80) return res.json({ suggestions: [] })
    const [md, other] = await Promise.all([mdpa.suggestAddresses(q, 6), suggestFromParcels(q, 6)])
    const mdItems = (md || []).map(s => ({ ...s, county: 'Miami-Dade' }))
    const suggestions = [...mdItems, ...other]
      .sort((a, b) => a.address.localeCompare(b.address, 'en', { numeric: true }))
      .slice(0, 8)
    if (md === null && !other.length) return res.status(502).json({ suggestions: [], error: 'County records are not responding' })
    res.json({ suggestions, source: 'Miami-Dade Property Appraiser (live) · Florida Dept. of Revenue tax roll' })
  } catch (e) {
    console.error('Suggest failed:', e.message)
    res.status(500).json({ suggestions: [] })
  }
})

router.get('/', optionalAuth, async (req, res) => {
  try {
    const { q } = req.query
    if (!q || q.trim().length < 3) return res.status(400).json({ error: 'Query too short' })

    const type = detectType(q)
    let results = []
    let liveData = null
    let source = 'demo'

    /* ── Broward / Palm Beach parcel picked from suggestions or criteria search ── */
    if (type === 'parcel') {
      const [, countyNo, parcelId] = q.trim().match(/^parcel:(\d+):(.+)$/i)
      const p = await findParcel(Number(countyNo), parcelId)
      if (p) { results = [parcelToReport(p)]; source = 'Florida Dept. of Revenue tax roll' }
      if (Number(countyNo) === 23 && !results.length) {
        liveData = await mdpa.searchByFolio(parcelId)
      }
    }

    /* ── LIVE: Miami-Dade Property Appraiser ── */
    if (type === 'address') {
      liveData = await mdpa.searchByAddress(q.trim())
    } else if (type === 'folio') {
      liveData = await mdpa.searchByFolio(q.trim())
    } else if (type === 'owner') {
      liveData = await mdpa.searchByOwnerName(q.trim())
    }

    if (liveData && liveData.length) {
      const items = Array.isArray(liveData) ? liveData : [liveData]
      results = items.slice(0, 20).map(item => ({ ...mdpa.parse(item), county: 'Miami-Dade', countySlug: 'miami-dade' })).filter(Boolean)
      source = 'Miami-Dade PA (live)'
    }

    /* ── Broward / Palm Beach addresses from the state tax roll ── */
    if (!results.length && type === 'address') {
      try {
        const norm = mdpa.normalizeAddress(q.trim())
        const r = await query(
          `SELECT *, to_char(sale_date1, 'YYYY-MM-DD') AS sale_date1 FROM parcels WHERE county_no <> 23 AND phy_addr1 LIKE $1 ORDER BY phy_addr1 LIMIT 20`,
          [`${norm.replace(/[%_]/g, '')}%`]
        )
        results = r.rows.map(parcelToReport)
        if (results.length) source = 'Florida Dept. of Revenue tax roll'
      } catch (dbErr) {
        console.log('Parcel address search skipped:', dbErr.message)
      }
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

    res.json({ query: q, type, count: results.length, results, source })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Search failed', detail: e.message })
  }
})

module.exports = router

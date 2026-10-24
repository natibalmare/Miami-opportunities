const router = require('express').Router()
const { query } = require('../db/pool')
const { optionalAuth } = require('../middleware/auth')
const mdpa = require('../adapters/mdpa')
const { COUNTIES } = require('../config/counties')
const { findParcel, parcelToReport } = require('./criteria')
const { scoreMany } = require('../utils/opportunityScore')
const { pool } = require('../db/pool')

/* Details reserved for unlocked (paid) reports */
const PAID_FIELDS = ['owner1', 'owner2', 'mailingAddr', 'mailingCity', 'mailingState', 'mailingZip',
  'homestead', 'absentee', 'lastSalePrice', 'lastSaleDate', 'scoreFactors', 'links']

async function applyPaywall(results, user) {
  const { alreadyOwned, normFolio } = require('./payments')
  const admins = String(process.env.ADMIN_EMAILS || 'natibalma@gmail.com,natibalmare@gmail.com').toLowerCase().split(',').map(s => s.trim())
  const isAdmin = user && admins.includes(String(user.email || '').toLowerCase())
  for (const r of results) {
    if (!r || !r.folio) continue
    let owned = !!isAdmin
    if (!owned && user) {
      try { owned = await alreadyOwned(pool, user.id, normFolio(r.folio)) } catch { owned = false }
    }
    if (!owned) {
      for (const f of PAID_FIELDS) delete r[f]
      r.locked = true
    }
  }
  return results
}

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
    const seen = new Set()
    const suggestions = [...mdItems, ...other]
      .filter(s => { const k = s.label.toUpperCase(); if (seen.has(k)) return false; seen.add(k); return true })
      .sort((a, b) => a.address.localeCompare(b.address, 'en', { numeric: true }))
      .slice(0, 8)
    if (md === null && !other.length) return res.status(502).json({ suggestions: [], error: 'County records are not responding' })
    res.json({ suggestions })
  } catch (e) {
    console.error('Suggest failed:', e.message)
    res.status(500).json({ suggestions: [] })
  }
})

/* Add state-roll details (homestead, recent sale, use code) to live Miami-Dade results, then score everything */
async function enrichAndScore(results) {
  const mdFolios = results.filter(r => r && r.county === 'Miami-Dade' && r.folio && r.homestead === undefined).map(r => String(r.folio))
  if (mdFolios.length) {
    try {
      const r = await query(
        `SELECT parcel_id, dor_uc, homestead, absentee, own_state, sale_price1, to_char(sale_date1, 'YYYY-MM-DD') AS sale_date1
           FROM parcels WHERE county_no = 23 AND parcel_id = ANY($1::text[])`, [mdFolios])
      const byFolio = new Map(r.rows.map(x => [x.parcel_id, x]))
      for (const item of results) {
        const x = byFolio.get(String(item.folio))
        if (!x) continue
        item.countyNo = 23
        item.useCode = x.dor_uc
        item.homestead = x.homestead
        item.absentee = x.absentee
        if (!item.mailingState && x.own_state) item.mailingState = x.own_state
        item.lastSalePrice = x.sale_price1 ? Number(x.sale_price1) : null
        item.lastSaleDate = x.sale_date1
      }
    } catch (e) {
      console.error('Miami-Dade enrich failed:', e.message)
    }
  }
  const scorable = results.filter(r => r && r.folio && r.address)
  if (!scorable.length) return results
  const scores = await scoreMany(scorable.map(r => ({
    countyNo: r.countyNo || (r.county === 'Miami-Dade' ? 23 : null),
    parcelId: r.parcelId || r.folio,
    zip: String(r.zip || '').slice(0, 5),
    useCode: r.useCode ?? null,
    value: r.assessedValue,
    livingSqft: Number(r.livingArea) || null,
    yearBuilt: r.yearBuilt,
    owner: r.owner1,
    ownerState: r.mailingState,
    homestead: r.homestead,
    absentee: r.absentee,
    recentSale: !!r.lastSaleDate,
  })))
  scorable.forEach((r, i) => {
    r.score = scores[i].score
    r.scoreLabel = scores[i].label
    r.scoreFactors = scores[i].factors
    r.financeability = scores[i].financeability
  })
  return results
}

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

    if (source !== 'demo') {
      await enrichAndScore(results)
      await applyPaywall(results, req.user)
    }

    res.json({ query: q, type, count: results.length, results, source })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Search failed', detail: e.message })
  }
})

module.exports = router

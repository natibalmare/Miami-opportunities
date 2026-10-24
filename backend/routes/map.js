// backend/routes/map.js
// Properties inside the visible map area, with their Opportunity Score.

const router = require('express').Router()
const { query } = require('../db/pool')
const { COUNTIES, PROPERTY_TYPES, useLabel } = require('../config/counties')
const { scoreMany } = require('../utils/opportunityScore')

const MAX_SPAN = 0.08          // degrees (~8 km) — zoom in further to load parcels
const SCAN_LIMIT = 3000
const RETURN_LIMIT = 800

const LISTS = {
  absentee: "p.absentee = true",
  'out-of-state': "p.own_state IS NOT NULL AND UPPER(p.own_state) NOT IN ('FL','FLORIDA')",
  trust: "p.own_name ~* '\\m(TRUST|TR|TRS|TRUSTEE|ESTATE|EST)\\M'",
  llc: "p.own_name ~* '\\m(LLC|INC|CORP|LTD|LP|LLP|HOLDINGS|PROPERTIES|INVESTMENTS)\\M'",
  older: "p.year_built > 0 AND p.year_built < 1970",
  landlords: "p.absentee = true AND p.dor_uc = 8",
  'vacant-land': "p.dor_uc = 0",
  recent: "p.sale_date1 IS NOT NULL",
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }

/* GET /api/map/areas?q= — cities and subdivisions matching the text, with their center point */
router.get('/areas', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60)
    if (q.length < 2) return res.json({ areas: [] })
    const r = await query(
      `SELECT county_no, kind, name, lat, lng, n FROM map_areas
        WHERE name ILIKE $1
        ORDER BY (name ILIKE $2) DESC, (kind = 'city') DESC, n DESC LIMIT 15`,
      [`%${q.replace(/[%_]/g, '')}%`, `${q.replace(/[%_]/g, '')}%`])
    res.json({ areas: r.rows.map(a => ({ name: a.name, kind: a.kind, county: COUNTIES[a.county_no]?.name, lat: a.lat, lng: a.lng, count: a.n })) })
  } catch (e) {
    console.error('Map areas failed:', e.message)
    res.json({ areas: [] })
  }
})

router.get('/parcels', async (req, res) => {
  try {
    const minLat = num(req.query.minLat), maxLat = num(req.query.maxLat)
    const minLng = num(req.query.minLng), maxLng = num(req.query.maxLng)
    if ([minLat, maxLat, minLng, maxLng].includes(null)) return res.status(400).json({ error: 'Map bounds required' })
    if (maxLat - minLat > MAX_SPAN || maxLng - minLng > MAX_SPAN) {
      return res.json({ zoomIn: true, points: [] })
    }

    const where = ['pt.lat BETWEEN $1 AND $2', 'pt.lng BETWEEN $3 AND $4']
    const params = [minLat, maxLat, minLng, maxLng]
    if (LISTS[req.query.list]) where.push(LISTS[req.query.list])
    const types = String(req.query.type || '').split(',').filter(t => PROPERTY_TYPES[t])
    if (types.length) {
      params.push([...new Set(types.flatMap(t => PROPERTY_TYPES[t].codes))])
      where.push(`p.dor_uc = ANY($${params.length}::smallint[])`)
    }

    const r = await query(
      `SELECT pt.lat, pt.lng, p.county_no, p.parcel_id, p.phy_addr1, p.phy_city, p.phy_zip, p.dor_uc,
              p.just_value, p.living_sqft, p.year_built, p.own_name, p.own_state, p.homestead, p.absentee,
              p.sale_date1, p.beds, p.baths
         FROM parcel_points pt
         JOIN parcels p ON p.county_no = pt.county_no AND p.parcel_id = pt.parcel_id
        WHERE ${where.join(' AND ')}
        LIMIT ${SCAN_LIMIT}`,
      params
    )

    const scores = await scoreMany(r.rows.map(x => ({
      countyNo: x.county_no, parcelId: x.parcel_id, zip: x.phy_zip, useCode: x.dor_uc,
      value: x.just_value ? Number(x.just_value) : null, livingSqft: x.living_sqft ? Number(x.living_sqft) : null,
      yearBuilt: x.year_built, owner: x.own_name, ownerState: x.own_state,
      homestead: x.homestead, absentee: x.absentee, recentSale: !!x.sale_date1,
    })))

    const minScore = num(req.query.minScore) || 0
    const points = r.rows.map((x, i) => ({
      lat: x.lat, lng: x.lng,
      score: scores[i].score, label: scores[i].label,
      address: x.phy_addr1, city: x.phy_city, zip: x.phy_zip,
      county: COUNTIES[x.county_no]?.name,
      type: useLabel(x.dor_uc),
      value: x.just_value ? Number(x.just_value) : null,
      livingSqft: x.living_sqft ? Number(x.living_sqft) : null,
      yearBuilt: x.year_built, beds: x.beds, baths: x.baths !== null ? Number(x.baths) : null,
      reportKey: x.county_no === 23 ? x.parcel_id : `parcel:${x.county_no}:${x.parcel_id}`,
    }))
      .filter(p => p.address && p.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, RETURN_LIMIT)

    res.json({ points, truncated: r.rows.length >= SCAN_LIMIT })
  } catch (e) {
    console.error('Map parcels failed:', e.message)
    res.status(500).json({ error: 'Map data unavailable' })
  }
})

module.exports = router

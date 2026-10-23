// backend/routes/criteria.js
// Search properties by criteria (like iMapp's Tax Search) across the loaded counties.

const router = require('express').Router()
const { query } = require('../db/pool')
const { requireAuth } = require('../middleware/auth')
const { COUNTIES, PROPERTY_TYPES, useLabel } = require('../config/counties')

const MAX_PAGE = 100
const COUNT_CAP = 10000

const num = (v) => {
  if (v === undefined || v === null || v === '') return null
  const n = Number(String(v).replace(/[,$\s]/g, ''))
  return Number.isFinite(n) ? n : null
}
const list = (v) => String(v || '').split(',').map(s => s.trim()).filter(Boolean)

/* GET /api/criteria/meta — which counties are loaded and what can be filtered */
router.get('/meta', async (req, res) => {
  try {
    const r = await query(`
      SELECT county_no, COUNT(*)::int AS properties, MAX(roll_year) AS roll_year, MAX(roll_type) AS roll_type
        FROM parcels GROUP BY county_no`)
    const loads = await query(`
      SELECT DISTINCT ON (county_no, source) county_no, source, status, finished_at, rows_loaded
        FROM data_imports ORDER BY county_no, source, started_at DESC`)
    const byCounty = Object.fromEntries(r.rows.map(x => [x.county_no, x]))
    res.json({
      counties: Object.values(COUNTIES).map(c => {
        const stats = byCounty[c.no] || {}
        const roll = loads.rows.find(l => l.county_no === c.no && l.source === 'fdor-nal')
        const beds = loads.rows.find(l => l.county_no === c.no && l.source === 'mdpa-enrich')
        return {
          slug: c.slug, name: c.name,
          properties: stats.properties || 0,
          rollYear: stats.roll_year || null,
          rollType: stats.roll_type || null,
          lastLoaded: roll?.status === 'done' ? roll.finished_at : null,
          loading: roll?.status === 'running' || beds?.status === 'running',
          hasBedsBaths: c.hasBedsBaths && beds?.status === 'done',
        }
      }),
      propertyTypes: Object.entries(PROPERTY_TYPES).map(([key, t]) => ({ key, label: t.label })),
      source: 'Florida Department of Revenue tax roll; Miami-Dade beds/baths from the Miami-Dade Property Appraiser',
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'Could not load search options' })
  }
})

/* GET /api/criteria — run a criteria search (signed-in members) */
router.get('/', requireAuth, async (req, res) => {
  try {
    const q = req.query
    const where = []
    const params = []
    const add = (sql, val) => { params.push(val); where.push(sql.replace('?', `$${params.length}`)) }

    /* County */
    const slugs = list(q.county)
    const counties = Object.values(COUNTIES).filter(c => !slugs.length || slugs.includes(c.slug)).map(c => c.no)
    if (!counties.length) return res.status(400).json({ error: 'Choose a county' })
    add('county_no = ANY(?::smallint[])', counties)

    /* Location */
    const zips = list(q.zip).map(z => z.replace(/\D/g, '').slice(0, 5)).filter(z => z.length === 5)
    if (zips.length) add('phy_zip = ANY(?::text[])', zips)
    if (q.city) add('UPPER(phy_city) LIKE ?', `%${String(q.city).trim().toUpperCase()}%`)
    if (q.street) add('phy_addr1 LIKE ?', `%${String(q.street).trim().toUpperCase()}%`)
    if (q.subdivision) add('UPPER(subdivision) LIKE ?', `%${String(q.subdivision).trim().toUpperCase()}%`)
    if (q.owner) add('UPPER(own_name) LIKE ?', `%${String(q.owner).trim().toUpperCase()}%`)

    /* Property type */
    const types = list(q.type).filter(t => PROPERTY_TYPES[t])
    if (types.length) add('dor_uc = ANY(?::smallint[])', [...new Set(types.flatMap(t => PROPERTY_TYPES[t].codes))])

    /* Size, age, value */
    const ranges = [
      ['living_sqft', q.minLiving, q.maxLiving],
      ['land_sqft', q.minLot, q.maxLot],
      ['year_built', q.minYear, q.maxYear],
      ['just_value', q.minValue, q.maxValue],
      ['sale_price1', q.minSale, q.maxSale],
      ['res_units', q.minUnits, q.maxUnits],
    ]
    for (const [col, lo, hi] of ranges) {
      if (num(lo) !== null) add(`${col} >= ?`, num(lo))
      if (num(hi) !== null) add(`${col} <= ?`, num(hi))
    }
    if (num(q.minBeds) !== null) add('beds >= ?', num(q.minBeds))
    if (num(q.minBaths) !== null) add('baths >= ?', num(q.minBaths))

    /* Last sale */
    if (q.soldAfter) add('sale_date1 >= ?::date', String(q.soldAfter))
    if (q.soldBefore) add('sale_date1 <= ?::date', String(q.soldBefore))
    if (num(q.ownedYears) !== null) add('sale_date1 <= (CURRENT_DATE - make_interval(years => ?::int))', Math.round(num(q.ownedYears)))

    /* Owner indicators */
    if (q.occupancy === 'absentee') where.push('absentee = true')
    if (q.occupancy === 'owner') where.push('homestead = true')
    if (q.ownerType === 'company') where.push(`own_name ~* '\\m(LLC|INC|CORP|LTD|LP|LLP|CO|COMPANY|HOLDINGS|PROPERTIES|INVESTMENTS)\\M'`)
    if (q.ownerType === 'trust') where.push(`own_name ~* '\\m(TRUST|TR|TRS|TRUSTEE|ESTATE|EST)\\M'`)
    if (q.ownerType === 'individual') where.push(`own_name !~* '\\m(LLC|INC|CORP|LTD|LP|LLP|TRUST|TR|TRS|TRUSTEE|ESTATE|EST|HOLDINGS|PROPERTIES|INVESTMENTS|COUNTY|CITY|STATE)\\M'`)
    if (q.outOfState === 'true') where.push(`own_state IS NOT NULL AND UPPER(own_state) NOT IN ('FL','FLORIDA')`)

    const SORTS = {
      value_desc: 'just_value DESC NULLS LAST', value_asc: 'just_value ASC NULLS LAST',
      sale_old: 'sale_date1 ASC NULLS LAST', sale_new: 'sale_date1 DESC NULLS LAST',
      living_desc: 'living_sqft DESC NULLS LAST', lot_desc: 'land_sqft DESC NULLS LAST',
      year_old: 'year_built ASC NULLS LAST', address: 'phy_addr1 ASC',
    }
    const order = SORTS[q.sort] || SORTS.value_desc
    const pageSize = Math.min(MAX_PAGE, Math.max(10, num(q.pageSize) || 50))
    const page = Math.max(1, num(q.page) || 1)
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const countR = await query(`SELECT COUNT(*)::int AS n FROM (SELECT 1 FROM parcels ${whereSql} LIMIT ${COUNT_CAP + 1}) t`, params)
    const total = countR.rows[0].n

    const rowsR = await query(
      `SELECT county_no, parcel_id, phy_addr1, phy_city, phy_zip, own_name, own_city, own_state, dor_uc,
              just_value, land_sqft, living_sqft, year_built, res_units, beds, baths, homestead, absentee,
              sale_price1, to_char(sale_date1, 'YYYY-MM-DD') AS sale_date1, roll_year
         FROM parcels ${whereSql}
        ORDER BY ${order}
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
      params
    )

    const results = rowsR.rows.map(r => ({
      county: COUNTIES[r.county_no]?.name,
      countySlug: COUNTIES[r.county_no]?.slug,
      parcelId: r.parcel_id,
      reportKey: r.county_no === 23 ? r.parcel_id : `parcel:${r.county_no}:${r.parcel_id}`,
      address: r.phy_addr1,
      city: r.phy_city,
      zip: r.phy_zip,
      owner: r.own_name,
      ownerLocation: [r.own_city, r.own_state].filter(Boolean).join(', '),
      propertyType: useLabel(r.dor_uc),
      value: r.just_value ? Number(r.just_value) : null,
      lotSqft: r.land_sqft,
      livingSqft: r.living_sqft,
      yearBuilt: r.year_built,
      units: r.res_units,
      beds: r.beds,
      baths: r.baths !== null ? Number(r.baths) : null,
      homestead: r.homestead,
      absentee: r.absentee,
      lastSalePrice: r.sale_price1 ? Number(r.sale_price1) : null,
      lastSaleDate: r.sale_date1,
      rollYear: r.roll_year,
    }))

    query(`INSERT INTO audit_logs (user_id, action, resource, resource_id) VALUES ($1,'criteria_search','parcels',$2)`,
      [req.user.id, JSON.stringify(q).slice(0, 500)]).catch(() => {})

    res.json({
      total: Math.min(total, COUNT_CAP),
      totalCapped: total > COUNT_CAP,
      page, pageSize, results,
      source: 'Florida Department of Revenue property tax roll (values are just/market value as assessed, not an appraisal)',
    })
  } catch (e) {
    console.error('Criteria search failed:', e.message)
    res.status(500).json({ error: 'Search failed', detail: e.message })
  }
})

/* Single parcel lookup used by the property report for Broward / Palm Beach */
async function findParcel(countyNo, parcelId) {
  const r = await query("SELECT *, to_char(sale_date1, 'YYYY-MM-DD') AS sale_date1 FROM parcels WHERE county_no=$1 AND parcel_id=$2", [countyNo, parcelId])
  return r.rows[0] || null
}

function parcelToReport(p) {
  if (!p) return null
  const c = COUNTIES[p.county_no] || {}
  return {
    folio: p.parcel_id,
    county: c.name,
    countySlug: c.slug,
    address: p.phy_addr1,
    city: p.phy_city,
    zip: p.phy_zip,
    owner1: p.own_name,
    owner2: null,
    mailingAddr: p.own_addr1,
    mailingCity: p.own_city,
    mailingState: p.own_state,
    mailingZip: p.own_zip,
    propertyType: useLabel(p.dor_uc),
    subdivision: p.subdivision,
    zoning: null,
    yearBuilt: p.year_built,
    livingArea: p.living_sqft,
    lotSize: p.land_sqft,
    beds: p.beds,
    baths: p.baths !== null ? Number(p.baths) : null,
    assessedValue: p.just_value ? Number(p.just_value) : null,
    assessmentYear: p.roll_year,
    homestead: p.homestead,
    absentee: p.absentee,
    lastSalePrice: p.sale_price1 ? Number(p.sale_price1) : null,
    lastSaleDate: p.sale_date1,
    links: { appraiser: c.appraiserUrl, tax: c.taxUrl, clerk: c.clerkUrl, foreclosure: c.foreclosureUrl },
    source: `Florida Department of Revenue tax roll (${p.roll_year} ${p.roll_type || ''})`.trim(),
    sourceUrl: 'https://floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx',
    fetchedAt: p.updated_at,
  }
}

module.exports = router
module.exports.findParcel = findParcel
module.exports.parcelToReport = parcelToReport

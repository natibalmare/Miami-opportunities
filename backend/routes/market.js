// backend/routes/market.js
// Mortgage rates (Freddie Mac weekly survey via FRED) and HUD Small Area Fair Market Rents by ZIP.

const router = require('express').Router()
const fetch = require('node-fetch')
const { query } = require('../db/pool')

/* ── Mortgage rates ── */
const RATES_URL = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US,MORTGAGE15US'
let ratesCache = null

async function getRates() {
  if (ratesCache && ratesCache.expires > Date.now()) return ratesCache.body
  const res = await fetch(RATES_URL, { timeout: 15000 })
  if (!res.ok) throw new Error(`Rates HTTP ${res.status}`)
  const lines = (await res.text()).trim().split('\n').slice(1)
  let rate30 = null, rate15 = null, date = null
  for (let i = lines.length - 1; i >= 0 && (rate30 === null || rate15 === null); i--) {
    const [d, r30, r15] = lines[i].split(',')
    if (rate30 === null && r30 && r30 !== '.') { rate30 = Number(r30); date = date || d }
    if (rate15 === null && r15 && r15 !== '.') rate15 = Number(r15)
  }
  if (!rate30) throw new Error('No rate found')
  const body = {
    rate30, rate15, asOf: date,
    source: 'Freddie Mac Primary Mortgage Market Survey® (weekly national average)',
  }
  ratesCache = { body, expires: Date.now() + 6 * 60 * 60 * 1000 }
  return body
}

router.get('/rates', async (req, res) => {
  try {
    res.json(await getRates())
  } catch (e) {
    console.error('Rates failed:', e.message)
    if (ratesCache) return res.json({ ...ratesCache.body, stale: true })
    res.status(502).json({ error: 'Mortgage rates are unavailable right now' })
  }
})

/* ── HUD Small Area Fair Market Rents ── */
const SAFMR_URL = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/HUD_PDR_Small_Area_Fair_Market_Rents/FeatureServer/1/query'
const rentCache = new Map()

router.get('/rents/:zip', async (req, res) => {
  try {
    const zip = String(req.params.zip || '').replace(/\D/g, '').slice(0, 5)
    if (zip.length !== 5) return res.status(400).json({ error: 'Valid 5-digit ZIP required' })
    const hit = rentCache.get(zip)
    if (hit && hit.expires > Date.now()) return res.json(hit.body)

    const params = new URLSearchParams({
      where: `ID = '${zip}'`,
      outFields: 'ID,FMR_NAME,SAFMR_0BR,SAFMR_1BR,SAFMR_2BR,SAFMR_3BR,SAFMR_4BR',
      f: 'json',
    })
    const r = await fetch(`${SAFMR_URL}?${params}`, { timeout: 15000 })
    if (!r.ok) throw new Error(`HUD HTTP ${r.status}`)
    const json = await r.json()
    if (json.error) throw new Error(json.error.message || 'HUD query error')
    const a = json.features?.[0]?.attributes
    const body = a ? {
      zip,
      area: a.FMR_NAME,
      rents: { 0: a.SAFMR_0BR, 1: a.SAFMR_1BR, 2: a.SAFMR_2BR, 3: a.SAFMR_3BR, 4: a.SAFMR_4BR },
      year: 'FY2026',
      source: 'HUD Small Area Fair Market Rents (FY2026) — a rent benchmark, not a market appraisal',
    } : { zip, rents: null }
    rentCache.set(zip, { body, expires: Date.now() + 24 * 60 * 60 * 1000 })
    res.json(body)
  } catch (e) {
    console.error('Rents failed:', e.message)
    res.status(502).json({ error: 'Rent data is unavailable right now' })
  }
})

/* GET /api/market/comps?county=23&parcel=0132... — recent nearby sales of similar properties (public records).
   Returns an estimate only when there are at least 3 good comparables; otherwise the estimate is left blank. */
const QUALIFIED = ['Q', '01', '02', '03', '04', '05']
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }
const quantile = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] }
const miles = (a, b) => {
  const R = 3958.8, toR = (d) => d * Math.PI / 180
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

router.get('/comps', async (req, res) => {
  try {
    const county = Number(req.query.county)
    const parcel = String(req.query.parcel || '').replace(/[^0-9A-Za-z]/g, '')
    if (!county || !parcel) return res.status(400).json({ error: 'Property required' })
    const sr = await query(
      `SELECT p.*, pt.lat, pt.lng FROM parcels p LEFT JOIN parcel_points pt ON pt.county_no = p.county_no AND pt.parcel_id = p.parcel_id
        WHERE p.county_no = $1 AND p.parcel_id = $2`, [county, parcel])
    const s0 = sr.rows[0]
    if (!s0) return res.json({ comps: [], estimate: null, reason: 'Property not found in county records' })
    const sqft = Number(s0.living_sqft) || 0
    if (!s0.lat || !sqft) return res.json({ comps: [], estimate: null, reason: 'Not enough information about this property to compare' })

    const run = async (radiusMi) => {
      const dLat = radiusMi / 69, dLng = radiusMi / (69 * Math.cos(s0.lat * Math.PI / 180))
      const r = await query(
        `SELECT p.parcel_id, p.phy_addr1, p.phy_city, p.living_sqft, p.year_built, p.beds, p.baths, p.sale_price1,
                to_char(p.sale_date1, 'YYYY-MM-DD') AS sale_date, pt.lat, pt.lng
           FROM parcel_points pt JOIN parcels p ON p.county_no = pt.county_no AND p.parcel_id = pt.parcel_id
          WHERE pt.lat BETWEEN $1 AND $2 AND pt.lng BETWEEN $3 AND $4
            AND p.county_no = $5 AND p.dor_uc = $6 AND p.parcel_id <> $7
            AND p.living_sqft BETWEEN $8 AND $9
            AND p.sale_price1 >= 25000 AND p.sale_date1 >= (CURRENT_DATE - INTERVAL '12 months')
            AND p.sale_qual1 = ANY($10::text[])
          LIMIT 400`,
        [s0.lat - dLat, s0.lat + dLat, s0.lng - dLng, s0.lng + dLng, county, s0.dor_uc, parcel,
         Math.round(sqft * 0.7), Math.round(sqft * 1.3), QUALIFIED])
      return r.rows.map(c => ({ ...c, distance: miles(s0, c), ppsf: Number(c.sale_price1) / Number(c.living_sqft) }))
        .filter(c => c.distance <= radiusMi && Number.isFinite(c.ppsf))
    }

    let radius = 0.5
    let comps = await run(radius)
    if (comps.length < 3) { radius = 1; comps = await run(radius) }
    /* Similar size and age first, then closest */
    const age = Number(s0.year_built) || null
    comps.forEach(c => { c.rank = Math.abs(Number(c.living_sqft) - sqft) / sqft + (age && c.year_built ? Math.abs(c.year_built - age) / 60 : 0.2) + c.distance / 2 })
    comps.sort((a, b) => a.rank - b.rank)
    comps = comps.slice(0, 6)

    let estimate = null
    if (comps.length >= 3) {
      const ppsf = comps.map(c => c.ppsf)
      estimate = {
        value: Math.round(median(ppsf) * sqft / 1000) * 1000,
        low: Math.round(quantile(ppsf, 0.25) * sqft / 1000) * 1000,
        high: Math.round(quantile(ppsf, 0.75) * sqft / 1000) * 1000,
        ppsf: Math.round(median(ppsf)),
      }
    }
    res.json({
      subject: { sqft, yearBuilt: s0.year_built, beds: s0.beds, baths: s0.baths !== null ? Number(s0.baths) : null },
      radiusMiles: radius,
      comps: comps.map(c => ({
        address: c.phy_addr1, city: c.phy_city, salePrice: Number(c.sale_price1), saleDate: c.sale_date, sqft: Number(c.living_sqft),
        ppsf: Math.round(c.ppsf), yearBuilt: c.year_built, beds: c.beds, baths: c.baths !== null ? Number(c.baths) : null, distance: Math.round(c.distance * 100) / 100,
      })),
      estimate,
      reason: estimate ? null : 'Fewer than 3 recent comparable sales nearby — enter your own value.',
    })
  } catch (e) {
    console.error('Comps failed:', e.message)
    res.status(500).json({ error: 'Comparable sales are temporarily unavailable' })
  }
})

/* Admin check: which sale qualification codes appear in recent sales (to confirm the comps filter) */
router.get('/comps/codes', async (req, res) => {
  try {
    const r = await query(`SELECT sale_qual1 AS code, COUNT(*)::int AS n FROM parcels WHERE sale_date1 >= CURRENT_DATE - INTERVAL '12 months' GROUP BY 1 ORDER BY 2 DESC LIMIT 30`)
    res.json({ codes: r.rows })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

module.exports = router

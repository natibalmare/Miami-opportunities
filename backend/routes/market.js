// backend/routes/market.js
// Mortgage rates (Freddie Mac weekly survey via FRED) and HUD Small Area Fair Market Rents by ZIP.

const router = require('express').Router()
const fetch = require('node-fetch')

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

module.exports = router

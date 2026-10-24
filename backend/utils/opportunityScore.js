// backend/utils/opportunityScore.js
// Preliminary Opportunity Score (0–100) from the public-record indicators MO has today.
// Distress filings (tax delinquency, liens, lis pendens, foreclosure, code cases) are added
// to this score as those county sources are connected.

const { query } = require('../db/pool')

const COMPANY = /\b(LLC|L L C|INC|CORP|CORPORATION|LTD|LP|LLP|CO|COMPANY|HOLDINGS|PROPERTIES|INVESTMENTS|GROUP|PARTNERS)\b/i
const TRUST = /\b(TRUST|TR|TRS|TRUSTEE|ESTATE|EST|HEIRS|DECEASED|LIFE ESTATE)\b/i
const GOVT = /\b(COUNTY|CITY OF|STATE OF|SCHOOL BOARD|UNITED STATES|HOUSING AUTHORITY|TOWN OF|VILLAGE OF)\b/i

const RESIDENTIAL_USE = new Set([0, 1, 2, 4, 5, 8, 3])

/* Median value per living sq ft by county + ZIP + use code, cached in memory */
const zipCache = new Map()
const ZIP_TTL = 12 * 60 * 60 * 1000

async function zipMedians(keys) {
  const out = {}
  const missing = []
  for (const k of keys) {
    const hit = zipCache.get(k)
    if (hit && hit.expires > Date.now()) out[k] = hit.value
    else missing.push(k)
  }
  if (missing.length) {
    const counties = [], zips = [], uses = []
    for (const k of missing) { const [c, z, u] = k.split('|'); counties.push(Number(c)); zips.push(z); uses.push(Number(u)) }
    try {
      const r = await query(
        `SELECT p.county_no, p.phy_zip, p.dor_uc,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY p.just_value::numeric / p.living_sqft) AS ppsf,
                COUNT(*)::int AS n
           FROM parcels p
           JOIN unnest($1::smallint[], $2::text[], $3::smallint[]) AS k(c, z, u)
             ON p.county_no = k.c AND p.phy_zip = k.z AND p.dor_uc = k.u
          WHERE p.living_sqft >= 300 AND p.just_value > 10000
          GROUP BY 1, 2, 3`,
        [counties, zips, uses]
      )
      const found = new Map(r.rows.map(x => [`${x.county_no}|${x.phy_zip}|${x.dor_uc}`, x.n >= 15 ? Number(x.ppsf) : null]))
      for (const k of missing) {
        const v = found.has(k) ? found.get(k) : null
        zipCache.set(k, { value: v, expires: Date.now() + ZIP_TTL })
        out[k] = v
      }
    } catch (e) {
      console.error('ZIP median lookup failed:', e.message)
    }
  }
  return out
}

/*  p: { countyNo, zip, useCode, value, livingSqft, yearBuilt, owner, ownerState,
         homestead, absentee, recentSale, propertyType }
    zipPpsf: median value per sq ft for the same ZIP and property type (or null) */
function scoreProperty(p, zipPpsf) {
  const factors = []
  let score = 20
  const add = (pts, label) => { score += pts; factors.push({ points: pts, label }) }

  const owner = String(p.owner || '')
  const residential = p.useCode === null || p.useCode === undefined || RESIDENTIAL_USE.has(Number(p.useCode))

  if (GOVT.test(owner)) {
    return { score: 5, label: 'Low opportunity', factors: [{ points: 0, label: 'Government-owned property' }], preliminary: true }
  }

  if (p.absentee === true) add(20, 'Absentee owner (mailing address differs from property)')
  if (p.homestead === false && residential) add(8, 'No homestead exemption')
  if (p.ownerState && !/^(FL|FLORIDA)$/i.test(String(p.ownerState).trim())) add(10, 'Out-of-state owner')

  if (TRUST.test(owner)) add(10, 'Owned by a trust or estate')
  else if (COMPANY.test(owner)) add(5, 'Owned by an LLC / company')

  const yb = Number(p.yearBuilt)
  if (yb && yb < 1970) add(10, `Older property (built ${yb})`)
  else if (yb && yb < 1990) add(5, `Built ${yb}`)

  if (zipPpsf && p.value && p.livingSqft >= 300) {
    const ppsf = p.value / p.livingSqft
    const ratio = ppsf / zipPpsf
    if (ratio < 0.7) add(15, 'Assessed well below similar properties in the ZIP')
    else if (ratio < 0.85) add(8, 'Assessed below similar properties in the ZIP')
    else if (ratio > 1.4) add(-5, 'Assessed above similar properties in the ZIP')
  }

  /* County / city records (code cases, liens, building violations) */
  const f = p.records
  if (f) {
    if (f.unsafe) add(20, 'Unsafe structure case on record')
    else if (f.bv > 0) add(12, 'Open building violation')
    if (f.liens > 0) add(15, 'Code enforcement lien recorded')
    if (f.code > 0) add(10, 'Open code compliance case')
    if (f.recert > 0) add(8, 'Building recertification not completed')
    if (f.lp > 0) add(25, 'Lis pendens recorded (possible foreclosure or lawsuit)')
    if (f.probate > 0) add(15, 'Probate filing recorded')
    if (f.judg > 0) add(10, 'Judgment recorded')
    if (f.orliens > 0) add(10, 'Lien recorded')
  }

  if (p.recentSale) add(-10, 'Sold in the last 1–2 years')

  score = Math.max(0, Math.min(100, Math.round(score)))
  const label = score >= 76 ? 'High-priority lead' : score >= 51 ? 'Strong lead' : score >= 26 ? 'Possible lead' : 'Low opportunity'
  return { score, label, factors, preliminary: true }
}

function financeability(p) {
  const yb = Number(p.yearBuilt)
  if (p.useCode === 0 || p.useCode === 10) return 'cash-only'
  if (p.records?.unsafe) return 'cash-only'
  if (p.records && (p.records.bv > 0 || p.records.liens > 0)) return 'maybe-203k'
  if (yb && yb < 1960) return 'maybe-203k'
  if (yb) return 'maybe'
  return null
}

async function scoreMany(items) {
  /* Attach county-record flags (code cases, liens, violations) when the parcel is known */
  try {
    const { flagsFor } = require('../adapters/publicRecords')
    const flags = await flagsFor(items.map(p => ({ countyNo: p.countyNo, parcelId: p.parcelId })))
    for (const p of items) {
      if (p.countyNo && p.parcelId) p.records = flags.get(`${p.countyNo}|${String(p.parcelId).replace(/\D/g, '')}`) || null
    }
  } catch { /* scoring still works without them */ }
  const keys = [...new Set(items
    .filter(p => p.countyNo && p.zip && p.useCode !== null && p.useCode !== undefined)
    .map(p => `${p.countyNo}|${String(p.zip).slice(0, 5)}|${p.useCode}`))]
  const medians = keys.length ? await zipMedians(keys) : {}
  return items.map(p => {
    const key = `${p.countyNo}|${String(p.zip || '').slice(0, 5)}|${p.useCode}`
    return { ...scoreProperty(p, medians[key] ?? null), financeability: financeability(p) }
  })
}

module.exports = { scoreProperty, scoreMany, financeability }

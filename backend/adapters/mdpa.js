// backend/adapters/mdpa.js
// Miami-Dade Property Appraiser parcel data via public ArcGIS REST layer
// Source: gisweb.miamidade.gov (MD_LandInformation MapServer, Layer 26 - Parcels)
// Status: LIVE

const fetch = require('node-fetch')

const BASE = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/26/query'
const OUT_FIELDS = [
  'FOLIO','TRUE_SITE_ADDR','TRUE_SITE_CITY','TRUE_SITE_ZIP_CODE',
  'TRUE_MAILING_ADDR1','TRUE_MAILING_CITY','TRUE_MAILING_STATE','TRUE_MAILING_ZIP_CODE',
  'TRUE_OWNER1','TRUE_OWNER2','TRUE_OWNER3',
  'DOR_CODE_CUR','DOR_DESC','SUBDIVISION','PRIMARY_ZONE',
  'BEDROOM_COUNT','BATHROOM_COUNT','YEAR_BUILT',
  'BUILDING_HEATED_AREA','LOT_SIZE',
  'LAND_VAL_CUR','BUILDING_VAL_CUR','TOTAL_VAL_CUR','ASSESSMENT_YEAR_CUR'
].join(',')
const SUGGEST_FIELDS = 'FOLIO,TRUE_SITE_ADDR,TRUE_SITE_CITY,TRUE_SITE_ZIP_CODE'

async function runQuery(where, { fields = OUT_FIELDS, limit = 20, timeoutMs = 15000 } = {}) {
  const url = `${BASE}?where=${encodeURIComponent(where)}&outFields=${fields}&returnGeometry=false&f=json&resultRecordCount=${limit}`
  try {
    const res = await fetch(url, { timeout: timeoutMs })
    if (!res.ok) {
      console.error('MDPA HTTP error:', res.status)
      return null
    }
    const json = await res.json()
    if (json.error) {
      console.error('MDPA ArcGIS error:', json.error)
      return null
    }
    return json.features ? json.features.map(f => f.attributes) : []
  } catch (e) {
    console.error('MDPA fetch error:', e.message)
    return null
  }
}

/* ── Address clean-up so typed addresses match the county's format ──
   County records look like "58 NE 117 ST" — no "th", short street types,
   no city / state / ZIP. */
const DIRS = {
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W',
  NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW',
}
const TYPES = {
  STREET: 'ST', STR: 'ST', AVENUE: 'AVE', AV: 'AVE', ROAD: 'RD', DRIVE: 'DR', COURT: 'CT',
  TERRACE: 'TER', TERR: 'TER', PLACE: 'PL', LANE: 'LN', BOULEVARD: 'BLVD', CIRCLE: 'CIR',
  PARKWAY: 'PKWY', HIGHWAY: 'HWY',
}
const CITIES = [
  'NORTH MIAMI BEACH', 'MIAMI GARDENS', 'MIAMI SHORES', 'MIAMI LAKES', 'MIAMI BEACH', 'NORTH MIAMI',
  'SOUTH MIAMI', 'WEST MIAMI', 'MIAMI', 'EL PORTAL', 'BISCAYNE PARK', 'HIALEAH GARDENS', 'HIALEAH',
  'CORAL GABLES', 'DORAL', 'HOMESTEAD', 'FLORIDA CITY', 'KEY BISCAYNE', 'AVENTURA', 'SURFSIDE',
  'BAL HARBOUR', 'BAY HARBOR ISLANDS', 'SUNNY ISLES BEACH', 'NORTH BAY VILLAGE', 'OPA LOCKA',
  'SWEETWATER', 'CUTLER BAY', 'PALMETTO BAY', 'PINECREST', 'MEDLEY', 'VIRGINIA GARDENS',
]

function normalizeAddress(raw, { partial = false } = {}) {
  let s = String(raw || '').toUpperCase().split(',')[0]
  s = s.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

  // Drop ZIP, state and city typed without commas: "58 NE 117TH MIAMI FL 33161"
  s = s.replace(/\s\d{5}(\s?\d{4})?$/, '').replace(/\s(FL|FLORIDA)$/, '').trim()
  for (const c of CITIES) {
    if (s.endsWith(' ' + c) && s.length > c.length + 4) { s = s.slice(0, -(c.length + 1)).trim(); break }
  }

  const tokens = s.split(' ').filter(Boolean)
  const out = tokens.map((t, i) => {
    if (i === 0) return t                                       // house number stays as typed
    if (DIRS[t]) return DIRS[t]
    if (TYPES[t]) return TYPES[t]
    const ord = t.match(/^(\d+)(ST|ND|RD|TH)$/)                 // 117TH -> 117
    if (ord) return ord[1]
    if (partial && i === tokens.length - 1) {
      const half = t.match(/^(\d+)(S|N|R|T)$/)                  // still typing: 117T -> 117
      if (half) return half[1]
    }
    return t
  })
  return out.join(' ')
}

const sqlText = (s) => s.replace(/'/g, "''")
const titleCase = (s) => String(s).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())

async function searchByAddress(address) {
  const norm = normalizeAddress(address)
  const rows = await runQuery(`UPPER(TRUE_SITE_ADDR) LIKE '%${sqlText(norm)}%'`)
  if (rows && rows.length) return rows
  /* Fall back to the address exactly as typed */
  const raw = address.trim().toUpperCase()
  if (raw === norm) return rows
  return runQuery(`UPPER(TRUE_SITE_ADDR) LIKE '%${sqlText(raw)}%'`)
}

/* ── Type-ahead suggestions: real Miami-Dade addresses that start with what was typed ── */
const suggestCache = new Map()
const SUGGEST_TTL = 10 * 60 * 1000

async function suggestAddresses(text, limit = 8) {
  const norm = normalizeAddress(text, { partial: true })
  if (norm.length < 3 || !/^\d/.test(norm)) return []

  const key = `${norm}|${limit}`
  const hit = suggestCache.get(key)
  if (hit && hit.expires > Date.now()) return hit.items

  const opts = { fields: SUGGEST_FIELDS, limit: limit * 3, timeoutMs: 8000 }
  let rows = await runQuery(`TRUE_SITE_ADDR LIKE '${sqlText(norm)}%'`, opts)
  if (rows === null) return null
  /* Nothing found with the cleaned-up text — try it exactly as typed */
  const raw = String(text).toUpperCase().split(',')[0].replace(/\s+/g, ' ').trim()
  if (!rows.length && raw !== norm) {
    rows = (await runQuery(`TRUE_SITE_ADDR LIKE '${sqlText(raw)}%'`, opts)) || []
  }

  const seen = new Set()
  const items = []
  for (const r of rows) {
    if (!r.TRUE_SITE_ADDR || !r.FOLIO) continue
    const city = titleCase(r.TRUE_SITE_CITY || 'Miami')
    const zip = r.TRUE_SITE_ZIP_CODE ? String(r.TRUE_SITE_ZIP_CODE).slice(0, 5) : ''
    const label = `${r.TRUE_SITE_ADDR}, ${city} FL ${zip}`.trim()
    if (seen.has(label)) continue
    seen.add(label)
    items.push({ folio: r.FOLIO, address: r.TRUE_SITE_ADDR, city, zip, label })
  }
  items.sort((a, b) => a.address.localeCompare(b.address, 'en', { numeric: true }))
  const result = items.slice(0, limit)

  if (suggestCache.size > 1000) suggestCache.clear()
  suggestCache.set(key, { items: result, expires: Date.now() + SUGGEST_TTL })
  return result
}

async function searchByFolio(folio) {
  const clean = folio.replace(/[-\s]/g, '')
  return runQuery(`FOLIO = '${sqlText(clean)}'`)
}

async function searchByOwnerName(name) {
  const clean = sqlText(name.trim().toUpperCase())
  return runQuery(`UPPER(TRUE_OWNER1) LIKE '%${clean}%' OR UPPER(TRUE_OWNER2) LIKE '%${clean}%'`)
}

function parse(r) {
  if (!r) return null
  return {
    folio: r.FOLIO,
    address: r.TRUE_SITE_ADDR,
    city: r.TRUE_SITE_CITY || 'Miami',
    zip: r.TRUE_SITE_ZIP_CODE,
    owner1: r.TRUE_OWNER1,
    owner2: r.TRUE_OWNER2,
    mailingAddr: r.TRUE_MAILING_ADDR1,
    mailingCity: r.TRUE_MAILING_CITY,
    mailingState: r.TRUE_MAILING_STATE,
    mailingZip: r.TRUE_MAILING_ZIP_CODE,
    propertyType: r.DOR_DESC,
    subdivision: r.SUBDIVISION,
    zoning: r.PRIMARY_ZONE,
    yearBuilt: r.YEAR_BUILT,
    livingArea: r.BUILDING_HEATED_AREA,
    lotSize: r.LOT_SIZE,
    beds: r.BEDROOM_COUNT,
    baths: r.BATHROOM_COUNT,
    landValue: r.LAND_VAL_CUR,
    buildingValue: r.BUILDING_VAL_CUR,
    assessedValue: r.TOTAL_VAL_CUR,
    assessmentYear: r.ASSESSMENT_YEAR_CUR,
    source: 'Miami-Dade Property Appraiser (GIS Open Data)',
    sourceUrl: 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_LandInformation/MapServer/26',
    fetchedAt: new Date().toISOString()
  }
}

module.exports = { searchByAddress, searchByFolio, searchByOwnerName, suggestAddresses, normalizeAddress, parse }

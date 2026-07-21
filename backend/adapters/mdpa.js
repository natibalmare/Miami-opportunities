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

async function runQuery(where) {
  const url = `${BASE}?where=${encodeURIComponent(where)}&outFields=${OUT_FIELDS}&returnGeometry=false&f=json&resultRecordCount=20`
  try {
    const res = await fetch(url)
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

async function searchByAddress(address) {
  const clean = address.trim().toUpperCase().replace(/'/g, "''")
  return runQuery(`UPPER(TRUE_SITE_ADDR) LIKE '%${clean}%'`)
}

async function searchByFolio(folio) {
  const clean = folio.replace(/[-\s]/g, '')
  return runQuery(`FOLIO = '${clean}'`)
}

async function searchByOwnerName(name) {
  const clean = name.trim().toUpperCase().replace(/'/g, "''")
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

module.exports = { searchByAddress, searchByFolio, searchByOwnerName, parse }

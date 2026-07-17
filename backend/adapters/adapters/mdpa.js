const fetch = require('node-fetch')

const BASE = 'https://apps.miamidadepa.gov/propertysearch/api'
const HEADERS = {
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://apps.miamidadepa.gov/propertysearch/',
  'User-Agent': 'Mozilla/5.0 (compatible; MiamiOpportunities/1.0)'
}

async function searchByAddress(address) {
  try {
    const url = `${BASE}/address?addr=${encodeURIComponent(address.toUpperCase())}&fold=&folio=&owner=`
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) return null
    return await res.json()
  } catch (e) { console.error('MDPA address error:', e.message); return null }
}

async function searchByFolio(folio) {
  try {
    const clean = folio.replace(/[-\s]/g, '')
    const url = `${BASE}/folio?folioNumber=${clean}`
    const res = await fetch(url, { headers: HEADERS })
    if (!res.ok) return null
    return await res.json()
  } catch (e) { console.error('MDPA folio error:', e.message); return null }
}

function parse(raw) {
  if (!raw) return null
  const r = Array.isArray(raw) ? raw[0] : raw
  return {
    folio:         r.FOLIO || r.folio,
    address:       r.SITE_ADDR || r.siteAddress,
    city:          r.CITY || 'Miami',
    zip:           r.ZIP_CD || r.zipCode,
    owner1:        r.OWN1 || r.owner1,
    owner2:        r.OWN2 || r.owner2,
    mailingAddr:   r.MAIL_ADDR1 || r.mailingAddress1,
    propertyType:  r.DOR_DESC || r.dorDescription,
    yearBuilt:     r.YR_BLT || r.yearBuilt,
    livingArea:    r.TOT_LVG_AREA || r.totalLivingArea,
    lotSize:       r.LOT_SIZE || r.lotSize,
    beds:          r.BED_RMS || r.bedrooms,
    baths:         r.BATH || r.bathrooms,
    assessedValue: r.ASS_VAL || r.assessedValue,
    homestead:     (r.HMSTD_VAL > 0) || false,
    lastSaleDate:  r.SALE_DATE1 || r.lastSaleDate,
    lastSaleAmt:   r.SALE_AMT1 || r.lastSaleAmount,
    source:        'Miami-Dade Property Appraiser',
    sourceUrl:     'https://apps.miamidadepa.gov/propertysearch/',
    fetchedAt:     new Date().toISOString()
  }
}

module.exports = { searchByAddress, searchByFolio, parse }

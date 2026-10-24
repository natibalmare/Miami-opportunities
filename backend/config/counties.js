// Counties MO covers. `no` is the Florida Department of Revenue county number.
// To add a county later: add a line here — the nightly data job loads it automatically.

const COUNTIES = {
  23: {
    no: 23, slug: 'miami-dade', name: 'Miami-Dade',
    fdorFile: /^Dade\b/i,
    pinFile: /^miami-?dade_\d{4}pin\.zip$/i,
    appraiserUrl: 'https://www.miamidade.gov/Apps/PA/propertysearch/',
    taxUrl: 'https://miamidade.county-taxes.com',
    clerkUrl: 'https://www.miamidadeclerk.gov',
    foreclosureUrl: 'https://www.miamidade.realforeclose.com',
    hasBedsBaths: true,
  },
  16: {
    no: 16, slug: 'broward', name: 'Broward',
    fdorFile: /^Broward\b/i,
    pinFile: /^broward_\d{4}pin\.zip$/i,
    appraiserUrl: 'https://bcpa.net',
    taxUrl: 'https://www.broward.org/RecordsTaxesTreasury/TaxesFees/Pages/PropertyTaxes.aspx',
    clerkUrl: 'https://www.browardclerk.org',
    foreclosureUrl: 'https://www.browardclerk.org',
    hasBedsBaths: false,
  },
  60: {
    no: 60, slug: 'palm-beach', name: 'Palm Beach',
    fdorFile: /^Palm Beach\b/i,
    pinFile: /^palm_?beach_\d{4}pin\.zip$/i,
    appraiserUrl: 'https://pbcpao.gov',
    taxUrl: 'https://www.pbctax.gov',
    clerkUrl: 'https://www.mypalmbeachclerk.com',
    foreclosureUrl: 'https://www.mypalmbeachclerk.com',
    hasBedsBaths: false,
  },
}

/* Florida DOR property use codes (3-digit DOR_UC) grouped into simple types */
const PROPERTY_TYPES = {
  'single-family':  { label: 'Single Family', codes: [1] },
  'condo':          { label: 'Condo', codes: [4] },
  'multi-small':    { label: 'Multi-Family (2–9 units)', codes: [8] },
  'multi-large':    { label: 'Multi-Family (10+ units)', codes: [3] },
  'mobile':         { label: 'Mobile Home', codes: [2] },
  'coop':           { label: 'Co-op', codes: [5] },
  'vacant-res':     { label: 'Vacant Residential Land', codes: [0] },
  'commercial':     { label: 'Commercial', codes: range(10, 39) },
  'vacant-com':     { label: 'Vacant Commercial Land', codes: [10] },
  'industrial':     { label: 'Industrial', codes: range(40, 49) },
}

const USE_LABELS = {
  0: 'Vacant Residential', 1: 'Single Family', 2: 'Mobile Home', 3: 'Multi-Family 10+ Units', 4: 'Condominium',
  5: 'Co-op', 6: 'Retirement Home', 7: 'Misc. Residential', 8: 'Multi-Family 2–9 Units', 9: 'Residential Common Area',
  10: 'Vacant Commercial', 11: 'Store / Retail', 12: 'Mixed Use Store/Office/Residential', 17: 'Office (1 story)',
  18: 'Office (multi-story)', 21: 'Restaurant', 27: 'Auto Sales / Service', 39: 'Hotel / Motel',
  40: 'Vacant Industrial', 48: 'Warehouse', 70: 'Vacant Institutional', 71: 'Church', 86: 'County Owned', 89: 'Municipal',
}

function range(a, b) { const out = []; for (let i = a; i <= b; i++) out.push(i); return out }

function useLabel(code) {
  if (code === null || code === undefined) return null
  if (USE_LABELS[code]) return USE_LABELS[code]
  if (code >= 10 && code <= 39) return 'Commercial'
  if (code >= 40 && code <= 49) return 'Industrial'
  if (code >= 50 && code <= 69) return 'Agricultural'
  if (code >= 70 && code <= 79) return 'Institutional'
  if (code >= 80 && code <= 89) return 'Government'
  return 'Other'
}

module.exports = { COUNTIES, PROPERTY_TYPES, useLabel }

/* ──────────────────────────────────────────────────────────────────────────────
   MOCK DATABASE — Replace with live API calls as each source is connected
   Every field maps to a real public record source
   ────────────────────────────────────────────────────────────────────────────── */

export const PROPERTIES = {
  /* ── 332 NW 35th St — Active Foreclosure Auction ── */
  '01-3125-024-0220': {
    folio:        '01-3125-024-0220',
    address:      '332 NW 35th St',
    city:         'Miami',
    state:        'FL',
    zip:          '33127',
    neighborhood: 'Northern Blvd',
    county:       'Miami-Dade',
    propertyType: 'Multifamily',
    subdivision:  'Northern Blvd Tr Pb 2-29',
    yearBuilt:    1954,
    effectiveYear: 1970,
    beds:         4,
    baths:        4,
    livingArea:   2305,
    lotSize:      6900,
    construction: 'Concrete Block',
    stories:      1,
    floodZone:    null,
    zoning:       'T4-R',
    units:        4,
    score:        86,
    financeability: 'cash-only',

    owner: {
      name:         '332 New Latest House Project LLC',
      type:         'LLC',
      mailing:      '332 NW 35th St, Miami FL 33127',
      matchesProp:  true,
      homestead:    false,
      occupancy:    'owner-occupied', /* per records — actual use may differ */
      llcState:     'Florida',
      sunbizId:     'L21000495603',
    },

    tax: {
      currentYear:      2025,
      annualTax:        22007.30,
      assessedValue:    1024992,
      assessedLand:     862500,
      assessedImprove:  162492,
      marketValue:      1024992,
      status:           'verify', /* must check live — source pending */
      delinquent:       null,
      taxCert:          false,
      sourceUrl:        'https://miamidade.county-taxes.com',
    },

    mortgage: {
      freeClear:        false,
      amount:           1015000,
      lender:           'Housemax Funding LLC',
      date:             '2023-03-20',
      term:             360,
      doc:              'New Conventional',
      maturity:         '2053-04-01',
      position:         1,
      estBalance:       1002000, /* estimate — verify with title */
    },

    deeds: [
      { date: '2021-11-01', type: 'Warranty Deed', grantor: 'Gilpin Hilda', grantee: '332 New Latest House Project LLC', amount: 860000, book: 32822, page: 3297 },
      { date: '1997-11-10', type: 'Warranty Deed', grantor: 'Previous Owner',  grantee: 'Gilpin Hilda', amount: 74700, book: 17862, page: 1898 },
    ],

    liens: [
      { type: 'Mortgage Lien', creditor: 'Housemax Funding LLC', amount: 1015000, date: '2023-03-20', status: 'open', instrNo: 'New Conventional', position: 1 },
    ],

    foreclosure: {
      lispendens:   true,
      active:       true,
      caseNo:       '2024-018906-CA-01',
      filingDate:   '2024-01-15',
      plaintiff:    'Massachusetts Mutual Life Insurance',
      defendant:    '332 New Latest House Project LLC',
      status:       'Final Judgment Entered',
      finalJudgment: 1367660,
      auctionDate:  '2026-07-27',
      auctionUrl:   'https://www.miamidade.realforeclose.com/index.cfm?zaction=AUCTION&Zmethod=PREVIEW&AUCTIONDATE=07/27/2026',
      openingBid:   null,
      urgency:      'high',
      recommendation: 'attorney',
    },

    permits: [
      /* No permits on record for this property — source pending integration */
    ],

    codeViolations: [
      /* Source pending — check miamidade.gov/global/service.page */
    ],

    valuation: {
      pov:          1113750,
      povHigh:      1564830,
      povLow:       662677,
      confidence:   18,
      priceSqft:    483,
      arvEstimate:  1350000,
      asIsEstimate: 1113750,
      source:       'PropertyOnion POV · MLS comps pending integration',
    },

    comps: [
      { address: '318 NW 34th St', soldDate: '2025-03-10', soldPrice: 985000,  sqft: 2180, distance: '0.1 mi', adjPrice: 992000, type: 'Multifamily' },
      { address: '401 NW 36th St', soldDate: '2025-01-08', soldPrice: 1050000, sqft: 2350, distance: '0.2 mi', adjPrice: 1038000, type: 'Multifamily' },
      { address: '228 NW 33rd Ct', soldDate: '2025-02-20', soldPrice: 890000,  sqft: 2100, distance: '0.3 mi', adjPrice: 897000, type: 'Multifamily' },
    ],

    nextSteps: [
      'Look up LLC registered agent at search.sunbiz.org — search "332 New Latest House Project LLC" for the human behind the entity',
      'Call a real estate attorney today — 24 days to auction is not enough time without legal help already engaged',
      'Contact Massachusetts Mutual Life loss mitigation — lender may prefer short payoff over auction that doesn\'t cover judgment',
      'Verify opening bid at miamidade.realforeclose.com — if below judgment, math may change significantly',
      'Run title search through title company before auction, not after',
      'Confirm zoning and rental income for all 4 units — this is an income property, not a flip',
      'Do not approach as FHA or conventional — multifamily foreclosure eliminates all agency financing',
    ],

    strategy: 'This 4-unit multifamily in Miami\'s Northern Blvd subdivision is LLC-owned and heading to foreclosure auction on 07/27/2026 — 24 days out. The final judgment of $1,367,660 exceeds the estimated POV of $1,113,750, meaning any bidder following the 70% ARV rule would be outbid by the plaintiff unless the market supports a higher price. FHA, conventional, and 203(k) financing are all blocked at a foreclosure auction. Your options: (1) bid at auction with certified funds, (2) contact the LLC\'s registered agent via Florida SunBiz immediately and negotiate a short-sale with the lender before the auction, or (3) monitor for auction cancellation or reset. Do not mail to the property address — this is an LLC, not an individual.',

    dataSources: [
      { name: 'PropertyOnion', status: 'manual-import',       lastChecked: '2026-07-03', confidence: 90 },
      { name: 'Miami-Dade PA',  status: 'pending-integration', lastChecked: null,         confidence: 0 },
      { name: 'Tax Collector',  status: 'pending-integration', lastChecked: null,         confidence: 0 },
      { name: 'Clerk Records',  status: 'pending-integration', lastChecked: null,         confidence: 0 },
      { name: 'Civil Courts',   status: 'pending-integration', lastChecked: null,         confidence: 0 },
      { name: 'realforeclose.com', status: 'live-link',        lastChecked: '2026-07-03', confidence: 95 },
      { name: 'SunBiz',        status: 'pending-integration', lastChecked: null,         confidence: 0 },
      { name: 'City Permits',  status: 'pending-integration', lastChecked: null,         confidence: 0 },
      { name: 'MLS / iMapp',   status: 'auth-required',       lastChecked: null,         confidence: 0 },
    ],
  },

  /* ── 1425 NE 83rd St — Absentee Owner, Tax Delinquent ── */
  '01-3207-004-0310': {
    folio:        '01-3207-004-0310',
    address:      '1425 NE 83rd St',
    city:         'Miami',
    state:        'FL',
    zip:          '33138',
    neighborhood: 'Shorecrest',
    county:       'Miami-Dade',
    propertyType: 'Single Family',
    subdivision:  'Shorecrest',
    yearBuilt:    1951,
    effectiveYear: 1965,
    beds:         3,
    baths:        2,
    livingArea:   1842,
    lotSize:      7500,
    construction: 'CBS',
    stories:      1,
    floodZone:    'AE',
    zoning:       'RS-2',
    units:        1,
    score:        78,
    financeability: 'maybe-203k',

    owner: {
      name:       'Rodriguez, Carlos A',
      type:       'Individual',
      mailing:    '3210 SW 14th Ave, Hialeah FL 33012',
      matchesProp: false,
      homestead:  false,
      occupancy:  'absentee-owner',
      llcState:   null,
      sunbizId:   null,
    },

    tax: {
      currentYear:     2025,
      annualTax:       7284,
      assessedValue:   412800,
      assessedLand:    220000,
      assessedImprove: 192800,
      marketValue:     412800,
      status:          'delinquent',
      delinquent:      true,
      priorYearDelinquent: true,
      amountDue:       14890,
      taxCert:         true,
      sourceUrl:       'https://miamidade.county-taxes.com',
    },

    mortgage: {
      freeClear:   false,
      amount:      150000,
      lender:      'Wells Fargo Bank NA',
      date:        '2009-03-14',
      term:        360,
      doc:         'Conventional',
      maturity:    '2039-03-01',
      position:    1,
      estBalance:  62000,
      assignments: 2,
    },

    deeds: [
      { date: '2009-03-14', type: 'Warranty Deed', grantor: 'Smith, John', grantee: 'Rodriguez, Carlos A', amount: 187500, book: null, page: null, instrNo: '2009R-0341221' },
      { date: '1998-06-02', type: "Personal Rep Deed", grantor: 'Estate of Mary Smith', grantee: 'Smith, John', amount: 100, book: null, page: null, instrNo: '1998R-0189044' },
    ],

    liens: [
      { type: 'Code Enforcement Lien', creditor: 'City of Miami', amount: 4800, date: '2022-08-10', status: 'open', instrNo: '2022R-1043221' },
      { type: 'HOA Lien',             creditor: 'Shorecrest HOA', amount: 3200, date: '2023-01-15', status: 'open', instrNo: '2023R-0012884' },
      { type: "Mechanic's Lien",      creditor: 'Pro Roofing LLC', amount: 8500, date: '2023-06-20', status: 'open', instrNo: '2023R-0189044' },
    ],

    foreclosure: {
      lispendens:   false,
      active:       false,
      urgency:      'low',
      recommendation: 'contact-seller',
    },

    permits: [
      { type: 'Roof Permit',     number: 'B2019-123456', status: 'expired', date: '2019-07-01', desc: 'Reroof — shingle' },
      { type: 'Electrical',      number: 'E2021-078901', status: 'open',    date: '2021-11-15', desc: 'Panel upgrade 200A' },
      { type: 'Addition',        number: 'B2020-045678', status: 'closed',  date: '2020-03-22', desc: 'Garage conversion' },
    ],

    codeViolations: [
      { case: 'CE-2022-0089123', type: 'Overgrown vegetation', status: 'open', date: '2022-07-05', fine: 250 },
      { case: 'CE-2023-0041122', type: 'Fence without permit', status: 'open', date: '2023-02-14', fine: 500 },
    ],

    fhaFlags: ['Expired roof permit', 'Open electrical permit', 'Open code liens — title not clear', 'Tax delinquency — must cure at closing'],

    valuation: {
      pov:          490000,
      povHigh:      535000,
      povLow:       455000,
      confidence:   72,
      priceSqft:    266,
      arvEstimate:  620000,
      asIsEstimate: 490000,
      source:       'MLS comps pending · MDPA assessed value $412,800',
    },

    comps: [
      { address: '1312 NE 82nd Terr', soldDate: '2025-03-10', soldPrice: 510000, sqft: 1760, distance: '0.2 mi', adjPrice: 502000, type: 'SF' },
      { address: '830 NE 131st St',   soldDate: '2025-02-28', soldPrice: 485000, sqft: 1900, distance: '0.4 mi', adjPrice: 491000, type: 'SF' },
      { address: '1155 NE 87th St',   soldDate: '2025-01-15', soldPrice: 475000, sqft: 1820, distance: '0.5 mi', adjPrice: 478000, type: 'SF' },
    ],

    nextSteps: [
      'Contact owner respectfully — absentee-owned with mailing in Hialeah, may be motivated',
      'Send direct mail to owner mailing address: 3210 SW 14th Ave, Hialeah FL 33012',
      'Verify payoff amount and all lien totals with title company before any offer',
      'Close expired roof permit (2019) and open electrical permit (2021) before FHA/conventional',
      'Consider FHA 203(k) renovation loan — permits and code issues require resolution',
      'Order home inspection before submitting offer',
      'Confirm lender acceptability — standard FHA may not pass given current permit/code status',
    ],

    strategy: 'This Shorecrest property is absentee-owned with the owner\'s mailing address in Hialeah. There is no homestead exemption, taxes appear delinquent for 2+ years with a tax certificate on file, and three open liens total ~$16,500. An expired roof permit and open electrical permit may block FHA/conventional financing. Estimated equity is significant (~$428K based on $490K as-is value and ~$62K estimated mortgage balance). This is a strong direct-mail outreach candidate. Before any offer: verify all lien amounts with title, resolve permit status, and confirm FHA 203(k) or conventional feasibility with your lender. Do not represent the owner as being forced to sell.',

    dataSources: [
      { name: 'Miami-Dade PA',   status: 'pending-integration', lastChecked: null, confidence: 0 },
      { name: 'Tax Collector',   status: 'pending-integration', lastChecked: null, confidence: 0 },
      { name: 'Clerk Records',   status: 'pending-integration', lastChecked: null, confidence: 0 },
      { name: 'City Permits',    status: 'pending-integration', lastChecked: null, confidence: 0 },
      { name: 'MLS / iMapp',    status: 'auth-required',       lastChecked: null, confidence: 0 },
    ],
  },

  /* ── 415 NE 75th St — Probate / Long-time Ownership ── */
  '01-3206-008-0220': {
    folio:        '01-3206-008-0220',
    address:      '415 NE 75th St',
    city:         'Miami',
    state:        'FL',
    zip:          '33138',
    neighborhood: 'Upper East Side',
    county:       'Miami-Dade',
    propertyType: 'Single Family',
    yearBuilt:    1955,
    beds:         4,
    baths:        3,
    livingArea:   2140,
    lotSize:      9100,
    floodZone:    'AE',
    zoning:       'RS-1',
    score:        71,
    financeability: 'maybe',

    owner: {
      name:       'Estate of Wallace, Thomas J',
      type:       'Probate Estate',
      mailing:    '415 NE 75th St, Miami FL 33138',
      matchesProp: true,
      homestead:  false,
      occupancy:  'unknown',
    },

    tax: {
      currentYear: 2025, annualTax: 8840, assessedValue: 521200, status: 'paid', delinquent: false,
    },

    mortgage: { freeClear: true, amount: null, lender: null, estBalance: 0 },

    foreclosure: { lispendens: false, active: false, urgency: 'low', recommendation: 'research-probate' },

    valuation: {
      pov: 680000, povHigh: 740000, povLow: 620000, confidence: 68,
      priceSqft: 318, arvEstimate: 820000, asIsEstimate: 680000,
    },

    comps: [
      { address: '812 NE 77th St',  soldDate: '2025-02-14', soldPrice: 695000, sqft: 2200, distance: '0.2 mi', adjPrice: 682000, type: 'SF' },
      { address: '630 NE 74th St',  soldDate: '2025-01-08', soldPrice: 660000, sqft: 2050, distance: '0.3 mi', adjPrice: 671000, type: 'SF' },
    ],

    nextSteps: [
      'Search Miami-Dade Probate Court for active estate case — miamidadeclerk.gov/clerk/civil-court.page',
      'Identify personal representative (executor) — they have authority to sell, not the heirs',
      'Verify property is free and clear of all mortgages (appears so) with title company',
      'Property may be eligible for FHA/conventional if in good condition — inspect first',
      'Approach estate attorney or personal representative, not family members directly',
    ],

    strategy: 'This Upper East Side property appears to be in probate — owned by an estate with no active mortgage. Long-time ownership (1987 purchase at $89K, now worth ~$680K) suggests significant equity. The property may be eligible for FHA or conventional financing if condition is sound. The correct outreach is to the estate\'s personal representative, not individual family members. Verify probate case status in Miami-Dade Civil/Probate court records before any approach.',

    dataSources: [
      { name: 'Miami-Dade PA',     status: 'pending-integration', lastChecked: null, confidence: 0 },
      { name: 'Probate Court',     status: 'pending-integration', lastChecked: null, confidence: 0 },
    ],
  }
}

/* Normalize address for lookup */
export function normalize(q) {
  return q.trim().toLowerCase()
    .replace(/,?\s*(miami|fl|florida|33127|33128|33133|33138|33139|33140|33141|33150|33160|33161|33162|33163)\b.*/g, '')
    .replace(/\bstreet\b/g, 'st').replace(/\bavenue\b/g, 'ave')
    .replace(/\bnorthwest\b/g, 'nw').replace(/\bnortheast\b/g, 'ne')
    .replace(/\bsouthwest\b/g, 'sw').replace(/\bsoutheast\b/g, 'se')
    .trim()
}

const ADDR_INDEX = {
  '332 nw 35th st':  '01-3125-024-0220',
  '1425 ne 83rd st': '01-3207-004-0310',
  '415 ne 75th st':  '01-3206-008-0220',
}

const FOLIO_INDEX = {
  '01-3125-024-0220': '01-3125-024-0220',
  '01-3207-004-0310': '01-3207-004-0310',
  '01-3206-008-0220': '01-3206-008-0220',
}

const OWNER_INDEX = {
  'rodriguez, carlos a': '01-3207-004-0310',
  'rodriguez carlos':    '01-3207-004-0310',
  '332 new latest house project llc': '01-3125-024-0220',
  '332 new latest': '01-3125-024-0220',
  'estate of wallace': '01-3206-008-0220',
  'wallace':           '01-3206-008-0220',
}

export function lookupProperty(raw) {
  const q = normalize(raw)
  /* Direct folio */
  if (FOLIO_INDEX[q.replace(/\s/g, '')]) return PROPERTIES[FOLIO_INDEX[q.replace(/\s/g, '')]]
  /* Address */
  for (const [key, folio] of Object.entries(ADDR_INDEX)) {
    if (q.startsWith(key) || key.startsWith(q)) return PROPERTIES[folio]
  }
  /* Owner */
  for (const [key, folio] of Object.entries(OWNER_INDEX)) {
    if (q.includes(key) || key.includes(q)) return PROPERTIES[folio]
  }
  return null
}

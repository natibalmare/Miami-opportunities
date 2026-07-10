const SOURCES = [
  { name: 'Miami-Dade Property Appraiser', type: 'Free Public REST API', url: 'https://www.miamidade.gov/propertysearch', status: 'pending', fields: ['Folio','Owner name & mailing','Assessed value','Homestead','Year built','Beds/baths','Living area','Lot size','Flood zone','Zoning'], note: 'Public REST API — no auth required' },
  { name: 'Miami-Dade Tax Collector',       type: 'Free Public Access',   url: 'https://miamidade.county-taxes.com', status: 'pending', fields: ['Tax status','Delinquency flag','Tax certificates','Tax deed applications','Amount due'], note: 'Public portal — backend scraper or API' },
  { name: 'Miami-Dade Clerk Official Records', type: 'Paid Search Units ($1/unit)', url: 'https://onlineservices.miamidadeclerk.gov/officialrecords', status: 'pending', fields: ['Deeds','Mortgages','Lis pendens','HOA liens','Mechanic\'s liens','Judgments','Satisfactions'], note: 'Purchase search units at onlineservices.miamidadeclerk.gov — backend stores account credentials encrypted' },
  { name: 'Miami-Dade Civil / Probate Courts', type: 'Free Registered Account', url: 'https://www.miamidadeclerk.gov/clerk/civil-court.page', status: 'pending', fields: ['Foreclosure cases','Case status','Judge','Probate cases','Divorce/family cases','Civil judgments'], note: 'Register for advanced access — free for court records per Florida Supreme Court standards' },
  { name: 'Miami-Dade Foreclosure Auctions', type: 'Free Public Access', url: 'https://miamidade.realforeclose.com', status: 'live-link', fields: ['Auction dates','Opening bids','Bidding registration','Certificate of Sale','Auction outcomes'], note: 'MO links directly to auction records — no scraping, live links only' },
  { name: 'Miami-Dade Foreclosure Registry', type: 'Free Public Search', url: 'https://bldgappl.miamidade.gov/foreclosureregistry/default.aspx', status: 'live-link', fields: ['Registered foreclosure properties','Lis pendens verification','Inspection records'], note: 'Public search — deep-link to specific properties' },
  { name: 'City of Miami Permits',   type: 'Public Portal — API Pending', url: 'https://www.miamigov.com/epermit', status: 'pending', fields: ['Building permits','Code violations','Open/expired/closed status','Unsafe structure'], note: 'Public portal — backend automation or official API when available' },
  { name: 'Florida SunBiz (FDOS)',   type: 'Free Public Search', url: 'https://search.sunbiz.org', status: 'live-link', fields: ['LLC registered agent','Officers/directors','Annual report status','Formation date','Related entities'], note: 'Critical for LLC-owned properties — free public database' },
  { name: 'MLS / Miami Realtors',   type: 'Authorized MLS Access Required', url: 'https://www.miamirealtors.com', status: 'auth-required', fields: ['Active listings','Sold comps','DOM','Price history','MLS remarks','Expired listings'], note: 'Requires broker authorization and MLS login — stored encrypted on backend only. No credentials in frontend.' },
  { name: 'iMapp',                  type: 'Subscription Required', url: 'https://www.imapp.com', status: 'auth-required', fields: ['MLS overlay','Tax records','Comp analysis','Map layers','Owner data'], note: 'Your existing subscription — credentials stored encrypted on backend only' },
  { name: 'BatchSkipTracing',        type: '$0.15–0.25 per record', url: 'https://www.batchskiptracing.com', status: 'pending', fields: ['Owner phone numbers','Emails','Associated addresses','LLC member lookup'], note: 'Pay-per-use — charged per report when skip trace is requested by user' },
  { name: 'Google Maps / Mapbox',   type: 'API Key Required', url: 'https://maps.googleapis.com', status: 'pending', fields: ['Geocoding','Street View','Property map','Distance calculations'], note: 'Add VITE_MAPS_KEY to Vercel environment variables' },
]

export default function DataSources() {
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5, marginBottom: 6 }}>Data Sources</div>
      <div style={{ fontSize: 12, color: '#9A9488', marginBottom: 20 }}>Configure and monitor all integrations — each source connects independently</div>

      <div className="alert alert-info" style={{ marginBottom: 18 }}>
        All API credentials are stored encrypted on the backend server only. No keys, tokens, or passwords are stored in the frontend or browser at any time. Each source is independently configurable.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SOURCES.map((s, i) => (
          <div key={i} className="card">
            <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: '#9A9488', marginBottom: 6 }}>
                  {s.type} ·
                  <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#A88C38', marginLeft: 4 }}>{s.url}</a>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {s.fields.map(f => <span key={f} style={{ background: '#F4F0E8', border: '1px solid #DDD8CC', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>{f}</span>)}
                </div>
                <div style={{ fontSize: 11, color: '#9A9488', fontStyle: 'italic' }}>{s.note}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                <span className={`badge badge-${s.status === 'live-link' ? 'green' : s.status === 'auth-required' ? 'blue' : 'gold'}`}>
                  {s.status === 'pending' ? 'Pending Integration' : s.status === 'live-link' ? 'Live Link' : 'Auth Required'}
                </span>
                <button className="btn btn-outline btn-sm">⚙ Configure</button>
                <button className="btn btn-outline btn-sm">↻ Test</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

import { useNavigate } from 'react-router-dom'

const LIVE = [
  ['Every property, three counties', 'About 2.3 million Miami-Dade, Broward and Palm Beach properties with owner, mailing address, value, size, year built and recent sales — refreshed automatically.'],
  ['Opportunity Score', 'A 0–100 score on every property, with the reasons behind it: absentee or out-of-state owner, trust or LLC ownership, older homes, value below the neighborhood and more.'],
  ['Criteria search & lead lists', 'Search by location, property type, living area, lot size, beds/baths, year built, value, owner type and occupancy — or start from a ready-made lead list. Export to CSV.'],
  ['Investment calculators', 'Mortgage payment with this week’s average rate, plus rental cash flow, cap rate and cash-on-cash return using area rent benchmarks.'],
  ['Pre-offer property report', 'Everything on one page instead of four or five county websites — for a fraction of what a title search costs.'],
  ['Address autocomplete', 'Real addresses appear as you type, like a map search.'],
]

const SOON = [
  'Liens, lis pendens and pre-foreclosures',
  'Tax delinquency',
  'Mortgage and equity estimates',
  'Permits and code violations',
  'MLS sold comps, ARV and rental comps',
  'Saved lead lists with email alerts',
  'Owner contact lookup (skip tracing)',
  'Map view and heat maps',
  'Team seats',
  'Spanish version',
]

const WHO = [
  ['Investors', 'Find motivated, off-market owners and run the numbers before you call.'],
  ['Realtors', 'Prospect listings, research a property in minutes, and walk into appointments prepared.'],
  ['Lenders, title & attorneys', 'A fast first look at ownership, value and risk indicators before ordering full work.'],
]

export default function AboutPage() {
  const nav = useNavigate()
  const H = { fontSize: 10.5, letterSpacing: 3, textTransform: 'uppercase', color: '#A8863E', fontWeight: 600, marginBottom: 14 }
  const card = { background: '#FFFFFF', border: '1px solid #E0DCD0', borderRadius: 10, padding: '18px 18px 16px' }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      {/* HERO */}
      <div style={{ background: '#0A3D3A', borderRadius: 14, padding: 'clamp(28px, 5vw, 52px)', color: '#FAF8F2', marginBottom: 28 }}>
        <div style={{ fontSize: 10.5, letterSpacing: 4, color: '#C4A46B', marginBottom: 12 }}>ABOUT MIAMI OPPORTUNITIES</div>
        <div style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 300, lineHeight: 1.15, maxWidth: 680, marginBottom: 14 }}>
          South Florida’s property intelligence platform for finding deals first.
        </div>
        <div style={{ fontSize: 15, color: 'rgba(250,248,242,0.8)', lineHeight: 1.6, maxWidth: 620, marginBottom: 24 }}>
          MO brings the county records you would normally check one website at a time into one search and one report —
          with an Opportunity Score that points you to the owners most likely to sell.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="btn btn-gold" onClick={() => nav('/')}>Search a Property →</button>
          <button className="btn" style={{ background: 'transparent', border: '1px solid rgba(196,164,107,0.5)', color: '#D9BC88' }} onClick={() => nav('/account')}>See Plans</button>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <div style={H}>How it works</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 30 }}>
        {[['1', 'Search', 'Type an address, owner, folio — or use Criteria Search and lead lists.'],
          ['2', 'Score', 'See the Opportunity Score and the indicators behind it.'],
          ['3', 'Decide', 'Unlock the full report and run the numbers before you make an offer.']].map(([n, t, d]) => (
          <div key={n} style={card}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#F5EDD8', color: '#8A6A2E', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, marginBottom: 10 }}>{n}</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{t}</div>
            <div style={{ fontSize: 13, color: '#5A6A69', lineHeight: 1.55 }}>{d}</div>
          </div>
        ))}
      </div>

      {/* LIVE FEATURES */}
      <div style={H}>Available today</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 30 }}>
        {LIVE.map(([t, d]) => (
          <div key={t} style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: '#0A3D3A' }}>{t}</div>
            <div style={{ fontSize: 13, color: '#5A6A69', lineHeight: 1.55 }}>{d}</div>
          </div>
        ))}
      </div>

      {/* COMING SOON */}
      <div style={H}>Coming soon</div>
      <div style={{ ...card, marginBottom: 30, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '8px 18px' }}>
        {SOON.map(t => (
          <div key={t} style={{ fontSize: 13, color: '#3E4A49', display: 'flex', gap: 8 }}><span style={{ color: '#C4A46B' }}>◆</span>{t}</div>
        ))}
      </div>

      {/* WHO */}
      <div style={H}>Built for</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 30 }}>
        {WHO.map(([t, d]) => (
          <div key={t} style={card}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{t}</div>
            <div style={{ fontSize: 13, color: '#5A6A69', lineHeight: 1.55 }}>{d}</div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ ...card, textAlign: 'center', padding: '28px 20px', background: '#F5EDD8', borderColor: '#E3D3AE' }}>
        <div style={{ fontSize: 20, fontWeight: 400, marginBottom: 6 }}>Start with a free account</div>
        <div style={{ fontSize: 13, color: '#5A6A69', marginBottom: 16 }}>Search any property for free. Unlock full reports for $15, or choose a membership from $29/month.</div>
        <button className="btn btn-gold" onClick={() => nav('/account')}>View Plans →</button>
      </div>
    </div>
  )
}

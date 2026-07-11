import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import AuthModal from '../components/AuthModal'

const RECENT = [
  { q: '332 NW 35th St, Miami FL 33127', type: 'Address' },
  { q: '1425 NE 83rd St, Miami FL 33138', type: 'Address' },
  { q: '332 New Latest House Project LLC', type: 'LLC / Company' },
  { q: '01-3125-024-0220', type: 'Folio' },
]

export default function SearchPage() {
  const [q, setQ] = useState('')
  const [chip, setChip] = useState('Address')
  const [authOpen, setAuthOpen] = useState(false)
  const nav = useNavigate()

  const doSearch = (query) => {
    const term = (query || q).trim()
    if (!term) return
    nav(`/report?q=${encodeURIComponent(term)}`)
  }

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '36px 0' }}>

      {/* LOGO HERO */}
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ fontSize: 42, fontWeight: 500, color: '#0A3D3A', letterSpacing: 8, lineHeight: 1, marginBottom: 4 }}>MIAMI</div>
        <div style={{ fontSize: 12, fontWeight: 400, color: '#C4A46B', letterSpacing: 5, textTransform: 'uppercase', marginBottom: 10 }}>OPPORTUNITIES</div>
        <div style={{ width: 40, height: 1, background: '#C4A46B', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 11, color: '#9A9488', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          South Florida Property Intelligence · Pre-Offer Blueprint
        </div>
      </div>

      {/* SEARCH */}
      <div style={{ background: '#FAF8F2', border: '1px solid #D8D4C8', borderRadius: 10, padding: 20, boxShadow: '0 2px 12px rgba(10,61,58,0.06)' }}>
        <div style={{ display: 'flex', border: '1.5px solid #0A3D3A', borderRadius: 4, marginBottom: 12, overflow: 'hidden' }}>
          <input
            style={{ flex: 1, border: 'none', padding: '13px 16px', fontSize: 14, color: '#1A2828', outline: 'none', background: '#FAF8F2', fontFamily: 'inherit' }}
            placeholder="Search any address, owner name, LLC, folio, neighborhood, or ZIP…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
          />
          <button
            onClick={() => doSearch()}
            style={{ background: '#0A3D3A', color: '#D9BC88', border: 'none', padding: '0 22px', fontSize: 10.5, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
          >
            Search →
          </button>
        </div>

        {/* CHIPS */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 10 }}>
          {['Address', 'Owner Name', 'Company / LLC', 'Folio / Parcel', 'Neighborhood', 'ZIP Code'].map(c => (
            <button
              key={c}
              onClick={() => setChip(c)}
              style={{
                border: `1px solid ${chip === c ? '#C4A46B' : '#BFC4C7'}`,
                background: chip === c ? '#F5EDD8' : '#F0EDE4',
                color: chip === c ? '#A8863E' : '#607070',
                fontSize: 10, padding: '4px 10px', cursor: 'pointer',
                borderRadius: 3, fontFamily: 'inherit', fontWeight: chip === c ? 600 : 400,
                letterSpacing: 0.3, transition: 'all 0.12s'
              }}
            >{c}</button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#A8B4B3', letterSpacing: 0.3 }}>
          The system detects search type automatically — chips narrow the results when needed
        </div>
      </div>

      {/* CTAs */}
      <div style={{ textAlign: 'center', margin: '16px 0', display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn btn-outline btn-sm" onClick={() => setAuthOpen(true)}>Create Free Account</button>
        <button className="btn btn-gold btn-sm" onClick={() => nav('/report?q=332+NW+35th+St+Miami')}>View Sample Report</button>
      </div>
      <div style={{ textAlign: 'center', fontSize: 10.5, color: '#A8B4B3', marginBottom: 28 }}>
        Free preview on every property · Full report includes owner contact, liens, foreclosure, comps & buyer strategy
      </div>

      {/* GOLD RULE */}
      <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Recent Searches</div><div className="gold-rule-line rev" /></div>

      {RECENT.map((r, i) => (
        <div
          key={i}
          onClick={() => doSearch(r.q)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 13px', background: '#FAF8F2', border: '1px solid #D8D4C8', marginBottom: 5, cursor: 'pointer', borderRadius: 5, fontSize: 12.5, transition: 'border-color 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#C4A46B'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#D8D4C8'}
        >
          <span style={{ color: '#1A2828' }}>{r.q}</span>
          <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', background: '#E8E4D8', color: '#607070', padding: '2px 7px', borderRadius: 2 }}>{r.type}</span>
        </div>
      ))}

      {/* DATA SOURCES */}
      <div className="gold-rule" style={{ marginTop: 24 }}><div className="gold-rule-line" /><div className="gold-rule-text">Intelligence Sources</div><div className="gold-rule-line rev" /></div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        {[
          ['MDPA', 'Property & Ownership', 'Pending'],
          ['Tax Collector', 'Tax & Delinquency', 'Pending'],
          ['Clerk Records', 'Liens & Foreclosure', 'Pending'],
          ['Civil Courts', 'Cases & Judgments', 'Pending'],
          ['realforeclose.com', 'Auction Dates', 'Live Link'],
          ['SunBiz', 'LLC Lookup', 'Free'],
          ['City Permits', 'Violations & Permits', 'Pending'],
          ['MLS / iMapp', 'Comps & Listings', 'Auth Req'],
          ['BatchSkipTrace', 'Owner Contact', 'Pending'],
        ].map(([name, fields, status]) => (
          <div key={name} style={{ background: '#F0EDE4', border: '1px solid #D8D4C8', borderRadius: 5, padding: '8px 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{name}</div>
            <div style={{ fontSize: 10, color: '#7A8A89', marginBottom: 5 }}>{fields}</div>
            <span className={status === 'Live Link' || status === 'Free' ? 'badge badge-green' : 'badge badge-gold'}>{status}</span>
          </div>
        ))}
      </div>

      <div className="legal-notice" style={{ marginTop: 20 }}>
        This tool uses legally accessible public records only. Data is for lawful real estate research and does not constitute legal advice, a title opinion, or an appraisal. Consult a licensed Florida real estate attorney and title company before any offer. Do not use to harass or pressure property owners.
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

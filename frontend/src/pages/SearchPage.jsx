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
  <div style={{ textAlign: 'center' }}>
  <div style={{ fontSize: 48, fontWeight: 400, color: '#0A3D3A', letterSpacing: 6, lineHeight: 1 }}>MIAMI</div>
  <div style={{ fontSize: 13, fontWeight: 400, color: '#C4A46B', letterSpacing: 5, textTransform: 'uppercase', marginTop: 4 }}>OPPORTUNITIES</div>
</div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 11, fontWeight: 300, color: '#A88C38', letterSpacing: 5, textTransform: 'uppercase', lineHeight: 1.4 }}>iami</div>
            <div style={{ fontSize: 11, fontWeight: 300, color: '#A88C38', letterSpacing: 5, textTransform: 'uppercase', lineHeight: 1.4 }}>portunities</div>
          </div>
          <div style={{ fontSize: 52, fontWeight: 100, color: '#2A2A2A', letterSpacing: -4, lineHeight: 1 }}>O</div>
        </div>
        <div style={{ width: 40, height: 1, background: '#C8A84B', margin: '0 auto 12px' }} />
        <div style={{ fontSize: 11, color: '#9A9488', letterSpacing: 1.5, textTransform: 'uppercase' }}>
          South Florida Property Intelligence · Pre-Offer Blueprint
        </div>
      </div>

      {/* SEARCH */}
      <div style={{ background: '#FAFAF8', border: '1px solid #DDD8CC', borderRadius: 10, padding: 20, boxShadow: '0 2px 12px rgba(42,42,42,0.06)' }}>
        <div style={{ display: 'flex', border: '1px solid #DDD8CC', borderRadius: 5, marginBottom: 12, overflow: 'hidden' }}>
          <input
            style={{ flex: 1, border: 'none', padding: '13px 16px', fontSize: 14, color: '#2A2A2A', outline: 'none', background: '#FAFAF8', fontFamily: 'inherit' }}
            placeholder="Search any address, owner name, LLC, folio, neighborhood, or ZIP…"
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
          />
          <button
            onClick={() => doSearch()}
            style={{ background: '#2A2A2A', color: 'rgba(200,168,75,0.9)', border: 'none', padding: '0 22px', fontSize: 10.5, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}
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
                border: `1px solid ${chip === c ? '#C8A84B' : '#DDD8CC'}`,
                background: chip === c ? '#F2E8CC' : '#EDE8DC',
                color: chip === c ? '#A88C38' : '#6B6456',
                fontSize: 10, padding: '4px 10px', cursor: 'pointer',
                borderRadius: 3, fontFamily: 'inherit', fontWeight: chip === c ? 600 : 400,
                letterSpacing: 0.3, transition: 'all 0.12s'
              }}
            >{c}</button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#BCB8B0', letterSpacing: 0.3 }}>
          The system detects search type automatically — chips narrow the results when needed
        </div>
      </div>

      {/* CTAs */}
      <div style={{ textAlign: 'center', margin: '16px 0', display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="btn btn-outline btn-sm" onClick={() => setAuthOpen(true)}>Create Free Account</button>
        <button className="btn btn-gold btn-sm" onClick={() => nav('/report?q=332+NW+35th+St+Miami')}>View Sample Report</button>
      </div>
      <div style={{ textAlign: 'center', fontSize: 10.5, color: '#BCB8B0', marginBottom: 28 }}>
        Free preview on every property · Full report includes owner contact, liens, foreclosure, comps & buyer strategy
      </div>

      {/* GOLD RULE */}
      <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Recent Searches</div><div className="gold-rule-line rev" /></div>

      {RECENT.map((r, i) => (
        <div
          key={i}
          onClick={() => doSearch(r.q)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 13px', background: '#FAFAF8', border: '1px solid #DDD8CC', marginBottom: 5, cursor: 'pointer', borderRadius: 5, fontSize: 12.5, transition: 'border-color 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.borderColor = '#C8A84B'}
          onMouseLeave={e => e.currentTarget.style.borderColor = '#DDD8CC'}
        >
          <span style={{ color: '#2A2A2A' }}>{r.q}</span>
          <span style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', background: '#EDE8DC', color: '#6B6456', padding: '2px 7px', borderRadius: 2 }}>{r.type}</span>
        </div>
      ))}

      {/* DATA SOURCES NOTICE */}
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
          <div key={name} style={{ background: '#F4F0E8', border: '1px solid #DDD8CC', borderRadius: 5, padding: '8px 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{name}</div>
            <div style={{ fontSize: 10, color: '#9A9488', marginBottom: 5 }}>{fields}</div>
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

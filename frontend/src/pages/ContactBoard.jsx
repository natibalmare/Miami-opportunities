import { useState } from 'react'
import { useAuth } from '../utils/AuthContext'
import AuthModal from '../components/AuthModal'

const LISTINGS = [
  { id: 1, name: 'Maria Gonzalez', role: 'buyer', hasAgent: false, area: 'Miami Shores / Shorecrest', budget: '$400K–$600K', msg: 'Looking for 3/2 SF, absentee or pre-foreclosure preferred. Cash or FHA 203(k). Can close in 30 days.', phone: true, email: true },
  { id: 2, name: 'James Okafor',   role: 'seller', hasAgent: true,  area: 'North Miami Beach', budget: 'Asking $385,000', msg: 'Inherited property. Motivated to sell as-is, no repairs. Open to all financing. Agent: RE/MAX.', phone: true, email: false },
  { id: 3, name: 'Sandra Lin',     role: 'buyer', hasAgent: false, area: 'Upper East Side / MiMo', budget: '$550K–$750K', msg: 'Architect. Interested in MiMo-era homes with renovation potential. Conventional or renovation loan. Need agent referral.', phone: false, email: true },
  { id: 4, name: 'Roberto Alves',  role: 'seller', hasAgent: false, area: 'Hallandale Beach', budget: 'Asking $290,000', msg: 'Need to sell per court order. Title clear. Can close in 21 days. Willing to negotiate.', phone: true, email: true },
]

export default function ContactBoard() {
  const { user } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  const [filter, setFilter] = useState('all')

  const filtered = LISTINGS.filter(l => filter === 'all' || l.role === filter || (filter === 'needs-agent' && !l.hasAgent))

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>Buyer / Seller Board</div>
          <div style={{ fontSize: 12, color: '#9A9488', marginTop: 3 }}>Connect with buyers, sellers, and agents across South Florida</div>
        </div>
        <button className="btn btn-gold" onClick={() => user ? setPostOpen(true) : setAuthOpen(true)}>Post Your Listing</button>
      </div>

      {!user && (
        <div className="alert alert-info" style={{ marginBottom: 16 }}>
          Contact details are visible to registered members only.
          <a href="#" onClick={e => { e.preventDefault(); setAuthOpen(true) }} style={{ color: '#185FA5', fontWeight: 600, marginLeft: 6 }}>Sign in or register free →</a>
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {['all', 'buyer', 'seller', 'needs-agent'].map(f => (
          <button key={f} className={`btn btn-sm ${filter === f ? 'btn-gold' : 'btn-outline'}`} onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>{f.replace('-', ' ')}</button>
        ))}
      </div>

      {filtered.map(l => (
        <div key={l.id} className="card" style={{ marginBottom: 10 }}>
          <div className="card-body">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 500 }}>{l.name}</div>
                <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: l.role === 'buyer' ? '#185FA5' : '#A88C38', marginTop: 2 }}>{l.role}</div>
              </div>
              <div style={{ fontSize: 11, color: '#9A9488', textAlign: 'right' }}>{l.area}</div>
            </div>
            <div style={{ display: 'flex', gap: 5, marginBottom: 9 }}>
              <span className={`badge badge-${l.role === 'buyer' ? 'blue' : 'gold'}`}>{l.role.charAt(0).toUpperCase() + l.role.slice(1)}</span>
              <span className={`badge badge-${l.hasAgent ? 'green' : 'silver'}`}>{l.hasAgent ? 'Has Agent' : 'Needs Agent'}</span>
            </div>
            <div style={{ fontSize: 12.5, color: '#6B6456', lineHeight: 1.6, marginBottom: 10 }}>{l.msg}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#A88C38' }}>{l.budget}</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: '#6B6456' }}>
                {l.phone && (
                  user
                    ? <span>📞 (305) 555-{1000 + l.id}</span>
                    : <a href="#" onClick={e => { e.preventDefault(); setAuthOpen(true) }} style={{ color: '#A88C38' }}>📞 Sign in to view</a>
                )}
                {l.email && (
                  user
                    ? <span>✉ {l.name.split(' ')[0].toLowerCase()}@example.com</span>
                    : <a href="#" onClick={e => { e.preventDefault(); setAuthOpen(true) }} style={{ color: '#A88C38' }}>✉ Sign in to view</a>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      <div className="legal-notice">
        All listings are self-reported. MO does not verify qualifications, property condition, or financial status. Use professional judgment. Do not use contact information for spam, harassment, or unsolicited marketing.
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

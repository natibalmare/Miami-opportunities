import { useAuth } from '../utils/AuthContext'
import { useNavigate } from 'react-router-dom'
import AuthModal from '../components/AuthModal'
import { useState } from 'react'

export default function AccountPage() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [authOpen, setAuthOpen] = useState(false)

  if (!user) return (
    <div style={{ maxWidth: 440, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 300, marginBottom: 12 }}>Sign in to access your account</div>
      <button className="btn btn-gold" onClick={() => setAuthOpen(true)}>Sign In / Register</button>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )

  const plans = [
    { id: 'report',  name: 'Single Report',     price: '$5.99',  desc: 'One full report + PDF', badge: 'Per Use' },
    { id: 'monthly', name: 'Monthly Membership', price: '$29/mo', desc: 'Unlimited reports · auto-renews', badge: 'Best Value' },
    { id: 'annual',  name: 'Annual Membership',  price: '$299/yr', desc: 'Save $49 vs monthly · unlimited', badge: 'Annual' },
  ]

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5, marginBottom: 20 }}>My Account</div>
      <div className="grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header"><div className="t-label">Profile</div></div>
            <div className="card-body">
              <div className="form-group"><label className="form-label">First Name</label><input className="input" defaultValue={user.firstName} /></div>
              <div className="form-group"><label className="form-label">Last Name</label><input className="input" defaultValue={user.lastName} /></div>
              <div className="form-group">
                <label className="form-label">Email <span style={{ color: '#2E6E4A', fontSize: 9 }}>✓ Verified</span></label>
                <input className="input" defaultValue={user.email} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="input" defaultValue={user.phone || ''} placeholder="+1 (305) 000-0000" />
              </div>
              <button className="btn btn-gold btn-sm">Save Changes</button>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="t-label">I Am A</div></div>
            <div className="card-body">
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {[['buyer', '🏠', 'Buyer'], ['seller', '📋', 'Seller'], ['agent', '🤝', 'Agent']].map(([v, ic, n]) => (
                  <div key={v} style={{ flex: 1, border: `1px solid ${user.role === v ? '#C8A84B' : '#DDD8CC'}`, background: user.role === v ? '#F2E8CC' : '#F4F0E8', borderRadius: 5, padding: '10px 8px', textAlign: 'center', cursor: 'pointer' }}>
                    <div style={{ fontSize: 18, marginBottom: 3 }}>{ic}</div>
                    <div style={{ fontSize: 11, fontWeight: 500 }}>{n}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-outline btn-sm" style={{ width: '100%', color: '#B84040', borderColor: '#E8A0A0' }} onClick={logout}>Sign Out</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header"><div className="t-label">Current Plan</div></div>
            <div className="card-body">
              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#9A9488', marginBottom: 4 }}>Active Plan</div>
              <div style={{ fontSize: 22, fontWeight: 300, color: '#A88C38', marginBottom: 4 }}>{user.plan === 'member' ? 'Member' : 'Free'}</div>
              <div style={{ fontSize: 12, color: '#9A9488', marginBottom: 14 }}>0 full reports this month</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {plans.map(pl => (
                  <div key={pl.id} style={{ border: '1px solid #DDD8CC', borderRadius: 6, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{pl.name}</div>
                      <div style={{ fontSize: 11, color: '#9A9488' }}>{pl.desc}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 300, color: '#A88C38' }}>{pl.price}</div>
                      <button className="btn btn-gold btn-sm" style={{ marginTop: 4 }}>Choose →</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="t-label">Report History</div></div>
            <div className="card-body" style={{ color: '#9A9488', fontSize: 12.5 }}>
              No reports purchased yet.
              <a href="#" onClick={e => { e.preventDefault(); nav('/') }} style={{ color: '#A88C38', fontWeight: 500, marginLeft: 5 }}>Search a property →</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

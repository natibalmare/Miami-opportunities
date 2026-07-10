import { useState } from 'react'
import { useAuth } from '../utils/AuthContext'
import { api } from '../utils/api'

export default function AuthModal({ onClose, afterLogin }) {
  const { login } = useAuth()
  const [mode, setMode] = useState('register')
  const [role, setRole] = useState('buyer')
  const [needsAgent, setNeedsAgent] = useState(true)
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = k => e => setForm(p => ({ ...p, [k]: e.target.value }))

  const submit = async () => {
    setError(''); setLoading(true)
    try {
      let data
      if (mode === 'register') {
        if (!form.firstName || !form.lastName || !form.email || !form.password)
          throw new Error('Please fill in all required fields')
        if (form.password.length < 8)
          throw new Error('Password must be at least 8 characters')
        data = await api.register({ ...form, role, needsAgent })
      } else {
        if (!form.email || !form.password) throw new Error('Email and password required')
        data = await api.login(form.email, form.password)
      }
      login(data.user, data.token)
      afterLogin?.()
      onClose()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const overlay = { position: 'fixed', inset: 0, background: 'rgba(42,42,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: 16 }
  const modal = { background: '#FAFAF8', width: '100%', maxWidth: 460, maxHeight: '92vh', overflowY: 'auto', borderRadius: 10 }
  const mh = { background: '#2A2A2A', padding: '20px 26px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', borderRadius: '10px 10px 0 0' }
  const mb = { padding: '22px 26px' }
  const rl = (on) => ({ flex: 1, border: `1px solid ${on ? '#C8A84B' : '#DDD8CC'}`, padding: '12px 8px', cursor: 'pointer', textAlign: 'center', background: on ? '#F2E8CC' : '#FAFAF8', transition: 'all 0.12s', borderRadius: 6 })
  const ag = (on) => ({ flex: 1, border: '1px solid #DDD8CC', padding: '8px', fontSize: 10, fontFamily: 'inherit', letterSpacing: 1, textTransform: 'uppercase', cursor: 'pointer', background: on ? '#2A2A2A' : 'transparent', color: on ? 'rgba(200,168,75,0.9)' : '#6B6456', borderRadius: 4 })

  return (
    <div style={overlay} onClick={onClose}>
      <div style={modal} onClick={e => e.stopPropagation()}>
        <div style={mh}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 300, color: '#fff', letterSpacing: -0.3 }}>
              {mode === 'register' ? 'Create Your Account' : 'Sign In'}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', letterSpacing: 1, textTransform: 'uppercase', marginTop: 3 }}>
              {mode === 'register' ? 'Free · Full reports from $5.99' : 'Welcome back'}
            </div>
          </div>
          <button style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 19, cursor: 'pointer' }} onClick={onClose}>×</button>
        </div>

        <div style={mb}>
          {error && <div className="alert alert-danger" style={{ marginBottom: 13 }}>{error}</div>}

          {mode === 'register' && (
            <>
              <div className="form-label">I am a</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {[['buyer', '🏠', 'Buyer', 'Looking to purchase'], ['seller', '📋', 'Seller', 'Have a property'], ['agent', '🤝', 'Agent', 'Licensed professional']].map(([v, ic, n, d]) => (
                  <div key={v} style={rl(role === v)} onClick={() => setRole(v)}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{ic}</div>
                    <div style={{ fontSize: 11.5, fontWeight: 500 }}>{n}</div>
                    <div style={{ fontSize: 9.5, color: '#9A9488', marginTop: 2 }}>{d}</div>
                  </div>
                ))}
              </div>

              <div className="form-label">Do you have a real estate agent?</div>
              <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
                <button style={ag(!needsAgent)} onClick={() => setNeedsAgent(false)}>Yes, I have one</button>
                <button style={ag(needsAgent)} onClick={() => setNeedsAgent(true)}>No, I need one</button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 10px' }}>
                <div style={{ flex: 1, height: 1, background: '#DDD8CC' }} />
                <div style={{ fontSize: 8.5, letterSpacing: 2, textTransform: 'uppercase', color: '#9A9488' }}>Your Details</div>
                <div style={{ flex: 1, height: 1, background: '#DDD8CC' }} />
              </div>

              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">First Name *</label>
                  <input className="input" value={form.firstName} onChange={set('firstName')} placeholder="Natalia" />
                </div>
                <div className="form-group">
                  <label className="form-label">Last Name *</label>
                  <input className="input" value={form.lastName} onChange={set('lastName')} placeholder="Rodriguez" />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address *</label>
                <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="your@email.com" />
                <div style={{ fontSize: 9.5, color: '#9A9488', marginTop: 4 }}>Verification link sent · Required to access full reports</div>
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input className="input" type="tel" value={form.phone} onChange={set('phone')} placeholder="+1 (305) 000-0000" />
                <div style={{ fontSize: 9.5, color: '#9A9488', marginTop: 4 }}>6-digit SMS code to verify · Optional but recommended</div>
              </div>
            </>
          )}

          {mode === 'login' && (
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="your@email.com" />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Password *</label>
            <input className="input" type="password" value={form.password} onChange={set('password')} placeholder="Minimum 8 characters" />
          </div>

          {mode === 'register' && (
            <div className="legal-notice" style={{ marginBottom: 14 }}>
              By registering you agree to our Terms of Service and Privacy Policy. Your information is used solely for account management and property research services. MO does not sell your data.
            </div>
          )}

          <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', marginTop: 4, borderRadius: 4 }} onClick={submit} disabled={loading}>
            {loading ? 'Please wait…' : mode === 'register' ? 'Create Free Account →' : 'Sign In →'}
          </button>

          <div style={{ textAlign: 'center', marginTop: 10, fontSize: 11, color: '#9A9488' }}>
            {mode === 'register'
              ? <span>Already have an account? <button style={{ background: 'none', border: 'none', color: '#A88C38', cursor: 'pointer', fontSize: 11 }} onClick={() => setMode('login')}>Sign in</button></span>
              : <span>New here? <button style={{ background: 'none', border: 'none', color: '#A88C38', cursor: 'pointer', fontSize: 11 }} onClick={() => setMode('register')}>Create account</button></span>
            }
          </div>
        </div>
      </div>
    </div>
  )
}

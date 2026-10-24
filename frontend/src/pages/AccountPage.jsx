import { useAuth } from '../utils/AuthContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthModal from '../components/AuthModal'
import { useEffect, useState } from 'react'
import { api } from '../utils/api'

const PLAN_CARDS = [
  { id: 'investor', name: 'Investor', month: 29,  year: 290,  desc: '15 full reports/month · 1 user' },
  { id: 'pro',      name: 'Pro',      month: 99,  year: 990,  desc: '50 full reports/month · 2 users', badge: 'Most Popular' },
  { id: 'business', name: 'Business', month: 249, year: 2490, desc: '150 full reports/month · 5 users' },
]

const money = (n) => '$' + Number(n).toLocaleString('en-US')
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

export default function AccountPage() {
  const { user, logout } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [authOpen, setAuthOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const [billing, setBilling] = useState('month')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  const justSubscribed = params.get('subscribed')

  useEffect(() => {
    if (!user) return
    let cancelled = false
    let tries = 0
    let timer = null
    const load = async () => {
      try {
        const s = await api.getBillingStatus()
        if (cancelled) return
        setStatus(s)
        /* After Stripe checkout the webhook can take a few seconds — keep checking briefly */
        if (justSubscribed && s.plan === 'free' && ++tries < 10) timer = setTimeout(load, 2000)
      } catch (e) {
        if (!cancelled) setStatus({ plan: 'free', planName: 'Free', usage: null })
      }
    }
    load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [user, justSubscribed])

  if (!user) return (
    <div style={{ maxWidth: 440, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 300, marginBottom: 12 }}>Sign in to access your account</div>
      <button className="btn btn-gold" onClick={() => setAuthOpen(true)}>Sign In / Register</button>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )

  const go = async (key, fn) => {
    setBusy(key); setError('')
    try {
      const data = await fn()
      if (data?.url) window.location.href = data.url
      else throw new Error('Could not open secure checkout. Please try again.')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  const isMember = status && status.plan !== 'free'
  const toggleBtn = (on) => ({ flex: 1, border: `1px solid ${on ? '#C8A84B' : '#DDD8CC'}`, background: on ? '#F2E8CC' : '#FAFAF8', padding: '7px 0', fontSize: 11.5, cursor: 'pointer', borderRadius: 5 })

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
              {error && <div className="alert alert-danger" style={{ marginBottom: 12 }}>{error}</div>}
              {justSubscribed && isMember && (
                <div className="alert alert-gold" style={{ marginBottom: 12 }}>Welcome to {status.planName}. Your reports are ready to use.</div>
              )}

              <div style={{ fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: '#9A9488', marginBottom: 4 }}>Active Plan</div>
              <div style={{ fontSize: 22, fontWeight: 300, color: '#A88C38', marginBottom: 4 }}>
                {status ? status.planName : 'Loading…'}
                {isMember && status.interval && <span style={{ fontSize: 12, color: '#9A9488', marginLeft: 8 }}>{status.interval === 'year' ? 'Annual' : 'Monthly'}</span>}
              </div>
              <div style={{ fontSize: 12, color: '#9A9488', marginBottom: 14 }}>
                {isMember && status.usage
                  ? `${status.usage.remaining} of ${status.usage.included} full reports left · resets ${fmtDate(status.usage.periodEnd)}`
                  : isMember
                    ? 'Your billing period is renewing.'
                    : 'Free plan · basic property lookups. Buy single reports for $15 or choose a membership.'}
              </div>

              {isMember ? (
                <button className="btn btn-outline btn-sm" style={{ width: '100%' }} disabled={!!busy}
                  onClick={() => go('portal', () => api.getBillingPortal())}>
                  {busy === 'portal' ? 'Opening…' : 'Manage billing · change plan · cancel'}
                </button>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <button style={toggleBtn(billing === 'month')} onClick={() => setBilling('month')}>Monthly</button>
                    <button style={toggleBtn(billing === 'year')} onClick={() => setBilling('year')}>Annual · 2 months free</button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {PLAN_CARDS.map(pl => (
                      <div key={pl.id} style={{ border: '1px solid #DDD8CC', borderRadius: 6, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>
                            {pl.name}
                            {pl.badge && <span style={{ marginLeft: 6, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', background: '#C8A84B', color: '#2A2A2A', padding: '1px 6px', borderRadius: 2 }}>{pl.badge}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: '#9A9488' }}>{pl.desc}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 16, fontWeight: 300, color: '#A88C38' }}>
                            {billing === 'month' ? `${money(pl.month)}/mo` : `${money(pl.year)}/yr`}
                          </div>
                          <button className="btn btn-gold btn-sm" style={{ marginTop: 4 }} disabled={!!busy}
                            onClick={() => go(pl.id, () => api.checkoutMembership(pl.id, billing))}>
                            {busy === pl.id ? 'Opening…' : 'Choose →'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div style={{ fontSize: 10.5, color: '#9A9488', marginTop: 10 }}>Secure checkout by Stripe.</div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="t-label">Report History</div></div>
            <div className="card-body" style={{ color: '#9A9488', fontSize: 12.5 }}>
              No reports purchased yet.
              <a href="#" onClick={e => { e.preventDefault(); nav('/search') }} style={{ color: '#A88C38', fontWeight: 500, marginLeft: 5 }}>Search a property →</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'
import AuthModal from '../components/AuthModal'
import { api } from '../utils/api'

const PLANS = [
  {
    id: 'investor', name: 'Investor', month: 29, year: 290, who: 'Investors and buyers getting started',
    features: ['15 full property reports / month', 'Extra reports $2.99 each', '1 user', 'Criteria search & lead lists', 'Map view with Opportunity Scores', 'Mortgage & rental calculators', 'CSV export'],
  },
  {
    id: 'agent', name: 'Agent', month: 49, year: 490, who: 'Licensed real estate agents', badge: 'For Agents',
    features: ['Everything in Investor', '15 full property reports / month', 'Message FSBO sellers on the board', 'Message buyers who need an agent', 'Agent badge on your profile', 'Extra reports $2.99 each', '1 user'],
  },
  {
    id: 'pro', name: 'Pro', month: 99, year: 990, who: 'Active investors and small teams', badge: 'Most Popular',
    features: ['50 full property reports / month', 'Extra reports $2.49 each', '2 users', 'Everything in Investor', 'Board messaging included', 'Priority support'],
  },
  {
    id: 'business', name: 'Business', month: 249, year: 2490, who: 'Brokerages, funds and high-volume teams',
    features: ['150 full property reports / month', 'Extra reports $1.99 each', '5 users', 'Everything in Pro', 'Board messaging included', 'Priority support'],
  },
]

const FREE = [
  ['Free account', 'Search any property, see the Opportunity Score and basic details, browse the map and the board.'],
  ['Single report — $15', 'Unlock one full property report, no membership needed.'],
  ['FSBO sellers — free', 'Post your property for sale by owner, see views, and receive buyer messages inside MO.'],
]

const FAQ = [
  ['Can I cancel anytime?', 'Yes. Manage or cancel your membership from My Account. You keep access until the end of the period you paid for.'],
  ['What happens if I use all my reports?', 'You can keep going — extra reports are billed at your plan’s per-report price.'],
  ['Why is there no unlimited plan?', 'Every full report pulls paid data, so every plan has a monthly allowance to keep prices low.'],
  ['Can I share my account?', 'Each user has their own login, and only one active session per login is allowed. Pro and Business include extra users.'],
]

const money = (n) => '$' + Number(n).toLocaleString('en-US')

export default function PricingPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [billing, setBilling] = useState('month')
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [authOpen, setAuthOpen] = useState(false)

  const choose = async (planId) => {
    if (!user) { setAuthOpen(true); return }
    setBusy(planId); setError('')
    try {
      const d = await api.checkoutMembership(planId, billing)
      if (d?.url) window.location.href = d.url
      else throw new Error('Could not open secure checkout. Please try again.')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const toggle = (on) => ({ border: 'none', background: on ? '#0A3D3A' : 'transparent', color: on ? '#F5EDD8' : '#3E4A49', padding: '8px 18px', fontSize: 12.5, borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 })

  return (
    <div style={{ maxWidth: 1120, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 26 }}>
        <div style={{ fontSize: 10.5, letterSpacing: 4, color: '#A8863E', fontWeight: 600, marginBottom: 10 }}>PLANS &amp; PRICING</div>
        <div style={{ fontSize: 'clamp(24px, 3.5vw, 34px)', fontWeight: 300, marginBottom: 8 }}>Find the deal before everyone else</div>
        <div style={{ fontSize: 14, color: '#5A6A69', marginBottom: 20 }}>Start free. Upgrade when you need full reports.</div>
        <div style={{ display: 'inline-flex', background: '#EFEAE0', borderRadius: 22, padding: 4 }}>
          <button style={toggle(billing === 'month')} onClick={() => setBilling('month')}>Monthly</button>
          <button style={toggle(billing === 'year')} onClick={() => setBilling('year')}>Annual · 2 months free</button>
        </div>
      </div>

      {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 30 }}>
        {PLANS.map(p => {
          const featured = p.id === 'pro'
          return (
            <div key={p.id} style={{ background: '#FFFFFF', border: `${featured ? 2 : 1}px solid ${featured ? '#C4A46B' : '#E0DCD0'}`, borderRadius: 12, padding: '22px 20px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              {p.badge && <div style={{ position: 'absolute', top: -11, left: 20, background: featured ? '#C4A46B' : '#0A3D3A', color: featured ? '#1A2828' : '#F5EDD8', fontSize: 9.5, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 700, padding: '3px 10px', borderRadius: 10 }}>{p.badge}</div>}
              <div style={{ fontSize: 18, fontWeight: 600, color: '#0A3D3A' }}>{p.name}</div>
              <div style={{ fontSize: 12, color: '#5A6A69', minHeight: 34, marginTop: 2 }}>{p.who}</div>
              <div style={{ margin: '10px 0 4px' }}>
                <span style={{ fontSize: 34, fontWeight: 300, color: '#0A3D3A' }}>{money(billing === 'month' ? p.month : p.year)}</span>
                <span style={{ fontSize: 13, color: '#5A6A69' }}>{billing === 'month' ? ' / month' : ' / year'}</span>
              </div>
              <div style={{ fontSize: 11.5, color: '#8A6A2E', minHeight: 18, marginBottom: 14 }}>
                {billing === 'year' ? `Equals ${money(Math.round(p.year / 12))}/month` : `or ${money(p.year)}/year`}
              </div>
              <button className={`btn ${featured ? 'btn-gold' : 'btn-outline'}`} style={{ width: '100%', justifyContent: 'center', marginBottom: 16 }} disabled={!!busy} onClick={() => choose(p.id)}>
                {busy === p.id ? 'Opening…' : user ? `Choose ${p.name}` : 'Get Started'}
              </button>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {p.features.map(f => (
                  <div key={f} style={{ fontSize: 12.5, color: '#3E4A49', display: 'flex', gap: 8, lineHeight: 1.4 }}><span style={{ color: '#2E7D6B', fontWeight: 700 }}>✓</span>{f}</div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 30 }}>
        {FREE.map(([t, d]) => (
          <div key={t} style={{ background: '#F5EDD8', border: '1px solid #E3D3AE', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: '#0A3D3A', marginBottom: 4 }}>{t}</div>
            <div style={{ fontSize: 12.5, color: '#5A6A69', lineHeight: 1.5 }}>{d}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10.5, letterSpacing: 3, textTransform: 'uppercase', color: '#A8863E', fontWeight: 600, marginBottom: 12 }}>Questions</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12, marginBottom: 20 }}>
        {FAQ.map(([q, a]) => (
          <div key={q} style={{ background: '#FFFFFF', border: '1px solid #E0DCD0', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 4 }}>{q}</div>
            <div style={{ fontSize: 12.5, color: '#5A6A69', lineHeight: 1.5 }}>{a}</div>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', fontSize: 11.5, color: '#9A9488' }}>
        Secure checkout by Stripe. Prices in USD. Taxes may apply.
        {user && <> · <a href="#" onClick={e => { e.preventDefault(); nav('/account') }} style={{ color: '#A88C38' }}>Manage my plan</a></>}
      </div>

      {authOpen && <AuthModal initialMode="register" onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

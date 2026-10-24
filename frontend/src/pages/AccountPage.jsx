import { useAuth } from '../utils/AuthContext'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AuthModal from '../components/AuthModal'
import { useEffect, useState } from 'react'
import { api } from '../utils/api'
import { SMS_CONSENT } from '../utils/consent'

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
import { AGENTS_OPEN } from '../utils/features'

const ROLES = [['buyer', '🏠', 'Buyer / Investor'], ['seller', '📋', 'Seller'], ['agent', '🤝', 'Agent']].filter(([v]) => AGENTS_OPEN || v !== 'agent')

export default function AccountPage() {
  const { user, logout, refreshUser } = useAuth()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [authOpen, setAuthOpen] = useState(false)
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [p, setP] = useState(null)
  const [saveMsg, setSaveMsg] = useState('')
  const [unread, setUnread] = useState(0)
  const [myPosts, setMyPosts] = useState(null)

  const justSubscribed = params.get('subscribed')

  useEffect(() => {
    if (!user) return
    setP({ firstName: user.firstName || '', lastName: user.lastName || '', phone: user.phone || '', role: user.role || 'buyer',
      licenseNumber: user.licenseNumber || '', brokerage: user.brokerage || '', emailOptOut: !!user.emailOptOut, smsOptIn: !!user.smsOptIn })
    api.unreadCount().then(r => setUnread(r.unread)).catch(() => {})
    api.myListings().then(r => setMyPosts(r.listings || [])).catch(() => setMyPosts([]))
  }, [user])

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
        else if (justSubscribed && s.plan !== 'free') refreshUser()
      } catch (e) {
        if (!cancelled) setStatus({ plan: 'free', planName: 'Free', usage: null })
      }
    }
    load()
    return () => { cancelled = true; if (timer) clearTimeout(timer) }
  }, [user?.id, justSubscribed])

  if (!user) return (
    <div style={{ maxWidth: 440, margin: '60px auto', textAlign: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 300, marginBottom: 12 }}>Sign in to access your account</div>
      <button className="btn btn-gold" onClick={() => setAuthOpen(true)}>Sign In</button>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )

  const portal = async () => {
    setBusy('portal'); setError('')
    try {
      const data = await api.getBillingPortal()
      if (data?.url) window.location.href = data.url
      else throw new Error('Could not open billing. Please try again.')
    } catch (e) { setError(e.message) } finally { setBusy('') }
  }

  const save = async () => {
    setSaveMsg('')
    try {
      await api.updateProfile(p)
      await refreshUser()
      setSaveMsg('Saved')
    } catch (e) { setSaveMsg(e.message) }
  }

  const set = (k) => (e) => setP(x => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const isMember = status && status.plan !== 'free'
  const role = p?.role || user.role
  const activePosts = (myPosts || []).filter(l => l.status === 'active').length
  const views = (myPosts || []).reduce((a, l) => a + (l.views || 0), 0)

  /* What this account type sees first */
  const quick = [
    ...(user.isAdmin ? [['Insights', 'Members, revenue and activity', '/admin'], ['Email & Text', 'Message your members', '/admin/campaigns']] : []),
    ...(role === 'seller' ? [['My Listings', `${activePosts} active · ${views} views`, '/my-listings'], ['Messages', unread ? `${unread} unread` : 'Buyer conversations', '/messages'], ['Post a home', 'Sell by owner — free', '/my-listings?new=fsbo']] : []),
    ...(role === 'agent' ? [['Buyer / Seller Board', 'FSBO sellers and buyers who need an agent', '/board'], ['Messages', unread ? `${unread} unread` : 'Your conversations', '/messages'], ['Criteria Search', 'Prospect listings', '/criteria']] : []),
    ...(role === 'buyer' ? [['Criteria Search', 'Find motivated owners', '/criteria'], ['Map View', 'Opportunities near you', '/map'], ['Messages', unread ? `${unread} unread` : 'Board conversations', '/messages']] : []),
  ]

  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5, marginBottom: 4 }}>My Account</div>
      <div style={{ fontSize: 12.5, color: '#7A8584', marginBottom: 16 }}>{user.firstName} {user.lastName} · {user.email}{user.isAdmin ? ' · Owner' : ''}</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 18 }}>
        {quick.map(([t, d, path]) => (
          <div key={t} onClick={() => nav(path)} style={{ background: '#FFFFFF', border: '1px solid #E0DCD0', borderRadius: 10, padding: '14px 16px', cursor: 'pointer' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0A3D3A' }}>{t} →</div>
            <div style={{ fontSize: 12, color: '#7A8584', marginTop: 2 }}>{d}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-header"><div className="t-label">Profile</div></div>
            <div className="card-body">
              {p && (
                <>
                  <div className="grid-2">
                    <div className="form-group"><label className="form-label">First Name</label><input className="input" value={p.firstName} onChange={set('firstName')} /></div>
                    <div className="form-group"><label className="form-label">Last Name</label><input className="input" value={p.lastName} onChange={set('lastName')} /></div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email {user.emailVerified && <span style={{ color: '#2E6E4A', fontSize: 9 }}>✓ Verified</span>}</label>
                    <input className="input" value={user.email} disabled />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Mobile phone</label>
                    <input className="input" type="tel" value={p.phone} onChange={set('phone')} placeholder="(305) 000-0000" />
                  </div>

                  <div className="form-label">I am a</div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                    {ROLES.map(([v, ic, n]) => (
                      <div key={v} onClick={() => setP(x => ({ ...x, role: v }))} style={{ flex: 1, border: `1px solid ${p.role === v ? '#C8A84B' : '#DDD8CC'}`, background: p.role === v ? '#F2E8CC' : '#F4F0E8', borderRadius: 5, padding: '10px 6px', textAlign: 'center', cursor: 'pointer' }}>
                        <div style={{ fontSize: 18, marginBottom: 3 }}>{ic}</div>
                        <div style={{ fontSize: 11, fontWeight: 500 }}>{n}</div>
                      </div>
                    ))}
                  </div>

                  {p.role === 'agent' && (
                    <div className="grid-2">
                      <div className="form-group"><label className="form-label">FL license #</label><input className="input" value={p.licenseNumber} onChange={set('licenseNumber')} /></div>
                      <div className="form-group"><label className="form-label">Brokerage</label><input className="input" value={p.brokerage} onChange={set('brokerage')} /></div>
                    </div>
                  )}

                  <div className="form-label" style={{ marginTop: 6 }}>Messages from MO</div>
                  <label style={{ display: 'flex', gap: 8, fontSize: 12.5, marginBottom: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!p.emailOptOut} onChange={e => setP(x => ({ ...x, emailOptOut: !e.target.checked }))} style={{ accentColor: '#C4A46B', marginTop: 2 }} />
                    Send me MO news, new features and market updates by email
                  </label>
                  <label style={{ display: 'flex', gap: 8, fontSize: 12, color: '#3E4A49', marginBottom: 12, cursor: 'pointer', lineHeight: 1.45 }}>
                    <input type="checkbox" checked={p.smsOptIn} disabled={!p.phone} onChange={set('smsOptIn')} style={{ accentColor: '#C4A46B', marginTop: 2 }} />
                    <span>{SMS_CONSENT}{!p.phone && <em style={{ color: '#9A9488' }}> (add a mobile number first)</em>}</span>
                  </label>

                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button className="btn btn-gold btn-sm" onClick={save}>Save Changes</button>
                    {saveMsg && <span style={{ fontSize: 12, color: saveMsg === 'Saved' ? '#2E7D6B' : '#B84040' }}>{saveMsg}</span>}
                  </div>
                </>
              )}
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
              <div style={{ fontSize: 12, color: '#7A8584', marginBottom: 14 }}>
                {isMember && status.usage
                  ? `${status.usage.remaining} of ${status.usage.included} full reports left · resets ${fmtDate(status.usage.periodEnd)}`
                  : isMember ? 'Your billing period is renewing.'
                  : 'Free account · search, scores, map and board. Buy single reports for $15 or choose a membership.'}
              </div>
              {isMember ? (
                <button className="btn btn-outline btn-sm" style={{ width: '100%' }} disabled={!!busy} onClick={portal}>
                  {busy === 'portal' ? 'Opening…' : 'Manage billing · change plan · cancel'}
                </button>
              ) : (
                <button className="btn btn-gold btn-sm" style={{ width: '100%' }} onClick={() => nav('/pricing')}>See Plans & Pricing →</button>
              )}
              {AGENTS_OPEN && role === 'agent' && !['agent', 'pro', 'business'].includes(status?.plan) && (
                <div style={{ fontSize: 12, color: '#8A6A2E', marginTop: 10 }}>To message FSBO sellers and buyers on the board, choose the Agent plan ($49/month).</div>
              )}
              <div style={{ fontSize: 10.5, color: '#9A9488', marginTop: 10 }}>Secure billing by Stripe.</div>
            </div>
          </div>

          <div className="card">
            <div className="card-body">
              <button className="btn btn-outline btn-sm" style={{ width: '100%', color: '#B84040', borderColor: '#E8A0A0' }} onClick={logout}>Sign Out</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

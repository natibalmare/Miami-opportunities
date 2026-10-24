import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'

/* Contact details come from Vercel environment variables so they can change without code edits */
const SUPPORT_PHONE = import.meta.env.VITE_SUPPORT_PHONE || ''
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || 'support@miamiopportunities.com'

const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode */ } },
}

/* ── Thin contact / quick-link bar above the header ───────────────────────── */
export function InfoBar({ onSignIn }) {
  const nav = useNavigate()
  const { user } = useAuth()
  const link = { color: 'rgba(250,248,242,0.85)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, fontFamily: 'inherit', padding: 0, textDecoration: 'none', whiteSpace: 'nowrap' }
  return (
    <div style={{ background: '#0A3D3A', color: '#FAF8F2', padding: '7px 28px', display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', fontSize: 11.5, borderBottom: '1px solid rgba(196,164,107,0.25)' }}>
      {SUPPORT_EMAIL && <a style={link} href={`mailto:${SUPPORT_EMAIL}`}>✉ {SUPPORT_EMAIL}</a>}
      {SUPPORT_PHONE && <a style={link} href={`tel:${SUPPORT_PHONE.replace(/[^\d+]/g, '')}`}>☎ {SUPPORT_PHONE}</a>}
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <button style={link} onClick={() => nav('/')}>About MO</button>
        {user && <button style={link} onClick={() => nav('/account')}>My Account</button>}
        <button style={link} onClick={() => nav('/account')}>Plans &amp; Pricing</button>
        {!user && <button style={{ ...link, color: '#D9BC88', fontWeight: 600 }} onClick={onSignIn}>Create Free Account</button>}
      </span>
    </div>
  )
}

/* ── First-visit welcome popup ─────────────────────────────────────────────── */
export function WelcomePopup({ onSignUp }) {
  const { user, loading } = useAuth()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (loading || user || store.get('mo_welcome_seen')) return
    const t = setTimeout(() => setOpen(true), 1500)
    return () => clearTimeout(t)
  }, [user, loading])

  const close = () => { store.set('mo_welcome_seen', '1'); setOpen(false) }
  if (!open) return null

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,28,0.55)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Welcome to Miami Opportunities"
        style={{ background: '#0A3D3A', color: '#FAF8F2', width: '100%', maxWidth: 440, borderRadius: 14, padding: '30px 28px 24px', position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
        <button onClick={close} aria-label="Close" style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: 'rgba(250,248,242,0.7)', fontSize: 24, cursor: 'pointer' }}>×</button>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 30, fontWeight: 300, letterSpacing: 6 }}>MIAMI</div>
          <div style={{ fontSize: 10.5, letterSpacing: 5, color: '#C4A46B' }}>OPPORTUNITIES</div>
        </div>
        <div style={{ fontSize: 21, fontWeight: 400, lineHeight: 1.3, textAlign: 'center', marginBottom: 14 }}>
          Find South Florida deals<br />before anyone else.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
          {[
            '2.3 million Miami-Dade, Broward & Palm Beach properties',
            'Opportunity Score on every property',
            'Absentee, out-of-state, trust & LLC owner searches',
            'Mortgage and rental return calculators',
          ].map(t => (
            <div key={t} style={{ display: 'flex', gap: 10, fontSize: 13, color: 'rgba(250,248,242,0.85)' }}>
              <span style={{ color: '#C4A46B' }}>✓</span>{t}
            </div>
          ))}
        </div>
        <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }} onClick={() => { close(); onSignUp() }}>
          Create Free Account →
        </button>
        <button onClick={close} style={{ width: '100%', background: 'none', border: '1px solid rgba(196,164,107,0.4)', color: '#D9BC88', padding: '9px', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' }}>
          See what MO does
        </button>
      </div>
    </div>
  )
}

/* ── Privacy preference center (bottom-left button) ───────────────────────── */
export function PrivacyCenter() {
  const [open, setOpen] = useState(false)
  const [analytics, setAnalytics] = useState(() => store.get('mo_privacy_analytics') === 'on')

  const save = (val) => {
    store.set('mo_privacy_analytics', val ? 'on' : 'off')
    store.set('mo_privacy_set', '1')
    setAnalytics(val)
    setOpen(false)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Privacy preferences" title="Privacy preferences"
        style={{ position: 'fixed', left: 16, bottom: 16, zIndex: 900, width: 46, height: 46, borderRadius: '50%', background: '#0A3D3A', border: '2px solid #C4A46B', color: '#D9BC88', cursor: 'pointer', boxShadow: '0 4px 14px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" />
        </svg>
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,30,28,0.55)', zIndex: 1001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Privacy preferences"
            style={{ background: '#FAF8F2', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', borderRadius: 12 }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #E8E4D8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 400 }}>Privacy Preferences</div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', fontSize: 22, color: '#7A8A89', cursor: 'pointer' }}>×</button>
            </div>
            <div style={{ padding: '18px 22px', fontSize: 13, color: '#3E4A49', lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>MO uses only what it needs to run the site: keeping you signed in and remembering these choices. We do not sell your personal information.</p>
              <div style={{ border: '1px solid #E0DCD0', borderRadius: 8, marginTop: 14 }}>
                <div style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E0DCD0' }}>
                  <div><div style={{ fontWeight: 600 }}>Strictly necessary</div><div style={{ fontSize: 11.5, color: '#7A8A89' }}>Sign-in, security, and your saved preferences</div></div>
                  <span style={{ fontSize: 11.5, color: '#2E6E4A', fontWeight: 600 }}>Always on</span>
                </div>
                <label style={{ padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                  <div><div style={{ fontWeight: 600 }}>Analytics</div><div style={{ fontSize: 11.5, color: '#7A8A89' }}>Anonymous usage stats to improve MO (not active yet)</div></div>
                  <input type="checkbox" checked={analytics} onChange={e => setAnalytics(e.target.checked)} style={{ width: 18, height: 18 }} />
                </label>
              </div>
            </div>
            <div style={{ padding: '14px 22px 20px', display: 'flex', gap: 8 }}>
              <button className="btn btn-outline" style={{ flex: 1, justifyContent: 'center' }} onClick={() => save(false)}>Reject All</button>
              <button className="btn btn-gold" style={{ flex: 1, justifyContent: 'center' }} onClick={() => save(analytics)}>Confirm My Choices</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

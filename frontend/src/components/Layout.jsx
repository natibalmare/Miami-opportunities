import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { api } from '../utils/api'
import { useAuth } from '../utils/AuthContext.jsx'
import AuthModal from './AuthModal'
import AddressSearchInput from './AddressSearchInput'
import { InfoBar, WelcomePopup, PrivacyCenter, SiteAnalytics } from './SiteChrome'

const PLAN_NAMES = { investor: 'Investor Member', pro: 'Pro Member', business: 'Business Member', agent: 'Agent Member' }

const NAV = [
  { path: '/search',   label: 'Search',               section: 'Research' },
  { path: '/criteria', label: 'Criteria Search',      section: null },
  { path: '/map',      label: 'Map View',             section: null },
  { path: '/leads',    label: 'Lead Dashboard',       section: null },
  { path: '/report',   label: 'Property Report',      section: null },
  { path: '/board',    label: 'Buyer / Seller Board', section: 'Connect' },
  { path: '/my-listings', label: 'My Listings',       section: null, auth: true },
  { path: '/messages', label: 'Messages',             section: null, auth: true },
  { path: '/admin',    label: 'Insights',             section: 'Owner', admin: true },
  { path: '/admin/campaigns', label: 'Email & Text',  section: null, admin: true },
  { path: '/sources',  label: 'Data Sources',         section: null, admin: true },
]

const S = {
  shell: { display: 'flex', minHeight: '100vh' },
  sb: { width: 220, background: '#0A3D3A', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  logo: { padding: '22px 16px 18px 18px', borderBottom: '1px solid rgba(196,164,107,0.2)' },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 0 },
  logoIcon: { height: 42, width: 'auto', marginRight: 8, flexShrink: 0 },
  logoM: { fontSize: 30, fontWeight: 200, color: '#FAF8F2', letterSpacing: -2, lineHeight: 1 },
  logoSep: { width: 1, height: 28, background: '#C4A46B', margin: '0 8px', flexShrink: 0 },
  logoRight: { display: 'flex', flexDirection: 'column' },
  logoMi: { fontSize: 8, fontWeight: 300, color: 'rgba(196,164,107,0.85)', letterSpacing: 1.6, textTransform: 'uppercase', lineHeight: 1.45 },
  logoOp: { fontSize: 8, fontWeight: 300, color: 'rgba(196,164,107,0.85)', letterSpacing: 1.6, textTransform: 'uppercase', lineHeight: 1.45 },
  nav: { flex: 1, padding: '14px 0' },
  navSec: { fontSize: 8.5, letterSpacing: 2.5, textTransform: 'uppercase', color: 'rgba(201,228,213,0.3)', padding: '10px 22px 4px' },
  navItem: (active) => ({
    display: 'flex', alignItems: 'center', gap: 9,
    padding: '9px 22px', fontSize: 12, fontWeight: 400,
    color: active ? 'rgba(196,164,107,0.9)' : 'rgba(255,255,255,0.45)',
    background: active ? 'rgba(196,164,107,0.08)' : 'transparent',
    borderLeft: `2px solid ${active ? '#C4A46B' : 'transparent'}`,
    cursor: 'pointer', border: 'none', borderRadius: 0,
    width: '100%', textAlign: 'left', transition: 'all 0.12s',
    fontFamily: 'inherit'
  }),
  navDot: { width: 4, height: 4, borderRadius: '50%', background: 'currentColor', flexShrink: 0 },
  foot: { padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.06)' },
  av: { width: 30, height: 30, borderRadius: '50%', background: '#C4A46B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#0A3D3A', flexShrink: 0 },
  sbUser: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 },
  sbName: { fontSize: 11.5, color: 'rgba(255,255,255,0.68)' },
  sbTier: { fontSize: 9.5, color: 'rgba(196,164,107,0.7)', letterSpacing: 0.3 },
  sources: { padding: '12px 22px', borderTop: '1px solid rgba(255,255,255,0.05)' },
  srcHead: { fontSize: 8.5, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(201,228,213,0.3)', marginBottom: 9 },
  srcRow: { display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  srcDot: (live) => ({ width: 5, height: 5, borderRadius: '50%', background: live ? '#5DC99A' : '#C4A46B', flexShrink: 0 }),
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topbar: { background: '#FAF8F2', borderBottom: '1px solid #D8D4C8', height: 58, padding: '0 28px', display: 'flex', alignItems: 'center', gap: 14, position: 'sticky', top: 0, zIndex: 50 },
  searchWrap: { flex: 1, maxWidth: 580, display: 'flex', border: '1.5px solid #0A3D3A' },
  topInp: { flex: 1, border: 'none', padding: '0 14px', fontSize: 13, color: '#1A2828', outline: 'none', background: '#FAF8F2', fontFamily: 'inherit' },
  topBtn: { background: '#0A3D3A', color: 'rgba(196,164,107,0.9)', border: 'none', padding: '0 18px', fontSize: 10, fontWeight: 600, letterSpacing: 1.5, textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  topR: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 11 },
  mvp: { fontSize: 8.5, letterSpacing: 2, textTransform: 'uppercase', color: '#7A8A89', border: '1px solid #BFC4C7', padding: '3px 7px' },
  content: { flex: 1, padding: 28, overflowY: 'auto' },
}

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const loc = useLocation()
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const openAuth = (m = 'login') => { setAuthMode(m); setAuthOpen(true) }
  const [topQ, setTopQ] = useState('')
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [loc.pathname])

  useEffect(() => {
    if (!user) { setUnread(0); return }
    const check = () => api.unreadCount().then(r => setUnread(r.unread || 0)).catch(() => {})
    check()
    const t = setInterval(check, 60000)
    return () => clearInterval(t)
  }, [user, loc.pathname])

  const initials = user ? ((user.firstName?.[0] || '') + (user.lastName?.[0] || '')).toUpperCase() : '?'
  const go = (path) => navigate(path)
  const handleTopSearch = (e) => {
    e.preventDefault()
    if (topQ.trim()) navigate(`/report?q=${encodeURIComponent(topQ.trim())}`)
  }

  let lastSec = null

  return (
    <div style={S.shell}>
      {/* SIDEBAR */}
      {menuOpen && <div className="mo-scrim" onClick={() => setMenuOpen(false)} />}
      <aside style={S.sb} className={`mo-sidebar${menuOpen ? ' open' : ''}`}>
        <div style={{ ...S.logo, cursor: 'pointer' }} onClick={() => go('/')} title="Miami Opportunities home">
          <div style={S.logoWrap}>
            <img src="/mo-icon.png" alt="" style={S.logoIcon} />
            <span style={S.logoM}>MO</span>
            <span style={S.logoSep} />
            <div style={S.logoRight}>
              <span style={S.logoMi}>Miami</span>
              <span style={S.logoOp}>Opportunities</span>
            </div>
          </div>
        </div>

        <div className="mo-mobile-links" style={{ padding: '10px 0 0' }}>
          {[['/', 'About MO'], ['/pricing', 'Plans & Pricing'], ...(user ? [['/account', 'My Account']] : [])].map(([path, label]) => (
            <button key={path} style={S.navItem(loc.pathname === path)} onClick={() => go(path)}><span style={S.navDot} />{label}</button>
          ))}
        </div>
        <nav style={S.nav}>
          {NAV.filter(item => (!item.admin || user?.isAdmin) && (!item.auth || user)).map(item => {
            const showSec = item.section && item.section !== lastSec
            if (item.section) lastSec = item.section
            const active = loc.pathname === item.path
            return (
              <div key={item.path}>
                {showSec && <div style={S.navSec}>{item.section}</div>}
                <button style={S.navItem(active)} onClick={() => go(item.path)}>
                  <span style={S.navDot} />
                  {item.label}
                  {item.path === '/messages' && unread > 0 && <span style={{ marginLeft: 'auto', background: '#C4A46B', color: '#0A3D3A', borderRadius: 9, fontSize: 10, fontWeight: 700, padding: '1px 7px' }}>{unread}</span>}
                </button>
              </div>
            )
          })}
        </nav>

        <div style={S.foot}>
          <div style={S.sbUser}>
            <div style={S.av}>{initials}</div>
            <div>
              <div style={S.sbName}>{user ? `${user.firstName} ${user.lastName}` : 'Guest'}</div>
              <div style={S.sbTier}>{user?.isAdmin ? 'Owner · Admin' : PLAN_NAMES[user?.plan] || (user ? 'Free Account' : 'Free Access')}</div>
            </div>
          </div>
          {user ? (
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }} onClick={logout}>Sign Out</button>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', color: 'rgba(196,164,107,0.7)', borderColor: 'rgba(196,164,107,0.2)' }} onClick={() => openAuth('login')}>Sign In / Register</button>
          )}
        </div>

      </aside>

      {/* MAIN */}
      <div style={S.main}>
        <div className="mo-mobilebar">
          <button aria-label="Menu" onClick={() => setMenuOpen(true)} style={{ background: 'none', border: 'none', color: '#F5EDD8', fontSize: 24, cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}>☰</button>
          <div onClick={() => go('/')} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <img src="/mo-icon.png" alt="" style={{ height: 30 }} />
            <span style={{ color: '#FAF8F2', fontSize: 22, fontWeight: 200, letterSpacing: -1 }}>MO</span>
            <span style={{ color: 'rgba(196,164,107,0.9)', fontSize: 8, letterSpacing: 1.6, lineHeight: 1.4, textTransform: 'uppercase' }}>Miami<br />Opportunities</span>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            {user ? <div style={{ ...S.av, cursor: 'pointer' }} onClick={() => go('/account')}>{initials}</div>
              : <button onClick={() => openAuth('login')} style={{ background: 'none', border: '1px solid rgba(196,164,107,0.5)', color: '#D9BC88', borderRadius: 4, padding: '6px 10px', fontSize: 12, fontFamily: 'inherit' }}>Sign In</button>}
          </div>
        </div>
        <InfoBar onSignIn={() => openAuth('login')} onSignUp={() => openAuth('register')} />
        {loc.pathname !== '/search' && (
          <header style={S.topbar} className="mo-topbar">
            <form style={S.searchWrap} onSubmit={handleTopSearch}>
              <AddressSearchInput
                inputStyle={{ ...S.topInp, height: '100%' }}
                value={topQ}
                onChange={setTopQ}
                onSubmit={() => { if (topQ.trim()) navigate(`/report?q=${encodeURIComponent(topQ.trim())}`) }}
                onPick={s => { setTopQ(s.label); navigate(`/report?q=${encodeURIComponent(s.folio)}`) }}
                placeholder="Search address, owner, LLC, folio, neighborhood, ZIP…"
              />
              <button type="submit" style={S.topBtn}>Search →</button>
            </form>
            <div style={S.topR} className="mo-topavatar">
              <div style={{ ...S.av, cursor: 'pointer' }} onClick={() => user ? go('/account') : openAuth('login')}>{initials}</div>
            </div>
          </header>
        )}

        <main style={S.content} className="mo-content">
          <Outlet />
          <div style={{ marginTop: 36, paddingTop: 12, borderTop: '1px solid #E8E4D8', fontSize: 10, color: '#A8B4B3', lineHeight: 1.6 }}>
            Information compiled from public records and believed reliable but not guaranteed. Not a title search, legal opinion, or appraisal — verify independently before acting.
          </div>
        </main>
      </div>

      {authOpen && <AuthModal initialMode={authMode} onClose={() => setAuthOpen(false)} />}
      <WelcomePopup onSignUp={() => openAuth('register')} />
      <PrivacyCenter />
      <SiteAnalytics />
      <style>{`
        .mo-mobilebar { display: none; }
        .mo-mobile-links { display: none; }
        @media (max-width: 860px) {
          .mo-sidebar { position: fixed !important; left: 0; top: 0; z-index: 1000; transform: translateX(-100%); transition: transform 0.2s ease; box-shadow: 4px 0 20px rgba(0,0,0,0.3); }
          .mo-sidebar.open { transform: translateX(0); }
          .mo-scrim { position: fixed; inset: 0; background: rgba(10,30,30,0.5); z-index: 999; }
          .mo-mobilebar { display: flex; align-items: center; gap: 10px; background: #0A3D3A; padding: 10px 12px; position: sticky; top: 0; z-index: 60; }
          .mo-infobar { display: none !important; }
          .mo-mobile-links { display: block; }
          .mo-topavatar { display: none !important; }
          .mo-topbar { padding: 0 12px !important; height: 52px !important; top: 52px !important; }
          .mo-content { padding: 16px !important; }
        }
      `}</style>
    </div>
  )
}

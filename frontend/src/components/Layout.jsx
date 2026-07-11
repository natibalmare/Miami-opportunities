import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../utils/AuthContext.jsx'
import AuthModal from './AuthModal'

const NAV = [
  { path: '/',        label: 'Search',              section: 'Research' },
  { path: '/report',  label: 'Property Report',     section: null },
  { path: '/leads',   label: 'Lead Dashboard',      section: null },
  { path: '/map',     label: 'Map View',            section: null },
  { path: '/board',   label: 'Buyer / Seller Board', section: 'Connect' },
  { path: '/account', label: 'My Account',          section: null },
  { path: '/sources', label: 'Data Sources',        section: 'System' },
]

const S = {
  shell: { display: 'flex', minHeight: '100vh' },
  sb: { width: 220, background: '#0A3D3A', display: 'flex', flexDirection: 'column', flexShrink: 0, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' },
  logo: { padding: '24px 22px 18px', borderBottom: '1px solid rgba(196,164,107,0.2)' },
  logoWrap: { display: 'flex', alignItems: 'center', gap: 0 },
  logoM: { fontSize: 38, fontWeight: 200, color: '#FAF8F2', letterSpacing: -2, lineHeight: 1 },
  logoSep: { width: 1, height: 30, background: '#C4A46B', margin: '0 10px', flexShrink: 0 },
  logoRight: { display: 'flex', flexDirection: 'column' },
  logoMi: { fontSize: 12, fontWeight: 300, color: 'rgba(196,164,107,0.85)', letterSpacing: 4, textTransform: 'uppercase', lineHeight: 1.45 },
  logoOp: { fontSize: 12, fontWeight: 300, color: 'rgba(196,164,107,0.85)', letterSpacing: 4, textTransform: 'uppercase', lineHeight: 1.45 },
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
  const [topQ, setTopQ] = useState('')

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
      <aside style={S.sb}>
        <div style={S.logo}>
          <div style={S.logoWrap}>
            <span style={S.logoM}>MO</span>
            <span style={S.logoSep} />
            <div style={S.logoRight}>
              <span style={S.logoMi}>Miami</span>
              <span style={S.logoOp}>Opportunities</span>
            </div>
          </div>
        </div>

        <nav style={S.nav}>
          {NAV.map(item => {
            const showSec = item.section && item.section !== lastSec
            if (item.section) lastSec = item.section
            const active = loc.pathname === item.path
            return (
              <div key={item.path}>
                {showSec && <div style={S.navSec}>{item.section}</div>}
                <button style={S.navItem(active)} onClick={() => go(item.path)}>
                  <span style={S.navDot} />
                  {item.label}
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
              <div style={S.sbTier}>{user?.plan === 'member' ? 'Member' : user ? 'Free Account' : 'Free Access'}</div>
            </div>
          </div>
          {user ? (
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', color: 'rgba(255,255,255,0.4)', borderColor: 'rgba(255,255,255,0.1)' }} onClick={logout}>Sign Out</button>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ width: '100%', color: 'rgba(196,164,107,0.7)', borderColor: 'rgba(196,164,107,0.2)' }} onClick={() => setAuthOpen(true)}>Sign In / Register</button>
          )}
        </div>

        <div style={S.sources}>
          <div style={S.srcHead}>Data Sources</div>
          {[['MDPA', false], ['Tax Collector', false], ['Clerk Records', false], ['MLS / iMapp', false], ['City Permits', false]].map(([name, live]) => (
            <div key={name} style={S.srcRow}>
              <div style={S.srcDot(live)} />
              {name}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" style={{ width: '100%', marginTop: 9, color: 'rgba(196,164,107,0.6)', borderColor: 'rgba(196,164,107,0.15)', fontSize: 9 }} onClick={() => go('/sources')}>Configure Sources →</button>
        </div>
      </aside>

      {/* MAIN */}
      <div style={S.main}>
        {loc.pathname !== '/' && (
          <header style={S.topbar}>
            <form style={S.searchWrap} onSubmit={handleTopSearch}>
              <input style={S.topInp} value={topQ} onChange={e => setTopQ(e.target.value)} placeholder="Search address, owner, LLC, folio, neighborhood, ZIP…" />
              <button type="submit" style={S.topBtn}>Search →</button>
            </form>
            <div style={S.topR}>
              <span style={S.mvp}>MVP v2.0</span>
              <div style={{ ...S.av, cursor: 'pointer' }} onClick={() => user ? go('/account') : setAuthOpen(true)}>{initials}</div>
            </div>
          </header>
        )}

        <main style={S.content}>
          <Outlet />
        </main>
      </div>

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

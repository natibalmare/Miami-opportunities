import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../utils/AuthContext'
import { api } from '../utils/api'

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')
const date = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
const PLAN = { investor: 'Investor', agent: 'Agent', pro: 'Pro', business: 'Business', free: 'Free' }
const ROLE = { buyer: 'Buyer / Investor', seller: 'Seller', agent: 'Agent' }

function Tile({ label, value, sub }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E0DCD0', borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 10.5, letterSpacing: 1.5, textTransform: 'uppercase', color: '#7A8584', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 300, color: '#0A3D3A', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: '#8A6A2E', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export default function AdminInsights() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [d, setD] = useState(null)
  const [users, setUsers] = useState(null)
  const [q, setQ] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!user?.isAdmin) return
    api.adminOverview().then(setD).catch(e => setError(e.message))
  }, [user])
  useEffect(() => {
    if (!user?.isAdmin) return
    const t = setTimeout(() => api.adminUsers(q).then(r => setUsers(r.users)).catch(() => setUsers([])), 300)
    return () => clearTimeout(t)
  }, [user, q])

  if (!user?.isAdmin) return <div style={{ padding: 40, color: '#7A8584' }}>This page is only available to the MO owner.</div>
  if (error) return <div className="alert alert-danger">{error}</div>
  if (!d) return <div style={{ padding: 30, color: '#9A9488' }}>Loading insights…</div>

  const maxSignup = Math.max(1, ...d.signups.map(s => s.n))
  const fsbo = d.board.filter(b => b.listing_type === 'fsbo' && b.status === 'active').reduce((a, b) => a + b.n, 0)
  const buyers = d.board.filter(b => b.listing_type === 'buyer' && b.status === 'active').reduce((a, b) => a + b.n, 0)
  const views = d.board.reduce((a, b) => a + b.views, 0)
  const H = { fontSize: 10.5, letterSpacing: 3, textTransform: 'uppercase', color: '#A8863E', fontWeight: 600, margin: '22px 0 10px' }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>Insights</div>
          <div style={{ fontSize: 12.5, color: '#7A8584', marginTop: 3 }}>Owner view of MO — members, revenue and activity. Updated {new Date(d.generatedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={() => nav('/admin/campaigns')}>Email & Text Members</button>
          <a className="btn btn-outline btn-sm" href="https://dashboard.stripe.com" target="_blank" rel="noreferrer">Open Stripe</a>
        </div>
      </div>

      <div style={H}>Business</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Tile label="Monthly recurring" value={money(d.members.mrr)} sub="Estimated from active memberships" />
        <Tile label="Paid members" value={d.members.total} sub={Object.entries(d.members.byPlan).map(([k, v]) => `${PLAN[k] || k} ${v}`).join(' · ') || 'None yet'} />
        <Tile label="Single report sales" value={money(d.revenue.reportSales)} sub={`${d.reports.single} reports at $15 + extras`} />
        <Tile label="Reports unlocked" value={d.reports.single + d.reports.membership + d.reports.overage} sub={`${d.reports.last30} in the last 30 days`} />
      </div>

      <div style={H}>Accounts</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <Tile label="Total accounts" value={d.users.total} sub={`${d.users.verified} verified emails`} />
        <Tile label="New this week" value={d.users.last7} sub={`${d.users.last30} in 30 days`} />
        <Tile label="Signed in this week" value={d.users.active7} />
        <Tile label="Reachable" value={d.users.email_ok} sub={`by email · ${d.users.sms_ok} by text`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, marginTop: 12 }}>
        <div className="card">
          <div className="card-header"><div className="t-label">New accounts — last 30 days</div></div>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 120 }}>
              {d.signups.map(s => (
                <div key={s.day} title={`${s.day}: ${s.n}`} style={{ flex: 1, height: `${Math.max(2, (s.n / maxSignup) * 100)}%`, background: s.n ? '#C4A46B' : '#EEEAE0', borderRadius: '3px 3px 0 0' }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#9A9488', marginTop: 4 }}>
              <span>{d.signups[0]?.day.slice(5)}</span><span>Today</span>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card-header"><div className="t-label">Who signs up</div></div>
          <div className="card-body">
            {d.roles.map(r => (
              <div key={r.role} style={{ marginBottom: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}><span>{ROLE[r.role] || r.role}</span><span>{r.n}</span></div>
                <div style={{ height: 6, background: '#EEEAE0', borderRadius: 3, marginTop: 3 }}><div style={{ height: 6, width: `${(r.n / Math.max(1, d.users.total)) * 100}%`, background: '#0A3D3A', borderRadius: 3 }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={H}>Activity — last 30 days</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Tile label="Searches" value={d.activity30.searches} sub="signed-in members" />
        <Tile label="Criteria searches" value={d.activity30.criteriaSearches} />
        <Tile label="FSBO posts live" value={fsbo} />
        <Tile label="Buyer posts live" value={buyers} />
        <Tile label="Board views" value={views} />
        <Tile label="Conversations" value={d.messaging.conversations} sub={`${d.messaging.messages} messages`} />
      </div>

      <div style={H}>Members</div>
      <div className="card">
        <div className="card-body" style={{ paddingBottom: 6 }}>
          <input className="input" style={{ maxWidth: 320 }} placeholder="Search name or email…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Name</th><th>Email</th><th>Type</th><th>Plan</th><th>Joined</th><th>Last sign-in</th><th>Email</th><th>Text</th></tr></thead>
            <tbody>
              {(users || []).map(u => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}{u.verified ? '' : <span style={{ color: '#B84040', fontSize: 10.5 }}> · not verified</span>}</td>
                  <td>{ROLE[u.role] || u.role}</td>
                  <td>{PLAN[u.plan] || u.plan}{u.interval ? ` · ${u.interval === 'year' ? 'annual' : 'monthly'}` : ''}</td>
                  <td>{date(u.joined)}</td>
                  <td>{date(u.lastLogin)}</td>
                  <td>{u.emailOk ? '✓' : 'Opted out'}</td>
                  <td>{u.smsOk ? '✓' : '—'}</td>
                </tr>
              ))}
              {users && users.length === 0 && <tr><td colSpan={8} style={{ color: '#9A9488' }}>No members found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ fontSize: 11, color: '#9A9488', marginTop: 10 }}>Revenue figures here are estimates from MO’s records. Stripe is the official record of payments and payouts.</div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from '../utils/api'
import { useAuth } from '../utils/AuthContext'


export default function DataSources() {
  const { user, loading } = useAuth()
  const [SOURCES, setSources] = useState([])
  useEffect(() => {
    if (user?.isAdmin) api.getSourceCatalog().then(setSources).catch(() => setSources([]))
  }, [user])
  if (loading) return null
  if (!user?.isAdmin) return <Navigate to="/" replace />
  return (
    <div>
      <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5, marginBottom: 6 }}>Data Sources</div>
      <div style={{ fontSize: 12, color: '#9A9488', marginBottom: 20 }}>Configure and monitor all integrations — each source connects independently</div>

      <div className="alert alert-info" style={{ marginBottom: 18 }}>
        All API credentials are stored encrypted on the backend server only. No keys, tokens, or passwords are stored in the frontend or browser at any time. Each source is independently configurable.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {SOURCES.map((s, i) => (
          <div key={i} className="card">
            <div className="card-body" style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{s.name}</div>
                <div style={{ fontSize: 11, color: '#9A9488', marginBottom: 6 }}>
                  {s.type} ·
                  <a href={s.url} target="_blank" rel="noreferrer" style={{ color: '#A88C38', marginLeft: 4 }}>{s.url}</a>
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                  {s.fields.map(f => <span key={f} style={{ background: '#F4F0E8', border: '1px solid #DDD8CC', borderRadius: 3, padding: '1px 6px', fontSize: 10 }}>{f}</span>)}
                </div>
                <div style={{ fontSize: 11, color: '#9A9488', fontStyle: 'italic' }}>{s.note}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
                <span className={`badge badge-${s.status === 'live-link' ? 'green' : s.status === 'auth-required' ? 'blue' : 'gold'}`}>
                  {s.status === 'pending' ? 'Pending Integration' : s.status === 'live-link' ? 'Live Link' : 'Auth Required'}
                </span>
                <button className="btn btn-outline btn-sm">⚙ Configure</button>
                <button className="btn btn-outline btn-sm">↻ Test</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

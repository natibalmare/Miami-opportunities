import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const PINS = [
  { top: '35%', left: '42%', score: 86, addr: '332 NW 35th St', color: '#B84040' },
  { top: '50%', left: '57%', score: 78, addr: '1425 NE 83rd St', color: '#A88C38' },
  { top: '28%', left: '63%', score: 71, addr: '415 NE 75th St',  color: '#A88C38' },
  { top: '62%', left: '34%', score: 64, addr: '820 NE 96th St',  color: '#8C6010' },
  { top: '44%', left: '26%', score: 38, addr: '2244 Funston St', color: '#9A9488' },
]

const NEIGHBORHOODS = ['Morningside','Belle Meade','El Portal','Miami Shores','Upper East Side','MiMo District','Shorecrest','Bayside','North Miami','North Miami Beach','Hollywood','Dania Beach','Hallandale Beach']
const FILTERS = ['Pre-Foreclosure', 'Tax Delinquent', 'Absentee Owner', 'Possible Vacant', 'Open Permits', 'Code Violations', 'Probate', 'Divorce Indicators', 'No Mortgage / Low Mortgage']

export default function MapView() {
  const [activeNbhs, setActiveNbhs] = useState(['Shorecrest', 'Miami Shores', 'Upper East Side'])
  const [checkedFilters, setCheckedFilters] = useState([])
  const nav = useNavigate()

  const toggle = (n) => setActiveNbhs(p => p.includes(n) ? p.filter(x => x !== n) : [...p, n])
  const toggleF = (f) => setCheckedFilters(p => p.includes(f) ? p.filter(x => x !== f) : [...p, f])

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>Map View</div>
          <div style={{ fontSize: 12, color: '#9A9488', marginTop: 3 }}>Geographic view of leads by opportunity score and category</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: 14 }}>
        {/* FILTERS */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="card">
            <div className="card-header"><div className="t-label">Target Neighborhoods</div></div>
            <div className="card-body" style={{ padding: 12 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                {NEIGHBORHOODS.map(n => (
                  <button key={n} onClick={() => toggle(n)} style={{ border: `1px solid ${activeNbhs.includes(n) ? '#C8A84B' : '#DDD8CC'}`, background: activeNbhs.includes(n) ? '#F2E8CC' : '#F4F0E8', color: activeNbhs.includes(n) ? '#A88C38' : '#6B6456', fontSize: 9.5, padding: '3px 8px', cursor: 'pointer', borderRadius: 3, fontFamily: 'inherit', fontWeight: activeNbhs.includes(n) ? 600 : 400 }}>{n}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="t-label">Opp. Score Min</div></div>
            <div className="card-body">
              <input type="range" min={0} max={100} defaultValue={0} style={{ width: '100%', accentColor: '#C8A84B' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#9A9488', marginTop: 3 }}><span>0</span><span>100</span></div>
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="t-label">Distress Indicators</div></div>
            <div className="card-body">
              {FILTERS.map(f => (
                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 11.5, color: '#2A2A2A', cursor: 'pointer' }}>
                  <input type="checkbox" checked={checkedFilters.includes(f)} onChange={() => toggleF(f)} style={{ accentColor: '#C8A84B' }} />
                  {f}
                </label>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-header"><div className="t-label">Financeability</div></div>
            <div className="card-body">
              {['Likely Financeable', 'Maybe Financeable', 'Renovation Loan', 'Cash Only'].map(f => (
                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '3px 0', fontSize: 11.5, cursor: 'pointer' }}>
                  <input type="checkbox" defaultChecked style={{ accentColor: '#C8A84B' }} />{f}
                </label>
              ))}
            </div>
          </div>

          <button className="btn btn-gold" style={{ justifyContent: 'center' }}>Apply Filters</button>
        </div>

        {/* MAP */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#1C2B3A', borderRadius: 10, height: 380, position: 'relative', overflow: 'hidden' }}>
            {/* Grid */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

            {/* Pins */}
            {PINS.map((p, i) => (
              <div key={i} onClick={() => nav(`/report?q=${encodeURIComponent(p.addr)}`)} style={{ position: 'absolute', top: p.top, left: p.left, cursor: 'pointer', transform: 'translate(-50%, -50%)' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: p.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' }}>
                  {p.score}
                </div>
              </div>
            ))}

            {/* Notice */}
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ color: 'rgba(200,168,75,0.8)', fontSize: 13, fontWeight: 400, letterSpacing: 1, textAlign: 'center' }}>
                Map Integration Pending
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4, fontWeight: 300, letterSpacing: 0 }}>Google Maps or Mapbox API key required · Pins are positional mockups</div>
              </div>
            </div>

            {/* Legend */}
            <div style={{ position: 'absolute', bottom: 12, left: 12, background: 'rgba(10,16,24,0.85)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '8px 12px', display: 'flex', gap: 14 }}>
              {[['76–100', '#B84040', 'High Priority'], ['51–75', '#A88C38', 'Strong Lead'], ['26–50', '#8C6010', 'Possible'], ['0–25', '#9A9488', 'Low']].map(([r, c, l]) => (
                <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{l} ({r})</span>
                </div>
              ))}
            </div>
          </div>

          {/* TABLE */}
          <div className="card">
            <table className="data-table">
              <thead><tr><th>Address</th><th>Neighborhood</th><th>Score</th><th>Tags</th><th>Action</th></tr></thead>
              <tbody>
                {PINS.map((p, i) => (
                  <tr key={i} style={{ cursor: 'pointer' }} onClick={() => nav(`/report?q=${encodeURIComponent(p.addr)}`)}>
                    <td style={{ fontWeight: 500 }}>{p.addr}</td>
                    <td style={{ fontSize: 11, color: '#9A9488' }}>Miami</td>
                    <td style={{ fontWeight: 600, color: p.color }}>{p.score}</td>
                    <td>—</td>
                    <td><button className="btn btn-gold btn-sm" style={{ fontSize: 9 }}>View →</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import AddressSearchInput from '../components/AddressSearchInput'
import InvestmentCalculator from '../components/InvestmentCalculator'
import { api } from '../utils/api'

/* Free for everyone: mortgage payment with this week's rate, plus rental return (cap rate, cash-on-cash, cash flow).
   Pick a property to load comparable sales, or fill in the numbers yourself. */
export default function CalculatorsPage() {
  const [q, setQ] = useState('')
  const [property, setProperty] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [key, setKey] = useState(0)

  const load = async (reportKey, label) => {
    setLoading(true); setError('')
    try {
      const m = String(reportKey).match(/^parcel:(\d+):(.+)$/i)
      const res = await api.search(reportKey, m ? 'address' : 'folio')
      const r = res?.results?.[0]
      if (!r) throw new Error('Property not found')
      setProperty({
        countyNo: r.countyNo || (m ? Number(m[1]) : 23), folio: r.folio || (m ? m[2] : reportKey),
        address: r.address || label, city: r.city, zip: r.zip, beds: r.beds, assessedValue: r.assessedValue,
      })
      setKey(k => k + 1)
    } catch (e) { setError(e.message) } finally { setLoading(false) }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: -0.5 }}>Investment Calculators</div>
      <div style={{ fontSize: 12.5, color: '#7A8584', marginTop: 3, marginBottom: 16 }}>
        Mortgage payment with this week’s average rate, and rental return — cap rate, cash-on-cash and cash flow. Free for everyone.
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-body">
          <div className="form-label">Load a property (optional) — fills comparable sales</div>
          <div style={{ display: 'flex', border: '1.5px solid #0A3D3A', borderRadius: 4 }}>
            <AddressSearchInput
              inputStyle={{ border: 'none', padding: '11px 14px', fontSize: 14, outline: 'none', background: '#FAF8F2', fontFamily: 'inherit' }}
              placeholder="Type an address in Miami-Dade, Broward or Palm Beach…"
              value={q} onChange={setQ}
              onSubmit={() => q.trim() && load(q.trim(), q.trim())}
              onPick={s => { setQ(s.label); load(s.folio, s.label) }}
            />
          </div>
          {loading && <div style={{ fontSize: 12, color: '#7A8584', marginTop: 8 }}>Loading property…</div>}
          {error && <div className="alert alert-warning" style={{ marginTop: 10 }}>{error}</div>}
          {property && (
            <div style={{ fontSize: 13, marginTop: 10 }}>
              <strong>{property.address}</strong>{property.city ? `, ${property.city}` : ''} {property.zip || ''}
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => { setProperty(null); setQ(''); setKey(k => k + 1) }}>Clear</button>
            </div>
          )}
        </div>
      </div>

      <div className="card"><div className="card-body">
        <InvestmentCalculator key={key} property={property} />
      </div></div>
    </div>
  )
}

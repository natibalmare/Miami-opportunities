import { useEffect, useState } from 'react'
import { api } from '../utils/api'

const BASE = import.meta.env.VITE_API_URL || ''

/* Street-level photo of the property (signed-in members) */
export function StreetViewPhoto({ address }) {
  const [src, setSrc] = useState(null)
  const [date, setDate] = useState('')
  useEffect(() => {
    let url = null
    let off = false
    const token = localStorage.getItem('mo_token')
    if (!token || !address) return
    fetch(`${BASE}/api/owner/streetview?address=${encodeURIComponent(address)}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => { if (!r.ok) throw new Error(); setDate(r.headers.get('X-Imagery-Date') || ''); return r.blob() })
      .then(b => { if (!off) { url = URL.createObjectURL(b); setSrc(url) } })
      .catch(() => {})
    return () => { off = true; if (url) URL.revokeObjectURL(url) }
  }, [address])
  if (!src) return null
  return (
    <div style={{ marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: '1px solid #E0DCD0', position: 'relative' }}>
      <img src={src} alt={`Street view of ${address}`} style={{ width: '100%', height: 'auto', display: 'block', maxHeight: 320, objectFit: 'cover' }} />
      <div style={{ position: 'absolute', bottom: 6, right: 8, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, padding: '2px 6px', borderRadius: 3 }}>
        Street View{date && date !== 'ok' ? ` · ${date}` : ''} · may not show current condition
      </div>
    </div>
  )
}

const fmtPhone = (n) => {
  const d = String(n || '').replace(/\D/g, '').slice(-10)
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n
}

/* Owner phone / email lookup for unlocked reports */
export function OwnerContact({ folio, street, city, zip, ownerType }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const run = async () => {
    setBusy(true); setError('')
    try { setData(await api.ownerContact({ folio, street, city, zip })) } catch (e) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header"><div className="t-label">Owner Contact</div></div>
      <div className="card-body">
        {!data && (
          <>
            <div style={{ fontSize: 12.5, color: '#5A6A69', marginBottom: 10, lineHeight: 1.5 }}>
              Find phone numbers and emails linked to the owner of this property.
              {ownerType === 'LLC' && ' For LLC-owned properties, results may show the people connected to the company.'}
            </div>
            {error && <div className="alert alert-warning" style={{ marginBottom: 10 }}>{error}</div>}
            <button className="btn btn-gold btn-sm" disabled={busy} onClick={run}>{busy ? 'Searching…' : 'Find Owner Phone & Email'}</button>
          </>
        )}
        {data && (
          <>
            {data.persons.length === 0 && <div style={{ fontSize: 13, color: '#7A8584' }}>No contact information was found for this owner.</div>}
            {data.persons.map((p, i) => (
              <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid #EEEAE0' : 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{p.name || 'Owner'}{p.deceased && <span style={{ color: '#B84040', fontSize: 11, marginLeft: 8 }}>Possibly deceased</span>}</div>
                {p.phones.map((ph, j) => (
                  <div key={j} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, marginBottom: 4, flexWrap: 'wrap' }}>
                    <a href={`tel:${ph.number}`} style={{ color: '#0A3D3A', fontWeight: 500 }}>{fmtPhone(ph.number)}</a>
                    <span style={{ fontSize: 11, color: '#7A8584' }}>{[ph.type, ph.carrier].filter(Boolean).join(' · ')}</span>
                    {(ph.dnc || ph.tcpa) && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#B84040', border: '1px solid #E8B0B0', borderRadius: 3, padding: '0 5px' }}>{ph.dnc ? 'DO NOT CALL' : 'TCPA RISK'}</span>}
                  </div>
                ))}
                {p.emails.map((e, j) => (
                  <div key={j} style={{ fontSize: 13, marginBottom: 3 }}><a href={`mailto:${e.email}`} style={{ color: '#0A3D3A' }}>{e.email}</a>{e.verified && <span style={{ fontSize: 10.5, color: '#2E7D6B', marginLeft: 6 }}>verified</span>}</div>
                ))}
                {p.litigator && <div style={{ fontSize: 11.5, color: '#B84040', marginTop: 4 }}>Flagged as a frequent TCPA litigant — do not call or text for marketing.</div>}
              </div>
            ))}
            <div style={{ fontSize: 10.5, color: '#9A9488', marginTop: 8, lineHeight: 1.5 }}>
              Checked {new Date(data.checkedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}. Contact data comes from third-party sources and may be outdated.
              Numbers marked Do Not Call are on the National Do Not Call Registry — do not use them for cold calls or texts. You are responsible for complying with the TCPA, Do Not Call rules and Florida’s telemarketing law.
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const KIND_LABEL = { permit: 'Permit', code: 'Code case', code_lien: 'Code lien', building_violation: 'Building violation', recert: 'Recertification' }
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

/* County & city records: summary for everyone signed in, full list when the report is unlocked */
export function CountyRecords({ countyNo, parcelId, compact = false, onUnlock }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let off = false
    setData(null); setError('')
    if (!countyNo || !parcelId || !localStorage.getItem('mo_token')) return
    api.countyRecords(countyNo, parcelId)
      .then(d => { if (!off) setData(d) })
      .catch(e => { if (!off) setError(e.message) })
    return () => { off = true }
  }, [countyNo, parcelId])

  if (error) return compact ? null : <div className="alert alert-warning">{error}</div>
  if (!data) return compact ? null : <div style={{ padding: 20, color: '#9A9488', fontSize: 13 }}>Checking county and city records…</div>
  if (!data.covered) return compact ? null : (
    <div style={{ padding: '20px 0', color: '#7A8584', fontSize: 13, lineHeight: 1.6 }}>
      Permit and code records for this city are not connected yet. They are being added city by city.
    </div>
  )

  const s = data.summary || {}
  const flags = s.financingFlags || []

  const Summary = (
    <div className={`alert ${flags.length ? 'alert-warning' : 'alert-info'}`} style={{ marginBottom: 14 }}>
      <div style={{ width: '100%' }}>
        <strong>{flags.length ? 'County & city records — items to check before an FHA or conventional offer' : 'County & city records — no open cases found'}</strong>
        {flags.length > 0 && <ul style={{ paddingLeft: 18, marginTop: 6, fontSize: 12 }}>{flags.map((f, i) => <li key={i}>{f}</li>)}</ul>}
        <div style={{ fontSize: 11, color: '#7A8584', marginTop: 6 }}>
          {s.totalPermits ? `${s.totalPermits} permit${s.totalPermits > 1 ? 's' : ''} on file · ` : ''}Checked {fmtDate(String(data.checkedAt).slice(0, 10))}
          {data.unavailable?.length ? ` · ${data.unavailable.length} source${data.unavailable.length > 1 ? 's' : ''} did not respond, try again later` : ''}
        </div>
        {data.locked && onUnlock && (flags.length > 0 || s.totalPermits > 0) && (
          <button className="btn btn-gold btn-sm" style={{ marginTop: 10 }} onClick={onUnlock}>See case numbers, dates and lien details →</button>
        )}
      </div>
    </div>
  )
  if (compact) return Summary

  const kinds = [...new Set(data.records.map(r => r.kind))]
  const rows = data.records.filter(r => filter === 'all' || r.kind === filter || (filter === 'code' && r.kind === 'code_lien'))

  return (
    <div>
      {Summary}
      {!data.locked && (
        data.records.length ? (
          <>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {['all', ...kinds.filter(k => k !== 'code_lien')].map(k => (
                <button key={k} className={`btn btn-sm ${filter === k ? 'btn-gold' : 'btn-outline'}`} onClick={() => setFilter(k)}>
                  {k === 'all' ? 'All' : k === 'code' ? 'Code cases & liens' : KIND_LABEL[k] + 's'}
                </button>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead><tr><th>Type</th><th>Number</th><th>Description</th><th>Date</th><th>Status</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{KIND_LABEL[r.kind] || r.kind}{r.unsafe && <div style={{ color: '#B84040', fontSize: 10.5 }}>Unsafe structure</div>}</td>
                      <td style={{ fontSize: 11, color: '#7A8584' }}>{r.caseNum || '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        {[r.type, r.description].filter(Boolean).join(' — ') || '—'}
                        {r.lien && <div style={{ fontSize: 11, color: '#8A6A2E', marginTop: 2 }}>Lien recorded {fmtDate(r.lien.date)}{r.lien.book ? ` · Book ${r.lien.book} Page ${r.lien.page}` : ''}</div>}
                        {r.cost ? <div style={{ fontSize: 11, color: '#7A8584' }}>Est. cost ${Number(r.cost).toLocaleString()}</div> : null}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.opened)}</td>
                      <td><span className={`badge badge-${r.open ? 'red' : 'green'}`}>{r.status || (r.open ? 'Open' : 'Closed')}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : <div style={{ padding: '16px 0', color: '#7A8584', fontSize: 13 }}>No permits, code cases or violations found for this property.</div>
      )}
      <div style={{ fontSize: 10.5, color: '#9A9488', marginTop: 12, lineHeight: 1.5 }}>
        Records published by the county and city. They may lag recent activity and do not replace a municipal lien search or permit search by your title company.
      </div>
    </div>
  )
}

/* Recorded documents (deeds, mortgages, liens, lis pendens, judgments, probate) — Broward for now */
export function OfficialRecords({ countyNo, parcelId, compact = false, onUnlock }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let off = false
    setData(null); setError('')
    if (!countyNo || !parcelId || !localStorage.getItem('mo_token')) return
    api.officialRecords(countyNo, parcelId).then(d => { if (!off) setData(d) }).catch(e => { if (!off) setError(e.message) })
    return () => { off = true }
  }, [countyNo, parcelId])

  if (!data || !data.covered) return (!compact && error) ? <div className="alert alert-warning">{error}</div> : null
  const s = data.summary
  const flags = [
    s.lisPendens && `${s.lisPendens} lis pendens recorded (possible foreclosure or lawsuit)`,
    s.judgments && `${s.judgments} judgment${s.judgments > 1 ? 's' : ''} recorded`,
    s.liens && `${s.liens} lien${s.liens > 1 ? 's' : ''} recorded`,
    s.probate && 'Probate filing recorded',
    s.taxDeeds && 'Tax deed recorded',
  ].filter(Boolean)

  if (compact) {
    if (!s.total) return null
    return (
      <div className={`alert ${flags.length ? 'alert-warning' : 'alert-info'}`} style={{ marginBottom: 14 }}>
        <div style={{ width: '100%' }}>
          <strong>{flags.length ? 'Official records — recent filings to review' : 'Official records'}</strong>
          {flags.length > 0 && <ul style={{ paddingLeft: 18, marginTop: 6, fontSize: 12 }}>{flags.map((f, i) => <li key={i}>{f}</li>)}</ul>}
          <div style={{ fontSize: 11.5, color: '#5A6A69', marginTop: 6 }}>
            {s.total} recorded document{s.total > 1 ? 's' : ''} found{s.mortgages ? ` · ${s.mortgages} mortgage${s.mortgages > 1 ? 's' : ''}${s.openMortgages ? `, ${s.openMortgages} with no release on file` : ''}` : ''}
          </div>
          {data.locked && onUnlock && <button className="btn btn-gold btn-sm" style={{ marginTop: 10 }} onClick={onUnlock}>See every document, party and amount →</button>}
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div className="gold-rule"><div className="gold-rule-line" /><div className="gold-rule-text">Official Records</div><div className="gold-rule-line rev" /></div>
      {flags.length > 0 && <div className="alert alert-warning" style={{ marginBottom: 10 }}><ul style={{ paddingLeft: 18, margin: 0, fontSize: 12 }}>{flags.map((f, i) => <li key={i}>{f}</li>)}</ul></div>}
      {data.documents.length ? (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Recorded</th><th>Document</th><th>From</th><th>To</th><th>Amount</th><th>Instrument</th></tr></thead>
            <tbody>
              {data.documents.map(d => (
                <tr key={d.instrument}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(d.date)}</td>
                  <td style={{ fontWeight: 600 }}>
                    {d.typeLabel}
                    {d.type === 'M' && <div style={{ fontSize: 10.5, fontWeight: 400, color: d.releasedBy.length ? '#2E7D6B' : '#8A6A2E' }}>{d.releasedBy.length ? `Released ${fmtDate(d.releasedBy[0].date)}` : 'No release on file'}</div>}
                    {d.caseNumber && <div style={{ fontSize: 10.5, fontWeight: 400, color: '#7A8584' }}>Case {d.caseNumber}</div>}
                    {d.matchedBy === 'owner name' && <div style={{ fontSize: 10.5, fontWeight: 400, color: '#B84040' }}>Matched by owner name — confirm it is the same person</div>}
                  </td>
                  <td style={{ fontSize: 11.5 }}>{d.from || '—'}</td>
                  <td style={{ fontSize: 11.5 }}>{d.to || '—'}</td>
                  <td>{d.amount ? '$' + d.amount.toLocaleString() : '—'}</td>
                  <td style={{ fontSize: 11, color: '#7A8584' }}>{d.instrument}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <div style={{ fontSize: 13, color: '#7A8584' }}>No recorded documents found for this parcel in the loaded period.</div>}
      <div style={{ fontSize: 10.5, color: '#9A9488', marginTop: 8, lineHeight: 1.5 }}>
        From the Broward County Clerk’s public index (2024 to today). Amounts are as recorded. "No release on file" does not prove a loan is unpaid — confirm payoff with a title company before any offer.
      </div>
    </div>
  )
}
